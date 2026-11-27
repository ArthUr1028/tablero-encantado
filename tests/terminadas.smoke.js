// 2.394 · Partidas terminadas: tras un mate con el Tablero cerrado se pueden abrir, ver la jugada final, guardar y salir.
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
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errores = []; page.on("pageerror", e => errores.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
  await page.addInitScript(() => { window.__noBattleIntro = true; });
  await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const intro = document.getElementById("intro"); if (intro) intro.remove(); document.documentElement.classList.remove("intro-abierta");
    document.getElementById("account-panel") ;
    // tablero local previo: 1. d4
    setMode("play"); switchVariant("clasico");
    applySanList(START, ["d4"], { white: "Yo", black: "Local", result: "", resultNote: "" }); persist(); render();
    accountProfile = { id: "ME", username: "arthur", display_name: "Arthur" };
    const mate = ["f3", "e5", "g4", "Qh4#"];
    let st = parseFEN(START); for (const san of mate) { const L = legalMoves(st); st = moveWithSAN(st, L.find(x => normSAN(toSAN(st, x, L)) === normSAN(san))).n; }
    window.__row = { id: "G1", variant: "clasico", status: "finalizada", result: "0-1", winner_id: "OTRO", white_id: "ME", black_id: "OTRO", ply_count: 4, current_fen: toFEN(st), updated_at: new Date().toISOString() };
    const datos = { games: [window.__row], profiles: [{ id: "OTRO", display_name: "Fernando" }], game_moves: mate.map((san, i) => ({ ply: i + 1, san })), game_notes: [{ ply: 0, body: "mi plan" }], game_marks: null };
    sb.from = t => {
      let uno = false;
      const q = new Proxy({}, { get(_, k) {
        if (k === "then") return (a, b) => Promise.resolve({ data: uno ? (Array.isArray(datos[t]) ? datos[t][0] : datos[t]) : (datos[t] || []), error: null }).then(a, b);
        if (k === "maybeSingle" || k === "single") return () => { uno = true; return q; };
        return () => q;
      } });
      return q;
    };
  });
  await page.evaluate(() => loadClubFinished());
  let r = await page.evaluate(() => ({ n: document.querySelectorAll("#club-finished .cg-card").length, t: document.getElementById("club-finished").textContent, badge: document.getElementById("club-tab-games-count").textContent }));
  ok(r.n === 1 && /Derrota por jaque mate/.test(r.t) && /Sin ver/.test(r.t), "la partida con mate aparece en «Terminadas» como sin ver");
  ok(r.badge === "1", "la pestaña Partidas la cuenta");
  // por la notificación
  await page.evaluate(() => pushOpenGame("11111111-1111-1111-1111-111111111111"));
  await page.waitForTimeout(400);
  r = await page.evaluate(() => ({ c: game.cursor, n: game.sans.length, last: game.sans[3], banner: !document.getElementById("fin-banner").hidden, res: game.result }));
  ok(r.banner && r.n === 4 && r.c === 3 && r.res === "0-1", "la notificación abre la partida un paso antes del mate");
  await page.waitForTimeout(2300);
  r = await page.evaluate(() => ({ c: game.cursor, local: JSON.parse(localStorage.getItem(STORE)).ucis, t: document.getElementById("fin-note").textContent }));
  ok(r.c === 4, "la jugada del mate se reproduce sola");
  ok(r.local.length === 1, "el tablero local sigue guardado intacto");
  await page.screenshot({ path: "/tmp/fin.png" });
  await page.click("#fin-save");
  await page.waitForTimeout(300);
  r = await page.evaluate(() => ({ lib: JSON.parse(JSON.stringify(cachedGamesList || [])), t: document.getElementById("fin-save").textContent }));
  const g = (r.lib || []).find(x => (x.sans || []).length === 4);
  ok(r.t === "Guardada ✓", "el botón confirma el guardado");
  if (!(await page.evaluate(() => isAccountLib()))) ok(!!g && g.nb && g.nb.notes["0"] === "mi plan", "queda en El Scriptorium con su cuaderno");
  await page.click("#fin-exit");
  r = await page.evaluate(() => ({ s: game.sans.join(" "), banner: document.getElementById("fin-banner").hidden, frozen: persistFrozen, n: document.querySelectorAll("#club-finished .cg-card").length, sin: /Sin ver/.test(document.getElementById("club-finished").textContent) }));
  ok(r.s === "d4" && r.banner && !r.frozen, "«Salir» devuelve el tablero de antes");
  ok(r.n === 1 && !r.sin, "sigue en la lista, ya como vista");
  // empezar otra cosa estando dentro
  await page.evaluate(() => openFinishedGame(window.__row)); await page.waitForTimeout(200);
  r = await page.evaluate(() => { switchVariant("atomic"); persist(); return { v: finView, frozen: persistFrozen, banner: document.getElementById("fin-banner").hidden }; });
  ok(!r.v && !r.frozen && r.banner, "cambiar de variante cierra la vista");
  await page.evaluate(() => { document.querySelector("#club-finished .cg-ghost:last-child").click(); });
  r = await page.evaluate(() => ({ n: document.querySelectorAll("#club-finished .cg-card").length, g: document.getElementById("club-group-fin").hidden }));
  ok(r.n === 0 && r.g, "«Quitar» la retira de la lista");
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  console.log(fallos ? fallos + " fallo(s)" : "Todo bien"); await browser.close(); srv.close(); process.exit(fallos ? 1 : 0);
})();
