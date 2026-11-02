// Convocatorias (2.210): cliente con Supabase simulado. Tarjetas por estado, botones y lo que mandan al servidor, avisos por diferencia, formulario,
// hilo de mensajes, tolerancia a que falte el SQL, inglés, enganches con Realtime y con los avisos push, y el interruptor «Convocatorias» de La Armería.
// Con CONV_SHOTS=/carpeta guarda capturas (móvil y escritorio) para revisarlas a ojo.
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
const SHOTS = process.env.CONV_SHOTS || "";

// Todo lo que corre dentro de la página
const PREPARAR = () => {
  window.__db = { rows: [], msgs: [], calls: [], errorFrom: null, members: [
    { profile_id: "FER", profiles: { id: "FER", username: "fer", display_name: "Fernando" } },
    { profile_id: "CRIS", profiles: { id: "CRIS", username: "cris", display_name: "Cris" } },
    { profile_id: "ANA", profiles: { id: "ANA", username: "ana", display_name: "Ana" } },
    { profile_id: "ME", profiles: { id: "ME", username: "yo", display_name: "Arthur" } }] };
  const iso = min => new Date(Date.now() + min * 60000).toISOString();
  window.__iso = iso;
  window.__fila = (id, o) => Object.assign({ id, created_by: "FER", invited_id: "ME", proposed_by: "FER", starts_at: iso(120), variant: null, time_initial: null, time_increment: null, note: null, status: "propuesta", closed_by: null }, o);
  const db = window.__db;
  sb.from = table => {
    const st = { table, eq: null, inn: null };
    const api = {
      select() { return api; }, order() { return api; }, limit() { return api; }, single() { return api; }, maybeSingle() { return api; }, eq(c, v) { st.eq = [c, v]; return api; }, in(c, v) { st.inn = [c, v]; return api; },
      then(res, rej) {
        let r;
        if (table === "convocatorias") r = db.errorFrom ? { data: null, error: db.errorFrom } : { data: JSON.parse(JSON.stringify(db.rows)), error: null };
        else if (table === "convocatoria_mensajes") r = { data: db.msgs.filter(m => m.convocatoria_id === st.eq[1]), error: null };
        else if (table === "profiles") r = { data: db.members.map(m => m.profiles).filter(p => !st.inn || st.inn[1].includes(p.id)), error: null };
        else if (table === "club_members") r = { data: db.members, error: null };
        else r = { data: null, error: null };
        return Promise.resolve(r).then(res, rej);
      } };
    return api;
  };
  sb.rpc = async (name, args) => {
    db.calls.push({ name, args });
    if (db.rpcError && db.rpcError[name]) return { data: null, error: { message: db.rpcError[name] } };
    if (name === "conv_responder") { const r = db.rows.find(x => x.id === args.p_id); if (r && args.p_accion === "aceptar") r.status = "pactada"; if (r && args.p_accion === "rechazar") { r.status = "rechazada"; r.closed_by = "ME"; } if (r && args.p_accion === "otra") { r.proposed_by = "ME"; r.starts_at = args.p_starts; } }
    if (name === "conv_cancelar") { const r = db.rows.find(x => x.id === args.p_id); if (r) { r.status = "cancelada"; r.closed_by = "ME"; } }
    if (name === "conv_mensaje") db.msgs.push({ id: "m" + db.msgs.length, convocatoria_id: args.p_id, author_id: "ME", body: args.p_texto, created_at: new Date().toISOString() });
    if (name === "conv_proponer") { db.rows.push(window.__fila("N" + db.rows.length, { created_by: "ME", invited_id: args.p_invited, proposed_by: "ME", starts_at: args.p_starts, variant: args.p_variant, time_initial: args.p_ti })); return { data: "nuevo", error: null }; }
    if (name === "conv_avisos_activos") return { data: args.p_user !== "CRIS", error: null };
    if (db.rpcError && db.rpcError[name]) return { data: null, error: { message: db.rpcError[name] } };
    return { data: null, error: null };
  };
  window.__toasts = [];
  window.showBigToast = (m) => { window.__toasts.push("B:" + m); };
  window.showGlobalToast = (m) => { window.__toasts.push("G:" + m); };
  accountProfile = { id: "ME", username: "yo", display_name: "Arthur" };
  clubIsMember = true;
  const pc = document.getElementById("panel-club"); pc.hidden = false;
  document.getElementById("club-member-area").hidden = false; document.getElementById("club-joiner") && (document.getElementById("club-joiner").hidden = true);
  pc.classList.remove("collapsed");
};

(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch(); const errores = [];
  for (const [nombre, vp] of [["escritorio", { width: 1000, height: 1300 }], ["movil", { width: 390, height: 844 }]]) {
    console.log("## " + nombre);
    const page = await browser.newPage({ viewport: vp, hasTouch: nombre === "movil", isMobile: nombre === "movil", deviceScaleFactor: nombre === "movil" ? 2 : 1 });
    page.on("pageerror", e => errores.push(nombre + ": " + String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.querySelectorAll("#intro,.intro,.intro-ov").forEach(e => e.remove()); document.documentElement.classList.remove("intro-abierta"); });
    await page.evaluate(PREPARAR);
    const I = (fn, ...a) => page.evaluate(fn, ...a);

    // ---------- 1. tarjetas por estado
    await I(async () => {
      const f = window.__fila;
      window.__db.rows = [
        f("R1", { variant: "dark", time_initial: 600, note: "¿Una de Dark?" }),                                  // me proponen
        f("R2", { created_by: "ME", invited_id: "CRIS", proposed_by: "ME", starts_at: window.__iso(60 * 26) }),    // propuse yo
        f("R3", { created_by: "ME", invited_id: "ANA", proposed_by: "ME", starts_at: window.__iso(25), status: "pactada", time_initial: 0 }),
        f("R4", { created_by: "FER", invited_id: "ME", status: "en_juego", starts_at: window.__iso(-5) }),
        f("R5", { status: "cancelada", closed_by: "FER" })];
      clubShowTab("conv"); await convLoad();
    });
    const t1 = await I(() => {
      const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
      const cards = all("#club-view-conv .cg-card"), btns = id => [...(document.querySelector('#club-view-conv .cg-card[data-cid="' + id + '"]')?.querySelectorAll(".cg-acts button") || [])].map(b => b.textContent.replace("•", "").trim());
      return { vista: !q("#club-view-conv").hidden, tab: !q("#club-tab-conv").hidden, n: cards.length, act: q("#conv-list-act").childElementCount, pact: q("#conv-list-pact").childElementCount, wait: q("#conv-list-wait").childElementCount,
        gAct: !q("#conv-group-act").hidden, badge: q("#club-tab-conv-count").textContent, badgeVis: !q("#club-tab-conv-count").hidden,
        b1: btns("R1"), b2: btns("R2"), b3: btns("R3"), b4: btns("R4"), tieneR5: !!q('[data-cid="R5"]'),
        txt1: q('[data-cid="R1"]').textContent, txt2: q('[data-cid="R2"]').textContent, txt3: q('[data-cid="R3"]').textContent, txt4: q('[data-cid="R4"]').textContent,
        vacio: q("#conv-empty").hidden,
        pestanas: all("#club-tabs button").filter(b => b.offsetParent).map(b => ({ t: b.textContent.trim(), corta: b.scrollWidth > b.clientWidth + 1 })) };
    });
    ok(t1.pestanas.length >= 4 && t1.pestanas.every(b => !b.corta), "ninguna pestaña del Clan queda cortada en " + nombre + " → " + t1.pestanas.map(b => b.t + (b.corta ? " (CORTADA)" : "")).join(", "));
    ok(t1.vista && t1.tab && t1.n === 4 && !t1.tieneR5, "se pintan 4 tarjetas activas y la cancelada no se muestra");
    ok(t1.act === 1 && t1.wait === 1 && t1.pact === 2 && t1.gAct, "grupos: 1 «Te toca a ti», 1 «Esperando respuesta», 2 «Pactadas» (pactada + en juego)");
    ok(t1.badge === "1" && t1.badgeVis && t1.vacio, "la pestaña muestra el contador 1 (lo que espera mi respuesta)");
    ok(t1.b1.join("|") === "¡Va!|Otra hora|No puedo|Mensajes", "me proponen: ¡Va! / Otra hora / No puedo / Mensajes → " + t1.b1.join("|"));
    ok(t1.b2.join("|") === "Cancelar|Mensajes", "yo propuse: Cancelar / Mensajes → " + t1.b2.join("|"));
    ok(t1.b3.join("|") === "Retar ahora|Cancelar|Mensajes", "pactada: Retar ahora / Cancelar / Mensajes → " + t1.b3.join("|"));
    ok(t1.b4.length === 0, "partida en curso: sin botones");
    ok(/Fernando/.test(t1.txt1) && /Dark Chess/.test(t1.txt1) && /10 min/.test(t1.txt1) && /¿Una de Dark\?/.test(t1.txt1) && /te convoca a esta hora/.test(t1.txt1), "tarjeta R1: nombre, variante, reloj, nota y estado");
    ok(/Cris/.test(t1.txt2) && /Esperando la respuesta de Cris/.test(t1.txt2) && /en 1 día(?!s)/.test(t1.txt2), "tarjeta R2: «Esperando la respuesta de Cris.» y «en 1 día» (singular)");
    ok(/Sin reloj/.test(t1.txt3) && /en 25 min/.test(t1.txt3) && /Batalla pactada/.test(t1.txt3), "tarjeta R3: «Sin reloj», «en 25 min», «Batalla pactada.»");
    ok(/Partida en curso/.test(t1.txt4), "tarjeta R4: «Partida en curso.»");
    if (SHOTS) { await (await page.$("#panel-club")).screenshot({ path: path.join(SHOTS, nombre + "_conv_tarjetas.png") }); }

    // ---------- 2. responder
    const t2 = await I(async () => {
      const find = id => document.querySelector('[data-cid="' + id + '"]');
      [...find("R1").querySelectorAll(".cg-acts button")].find(b => b.textContent === "¡Va!").click();
      await new Promise(r => setTimeout(r, 400));
      const c = window.__db.calls.filter(x => x.name === "conv_responder");
      return { calls: c, enPactadas: !!document.querySelector('#conv-list-pact [data-cid="R1"]'), badgeVis: !document.getElementById("club-tab-conv-count").hidden };
    });
    ok(t2.calls.length === 1 && t2.calls[0].args.p_id === "R1" && t2.calls[0].args.p_accion === "aceptar", "¡Va! llama a conv_responder(R1, 'aceptar')");
    ok(t2.enPactadas && !t2.badgeVis, "tras aceptar la tarjeta pasa a «Pactadas» y el contador se apaga");

    // ---------- 3. otra hora y rechazar
    const t3 = await I(async () => {
      const f = window.__fila; window.__db.rows.push(f("R6", { starts_at: window.__iso(180) })); window.__db.calls.length = 0; await convLoad();
      const find = id => document.querySelector('[data-cid="' + id + '"]'), btn = (id, t) => [...find(id).querySelectorAll(".cg-acts button")].find(b => b.textContent === t);
      btn("R6", "Otra hora").click(); await new Promise(r => setTimeout(r, 100));
      const form = !!find("R6").querySelector(".conv-form input[type=datetime-local]");
      const inp = find("R6").querySelector(".conv-form input[type=datetime-local]"); inp.value = "";
      [...find("R6").querySelectorAll(".conv-form button")].find(b => b.textContent === "Proponer").click(); await new Promise(r => setTimeout(r, 100));
      const sinFecha = { rpc: window.__db.calls.length, nota: document.getElementById("conv-note").textContent };
      const d = new Date(Date.now() + 5 * 3600e3); const p = n => String(n).padStart(2, "0");
      inp.value = d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
      find("R6").querySelector(".conv-form input[type=text]").value = "Mejor más tarde";
      [...find("R6").querySelectorAll(".conv-form button")].find(b => b.textContent === "Proponer").click(); await new Promise(r => setTimeout(r, 400));
      const otra = window.__db.calls.find(x => x.name === "conv_responder");
      const enEspera = !!document.querySelector('#conv-list-wait [data-cid="R6"]');
      window.__db.rows.push(f("R7", {})); await convLoad();
      btn("R7", "No puedo").click(); await new Promise(r => setTimeout(r, 400));
      const rech = window.__db.calls.filter(x => x.name === "conv_responder").pop();
      return { form, sinFecha, otra, enEspera, rech, r7: !!document.querySelector('[data-cid="R7"]') };
    });
    ok(t3.form, "«Otra hora» abre el formulario dentro de la tarjeta");
    ok(t3.sinFecha.rpc === 0 && /Elige el día y la hora/.test(t3.sinFecha.nota), "sin fecha no se llama al servidor y avisa");
    ok(t3.otra && t3.otra.args.p_accion === "otra" && /^\d{4}-\d{2}-\d{2}T/.test(t3.otra.args.p_starts) && t3.otra.args.p_note === "Mejor más tarde", "«Proponer» manda p_accion='otra' con la fecha en ISO y la nota");
    ok(t3.enEspera, "tras proponer otra hora la tarjeta pasa a «Esperando respuesta»");
    ok(t3.rech.args.p_accion === "rechazar" && !t3.r7, "«No puedo» manda 'rechazar' y la tarjeta desaparece");

    // ---------- 4. cancelar con confirmación
    const t4 = await I(async () => {
      const btn = (id, t) => [...document.querySelector('[data-cid="' + id + '"]').querySelectorAll(".cg-acts button")].find(b => b.textContent === t);
      window.__db.calls.length = 0; let pregunta = "";
      window.confirm = m => { pregunta = m; return false; }; btn("R2", "Cancelar").click(); await new Promise(r => setTimeout(r, 200));
      const sin = window.__db.calls.filter(x => x.name === "conv_cancelar").length;
      window.confirm = () => true; btn("R2", "Cancelar").click(); await new Promise(r => setTimeout(r, 400));
      return { pregunta, sin, con: window.__db.calls.filter(x => x.name === "conv_cancelar").map(x => x.args.p_id), sigue: !!document.querySelector('[data-cid="R2"]') };
    });
    ok(/Se borrarán sus mensajes/.test(t4.pregunta) && t4.sin === 0, "Cancelar pregunta («se borrarán sus mensajes») y, si dices no, no llama al servidor");
    ok(t4.con.join() === "R2" && !t4.sigue, "confirmado: conv_cancelar(R2) y la tarjeta desaparece");

    // ---------- 5. hilo de mensajes
    const t5 = await I(async () => {
      window.__db.msgs = [{ id: "m1", convocatoria_id: "R3", author_id: "ANA", body: "Voy conectándome", created_at: new Date().toISOString() }];
      const btn = (id, t) => [...document.querySelector('[data-cid="' + id + '"]').querySelectorAll(".cg-acts button")].find(b => b.textContent.replace("•", "").trim() === t);
      btn("R3", "Mensajes").click(); await new Promise(r => setTimeout(r, 400));
      const card = document.querySelector('[data-cid="R3"]');
      const msgs = [...card.querySelectorAll(".conv-msg")].map(m => m.textContent);
      const aviso = /se borran solos/.test(card.querySelector(".conv-thread").textContent);
      const inp = card.querySelector(".conv-send input"); inp.value = "Listo, aquí estoy"; inp.dispatchEvent(new Event("input"));
      card.querySelector(".conv-send button").click(); await new Promise(r => setTimeout(r, 500));
      const env = window.__db.calls.filter(x => x.name === "conv_mensaje");
      const tras = [...document.querySelector('[data-cid="R3"]').querySelectorAll(".conv-msg")].map(m => m.textContent);
      const mineCls = !!document.querySelector('[data-cid="R3"] .conv-msg.mine');
      // mensaje entrante con el hilo ABIERTO: se recarga, sin aviso
      window.__toasts.length = 0; window.__db.msgs.push({ id: "m9", convocatoria_id: "R3", author_id: "ANA", body: "Perfecto", created_at: new Date().toISOString() });
      convOnMsg({ new: { convocatoria_id: "R3", author_id: "ANA" } }); await new Promise(r => setTimeout(r, 400));
      const abierto = { toasts: window.__toasts.slice(), n: document.querySelectorAll('[data-cid="R3"] .conv-msg').length };
      // cerrar el hilo y volver a recibir uno: aviso y punto de «sin leer»
      btn("R3", "Mensajes").click(); await new Promise(r => setTimeout(r, 100));
      window.__toasts.length = 0; convOnMsg({ new: { convocatoria_id: "R3", author_id: "ANA" } }); await new Promise(r => setTimeout(r, 200));
      const cerrado = { toasts: window.__toasts.slice(), punto: !!document.querySelector('[data-cid="R3"] .conv-dot') };
      btn("R3", "Mensajes").click(); await new Promise(r => setTimeout(r, 300));
      return { msgs, aviso, env, tras, mineCls, abierto, cerrado, puntoDespues: !!document.querySelector('[data-cid="R3"] .conv-dot') };
    });
    ok(t5.msgs.length === 1 && /Ana/.test(t5.msgs[0]) && /Voy conectándome/.test(t5.msgs[0]), "el hilo carga los mensajes con el nombre de quien escribe → " + JSON.stringify(t5.msgs));
    ok(t5.aviso, "el hilo avisa que los mensajes se borran solos");
    ok(t5.env.length === 1 && t5.env[0].args.p_id === "R3" && t5.env[0].args.p_texto === "Listo, aquí estoy" && t5.tras.length === 2 && t5.mineCls, "Enviar manda conv_mensaje y el mensaje propio aparece a la derecha");
    ok(t5.abierto.toasts.length === 0 && t5.abierto.n === 3, "mensaje entrante con el hilo abierto: se agrega sin aviso flotante");
    ok(t5.cerrado.toasts.length === 1 && /Ana te escribió en vuestra convocatoria/.test(t5.cerrado.toasts[0]) && t5.cerrado.punto, "con el hilo cerrado: aviso «Ana te escribió…» y punto de «sin leer»");
    ok(!t5.puntoDespues, "al abrir el hilo el punto desaparece");
    if (SHOTS) {
      await page.waitForTimeout(300); await (await page.$("#panel-club")).screenshot({ path: path.join(SHOTS, nombre + "_conv_hilo.png") });
    }

    // ---------- 6. formulario para convocar
    const t6 = await I(async () => {
      window.__db.calls.length = 0; document.getElementById("conv-new").click(); await new Promise(r => setTimeout(r, 300));
      const q = id => document.getElementById(id);
      const abierto = !q("conv-compose").hidden, opciones = [...q("conv-who").options].map(o => o.textContent), sinYo = !opciones.includes("Arthur");
      const fecha = q("conv-when").value;
      q("conv-who").value = "CRIS"; q("conv-who").dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 200));
      const hintCris = { vis: !q("conv-avisos-hint").hidden, txt: q("conv-avisos-hint").textContent };
      q("conv-who").value = "FER"; q("conv-who").dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 200));
      const hintFer = !q("conv-avisos-hint").hidden;
      q("conv-when").value = ""; q("conv-send").click(); await new Promise(r => setTimeout(r, 100));
      const sinHora = { rpc: window.__db.calls.filter(x => x.name === "conv_proponer").length, nota: q("conv-note").textContent };
      q("conv-when").value = fecha; q("conv-variant").value = "dark"; q("conv-clock").value = "600"; q("conv-note-in").value = "¿Jugamos?";
      q("conv-send").click(); await new Promise(r => setTimeout(r, 500));
      const call = window.__db.calls.find(x => x.name === "conv_proponer");
      return { abierto, opciones, sinYo, fecha: !!fecha, hintCris, hintFer, sinHora, call, cerrado: q("conv-compose").hidden, nota: q("conv-note").textContent, nueva: !!document.querySelector('#conv-list-wait [data-cid^="N"]') };
    });
    ok(t6.abierto && t6.sinYo && t6.opciones.length === 3 && t6.fecha, "«Convocar a alguien» abre el formulario con los 3 demás miembros (yo no) y una hora por defecto");
    ok(t6.hintCris.vis && /Cris aún no activó los avisos/.test(t6.hintCris.txt) && !t6.hintFer, "avisa si el convocado no tiene los avisos activos (solo Cris)");
    ok(t6.sinHora.rpc === 0 && /Elige el día y la hora/.test(t6.sinHora.nota), "sin hora no se envía");
    ok(t6.call && t6.call.args.p_invited === "FER" && t6.call.args.p_variant === "dark" && t6.call.args.p_ti === 600 && t6.call.args.p_inc === 0 && t6.call.args.p_note === "¿Jugamos?" && /^\d{4}-\d{2}-\d{2}T.*Z$/.test(t6.call.args.p_starts), "conv_proponer lleva invitado, hora ISO, variante, reloj (600 s, +0) y nota");
    ok(t6.cerrado && /Convocatoria enviada a Fernando/.test(t6.nota) && t6.nueva, "tras enviar: formulario cerrado, «Convocatoria enviada a Fernando.» y la tarjeta aparece en «Esperando respuesta»");

    // ---------- 7. un error del servidor se muestra tal cual (y en inglés si hace falta)
    const t7 = await I(async () => {
      window.__db.rpcError = { conv_proponer: "La hora tiene que ser futura." };
      document.getElementById("conv-new").click(); await new Promise(r => setTimeout(r, 300));
      document.getElementById("conv-send").click(); await new Promise(r => setTimeout(r, 300));
      const nota = document.getElementById("conv-note").textContent, err = document.getElementById("conv-note").classList.contains("err");
      window.__db.rpcError = null; document.getElementById("conv-cancel").click();
      return { nota, err };
    });
    ok(t7.nota === "La hora tiene que ser futura." && t7.err, "el mensaje del servidor se muestra como error: «" + t7.nota + "»");

    // ---------- 8. avisos por diferencia
    const t8 = await I(async () => {
      const f = window.__fila; window.__toasts.length = 0;
      window.__db.rows = [f("A1", { created_by: "ME", invited_id: "FER", proposed_by: "ME" }), f("A2", { created_by: "ME", invited_id: "CRIS", proposed_by: "ME" }), f("A3", { created_by: "ME", invited_id: "ANA", proposed_by: "ME", status: "pactada" }), f("A4", { created_by: "FER", invited_id: "ME", proposed_by: "FER" })];
      await convLoad(); window.__toasts.length = 0;                       // línea base: sin avisos
      const r = id => window.__db.rows.find(x => x.id === id);
      r("A1").status = "pactada"; r("A2").status = "rechazada"; r("A2").closed_by = "CRIS"; r("A3").status = "cancelada"; r("A3").closed_by = "ANA"; r("A4").proposed_by = "ME"; r("A4").created_by = "ME"; r("A4").invited_id = "FER";
      window.__db.rows.push(f("A5", { created_by: "CRIS", invited_id: "ME", proposed_by: "CRIS" }));
      await convLoad(); const primera = window.__toasts.slice(); window.__toasts.length = 0;
      // otra hora de la otra persona: yo propuse A4 → ella contrapropone
      r("A4").proposed_by = "FER"; r("A4").starts_at = window.__iso(400); await convLoad();
      return { primera, otra: window.__toasts.slice() };
    });
    ok(t8.primera.some(x => x.startsWith("B:¡Va! Fernando aceptó tu convocatoria")), "aviso grande cuando aceptan lo que propuse: «¡Va! Fernando aceptó…»");
    ok(t8.primera.some(x => /Cris no puede en esa hora/.test(x)), "aviso cuando rechazan");
    ok(t8.primera.some(x => /Ana canceló la convocatoria/.test(x)), "aviso cuando cancelan");
    ok(t8.primera.some(x => x.startsWith("B:Cris te convoca a una batalla")), "aviso grande cuando me convocan (cita nueva)");
    ok(t8.otra.length === 1 && /Fernando propone otra hora/.test(t8.otra[0]), "aviso cuando la otra persona propone otra hora");
    ok(t8.primera.length === 4, "ni un aviso de más (4 cambios, 4 avisos)");

    // ---------- 9. sin el SQL en la base: la pestaña se oculta sola
    const t9 = await I(async () => {
      window.__db.errorFrom = { code: "42P01", message: 'relation "public.convocatorias" does not exist' };
      clubShowTab("conv"); await convLoad(); await new Promise(r => setTimeout(r, 500));
      return { tab: document.getElementById("club-tab-conv").hidden, vistaOculta: document.getElementById("club-view-conv").hidden, activa: document.getElementById("club-tab-games").getAttribute("aria-selected") };
    });
    ok(t9.tab && t9.vistaOculta && t9.activa === "true", "si la tabla no existe, la pestaña se oculta y se vuelve a Partidas, sin errores → " + JSON.stringify(t9));
    await I(() => { window.__db.errorFrom = null; });

    // ---------- 10. enganches: Realtime, avisos push y La Armería
    const t10 = await I(async () => {
      const calls = []; const ch = { on(ev, cfg, fn) { calls.push(cfg); return ch; }, subscribe() { return ch; } };
      sb.channel = () => ch; clubChannel = null; subscribeClubChannel();
      const cfgs = calls.filter(c => c.table === "convocatorias" || c.table === "convocatoria_mensajes").map(c => c.table + ":" + c.event + ":" + (c.filter || ""));
      clubShowTab("games"); document.getElementById("club-tab-conv").hidden = false;
      pushHandleLink("/?panel=clan&tab=convocatorias"); await new Promise(r => setTimeout(r, 300));
      const abre = !document.getElementById("club-view-conv").hidden;
      // La Armería: interruptor «Convocatorias»
      window.__db.calls.length = 0; const chk = document.getElementById("push-p-citas"); chk.checked = false; await pushSavePrefs();
      const guardado = window.__db.calls.find(x => x.name === "push_set_prefs");
      let intentos = 0; sb.rpc = async (n, a) => { intentos++; return intentos === 1 ? { error: { message: "function push_set_prefs(p_turno ... p_citas) does not exist" } } : { error: null }; };
      await pushSavePrefs();
      return { cfgs, abre, guardado: guardado && guardado.args, intentos, etiqueta: document.getElementById("push-p-citas").parentElement.textContent.trim() };
    });
    ok(t10.cfgs.join(",") === "convocatorias:*:invited_id=eq.ME,convocatorias:*:created_by=eq.ME,convocatoria_mensajes:INSERT:", "el canal del Clan escucha las citas (como invitado y como convocante) y los mensajes: " + t10.cfgs.length + " suscripciones");
    ok(t10.abre, "un aviso con ?panel=clan&tab=convocatorias abre El Clan en esa pestaña");
    ok(t10.guardado && t10.guardado.p_citas === false && t10.etiqueta === "Convocatorias", "La Armería: el interruptor «Convocatorias» llega a push_set_prefs como p_citas");
    ok(t10.intentos === 2, "si la base aún no tiene la función de 5 parámetros, reintenta con la de 4");

    // ---------- 11. inglés
    await I(() => { window.__db.rows = [window.__fila("E1", { variant: "dark", time_initial: 600, note: "Una?" }), window.__fila("E2", { created_by: "ME", invited_id: "CRIS", proposed_by: "ME", starts_at: window.__iso(25) }), window.__fila("E3", { created_by: "ME", invited_id: "ANA", proposed_by: "ME", status: "pactada", starts_at: window.__iso(95) })]; clubShowTab("conv"); return convLoad(); });
    await I(() => setLang("en")); await page.waitForTimeout(500);
    const t11 = await I(async () => {
      const q = s => document.querySelector(s);
      document.getElementById("conv-new").click(); await new Promise(r => setTimeout(r, 400));
      const form = document.getElementById("conv-compose").textContent;
      return { tab: q("#club-tab-conv").textContent, hint: q("#club-view-conv .free-hint").textContent, nuevo: q("#conv-new").textContent, e1: q('[data-cid="E1"]').textContent, e2: q('[data-cid="E2"]').textContent, e3: q('[data-cid="E3"]').textContent, form,
        grupos: [...document.querySelectorAll("#club-view-conv h3")].filter(h => h.offsetParent).map(h => h.textContent.replace(/\d+/g, "").trim()) };
    });
    ok(/Summons/.test(t11.tab) && /Agree with someone in the Clan/.test(t11.hint) && /Summon someone/.test(t11.nuevo), "EN: pestaña «Summons», leyenda y botón");
    ok(/Fernando summons you at this time/.test(t11.e1) && /I'm in!/.test(t11.e1) && /Another time/.test(t11.e1) && /I can't/.test(t11.e1) && /Messages/.test(t11.e1), "EN: tarjeta de una propuesta recibida y sus botones → " + t11.e1.slice(0, 160));
    ok(/Waiting for Cris's reply/.test(t11.e2) && /in 25 min/.test(t11.e2) && /Cancel/.test(t11.e2), "EN: «Waiting for Cris's reply.» y «in 25 min» → " + t11.e2.slice(0, 160));
    ok(/Battle agreed/.test(t11.e3) && /Challenge now/.test(t11.e3), "EN: «Battle agreed.» y «Challenge now»");
    ok(/Who you are summoning/.test(t11.form) && /Day and time/.test(t11.form) && /Variant \(optional\)/.test(t11.form) && /Clock \(optional\)/.test(t11.form) && /Send summons/.test(t11.form), "EN: formulario completo traducido");
    ok(t11.grupos.join("|") === "Your turn|Agreed|Awaiting reply" || /Agreed/.test(t11.grupos.join("|")), "EN: encabezados de grupo → " + t11.grupos.join("|"));
    const sinTraducir = await I(() => {
      const re = /[áéíóúñ¿¡]|\b(Elige|Escribe|Todavía|Cancelar|Enviar|Mensajes|convoca|Esperando|Batalla|Pactadas|reloj|hora)\b/;
      return [...document.querySelectorAll("#club-view-conv *")].filter(e => e.children.length === 0 && e.offsetParent && re.test(e.textContent) && !e.closest(".cg-name")).map(e => e.textContent.trim()).filter(t => !/Dark|Fernando|Cris|Ana/.test(t) || /[áéíóúñ¿¡]/.test(t));
    });
    ok(sinTraducir.length === 0, "EN: ningún texto de la pestaña se queda en español" + (sinTraducir.length ? " → " + sinTraducir.join(" | ") : ""));
    if (SHOTS) { await (await page.$("#panel-club")).screenshot({ path: path.join(SHOTS, nombre + "_conv_en.png") }); }
    await I(() => setLang("es"));
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
