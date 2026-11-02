// Cliente del push (2.200) con Supabase y el navegador simulados: estados de Cuenta, preferencias, desvincular al salir, latido y enlaces de los avisos.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "application/javascript" : f.endsWith(".html") ? "text/html; charset=utf-8" : f.endsWith(".webmanifest") ? "application/manifest+json" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 }, permissions: ["notifications"] });
  const page = await ctx.newPage();
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(async () => {
    const out = {}; const llamadas = []; const UUID = "aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb";
    Object.defineProperty(Notification, "permission", { get: () => "default", configurable: true });   // el Chromium sin pantalla bloquea las notificaciones
    accountProfile = { id: "ME" };
    sb.rpc = async (n, a) => { llamadas.push([n, a]); return { data: null, error: null }; };
    sb.from = (t) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => t === "push_prefs" ? { data: { turno: true, retos: false, fin: true, clan: false } } : { data: { id: UUID, variant: "clasico", status: "en_curso", white_id: "ME", black_id: "X" } } }) }) });
    const q = id => document.getElementById(id);
    // manifiesto y vínculos de la cabecera
    out.manifest = !!document.querySelector('link[rel="manifest"]'); out.apple = !!document.querySelector('link[rel="apple-touch-icon"]');
    // 1) llave pública bien formada (65 bytes, punto sin comprimir 0x04)
    const k = pushKey(PUSH_VAPID_PUBLIC); out.llave = k.length === 65 && k[0] === 4;
    // 2) sin sesión: la caja está oculta
    accountProfile = null; await pushRefreshUI(); out.ocultaSinSesion = q("push-box").hidden;
    accountProfile = { id: "ME" };
    // 3) sin suscripción: botón «Activar», sin preferencias
    pushCurrentSub = async () => null; await pushRefreshUI();
    out.sinSub = { visible: !q("push-box").hidden, boton: q("push-toggle").textContent, prefsOcultas: q("push-prefs").hidden, btnVisible: !q("push-toggle").hidden };
    // 4) con suscripción: botón «Desactivar», preferencias cargadas de la base
    const fake = { endpoint: "https://push.example/abc", unsubscribe: async () => { out.desuscrito = true; }, toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "P", auth: "A" } }) };
    pushCurrentSub = async () => fake; await pushRefreshUI(); await new Promise(r => setTimeout(r, 50));
    out.conSub = { boton: q("push-toggle").textContent, prefsVisibles: !q("push-prefs").hidden, turno: q("push-p-turno").checked, retos: q("push-p-retos").checked, fin: q("push-p-fin").checked, clan: q("push-p-clan").checked };
    // 5) guardar preferencias: manda los cuatro valores
    q("push-p-retos").checked = true; q("push-p-clan").checked = false; llamadas.length = 0;
    q("push-p-retos").onchange(); await new Promise(r => setTimeout(r, 30));
    out.prefsRpc = llamadas.find(c => c[0] === "push_set_prefs");
    // 6) al cerrar sesión: se desvincula ESTE aparato (push_unregister con su endpoint)
    llamadas.length = 0; await pushUnlinkDevice(); out.unlink = llamadas.find(c => c[0] === "push_unregister");
    // 7) desactivar: borra en el servidor y cancela la suscripción del navegador
    llamadas.length = 0; await pushDisable(); out.disable = { rpc: !!llamadas.find(c => c[0] === "push_unregister"), unsub: !!out.desuscrito };
    // 8) tras entrar con la suscripción y el permiso ya concedidos: se liga a la cuenta con el idioma actual
    llamadas.length = 0; pushCurrentSub = async () => fake;
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
    await pushAfterLogin(); await new Promise(r => setTimeout(r, 50));
    out.reg = llamadas.find(c => c[0] === "push_register"); out.beat = !!llamadas.find(c => c[0] === "push_heartbeat");
    // 9) enlaces de los avisos
    let abierta = null, panel = false; enterLiveGame = async row => { abierta = row.id; }; openPanelAligned = () => { panel = true; };
    pushHandleLink("https://x.example/tablero/?partida=" + UUID); await new Promise(r => setTimeout(r, 50)); out.abreJuego = abierta === UUID;
    abierta = null; pushHandleLink("https://x.example/?partida=no-es-uuid"); await new Promise(r => setTimeout(r, 30)); out.rechazaBasura = abierta === null;
    pushHandleLink("https://x.example/?panel=clan"); out.abrePanel = panel;
    return out;
  });
  ok(r.manifest && r.apple, "la cabecera enlaza el manifiesto y el ícono");
  ok(r.llave, "la llave pública VAPID del cliente es válida (65 bytes, 0x04)");
  ok(r.ocultaSinSesion, "sin sesión no se muestra el apartado de notificaciones");
  ok(r.sinSub.visible && r.sinSub.boton === "Activar notificaciones" && r.sinSub.prefsOcultas && r.sinSub.btnVisible, "sin suscripción: botón «Activar» y sin preferencias");
  ok(r.conSub.boton === "Desactivar en este dispositivo" && r.conSub.prefsVisibles, "con suscripción: botón «Desactivar» y preferencias visibles");
  ok(r.conSub.turno && !r.conSub.retos && r.conSub.fin && !r.conSub.clan, "las preferencias se leen de la base");
  ok(r.prefsRpc && r.prefsRpc[1].p_turno === true && r.prefsRpc[1].p_retos === true && r.prefsRpc[1].p_fin === true && r.prefsRpc[1].p_clan === false, "al cambiar una casilla se guardan las cuatro preferencias");
  ok(r.unlink && r.unlink[1].p_endpoint === "https://push.example/abc", "al cerrar sesión se desvincula este aparato");
  ok(r.disable.rpc && r.disable.unsub, "desactivar borra la suscripción en el servidor y en el navegador");
  ok(r.reg && r.reg[1].p_endpoint === "https://push.example/abc" && r.reg[1].p_p256dh === "P" && r.reg[1].p_auth === "A" && r.reg[1].p_lang === "es", "al entrar, el aparato se liga a la cuenta con su idioma");
  ok(r.beat, "al entrar se manda el latido de presencia");
  ok(r.abreJuego && r.rechazaBasura && r.abrePanel, "los enlaces de los avisos abren la partida o el Clan, y rechazan identificadores inválidos");
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
