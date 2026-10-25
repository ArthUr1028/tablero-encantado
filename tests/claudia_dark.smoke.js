// Prueba de humo: claudIA juega Dark Chess (2.141) en un navegador real con el motor real.
// Caso clave: posición donde las negras (claudIA) están en «jaque mate» por las reglas del ajedrez, pero en Dark no existe el jaque:
// la partida sigue y claudIA debe mover (antes, el motor clásico contestaba «(none)» y se quedaba parada con el reloj corriendo).
// Uso: node tests/claudia_dark.smoke.js [carpeta-del-tablero]   (necesita playwright-core y un Chromium; busca /opt/node-tools)
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

const CASOS = [
  { nombre: "mate «de ajedrez» sobre claudIA (negras): en Dark debe mover igual", color: "w", nivel: 15,
    fen: "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4 dark" },
  { nombre: "ahogado «de ajedrez» sobre claudIA: en Dark debe mover igual", color: "w", nivel: 15,
    fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1 dark" },
  // Si la variante darkchess no se registrara en el motor, éste jugaría ajedrez normal y NO capturaría al rey: esta prueba lo delata.
  { nombre: "el rey de claudIA puede capturar al rey rival: lo captura (intento 1)", color: "w", nivel: 15, fen: "8/8/8/8/8/3k4/4K3/8 b - - 0 1 dark", espera: "capturaRey" },
  { nombre: "el rey de claudIA puede capturar al rey rival: lo captura (intento 2)", color: "w", nivel: 15, fen: "8/8/8/8/8/3k4/4K3/8 b - - 0 1 dark", espera: "capturaRey" },
  { nombre: "torre blanca de claudIA captura al rey (ignorando que su rey está en jaque)", color: "b", nivel: 15, fen: "4k3/8/8/8/8/8/4R3/q3K3 w - - 0 1 dark", espera: "capturaRey" },
  { nombre: "partida normal: le toca a claudIA (blancas del humano ya movieron e4)", color: "w", nivel: 5,
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1 dark" },
];

(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const errores = [];
  for (const c of CASOS) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.evaluate(({ fen, color, nivel }) => {
      document.getElementById("mode-play").click();   // el Tablero abre siempre en Modo Libre
      switchVariant("dark");
      vsMachine = true; machineHumanColor = color; machineLevel = nivel;
      newGame(fen, { white: "Yo", black: "claudIA", result: "", resultNote: "" });
      matchStarted = true; matchPaused = false;
      render(); maybeMachineMove();
    }, c);
    let movio = true;
    try { await page.waitForFunction(() => game.sans.length >= 1, null, { timeout: 25000 }); } catch (e) { movio = false; }
    const est = await page.evaluate(() => ({ n: game.sans.length, san: game.sans[0], pensando: machineThinking, turno: liveState().turn, result: game.result, oc: outcome(liveState()) }));
    ok(movio, c.nombre + " → " + (movio ? "claudIA jugó " + est.san : "se quedó parada (pensando=" + est.pensando + ")"));
    if (c.espera === "capturaRey" && movio) ok(/x/.test(est.san || "") && (est.result || est.oc !== "normal"), "capturó al rey (" + est.san + ", resultado " + (est.result || est.oc) + ")");
    await page.close();
  }

  // --- 2.142: claudIA a ciegas. Se registra cada posición que recibe el motor y se compara con el tablero real. ---
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => {
      window.__noBattleIntro = true; window.__fens = [];
      const orig = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m) { if (typeof m === "string" && m.indexOf("position fen") === 0) window.__fens.push(m.slice(13)); return orig.apply(this, arguments); };
    });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      document.getElementById("mode-play").click();
      switchVariant("dark");
    });
    // el botón de claudIA debe estar disponible en Dark y elegirla debe funcionar desde la interfaz
    const ui = await page.evaluate(() => {
      const b = document.getElementById("rival-maquina"); const habilitado = !b.disabled; b.click();
      machineHumanColor = "w"; machineLevel = 15;
      matchStarted = true; matchPaused = false; render();
      return { habilitado, activa: vsMachine, variante: variantOf(liveState().board) };
    });
    ok(ui.habilitado && ui.activa && ui.variante === "dark", "en Dark se puede elegir a claudIA desde la interfaz (botón habilitado: " + ui.habilitado + ", activa: " + ui.activa + ")");
    const ui2 = await page.evaluate(() => { switchVariant("clasico"); switchVariant("dark"); return vsMachine; });
    ok(ui2 === true, "cambiar de variante y volver a Dark conserva a claudIA como rival");
    await page.evaluate(() => { machineHumanColor = "w"; machineLevel = 15; matchStarted = true; matchPaused = false; render(); });
    const jugadasHumano = ["e2e4", "g1f3", "f1c4", "b1c3"];
    let todasMovio = true, tardoMax = 0;
    for (const u of jugadasHumano) {
      const n0 = await page.evaluate(() => game.sans.length);
      await page.evaluate(u => { commitMove(matchUci(liveState(), u)); }, u);
      const t0 = Date.now();
      let movio = true;
      try { await page.waitForFunction(n => game.sans.length >= n + 2, n0, { timeout: 30000 }); } catch (e) { movio = false; }
      tardoMax = Math.max(tardoMax, Date.now() - t0);
      if (!movio) { todasMovio = false; break; }
    }
    ok(todasMovio, "claudIA contestó las 4 jugadas seguidas sin trabarse (la más lenta tardó " + (tardoMax / 1000).toFixed(1) + " s)");
    const r = await page.evaluate(() => {
      const me = "b", real = dkbObs(liveState(), me);
      const fens = Array.from(new Set(window.__fens));
      let consistentes = 0, distintasDelReal = 0;
      const realPlacement = toFEN(liveState()).split(" ")[0];
      for (const f of fens) {
        const pos = parseFEN(f + " dark");
        if (dkbObs(pos, me) !== dkbObs(liveState(), me) && false) continue;
        consistentes++;
        if (toFEN(pos).split(" ")[0] !== realPlacement) distintasDelReal++;
      }
      // las posiciones enviadas en la ÚLTIMA consulta deben ser compatibles con lo que ve claudIA justo antes de mover
      const ult = window.__fens.slice(-16);
      return { total: window.__fens.length, distintas: fens.length, ult: ult.length, consistentes, distintasDelReal, realPlacement };
    });
    ok(r.total > 4, "el motor recibió varias consultas (" + r.total + ")");
    ok(r.distintas > 4, "claudIA consultó posiciones distintas, no una sola (" + r.distintas + " posiciones distintas)");
    // la última consulta: ¿alguna posición enviada coincide en la zona oculta con el tablero real? Lo normal es que casi ninguna.
    const r2 = await page.evaluate(() => {
      const n = game.sans.length;   // tras la última respuesta de claudIA, la consulta fue sobre el estado anterior a su jugada
      const antes = game.states[n - 1], me = "b";
      const ult = window.__fens.slice(-16).filter((v, i, a) => a.indexOf(v) === i);
      const obsReal = dkbObs(antes, me), placement = toFEN(antes).split(" ")[0];
      let compat = 0, iguales = 0;
      for (const f of ult) { const q = parseFEN(f + " dark"); if (dkbObs(q, me) === obsReal) compat++; if (toFEN(q).split(" ")[0] === placement) iguales++; }
      return { consultadas: ult.length, compat, iguales };
    });
    ok(r2.consultadas > 1 && r2.compat === r2.consultadas, "todas las posiciones consultadas son compatibles con lo que ve claudIA (" + r2.compat + "/" + r2.consultadas + ")");
    ok(r2.iguales < r2.consultadas, "no consultó solo el tablero real: " + r2.iguales + " de " + r2.consultadas + " posiciones coinciden con el real");
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores.slice(0, 2).join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
