// Comprueba que version.json (lo que consulta el vigilante de actualizaciones) coincide con el BUILD_ID de index.html.
// Si se olvida actualizar version.json, los jugadores no recibirían el aviso/actualización automática.
const fs = require("fs"), path = require("path"), assert = require("assert");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const m = html.match(/const BUILD_ID = "([^"]+)"/);
assert(m, "no se encontró BUILD_ID en index.html");
const build = m[1].split(" · ")[0].trim();
const v = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
assert.strictEqual(v.build, build, "version.json (" + v.build + ") no coincide con BUILD_ID (" + build + ")");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
assert(/version\.json/.test(sw), "sw.js debe dejar pasar version.json directo a la red");
console.log("version OK:", build);
