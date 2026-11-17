/* 2.349 · Guía «Analizar»: Oraculum + Judicium. Sale con ?tuto=analizar, cada paso ilumina su elemento sin que la tarjeta lo tape,
   el paso de «Llévalo a una IA» se salta mientras no hay análisis, y en Maharajá (sin Oraculum ni Judicium) se salta lo que no se ve. */
const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.join(__dirname,"..");
const srv=http.createServer((q,s)=>{const u=q.url.split("?")[0];const f=path.join(RAIZ,u==="/"?"index.html":u);if(!fs.existsSync(f)){s.writeHead(404);s.end();return}const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";s.writeHead(200,{"content-type":t});fs.createReadStream(f).pipe(s)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
(async()=>{await new Promise(r=>srv.listen(0,r));const base="http://127.0.0.1:"+srv.address().port+"/index.html";const b=await chromium.launch();
async function recorrer(vp,antes){const ctx=await b.newContext({viewport:vp,hasTouch:vp.width<500});const page=await ctx.newPage();const errs=[];page.on("pageerror",e=>errs.push(String(e)));page.on("dialog",d=>d.accept());
 await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());await page.goto(base+"?tuto=0");await page.waitForTimeout(1000);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const id of["intro","battle-intro"]){const e=document.getElementById(id);if(e)e.hidden=true}});
 if(antes)await antes(page);
 await page.evaluate(()=>window.tutorialStart("analizar"));await page.waitForTimeout(700);
 const vistos=[],malos=[];
 for(let k=0;k<9;k++){const e=await page.evaluate(()=>{const ab=!document.getElementById("tuto").hidden;const f=document.getElementById("tuto-foco").getBoundingClientRect(),c=document.getElementById("tuto-tarjeta").getBoundingClientRect();return{ab,t:document.getElementById("tuto-titulo").textContent,sin:document.getElementById("tuto-foco").classList.contains("sin"),f:{l:f.left,t:f.top,r:f.right,b:f.bottom},c:{l:c.left,t:c.top,r:c.right,b:c.bottom},vw:innerWidth,vh:innerHeight}});
  if(!e.ab)break;vistos.push(e.t);
  if(!e.sin){const solapa=!(e.c.r<e.f.l||e.c.l>e.f.r||e.c.b<e.f.t||e.c.t>e.f.b);if(solapa)malos.push(e.t+" tapa f="+JSON.stringify(e.f)+" c="+JSON.stringify(e.c));}
  if(e.c.l<0||e.c.r>e.vw||e.c.t<0||e.c.b>e.vh)malos.push(e.t+" fuera de pantalla");
  await page.click("#tuto-sigue");await page.waitForTimeout(2000);}
 const marcada=await page.evaluate(()=>localStorage.getItem("tablero-encantado.tutorial-analizar.v1"));
 await ctx.close();return{vistos,malos,errs,marcada};}
for(const [n,vp] of [["escritorio",{width:1280,height:800}],["teléfono",{width:412,height:915}]]){
 const r=await recorrer(vp);
 ok(r.vistos.length===6&&/Dos voces/.test(r.vistos[0])&&/Que el juicio/.test(r.vistos[5]),n+": recorre 6 pasos (salta «Llévalo a una IA» sin análisis) → "+r.vistos.join(" | "));
 ok(r.malos.length===0,n+": foco y tarjeta bien "+r.malos.join("; "));
 ok(r.marcada==="1",n+": al terminar queda marcada");
 ok(r.errs.length===0,n+": sin errores de JavaScript "+r.errs.slice(0,2));}
{const r=await recorrer({width:1280,height:800},async p=>{await p.evaluate(()=>{const b=document.getElementById("variant-maharaja");if(b)b.click()});await p.waitForTimeout(500)});
 ok(r.vistos.length===2&&!r.vistos.some(t=>/Oraculum|Judicium · /.test(t)),"Maharajá (sin Oraculum ni Judicium): solo bienvenida y cierre → "+r.vistos.join(" | "));ok(r.errs.length===0,"Maharajá: sin errores de JavaScript");}
await b.close();srv.close();console.log(fallos?"HAY FALLOS":"Todo bien");process.exit(fallos?1:0)})();
