// 2.319 · Crazyhouse: las reglas del Tablero (funciones REALES de index.html, cargadas en un vm) contra el motor Fairy-Stockfish real.
// Uso:  node tests/crazyhouse.reglas.test.js [partidas=40] [plies=140] [semilla=7]
// Comprueba: (1) perft (conteo de jugadas) en posiciones con reserva, piezas promovidas, jaques, al paso y enroque; (2) partidas al azar
// ply a ply: el CONJUNTO de jugadas legales y la FEN resultante (reserva, «~», reloj de medias jugadas) coinciden con las del motor.
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\b")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w';\n" +
  src.slice(a, z).join("\n") + "\n" + grab("matchUci") +
  "\nthis.__api = { parseFEN, toFEN, legalMoves, applyMove, outcome, uciOf, matchUci, moveWithSAN, variantOf, ZH_START, cloneState };";
const ctx = vm.createContext({ document: {}, window: {}, console, Math });
vm.runInContext(code, ctx);
const A = ctx.__api;

let M, ready = false, lines = [];
async function boot(){
  const realLog = console.log;
  process.chdir(ROOT);
  const hook = l => { lines.push(String(l)); };
  console.log = hook;
  M = require(path.join(ROOT, "fairy-stockfish-engine.js"));
  M.print = hook; M.printErr = () => {}; M.postRun = [() => { ready = true; }];
  for(let i = 0; i < 200 && !ready; i++) await new Promise(r => setTimeout(r, 50));
  console.log = realLog;
  cmd("setoption name UCI_Variant value crazyhouse"); cmd("isready");
}
const cmd = c => M.ccall("fsf_command", null, ["string"], [c]);
async function until(re, ms = 20000){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){ const i = lines.findIndex(l => re.test(l)); if(i >= 0) return i; await new Promise(r => setTimeout(r, 5)); }
  throw new Error("el motor no respondió: " + re);
}
const fsfFen = f => f.replace(/\s+zh\s*$/, "");
async function perft(fen, depth){
  lines = []; cmd("position fen " + fsfFen(fen)); cmd("go perft " + depth);
  const i = await until(/^Nodes searched/);
  const total = +lines[i].split(":")[1];
  const div = new Set(); for(const l of lines.slice(0, i)) { const m = l.match(/^(\S+): (\d+)/); if(m) div.add(m[1]); }
  return { total, div };
}
async function fenAfter(startFen, moves){
  lines = []; cmd("position fen " + fsfFen(startFen) + (moves.length ? " moves " + moves.join(" ") : "")); cmd("d");
  const i = await until(/^Fen:/); const f = lines[i].replace(/^Fen:\s*/, "").trim();
  await until(/^Checkers:/); return f;
}
const norm = f => {   // reserva ordenada y sin el marcador «zh»
  f = f.replace(/\s+zh\s*$/, "");
  f = f.replace(/\[([^\]]*)\]/, (m, h) => "[" + h.split("").sort().join("") + "]");
  // el motor solo escribe la casilla de «al paso» cuando de verdad hay captura posible; el Tablero la escribe tras toda salida doble (posKey ya la normaliza)
  const t = f.split(" "); if(t.length >= 4) t[3] = "-"; return t.join(" ");
};
function mine(fen, depth){   // perft propio
  const rec = (s, d) => { if(d === 0) return 1; const L = A.legalMoves(s); if(d === 1) return L.length; let n = 0; for(const m of L) n += rec(A.applyMove(s, m), d - 1); return n; };
  return rec(A.parseFEN(fen), depth);
}

let fallos = 0, total = 0;
const ok = (c, msg) => { total++; if(!c){ fallos++; console.log("  FALLA " + msg); } else console.log("  ok   " + msg); };

(async () => {
  await boot();
  console.log("Crazyhouse: reglas contra Fairy-Stockfish");

  // ---- 1. perft en posiciones escogidas (reserva, promovidas, jaques, al paso, enroque)
  const POS = [
    ["inicial", A.ZH_START, 3],
    ["con reservas grandes", "r3k2r/ppp2ppp/8/8/8/8/PPP2PPP/R3K2R[QRBNPqrbnp] w KQkq - 0 1 zh", 2],
    ["promovida en el tablero (Q~) y reserva", "r3k3/1P4P1/8/8/8/8/8/4K3[Pp] w - - 0 1 zh", 3],
    ["pieza promovida ya en juego", "rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 zh", 3],
    ["jaque: se puede interponer una caída", "4k3/8/8/8/8/8/4r3/4K3[Nbp] w - - 0 1 zh", 3],
    ["peones en reserva (no 1.ª ni 8.ª fila)", "4k3/8/8/8/8/8/8/4K3[Pp] w - - 0 1 zh", 3],
    ["al paso y caídas", "rnbqkbnr/pp1ppppp/8/8/2pP4/8/PPP1PPPP/RNBQKBNR[Pp] b KQkq d3 0 3 zh", 3],
    ["mate con caída de peón posible", "6k1/5ppp/8/8/8/8/8/R5K1[Rr] w - - 0 1 zh", 3],
  ];
  for(const [nombre, fen, d] of POS){
    const f = await perft(fen, d), m = mine(fen, d);
    ok(f.total === m, "perft " + d + " «" + nombre + "»: motor " + f.total + " · Tablero " + m);
  }

  // ---- 2. partidas al azar: mismas jugadas legales y misma FEN ply a ply
  const NG = +process.argv[2] || 40, NP = +process.argv[3] || 140;
  let seed = +process.argv[4] || 7;
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let plies = 0, caidas = 0, promos = 0, mal = 0, fin = { checkmate: 0, stalemate: 0, otros: 0 };
  for(let g = 0; g < NG && mal < 3; g++){
    let s = A.parseFEN(A.ZH_START); const hist = [];
    for(let p = 0; p < NP; p++){
      const L = A.legalMoves(s);
      const f = await perft(A.toFEN(s), 1);
      const mineSet = new Set(L.map(m => A.uciOf(m)));
      const igual = f.div.size === mineSet.size && [...f.div].every(u => mineSet.has(u));
      if(!igual){
        mal++; const solo1 = [...f.div].filter(u => !mineSet.has(u)), solo2 = [...mineSet].filter(u => !f.div.has(u));
        console.log("  FALLA jugadas distintas en la partida " + g + ", ply " + p + "\n        FEN " + A.toFEN(s) + "\n        solo el motor: " + solo1.join(" ") + "\n        solo el Tablero: " + solo2.join(" ")); fallos++; total++; break;
      }
      if(!L.length){ A.outcome(s) === "checkmate" ? fin.checkmate++ : fin.stalemate++; break; }
      // elegir: sesgo hacia capturas, caídas y promociones para ejercitar la reserva
      const pref = L.filter(m => m.capture || m.drop || m.promo);
      const pick = (pref.length && rnd() < 0.6) ? pref[Math.floor(rnd() * pref.length)] : L[Math.floor(rnd() * L.length)];
      if(pick.drop) caidas++; if(pick.promo) promos++;
      s = A.applyMove(s, pick); hist.push(A.uciOf(pick)); plies++;
      const ff = await fenAfter(A.ZH_START, hist);
      const mf = norm(A.toFEN(s));
      if(norm(ff) !== mf){
        mal++; fallos++; total++;
        console.log("  FALLA FEN distinta en la partida " + g + ", ply " + p + " tras " + hist.slice(-3).join(" ") + "\n        motor   " + norm(ff) + "\n        Tablero " + mf); break;
      }
      const oc = A.outcome(s); if(oc !== "normal" && oc !== "check"){ fin.otros++; break; }
    }
  }
  ok(mal === 0, NG + " partidas al azar (" + plies + " jugadas, " + caidas + " caídas, " + promos + " promociones): jugadas legales y FEN idénticas al motor · finales: " + fin.checkmate + " mates, " + fin.stalemate + " ahogados, " + fin.otros + " otros");

  console.log(fallos ? "\nHAY FALLOS (" + fallos + " de " + total + ")" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
