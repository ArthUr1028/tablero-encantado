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
    out.quakeMia = boardEl.classList.contains("quake");
    await new Promise(r => setTimeout(r, 600));
    out.miCaptura = { jugadas: game.sans.length, cap: game.moves[2] && game.moves[2].capture, negrasEnVista: boardEl.querySelectorAll(".piece.b").length };
    sonidos.length = 0;
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 4, obs: jugar("d8d5").w } }); await tick();   // ...Dxd5: la dama captura mi peón
    out.quakeRival = boardEl.classList.contains("quake");
    out.capturaRival = { jugadas: game.sans.length, mov: game.moves[3], sonidos: sonidos.slice(), lista: movesEl.textContent.replace(/\s+/g, " ").trim(), negrasEnVista: boardEl.querySelectorAll(".piece.b").length };
    // Fin de partida: la fila games trae el resultado y dark_reveal entrega la película verdadera
    sb.rpc = async (n, a) => n === "dark_reveal" ? { data: { fen: toFEN(truth), moves: hist, result: "0-1" }, error: null } : { data: null, error: null };
    applyGameRow({ id: liveGame.id, status: "finalizada", result: "0-1", winner_id: "22222222-2222-2222-2222-222222222222", draw_offered_by: null, paused_by: null });
    await tick(); await tick();
    out.reveal = { revelada: !!liveGame.darkRevealed, jugadas: game.sans.length, san2: game.sans[1], sinNiebla: boardEl.querySelectorAll(".cell.fog").length, negras: boardEl.querySelectorAll(".piece.b").length, bloqueado: darkLocked() };
    // 2.117: el jaque mate (rey capturado) suena solo si el final ocurrió en vivo; al reabrir una partida vieja, no
    const mates = []; const mate0 = SFX.mate, oc0 = outcome; SFX.mate = () => mates.push(1); outcome = () => "checkmate";
    const fila = { id: liveGame.id, status: "finalizada", result: "0-1", winner_id: "22222222-2222-2222-2222-222222222222", draw_offered_by: null, paused_by: null };
    liveGame.darkRevealed = false; liveGame.darkMoveAt = Date.now() - 600000; await darkRevealGame(fila); await tick();
    const vieja = mates.length;
    liveGame.darkRevealed = false; liveGame.darkMoveAt = Date.now(); await darkRevealGame(fila); await tick();
    out.mate = { vieja, envivo: mates.length };
    SFX.mate = mate0; outcome = oc0;
    SFX.move = sfxOrig;
    return out;
  });
  console.log("  datos4:", JSON.stringify(r4));
  ok(r4.d5Visible, "el peón negro en d5 SÍ se ve: mi peón de e4 lo amenaza (una pieza capturable está iluminada)");
  ok(r4.quakeMia && r4.quakeRival, "el tablero se sacude en mi captura y también en la del rival (" + r4.quakeMia + "/" + r4.quakeRival + ")");
  ok(r4.miCaptura.jugadas === 3 && r4.miCaptura.cap === "bp", "mi captura queda registrada con la pieza capturada (bp)");
  ok(r4.capturaRival.jugadas === 4 && r4.capturaRival.mov && r4.capturaRival.mov.capture === "wp" && r4.capturaRival.mov.hidden, "la captura del rival sobre mi peón se registra sin delatar de dónde vino");
  ok(r4.capturaRival.sonidos.includes("captura"), "suena la captura aunque la haya hecho el rival (" + r4.capturaRival.sonidos.join(",") + ")");
  ok(/×d5/.test(r4.capturaRival.lista) && !/[DQ]x?d5/.test(r4.capturaRival.lista), "la lista dice «×d5» y no la notación del rival: «" + r4.capturaRival.lista + "»");
  ok(r4.mate.vieja === 0 && r4.mate.envivo === 1, "el jaque mate (rey capturado) suena al terminar en vivo y no al reabrir una partida vieja (" + r4.mate.vieja + "/" + r4.mate.envivo + ")");
  ok(r4.reveal.revelada && r4.reveal.jugadas === 4 && r4.reveal.san2 === "d5", "al terminar se revela la película verdadera (4 jugadas, la 2.ª es d5)");
  ok(r4.reveal.sinNiebla === 0 && r4.reveal.negras === 15, "terminada la partida cae la niebla (" + r4.reveal.sinNiebla + " casillas en niebla, " + r4.reveal.negras + " negras visibles)");

  // 5) Los pasos del rival suenan (con el lado del enroque) y avisan cuando te toca
  const r5 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; darkRebuild(); render();
    const sonidos = [], avisos = []; const m0 = SFX.move, g0 = showGlobalToast;
    SFX.move = (mv, oc) => sonidos.push(JSON.stringify({ cap: !!(mv && mv.capture), castle: mv && mv.castle || null, side: !!(mv && mv.dkSide), promo: mv && mv.promo || null, piece: mv && mv.piece || null }));
    showGlobalToast = m => { if(/turno/i.test(m)) avisos.push(m); };
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const lit = ["7,4", "6,4", "5,4"], pieces = { "7,4": "wk", "6,4": "wp" };
    const mia = { ply: 1, mover: "w", turn: "b", lit, pieces, capture: false, capSq: null, castle: null, mine: { from: [6,4], to: [5,4], promo: null, san: "e3" } };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 1, obs: mia } }); await tick(900);
    const trasMia = { sonidos: sonidos.length, avisos: avisos.length };            // mi propia jugada: suena, NO avisa turno
    sonidos.length = 0;
    const riv1 = { ply: 2, mover: "b", turn: "w", lit, pieces, capture: false, capSq: null, castle: null, piece: "n" };
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
    SFX.move = m0; showGlobalToast = g0;
    return { trasMia, paso, largo, repetido };
  });
  console.log("  datos5:", JSON.stringify(r5));
  ok(r5.trasMia.sonidos === 1 && r5.trasMia.avisos === 0, "mi propia jugada suena pero no me avisa de turno");
  ok(r5.paso.sonidos.length === 1 && JSON.parse(r5.paso.sonidos[0]).cap === false && r5.paso.avisos === 1, "el paso oculto del rival suena y me avisa que me toca");
  ok(r5.largo.sonidos.length === 1 && JSON.parse(r5.largo.sonidos[0]).castle === "Q" && JSON.parse(r5.largo.sonidos[0]).side && JSON.parse(r5.largo.sonidos[0]).promo === "q", "el enroque del rival llega al sonido con su lado y la coronación se oye tal cual (sin decir a qué pieza)");
  ok(JSON.parse(r5.paso.sonidos[0]).piece === "n", "el paso oculto del rival llega al sonido con el TIPO de pieza (caballo), no su casilla");
  ok(r5.largo.avisos === 1, "también avisa de turno tras ese enroque");
  ok(r5.repetido.sonidos === 0 && r5.repetido.avisos === 0, "la misma observación repetida no suena ni avisa otra vez");

  // 9) Niebla viva: bruma enmascarada, la niebla se levanta al iluminar, la pieza enemiga emerge, y todo sigue aunque se redibuje
  const r9 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111"; const out = {};
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; fogPrev = null; fogFx.clear(); darkRebuild(); render();
    const base = ["7,4", "6,4"], pz = { "7,4": "wk", "6,4": "wp" };
    const obs = (ply, lit, pieces) => ({ new: { game_id: liveGame.id, viewer: YO, ply, obs: { ply, mover: "b", turn: "w", lit, pieces, capture: false, capSq: null, castle: null, promoted: false } } });
    handleDarkObs(obs(1, base, pz)); await tick(100); fogPrev = null; fogFx.clear(); render(); await tick(100);   // primer dibujo "limpio" de esta posición
    const m0 = boardEl.querySelector(".fog-mist");
    out.bruma = { hay: !!m0, capas: m0 ? m0.querySelectorAll("i").length : 0, mascara: !!(m0 && (m0.style.maskImage || m0.style.webkitMaskImage)), sinEfectos: boardEl.querySelectorAll(".fog-lift,.emerge,.fog-fall").length };
    handleDarkObs(obs(2, base.concat(["3,3", "4,3"]), Object.assign({ "3,3": "bp" }, pz))); await tick(150);
    out.levanta = { lift: boardEl.querySelectorAll(".cell.fog-lift").length, emerge: boardEl.querySelectorAll(".piece.b.emerge").length, propiasEmergen: boardEl.querySelectorAll(".piece.w.emerge").length };
    render(); await tick(300);   // un redibujo a mitad de la animación NO la corta
    out.continua = boardEl.querySelectorAll(".piece.b.emerge").length;
    await tick(1500); render();
    out.termina = { lift: boardEl.querySelectorAll(".cell.fog-lift").length, emerge: boardEl.querySelectorAll(".emerge").length };
    handleDarkObs(obs(3, base, pz)); await tick(150);
    out.cae = { fall: boardEl.querySelectorAll(".cell.fog.fog-fall").length, piezaNegra: boardEl.querySelectorAll(".piece.b").length };
    // el rival llega desde la niebla a una casilla que YA estaba iluminada: también emerge
    await tick(1700);
    handleDarkObs(obs(4, base.concat(["3,3", "4,3"]), Object.assign({ "4,3": "bp" }, pz))); await tick(1700); render();
    handleDarkObs(obs(5, base.concat(["3,3", "4,3"]), Object.assign({ "3,3": "bp" }, pz))); await tick(150);
    out.llega = boardEl.querySelectorAll(".piece.b.emerge").length;
    await tick(700); render(); out.llegaSigue = boardEl.querySelectorAll(".piece.b.emerge").length;
    return out;
  });
  console.log("  datos9:", JSON.stringify(r9));
  ok(r9.bruma.hay && r9.bruma.capas === 4 && r9.bruma.mascara, "en Dark hay una capa de bruma de cuatro velos (dos nubes y dos jirones), enmascarada a las casillas en niebla");
  ok(r9.bruma.sinEfectos === 0, "al primer dibujo no hay transiciones falsas");
  ok(r9.levanta.lift === 2 && r9.levanta.emerge === 1 && r9.levanta.propiasEmergen === 0, "al iluminarse dos casillas la niebla se levanta y SOLO la pieza enemiga emerge (" + JSON.stringify(r9.levanta) + ")");
  ok(r9.continua === 1, "un redibujo a mitad de la emergencia la continúa en vez de cortarla");
  ok(r9.termina.lift === 0 && r9.termina.emerge === 0, "pasado el tiempo, las clases de animación desaparecen");
  ok(r9.llega === 1 && r9.llegaSigue === 1, "la pieza enemiga que llega a una casilla ya iluminada también emerge, y un redibujo no la corta (" + r9.llega + "/" + r9.llegaSigue + ")");
  ok(r9.cae.fall === 2 && r9.cae.piezaNegra === 0, "al dejar de ver las casillas la niebla vuelve a caer y la pieza ya no se dibuja");

  // 7) Coronación: animación de invocación (todas las variantes); en Dark solo si la casilla es visible para mí
  const r7 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111"; const out = {};
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; darkRebuild(); render();
    const litBase = ["7,4", "6,4"], piezas = { "7,4": "wk", "6,4": "wp" };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 1, obs: { ply: 1, mover: "w", turn: "b", lit: litBase, pieces: piezas, capture: false, capSq: null, castle: null, promoted: false, mine: { from: [6,4], to: [5,4], promo: null, san: "e3" } } } });
    await tick(900);
    // el rival corona en d1 (fila 7 para mí = su casilla de coronación) y esa casilla SÍ está iluminada
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 2, obs: { ply: 2, mover: "b", turn: "w", lit: ["7,4", "6,4", "7,3"], pieces: { "7,4": "wk", "6,4": "wp", "7,3": "bq" }, capture: false, capSq: null, castle: null, promoted: true } } });
    await tick(120); out.visible = boardEl.querySelectorAll(".piece.summon").length;
    await tick(1500);
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 3, obs: { ply: 3, mover: "w", turn: "b", lit: litBase, pieces: piezas, capture: false, capSq: null, castle: null, promoted: false, mine: { from: [5,4], to: [4,4], promo: null, san: "e4" } } } });
    await tick(900);
    // otra coronación del rival, con la casilla en niebla: solo sonido
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 4, obs: { ply: 4, mover: "b", turn: "w", lit: litBase, pieces: piezas, capture: false, capSq: null, castle: null, promoted: true } } });
    await tick(120); out.oculta = boardEl.querySelectorAll(".piece.summon").length; out.efectos = document.querySelectorAll(".gatefx").length;
    // partida local clásica: coronar propio peón
    liveGame = null; persistFrozen = false;
    newGame("4k3/P7/8/8/8/8/8/4K3 w - - 0 1"); render();
    const mv = legalMoves(liveState()).find(m => sameSq(m.from, [1,0]) && sameSq(m.to, [0,0]) && m.promo === "q");
    commitMove(mv); await tick(120);
    out.local = boardEl.querySelectorAll(".piece.summon").length;
    await tick(1800);   // que termine la sacudida de la invocación antes de la prueba siguiente
    return out;
  });
  console.log("  datos7:", JSON.stringify(r7));
  ok(r7.visible === 1, "coronación del rival en casilla visible: se anima la invocación (" + r7.visible + ")");
  ok(r7.oculta === 0 && r7.efectos === 0, "coronación del rival en niebla: no se anima nada (solo suena) (" + r7.oculta + "/" + r7.efectos + ")");
  ok(r7.local === 1, "coronación propia en partida local: usa la animación de invocación (" + r7.local + ")");

  // 6) La sacudida también va en variantes sin niebla (partida local clásica)
  const r6 = await page.evaluate(async () => {
    liveGame = null; persistFrozen = false;
    newGame("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"); render();
    const mv = legalMoves(liveState()).find(m => sameSq(m.from, [4,4]) && sameSq(m.to, [3,3]));
    commitMove(mv); await new Promise(r => setTimeout(r, 150));
    const hit = boardEl.classList.contains("quake");
    await new Promise(r => setTimeout(r, 600));
    return { hit, apagada: !boardEl.classList.contains("quake") };
  });
  ok(r6.hit && r6.apagada, "en una partida clásica, capturar sacude el tablero y la sacudida termina sola (" + JSON.stringify(r6) + ")");

  // 8) Los sonidos grabados están incrustados y se oye la pieza de MIS jugadas (viene de la posición anterior)
  const r8 = await page.evaluate(async () => {
    const A = window.SFX_AUDIO || {}; const out = { claves: ["pz_p","pz_n","pz_b","pz_r","pz_q","pz_k","pz_a","pz_c","pz_f","pz_m"].filter(k => A[k] && A[k].length > 1000).length, caps: (A.cap || []).length };
    liveGame = null; persistFrozen = false;
    newGame("4k3/8/8/3p4/8/4N3/8/4K3 w - - 0 1"); render();
    const vistos = []; const m0 = SFX.move; SFX.move = (mv, oc) => vistos.push({ piece: mv && mv.piece, cap: !!(mv && mv.capture), variant: mv && mv.variant });
    const mv = legalMoves(liveState()).find(m => sameSq(m.from, [5,4]) && sameSq(m.to, [3,3]));   // Cxd5
    commitMove(mv); await new Promise(r => setTimeout(r, 150));
    out.vars = {};
    for(const [nom, fen, from] of [["seirawan", SEIRAWAN_START, [6,4]], ["shatranj", SHATRANJ_START, [6,4]], ["maharaja", MAHARAJA_START, [7,4]]]){
      newGame(fen); render();
      const m1 = legalMoves(liveState()).find(m => sameSq(m.from, from) && !m.gate && !m.castle) || legalMoves(liveState()).find(m => sameSq(m.from, from));
      vistos.length = 0; commitMove(m1); await new Promise(r => setTimeout(r, 120));
      out.vars[nom] = vistos[0] ? { piece: vistos[0].piece, variant: vistos[0].variant } : null;
    }
    SFX.move = m0; out.vistos = vistos;
    return out;
  });
  console.log("  datos8:", JSON.stringify(r8));
  ok(r8.claves === 10 && r8.caps === 14, "los 10 sonidos de pieza y las 14 capturas (11 + 3 nuevas) están incrustados (" + r8.claves + "/" + r8.caps + ")");
  ok(r8.vars.seirawan && r8.vars.seirawan.variant === "seirawan" && r8.vars.shatranj && r8.vars.shatranj.variant === "shatranj" && r8.vars.maharaja && r8.vars.maharaja.piece === "m" && r8.vars.maharaja.variant === "maharaja", "el sonido sabe la variante (Seirawan, Shatranj) y la pieza del Maharajá: " + JSON.stringify(r8.vars));

  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores.slice(0, 3).join(" || ") : ""));

  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("Error de la prueba:", e); process.exit(2); });
