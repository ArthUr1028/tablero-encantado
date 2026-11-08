const fs=require("fs");
let chromium; try{({chromium}=require("playwright-core"))}catch(e){({chromium}=require("/opt/node-tools/node_modules/playwright-core"))}
const sym=fs.readFileSync(""+__dirname+"/icono-relieve-simbolo.txt","utf8");
const P=JSON.parse(process.argv[2]||"{}");
const sd=P.sd??6, ss=P.ss??12, dc=P.dc??1.15, sp=P.sp??.55, se=P.se??20, scale=P.scale??2.9, tx=P.tx??0, ty=P.ty??0, flip=P.flip??0;
const html=`<!doctype html><html><body style="margin:0;background:#000">
<svg id="s" xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
${sym}
<radialGradient id="bg" cx="50%" cy="50%" r="72%"><stop offset="0" stop-color="#17132a"/><stop offset=".7" stop-color="#120f20"/><stop offset="1" stop-color="#0c0a13"/></radialGradient>
<linearGradient id="oro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc98"/><stop offset=".55" stop-color="#dcb560"/><stop offset="1" stop-color="#b98c3c"/></linearGradient>
<filter id="rel" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
 <feGaussianBlur in="SourceAlpha" stdDeviation="${sd}" result="alto"/>
 <feDiffuseLighting in="alto" surfaceScale="${ss}" diffuseConstant="${dc}" lighting-color="#fff" result="difusa"><feDistantLight azimuth="225" elevation="58"/></feDiffuseLighting>
 <feComposite in="SourceGraphic" in2="difusa" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="cuerpo"/>
 <feSpecularLighting in="alto" surfaceScale="${ss}" specularConstant="${sp}" specularExponent="${se}" lighting-color="#fff" result="brillo"><feDistantLight azimuth="225" elevation="52"/></feSpecularLighting>
 <feComposite in="brillo" in2="SourceAlpha" operator="in" result="brillo2"/>
 <feComposite in="cuerpo" in2="brillo2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
</filter>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="9"/><feColorMatrix values="0 0 0 0 .91  0 0 0 0 .72  0 0 0 0 .3  0 0 0 .32 0"/></filter>
<filter id="glowr" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="sombra" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="5"/><feOffset dx="3" dy="6"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/></filter>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
<circle cx="256" cy="256" r="217" fill="none" stroke="#e0b95a" stroke-opacity=".5" stroke-width="12" filter="url(#glowr)"/><circle cx="256" cy="256" r="217" fill="none" stroke="#c79a45" stroke-width="6"/>
<g transform="translate(${256+tx} ${256+ty}) ${flip?'scale(-1 1)':''} translate(-256 -256)">
 <g transform="translate(256 256) scale(${scale}) translate(-50 -50)">
  <g filter="url(#glow)" style="color:#e0b95a"><use href="#glyph-knight" width="100" height="100"/></g>
  <g filter="url(#sombra)" style="color:#000"><use href="#glyph-knight" width="100" height="100"/></g>
  <g filter="url(#rel)" style="--piece-edge:#5b4220;color:#e6c26a"><use href="#glyph-knight" width="100" height="100"/></g>
 </g>
</g>
</svg></body></html>`;
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
await pg.setContent(html);await pg.waitForTimeout(300);
await pg.locator("#s").screenshot({path:process.argv[3]||"/tmp/logo_test.png"});await b.close();})();
