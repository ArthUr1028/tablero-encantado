// 2.309 · La Senda del Caballero de principio a fin: los 4 niveles en orden con la regla real (sin atajos), la transición con niebla y claudIA, el fallo y el inglés.
// Uso: node tests/senda_completa.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" }); await page.waitForTimeout(1000);
  await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } localStorage.removeItem("tablero.knBest");
    document.getElementById("kn-open").click(); document.querySelector('.kn-card[data-reto="kessel"]').click(); });
  await page.waitForTimeout(1200);
  const S = () => page.evaluate(() => { const s = window.__knInfo().s; return { nivel: s.nivel, g: s.guardias.length, am: Object.keys(s.amiga).length, def: !!s.def, ro: s.roca.filter(Boolean).length - Object.keys(s.amiga).length, par: s.par, fin: s.fin, ruta: s.ruta }; });
  let lento = true;
  const jugar = async ruta => { for (let i = 1; i < ruta.length; i++) { await page.evaluate(q => document.querySelector('#kn-board .kn-sq[data-i="' + q + '"]').click(), ruta[i]); if (lento) await page.waitForTimeout(450); } };
  const nueva = async () => { await page.waitForFunction(() => { const s = window.__knInfo().s; return !s.fin && s.path.length === 1 && !s.espera; }, null, { timeout: 25000 }); };

  // ----- vuelta completa en tiempo real: la primera subida de nivel con su niebla
  let s = await S();
  ok(s.nivel === 1 && s.g === 0 && !s.def && s.ro === 2, "empieza en el nivel 1: sin guardias, sin presa armada y con 2 ruinas (" + JSON.stringify({ n: s.nivel, g: s.g, ro: s.ro }) + ")");
  await jugar(s.ruta); await nueva();
  s = await S(); ok(s.nivel === 1, "una travesía ganada no basta para subir: sigue el nivel 1");
  await jugar(s.ruta);
  await page.waitForSelector(".kn-mist", { timeout: 20000 }); await page.waitForTimeout(900);
  const m = await page.evaluate(() => ({ tt: document.querySelector(".kn-mist .tt").textContent, toast: (document.getElementById("global-toast") || {}).textContent || "", runas: document.querySelectorAll(".kn-mist .rn path").length }));
  ok(/Nivel 2/i.test(m.tt) && /Los Centinelas/.test(m.tt) && m.runas > 10, "la niebla anuncia «Nivel 2 · Los Centinelas» con su círculo de runas (" + m.tt + ")");
  ok(/centinelas callan/.test(m.toast), "claudIA habla al subir: «" + m.toast.trim() + "»");
  const bloq = await page.evaluate(() => { const s = window.__knInfo().s; const j = [...document.querySelectorAll("#kn-board .kn-sq")].find(e => e.classList.contains("cur")); return { esp: s.espera, g: s.guardias.length, path: s.path.length }; });
  ok(bloq.esp && bloq.path === 1, "mientras dura la niebla no se puede jugar");
  await page.waitForTimeout(3800);
  const fin = await page.evaluate(() => ({ mist: !!document.querySelector(".kn-mist"), esp: window.__knInfo().s.espera }));
  ok(!fin.mist && !fin.esp, "la niebla se disipa y el tablero queda libre");
  await page.screenshot({ path: "/tmp/senda_nivel2.png" });

  // ----- el resto en modo rápido: niveles 2, 3 y 4 con las reglas reales
  await page.evaluate(() => { window.__knRapido = true; }); lento = false;
  const vistos = [];
  for (let n = 0; n < 8; n++) { s = await S(); vistos.push([s.nivel, s.g, s.def ? 1 : 0, s.am].join("/")); await jugar(s.ruta); await page.waitForTimeout(80); }
  console.log("   niveles vistos (nivel/guardias/presa/amigas): " + vistos.join("  "));
  const nv = vistos.map(v => +v.split("/")[0]);
  ok(nv.slice(0, 2).every(x => x === 2) && nv.slice(2, 4).every(x => x === 3) && nv.slice(4, 6).every(x => x === 4) && nv[6] === 4, "cada nivel pide 2 travesías y el 4 se repite (" + nv.join(",") + ")");
  const v = vistos.map(x => x.split("/").map(Number));
  ok(v.slice(0, 2).every(a => a[1] === 2 && !a[2]) && v.slice(2, 4).every(a => a[1] === 2 && a[2]) && v.slice(4).every(a => a[1] === 3 && a[2]), "nivel 2: 2 guardias; nivel 3: presa armada; nivel 4: 3 guardias y presa armada");

  // ----- fallar: un rodeo pierde la racha y vuelve al nivel 1
  s = await S(); const info = await page.evaluate(() => { const s = window.__knInfo().s; const K = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]; const a = s.a, x = a % 8, y = (a / 8) | 0, o = [];
    for (const [dx, dy] of K) { const p = x + dx, q = y + dy; if (p >= 0 && p < 8 && q >= 0 && q < 8) o.push(q * 8 + p); } return { a, ve: o, roca: s.roca, b: s.b }; });
  await page.evaluate(() => { document.getElementById("kn-reset").click(); });
  const f0 = await S();
  const rodeo = await page.evaluate(() => { const s = window.__knInfo().s; const K = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]; const x = s.a % 8, y = (s.a / 8) | 0; const ve = [];
    for (const [dx, dy] of K) { const p = x + dx, q = y + dy; if (p >= 0 && p < 8 && q >= 0 && q < 8 && !s.roca[q * 8 + p] && q * 8 + p !== s.b) ve.push(q * 8 + p); } return ve[0]; });
  await page.evaluate(r => { const c = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]').click(); const s = window.__knInfo().s; c(r); c(s.a); for (let i = 1; i < s.ruta.length; i++) c(s.ruta[i]); }, rodeo);
  const fl = await page.evaluate(() => ({ fin: window.__knInfo().s.fin, msg: document.getElementById("kn-msg").textContent, cls: document.getElementById("kn-board").className }));
  ok(fl.fin && /mínimo era/.test(fl.msg) && /fallo/.test(fl.cls), "un rodeo termina la travesía con el efecto de piedra (" + fl.msg.slice(0, 60) + ")");
  await page.evaluate(() => { document.getElementById("kn-reset").click(); });
  s = await S(); ok(s.nivel === 1, "tras fallar se vuelve al nivel 1");

  // ----- inglés
  const en = await page.evaluate(() => { setLang("en"); const L = ["El Sendero", "Los Centinelas", "La Presa Armada", "El Último Umbral", "Nivel 2. Los centinelas callan hasta que pisas su terreno. +1 ayuda.", "Nivel 3. También ella defiende. Rodéala, no la apresures. +1 ayuda.",
    "Nivel 4. Aquí se decide. Piensa antes de saltar. +1 ayuda.", "Pisaste terreno vigilado. Estudia la ruta y regresa.", "Se podía en 5 saltos. Estudia la ruta: ahí está la lección.", "Nivel 2. Cruza las ruinas. Cada salto cuenta. +1 ayuda."];
    return L.filter(x => !/[a-z]/.test(window.tx(x).replace(/\b(Level|The|Path|Sentinels|Armed|Prey|Last|Threshold)\b/g, "")) ? false : window.tx(x) === x || /[áéíóúñ¿¡]/.test(window.tx(x))).map(x => x + " → " + window.tx(x)); });
  ok(!en.length, "todas las frases de claudIA y los nombres de nivel están en inglés" + (en.length ? ": " + en.join(" | ") : ""));
  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
