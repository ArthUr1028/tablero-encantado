// Pruebas de la niebla de Dark Chess (2.105). Se ejecutan con:  node tests/niebla.test.js
// Extraen del index.html las funciones reales (sin copiarlas), así lo que se prueba es lo que corre en el Tablero.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if (i < 0) throw new Error("No encontré " + re); return i; };

// Región del motor: desde las constantes hasta justo antes de «Sonidos» (incluye parseFEN, pseudoMoves, applyMove, legalMoves y outcome)
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
// funciones de niebla (cada una termina en la primera llave de cierre en la columna 0)
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\(")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };

const code = "var game = null, liveGame = null, currentMode = 'play', darkReveal = false, branch = null, vsMachine = false, machineHumanColor = 'w'; function L(){ return branch || game; }\n" +
  src.slice(a, z).join("\n") + "\n" + ["fogVisible", "fogViewer", "darkLocked"].map(grab).join("\n") +
  "\nthis.__api = { parseFEN, fogVisible, fogViewer, darkLocked, legalMoves, applyMove, outcome, sameSq };";
const ctx = vm.createContext({ document: {}, window: {}, console });
vm.runInContext(code, ctx);
const { parseFEN, fogVisible, fogViewer, darkLocked, legalMoves, applyMove, outcome, sameSq } = ctx.__api;

const sq = name => { const c = "abcdefghij".indexOf(name[0]), r = 8 - Number(name[1]); return r + "," + c; };
const lit = (fen, color) => { const v = fogVisible(parseFEN(fen + " dark"), color); return n => v.has(sq(n)); };

let fallos = 0, total = 0;
const prueba = (nombre, fn) => { total++; try { fn(); console.log("  ok   " + nombre); } catch(e){ fallos++; console.log("  FALLA " + nombre + "\n        " + e.message); } };

console.log("Niebla de Dark Chess");

prueba("posición inicial: blancas ven sus piezas y las filas 3 y 4 (avances de peón y saltos de caballo)", () => {
  const v = lit("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "w");
  for(const s of ["a2","e2","h1","e1","a3","e3","h3","a4","e4","h4","c3","f3"]) assert(v(s), s + " debería verse");
  for(const s of ["a5","e5","a7","e7","e8","a8","d6"]) assert(!v(s), s + " debería estar en sombra");
});

prueba("posición inicial: las negras ven su lado, no el de las blancas", () => {
  const v = lit("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", "b");
  for(const s of ["a7","e8","a6","e5","c6","f6"]) assert(v(s), s + " debería verse");
  for(const s of ["e2","e4","a1","e3"]) assert(!v(s), s + " debería estar en sombra");
});

prueba("peón libre ilumina la casilla de enfrente y el salto doble", () => {
  const v = lit("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", "w");
  assert(v("e3") && v("e4"));
});

prueba("peón bloqueado por pieza rival NO ve a quien le tapa el paso (regla 2.105)", () => {
  const v = lit("4k3/8/8/8/4p3/4P3/8/4K3 w - - 0 1", "w");   // peón blanco e3 bloqueado por peón negro e4
  assert(!v("e4"), "e4 debería estar en sombra");
  assert(v("e3"), "su propia casilla sí se ve");
});

prueba("peón bloqueado por pieza propia: la casilla se ve (es suya)", () => {
  const v = lit("4k3/8/8/8/4P3/4P3/8/4K3 w - - 0 1", "w");
  assert(v("e4"));
});

prueba("peón ve la diagonal solo si hay una pieza rival para capturar", () => {
  const v = lit("4k3/8/8/3p4/8/4P3/8/4K3 w - - 0 1", "w");   // peón blanco e3; peón negro en d5 no está en su diagonal
  assert(!v("d4") && !v("f4"), "diagonales vacías no se iluminan");
  const w = lit("4k3/8/8/8/3p4/4P3/8/4K3 w - - 0 1", "w");   // peón negro en d4: capturable
  assert(w("d4"), "la pieza capturable se ve");
  assert(!w("f4"), "la otra diagonal vacía sigue en sombra");
});

prueba("la luz de una torre se detiene en la primera pieza rival: se ve esa, no lo de atrás", () => {
  const v = lit("4k3/4p3/8/8/4n3/8/8/4RK2 w - - 0 1", "w");   // torre e1; caballo negro e4; peón negro e7 detrás
  assert(v("e2") && v("e3") && v("e4"));
  assert(!v("e5") && !v("e7"));
});

prueba("la luz se detiene en la primera pieza propia y no la traspasa", () => {
  const v = lit("4k3/8/8/8/8/4N3/8/4RK2 w - - 0 1", "w");   // torre e1, caballo propio e3
  assert(v("e2") && v("e3"));
  assert(!v("e4") && !v("e6"));
});

prueba("un alfil ilumina su diagonal completa hasta el borde si está libre", () => {
  const v = lit("4k3/8/8/8/8/8/8/B3K3 w - - 0 1", "w");
  for(const s of ["b2","c3","d4","e5","f6","g7","h8"]) assert(v(s), s);
});

prueba("el caballo ve sus destinos de salto y no casillas fuera de su alcance", () => {
  const v = lit("4k3/8/8/8/8/2p5/8/N3K3 w - - 0 1", "w");   // caballo a1 -> b3, c2; peón negro en c3 no está en su alcance
  assert(v("b3") && v("c2"));
  assert(!v("c3"));
});

prueba("la pieza rival capturable se ve; la que no está en alcance queda oculta", () => {
  const v = lit("4k3/8/8/8/8/8/4p3/4K2R w - - 0 1", "w");   // rey e1 ve e2 (peón negro capturable); torre h1 no
  assert(v("e2"));
  assert(!v("e8"));
});

prueba("al paso: tras un doble avance rival junto a mi peón, veo el peón que puedo capturar", () => {
  const fen = "4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1 dark";   // peón blanco d5, peón negro acaba de jugar e7-e5
  const v = fogVisible(parseFEN(fen), "w");
  assert(v.has(sq("e6")), "e6 (casilla de destino) se ve");
  assert(v.has(sq("e5")), "e5 (peón rival capturable al paso) se ve");
});

prueba("al paso: el otro bando no usa mi derecho de captura al paso para ver más", () => {
  const fen = "4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1 dark";
  const v = fogVisible(parseFEN(fen), "b");   // turno de blancas; las negras no tienen derecho al paso
  assert(v.has(sq("e5")), "su propio peón se ve");
  assert(!v.has(sq("d5")), "el peón blanco rival sigue oculto: nadie le da luz");
});

prueba("el rey ve sus ocho casillas vecinas", () => {
  const v = lit("4k3/8/8/8/3K4/8/8/8 w - - 0 1", "w");
  for(const s of ["c3","d3","e3","c4","e4","c5","d5","e5"]) assert(v(s), s);
  assert(!v("d6") && !v("b4"));
});

prueba("1.e4 e5 2.Nf3 f5: el peón e4 solo ve f5; e5 se ve únicamente porque el caballo de f3 lo amenaza", () => {
  const con = lit("rnbqkbnr/pppp2pp/8/4pp2/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq f6 0 3", "w");
  assert(con("f5"), "f5: el peón la captura");
  assert(con("e5"), "e5: la ve el caballo de f3");
  const sin = lit("rnbqkbnr/pppp2pp/8/4pp2/4P3/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", "w");   // sin caballo en f3
  assert(sin("f5"), "f5 sigue visible por el peón");
  assert(!sin("e5"), "e5 queda en sombra: el peón bloqueado no la ve");
});

// ---- 2.106: punto de vista fijo al rebobinar y bloqueos ----
const rc = n => [8 - Number(n[1]), "abcdefghij".indexOf(n[0])];
const jugar = (s, de, a) => {
  const m = legalMoves(s).find(x => sameSq(x.from, rc(de)) && sameSq(x.to, rc(a)));
  if(!m) throw new Error("jugada no encontrada " + de + a);
  return applyMove(s, m);
};
const partida = (fen, jugadas) => {
  const states = [parseFEN(fen + " dark")];
  for(const [de, a] of jugadas) states.push(jugar(states[states.length - 1], de, a));
  return { startFEN: fen, states, sans: jugadas.map(() => "x"), cursor: states.length - 1, result: "" };
};
const reset = () => { ctx.liveGame = null; ctx.currentMode = "play"; ctx.darkReveal = false; ctx.branch = null; ctx.vsMachine = false; ctx.machineHumanColor = "w"; };
const INI = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

console.log("\nRebobinado y bloqueos (2.106)");

prueba("el punto de vista es fijo: el mismo en todas las posiciones que se repasan", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"], ["e7","e5"], ["g1","f3"]]);   // le toca a las negras en la posición final
  const vistas = ctx.game.states.map(st => fogViewer(st, outcome(st)));
  assert.deepStrictEqual(vistas, ["b","b","b","b"], "siempre el lado al que le toca al final");
});

prueba("una partida terminada (rey capturado) sigue revelada al rebobinar a cualquier jugada", () => {
  reset(); ctx.game = partida("4k3/8/8/8/8/8/8/4RK2 w - - 0 1", [["e1","e8"]]);   // la torre captura al rey
  assert.strictEqual(outcome(ctx.game.states[1]), "checkmate");
  for(const st of ctx.game.states) assert.strictEqual(fogViewer(st, outcome(st)), null, "sin niebla en ninguna posición");
  assert.strictEqual(darkLocked(), false);
});

prueba("en curso, retroceder NO levanta la niebla", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"], ["e7","e5"]]);
  ctx.game.cursor = 0;
  const st = ctx.game.states[0];
  assert.notStrictEqual(fogViewer(st, outcome(st)), null);
  assert.strictEqual(darkLocked(), true);
});

prueba("en una partida en vivo el punto de vista es tu color, vayas a la jugada que vayas", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"], ["e7","e5"], ["g1","f3"]]);
  ctx.liveGame = { myColor: "w" };
  assert.deepStrictEqual(ctx.game.states.map(st => fogViewer(st, outcome(st))), ["w","w","w","w"]);
});

console.log("\nContra claudIA: la vista es siempre la tuya (2.140)");

prueba("contra claudIA con blancas: el punto de vista es «w» aunque le toque a ella (turno de las negras)", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"]]);   // le toca a las negras = a claudIA
  ctx.vsMachine = true; ctx.machineHumanColor = "w";
  const st = ctx.game.states[1];
  assert.strictEqual(st.turn, "b");
  assert.strictEqual(fogViewer(st, outcome(st)), "w", "su turno NO destapa su lado");
  assert.deepStrictEqual(ctx.game.states.map(x => fogViewer(x, outcome(x))), ["w","w"]);
});

prueba("contra claudIA con negras: el punto de vista es «b» en todas las posiciones", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"], ["e7","e5"], ["g1","f3"]]);
  ctx.vsMachine = true; ctx.machineHumanColor = "b";
  assert.deepStrictEqual(ctx.game.states.map(x => fogViewer(x, outcome(x))), ["b","b","b","b"]);
  // y lo que se ve a oscuras es lo de tu lado: tras e4-e5-Cf3 las negras no ven la pieza blanca en f3
  const v = fogVisible(ctx.game.states[3], "b");
  assert(!v.has(sq("f3")), "el caballo blanco en f3 sigue en sombra para las negras");
});

prueba("contra claudIA, al terminar la partida la niebla cae igual (rey capturado o resultado)", () => {
  reset(); ctx.game = partida("4k3/8/8/8/8/8/8/4RK2 w - - 0 1", [["e1","e8"]]);
  ctx.vsMachine = true; ctx.machineHumanColor = "w";
  for(const st of ctx.game.states) assert.strictEqual(fogViewer(st, outcome(st)), null);
  reset(); ctx.game = partida(INI, [["e2","e4"]]); ctx.game.result = "0-1";
  ctx.vsMachine = true; ctx.machineHumanColor = "w";
  assert.strictEqual(fogViewer(ctx.game.states[1], outcome(ctx.game.states[1])), null);
});

prueba("sin claudIA (Solitario entre dos) el punto de vista sigue siendo el del turno", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"]]);   // vsMachine = false
  assert.strictEqual(fogViewer(ctx.game.states[1], outcome(ctx.game.states[1])), "b");
});

prueba("darkLocked: se levanta con resultado, con «ver todo» y en Tablero libre", () => {
  reset(); ctx.game = partida(INI, [["e2","e4"]]);
  assert.strictEqual(darkLocked(), true);
  ctx.game.result = "1-0"; assert.strictEqual(darkLocked(), false); ctx.game.result = "";
  ctx.darkReveal = true; assert.strictEqual(darkLocked(), false); ctx.darkReveal = false;
  ctx.currentMode = "free"; assert.strictEqual(darkLocked(), false);
});

prueba("darkLocked no bloquea el ajedrez clásico", () => {
  reset(); ctx.game = { startFEN: INI, states: [parseFEN(INI)], cursor: 0, result: "" };
  assert.strictEqual(darkLocked(), false);
});

prueba("el PGN y el guardado de partidas llaman a darkLocked() (que nadie quite el candado)", () => {
  const todo = src.join("\n");
  assert(/pgn-export"\)\.onclick[\s\S]{0,600}darkLocked\(\)/.test(todo), "exportar PGN");
  assert(/async function saveCurrentGame\(name\)\{[\s\S]{0,300}darkLocked\(\)/.test(todo), "guardar en La Antología");
  assert(/askReplaceGame\(darkLocked\(\)\)/.test(todo), "aviso al reemplazar sin ofrecer guardar");
});

console.log("\n" + (total - fallos) + "/" + total + " pruebas pasan");
process.exit(fallos ? 1 : 0);
