// 2.373 · Mide si CLAUDIA aprovecha las explosiones en Atomic, por nivel.
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
let seed = +(process.argv[4] || 3); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
(async () => {
  await boot();
  const N = +(process.argv[2] || 40), LV = (process.argv[3] || "0,5,10,15,20").split(",").map(Number), MODO = process.argv[5] || "actual";
  const pos = [];
  for(let g = 0; pos.length < N && g < 4000; g++){
    let s = A.parseFEN(A.START + " atomic");
    for(let ply = 0; ply < 70 && pos.length < N; ply++){
      const legal = A.legalMoves(s); if(!legal.length) break;
      const good = legal.filter(m => m.capture && gain(s, m) >= 3);
      if(good.length && rnd() < 0.5 && ply > 6) pos.push(s);
      const caps = legal.filter(m => m.capture), mv = caps.length && rnd() < 0.4 ? caps[Math.floor(rnd() * caps.length)] : legal[Math.floor(rnd() * legal.length)];
      s = A.applyMove(s, mv); if(!s.board.flat().includes("wk") || !s.board.flat().includes("bk")) break;
    }
  }
  console.log("posiciones con una explosión ganadora: " + pos.length + " · modo " + MODO);
  for(const lv of LV){
    let hit = 0, king = 0, kingN = 0, avg = 0, t0 = Date.now();
    for(const s of pos){
      const legal = A.legalMoves(s), best = Math.max(...legal.map(m => m.capture ? gain(s, m) : -9));
      let uci = await engineMove(A.toFEN(s).replace(/\s+atomic$/, ""), lv), mv = legal.find(m => A.uciOf(m, false) === uci);
      if(MODO === "tactico" && A.atomicTactic){ const t = A.atomicTactic(s, lv, mv, legal); if(t) mv = t; }
      const g = mv && mv.capture ? gain(s, mv) : -9;
      if(g >= 3) hit++; if(best >= 1000){ kingN++; if(g >= 1000) king++; } avg += g >= 1000 ? 10 : g;
    }
    console.log("nivel " + String(lv).padStart(2) + " (Elo " + ((A.ATOMIC_ELO && A.ATOMIC_ELO[lv]) || A.FSF_ELO_FOR_LEVEL[lv]) + "): aprovecha la explosión " + hit + "/" + pos.length + " (" + Math.round(100 * hit / pos.length) + " %)" + (kingN ? " · mata al rey " + king + "/" + kingN : "") + " · " + Math.round((Date.now() - t0) / pos.length) + " ms/jugada");
  }
  process.exit(0);
})().catch(e => { console.error("ERROR", e); process.exit(2); });
