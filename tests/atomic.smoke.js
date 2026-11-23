const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "application/javascript" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res)
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
const FRAMES = process.env.FRAMES;
async function abrir(browser, reducir) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: +(process.env.DSF || 1), reducedMotion: reducir ? "reduce" : "no-preference" });
  const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try{ localStorage.clear(); }catch(e){} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForTimeout(300);
  return { page, errores };
}
// Atomic (2.367): variante en el selector, explosión por captura, rey que no captura, fin por rey explotado, CLAUDIA responde con el motor atomic.
// Uso: node tests/atomic.smoke.js
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(() => { document.getElementById("mode-play").click(); switchVariant("atomic"); vsMachine = false; matchStarted = true; matchPaused = false; render(); });
    ok(await page.evaluate(() => variantOf(liveState().board) === "atomic"), "switchVariant('atomic') deja una posición atomic");
    ok(await page.evaluate(() => document.getElementById("variant-atomic").getAttribute("aria-pressed") === "true"), "el botón Atomic queda activo");
    // peón e3 captura el caballo negro de d4: explotan d4, el peón capturador y el alfil de c3 (pieza vecina); el peón de e2 vecino... no hay; el de d2 no es vecino
    const FEN = "rnbqkbnr/pppppppp/8/8/3n4/2B1P3/PPPP1PPP/RN1QKBNR w KQkq - 0 1 atomic";
    await page.evaluate(F => { newGame(F, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render(); }, FEN);
    const r = await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.capture && x.from[0] === 5 && x.from[1] === 4 && x.to[0] === 4 && x.to[1] === 3); if(!m) return null; commitMove(m); const b = liveState().board; return { d4: b[4][3], e3: b[5][4], c3: b[5][2], d2: b[6][3] }; });
    ok(r && r.d4 === "" && r.e3 === "" && r.c3 === "", "exd4 explota: caballo, peón capturador y alfil vecino desaparecen " + JSON.stringify(r));
    ok(r && r.d2 === "wp", "el peón vecino (d2) sobrevive a la explosión");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  // rey: no puede capturar y mate por explosión del rey rival
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(() => { document.getElementById("mode-play").click(); switchVariant("atomic"); });
    const FEN = "4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1 atomic";
    const res = await page.evaluate(F => { newGame(F, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render();
      const mv = legalMoves(liveState()); const qxd7 = mv.find(m => m.capture && m.to[0] === 1 && m.to[1] === 3); if(!qxd7) return { err: "sin Dxd7" };
      commitMove(qxd7); return { fin: outcome(liveState()), reyN: liveState().board.flat().includes("bk") }; }, FEN);
    ok(res.fin === "checkmate" || res.fin === "nokings", "Dxd7 explota al rey negro y termina la partida (" + JSON.stringify(res) + ")");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }
  // animación (2.368): normal = explosión + migajas de las vecinas; modo ligero = sin animación y con marca fija
  for (const lite of [false, true]) {
    const { page, errores } = await abrir(browser, false);
    if (lite) await page.evaluate(() => { if (!LITE.isOn()) LITE.toggle(); });
    await page.evaluate(() => { document.getElementById("mode-play").click(); switchVariant("atomic"); });
    const FEN = "rnbqkbnr/pppppppp/8/8/3n4/2B1P3/PPPP1PPP/RN1QKBNR w KQkq - 0 1 atomic";
    await page.evaluate(F => { newGame(F, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render(); }, FEN);
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.capture && x.from[0] === 5 && x.from[1] === 4 && x.to[0] === 4 && x.to[1] === 3); commitMove(m); });
    await page.waitForTimeout(250);
    if (process.env.SHOT && !lite) await page.screenshot({ path: process.env.SHOT });
    const st = await page.evaluate(() => ({ blast: document.querySelectorAll(".gatefx.blast").length, crumbs: document.querySelectorAll("#crumble-layer .crumb").length, marcas: document.querySelectorAll("#board .cell.atom-boom").length }));
    if (!lite) ok(st.blast === 1 && st.crumbs >= 2, "explosión animada: 1 bola de fuego y migajas de las piezas caídas (" + JSON.stringify(st) + ")");
    else ok(st.blast === 0 && st.marcas === 2, "modo ligero: sin animación y 2 casillas marcadas (centro y alfil caído) (" + JSON.stringify(st) + ")");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close();
  }
  // ojo táctico de CLAUDIA (2.373): con un nivel alto vuela al rey rival cuando puede; y nunca elige una captura tras la que el rival pueda volar a su rey
  { const { page, errores } = await abrir(browser, false);
    const r = await page.evaluate(() => {
      const pos = parseFEN("4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1 atomic"), legal = legalMoves(pos), quieto = legal.find(m => !m.capture);
      const t = atomicTactic(pos, 25, quieto, legal);
      const pos2 = parseFEN("3qk3/8/8/8/8/8/3Pp3/3QK3 w - - 0 1 atomic"), l2 = legalMoves(pos2);   // Dxd8?? no: la dama blanca no puede; solo se comprueba que no devuelva una captura suicida
      const ts = []; for(let i = 0; i < 20; i++){ const x = atomicTactic(pos2, 25, l2.find(m => !m.capture), l2); if(x) ts.push(x); }
      return { rey: !!t && atomicGain(pos, t) >= 1000, p0: atomicTacticP(0).join(), p5: atomicTacticP(5).join(), p20: atomicTacticP(20).join(), suicidas: ts.filter(x => atomicNet(pos2, x) <= -1000).length };
    });
    ok(r.rey, "nivel 25: con una explosión que vuela al rey rival, la juega");
    ok(r.suicidas === 0, "nunca elige una captura tras la que el rival pueda volar a su rey");
    ok(r.p0 === "0.3,0.1" && r.p20 === "1,1", "la agresividad crece con el nivel (" + r.p0 + " → " + r.p5 + " → " + r.p20 + ")");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }
  // CLAUDIA responde
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(() => { document.getElementById("mode-play").click(); switchVariant("atomic"); vsMachine = true; machineHumanColor = "b"; machineLevel = 10;
      newGame(ATOMIC_START, { white: "CLAUDIA", black: "Yo", result: "", resultNote: "" }); matchStarted = true; matchPaused = false; render(); maybeMachineMove(); });
    let movio = true;
    try { await page.waitForFunction(() => (game.ucis && game.ucis.length >= 1), null, { timeout: 40000 }); } catch (e) { movio = false; }
    const est = await page.evaluate(() => ({ uci: (game.ucis || [])[0], fen: toFEN(liveState()) }));
    ok(movio, "CLAUDIA juega en Atomic → " + (movio ? est.uci : "parada"));
    ok(movio && / atomic$/.test(est.fen), "la partida conserva la marca atomic en el FEN");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  await browser.close(); srv.close();
  console.log(fallos ? "\nHay " + fallos + " fallos" : "\nTodo en orden"); process.exit(fallos ? 1 : 0);
})();
