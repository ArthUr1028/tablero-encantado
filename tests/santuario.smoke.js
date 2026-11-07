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
  ok(r.masters === 141, "el Santuario tiene 141 fichas (" + r.masters + ")");
  ok(!r.malas.length, "todas las partidas se reproducen completas con el motor del Tablero" + (r.malas.length ? ": " + r.malas.slice(0, 5).join(", ") : ""));
  ok(!r.dup.length, "ningún id de partida repetido" + (r.dup.length ? ": " + r.dup.join(",") : ""));
  ok(!r.faltan.length, "todas las fichas y partidas tienen sus campos" + (r.faltan.length ? ": " + r.faltan.slice(0, 5).join(",") : ""));
  ok(!r.erasMal.length, "todas las eras existen");
  // inglés
  const sin = await page.evaluate(() => {
    setLang("en");
    const nuevos = ["alapin","grunfeld","sozin","samisch","colle","pirc","panov","veresov","rossolimo","sveshnikov","kotov","benko","seirawan","shirov","gelfand","svidler","kosteniuk","vachier-lagrave","so","firouzja","praggnanandhaa"];
    const ids = HOF.masters.filter(m => nuevos.includes(m.id));
    const sin = [];
    const t = s => window.tx(s) !== s;
    for (const m of ids) { for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) sin.push(m.id + "." + c); for (const g of m.games) { if (!t(g.why)) sin.push(g.id + ".why"); if (!t(g.event)) sin.push(g.id + ".event"); } }
    for (const id of ["reshevsky","euwe","fine","smyslov","petrosian","karpov","korchnoi","larsen"]) { const m = HOF.masters.find(x => x.id === id); for (const g of m.games.slice(-4)) if (!t(g.why)) sin.push(g.id + ".why"); }
    return sin;
  });
  // 2.166: menciones honoríficas del Lote 6 (sin partidas): años, título y cada apartado con versión en inglés
  const sinH = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    for (const id of ["lucena","damiano","ruylopez","greco","lolli","ponziani"]) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m || !m.honor || !m.tema || m.games.length) { falta.push(id + ":estructura"); continue; }
      if (m.era !== "primeros") falta.push(id + ":era");
      if (!t(m.title)) falta.push(id + ".title");
      if (!/^\d{4}–\d{4}$/.test(m.years) && !t(m.years)) falta.push(id + ".years");
      for (const sc of m.secciones) { if (!["documentado","debate","leyenda"].includes(sc.nivel)) falta.push(id + ":nivel"); if (!t(sc.t)) falta.push(id + ".t:" + sc.t); if (!t(sc.txt)) falta.push(id + ".txt:" + sc.t); }
    }
    const orden = HOF.masters.filter(m => m.era === "primeros").map(m => m.id).join(",");
    if (orden !== "lucena,damiano,ruylopez,greco,philidor,lolli,ponziani,petrov,evans,labourdonnais,staunton") falta.push("orden:" + orden);
    return falta;
  });
  // 2.167: Lote 7, diez fichas completas de maestros cuyo nombre vive en una apertura
  const sin7 = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    const L7 = { alapin: 4, grunfeld: 5, sozin: 4, samisch: 4, colle: 4, pirc: 4, panov: 4, veresov: 4, rossolimo: 4, sveshnikov: 4 };
    for (const id in L7) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m) { falta.push(id + ":no existe"); continue; }
      if (m.honor || m.tema) falta.push(id + ":no debe ser mención");
      if (m.games.length !== L7[id]) falta.push(id + ":partidas " + m.games.length);
      for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) falta.push(id + "." + c);
      for (const g of m.games) {
        if (!t(g.title)) falta.push(g.id + ".title"); if (!t(g.event)) falta.push(g.id + ".event"); if (!t(g.why)) falta.push(g.id + ".why");
        if (!new RegExp("\\[White \"" + g.white + "\"\\]").test(g.pgn) || !new RegExp("\\[Black \"" + g.black + "\"\\]").test(g.pgn)) falta.push(g.id + ":jugadores del PGN");
      }
    }
    const er = id => HOF.masters.filter(m => m.era === id).map(m => m.id).join(",");
    if (!/pillsbury,charousek,alapin,janowski/.test(er("ciencia"))) falta.push("orden ciencia");
    if (!/bogoljubov,grunfeld,nimzowitsch/.test(er("entreguerras"))) falta.push("orden grunfeld");
    if (!/torre,sozin,samisch,colle,alekhine/.test(er("entreguerras"))) falta.push("orden sozin-samisch-colle");
    if (!/sultankhan,pirc,flohr/.test(er("entreguerras"))) falta.push("orden pirc");
    if (!/keres,panov,veresov,najdorf/.test(er("entreguerras"))) falta.push("orden panov-veresov");
    if (!/kotov,rossolimo,smyslov/.test(er("sovietica"))) falta.push("orden rossolimo");
    if (!/karpov,sveshnikov,timman/.test(er("fria"))) falta.push("orden sveshnikov");
    return falta;
  });
  // 2.222: Grupo A, seis menciones honoríficas más (Petrov, Evans, Max Lange, Kann, Caro, Albin)
  const sinA = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    const A = { petrov: "primeros", evans: "primeros", lange: "romantica", kann: "ciencia", caro: "ciencia", albin: "ciencia" };
    for (const id in A) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m || !m.honor || !m.tema || m.games.length) { falta.push(id + ":estructura"); continue; }
      if (m.era !== A[id]) falta.push(id + ":era");
      if (!m.wiki) falta.push(id + ".wiki");
      if (!t(m.title)) falta.push(id + ".title");
      if (!/^\d{4}–\d{4}$/.test(m.years)) falta.push(id + ".years");
      if (!m.secciones.length) falta.push(id + ":sin secciones");
      for (const sc of m.secciones) { if (!["documentado","debate","leyenda"].includes(sc.nivel)) falta.push(id + ":nivel"); if (!t(sc.t)) falta.push(id + ".t:" + sc.t); if (!t(sc.txt)) falta.push(id + ".txt:" + sc.t); }
    }
    const er = id => HOF.masters.filter(m => m.era === id).map(m => m.id).join(",");
    if (!/anderssen,bird,lange,morphy/.test(er("romantica"))) falta.push("orden lange");
    if (!/winawer,kann,caro,chigorin/.test(er("ciencia"))) falta.push("orden kann-caro");
    if (!/tarrasch,albin,lasker/.test(er("ciencia"))) falta.push("orden albin");
    return falta;
  });
  const kannFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.kann === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.kann), cred: !!HOF_LOCAL_CRED.kann, en: (setLang("en"), window.tx(HOF_LOCAL_CRED.kann) !== HOF_LOCAL_CRED.kann) }));
  ok(kannFoto.img && kannFoto.cred && kannFoto.en, "Marcus Kann lleva su retrato propio con crédito y versión en inglés");
  const lucFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.lucena === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.lucena), cred: /podría ser un retrato imaginario/.test(HOF_LOCAL_CRED.lucena || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.lucena) !== HOF_LOCAL_CRED.lucena) }));
  const lolFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.lolli === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.lolli), cred: /identificación no está confirmada/.test(HOF_LOCAL_CRED.lolli || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.lolli) !== HOF_LOCAL_CRED.lolli) }));
  const ponFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.ponziani === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.ponziani), cred: /Ercole del Rio/.test(HOF_LOCAL_CRED.ponziani || "") && /no está confirmada/.test(HOF_LOCAL_CRED.ponziani || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.ponziani) !== HOF_LOCAL_CRED.ponziani) }));
  const sozFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.sozin === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.sozin), cred: /50chess\.ru/.test(HOF_LOCAL_CRED.sozin || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.sozin) !== HOF_LOCAL_CRED.sozin) }));
  const sozBio = await page.evaluate(() => { const m = HOF.masters.find(x => x.id === "sozin"); return { es: /Nóvgorod, en una familia de sacerdote/.test(m.bio), en: (setLang("en"), /Novgorod, into a priest's family/.test(window.tx(m.bio))) }; });
  ok(sozBio.es && sozBio.en, "la ficha de Sozin incluye su origen (Nóvgorod, familia de sacerdote) y su servicio en la guerra, con versión en inglés");
  const verFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.veresov === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.veresov), cred: /2002/.test(HOF_LOCAL_CRED.veresov || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.veresov) !== HOF_LOCAL_CRED.veresov) }));
  const nezFoto = await page.evaluate(() => ({ img: typeof HOF_LOCAL_IMG.nezhmetdinov === "string" && /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.nezhmetdinov), cred: /Aimchess/.test(HOF_LOCAL_CRED.nezhmetdinov || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.nezhmetdinov) !== HOF_LOCAL_CRED.nezhmetdinov) }));
  const pacFoto = await page.evaluate(() => ({ img: /^data:image\/jpeg;base64,/.test(HOF_LOCAL_IMG.pachman || ""), cred: /ChessBase/.test(HOF_LOCAL_CRED.pachman || ""), en: (setLang("en"), window.tx(HOF_LOCAL_CRED.pachman) !== HOF_LOCAL_CRED.pachman) }));
  ok(pacFoto.img && pacFoto.cred && pacFoto.en, "Pachman lleva su retrato de 1943 con crédito de procedencia y versión en inglés");
  ok(nezFoto.img && nezFoto.cred && nezFoto.en, "Nezhmetdinov lleva su retrato con crédito de procedencia y versión en inglés");
  ok(verFoto.img && verFoto.cred && verFoto.en, "Veresov lleva su retrato de la portada del libro de 2002 con crédito y versión en inglés");
  ok(sozFoto.img && sozFoto.cred && sozFoto.en, "Sozin lleva su fotografía con crédito de procedencia y versión en inglés");
  ok(ponFoto.img && ponFoto.cred && ponFoto.en, "Ponziani lleva su dibujo atribuido con crédito que indica el conflicto de rótulo y versión en inglés");
  ok(lolFoto.img && lolFoto.cred && lolFoto.en, "Lolli lleva su grabado atribuido con crédito que indica la duda y versión en inglés");
  ok(lucFoto.img && lucFoto.cred && lucFoto.en, "Lucena lleva su imagen atribuida con crédito que indica la duda y versión en inglés");
  const sinB = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    const B = { nezhmetdinov: [3, "sovietica"], charousek: [3, "ciencia"], vidmar: [4, "ciencia"], juwenjun: [4, "moderna"], leitingjie: [4, "moderna"] };
    for (const id in B) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m) { falta.push(id + ":no existe"); continue; }
      if (m.era !== B[id][1]) falta.push(id + ":era");
      if (m.games.length !== B[id][0]) falta.push(id + ":partidas " + m.games.length);
      for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) falta.push(id + "." + c);
      for (const g of m.games) {
        for (const c of ["title", "event", "why"]) { if (c === "event" && /^[A-Za-z]+, \d{4}(\/\d{2})?$/.test(g.event)) continue; if (!t(g[c])) falta.push(g.id + "." + c); }
        if (!/^\[Event /.test(g.pgn) || !g.pgn.trim().endsWith(g.result)) falta.push(g.id + ":pgn");
        if (g.moves !== Math.ceil(g.pgn.split("\n\n")[1].replace(/\s*(1-0|0-1|1\/2-1\/2)\s*$/, "").split(/\s+/).filter(x => !/^\d+\.$/.test(x)).length / 2)) falta.push(g.id + ":moves");
      }
    }
    const ids = HOF.masters.map(m => m.id), ix = id => ids.indexOf(id);
    if (ix("nezhmetdinov") !== ix("tal") - 1) falta.push("orden nezhmetdinov");
    if (ix("charousek") !== ix("pillsbury") + 1) falta.push("orden charousek");
    if (ix("vidmar") !== ix("marshall") + 1) falta.push("orden vidmar");
    if (ix("juwenjun") !== ix("so") + 1) falta.push("orden juwenjun");
    if (ix("leitingjie") !== ix("firouzja") + 1) falta.push("orden leitingjie");
    return falta;
  });
  const sinC2 = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    const C = { adams: 3, leko: 3, radjabov: 3, grischuk: 3, karjakin: 3, mamedyarov: 3, giri: 3, weiyi: 3 };
    const ids = HOF.masters.map(m => m.id), ix = id => ids.indexOf(id);
    for (const id in C) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m) { falta.push(id + ":no existe"); continue; }
      if (m.games.length !== C[id]) falta.push(id + ":partidas " + m.games.length);
      if (!m.wiki || !/^\d{4}–(\d{4})?$/.test(m.years)) falta.push(id + ":wiki/years");
      for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) falta.push(id + "." + c);
      for (const g of m.games) {
        for (const c of ["title", "event", "why"]) { if (c === "event" && /^[A-Za-z]+, \d{4}(\/\d{2})?$/.test(g.event)) continue; if (!t(g[c])) falta.push(g.id + "." + c); }
        if (!/^\[Event /.test(g.pgn) || !g.pgn.trim().endsWith(g.result)) falta.push(g.id + ":pgn");
      }
    }
    for (const [a, b] of [["gelfand", "adams"], ["svidler", "leko"], ["kramnik", "radjabov"], ["topalov", "grischuk"], ["aronian", "karjakin"], ["karjakin", "mamedyarov"], ["caruana", "giri"], ["vachier-lagrave", "weiyi"]])
      if (ix(b) !== ix(a) + 1) falta.push("orden " + b);
    return falta;
  });
  ok(!sinC2.length, "las ocho fichas del Grupo C-2 están completas, ordenadas y traducidas" + (sinC2.length ? ": " + sinC2.slice(0, 6).join(", ") : ""));
  const sinC1 = await page.evaluate(() => {
    const falta = [], t = s => window.tx(s) !== s;
    const C = { levenfish: 3, lilienthal: 3, stahlberg: 4, szabo: 3, pachman: 3, averbakh: 3, andersson: 3, ljubojevic: 3, beliavsky: 3, vaganian: 3 };
    const ids = HOF.masters.map(m => m.id), ix = id => ids.indexOf(id);
    for (const id in C) {
      const m = HOF.masters.find(x => x.id === id);
      if (!m) { falta.push(id + ":no existe"); continue; }
      if (m.games.length !== C[id]) falta.push(id + ":partidas " + m.games.length);
      if (!m.wiki || !/^\d{4}–(\d{4})?$/.test(m.years)) falta.push(id + ":wiki/years");
      for (const c of ["title", "bio", "style", "legacy"]) if (!t(m[c])) falta.push(id + "." + c);
      for (const g of m.games) {
        for (const c of ["title", "event", "why"]) { if (c === "event" && /^[A-Za-z]+, \d{4}(\/\d{2})?$/.test(g.event)) continue; if (!t(g[c])) falta.push(g.id + "." + c); }
        if (!/^\[Event /.test(g.pgn) || !g.pgn.trim().endsWith(g.result)) falta.push(g.id + ":pgn");
      }
    }
    for (const [a, b] of [["flohr", "levenfish"], ["euwe", "lilienthal"], ["lilienthal", "stahlberg"], ["gligoric", "szabo"], ["benko", "pachman"], ["smyslov", "averbakh"], ["timman", "andersson"], ["andersson", "ljubojevic"], ["seirawan", "beliavsky"], ["beliavsky", "vaganian"]])
      if (ix(b) !== ix(a) + 1) falta.push("orden " + b);
    return falta;
  });
  ok(!sinC1.length, "las diez fichas del Grupo C-1 están completas, ordenadas y traducidas" + (sinC1.length ? ": " + sinC1.slice(0, 6).join(", ") : ""));
  ok(!sinB.length, "las cinco fichas del Grupo B están completas, ordenadas y traducidas" + (sinB.length ? ": " + sinB.slice(0, 6).join(", ") : ""));
  ok(!sinA.length, "las seis menciones honoríficas del Grupo A están completas, ordenadas y traducidas" + (sinA.length ? ": " + sinA.slice(0, 6).join(", ") : ""));
  ok(!sin7.length, "las diez fichas del Lote 7 están completas, ordenadas y traducidas" + (sin7.length ? ": " + sin7.slice(0, 6).join(", ") : ""));
  ok(!sinH.length, "las seis menciones honoríficas (Lote 6) están completas, ordenadas y traducidas" + (sinH.length ? ": " + sinH.slice(0, 6).join(", ") : ""));
  ok(!sin.length, "los textos nuevos del Santuario tienen versión en inglés" + (sin.length ? ": " + sin.slice(0, 6).join(", ") : ""));
  ok(errores.length === 0, "sin errores de JavaScript" + (errores.length ? ": " + errores[0] : ""));
  await browser.close(); srv.close();
  console.log(fallos ? "\nHAY FALLOS" : "\nTodo bien");
  process.exit(fallos ? 1 : 0);
})();
