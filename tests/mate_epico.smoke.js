// 2.397 · La escena del jaque mate: cuándo aparece, cuándo no, cómo se salta y su versión quieta.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "application/javascript" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  const errores = [];
  async function abre(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opts || {}));
    const page = await ctx.newPage(); page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));   // cierra la entrada de verdad (suelta su teclado)
      const intro = document.getElementById("intro"); if (intro) intro.remove(); document.documentElement.classList.remove("intro-abierta");
      setMode("play"); switchVariant("clasico");
      window.__carga = sans => { applySanList(START, sans, { white: "Yo", black: "Local", result: "", resultNote: "" }); game.cursor = sans.length - 1; animFrom = null; persist(); render(); };
      window.__mate = ["f3", "e5", "g4", "Qh4#"];
    });
    return page;
  }
  const estado = p => p.evaluate(() => { const e = document.getElementById("mate-fx"); return e ? { cls: e.className, t: e.querySelector("strong").textContent, s: e.querySelector("em").textContent, rey: document.querySelectorAll(".cell.mate-king").length } : null; });
  let page = await abre();
  await page.evaluate(() => { __carga(__mate); game.cursor = 4; render(); });
  await page.waitForTimeout(300);
  ok(!(await estado(page)), "cargar una partida ya en mate no dispara la escena");
  await page.evaluate(() => { __carga(__mate); });
  await page.waitForTimeout(500);
  await page.evaluate(() => stepForward());
  await page.waitForTimeout(250);
  let r = await estado(page);
  ok(r && r.t === "Jaque mate" && r.s === "Ganan las negras" && r.rey === 1, "al reproducir la jugada del mate aparece la escena: " + JSON.stringify(r));
  r = await page.evaluate(() => [...document.getElementById("mate-fx").children].map(e => e.className));
  ok(r.join() === "mfx-dark,mfx-title,mfx-skip", "solo hay penumbra, leyenda y la indicación de toque: " + r);
  await page.screenshot({ path: "/tmp/mate-0.png" });
  await page.waitForTimeout(950); await page.screenshot({ path: "/tmp/mate-1.png" });
  await page.waitForTimeout(1900); await page.screenshot({ path: "/tmp/mate-2.png" });
  await page.waitForTimeout(4200);
  ok(!(await estado(page)), "se retira sola");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(400);
  await page.mouse.click(200, 300); await page.waitForTimeout(950);
  ok(!(await estado(page)), "un toque la salta");
  r = await page.evaluate(() => game.cursor);
  ok(r === 4, "el toque no mueve nada en el tablero");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(400);
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(950);
  ok(!(await estado(page)) && (await page.evaluate(() => game.cursor)) === 4, "una tecla la salta sin retroceder");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => { stepForward(); showGlobalToast("AVISO-PRUEBA"); }); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.body.innerText.includes("AVISO-PRUEBA"))), "los avisos esperan durante la escena");
  await page.evaluate(() => MATE.end(false)); await page.waitForTimeout(950);
  ok(await page.evaluate(() => document.body.textContent.includes("AVISO-PRUEBA")), "y salen al terminar");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  await page.evaluate(() => stepBack()); await page.waitForTimeout(100);
  ok(!(await estado(page)), "si se retrocede la jugada, desaparece");
  // jaque sin mate
  await page.evaluate(() => { __carga(["e4", "f5", "Qh5+"]); }); await page.waitForTimeout(300);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  ok(!(await estado(page)), "un jaque simple no la dispara");
  await page.context().close();
  page = await abre({ reducedMotion: "reduce" });
  await page.evaluate(() => { __carga(__mate); }); await page.waitForTimeout(400);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  r = await estado(page);
  ok(r && r.cls === "quieto", "con «reducir movimiento» usa la versión quieta");
  await page.screenshot({ path: "/tmp/mate-quieto.png" });
  await page.waitForTimeout(3100);
  ok(!(await estado(page)), "y también se retira");
  await page.context().close();
  page = await abre({ viewport: { width: 1366, height: 768 } });
  await page.evaluate(() => { __carga(__mate); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(3000);
  ok(!!(await estado(page)), "en escritorio también aparece");
  r = await page.evaluate(() => { const b = document.querySelector(".cell.mate-king").getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
  ok(r, "y el rey vencido queda a la vista");
  await page.screenshot({ path: "/tmp/mate-pc.png" });
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
