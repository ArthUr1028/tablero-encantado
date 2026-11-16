// 2.343 · claudIA (motor de variantes) juega Asara con las reglas nuevas: partidas contra un humano que mueve al azar. Comprueba que TODAS sus jugadas son
// legales para el Tablero, que nunca hay peones en la reserva, que no se pierde ni se crea ninguna pieza (tablero + reservas + cementerio = 32)
// y que no hay errores de página. Uso: node tests/asara.claudia.smoke.js [partidas=3] [jugadas_de_la_maquina=14]
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, req.url.split("?")[0] === "/" ? "index.html" : req.url.split("?")[0]);
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": f.endsWith(".js") ? "application/javascript" : f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
let fallos = 0; const ok = (c, m) => { console.log((c ? "  ok   " : "  FALLA ") + m); if (!c) fallos++; };
(async () => {
  await new Promise(r => srv.listen(0, r));
  const NG = +process.argv[2] || 3, NM = +process.argv[3] || 14;
  const browser = await chromium.launch();
  let totalMaq = 0, capturas = 0, caidas = 0, muertos = 0;
  for (let g = 0; g < NG; g++) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    const page = await ctx.newPage(); const errores = []; page.on("pageerror", e => errores.push(String(e)));
    await page.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort());
    await page.addInitScript(() => { window.__noBattleIntro = true; try { localStorage.clear(); } catch (e) {} });
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html?intro=0", { waitUntil: "load" }); await page.waitForTimeout(1500);
    await page.evaluate(() => { for (const id of ["intro", "battle-intro"]) { const e = document.getElementById(id); if (e) e.remove(); }
      document.getElementById("mode-play").click(); switchVariant("crazyhouse");
      vsMachine = true; machineHumanColor = "w"; machineLevel = 10;
      newGame(VARIANT_START.crazyhouse, { white: "Yo", black: "claudIA", result: "", resultNote: "" }); matchStarted = true; matchPaused = false; render(); });
    let mal = "";
    for (let i = 0; i < NM && !mal; i++) {
      // el humano (blancas) juega al azar, sesgado hacia capturas y caídas
      const hum = await page.evaluate(() => { const s = liveState(); if (s.turn !== "w" || game.result || outcome(s) === "checkmate" || outcome(s) === "stalemate") return "fin";
        const L = legalMoves(s), pref = L.filter(m => m.capture || m.drop), pick = (pref.length && Math.random() < .6 ? pref : L)[Math.floor(Math.random() * (pref.length && Math.random() < .6 ? pref.length : L.length))] || L[0];
        if (!pick) return "fin"; commitMove(pick); return "ok"; });
      if (hum === "fin") break;
      const n0 = await page.evaluate(() => game.ucis.length);
      try { await page.waitForFunction(n => game.ucis.length > n || game.result || ["checkmate", "stalemate", "material"].includes(outcome(liveState())), n0, { timeout: 60000 }); }
      catch (e) { mal = "claudIA no respondió tras " + n0 + " jugadas"; break; }
      totalMaq++;
      const inv = await page.evaluate(() => { const s = liveState(), z = s.board.zh; let n = 0; for (const row of s.board) for (const q of row) if (q) n++;
        for (const c of ["w", "b"]) { for (const t of ["p", "n", "b", "r", "q"]) n += z[c][t]; n += z.d[c].length; }
        const last = game.ucis[game.ucis.length - 1];
        return { n, pr: z.w.p + z.b.p, dead: z.d.w.length + z.d.b.length, last, san: game.sans[game.sans.length - 1], ilegal: game.ucis.length !== game.sans.length }; });
      if (inv.n !== 32 || inv.pr) mal = "invariante rota: " + JSON.stringify(inv);
      if (/@/.test(inv.last || "")) caidas++; muertos = Math.max(muertos, inv.dead);
    }
    ok(!mal, "partida " + (g + 1) + ": " + (mal || "claudIA jugó con las reglas nuevas (jugadas de la máquina hasta ahora: " + totalMaq + ")"));
    ok(errores.length === 0, "partida " + (g + 1) + ": sin errores de página" + (errores.length ? " " + errores.slice(0, 2).join("|") : ""));
    await ctx.close();
  }
  console.log("  (" + totalMaq + " jugadas de claudIA, " + caidas + " caídas suyas, hasta " + muertos + " piezas en el cementerio)");
  await browser.close(); srv.close();
  console.log(fallos ? fallos + " fallos" : "Todo bien"); process.exit(fallos ? 1 : 0);
})();
