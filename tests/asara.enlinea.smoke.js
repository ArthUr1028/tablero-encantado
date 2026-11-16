// Asara en línea (2.339): el rival "juega" por Realtime (handleRemoteMove) una partida con capturas, caídas y esclavas, y mi tablero debe
// quedar IGUAL que el suyo (FEN con reserva + marcas de esclava). También: la reserva solo se puede tomar en mi turno, y reanudar con reloadLiveGame-like
// (applySanList desde ZH_START) conserva las marcas. node tests/asara.enlinea.smoke.js
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; });
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); }
    const out = {};
    // 1) una partida entera jugada "en el otro dispositivo" (aleatoria, con sesgo a capturas y caídas)
    let st = parseFEN(ZH_START); const sans = []; let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let p = 0; p < 70; p++) {
      const L = legalMoves(st); if (!L.length) break;
      const pref = L.filter(m => m.drop || st.board[m.to[0]][m.to[1]]);
      const m = (pref.length && rnd() < .6 ? pref : L)[Math.floor(rnd() * (pref.length && rnd() < .6 ? pref.length : L.length)) % (pref.length && rnd() < .6 ? pref.length : L.length)] || L[0];
      const rr = moveWithSAN(st, m); st = rr.n; sans.push(rr.san);
    }
    out.n = sans.length; out.drops = sans.filter(s => s.includes("@")).length;
    out.fenA = toFEN(st); out.slA = Object.keys(st.board.zh.sl || {}).sort().join("|");
    // 2) mi tablero: partida en vivo con negras; el rival (blancas) y yo jugamos por Realtime / mi propio commit
    setMode("play"); newGame(ZH_START, {});
    liveGame = { id: "g-asara", variant: "crazyhouse", myColor: "b", whiteId: "w1", blackId: "b1", opponentName: "Rival", plyCount: 0, mode: "tiempo_real" };
    for (let i = 0; i < sans.length; i++) handleRemoteMove({ new: { game_id: "g-asara", ply: i + 1, san: sans[i] } });
    const fin = game.states[game.states.length - 1];
    out.fenB = toFEN(fin); out.slB = Object.keys(fin.board.zh.sl || {}).sort().join("|"); out.plyB = game.sans.length;
    // 3) reanudar (releer todo desde game_moves): applySanList desde la FEN de Asara
    applySanList(VARIANT_START.crazyhouse, sans, {});
    const fin2 = game.states[game.states.length - 1];
    out.fenC = toFEN(fin2); out.slC = Object.keys(fin2.board.zh.sl || {}).sort().join("|");
    // 4) la reserva solo se toma en MI turno
    newGame(ZH_START, {}); liveGame = { id: "g-asara2", variant: "crazyhouse", myColor: "w", whiteId: "w1", blackId: "b1", plyCount: 0, mode: "tiempo_real" };
    out.puedoBlancas = canPickReserve("w"); out.noPuedoNegras = canPickReserve("b");
    liveGame = null;
    return out;
  });
  ok(r.n > 40 && r.drops > 3, "la partida de prueba trae jugadas y caídas (" + r.n + " jugadas, " + r.drops + " caídas)");
  ok(r.plyB === r.n, "el rival me llegó completo por Realtime (" + r.plyB + " de " + r.n + ")");
  ok(r.fenB === r.fenA, "mi tablero (Realtime) = el suyo, con la reserva\n   " + r.fenA + "\n   " + r.fenB);
  ok(r.slB === r.slA, "mismas marcas de esclava por Realtime (" + r.slA.split("|").length + " esclavas)");
  ok(r.fenC === r.fenA && r.slC === r.slA, "releer toda la partida (reanudar) da la misma posición y marcas");
  ok(r.puedoBlancas === true || r.puedoBlancas === false, "canPickReserve responde");
  ok(r.puedoBlancas === true && r.noPuedoNegras === false, "la reserva solo se toma en mi turno (blancas sí: " + r.puedoBlancas + ", negras no: " + !r.noPuedoNegras + ")");
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores.slice(0, 3).join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? fallos + " fallos" : "Todo bien"); process.exit(fallos ? 1 : 0);
})();
