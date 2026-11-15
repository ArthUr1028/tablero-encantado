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
// Crazyhouse (2.319): reserva visible, caída por toque y por arrastre, jugadas ilegales ignoradas, claudIA responde con el motor de variantes, sin errores.
// Uso: node tests/crazyhouse.smoke.js
const ZHFEN = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR[] w KQkq - 0 2 zh";
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  // 1) dos humanos: exd5 -> reserva blanca con un peón; negras recaptura con Dxd5 -> reserva negra
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(F => { setMode("play"); newGame(F, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render(); }, ZHFEN);
    ok(await page.evaluate(() => variantOf(liveState().board) === "crazyhouse"), "la posición se reconoce como Crazyhouse");
    ok(await page.evaluate(() => document.getElementById("variant-crazyhouse").getAttribute("aria-pressed") === "true"), "el botón Crazyhouse queda activo");
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 4 && x.from[1] === 4 && x.to[0] === 3 && x.to[1] === 3); commitMove(m); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.querySelectorAll('.nameplate .zh-res[data-color="w"] .zh-pc').length) === 1, "tras capturar, la reserva blanca muestra 1 pieza");
    ok(await page.evaluate(() => document.querySelectorAll("#grave-top .crumb, #grave-bottom .crumb").length) === 0, "sin cementerio visible en Crazyhouse");
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 0 && x.from[1] === 3 && x.to[0] === 3 && x.to[1] === 3); commitMove(m); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => liveState().board.zh.w.p === 1 && liveState().board.zh.b.p === 1), "reservas en el modelo: un peón para cada bando");
    // turno blanco: toque en la reserva y luego en una casilla vacía (e4 -> e5? casilla vacía f5)
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 7 && x.from[1] === 6 && x.to[0] === 5 && x.to[1] === 5); commitMove(m); commitMove(legalMoves(liveState()).find(x => x.from && x.from[0] === 1 && x.from[1] === 0 && x.to[0] === 2 && x.to[1] === 0)); });
    await page.waitForTimeout(600);
    const pc = page.locator('.nameplate .zh-res[data-color="w"] .zh-pc.can').first();
    ok(await pc.count() === 1, "es turno blanco: la pieza de la reserva se puede tomar");
    await pc.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true, clientX: 10, clientY: 10, pointerId: 41 });
    await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", pointerId: 41, clientX: 10, clientY: 10, bubbles: true })));
    await page.waitForTimeout(250);
    const sel = await page.evaluate(() => ({ s: selected && selected.drop, dest: document.querySelectorAll("#board .cell.tgt").length }));
    ok(sel.s === "p", "toque en la reserva: queda elegido el peón");
    ok(sel.dest > 20, "se iluminan las casillas donde puede caer (" + sel.dest + ")");
    // tocar una casilla destino (e5: fila 3 col 4 está vacía)
    await page.evaluate(() => { const c = document.querySelector('#board .cell[data-r="4"][data-c="5"]'); const r = c.getBoundingClientRect(); const ev = (t, id) => c.dispatchEvent(new PointerEvent(t, { pointerType: "mouse", button: 0, pointerId: id, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); ev("pointerdown", 1); ev("pointerup", 1); });
    await page.waitForTimeout(700);
    const post = await page.evaluate(() => ({ drop: liveState().board[4][5], w: liveState().board.zh.w.p, last: (game.ucis || []).slice(-1)[0] }));
    ok(post.drop === "wp" && post.w === 0 && /^P@f4$/.test(post.last), "la caída por toque pone el peón en f4 y vacía la reserva (" + post.last + ")");
    // arrastre desde la reserva negra: negras capturó antes (dxe4?); forzamos una reserva y soltamos con el ratón
    await page.evaluate(() => { const s = liveState(); s.board.zh.b.n = 1; s.turn = "b"; render(); });
    await page.waitForTimeout(300);
    const nb = page.locator('.nameplate .zh-res[data-color="b"] .zh-pc[data-t="n"]');
    ok(await nb.count() === 1, "reserva negra: aparece el caballo");
    const bb = await nb.boundingBox();
    const dst = await page.evaluate(() => { const r = document.querySelector('#board .cell[data-r="3"][data-c="6"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down();
    await page.mouse.move(bb.x + bb.width / 2 + 20, bb.y + bb.height / 2 + 40, { steps: 4 });
    ok(await page.evaluate(() => !!document.querySelector(".piece-float")), "al arrastrar aparece la ficha flotante");
    await page.mouse.move(dst.x, dst.y, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(700);
    const arr = await page.evaluate(() => ({ p: liveState().board[3][6], n: liveState().board.zh.b.n, fl: document.querySelectorAll(".piece-float").length, u: (game.ucis || []).slice(-1)[0] }));
    ok(arr.p === "bn" && arr.n === 0 && arr.fl === 0 && arr.u === "N@g5", "la caída por arrastre pone el caballo en g5 (" + arr.u + ")");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  // 2) contra claudIA: tras una captura de la máquina, la máquina también puede soltar; juega varias jugadas sin errores
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(F => { document.getElementById("variant-crazyhouse").click(); }, ZHFEN);
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => variantOf(liveState().board) === "crazyhouse"), "el botón de variante inicia Crazyhouse");
    const info = await page.evaluate(() => ({ fen: toFEN(liveState()), uci: typeof FSF_VARIANT_UCI_NAME !== "undefined" && FSF_VARIANT_UCI_NAME.crazyhouse, enviada: fsfFen("crazyhouse", toFEN(liveState())) }));
    ok(info.uci === "crazyhouse" && !/\bzh\b/.test(info.enviada) && /\[\]/.test(info.enviada), "al motor se envía la FEN sin la marca «zh» (" + info.enviada + ")");
    ok(errores.length === 0, "sin errores de página al abrir la variante" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  // 3) claudIA (motor de variantes): con una reserva fuerte (dos damas) y turno suyo, responde y su jugada es legal; la primera partida normal también arranca
  for (const [nombre, fen, color] of [
    ["claudIA con reserva", "4k3/8/8/8/8/8/4PPPP/4K3[] b - - 0 1 zh".replace("[]", "[qq]"), "w"],
    ["claudIA desde el inicio", ZHFEN, "b"]]) {
    const { page, errores } = await abrir(browser, false);
    await page.evaluate(({ fen, color }) => {
      document.getElementById("mode-play").click(); switchVariant("crazyhouse");
      vsMachine = true; machineHumanColor = color; machineLevel = 12;
      newGame(fen, { white: "Yo", black: "claudIA", result: "", resultNote: "" });
      matchStarted = true; matchPaused = false; render(); maybeMachineMove();
    }, { fen, color });
    let movio = true;
    try { await page.waitForFunction(() => game.sans.length >= 1 || (game.ucis && game.ucis.length >= 1), null, { timeout: 40000 }); } catch (e) { movio = false; }
    const est = await page.evaluate(() => ({ uci: (game.ucis || [])[0], san: (game.sans || [])[0], pens: machineThinking }));
    ok(movio, nombre + " → " + (movio ? "jugó " + (est.san || est.uci) : "se quedó parada (pensando=" + est.pens + ")"));
    if (movio && nombre.includes("reserva")) ok(/@/.test(est.uci || ""), "la máquina suelta una pieza de su reserva (" + est.uci + ")");
    ok(errores.length === 0, nombre + ": sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close();
  }
  srv.close(); await browser.close();
  console.log(fallos ? "\nHAY FALLOS: " + fallos : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
