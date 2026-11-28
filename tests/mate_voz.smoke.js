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
// 2.402 · La voz de claudIA al final: cada variante, cada caso, testigo, turnos, inglés y que quepa en pantalla.
// Uso: node tests/mate_voz.smoke.js
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  const { page, errores } = await abrir(browser, false);
  await page.evaluate(() => { document.getElementById("mode-play").click(); });
  const di = (variant, humano) => page.evaluate(([v, h]) => {
    switchVariant(v); const s = liveState(); vsMachine = !!h; if(h) machineHumanColor = h;
    // posición final fabricada: tablero de la variante, pierden las blancas
    const pos = Object.assign({}, s, { turn: "w" });
    MATE.end(true); boardEl.scrollIntoView({ block: "center" }); const rc = boardEl.querySelectorAll(".cell"); rc[rc.length - 4].classList.add("mate-king"); MATE.start(pos, h || null);
    const e = document.getElementById("mate-fx"), q = e && e.querySelector(".mfx-voz p");
    return e ? { t: e.querySelector("strong").textContent, q: q ? q.textContent : "", f: e.querySelector("cite").textContent } : null;
  }, [variant, humano]);
  const vistas = {};
  for (const v of ["clasico", "capablanca", "seirawan", "amazonas", "maharaja", "crazyhouse", "atomic", "dark", "shatranj"]) {
    const gana = await di(v, "b"), pierde = await di(v, "w"), test = await di(v, null);
    for (const [k, x] of [["ganas", gana], ["claudIA", pierde], ["testigo", test]]) console.log("     " + v + " / " + k + ": " + (x && x.t + " " + x.q));
    ok(gana && pierde && test && gana.q && pierde.q && test.q && gana.q !== pierde.q && !/\{/.test(test.q) && !/\bMi\b|\bmi\b/.test(test.q), v + ": las tres voces");
    vistas[v] = gana.q;
  }
  ok(new Set(Object.values(vistas)).size === 9, "cada variante tiene su propia frase");
  await page.evaluate(() => localStorage.removeItem("tablero-encantado.voz-final"));
  const t = []; for (let i = 0; i < 4; i++) t.push((await di("clasico", "b")).q);
  ok(t[0].includes("Mi rey se inclina") && new Set(t.slice(0, 3)).size === 3 && t[3] === t[0], "las tres frases se turnan y vuelve la primera");
  const casos = await page.evaluate(() => {
    const prueba = (fen, h) => { newGame(fen, { white: "a", black: "b", result: "", resultNote: "" }); vsMachine = !!h; if(h) machineHumanColor = h; MATE.end(true); MATE.start(liveState(), h); const e = document.getElementById("mate-fx"); return e.querySelector("strong").textContent + " " + e.querySelector(".mfx-voz p").textContent; };
    return { estallido: prueba("8/3p4/8/8/8/8/8/4K3 b - - 0 1 atomic", "w") };
  });
  ok(/estallado/.test(casos.estallido) && /cenizas|chispa|Ardí/.test(casos.estallido), "Atomic con rey estallado: " + casos.estallido);
  await page.evaluate(() => { MATE.end(true); setLang("en"); });
  const en = await di("clasico", "b"); ok(en && /king|night|saw/i.test(en.q), "en inglés: " + (en && en.q));
  await page.evaluate(() => { MATE.end(true); setLang("es"); });
  for (const [w, h, n] of [[390, 844, "movil"], [360, 640, "chico"], [844, 390, "horizontal"], [1280, 800, "escritorio"]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(500);
    await page.evaluate(() => localStorage.removeItem("tablero-encantado.voz-final"));
    await di("crazyhouse", "w"); await page.waitForTimeout(5600);
    const caja = await page.evaluate(() => { const r = document.querySelector(".mfx-title").getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; });
    ok(caja[0] >= 0 && caja[1] <= caja[2], n + ": el letrero cabe " + caja.map(Math.round));
    await page.screenshot({ path: "/tmp/an/voz-" + n + ".png" });
  }
  const f = await page.evaluate(() => { const i = document.querySelector("#mate-fx cite .wm-ia"); return i ? [i.parentNode.textContent, getComputedStyle(i).animationName] : null; });
  ok(f && f[0] === "CLAUDIA" && f[1] === "wmShine", "la firma es CLAUDIA con «IA» animada " + f);
  const hl = await page.evaluate(() => { MATE.end(true); boardEl.querySelectorAll(".cell")[4].classList.add("mate-king"); MATE.start(Object.assign({}, liveState(), { turn:"w" }), null); return [...[document.getElementById("mate-fx")], ...document.querySelectorAll("#mate-fx *")].every(e => getComputedStyle(e).webkitTapHighlightColor === "rgba(0, 0, 0, 0)"); });
  ok(hl, "la escena no pinta destello de toque");
  ok(errores.length === 0, "sin errores de página " + errores.join("|"));
  await browser.close(); srv.close(); console.log(fallos ? "FALLOS: " + fallos : "TODO OK"); process.exit(fallos ? 1 : 0);
})();
