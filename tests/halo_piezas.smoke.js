// 2.315 · Todas las piezas (menos el shatranj) llevan el halo de contraste del caballo de La Senda, con y sin relieve.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
const LEE = (fen) => { setMode("play"); newGame(fen, { white: "Yo", black: "Rival", result: "", resultNote: "" }); render();
  const f = sel => [...document.querySelectorAll(sel)].map(e => getComputedStyle(e).filter);
  return { w: f("#board .piece.w"), b: f("#board .piece.b"), rel: document.body.classList.contains("relieve") }; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 700, height: 1000 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try { localStorage.clear(); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" }); await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await page.waitForTimeout(300);
  const CAS = { "clásico": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "Capablanca": "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1",
    "Amazonas": "rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1", "Seirawan": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1" };
  const BL = /drop-shadow\(rgba\(0, 0, 0, 0\.85\)/, NG = /drop-shadow\(rgba\(255, 255, 255, 0\.7\)/;
  for (const relieve of [false, true]) {
    await page.evaluate(r => document.body.classList.toggle("relieve", r), relieve);
    for (const [n, fen] of Object.entries(CAS)) {
      const r = await page.evaluate(LEE, fen);
      ok(r.w.length > 0 && r.w.every(f => BL.test(f)), n + (relieve ? " + relieve" : "") + ": toda pieza blanca lleva el halo oscuro (" + r.w.length + ")");
      ok(r.b.length > 0 && r.b.every(f => NG.test(f)), n + (relieve ? " + relieve" : "") + ": toda pieza negra lleva el halo claro (" + r.b.length + ")");
      if (relieve && n === "clásico") ok(r.w.every(f => /url/.test(f)) && r.b.every(f => /url/.test(f)), "el relieve sigue activo junto al halo (filtro: " + r.w[0].slice(0, 60) + ")");
    }
    const sh = await page.evaluate(LEE, "rnlsflnr/pppppppp/8/8/8/8/PPPPPPPP/RNLSFLNR w - - 0 1");
    ok(sh.w.length > 0 && sh.w.every(f => !BL.test(f)) && sh.b.every(f => !NG.test(f)), "shatranj" + (relieve ? " + relieve" : "") + ": sin el halo (" + sh.w.length + " blancas, " + sh.b.length + " negras)");
  }
  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close(); console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
