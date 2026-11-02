// Dark asíncrono (2.194): turno por paridad y detección de plazo vencido, sin depender del FEN público de `games`.
const fs = require("fs"), path = require("path"), assert = require("assert");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const grab = name => { const i = html.indexOf("function " + name + "("); assert(i >= 0, "no está " + name); let d = 0, j = html.indexOf("{", i); for (let k = j; k < html.length; k++) { if (html[k] === "{") d++; else if (html[k] === "}" && --d === 0) return html.slice(i, k + 1); } };
const { rowTurnPlayerId, asyncForfeitedRow } = new Function(grab("rowTurnPlayerId") + grab("asyncForfeitedRow") + "return {rowTurnPlayerId, asyncForfeitedRow};")();
const INI = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark";
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
// En Dark el FEN público se queda con turno de blancas: manda la paridad de ply_count.
ok(rowTurnPlayerId({ variant: "dark", current_fen: INI, ply_count: 0, white_id: "W", black_id: "B" }) === "W", "ply 0 → blancas");
ok(rowTurnPlayerId({ variant: "dark", current_fen: INI, ply_count: 1, white_id: "W", black_id: "B" }) === "B", "ply 1 → negras (aunque el FEN diga w)");
ok(rowTurnPlayerId({ variant: "dark", current_fen: INI, ply_count: 7, white_id: "W", black_id: "B" }) === "B", "ply 7 → negras");
// Las demás variantes siguen leyendo el FEN.
ok(rowTurnPlayerId({ variant: "clasico", current_fen: "8/8/8/8/8/8/8/8 b - - 0 1", ply_count: 0, white_id: "W", black_id: "B" }) === "B", "clásico usa el FEN");
// Plazo vencido vs. jugada ganadora: la jugada reinicia turn_started_at y updated_at a la vez.
const t0 = "2026-11-01T10:00:00Z", dia = 86400000;
ok(!asyncForfeitedRow({ async_days: 2, turn_started_at: t0, updated_at: new Date(Date.parse(t0) + 200).toISOString() }), "captura del rey ≠ plazo");
ok(asyncForfeitedRow({ async_days: 2, turn_started_at: t0, updated_at: new Date(Date.parse(t0) + 2 * dia + 5000).toISOString() }), "reclamo tras 2 días = plazo");
ok(!asyncForfeitedRow({ async_days: null, turn_started_at: t0, updated_at: t0 }), "sin async_days no aplica");
console.log(n + "/" + n + " pruebas pasan");
