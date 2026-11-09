// Eco de la niebla (2.261): en Dark Chess las jugadas llevan eco (cercano las tuyas, lejano y apagado las del rival).
// Se prueba con un AudioContext real: fuera de la niebla el eco ni se construye; el interruptor de La Armería lo apaga; y el lazo
// del eco es estable (la cola se apaga sola) comprobado con un OfflineAudioContext.
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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; try{ localStorage.clear(); }catch(e){} });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
    document.documentElement.classList.remove("intro-abierta");
    document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await esperar(300);
    // 1) clásico: el eco ni se construye
    SFX.eco(null); SFX.move({ piece: "n", variant: "clasico", capture: true }, null); await esperar(400);
    o.clasico = SFX.ecoEstado();
    // 2) niebla, jugada propia: eco cercano
    SFX.eco("cerca"); SFX.move({ piece: "p", variant: "dark" }, null); await esperar(600);
    o.cerca = SFX.ecoEstado();
    // 3) niebla, jugada del rival: eco lejano, apagado y con menos seco
    SFX.eco("lejos"); SFX.move({ piece: "n", variant: "dark" }, null); await esperar(600);
    o.lejos = SFX.ecoEstado();
    // 4) captura: sube un instante y vuelve
    SFX.move({ piece: "r", variant: "dark", capture: true }, null); await esperar(150);
    o.captura = SFX.ecoEstado().envio; await esperar(3500); o.tras = SFX.ecoEstado().envio;
    // 5) interruptor: apagado, el envío cae a cero y el filtro/seco vuelven a lo normal
    SFX.setEco(false); await esperar(400); o.apagado = SFX.ecoEstado();
    SFX.setEco(true); await esperar(400); o.encendido = SFX.ecoEstado();
    SFX.eco(null); await esperar(400); o.salida = SFX.ecoEstado();
    // 6) interfaz
    const c = document.getElementById("aj-eco"); o.ui = !!c;
    if(c){ c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); o.uiApaga = SFX.ecoActivo(); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); o.uiEnciende = SFX.ecoActivo(); }
    // 7) estabilidad del lazo: un golpe → la cola se apaga sola y hay un primer eco hacia los 0,31 s
    const sr = 44100, oc = new OfflineAudioContext(2, sr * 8, sr), fte = oc.createBuffer(1, sr, sr); fte.getChannelData(0)[0] = 1;
    const src = oc.createBufferSource(); src.buffer = fte; const e = crearEco(oc, oc.destination); src.connect(e.entrada); src.start(0);
    const buf = await oc.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1);
    const pico = (a, d, h) => { let m = 0; for(let i = Math.floor(d * sr); i < Math.floor(h * sr); i++) m = Math.max(m, Math.abs(a[i])); return m; };
    o.silencioAntes = pico(L, 0, 0.25); o.primerEco = pico(L, 0.28, 0.34); o.eco2 = pico(R, 0.60, 0.72); o.cola = Math.max(pico(L, 6, 8), pico(R, 6, 8));
    return o;
  });
  console.log(JSON.stringify(r));
  ok(r.clasico.grafo === false, "fuera de la niebla el eco ni se construye (sin coste)");
  ok(r.cerca.grafo && r.cerca.envio > 0.15 && r.cerca.envio < 0.3 && r.cerca.corte > 15000 && r.cerca.seco > 0.95, "jugada propia en niebla: eco cercano, sin filtro");
  ok(r.lejos.envio > 0.4 && r.lejos.corte < 4000 && r.lejos.seco < 0.9, "jugada del rival: eco mayor, sonido apagado y seco más bajo");
  ok(r.captura > r.lejos.envio * 1.2 && Math.abs(r.tras - r.lejos.envio) < 0.05, "la captura sube el eco un instante y vuelve al nivel normal");
  ok(r.apagado.envio < 0.02 && r.apagado.corte > 15000 && r.apagado.seco > 0.95, "con el interruptor apagado no queda eco ni filtro");
  ok(r.encendido.envio > 0.4, "al volver a encender, vuelve el eco");
  ok(r.salida.envio < 0.02 && r.salida.seco > 0.95, "al salir de la niebla el eco se apaga");
  ok(r.ui && r.uiApaga === false && r.uiEnciende === true, "el interruptor de La Armería apaga y enciende el eco");
  ok(r.silencioAntes < 1e-4 && r.primerEco > 0.05, "el primer eco llega hacia los 0,31 s");
  ok(r.eco2 > 0.02 && r.cola < 0.001, "rebota al otro lado y la cola se apaga sola (lazo estable)");
  ok(errores.length === 0, "sin errores de página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " FALLO(S)" : "\neco OK"); process.exit(fallos ? 1 : 0);
})();
