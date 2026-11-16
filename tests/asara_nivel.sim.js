// 2.344 · Simulador de niveles de claudIA en ASARA (reglas nuevas de 2.342). Uso:
//   node tests/asara_nivel.sim.js <nivelA> <nivelB|greedy> <partidas> [semilla] [tope_de_jugadas=160]
// Usa las funciones REALES de index.html (vm: reglas de Asara) y el motor Fairy-Stockfish WASM real, con la misma configuración que el Tablero:
// UCI_Variant crazyhouse, UCI_LimitStrength + UCI_Elo del nivel (FSF_ELO_FOR_LEVEL) y el movetime de machineMovetimeFor, enviando la FEN del Tablero
// en cada jugada (el motor no sabe de las reglas de Asara, pero solo se usa su jugada, que el Tablero valida). Los colores alternan.
// «greedy» = jugador de a pie: ve el mate en 1, prefiere capturar, no deja piezas a tiro, y suelta cautivos donde estén a salvo.
// Resultado: JSON con victorias/tablas/derrotas del nivel A. Las partidas que llegan al tope se juzgan por material (diferencia ≥ 3).
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\b")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w';\n" +
  src.slice(a, z).join("\n") + "\n" + grab("matchUci") + "\n" + grab("machineMovetimeFor") + "\n" +
  src.find(l => /^const FSF_ELO_FOR_LEVEL/.test(l)) +
  "\nthis.__api = { parseFEN, toFEN, legalMoves, applyMove, outcome, uciOf, matchUci, ZH_START, machineMovetimeFor, FSF_ELO_FOR_LEVEL };";
const ctx = vm.createContext({ document: {}, window: {}, console, Math });
vm.runInContext(code, ctx);
const A = ctx.__api;

let M, ready = false, waiter = null, lines = [];
async function boot(){
  const realLog = console.log; process.chdir(ROOT);
  const hook = l => { l = String(l); lines.push(l); if(waiter && /^bestmove/.test(l)) waiter(l); };
  console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js"));
  M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog;
  cmd("setoption name UCI_Variant value crazyhouse"); cmd("setoption name MultiPV value 1"); cmd("isready");
}
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
async function search(fen, elo, ms){
  cmd("setoption name UCI_LimitStrength value true"); cmd("setoption name UCI_Elo value " + elo);
  cmd("position fen " + fen.replace(/\s+zh\s*$/, ""));
  const p = new Promise(r => { waiter = r; }); cmd("go movetime " + ms);
  const l = await Promise.race([p, new Promise(r => setTimeout(() => r("bestmove (none)"), ms + 8000))]);
  waiter = null; return l.split(" ")[1];
}
let seed = 12345; const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }, opp = c => c === "w" ? "b" : "w";
function material(s, col){ let m = 0; for(const row of s.board) for(const p of row) if(p && p[0] === col) m += VAL[p[1]] === 100 ? 0 : VAL[p[1]]; for(const t of ["n","b","r","q"]) m += s.board.zh[col][t] * VAL[t]; return m; }
function greedyMove(pos){
  const me = pos.turn, legal = A.legalMoves(pos); let best = [], bs = -1e9;
  for(const m of legal){
    const q = A.applyMove(pos, m), oc = A.outcome(q);
    let s = 0;
    if(oc === "checkmate") s += 1000;
    const moved = m.drop ? m.drop : pos.board[m.from[0]][m.from[1]][1];
    if(m.capture) s += 10 * (VAL[m.capture[1]] || 1);
    const att = A.legalMoves(q).filter(x => x.capture && x.to[0] === m.to[0] && x.to[1] === m.to[1]);   // ¿me la pueden comer ahí?
    if(att.length) s -= 6 * (VAL[moved] || 1) - (m.capture ? 0 : 0);
    if(m.drop) s += 1.5;
    s += rnd() * 4; if(s > bs){ bs = s; best = [m]; }
  }
  return best[0] || legal[0];
}
async function pick(pos, who){ if(who === "greedy") return greedyMove(pos); const L = A.legalMoves(pos); const u = await search(A.toFEN(pos), A.FSF_ELO_FOR_LEVEL[who] || 500, A.machineMovetimeFor(who)); return (u && A.matchUci(pos, u)) || L[Math.floor(rnd() * L.length)]; }
async function playGame(lvA, lvB, colA, cap){
  let pos = A.parseFEN(A.ZH_START); const seen = {}; let drops = 0;
  for(let ply = 0; ply < cap; ply++){
    const oc = A.outcome(pos);
    if(oc !== "normal" && oc !== "check"){ if(oc === "checkmate") return { w: opp(pos.turn), end: "mate", plies: ply, drops }; return { w: "-", end: oc, plies: ply, drops }; }
    const key = A.toFEN(pos).split(" ").slice(0, 4).join(" "); seen[key] = (seen[key] || 0) + 1; if(seen[key] >= 3) return { w: "-", end: "repeticion", plies: ply, drops };
    const who = pos.turn === colA ? lvA : lvB, mv = await pick(pos, who); if(mv.drop) drops++;
    pos = A.applyMove(pos, mv);
  }
  const d = material(pos, "w") - material(pos, "b");
  return Math.abs(d) >= 3 ? { w: d > 0 ? "w" : "b", end: "material", plies: cap, drops } : { w: "-", end: "tope", plies: cap, drops };
}
(async () => {
  const [A_, B_, n, sd, capS] = process.argv.slice(2); const lvA = +A_, lvB = B_ === "greedy" ? "greedy" : +B_, cap = +capS || 160;
  if(sd) seed = +sd; await boot();
  const res = [];
  for(let g = 0; g < +n; g++){
    const colA = g % 2 ? "b" : "w", r = await playGame(lvA, lvB, colA, cap); r.colA = colA; res.push(r);
    process.stderr.write(`  [${g + 1}/${n}] nivel ${lvA} (${colA}) ${r.w === colA ? "GANA" : r.w === "-" ? "tablas" : "pierde"} por ${r.end} en ${r.plies} jugadas, ${r.drops} caídas\n`);
  }
  const w = res.filter(r => r.w === r.colA).length, d = res.filter(r => r.w === "-").length;
  console.log(JSON.stringify({ nivel: lvA, rival: lvB, partidas: res.length, gana: w, tablas: d, pierde: res.length - w - d, mates: res.filter(r => r.end === "mate").length, por_material: res.filter(r => r.end === "material").length, plies_medios: Math.round(res.reduce((t, r) => t + r.plies, 0) / res.length) }));
  process.exit(0);
})();
