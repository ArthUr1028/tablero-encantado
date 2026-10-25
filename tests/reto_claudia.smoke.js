// Prueba de humo: el reto de claudIA (2.144) en Dark, Shatranj y Maharajá (con blancas y con negras), en un navegador real con el motor real.
// La cuenta y la membresía del Clan se simulan (se intercepta la consulta a club_members); el sorteo de modalidad y color se fuerza.
// Uso: node tests/reto_claudia.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});
let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };

const KEYS = ["clasico", "capablanca", "maharaja", "amazonas", "seirawan", "shatranj", "dark"];
const CASOS = [
  { variante: "dark", color: "b", nivel: 10 },
  { variante: "dark", color: "w", nivel: 10 },
  { variante: "shatranj", color: "b", nivel: 10 },
  { variante: "maharaja", color: "w", nivel: 5 },    // el humano es el Maharajá: claudIA juega los Cipayas en Amateur
  { variante: "maharaja", color: "b", nivel: 10 },   // el humano lleva los Cipayas: claudIA (Maharajá) en Club
];
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const errores = [];
  for (const c of CASOS) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => /club_members/.test(r.request().url())
      ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '[{"profile_id":"u1"}]' })
      : r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const nombre = c.variante + " con " + (c.color === "w" ? "blancas" : "negras");
    await page.evaluate(({ idx, color }) => {
      accountProfile = { id: "u1", username: "prueba" }; clubIsMember = true;
      const seq = [(idx + 0.5) / 7, color === "w" ? 0.1 : 0.9], orig = Math.random;
      Math.random = () => seq.length ? seq.shift() : orig();
      window.confirm = () => true;
      retoStart();
    }, { idx: KEYS.indexOf(c.variante), color: c.color });
    let arranco = true;
    try { await page.waitForFunction(() => retoActive && matchStarted, null, { timeout: 15000 }); } catch (e) { arranco = false; }
    const r = await page.evaluate(() => retoActive ? { v: retoActive.variant, color: retoActive.color, nivel: retoActive.level, machineLevel, vs: vsMachine, hum: machineHumanColor } : null);
    ok(arranco && r && r.v === c.variante && r.color === c.color, nombre + ": el reto arrancó con la modalidad y el color sorteados");
    ok(r && r.nivel === c.nivel && r.machineLevel === c.nivel && r.vs && r.hum === c.color, nombre + ": claudIA al nivel " + c.nivel + " (reto " + (r && r.nivel) + ", motor " + (r && r.machineLevel) + ")");
    if (c.color === "w") {   // el humano abre: se juega una jugada legal y se espera la respuesta de claudIA
      await page.evaluate(() => { const lm = legalMoves(liveState()); commitMove(lm[Math.floor(lm.length / 2)]); });
    }
    const objetivo = c.color === "w" ? 2 : 1;
    let movio = true;
    try { await page.waitForFunction(n => game.sans.length >= n, objetivo, { timeout: 40000 }); } catch (e) { movio = false; }
    const est = await page.evaluate(() => ({ n: game.sans.length, san: game.sans[game.sans.length - 1], pensando: machineThinking }));
    ok(movio, nombre + ": claudIA jugó " + (movio ? est.san : "— se quedó parada (pensando=" + est.pensando + ")"));
    await page.close();
  }

  // --- Victoria y derrota en el reto de Dark: se gana capturando el rey de claudIA, se pierde si captura el tuyo ---
  for (const caso of [{ fen: "4k3/8/8/8/8/8/8/4R1K1 w - - 0 1 dark", jugada: "e1e8", espera: "won" }, { fen: "4k3/8/8/8/8/8/8/4r1K1 w - - 0 1 dark", jugada: "g1f1", espera: "lost" }]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
    page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => /club_members/.test(r.request().url())
      ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '[{"profile_id":"u1"}]' }) : r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const res = await page.evaluate(({ fen, jugada }) => {
      accountProfile = { id: "u1", username: "prueba" }; clubIsMember = true; window.confirm = () => true;
      const seq = [(6 + 0.5) / 7, 0.1], orig = Math.random; Math.random = () => seq.length ? seq.shift() : orig();
      retoStart();
      return new Promise(done => setTimeout(() => {
        newGame(fen, { white: "Yo", black: "claudIA", result: "", resultNote: "" });
        matchStarted = true; matchPaused = false; render();
        const mv = legalMoves(liveState()).find(m => uciOf(m) === jugada);
        commitMove(mv);
        const t0 = Date.now(), espera = () => { if(!retoActive || Date.now() - t0 > 25000) done({ activo: !!retoActive, reclamos: retoClaimsLoad().map(c => c.variant), sans: game.sans.slice(-2) }); else setTimeout(espera, 300); }; espera();
      }, 1500));
    }, caso);
    if (caso.espera === "won") ok(!res.activo && res.reclamos.includes("dark"), "capturar el rey de claudIA en el reto de Dark es victoria (reclamo registrado: " + JSON.stringify(res.reclamos) + ")");
    else ok(!res.activo && res.reclamos.length === 0, "perder el rey en el reto de Dark es derrota (sin reclamo de victoria; jugadas " + JSON.stringify(res.sans) + ")");
    await page.close();
  }

  // --- 2.145: frases de claudIA en el reto (cada campo tiene las suyas; contenida si eres el Maharajá) ---
  {
    const page = await browser.newPage();
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const pool = k => (RV_LINES[k] || []).length;
      return {
        flav: [rvFlavor({ variant: "maharaja", color: "w" }), rvFlavor({ variant: "maharaja", color: "b" }), rvFlavor({ variant: "dark", color: "w" }), rvFlavor({ variant: "shatranj", color: "b" }), rvFlavor({ variant: "clasico", color: "w" })],
        pools: ["handicap", "hAheadH", "cAheadH", "mahClaudia", "darkV", "shatV", "lostH"].map(pool),
        quieta: rvKeyFlavored({ variant: "dark", color: "w" }, "quiet", 6, 10, 0.1),
        quietaSinSuerte: rvKeyFlavored({ variant: "dark", color: "w" }, "quiet", 6, 10, 0.9),
        nada: rvKeyFlavored({ variant: "shatranj", color: "w" }, null, 6, 10, 0.1),
        pocoTiempo: rvKeyFlavored({ variant: "dark", color: "w" }, null, 2, 10, 0.1),
        captura: rvKeyFlavored({ variant: "dark", color: "w" }, "cCapture", 6, 10, 0.1),
        contenidaH: rvKeyFlavored({ variant: "maharaja", color: "w" }, "hAhead", 6, 10, 0.9),
        contenidaC: rvKeyFlavored({ variant: "maharaja", color: "w" }, "cAhead", 6, 10, 0.9),
        sinContencion: rvKeyFlavored({ variant: "maharaja", color: "b" }, "hAhead", 6, 10, 0.9),
        clasico: rvKeyFlavored({ variant: "clasico", color: "w" }, "quiet", 6, 10, 0.1),
        frase: rvPick("handicap")
      };
    });
    ok(JSON.stringify(r.flav) === JSON.stringify(["handicap", "mahClaudia", "darkV", "shatV", null]), "cada campo tiene su conjunto de frases: " + JSON.stringify(r.flav));
    ok(r.pools.every(n => n >= 3), "todos los conjuntos nuevos tienen al menos 3 frases " + JSON.stringify(r.pools));
    ok(r.quieta === "darkV" && r.quietaSinSuerte === "quiet", "en Dark una frase tranquila se cambia por una de las sombras (con la suerte a favor)");
    ok(r.nada === "shatV" && r.pocoTiempo === null, "sin nada que decir, Shatranj aporta una frase; pero no antes de 6 jugadas de silencio");
    ok(r.captura === "cCapture", "una captura conserva su frase de siempre");
    ok(r.contenidaH === "hAheadH" && r.contenidaC === "cAheadH" && r.sinContencion === "hAhead", "contenida solo si tú eres el Maharajá");
    ok(r.clasico === "quiet", "Clásico queda como estaba");
    ok(typeof r.frase === "string" && r.frase.length > 10, "rvPick entrega una frase del conjunto contenido: «" + r.frase + "»");
    await page.close();
  }

  // --- 2.146: las frases de claudIA duran lo que tarda en leerse ---
  {
    const page = await browser.newPage();
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => {
      const med = (txt, opt) => { const o = window.setTimeout; let ult = 0; window.setTimeout = (f, ms, ...a) => { ult = ms; return o(f, ms, ...a); }; showGlobalToast(txt, opt); window.setTimeout = o; return ult; };
      const larga = "Serás el Maharajá, una sola pieza contra todo mi ejército de cipayas. Para compensar, yo jugaré con menos fuerza. ¡Demuestra tu poder!";
      return { larga: med("Para esta batalla, he elegido el campo del Maharajá. " + larga, { voice: true, ms: 9000 }), corta: med("Hola.", { voice: true, ms: 5500 }),
               enorme: med("x".repeat(2000), { voice: true, ms: 5500 }), normal: med("Aviso corriente", {}), normalMs: med("Aviso con tiempo", { ms: 3000 }) };
    });
    ok(d.larga >= 15000 && d.larga <= 30000, "la frase de apertura más larga dura " + (d.larga / 1000).toFixed(1) + " s (antes 9 s)");
    ok(d.corta === 5500, "una frase corta conserva su mínimo (" + d.corta + " ms)");
    ok(d.enorme === 30000, "hay un tope de 30 s");
    ok(d.normal === 5000 && d.normalMs === 3000, "los avisos que no son de claudIA no cambian");
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
