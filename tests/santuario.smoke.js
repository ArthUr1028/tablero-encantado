// El Santuario (2.150): todas las partidas se reproducen con el motor del Tablero, los datos están completos y los textos nuevos tienen versión en inglés. node tests/santuario.smoke.js
// La partida en línea se simula con un objeto mínimo (el dibujo de marcas solo mira liveGame.id).
// Uso: node tests/marcas.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const t = f.endsWith(".js") ? "application/javascript" : f.endsWith(".wasm") ? "application/wasm" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  res.writeHead(200, { "Content-Type": t }); fs.createReadStream(f).pipe(res);
});

let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); }
    const res = { masters: HOF.masters.length, malas: [], ids: new Set(), dup: [], faltan: [], eras: new Set(HOF.eras.map(e => e.id)), erasMal: [], enSin: [] };
    libNote = () => {};
    const campos = ["id", "era", "name", "years", "wiki", "title", "bio", "style", "legacy"];
    for (const m of HOF.masters) {
      if (!res.eras.has(m.era)) res.erasMal.push(m.id);
      if (!m.tema) for (const c of campos) if (!m[c]) res.faltan.push(m.id + "." + c);
      for (const g of m.games) {
        if (res.ids.has(g.id)) res.dup.push(g.id); res.ids.add(g.id);
        for (const c of ["id", "title", "event", "year", "white", "black", "result", "moves", "why", "pgn"]) if (!g[c]) res.faltan.push(g.id + "." + c);
        importPGN(g.pgn);
        const plies = game.sans.length, esperadas = g.pgn.replace(/\[[^\]]*\]/g, " ").replace(/\d+\.(\.\.)?/g, " ").split(/\s+/).filter(t => SAN_RE.test(t)).length;
        if (plies !== esperadas || Math.ceil(plies / 2) !== g.moves || game.result !== g.result) res.malas.push(g.id + " (" + plies + "/" + esperadas + ", " + g.moves + ")");
      }
    }
    return res;
  });
  ok(r.masters === 97, "el Santuario tiene 97 fichas, 96 maestros y capítulos (" + r.masters + ")");
  ok(!r.malas.length, "todas las partidas se reproducen completas con el motor del Tablero" + (r.malas.length ? ": " + r.malas.slice(0, 5).join(", ") : ""));
  ok(!r.dup.length, "ningún id de partida repetido" + (r.dup.length ? ": " + r.dup.join(",") : ""));
  ok(!r.faltan.length, "todas las fichas y partidas tienen sus campos" + (r.faltan.length ? ": " + r.faltan.slice(0, 5).join(",") : ""));
  ok(!r.erasMal.length, "todas las eras existen");
  // inglés
  const sin = await page.evaluate(() => {
    setLang("en");
    const nuevos = ["kotov","benko","seirawan","shirov","gelfand","svidler","kosteniuk","vachier-lagrave","so","firouzja","praggnanandhaa"];
    const ids = HOF.masters.filter(m => nuevos.includes(m.id));
    const sin = [];
    const t = s => window.tx(s) !== s;
    for (const m of ids) { for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) sin.push(m.id + "." + c); for (const g of m.games) { if (!t(g.why)) sin.push(g.id + ".why"); if (!t(g.event)) sin.push(g.id + ".event"); } }
    for (const id of ["reshevsky","euwe","fine","smyslov","petrosian","karpov","korchnoi","larsen"]) { const m = HOF.masters.find(x => x.id === id); for (const g of m.games.slice(-4)) if (!t(g.why)) sin.push(g.id + ".why"); }
    return sin;
  });
  ok(!sin.length, "los textos nuevos del Santuario tienen versión en inglés" + (sin.length ? ": " + sin.slice(0, 6).join(", ") : ""));
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
