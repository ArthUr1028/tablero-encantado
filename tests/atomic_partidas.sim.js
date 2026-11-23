// 2.373 · Partidas simuladas de Atomic entre dos niveles de CLAUDIA (con el ojo táctico).
// Uso: node tests/atomic_partidas.sim.js <nivelA> <nivelB> [partidas=6] [semilla=7]
// (cabecera heredada de atomic_nivel.sim.js)
// Uso: node tests/atomic_nivel.sim.js [posiciones=40] [niveles=0,5,10,15,20] [semilla=3] [modo=actual|tactico]
// Recoge posiciones de partidas al azar (sesgadas a capturas) donde el bando que mueve tiene una jugada que explota al rey rival o gana ≥3 de material neto
// (lo que vuela del rival − lo que pierde). Para cada nivel pide la jugada al motor con la misma configuración que el Tablero y cuenta cuántas veces la juega
// (o juega otra captura que también gane ≥3). `modo=tactico` aplica además el filtro táctico del Tablero (atomicTactic).
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\b")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const extra = ["atomicTacticP", "atomicGain", "atomicNet", "atomicTactic", "machineMovetimeFor"].map(n => { try{ return grab(n); }catch(e){ return ""; } }).join("\n");
const eloLine = src.filter(l => /^const (FSF_ELO_FOR_LEVEL|ATOMIC_ELO_FOR_LEVEL|ATOMIC_TACTIC) *=/.test(l)).join("\n");
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w';\n" +
  src.slice(a, z).join("\n") + "\n" + extra + "\n" + eloLine +
  "\nthis.__api = { parseFEN, toFEN, legalMoves, applyMove, outcome, uciOf, matchUci: typeof matchUci==='function'?matchUci:null, START, machineMovetimeFor, FSF_ELO_FOR_LEVEL, atomicGain: typeof atomicGain==='function'?atomicGain:null, atomicTactic: typeof atomicTactic==='function'?atomicTactic:null, ATOMIC_ELO: typeof ATOMIC_ELO_FOR_LEVEL==='undefined'?null:ATOMIC_ELO_FOR_LEVEL };";
const ctx = vm.createContext({ document: {}, window: {}, console, Math });
vm.runInContext(code, ctx);
const A = ctx.__api;
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const gain = (pos, mv) => {   // ganancia neta de material de quien mueve (1000 si explota al rey rival)
  const q = A.applyMove(pos, mv), me = pos.turn;
  const cnt = (b, col) => { let m = 0, k = false; for(const row of b) for(const p of row) if(p && p[0] === col){ if(p[1] === "k") k = true; else m += VAL[p[1]]; } return { m, k }; };
  const e0 = cnt(pos.board, me === "w" ? "b" : "w"), e1 = cnt(q.board, me === "w" ? "b" : "w"), o0 = cnt(pos.board, me), o1 = cnt(q.board, me);
  if(e0.k && !e1.k) return 1000;
  return (e0.m - e1.m) - (o0.m - o1.m);
};
let M, ready = false, buf = [], waiter = null;
const hook = l => { l = String(l); buf.push(l); if(waiter && waiter.re.test(l)){ const w = waiter; waiter = null; w.res(l); } };
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
const until = (re, ms) => new Promise(res => { waiter = { re, res }; setTimeout(() => { if(waiter && waiter.res === res){ waiter = null; res(null); } }, ms); });
async function boot(){
  process.chdir(ROOT); const realLog = console.log; console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js")); M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog; cmd("setoption name UCI_Variant value atomic"); cmd("setoption name MultiPV value 1"); cmd("isready");
}
async function engineMove(fen, level){
  const elo = (A.ATOMIC_ELO && A.ATOMIC_ELO[level]) || A.FSF_ELO_FOR_LEVEL[level] || 500, ms = A.machineMovetimeFor(level);
  cmd("setoption name UCI_LimitStrength value true"); cmd("setoption name UCI_Elo value " + elo);
  cmd("position fen " + fen); const p = until(/^bestmove/, ms + 9000); cmd("go movetime " + ms);
  const l = await p; return l ? l.split(" ")[1] : null;
}
let seed = +(process.argv[5] || 7); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
// Partidas entre dos niveles (los colores alternan; ambos con el ojo táctico del Tablero). Uso: node tests/atomic_nivel.sim.js-partidas: ver abajo.
async function pickMove(s, lv){
  const legal = A.legalMoves(s); if(!legal.length) return null;
  let uci = await engineMove(A.toFEN(s).replace(/\s+atomic$/, ""), lv), mv = legal.find(m => A.uciOf(m, false) === uci) || legal[0];
  const t = A.atomicTactic(s, lv, mv, legal); return t || mv;
}
const mat = (s, c) => { const V = { p: 1, n: 3, b: 3, r: 5, q: 9 }; let m = 0; for(const row of s.board) for(const p of row) if(p && p[0] === c) m += V[p[1]] || 0; return m; };
(async () => {
  await boot();
  const lvA = +process.argv[2], lvB = +process.argv[3], G = +process.argv[4] || 6, CAP = 90;
  let w = 0, d = 0, l = 0;
  for(let g = 0; g < G; g++){
    const aWhite = g % 2 === 0; let s = A.parseFEN(A.START + " atomic"), res = null, ply = 0;
    for(; ply < CAP; ply++){
      const o = A.outcome(s), legal = A.legalMoves(s);
      if(!s.board.flat().includes("wk") || !s.board.flat().includes("bk")){ res = s.board.flat().includes("wk") ? "w" : "b"; break; }
      if(!legal.length){ res = o === "checkmate" ? (s.turn === "w" ? "b" : "w") : "d"; break; }
      if(o === "draw50" || o === "draw3" || o === "material"){ res = "d"; break; }
      const lv = (s.turn === "w") === aWhite ? lvA : lvB;
      s = A.applyMove(s, await pickMove(s, lv));
    }
    if(!res){ const df = mat(s, "w") - mat(s, "b"); res = df >= 3 ? "w" : df <= -3 ? "b" : "d"; }
    const aWon = res === (aWhite ? "w" : "b"); if(res === "d") d++; else if(aWon) w++; else l++;
    console.log("  partida " + (g + 1) + ": " + (res === "d" ? "tablas" : aWon ? "gana el nivel " + lvA : "gana el nivel " + lvB) + " en " + ply + " jugadas");
  }
  console.log("nivel " + lvA + " contra nivel " + lvB + ": +" + w + " =" + d + " -" + l);
  process.exit(0);
})().catch(e => { console.error("ERROR", e); process.exit(2); });
