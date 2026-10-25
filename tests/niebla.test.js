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

const code = "const DKB_M = 200; var game = null, liveGame = null, currentMode = 'play', darkReveal = false, branch = null, vsMachine = false, machineHumanColor = 'w'; function L(){ return branch || game; }\n" +
  src.slice(a, z).join("\n") + "\n" + ["matchUci", "fogVisible", "fogViewer", "darkLocked", "dkbCfg", "dkbObs", "dkbHash", "dkbRng", "dkbStep", "dkbReseed", "dkbBuild", "dkbPick", "dkbVote", "dkbRisk", "dkbChoose"].map(grab).join("\n") +
  "\nthis.__api = { parseFEN, fogVisible, fogViewer, darkLocked, legalMoves, applyMove, outcome, sameSq, toFEN, uciOf, matchUci, dkbObs, dkbBuild, dkbReseed, dkbPick, dkbVote, dkbRisk, dkbChoose, dkbCfg };";
const ctx = vm.createContext({ document: {}, window: {}, console });
vm.runInContext(code, ctx);
const { parseFEN, fogVisible, fogViewer, darkLocked, legalMoves, applyMove, outcome, sameSq, toFEN, uciOf, matchUci, dkbObs, dkbBuild, dkbReseed, dkbPick, dkbVote, dkbRisk, dkbChoose, dkbCfg } = ctx.__api;

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

console.log("\nclaudIA a ciegas: hipótesis (2.142)");

// Historia a partir de jugadas UCI desde la posición inicial de Dark.
const historia = (ucis) => {
  const states = [parseFEN(INI + " dark")], hist = [];
  for(const u of ucis){ const s0 = states[states.length - 1], mv = matchUci(s0, u); if(!mv) throw new Error("jugada ilegal " + u); hist.push(u); states.push(applyMove(s0, mv)); }
  return { states, ucis: hist };
};
const fensDe = (h) => h.map(e => toFEN(e.pos) + " w=" + e.w.toFixed(6)).sort();
// partida al azar con un generador con semilla (reproducible)
const azar = (semilla) => { let x = semilla; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; };

prueba("todas las hipótesis coinciden con lo que ve claudIA, jugada a jugada, en 12 partidas al azar (y nunca se quedan sin ninguna)", () => {
  ctx.dkbBuild.vacias = 0;
  let comprobadas = 0;
  for(let g = 0; g < 12; g++){
    const rnd = azar(1000 + g), me = g % 2 ? "w" : "b", memo = {};
    const states = [parseFEN(INI + " dark")], ucis = [];
    for(let ply = 1; ply <= 45; ply++){
      const s0 = states[states.length - 1], lm = legalMoves(s0); if(!lm.length) break;
      const mv = lm[Math.floor(rnd() * lm.length)]; ucis.push(uciOf(mv)); states.push(applyMove(s0, mv));
      const h = dkbBuild(states, ucis, me, 200, memo), real = dkbObs(states[states.length - 1], me);
      assert(h.length > 0, "sin hipótesis en la partida " + g + ", jugada " + ply);
      for(const e of h){ assert.strictEqual(dkbObs(e.pos, me), real, "hipótesis incompatible con lo visto (partida " + g + ", jugada " + ply + ")"); comprobadas++; }
      const b = states[states.length - 1].board.flat(); if(!b.includes("wk") || !b.includes("bk")) break;
    }
  }
  assert(comprobadas > 1000, "pocas comprobaciones: " + comprobadas);
  assert.strictEqual(ctx.dkbBuild.vacias || 0, 0, "hubo casos sin hipótesis");
});

prueba("la memoria incremental da lo mismo que reconstruir desde el principio", () => {
  const h = historia(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "d2d3"]);
  const memo = {};
  for(let k = 1; k <= h.ucis.length; k++) dkbBuild(h.states.slice(0, k + 1), h.ucis.slice(0, k), "b", 200, memo);
  assert.deepStrictEqual(fensDe(dkbBuild(h.states, h.ucis, "b", 200, memo)), fensDe(dkbBuild(h.states, h.ucis, "b", 200)));
});

prueba("SIN TRAMPA: dos partidas con las mismas observaciones pero distinto tablero oculto dan EXACTAMENTE las mismas hipótesis", () => {
  // las blancas mueven en la oscuridad (a3/h3/c3 contra a4/h4/c4): las negras, con sus caballos en f6 y a6, no ven ninguna de esas casillas
  const A = historia(["a2a3", "g8f6", "h2h3", "b8a6", "c2c3"]);
  const B = historia(["a2a4", "g8f6", "h2h4", "b8a6", "c2c4"]);
  for(let i = 0; i < A.states.length; i++) assert.strictEqual(dkbObs(A.states[i], "b"), dkbObs(B.states[i], "b"), "las observaciones deberían ser idénticas en la jugada " + i);
  assert.notStrictEqual(toFEN(A.states[5]), toFEN(B.states[5]), "los tableros reales deberían ser distintos");
  const hA = dkbBuild(A.states, A.ucis, "b", 200), hB = dkbBuild(B.states, B.ucis, "b", 200);
  assert.deepStrictEqual(fensDe(hA), fensDe(hB));
  assert.deepStrictEqual(fensDe(dkbPick(hA, 16)), fensDe(dkbPick(hB, 16)));
  assert(hA.length > 20, "debería imaginar muchas posibilidades, no una sola (" + hA.length + ")");
});

prueba("SIN TRAMPA (reconstrucción): lo que se reparte en la sombra tampoco depende del tablero oculto", () => {
  const A = historia(["a2a3", "g8f6", "h2h3", "b8a6", "c2c3"]), B = historia(["a2a4", "g8f6", "h2h4", "b8a6", "c2c4"]);
  for(let i = 0; i < A.states.length; i++) assert.strictEqual(dkbObs(A.states[i], "b"), dkbObs(B.states[i], "b"), "las observaciones deberían ser idénticas en la jugada " + i);
  const rA = dkbReseed(A.states, A.ucis, 5, "b", 50, 12345), rB = dkbReseed(B.states, B.ucis, 5, "b", 50, 12345);
  assert(rA.length > 0, "debería reconstruir algo");
  assert.deepStrictEqual(fensDe(rA), fensDe(rB));
  for(const e of rA) assert.strictEqual(dkbObs(e.pos, "b"), dkbObs(A.states[5], "b"));
});

prueba("de lo oculto no queda nada fijo: tras 1.a3 hay hipótesis donde las blancas jugaron otra cosa", () => {
  const A = historia(["a2a3", "d7d6"]);
  const h = dkbBuild(A.states, A.ucis, "b", 200);
  const real = toFEN(A.states[2]).split(" ")[0];
  assert(h.some(e => toFEN(e.pos).split(" ")[0] !== real), "todas las hipótesis coinciden con el tablero real: hay trampa");
  assert(h.some(e => toFEN(e.pos).split(" ")[0] === real), "la hipótesis verdadera debería seguir entre las posibles");
});

prueba("lo que se ve filtra: una pieza blanca que aparece a la vista elimina las hipótesis donde no podía estar", () => {
  // 1.e4 e5 2.Qh5: la dama llega a h5 (casilla iluminada para las negras: su peón g6/g7... la ven)
  const A = historia(["e2e4", "e7e5", "d1h5"]);
  const h = dkbBuild(A.states, A.ucis, "b", 200);
  assert(h.length > 0);
  for(const e of h){ const [r, c] = [3, 7]; assert.strictEqual(e.pos.board[r][c], "wq", "toda hipótesis debe tener la dama blanca en h5 (la ven)"); }
});

prueba("dkbVote: elige la jugada más votada que sea legal en el tablero real y descarta el resto", () => {
  const A = historia(["e2e4"]);   // turno de las negras
  const pos = A.states[1];
  assert.strictEqual(dkbVote([{ uci: "e7e5", w: 0.3 }, { uci: "d7d5", w: 0.7 }], pos), "d7d5");
  assert.strictEqual(dkbVote([{ uci: "e7e5", w: 0.3 }, { uci: "a1a8", w: 0.7 }], pos), "e7e5", "una jugada ilegal en el tablero real no puede ganar");
  assert.strictEqual(dkbVote([{ uci: "(none)", w: 1 }], pos), null);
});

prueba("el nivel manda: más hipótesis y más tiempo del motor al subir", () => {
  assert(dkbCfg(15).n > dkbCfg(10).n && dkbCfg(10).n > dkbCfg(5).n && dkbCfg(5).n > dkbCfg(0).n);
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

console.log("\nclaudIA prudente con su rey (2.143)");
const H = (fen, w = 1) => ({ pos: parseFEN(fen + " dark"), w });
const ELIGE = (fen, hyps, votes) => dkbChoose(votes, hyps, parseFEN(fen + " dark"));

prueba("si el rey rival está a la vista, se lo come aunque el motor votara otra cosa", () => {
  const fen = "4k3/8/8/8/8/8/8/4R1K1 w - - 0 1";
  assert.strictEqual(ELIGE(fen, [H(fen)], [{ uci: "g1f1", w: 1 }]), "e1e8");
});

prueba("no deja el rey a tiro cuando existe una jugada segura, aunque el motor la desconozca", () => {
  const fen = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1";   // torre negra en a1 ataca la fila 1
  for(const mala of ["e1d1", "e1f1"]){
    const u = ELIGE(fen, [H(fen)], [{ uci: mala, w: 1 }]);
    assert(["e1d2", "e1e2", "e1f2"].includes(u), mala + " -> " + u);
  }
});

prueba("sin votos del motor sigue eligiendo una jugada segura", () => {
  const fen = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1";
  for(let i = 0; i < 10; i++) assert(["e1d2", "e1e2", "e1f2"].includes(ELIGE(fen, [H(fen)], [])));
});

prueba("respeta la jugada del motor cuando es segura", () => {
  const fen = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1";
  assert.strictEqual(ELIGE(fen, [H(fen)], [{ uci: "e1e2", w: 1 }]), "e1e2");
});

prueba("el riesgo sale de las HIPÓTESIS, no del tablero real (nada oculto se cuela)", () => {
  const real = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";            // en el tablero real no hay ninguna torre
  const imag = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1";           // pero ella imagina una en a1
  const u = ELIGE(real, [H(imag)], [{ uci: "e1d1", w: 1 }]);
  assert(!["e1d1", "e1f1"].includes(u), "evitó " + u);
  // y si ninguna hipótesis tiene la torre, no se inventa peligro: juega lo votado
  assert.strictEqual(ELIGE(real, [H(real)], [{ uci: "e1d1", w: 1 }]), "e1d1");
});

prueba("el riesgo se pondera: una hipótesis rara (2%) no frena la jugada votada, una probable sí", () => {
  const real = "4k3/8/8/8/8/8/8/4K3 w - - 0 1", torre = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1";
  assert.strictEqual(ELIGE(real, [H(real, 0.98), H(torre, 0.02)], [{ uci: "e1d1", w: 1 }]), "e1d1");
  assert(!["e1d1", "e1f1"].includes(ELIGE(real, [H(real, 0.5), H(torre, 0.5)], [{ uci: "e1d1", w: 1 }])));
});

prueba("dkbRisk: 0 si nadie puede capturar el rey, 1 si en todas las hipótesis puede", () => {
  const torre = "4k3/8/8/8/8/8/8/r3K3 w - - 0 1", p = parseFEN(torre + " dark");
  const mv = n => legalMoves(p).find(m => uciOf(m) === n);
  assert.strictEqual(dkbRisk(mv("e1d1"), [H(torre)]), 1);
  assert.strictEqual(dkbRisk(mv("e1e2"), [H(torre)]), 0);
});

console.log("\n" + (total - fallos) + "/" + total + " pruebas pasan");
process.exit(fallos ? 1 : 0);
