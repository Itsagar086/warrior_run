// Boot the real game and interrogate the player: is the new model there, is it
// rigged into the names the animation drives, and does driving those names
// actually move the geometry?
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = 'd:/GAMES/warrior_run';
const PORT = 8207, DBG = 9391;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
               '.png': 'image/png', '.css': 'text/css' };
const missing = [];
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, buf) => {
    if (err) { if (!req.url.includes('favicon')) missing.push(req.url); res.writeHead(404); return res.end(''); }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(buf);
  });
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find((p) => fs.existsSync(p));
const profile = 'C:/nlrtest-' + process.pid;
fs.mkdirSync(profile, { recursive: true });
const chrome = spawn(CHROME, [
  '--headless', '--remote-debugging-port=' + DBG, '--user-data-dir=' + profile,
  '--window-size=1280,760', '--no-first-run', '--no-default-browser-check', '--no-sandbox',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio',
  '--disable-extensions', '--disable-sync', '--disable-background-networking',
  `http://127.0.0.1:${PORT}/index.html`,
], { stdio: 'ignore' });

let page = null;
for (let i = 0; i < 100; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
    page = list.find((t) => t.type === 'page' && t.url.includes(`:${PORT}/index.html`));
    if (page) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
if (!page) { console.error('FAIL: page target never appeared'); chrome.kill(); server.close(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pending = new Map(); const errs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown')
    errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errs.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
};
const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pending.set(i, r)); };
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description?.split('\n')[0] };
  return r.result?.result?.value;
};
await send('Runtime.enable');

let probe = null;
for (let i = 0; i < 60; i++) {
  probe = await ev(`(() => {
    const p = window.__gameEntities && window.__gameEntities.player;
    if (!p) return null;
    const parts = p.userData.parts || {};
    const need = ['torso','head','dust','leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm',
                  'leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'];
    let meshes = 0, tris = 0;
    p.traverse(o => { if (o.isMesh && o.geometry) { meshes++;
      const g = o.geometry; tris += g.index ? g.index.count/3 : (g.attributes.position ? g.attributes.position.count/3 : 0); } });
    const box = p.userData.bbox;
    return {
      found: true,
      missingParts: need.filter(n => !parts[n]),
      partTypes: need.map(n => n + ':' + (parts[n] ? parts[n].type : 'MISSING')).join(', '),
      meshes, tris: Math.round(tris),
      materials: (p.userData.bodyMaterials || []).length,
      bbox: box, rotY: +p.rotation.y.toFixed(3),
    };
  })()`);
  if (probe && probe.found) break;
  await new Promise((r) => setTimeout(r, 500));
}
console.log('--- player probe ---');
console.log(JSON.stringify(probe, null, 1));

// world extents + landmark check, and does driving a joint actually move a foot?
const geom = await ev(`(async () => {
  const T = await import('three');
  const p = window.__gameEntities.player;
  const parts = p.userData.parts;
  p.updateWorldMatrix(true, true);
  const box = new T.Box3().setFromObject(p);
  const wy = o => { const v = new T.Vector3(); o.getWorldPosition(v); return +v.y.toFixed(3); };
  const footBefore = new T.Vector3(); parts.leftFoot.getWorldPosition(footBefore);
  parts.leftUpperLeg.rotation.x = 1.0;
  p.updateWorldMatrix(true, true);
  const footAfter = new T.Vector3(); parts.leftFoot.getWorldPosition(footAfter);
  parts.leftUpperLeg.rotation.x = 0;
  p.updateWorldMatrix(true, true);
  return {
    min: box.min.toArray().map(v=>+v.toFixed(3)),
    max: box.max.toArray().map(v=>+v.toFixed(3)),
    hipY: wy(parts.torso), headY: wy(parts.head),
    leftFootY: wy(parts.leftFoot), rightFootY: wy(parts.rightFoot),
    footMovedBy: +footBefore.distanceTo(footAfter).toFixed(3),
    playerLocalPos: p.position.toArray().map(v=>+v.toFixed(3)),
    parentChain: (()=>{const c=[];for(let o=p.parent;o;o=o.parent)c.push(o.name||o.type);return c})(),
    parentY: p.parent ? +p.parent.position.y.toFixed(3) : null,
    groundTops: (()=>{const out=[];window.__game.scene.traverse(o=>{
      if(o.isMesh&&o.userData&&o.userData.role==='ground'){const b=new T.Box3().setFromObject(o);out.push(+b.max.y.toFixed(3));}});
      return out.slice(0,4)})()
  };
})()`);
console.log('--- geometry / rig response ---');
console.log(JSON.stringify(geom, null, 1));


// Park the game camera on the player and capture the real page pixels. CDP's
// screenshot grabs the compositor output, so it does not depend on the
// renderer keeping its drawing buffer.

// Every joint the animation drives must actually move geometry. A joint that
// got merged into its parent still exists as an object and still accepts a
// rotation - it just stops moving anything, silently.
const joints = await ev(`(async () => {
  const T = await import('three');
  const p = window.__gameEntities.player;
  const parts = p.userData.parts;
  let sm = null; p.traverse(o => { if (!sm && o.isSkinnedMesh) sm = o; });
  if (!sm) return { __error: 'no SkinnedMesh found' };
  const names = ['torso','head','leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm',
                 'leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'];
  const skIdx = sm.geometry.getAttribute('skinIndex');
  const skW = sm.geometry.getAttribute('skinWeight');
  const byObj = new Map(sm.skeleton.bones.map((b, i) => [b, i]));
  const out = {};
  for (const n of names) {
    const bone = parts[n];
    const bi = byObj.get(bone);
    if (bi === undefined) { out[n] = 'NOT A BONE'; continue; }
    let vi = -1;
    for (let i = 0; i < skIdx.count; i += 5) {
      if (skIdx.getX(i) === bi && skW.getX(i) > 0.85) { vi = i; break; }
    }
    if (vi < 0) { out[n] = 'NO VERTS'; continue; }
    p.updateWorldMatrix(true, true); sm.skeleton.update();
    const xform = (sm.applyBoneTransform || sm.boneTransform).bind(sm);
    const before = xform(vi, new T.Vector3());
    const keep = bone.rotation.x;
    bone.rotation.x = keep + 0.8;
    p.updateWorldMatrix(true, true); sm.skeleton.update();
    const after = xform(vi, new T.Vector3());
    bone.rotation.x = keep;
    p.updateWorldMatrix(true, true); sm.skeleton.update();
    out[n] = +before.distanceTo(after).toFixed(4);
  }
  return out;
})()`);
console.log('--- joint response (subtree centre moved per 0.8rad) ---');
console.log(JSON.stringify(joints, null, 1));
const dead = Object.entries(joints || {}).filter(([k, v]) => typeof v !== 'number' || v < 0.01);
console.log(dead.length ? 'FROZEN JOINTS: ' + JSON.stringify(dead) : 'all joints drive geometry');

await send('Page.enable');
// The start-screen overlay sits on top of the canvas; hide every non-canvas
// element so the screenshot shows the scene rather than the UI.
await ev(`(() => {
  for (const el of document.body.children) {
    if (el.tagName !== 'CANVAS') el.style.setProperty('display','none','important');
  }
  // Freeze the game loop, otherwise it re-renders with its own camera between
  // parking the camera and taking the screenshot.
  window.__rafOff = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  const p = window.__gameEntities.player;
  p.visible = true;
  // Hide the Vishnu shield aura: it is a direct-child Mesh of the player and
  // it is meant to be off unless the power is active.
  for (const c of p.children) if (c.isMesh) c.visible = false;
  return true;
})()`);
// Pose him mid-stride so the capture shows the rig working, not a T-stand.
await ev(`(() => {
  const q = window.__gameEntities.player.userData.parts;
  q.leftUpperLeg.rotation.x = 0.55;  q.rightUpperLeg.rotation.x = -0.5;
  q.leftLowerLeg.rotation.x = 0.15;  q.rightLowerLeg.rotation.x = 0.75;
  q.leftUpperArm.rotation.x = -0.55; q.rightUpperArm.rotation.x = 0.55;
  q.leftLowerArm.rotation.x = -0.7;  q.rightLowerArm.rotation.x = -0.6;
  q.leftFoot.rotation.x = 0.2;       q.rightFoot.rotation.x = -0.25;
  q.torso.rotation.x = 0.12;
  return true;
})()`);
for (const [name, az, h] of [['warmup', 180, 1.0], ['back', 180, 1.0], ['side', 90, 1.0], ['front', 0, 1.0]]) {
  const ok = await ev(`(async () => {
    const T = await import('three');
    const g = window.__game, p = window.__gameEntities.player;
    const a = ${az} * Math.PI / 180;
    const c = g.camera;
    c.position.set(p.position.x + Math.sin(a) * 2.6, p.position.y + ${h} + 0.9, p.position.z + Math.cos(a) * -2.6);
    c.lookAt(p.position.x, p.position.y + 1.05, p.position.z);
    c.updateProjectionMatrix();
    g.renderer.render(g.scene, c);
    g.renderer.render(g.scene, c);   // second pass: the compositor can screenshot a stale frame
    return true;
  })()`);
  if (ok !== true) { console.log('  camera park failed for', name, JSON.stringify(ok)); continue; }
  await new Promise(r => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const data = shot.result?.data;
  if (data) {
    fs.writeFileSync('d:/GAMES/warrior_run/.img2threejs/renders/ingame-' + name + '.png', Buffer.from(data, 'base64'));
    console.log('  captured', name);
  } else console.log('  no data for', name);
}

// jump-pose capture: the exact end-state animateJump eases into
await ev(`(() => { const q = window.__gameEntities.player.userData.parts;
  q.leftUpperArm.rotation.x = -0.55; q.rightUpperArm.rotation.x = -0.55;
  q.leftLowerArm.rotation.x = -0.35; q.rightLowerArm.rotation.x = -0.35;
  q.leftUpperArm.rotation.z = -0.7;  q.rightUpperArm.rotation.z = 0.7;
  q.leftUpperLeg.rotation.x = -0.85; q.rightUpperLeg.rotation.x = 0.35;
  q.leftLowerLeg.rotation.x = 0.75;  q.rightLowerLeg.rotation.x = 1.05;
  q.leftFoot.rotation.x = 0.35;      q.rightFoot.rotation.x = 0.45;
  q.torso.rotation.x = -0.08; q.torso.rotation.y = 0; q.torso.position.y = 1.05;
  q.leftUpperLeg.position.y = 1.05; q.rightUpperLeg.position.y = 1.05;
  return true; })()`);
{
  const ok = await ev(`(async () => { const T = await import('three');
    const g = window.__game, p = window.__gameEntities.player;
    const c = g.camera;
    c.position.set(p.position.x + 0.9, p.position.y + 2.1, p.position.z + 3.4);
    c.lookAt(p.position.x, p.position.y + 1.1, p.position.z);
    g.renderer.render(g.scene, c); g.renderer.render(g.scene, c); return true; })()`);
  await new Promise(r => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) { fs.writeFileSync('d:/GAMES/warrior_run/.img2threejs/renders/ingame-jump.png', Buffer.from(shot.result.data, 'base64')); console.log('  captured jump', ok === true); }
}
// slide-pose capture, including the hip drop that replaced the scale squash
await ev(`(() => { const q = window.__gameEntities.player.userData.parts;
  q.leftUpperLeg.rotation.x = -1.15; q.rightUpperLeg.rotation.x = -1.05;
  q.leftLowerLeg.rotation.x = 0.2;   q.rightLowerLeg.rotation.x = 0.25;
  q.leftUpperArm.rotation.x = 0.35;  q.rightUpperArm.rotation.x = 0.35;
  q.leftLowerArm.rotation.x = -0.25; q.rightLowerArm.rotation.x = -0.25;
  q.leftUpperArm.rotation.z = -0.55; q.rightUpperArm.rotation.z = 0.55;
  q.torso.rotation.x = -0.45;
  q.torso.position.y = 1.05 - 0.42;
  q.leftUpperLeg.position.y = 1.05 - 0.42; q.rightUpperLeg.position.y = 1.05 - 0.42;
  return true; })()`);
{
  await ev(`(async () => { const g = window.__game, p = window.__gameEntities.player;
    const c = g.camera;
    c.position.set(p.position.x + 1.2, p.position.y + 1.5, p.position.z + 3.2);
    c.lookAt(p.position.x, p.position.y + 0.7, p.position.z);
    g.renderer.render(g.scene, c); g.renderer.render(g.scene, c); return true; })()`);
  await new Promise(r => setTimeout(r, 250));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) { fs.writeFileSync('d:/GAMES/warrior_run/.img2threejs/renders/ingame-slide.png', Buffer.from(shot.result.data, 'base64')); console.log('  captured slide'); }
}
console.log('--- 404s (excluding favicon) ---');
console.log(missing.length ? missing.slice(0, 8).join('\n') : '(none)');
console.log('--- page errors ---');
console.log(errs.length ? errs.slice(0, 8).join('\n') : '(none)');

ws.close(); chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
