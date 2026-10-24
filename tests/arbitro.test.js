// Pruebas del árbitro de Dark Chess (Edge Function). Se ejecutan con:  node tests/arbitro.test.js
// Usan el index.ts GENERADO (node tools/build-dark-referee.js) con una base de datos simulada.
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const tmp = path.join(os.tmpdir(), "dark-referee-test.mjs");
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, "..", "supabase/functions/dark-referee/index.ts"), "utf8"));
const W = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", G = "00000000-0000-0000-0000-0000000000aa";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark";
const sq = n => [8 - Number(n[1]), "abcdefgh".indexOf(n[0])];

function fakeDb(fen = START){
  const s = { fen, ply: 0, status: "en_curso", moves: [], obs: [], result: null, timeout: false };
  return { s,
    async getState(id){ if(id !== G) throw new Error("no"); return { fen: s.fen, ply: s.ply, status: s.status, white_id: W, black_id: B, moves: s.moves }; },
    async commit(a){
      if(s.timeout) return { timeout: true };
      if(a.expectedPly !== s.ply) throw new Error("La partida cambió: recarga.");
      s.fen = a.fen; s.ply++; s.moves.push(a.move); s.obs.push({ w: a.obsW, b: a.obsB }); s.result = a.result;
      if(a.result) s.status = "finalizada";
      return { ok: true };
    } };
}
let fallos = 0, total = 0;
const prueba = async (nombre, fn) => { total++; try { await fn(); console.log("  ok   " + nombre); } catch(e){ fallos++; console.log("  FALLA " + nombre + "\n        " + e.message); } };

(async () => {
  const { darkMove } = await import(tmp);
  const mover = (db, who, a, b, promo) => darkMove(db, who, { game_id: G, from: sq(a), to: sq(b), promo });
  console.log("Árbitro de Dark Chess");

  await prueba("1.e4 válida: se guarda y avanza el turno", async () => {
    const db = fakeDb(); const r = await mover(db, W, "e2", "e4");
    assert.equal(r.status, 200); assert.equal(db.s.ply, 1); assert.match(db.s.fen, /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /);
    assert(db.s.fen.endsWith(" dark")); assert.equal(db.s.moves[0].san, "e4");
  });
  await prueba("negras no pueden mover en turno de blancas", async () => {
    const r = await mover(fakeDb(), B, "e7", "e5"); assert.equal(r.status, 409);
  });
  await prueba("un tercero no puede mover", async () => {
    const r = await mover(fakeDb(), "33333333-3333-3333-3333-333333333333", "e2", "e4"); assert.equal(r.status, 403);
  });
  await prueba("jugada ilegal rechazada (torre a través de peón)", async () => {
    const r = await mover(fakeDb(), W, "a1", "a5"); assert.equal(r.status, 400);
  });
  await prueba("coordenadas basura rechazadas", async () => {
    const r = await darkMove(fakeDb(), W, { game_id: G, from: [9, 9], to: [1, 1] }); assert.equal(r.status, 400);
    const r2 = await darkMove(fakeDb(), W, { game_id: G, from: "e2", to: "e4" }); assert.equal(r2.status, 400);
  });
  await prueba("FUGA: al rival no le llega origen, destino, pieza ni SAN de la jugada", async () => {
    const db = fakeDb(); await mover(db, W, "e2", "e4");
    const rival = JSON.stringify(db.s.obs[0].b);
    assert(!/"mine"|"san"|"uci"|"from"/.test(rival), "la observación del rival trae datos de la jugada: " + rival);
    assert(!Object.values(db.s.obs[0].b.pieces).some(p => p[0] === "w"), "las negras no deben ver piezas blancas");
    assert(!db.s.obs[0].b.lit.includes("4,4") && !db.s.obs[0].b.lit.includes("6,4"), "e4 y e2 deben seguir en sombra para las negras");
  });
  await prueba("el que mueve sí recibe su propia notación", async () => {
    const db = fakeDb(); const r = await mover(db, W, "e2", "e4");
    assert.equal(r.body.obs.mine.san, "e4"); assert.deepEqual(r.body.obs.mine.to, sq("e4"));
  });
  await prueba("captura: ambos saben dónde y que fue captura, el capturador queda al descubierto si hay otra pieza que ilumine", async () => {
    const db = fakeDb(); await mover(db, W, "e2", "e4"); await mover(db, B, "d7", "d5"); await mover(db, W, "e4", "d5");
    const o = db.s.obs[2];
    assert.equal(o.w.capture, true); assert.equal(o.b.capture, true);
    assert.deepEqual(o.w.capSq, sq("d5")); assert.deepEqual(o.b.capSq, sq("d5"));
    assert.equal(o.b.pieces["3,3"], "wp", "la dama negra ilumina d5: ve al peón blanco que capturó");
    assert(!o.b.mine, "pero no recibe la notación de la jugada");
  });
  await prueba("captura sin cobertura: el rival sabe DÓNDE pero no ve quién capturó", async () => {
    const db = fakeDb("4k3/8/8/8/8/8/p7/R3K3 w - - 0 1 dark");   // torre blanca a1 captura peón negro a2? (a2 lo ilumina la torre; el rey negro está lejos)
    const r = await mover(db, W, "a1", "a2");
    assert.equal(r.status, 200);
    const o = db.s.obs[0];
    assert.deepEqual(o.b.capSq, sq("a2"));
    assert(!o.b.pieces["6,0"], "las negras no deben ver la torre en a2");
  });
  await prueba("captura del rey: gana quien captura", async () => {
    const db = fakeDb("4k3/8/8/8/8/8/8/4R1K1 w - - 0 1 dark");
    const r = await mover(db, W, "e1", "e8");
    assert.equal(r.body.result, "1-0"); assert.equal(db.s.status, "finalizada");
  });
  await prueba("negras capturan al rey blanco: 0-1", async () => {
    const db = fakeDb("4r1k1/8/8/8/8/8/8/4K3 b - - 0 1 dark");
    const r = await mover(db, B, "e8", "e1");
    assert.equal(r.body.result, "0-1");
  });
  await prueba("coronación exige elegir pieza", async () => {
    const db = fakeDb("k7/4P3/8/8/8/8/8/4K3 w - - 0 1 dark");
    assert.equal((await mover(db, W, "e7", "e8")).status, 400);
    assert.equal((await mover(db, W, "e7", "e8", "q")).status, 200);
  });
  await prueba("partida terminada no admite jugadas", async () => {
    const db = fakeDb(); db.s.status = "finalizada"; assert.equal((await mover(db, W, "e2", "e4")).status, 409);
  });
  await prueba("caída de bandera: se informa sin guardar jugada", async () => {
    const db = fakeDb(); db.s.timeout = true; const r = await mover(db, W, "e2", "e4");
    assert.equal(r.body.timeout, true); assert.equal(db.s.ply, 0);
  });
  await prueba("doble envío de la misma jugada: la segunda falla por turno/ply", async () => {
    const db = fakeDb(); await mover(db, W, "e2", "e4"); assert.equal((await mover(db, W, "d2", "d4")).status, 409);
  });
  console.log(`\n${total - fallos}/${total} pruebas pasan`); process.exit(fallos ? 1 : 0);
})();
