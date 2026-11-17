/* 2.352 · Los asīr (piezas esclavas de Asara) llevan la misma sombra que las demás piezas, con y sin relieve: el daño va en el dibujo, la sombra se añade después y el contenedor no emborrona la elipse del suelo. */
const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.join(__dirname,"..");
const srv=http.createServer((q,s)=>{const u=q.url.split("?")[0];const f=path.join(RAIZ,u==="/"?"index.html":u);if(!fs.existsSync(f)){s.writeHead(404);s.end();return}const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";s.writeHead(200,{"content-type":t});fs.createReadStream(f).pipe(s)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
(async()=>{await new Promise(r=>srv.listen(0,r));const b=await chromium.launch();const p=await b.newPage({viewport:{width:430,height:900}});const errs=[];p.on("pageerror",e=>errs.push(String(e)));
await p.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());await p.addInitScript(()=>{window.__noBattleIntro=true;try{localStorage.clear()}catch(e){}});
await p.goto("http://127.0.0.1:"+srv.address().port+"/index.html?intro=0&tuto=0");await p.waitForTimeout(1500);
await p.evaluate(()=>{document.documentElement.classList.remove("intro-abierta");document.dispatchEvent(new MouseEvent("click",{bubbles:true}))});
await p.evaluate(()=>{setMode("play");newGame("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR[] w KQkq - 0 1 zh",{white:"Yo",black:"Rival",result:"",resultNote:""});vsMachine=false;matchStarted=true;matchPaused=false;render();});await p.waitForTimeout(800);
for(const rel of [false,true]){
 await p.evaluate(r=>{document.body.classList.toggle("relieve",r);const ps=[...document.querySelectorAll("#board .piece")];ps.forEach(e=>e.classList.remove("slave","dm0","dm1","dm2"));[1,3,26,28].forEach((i,k)=>ps[i].classList.add("slave","dm"+(k%3)))},rel);await p.waitForTimeout(400);
 const r=await p.evaluate(()=>[...document.querySelectorAll("#board .piece.slave")].map(e=>{const sv=e.querySelector("svg");return{cls:e.className,cont:getComputedStyle(e).filter,svg:getComputedStyle(sv).filter,ell:getComputedStyle(e,"::before").backgroundImage.indexOf("radial-gradient")>=0}}));
 const n=rel?"con relieve":"sin relieve";
 ok(r.length===4&&r.every(x=>/slave-dmg/.test(x.svg)&&/drop-shadow\(rgba\(0, 0, 0, 0\.65\)/.test(x.svg)),n+": el daño va en el dibujo y la sombra se añade después ("+r.length+" asīr)");
 ok(r.every(x=>!/slave-dmg/.test(x.cont)),n+": el contenedor no lleva el filtro de daño (no emborrona la elipse)");
 ok(r.every(x=>x.ell),n+": cada asīr conserva su elipse de sombra en el suelo");
 if(rel)ok(r.every(x=>/relieve-pieza/.test(x.cont)),"con relieve: el contenedor lleva el relieve, igual que las demás piezas");}
ok(errs.length===0,"sin errores de JavaScript "+errs.slice(0,2));
await b.close();srv.close();console.log(fallos?"HAY FALLOS":"Todo bien");process.exit(fallos?1:0)})();
