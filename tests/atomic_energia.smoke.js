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
// Atomic (2.401): la pieza tocada suena a energía; se apaga al soltar, cambiar o mover; el rey y el sonido apagado callan.
// Uso: node tests/atomic_energia.smoke.js
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const { page, errores } = await abrir(browser, false);
  await page.evaluate(() => {
    const P = AudioContext.prototype, crear = P.createBufferSource; window.__log = [];
    P.createBufferSource = function(){ const s = crear.call(this), ini = s.start, fin = s.stop;
      s.start = function(...a){ if(s.buffer && Math.abs(s.buffer.duration - 1.6) < .06){ s.__e = 1; __log.push("suena " + s.playbackRate.value.toFixed(3)); } return ini.apply(s, a); };
      s.stop = function(...a){ if(s.__e) __log.push("corta"); return fin.apply(s, a); }; return s; };
    document.getElementById("mode-play").click(); switchVariant("atomic"); vsMachine = false; matchStarted = true; matchPaused = false; render();
  });
  await page.mouse.click(5, 5); await page.waitForTimeout(600);
  const toca = async (r, c) => { await page.evaluate(() => __log.length = 0); await page.locator(`#board .cell[data-r="${r}"][data-c="${c}"]`).click(); await page.waitForTimeout(350); return page.evaluate(() => __log.slice()); };
  let l = await toca(7, 6); ok(l.length === 1 && /^suena/.test(l[0]), "tocar el caballo suena una vez " + l);
  l = await page.evaluate(() => { __log.length = 0; render(); render(); return __log.slice(); }); await page.waitForTimeout(200);
  ok(l.length === 0, "redibujar con la misma pieza tocada no repite ni corta " + l);
  l = await toca(7, 1); ok(l[0] === "corta" && /^suena/.test(l[1]) && l.length === 2, "cambiar de pieza corta y arranca la nueva " + l);
  l = await toca(7, 1); ok(l.join() === "corta", "soltar la pieza la apaga " + l);
  l = await toca(7, 1); ok(l.length === 1 && /^suena/.test(l[0]), "volver a tocarla suena de nuevo " + l);
  l = await toca(5, 2); ok(l.join() === "corta", "al mover se apaga " + l);
  await page.evaluate(() => { newGame("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1 atomic", { white: "Yo", black: "Rival", result: "", resultNote: "" }); vsMachine = false; matchStarted = true; matchPaused = false; render(); });
  l = await toca(7, 4); ok(l.length === 0, "el rey no suena " + l);
  await page.evaluate(() => { SFX.toggle(); }); l = await toca(6, 4); ok(l.length === 0, "con Sonido apagado no suena " + l);
  ok(errores.length === 0, "sin errores de página " + errores.join("|"));
  await browser.close(); srv.close(); console.log(fallos ? "FALLOS: " + fallos : "TODO OK"); process.exit(fallos ? 1 : 0);
})();
