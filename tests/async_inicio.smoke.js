// Aviso al ACEPTAR un reto asíncrono (2.197), con Supabase simulado. Para toda variante y color: debe salir el aviso correcto,
// aunque abrir la partida tarde o falle, y ningún aviso posterior (cuaderno, turno…) debe pisarlo mientras está en pantalla.
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
  const variantes = ["clasico", "capablanca", "maharaja", "amazonas", "shatranj", "seirawan", "dark"];
  const res = await page.evaluate(async (variantes) => {
    const out = [];
    accountProfile = { id: "ME" };
    loadClubChallenges = async () => {}; loadClubActiveGames = async () => {}; clubNote = () => {};
    for (const v of variantes) for (const miColor of ["b", "w"]) for (const falla of [false, true]) {
      let entradas = 0;
      sb.rpc = async () => ({ data: "G1", error: null });
      sb.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "G1", variant: v, status: "en_curso", white_id: miColor === "w" ? "ME" : "OTRO", black_id: miColor === "b" ? "ME" : "OTRO" } }) }) }) });
      enterLiveGame = async () => { entradas++; await new Promise(r => setTimeout(r, 60)); if (falla) throw new Error("falla simulada"); };
      showGlobalToast("aviso previo", {});
      try { await respondClubChallenge("C1", true, 3); } catch (e) {}
      // un aviso posterior (como el del cuaderno, 400 ms tras entrar) NO debe pisarlo
      setTimeout(() => showGlobalToast("OTRO AVISO"), 100);
      await new Promise(r => setTimeout(r, 400));
      const el = document.getElementById("global-toast");
      out.push({ v, miColor, falla, entradas, texto: el && el.textContent, visible: !!(el && el.classList.contains("show")) });
      toastHoldUntil = 0; clearTimeout(toastQueueTimer);
    }
    return out;
  }, variantes);
  for (const r of res) {
    const esperado = r.miColor === "b" ? /^Llevas las negras\..*puedes salir de la partida y te avisaremos cuando sea tu turno\.$/ : /^La partida asíncrona ha comenzado\. Llevas las blancas: te toca mover\.$/;
    ok(r.entradas === 1 && r.visible && esperado.test(r.texto || ""), r.v + " · " + (r.miColor === "b" ? "negras" : "blancas") + (r.falla ? " · abrir la partida falla" : "") + " → " + (r.texto || "").slice(0, 40));
  }
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
