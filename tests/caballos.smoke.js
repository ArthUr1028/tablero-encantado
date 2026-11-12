// 2.272 · Los Caballos: reto de Guarini (3×3) y recorrido del caballo (8×8) en Las Sesenta y Cuatro.
// Uso: node tests/caballos.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
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
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); localStorage.removeItem("tablero.knBest"); } });

  // abrir la ventana y el menú
  const m0 = await page.evaluate(() => { document.getElementById("kn-open").click(); const ov = document.getElementById("kn-ov"); return { vis: !ov.hidden, cards: document.querySelectorAll(".kn-card").length }; });
  ok(m0.vis && m0.cards === 2, "el botón abre Los Caballos con dos retos");

  // ----- Guarini: búsqueda del camino mínimo (en saltos y en jugadas) y se juega con clics reales
  const g = await page.evaluate(async () => {
    const N = (i) => { const x = i % 3, y = (i / 3) | 0, o = []; for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 3 && b >= 0 && b < 3) o.push(b * 3 + a); } return o; };
    const ini = "b.b......".replace(/\./g, "-"), fin0 = "-w-------";
    const start = ["b", "-", "b", "-", "-", "-", "w", "-", "w"].join(""), goal = ["w", "-", "w", "-", "-", "-", "b", "-", "b"].join("");
    // 0-1 BFS sobre (estado, último caballo): coste 1 por jugada nueva, 0 si sigue el mismo caballo
    const key = (st, last) => st + "|" + last;
    const dist = new Map([[key(start, -1), 0]]), prev = new Map(), dq = [[start, -1]];
    while (dq.length) {
      const [st, last] = dq.shift(), d = dist.get(key(st, last));
      for (let i = 0; i < 9; i++) if (st[i] !== "-") for (const j of N(i)) if (st[j] === "-") {
        const a = st.split(""); a[j] = a[i]; a[i] = "-"; const ns = a.join(""), c = (last === i ? 0 : 1), k = key(ns, j), nd = d + c;
        if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); prev.set(k, [key(st, last), i, j]); if (c) dq.push([ns, j]); else dq.unshift([ns, j]); }
      }
    }
    let best = null; for (const [k, v] of dist) if (k.startsWith(goal + "|") && (best === null || v < best.v)) best = { k, v };
    const camino = []; let k = best.k; while (prev.has(k)) { const [pk, i, j] = prev.get(k); camino.unshift([i, j]); k = pk; }
    document.querySelector('.kn-card[data-reto="guarini"]').click();
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    for (const [i, j] of camino) { sq(i).click(); sq(j).click(); }
    return { jugadasMin: best.v, saltos: camino.length, msg: document.getElementById("kn-msg").textContent, rec: JSON.parse(localStorage.getItem("tablero.knBest") || "{}") };
  });
  ok(g.jugadasMin === 7, "el camino de 7 jugadas existe (Dudeney): " + g.jugadasMin);
  ok(/Lo lograste/.test(g.msg) && /récord/.test(g.msg), "ganar a Guarini dice «Lo lograste» y anota récord: " + g.msg);
  ok(g.rec.guarini && g.rec.guarini.jugadas === 7, "el récord de jugadas queda en 7 (" + JSON.stringify(g.rec.guarini) + ")");

  // con el hilo a la vista no cuenta para el récord, y deshacer funciona
  const h = await page.evaluate(() => {
    document.getElementById("kn-reset").click();
    document.getElementById("kn-hint").click();
    const lineas = document.querySelectorAll("#kn-board .kn-hilo line").length;
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    sq(0).click(); sq(7).click();   // b arriba-izq → fila 2 col 1: salto de caballo válido
    const tras1 = document.getElementById("kn-n1").textContent;
    document.getElementById("kn-undo").click();
    const tras2 = document.getElementById("kn-n1").textContent;
    return { lineas, tras1, tras2, centro: !!document.querySelector('#kn-board .kn-sq[data-i="4"] .kn-pc') };
  });
  ok(h.lineas === 8 && h.tras1 === "1" && h.tras2 === "0" && !h.centro, "el hilo dibuja 8 líneas, el salto cuenta y deshacer lo revierte");

  // ----- Recorrido: se resuelve con retroceso + regla de Warnsdorff y se juega con clics
  const t = await page.evaluate(() => {
    document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click();
    const N = i => { const x = i % 8, y = (i / 8) | 0, o = []; for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 8 && b >= 0 && b < 8) o.push(b * 8 + a); } return o; };
    const vis = Array(64).fill(false), path = [];
    const dfs = i => { vis[i] = true; path.push(i); if (path.length === 64) return true;
      const c = N(i).filter(j => !vis[j]).sort((a, b) => N(a).filter(z => !vis[z]).length - N(b).filter(z => !vis[z]).length);
      for (const j of c) if (dfs(j)) return true; vis[i] = false; path.pop(); return false; };
    dfs(0);
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    const unoAntes = document.getElementById("kn-msg").textContent;
    for (const i of path) sq(i).click();
    return { unoAntes, n: path.length, msg: document.getElementById("kn-msg").textContent, hud: document.getElementById("kn-n1").textContent, rec: JSON.parse(localStorage.getItem("tablero.knBest") || "{}") };
  });
  ok(/Toca una casilla/.test(t.unoAntes), "el recorrido pide colocar el caballo primero");
  ok(t.n === 64 && t.hud === "64 / 64" && /64 casillas/.test(t.msg), "las 64 casillas: " + t.msg);
  ok(t.rec.tour && t.rec.tour.max === 64 && t.rec.tour.done === true, "el récord del recorrido queda completo (" + JSON.stringify(t.rec.tour) + ")");

  // callejón sin salida: marca el fin, deja deshacer y la sugerencia no cuenta para el récord
  const c = await page.evaluate(() => {
    document.getElementById("kn-reset").click();
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    // a1 (índice 56) y saltos sin cuidado hasta quedarse sin salidas
    let guard = 0; sq(56).click();
    while (guard++ < 70) { const go = document.querySelector("#kn-board .kn-sq.go"); if (!go) break; go.click(); }
    const fin = document.getElementById("kn-msg").textContent, n = document.getElementById("kn-n1").textContent;
    const undoOn = !document.getElementById("kn-undo").disabled;
    document.getElementById("kn-undo").click();
    const trasUndo = document.getElementById("kn-n1").textContent, msgUndo = document.getElementById("kn-msg").textContent;
    document.getElementById("kn-hint").click();
    const tip = !!document.querySelector("#kn-board .kn-sq.tip");
    return { fin, n, undoOn, trasUndo, msgUndo, tip };
  });
  ok(/Sin salidas|64 casillas/.test(c.fin), "el recorrido termina al quedarse sin salidas o al completarlo: " + c.fin + " (" + c.n + ")");
  ok(c.undoOn && parseInt(c.trasUndo) === parseInt(c.n) - 1, "tras un callejón se puede deshacer un salto (" + c.n + " → " + c.trasUndo + ")");
  ok(c.tip, "la sugerencia de Warnsdorff marca una casilla");

  // ----- arrastrar y soltar con ratón real
  const centro = async i => page.evaluate(i => { const r = document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  const arrastra = async (de, a, soltar = true) => {
    const p0 = await centro(de), p1 = await centro(a);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    await page.mouse.move((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { steps: 4 }); await page.mouse.move(p1.x, p1.y, { steps: 4 });
    const flotante = await page.evaluate(() => !!document.querySelector(".kn-float"));
    if (soltar) await page.mouse.up();
    return flotante;
  };
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="guarini"]').click(); });
  const g0 = await page.evaluate(() => document.getElementById("kn-n1").textContent);
  const fl = await arrastra(0, 5);               // 0 → 5 es un salto de caballo en 3×3
  const g1 = await page.evaluate(() => ({ n: document.getElementById("kn-n1").textContent, flot: !!document.querySelector(".kn-float"), pieza5: !!document.querySelector('#kn-board .kn-sq[data-i="5"] .kn-pc') }));
  ok(fl && g1.n === "1" && g1.pieza5 && !g1.flot, "Guarini: arrastrar un caballo a una casilla libre de salto lo mueve (" + g0 + " → " + g1.n + ")");
  await arrastra(5, 4);                          // 5→4 no es salto de caballo: no debe mover
  const g2 = await page.evaluate(() => ({ n: document.getElementById("kn-n1").textContent, pieza5: !!document.querySelector('#kn-board .kn-sq[data-i="5"] .kn-pc'), flot: !!document.querySelector(".kn-float") }));
  ok(g2.n === "1" && g2.pieza5 && !g2.flot, "Guarini: soltar en una casilla ilegal no mueve nada");
  const p5 = await centro(5); await page.mouse.click(p5.x, p5.y); await page.waitForTimeout(50);
  const sel = await page.evaluate(() => !!document.querySelector("#kn-board .kn-sq.sel"));
  ok(sel, "el toque simple sigue funcionando (selecciona el caballo)");
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click(); });
  const t0 = await centro(0); await page.mouse.click(t0.x, t0.y);
  const dest = await page.evaluate(() => +document.querySelector("#kn-board .kn-sq.go").dataset.i);
  await arrastra(0, dest);
  const t1 = await page.evaluate(d => ({ n: document.getElementById("kn-n1").textContent, cur: !!document.querySelector('#kn-board .kn-sq.cur[data-i="' + d + '"]') }), dest);
  ok(t1.n.startsWith("2") && t1.cur, "Recorrido: arrastrar el caballo a una casilla verde lo mueve (" + t1.n + ")");

  // ----- inglés
  const en = await page.evaluate(() => {
    document.getElementById("kn-back").click(); setLang("en");
    const falta = [], tt = s => window.tx(s) !== s;
    const txt = ["Los Caballos", "Retos del caballo", "El problema de Guarini", "El recorrido del caballo", "Pasa por las 64 casillas sin repetir ninguna.", "Cuatro caballos en un tablero de 3×3: intercambia los blancos con los negros.", "‹ Retos", "Deshacer", "Ver el hilo", "Ocultar el hilo", "Sugerencia", "Conoce a Guarini", "Saltos", "Jugadas", "Casillas", "Salidas", "Mejor", "Toca una casilla para colocar el caballo.", "16 es el mínimo posible.", "¡Las 64 casillas! Recorrido completo.", "Cerrar Los Caballos",
      "Mejor: 16 saltos · 7 jugadas", "Mejor: 64 de 64 · ¡Completado!", "Mejor: 40 de 64", "¡Lo lograste en 16 saltos y 7 jugadas!", "Sin salidas: pisaste 40 de 64 casillas. Deshaz algunos saltos para probar otro camino."];
    for (const s of txt) if (!tt(s)) falta.push(s);
    return falta;
  });
  ok(!en.length, "todos los textos nuevos tienen versión en inglés" + (en.length ? ": " + en.slice(0, 5).join(" | ") : ""));
  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
