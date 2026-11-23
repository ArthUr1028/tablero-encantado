// 2.367 · Atomic: el generador de jugadas del Tablero contra el motor Fairy-Stockfish (variante atomic).
// En miles de posiciones de partidas al azar (con sesgo a las capturas, para que haya explosiones) compara el conjunto de jugadas legales.
// Uso: node tests/atomic_reglas.test.js [partidas=150] [semilla=1] [plies=90]
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w';\n" +
  src.slice(a, z).join("\n") + "\nthis.__api = { parseFEN, toFEN, legalMoves, applyMove, outcome, uciOf, inCheck, START };";
const ctx = vm.createContext({ document: {}, window: {}, console, Math });
vm.runInContext(code, ctx);
const A = ctx.__api;
let M, ready = false, buf = [], waiter = null;
const hook = l => { l = String(l); buf.push(l); if(waiter && waiter.re.test(l)){ const w = waiter; waiter = null; w.res(l); } };
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
const until = (re, ms = 20000) => new Promise(res => { waiter = { re, res }; setTimeout(() => { if(waiter && waiter.res === res){ waiter = null; res(null); } }, ms); });
async function boot(){
  process.chdir(ROOT); const realLog = console.log; console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js")); M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog;
  cmd("setoption name UCI_Variant value atomic"); cmd("isready");
}
async function engineMoves(fen){
  buf = []; const p = until(/^Nodes searched/, 15000);
  cmd("position fen " + fen); cmd("go perft 1"); await p;
  return buf.filter(x => /^[a-z0-9@+=-]+: \d+$/.test(x)).map(x => x.split(":")[0]);
}
let seed = +(process.argv[3] || 1); const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
(async () => {
  await boot();
  const N = +(process.argv[2] || 150), PLIES = +(process.argv[4] || 90);
  let pos = 0, bad = 0, explosions = 0, kingBoom = 0, ended = 0;
  const show = (fen, ours, eng) => { console.log("  FALLA " + fen + "\n    solo nuestras: " + ours.filter(m => !eng.includes(m)).join(",") + "\n    solo del motor: " + eng.filter(m => !ours.includes(m)).join(",")); };
  for(let g = 0; g < N && bad < 8; g++){
    let s = A.parseFEN(A.START + " atomic");
    for(let ply = 0; ply < PLIES; ply++){
      const legal = A.legalMoves(s), fen = A.toFEN(s).replace(/\s+atomic$/, "");
      const ours = legal.map(m => A.uciOf(m, false)).sort(), eng = (await engineMoves(fen)).sort();
      pos++;
      if(ours.join(",") !== eng.join(",")){ bad++; show(fen, ours, eng); break; }
      const oc = A.outcome(s);
      if(!legal.length || oc === "nokings" || oc === "checkmate" && !legal.length){ ended++; break; }
      if(!legal.length) break;
      const caps = legal.filter(m => m.capture);
      const mv = caps.length && rnd() < 0.45 ? caps[Math.floor(rnd() * caps.length)] : legal[Math.floor(rnd() * legal.length)];
      const nxt = A.applyMove(s, mv);
      if(mv.capture) explosions++;
      s = nxt;
      const wk = s.board.flat().includes("wk"), bk = s.board.flat().includes("bk");
      if(!wk || !bk){ kingBoom++; const o2 = A.outcome(s); if(o2 !== "checkmate" && o2 !== "nokings"){ bad++; console.log("  FALLA outcome tras explotar un rey: " + o2); } ended++; break; }
    }
  }
  console.log("  posiciones comparadas: " + pos + " · capturas jugadas: " + explosions + " · partidas que acabaron por rey explotado: " + kingBoom + " · discrepancias: " + bad);
  console.log(bad ? "\\nHubo discrepancias" : "\\nTodo en orden");
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error("ERROR", e); process.exit(2); });
