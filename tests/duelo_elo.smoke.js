const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.resolve(__dirname,"..");
const srv=http.createServer((req,res)=>{const f=path.join(RAIZ,req.url.split("?")[0]==="/"?"index.html":req.url.split("?")[0]);if(!fs.existsSync(f)){res.writeHead(404);return res.end()}
const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";res.writeHead(200,{"Content-Type":t});fs.createReadStream(f).pipe(res)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
(async()=>{await new Promise(r=>srv.listen(0,r));const url="http://127.0.0.1:"+srv.address().port+"/index.html";
const b=await chromium.launch();const errs=[];
const page=await b.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});
page.on("pageerror",e=>errs.push(String(e)));page.on("dialog",d=>d.accept());
await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());
await page.goto(url,{waitUntil:"load"});await page.waitForTimeout(1200);
await page.evaluate(()=>{for(const id of["intro","battle-intro"]){const e=document.getElementById(id);if(e)e.remove()}document.documentElement.classList.remove("intro-abierta")});
// 1) matemática pura
const m=await page.evaluate(()=>({
 a:eloUpdate(null,25,1).r, b:eloUpdate({r:1000,n:0},0,1).r, c:eloUpdate({r:1000,n:0},0,0).r, d:eloUpdate({r:1000,n:0},10,0.5).r,
 e:eloUpdate({r:1000,n:20},10,1).r, mg:[1,4,9,25,100].map(eloMargin), anchors:[0,5,10,15,20,25].map(eloAnchor)}));
ok(Math.abs(m.a-1064)<0.1,"ganar a Magister Magnus desde 1000: +64 (K 64) = "+m.a.toFixed(2));
ok(m.b>1000&&m.b<1004,"ganar a Discipulus (500) casi no suma: "+m.b.toFixed(2));
ok(m.c<945&&m.c>935,"perder contra Discipulus resta casi todo el K: "+m.c.toFixed(2));
ok(m.d>1010&&m.d<1020,"tablas contra Miles (1200) desde 1000 suma un poco: "+m.d.toFixed(2));
ok(m.e>1000&&m.e<1024,"con 20 duelos K=24: "+m.e.toFixed(2));
console.log("   margen n=1,4,9,25,100:",m.mg.join(", ")," anclas:",m.anchors.join(", "));
// 2) flujo real del duelo
await page.evaluate(()=>{ document.getElementById("duelo-variant").value="capablanca"; document.getElementById("duelo-color").value="w"; document.getElementById("duelo-level").value="0"; });
await page.evaluate(()=>dueloStart());await page.waitForTimeout(600);
const s1=await page.evaluate(()=>({act:!!retoActive,duelo:retoActive&&retoActive.duelo,lvl:retoActive&&retoActive.level,undo:document.getElementById("btn-undo").disabled,
 oracle:(document.getElementById("oracle-ask")||{}).disabled, box:document.getElementById("duelo-box").hidden,note:document.getElementById("reto-note").textContent.replace(/\n/g," | "),
 ab:!document.getElementById("reto-abandon").hidden, varLocked:document.getElementById("variant-clasica").disabled, vs:vsMachine, lv:machineLevel}));
ok(s1.act&&s1.duelo&&s1.lvl===0,"el duelo arranca con nivel 0: "+JSON.stringify([s1.act,s1.duelo,s1.lvl]));
ok(s1.undo,"Deshacer está bloqueado");ok(s1.box,"el bloque de duelo se oculta durante el duelo");ok(s1.ab,"aparece Abandonar");ok(s1.varLocked,"las modalidades están bloqueadas");
console.log("   Oraculum deshabilitado:",s1.oracle,"| nota:",s1.note);
// jugar una jugada y ver que claudIA responde
await page.evaluate(()=>{const lm=legalMoves(liveState());commitMove(lm[0])});
let resp=true;try{await page.waitForFunction(()=>game.sans.length>=2,null,{timeout:30000})}catch(e){resp=false}
ok(resp,"claudIA responde dentro del duelo");
// 3) abandonar => derrota y baja el Elo
await page.evaluate(()=>retoAbandon());await page.waitForTimeout(500);
const s2=await page.evaluate(()=>({act:retoActive,elo:eloLoad(),res:game.result,note:game.resultNote,box:document.getElementById("duelo-box").hidden,txt:document.getElementById("duelo-elo").textContent.slice(0,160),undo:document.getElementById("btn-undo").disabled}));
ok(!s2.act,"el duelo terminó");ok(s2.elo.capablanca&&s2.elo.capablanca.n===1&&s2.elo.capablanca.l===1,"queda 1 derrota en Capablanca: "+JSON.stringify(s2.elo.capablanca));
ok(s2.elo.capablanca.r<945,"abandonar contra Discipulus baja el Elo: "+(s2.elo.capablanca.r).toFixed(1));
ok(!s2.box,"el bloque de duelo vuelve");
console.log("   panel Elo:",s2.txt);
// 4) un duelo ganado por mate del humano contra nivel 0 (FEN de mate en 1 no es posible en inicio): comprobar finish con 'won'
await page.evaluate(()=>{retoActive={variant:"clasico",level:25,color:"w",ended:false,duelo:true};dueloFinish(retoActive,"won");retoActive=null;});
const s3=await page.evaluate(()=>eloLoad().clasico);
ok(s3&&Math.round(s3.r)===1064&&s3.w===1,"ganar a Magister Magnus en Clásico da 1064: "+(s3&&s3.r));
// 5) recarga: el duelo guardado se restaura
await page.evaluate(()=>{document.getElementById("duelo-variant").value="clasico";document.getElementById("duelo-level").value="5";dueloStart()});await page.waitForTimeout(400);
await page.reload({waitUntil:"load"});await page.waitForTimeout(1500);
const s4=await page.evaluate(()=>({act:!!retoActive,duelo:retoActive&&retoActive.duelo,lvl:retoActive&&retoActive.level}));
ok(s4.act&&s4.duelo&&s4.lvl===5,"tras recargar, el duelo sigue activo: "+JSON.stringify(s4));
console.log("errores de página:",errs.length,errs.slice(0,3));if(errs.length)fallos++;
await b.close();srv.close();console.log(fallos?"HAY FALLOS: "+fallos:"Todo bien");})();
