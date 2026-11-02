// Genera los íconos de las notificaciones push (ntf-*.png) con las MISMAS piezas SVG del Tablero: oro sobre un disco oscuro con aro dorado.
// Uso: node tools/make-notif-icons.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const PIEZAS = { caballo: "glyph-knight", rey: "glyph-king", dama: "glyph-queen", torre: "glyph-rook", alfil: "glyph-bishop", peon: "glyph-pawn",
                 arzobispo: "glyph-archbishop", canciller: "glyph-chancellor", amazona: "glyph-amazon", halcon: "se-hawk", elefante: "se-elephant" };
const srv = http.createServer((q, r) => { const f = path.join(RAIZ, q.url.split("?")[0] === "/" ? "index.html" : q.url.split("?")[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  await pg.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort()); await pg.addInitScript(() => { window.__noBattleIntro = true; });
  await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" }); await pg.waitForTimeout(1500);
  for (const [nombre, id] of Object.entries(PIEZAS)) {
    await pg.evaluate(([id]) => {
      document.getElementById("__stage")?.remove();
      const st = document.createElement("div"); st.id = "__stage";
      st.style.cssText = "position:fixed;left:0;top:0;width:512px;height:512px;z-index:99999;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,#221c34 0%,#120f1d 62%,#09080f 100%)";
      st.innerHTML = '<div style="position:absolute;inset:36px;border-radius:50%;border:5px solid #c79a45;box-shadow:0 0 0 2px #6e5222 inset,0 0 18px rgba(199,154,69,.35)"></div>' +
        '<span class="piece w fairy" style="position:relative;display:block;width:300px;height:300px;color:#efd48c;--piece-edge:#8a6a2c;-webkit-text-stroke:0;filter:drop-shadow(0 0 14px rgba(210,165,80,.55))"><svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block;fill:currentColor"><use href="#' + id + '"></use></svg></span>';
      document.body.appendChild(st);
    }, [id]);
    await pg.waitForTimeout(120);
    const el = await pg.$("#__stage");
    await el.screenshot({ path: path.join(RAIZ, "ntf-" + nombre + ".png"), type: "png" });
  }
  // Ícono de la app (512, el mismo caballo) y la insignia monocroma de la barra de estado de Android (silueta blanca sobre transparente).
  await pg.evaluate(() => { document.getElementById("__stage")?.remove(); });
  fs.copyFileSync(path.join(RAIZ, "ntf-caballo.png"), path.join(RAIZ, "icono-512.png"));
  await pg.evaluate(() => {
    const st = document.createElement("div"); st.id = "__stage"; st.style.cssText = "position:fixed;left:0;top:0;width:96px;height:96px;z-index:99999;background:transparent";
    st.innerHTML = '<span class="piece w fairy" style="display:block;width:96px;height:96px;color:#fff;--piece-edge:#fff;-webkit-text-stroke:0"><svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block;fill:#fff"><use href="#glyph-knight"></use></svg></span>';
    document.documentElement.style.background = "transparent"; document.body.style.background = "transparent"; document.body.appendChild(st);
  });
  await pg.waitForTimeout(100);
  await (await pg.$("#__stage")).screenshot({ path: path.join(RAIZ, "icono-insignia.png"), type: "png", omitBackground: true });
  await b.close(); srv.close(); console.log("íconos generados:", Object.keys(PIEZAS).join(", "));
})();
