// Genera los íconos de las notificaciones push (ntf-*.png) con las MISMAS piezas SVG del Tablero: oro sobre un disco oscuro con aro dorado.
// Uso: node tools/make-notif-icons.js   (necesita playwright-core y un Chromium; busca /opt/node-tools)
const http = require("http"), fs = require("fs"), path = require("path");
let chromium; try { ({ chromium } = require("playwright-core")); } catch (e) { ({ chromium } = require("/opt/node-tools/node_modules/playwright-core")); }
const RAIZ = path.resolve(__dirname, "..");
const PIEZAS = { caballo: "glyph-knight", rey: "glyph-king", dama: "glyph-queen", torre: "glyph-rook", alfil: "glyph-bishop", peon: "glyph-pawn",
                 arzobispo: "glyph-archbishop", canciller: "glyph-chancellor", amazona: "glyph-amazon", halcon: "se-hawk", elefante: "se-elephant",
                 "shatranj-baydaq": "sh-baydaq", "shatranj-faras": "sh-faras", "shatranj-fil": "sh-fil", "shatranj-rukh": "sh-rukh", "shatranj-ferz": "sh-ferz", "shatranj-shah": "sh-shah" };
const srv = http.createServer((q, r) => { const f = path.join(RAIZ, q.url.split("?")[0] === "/" ? "index.html" : q.url.split("?")[0]); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, r));
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 });
  await pg.route(/^(?!http:\/\/127\.0\.0\.1).*/, r => r.abort()); await pg.addInitScript(() => { window.__noBattleIntro = true; });
  await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" }); await pg.waitForTimeout(1500);
  for (const [nombre, id] of Object.entries(PIEZAS)) {
    await pg.evaluate(([id]) => {
      document.getElementById("__stage")?.remove(); document.getElementById("__stage-css")?.remove();
      const st = document.createElement("div"); st.id = "__stage";
      st.style.cssText = "position:fixed;left:0;top:0;width:512px;height:512px;z-index:99999;display:grid;place-items:center;background:radial-gradient(circle at 50% 45%,#221c34 0%,#120f1d 62%,#09080f 100%)";
      const aro = '<div style="position:absolute;inset:36px;border-radius:50%;border:5px solid #c79a45;box-shadow:0 0 0 2px #6e5222 inset,0 0 18px rgba(199,154,69,.35)"></div>';
      const q = document.createElement("style"); q.id = "__stage-css";
      q.textContent = "#__stage #board::before,#__stage #board::after,#__stage .cell::before,#__stage .cell::after{display:none!important;content:none!important}#__stage .cell{background:none!important;box-shadow:none!important}";
      document.head.appendChild(q);
      if(id.startsWith("sh-")){   // ficha de arcilla (como en el tablero de Shatranj): misma regla CSS, dentro de «#board .cell»
        st.innerHTML = aro + '<div id="board" style="position:relative;display:block;width:340px;height:340px;background:none;border:0;box-shadow:none;padding:0;margin:0"><div class="cell lgt" style="position:relative;width:340px;height:340px;display:block;background:none;overflow:visible">' +
          '<span class="piece w fairy" style="display:block;width:100%;height:100%;filter:drop-shadow(0 0 16px rgba(210,165,80,.45))"><svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block"><use href="#' + id + '"></use></svg></span></div></div>';
      } else {
        st.innerHTML = aro +
          '<span class="piece w fairy" style="position:relative;display:block;width:300px;height:300px;color:#efd48c;--piece-edge:#8a6a2c;-webkit-text-stroke:0;filter:drop-shadow(0 0 14px rgba(210,165,80,.55))"><svg viewBox="0 0 100 100" style="width:100%;height:100%;display:block;fill:currentColor"><use href="#' + id + '"></use></svg></span>';
      }
      document.body.appendChild(st);
    }, [id]);
    await pg.waitForTimeout(120);
    const el = await pg.$("#__stage");
    await el.screenshot({ path: path.join(RAIZ, "ntf-" + nombre + ".png"), type: "png" });
  }
  // Ícono de la app (512, el mismo caballo) y la insignia monocroma de la barra de estado de Android (silueta blanca sobre transparente).
  await pg.evaluate(() => { document.getElementById("__stage")?.remove(); });
  fs.copyFileSync(path.join(RAIZ, "ntf-caballo.png"), path.join(RAIZ, "icono-512.png"));
  const html = fs.readFileSync(path.join(RAIZ, "index.html"), "utf8"), sym = html.match(/<symbol id="glyph-knight"([^>]*)>([\s\S]*?)<\/symbol>/);
  const vb = (sym[1].match(/viewBox="([^"]+)"/) || [0, "0 0 100 100"])[1];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" width="96" height="96" fill="#ffffff" stroke="none">' + sym[2].replace(/(fill|stroke)="[^"]*"/g, "").replace(/currentColor/g, "#fff") + "</svg>";
  const pb = await b.newPage({ viewport: { width: 96, height: 96 } });
  await pb.setContent('<html><body style="margin:0;background:transparent">' + svg + "</body></html>");
  await pb.screenshot({ path: path.join(RAIZ, "icono-insignia.png"), omitBackground: true, type: "png" });
  await b.close(); srv.close(); console.log("íconos generados:", Object.keys(PIEZAS).join(", "));
})();
