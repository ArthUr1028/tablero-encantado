// Reto de coordenadas (2.169): abre, juega, acelera, gira, coordenadas en los bordes, piezas, frases sin voz, pierde con 3 fallos, guarda el récord, se traduce y cabe en el móvil. node tests/coordenadas.smoke.js
// Uso: node tests/coordenadas.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});
let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function nueva(browser, url, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(900);
  await page.keyboard.press("Escape");   // la portada espera un Escape o un toque; así la dejamos como la deja una persona
  await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } });
  await page.waitForTimeout(300);
  return { page, errores, ctx };
}
const info = page => page.evaluate(() => window.__cdInfo());
const objetivo = page => page.evaluate(() => document.getElementById("cd-target").textContent.trim());
async function esperaTurno(page, scoreAntes, vidasAntes) {   // hasta que haya casilla nueva y el turno esté libre
  for (let i = 0; i < 60; i++) {
    const s = await info(page);
    if (s && !s.locked && (s.score !== scoreAntes || s.lives !== vidasAntes || scoreAntes === -1)) { const t = await objetivo(page); if (/^[a-h][1-8]$/.test(t)) return s; }
    await sleep(100);
  }
  return null;
}
const tocar = (page, nombre) => page.evaluate(n => { document.querySelector('#cd-grid .cd-sq[aria-label="' + n + '"]').click(); }, nombre);
const primera = page => page.evaluate(() => document.querySelector("#cd-grid .cd-sq").getAttribute("aria-label"));

(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const { page, errores } = await nueva(browser, url);

  // 1 · abrir
  await page.evaluate(() => document.getElementById("cd-open").click()); await page.waitForTimeout(700);
  const abre = await page.evaluate(() => ({ vis: !document.getElementById("cd-ov").hidden && document.getElementById("cd-ov").classList.contains("show"), n: document.querySelectorAll("#cd-grid .cd-sq").length, lab: getComputedStyle(document.getElementById("cd-ranks")).display, files: getComputedStyle(document.getElementById("cd-files")).display, voz: !!document.getElementById("cd-voice") || !!window.speechSynthesis && /speechSynthesis/.test(document.documentElement.innerHTML.split("cd-ov")[0].slice(-0)), frases: window.__cdFrases.length, lc: document.querySelectorAll("#cd-grid .cd-lab").length }));
  ok(abre.vis && abre.n === 64, "el reto se abre con una cuadrícula de 64 casillas");
  ok(abre.lab === "none" && abre.files === "none" && abre.lc === 0, "sin ayuda, no hay coordenadas ni nombres en las casillas");
  ok(!(await page.evaluate(() => !!document.getElementById("cd-voice"))) && abre.frases >= 25, "ya no hay voz y claudIA tiene sus frases (" + abre.frases + ")");

  await page.evaluate(() => { window.__cdTest.premios(false); window.__cdTest.apuestas(false); });   // las pruebas 3 a 9 miden el juego base; los corazones nuevos se prueban en la 11
  // 2 · el atajo F del tablero no actúa con el reto abierto, y la jugada principal no se toca
  const f0 = await page.evaluate(() => flipped); await page.keyboard.press("f"); await page.waitForTimeout(100);
  ok((await page.evaluate(() => flipped)) === f0, "la tecla F no voltea el tablero de la partida mientras el reto está abierto");

  // 3 · jugar: aciertos, aceleración y giro
  await page.evaluate(() => document.getElementById("cd-start").click());
  let s = await esperaTurno(page, -1, 3);
  ok(s && /^[a-h][1-8]$/.test(await objetivo(page)), "claudIA nombra una casilla válida");
  const bg = await page.evaluate(() => { const b = document.getElementById("cd-big"), g = document.getElementById("cd-grid").getBoundingClientRect(), r = b.getBoundingClientRect(); return { t: b.textContent, o: parseFloat(b.style.opacity), cx: Math.abs(r.x + r.width / 2 - (g.x + g.width / 2)), cy: Math.abs(r.y + r.height / 2 - (g.y + g.height / 2)), ancho: r.width / g.width, pe: getComputedStyle(b).pointerEvents }; });
  ok(bg.t === (await objetivo(page)) && bg.o > .3 && bg.cx < 2 && bg.cy < 2 && bg.ancho > .3 && bg.pe === "none", "la casilla pedida aparece grande, centrada y traslúcida sobre el tablero (opacidad " + bg.o.toFixed(2) + ", ancho " + bg.ancho.toFixed(2) + ")");
  await page.waitForTimeout(2200);
  const oa = await page.evaluate(() => parseFloat(document.getElementById("cd-big").style.opacity));
  ok(oa < bg.o - .15, "la coordenada se desvanece con el tiempo (" + bg.o.toFixed(2) + " → " + oa.toFixed(2) + ")");
  ok(s && s.dur === 5000, "el primer turno dura 5 s (" + (s && s.dur) + ")");
  const ori0 = await primera(page); let giros = 0, ultimo = ori0;
  for (let i = 1; i <= 9; i++) {
    const t = await objetivo(page); const antes = (await info(page)).score;
    await tocar(page, t);
    s = await esperaTurno(page, antes, 3);
    if (!s) { ok(false, "el turno " + i + " no avanzó"); break; }
    const o = await primera(page); if (o !== ultimo) { giros++; ultimo = o; }
  }
  ok(s && s.score === 9 && s.lives === 3, "nueve aciertos seguidos suman 9 sin perder fallos (" + (s && s.score) + ")");
  ok(s && s.dur === 4100, "el tiempo baja 100 ms por acierto: 5000 → 4100 (" + (s && s.dur) + ")");
  ok(giros >= 1, "el tablero giró al menos una vez en 9 aciertos (giros: " + giros + ")");
  const pz = await page.evaluate(() => ({ n: document.querySelectorAll("#cd-grid .piece").length, reyes: [...document.querySelectorAll("#cd-grid .piece")].filter(e => e.querySelector("use") && /king/.test(e.querySelector("use").getAttribute("href"))).length, pe: getComputedStyle(document.querySelector("#cd-grid .piece")).pointerEvents, giro: document.getElementById("cd-grid").classList.contains("cd-spin"), taunt: document.getElementById("cd-taunt").textContent.trim() }));
  ok(pz.n === s.piezas && pz.n >= 8 && pz.n <= 32 && pz.reyes === 2, "hay una posición real de ajedrez: " + pz.n + " piezas y dos reyes");
  const cen = await page.evaluate(() => { const b = document.querySelector("#cd-grid .cd-sq .piece").parentElement.getBoundingClientRect(), pc = document.querySelector("#cd-grid .piece svg").getBoundingClientRect(); const g = document.getElementById("cd-grid").getBoundingClientRect(); return { dx: Math.abs((b.x + b.width / 2) - (pc.x + pc.width / 2)), dy: Math.abs((b.y + b.height / 2) - (pc.y + pc.height / 2)), r: pc.width / b.width, g: Math.round(g.width) }; });
  ok(cen.dx < 1.5 && cen.dy < 1.5 && cen.r > .8, "las piezas están centradas y llenan la casilla (desvío " + cen.dx.toFixed(1) + "," + cen.dy.toFixed(1) + "; tamaño " + cen.r.toFixed(2) + ")");
  ok(cen.g >= 450, "en escritorio el tablero es grande (" + cen.g + " px)");
  ok(pz.pe === "none" && !pz.giro, "las piezas no estorban al toque y el tablero queda derecho tras girar");
  ok(pz.taunt.length > 5, "claudIA habla con frases: «" + pz.taunt + "»");
  const real = await page.evaluate(() => { const b = [...document.querySelectorAll("#cd-grid .cd-sq")].find(x => x.querySelector(".piece")); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === b; });
  ok(real, "el toque sobre una casilla con pieza lo recibe la casilla, no la pieza");
  const giro = await page.evaluate(() => { const c = document.querySelector("#cd-grid .cd-sq"); return c.getAttribute("aria-label"); });
  ok(["a8", "h1"].includes(giro), "las dos orientaciones son las esperadas (arriba-izquierda: " + giro + ")");

  // 4 · tres fallos: fin y récord
  for (let k = 0; k < 3; k++) {
    const t = await objetivo(page); const vidas = (await info(page)).lives;
    const mala = await page.evaluate(t => { const b = [...document.querySelectorAll("#cd-grid .cd-sq")].find(x => x.getAttribute("aria-label") !== t); b.click(); return b.getAttribute("aria-label"); }, t);
    if (k < 2) { s = await esperaTurno(page, 9, vidas); ok(s && s.lives === vidas - 1, "un fallo cuesta una vida (tocó " + mala + ", era " + t + ")"); }
  }
  await page.waitForTimeout(1500);
  const fin = await page.evaluate(() => ({ msg: document.getElementById("cd-msg").textContent, start: !document.getElementById("cd-start").hidden, txt: document.getElementById("cd-start").textContent, best: localStorage.getItem("tablero.coordsBest2"), bestEl: document.getElementById("cd-best").textContent }));
  ok(/Fin del reto/.test(fin.msg) && /récord/i.test(fin.msg) && fin.start && fin.txt === "Jugar otra vez", "con 3 fallos termina, felicita el récord y ofrece jugar otra vez");
  ok(fin.best === "9" && fin.bestEl === "9", "el récord (9) se guarda en el dispositivo");

  // 5 · agotar el tiempo cuenta como fallo
  await page.evaluate(() => document.getElementById("cd-start").click());
  s = await esperaTurno(page, -1, 3);
  await page.waitForTimeout(5400);
  s = await info(page);
  ok(s && s.lives === 2, "dejar pasar los 5 s cuesta una vida (" + (s && s.lives) + ")");
  const era = await page.evaluate(() => document.getElementById("cd-msg").textContent);
  ok(/Se acabó el tiempo/.test(era) && /Era [a-h][1-8]/.test(era), "al fallar por tiempo se dice cuál era la casilla");

  // 6 · inglés
  await page.evaluate(() => setLang("en")); await page.waitForTimeout(400);
  const en = await page.evaluate(() => ({ h: [...document.querySelectorAll(".cd-hud small")].map(x => x.textContent), t: document.getElementById("cd-title").textContent, msg: document.getElementById("cd-msg").textContent, say: document.querySelector(".cd-says > span:last-child").textContent, help: document.querySelector("#cd-help").parentElement.textContent.trim().slice(0, 9) }));
  ok(en.h.join() === "Hits,Misses,Record" && en.t === "The Sixty-Four" && en.say === "says:" && en.help === "With help", "los rótulos del reto están en inglés (" + en.h.join() + ")");
  ok(/It was [a-h][1-8]/.test(en.msg), "el mensaje de fallo también (" + en.msg.trim() + ")");
  ok(await page.evaluate(() => window.__cdFrases.every(f => tx(f) !== f)), "todas las frases de claudIA tienen traducción al inglés");
  await page.evaluate(() => setLang("es"));

  // 7 · Escape cierra
  await page.keyboard.press("Escape"); await page.waitForTimeout(900);
  ok(await page.evaluate(() => document.getElementById("cd-ov").hidden), "Escape cierra el reto");

  // 8 · ayuda: muestra los nombres y no guarda récord
  await page.evaluate(() => document.getElementById("cd-open").click()); await page.waitForTimeout(600);
  await page.evaluate(() => { document.getElementById("cd-help").checked = true; document.getElementById("cd-help").dispatchEvent(new Event("change")); });
  const lab = await page.evaluate(() => ({ r: getComputedStyle(document.getElementById("cd-ranks")).display, f: getComputedStyle(document.getElementById("cd-files")).display, rt: [...document.querySelectorAll("#cd-ranks span")].map(x => x.textContent).join(""), ft: [...document.querySelectorAll("#cd-files span")].map(x => x.textContent).join(""), lc: document.querySelectorAll("#cd-grid .cd-lab").length }));
  ok(lab.r === "grid" && lab.f === "grid" && lab.lc === 0, "con ayuda se ven las coordenadas en los bordes, no dentro de las casillas");
  ok((lab.rt === "87654321" && lab.ft === "abcdefgh") || (lab.rt === "12345678" && lab.ft === "hgfedcba"), "los bordes siguen la orientación del tablero (" + lab.rt + " / " + lab.ft + ")");
  await page.evaluate(() => document.getElementById("cd-start").click());
  s = await esperaTurno(page, -1, 3);
  for (let i = 0; i < 12; i++) { const t = await objetivo(page); const antes = (await info(page)).score; await tocar(page, t); s = await esperaTurno(page, antes, 3); }
  ok(s && s.score === 12, "con ayuda también se juega (12 aciertos)");
  for (let k = 0; k < 3; k++) { const t = await objetivo(page); const v = (await info(page)).lives; await page.evaluate(t => { [...document.querySelectorAll("#cd-grid .cd-sq")].find(x => x.getAttribute("aria-label") !== t).click(); }, t); if (k < 2) await esperaTurno(page, 12, v); }
  await page.waitForTimeout(1500);
  const ay = await page.evaluate(() => ({ msg: document.getElementById("cd-msg").textContent, best: localStorage.getItem("tablero.coordsBest2") }));
  ok(/no cuenta para el récord/.test(ay.msg) && ay.best === "9", "con ayuda no se supera ni se guarda el récord (sigue en " + ay.best + ")");
  await page.keyboard.press("Escape");
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));

  // 8b · escritorio ancho: tablero grande con el marcador al costado, y pieza en el título del panel
  const w = await nueva(browser, url, { viewport: { width: 1440, height: 900 } });
  ok(await w.page.evaluate(() => !!document.querySelector("#panel-coords > h2 .panel-ico")), "el panel del reto lleva una pieza al azar en el título, como los demás");
  await w.page.evaluate(() => document.getElementById("cd-open").click()); await w.page.waitForTimeout(700);
  const gr = await w.page.evaluate(() => { const g = document.getElementById("cd-grid").getBoundingClientRect(), h = document.querySelector(".cd-hud").getBoundingClientRect(), b = document.querySelector(".cd-box").getBoundingClientRect(); return { w: Math.round(g.width), h: Math.round(g.height), lado: h.x > g.right, cabe: b.top >= 0 && b.bottom <= innerHeight && b.right <= innerWidth }; });
  ok(gr.w >= 700 && gr.w === gr.h && gr.lado && gr.cabe, "en 1440×900 el tablero mide " + gr.w + " px, con el marcador a su derecha y todo a la vista");
  await w.page.close();

  // 9 · móvil táctil
  const m = await nueva(browser, url, { viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  await m.page.evaluate(() => document.getElementById("cd-open").click()); await m.page.waitForTimeout(700);
  const med = await m.page.evaluate(() => { const g = document.getElementById("cd-grid").getBoundingClientRect(), b = document.querySelector(".cd-box").getBoundingClientRect(); return { w: Math.round(g.width), h: Math.round(g.height), bw: Math.round(b.width), ov: document.documentElement.scrollWidth <= innerWidth + 1, sq: Math.round(g.width / 8) }; });
  ok(med.w === med.h && med.w <= 390 - 20 && med.w >= 290 && med.ov, "en un móvil de 390 px la cuadrícula es cuadrada y cabe (" + JSON.stringify(med) + ")");
  await m.page.evaluate(() => document.getElementById("cd-start").click());
  const sm = await esperaTurno(m.page, -1, 3);
  const t = await objetivo(m.page);
  const caja = await m.page.evaluate(n => { const r = document.querySelector('#cd-grid .cd-sq[aria-label="' + n + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t);
  await m.page.touchscreen.tap(caja.x, caja.y); await m.page.waitForTimeout(400);
  ok(sm && (await info(m.page)).score === 1, "un toque con el dedo en la casilla correcta cuenta como acierto");
  ok(m.errores.length === 0, "sin errores de JavaScript en el móvil" + (m.errores.length ? ": " + m.errores[0] : ""));
  // 10 · niveles (2.179): cuatro orientaciones, preguntas de color y de nombre, subida de nivel y giros coherentes
  const nv = await nueva(browser, url), P = nv.page;
  await P.evaluate(() => document.getElementById("cd-open").click()); await P.waitForTimeout(600);
  await P.evaluate(() => window.__cdTest.apuestas(false));
  let okOr = true; const detOr = [];
  for (const [r, tl, bl] of [[0, "a8", "a1"], [1, "a1", "h1"], [2, "h1", "h8"], [3, "h8", "a8"]]) {
    const o = await P.evaluate(r => { window.__cdTest.rot(r); const c = [...document.querySelectorAll("#cd-grid .cd-sq")], lab = c.map(x => x.getAttribute("aria-label")); return { tl: lab[0], bl: lab[56], uniq: new Set(lab).size, a1: c.find(x => x.getAttribute("aria-label") === "a1").classList.contains("drk") }; }, r);
    if (!(o.tl === tl && o.bl === bl && o.uniq === 64 && o.a1)) { okOr = false; detOr.push(r + ":" + JSON.stringify(o)); }
  }
  ok(okOr, "las cuatro orientaciones colocan las 64 casillas (arriba-izquierda a8 / a1 / h1 / h8) y a1 siempre es oscura " + detOr.join(" "));
  await P.evaluate(() => { const h = document.getElementById("cd-help"); h.checked = true; h.dispatchEvent(new Event("change")); });
  const rotulos = r => P.evaluate(r => { window.__cdTest.rot(r); return [...document.querySelectorAll("#cd-ranks span")].map(x => x.textContent).join("") + "/" + [...document.querySelectorAll("#cd-files span")].map(x => x.textContent).join(""); }, r);
  const r1 = await rotulos(1), r3 = await rotulos(3);
  ok(r1 === "abcdefgh/12345678" && r3 === "hgfedcba/87654321", "con ayuda, a un cuarto de vuelta los bordes cambian de eje: letras al costado, números abajo (" + r1 + " · " + r3 + ")");
  await P.evaluate(() => { const h = document.getElementById("cd-help"); h.checked = false; h.dispatchEvent(new Event("change")); window.__cdTest.rot(0); window.__cdTest.kind("color"); document.getElementById("cd-start").click(); });
  const espera = async kind => { for (let i = 0; i < 80; i++) { const x = await info(P); if (x && !x.locked && x.kind === kind) return x; await sleep(100); } return null; };
  let q = await espera("color");
  const col = await P.evaluate(() => ({ t: document.getElementById("cd-target").textContent.trim(), veil: document.getElementById("cd-board").classList.contains("cd-veil"), ops: [...document.querySelectorAll("#cd-ans .cd-opt")].map(x => x.dataset.v).join(), vis: !document.getElementById("cd-ans").hidden, msg: document.getElementById("cd-msg").textContent.trim() }));
  await P.waitForTimeout(400);
  const op = await P.evaluate(() => parseFloat(getComputedStyle(document.getElementById("cd-grid")).opacity));
  ok(q && col.vis && col.veil && col.ops === "l,d" && /Clara u oscura/.test(col.msg) && /^[a-h][1-8]$/.test(col.t) && op < .3, "pregunta de color: casilla pedida, dos botones y el tablero apagado (opacidad " + op.toFixed(2) + ", " + col.t + ")");
  const clara = t => (("abcdefgh".indexOf(t[0])) + (+t[1] - 1)) % 2 !== 0;
  const pulsa = (v) => P.evaluate(v => document.querySelector('#cd-ans .cd-opt[data-v="' + v + '"]').click(), v);
  await pulsa(clara(col.t) ? "d" : "l");           // a propósito, la contraria
  await P.waitForTimeout(150);
  const mal = await P.evaluate(() => ({ good: !!document.querySelector("#cd-ans .cd-opt.good"), msg: document.getElementById("cd-msg").textContent.trim(), veil: document.getElementById("cd-board").classList.contains("cd-veil") }));
  ok((await info(P)).lives === 2 && mal.good && !mal.veil && /La casilla [a-h][1-8] es (clara|oscura)\./.test(mal.msg), "un error de color cuesta una vida, marca el botón bueno y enciende el tablero («" + mal.msg + "»)");
  q = await espera("color");
  const c2 = await objetivo(P);
  await P.evaluate(() => window.__cdTest.kind("nombre"));
  await pulsa(clara(c2) ? "l" : "d");
  await P.waitForTimeout(300);
  ok((await info(P)).score === 1, "acertar el color suma un acierto");
  q = await espera("nombre");
  const nm = await P.evaluate(() => { const a = document.querySelector("#cd-grid .cd-sq.ask"); return { cel: a && a.getAttribute("aria-label"), ops: [...document.querySelectorAll("#cd-ans .cd-opt")].map(x => x.dataset.v), t: document.getElementById("cd-target").textContent.trim(), veil: document.getElementById("cd-board").classList.contains("cd-veil"), msg: document.getElementById("cd-msg").textContent.trim() }; });
  ok(q && nm.cel && nm.ops.length === 4 && new Set(nm.ops).size === 4 && nm.ops.includes(nm.cel) && nm.t === "?" && !nm.veil && /marcada/.test(nm.msg), "pregunta de nombre: casilla marcada, cuatro opciones distintas y la buena entre ellas (" + nm.cel + " entre " + nm.ops.join(",") + ")");
  await P.evaluate(() => window.__cdTest.kind("toca"));
  await pulsa(nm.cel);
  await P.waitForTimeout(300);
  ok((await info(P)).score === 2, "acertar el nombre suma un acierto");
  // subir hasta el nivel Caballero (15 aciertos) solo con preguntas de tocar
  let lv = null, avisoNivel = "", sc = null;
  for (let i = 0; i < 13; i++) {
    sc = await esperaTurno(P, -1, 2); if (!sc) break;
    const t = await objetivo(P), antes = (await info(P)).score;
    await tocar(P, t);
    if (antes === 14) { await P.waitForTimeout(400); avisoNivel = await P.evaluate(() => document.getElementById("cd-msg").textContent.trim()); }
    for (let k = 0; k < 80; k++) { const y = await info(P); if (y && y.score > antes) break; await sleep(50); }
  }
  lv = await info(P);
  ok(lv && lv.score === 15 && lv.lvl === 1 && /Nivel nuevo/.test(avisoNivel) && /Caballero/.test(avisoNivel), "con 15 aciertos se sube al nivel Caballero y se avisa («" + avisoNivel + "»)");
  // 12 aciertos más: los giros (de media vuelta o de un cuarto) dejan siempre la cuadrícula acorde a su orientación
  let coherente = true, vistas = new Set(), det = "";
  for (let i = 0; i < 12; i++) {
    sc = await esperaTurno(P, -1, 2); if (!sc) { coherente = false; det = "sin turno"; break; }
    const esperado = ["a8", "a1", "h1", "h8"][sc.rot], real = await primera(P); vistas.add(sc.rot);
    if (esperado !== real) { coherente = false; det += sc.rot + ":" + real + " "; }
    const t = await objetivo(P), antes = sc.score; await tocar(P, t);
    for (let k = 0; k < 80; k++) { const y = await info(P); if (y && y.score > antes) break; await sleep(50); }
  }
  ok(coherente, "tras cada giro la cuadrícula coincide con su orientación (orientaciones vistas: " + [...vistas].join(",") + ") " + det);
  const fin2 = await info(P) || { lvl: -1, score: -1 };
  ok(fin2.score >= 27 && fin2.lvl === 2, "con 25 aciertos se llega al nivel Maestro (aciertos " + fin2.score + ", nivel " + fin2.lvl + ")");
  ok(nv.errores.length === 0, "sin errores de JavaScript en los niveles" + (nv.errores.length ? ": " + nv.errores[0] : ""));

  // 11 · corazones (2.180): la Llama, el premio por giro y las tres apuestas de claudIA
  const q2 = await nueva(browser, url), Q = q2.page;
  await Q.evaluate(() => document.getElementById("cd-open").click()); await Q.waitForTimeout(600);
  const datos = await Q.evaluate(() => { setLang("en"); const D = window.__cdTest.datos; const r = { m1: D.m1.length, m2: D.m2.length, ap: D.ap.length, trad: D.ap.every(x => tx(x.l) !== x.l), unic: new Set(D.ap.map(x => x.f)).size === D.ap.length, sol: D.m1.concat(D.m2).every(x => x.s.length >= 1 && x.s.length <= 2), nombres: D.ap.every(x => tx(x.n) !== x.n || ["Najdorf","Caro-Kann","Nimzo-Larsen","Bird","McConnell","Petrov","Pirc","Alekhine","Grünfeld","Benoni","Trompowsky"].includes(x.n)) }; setLang("es"); return r; });
  ok(datos.m1 >= 40 && datos.m2 >= 8 && datos.ap === 31 && datos.trad && datos.unic && datos.sol && datos.nombres, "datos de las apuestas: " + datos.m1 + " mates en 1, " + datos.m2 + " en 2, " + datos.ap + " aperturas y defensas únicas, con la línea traducida");
  await Q.evaluate(() => { window.__cdTest.apuestas(false); document.getElementById("cd-start").click(); });
  let z = await esperaTurno(Q, -1, 3);
  for (let i = 0; i < 4; i++) { const t = await objetivo(Q), antes = (await info(Q)).score; await tocar(Q, t); for (let k = 0; k < 60; k++) { const y = await info(Q); if (y && y.score > antes) break; await sleep(50); } if (i < 3) z = await esperaTurno(Q, antes, 3); }
  await Q.waitForTimeout(200);
  const llama = await info(Q), msgL = await Q.evaluate(() => document.getElementById("cd-msg").textContent);
  ok(llama.lives === 4 && llama.llama === 0 && /Llama/.test(msgL), "cuatro aciertos rápidos llenan la Llama y dan un corazón (corazones " + llama.lives + ", llama " + llama.llama + ")");
  z = await esperaTurno(Q, -1, 4);
  let t5 = await objetivo(Q), a5 = (await info(Q)).score; await tocar(Q, t5); for (let k = 0; k < 60; k++) { const y = await info(Q); if (y && y.score > a5) break; await sleep(50); }
  ok((await info(Q)).llama === 25, "un acierto rápido sube la Llama un cuarto");
  z = await esperaTurno(Q, -1, 4); await Q.waitForTimeout(2200);
  t5 = await objetivo(Q); a5 = (await info(Q)).score; await tocar(Q, t5); for (let k = 0; k < 60; k++) { const y = await info(Q); if (y && y.score > a5) break; await sleep(50); }
  ok((await info(Q)).llama === 5, "dudar (más de 2 s) enfría la Llama (25 → " + (await info(Q)).llama + ")");
  // premio por superar un giro de un cuarto de vuelta: la primera pregunta tras el giro, respondida pronto
  z = await esperaTurno(Q, -1, 4); const vidasG = (await info(Q)).lives;
  await Q.evaluate(() => window.__cdTest.giro(999));
  t5 = await objetivo(Q); a5 = (await info(Q)).score; await Q.evaluate(() => window.__cdTest.pendienteGiro(true)); await tocar(Q, t5);
  for (let k = 0; k < 60; k++) { const y = await info(Q); if (y && y.score > a5) break; await sleep(50); }
  z = await esperaTurno(Q, -1, 4);
  t5 = await objetivo(Q); a5 = (await info(Q)).score; await tocar(Q, t5); await Q.waitForTimeout(250);
  const vG = await info(Q), msgG = await Q.evaluate(() => document.getElementById("cd-msg").textContent);
  ok(vG.lives === Math.min(5, vidasG + 1) && /orientarte/.test(msgG), "acertar pronto la primera pregunta tras un giro de un cuarto da un corazón (" + vidasG + " → " + vG.lives + ")");
  // las apuestas
  const hitYOferta = async tipo => {
    await Q.evaluate(t => window.__cdTest.apuesta(t), tipo);
    z = await esperaTurno(Q, -1, -1); const tt = await objetivo(Q), aa = (await info(Q)).score; await tocar(Q, tt);
    for (let k = 0; k < 80; k++) { const y = await info(Q); if (y && y.kind === "apuesta" && !y.locked) return y; await sleep(50); }
    return null;
  };
  const clic = v => Q.evaluate(v => document.querySelector('#cd-ans .cd-opt[data-v="' + v + '"]').click(), v);
  const volver = async () => { for (let k = 0; k < 120; k++) { const y = await info(Q); if (y && y.kind === "toca" && !y.locked) return y; await sleep(100); } return null; };
  let of = await hitYOferta("mejor");
  const bot = await Q.evaluate(() => ({ b: [...document.querySelectorAll("#cd-ans .cd-opt")].map(x => x.dataset.v).join(), t: document.getElementById("cd-target").textContent.trim(), msg: document.getElementById("cd-msg").textContent }));
  ok(of && of.bet.fase === "oferta" && bot.b === "si,no" && bot.t === "¿Apuestas?" && /Apuestas un corazón/.test(bot.msg), "claudIA ofrece la apuesta con «Apuesto» y «Paso» (sin reloj)");
  await clic("no"); ok(!!(await volver()) && (await info(Q)).bet === null, "«Paso» sigue con el juego sin costo");
  // apuesta de mejor jugada, mal jugada
  of = await hitYOferta("mejor"); await clic("si"); await Q.waitForTimeout(150);
  const pj = await Q.evaluate(() => { const i = window.__cdInfo(); const lado = i.bet.lado; const pz = [...document.querySelectorAll("#cd-grid .cd-sq")].filter(x => x.querySelector(".piece." + lado)); const vacias = [...document.querySelectorAll("#cd-grid .cd-sq")].filter(x => !x.querySelector(".piece")); return { lado, sol: i.bet.sol, rot: i.rot, n: document.querySelectorAll("#cd-grid .piece").length, de: pz[0].getAttribute("aria-label"), a: vacias.map(x => x.getAttribute("aria-label")), dur: i.dur }; });
  ok(pj.n >= 8 && pj.rot === (pj.lado === "w" ? 0 : 2) && pj.sol.length >= 1, "apuesta de mejor jugada: posición en el tablero, de frente para el bando que mueve (" + pj.lado + ", " + pj.n + " piezas, " + pj.dur + " ms)");
  const vAntes = (await info(Q)).lives;
  const dest = pj.a.find(x => !pj.sol.some(m => m.slice(0, 4) === pj.de + x));
  await tocar(Q, pj.de); await tocar(Q, dest); await Q.waitForTimeout(250);
  const mal2 = await Q.evaluate(() => document.getElementById("cd-msg").textContent);
  ok((await info(Q)).lives === vAntes - 1 && /perdida/.test(mal2) && /La mejor jugada era/.test(mal2), "una jugada equivocada cuesta un corazón y muestra la buena (" + vAntes + " → " + (await info(Q)).lives + ")");
  await volver();
  // aperturas y defensas
  of = await hitYOferta("apertura"); await clic("si"); await Q.waitForTimeout(150);
  const ap = await Q.evaluate(() => { const i = window.__cdInfo(); return { resp: i.bet.resp, ops: [...document.querySelectorAll("#cd-ans .cd-opt")].map(x => x.dataset.v), q: document.getElementById("cd-msg").textContent.trim(), n: document.querySelectorAll("#cd-grid .piece").length, rot: i.rot }; });
  ok(ap.ops.length === 3 && new Set(ap.ops).size === 3 && ap.ops.includes(ap.resp) && /Qué apertura/.test(ap.q) && ap.n >= 20 && ap.rot === 0, "apuesta de apertura: posición real y tres nombres, uno es el bueno (" + ap.resp + " entre " + ap.ops.join(", ") + ")");
  const vA = (await info(Q)).lives; await clic(ap.resp); await Q.waitForTimeout(250);
  const gano = await Q.evaluate(() => ({ msg: document.getElementById("cd-msg").textContent, linea: document.getElementById("cd-taunt").textContent.trim() }));
  ok((await info(Q)).lives === Math.min(5, vA + 2) && /ganada/.test(gano.msg) && /^1\./.test(gano.linea), "acertar la apertura da dos corazones (tope 5) y muestra la línea de jugadas («" + gano.linea.slice(0, 28) + "…»)");
  await volver();
  of = await hitYOferta("defensa"); await clic("si"); await Q.waitForTimeout(150);
  const df = await Q.evaluate(() => { const i = window.__cdInfo(); return { resp: i.bet.resp, ops: [...document.querySelectorAll("#cd-ans .cd-opt")].map(x => x.dataset.v), q: document.getElementById("cd-msg").textContent.trim() }; });
  const vD = (await info(Q)).lives; await clic(df.ops.find(x => x !== df.resp)); await Q.waitForTimeout(250);
  const perdio = await Q.evaluate(() => document.getElementById("cd-msg").textContent);
  ok(/Qué defensa/.test(df.q) && (await info(Q)).lives === vD - 1 && /Era/.test(perdio), "apuesta de defensa: un nombre equivocado cuesta un corazón y dice cuál era (" + df.resp + ")");
  await volver();
  // mejor jugada acertada
  of = await hitYOferta("mejor"); await clic("si"); await Q.waitForTimeout(150);
  const bj = await info(Q), vM = bj.lives;
  await tocar(Q, bj.bet.sol[0].slice(0, 2)); await tocar(Q, bj.bet.sol[0].slice(2, 4)); await Q.waitForTimeout(250);
  ok((await info(Q)).lives === Math.min(5, vM + 2), "acertar la mejor jugada (" + bj.bet.sol[0] + ") da dos corazones (" + vM + " → " + (await info(Q)).lives + ")");
  await volver();
  // se acaba el tiempo en una apuesta
  of = await hitYOferta("apertura"); await clic("si"); const vT = (await info(Q)).lives; await Q.waitForTimeout(5500);
  ok((await info(Q)).lives === vT - 1, "dejar pasar el tiempo en una apuesta cuesta un corazón (" + vT + " → " + (await info(Q)).lives + ")");
  await volver();
  ok(q2.errores.length === 0, "sin errores de JavaScript en los corazones" + (q2.errores.length ? ": " + q2.errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
