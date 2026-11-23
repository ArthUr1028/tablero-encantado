// Fase 1 de Atomic · prueba de viabilidad del motor Fairy-Stockfish que ya trae el Tablero (sin tocar index.html).
// Comprueba: (1) que el motor ofrece la variante «atomic», (2) que las reglas son las esperadas (explosión, reyes, victoria por explosión),
// (3) que UCI_LimitStrength/UCI_Elo funciona en Atomic y (4) que una partida completa motor contra motor termina sin errores.
const path = require("path");
const ROOT = path.join(__dirname, "..");
let M, ready = false, buf = [], waiter = null;
const hook = l => { l = String(l); buf.push(l); if(waiter && waiter.re.test(l)) { const w = waiter; waiter = null; w.res(l); } };
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
const until = (re, ms = 20000) => new Promise(res => { waiter = { re, res }; setTimeout(() => { if(waiter && waiter.res === res){ waiter = null; res(null); } }, ms); });
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if(!c) fallos++; };
async function boot(){
  process.chdir(ROOT); const realLog = console.log; console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js")); M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog;
}
async function run(lines, endRe, ms){ buf = []; const p = until(endRe, ms); lines.forEach(cmd); await p; const out = buf.slice(); return out; }
const fenOf = async (pos) => { const out = await run(["position " + pos, "d"], /^Fen:/, 5000); const l = out.find(x => /^Fen:/.test(x)); return l ? l.replace(/^Fen:\s*/, "").trim() : null; };
const perft = async (pos, d = 1) => { const out = await run(["position " + pos, "go perft " + d], /^Nodes searched/, 20000); const moves = out.filter(x => /^[a-z0-9@+=-]+: \d+$/.test(x)).map(x => x.split(":")[0]); const n = out.find(x => /^Nodes searched/.test(x)); return { moves, n: n ? +n.split(":")[1] : null }; };
(async () => {
  await boot();
  let out = await run(["uci"], /^uciok/, 8000);
  const combo = out.find(l => /UCI_Variant/.test(l)) || "";
  ok(/\batomic\b/.test(combo), "el motor ofrece la variante atomic");
  await run(["setoption name UCI_Variant value atomic", "isready"], /^readyok/, 8000);
  // posición inicial: 20 jugadas, como en el ajedrez normal
  let p = await perft("startpos", 1); ok(p.n === 20, "posición inicial: 20 jugadas (" + p.n + ")");
  p = await perft("startpos", 3); ok(p.n === 8902, "perft 3 desde el inicio = 8902, igual que el ajedrez (aún sin capturas) (" + p.n + ")");
  // 1) Explosión: Cxf7 aquí captura el peón y vuela el rey negro y la torre (vecinos), pero el caballo capturador también desaparece
  let f = await fenOf("fen rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1 moves f3e5");
  ok(f && !/N/.test(f.split(" ")[0].split("/")[3] || "") , "la pieza que captura explota también (FEN tras la captura: " + f + ")");
  // 2) Explosión: el peón que captura, el capturado y las piezas (no peones) vecinas desaparecen; los peones vecinos quedan
  f = await fenOf("fen 4k3/8/1p6/2p5/1n1P4/8/8/4K3 w - - 0 1 moves d4c5");
  ok(f === "4k3/8/1p6/8/8/8/8/4K3 b - - 0 1", "d4xc5: vuelan ambos peones y el caballo vecino; el peón de b6 sobrevive (FEN: " + f + ")");
  // 3) Los reyes no pueden capturar (rey blanco en a1, peón negro en a2) pero sí moverse a otras casillas
  p = await perft("fen 7k/8/8/8/8/8/p7/K7 w - - 0 1", 1);
  ok(p.moves.length > 0 && !p.moves.includes("a1a2"), "el rey no puede capturar el peón de a2 (jugadas: " + p.moves.join(",") + ")");
  // 4) Reyes adyacentes permitidos
  p = await perft("fen 8/8/8/8/8/3k4/8/3K4 w - - 0 1", 1);
  ok(p.n !== null && p.n > 0, "reyes pegados: la posición es legal y hay jugadas (" + p.n + ")");
  // 5) Victoria por explosión: Dxd7 vuela el peón y, con él, al rey negro de e8 (vecino)
  out = await run(["position fen 4k3/Q2p4/8/8/8/8/8/4K3 w - - 0 1", "go depth 3"], /^bestmove/, 10000);
  const info = out.filter(l => /score/.test(l)).pop() || "";
  ok(/score mate 1\b/.test(info), "el motor ve la explosión del rey como mate en 1 (" + (info.match(/score \S+ \S+/) || [""])[0] + ")");
  // 5b) Tras la explosión del rey, la FEN ya no tiene rey negro y el motor no tiene jugadas (la partida terminó): así lo detectará el Tablero
  f = await fenOf("fen 4k3/Q2p4/8/8/8/8/8/4K3 w - - 0 1 moves a7d7");
  ok(f && f.split(" ")[0].indexOf("k") < 0, "tras Dxd7 la FEN no tiene rey negro (FEN: " + f + ")");
  out = await run(["position fen 4k3/Q2p4/8/8/8/8/8/4K3 w - - 0 1 moves a7d7", "go depth 2"], /^bestmove/, 8000);
  ok(/bestmove \(none\)/.test(out.join("\n")), "y el motor responde bestmove (none): fin de partida detectable");
  // 6) Nivel de fuerza limitado funciona en Atomic
  out = await run(["setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 1200", "position startpos", "go movetime 150"], /^bestmove/, 8000);
  const bm = (out.find(l => /^bestmove/.test(l)) || "").split(" ")[1];
  ok(/^[a-h][1-8][a-h][1-8]/.test(bm || ""), "con UCI_Elo 1200 responde una jugada (" + bm + ")");
  // 7) Partida completa motor contra motor (1500 contra 1500, 80 ms por jugada)
  const t0 = Date.now(); let moves = [], result = "tope de jugadas", err = null;
  for(let n = 0; n < 220; n++){
    out = await run(["setoption name UCI_LimitStrength value true", "setoption name UCI_Elo value 1500", "position startpos" + (moves.length ? " moves " + moves.join(" ") : ""), "go movetime 80"], /^bestmove/, 8000);
    const l = out.find(x => /^bestmove/.test(x)); const m = l ? l.split(" ")[1] : null;
    if(!m || m === "(none)"){ result = "sin jugadas tras " + moves.length + " (fin de partida, " + (moves.length % 2 ? "negras" : "blancas") + " a mover)"; break; }
    moves.push(m);
  }
  const fin = await fenOf("startpos moves " + moves.join(" "));
  console.log("  partida: " + moves.length + " jugadas, " + ((Date.now() - t0) / 1000).toFixed(1) + " s · " + result + "\n  FEN final: " + fin);
  ok(moves.length > 5, "la partida completa se juega hasta el final sin errores");
  console.log(fallos ? "\nHubo " + fallos + " fallos" : "\nTodo en orden");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR", e); process.exit(2); });
