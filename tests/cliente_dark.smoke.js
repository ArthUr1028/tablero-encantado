// Prueba de humo del cliente de Dark Chess en línea (hito 1), con Supabase simulado: no toca ninguna base real.
// Uso: node tests/cliente_dark.smoke.js      (necesita playwright-core y un Chromium; busca /opt/node-tools y /opt/pw-browsers)
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

let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };

(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());   // sin red externa
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  // 1) El reto ofrece Dark Chess solo en vivo
  const r1 = await page.evaluate(() => {
    const sel = document.getElementById("club-compose-variant");
    const opt = sel.querySelector('option[value="dark"]');
    const out = { existe: !!opt, textoOpt: opt && opt.textContent };
    setClubKind("live"); out.vivoActiva = !opt.disabled && !opt.hidden;
    sel.value = "dark"; setClubKind("async");
    out.asyncApagada = opt.disabled && opt.hidden; out.asyncVuelveAClasico = sel.value === "clasico";
    setClubKind("live"); out.vivoReactiva = !opt.disabled && !opt.hidden;
    return out;
  });
  ok(r1.existe, "el selector de reto tiene la opción Dark Chess (" + r1.textoOpt + ")");
  ok(r1.vivoActiva, "en «En vivo» la opción está activa");
  ok(r1.asyncApagada && r1.asyncVuelveAClasico, "en «Asíncrona» se apaga y, si estaba elegida, vuelve a Clásico");
  ok(r1.vivoReactiva, "al volver a «En vivo» se reactiva");

  // 2) Entrar a una partida oscura (Supabase simulado)
  const r2 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111", RIVAL = "22222222-2222-2222-2222-222222222222", GID = "00000000-0000-0000-0000-0000000000dd";
    const tablas = {
      profiles: { display_name: "Rival" },
      games: { id: GID, variant: "dark", status: "en_curso", white_id: YO, black_id: RIVAL, ply_count: 0, draw_offered_by: null,
               time_control_initial_seconds: null, time_control_increment_seconds: null, white_time_left_ms: null, black_time_left_ms: null,
               turn_started_at: new Date().toISOString(), paused_by: null, paused_at: null, white_pauses_used: 0, black_pauses_used: 0 },
      game_moves: [], dark_obs: [], game_chat: [], game_messages: []
    };
    const llamadas = [];
    const qb = tabla => {
      const q = { _t: tabla };
      for (const m of ["select", "eq", "order", "in", "or", "limit", "neq", "gt", "lt", "is"]) q[m] = (...a) => { q["_" + m] = a; return q; };
      const dato = () => { const d = tablas[tabla]; return d === undefined ? [] : d; };
      q.maybeSingle = () => Promise.resolve({ data: Array.isArray(dato()) ? null : dato(), error: null });
      q.single = q.maybeSingle;
      q.insert = (...a) => { llamadas.push(["insert", tabla, a]); return Promise.resolve({ data: null, error: null }); };
      q.update = (...a) => { llamadas.push(["update", tabla, a]); return Promise.resolve({ data: [], error: null }); };
      q.then = (res, rej) => Promise.resolve({ data: dato(), error: null }).then(res, rej);
      return q;
    };
    sb.from = qb;
    const canales = [];
    sb.channel = nombre => { const c = { nombre, escuchas: [], on(t, f, cb) { c.escuchas.push(f.table); return c; }, subscribe(cb) { try { cb("SUBSCRIBED"); } catch (e) {} return c; }, unsubscribe() {}, send() {} }; canales.push(c); return c; };
    sb.removeChannel = () => {};
    sb.rpc = (n, a) => { llamadas.push(["rpc", n, a]); return Promise.resolve({ data: null, error: null }); };
    accountProfile = { id: YO, username: "yo", display_name: "Yo" };

    await enterLiveGame({ id: GID, variant: "dark", status: "en_curso", white_id: YO, black_id: RIVAL });
    await new Promise(r => setTimeout(r, 300));

    const info = {
      liveDark: !!(liveGame && liveGame.dark), miColor: liveGame && liveGame.myColor,
      obsIniciales: liveGame && liveGame.darkObs.length,
      escuchas: canales.length ? canales[canales.length - 1].escuchas : [],
      jugadasLocales: game.sans.length,
      piezasVisibles: boardEl.querySelectorAll(".piece").length, piezasNegras: boardEl.querySelectorAll(".piece.b").length, casillasEnNiebla: boardEl.querySelectorAll(".cell.fog").length
    };
    // 4) Una observación nueva por Realtime se guarda (sin dibujar todavía)
    handleDarkObs({ new: { game_id: GID, viewer: YO, ply: 1, obs: { ply: 1, mover: "w", turn: "b", lit: ["7,4"], pieces: { "7,4": "wk" }, capture: false, capSq: null, mine: { from: [6,4], to: [4,4], promo: null, san: "e4" } } } });
    info.obsTrasEvento = liveGame.darkObs.length;
    handleDarkObs({ new: { game_id: GID, viewer: RIVAL, ply: 2, obs: { ply: 2 } } });   // de otro espectador: se ignora
    info.obsAjenaIgnorada = liveGame.darkObs.length === 1;
    liveGame.darkObs.length = 0; darkRebuild(); render();   // dejar la partida limpia para la prueba siguiente
    return info;
  });
  console.log("  datos:", JSON.stringify(r2));
  ok(r2.liveDark && r2.miColor === "w", "se entra a la partida como oscura y con mi color");
  ok(r2.obsIniciales === 0, "sin observaciones al inicio (la jugada 0 no tiene)");
  ok(r2.escuchas.includes("dark_obs") && r2.escuchas.includes("games"), "se suscribe a dark_obs y games");
  ok(r2.jugadasLocales === 0, "el tablero local arranca sin jugadas");
  ok(r2.piezasVisibles === 16 && r2.piezasNegras === 0, "la niebla oculta al rival desde el DOM: solo se ven mis 16 piezas (" + r2.piezasVisibles + " visibles, " + r2.piezasNegras + " negras)");
  ok(r2.casillasEnNiebla === 32, "32 casillas en niebla: de 64, 32 quedan iluminadas (mis 16 piezas + las 16 casillas de las filas 3 y 4 que alcanzan los peones) — real: " + r2.casillasEnNiebla);
  ok(r2.obsTrasEvento === 1 && r2.obsAjenaIgnorada, "una observación propia nueva se guarda y una ajena se ignora");
  // 3) Jugar de verdad contra un árbitro simulado: el cliente pide, el «servidor» responde con observaciones
  const r3 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    const out = {};
    let truth = parseFEN(VARIANT_START.dark), ply = 0;
    const sqs = m => m ? (m.capture ? (m.ep ? [m.from[0], m.to[1]] : m.to) : null) : null;
    const obsFor = (n, color, mover, mv, san, cap) => {
      const lit = [], pieces = {};
      for(const k of fogVisible(n, color)){ lit.push(k); const [r, c] = k.split(",").map(Number); if(n.board[r][c]) pieces[k] = n.board[r][c]; }
      const o = { ply, mover, turn: n.turn, lit, pieces, capture: !!cap, capSq: cap };
      if(color === mover) o.mine = { from: mv.from, to: mv.to, promo: mv.promo || null, san };
      return o;
    };
    const jugar = (uci) => { const mv = matchUci(truth, uci); const r = moveWithSAN(truth, mv); const cap = sqs(mv); const by = truth.turn; truth = r.n; ply++;
      return { w: obsFor(truth, "w", by, mv, r.san, cap), b: obsFor(truth, "b", by, mv, r.san, cap) }; };
    const llamadas = []; let modo = "ok";
    Object.defineProperty(sb, "functions", { configurable: true, value: { invoke: async (nombre, args) => {
      llamadas.push([nombre, args.body]);
      if(modo === "ilegal") return { data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: async () => ({ error: "Jugada ilegal." }) } } };
      const mv = legalMoves(truth).find(m => sameSq(m.from, args.body.from) && sameSq(m.to, args.body.to));
      const o = jugar(moveUci(mv, truth.board));
      return { data: { ok: true, ply, result: null, obs: o.w }, error: null };
    } } });
    const tick = () => new Promise(r => setTimeout(r, 120));
    const negras = () => boardEl.querySelectorAll(".piece.b").length;
    liveGame.darkObs.length = 0; darkRebuild(); render();
    out.antes = { turno: liveState().turn, objetivosE2: legalMoves(liveState()).filter(m => sameSq(m.from, [6,4])).map(m => sqName(m.to)).join(",") };
    tryMove([6,4], [4,4]); await tick();
    out.llamada = llamadas[0] ? JSON.stringify(llamadas[0][1]) : null;
    out.tras1 = { jugadas: game.sans.length, turno: liveState().turn, negras: negras(), obs: liveGame.darkObs.length };
    if(!llamadas.length) return out;
    const o2 = jugar("e7e5");
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 2, obs: o2.w } }); await tick();
    out.tras2 = { jugadas: game.sans.length, turno: liveState().turn, negras: negras(), jugadaRival: game.moves[1], lista: movesEl.textContent.replace(/\s+/g, " ").trim() };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 2, obs: o2.w } }); await tick();
    out.sinDuplicar = game.sans.length === 2;
    modo = "ilegal";
    tryMove([6,3], [4,3]); await tick();
    out.rechazo = { jugadas: game.sans.length, turno: liveState().turn, toast: Array.from(document.querySelectorAll("[class*=toast], #global-toast, .toast")).map(e => e.textContent).join(" | ") };
    return out;
  });
  console.log("  datos3:", JSON.stringify(r3));
  ok(r3.antes.turno === "w" && r3.antes.objetivosE2 === "e3,e4", "al inicio mueven blancas y e2 ofrece e3,e4 (" + r3.antes.objetivosE2 + ")");
  ok(r3.llamada && JSON.parse(r3.llamada).game_id && JSON.stringify(JSON.parse(r3.llamada).from) === "[6,4]" && JSON.stringify(JSON.parse(r3.llamada).to) === "[4,4]", "mover llama al árbitro con origen y destino como [fila,col]: " + r3.llamada);
  ok(r3.tras1.jugadas === 1 && r3.tras1.turno === "b" && r3.tras1.negras === 0 && r3.tras1.obs === 1, "tras mi jugada: 1 jugada, turno de negras, ninguna negra a la vista, 1 observación");
  ok(r3.tras2.jugadas === 2 && r3.tras2.turno === "w" && r3.tras2.negras === 0, "tras la jugada oculta del rival: 2 jugadas, mi turno, sin negras a la vista (" + r3.tras2.negras + ")");
  ok(r3.tras2.jugadaRival === null, "de la jugada del rival no queda origen, destino ni pieza");
  ok(!/e5|e7/.test(r3.tras2.lista), "la lista de jugadas no delata la jugada del rival: «" + r3.tras2.lista + "»");
  ok(r3.sinDuplicar, "la misma observación por Realtime y por respuesta no duplica la jugada");
  ok(r3.rechazo.jugadas === 2 && r3.rechazo.turno === "w" && /ilegal/i.test(r3.rechazo.toast), "una jugada rechazada se deshace sola y avisa (" + r3.rechazo.toast + ")");

  // 4) Capturas en ambos sentidos, sonido de captura del rival y revelación al terminar
  const r4 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    const out = {};
    let truth = parseFEN(VARIANT_START.dark), ply = 0; const hist = [];
    const obsFor = (n, color, mover, mv, san, cap) => {
      const lit = [], pieces = {};
      for(const k of fogVisible(n, color)){ lit.push(k); const [r, c] = k.split(",").map(Number); if(n.board[r][c]) pieces[k] = n.board[r][c]; }
      const o = { ply, mover, turn: n.turn, lit, pieces, capture: !!cap, capSq: cap };
      if(color === mover) o.mine = { from: mv.from, to: mv.to, promo: mv.promo || null, san };
      return o;
    };
    const jugar = uci => { const mv = matchUci(truth, uci); const r = moveWithSAN(truth, mv); const cap = mv.capture ? (mv.ep ? [mv.from[0], mv.to[1]] : mv.to) : null; const by = truth.turn; truth = r.n; ply++;
      hist.push({ ply, uci, san: r.san, by });
      return { w: obsFor(truth, "w", by, mv, r.san, cap) }; };
    Object.defineProperty(sb, "functions", { configurable: true, value: { invoke: async (n, a) => {
      const mv = legalMoves(truth).find(m => sameSq(m.from, a.body.from) && sameSq(m.to, a.body.to));
      const o = jugar(moveUci(mv, truth.board)); return { data: { ok: true, ply, result: null, obs: o.w }, error: null };
    } } });
    const sonidos = []; const sfxOrig = SFX.move; SFX.move = (mv, oc) => { sonidos.push(mv && mv.capture ? "captura" : "paso"); };
    const tick = () => new Promise(r => setTimeout(r, 150));
    liveGame.darkObs.length = 0; darkRebuild(); render(); await tick();
    tryMove([6,4], [4,4]); await tick();                       // 1. e4
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 2, obs: jugar("d7d5").w } }); await tick();   // ...d5 (oculta: e4 no la alumbra)
    out.d5Visible = !!boardEl.querySelector(".cell:not(.fog) .piece.b");
    tryMove([4,4], [3,3]); await tick();                       // 2. exd5 (captura: d5 estaba iluminada)
    out.miCaptura = { jugadas: game.sans.length, cap: game.moves[2] && game.moves[2].capture, negrasEnVista: boardEl.querySelectorAll(".piece.b").length };
    sonidos.length = 0;
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 4, obs: jugar("d8d5").w } }); await tick();   // ...Dxd5: la dama captura mi peón
    out.capturaRival = { jugadas: game.sans.length, mov: game.moves[3], sonidos: sonidos.slice(), lista: movesEl.textContent.replace(/\s+/g, " ").trim(), negrasEnVista: boardEl.querySelectorAll(".piece.b").length };
    // Fin de partida: la fila games trae el resultado y dark_reveal entrega la película verdadera
    sb.rpc = async (n, a) => n === "dark_reveal" ? { data: { fen: toFEN(truth), moves: hist, result: "0-1" }, error: null } : { data: null, error: null };
    applyGameRow({ id: liveGame.id, status: "finalizada", result: "0-1", winner_id: "22222222-2222-2222-2222-222222222222", draw_offered_by: null, paused_by: null });
    await tick(); await tick();
    out.reveal = { revelada: !!liveGame.darkRevealed, jugadas: game.sans.length, san2: game.sans[1], sinNiebla: boardEl.querySelectorAll(".cell.fog").length, negras: boardEl.querySelectorAll(".piece.b").length, bloqueado: darkLocked() };
    SFX.move = sfxOrig;
    return out;
  });
  console.log("  datos4:", JSON.stringify(r4));
  ok(r4.d5Visible, "el peón negro en d5 SÍ se ve: mi peón de e4 lo amenaza (una pieza capturable está iluminada)");
  ok(r4.miCaptura.jugadas === 3 && r4.miCaptura.cap === "bp", "mi captura queda registrada con la pieza capturada (bp)");
  ok(r4.capturaRival.jugadas === 4 && r4.capturaRival.mov && r4.capturaRival.mov.capture === "wp" && r4.capturaRival.mov.hidden, "la captura del rival sobre mi peón se registra sin delatar de dónde vino");
  ok(r4.capturaRival.sonidos.includes("captura"), "suena la captura aunque la haya hecho el rival (" + r4.capturaRival.sonidos.join(",") + ")");
  ok(/×d5/.test(r4.capturaRival.lista) && !/[DQ]x?d5/.test(r4.capturaRival.lista), "la lista dice «×d5» y no la notación del rival: «" + r4.capturaRival.lista + "»");
  ok(r4.reveal.revelada && r4.reveal.jugadas === 4 && r4.reveal.san2 === "d5", "al terminar se revela la película verdadera (4 jugadas, la 2.ª es d5)");
  ok(r4.reveal.sinNiebla === 0 && r4.reveal.negras === 15, "terminada la partida cae la niebla (" + r4.reveal.sinNiebla + " casillas en niebla, " + r4.reveal.negras + " negras visibles)");

  // 5) Los pasos del rival suenan (con el lado del enroque) y avisan cuando te toca
  const r5 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; darkRebuild(); render();
    const sonidos = [], avisos = []; const m0 = SFX.move, t0 = SFX.turn;
    SFX.move = (mv, oc) => sonidos.push(JSON.stringify({ cap: !!(mv && mv.capture), castle: mv && mv.castle || null, side: !!(mv && mv.dkSide), promo: mv && mv.promo || null }));
    SFX.turn = () => avisos.push(1);
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const lit = ["7,4", "6,4", "5,4"], pieces = { "7,4": "wk", "6,4": "wp" };
    const mia = { ply: 1, mover: "w", turn: "b", lit, pieces, capture: false, capSq: null, castle: null, mine: { from: [6,4], to: [5,4], promo: null, san: "e3" } };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 1, obs: mia } }); await tick(900);
    const trasMia = { sonidos: sonidos.length, avisos: avisos.length };            // mi propia jugada: suena, NO avisa turno
    sonidos.length = 0;
    const riv1 = { ply: 2, mover: "b", turn: "w", lit, pieces, capture: false, capSq: null, castle: null };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 2, obs: riv1 } }); await tick(900);
    const paso = { sonidos: sonidos.slice(), avisos: avisos.length };              // paso oculto del rival: suena + avisa
    sonidos.length = 0; avisos.length = 0;
    const mia2 = { ply: 3, mover: "w", turn: "b", lit, pieces, capture: false, capSq: null, castle: null, mine: { from: [5,4], to: [4,4], promo: null, san: "e4" } };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 3, obs: mia2 } }); await tick(300); sonidos.length = 0; avisos.length = 0;
    const riv2 = { ply: 4, mover: "b", turn: "w", lit, pieces, capture: false, capSq: null, castle: "Q", promoted: true };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 4, obs: riv2 } }); await tick(900);
    const largo = { sonidos: sonidos.slice(), avisos: avisos.length };
    sonidos.length = 0; avisos.length = 0;
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 4, obs: riv2 } }); await tick(900);   // repetido: ni suena ni avisa otra vez
    const repetido = { sonidos: sonidos.length, avisos: avisos.length };
    SFX.move = m0; SFX.turn = t0;
    return { trasMia, paso, largo, repetido };
  });
  console.log("  datos5:", JSON.stringify(r5));
  ok(r5.trasMia.sonidos === 1 && r5.trasMia.avisos === 0, "mi propia jugada suena pero no me avisa de turno");
  ok(r5.paso.sonidos.length === 1 && JSON.parse(r5.paso.sonidos[0]).cap === false && r5.paso.avisos === 1, "el paso oculto del rival suena y me avisa que me toca");
  ok(r5.largo.sonidos.length === 1 && JSON.parse(r5.largo.sonidos[0]).castle === "Q" && JSON.parse(r5.largo.sonidos[0]).side && JSON.parse(r5.largo.sonidos[0]).promo === "q", "el enroque del rival llega al sonido con su lado y la coronación se oye tal cual (sin decir a qué pieza)");
  ok(r5.largo.avisos === 1, "también avisa de turno tras ese enroque");
  ok(r5.repetido.sonidos === 0 && r5.repetido.avisos === 0, "la misma observación repetida no suena ni avisa otra vez");

  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores.slice(0, 3).join(" || ") : ""));

  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("Error de la prueba:", e); process.exit(2); });
