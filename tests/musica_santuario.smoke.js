// 2.221: la banda sonora se desvanece al entrar al Santuario (que trae su propio canto) y vuelve con un fundido al salir.
// Con los efectos apagados no hay canto, así que la música NO se suspende. Entrar y salir muy rápido no deja pistas dobles ni errores.
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
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }); const errores = [];
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
  page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try{ localStorage.clear(); }catch(e){} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
    document.documentElement.classList.remove("intro-abierta");
    document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await esperar(200);
    SFX.musicWant("niebla"); await esperar(1500); o.antes = SFX.musicState().sonando;
    SFX.santuario(true); await esperar(300); o.dentro = SFX.musicState().sonando;
    await esperar(1500); o.dentroLuego = SFX.musicState().sonando;
    SFX.santuario(false); await esperar(1500); o.fuera = SFX.musicState().sonando;
    // entrar y salir muy rápido
    SFX.santuario(true); await esperar(100); SFX.santuario(false); await esperar(100); SFX.santuario(true); await esperar(100); SFX.santuario(false);
    await esperar(1800); o.rapido = SFX.musicState().sonando;
    // música apagada: salir del Santuario no la enciende
    SFX.setMusicOn(false); await esperar(200); SFX.santuario(true); await esperar(200); SFX.santuario(false); await esperar(1200); o.apagada = SFX.musicState().sonando;
    SFX.setMusicOn(true); await esperar(1500); o.reencendida = SFX.musicState().sonando;
    // efectos apagados: sin canto, la música sigue
    SFX.toggle(); await esperar(300); o.efectosOff = SFX.isOn();
    SFX.santuario(true); await esperar(500); o.sinCantoSigue = SFX.musicState().sonando;
    SFX.santuario(false); await esperar(500); SFX.toggle();
    return o;
  });
  ok(r.antes === "niebla", "antes del Santuario suena la banda sonora (" + r.antes + ")");
  ok(r.dentro === null && r.dentroLuego === null, "dentro del Santuario la banda sonora se retira");
  ok(r.fuera === "niebla", "al salir vuelve la banda sonora (" + r.fuera + ")");
  ok(r.rapido === "niebla", "entrar y salir rápido termina con la banda sonora sonando (" + r.rapido + ")");
  ok(r.apagada === null, "con la música apagada, salir del Santuario no la enciende");
  ok(r.reencendida === "niebla", "reencendida, vuelve a sonar");
  ok(r.efectosOff === false && r.sinCantoSigue === "niebla", "con los efectos apagados (sin canto) la música no se suspende");
  ok(errores.length === 0, "sin errores de página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
