// Llegada del Halcón y del Elefante en Seirawan (2.263): cada criatura con su animación (picada con plumas / pisotón con grietas), el impacto
// sincronizado con el sonido, limpieza del DOM y «reducir movimiento». Con FRAMES=/carpeta guarda capturas congeladas.
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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: reducir ? "reduce" : "no-preference" });
  const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try{ localStorage.clear(); }catch(e){} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.documentElement.classList.remove("intro-abierta"); document.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await page.waitForTimeout(300);
  return { page, errores };
}
// jugada con convocatoria: caballo b1-c3 y la criatura en b1 (o enroque corto con la criatura en f1/e1 si CASTLE)
const JUGAR = (cfg) => {
  setMode("play"); newGame(cfg.fen, { white: "Yo", black: "Rival", result: "", resultNote: "" });
  vsMachine = false; matchStarted = true; matchPaused = false; render();
  const pos = liveState(); const m = legalMoves(pos).find(x => x.gate === cfg.gate && !!x.castle === !!cfg.castle && (cfg.castle ? x.castle === cfg.castle : (x.from[0] === 7 && x.from[1] === 1 && x.to[0] === 5 && x.to[1] === 2)) && (!cfg.castle || x.gsq[1] === cfg.gcol));
  if(!m) return { sinJugada: true };
  commitMove(m); return { ok: true };
};
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const SEIR = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1";
  for (const [gate, nombre, clase] of [["a", "halcón", "hawk"], ["c", "elefante", "ele"]]) {
    const { page, errores } = await abrir(browser, false);
    const j = await page.evaluate(JUGAR, { fen: SEIR, gate });
    ok(j.ok, nombre + ": hay jugada de caballo con convocatoria");
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => ({
      fx: document.querySelectorAll(".gatefx").length, cls: (document.querySelector(".gatefx") || {}).className,
      feather: document.querySelectorAll(".gatefx .feather").length, spark: document.querySelectorAll(".gatefx .spark").length,
      shade: document.querySelectorAll(".gatefx .shade").length, dust: document.querySelectorAll(".gatefx .dust").length, peb: document.querySelectorAll(".gatefx .pebble").length,
      dive: document.querySelectorAll(".sumfx .dive").length, crk: document.querySelectorAll(".sumfx .crk").length,
      beam: (() => { const b = document.querySelector(".gatefx .beam"); return b ? getComputedStyle(b).display : "sin"; })(),
      pieza: (document.querySelector(".piece.summon") || {}).className, gd: (document.querySelector(".piece.summon") || { style: {} }).style.getPropertyValue("--gd"),
    }));
    console.log(JSON.stringify(r));
    ok(r.fx === 1 && /\b(hawk|ele)\b/.test(r.cls) && r.cls.includes(clase), nombre + ": la capa de efectos es la suya (" + r.cls + ")");
    ok(r.pieza && r.pieza.includes(clase), nombre + ": la pieza lleva su propia entrada");
    if (gate === "a") ok(r.feather === 10 && r.dive === 5 && r.crk === 0 && r.shade === 0, "halcón: 10 plumas y estela de picada (5 trazos), sin grietas ni sombra");
    else ok(r.shade === 1 && r.dust === 7 && r.peb === 11 && r.crk === 16 && r.dive === 0 && r.feather === 0, "elefante: sombra, 7 polvaredas, 11 guijarros y 8 grietas (16 trazos), sin plumas");
    ok(r.beam === "none" || r.beam === "sin", nombre + ": sin la columna dorada genérica");
    // el impacto sincroniza la sacudida: ligera para el halcón, pesada para el elefante
    await page.waitForTimeout(760);
    const q = await page.evaluate(() => { const c = document.getElementById("board").classList; return { q: c.contains("quake"), qh: c.contains("quake-heavy") }; });
    ok(gate === "a" ? (q.q && !q.qh) : (q.qh && !q.q), nombre + ": sacudida " + (gate === "a" ? "ligera" : "pesada") + " en el impacto");
    if (FRAMES) {
      await page.evaluate(JUGAR, { fen: SEIR, gate }); await page.waitForTimeout(60);
      fs.mkdirSync(FRAMES, { recursive: true });
      const tiempos = gate === "a" ? [["a", 420], ["b", 580], ["c", 700], ["d", 900], ["e", 1250]] : [["a", 380], ["b", 600], ["c", 720], ["d", 900], ["e", 1400]];
      for (const [n, ms] of tiempos) {
        await page.evaluate(ms => { document.getAnimations().forEach(a => { try{ a.pause(); a.currentTime = ms; }catch(e){} }); }, ms);
        await page.waitForTimeout(80);
        const caja = await page.evaluate(() => { const b = document.getElementById("board").getBoundingClientRect(); return { x: Math.max(0, b.x - 14), y: Math.max(0, b.y - 120), width: Math.min(390, b.width + 28), height: b.height + 150 }; });
        await page.screenshot({ path: path.join(FRAMES, gate + "_" + n + ".png"), clip: caja });
      }
    }
    await page.evaluate(() => { document.getAnimations().forEach(a => { try{ a.play(); }catch(e){} }); });
    await page.waitForTimeout(3600);
    const lim = await page.evaluate(() => ({ fx: document.querySelectorAll(".gatefx, .sumfx").length, q: document.getElementById("board").className }));
    ok(lim.fx === 0 && !/quake/.test(lim.q), nombre + ": el efecto se limpia solo");
    ok(errores.length === 0, nombre + ": sin errores de página" + (errores.length ? " " + errores.join("|") : ""));
    await page.context().close();
  }
  // sonido: cada criatura programa su chillido en el impacto
  { const { page, errores } = await abrir(browser, false);
    const r = await page.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms)), out = {};
      const orig = AudioBufferSourceNode.prototype.start; const fu = [];
      AudioBufferSourceNode.prototype.start = function (t) { fu.push({ dur: this.buffer ? +this.buffer.duration.toFixed(2) : 0, dt: +(t - this.context.currentTime).toFixed(2) }); return orig.apply(this, arguments); };
      SFX.move({ gate: "a", piece: "n", variant: "seirawan" }, null); await esperar(500); out.halcon = fu.splice(0);
      SFX.move({ gate: "c", piece: "n", variant: "seirawan" }, null); await esperar(500); out.elefante = fu.splice(0);
      SFX.move({ gate: "c", castle: "K", piece: "k", variant: "seirawan" }, null); await esperar(500); out.enroque = fu.splice(0);
      AudioBufferSourceNode.prototype.start = orig; return out;
    });
    console.log(JSON.stringify(r));
    const grito = (a, dur) => a.find(f => Math.abs(f.dur - dur) < 0.15);
    const h = grito(r.halcon, 2.0), e = grito(r.elefante, 2.3), en = grito(r.enroque, 2.3);
    ok(h && h.dt > 0.5 && h.dt < 0.9, "halcón: el chillido entra justo antes del impacto (" + (h && h.dt) + " s)");
    ok(e && e.dt > 0.45 && e.dt < 0.85, "elefante: el barrito entra justo antes del impacto (" + (e && e.dt) + " s)");
    ok(en && en.dt > 1.0, "enroque: la llegada espera a los tambores (" + (en && en.dt) + " s)");
    ok(errores.length === 0, "sin errores de página (sonido)");
  }
  { const { page, errores } = await abrir(browser, true);
    await page.evaluate(JUGAR, { fen: SEIR, gate: "c" }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ n: document.querySelectorAll(".gatefx, .sumfx").length, q: document.getElementById("board").className }));
    ok(r.n === 0 && !/quake/.test(r.q), "con «reducir movimiento» no se dibuja nada ni se sacude el tablero");
    ok(errores.length === 0, "sin errores de página (reducir movimiento)");
  }
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " FALLO(S)" : "\nseirawan entrada OK"); process.exit(fallos ? 1 : 0);
})();
