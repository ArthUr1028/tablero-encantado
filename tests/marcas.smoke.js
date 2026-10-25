// Prueba de humo: las marcas sobre el tablero se dibujan en la casilla correcta en Capablanca (10 columnas) y en 8x8 (2.148). node tests/marcas.smoke.js
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
  const errores = [];
  for (const v of [{ nombre: "capablanca", cols: 10 }, { nombre: "clasico", cols: 8 }]) {
    const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
    page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(({ nombre, cols }) => {
      for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); }
      document.getElementById("mode-play").click();
      switchVariant(nombre);
      accountProfile = { id: "u1", username: "prueba" };
      liveGame = { id: "g1", variant: nombre };
      mk.id = "g1";
      const ult = cols - 1;
      mk.marks = [{ t: "h", s: mkSq(3, ult), c: "r" }, { t: "a", f: mkSq(0, ult), to: mkSq(7, 0), c: "g" }, { t: "o", s: mkSq(1, 0), c: "b" }];
      mkDraw();
      const svg = boardEl.querySelector(":scope > .mk-svg");
      const rect = svg && svg.querySelector("rect"), circ = svg && svg.querySelector("circle");
      return { hay: !!svg, vb: svg && svg.getAttribute("viewBox"), rx: rect && +rect.getAttribute("x"), ry: rect && +rect.getAttribute("y"), cx: circ && +circ.getAttribute("cx"), cy: circ && +circ.getAttribute("cy"), cols: boardEl.querySelectorAll(".cell, .sq, [data-r]").length };
    }, v);
    ok(r.hay, v.nombre + ": las marcas se dibujan");
    ok(r.rx === v.cols - 1 && r.ry === 3, v.nombre + ": la casilla resaltada cae en la última columna, fila 4 (x=" + r.rx + ", y=" + r.ry + ", esperado " + (v.cols - 1) + ",3)");
    ok(r.cx === .5 && r.cy === 1.5, v.nombre + ": el círculo cae en la primera columna, fila 2 (" + r.cx + "," + r.cy + ")");
    await page.close();
  }
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
