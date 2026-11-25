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
// Atomic en el Reto de claudIA (2.388): está en la tabla del Reto, su partida empieza desde la posición de Atomic y el reto se cierra solo
// cuando explota un rey (victoria si explota el de claudIA, derrota si explota el tuyo).
// Uso: node tests/atomic_reto.smoke.js
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  { const { page, errores } = await abrir(browser, false);
    const t = await page.evaluate(() => ({ lv: RETO_TABLE.atomic && RETO_TABLE.atomic.level, label: RETO_TABLE.atomic && RETO_TABLE.atomic.label, campo: !!RETO_FIELD.atomic, nivel: retoLevelFor("atomic", "w") }));
    ok(t.label === "Atomic" && t.lv > 0 && t.nivel === t.lv && t.campo, "Atomic figura en la tabla del Reto, con su nivel y su frase (" + JSON.stringify(t) + ")");
    ok(await page.evaluate(() => { switchVariant("atomic"); return game.startFEN === VARIANT_START.atomic; }), "al empezar el reto en Atomic la partida arranca en la posición de Atomic (así se reanuda tras cerrar)");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }
  for (const caso of [
    { nombre: "victoria: explota el rey de claudIA", fen: "4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1 atomic", color: "w", cap: [1, 3] },
    { nombre: "derrota: explota tu rey", fen: "3qk3/8/8/8/8/8/3P4/3QK3 b - - 0 1 atomic", color: "w", cap: [6, 3] } ]) {
    const { page, errores } = await abrir(browser, false);
    const r = await page.evaluate(c => {
      document.getElementById("mode-play").click(); switchVariant("atomic");
      const avisos = []; const f = window.showGlobalToast; window.showGlobalToast = (t) => { avisos.push(String(t).slice(0, 40)); };
      newGame(c.fen, { white: "Yo", black: "CLAUDIA", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false;
      retoActive = { variant: "atomic", level: retoLevelFor("atomic", c.color), color: c.color, ended: false };
      render();
      const mv = legalMoves(liveState()).find(m => m.capture && m.to[0] === c.cap[0] && m.to[1] === c.cap[1]); if(!mv) return { err: "sin la captura" };
      commitMove(mv); return { cerrado: retoActive === null, avisos };
    }, caso);
    ok(!r.err && r.cerrado, caso.nombre + " cierra el reto (" + JSON.stringify(r) + ")");
    ok(errores.length === 0, "sin errores de página");
    await page.context().close(); }
  // 2.389 · la partida del Reto: 1.Cf3 Cc6?? 2.Cg5 (mate en 3 para las blancas, confirmado con el motor a fuerza completa). claudIA, con la verificación, no debe caer.
  { const { page, errores } = await abrir(browser, false);
    const r = await page.evaluate(async () => {
      document.getElementById("mode-play").click(); switchVariant("atomic");
      newGame(ATOMIC_START, { white: "Yo", black: "CLAUDIA", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render();
      const mv0 = legalMoves(liveState()).find(x => uciOf(x, false) === "g1f3"); commitMove(mv0);
      const fen = toFEN(liveState()), out = { fen, juega: [], ms: [] };
      for(let i = 0; i < 6; i++){
        newGame(fen, { white: "Yo", black: "CLAUDIA", result: "", resultNote: "" }); vsMachine = true; machineHumanColor = "w"; machineLevel = 15; matchStarted = true; matchPaused = false; render();
        const t1 = Date.now(); maybeMachineMove();
        while((!game.ucis || game.ucis.length < 1) && Date.now() - t1 < 45000) await new Promise(r => setTimeout(r, 150));
        out.juega.push((game.ucis || [])[0] || null); out.ms.push(Date.now() - t1); vsMachine = false;
      }
      return out;
    });
    console.log("       jugadas de claudIA (negras, nivel 15) tras 1.Cf3: " + r.juega.join(" ") + "  (ms: " + r.ms.join(", ") + ")");
    ok(r.juega.every(u => !!u), "claudIA siempre juega (no se queda parada con la verificación)");
    ok(!r.juega.includes("b8c6"), "claudIA no cae en 1...Cc6?? (mate en 3)");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close(); }
  await browser.close(); srv.close();
  console.log(fallos ? "\nHay " + fallos + " fallos" : "\nTodo en orden"); process.exit(fallos ? 1 : 0);
})();
