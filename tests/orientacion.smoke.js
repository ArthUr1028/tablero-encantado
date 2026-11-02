// Orientación del tablero (2.212): al ABRIR una partida tuya (en línea, en vivo o asíncrona, o contra claudIA con «Iniciar») queda con tu lado abajo
// y el del rival arriba (con negras, girado); «Girar» lo cambia cuando quieras. En Solitario no se toca. Supabase simulado.
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
  const browser = await chromium.launch(); const errores = [];
  for (const [nombre, vp] of [["escritorio", { width: 1000, height: 1300 }], ["movil", { width: 390, height: 844 }]]) {
    console.log("## " + nombre);
    const page = await browser.newPage({ viewport: vp, hasTouch: nombre === "movil", isMobile: nombre === "movil" });
    page.on("pageerror", e => errores.push(nombre + ": " + String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll("#intro,.intro,.intro-ov").forEach(e => e.remove()); document.documentElement.classList.remove("intro-abierta"); });
    const r = await page.evaluate(async () => {
      const out = { enLinea: [], local: {} };
      const ch = { on() { return ch; }, subscribe() { return ch; }, unsubscribe() {}, send() {}, track() {}, presenceState() { return {}; } };
      sb.channel = () => ch; sb.removeChannel = () => {}; sb.rpc = async () => ({ data: null, error: null });
      accountProfile = { id: "ME", username: "yo", display_name: "Arthur" };
      const esperar = ms => new Promise(r => setTimeout(r, ms));
      const ranks = () => (document.getElementById("ranks").textContent || "").trim().charAt(0);
      // ---- en línea: cada variante, de blancas y de negras, partiendo de la orientación CONTRARIA, en vivo y asíncrona
      for (const variante of ["clasico", "capablanca", "maharaja", "amazonas", "seirawan", "dark"]) {
        for (const [miColor, asinc] of [["w", null], ["b", null], ["b", 3], ["w", 3]]) {
          const row = { id: "G-" + variante + miColor + (asinc || ""), variant: variante, status: "en_curso", async_days: asinc,
            white_id: miColor === "w" ? "ME" : "OTRO", black_id: miColor === "b" ? "ME" : "OTRO", ply_count: 0, current_fen: null };
          sb.from = table => { const api = { select() { return api; }, eq() { return api; }, order() { return api; }, limit() { return api; }, in() { return api; }, gt() { return api; }, gte() { return api; }, lt() { return api; }, lte() { return api; }, neq() { return api; }, is() { return api; }, not() { return api; }, or() { return api; },
            maybeSingle() { return Promise.resolve({ data: table === "games" ? row : { username: "rival", display_name: "Rival" }, error: null }); }, single() { return api.maybeSingle(); },
            then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } }; return api; };
          flipped = miColor === "w";                       // lo contrario de lo esperado: tiene que corregirse solo
          try{ await enterLiveGame(row); }catch(e){ out.enLinea.push({ variante, miColor, asinc, error: String(e) }); continue; }
          await esperar(150);
          out.enLinea.push({ variante, miColor, asinc, flipped, filas: ranks(), vivo: !!liveGame && liveGame.id === row.id });
          try{ exitLiveGame({}); }catch(e){}
        }
      }
      // ---- «Girar» después de abrir: se respeta
      {
        const row = { id: "G-girar", variant: "clasico", status: "en_curso", async_days: null, white_id: "ME", black_id: "OTRO", ply_count: 0 };
        sb.from = table => { const api = { select() { return api; }, eq() { return api; }, order() { return api; }, limit() { return api; }, in() { return api; }, gt() { return api; }, gte() { return api; }, lt() { return api; }, lte() { return api; }, neq() { return api; }, is() { return api; }, not() { return api; }, or() { return api; },
          maybeSingle() { return Promise.resolve({ data: table === "games" ? row : { display_name: "Rival" }, error: null }); }, single() { return api.maybeSingle(); },
          then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } }; return api; };
        flipped = true; await enterLiveGame(row); await esperar(150);
        out.girar = { alAbrir: flipped };
        document.getElementById("btn-flip").click(); await esperar(50);
        out.girar.tras = flipped; out.girar.filas = ranks();
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await esperar(1500); flipped = !flipped; flipped = !flipped; const antesF = flipped; document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "f", bubbles: true })); await esperar(50);
        out.girar.conTecla = flipped; out.girar.antesF = antesF; out.girar.ov = { hof: document.getElementById("hof-ov").hidden, cd: document.getElementById("cd-ov").hidden, mus: document.getElementById("mus-ov").classList.contains("show"), shat: shatOv.classList.contains("show") };
        try{ exitLiveGame({}); }catch(e){}
      }
      // ---- local: contra claudIA y Solitario
      maybeMachineMove = () => {};                      // sin motor: solo importa la orientación
      currentMode = "play";
      const iniciar = async () => { updateMatchControlsUI(); document.getElementById("match-start").click(); await esperar(200); };
      vsMachine = true; machineHumanColor = "b"; flipped = false; await iniciar(); out.local.negras = flipped; out.local.guardado = JSON.parse(localStorage.getItem(STORE) || "{}").flipped;
      newGame(START); vsMachine = true; machineHumanColor = "w"; flipped = true; await iniciar(); out.local.blancas = flipped;
      newGame(START); vsMachine = false; flipped = true; await iniciar(); out.local.solitarioGirado = flipped;
      newGame(START); vsMachine = false; flipped = false; await iniciar(); out.local.solitarioNormal = flipped;
      return out;
    });
    const malos = r.enLinea.filter(x => x.error || !x.vivo || x.flipped !== (x.miColor === "b") || x.filas !== (x.miColor === "b" ? "1" : "8"));
    ok(r.enLinea.length === 24 && malos.length === 0, "en línea: 6 variantes × (en vivo/asíncrona) × (blancas/negras): mi lado siempre abajo (con negras, girado; filas «1» arriba)" + (malos.length ? " → " + JSON.stringify(malos.slice(0, 3)) : ""));
    ok(r.girar.alAbrir === false && r.girar.tras === true && r.girar.filas === "1" && r.girar.conTecla === false, "«Girar» y la tecla F siguen funcionando después de abrir la partida (" + JSON.stringify(r.girar) + ")");
    ok(r.local.negras === true && r.local.guardado === true, "contra claudIA con negras, «Iniciar» orienta con mis negras abajo (y lo guarda)");
    ok(r.local.blancas === false, "contra claudIA con blancas, «Iniciar» orienta con mis blancas abajo");
    ok(r.local.solitarioGirado === true && r.local.solitarioNormal === false, "en Solitario (llevo los dos bandos) la orientación no se toca");
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
