// Prueba de humo: las cuaderno local (2.149): nace con la primera nota, se limpia y viaja con la Antología. node tests/cuaderno_local.smoke.js
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
  const ctxB = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await ctxB.newPage();
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1000);
  const ev = f => page.evaluate(f);
  await ev(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } document.getElementById("mode-play").click(); });
  const escribe = (sel, v) => page.evaluate(([sel, v]) => { const t = document.querySelector(sel); t.disabled = false; t.value = v; t.dispatchEvent(new Event("input", { bubbles: true })); }, [sel, v]);
  const slot = () => ev(() => JSON.parse(localStorage.getItem("tablero-encantado.cuaderno.v1") || "null"));

  // 1) partida local nueva: la caja del cuaderno aparece, sin rastro hasta escribir
  await ev(() => { newGame(START); nbSync(true); });
  await page.waitForTimeout(100);
  ok(await ev(() => !document.getElementById("nb-box").hidden), "la caja del cuaderno aparece en una partida local");
  ok((await slot()) === null, "sin notas no queda rastro");

  // 2) jugar y anotar
  await ev(() => { for (const u of ["e2e4", "e7e5"]) { const pos = game.states[game.states.length - 1], mv = matchUci(pos, u), r = moveWithSAN(pos, mv); game.states.push(r.n); game.sans.push(r.san); game.ucis.push(u); game.moves.push(mv); } game.cursor = 2; persist(); render(); });
  await escribe("#nb-general", "Plan: atacar f7"); await escribe("#nb-ply", "Buena respuesta");
  await page.waitForTimeout(1200);
  let sl = await slot();
  ok(sl && sl.notes[0] === "Plan: atacar f7" && sl.notes[2] === "Buena respuesta", "las notas quedan en este dispositivo");
  ok(await ev(() => !!game.nbId && game.nbId === JSON.parse(localStorage.getItem("tablero-encantado.cuaderno.v1")).id), "la partida lleva el id de su cuaderno");
  await ev(() => mk.marks.push({ t: "h", s: 4, c: "r" }) && mkQueue());
  await page.waitForTimeout(900);
  ok((await slot()).marks.length === 1, "las marcas también");

  // 3) guardar en La Antología (local) -> el cuaderno viaja con ella
  await ev(() => saveCurrentGame("Con cuaderno"));
  const lib = await ev(() => JSON.parse(localStorage.getItem("tablero-encantado.games.v1")));
  ok(lib[0].nb && lib[0].nb.notes[0] === "Plan: atacar f7" && lib[0].nb.marks.length === 1, "el registro de La Antología lleva las notas y marcas");
  ok(await ev(() => game.nbLib === JSON.parse(localStorage.getItem("tablero-encantado.games.v1"))[0].id), "la partida queda atada a su registro");
  await escribe("#nb-general", "Plan: atacar f7 (revisado)"); await page.waitForTimeout(2600);
  ok((await ev(() => JSON.parse(localStorage.getItem("tablero-encantado.games.v1"))[0].nb.notes[0])) === "Plan: atacar f7 (revisado)", "lo que anotas después se guarda también en La Antología");

  // 4) otra partida: el cuaderno del tablero se tira, el de La Antología se conserva
  await ev(() => { newGame(START); nbSync(true); });
  await page.waitForTimeout(200);
  ok((await slot()) === null, "al dejar la partida, el cuaderno del tablero se limpia");
  ok(await ev(() => document.getElementById("nb-general").value === ""), "la partida nueva empieza con el cuaderno vacío");
  // 5) cargar la guardada: vuelven notas y marcas
  await ev(() => { window.confirm = () => true; return loadSavedGame(JSON.parse(localStorage.getItem("tablero-encantado.games.v1"))[0].id); });
  await page.waitForTimeout(500);
  ok(await ev(() => document.getElementById("nb-general").value === "Plan: atacar f7 (revisado)"), "al cargarla de La Antología vuelve la nota general");
  ok(await ev(() => mk.marks.length === 1), "y las marcas");

  // 6) borrar el registro: la partida deja de estar guardada
  await ev(() => { saveLocalGames([]); cachedGamesList = []; game.nbLib = null; persist(); });

  // 7) partida terminada sin guardar: al reabrir, el cuaderno se limpia
  await ev(() => { newGame(START); nbSync(true); });
  await escribe("#nb-general", "se perderá"); await page.waitForTimeout(1200);
  await ev(() => { game.result = "1-0"; persist(); });
  ok(!!(await slot()), "terminada pero aún en el tablero: se puede repasar");
  await page.reload({ waitUntil: "load" }); await page.waitForTimeout(1000);
  await ev(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } });
  ok((await slot()) === null, "terminada y reabierta sin guardar: el cuaderno se limpia");

  // 8) el Reto de claudIA no tiene cuaderno
  ok(await ev(() => { retoActive = { color: "w", variant: "clasico" }; nbSync(true); const h = document.getElementById("nb-box").hidden; retoActive = null; return h; }), "en el Reto de claudIA no hay cuaderno");

  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
