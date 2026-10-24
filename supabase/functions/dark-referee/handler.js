// Árbitro de Dark Chess. Se concatena con las reglas del Tablero (tools/build-dark-referee.js) en un solo index.ts.
// Aquí vive TODO lo que el servidor decide; el cliente solo pide «quiero mover de A a B».

const jerr = (status, error) => ({ status, body: { error } });
const isSq = a => Array.isArray(a) && a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]) && a[0] >= 0 && a[0] < 8 && a[1] >= 0 && a[1] < 8;

// Lo que un jugador puede saber tras una jugada: sus casillas iluminadas (con las piezas que hay en ellas) y,
// si la jugada fue suya, su propia notación. Del rival NUNCA va origen, destino, pieza ni SAN.
function observationFor(n, color, ply, mover, mv, san, capSq){
  const lit = [], pieces = {};
  for(const key of fogVisible(n, color)){
    lit.push(key);
    const [r, c] = key.split(",").map(Number);
    if(n.board[r][c]) pieces[key] = n.board[r][c];
  }
  const obs = { ply, mover, turn: n.turn, lit, pieces, capture: !!capSq, capSq: capSq || null };
  if(color === mover) obs.mine = { from: mv.from, to: mv.to, promo: mv.promo || null, san };
  return obs;
}

async function darkMove(db, userId, body){
  const gameId = body && body.game_id;
  if(typeof gameId !== "string" || !/^[0-9a-f-]{36}$/i.test(gameId)) return jerr(400, "Falta la partida.");
  if(!isSq(body.from) || !isSq(body.to)) return jerr(400, "Casillas inválidas.");
  const promo = body.promo == null ? null : String(body.promo);
  if(promo !== null && !/^[qrbn]$/.test(promo)) return jerr(400, "Coronación inválida.");

  let st;
  try { st = await db.getState(gameId); } catch(e){ return jerr(404, "No encontré esa partida oscura."); }
  if(st.status !== "en_curso") return jerr(409, "La partida ya terminó.");
  const color = userId === st.white_id ? "w" : userId === st.black_id ? "b" : null;
  if(!color) return jerr(403, "Esta partida no es tuya.");

  const pos = parseFEN(st.fen);
  if(!pos.board.dark) return jerr(500, "La partida no es oscura.");
  if(pos.turn !== color) return jerr(409, "No es tu turno.");

  const legal = legalMoves(pos);
  const cands = legal.filter(m => sameSq(m.from, body.from) && sameSq(m.to, body.to));
  if(!cands.length) return jerr(400, "Jugada ilegal.");
  const mv = cands.find(m => (m.promo || null) === promo);
  if(!mv) return jerr(400, cands[0].promo ? "Falta elegir la pieza de coronación." : "Jugada ilegal.");

  const ply = st.ply + 1;
  const { n, san, oc } = moveWithSAN(pos, mv);
  const capSq = mv.capture ? (mv.ep ? [mv.from[0], mv.to[1]] : mv.to) : null;

  let result = null, winner = null;
  if(oc === "checkmate"){ result = color === "w" ? "1-0" : "0-1"; winner = userId; }          // el rival se quedó sin rey
  else if(["stalemate", "draw50", "draw3", "material", "nokings"].includes(oc)) result = "1/2-1/2";

  const obsW = observationFor(n, "w", ply, color, mv, san, capSq);
  const obsB = observationFor(n, "b", ply, color, mv, san, capSq);
  const out = await db.commit({
    game: gameId, mover: userId, expectedPly: st.ply, fen: toFEN(n),
    move: { ply, uci: moveUci(mv, pos.board), san, by: color },
    obsW, obsB, result, winner
  });
  if(out && out.timeout) return { status: 200, body: { timeout: true } };
  return { status: 200, body: { ok: true, ply, result, obs: color === "w" ? obsW : obsB } };
}

// ---------------------------------------------------------------- Supabase (solo dentro de Deno)
if(typeof Deno !== "undefined" && Deno.serve){
  const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  let admin = null;
  Deno.serve(async req => {
    if(req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if(req.method !== "POST") return reply(405, { error: "Usa POST." });
    try {
      if(!admin){
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
      }
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data, error } = await admin.auth.getUser(token);
      if(error || !data || !data.user) return reply(401, { error: "Inicia sesión." });
      let body; try { body = await req.json(); } catch(e){ return reply(400, { error: "Cuerpo inválido." }); }
      const db = {
        async getState(id){ const r = await admin.rpc("dark_get_state", { p_game: id }); if(r.error) throw new Error(r.error.message); return r.data; },
        async commit(a){
          const r = await admin.rpc("dark_commit_move", { p_game: a.game, p_mover: a.mover, p_expected_ply: a.expectedPly, p_new_fen: a.fen,
            p_move: a.move, p_obs_w: a.obsW, p_obs_b: a.obsB, p_result: a.result, p_winner: a.winner });
          if(r.error) throw new Error(r.error.message);
          return r.data;
        }
      };
      const out = await darkMove(db, data.user.id, body);
      return reply(out.status, out.body);
    } catch(e){
      return reply(409, { error: String(e && e.message || e) });
    }
  });
}
