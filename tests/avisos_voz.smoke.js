// Voz de los avisos (2.199): en cada modo, los avisos «grandes» y los funcionales deben salir con o sin la voz de claudIA, y el selector de Cuenta debe guardarse.
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
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const out = {}; const el = () => document.getElementById("global-toast");
    const sel = document.getElementById("toast-voice-mode");
    out.selectorExiste = !!sel; out.porDefecto = toastVoiceMode; out.selValor = sel && sel.value;
    for (const modo of ["grandes", "todo", "sobrio"]) {
      sel.value = modo; sel.onchange();
      await new Promise(r => setTimeout(r, 50));
      out["guardado_" + modo] = localStorage.getItem("tablero-encantado.vozAvisos") === modo;
      showBigToast("Victoria: el rey rival ha caído."); out["grande_" + modo] = el().classList.contains("cl-voice") && !!el().querySelector("img, span");
      showGlobalToast("Tu rey está en jaque. Defiéndelo."); out["funcional_" + modo] = el().classList.contains("cl-voice");
      showGlobalToast("Frase del reto", { voice: true }); out["reto_" + modo] = el().classList.contains("cl-voice");
    }
    sel.value = "grandes"; sel.onchange();
    return out;
  });
  ok(r.selectorExiste && r.porDefecto === "grandes" && r.selValor === "grandes", "el selector existe y por defecto es «grandes momentos»");
  ok(r.guardado_grandes && r.guardado_todo && r.guardado_sobrio, "la elección se guarda");
  ok(r.grande_grandes && !r.funcional_grandes && r.reto_grandes, "grandes momentos: lo grande habla claudIA, lo funcional es sobrio");
  ok(r.grande_todo && r.funcional_todo && r.reto_todo, "todo: habla claudIA en todo");
  ok(!r.grande_sobrio && !r.funcional_sobrio && r.reto_sobrio, "sobrio: ninguno lleva su voz, pero sus frases del reto sí");
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
