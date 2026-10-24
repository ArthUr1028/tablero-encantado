// Genera supabase/functions/dark-referee/rules.js a partir del index.html (única fuente de las reglas).
// Uso:  node tools/build-dark-rules.js        (y siempre antes de publicar la Edge Function)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if (i < 0) throw new Error("No encontré " + re); return i; };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\(")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const out = [
  "// ARCHIVO GENERADO por tools/build-dark-rules.js desde index.html — NO editar a mano.",
  "const document = {}, window = {};",
  src.slice(a, z).join("\n"),
  grab("fogVisible"),
  "export { parseFEN, toFEN, legalMoves, applyMove, outcome, fogVisible, pseudoMoves, sameSq, DARK_START };",
  ""
].join("\n");
fs.writeFileSync(path.join(root, "supabase/functions/dark-referee/rules.js"), out);
console.log("rules.js generado:", out.length, "bytes");
