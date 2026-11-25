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
// Atomic en línea (2.391) y su guía (2.391): Atomic se puede elegir al retar al Clan y en las convocatorias, la posición se guarda y se lee
// igual que la envía el servidor (FEN con la marca « atomic»), el cierre de una partida en vivo da la victoria a quien explotó al rey rival,
// y la guía «Atomic: las reglas» se abre con sus pasos.
// Uso: node tests/atomic_clan.smoke.js
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  { const { page, errores } = await abrir(browser, false);
    const t = await page.evaluate(() => ({
      reto: [...document.querySelectorAll("#club-compose-variant option")].map(o => o.value),
      conv: [...document.querySelectorAll("#conv-variant option, select[id*=conv] option")].map(o => o.value),
      nb: NB_VARIANTS.includes("atomic"),
      etiqueta: VARIANT_LABEL.atomic,
      ida: toFEN(parseFEN(VARIANT_START.atomic)) === VARIANT_START.atomic,
      idaSrv: toFEN(parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 atomic")) === "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 atomic",
      variante: variantOf(parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 atomic").board) }));
    ok(t.reto.includes("atomic"), "el reto al Clan ofrece Atomic");
    ok(t.conv.includes("atomic"), "las convocatorias ofrecen Atomic");
    ok(t.nb, "el cuaderno admite Atomic");
    ok(t.etiqueta === "Atomic", "etiqueta de la variante");
    ok(t.ida && t.idaSrv && t.variante === "atomic", "la FEN que pone el servidor se lee como Atomic y vuelve igual");
    // cierre en vivo: quien acaba de mover y explota al rey rival gana (el motor lo codifica como «checkmate» con el turno del perdedor)
    const c = await page.evaluate(() => {
      let s = parseFEN("4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1 atomic");
      const mv = legalMoves(s).find(m => m.from[0] === 7 && m.from[1] === 3 && m.to[0] === 1 && m.to[1] === 3);
      const n = applyMove(s, mv);
      return { oc: outcome(n), turno: n.turn, quedaRey: { w: !!kingPos(n.board, "w"), b: !!kingPos(n.board, "b") } };
    });
    ok(c.oc === "checkmate" && c.turno === "b" && c.quedaRey.w && !c.quedaRey.b, "explotar al rey rival cierra la partida con victoria del que movió (" + JSON.stringify(c) + ")");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? ": " + errores[0] : ""));
    await page.context().close(); }
  { const { page, errores } = await abrir(browser, false);
    const g = await page.evaluate(async () => {
      const sel = document.getElementById("tuto-select");
      const op = sel && [...sel.options].find(o => o.value === "atomic");
      if(!op) return { op: false };
      sel.value = "atomic"; sel.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      const tuto = document.getElementById("tuto");
      return { op: true, abierta: !tuto.hidden, titulo: document.getElementById("tuto-titulo").textContent, puntos: document.querySelectorAll("#tuto-puntos i").length };
    });
    ok(g.op, "el desplegable de guías incluye «Atomic: las reglas»");
    ok(g.abierta && /Atomic/.test(g.titulo) && g.puntos === 7, "la guía se abre con sus siete pasos (" + JSON.stringify(g) + ")");
    ok(errores.length === 0, "sin errores de página en la guía" + (errores.length ? ": " + errores[0] : ""));
    await page.context().close(); }
  await browser.close(); srv.close();
  console.log(fallos ? "FALLAS: " + fallos : "Todo en orden"); process.exit(fallos ? 1 : 0);
})();
