// Genera supabase/functions/dark-referee/index.ts = reglas del index.html + handler.js (un solo archivo para pegar en el panel).
// Uso:  node tools/build-dark-referee.js   — correrlo siempre antes de publicar la función.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "index.html"), "utf8").split("\n");
const find = re => { const i = src.findIndex(l => re.test(l)); if (i < 0) throw new Error("No encontré " + re); return i; };
const a = find(/^const FILES = /), z = find(/Sonidos \(V218\)/);
const grab = name => { const f0 = find(new RegExp("^function " + name + "\\(")); let f1 = f0; while(!/^}/.test(src[f1])) f1++; return src.slice(f0, f1 + 1).join("\n"); };
const handler = fs.readFileSync(path.join(root, "supabase/functions/dark-referee/handler.js"), "utf8");
const out = [
  "// @ts-nocheck",
  "// ARCHIVO GENERADO por tools/build-dark-referee.js (reglas de index.html + handler.js) — NO editar a mano.",
  "const document = {}, window = {};",
  "// ===== reglas del Tablero (copia exacta de index.html) =====",
  src.slice(a, z).join("\n"),
  grab("fogVisible"),
  "// ===== árbitro =====",
  handler,
  "export { darkMove };",
  ""
].join("\n");
fs.writeFileSync(path.join(root, "supabase/functions/dark-referee/index.ts"), out);
console.log("index.ts generado:", out.length, "bytes");
