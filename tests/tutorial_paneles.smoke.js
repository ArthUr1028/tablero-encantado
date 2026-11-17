/* 2.350 · Guías Grimorium, Scriptorium, Mandatum y Sanctuarium: cada una se abre, recorre sus pasos con foco y tarjeta bien puestos, se marca al terminar y no da errores.
   (antes: Guía «Analizar»: Oraculum + Judicium. Sale con ?tuto=analizar, cada paso ilumina su elemento sin que la tarjeta lo tape,
   el paso de «Llévalo a una IA» se salta mientras no hay análisis, y en Maharajá (sin Oraculum ni Judicium) se salta lo que no se ve. */
const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.join(__dirname,"..");
const srv=http.createServer((q,s)=>{const u=q.url.split("?")[0];const f=path.join(RAIZ,u==="/"?"index.html":u);if(!fs.existsSync(f)){s.writeHead(404);s.end();return}const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";s.writeHead(200,{"content-type":t});fs.createReadStream(f).pipe(s)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
(async()=>{await new Promise(r=>srv.listen(0,r));const base="http://127.0.0.1:"+srv.address().port+"/index.html";const b=await chromium.launch();
async function recorrer(vp,id){const ctx=await b.newContext({viewport:vp,hasTouch:vp.width<500});const page=await ctx.newPage();const errs=[];page.on("pageerror",e=>errs.push(String(e)));page.on("dialog",d=>d.accept());
 await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());await page.goto(base+"?tuto=0");await page.waitForTimeout(1000);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const i of["intro","battle-intro"]){const e=document.getElementById(i);if(e)e.hidden=true}});
 await page.evaluate(i=>window.tutorialStart(i),id);await page.waitForTimeout(700);
 const vistos=[],malos=[];
 for(let k=0;k<9;k++){const e=await page.evaluate(()=>{const ab=!document.getElementById("tuto").hidden;const f=document.getElementById("tuto-foco").getBoundingClientRect(),c=document.getElementById("tuto-tarjeta").getBoundingClientRect();return{ab,t:document.getElementById("tuto-titulo").textContent,sin:document.getElementById("tuto-foco").classList.contains("sin"),f:{l:f.left,t:f.top,r:f.right,b:f.bottom},c:{l:c.left,t:c.top,r:c.right,b:c.bottom},vw:innerWidth,vh:innerHeight}});
  if(!e.ab)break;vistos.push(e.t);
  if(!e.sin){const solapa=!(e.c.r<e.f.l||e.c.l>e.f.r||e.c.b<e.f.t||e.c.t>e.f.b);if(solapa)malos.push(e.t+" tapa f="+JSON.stringify(e.f)+" c="+JSON.stringify(e.c));}
  if(e.c.l<0||e.c.r>e.vw||e.c.t<0||e.c.b>e.vh)malos.push(e.t+" fuera de pantalla");
  await page.click("#tuto-sigue");await page.waitForTimeout(2000);}
 const marcada=await page.evaluate(i=>localStorage.getItem("tablero-encantado.tutorial-"+i+".v1"),id);
 const botones=await page.evaluate(i=>document.querySelectorAll('[data-tuto="'+i+'"]').length+document.querySelectorAll('#tuto-select option[value="'+i+'"]').length,id);
 await ctx.close();return{vistos,malos,errs,marcada,botones};}
const MIN={grimorio:6,scriptorium:5,mandatum:4,sanctuarium:4};
for(const id of Object.keys(MIN)){for(const [n,vp] of [["escritorio",{width:1280,height:800}],["teléfono",{width:412,height:915}]]){
 const r=await recorrer(vp,id);
 ok(r.vistos.length>=MIN[id]&&r.vistos.length<=MIN[id]+2,id+" "+n+": "+r.vistos.length+" pasos → "+r.vistos.join(" | "));
 ok(r.malos.length===0,id+" "+n+": foco y tarjeta bien "+r.malos.join("; "));
 ok(r.marcada==="1",id+" "+n+": al terminar queda marcada");
 ok(r.botones>=2,id+" "+n+": tiene botón en su panel y en La Armería ("+r.botones+")");
 ok(r.errs.length===0,id+" "+n+": sin errores de JavaScript "+r.errs.slice(0,2));}}
await b.close();srv.close();console.log(fallos?"HAY FALLOS":"Todo bien");process.exit(fallos?1:0)})();
