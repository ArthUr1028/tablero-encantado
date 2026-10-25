// Pruebas del cuaderno y las marcas sobre el tablero en todas las modalidades (2.148). node tests/marcas.test.js
// Extraen del index.html las funciones reales (sin copiarlas).
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if (i < 0) throw new Error("No encontré " + re); return i; };
const uno = re => src[find(re)];                                  // función de una sola línea
const bloque = name => { const f0 = find(new RegExp("^function " + name + "\\(")); let f1 = f0; while (!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const code = [uno(/^const NB_VARIANTS = /), uno(/^const MK_COL = /), uno(/^const MK_MAX = /), uno(/^function nbOn\(/), uno(/^function mkSq\(/), uno(/^function mkDims\(/), bloque("mkPos"), bloque("mkClean")].join("\n") +
  "\nthis.__api = { nbOn, mkSq, mkDims, mkPos, mkClean, NB_VARIANTS, setBoard: (r, c) => { board = Array.from({ length: r }, () => Array(c).fill('')); }, set: (lg, ap, fl) => { liveGame = lg; accountProfile = ap; flipped = fl; } };";
const ctx = vm.createContext({});
vm.runInContext("var board = [[]], liveGame = null, accountProfile = null, flipped = false; function liveState(){ return { board }; }\n" + code, ctx);
const A = ctx.__api;

let fallos = 0, total = 0;
const prueba = (n, fn) => { total++; try { fn(); console.log("  ok   " + n); } catch (e) { fallos++; console.log("  FALLA " + n + "\n        " + e.message); } };
console.log("Cuaderno y marcas en todas las modalidades (2.148)");

prueba("el cuaderno se abre en las siete modalidades, solo con partida en línea y cuenta", () => {
  for (const v of ["clasico", "capablanca", "maharaja", "amazonas", "shatranj", "seirawan", "dark"]) {
    A.set({ id: "g1", variant: v }, { id: "u1" }, false); assert.strictEqual(A.nbOn(), true, v);
  }
  A.set(null, { id: "u1" }, false); assert.strictEqual(A.nbOn(), false, "sin partida en línea");
  A.set({ id: "g1", variant: "dark" }, null, false); assert.strictEqual(A.nbOn(), false, "sin cuenta");
  A.set({ id: null, variant: "clasico" }, { id: "u1" }, false); assert.strictEqual(A.nbOn(), false, "partida sin identificador");
});

prueba("8x8: la casilla se codifica fila*8+columna (las marcas ya guardadas de Dark siguen valiendo)", () => {
  A.setBoard(8, 8);
  assert.strictEqual(A.mkSq(0, 0), 0); assert.strictEqual(A.mkSq(1, 0), 8); assert.strictEqual(A.mkSq(7, 7), 63);
});

prueba("Capablanca 10x8: las 80 casillas tienen un código distinto y sin choques", () => {
  A.setBoard(8, 10);
  const vistos = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 10; c++) vistos.add(A.mkSq(r, c));
  assert.strictEqual(vistos.size, 80);
  assert.strictEqual(A.mkSq(0, 9), 9); assert.strictEqual(A.mkSq(1, 0), 10);   // con la codificación vieja (fila*8+col) la casilla j1 caía sobre la a2
});

prueba("ida y vuelta: casilla -> código -> posición en pantalla, con y sin giro, en 8 y 10 columnas", () => {
  for (const cols of [8, 10]) {
    A.setBoard(8, cols);
    for (let r = 0; r < 8; r++) for (let c = 0; c < cols; c++) {
      A.set(null, null, false); let p = A.mkPos(A.mkSq(r, c), A.mkDims());
      assert.deepStrictEqual([p.x, p.y], [c + .5, r + .5], "sin giro " + r + "," + c);
      A.set(null, null, true); p = A.mkPos(A.mkSq(r, c), A.mkDims());
      assert.deepStrictEqual([p.x, p.y], [cols - 1 - c + .5, 8 - 1 - r + .5], "con giro " + r + "," + c);
    }
  }
});

prueba("mkClean acepta hasta la última casilla de cada tablero y rechaza la siguiente", () => {
  A.setBoard(8, 8);
  assert.strictEqual(A.mkClean([{ t: "h", s: 63, c: "g" }, { t: "h", s: 64, c: "g" }]).length, 1);
  A.setBoard(8, 10);
  assert.strictEqual(A.mkClean([{ t: "h", s: 79, c: "g" }, { t: "h", s: 80, c: "g" }, { t: "a", f: 9, to: 79, c: "r" }]).length, 2);
  assert.strictEqual(A.mkClean([{ t: "h", s: -1, c: "g" }, { t: "x", s: 5, c: "g", x: "  " }, { t: "o", s: 3, c: "zz" }]).length, 0);
});

console.log("\n" + (total - fallos) + "/" + total + " pruebas pasan");
process.exit(fallos ? 1 : 0);
