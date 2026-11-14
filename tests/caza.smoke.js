// 2.301 · La Senda del Caballero, niveles 7-9: el objetivo fijo que se defiende (7-8) y el objetivo que solo huye si le das jaque (9); ruinas y mensajes cortos.
// Uso: node tests/caza.smoke.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
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
// Reglas escritas aparte del código del juego, a partir de la especificación: se usan para comprobar mínimo, huida y defensa.
const REGLAS = `window.__reglas = (() => {
  const KN = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
  const en = (x, y) => x >= 0 && x < 8 && y >= 0 && y < 8;
  const saltos = (i, roca) => KN.map(([dx, dy]) => [i % 8 + dx, ((i / 8) | 0) + dy]).filter(([x, y]) => en(x, y) && !roca[y * 8 + x]).map(([x, y]) => y * 8 + x);
  const alcance = (i, t, roca) => {   // casillas a las que llega la pieza (sin pisar ruinas)
    const x0 = i % 8, y0 = (i / 8) | 0, o = [];
    if (t === "n") { for (const [dx, dy] of KN) if (en(x0 + dx, y0 + dy) && !roca[(y0 + dy) * 8 + x0 + dx]) o.push((y0 + dy) * 8 + x0 + dx); return o; }
    const dirs = t === "b" ? [[1,1],[1,-1],[-1,1],[-1,-1]] : t === "r" ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dx, dy] of dirs) { let x = x0 + dx, y = y0 + dy; while (en(x, y) && !roca[y * 8 + x]) { o.push(y * 8 + x); x += dx; y += dy; } }
    return o;
  };
  const dist = (o, roca) => { const d = Array(64).fill(-1); d[o] = 0; const q = [o]; for (let h = 0; h < q.length; h++) for (const j of saltos(q[h], roca)) if (d[j] < 0) { d[j] = d[q[h]] + 1; q.push(j); } return d; };
  const defendidas = (roca, amiga) => {   // casillas defendidas por las piezas de apoyo blancas (el peón blanco ataca hacia arriba)
    const o = new Set();
    for (const c in amiga) { const x0 = c % 8, y0 = (c / 8) | 0, t = amiga[c];
      if (t === "p") { for (const dx of [-1, 1]) if (en(x0 + dx, y0 - 1)) o.add((y0 - 1) * 8 + x0 + dx); }
      else if (t === "n") { for (const [dx, dy] of KN) if (en(x0 + dx, y0 + dy)) o.add((y0 + dy) * 8 + x0 + dx); }
      else { const dirs = t === "b" ? [[1,1],[1,-1],[-1,1],[-1,-1]] : t === "r" ? [[1,0],[-1,0],[0,1],[0,-1]] : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
        for (const [dx, dy] of dirs) { let x = x0 + dx, y = y0 + dy; while (en(x, y)) { o.add(y * 8 + x); if (roca[y * 8 + x]) break; x += dx; y += dy; } } } }
    return o;
  };
  const huyeF = (k, tp, t, roca, sd) => {   // [casilla, forzada]
    if (!saltos(k, roca).includes(tp)) return [tp, false];   // solo huye si el caballo la amenaza
    const d = dist(k, roca), amen = saltos(k, roca); let mejor = -1, md = -1, forz = -1;
    for (const j of alcance(tp, t, roca)) { if (j === k) continue; if (sd && sd.has(j)) { if (forz < 0 || j < forz) forz = j; continue; } if (amen.includes(j)) continue;
      const dd = d[j] < 0 ? 99 : d[j]; if (dd > md || (dd === md && j < mejor)) { md = dd; mejor = j; } }
    return mejor >= 0 ? [mejor, false] : forz >= 0 ? [forz, true] : [tp, false];
  };
  const huye = (k, tp, t, roca, sd) => huyeF(k, tp, t, roca, sd)[0];
  const minimoFijo = (a, b, t, roca) => {   // objetivo fijo: no se pisa ninguna casilla que ataque
    const at = new Set(alcance(b, t, roca)), d = new Map([[a, 0]]), q = [a];
    for (let h = 0; h < q.length; h++) for (const j of saltos(q[h], roca)) { if (j === b) return d.get(q[h]) + 1; if (at.has(j) || d.has(j)) continue; d.set(j, d.get(q[h]) + 1); q.push(j); }
    return null;
  };
  const minimo = (a, b, t, roca, sd) => {   // anchura sobre (caballo, pieza); null si no hay captura; acorralada = la capturan tus piezas
    const vis = new Map([[a + "," + b, 0]]), q = [[a, b]];
    for (let h = 0; h < q.length; h++) { const [k, tp] = q[h], d = vis.get(k + "," + tp), at = new Set(alcance(tp, t, roca));
      for (const j of saltos(k, roca)) { if (j === tp) return d + 1; if (at.has(j)) continue; const [t2, fz] = huyeF(j, tp, t, roca, sd); if (fz) return d + 1; const key = j + "," + t2; if (!vis.has(key)) { vis.set(key, d + 1); q.push([j, t2]); } } }
    return null;
  };
  return { saltos, alcance, huye, huyeF, defendidas, minimo, minimoFijo };
})();
window.__estado = () => { const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]'); let cur = -1, obj = -1; const roca = Array(64).fill(false), amiga = Array(64).fill(false);
  for (let i = 0; i < 64; i++) { const e = sq(i); if (e.classList.contains("cur")) cur = i; if (e.classList.contains("kn-b")) obj = i; if (e.classList.contains("rock")) roca[i] = true; }
  const info = window.__knInfo().s; return { cur, obj, roca, t: info.objetivo, par: info.par, nivel: info.nivel, gastados: info.gastados, fin: info.fin }; };`;
(async () => {
  await new Promise(r => srv.listen(0, r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(REGLAS); await page.addInitScript(() => { window.__knRapido = true; window.__knNivel = 3; });
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(1000);
  await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); } localStorage.removeItem("tablero.knBest");
    document.getElementById("kn-open").click(); document.querySelector('.kn-card[data-reto="kessel"]').click(); });

  // ----- niveles 7 y 8: objetivo fijo que defiende y guardias
  const juego = await page.evaluate(async () => {
    const R = window.__reglas, o = { niveles: [], par: [], fijoQuieto: true, tiposFijo: new Set(), capturas: 0, svg: 0, def: [] };
    const sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]');
    const rutaFijo = (e0) => { const at = new Set(R.alcance(e0.obj, e0.t, e0.roca)), pr = new Map([[e0.cur, -1]]), q = [e0.cur];
      for (let h = 0; h < q.length; h++) for (const j of R.saltos(q[h], e0.roca)) { if (j === e0.obj) { const r = [j]; for (let z = q[h]; z !== -1; z = pr.get(z)) r.unshift(z); return r.slice(1); } if (at.has(j) || pr.has(j)) continue; pr.set(j, q[h]); q.push(j); } return null; };
    for (const nv of [3, 3, 3, 3, 3, 3, 4, 4, 4, 4]) {
      window.__knNivel = nv; document.getElementById("kn-reset").click();
      const s0 = window.__knInfo().s, e0 = window.__estado(); o.niveles.push(e0.nivel); o.svg += document.querySelectorAll("#kn-board .kn-rock svg").length;
      {
        o.tiposFijo.add(e0.t); o.def.push(!!s0.def);
        o.guardias = (o.guardias || []).concat(s0.guardias.length);
        const ruta = s0.ruta.slice(1);   // hay guardias: se sigue la ruta del juego
        for (const j of ruta) { sq(j).click(); const e = window.__estado(); if (window.__knInfo().s === s0 && e.obj !== e0.obj) o.fijoQuieto = false; }
        if (window.__knInfo().s !== s0) o.capturas++;
      }
    }
    o.tiposFijo = [...o.tiposFijo].sort().join("");
    return o;
  });
  ok(juego.guardias.every(g => g >= 2), "niveles 7-8: siempre hay guardias además del objetivo (" + juego.guardias.join(",") + ")");
  ok(juego.def.every(Boolean) && juego.fijoQuieto, "niveles 7-8: el objetivo está fijo y defiende su alcance");
  ok(!/n/.test(juego.tiposFijo) && juego.tiposFijo.length > 1, "niveles 7-8: sin caballos objetivo (no se les puede capturar) y con piezas variadas (" + juego.tiposFijo + ")");
  ok(juego.capturas === juego.niveles.length, "seguir el mínimo captura la pieza y pasa a la siguiente travesía (" + juego.capturas + " de " + juego.niveles.length + ")");
  ok(juego.svg > 0, "ruinas con SVG (" + juego.svg + ")");

  // ----- nivel 7: caer en una casilla que ataca el objetivo fijo: la pieza toma al caballo
  const def = await page.evaluate(async () => {
    const R = window.__reglas, sq = i => document.querySelector('#kn-board .kn-sq[data-i="' + i + '"]'); let o = { hecho: false };
    for (let n = 0; n < 60 && !o.hecho; n++) {
      window.__knNivel = 3; document.getElementById("kn-reset").click();
      const e = window.__estado(), at = new Set(R.alcance(e.obj, e.t, e.roca)), j = R.saltos(e.cur, e.roca).find(x => at.has(x) && x !== e.obj);
      if (j === undefined) continue;
      sq(j).click(); const e2 = window.__estado(), info = window.__knInfo().s; if (e2.obj !== j) continue;   // lo tomó una guardia, no el objetivo
      o = { hecho: true, fin: e2.fin, tomado: !!info.tomado, msg: document.getElementById("kn-msg").textContent, objEnCaballo: e2.obj === j, sinCaballo: !document.querySelector('#kn-board .kn-sq.cur .kn-pc.w') };
    }
    return o;
  });
  ok(def.hecho && def.fin && def.tomado && /defendida/.test(def.msg), "nivel 7: caer en una casilla que defiende el objetivo termina la travesía (" + def.msg + ")");
  ok(def.objEnCaballo && def.sinCaballo, "nivel 7: la pieza toma al caballo en su casilla");


  // ----- mensajes de claudIA: cortos y sin retos
  const txt = await page.evaluate(() => { const src = [...document.scripts].filter(x => x.id !== "i18n-en-src").map(x => x.textContent).join("\n") + document.body.innerText;
    return { viejos: ["no te lo dije", "puedes bajar de ahí", "inténtalo sin", "Mira la ruta del relámpago y vuelve a intentarlo"].filter(s => src.includes(s)) }; });
  ok(!txt.viejos.length, "mensajes: ya no queda el tono desafiante (" + (txt.viejos.join(" | ") || "limpio") + ")");

  // ----- inglés
  const en = await page.evaluate(() => {
    document.getElementById("kn-back").click(); setLang("en");
    const falta = [], tt = s => window.tx(s) !== s;
    const lista = ["Resuelto con ayuda.", "Ahora prueba sin el hilo.", "Dieciséis saltos: el mínimo posible.", "¡Excelente!", "Las 64 casillas, con ayuda.", "¡Recorrido cerrado!", "¿Probamos uno cerrado?",
      "Esa casilla estaba defendida.", "Mira la ruta y vuelve a probar.", "Se podía en 5 saltos.", "+1 ayuda.", "Nivel 7.", "Nivel 7 · objetivo armado.", "La pieza que capturas también defiende su alcance.", "Esta pieza solo huye si le das jaque: cierra sus salidas.", "Hay que acorralarla.", "El objetivo se defiende.", "Capturada en 7 saltos.", "El mínimo era 5 saltos.", "+120 puntos.", "Nivel 8 · 3 ruinas · 1 pieza amiga.", "1 ruina", "3 ruinas", ", ruinas", "Las ruinas y tus piezas bloquean el paso.", "Esta pieza huye tras cada salto y defiende lo que ataca.", "Con el mínimo exacto pasas al siguiente.",
      "Deja las esquinas y los bordes para el último tramo.", "Prefiere el destino que deje menos salidas."];
    for (const s of lista) if (!tt(s)) falta.push(s);
    return { falta, ej: window.tx("Nivel 8.") };
  });
  ok(!en.falta.length, "todos los textos nuevos tienen versión en inglés" + (en.falta.length ? ": " + en.falta.join(" | ") : "") + " (" + en.ej + ")");
  ok(!errores.length, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo bien"); process.exit(fallos ? 1 : 0);
})();
