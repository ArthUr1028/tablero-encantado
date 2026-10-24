// ARCHIVO GENERADO por tools/build-dark-rules.js desde index.html — NO editar a mano.
const document = {}, window = {};
const FILES = "abcdefghij";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CAPABLANCA_START = "rnabqkbcnr/pppppppppp/10/10/10/10/PPPPPPPPPP/RNABQKBCNR w KQkq - 0 1";
/* V257 · Ajedrez de Seirawan (S-Chess). Tablero y piezas de siempre, más dos piezas por bando que empiezan FUERA del tablero, en reserva:
   el Halcón ("a", alfil + caballo = el arzobispo) y el Elefante ("c", torre + caballo = el canciller). Cuando una pieza de la fila
   trasera se mueve por PRIMERA vez, su dueño puede colocar una de esas piezas en la casilla que acaba de dejar libre (al enrocar,
   en la del rey o en la de la torre). La FEN lleva la reserva entre corchetes pegada al tablero, como en Fairy-Stockfish, y un
   séptimo campo con las columnas de la fila trasera donde aún se puede colocar (mayúsculas = blancas).
   El estado vive en `board.seir` = { w:{pk:"ac", g:"abcdefgh"}, b:{...} } (pk = piezas aún en reserva; g = columnas colocables): así
   variantOf(board) lo detecta sin banderas aparte, igual que el resto de variantes. */
// 2.101: FEN estándar de S-Chess (como Fairy-Stockfish): reserva [HEhe]; el campo de enroque lleva K/Q y las columnas aún colocables (B-G)
// 2.103: Dark Chess = posición clásica con la marca «dark» en el 7.º campo del FEN (así se distingue del Clásico en partidas guardadas y en línea)
const DARK_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1 dark";
const SEIRAWAN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[HEhe] w KQBCDFGkqbcdfg - 0 1";
const SEIR_FEN = { a:"h", c:"e" };   // letra interna -> letra del FEN estándar (Halcón = H, Elefante = E)
const SEIR_GATE_UCI = { a:"h", c:"e" };   // letra del Tablero -> letra del motor (Halcón = h, Elefante = e)
const SEIR_GATE_FROM_UCI = { h:"a", e:"c" };
// Maharajá y los Cipayas (2026-09-15): variante asimétrica de origen indio —
// las negras conservan el ejército completo, las blancas juegan con una sola
// pieza (el Maharajá, "M", movimiento de dama + caballo combinados, ver
// pseudoMoves/attacked). Blancas nacen sin rey ni torres, así que sin
// derechos de enroque propios (FEN calcada de la definición oficial de
// Fairy-Stockfish, variants.ini: "... w kq - 0 1", solo negras conservan
// KQ/kq de su lado). A pedido de Arthur, los peones negros coronan normal
// (regla simplificada, no la versión "purista" — ver memoria del proyecto).
const MAHARAJA_START = "rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1";
// Fase B (Máquina en Maharajá): definición de la variante calcada del
// variants.ini oficial de Fairy-Stockfish (ver memoria del proyecto). No
// viene compilada de fábrica como Capablanca — se registra en tiempo de
// ejecución vía fsf_load_variant_ini(), una función que agregamos al motor
// (mismo binario WASM_SINGLE ya validado, sin recompilar el parche).
const MAHARAJA_INI =
  "[maharajah]\npawn = p\nknight = n\nbishop = b\nrook = r\nqueen = q\nking = k\namazon = m\n" +
  "pieceToCharTable = PNBRQ.............MKpnbrq.............mk\n" +
  "startFen = rnbqkbnr/pppppppp/8/8/8/8/8/4M3 w kq - 0 1\n" +
  "extinctionValue = loss\nextinctionPieceTypes = m\nextinctionPseudoRoyal = true\n";
// Modo Amazonas (2026-09-17): variante simétrica pedida por Arthur — ambos
// bandos nacen con la Dama sustituida por una Amazona (torre+alfil+caballo,
// mismo ícono/letra "m" que ya construimos para el Maharajá; ver nota más
// abajo sobre por qué NO usamos "a" aunque a nivel de motor no habría
// ambigüedad con el Arzobispo de Capablanca — nuestro propio registro
// interno de piezas SÍ es único y global, no por variante). Ambos reyes
// están presentes desde el inicio (a diferencia del Maharajá, donde un
// bando no tiene rey nunca) — ver fix de kingPos()/variantOf() más abajo,
// necesario precisamente por esta diferencia. A pedido explícito de
// Arthur, coronar sigue dando solo Dama/Torre/Alfil/Caballo — NUNCA
// Amazona ("perder a la amazona sería siempre un duro golpe del que no se
// puede recuperar del todo") — de ahí promotionPieceTypes = qrbn, y basta
// con no tocar promoTypes(cols) ya que su valor por defecto a 8 columnas
// ya es exactamente ["q","r","b","n"].
const AMAZONAS_START = "rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1";
const AMAZONAS_INI =
  "[amazonas]\npawn = p\nknight = n\nbishop = b\nrook = r\nqueen = q\nking = k\namazon = m\n" +
  "pieceToCharTable = PNBRQ.............MKpnbrq.............mk\n" +
  "startFen = rnbmkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBMKBNR w KQkq - 0 1\n" +
  "promotionPieceTypes = qrbn\n";
const GLYPH = { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟", a:"A", c:"C", m:"♛" };
// piezas que se dibujan como ícono SVG propio (ver <defs> al inicio del
// body) en vez de un glifo Unicode: Arzobispo/Canciller porque el bloque
// Unicode "Chess Symbols" que los define casi no tiene soporte de fuentes;
// el Peón porque, aunque ♟ sí existe en todas partes, cada plataforma lo
// dibuja con una fuente distinta (Segoe UI Symbol en Windows, Noto Sans
// Symbols2 en Android) y se ve "gordo"/inconsistente en celular vs laptop
// (pedido de Arthur, 2026-09-15). Solo la Torre se queda en Unicode por
// ahora — no hubo queja sobre ella. La Amazona (m, Modo Maharajá)
// reutilizaba a propósito el glifo Unicode de la Dama desde la Fase A
// ("diseño más amenazante si es fácil, si no dejarla tal cual") — Arthur
// trajo su propio ícono de corona estilizada el 2026-09-16, y de paso le
// gustó tanto ese primer trazo que pidió reciclarlo para el Rey (k, todas
// las modalidades) en vez de descartarlo. La Amazona se quedó con un
// segundo diseño de corona más "amenazante"; y una TERCERA corona que
// Arthur encontró de paso ("no tiene la agresividad que necesita la
// Amazona") pasó a ser el ícono de la Dama (q, todas las modalidades). El
// Alfil (b, todas las modalidades) pasó a un ícono propio el mismo día,
// calcado de una mitra episcopal que Arthur trajo justo después de
// aprobar el rediseño del Peón. El Caballo (n, todas las modalidades)
// cerró la misma ronda: cabeza de caballo con armadura, recortada a
// pedido de Arthur para dejar solo cabeza y crin (sin hombro/pechera) —
// ver comentarios de #glyph-king / #glyph-amazon / #glyph-queen /
// #glyph-bishop / #glyph-knight en el <defs>.
const FAIRY = { a:true, c:true, p:true, m:true, k:true, q:true, b:true, n:true, r:true, s:true, f:true, l:true };
const FAIRY_SYMBOL = { a:"glyph-archbishop", c:"glyph-chancellor", p:"glyph-pawn", m:"glyph-amazon", k:"glyph-king", q:"glyph-queen", b:"glyph-bishop", n:"glyph-knight", r:"glyph-rook", s:"sh-shah", f:"sh-ferz", l:"sh-fil" };
// V234: en el shatranj, torre/caballo/peón también cambian de dibujo (ver setPieceSet()).
const SHAT_SET = { r:"sh-rukh", n:"sh-faras", p:"sh-baydaq" };
let shatSet = false;
// 2.98: en Seirawan, el Halcón (a) y el Elefante (c) usan los dibujos propios de Arthur (ver <symbol id="se-hawk"> / "se-elephant").
const SEIR_SET = { a:"se-hawk", c:"se-elephant" };
let seirSet = false;
function setPieceSet(board){ shatSet = isShat(board); seirSet = !!(board && board.seir); }
// V240: ¿esta pieza se voltea hacia el centro? El caballo siempre; en el shatranj, todas.
function facesCenter(t){ return t === "n" || (shatSet && "rnpsfl".indexOf(t) >= 0) || (seirSet && (t === "a" || t === "c")); }
// Marcado (texto o SVG) para una pieza: las normales son un carácter Unicode
// de toda la vida; Arzobispo/Canciller usan el ícono definido en <defs> al
// inicio del body (ver comentario ahí). Se usa con .innerHTML, no
// .textContent, en cada lugar donde se dibuja una pieza (tablero, cantera,
// ficha flotante al arrastrar, diálogo de coronación).
function pieceMarkup(t){
  if(FAIRY[t]) return '<svg viewBox="0 0 100 100" aria-hidden="true"><use href="#' + ((shatSet && SHAT_SET[t]) || (seirSet && SEIR_SET[t]) || FAIRY_SYMBOL[t]) + '"></use></svg>';
  return GLYPH[t];
}

const KNIGHT_OFFS = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
const DIAG_DIRS = [[1,1],[1,-1],[-1,1],[-1,-1]];
const ORTHO_DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

// Geometría de enroque derivada solo del ancho del tablero: con 8 columnas
// es el ajedrez de siempre (rey en e, torres en a/h); con 10 (Capablanca)
// el rey nace en f y salta 3 casillas en vez de 2, torres en a/j — regla
// verificada contra las reglas publicadas de Capablanca Chess.
function castleGeom(cols){
  if(cols >= 10) return { kingCol:5, qsRook:0, ksRook:9, qsKingTo:2, ksKingTo:8, qsRookTo:3, ksRookTo:7 };
  return { kingCol:4, qsRook:0, ksRook:7, qsKingTo:2, ksKingTo:6, qsRookTo:3, ksRookTo:5 };
}
/* ---------- V233 · Shatranj ----------
   Letras internas propias (como la Amazona "m"): s = shah (rey), f = ferz (dama de una casilla), l = fil (alfil que salta 2).
   Torre, caballo y peón conservan r, n, p. La dama NO está en e1 como "q": el ferz sí (f) — el shah queda en d. Que el rey se llame
   "s" y no "k" es lo que permite derivar la modalidad del tablero real aunque se hayan capturado todos los ferz y fil. */
const SHATRANJ_START = "rnlsflnr/pppppppp/8/8/8/8/PPPPPPPP/RNLSFLNR w - - 0 1";
const FIL_OFFS = [[2,2],[2,-2],[-2,2],[-2,-2]];
const _shatCache = new WeakMap();
function isShat(b){
  let v = _shatCache.get(b);
  if(v === undefined){
    v = false;
    for(const row of b){ for(const p of row) if(p && p[1] === "s"){ v = true; break; } if(v) break; }
    _shatCache.set(b, v);
  }
  return v;
}
// Piezas (sin el shah) de cada bando.
function shatMaterial(b){
  const m = { w:0, b:0 };
  for(const row of b) for(const p of row) if(p && p[1] !== "s") m[p[0]]++;
  return m;
}
function promoTypes(cols){ return cols >= 10 ? ["q","r","b","n","a","c"] : ["q","r","b","n"]; }

// Qué variante es una posición dada, derivado del propio tablero (nunca de
// una bandera aparte que haya que recordar sincronizar): 10 columnas es
// siempre Capablanca; 8 columnas con una pieza "m"/"M" en algún lado es
// Maharajá (el Maharajá jamás desaparece del tablero durante la partida —
// el jaque mate no lo retira, igual que a un Rey normal — así que esta
// detección es fiable jugada a jugada, incluida la posición final). Mismo
// espíritu que el resto del motor: "nada queda fijo, todo se deriva del
// tablero real".
function variantOf(board){
  if(board.dark) return "dark";   // 2.103: Dark Chess (niebla de guerra): mismas piezas que el clásico, otra regla
  if(board.seir) return "seirawan";   // V257
  if(board[0].length >= 10) return "capablanca";
  // El Maharajá y el Modo Amazonas comparten la letra interna "m" (misma
  // pieza/ícono, ver comentario junto a AMAZONAS_INI), así que una sola
  // "hay una Amazona" ya no alcanza para distinguirlos: en el Maharajá un
  // bando NUNCA tiene rey propio; en Amazonas ambos reyes están siempre
  // presentes. Se deriva del tablero real, no de una bandera aparte.
  if(isShat(board)) return "shatranj";   // V233: el shah ("s") solo existe en el Shatranj
  let hasAmazon = false, hasWhiteKing = false;
  for(const row of board) for(const p of row){
    if(p === "wk") hasWhiteKing = true;
    if(p && p[1] === "m") hasAmazon = true;
  }
  if(hasAmazon) return hasWhiteKing ? "amazonas" : "maharaja";
  return "clasico";
}

const inB = (r,c,cols) => r>=0 && r<8 && c>=0 && c<cols;
const sqName = ([r,c]) => FILES[c] + (8-r);
const sameSq = (a,b) => a && b && a[0]===b[0] && a[1]===b[1];

function parseFEN(fen){
  const parts = fen.trim().split(/\s+/);
  let [pos, turn="w", cast="-", ep="-", half="0", full="1", gflags] = parts;
  // V257: «[ACac]» pegado al tablero = Seirawan (reserva: mayúsculas blancas, minúsculas negras)
  let seirPk = null;
  const br = pos.indexOf("[");
  if(br >= 0){ seirPk = pos.slice(br + 1).replace("]", ""); pos = pos.slice(0, br); }
  if(seirPk !== null && gflags === undefined){   // 2.101: FEN estándar (6 campos): el campo de enroque trae K/Q y las columnas colocables
    const fl = cast.split("").filter(ch => /[a-h]/i.test(ch));
    for(const [K, Q, up] of [["K", "Q", x => x.toUpperCase()], ["k", "q", x => x]]){
      if(cast.includes(K) || cast.includes(Q)) fl.push(up("e"));
      if(cast.includes(K)) fl.push(up("h"));
      if(cast.includes(Q)) fl.push(up("a"));
    }
    gflags = fl.length ? fl.join("") : "-";
  }
  const rowsRaw = [];
  for(const row of pos.split("/")){
    const arr = [];
    let i = 0;
    while(i < row.length){
      const ch = row[i];
      if(/\d/.test(ch)){
        let numStr = ch; i++;
        while(i < row.length && /\d/.test(row[i])){ numStr += row[i]; i++; }
        for(let k=0; k<+numStr; k++) arr.push("");
      } else {
        const pc = seirPk !== null ? ({ H:"A", h:"a", E:"C", e:"c" }[ch] || ch) : ch;   // 2.101: Seirawan escribe H/E (A/C, del formato anterior, se sigue leyendo)
        arr.push((pc === pc.toUpperCase() ? "w" : "b") + pc.toLowerCase());
        i++;
      }
    }
    rowsRaw.push(arr);
  }
  const cols = Math.max(8, ...rowsRaw.map(r => r.length));
  const board = rowsRaw.map(arr => {
    const row = arr.slice(0, cols);
    while(row.length < cols) row.push("");
    return row;
  });
  while(board.length < 8) board.push(Array(cols).fill(""));
  if(seirPk === null && gflags === "dark") board.dark = true;   // 2.103: «… 0 1 dark»
  if(seirPk !== null){
    const mk = (col, back) => {
      const pk = ["a","c"].filter(ch => { const alt = ch === "a" ? "h" : "e", up = x => col === "w" ? x.toUpperCase() : x; return seirPk.includes(up(ch)) || seirPk.includes(up(alt)); }).join("");
      let g;
      if(gflags && gflags !== "-") g = gflags.split("").filter(ch => (col === "w") === (ch === ch.toUpperCase())).map(ch => ch.toLowerCase()).join("");
      else if(gflags === "-") g = "";
      else g = "abcdefgh".split("").filter((f, c) => board[back][c] && board[back][c][0] === col && board[back][c][1] !== "p").join("");
      return { pk, g };
    };
    board.seir = { w: mk("w", 7), b: mk("b", 0) };
  }
  return {
    board, turn,
    castle:{ K:cast.includes("K"), Q:cast.includes("Q"), k:cast.includes("k"), q:cast.includes("q") },
    ep: ep === "-" ? null : [8 - (+ep[1]), FILES.indexOf(ep[0])],
    half: +half || 0, full: +full || 1
  };
}
function toFEN(s){
  const rows = s.board.map(row=>{
    let out = "", empty = 0;
    for(const p of row){
      if(!p){ empty++; continue; }
      if(empty){ out += empty; empty = 0; }
      const lt = (s.board.seir && SEIR_FEN[p[1]]) || p[1];   // 2.101: en Seirawan el halcón y el elefante van como H y E
      out += p[0] === "w" ? lt.toUpperCase() : lt;
    }
    if(empty) out += empty;
    return out;
  });
  let cast = (s.castle.K?"K":"") + (s.castle.Q?"Q":"") + (s.castle.k?"k":"") + (s.castle.q?"q":"");
  if(!cast) cast = "-";
  let boardStr = rows.join("/"), tail = "";
  const sq = s.board.seir;
  if(sq){   // V257
    const rv = x => x.split("").map(ch => SEIR_FEN[ch]).join("");
    boardStr += "[" + rv(sq.w.pk).toUpperCase() + rv(sq.b.pk) + "]";
    cast = "";   // FEN estándar: K/Q y, además, las columnas con pieza sin mover (las que ya implican K/Q no se repiten)
    for(const col of ["w", "b"]){
      const up = x => col === "w" ? x.toUpperCase() : x, hasK = s.castle[up("k")] ? true : false, hasQ = s.castle[up("q")] ? true : false;
      if(hasK) cast += up("k"); if(hasQ) cast += up("q");
      for(const fl of sq[col].g){
        if(fl === "e" && (hasK || hasQ)) continue;
        if(fl === "h" && hasK) continue;
        if(fl === "a" && hasQ) continue;
        cast += up(fl);
      }
    }
    if(!cast) cast = "-";
  }
  return `${boardStr} ${s.turn} ${cast} ${s.ep ? sqName(s.ep) : "-"} ${s.half} ${s.full}` + (s.board.dark ? " dark" : "");
}
const cloneBoard = b => {
  const n = b.map(r=>r.slice());
  if(b.dark) n.dark = true;   // 2.103
  if(b.seir) n.seir = { w: { ...b.seir.w }, b: { ...b.seir.b } };   // V257
  return n;
};
const cloneState = s => ({
  board: cloneBoard(s.board),
  turn: s.turn,
  castle: {...s.castle},
  ep: s.ep ? s.ep.slice() : null,
  half: s.half, full: s.full
});

function attacked(b, tr, tc, by){
  const cols = b[0].length;
  const pr = tr + (by === "w" ? 1 : -1);
  for(const dc of [-1,1]) if(inB(pr,tc+dc,cols) && b[pr][tc+dc] === by+"p") return true;
  // El caballo, el arzobispo (alfil+caballo), el canciller (torre+caballo) y
  // el Maharajá (dama+caballo) comparten el salto de caballo, así que
  // también dan jaque "a la de caballo".
  for(const [dr,dc] of KNIGHT_OFFS)
    if(inB(tr+dr,tc+dc,cols) && ["n","a","c","m"].includes((b[tr+dr][tc+dc]||"")[1]) && b[tr+dr][tc+dc][0]===by) return true;
  for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
    if(!dr && !dc) continue;
    if(inB(tr+dr,tc+dc,cols) && (b[tr+dr][tc+dc] === by+"k" || b[tr+dr][tc+dc] === by+"s")) return true;
    // V233: el ferz ataca una casilla en diagonal
    if(dr && dc && inB(tr+dr,tc+dc,cols) && b[tr+dr][tc+dc] === by+"f") return true;
  }
  // V233: el fil ataca saltando exactamente dos casillas en diagonal
  for(const [dr,dc] of FIL_OFFS) if(inB(tr+dr,tc+dc,cols) && b[tr+dr][tc+dc] === by+"l") return true;
  const scan = (dirs, kinds) => {
    for(const [dr,dc] of dirs){
      let r=tr+dr, c=tc+dc;
      while(inB(r,c,cols)){
        const p = b[r][c];
        if(p){ if(p[0]===by && kinds.includes(p[1])) return true; break; }
        r+=dr; c+=dc;
      }
    }
    return false;
  };
  // Diagonal: alfil, dama, arzobispo y Maharajá. Ortogonal: torre, dama,
  // canciller y Maharajá.
  if(scan(DIAG_DIRS, ["b","q","a","m"])) return true;
  if(scan(ORTHO_DIRS, ["r","q","c","m"])) return true;
  return false;
}
// La pieza "real" de un bando: el Rey de siempre, o —en Modo Maharajá,
// solo para las blancas— el Maharajá ("m"), que es royal exactamente igual
// que un Rey (debe salir del jaque, se le da mate igual). Generalizar aquí
// es lo único que hizo falta para que jaque/mate/ahogado (inCheck, legalMoves,
// outcome, la casilla resaltada en rojo) funcionen en Maharajá sin tocarlos.
function kingPos(b, color){
  const cols = b[0].length;
  // En Maharajá la Amazona ES el rey (el bando nunca tiene "k" propio), pero
  // en Modo Amazonas ambas piezas conviven: hay que preferir siempre el rey
  // real y usar la Amazona solo como respaldo si de verdad no hay rey.
  let fallback = null;
  for(let r=0;r<8;r++) for(let c=0;c<cols;c++){
    const p = b[r][c];
    if(p === color+"k" || p === color+"s") return [r,c];
    if(p === color+"m" && !fallback) fallback = [r,c];
  }
  return fallback;
}
function inCheck(s, color){
  if(s.board.dark) return false;   // 2.103: en Dark Chess no hay jaque; se pierde al perder el rey
  const k = kingPos(s.board, color);
  return k ? attacked(s.board, k[0], k[1], color === "w" ? "b" : "w") : false;
}

function betweenEmpty(b, rank, a, c){
  const lo = Math.min(a,c), hi = Math.max(a,c);
  for(let col=lo+1; col<hi; col++) if(b[rank][col]) return false;
  return true;
}
function kingPathClear(b, rank, from, to, opp){
  const step = to > from ? 1 : -1;
  for(let col=from; col !== to+step; col+=step) if(attacked(b, rank, col, opp)) return false;
  return true;
}

function pseudoMoves(s, R, C){
  const b = s.board, p = b[R][C], cols = b[0].length;
  if(!p) return [];
  const me = p[0], opp = me === "w" ? "b" : "w", type = p[1], out = [];
  const push = (tr,tc,extra) => out.push(Object.assign({ from:[R,C], to:[tr,tc], capture: b[tr][tc] || null }, extra));

  if(type === "p"){
    const dir = me === "w" ? -1 : 1;
    const startRank = me === "w" ? 6 : 1;
    const lastRank = me === "w" ? 0 : 7;
    const shat = isShat(b);   // V233: sin salida doble, sin al paso, y se corona siempre en ferz
    const promos = shat ? ["f"] : b.seir ? ["q","r","b","n","a","c"] : promoTypes(cols);   // V257: en Seirawan también se corona en Halcón/Elefante
    if(inB(R+dir,C,cols) && !b[R+dir][C]){
      if(R+dir === lastRank) for(const pr of promos) push(R+dir,C,{promo:pr});
      else push(R+dir,C,{});
      if(!shat && R === startRank && !b[R+2*dir][C]) push(R+2*dir,C,{dbl:true});
    }
    for(const dc of [-1,1]){
      const tr = R+dir, tc = C+dc;
      if(!inB(tr,tc,cols)) continue;
      if(b[tr][tc] && b[tr][tc][0] === opp){
        if(tr === lastRank) for(const pr of promos) push(tr,tc,{promo:pr});
        else push(tr,tc,{});
      } else if(!shat && s.ep && s.ep[0] === tr && s.ep[1] === tc){
        push(tr,tc,{ ep:true, capture: opp+"p" });
      }
    }
  } else if(type === "n" || type === "a" || type === "c" || type === "m"){
    // Caballo puro; arzobispo/canciller (que además del salto de caballo
    // deslizan como alfil/torre respectivamente); o el Maharajá ("m", Modo
    // Maharajá), que además del salto de caballo desliza en las 8
    // direcciones como una dama — es la pieza "Amazona" de la variante.
    for(const [dr,dc] of KNIGHT_OFFS){
      const tr=R+dr, tc=C+dc;
      if(inB(tr,tc,cols) && (!b[tr][tc] || b[tr][tc][0] === opp)) push(tr,tc,{});
    }
    if(type !== "n"){
      const dirs = type === "a" ? DIAG_DIRS : type === "c" ? ORTHO_DIRS : [...DIAG_DIRS, ...ORTHO_DIRS];
      for(const [dr,dc] of dirs){
        let r=R+dr, c=C+dc;
        while(inB(r,c,cols)){
          if(!b[r][c]){ push(r,c,{}); }
          else { if(b[r][c][0] === opp) push(r,c,{}); break; }
          r+=dr; c+=dc;
        }
      }
    }
  } else if(type === "f" || type === "l"){
    // V233: ferz = una casilla en diagonal; fil = salta a la segunda casilla diagonal (no necesita camino libre)
    const offs = type === "f" ? DIAG_DIRS : FIL_OFFS;
    for(const [dr,dc] of offs){
      const tr=R+dr, tc=C+dc;
      if(inB(tr,tc,cols) && (!b[tr][tc] || b[tr][tc][0] === opp)) push(tr,tc,{});
    }
  } else if(type === "k" || type === "s"){
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
      if(!dr && !dc) continue;
      const tr=R+dr, tc=C+dc;
      if(inB(tr,tc,cols) && (!b[tr][tc] || b[tr][tc][0] === opp)) push(tr,tc,{});
    }
    const rank = me === "w" ? 7 : 0;
    const g = castleGeom(cols);
    if(type === "k" && R === rank && C === g.kingCol && (b.dark || !attacked(b,rank,g.kingCol,opp))){
      const kr = me === "w" ? "K" : "k", qr = me === "w" ? "Q" : "q";
      if(s.castle[kr] && b[rank][g.ksRook] === me+"r"
         && betweenEmpty(b,rank,g.kingCol,g.ksRook)
         && (b.dark || kingPathClear(b,rank,g.kingCol,g.ksKingTo,opp)))
        push(rank, g.ksKingTo, {castle:"K"});
      if(s.castle[qr] && b[rank][g.qsRook] === me+"r"
         && betweenEmpty(b,rank,g.qsRook,g.kingCol)
         && (b.dark || kingPathClear(b,rank,g.kingCol,g.qsKingTo,opp)))
        push(rank, g.qsKingTo, {castle:"Q"});
    }
  } else {
    const dirs = type === "b" ? DIAG_DIRS : type === "r" ? ORTHO_DIRS : [...DIAG_DIRS, ...ORTHO_DIRS];
    for(const [dr,dc] of dirs){
      let r=R+dr, c=C+dc;
      while(inB(r,c,cols)){
        if(!b[r][c]){ push(r,c,{}); }
        else { if(b[r][c][0] === opp) push(r,c,{}); break; }
        r+=dr; c+=dc;
      }
    }
  }
  return out;
}

function applyMove(s, mv){
  const n = cloneState(s);
  const b = n.board;
  const cols = b[0].length, g = castleGeom(cols);
  const [fr,fc] = mv.from, [tr,tc] = mv.to;
  const p = b[fr][fc], me = p[0];

  n.half = (p[1] === "p" || mv.capture) ? 0 : n.half + 1;
  b[tr][tc] = mv.promo ? me + mv.promo : p;
  b[fr][fc] = "";
  if(mv.ep) b[fr][tc] = "";
  if(mv.castle === "K"){ b[fr][g.ksRookTo] = b[fr][g.ksRook]; b[fr][g.ksRook] = ""; }
  if(mv.castle === "Q"){ b[fr][g.qsRookTo] = b[fr][g.qsRook]; b[fr][g.qsRook] = ""; }

  n.ep = mv.dbl ? [(fr+tr)/2, fc] : null;

  if(p[1] === "k"){
    if(me === "w"){ n.castle.K = n.castle.Q = false; }
    else { n.castle.k = n.castle.q = false; }
  }
  const clearRook = (r,c) => {
    if(r===7 && c===g.qsRook) n.castle.Q = false;
    if(r===7 && c===g.ksRook) n.castle.K = false;
    if(r===0 && c===g.qsRook) n.castle.q = false;
    if(r===0 && c===g.ksRook) n.castle.k = false;
  };
  clearRook(fr,fc); clearRook(tr,tc);

  if(b.seir){   // V257 · Seirawan: casillas aún colocables, captura de piezas sin mover y colocación de la reserva
    const mine = b.seir[me], theirs = b.seir[me === "w" ? "b" : "w"];
    const backMe = me === "w" ? 7 : 0, backOpp = me === "w" ? 0 : 7;
    if(fr === backMe) mine.g = mine.g.replace(FILES[fc], "");
    if(mv.castle === "K") mine.g = mine.g.replace(FILES[g.ksRook], "");
    if(mv.castle === "Q") mine.g = mine.g.replace(FILES[g.qsRook], "");
    if(tr === backOpp) theirs.g = theirs.g.replace(FILES[tc], "");
    if(mv.gate){ b[mv.gsq[0]][mv.gsq[1]] = me + mv.gate; mine.pk = mine.pk.replace(mv.gate, ""); }
  }

  n.turn = me === "w" ? "b" : "w";
  if(me === "b") n.full++;
  return n;
}

// V257 · Seirawan: la jugada tal cual y, si el bando aún tiene piezas en reserva y mueve por primera vez una pieza de su fila
// trasera, una variante por cada pieza de la reserva colocada en la casilla que se libera (al enrocar: en la del rey o la de la torre).
function gateVariants(s, mv){
  const res = [mv], me = s.turn, sq = s.board.seir[me];
  if(!sq.pk) return res;
  const back = me === "w" ? 7 : 0, [fr, fc] = mv.from;
  if(fr !== back) return res;
  const spots = [];
  if(sq.g.includes(FILES[fc])) spots.push([fr, fc]);
  if(mv.castle){
    const g = castleGeom(s.board[0].length), rc = mv.castle === "K" ? g.ksRook : g.qsRook;
    if(sq.g.includes(FILES[rc])) spots.push([back, rc]);
  }
  for(const gs of spots) for(const pc of sq.pk) res.push(Object.assign({}, mv, { gate: pc, gsq: gs }));
  return res;
}
// Notación UCI de Fairy-Stockfish (Halcón = h, Elefante = e al final; al enrocar colocando sobre la torre: torre→rey + letra).
function uciOf(mv, seir){
  if(!seir) return sqName(mv.from) + sqName(mv.to) + (mv.promo || "");
  const sg = mv.gate ? SEIR_GATE_UCI[mv.gate] : "";
  if(mv.gate && mv.castle && mv.gsq[1] !== mv.from[1]) return sqName(mv.gsq) + sqName(mv.from) + sg;
  const pr = mv.promo ? (SEIR_GATE_UCI[mv.promo] || mv.promo) : "";
  return sqName(mv.from) + sqName(mv.to) + pr + sg;
}
const moveUci = (mv, board) => uciOf(mv, !!(board && board.seir));
function legalMoves(s){
  const out = [];
  const cols = s.board[0].length, seir = !!s.board.seir;
  for(let r=0;r<8;r++) for(let c=0;c<cols;c++){
    const p = s.board[r][c];
    if(!p || p[0] !== s.turn) continue;
    for(const base of pseudoMoves(s,r,c)){
      for(const mv of (seir ? gateVariants(s, base) : [base])){
        if(s.board.dark){ out.push(mv); continue; }   // 2.103: Dark Chess — sin jaque: toda jugada pseudolegal vale
        const n = applyMove(s, mv);
        const k = kingPos(n.board, s.turn);
        if(k && !attacked(n.board, k[0], k[1], s.turn === "w" ? "b" : "w")) out.push(mv);
      }
    }
  }
  return out;
}

function insufficient(b){
  if(isShat(b)){ const m = shatMaterial(b); return m.w === 0 && m.b === 0; }   // V233: shatranj, solo shah contra shah
  const ps = [];
  for(const row of b) for(const p of row) if(p) ps.push(p);
  // El arzobispo, el canciller y el Maharajá combinan movimientos de
  // torre/alfil/dama: se tratan como piezas mayores (nunca hay tablas
  // automáticas por material insuficiente mientras alguno siga en el
  // tablero), igual que la dama.
  if(ps.some(p => "prqacm".includes(p[1]))) return false;
  if(b.seir && (b.seir.w.pk || b.seir.b.pk)) return false;   // V257: con reserva pendiente aún puede entrar una pieza mayor
  return ps.filter(p => p[1] === "b" || p[1] === "n").length <= 1;
}
/* ---- Repetición triple (V121, 2026-09-26) ----
   outcome() sigue siendo una función del tablero, pero la repetición
   necesita HISTORIAL: se busca la línea (principal o rama) que contiene
   el estado por identidad y se cuentan las posiciones iguales anteriores.
   Dos posiciones son "la misma" si coinciden piezas, turno, derechos de
   enroque y casilla de al paso (esta última solo cuando de verdad hay un
   peón que podría capturar al paso — FIDE 9.2). Solo se miran posiciones
   con el mismo bando en turno (índices de la misma paridad) y solo desde
   la última jugada irreversible (s.half): nada anterior a un movimiento
   de peón o captura puede volver a aparecer. */
function posKey(s){
  let ep = "-";
  if(s.ep){
    const [er, ec] = s.ep, pr = er + (s.turn === "w" ? 1 : -1), mine = s.turn + "p";
    const row = s.board[pr];
    if(row && (row[ec-1] === mine || row[ec+1] === mine)) ep = er + "," + ec;
  }
  const c = s.castle, sq = s.board.seir;
  return s.board.map(r => r.map(p => p || "-").join(",")).join("/") + " " + s.turn + " " +
    (c.K?"K":"") + (c.Q?"Q":"") + (c.k?"k":"") + (c.q?"q":"") + " " + ep +
    (sq ? " [" + sq.w.pk + "|" + sq.b.pk + "] " + sq.w.g + "|" + sq.b.g : "");
}
// Estados desde el inicio de la línea que lo contiene hasta t (inclusive), o null.
function lineThrough(t){
  try{
    if(typeof branch !== "undefined" && branch){
      const i = branch.states.indexOf(t);
      if(i === 0) return game.states.slice(0, branch.diverge + 1);
      if(i > 0) return game.states.slice(0, branch.diverge + 1).concat(branch.states.slice(1, i + 1));
    }
    if(typeof game !== "undefined" && game){
      const j = game.states.indexOf(t);
      if(j >= 0) return game.states.slice(0, j + 1);
    }
  }catch(e){}
  return null;
}
// Cuántas veces ha aparecido la posición de s en su línea (contando s).
// `prev`, si se da, es el estado desde el que se llegó a s cuando s todavía
// no está guardado en ninguna línea (lo hace moveWithSAN()).
function repCount(s, prev){
  let before;
  if(prev){ before = lineThrough(prev); }
  else { const a = lineThrough(s); before = a ? a.slice(0, -1) : null; }
  if(!before) return 1;
  const end = before.length; // índice que ocupa (o ocuparía) s
  const key = posKey(s);
  let n = 1;
  for(let k = end - 2; k >= Math.max(0, end - s.half); k -= 2){
    if(posKey(before[k]) === key) n++;
  }
  return n;
}
function outcome(s, prev){
  if(s.board.dark){   // 2.103 · Dark Chess: pierde quien se queda sin rey (se codifica como "checkmate": pierde quien tiene el turno)
    if(!kingPos(s.board, s.turn)) return "checkmate";
    if(!kingPos(s.board, s.turn === "w" ? "b" : "w")) return "nokings";
    if(!legalMoves(s).length) return "stalemate";
    return s.half >= 100 ? "draw50" : "normal";
  }
  if(!kingPos(s.board,"w") || !kingPos(s.board,"b")) return "nokings";
  const shat = isShat(s.board);
  if(shat){
    // V233 · Shatranj: quien se queda con el shah solo PIERDE (se codifica como "checkmate": pierde quien tiene el turno), salvo que
    // acabe de quedar solo por una captura y pueda capturar de inmediato la última pieza rival (entonces quedan los dos solos: tablas).
    const mat = shatMaterial(s.board), opp = s.turn === "w" ? "b" : "w";
    if(mat[s.turn] === 0){
      if(mat[opp] === 0) return "material";
      const rescue = mat[opp] === 1 && s.half === 0 && legalMoves(s).some(m => m.capture && m.capture[1] !== "s");
      if(!rescue) return "checkmate";
    }
  }
  const legal = legalMoves(s);
  const chk = inCheck(s, s.turn);
  if(!legal.length) return (chk || shat) ? "checkmate" : "stalemate";   // V233: en el shatranj el rey ahogado PIERDE
  if(s.half >= 100) return "draw50";
  if(insufficient(s.board)) return "material";
  if(repCount(s, prev) >= 3) return "draw3";
  return chk ? "check" : "normal";
}
// Todo estado que cierra la partida por las reglas (un solo lugar).
const END_OC = ["checkmate","stalemate","draw50","draw3","material","nokings"];

// V233: por qué terminó una partida de Shatranj con outcome() === "checkmate": "mate" | "ahogado" | "reysolo".
function shatReason(s){
  if(inCheck(s, s.turn)) return "mate";
  if(shatMaterial(s.board)[s.turn] === 0) return "reysolo";
  return "ahogado";
}
function toSAN(s, mv, legal){
  if(mv.castle === "K") return "O-O" + gateSuffix(mv);
  if(mv.castle === "Q") return "O-O-O" + gateSuffix(mv);
  const p = s.board[mv.from[0]][mv.from[1]], type = p[1];
  const cap = !!mv.capture;
  const dest = sqName(mv.to);
  let str = "";
  if(type === "p"){
    if(cap) str += FILES[mv.from[1]] + "x";
    str += dest;
    if(mv.promo) str += "=" + mv.promo.toUpperCase();
  } else {
    str += (s.board.seir && SEIR_SAN[type]) || type.toUpperCase();   // 2.100: en Seirawan, Halcón = H y Elefante = E (A y C son del Capablanca)
    const amb = legal.filter(m =>
      !sameSq(m.from, mv.from) && sameSq(m.to, mv.to) &&
      s.board[m.from[0]][m.from[1]] &&
      s.board[m.from[0]][m.from[1]][1] === type &&
      s.board[m.from[0]][m.from[1]][0] === p[0]);
    if(amb.length){
      const sameFile = amb.some(m => m.from[1] === mv.from[1]);
      const sameRank = amb.some(m => m.from[0] === mv.from[0]);
      if(!sameFile) str += FILES[mv.from[1]];
      else if(!sameRank) str += (8 - mv.from[0]);
      else str += FILES[mv.from[1]] + (8 - mv.from[0]);
    }
    if(cap) str += "x";
    str += dest;
  }
  return str + gateSuffix(mv);
}
// V257: «/H» = Halcón colocado, «/E» = Elefante (2.100; antes A y C); al enrocar se añade la casilla (O-O/He1 o O-O/Hh1)
const SEIR_SAN = { a:"H", c:"E" };
function gateSuffix(mv){ return mv.gate ? "/" + (SEIR_SAN[mv.gate] || mv.gate.toUpperCase()) + (mv.castle ? sqName(mv.gsq) : "") : ""; }
function moveWithSAN(s, mv){
  const legal = legalMoves(s);
  let san = toSAN(s, mv, legal);
  const n = applyMove(s, mv);
  const oc = outcome(n, s);
  if(oc === "checkmate"){ if(n.board.dark){ /* 2.103: captura del rey, sin # */ } else if(!isShat(n.board) || inCheck(n, n.turn)) san += "#"; }
  else if(oc === "check") san += "+";
  return { n, san, oc };
}

function fogVisible(pos, color){
  const b = pos.board, cols = b[0].length, vis = new Set();
  const st = { board: b, turn: color, castle: pos.castle, ep: color === pos.turn ? pos.ep : null, half: pos.half, full: pos.full };
  for(let r = 0; r < 8; r++) for(let c = 0; c < cols; c++){
    const p = b[r][c];
    if(!p || p[0] !== color) continue;
    vis.add(r + "," + c);
    for(const m of pseudoMoves(st, r, c)){ vis.add(m.to[0] + "," + m.to[1]); if(m.ep) vis.add(r + "," + m.to[1]); }
    // 2.105: el peón ilumina solo lo que puede jugar (avance libre, capturas); si una pieza rival le tapa el paso, esa casilla queda en sombra (pista de deducción)
  }
  return vis;
}
export { parseFEN, toFEN, legalMoves, applyMove, outcome, fogVisible, pseudoMoves, sameSq, DARK_START };
