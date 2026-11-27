// 2.397 · La escena del jaque mate: cuándo aparece, cuándo no, cómo se salta y su versión quieta.
const http = require("http"), fs = require("fs"), path = require("path");
let chromium;
try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "application/javascript" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const browser = await chromium.launch();
  const errores = [];
  async function abre(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, opts || {}));
    const page = await ctx.newPage(); page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));   // cierra la entrada de verdad (suelta su teclado)
      const intro = document.getElementById("intro"); if (intro) intro.remove(); document.documentElement.classList.remove("intro-abierta");
      setMode("play"); switchVariant("clasico");
      window.__carga = sans => { applySanList(START, sans, { white: "Yo", black: "Local", result: "", resultNote: "" }); game.cursor = sans.length - 1; animFrom = null; persist(); render(); };
      window.__mate = ["f3", "e5", "g4", "Qh4#"];
    });
    return page;
  }
  const estado = p => p.evaluate(() => { const e = document.getElementById("mate-fx"); return e ? { cls: e.className, t: e.querySelector("strong").textContent, s: e.querySelector("em").textContent, rey: document.querySelectorAll(".cell.mate-king").length } : null; });
  let page = await abre();
  await page.evaluate(() => { __carga(__mate); game.cursor = 4; render(); });
  await page.waitForTimeout(300);
  ok(!(await estado(page)), "cargar una partida ya en mate no dispara la escena");
  await page.evaluate(() => { __carga(__mate); });
  await page.waitForTimeout(500);
  await page.evaluate(() => stepForward());
  await page.waitForTimeout(250);
  let r = await estado(page);
  ok(r && r.t === "Jaque mate" && r.s === "Ganan las negras" && r.rey === 1, "al reproducir la jugada del mate aparece la escena: " + JSON.stringify(r));
  r = await page.evaluate(() => [...document.getElementById("mate-fx").children].map(e => e.className));
  ok(r.join() === "mfx-dark,mfx-title,mfx-skip", "solo hay penumbra, leyenda y la indicación de toque: " + r);
  await page.screenshot({ path: "/tmp/mate-0.png" });
  await page.waitForTimeout(950); await page.screenshot({ path: "/tmp/mate-1.png" });
  await page.waitForTimeout(1900); await page.screenshot({ path: "/tmp/mate-2.png" });
  await page.waitForTimeout(4200);
  ok(!(await estado(page)), "se retira sola");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(400);
  await page.mouse.click(200, 300); await page.waitForTimeout(950);
  ok(!(await estado(page)), "un toque la salta");
  r = await page.evaluate(() => game.cursor);
  ok(r === 4, "el toque no mueve nada en el tablero");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(400);
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(950);
  ok(!(await estado(page)) && (await page.evaluate(() => game.cursor)) === 4, "una tecla la salta sin retroceder");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => { stepForward(); showGlobalToast("AVISO-PRUEBA"); }); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.body.innerText.includes("AVISO-PRUEBA"))), "los avisos esperan durante la escena");
  await page.evaluate(() => MATE.end(false)); await page.waitForTimeout(950);
  ok(await page.evaluate(() => document.body.textContent.includes("AVISO-PRUEBA")), "y salen al terminar");
  await page.evaluate(() => { stepBack(); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  await page.evaluate(() => stepBack()); await page.waitForTimeout(100);
  ok(!(await estado(page)), "si se retrocede la jugada, desaparece");
  // jaque sin mate
  await page.evaluate(() => { __carga(["e4", "f5", "Qh5+"]); }); await page.waitForTimeout(300);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  ok(!(await estado(page)), "un jaque simple no la dispara");
  await page.context().close();
  // jugando de verdad (ratón y dedo): la escena se queda y la casilla no queda marcada como anotación
  for (const caso of ["ratón (clic)", "ratón (arrastre)", "ratón (clic sostenido)", "dedo (dos toques)", "dedo (arrastre)"]) {
    const dedo = caso.startsWith("dedo");
    const p = await abre(dedo ? { hasTouch: true, isMobile: true } : {});
    await p.evaluate(() => { applySanList(START, __mate.slice(0, 3), { white: "Yo", black: "Local", result: "", resultNote: "" }); game.cursor = 3; animFrom = null; persist(); render(); });
    await p.waitForTimeout(500);
    const xy = await p.evaluate(() => { const g = (f, r) => boardEl.querySelector('.cell[data-r="' + r + '"][data-c="' + f + '"]'); g(7, 4).scrollIntoView({ block: "center" }); const c = e => { const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; }; return { a: c(g(3, 0)), b: c(g(7, 4)) }; });
    const paso = i => ({ x: xy.a.x + (xy.b.x - xy.a.x) * i / 8, y: xy.a.y + (xy.b.y - xy.a.y) * i / 8 });
    if (caso === "ratón (arrastre)") { await p.mouse.move(xy.a.x, xy.a.y); await p.mouse.down(); await p.mouse.move(xy.b.x, xy.b.y, { steps: 8 }); await p.mouse.up(); }
    else if (caso === "dedo (arrastre)") { const cdp = await p.context().newCDPSession(p); const t = (type, q) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: q ? [q] : [] }); await t("touchStart", xy.a); for (let i = 1; i <= 8; i++) await t("touchMove", paso(i)); await t("touchEnd"); }
    else if (dedo) { await p.touchscreen.tap(xy.a.x, xy.a.y); await p.waitForTimeout(250); await p.touchscreen.tap(xy.b.x, xy.b.y); }
    else { await p.mouse.click(xy.a.x, xy.a.y); await p.waitForTimeout(200); await p.mouse.move(xy.b.x, xy.b.y); await p.mouse.down(); await p.waitForTimeout(caso.includes("sostenido") ? 800 : 90); await p.mouse.up(); }
    await p.waitForTimeout(1000);
    const q = await p.evaluate(() => ({ jugada: game.cursor === 4, escena: !!document.getElementById("mate-fx"), marcando: !!mk.act, trazos: boardEl.querySelectorAll(":scope > .mk-svg > *").length }));
    ok(q.jugada && q.escena && !q.marcando && !q.trazos, "mate con " + caso + ": escena visible y sin casilla marcada " + JSON.stringify(q));
    if (dedo) { await p.touchscreen.tap(60, 120); await p.waitForTimeout(950); ok(!(await estado(p)), "mate con " + caso + ": un toque nuevo sí la salta"); }
    await p.context().close();
  }
  // la pulsación larga de siempre sigue sirviendo para anotar
  {
    const p = await abre(); await p.evaluate(() => __carga(["e4", "e5", "Nf3"])); await p.waitForTimeout(500);
    const xy = await p.evaluate(() => { const e = boardEl.querySelector('.cell[data-r="4"][data-c="3"]'); e.scrollIntoView({ block: "center" }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
    await p.mouse.move(xy.x, xy.y); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up(); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !!mk.pop), "la pulsación larga sigue abriendo las anotaciones");
    await p.context().close();
  }
  // 2.400 · finales sin rey: explosión de Atomic y captura en Dark Chess (local y en línea)
  {
    const p = await abre({ hasTouch: true, isMobile: true });
    const juega = (v, sans) => p.evaluate(([v, sans]) => {
      MATE.end(true); switchVariant(v); matchStarted = true; matchPaused = false; vsMachine = false; currentMode = "play";
      for (const san of sans) { const st = liveState(), L = legalMoves(st); const m = L.find(x => normSAN(toSAN(st, x, L)) === normSAN(san)); if (!m) throw new Error("jugada no legal " + san); commitMove(m); }
      return { oc: outcome(liveState()), reyes: !!kingPos(liveState().board, liveState().turn) };
    }, [v, sans]);
    let f = await juega("atomic", ["Nf3", "f6", "Ne5", "a6", "Nxd7"]);
    await p.waitForTimeout(500);
    let r = await estado(p);
    ok(f.oc === "checkmate" && !f.reyes && r && r.t === "El rey ha estallado" && r.cls === "estalla" && r.rey === 1, "Atomic en solitario: la explosión del rey abre la escena " + JSON.stringify(r));
    f = await juega("dark", ["e4", "f6", "d4", "a6", "Qh5+", "a5", "Qxe8"]);
    await p.waitForTimeout(500); r = await estado(p);
    ok(f.oc === "checkmate" && !f.reyes && r && r.t === "Rey capturado" && r.rey === 1, "Dark Chess en solitario: capturar al rey abre la escena " + JSON.stringify(r));
    // Dark en línea: el final llega con la revelación del servidor
    for (const [edad, debe] of [[1000, true], [600000, false]]) {
      const q = await p.evaluate(async edad => {
        MATE.end(true); switchVariant("dark"); vsMachine = false;
        let st = parseFEN(VARIANT_START.dark); const moves = [];
        ["e4", "f6", "d4", "a6", "Qh5+", "a5", "Qxe8"].forEach((san, i) => { const L = legalMoves(st), m = L.find(x => normSAN(toSAN(st, x, L)) === normSAN(san)); moves.push({ ply: i + 1, uci: moveUci(m, st.board) }); st = moveWithSAN(st, m).n; });
        sb.rpc = async () => ({ data: { moves }, error: null });
        game.result = "1-0";
        liveGame = { id: "D1", dark: true, myColor: "w", darkObs: [], darkMoveAt: Date.now() - edad };
        await darkRevealGame({ id: "D1", status: "finalizada" });
        const e = document.getElementById("mate-fx"); const out = e && { t: e.querySelector("strong").textContent, s: e.querySelector("em").textContent };
        liveGame = null; return out;
      }, edad);
      ok(debe ? !!q && q.t === "Rey capturado" && q.s === "La victoria es tuya" : !q, debe ? "Dark en línea recién terminada: aparece desde tu lado " + JSON.stringify(q) : "Dark en línea al reabrir una vieja: no aparece");
    }
    await p.context().close();
  }
  page = await abre({ reducedMotion: "reduce" });
  await page.evaluate(() => { __carga(__mate); }); await page.waitForTimeout(400);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(300);
  r = await estado(page);
  ok(r && r.cls === "quieto", "con «reducir movimiento» usa la versión quieta");
  await page.screenshot({ path: "/tmp/mate-quieto.png" });
  await page.waitForTimeout(3100);
  ok(!(await estado(page)), "y también se retira");
  await page.context().close();
  page = await abre({ viewport: { width: 1366, height: 768 } });
  await page.evaluate(() => { __carga(__mate); }); await page.waitForTimeout(500);
  await page.evaluate(() => stepForward()); await page.waitForTimeout(3000);
  ok(!!(await estado(page)), "en escritorio también aparece");
  r = await page.evaluate(() => { const b = document.querySelector(".cell.mate-king").getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
  ok(r, "y el rey vencido queda a la vista");
  await page.screenshot({ path: "/tmp/mate-pc.png" });
  const halos = [];
  for (const tema of ["tierra", "fuego", "agua", "aire", "metal"]) {
    halos.push(await page.evaluate(t => { document.documentElement.setAttribute("data-theme", t); const cs = getComputedStyle(document.getElementById("mate-fx")); return cs.getPropertyValue("--h1").trim() + "|" + cs.getPropertyValue("--h2").trim(); }, tema));
  }
  ok(new Set(halos).size === 5 && !!(await page.$("#mate-fx .mfx-halo")), "cada elemento tiene su propio halo: " + halos.join("  "));
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
