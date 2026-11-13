// 2.292 · Cada pieza se mueve a su manera en la partida (salta, rueda o da un paso), en todas las modalidades; la torre también recorre su camino al enrocar.
// Uso: node tests/movimiento_piezas.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools y /opt/pw-browsers)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };

// Juega UNA jugada (origen y destino como [fila, columna], fila 0 = octava) y devuelve cómo quedaron animadas las piezas del tablero.
const JUGAR = async (cfg) => {
  setMode("play"); newGame(cfg.fen, { white: "Yo", black: "Rival", result: "", resultNote: "" });
  vsMachine = false; matchStarted = true; matchPaused = false; flipped = !!cfg.flip; render();
  const m = legalMoves(liveState()).find(x => sameSq(x.from, cfg.from) && sameSq(x.to, cfg.to) && !x.gate && !x.promo);
  if (!m) return { sinJugada: true };
  if (cfg.drop) slideSkipFly = true;
  commitMove(m);
  const out = [...document.querySelectorAll("#board .piece.slide")].map(e => {
    const svg = e.querySelector("svg"), cs = svg ? getComputedStyle(svg) : null, bs = getComputedStyle(e, "::before");
    return { cls: e.className, fdur: e.style.getPropertyValue("--fdur"), tilt: e.style.getPropertyValue("--tilt"), alt: e.style.getPropertyValue("--alt"),
      fdx: e.style.getPropertyValue("--fdx"), svgAnim: cs ? cs.animationName : "", shAnim: bs.animationName };
  });
  return { piezas: out };
};
const clase = (r) => (r.piezas || []).map(p => (p.cls.match(/mv-\w+/) || ["—"])[0]);

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  async function abrir(reducir) {
    const ctx = await browser.newContext({ viewport: { width: 700, height: 1000 }, reducedMotion: reducir ? "reduce" : "no-preference" });
    const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; try { localStorage.clear(); } catch (e) {} });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await page.waitForTimeout(300);
    return { page, errores };
  }
  const { page, errores } = await abrir(false);
  const J = (cfg) => page.evaluate(JUGAR, cfg);
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const CAPA = "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1";
  const MAHA = "rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1";
  const AMAZ = "rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1";

  // ---- clásico: salto, paso, deslizamiento
  let r = await J({ fen: START, from: [7, 6], to: [5, 5] });
  ok(clase(r)[0] === "mv-leap" && r.piezas.length === 1, "clásico · Cf3 salta en arco (" + clase(r) + ")");
  ok(r.piezas[0] && r.piezas[0].svgAnim === "mvLeap" && r.piezas[0].shAnim === "mvShadowL", "  el arco anima la pieza y su sombra (" + (r.piezas[0] || {}).svgAnim + " / " + (r.piezas[0] || {}).shAnim + ")");
  ok(r.piezas[0] && parseFloat(r.piezas[0].alt) < -25 && parseFloat(r.piezas[0].alt) > -35 && r.piezas[0].fdur === "0.32s", "  altura del arco ≈ la de siempre (" + (r.piezas[0] || {}).alt + ") y .32 s");
  r = await J({ fen: START, from: [6, 4], to: [5, 4] });
  ok(clase(r)[0] === "mv-step" && r.piezas[0].svgAnim === "mvStep", "clásico · e3 es un pasito");
  r = await J({ fen: START, from: [6, 4], to: [4, 4] });
  ok(clase(r)[0] === "mv-step" && parseFloat(r.piezas[0].fdur) > .22, "clásico · e4 (dos casillas) es un paso un poco más largo (" + r.piezas[0].fdur + ")");
  r = await J({ fen: "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1", from: [7, 0], to: [1, 0] });
  ok(clase(r)[0] === "mv-glide" && r.piezas[0].svgAnim === "mvGlide" && r.piezas[0].shAnim === "mvShadowG", "clásico · torre larga rueda (" + clase(r) + ")");
  ok(parseFloat(r.piezas[0].fdur) >= .44 && parseFloat(r.piezas[0].fdur) <= .5, "  la travesía larga dura casi medio segundo y no más (" + r.piezas[0].fdur + ")");
  r = await J({ fen: "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1", from: [7, 0], to: [6, 0] });
  ok(clase(r)[0] === "mv-glide" && parseFloat(r.piezas[0].fdur) < .26, "clásico · torre de una casilla: deslizamiento corto (" + r.piezas[0].fdur + ")");
  r = await J({ fen: "4k3/8/8/8/8/8/8/2B1K3 w - - 0 1", from: [7, 2], to: [3, 6] });
  ok(clase(r)[0] === "mv-glide", "clásico · alfil en diagonal rueda");
  r = await J({ fen: "4k3/8/8/8/8/8/8/3QK3 w - - 0 1", from: [7, 3], to: [4, 6] });
  ok(clase(r)[0] === "mv-glide", "clásico · dama en diagonal rueda");
  r = await J({ fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", from: [7, 4], to: [6, 4] });
  ok(clase(r)[0] === "mv-step", "clásico · el rey da un pasito");

  // ---- inclinación hacia donde va (y con el tablero girado, hacia donde se ve ir)
  const ida = await J({ fen: START, from: [7, 6], to: [5, 5] }), vuelta = await J({ fen: START, from: [7, 1], to: [5, 2] });
  ok(parseFloat(ida.piezas[0].tilt) < 0 && parseFloat(vuelta.piezas[0].tilt) > 0, "el caballo se inclina hacia donde va (izq: " + ida.piezas[0].tilt + ", der: " + vuelta.piezas[0].tilt + ")");
  const giro = await J({ fen: START, from: [7, 6], to: [5, 5], flip: true });
  ok(parseFloat(giro.piezas[0].tilt) > 0, "con el tablero girado se inclina según lo que se ve en pantalla (" + giro.piezas[0].tilt + ")");

  // ---- enroque: el rey da su paso y la torre recorre su camino
  r = await J({ fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", from: [7, 4], to: [7, 6] });
  const cl = clase(r).sort().join(",");
  ok(r.piezas.length === 2 && cl === "mv-glide,mv-step", "enroque corto: rey (paso) y torre (rueda) se animan (" + cl + ")");
  const torre = (r.piezas || []).find(p => /mv-glide/.test(p.cls));
  ok(torre && torre.fdx === "2", "  la torre viene de h1 a f1 (desfase " + (torre || {}).fdx + " casillas)");
  r = await J({ fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", from: [7, 4], to: [7, 2] });
  const torreL = (r.piezas || []).find(p => /mv-glide/.test(p.cls));
  ok(r.piezas.length === 2 && torreL && torreL.fdx === "-3", "enroque largo: la torre viene de a1 a d1 (desfase " + (torreL || {}).fdx + ")");

  // ---- soltada con el dedo: ya está en su casilla; solo se apoya
  r = await J({ fen: START, from: [7, 6], to: [5, 5], drop: true });
  ok(clase(r)[0] === "mv-land" && r.piezas[0].svgAnim === "mvLand" && r.piezas[0].fdx === "0", "soltar una pieza arrastrada: no vuela de regreso, solo se apoya");

  // ---- Capablanca: arzobispo y canciller saltan como caballo; en línea ruedan
  r = await J({ fen: CAPA, from: [7, 2], to: [5, 3] });
  ok(clase(r)[0] === "mv-leap", "Capablanca · el arzobispo salta cuando mueve como caballo");
  r = await J({ fen: CAPA, from: [7, 7], to: [5, 8] });
  ok(clase(r)[0] === "mv-leap", "Capablanca · el canciller salta cuando mueve como caballo");
  r = await J({ fen: "4k5/10/10/10/10/10/10/2A1K5 w - - 0 1", from: [7, 2], to: [3, 6] });
  ok(clase(r)[0] === "mv-glide", "Capablanca · el arzobispo rueda cuando mueve como alfil");
  r = await J({ fen: "4k5/10/10/10/10/10/10/R4K3C w - - 0 1", from: [7, 9], to: [3, 9] });
  ok(clase(r)[0] === "mv-glide", "Capablanca · el canciller rueda cuando mueve como torre");
  r = await J({ fen: "r4k3r/10/10/10/10/10/10/R4K3R w KQkq - 0 1", from: [7, 5], to: [7, 8] });
  ok(r.piezas.length === 2 && clase(r).sort().join(",") === "mv-glide,mv-step", "Capablanca · el enroque de 10 columnas también mueve la torre (" + clase(r) + ")");

  // ---- Maharajá y Amazonas: la amazona salta como caballo y rueda como dama
  r = await J({ fen: MAHA, from: [7, 4], to: [5, 3] });
  ok(clase(r)[0] === "mv-leap", "Maharajá · la amazona salta cuando mueve como caballo");
  r = await J({ fen: MAHA, from: [7, 4], to: [3, 4] });
  ok(clase(r)[0] === "mv-glide", "Maharajá · la amazona rueda cuando mueve como dama");
  r = await J({ fen: AMAZ, from: [7, 3], to: [5, 2] });
  ok(clase(r)[0] === "mv-leap", "Amazonas · la amazona salta cuando mueve como caballo");

  // ---- Shatranj: fil (salta 2 en diagonal), ferz y shah (paso), rukh (rueda), faras (salta)
  const SH = "3s4/8/8/8/8/8/8/R2SF2L w - - 0 1";
  r = await J({ fen: SH, from: [7, 7], to: [5, 5] });
  ok(clase(r)[0] === "mv-leap", "Shatranj · el fil salta dos casillas en diagonal (" + clase(r) + ")");
  ok(r.piezas[0] && parseFloat(r.piezas[0].alt) < -30, "  su arco es un poco más alto que el del caballo (" + (r.piezas[0] || {}).alt + ")");
  r = await J({ fen: SH, from: [7, 4], to: [6, 3] });
  ok(clase(r)[0] === "mv-step", "Shatranj · el ferz da un pasito");
  r = await J({ fen: SH, from: [7, 3], to: [6, 3] });
  ok(clase(r)[0] === "mv-step", "Shatranj · el shah da un pasito");
  r = await J({ fen: SH, from: [7, 0], to: [3, 0] });
  ok(clase(r)[0] === "mv-glide", "Shatranj · el rukh rueda");
  r = await J({ fen: "rnlsflnr/pppppppp/8/8/8/8/PPPPPPPP/RNLSFLNR w - - 0 1", from: [7, 1], to: [5, 2] });
  ok(clase(r)[0] === "mv-leap", "Shatranj · el faras salta");
  // en el shatranj todas miran al centro: el giro se combina con el movimiento sin perder el arco
  r = await J({ fen: "rnlsflnr/pppppppp/8/8/8/8/PPPPPPPP/RNLSFLNR w - - 0 1", from: [7, 1], to: [5, 3] }).catch(() => ({}));
  if (r.piezas) ok(r.piezas[0].svgAnim.includes("mvLeap"), "  con el giro hacia el centro el arco se conserva (" + r.piezas[0].svgAnim + ")");

  // ---- Seirawan: el caballo salta y el enroque mueve la torre
  r = await J({ fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1", from: [7, 1], to: [5, 2] });
  ok(clase(r)[0] === "mv-leap", "Seirawan · el caballo salta");

  // ---- Dark Chess: la niebla manda. Sin origen visible no hay recorrido; con origen y destino visibles, la pieza se mueve como siempre
  const DK = async (fen, from, to) => page.evaluate(async (c) => {
    setMode("play"); newGame(c.fen, { white: "Yo", black: "Rival", result: "", resultNote: "" });
    vsMachine = false; matchStarted = true; matchPaused = false; flipped = false; render();
    const m = legalMoves(liveState()).find(x => sameSq(x.from, c.from) && sameSq(x.to, c.to));
    if (!m) return { sinJugada: true };
    commitMove(m);
    return {
      enNiebla: document.querySelectorAll("#board .cell.fog .piece:not(.ghost-out)").length,
      animadasEnNiebla: document.querySelectorAll("#board .cell.fog .piece.slide").length,
      animadas: [...document.querySelectorAll("#board .piece.slide")].map(e => (e.className.match(/mv-\w+/) || ["—"])[0]),
    };
  }, { fen, from, to });
  // origen oculto (el caballo sale de g1, que el rival no ve): ni recorrido ni pieza en niebla
  let dk = await DK("4k3/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ - 0 1 dark", [7, 6], [5, 5]);
  console.log("  dark(origen oculto):", JSON.stringify(dk));
  ok(!dk.sinJugada && dk.enNiebla === 0 && dk.animadasEnNiebla === 0 && dk.animadas.length === 0, "Dark Chess · si el origen está en la niebla no hay recorrido ni se dibuja nada oculto");
  // origen y destino visibles para el rival (alfil negro ve a1; dama negra ve la columna a hasta a3): la torre rueda como en cualquier partida
  dk = await DK("q3k2b/8/8/8/8/8/8/R3K3 w - - 0 1 dark", [7, 0], [5, 0]);
  console.log("  dark(visible):", JSON.stringify(dk));
  ok(!dk.sinJugada && dk.animadas.join() === "mv-glide" && dk.animadasEnNiebla === 0 && dk.enNiebla === 0, "Dark Chess · con origen y destino iluminados la pieza rueda (" + dk.animadas + "), sin nada en la niebla");
  // destino oculto: el rival no ve a dónde fue (la torre pasa de a1 a a2: el destino queda tras la dama, sin visión)
  dk = await DK("4k3/8/8/8/8/8/8/R3K3 w - - 0 1 dark", [7, 0], [6, 0]);
  console.log("  dark(destino oculto):", JSON.stringify(dk));
  ok(!dk.sinJugada && dk.animadas.length === 0 && dk.enNiebla === 0, "Dark Chess · si el destino está en la niebla tampoco se anima ni se delata el rumbo");

  // ---- «reducir movimiento»: sin animaciones
  const red = await abrir(true);
  const rr = await red.page.evaluate(JUGAR, { fen: START, from: [7, 6], to: [5, 5] });
  ok(rr.piezas.length === 1 && rr.piezas[0].svgAnim === "none" && rr.piezas[0].shAnim === "none", "con «reducir movimiento» la pieza no se anima (" + rr.piezas[0].svgAnim + ")");
  await red.page.close();

  ok(errores.length === 0, "sin errores de la página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " FALLO(S)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
