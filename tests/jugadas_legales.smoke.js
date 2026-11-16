// 2.340 · Interruptor «Mostrar jugadas legales» (La Armería): apagado, tocar una pieza solo marca la casilla elegida (sin destinos),
// jugar sigue funcionando y las jugadas ilegales se rechazan; se recuerda tras recargar. node tests/jugadas_legales.smoke.js
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
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1100 } });
  const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; });
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1500);
  const q = async f => page.evaluate(f);
  await q(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } setMode("play"); newGame(START, {}); vsMachine = false; matchStarted = true; matchPaused = false; render(); });
  const cell = (r, c) => `#board .cell[data-r="${r}"][data-c="${c}"]`;
  const toca = (r, c) => page.evaluate(([r, c]) => { const el = document.querySelector('#board .cell[data-r="' + r + '"][data-c="' + c + '"]'); const b = el.getBoundingClientRect(); const ev = (t, id) => el.dispatchEvent(new PointerEvent(t, { pointerType: "mouse", button: 0, pointerId: id, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2, bubbles: true })); ev("pointerdown", 1); ev("pointerup", 1); }, [r, c]);
  const cuenta = () => page.evaluate(() => ({ tgt: document.querySelectorAll("#board .cell.tgt").length, sel: document.querySelectorAll("#board .cell.sel").length }));
  ok(await q(() => document.getElementById("legales-toggle").getAttribute("aria-pressed")) === "true", "de origen está activado");
  await page.click(cell(6, 4)); let c = await cuenta();   // peón de e2
  ok(c.tgt === 2 && c.sel === 1, "activado: el peón de e2 muestra 2 destinos y su casilla (" + JSON.stringify(c) + ")");
  await page.evaluate(() => { selected = null; render(); });
  await page.evaluate(() => document.getElementById("legales-toggle").click());
  ok(await q(() => document.getElementById("legales-toggle").getAttribute("aria-pressed")) === "false", "al pulsarlo queda apagado");
  await toca(6, 4); c = await cuenta();
  ok(c.tgt === 0 && c.sel === 1, "apagado: sin destinos marcados, pero la casilla elegida sí (" + JSON.stringify(c) + ")");
  await toca(4, 4); await page.waitForTimeout(700);   // e4 sigue funcionando
  ok(await q(() => game.sans.join(" ")) === "e4", "apagado: la jugada e2-e4 se hace igual");
  await toca(1, 4); await page.waitForTimeout(300);   // negras: e7 (turno de negras en pantalla de dos jugadores)
  await toca(5, 4); await page.waitForTimeout(300);   // ilegal: e7 al centro de la nada (no es un destino del peón negro)
  ok(await q(() => game.sans.length) === 1, "apagado: una jugada ilegal se rechaza (" + (await q(() => game.sans.join(" "))) + ")");
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1500);
  ok(await q(() => document.getElementById("legales-toggle").getAttribute("aria-pressed")) === "false" && await q(() => showLegalMoves) === false, "tras recargar sigue apagado (recordado)");
  await page.evaluate(() => document.getElementById("legales-toggle").click());
  await q(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } setMode("play"); newGame(START, {}); vsMachine = false; matchStarted = true; matchPaused = false; selected = null; render(); });
  await toca(7, 1); c = await cuenta();   // caballo b1 (si la partida continuó, sigue en su casilla)
  ok(c.tgt >= 2, "al volver a activarlo reaparecen los destinos (" + JSON.stringify(c) + ")");
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores.slice(0, 3).join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? fallos + " fallos" : "Todo bien"); process.exit(fallos ? 1 : 0);
})();
