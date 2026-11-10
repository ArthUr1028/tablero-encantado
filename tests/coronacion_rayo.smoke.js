// Coronación con rayo y trueno (2.262): al coronar cae un rayo SVG sobre la casilla, suena el trueno grabado, el efecto se limpia solo,
// y con «reducir movimiento» no se dibuja nada. Con FRAMES=/carpeta guarda capturas del efecto congelado en instantes concretos.
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
  return { page, errores, ctx };
}
const CASO = process.env.CASO === "negras" ? { fen: "4k3/8/8/8/8/8/3p4/4K3 b - - 0 1", de: [6, 3], a: [7, 3] } : { fen: "4k3/3P4/8/8/8/8/8/4K3 w - - 0 1", de: [1, 3], a: [0, 3] };
const CORONAR = (caso) => {
  setMode("play"); newGame(caso.fen, { white: "Yo", black: "Rival", result: "", resultNote: "" });
  vsMachine = false; matchStarted = true; matchPaused = false; render();
  window.__sonidos = []; const o = SFX.move; SFX.move = function (mv, oc) { window.__sonidos.push({ promo: mv && mv.promo, piece: mv && mv.piece }); return o.apply(this, arguments); };
  tryMove(caso.de, caso.a);   // d7-d8 (o d2-d1 las negras): abre el diálogo de coronación
};
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  // ---- 1) movimiento normal: sin reducir movimiento ----
  { const { page, errores } = await abrir(browser, false);
    const m = await page.evaluate(() => ({ trueno: !!(window.SFX_AUDIO && window.SFX_AUDIO.trueno), kb: window.SFX_AUDIO && window.SFX_AUDIO.trueno ? Math.round(window.SFX_AUDIO.trueno.length * .75 / 1024) : 0 }));
    ok(m.trueno && m.kb > 30 && m.kb < 120, "el trueno viene incrustado (" + m.kb + " KB)");
    await page.evaluate(CORONAR, CASO); await page.waitForTimeout(300);
    const dlg = await page.evaluate(() => { const b = [...document.querySelectorAll("#promo button")]; return { abierto: !document.getElementById("promo").hidden, n: b.length }; });
    ok(dlg.abierto, "se abre el diálogo de coronación (" + dlg.n + " opciones)");
    // elegir Dama
    await page.evaluate(() => { const b = document.querySelector("#promo .promo-choices button"); b.click(); });
    await page.waitForTimeout(120);
    const r1 = await page.evaluate(() => ({
      bolt: document.querySelectorAll(".boltfx").length,
      paths: document.querySelectorAll(".boltfx path").length,
      d: (document.querySelector(".boltfx .b-core") || {}).getAttribute ? document.querySelector(".boltfx .b-core").getAttribute("d").length : 0,
      zap: document.querySelectorAll(".gatefx.zap").length,
      beam: (() => { const b = document.querySelector(".gatefx.zap .beam"); return b ? getComputedStyle(b).display : "sin"; })(),
      pieza: document.querySelectorAll(".piece.summon.zap").length,
      sonidos: window.__sonidos.slice(),
    }));
    console.log(JSON.stringify(r1));
    ok(r1.bolt === 1 && r1.paths === 3 && r1.d > 200, "cae UN rayo (tres trazos: halo, cuerpo, núcleo)");
    ok(r1.zap === 1 && r1.beam === "none", "la invocación pasa a modo rayo (sin columna dorada)");
    ok(r1.pieza === 1, "la pieza coronada aparece con el golpe del rayo");
    ok(r1.sonidos.length === 1 && !!r1.sonidos[0].promo, "SFX.move recibe la coronación (suena una vez)");
    // congelar y fotografiar instantes
    if (FRAMES) {
      fs.mkdirSync(FRAMES, { recursive: true });
      for (const [nombre, ms] of [["a_calma", 300], ["b_destello_previo", 470], ["c_impacto", 700], ["d_rebote", 880], ["e_cola", 1100], ["f_final", 2000]]) {
        await page.evaluate(ms => { document.getAnimations().forEach(a => { try{ a.pause(); a.currentTime = ms; }catch(e){} }); }, ms);
        await page.waitForTimeout(80);
        const caja = await page.evaluate(() => { const b = document.getElementById("board").getBoundingClientRect(); return { x: Math.max(0, b.x - 14), y: Math.max(0, b.y - 150), width: Math.min(390, b.width + 28), height: b.height + 190 }; });
        await page.screenshot({ path: path.join(FRAMES, nombre + ".png"), clip: caja });
      }
    }
    // limpieza (sin congelar: recarga el estado)
    await page.evaluate(() => { document.getAnimations().forEach(a => { try{ a.play(); }catch(e){} }); });
    await page.waitForTimeout(2400);
    const lim = await page.evaluate(() => ({ bolt: document.querySelectorAll(".boltfx").length, gate: document.querySelectorAll(".gatefx").length, quake: document.getElementById("board").classList.contains("quake") }));
    ok(lim.bolt === 0 && lim.gate === 0 && !lim.quake, "el efecto se limpia solo (sin restos en el DOM)");
    // otra captura de jugada normal no dispara rayo
    const n = await page.evaluate(() => { newGame(START); render(); tryMove([6, 4], [4, 4]); return document.querySelectorAll(".boltfx").length; });
    ok(n === 0, "una jugada cualquiera no lanza rayo");
    ok(errores.length === 0, "sin errores de página" + (errores.length ? ": " + errores.join(" | ") : ""));
  }
  // ---- 2) reducir movimiento: ni rayo ni destello ----
  { const { page, errores } = await abrir(browser, true);
    await page.evaluate(CORONAR, CASO); await page.waitForTimeout(250);
    await page.evaluate(() => { document.querySelector("#promo .promo-choices button").click(); }); await page.waitForTimeout(150);
    const r2 = await page.evaluate(() => ({ bolt: document.querySelectorAll(".boltfx").length, gate: document.querySelectorAll(".gatefx").length }));
    ok(r2.bolt === 0 && r2.gate === 0, "con «reducir movimiento» no se dibuja rayo ni invocación");
    ok(errores.length === 0, "sin errores de página (reducir movimiento)");
  }
  // ---- 3) sonido: el trueno se decodifica y se programa en el impacto ----
  { const { page, errores } = await abrir(browser, false);
    const r3 = await page.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms)); const o = {};
      const orig = AudioBufferSourceNode.prototype.start; o.fuentes = []; 
      AudioBufferSourceNode.prototype.start = function (t) { o.fuentes.push({ dur: this.buffer ? +this.buffer.duration.toFixed(2) : 0, t: t, ahora: this.context.currentTime }); return orig.apply(this, arguments); };
      SFX.move({ promo: "q", piece: "p", variant: "clasico" }, null); await esperar(1500);
      AudioBufferSourceNode.prototype.start = orig;
      o.trueno = o.fuentes.find(f => f.dur > 4 && f.dur < 4.6) || null;
      return o;
    });
    console.log(JSON.stringify(r3));
    ok(!!r3.trueno, "suena el trueno grabado (4,4 s) al coronar");
    ok(r3.trueno && r3.trueno.t - r3.trueno.ahora < 1.0, "se programa en el impacto del rayo (~0,7 s tras la jugada)" );
    ok(errores.length === 0, "sin errores de página (sonido)");
  }
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " FALLO(S)" : "\ncoronación con rayo OK"); process.exit(fallos ? 1 : 0);
})();
