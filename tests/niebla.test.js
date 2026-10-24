// Pruebas de la niebla de Dark Chess (2.105). Se ejecutan con:  node tests/niebla.test.js
// Extraen del index.html las funciones reales (sin copiarlas), así lo que se prueba es lo que corre en el Tablero.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if (i < 0) throw new Error("No encontré " + re); return i; };

// Región del motor: desde las constantes hasta justo antes de applyMove (incluye parseFEN y pseudoMoves)
const a = find(/^const FILES = /), z = find(/^function applyMove\(/);
// fogVisible completa
const f0 = find(/^function fogVisible\(/);
let f1 = f0; while(!/^}/.test(src[f1])) f1++;

const code = src.slice(a, z).join("\n") + "\n" + src.slice(f0, f1 + 1).join("\n") + "\nthis.__api = { parseFEN, fogVisible };";
const ctx = vm.createContext({ document: {}, window: {}, console });
vm.runInContext(code, ctx);
const { parseFEN, fogVisible } = ctx.__api;

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

console.log("\n" + (total - fallos) + "/" + total + " pruebas pasan");
process.exit(fallos ? 1 : 0);
