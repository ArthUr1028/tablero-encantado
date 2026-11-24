// 2.375 · Toda captura (fuera de Atomic) rompe la pieza en trozos IRREGULARES (polígonos, no rectángulos) que salen despedidos en la dirección del golpe
// (de la casilla de origen a la de destino de la pieza que captura, en pantalla). Atomic conserva su onda expansiva; en Dark no se delata el origen oculto.
// Uso: node tests/capturas_trozos.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };

async function abrir(browser, reducir) {
  const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 }, reducedMotion: reducir ? "reduce" : "no-preference" });
  const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try { localStorage.clear(); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForTimeout(300);
  return { page, errores };
}
// Juega una captura (origen/destino como [fila, columna], fila 0 = octava) y devuelve los datos de los pedazos (dx, dy, clip-path) y las clases de la capa.
async function capturar(page, cfg) {
  return page.evaluate(async (cfg) => {
    document.getElementById("mode-play").click(); if (cfg.variante) switchVariant(cfg.variante);
    newGame(cfg.fen, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; flipped = !!cfg.flip; render();
    const m = legalMoves(liveState()).find(x => x.capture && x.from[0] === cfg.from[0] && x.from[1] === cfg.from[1] && x.to[0] === cfg.to[0] && x.to[1] === cfg.to[1]);
    if (!m) return { sinJugada: true };
    commitMove(m);
    await new Promise(r => setTimeout(r, 60));
    const capas = [...document.querySelectorAll("#crumble-layer .crumb")].filter(c => c.querySelector(".frag"));
    const frags = capas.flatMap(c => [...c.querySelectorAll(".frag")]).map(f => ({ clip: f.style.clipPath || "", dx: parseFloat(f.style.getPropertyValue("--dx")), dy: parseFloat(f.style.getPropertyValue("--dy")), rot: parseFloat(f.style.getPropertyValue("--rot")) }));
    return { capas: capas.map(c => c.className), n: frags.length, frags };
  }, cfg);
}
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();

  // 1) clásico: peón e4 x d5 (hacia arriba y a la izquierda en pantalla); trozos poligonales que salen hacia ahí
  { const { page, errores } = await abrir(browser, false);
    const r = await capturar(page, { fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", from: [4, 4], to: [3, 3] });
    ok(!r.sinJugada && r.capas.length === 1 && /\bshot\b/.test(r.capas[0]), "clásico: la captura rompe la pieza con trozos dirigidos (.shot) " + JSON.stringify(r.capas));
    ok(r.n >= 12 && r.n <= 26, "se rompe en una docena larga de pedazos (" + r.n + ")");
    ok(r.frags.every(f => /^polygon\(/.test(f.clip) && !/inset/.test(f.clip)), "todos los pedazos son polígonos (no rectángulos inset)");
    ok(new Set(r.frags.map(f => f.clip.split(",").length)).size >= 2, "hay pedazos de 3 y de 4 vértices (formas distintas entre sí)");
    ok(media(r.frags.map(f => f.dx)) < -8 && media(r.frags.map(f => f.dy)) < media(r.frags.map(f => Math.abs(f.dx))), "salen hacia la izquierda y arriba, la dirección del golpe (dx medio " + media(r.frags.map(f => f.dx)).toFixed(0) + ", dy medio " + media(r.frags.map(f => f.dy)).toFixed(0) + ")");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }

  // 2) tablero girado: la misma captura sale en la dirección contraria EN PANTALLA (el golpe sigue la jugada, no el tablero)
  { const { page, errores } = await abrir(browser, false);
    const r = await capturar(page, { fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", from: [4, 4], to: [3, 3], flip: true });
    ok(!r.sinJugada && media(r.frags.map(f => f.dx)) > 8, "tablero girado: los pedazos salen hacia la derecha en pantalla (dx medio " + (r.frags ? media(r.frags.map(f => f.dx)).toFixed(0) : "?") + ")");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }

  // 3) Capablanca (10 columnas) y Shatranj: también usan trozos dirigidos
  { const { page, errores } = await abrir(browser, false);
    const r = await page.evaluate(async () => {
      document.getElementById("mode-play").click(); switchVariant("capablanca");
      vsMachine = false; matchStarted = true; matchPaused = false; render();
      // 1.e4 d5 2.exd5 (en 10x8: la columna e es la 5.ª); se buscan los movimientos por jugada legal real
      const jug = (fn) => { const m = legalMoves(liveState()).find(fn); if (!m) throw new Error("sin jugada"); commitMove(m); };
      jug(m => !m.capture && m.from[0] === 6 && m.from[1] === 4 && m.to[0] === 4 && m.to[1] === 4);
      jug(m => !m.capture && m.from[0] === 1 && m.from[1] === 3 && m.to[0] === 3 && m.to[1] === 3);
      jug(m => m.capture && m.from[0] === 4 && m.from[1] === 4 && m.to[0] === 3 && m.to[1] === 3);
      await new Promise(r => setTimeout(r, 60));
      const caps = [...document.querySelectorAll("#crumble-layer .crumb")].map(c => c.className);
      return { caps, n: document.querySelectorAll("#crumble-layer .crumb .frag").length };
    }).catch(e => ({ err: String(e) }));
    ok(!r.err && r.caps.some(c => /\bshot\b/.test(c)) && r.n >= 12, "Capablanca (10×8): trozos dirigidos " + JSON.stringify(r));
    ok(errores.length === 0, "Capablanca: sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }

  // 4) Atomic conserva su onda expansiva (.wave) y NO usa los trozos dirigidos
  { const { page, errores } = await abrir(browser, false);
    const r = await capturar(page, { variante: "atomic", fen: "rnbqkbnr/pppppppp/8/8/3n4/2B1P3/PPPP1PPP/RN1QKBNR w KQkq - 0 1 atomic", from: [5, 4], to: [4, 3] });
    ok(!r.sinJugada && r.capas.length >= 2 && r.capas.every(c => /\bwave\b/.test(c) && !/\bshot\b/.test(c)), "Atomic: las piezas rotas siguen con la onda expansiva, sin .shot " + JSON.stringify(r.capas));
    ok(r.frags.every(f => /inset/.test(f.clip)), "Atomic: sin cambios en la forma de sus pedazos");
    ok(errores.length === 0, "Atomic: sin errores de página");
    await page.context().close(); }

  // 5) Dark (contra claudIA tú ves siempre desde tu color): trozos dirigidos con origen visible o en la niebla (la dirección es una pista indirecta de dónde vino el golpe)
  const darkVsMaquina = (page, fen, from, to, pausar) => page.evaluate(async ([fen, from, to, pausar]) => {
    document.getElementById("mode-play").click(); switchVariant("dark");
    newGame(fen, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = true; machineHumanColor = "w"; matchStarted = true; matchPaused = !!pausar; flipped = false; render();
    const m = legalMoves(liveState()).find(x => x.capture && x.from[0] === from[0] && x.from[1] === from[1] && x.to[0] === to[0] && x.to[1] === to[1]);
    if (!m) return { sinJugada: true };
    commitMove(m); await new Promise(r => setTimeout(r, 60));
    return { capas: [...document.querySelectorAll("#crumble-layer .crumb")].filter(c => c.querySelector(".frag")).map(c => c.className) };
  }, [fen, from, to, pausar]);
  { const { page, errores } = await abrir(browser, false);
    // blancas: la torre h1 (propia, visible) captura el peón negro de h5
    const r = await darkVsMaquina(page, "4k3/8/8/7p/8/8/8/4K2R w - - 0 1 dark", [7, 7], [3, 7], false);
    ok(!r.sinJugada && r.capas.length === 1 && /\bshot\b/.test(r.capas[0]), "Dark: captura mía (origen visible) → trozos dirigidos " + JSON.stringify(r));
    ok(errores.length === 0, "Dark (mi captura): sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  { const { page, errores } = await abrir(browser, false);
    // negras: la torre de h5 (en la niebla para mí) captura mi peón de h2, casilla que sí veo por mi rey de g1
    const r = await darkVsMaquina(page, "4k3/8/8/7r/8/8/7P/6K1 b - - 0 1 dark", [3, 7], [6, 7], true);
    ok(!r.sinJugada && r.capas.length >= 1 && r.capas.every(c => /\bshot\b/.test(c)), "Dark: origen del rival en la niebla → trozos dirigidos (pista de dónde vino) " + JSON.stringify(r));
    ok(errores.length === 0, "Dark (captura del rival): sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }

  { const { page, errores } = await abrir(browser, false);
    // negras: la torre de h5 captura mi peón de h2 y NINGUNA pieza mía ve h2 (rey en e1): mi pieza capturada debe romperse igual, sin dirección
    const r = await darkVsMaquina(page, "4k3/8/8/7r/8/8/7P/4K3 b - - 0 1 dark", [3, 7], [6, 7], true);
    ok(!r.sinJugada && r.capas.length === 1 && /\bshot\b/.test(r.capas[0]), "Dark: mi pieza capturada en una casilla que no veo se rompe con trozos dirigidos " + JSON.stringify(r));
    await page.context().close(); }

  // 6) «reducir movimiento»: no se dibuja nada
  { const { page, errores } = await abrir(browser, true);
    const r = await capturar(page, { fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", from: [4, 4], to: [3, 3] });
    ok(!r.sinJugada && r.n === 0, "con «reducir movimiento» no hay pedazos (" + r.n + ")");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }

  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})();
