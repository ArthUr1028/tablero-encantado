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
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores.slice(0, 2).join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
