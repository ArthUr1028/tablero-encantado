// Asara en línea / Reto: la partida viaja como lista de SAN (game_moves) y el otro lado la reconstruye desde ZH_START con applySanList.
// Aquí se juega al azar con las funciones REALES de index.html (capturas, caídas, esclavas, coronaciones) y se comprueba que repetir
// SOLO los SAN da exactamente la misma posición (FEN con reserva) Y las mismas marcas de esclava (board.zh.sl), jugada a jugada.
// Uso: node tests/asara.repeticion.test.js [partidas=60] [plies=160] [semilla=11]
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if(i < 0) throw new Error("No encontré " + re); return i; };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\b")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const code = "var game=null,liveGame=null,currentMode='play',darkReveal=false,branch=null,vsMachine=false,machineHumanColor='w';\n" +
  src.slice(a, z).join("\n") + "\n" + ["applySanList", "moveUci", "matchUci"].filter(n => { try{ grab(n); return true; }catch(e){ return false; } }).map(grab).join("\n") +
  "\nconst normSAN = " + src[find(/^const normSAN = /)].replace(/^const normSAN = /, "") + "\nfunction newGame(fen, meta){ game = { states: [parseFEN(fen)], sans: [], ucis: [], moves: [], startFEN: fen, cursor: 0 }; }\nthis.__api = { parseFEN, toFEN, legalMoves, applyMove, outcome, moveWithSAN, toSAN, uciOf, matchUci, variantOf, ZH_START, cloneState, get game(){ return game; }, applySanList: typeof applySanList === 'function' ? applySanList : null };";
const ctx = vm.createContext({ document: { getElementById: () => null }, window: {}, console, Math, localStorage: { getItem: () => null, setItem(){} }, setTimeout, clearTimeout });
try{ vm.runInContext(code, ctx); }catch(e){ console.log("No se pudo cargar:", e.message); process.exit(2); }
const A = ctx.__api;
if(!A.applySanList){ console.log("applySanList no se pudo aislar en el vm"); process.exit(2); }
let sem = +(process.argv[4] || 11); const rnd = () => (sem = (sem * 1664525 + 1013904223) >>> 0) / 4294967296;
const N = +(process.argv[2] || 60), P = +(process.argv[3] || 160);
let fallos = 0, jug = 0, caidas = 0, esclavas = 0, mov_esc = 0;
const ok = (c, m) => { if(!c){ fallos++; console.log("  FALLA " + m); } };
const slKey = s => JSON.stringify(Object.keys((s.board.zh && s.board.zh.sl) || {}).sort());
for(let g = 0; g < N; g++){
  let st = A.parseFEN(A.ZH_START); const sans = [], ucis = [];
  for(let p = 0; p < P; p++){
    const L = A.legalMoves(st); if(!L.length) break;
    // sesgo: preferir caídas y capturas para ejercitar reserva y esclavas
    const pref = L.filter(m => m.drop || st.board[m.to[0]][m.to[1]]); const m = (pref.length && rnd() < .6 ? pref : L)[Math.floor(rnd() * (pref.length && rnd() < .6 ? pref.length : L.length))] || L[0];
    ucis.push(A.uciOf(m, st.board)); const r = A.moveWithSAN(st, m); st = r.n; sans.push(r.san); jug++;
    if(m.drop) caidas++; if(m.slave) mov_esc++;
  }
  esclavas += Object.keys((st.board.zh && st.board.zh.sl) || {}).length;
  // el otro lado: solo los SAN
  A.applySanList(A.ZH_START, sans, {});
  const gm = A.game, fin = gm.states[gm.states.length - 1];
  ok(gm.sans.length === sans.length, "partida " + g + ": se reprodujeron " + gm.sans.length + " de " + sans.length + " jugadas");
  ok(A.toFEN(fin) === A.toFEN(st), "partida " + g + ": la FEN final difiere\n   a: " + A.toFEN(st) + "\n   b: " + A.toFEN(fin));
  ok(slKey(fin) === slKey(st), "partida " + g + ": las marcas de esclava difieren " + slKey(st) + " vs " + slKey(fin));
  // guardado local (restore / retoRestore): startFEN + UCI, igual que persist()
  let sr = A.parseFEN(A.ZH_START), bien = true;
  for(const u of ucis){ const mv = A.matchUci(sr, u); if(!mv){ bien = false; break; } sr = A.moveWithSAN(sr, mv).n; }
  ok(bien && A.toFEN(sr) === A.toFEN(st) && slKey(sr) === slKey(st), "partida " + g + ": restaurar desde UCI no reproduce la misma posición/marcas");
  // además, cualquier posición intermedia (reanudar a la mitad): re-aplicar los primeros k
  const k = Math.floor(sans.length / 2); A.applySanList(A.ZH_START, sans.slice(0, k), {});
  const mid = A.game.states[A.game.states.length - 1]; let st2 = A.parseFEN(A.ZH_START); for(let i = 0; i < k; i++){ const pos = st2; const lm = A.legalMoves(pos); const mv = lm.find(x => A.toSAN(pos, x, lm) === sans[i]) || lm.find(x => A.moveWithSAN(pos, x).san === sans[i]); st2 = A.moveWithSAN(pos, mv).n; }
  ok(slKey(mid) === slKey(st2), "partida " + g + ": marcas a media partida difieren");
}
console.log("Asara repetición: " + N + " partidas, " + jug + " jugadas (" + caidas + " caídas, " + mov_esc + " jugadas de esclava, " + esclavas + " esclavas al final).");
console.log(fallos ? fallos + " fallos" : "Todo bien"); process.exit(fallos ? 1 : 0);
