/* 2.256 · Guía de inicio: sale con ?tuto=1, recorre los pasos, se salta, queda marcada y se repite desde La Armería. */
const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.join(__dirname,"..");
const srv=http.createServer((req,res)=>{const u=req.url.split("?")[0];const f=path.join(RAIZ,u==="/"?"index.html":u);if(!fs.existsSync(f)){res.writeHead(404);return res.end()}
const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";res.writeHead(200,{"Content-Type":t});fs.createReadStream(f).pipe(res)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
const SHOTS=process.env.TUTO_SHOTS||"";
(async()=>{await new Promise(r=>srv.listen(0,r));const base="http://127.0.0.1:"+srv.address().port+"/index.html";
const b=await chromium.launch();
async function abrir(vp,query){const ctx=await b.newContext({viewport:vp,deviceScaleFactor:1,hasTouch:vp.width<500});const page=await ctx.newPage();const errs=[];
 page.on("pageerror",e=>errs.push(String(e)));page.on("dialog",d=>d.accept());
 await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());
 await page.goto(base+(query||""),{waitUntil:"load"});await page.waitForTimeout(900);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const id of["intro","battle-intro"]){const e=document.getElementById(id);if(e)e.remove()}document.documentElement.classList.remove("intro-abierta")});
 return {page,errs,ctx};}
const estado=p=>p.evaluate(()=>({abierta:!document.getElementById("tuto").hidden,t:document.getElementById("tuto-titulo").textContent,foco:document.getElementById("tuto-foco").className,
  r:(()=>{const f=document.getElementById("tuto-foco").getBoundingClientRect();return{w:Math.round(f.width),h:Math.round(f.height),l:Math.round(f.left),t:Math.round(f.top)}})(),
  tarj:(()=>{const c=document.getElementById("tuto-tarjeta").getBoundingClientRect();return{l:c.left,t:c.top,r:c.right,b:c.bottom}})(),vw:innerWidth,vh:innerHeight,
  flag:localStorage.getItem("tablero-encantado.tutorial.v1")}));

// 1) en pruebas automáticas NO sale sola
{const {page,ctx}=await abrir({width:1280,height:800});await page.waitForTimeout(2600);
 ok(!(await estado(page)).abierta,"con navegador automatizado no se abre sola");await ctx.close();}

// 2) recorrido completo en escritorio
for(const [nombre,vp] of [["escritorio",{width:1280,height:800}],["telefono",{width:412,height:915}]]){
 const {page,errs,ctx}=await abrir(vp,"?tuto=1");
 await page.waitForFunction(()=>window.tutorialActive&&window.tutorialActive(),null,{timeout:8000}).catch(()=>{});
 await page.evaluate(()=>{}); await page.waitForTimeout(400);
 let e=await estado(page);ok(e.abierta&&/umbral/.test(e.t),nombre+": abre con la bienvenida → "+e.t);
 const vistos=[e.t];
 for(let k=0;k<6;k++){await page.click("#tuto-sigue");await page.waitForTimeout(1100);e=await estado(page);vistos.push(e.t);
  if(SHOTS) await page.screenshot({path:`${SHOTS}/tuto_${nombre}_${k+1}.png`});
  if(k>=0&&k<=4){ ok(!/sin/.test(e.foco)&&e.r.w>20&&e.r.h>10,nombre+": paso «"+e.t+"» ilumina su elemento ("+e.r.w+"×"+e.r.h+")");
   ok(e.tarj.l>=0&&e.tarj.r<=e.vw&&e.tarj.t>=0&&e.tarj.b<=e.vh,nombre+": la tarjeta cabe en pantalla");
   const solapa=!(e.tarj.r<e.r.l||e.tarj.l>e.r.l+e.r.w||e.tarj.b<e.r.t||e.tarj.t>e.r.t+e.r.h);
   ok(!solapa,nombre+": la tarjeta no tapa el elemento");}
  if(!e.abierta)break;}
 ok(/próxima batalla/.test(vistos[vistos.length-1]||"")||!e.abierta,nombre+": llega al final → "+vistos.join(" | "));
 if(e.abierta){await page.click("#tuto-sigue");await page.waitForTimeout(300);e=await estado(page);}
 ok(!e.abierta&&e.flag==="1",nombre+": al terminar se cierra y queda marcada");
 ok(errs.length===0,nombre+": sin errores de JavaScript "+errs.slice(0,2));await ctx.close();}

// 3) saltar, Esc y repetir
{const {page,ctx}=await abrir({width:1280,height:800},"?tuto=1");await page.waitForFunction(()=>window.tutorialActive&&window.tutorialActive(),null,{timeout:8000}).catch(()=>{});
 await page.waitForTimeout(300);await page.click("#tuto-saltar");await page.waitForTimeout(200);let e=await estado(page);
 ok(!e.abierta&&e.flag==="1","«Saltar» la cierra y la marca");
 await page.evaluate(()=>{const p=document.getElementById("panel-ajustes");if(typeof expandPanelExclusive==="function")expandPanelExclusive(p)});await page.waitForTimeout(600);
 await page.click("#tuto-repetir");await page.waitForTimeout(500);e=await estado(page);ok(e.abierta&&/umbral/.test(e.t),"el botón de La Armería la vuelve a abrir");
 await page.keyboard.press("ArrowRight");await page.waitForTimeout(900);e=await estado(page);ok(/1 ·/.test(e.t),"flecha derecha avanza → "+e.t);
 await page.keyboard.press("Escape");await page.waitForTimeout(200);e=await estado(page);ok(!e.abierta,"Esc la cierra");
 await ctx.close();}

// 4) tablero libre sin tocar: la guía pasa a «Jugar una partida»; con jugadas de estudio no pisa nada y se salta rival, reloj e Iniciar
{let r=await abrir({width:1280,height:800},"?tuto=1");let page=r.page;await page.waitForFunction(()=>window.tutorialActive&&window.tutorialActive(),null,{timeout:8000}).catch(()=>{});
 await page.waitForTimeout(300);
 const m0=await page.evaluate(()=>currentMode);
 const vistos=[];for(let k=0;k<8;k++){const e=await estado(page);if(!e.abierta)break;vistos.push(e.t);await page.click("#tuto-sigue");await page.waitForTimeout(1000);}
 const m1=await page.evaluate(()=>currentMode);
 ok(m0==="free"&&m1==="play","con el tablero sin tocar pasa de Libre a Jugar una partida ("+m0+" → "+m1+")");
 ok(["adversario","tiempo","comience"].every(w=>vistos.some(t=>t.includes(w))),"recorre rival, reloj e Iniciar → "+vistos.join(" | "));
 await r.ctx.close();
 r=await abrir({width:1280,height:800},"?tuto=1");page=r.page;await page.waitForFunction(()=>window.tutorialActive&&window.tutorialActive(),null,{timeout:8000}).catch(()=>{});
 await page.click("#tuto-saltar");await page.evaluate(()=>{game.ucis=["e2e4"]});
 await page.evaluate(()=>window.tutorialStart());await page.waitForTimeout(400);
 const v2=[];for(let k=0;k<8;k++){const e=await estado(page);if(!e.abierta)break;v2.push(e.t);await page.click("#tuto-sigue");await page.waitForTimeout(1000);}
 const m2=await page.evaluate(()=>currentMode);
 ok(m2==="free"&&!v2.some(t=>/adversario|tiempo|comience/.test(t)),"con jugadas de estudio no cambia de modo y salta esos pasos → "+v2.join(" | "));await r.ctx.close();}

// 5) guía de El Clan: con membresía recorre las secciones; sin sesión o sin ser miembro explica cómo entrar
async function clan(estadoClub,vp){const r=await abrir(vp||{width:1280,height:800});const page=r.page;
 await page.evaluate((e)=>{const pc=document.getElementById("panel-club"),ma=document.getElementById("club-member-area");
  if(e!=="sin-sesion"){pc.hidden=false;}
  if(e==="miembro"){ma.hidden=false;document.getElementById("club-joiner").hidden=true;}
  if(e==="aspirante"){document.getElementById("club-joiner").hidden=false;document.getElementById("club-join-form").hidden=false;}
 },estadoClub);
 await page.evaluate(()=>window.tutorialStart("clan"));await page.waitForTimeout(500);
 const vistos=[];let malos=[];
 for(let k=0;k<14;k++){const e=await estado(page);if(!e.abierta)break;vistos.push(e.t);
  if(/^(Cinco|Lanza|Dos formas|Un guante|Convocatorias|Torneos|La vitrina|El Elo|Tu nombre|La llave)/.test(e.t)){
   if(e.foco.includes("sin")||e.r.w<15||e.r.h<8)malos.push(e.t+" sin foco");
   if(!(e.tarj.l>=0&&e.tarj.r<=e.vw&&e.tarj.t>=0&&e.tarj.b<=e.vh))malos.push(e.t+" tarjeta fuera");
   if(!(e.tarj.r<e.r.l||e.tarj.l>e.r.l+e.r.w||e.tarj.b<e.r.t||e.tarj.t>e.r.t+e.r.h))malos.push(e.t+" tapa el elemento");}
  if(SHOTS&&vp)await page.screenshot({path:`${SHOTS}/clan_${estadoClub}_${k}.png`});
  await page.click("#tuto-sigue");await page.waitForTimeout(1600);}
 const e=await estado(page);const f=await page.evaluate(()=>localStorage.getItem("tablero-encantado.tutorial-clan.v1"));
 return {vistos,malos,cerrada:!e.abierta,flag:f,errs:r.errs,ctx:r.ctx};}
{const r=await clan("miembro");
 ok(r.vistos.length===10&&/guante llega/.test(r.vistos.join()),"miembro: 10 pantallas → "+r.vistos.join(" | "));
 ok(r.malos.length===0,"miembro: cada paso ilumina su elemento, la tarjeta cabe y no lo tapa "+r.malos.join("; "));
 ok(r.cerrada&&r.flag==="1","miembro: al terminar queda marcada la guía del Clan (y no la de inicio)");
 ok(r.errs.length===0,"miembro: sin errores de JavaScript "+r.errs.slice(0,2));await r.ctx.close();}
{const r=await clan("miembro",{width:412,height:915});
 ok(r.malos.length===0&&r.vistos.length===10,"miembro en teléfono: pasos correctos "+r.malos.join("; "));await r.ctx.close();}
{const r=await clan("aspirante");ok(r.vistos.length===3&&/llave/.test(r.vistos.join()),"aún no miembro: explica el código de invitación → "+r.vistos.join(" | "));ok(r.malos.length===0,"aspirante: foco y tarjeta bien "+r.malos.join("; "));await r.ctx.close();}
{const r=await clan("sin-sesion");ok(r.vistos.length===3&&/nombre/.test(r.vistos.join()),"sin sesión: explica la cuenta → "+r.vistos.join(" | "));ok(r.malos.length===0,"sin sesión: foco y tarjeta bien "+r.malos.join("; "));await r.ctx.close();}
// 6) el botón dentro de El Clan la abre
{const r=await abrir({width:1280,height:800});const page=r.page;await page.evaluate(()=>{document.getElementById("panel-club").hidden=false;document.getElementById("club-member-area").hidden=false;expandPanelExclusive(document.getElementById("panel-club"))});
 await page.waitForTimeout(700);await page.click("#tuto-repetir-clan2");await page.waitForTimeout(400);const e=await estado(page);ok(e.abierta&&/Las puertas del Clan/.test(e.t),"el botón de El Clan abre su guía → "+e.t);await r.ctx.close();}

// 7) sale sola la primera vez que un miembro abre El Clan (como usuario real, sin bandera de automatización), y no apila las guías
async function realista(inicioVista){const ctx=await b.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript((iv)=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});try{if(iv)localStorage.setItem("tablero-encantado.tutorial.v1","1");}catch(e){}},inicioVista);
 const page=await ctx.newPage();await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());
 await page.goto(base,{waitUntil:"load"});await page.waitForTimeout(900);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const id of["intro","battle-intro"]){const e=document.getElementById(id);if(e)e.remove()}document.documentElement.classList.remove("intro-abierta")});
 await page.waitForTimeout(2600);
 await page.evaluate(()=>{document.getElementById("panel-club").hidden=false;document.getElementById("club-member-area").hidden=false;document.getElementById("club-joiner").hidden=true;expandPanelExclusive(document.getElementById("panel-club"))});
 await page.waitForTimeout(2200);const e=await estado(page);await ctx.close();return e;}
{const e=await realista(true);ok(e.abierta&&/Las puertas del Clan/.test(e.t),"con la guía de inicio ya vista, al abrir El Clan sale su guía → "+e.t);}
{const e=await realista(false);ok(!e.abierta||!/Las puertas del Clan/.test(e.t),"si aún no vio la de inicio, no apila la del Clan → "+(e.abierta?e.t:"cerrada"));}

// 8) claudIA habla con su rostro y sus chispas azules en cada guía, y un aviso común no se las apaga
{const r=await abrir({width:1280,height:800},"?tuto=1");const page=r.page;await page.waitForFunction(()=>window.tutorialActive&&window.tutorialActive(),null,{timeout:8000}).catch(()=>{});
 await page.waitForTimeout(2500);
 let a=await page.evaluate(()=>{const im=document.getElementById("tuto-av");return{av:!!im&&!im.hidden&&im.naturalWidth>0,w:im?im.getBoundingClientRect().width:0,arcos:!!document.querySelector("#tuto-tarjeta .cl-arcs"),piezas:document.querySelectorAll("#tuto-tarjeta .cl-arcs .sp, #tuto-tarjeta .cl-arcs .dt").length}});
 ok(a.av&&a.w>=40,"la tarjeta muestra el rostro de claudIA ("+Math.round(a.w)+" px)");ok(a.arcos,"la tarjeta lleva su lienzo de arcos eléctricos");
 await page.evaluate(()=>showGlobalToast("Aviso de prueba",{voice:true,ms:1500}));await page.waitForTimeout(3200);
 a=await page.evaluate(()=>({arcos:!!document.querySelector("#tuto-tarjeta .cl-arcs"),piezas:document.querySelectorAll("#tuto-tarjeta .cl-arcs .sp, #tuto-tarjeta .cl-arcs .dt").length}));
 ok(a.arcos&&a.piezas>0,"tras un aviso de claudIA las chispas de la guía siguen vivas ("+a.piezas+" activas)");
 await page.click("#tuto-saltar");await page.waitForTimeout(200);
 ok(await page.evaluate(()=>!document.querySelector("#tuto-tarjeta .cl-arcs")),"al cerrar, las chispas se apagan");
 ok(r.errs.length===0,"sin errores de JavaScript "+r.errs.slice(0,2));await r.ctx.close();}

// 9) guía de La Batalla: con partida en marcha pausa el reloj y lo reanuda; sin partida no toca nada; en reto no se abre
async function batalla(preparar,vp){const r=await abrir(vp||{width:1280,height:800});const page=r.page;
 await page.evaluate(preparar);await page.waitForTimeout(300);
 const antes=await page.evaluate(()=>({p:matchPaused,s:matchStarted}));
 await page.evaluate(()=>window.tutorialStart("batalla"));await page.waitForTimeout(600);
 const e0=await estado(page);const durante=await page.evaluate(()=>matchPaused);
 const vistos=[],malos=[];
 for(let k=0;k<12;k++){const e=await estado(page);if(!e.abierta)break;vistos.push(e.t);
  if(!/^(Al pie|La batalla es)/.test(e.t)){
   if(e.foco.includes("sin")||e.r.w<15||e.r.h<8)malos.push(e.t+" sin foco");
   if(!(e.tarj.l>=0&&e.tarj.r<=e.vw&&e.tarj.t>=0&&e.tarj.b<=e.vh))malos.push(e.t+" tarjeta fuera");
   if(!(e.tarj.r<e.r.l||e.tarj.l>e.r.l+e.r.w||e.tarj.b<e.r.t||e.tarj.t>e.r.t+e.r.h))malos.push(e.t+" tapa el elemento");}
  if(SHOTS&&vp)await page.screenshot({path:`${SHOTS}/batalla_${k}.png`});
  await page.click("#tuto-sigue");await page.waitForTimeout(1600);}
 const despues=await page.evaluate(()=>({p:matchPaused,abierta:!document.getElementById("tuto").hidden,f:localStorage.getItem("tablero-encantado.tutorial-batalla.v1")}));
 return {antes,durante,e0,vistos,malos,despues,errs:r.errs,ctx:r.ctx,page};}
const PREP_JUEGO=()=>{setMode("play");matchStarted=true;matchPaused=false;render();};
{const r=await batalla(PREP_JUEGO);
 ok(r.durante===true,"con la partida en marcha, la guía pausa el reloj mientras habla");
 ok(r.despues.p===false&&!r.despues.abierta&&r.despues.f==="1","al cerrar, reanuda la partida y queda marcada");
 ok(r.vistos.length>=8&&["campo de batalla","Nombra","toca","tiempo","Atrás","crónica","tuya"].every(w=>r.vistos.join("|").toLowerCase().includes(w.toLowerCase())),"recorre sus pasos → "+r.vistos.join(" | "));
 ok(r.malos.length===0,"cada paso ilumina su elemento y la tarjeta cabe sin taparlo "+r.malos.join("; "));
 ok(r.errs.length===0,"sin errores de JavaScript "+r.errs.slice(0,2));await r.ctx.close();}
{const r=await batalla(PREP_JUEGO,{width:412,height:915});ok(r.malos.length===0&&r.vistos.length>=8,"en teléfono: pasos correctos "+r.malos.join("; "));await r.ctx.close();}
{const r=await batalla(()=>{setMode("play");render();});
 ok(r.antes.p===false&&r.durante===false&&r.despues.p===false,"sin partida en marcha no toca la pausa");
 const txt=await r.page.evaluate(()=>1);ok(!r.vistos.some(v=>/descansa/.test(v)),"y no promete detener un reloj que no corre");await r.ctx.close();}
{const r=await abrir({width:1280,height:800});const page=r.page;await page.evaluate(()=>{setMode("play");retoActive={variant:"clasico",level:10,color:"w",ended:false};});
 await page.evaluate(()=>window.tutorialStart("batalla"));await page.waitForTimeout(500);
 const e=await estado(page);const toast=await page.evaluate(()=>document.querySelector(".global-toast")&&document.querySelector(".global-toast").textContent);
 ok(!e.abierta&&/no admite pausas/.test(toast||""),"en un reto o duelo no se abre y claudIA lo explica → "+(toast||"").slice(0,50));await r.ctx.close();}

// 10) aviso suave la primera vez que se empieza una batalla
{const ctx=await b.newContext({viewport:{width:1280,height:800}});
 await ctx.addInitScript(()=>{Object.defineProperty(navigator,"webdriver",{get:()=>false});try{localStorage.setItem("tablero-encantado.tutorial.v1","1");}catch(e){}});
 const page=await ctx.newPage();await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());
 await page.goto(base,{waitUntil:"load"});await page.waitForTimeout(900);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const id of["intro","battle-intro"]){const e=document.getElementById(id);if(e)e.remove()}document.documentElement.classList.remove("intro-abierta");setMode("play");});
 await page.waitForTimeout(500);
 await page.evaluate(()=>{document.getElementById("match-start").click();matchStarted=true;matchPaused=false;render();});await page.waitForTimeout(3600);
 const t1=await page.evaluate(()=>[...document.querySelectorAll(".global-toast")].map(e=>e.textContent).join("|"));
 ok(/cómo se libra una batalla/.test(t1),"la primera batalla trae el ofrecimiento de claudIA → "+t1.slice(0,60));
 ok(await page.evaluate(()=>!!localStorage.getItem("tablero-encantado.tutorial-batalla-aviso.v1")&&!localStorage.getItem("tablero-encantado.tutorial-batalla.v1")),"se ofrece una sola vez y no marca la guía como vista");
 await ctx.close();}

await b.close();srv.close();console.log(fallos?"HAY FALLOS":"Todo bien");process.exit(fallos?1:0)})();
