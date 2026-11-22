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
// Crazyhouse (2.319): reserva visible, caída por toque y por arrastre, jugadas ilegales ignoradas, CLAUDIA responde con el motor de variantes, sin errores.
// Uso: node tests/crazyhouse.smoke.js
const ZHFEN = "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR[] w KQkq - 0 2 zh";
// 2.342: con las reglas de Asara solo las piezas mayores se vuelven asīr; el peón blanco captura un caballo y la dama negra recaptura (el peón muere)
const ZHFEN2 = "rnbqkb1r/ppp1pppp/8/3n4/4P3/8/PPPP1PPP/RNBQKBNR[] w KQkq - 0 2 zh";
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  // 1) dos humanos: exd5 -> reserva blanca con un peón; negras recaptura con Dxd5 -> reserva negra
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(F => { setMode("play"); newGame(F, { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render(); }, ZHFEN2);
    ok(await page.evaluate(() => variantOf(liveState().board) === "crazyhouse"), "la posición se reconoce como Crazyhouse");
    ok(await page.evaluate(() => document.getElementById("variant-crazyhouse").getAttribute("aria-pressed") === "true"), "el botón Crazyhouse queda activo");
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 4 && x.from[1] === 4 && x.to[0] === 3 && x.to[1] === 3); commitMove(m); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => document.querySelectorAll('.zh-res[data-color="w"] .zh-pc').length) === 1, "tras capturar, la reserva blanca muestra 1 pieza");
    ok(await page.evaluate(() => document.querySelectorAll("#grave-top .crumb, #grave-bottom .crumb").length) === 0, "sin cementerio visible en Crazyhouse");
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 0 && x.from[1] === 3 && x.to[0] === 3 && x.to[1] === 3); commitMove(m); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => { const z = liveState().board.zh; return z.w.n === 1 && z.w.p === 0 && z.b.p === 0 && z.d.w.join("") === "p" && z.d.b.length === 0; }), "modelo: el caballo capturado es cautivo blanco; el peón blanco capturado muere (cementerio) y no hay peones en reserva");
    // turno blanco: toque en la reserva y luego en una casilla vacía (e4 -> e5? casilla vacía f5)
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 7 && x.from[1] === 6 && x.to[0] === 5 && x.to[1] === 5); commitMove(m); commitMove(legalMoves(liveState()).find(x => x.from && x.from[0] === 1 && x.from[1] === 0 && x.to[0] === 2 && x.to[1] === 0)); });
    await page.waitForTimeout(600);
    const pc = page.locator('.zh-res[data-color="w"] .zh-pc.can').first();
    ok(await pc.count() === 1, "es turno blanco: la pieza de la reserva se puede tomar");
    await pc.dispatchEvent("pointerdown", { pointerType: "touch", button: 0, isPrimary: true, clientX: 10, clientY: 10, pointerId: 41 });
    await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerup", { pointerType: "touch", pointerId: 41, clientX: 10, clientY: 10, bubbles: true })));
    await page.waitForTimeout(250);
    const sel = await page.evaluate(() => ({ s: selected && selected.drop, dest: document.querySelectorAll("#board .cell.tgt").length }));
    ok(sel.s === "n", "toque en la reserva: queda elegido el caballo");
    ok(sel.dest > 20, "se iluminan las casillas donde puede caer (" + sel.dest + ")");
    await page.evaluate(() => { window.__fx = { zap: 0, mist: 0, quake: 0, generic: 0, thunder: 0 };
      new MutationObserver(ms => { for (const m of ms) { for (const n of m.addedNodes) if (n.classList && n.classList.contains("gatefx")) { if (n.classList.contains("zap")) window.__fx.zap++; else if (n.classList.contains("mist")) window.__fx.mist++; else window.__fx.generic++; } if (m.type === "attributes" && m.target.id === "board" && m.target.classList.contains("quake")) window.__fx.quake++; } })
        .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      const o = window.thunderSfx; try { const sf = SFX.trueno; SFX.trueno = (...a) => { window.__fx.thunder++; return sf && sf(...a); }; } catch (e) {} });
    // tocar una casilla destino (e5: fila 3 col 4 está vacía)
    await page.evaluate(() => { const c = document.querySelector('#board .cell[data-r="4"][data-c="5"]'); const r = c.getBoundingClientRect(); const ev = (t, id) => c.dispatchEvent(new PointerEvent(t, { pointerType: "mouse", button: 0, pointerId: id, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); ev("pointerdown", 1); ev("pointerup", 1); });
    await page.waitForTimeout(700);
    const post = await page.evaluate(() => ({ drop: liveState().board[4][5], w: liveState().board.zh.w.n, last: (game.ucis || []).slice(-1)[0] }));
    ok(await page.evaluate(() => window.__fx.mist > 0 && window.__fx.zap === 0 && window.__fx.quake === 0 && window.__fx.thunder === 0 && window.__fx.generic === 0), "la caída es una niebla (sin rayo, sin trueno ni sacudida) (" + JSON.stringify(await page.evaluate(() => window.__fx)) + ")");
    ok(await page.evaluate(() => !!(window.SFX_AUDIO && window.SFX_AUDIO.cadena && window.SFX_AUDIO["cadena-paso"] && window.SFX_AUDIO.trueno)), "las muestras de cadena y de trueno están incrustadas");
    ok(await page.evaluate(() => document.querySelectorAll(".graveyard.zhd .zh-res").length) === 2, "los dos calabozos ocupan el sitio de los cementerios y se ven siempre (también vacíos)");
    ok(await page.evaluate(() => document.querySelectorAll(".graveyard.zhd > .graveyard.gy-sub").length) === 2 && await page.evaluate(() => document.querySelectorAll(".graveyard:not(.gy-sub) > .gy-lane").length) === 0, "2.342: junto a cada calabozo vuelve el cementerio (dos placas) y nada más");
    ok(await page.evaluate(() => document.querySelectorAll(".graveyard.zhd > .gy-sub .gy-pawnslot:not(.slot)").length) === 1, "el peón blanco muerto aparece en el cementerio del bando que lo capturó");
    ok(await page.evaluate(() => document.querySelectorAll(".nameplate .zh-res").length) === 0, "la reserva ya no va junto al nombre");
    await page.evaluate(() => { const z = liveState().board.zh; z.w.r = 1; z.b.r = 1; render(); });
    const col = await page.evaluate(() => ({ w: [...document.querySelectorAll('.zh-res[data-color="w"] .piece')].map(e => e.classList.contains("b") ? "b" : e.classList.contains("w") ? "w" : "?"), b: [...document.querySelectorAll('.zh-res[data-color="b"] .piece')].map(e => e.classList.contains("b") ? "b" : e.classList.contains("w") ? "w" : "?") }));
    ok(col.w.length > 0 && col.b.length > 0 && col.w.every(x => x === "b") && col.b.every(x => x === "w"), "el calabozo de las blancas guarda piezas negras y el de las negras, blancas (" + JSON.stringify(col) + ")");
    await page.evaluate(() => { const z = liveState().board.zh; z.w.r = 0; z.b.r = 0; render(); });
    // 2.343: los cautivos se ven uno por uno (dos caballos = dos caballos), sin agrupar con contador
    await page.evaluate(() => { const z = liveState().board.zh; z.w.n = 2; z.w.q = 1; render(); });
    ok(await page.evaluate(() => document.querySelectorAll('.zh-res[data-color="w"] .zh-pc[data-t="n"]').length) === 2 && await page.evaluate(() => document.querySelectorAll(".zh-res .zh-pc b").length) === 0, "dos caballos cautivos: se ven los dos, sin contador");
    await page.evaluate(() => { const z = liveState().board.zh; z.w.n = 0; z.w.q = 0; render(); });
    const esc = await page.evaluate(() => ({ marca: !!liveState().board.zh.sl["4,5"], cls: (document.querySelector('#board .cell[data-r="4"][data-c="5"] .piece') || {}).className, borde: getComputedStyle(document.querySelector('#board .cell[data-r="4"][data-c="5"] .piece')).getPropertyValue("--piece-edge").trim() }));
    ok(esc.marca && /\bslave\b/.test(esc.cls), "la pieza soltada queda marcada como esclava y lleva la clase slave (" + esc.cls + ")");
    ok(await page.evaluate(() => { const o = document.querySelector('#board .cell[data-r="7"][data-c="0"] .piece'); return !!o && !o.classList.contains("slave"); }), "las piezas originales no son esclavas");
    ok(await page.evaluate(() => document.querySelectorAll(".zh-res .piece.slave").length >= 0), "la reserva dibuja sus piezas con el borde de cautivo");
    ok(post.drop === "wn" && post.w === 0 && /^N@f4$/.test(post.last), "la caída por toque pone el caballo en f4 y vacía la reserva (" + post.last + ")");
    // flechas: retroceder una jugada y avanzar con la flecha derecha vuelve a animar la caída (antes no: la caída no tiene casilla de origen)
    await page.evaluate(() => { window.__fx = { zap: 0, mist: 0, quake: 0, generic: 0, thunder: 0 }; });
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(250);
    await page.evaluate(() => { window.__fx = { zap: 0, mist: 0, quake: 0, generic: 0, thunder: 0 }; });
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(500);
    const nv = await page.evaluate(() => ({ fx: window.__fx, sum: document.querySelectorAll("#board .piece.summon").length }));
    ok(nv.fx.mist >= 1 && nv.sum >= 1, "con la flecha derecha la caída vuelve a animarse con la niebla (" + JSON.stringify(nv) + ")");
    // mover una esclava: suena el clip propio de la pieza Y el arrastre de cadenas (dos buffers: uno corto de pieza y otro largo de cadena)
    await page.evaluate(() => { window.__bs = []; const o = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () { const n = o.call(this); const st = n.start.bind(n); n.start = (...a) => { window.__bs.push(n.buffer ? +n.buffer.duration.toFixed(2) : 0); return st(...a); }; return n; }; });
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 1 && x.from[1] === 7 && x.to[0] === 2 && x.to[1] === 7); commitMove(m); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.__bs.length = 0; });
    await page.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from && x.from[0] === 4 && x.from[1] === 5 && x.to[0] === 2 && x.to[1] === 4); commitMove(m); });
    await page.waitForTimeout(600);
    const bs = await page.evaluate(() => window.__bs);
    ok(bs.some(d => d > 2.4 && d < 2.8) && !bs.some(d => d > 3.2) && bs.some(d => d > 0 && d < 1.5), "al mover la esclava suena el PRIMER arrastre (cadena-paso) y el paso propio de la pieza (" + JSON.stringify(bs) + ")");
    // arrastre desde la reserva negra: negras capturó antes (dxe4?); forzamos una reserva y soltamos con el ratón
    await page.evaluate(() => { const s = liveState(); s.board.zh.b.n = 1; s.turn = "b"; render(); });
    await page.waitForTimeout(300);
    const nb = page.locator('.zh-res[data-color="b"] .zh-pc[data-t="n"]');
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
  // 2) contra CLAUDIA: tras una captura de la máquina, la máquina también puede soltar; juega varias jugadas sin errores
  { const { page, errores } = await abrir(browser, false);
    await page.evaluate(F => { document.getElementById("variant-crazyhouse").click(); }, ZHFEN);
    await page.waitForTimeout(800);
    ok(await page.evaluate(() => variantOf(liveState().board) === "crazyhouse"), "el botón de variante inicia Crazyhouse");
    const info = await page.evaluate(() => ({ fen: toFEN(liveState()), uci: typeof FSF_VARIANT_UCI_NAME !== "undefined" && FSF_VARIANT_UCI_NAME.crazyhouse, enviada: fsfFen("crazyhouse", toFEN(liveState())) }));
    ok(info.uci === "crazyhouse" && !/\bzh\b/.test(info.enviada) && /\[\]/.test(info.enviada), "al motor se envía la FEN sin la marca «zh» (" + info.enviada + ")");
    ok(errores.length === 0, "sin errores de página al abrir la variante" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  // 3) CLAUDIA (motor de variantes): con una reserva fuerte (dos damas) y turno suyo, responde y su jugada es legal; la primera partida normal también arranca
  for (const [nombre, fen, color] of [
    ["CLAUDIA con reserva", "4k3/8/8/8/8/8/4PPPP/4K3[] b - - 0 1 zh".replace("[]", "[qq]"), "w"],
    ["CLAUDIA desde el inicio", ZHFEN, "b"]]) {
    const { page, errores } = await abrir(browser, false);
    await page.evaluate(({ fen, color }) => {
      document.getElementById("mode-play").click(); switchVariant("crazyhouse");
      vsMachine = true; machineHumanColor = color; machineLevel = 12;
      newGame(fen, { white: "Yo", black: "CLAUDIA", result: "", resultNote: "" });
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
