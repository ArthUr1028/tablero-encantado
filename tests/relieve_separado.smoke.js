// 2.345 · Paneles siempre en 3D; «Relieve» solo piezas; «Textura del tablero» independiente; negras de Tierra y Metal distintas.
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
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 700, height: 1000 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try { localStorage.clear(); } catch (e) {} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" }); await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); await page.waitForTimeout(300);
  const S = () => page.evaluate(() => {
    setMode("play"); newGame("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", { white: "Yo", black: "Rival", result: "", resultNote: "" }); render();
    const p = document.querySelector(".panel"), c = document.querySelector("#board .cell.lgt"), n = document.querySelector("#board .piece.b");
    return { ui: document.body.classList.contains("ui3d"), pnl: /inset/.test(getComputedStyle(p).boxShadow) && getComputedStyle(p).boxShadow.includes("0px 3px 0px"),
      tex: /url\(/.test(getComputedStyle(c, "::before").backgroundImage), pie: /relieve-pieza/.test(getComputedStyle(n).filter),
      bp: document.getElementById("relieve-toggle").getAttribute("aria-pressed"), bt: document.getElementById("tablero3d-toggle").getAttribute("aria-pressed") };
  });
  let r = await S(); ok(r.ui && r.pnl, "paneles en 3D con ambos interruptores apagados"); ok(!r.pie && !r.tex, "piezas y tablero planos por defecto");
  await page.evaluate(() => document.getElementById("relieve-toggle").click()); r = await S();
  ok(r.pie && !r.tex && r.pnl && r.bp === "true" && r.bt === "false", "relieve: solo las piezas");
  await page.evaluate(() => document.getElementById("relieve-toggle").click()); await page.evaluate(() => document.getElementById("tablero3d-toggle").click()); r = await S();
  ok(!r.pie && r.tex && r.pnl && r.bt === "true", "textura: solo el tablero");
  const col = await page.evaluate(() => { const o = {}; for (const t of ["tierra", "metal"]) { document.documentElement.setAttribute("data-theme", t); const s = getComputedStyle(document.documentElement); o[t] = [s.getPropertyValue("--basalt").trim(), s.getPropertyValue("--basalt-edge").trim()]; } return o; });
  ok(col.tierra.join() !== col.metal.join(), "negras distintas Tierra " + col.tierra + " / Metal " + col.metal);
  for (const t of ["tierra", "metal"]) { await page.evaluate(t => { document.documentElement.setAttribute("data-theme", t); document.body.classList.add("relieve"); }, t); await page.locator("#board").screenshot({ path: "/tmp/neg_" + t + ".png" }); }
  ok(errores.length === 0, "sin errores de página " + errores.join("|"));
  await browser.close(); srv.close(); console.log(fallos ? "FALLOS: " + fallos : "TODO OK"); process.exit(fallos ? 1 : 0);
})();
