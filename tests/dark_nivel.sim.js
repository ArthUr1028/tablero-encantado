// Simulador de partidas de claudIA en Dark Chess (mide la fuerza por nivel). Uso:
//   node tests/dark_nivel.sim.js <nivel claudIA: 0|5|10|15> <rival: greedy|0|5|10|15> <partidas> [semilla] [color de claudIA: w|b|alt]
// Usa las funciones REALES de index.html (vm) y el motor Fairy-Stockfish WASM real, con la misma configuración que el Tablero.
// El rival "greedy" es un jugador de a pie: ve solo lo que ve una persona, captura el rey si lo ve, prefiere capturas, no deja su rey a tiro de lo que ve.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const grab = (name, kw) => { const f0 = find(new RegExp("^" + (kw || "function") + " " + name + "\\b")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const NAMES = (process.env.DKB_FUNCS || "matchUci,fogVisible,dkbCfg,dkbObs,dkbHash,dkbRng,dkbStep,dkbReseed,dkbBuild,dkbPick,dkbVote,dkbRisk,dkbChoose").split(",");
const extra = (process.env.DKB_EXTRA || "").split(",").filter(Boolean);
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w'; const DKB_M=200, DKB_RISK_N=60;\n" +
  src.slice(a, z).join("\n") + "\nconst FSF_ELO_FOR_LEVEL = { 0: 500, 5: 800, 10: 1200, 15: 1600 };\n" +
  NAMES.concat(extra).map(n => grab(n)).join("\n") +
  "\nthis.__api = { parseFEN, toFEN, fogVisible, legalMoves, applyMove, outcome, uciOf, matchUci, dkbBuild, dkbPick, dkbVote, dkbChoose, dkbCfg, kingPos, DARK_INI, FSF_ELO_FOR_LEVEL" + extra.map(n => ", " + n).join("") + " };";
const ctx = vm.createContext({ document: {}, window: {}, console, Math });
vm.runInContext(code, ctx);
const A = ctx.__api;

// ---- motor ----
let M, ready = false, waiter = null, lines = [];
async function boot(){
  const realLog = console.log;
  process.chdir(ROOT);
  const hook = l => { l = String(l); lines.push(l); if(waiter && /^bestmove/.test(l)) waiter(l); };
  console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js"));
  M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog;
  M.ccall("fsf_load_variant_ini", null, ["string"], [A.DARK_INI]);
  cmd("setoption name UCI_Variant value darkchess"); cmd("isready");
}
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
async function search(fen, elo, ms){
  cmd("setoption name MultiPV value 1");
  if(elo){ cmd("setoption name UCI_LimitStrength value true"); cmd("setoption name UCI_Elo value " + elo); }
  else cmd("setoption name UCI_LimitStrength value false");
  cmd("position fen " + fen.replace(/\s+dark\s*$/, ""));
  const p = new Promise(r => { waiter = r; });
  cmd("go movetime " + ms);
  const l = await Promise.race([p, new Promise(r => setTimeout(() => r("bestmove (none)"), ms + 8000))]);
  waiter = null; return l.split(" ")[1];
}

// ---- generador determinista para el rival y el azar de la simulación ----
let seed = 12345; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = rnd;   // dkbVote y compañía usan Math.random del contexto (misma referencia a Math)

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const opp = c => c === "w" ? "b" : "w";
// ¿puede el bando `by` capturar el rey de `col` en `pos` (con el turno de `by`)? Solo cuenta piezas de `by` en `onlyFrom` (casillas) si se da.
function kingTakers(pos, col, by, vis){
  const q = A.parseFEN(A.toFEN(pos)); q.turn = by;
  const out = [];
  for(const m of A.legalMoves(q)) if(m.capture && m.capture[1] === "k" && m.capture[0] === col){ if(!vis || vis.has(m.from[0] + "," + m.from[1])) out.push(m); }
  return out;
}

// Rival "greedy": lo que haría una persona atenta pero sin plan.
function greedyMove(pos){
  const me = pos.turn, legal = A.legalMoves(pos);
  const win = legal.filter(m => m.capture && m.capture[1] === "k"); if(win.length) return win[0];
  const vis = A.fogVisible(pos, me);
  let best = [], bs = -1e9;
  for(const m of legal){
    const q = A.applyMove(pos, m);
    // peligro conocido: piezas rivales que YO veo después de mi jugada y que podrían comerme el rey
    const vis2 = A.fogVisible(q, me);
    const vistas = new Set(); for(let r = 0; r < 8; r++) for(let c = 0; c < q.board[0].length; c++) if(vis2.has(r + "," + c) && q.board[r][c] && q.board[r][c][0] === opp(me)) vistas.add(r + "," + c);
    let s = 0;
    if(kingTakers(q, me, opp(me), vistas).length) s -= 1000;
    if(m.capture) s += 10 * (VAL[m.capture[1]] || 1);
    // no entregar piezas a la vista: casilla destino atacada por piezas que veo
    const atk = A.legalMoves(Object.assign(A.parseFEN(A.toFEN(q)), { turn: opp(me) })).filter(x => x.capture && x.to[0] === m.to[0] && x.to[1] === m.to[1] && vistas.has(x.from[0] + "," + x.from[1]));
    if(atk.length) s -= 6 * (VAL[(pos.board[m.from[0]][m.from[1]] || "xp")[1]] || 1);
    s += rnd() * 4;   // jugar algo distinto cada partida
    if(s > bs){ bs = s; best = [m]; }
  }
  return best[0] || legal[0];
}

// claudIA (lógica real: hipótesis -> motor -> votación), con el mismo flujo que dkbStart
async function claudiaMove(pos, states, ucis, me, level, memo, tuning){
  const cfg = Object.assign({}, A.dkbCfg(level));
  const main = tuning && tuning.main;
  if(main && process.env.DKB_MS) cfg.ms = +process.env.DKB_MS;
  if(main && process.env.DKB_N) cfg.n = +process.env.DKB_N;
  if(main && process.env.DKB_ELO !== undefined) cfg.elo = +process.env.DKB_ELO;
  const BLEND = main && process.env.DKB_BLEND !== undefined ? +process.env.DKB_BLEND : cfg.blend;   // como CLASSIC_RANDOM_BLEND del Tablero
  if(rnd() < BLEND){ const lm = A.legalMoves(pos); return { mv: lm[Math.floor(rnd() * lm.length)], azar: 1 }; }
  let hyp = [];
  let wide = [];
  try{ const all = A.dkbBuild(states, ucis, me, 200, memo); hyp = A.dkbPick(all, cfg.n); wide = A.dkbPick(all, 60); }catch(e){ hyp = []; }
  if(!hyp.length){ const lm = A.legalMoves(pos); return { mv: lm[Math.floor(rnd() * lm.length)], vacias: 1 }; }
  const votes = [];
  for(const h of hyp){
    let u = await search(A.toFEN(h.pos), cfg.elo, cfg.ms);
    votes.push({ uci: u, w: h.w });
  }
  let u = process.env.DKB_OLD ? A.dkbVote(votes, pos) : A.dkbChoose(votes, wide, pos);
  let mv = u ? A.matchUci(pos, u) : null;
  if(!mv){ const lm = A.legalMoves(pos); mv = lm[Math.floor(rnd() * lm.length)]; }
  return { mv, votes, hyp };
}

async function playGame(level, foe, claudiaColor, gi){
  let pos = A.parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark");
  const states = [pos], ucis = [], memo = {}; const rep = { gifts: 0, giftsVisible: 0, plies: 0, end: "", winner: "", mat: 0, lastThreat: "" };
  const me = claudiaColor, him = opp(me);
  for(let ply = 0; ply < 200; ply++){
    const oc = A.outcome(pos, null);
    if(oc !== "normal"){
      rep.end = oc;
      if(oc === "checkmate") rep.winner = opp(pos.turn); else if(oc === "nokings") rep.winner = A.kingPos(pos.board, "w") ? "w" : "b"; else rep.winner = "-";
      break;
    }
    let mv;
    if(pos.turn === me){
      const r = await claudiaMove(pos, states.slice(), ucis.slice(), me, level, memo, { main: true });
      mv = r.mv;
      // ¿regaló el rey? (tras su jugada, el rival puede comérselo) y ¿lo podía ver ella?
      const q = A.applyMove(pos, mv); const takers = kingTakers(q, me, him, null);
      if(takers.length){
        rep.gifts++;
        const vis = A.fogVisible(pos, me), vq = A.fogVisible(q, me);
        const seen = kingTakers(q, me, him, vq).length > 0;   // ¿alguna de esas piezas estaba a su vista tras mover?
        if(seen) rep.giftsVisible++;
      }
    } else {
      mv = foe === "greedy" ? greedyMove(pos) : (await claudiaMove(pos, states.slice(), ucis.slice(), him, +foe, memo2, null)).mv;
    }
    ucis.push(A.uciOf(mv)); pos = A.applyMove(pos, mv); states.push(pos); rep.plies++;
  }
  if(!rep.end){ rep.end = "limite"; rep.winner = "-"; }
  return rep;
}
let memo2 = {};

(async () => {
  const [lv, foe, n, sd, col] = process.argv.slice(2);
  if(sd) seed = +sd;
  await boot();
  const res = [];
  for(let g = 0; g < +n; g++){
    memo2 = {};
    const c = col === "w" || col === "b" ? col : (g % 2 ? "b" : "w");
    const r = await playGame(+lv, foe, c, g); r.col = c; res.push(r);
    process.stderr.write(`  [${g + 1}/${n}] claudIA(${c}) ${r.winner === c ? "GANA" : r.winner === "-" ? "tablas" : "pierde"} ${r.end} en ${r.plies} plies; rey regalado ${r.gifts} (a la vista ${r.giftsVisible})\n`);
  }
  const w = res.filter(r => r.winner === r.col).length, d = res.filter(r => r.winner === "-").length, l = res.length - w - d;
  const gifts = res.reduce((t, r) => t + r.gifts, 0), gv = res.reduce((t, r) => t + r.giftsVisible, 0), pl = res.reduce((t, r) => t + r.plies, 0);
  console.log(JSON.stringify({ nivel: +lv, rival: foe, partidas: res.length, gana: w, tablas: d, pierde: l, plies_medios: Math.round(pl / res.length), reyes_regalados: gifts, de_ellos_a_la_vista: gv }));
  process.exit(0);
})();
