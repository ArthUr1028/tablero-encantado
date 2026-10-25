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
    // 2.125: al terminar, la niebla se disipa (no desaparece de golpe) y las piezas escondidas emergen escalonadas
    out.fin = { disipa: document.querySelectorAll("#board > .fog-body.dissolve, #board > .fog-mist.dissolve").length, emergen: boardEl.querySelectorAll(".piece.emerge-end").length, retrasos: Array.from(boardEl.querySelectorAll(".piece.emerge-end")).map(e => parseFloat(e.style.animationDelay)).filter(v => !isNaN(v)).length };
    // 2.117: el jaque mate (rey capturado) suena solo si el final ocurrió en vivo; al reabrir una partida vieja, no
    const mates = []; const mate0 = SFX.mate, oc0 = outcome; SFX.mate = () => mates.push(1); outcome = () => "checkmate";
    const fila = { id: liveGame.id, status: "finalizada", result: "0-1", winner_id: "22222222-2222-2222-2222-222222222222", draw_offered_by: null, paused_by: null };
    liveGame.darkRevealed = false; liveGame.darkMoveAt = Date.now() - 600000; await darkRevealGame(fila); await tick();
    const vieja = mates.length;
    liveGame.darkRevealed = false; liveGame.darkMoveAt = Date.now(); await darkRevealGame(fila); await tick();
    out.mate = { vieja, envivo: mates.length };
    SFX.mate = mate0; outcome = oc0;
    await new Promise(r => setTimeout(r, 5600));
    out.finLimpio = { capas: document.querySelectorAll("#board > .fog-body, #board > .fog-mist").length, emergen: boardEl.querySelectorAll(".emerge-end").length };
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
  ok(r4.fin.disipa === 2 && r4.fin.emergen >= 10 && r4.fin.retrasos === r4.fin.emergen, "al terminar la partida la niebla se disipa (2 capas) y las piezas escondidas emergen escalonadas (" + JSON.stringify(r4.fin) + ")");
  ok(r4.finLimpio.capas === 0 && r4.finLimpio.emergen === 0, "pasados unos segundos no queda niebla ni efectos (" + JSON.stringify(r4.finLimpio) + ")");
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
  // 2.128: los dos recortes de tambor del enroque están incrustados y son mp3 válidos
  const r11 = await page.evaluate(() => { const A = window.SFX_AUDIO || {}; const ok = k => !!A[k] && A[k].length > 5000 && /^(SUQz|\/\+|\/\/)/.test(A[k]); return { corto: ok("enr_c"), largo: ok("enr_l"), mas: A.enr_l && A.enr_c ? A.enr_l.length > A.enr_c.length : false }; });
  ok(r11.corto && r11.largo && r11.mas, "los recortes de tambor del enroque (corto y largo) están incrustados, son mp3 y el largo dura más (" + JSON.stringify(r11) + ")");
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
    out.cuerpo = { capas: boardEl.querySelectorAll(".fog-body b").length, mascaras: Array.from(boardEl.querySelectorAll(".fog-body b")).every(b => (b.style.maskImage || b.style.webkitMaskImage || "").indexOf("svg") > 0), cuadros: getComputedStyle(boardEl.querySelector(".cell.fog"), "::after").content };
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
    // 2.123: sin parpadeo — en ningún fotograma la niebla desaparece, se oculta o pierde su máscara mientras cambian las casillas iluminadas
    { const malos = []; let n = 0, corre = true;
      const mira = () => { if(!corre) return; n++; const bd = document.querySelector("#board > .fog-body"), ms = document.querySelector("#board > .fog-mist");
        const okb = bd && Array.from(bd.children).every(b => getComputedStyle(b).visibility !== "hidden" && (b.style.maskImage || b.style.webkitMaskImage));
        const okm = ms && getComputedStyle(ms).visibility !== "hidden" && (ms.style.maskImage || ms.style.webkitMaskImage);
        if(!(okb && okm)) malos.push(n); requestAnimationFrame(mira); };
      requestAnimationFrame(mira);
      const lits = [["3,3"], ["3,3", "3,4", "4,4"], ["4,2"], ["3,3", "4,2", "2,2", "2,3"], []];
      let k = 7; for(const extra of lits){ handleDarkObs(obs(k++, base.concat(extra), pz)); await tick(350); }
      corre = false; out.parpadeo = { fotogramas: n, malos: malos.length }; }
    return out;
  });
  console.log("  datos9:", JSON.stringify(r9));
  ok(r9.bruma.hay && r9.bruma.capas === 4 && r9.bruma.mascara, "en Dark hay una capa de bruma de cuatro velos (dos nubes y dos jirones), enmascarada a las casillas en niebla");
  ok(r9.cuerpo.capas === 3 && r9.cuerpo.mascaras, "la niebla es un cuerpo continuo de 3 capas con máscara irregular (no cuadros) (" + JSON.stringify(r9.cuerpo) + ")");
  ok(r9.bruma.sinEfectos === 0, "al primer dibujo no hay transiciones falsas");
  ok(r9.levanta.lift === 2 && r9.levanta.emerge === 1 && r9.levanta.propiasEmergen === 0, "al iluminarse dos casillas la niebla se levanta y SOLO la pieza enemiga emerge (" + JSON.stringify(r9.levanta) + ")");
  ok(r9.continua === 1, "un redibujo a mitad de la emergencia la continúa en vez de cortarla");
  ok(r9.termina.lift === 0 && r9.termina.emerge === 0, "pasado el tiempo, las clases de animación desaparecen");
  ok(r9.parpadeo.fotogramas > 20 && r9.parpadeo.malos === 0, "la niebla no parpadea: ningún fotograma sin niebla al cambiar las casillas iluminadas (" + r9.parpadeo.malos + " malos de " + r9.parpadeo.fotogramas + ")");
  ok(r9.llega === 1 && r9.llegaSigue === 1, "la pieza enemiga que llega a una casilla ya iluminada también emerge, y un redibujo no la corta (" + r9.llega + "/" + r9.llegaSigue + ")");
  ok(r9.cae.fall === 2 && r9.cae.piezaNegra === 0, "al dejar de ver las casillas la niebla vuelve a caer y la pieza ya no se dibuja");

  // 10) Cuaderno: carga, guardado automático (general y por jugada), borrado al vaciar, reintento ante fallo y solo en Dark
  const r10 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111"; const out = {};
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const tienda = new Map([[0, "plan viejo"], [2, "nota de la 2"]]); const reg = []; let fallar = false;
    const tabla = () => {
      const q = { _eq: {} };
      q.select = () => q; q.eq = (c, v) => { q._eq[c] = v; return q; };
      q.then = (res, rej) => Promise.resolve({ data: Array.from(tienda, ([ply, body]) => ({ ply, body })), error: null }).then(res, rej);
      q.upsert = (fila, op) => { reg.push(["upsert", fila, op]); if(fallar) return Promise.resolve({ error: { message: "x" } }); tienda.set(fila.ply, fila.body); return Promise.resolve({ error: null }); };
      q.delete = () => { const d = { _eq: {} }; d.eq = (c, v) => { d._eq[c] = v; return d; }; d.then = (res, rej) => { reg.push(["delete", d._eq]); tienda.delete(d._eq.ply); return Promise.resolve({ error: null }).then(res, rej); }; return d; };
      return q;
    };
    const fromOrig = sb.from; sb.from = n => n === "game_notes" ? tabla() : fromOrig(n);
    game.result = ""; liveGame.darkRevealed = false; nb.id = null; nb.notes = new Map(); game.cursor = 0; render(); await tick(400);
    const box = document.getElementById("nb-box"), gen = document.getElementById("nb-general"), pl = document.getElementById("nb-ply");
    out.carga = { visible: !box.hidden, general: gen.value, plyDeshabilitada: pl.disabled };
    game.cursor = Math.min(2, game.states.length - 1); render(); await tick(100);
    out.enJugada = { habilitada: !pl.disabled, valor: pl.value, marca: document.querySelectorAll("#moves .nb-tag").length, etiqueta: document.getElementById("nb-ply-lbl").textContent };
    out.lineas = { n: document.querySelectorAll("#moves .nb-line").length, texto: (document.querySelector("#moves .nb-line") || {}).textContent || "" };
    pl.value = "<b>negrita</b> & \"x\""; pl.dispatchEvent(new Event("input")); await tick(1200);
    out.escapado = { html: (document.querySelector("#moves .nb-line.here") || {}).innerHTML || "", negritas: document.querySelectorAll("#moves .nb-line b").length, lineas: document.querySelectorAll("#moves .nb-line").length };
    const clic = document.querySelector("#moves .nb-line"); game.cursor = 0; clic.click(); await tick(100); out.clic = game.cursor === +clic.dataset.ply;
    game.cursor = Math.min(2, game.states.length - 1); render(); await tick(100);
    gen.value = "nuevo plan"; gen.dispatchEvent(new Event("input")); await tick(1200);
    out.guardaGeneral = { enTienda: tienda.get(0), fila: reg.filter(r => r[0] === "upsert").map(r => r[1].owner + "|" + r[1].ply + "|" + r[2].onConflict).pop(), estado: document.getElementById("nb-status").textContent };
    pl.value = "sospecho de f6"; pl.dispatchEvent(new Event("input")); await tick(1200);
    out.guardaJugada = tienda.get(+pl.dataset.ply);
    gen.value = ""; gen.dispatchEvent(new Event("input")); await tick(1200);
    out.vaciar = { sigue: tienda.has(0), borrados: reg.filter(r => r[0] === "delete").length };
    fallar = true; gen.value = "se va a fallar"; gen.dispatchEvent(new Event("input")); await tick(1200);
    out.fallo = { estado: document.getElementById("nb-status").textContent, error: document.getElementById("nb-status").classList.contains("err"), guardadoLocal: nb.notes.get(0) };
    fallar = false; clearTimeout(nb.timers.get(0)); nb.timers.delete(0);
    const v0 = liveGame.variant; liveGame.variant = "clasico"; render(); out.noEnClasico = document.getElementById("nb-box").hidden; liveGame.variant = v0;
    sb.from = fromOrig; render();
    return out;
  });
  console.log("  datos10:", JSON.stringify(r10));
  ok(r10.carga.visible && r10.carga.general === "plan viejo" && r10.carga.plyDeshabilitada, "el cuaderno aparece en Dark en línea, carga la nota general y la de jugada espera a que elijas una jugada");
  ok(r10.enJugada.habilitada && r10.enJugada.valor === "nota de la 2" && /1…/.test(r10.enJugada.etiqueta), "al elegir una jugada se muestra su nota (" + r10.enJugada.etiqueta + ")");
  ok(r10.lineas.n === 1 && /nota de la 2/.test(r10.lineas.texto), "la nota de la jugada se lee directamente bajo ella en la notación, sin tener que tocarla (" + r10.lineas.texto + ")");
  ok(r10.escapado.negritas === r10.escapado.lineas && !/<b>negrita/.test(r10.escapado.html) && /&lt;b&gt;negrita/.test(r10.escapado.html), "el texto de la nota se escapa: una etiqueta escrita no se interpreta (" + r10.escapado.html + ")");
  ok(r10.clic, "tocar la línea de la nota lleva a esa jugada");
  ok(r10.enJugada.marca >= 1, "la jugada con nota lleva su marca ✎ en la notación (" + r10.enJugada.marca + ")");
  ok(r10.guardaGeneral.enTienda === "nuevo plan" && r10.guardaGeneral.fila === "11111111-1111-1111-1111-111111111111|0|game_id,owner,ply" && r10.guardaGeneral.estado === "Guardado", "escribir guarda solo, con mi usuario como dueño, y avisa «Guardado»");
  ok(r10.guardaJugada === "sospecho de f6", "la nota de una jugada se guarda en su jugada");
  ok(!r10.vaciar.sigue && r10.vaciar.borrados >= 1, "vaciar una nota la borra del servidor");
  ok(/reintentando/.test(r10.fallo.estado) && r10.fallo.error && r10.fallo.guardadoLocal === "se va a fallar", "si falla el guardado avisa, reintenta y no pierde lo escrito");
  ok(r10.noEnClasico, "en una variante no habilitada el cuaderno no aparece");

  // 13) Marcas sobre el tablero (2.131): pulsación larga, flecha, menú, persistencia, limpieza, sin jugadas accidentales
  await page.evaluate(() => {
    const store = { fila: [{ t: "h", s: 0, c: "g" }, { t: "zzz" }, { t: "a", f: 1, to: 1, c: "r" }], reg: [] };
    window.__mkStore = store;
    const fromOrig = sb.from; window.__mkFromOrig = fromOrig;
    sb.from = n => {
      if(n !== "game_marks") return fromOrig(n);
      const q = { _eq: {} };
      q.select = () => q; q.eq = (c, v) => { q._eq[c] = v; return q; };
      q.maybeSingle = () => Promise.resolve({ data: store.fila ? { marks: store.fila } : null, error: null });
      q.upsert = (f, op) => { store.reg.push(["upsert", f.owner, op.onConflict]); store.fila = f.marks; return Promise.resolve({ error: null }); };
      q.delete = () => { const d = { _eq: {} }; d.eq = (c, v) => { d._eq[c] = v; return d; }; d.then = (res, rej) => { store.reg.push(["delete"]); store.fila = null; return Promise.resolve({ error: null }).then(res, rej); }; return d; };
      return q;
    };
    game.result = ""; liveGame.darkRevealed = false; mk.id = null; mk.marks = []; game.cursor = 0; flipped = false; selected = null; render();
  });
  await page.waitForTimeout(500);
  const centro = async (r, c) => page.evaluate(([r, c]) => { document.getElementById("board").scrollIntoView({ block: "center" }); const el = document.querySelector('#board .cell[data-r="' + r + '"][data-c="' + c + '"]').getBoundingClientRect(); return [el.left + el.width / 2, el.top + el.height / 2]; }, [r, c]);
  const marcas = () => page.evaluate(() => ({ n: mk.marks.length, tipos: mk.marks.map(m => m.t).join(""), svg: document.querySelectorAll("#board > .mk-svg").length, fila: JSON.stringify(window.__mkStore.fila), reg: window.__mkStore.reg.length, jugadas: game.sans.length, sel: JSON.stringify(selected) }));
  await page.evaluate(() => { const b = document.getElementById("intro-saltar"); if(b) b.click(); });
  await page.waitForTimeout(1500);
  const m0 = await marcas();
  ok(m0.n === 1 && m0.tipos === "h" && m0.svg === 1, "al cargar, solo se aceptan las marcas válidas (" + m0.n + " de 3 filas, tipos " + m0.tipos + ")");
  const [ax, ay] = await centro(6, 4), [bx, by] = await centro(4, 4);
  // toque normal sobre una pieza propia: sigue seleccionando (no es pulsación larga)
  await page.evaluate(() => { game.cursor = game.states.length - 1; selected = null; render(); });
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(100);
  const sel1 = await marcas();
  ok(sel1.sel !== "null" && sel1.n === 1, "un toque corto sigue seleccionando la pieza, sin marcas (" + sel1.sel + ")");
  await page.evaluate(() => { selected = null; render(); });
  // pulsación larga + arrastre = flecha, sin mover la pieza
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.waitForTimeout(650);
  const mid = await page.evaluate(() => !!mk.act);
  await page.mouse.move((ax + bx) / 2, (ay + by) / 2, { steps: 4 }); await page.mouse.move(bx, by, { steps: 4 });
  const prev = await page.evaluate(() => document.querySelectorAll("#board > .mk-svg line").length);
  await page.mouse.up(); await page.waitForTimeout(200);
  const m1 = await marcas();
  ok(mid && prev === 1, "mantener 0,45 s inicia el dibujo y muestra la flecha de vista previa mientras arrastras");
  ok(m1.n === 2 && m1.tipos === "ha" && m1.jugadas === m0.jugadas && m1.sel === "null", "soltar en otra casilla deja una flecha, sin jugar ni seleccionar nada (" + m1.tipos + ", jugadas " + m1.jugadas + ")");
  await page.waitForTimeout(900);
  const m1b = await marcas();
  ok(m1b.reg >= 1 && /"t":"a"/.test(m1b.fila), "la flecha se guarda sola en la cuenta (" + m1b.reg + " escritura(s))");
  // arrastrar una pieza despacio no dibuja
  const [cx, cy] = await centro(6, 0), [dx, dy] = await centro(5, 0);
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy + 12, { steps: 3 }); await page.waitForTimeout(650);
  const lento = await page.evaluate(() => !!mk.act);
  await page.mouse.move(dx, dy, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(200);
  ok(!lento, "si empiezas a arrastrar una pieza, la pulsación larga no se activa");
  await page.evaluate(() => { game.cursor = game.states.length - 1; selected = null; render(); });
  // pulsación larga sin mover = menú; círculo; texto; quitar
  const [ex, ey] = await centro(3, 3);
  await page.mouse.move(ex, ey); await page.mouse.down(); await page.waitForTimeout(650);
  await page.mouse.up(); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !!document.querySelector(".mk-pop")), "pulsar largo y soltar en la misma casilla abre el menú");
  await page.click('.mk-pop .mk-dot[data-c="b"]'); await page.click('.mk-pop [data-a="o"]'); await page.waitForTimeout(100);
  const m2 = await marcas();
  ok(/o/.test(m2.tipos) && !(await page.evaluate(() => !!document.querySelector(".mk-pop"))) && await page.evaluate(() => mk.marks.find(m => m.t === "o").c) === "b", "el menú pone un círculo azul (duda) y se cierra");
  await page.mouse.move(ex, ey); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up(); await page.waitForTimeout(150);
  await page.click('.mk-pop [data-a="x"]'); await page.fill(".mk-pop .mk-in", "ojo <b>"); await page.keyboard.press("Enter"); await page.waitForTimeout(150);
  const tx = await page.evaluate(() => ({ t: (document.querySelector("#board > .mk-svg text") || {}).textContent, b: document.querySelectorAll("#board > .mk-svg b").length }));
  ok(tx.t === "ojo <b>" && tx.b === 0, "el texto corto se dibuja escapado en la casilla (" + tx.t + ")");
  // las marcas no dependen de la jugada
  await page.evaluate(() => { game.cursor = 0; render(); });
  ok(await page.evaluate(() => document.querySelectorAll("#board > .mk-svg").length === 1 && mk.marks.length >= 4), "al ir a otra jugada las marcas siguen ahí");
  // giro del tablero: la flecha cambia de lugar en pantalla
  const x1 = await page.evaluate(() => +document.querySelector("#board > .mk-svg line").getAttribute("x1"));
  await page.evaluate(() => { flipped = true; render(); });
  const x2 = await page.evaluate(() => +document.querySelector("#board > .mk-svg line").getAttribute("x1"));
  await page.evaluate(() => { flipped = false; render(); });
  ok(Math.abs(x1 + x2 - 8) < 0.5, "al girar el tablero las marcas giran con él (" + x1.toFixed(2) + " / " + x2.toFixed(2) + ")");
  // repetir la misma flecha la quita; limpiar con dos toques
  await page.evaluate(() => { const a = mk.marks.find(m => m.t === "a"); mkAdd({ t: "a", f: a.f, to: a.to, c: a.c }); });
  ok(await page.evaluate(() => !mk.marks.some(m => m.t === "a")), "repetir la misma flecha y color la quita");
  const antes = await page.evaluate(() => mk.marks.length);
  await page.click("#mk-clear"); const aun = await page.evaluate(() => mk.marks.length); const txt = await page.textContent("#mk-clear");
  await page.click("#mk-clear"); await page.waitForTimeout(900);
  const fin = await page.evaluate(() => ({ n: mk.marks.length, fila: window.__mkStore.fila, svg: document.querySelectorAll("#board > .mk-svg").length }));
  ok(aun === antes && /Seguro/.test(txt) && fin.n === 0 && fin.fila === null && fin.svg === 0, "limpiar pide confirmar con un segundo toque y borra todo, también en la cuenta");
  // solo Dark
  const noDark = await page.evaluate(() => { const v = liveGame.variant; liveGame.variant = "clasico"; render(); const r = { barra: document.getElementById("nb-box").hidden, svg: document.querySelectorAll("#board > .mk-svg").length }; liveGame.variant = v; return r; });
  ok(noDark.barra && noDark.svg === 0, "en una variante no habilitada no hay marcas");
  await page.evaluate(() => { sb.from = window.__mkFromOrig; mk.id = null; render(); });

  // 14) Enroque propio en Dark en línea: la jugada llega al sonido con su lado
  const r14 = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; darkRebuild(); render();
    const sonidos = []; const m0 = SFX.move;
    SFX.move = (mv, oc) => sonidos.push(JSON.stringify({ castle: mv && mv.castle || null, piece: mv && mv.piece || null, hidden: !!(mv && mv.hidden) }));
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const lit = ["7,4", "7,5", "7,6", "7,7"], pieces = { "7,4": "wk", "7,7": "wr" }, pieces2 = { "7,6": "wk", "7,5": "wr" };
    const mia = { ply: 1, mover: "w", turn: "b", lit, pieces: pieces2, capture: false, capSq: null, castle: "K", mine: { from: [7,4], to: [7,6], promo: null, san: "O-O" } };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 1, obs: mia } }); await tick(900);
    const out = { sonidos: sonidos.slice(), mov: JSON.stringify(game.moves[0]) };
    SFX.move = m0; return out;
  });
  console.log("  datos14:", JSON.stringify(r14));
  ok(r14.sonidos.length === 1 && /"castle":"K"/.test(r14.sonidos[0]), "mi enroque en Dark en línea suena como enroque (" + r14.sonidos.join(",") + ")");
  const r14b = await page.evaluate(async () => {
    const YO = "11111111-1111-1111-1111-111111111111";
    game.result = ""; liveGame.darkRevealed = false; liveGame.darkObs.length = 0; liveGame.darkPending = null; liveGame.darkBusy = false; darkRebuild(); render();
    const sonidos = []; const m0 = SFX.move, inv0 = sb.functions.invoke;
    SFX.move = (mv, oc) => sonidos.push(JSON.stringify({ castle: mv && mv.castle || null, piece: mv && mv.piece || null, cap: !!(mv && mv.capture) }));
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const lit = ["7,4", "7,5", "7,6", "7,7", "6,4"], pieces = { "7,4": "wk", "7,7": "wr", "6,4": "wp" };
    handleDarkObs({ new: { game_id: liveGame.id, viewer: YO, ply: 1, obs: { ply: 1, mover: "b", turn: "w", lit, pieces, capture: false, capSq: null, castle: null, piece: "n" } } }); await tick(300);
    sonidos.length = 0;
    sb.functions.invoke = async () => ({ data: { ply: 2, obs: { ply: 2, mover: "w", turn: "b", lit, pieces: { "7,6": "wk", "7,5": "wr", "6,4": "wp" }, capture: false, capSq: null, castle: "K", mine: { from: [7,4], to: [7,6], promo: null, san: "O-O" } } } });
    const legal = legalMoves(liveState()).filter(m => m.castle).map(m => m.castle).join("");
    tryMove([7,4], [7,6]); await tick(1000);
    SFX.move = m0; sb.functions.invoke = inv0;
    return { legal, sonidos };
  });
  console.log("  datos14b:", JSON.stringify(r14b));
  ok(r14b.legal.includes("K") && r14b.sonidos.length === 1 && /"castle":"K"/.test(r14b.sonidos[0]), "enrocar de verdad en Dark en línea (tryMove) suena como enroque (" + r14b.sonidos.join(",") + ")");
  const r14c = await page.evaluate(async () => {
    // Dark en solitario (local): el enroque de AMBOS bandos suena con su lado
    const sonidos = []; const m0 = SFX.move; const lg0 = liveGame;
    SFX.move = (mv, oc) => sonidos.push(mv && mv.castle || null);
    liveGame = null;
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    switchVariant("dark"); setMode("play");
    newGame("4k3/pppppppp/8/8/8/8/8/R3K2R w KQ - 0 1"); L().states[0].board.dark = true; render();
    const dark = fogViewer(liveState(), outcome(liveState()));
    for(const [f, t] of [[[7,4],[7,6]]]){ const m = legalMoves(liveState()).find(x => sameSq(x.from, f) && sameSq(x.to, t)); if(m) commitMove(m); await tick(400); }
    SFX.move = m0; liveGame = lg0;
    return { dark: !!dark, sonidos };
  });
  console.log("  datos14c:", JSON.stringify(r14c));
  ok(r14c.dark && r14c.sonidos.length === 1 && r14c.sonidos[0] === "K", "en Dark en solitario el enroque también suena con su lado (" + r14c.sonidos.join(",") + ")");

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

  // 12) Háptica: un patrón por evento, solo si el dispositivo vibra; un interruptor; fin de partida una sola vez
  const r12 = await page.evaluate(async () => {
    const out = {}; const reg = [];
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: p => { reg.push(JSON.stringify(p)); return true; } });
    const tick = ms => new Promise(r => setTimeout(r, ms || 150));
    const jugar = (fen, de, a2, promo) => { liveGame = null; persistFrozen = false; if(fen) newGame(fen); render(); };
    const mover = async (de, a2, promo) => { const mv = legalMoves(liveState()).find(m => sameSq(m.from, de) && sameSq(m.to, a2) && (!promo || m.promo === promo)); commitMove(mv); await tick(200); };
    const ultimo = () => reg[reg.length - 1];
    newGame("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"); render(); await tick(100); reg.length = 0; hapWasEnded = null;
    await mover([4,4], [3,4]); out.jugada = ultimo();                       // e4-e5: jugada simple
    await mover([0,4], [0,3]); out.rival = ultimo();
    newGame("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1"); render(); await tick(100); reg.length = 0;
    await mover([4,4], [3,3]); out.captura = ultimo();                      // exd5
    newGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"); render(); await tick(100); reg.length = 0;
    await mover([7,4], [7,6]); out.enroqueCorto = ultimo();
    newGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1"); render(); await tick(100); reg.length = 0;
    await mover([7,4], [7,2]); out.enroqueLargo = ultimo();
    newGame("8/P7/7k/8/8/8/8/4K3 w - - 0 1"); render(); await tick(100); reg.length = 0;
    await mover([1,0], [0,0], "q"); out.coronacion = ultimo();
    newGame("6k1/8/8/8/8/8/5q2/6K1 b - - 0 1"); render(); await tick(100); reg.length = 0;
    await mover([6,5], [6,6]); out.jaque = ultimo();                        // Dg2+... (la dama da jaque)
    // fin de partida: una sola vez, y no al abrir una partida ya terminada
    newGame("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"); render(); await tick(100); reg.length = 0; hapEndKey = null; hapWasEnded = null; render();
    game.result = "1-0"; render(); await tick(100); out.fin = reg.filter(r => r === "[140,90,260]").length;
    render(); render(); await tick(100); out.finUnaVez = reg.filter(r => r === "[140,90,260]").length;
    reg.length = 0; hapEndKey = null; hapWasEnded = null; render(); render(); await tick(100); out.alAbrirTerminada = reg.length;
    // interruptor
    game.result = ""; newGame("4k3/8/8/8/4P3/8/8/4K3 w - - 0 1"); render(); await tick(100);
    const btn = document.getElementById("hap-toggle"); out.botonVisible = !btn.hidden; const avisos = []; const g0 = showGlobalToast; showGlobalToast = m => avisos.push(m); btn.click(); out.avisoApagar = avisos.join("|"); btn.click(); out.avisoEncender = avisos[avisos.length - 1] || ""; out.pruebaVibro = reg[reg.length - 1]; btn.click(); showGlobalToast = g0; reg.length = 0;
    await mover([4,4], [3,4]); out.apagada = reg.length; out.guardado = localStorage.getItem("tablero-encantado.haptica");
    out.etiqueta = btn.getAttribute("aria-pressed"); btn.click(); out.encendida = HAP.isOn();
    // sin soporte: ni se muestra ni falla
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: undefined });
    out.sinSoporte = HAP.supported(); const av2 = []; const g1 = showGlobalToast; showGlobalToast = m => av2.push(m); document.getElementById("hap-toggle").click(); showGlobalToast = g1; out.avisoSinSoporte = av2.join("|"); let err = null; try{ HAP.buzz("move"); }catch(e){ err = String(e); } out.sinError = err === null;
    return out;
  });
  console.log("  datos12:", JSON.stringify(r12));
  ok(r12.jugada === "[14]" && r12.rival === "[14]", "una jugada simple vibra corto, la mía y la del rival (" + r12.jugada + ", " + r12.rival + ")");
  ok(r12.captura === "[40,35,70]", "una captura vibra con su patrón (" + r12.captura + ")");
  ok(r12.enroqueCorto === "[22,60,22]" && r12.enroqueLargo === "[22,60,22,60,22]", "el enroque corto vibra dos veces y el largo tres (" + r12.enroqueCorto + " / " + r12.enroqueLargo + ")");
  ok(r12.coronacion === "[18,40,70]", "la coronación tiene su patrón (" + r12.coronacion + ")");
  ok(r12.jaque === "[35,70,35,70]", "el jaque vibra doble (" + r12.jaque + ")");
  ok(r12.fin === 1 && r12.finUnaVez === 1 && r12.alAbrirTerminada === 0, "el fin de partida vibra una sola vez y no al abrir una ya terminada (" + r12.fin + "/" + r12.finUnaVez + "/" + r12.alAbrirTerminada + ")");
  ok(r12.botonVisible && r12.apagada === 0 && r12.guardado === "0" && r12.etiqueta === "false" && r12.encendida, "el botón apaga la vibración (y se recuerda) y se puede volver a encender");
  ok(/probada/.test(r12.avisoEncender) && r12.pruebaVibro === "[70,70,140]", "al encender, manda una vibración de prueba y lo avisa (" + r12.pruebaVibro + ")");
  ok(/no permite vibrar/.test(r12.avisoSinSoporte), "sin soporte, el botón explica por qué no vibra (" + r12.avisoSinSoporte.slice(0, 50) + ")");
  ok(r12.sinSoporte === false && r12.sinError, "sin soporte de vibración no falla");

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
