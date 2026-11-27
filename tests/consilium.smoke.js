// 2.394 · Consilium: desplegable de variantes con ilustración, reglas y enlace a su ficha del Sanctuarium.
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
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    console.log(vp.width + " px");
    const page = await browser.newPage({ viewport: vp });
    const errores = []; page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const i = document.getElementById("intro"); if (i) i.remove(); document.documentElement.classList.remove("intro-abierta"); setMode("play"); switchVariant("clasico"); render(); expandPanelExclusive(document.getElementById("panel-variant")); });
    await page.waitForTimeout(700);
    ok(await page.evaluate(() => document.getElementById("var-list").hidden && !!document.querySelector("#var-art img")), "la lista empieza recogida y la ficha trae ilustración");
    for (const v of ["capablanca", "maharaja", "amazonas", "seirawan", "crazyhouse", "atomic", "dark", "shatranj", "clasico"]) {
      await page.click("#var-pick");
      await page.click('#var-list .vpick-opt[data-v="' + v + '"]');
      if (v === "shatranj") { await page.waitForTimeout(300); await page.click("#shat-ok"); }
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => ({ v: variantOf(liveState().board), h: document.getElementById("var-pick").dataset.v, list: document.getElementById("var-list").hidden, art: !!document.getElementById("var-art").firstElementChild, n: document.querySelectorAll("#var-rules-list li").length, link: !document.getElementById("var-hof").hidden }));
      ok(r.v === v && r.h === v && r.list && r.art && r.n >= 3 && r.link, v + ": se elige, se recoge, con emblema o ilustración, reglas y enlace");
      ok(await page.evaluate(v => !document.getElementById("shat-info") && document.getElementById("var-legend").hidden === (v !== "shatranj"), v), v + ": sin botón de leyenda; la leyenda solo sale en Shatranj");
      if (v === "shatranj") { await page.evaluate(() => { document.querySelector(".vcard-rules").open = true; }); await page.locator("#panel-variant").screenshot({ path: "/tmp/cons-shat-" + vp.width + ".png" }); await page.evaluate(() => { document.querySelector(".vcard-rules").open = false; }); }
      {
        await page.click("#var-hof"); await page.waitForTimeout(900);
        const f = await page.evaluate(() => ({ id: hofView.id, open: !document.getElementById("hof-ov").hidden, det: document.querySelector("#hof-body details.hof-var")?.open }));
        const esperado = { clasico: "dama1475", capablanca: "capablanca", seirawan: "seirawan", dark: "darkchess" }[v] || v;
        ok(f.open && f.id === esperado && (!["capablanca", "seirawan"].includes(v) || f.det), v + ": el enlace abre la ficha " + esperado);
        await page.click("#hof-close"); await page.waitForTimeout(800);
      }
      if (v === "maharaja" || v === "atomic") await page.locator("#panel-variant").screenshot({ path: "/tmp/cons-" + v + "-" + vp.width + ".png" });
    }
    await page.click("#var-pick"); await page.waitForTimeout(300);
    await page.locator("#panel-variant").screenshot({ path: "/tmp/cons-lista-" + vp.width + ".png" });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sin desbordamiento horizontal");
    ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
    await page.close();
  }
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
