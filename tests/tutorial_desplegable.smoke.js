/* 2.351 · El desplegable de guías de La Armería: lista las nueve, cada una abre su guía al instante, el desplegable vuelve a «Elige una guía…» y en inglés se traduce. */
const http=require("http"),fs=require("fs"),path=require("path");
let chromium;try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const RAIZ=path.join(__dirname,"..");
const srv=http.createServer((q,s)=>{const u=q.url.split("?")[0];const f=path.join(RAIZ,u==="/"?"index.html":u);if(!fs.existsSync(f)){s.writeHead(404);s.end();return}const t=f.endsWith(".js")?"application/javascript":f.endsWith(".wasm")?"application/wasm":f.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream";s.writeHead(200,{"content-type":t});fs.createReadStream(f).pipe(s)});
let fallos=0;const ok=(c,m)=>{console.log((c?"  ok   ":"  FALLA ")+m);if(!c)fallos++};
const ESPERA={inicio:/umbral/,batalla:/Al pie del campo/,clan:/puertas del Clan/,analizar:/Dos voces/,grimorio:/libro de los maestros/,scriptorium:/archivo del Tablero/,mandatum:/misión encomendada/,sanctuarium:/templo de los maestros/,armeria:/Entre armas/};
(async()=>{await new Promise(r=>srv.listen(0,r));const base="http://127.0.0.1:"+srv.address().port+"/index.html";const b=await chromium.launch();
async function abrir(vp,idioma){const ctx=await b.newContext({viewport:vp,hasTouch:vp.width<500});const page=await ctx.newPage();const errs=[];page.on("pageerror",e=>errs.push(String(e)));page.on("dialog",d=>d.accept());
 await page.addInitScript(l=>{try{if(l)localStorage.setItem("tablero-encantado.idioma.v1",l)}catch(e){}},idioma||"");
 await page.route(/^(?!http:\/\/127\.0\.0\.1).*/,r=>r.abort());await page.goto(base+"?tuto=0");await page.waitForTimeout(1200);
 await page.evaluate(()=>{const s=document.getElementById("intro-saltar");if(s)s.click();for(const i of["intro","battle-intro"]){const e=document.getElementById(i);if(e)e.hidden=true}});return{page,ctx,errs};}
for(const [n,vp] of [["escritorio",{width:1280,height:800}],["teléfono",{width:412,height:915}]]){
 const {page,ctx,errs}=await abrir(vp);
 await page.evaluate(()=>{const p=document.getElementById("panel-ajustes");if(p.classList.contains("collapsed"))p.querySelector("h2").click()});await page.waitForTimeout(600);
 const vals=await page.evaluate(()=>[...document.querySelectorAll("#tuto-select option")].map(o=>o.value));
 ok(vals.length===10&&vals[0]===""&&Object.keys(ESPERA).every(k=>vals.includes(k)),n+": el desplegable lista las nueve guías → "+vals.join(","));
 ok(await page.evaluate(()=>document.querySelectorAll("#aj-guia button").length)===0,n+": ya no hay botones sueltos de guías en La Armería");
 for(const k of Object.keys(ESPERA)){
  await page.selectOption("#tuto-select",k);await page.waitForTimeout(900);
  const e=await page.evaluate(()=>({ab:!document.getElementById("tuto").hidden,t:document.getElementById("tuto-titulo").textContent,v:document.getElementById("tuto-select").value}));
  ok(e.ab&&ESPERA[k].test(e.t),n+": «"+k+"» abre su guía → "+e.t);ok(e.v==="",n+": «"+k+"» deja el desplegable en «Elige una guía…»");
  await page.keyboard.press("Escape");await page.waitForTimeout(300);
  if(await page.evaluate(()=>!document.getElementById("tuto").hidden)){ok(false,n+": Esc no cerró la guía "+k);break;}}
 ok(errs.length===0,n+": sin errores de JavaScript "+errs.slice(0,2));await ctx.close();}
{const {page,ctx}=await abrir({width:1280,height:800},"en");await page.waitForTimeout(600);
 const en=await page.evaluate(()=>({o:[...document.querySelectorAll("#tuto-select option")].map(o=>o.textContent),g:[...document.querySelectorAll("#tuto-select optgroup")].map(o=>o.label)}));
 ok(en.o.includes("The Grimorium")&&en.o.includes("Pick a guide…")&&en.g.includes("Combat"),"inglés: opciones y grupos traducidos → "+en.o.join(" | ")+" || "+en.g.join(" | "));await ctx.close();}
await b.close();srv.close();console.log(fallos?"HAY FALLOS":"Todo bien");process.exit(fallos?1:0)})();
