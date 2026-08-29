// Actually start the game and let the real animation drive the new rig.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
const ROOT='d:/GAMES/warrior_run', PORT=8211, DBG=9395;
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.json':'application/json'};
const srv=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p,(e,b)=>{ if(e){r.writeHead(404);return r.end('');}
  r.writeHead(200,{'content-type':MIME[path.extname(p)]||'application/octet-stream'});r.end(b);});});
await new Promise((r,j)=>{srv.once('error',j);srv.listen(PORT,r);});
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>fs.existsSync(p));
const prof='C:/nlrrun-'+process.pid; fs.mkdirSync(prof,{recursive:true});
const ch=spawn(CHROME,['--headless','--remote-debugging-port='+DBG,'--user-data-dir='+prof,
 '--window-size=1280,760','--no-first-run','--no-sandbox','--use-angle=swiftshader',
 '--enable-unsafe-swiftshader','--mute-audio','--disable-extensions',
 `http://127.0.0.1:${PORT}/index.html`],{stdio:'ignore'});
let pg=null;
for(let i=0;i<100;i++){try{const l=await(await fetch(`http://127.0.0.1:${DBG}/json`)).json();
  pg=l.find(t=>t.type==='page'&&t.url.includes(`:${PORT}/index.html`)); if(pg)break;}catch{}
  await new Promise(r=>setTimeout(r,300));}
if(!pg){console.error('no page');process.exit(1);}
const ws=new WebSocket(pg.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
let id=0; const pend=new Map(); const errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
 if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
 if(m.method==='Runtime.exceptionThrown')errs.push('EXC '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text).split('\n')[0]);
 if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errs.push('ERR '+m.params.args.map(a=>a.value??a.description??'').join(' ').split('\n')[0]);};
const send=(me,pa={})=>{const i=++id;ws.send(JSON.stringify({id:i,method:me,params:pa}));return new Promise(r=>pend.set(i,r));};
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,awaitPromise:true,returnByValue:true});
 if(r.result?.exceptionDetails)return{__error:r.result.exceptionDetails.exception?.description?.split('\n')[0]};
 return r.result?.result?.value;};
await send('Runtime.enable');
for(let i=0;i<60;i++){ if(await ev(`!!(window.__gameEntities&&window.__gameEntities.player)`))break;
  await new Promise(r=>setTimeout(r,500)); }
console.log('phase before:', await ev(`window.__game.state.phase`));
console.log('start click:', await ev(`(()=>{const b=[...document.querySelectorAll('button')]
  .find(x=>/begin|start|pilgrim/i.test(x.textContent||'')); if(!b)return 'no button';
  b.click(); return b.textContent.trim().slice(0,40);})()`));
await new Promise(r=>setTimeout(r,6000));
console.log('phase after :', await ev(`window.__game.state.phase`));
console.log('sample:', JSON.stringify(await ev(`(()=>{const q=window.__gameEntities.player.userData.parts;
  return { distance: Math.round(window.__game.state.distance||0),
           torsoRotX:+q.torso.rotation.x.toFixed(3), torsoY:+q.torso.position.y.toFixed(3),
           lUpLegX:+q.leftUpperLeg.rotation.x.toFixed(3), rUpLegX:+q.rightUpperLeg.rotation.x.toFixed(3),
           lUpArmX:+q.leftUpperArm.rotation.x.toFixed(3), headY:+q.head.position.y.toFixed(3) };})()`)));
// REAL slide: trigger through the actual input path mid-run, then measure
// and photograph the live game frame.
// REAL slide, captured atomically: poll until we are inside the slide
// window, then render + read pixels + sample state in ONE evaluate, so the
// frame and the numbers describe the same instant.
await ev(`(() => { for (const t of ['keydown','keyup'])
  window.dispatchEvent(new KeyboardEvent(t, { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
  return true; })()`);
let slideGrab = null;
for (let i = 0; i < 30; i++) {
  slideGrab = await ev(`(() => {
    const g = window.__game, st = g.state;
    if (!st.isSliding || st.slideTimer > 0.5 || st.slideTimer < 0.12) return null;
    const q = window.__gameEntities.player.userData.parts;
    g.renderer.render(g.scene, g.camera);
    return { png: g.renderer.domElement.toDataURL('image/png'),
             isSliding: st.isSliding, slideTimer: +st.slideTimer.toFixed(2),
             torsoY: +q.torso.position.y.toFixed(3),
             thighY: +q.leftUpperLeg.position.y.toFixed(3),
             torsoRotX: +q.torso.rotation.x.toFixed(3) };
  })()`);
  if (slideGrab && slideGrab.png) break;
  await new Promise(r => setTimeout(r, 50));
}
if (slideGrab && slideGrab.png) {
  fs.writeFileSync('d:/GAMES/warrior_run/.img2threejs/renders/live-slide.png',
                   Buffer.from(slideGrab.png.split(',')[1], 'base64'));
  delete slideGrab.png;
  console.log('mid-slide:', JSON.stringify(slideGrab));
} else console.log('mid-slide: never caught the window');
// Game-time runs slower than wall-time under the software renderer (the
// 144Hz catch-up clamp turns heavy lag into slow motion), so poll for the
// slide to actually END rather than guessing a wall delay.
for (let i = 0; i < 120; i++) {
  const done = await ev(`!window.__game.state.isSliding`);
  if (done) break;
  await new Promise(r => setTimeout(r, 150));
}
await new Promise(r => setTimeout(r, 2500));   // let the drop ease back out
const runGrab = await ev(`(() => {
  const g = window.__game;
  const q = window.__gameEntities.player.userData.parts;
  g.renderer.render(g.scene, g.camera);
  return { png: g.renderer.domElement.toDataURL('image/png'), phase: g.state.phase,
           isSliding: g.state.isSliding, slideTimer: +g.state.slideTimer.toFixed(2),
           torsoY: +q.torso.position.y.toFixed(3), thighY: +q.leftUpperLeg.position.y.toFixed(3) };
})()`);
if (runGrab && runGrab.png) {
  fs.writeFileSync('d:/GAMES/warrior_run/.img2threejs/renders/live-run.png',
                   Buffer.from(runGrab.png.split(',')[1], 'base64'));
  delete runGrab.png;
  console.log('after slide :', JSON.stringify(runGrab));
}
console.log('errors:', errs.length ? errs.slice(0,6).join('\n') : '(none)');
ws.close(); ch.kill(); srv.close();
try{fs.rmSync(prof,{recursive:true,force:true});}catch{}
process.exit(0);
