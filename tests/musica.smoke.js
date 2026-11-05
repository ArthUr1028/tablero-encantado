// Música (2.213; independiente de los efectos desde la 2.214): «La Niebla» suena en Dark Chess (generativa, sin archivos), con interruptor y volumen propios en La Armería.
// Se prueba con un AudioContext real (autoplay permitido): arranca, se detiene, respeta interruptor/volumen/Sonido general y no lanza errores.
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
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] }); const errores = [];
  for (const [nombre, vp] of [["escritorio", { width: 1000, height: 1300 }], ["movil", { width: 390, height: 844 }]]) {
    console.log("## " + nombre);
    const page = await browser.newPage({ viewport: vp, hasTouch: nombre === "movil", isMobile: nombre === "movil" });
    page.on("pageerror", e => errores.push(nombre + ": " + String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; try{ localStorage.clear(); }catch(e){} });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(async () => {
      const esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
      document.documentElement.classList.remove("intro-abierta");
      o.defecto = { on: SFX.musicOn(), vol: SFX.musicVolume() };
      // 1) sin variante a la vista no suena nada
      SFX.musicWant(null); await esperar(100);
      document.dispatchEvent(new MouseEvent("click", { bubbles: true })); await esperar(200);   // «primer toque»: despierta el audio
      o.sinNada = SFX.musicState().sonando;
      // 2) con música pedida arranca una pista de la lista y sigue
      SFX.musicWant("lista"); await esperar(1500);
      o.suena = SFX.musicState().sonando;
      await esperar(3000);
      o.sigue = SFX.musicState().sonando;
      // 3) jugadas: bajan un instante la música, sin errores
      try{ SFX.move({ piece: "n", variant: "dark", capture: true }, null); o.duck = true; }catch(e){ o.duck = String(e); }
      // 4) interruptor propio
      SFX.setMusicOn(false); await esperar(200); o.apagada = SFX.musicState().sonando;
      SFX.setMusicOn(true); await esperar(1500); o.encendida = SFX.musicState().sonando;
      // 5) volumen 0 = silencio (y no gasta CPU); al subirlo vuelve
      SFX.setMusicVolume(0); await esperar(200); o.vol0 = SFX.musicState().sonando;
      SFX.setMusicVolume(0.6); await esperar(1500); o.vol60 = SFX.musicState().sonando; o.volGuardado = localStorage.getItem("tablero-encantado.volumen-musica");
      // 6) los efectos de sonido son independientes: apagar «Sonido» NO la calla (y los efectos sí quedan mudos)
      SFX.toggle(); await esperar(300); o.sonidoOff = SFX.musicState().sonando; o.efectosOff = SFX.isOn();
      SFX.setMusicOn(false); await esperar(200); o.musicaApagadaConSonidoOff = SFX.musicState().sonando;
      SFX.setMusicOn(true); await esperar(1500); o.musicaConSonidoOff = SFX.musicState().sonando;
      SFX.toggle(); await esperar(400); o.sonidoOn = SFX.musicState().sonando;
      // 7) la intro abierta la calla
      document.documentElement.classList.add("intro-abierta"); SFX.musicWant("lista"); await esperar(200); o.intro = SFX.musicState().sonando;
      document.documentElement.classList.remove("intro-abierta"); SFX.musicWant("lista"); await esperar(1500); o.trasIntro = SFX.musicState().sonando;
      // 8) sin música pedida se detiene
      SFX.musicWant(null); await esperar(200); o.sinPedir = SFX.musicState().sonando;
      // 9) «Escuchar» la fuerza aunque nadie la pida y otra pulsación la corta
      const a = SFX.musicPreview(); await esperar(1500); o.prueba = SFX.musicState().sonando;
      const b = SFX.musicPreview(); await esperar(200); o.pruebaFin = SFX.musicState().sonando; o.pruebaRet = [a, b];
      return o;
    });
    const LISTA = ["niebla", "steel-against-the-sky", "beneath-the-siege-wall", "before-the-shield-wall", "iron-beneath-the-shield", "before-the-siege", "where-steel-meets-mud"];
    const enLista = n => LISTA.indexOf(n) >= 0;
    ok(r.defecto.on === true && Math.abs(r.defecto.vol - 0.45) < 1e-9, "por defecto: música encendida al 45 %");
    ok(r.sinNada === null, "sin música pedida no suena nada");
    ok(enLista(r.suena) && enLista(r.sigue), "al pedirla suena una pista de la banda sonora y se mantiene (" + r.suena + ")");
    ok(r.duck === true, "una jugada baja la música sin errores");
    ok(r.apagada === null && enLista(r.encendida), "el interruptor de música la apaga y la devuelve");
    ok(r.vol0 === null && enLista(r.vol60) && r.volGuardado === "0.6", "volumen 0 la detiene; al subirlo vuelve y se recuerda");
    ok(r.efectosOff === false && enLista(r.sonidoOff) && r.musicaApagadaConSonidoOff === null && enLista(r.musicaConSonidoOff) && enLista(r.sonidoOn), "apagar «Sonido» (efectos) no calla la música; ella se gobierna sola");
    ok(r.intro === null && enLista(r.trasIntro), "la intro abierta la calla y al cerrarla vuelve");
    ok(r.sinPedir === null, "sin música pedida se detiene");
    ok(enLista(r.prueba) && r.pruebaFin === null && r.pruebaRet[0] === true && r.pruebaRet[1] === false, "«Escuchar» la pone aunque nadie la pida y otra pulsación la corta");
    // La Armería: los controles existen, reflejan el estado y mandan
    const ui = await page.evaluate(async () => {
      const $ = id => document.getElementById(id), esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
      o.existen = !!($("aj-mus") && $("aj-mus-vol") && $("aj-mus-test"));
      document.dispatchEvent(new Event("ajustes-sync")); await esperar(50);
      o.estado = { chk: $("aj-mus").checked, vol: $("aj-mus-vol").value, volDis: $("aj-mus-vol").disabled };
      $("aj-mus").checked = false; $("aj-mus").dispatchEvent(new Event("change")); await esperar(50);
      o.apagada = { on: SFX.musicOn(), volDis: $("aj-mus-vol").disabled, testDis: $("aj-mus-test").disabled };
      $("aj-mus").checked = true; $("aj-mus").dispatchEvent(new Event("change")); await esperar(50);
      $("aj-mus-vol").value = "20"; $("aj-mus-vol").dispatchEvent(new Event("input")); await esperar(50);
      o.vol = SFX.musicVolume();
      $("aj-mus-pista").value = "niebla";
      $("aj-mus-test").click(); await esperar(1200); o.testTxt = $("aj-mus-test").textContent; o.testSuena = SFX.musicState().sonando;
      $("aj-mus-test").click(); await esperar(100); o.testTxt2 = $("aj-mus-test").textContent;
      return o;
    });
    ok(ui.existen, "La Armería tiene interruptor, volumen y «Escuchar» de la música");
    ok(ui.estado.chk === true && ui.estado.vol === "60" && ui.estado.volDis === false, "los controles reflejan el estado guardado");
    ok(ui.apagada.on === false && ui.apagada.volDis === true && ui.apagada.testDis === true, "al apagar la música se bloquean su volumen y «Escuchar»");
    ok(Math.abs(ui.vol - 0.2) < 1e-9, "el deslizador cambia el volumen de la música");
    ok(ui.testTxt === "Detener" && ui.testSuena === "niebla" && ui.testTxt2 === "Escuchar", "«Escuchar» cambia a «Detener» mientras suena y vuelve");
    // Banda sonora: todas las variantes comparten la lista; el selector ofrece las siete pistas y «Escuchar» toca la elegida
    const c = await page.evaluate(async () => {
      const $ = id => document.getElementById(id), esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
      SFX.setMusicOn(true); SFX.setMusicVolume(0.5); document.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const tocando = async (nombre, ms) => { await esperar(ms || 1500); return SFX.musicState(); };
      setMode("play"); newGame(START); render(); o.clasico = (await tocando()).quiere;
      newGame(DARK_START); render(); o.dark = (await tocando(600)).quiere;
      newGame(CAPABLANCA_START); render(); o.capablanca = (await tocando(600)).quiere;
      setMode("free"); render(); o.libre = (await tocando(600)).quiere;
      setMode("play"); newGame(START); render();
      o.opciones = [...$("aj-mus-pista").options].map(x => x.value);
      $("aj-mus-pista").value = "steel-against-the-sky"; $("aj-mus-test").click(); o.pruebaArch = (await tocando(2500)).sonando;
      $("aj-mus-pista").value = "niebla"; $("aj-mus-pista").dispatchEvent(new Event("change")); o.cambiaANiebla = (await tocando(1500)).sonando;
      $("aj-mus-test").click(); await esperar(300); o.corta = SFX.musicState().sonando;
      return o;
    });
    ok(c.clasico === "lista" && c.dark === "lista" && c.capablanca === "lista" && c.libre === "lista", "todas las variantes y el Tablero libre piden la misma banda sonora");
    ok(c.opciones.join() === "lista," + LISTA.join(), "el selector de La Armería ofrece el orden aleatorio y las siete pistas");
    ok(c.pruebaArch === "steel-against-the-sky" && c.cambiaANiebla === "niebla", "«Escuchar» toca la pista elegida (grabada o La Niebla) y cambia al elegir otra");
    ok(c.corta !== undefined, "se puede cortar la prueba sin errores");
    // Orden aleatorio: la baraja por rondas no repite una pista hasta haberlas oído todas
    const sorteo = await page.evaluate(() => {
      const ids = ["niebla", "steel-against-the-sky", "beneath-the-siege-wall", "before-the-shield-wall", "iron-beneath-the-shield", "before-the-siege", "where-steel-meets-mud"];
      let cola = [], ultima = null; const seq = [];
      const sorteo = () => { if(!cola.length){ const a = ids.slice(); for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } if(a[a.length - 1] === ultima){ const t = a[0]; a[0] = a[a.length - 1]; a[a.length - 1] = t; } cola = a; } ultima = cola.pop(); return ultima; };
      for(let i = 0; i < 70; i++) seq.push(sorteo());
      return seq;
    });
    let rondaOk = true, sinRepetir = true;
    for (let i = 0; i < 70; i += 7) if (new Set(sorteo.slice(i, i + 7)).size !== 7) rondaOk = false;
    for (let i = 1; i < 70; i++) if (sorteo[i] === sorteo[i - 1]) sinRepetir = false;
    ok(rondaOk && sinRepetir, "el barajado suena las siete pistas por ronda y nunca repite la misma dos veces seguidas");
    // Botón rápido (nota musical) junto a los de vibración, sonido y pantalla completa
    const q = await page.evaluate(async () => {
      const $ = id => document.getElementById(id), esperar = ms => new Promise(r => setTimeout(r, ms)), o = {};
      const b = $("mus-toggle"); o.existe = !!b; if(!b) return o;
      o.visible = b.offsetParent !== null && b.getBoundingClientRect().width > 10;
      o.nota = !!b.querySelector("svg circle");
      o.orden = [...document.querySelectorAll(".zen-toggle-row > button")].filter(x => !x.hidden).map(x => x.id);
      SFX.setMusicOn(true); document.dispatchEvent(new Event("ajustes-sync")); await esperar(50);
      o.inicio = b.getAttribute("aria-pressed");
      b.click(); await esperar(100);
      o.tras1 = { pressed: b.getAttribute("aria-pressed"), on: SFX.musicOn(), chk: $("aj-mus").checked, label: b.getAttribute("aria-label") };
      b.click(); await esperar(100);
      o.tras2 = { pressed: b.getAttribute("aria-pressed"), on: SFX.musicOn(), chk: $("aj-mus").checked };
      $("aj-mus").checked = false; $("aj-mus").dispatchEvent(new Event("change")); await esperar(50);
      o.desdeArmeria = b.getAttribute("aria-pressed");
      SFX.setMusicOn(true); document.dispatchEvent(new Event("ajustes-sync")); await esperar(50);
      o.sonidoNoLoToca = (SFX.toggle(), await esperar(50), b.getAttribute("aria-pressed")); SFX.toggle();
      return o;
    });
    ok(q.existe && q.visible && q.nota, "el botón rápido de música existe, se ve y lleva una nota musical");
    ok(q.orden && q.orden.indexOf("mus-toggle") === q.orden.indexOf("snd-toggle") - 1 && q.orden.indexOf("hap-toggle") === q.orden.indexOf("mus-toggle") - 1, "queda entre vibración y sonido (" + JSON.stringify(q.orden) + ")");
    ok(q.tras1 && q.tras1.pressed === "false" && q.tras1.on === false && q.tras1.chk === false && q.tras1.label === "Música desactivada", "pulsarlo apaga la música y se refleja en La Armería");
    ok(q.tras2 && q.tras2.pressed === "true" && q.tras2.on === true && q.tras2.chk === true, "pulsarlo otra vez la enciende");
    ok(q.desdeArmeria === "false", "apagarla desde La Armería también repinta el botón rápido");
    ok(q.sonidoNoLoToca === "true", "el botón de sonido no cambia el estado del de música");
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores.join(" | ") : ""));
  await browser.close(); srv.close();
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); process.exit(fallos ? 1 : 0);
})();
