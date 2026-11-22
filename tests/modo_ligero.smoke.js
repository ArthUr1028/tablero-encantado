// 2.354 · Modo ligero: un solo interruptor que apaga el ambiente, el vuelo de piezas y los efectos de entrada/captura sin cambiar la partida.
// Uso: node tests/modo_ligero.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
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

(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const b = await chromium.launch();
  const nueva = async (lite) => {
    const page = await b.newPage({ viewport: { width: 700, height: 900 } });
    page.errs = []; page.on("pageerror", e => page.errs.push(String(e).slice(0, 160)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(l => { window.__noBattleIntro = true; if (l) localStorage.setItem("tablero-encantado.lite", "1"); }, lite);
    await page.goto(url); await page.waitForTimeout(2200);
    await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } document.documentElement.classList.remove("intro-abierta"); });
    return page;
  };

  console.log("Interruptor y persistencia");
  let p = await nueva(false);
  ok(await p.evaluate(() => !LITE.isOn() && !document.documentElement.classList.contains("lite")), "apagado de origen");
  const r1 = await p.evaluate(() => { document.getElementById("lite-toggle").click(); return { on: LITE.isOn(), cls: document.documentElement.classList.contains("lite"), amb: document.body.classList.contains("amb-off"), pressed: document.getElementById("lite-toggle").getAttribute("aria-pressed"), sfxDis: document.getElementById("aj-lite-sfx").disabled, sfx: document.getElementById("aj-lite-sfx").checked, saved: localStorage.getItem("tablero-encantado.lite") }; });
  ok(r1.on && r1.cls && r1.amb && r1.pressed === "true" && r1.saved === "1", "el botón lo enciende: html.lite, ambiente apagado y se recuerda");
  ok(!r1.sfxDis && r1.sfx, "«conservar el sonido de los efectos» queda disponible y activado de origen");
  const r2 = await p.evaluate(() => { const c = document.getElementById("aj-lite-sfx"); c.checked = false; c.dispatchEvent(new Event("change")); return { sfx: LITE.sfx(), sonido: LITE.sonido(), saved: localStorage.getItem("tablero-encantado.lite.sfx") }; });
  ok(!r2.sfx && !r2.sonido && r2.saved === "0", "sin conservar el sonido, los efectos suprimidos callan y se recuerda");
  await p.evaluate(() => document.getElementById("lite-toggle").click());
  ok(await p.evaluate(() => !LITE.isOn() && !document.documentElement.classList.contains("lite") && LITE.sonido()), "apagarlo devuelve todo (y el sonido de los efectos vuelve a valer)");
  ok(p.errs.length === 0, "sin errores de JS (" + p.errs.join("|") + ")"); await p.close();

  console.log("Sin animaciones vivas en reposo");
  for (const tema of ["tierra", "fuego", "agua", "aire", "metal"]) {
    p = await nueva(true);
    await p.evaluate(t => { document.documentElement.setAttribute("data-theme", t); }, tema); await p.waitForTimeout(900);
    const n = await p.evaluate(() => document.getAnimations().length);
    ok(n === 0, "tema " + tema + ": 0 animaciones vivas (hay " + n + ")"); await p.close();
  }

  console.log("Efectos suprimidos en la partida");
  p = await nueva(true);
  const e = await p.evaluate(() => {
    setMode("play"); newGame("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { white: "Yo", black: "Rival", result: "", resultNote: "" });
    vsMachine = false; matchStarted = true; matchPaused = false; flipped = false; render();
    const m = legalMoves(liveState()).find(x => x.from[0] === 6 && x.from[1] === 4 && x.to[0] === 4 && x.to[1] === 4);
    commitMove(m);
    const sl = boardEl.querySelectorAll(".piece.slide, .piece[data-fly], .piece.mv-step, .piece.mv-glide, .piece.mv-leap").length;
    return { sl, fly: document.querySelectorAll(".fly-layer").length, quake: boardEl.classList.contains("quake") };
  });
  ok(e.sl === 0 && e.fly === 0, "la pieza cambia de casilla al instante (sin vuelo ni clases de movimiento)");
  const c = await p.evaluate(() => {
    boardQuake(0); spawnCrumble(0, 0, 8, "bq"); spawnSummon(0, 0, 8, .1, "zap"); spawnSummon(0, 0, 8, .1, "mist");
    return new Promise(r => setTimeout(() => r({ quake: boardEl.classList.contains("quake"), crumb: document.querySelectorAll(".crumb").length, gatefx: document.querySelectorAll(".gatefx").length }), 120));
  });
  ok(!c.quake && c.crumb === 0 && c.gatefx === 0, "sin sacudida, sin rotura de pieza y sin rayo/niebla de invocación");
  const d = await p.evaluate(() => {
    setMode("play"); newGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1", { white: "Yo", black: "Rival", result: "", resultNote: "" });
    vsMachine = false; matchStarted = true; matchPaused = false; render();
    const m = legalMoves(liveState()).find(x => x.promo === "q"); if (!m) return { sinJugada: true };
    commitMove(m);
    return { zap: document.querySelectorAll(".piece.summon, .gatefx").length, coronada: !!boardEl.querySelector(".piece.w") };
  });
  ok(!d.sinJugada && d.zap === 0, "la coronación ocurre sin rayo (la pieza aparece coronada y quieta)");
  ok(p.errs.length === 0, "sin errores de JS (" + p.errs.join("|") + ")"); await p.close();

  console.log("Música y diseño sobrio");
  p = await nueva(false);
  const m = await p.evaluate(() => { SFX.setMusicOn(true); document.getElementById("lite-toggle").click(); return { musica: SFX.musicOn() }; });
  ok(m.musica === false, "al encender el modo ligero la música se apaga");
  const s = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); const cell = document.querySelector("#board .cell.lgt"); return { claro: cs.getPropertyValue("--sq-light").trim(), oscuro: cs.getPropertyValue("--sq-dark").trim(), bg: cell ? getComputedStyle(cell).backgroundImage : "?" }; });
  ok(s.claro === "#d4d4d4" && s.oscuro === "#6b6b6b" && s.bg === "none", "tablero de dos grises planos");
  await p.close();

  console.log("Dark Chess: niebla estática");
  p = await nueva(true);
  await p.evaluate(() => {
    document.getElementById("mode-play").click(); switchVariant("dark");
    vsMachine = true; machineHumanColor = "w"; machineLevel = 1;
    newGame(DARK_START, { white: "Yo", black: "claudIA", result: "", resultNote: "" });
    matchStarted = true; matchPaused = false; render(); maybeMachineMove();
  });
  await p.waitForTimeout(800);
  await p.evaluate(() => { const m = legalMoves(liveState()).find(x => x.from[0] === 6 && x.from[1] === 4 && x.to[0] === 4 && x.to[1] === 4); commitMove(m); });
  try { await p.waitForFunction(() => game.sans.length >= 2, null, { timeout: 25000 }); } catch (e) {}
  await p.waitForTimeout(1500);
  const f = await p.evaluate(() => ({ niebla: document.querySelectorAll("#board .cell.fog").length, capas: document.querySelectorAll("#board > .fog-haze, #board > .fog-body, #board > .fog-mist").length,
    anims: document.getAnimations().length, quien: document.getAnimations().map(a => (a.animationName || a.transitionProperty || '?') + '@' + (a.effect && a.effect.target ? (a.effect.target.id || String(a.effect.target.className).slice(0, 40)) : '')).join(','), fx: document.querySelectorAll("#board .cell.fog-lift, #board .cell.fog-fall, #board .piece.emerge, #board .piece.ghost-out, .fly-layer").length, jugadas: game.sans.length }));
  ok(f.jugadas >= 2, "la partida Dark sigue su curso (" + f.jugadas + " jugadas)");
  ok(f.niebla > 0 && f.capas > 0, "la niebla oculta las mismas casillas y sigue ahí (" + f.niebla + " casillas, " + f.capas + " capas)");
  ok(f.anims === 0 && f.fx === 0, "pero quieta: 0 animaciones vivas y sin efectos de aparecer/desvanecer (" + f.anims + " / " + f.fx + ") " + f.quien);
  ok(p.errs.length === 0, "sin errores de JS (" + p.errs.join("|") + ")"); await p.close();

  await b.close(); srv.close();
  console.log(fallos ? "\nFALLAS: " + fallos : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})();
