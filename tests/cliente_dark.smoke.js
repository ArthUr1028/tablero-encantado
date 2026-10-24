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
    // 3) Mover no debe escribir nada ni avanzar el tablero local
    const pos = liveState();
    const mv = legalMoves(pos).find(m => m.from[0] === 6 && m.from[1] === 4);   // e2 (blancas)
    const antes = llamadas.length;
    commitMove(mv);
    await new Promise(r => setTimeout(r, 300));
    info.movioLocal = game.sans.length;
    info.escrituras = llamadas.slice(antes).filter(c => c[0] !== "rpc" || !/presence|heartbeat/i.test(c[1])).map(c => c[0] + ":" + c[1]);
    info.toast = Array.from(document.querySelectorAll("[class*=toast], #global-toast, .toast")).map(e => e.textContent).join(" | ").slice(0, 160);
    // 4) Una observación nueva por Realtime se guarda (sin dibujar todavía)
    handleDarkObs({ new: { game_id: GID, viewer: YO, ply: 1, obs: { ply: 1, test: true } } });
    info.obsTrasEvento = liveGame.darkObs.length;
    handleDarkObs({ new: { game_id: GID, viewer: RIVAL, ply: 2, obs: { ply: 2 } } });   // de otro espectador: se ignora
    info.obsAjenaIgnorada = liveGame.darkObs.length === 1;
    return info;
  });
  console.log("  datos:", JSON.stringify(r2));
  ok(r2.liveDark && r2.miColor === "w", "se entra a la partida como oscura y con mi color");
  ok(r2.obsIniciales === 0, "sin observaciones al inicio (la jugada 0 no tiene)");
  ok(r2.escuchas.includes("dark_obs") && r2.escuchas.includes("games"), "se suscribe a dark_obs y games");
  ok(r2.jugadasLocales === 0, "el tablero local arranca sin jugadas");
  ok(r2.piezasVisibles === 16 && r2.piezasNegras === 0, "la niebla oculta al rival desde el DOM: solo se ven mis 16 piezas (" + r2.piezasVisibles + " visibles, " + r2.piezasNegras + " negras)");
  ok(r2.casillasEnNiebla === 32, "32 casillas en niebla: de 64, 32 quedan iluminadas (mis 16 piezas + las 16 casillas de las filas 3 y 4 que alcanzan los peones) — real: " + r2.casillasEnNiebla);
  ok(r2.movioLocal === 0, "intentar mover NO avanza el tablero local");
  ok(r2.escrituras.length === 0, "intentar mover NO escribe nada en la base (" + r2.escrituras.join(",") + ")");
  ok(r2.obsTrasEvento === 1 && r2.obsAjenaIgnorada, "una observación propia nueva se guarda y una ajena se ignora");
  ok(errores.length === 0, "sin errores de JavaScript en la página" + (errores.length ? ": " + errores.slice(0, 3).join(" || ") : ""));

  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("Error de la prueba:", e); process.exit(2); });
