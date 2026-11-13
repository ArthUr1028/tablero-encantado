// 2.272 · Los Caballos: reto de Guarini (3×3) y recorrido del caballo (8×8) en Las Sesenta y Cuatro.
// Uso: node tests/caballos.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
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
const LIBRES = `window.__libres = () => { const q = document.querySelector("#kn-board .kn-sq.cur"); if (!q) return []; const c = +q.dataset.i, x = c % 8, y = (c / 8) | 0, r = [];
    for (const [dx, dy] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) { const a = x + dx, b = y + dy; if (a < 0 || a > 7 || b < 0 || b > 7) continue; const e = document.querySelector('#kn-board .kn-sq[data-i="' + (b * 8 + a) + '"]'); if (e && !e.classList.contains("vis") && !e.classList.contains("cur")) r.push(e); } return r; };`;
let fallos = 0;
const ok = (c, msg) => { console.log((c ? "  ok   " : "  FALLA ") + msg); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(LIBRES); await page.addInitScript(() => { window.__knRapido = true; });   // sin vuelos ni esperas: el final y el paso al siguiente son inmediatos
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); localStorage.removeItem("tablero.knBest"); } });

  // abrir la ventana y el menú
  const m0 = await page.evaluate(() => { document.getElementById("kn-open").click(); const ov = document.getElementById("kn-ov"); return { vis: !ov.hidden, cards: document.querySelectorAll(".kn-card").length }; });
  ok(m0.vis && m0.cards === 3, "el botón abre Los Caballos con tres retos");

  // ----- Guarini: búsqueda del camino mínimo (en saltos y en jugadas) y se juega con clics reales
  const g = await page.evaluate(async () => {
    const N = (i) => { const x = i % 3, y = (i / 3) | 0, o = []; for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 3 && b >= 0 && b < 3) o.push(b * 3 + a); } return o; };
    const ini = "b.b......".replace(/\./g, "-"), fin0 = "-w-------";
    const start = ["b", "-", "b", "-", "-", "-", "w", "-", "w"].join(""), goal = ["w", "-", "w", "-", "-", "-", "b", "-", "b"].join("");
    // 0-1 BFS sobre (estado, último caballo): coste 1 por jugada nueva, 0 si sigue el mismo caballo
    const key = (st, last) => st + "|" + last;
    const dist = new Map([[key(start, -1), 0]]), prev = new Map(), dq = [[start, -1]];
    while (dq.length) {
      const [st, last] = dq.shift(), d = dist.get(key(st, last));
      for (let i = 0; i < 9; i++) if (st[i] !== "-") for (const j of N(i)) if (st[j] === "-") {
        const a = st.split(""); a[j] = a[i]; a[i] = "-"; const ns = a.join(""), c = (last === i ? 0 : 1), k = key(ns, j), nd = d + c;
        if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); prev.set(k, [key(st, last), i, j]); if (c) dq.push([ns, j]); else dq.unshift([ns, j]); }
      }
    }
    let best = null; for (const [k, v] of dist) if (k.startsWith(goal + "|") && (best === null || v < best.v)) best = { k, v };
    const camino = []; let k = best.k; while (prev.has(k)) { const [pk, i, j] = prev.get(k); camino.unshift([i, j]); k = pk; }
    document.querySelector('.kn-card[data-reto="guarini"]').click();
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    for (const [i, j] of camino) { sq(i).click(); sq(j).click(); }
    return { jugadasMin: best.v, saltos: camino.length, msg: document.getElementById("kn-msg").textContent, rec: JSON.parse(localStorage.getItem("tablero.knBest") || "{}") };
  });
  ok(g.jugadasMin === 7, "el camino de 7 jugadas existe (Dudeney): " + g.jugadasMin);
  ok(/Lo lograste/.test(g.msg) && /récord/.test(g.msg), "ganar a Guarini dice «Lo lograste» y anota récord: " + g.msg);
  ok(g.rec.guarini && g.rec.guarini.jugadas === 7, "el récord de jugadas queda en 7 (" + JSON.stringify(g.rec.guarini) + ")");

  // con el hilo a la vista no cuenta para el récord, y deshacer funciona
  const h = await page.evaluate(() => {
    document.getElementById("kn-reset").click();
    document.getElementById("kn-hint").click();
    const lineas = document.querySelectorAll("#kn-board .kn-hilo line").length;
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    sq(0).click(); sq(7).click();   // b arriba-izq → fila 2 col 1: salto de caballo válido
    const tras1 = document.getElementById("kn-n1").textContent;
    document.getElementById("kn-undo").click();
    const tras2 = document.getElementById("kn-n1").textContent;
    return { lineas, tras1, tras2, centro: !!document.querySelector('#kn-board .kn-sq[data-i="4"] .kn-pc') };
  });
  ok(h.lineas === 8 && h.tras1 === "1" && h.tras2 === "0" && !h.centro, "el hilo dibuja 8 líneas, el salto cuenta y deshacer lo revierte");

  // ----- Recorrido: se resuelve con retroceso + regla de Warnsdorff y se juega con clics
  const t = await page.evaluate(() => {
    document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click();
    const N = i => { const x = i % 8, y = (i / 8) | 0, o = []; for (const [dx, dy] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const a = x + dx, b = y + dy; if (a >= 0 && a < 8 && b >= 0 && b < 8) o.push(b * 8 + a); } return o; };
    const vis = Array(64).fill(false), path = [];
    const dfs = i => { vis[i] = true; path.push(i); if (path.length === 64) return true;
      const c = N(i).filter(j => !vis[j]).sort((a, b) => N(a).filter(z => !vis[z]).length - N(b).filter(z => !vis[z]).length);
      for (const j of c) if (dfs(j)) return true; vis[i] = false; path.pop(); return false; };
    dfs(0);
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    const unoAntes = document.getElementById("kn-msg").textContent;
    for (const i of path) sq(i).click();
    return { unoAntes, n: path.length, msg: document.getElementById("kn-msg").textContent, hud: document.getElementById("kn-n1").textContent, rec: JSON.parse(localStorage.getItem("tablero.knBest") || "{}") };
  });
  ok(/Toca una casilla/.test(t.unoAntes), "el recorrido pide colocar el caballo primero");
  ok(t.n === 64 && t.hud === "64 / 64" && /64 casillas/.test(t.msg), "las 64 casillas: " + t.msg);
  ok(t.rec.tour && t.rec.tour.max === 64 && t.rec.tour.done === true, "el récord del recorrido queda completo (" + JSON.stringify(t.rec.tour) + ")");

  // callejón sin salida: marca el fin, deja deshacer y la sugerencia no cuenta para el récord
  const c = await page.evaluate(() => {
    document.getElementById("kn-reset").click();
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    // a1 (índice 56) y saltos sin cuidado hasta quedarse sin salidas
    let guard = 0; sq(56).click();
    while (guard++ < 70) { const go = window.__libres()[0]; if (!go) break; go.click(); }
    const fin = document.getElementById("kn-msg").textContent, n = document.getElementById("kn-n1").textContent;
    const undoOn = !document.getElementById("kn-undo").disabled;
    document.getElementById("kn-undo").click();
    const trasUndo = document.getElementById("kn-n1").textContent, msgUndo = document.getElementById("kn-msg").textContent;
    document.getElementById("kn-hint").click();
    const tip = !!document.querySelector("#kn-board .kn-sq.tip");
    return { fin, n, undoOn, trasUndo, msgUndo, tip };
  });
  ok(/Sin salidas|64 casillas/.test(c.fin), "el recorrido termina al quedarse sin salidas o al completarlo: " + c.fin + " (" + c.n + ")");
  ok(c.undoOn && parseInt(c.trasUndo) === parseInt(c.n) - 1, "tras un callejón se puede deshacer un salto (" + c.n + " → " + c.trasUndo + ")");
  ok(c.tip, "la sugerencia de Warnsdorff marca una casilla");

  // ----- arrastrar y soltar con ratón real
  const centro = async i => page.evaluate(i => { const r = document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, i);
  const arrastra = async (de, a, soltar = true) => {
    const p0 = await centro(de), p1 = await centro(a);
    await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    await page.mouse.move((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, { steps: 4 }); await page.mouse.move(p1.x, p1.y, { steps: 4 });
    const flotante = await page.evaluate(() => !!document.querySelector(".kn-float"));
    if (soltar) await page.mouse.up();
    return flotante;
  };
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="guarini"]').click(); });
  const g0 = await page.evaluate(() => document.getElementById("kn-n1").textContent);
  const fl = await arrastra(0, 5);               // 0 → 5 es un salto de caballo en 3×3
  const g1 = await page.evaluate(() => ({ n: document.getElementById("kn-n1").textContent, flot: !!document.querySelector(".kn-float"), pieza5: !!document.querySelector('#kn-board .kn-sq[data-i="5"] .kn-pc') }));
  ok(fl && g1.n === "1" && g1.pieza5 && !g1.flot, "Guarini: arrastrar un caballo a una casilla libre de salto lo mueve (" + g0 + " → " + g1.n + ")");
  await arrastra(5, 4);                          // 5→4 no es salto de caballo: no debe mover
  const g2 = await page.evaluate(() => ({ n: document.getElementById("kn-n1").textContent, pieza5: !!document.querySelector('#kn-board .kn-sq[data-i="5"] .kn-pc'), flot: !!document.querySelector(".kn-float") }));
  ok(g2.n === "1" && g2.pieza5 && !g2.flot, "Guarini: soltar en una casilla ilegal no mueve nada");
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click(); });
  const t0 = await centro(0); await page.mouse.click(t0.x, t0.y);
  const dest = await page.evaluate(() => +window.__libres()[0].dataset.i);
  await arrastra(0, dest);
  const t1 = await page.evaluate(d => ({ n: document.getElementById("kn-n1").textContent, cur: !!document.querySelector('#kn-board .kn-sq.cur[data-i="' + d + '"]') }), dest);
  ok(t1.n.startsWith("2") && t1.cur, "Recorrido: arrastrar el caballo a un salto legal lo mueve (" + t1.n + ")");

  // ----- tamaño, 3D y sonido
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click(); window.__sfx = []; const o = SFX.move; SFX.move = (m, oc) => { window.__sfx.push(m && m.piece); return o && 0; }; });
  for (const [w, h] of [[1440, 900], [390, 800]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
    const r = await page.evaluate(() => { const b = document.getElementById("kn-board").getBoundingClientRect(), x = document.querySelector(".kn-box").getBoundingClientRect(); return { b: Math.round(b.width), alto: Math.round(b.height), cabe: x.height <= innerHeight && x.width <= innerWidth + 1 }; });
    ok(w >= 1000 ? r.b >= 560 : r.b >= 300, "el tablero del recorrido se ve grande a " + w + "×" + h + " (" + r.b + "px)");
  }
  await page.setViewportSize({ width: 900, height: 1200 });
  await page.evaluate(() => { document.body.classList.add("relieve"); });
  const c3 = await page.evaluate(() => { const q = document.querySelector("#kn-board .kn-sq.lgt"), cs = getComputedStyle(q); return { img: cs.backgroundImage.includes("url("), }; });
  ok(c3.img, "con el 3D encendido las casillas llevan la textura del elemento");
  await page.evaluate(() => { document.body.classList.remove("relieve"); document.getElementById("kn-reset").click(); });
  const t00 = await centro(0); await page.mouse.click(t00.x, t00.y);
  const d00 = await page.evaluate(() => +window.__libres()[0].dataset.i);
  const q0 = await centro(d00); await page.mouse.click(q0.x, q0.y);
  const sfx = await page.evaluate(() => window.__sfx.slice());
  ok(sfx.length === 1 && sfx[0] === "n", "al mover el caballo suena el galope (" + JSON.stringify(sfx) + "): colocarlo no suena, saltar sí");

  const verdes = await page.evaluate(() => { document.getElementById('kn-reset').click(); document.querySelector('#kn-board .kn-sq[data-i="27"]').click(); return document.querySelectorAll('#kn-board .kn-sq.go').length; });
  ok(verdes === 0, 'el recorrido no marca los saltos posibles (' + verdes + ' marcas)');

  // ----- toque con ratón real (origen y destino) y sin marcas verdes, también en Guarini
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="guarini"]').click(); });
  const clic = async i => { const p = await centro(i); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60); };
  await clic(0);
  const g3 = await page.evaluate(() => ({ sel: !!document.querySelector("#kn-board .kn-sq.sel"), verdes: document.querySelectorAll("#kn-board .kn-sq.go").length }));
  ok(g3.sel && g3.verdes === 0, "Guarini: un toque selecciona el caballo y no marca saltos posibles (sel " + g3.sel + ", marcas " + g3.verdes + ")");
  await clic(5);
  const g4 = await page.evaluate(() => ({ n: document.getElementById("kn-n1").textContent, p5: !!document.querySelector('#kn-board .kn-sq[data-i="5"] .kn-pc') }));
  ok(g4.n === "1" && g4.p5, "Guarini: tocar el caballo y luego la casilla de destino lo mueve con ratón real");
  await clic(5); await clic(5);
  const g5 = await page.evaluate(() => !!document.querySelector("#kn-board .kn-sq.sel"));
  ok(!g5, "Guarini: volver a tocar el caballo seleccionado lo deselecciona");
  await page.evaluate(() => { document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="tour"]').click(); });
  await clic(27); const dd = await page.evaluate(() => +window.__libres()[0].dataset.i); await clic(dd);
  const t2 = await page.evaluate(() => document.getElementById("kn-n1").textContent);
  ok(t2.startsWith("2"), "Recorrido: tocar el destino con ratón real mueve el caballo (" + t2 + ")");

  // ----- La Senda del Caballero: A → B en el mínimo de saltos, travesía automática hasta fallar
  const kes = await page.evaluate(async () => {
    document.getElementById("kn-back").click(); document.querySelector('.kn-card[data-reto="kessel"]').click();
    const S = () => window.__knInfo().s, sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    const K = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    const nb = i => { const x = i % 8, y = (i / 8) | 0, o = []; for (const [dx, dy] of K) { const a = x + dx, b = y + dy; if (a >= 0 && a < 8 && b >= 0 && b < 8) o.push(b * 8 + a); } return o; };
    const dist = (a, roca) => { const d = Array(64).fill(-1); d[a] = 0; const q = [a]; for (let h = 0; h < q.length; h++) for (const j of nb(q[h])) if (d[j] < 0 && !roca[j]) { d[j] = d[q[h]] + 1; q.push(j); } return d; };
    const o = { minimos: [], rocas: [], coincide: true };
    for (let r = 0; r < 5; r++) {   // cinco corredores seguidos con el mínimo: la racha sube y, desde el nivel 3, aparecen rocas
      const s = S(), d = dist(s.a, s.roca);
      if (d[s.b] !== s.par) o.coincide = false;
      o.rocas.push(s.roca.filter(Boolean).length); o.minimos.push(s.par);
      for (let i = 1; i < s.ruta.length; i++) sq(s.ruta[i]).click();
      o.racha = document.getElementById("kn-n3").textContent;   // pasa solo al siguiente: no hay botón intermedio
    }
    o.ficha = document.getElementById("kn-ficha").hidden; o.reset = document.getElementById("kn-reset").textContent;
    o.rec = JSON.parse(localStorage.getItem("tablero.knBest") || "{}").kessel;
    // un corredor con un rodeo: llega, pero no es el mínimo, y la racha se pierde
    const s = S(), n1 = nb(s.a).find(i => !s.roca[i] && i !== s.b);   // un rodeo seguro: ir a un vecino, volver a A y seguir la ruta mínima
    o.rodeo = true; sq(n1).click(); sq(s.a).click();
    for (let i = 1; i < s.ruta.length; i++) sq(s.ruta[i]).click();
    o.msg2 = document.getElementById("kn-msg").textContent; o.racha2 = document.querySelector("#kn-l3").textContent; o.par = s.par;
    o.optima = !!document.querySelector(".kn-optima") || true; o.ruedaFin = S().fin; o.fallo = document.getElementById("kn-board").classList.contains("kn-fallo");
    return o;
  });
  ok(kes.coincide, "corredor: el mínimo del juego coincide con una búsqueda en anchura (" + kes.minimos.join(",") + ")");
  ok(kes.rocas[0] === 0 && kes.rocas[1] === 0 && kes.rocas[2] === 0 && kes.rocas[4] > 0, "corredor: sin rocas al empezar y con rocas a partir del nivel 3 (" + kes.rocas.join(",") + ")");
  ok(kes.rec && kes.rec.racha === 5, "corredor: cada mínimo pasa solo al siguiente y anota la racha (" + kes.racha + " · " + JSON.stringify(kes.rec) + ")");
  ok(kes.ficha && /travesía/i.test(kes.reset), "corredor: sin botón de ficha y con «Nueva travesía» (" + kes.reset + ")");
  ok(kes.ruedaFin && kes.fallo, "corredor: un rodeo termina la travesía con el efecto de piedra");
  ok(!kes.rodeo || /el mínimo era/.test(kes.msg2), "corredor: un rodeo avisa del mínimo y no es el mínimo (" + kes.msg2 + ")");

  // ----- inglés
  const en = await page.evaluate(() => {
    document.getElementById("kn-back").click(); setLang("en");
    const falta = [], tt = s => window.tx(s) !== s;
    const txt = ["Los Caballos", "Retos del caballo", "El problema de Guarini", "El recorrido del caballo", "Pasa por las 64 casillas sin repetir ninguna.", "Cuatro caballos en un tablero de 3×3: intercambia los blancos con los negros.", "‹ Retos", "Deshacer", "Ver el hilo", "Ocultar el hilo", "Sugerencia", "Conoce a Guarini", "Saltos", "Jugadas", "Casillas", "Salidas", "Mejor", "Toca una casilla para colocar el caballo.", "16 es el mínimo posible.", "¡Las 64 casillas! Recorrido completo.", "Cerrar Los Caballos",
      "Mejor: 16 saltos · 7 jugadas", "Mejor: 64 de 64 · ¡Completado!", "Mejor: 40 de 64", "¡Lo lograste en 16 saltos y 7 jugadas!", "Sin salidas: pisaste 40 de 64 casillas. Deshaz algunos saltos para probar otro camino."];
    for (const s of txt) if (!tt(s)) falta.push(s);
    return falta;
  });
  ok(!en.length, "todos los textos nuevos tienen versión en inglés" + (en.length ? ": " + en.slice(0, 5).join(" | ") : ""));
  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
