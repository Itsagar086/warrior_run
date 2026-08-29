// Fast art-direction loop: render the player alone, big, from three angles.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';

const ROOT = 'd:/GAMES/warrior_run', PORT = 8219, DBG = 9401;
const WHOQ = process.argv[2] ? ('?who=' + process.argv[2]) : '';
const TAG = process.argv[2] ? (process.argv[2] + '-') : '';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const srv = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(p, (e, b) => {
    if (e) { r.writeHead(404); return r.end(''); }
    r.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
    r.end(b);
  });
});
await new Promise((r, j) => { srv.once('error', j); srv.listen(PORT, r); });

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
                'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const prof = 'C:/nlrprev-' + process.pid; fs.mkdirSync(prof, { recursive: true });
const ch = spawn(CHROME, ['--headless', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof,
  '--window-size=700,1000', '--no-first-run', '--no-sandbox', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--mute-audio', '--disable-extensions',
  `http://127.0.0.1:${PORT}/devtools/player-preview.html${WHOQ}`], { stdio: 'ignore' });

let pg = null;
for (let i = 0; i < 100; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
    pg = l.find((t) => t.type === 'page' && t.url.includes('player-preview'));
    if (pg) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
if (!pg) { console.error('no page'); process.exit(1); }
const ws = new WebSocket(pg.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown')
    errs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errs.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n')[0]);
};
const send = (me, pa = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: me, params: pa })); return new Promise((r) => pend.set(i, r)); };
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.exception?.description?.split('\n')[0] };
  return r.result?.result?.value;
};
await send('Runtime.enable');

let info = null;
for (let i = 0; i < 60; i++) {
  info = await ev(`window.__preview ? {m:window.__preview.meshes,t:window.__preview.triangles} : null`);
  if (info) break;
  await new Promise((r) => setTimeout(r, 400));
}
if (!info) { console.error('preview never became ready:'); console.error(errs.join('\n') || '(no errors captured)'); ch.kill(); srv.close(); process.exit(1); }
console.log('meshes', info.m, ' triangles', info.t);

const bones = await ev(`(async () => {
  const T = await import('three');
  const p = window.__previewPlayer;
  const n = p.userData.nodes;
  p.updateWorldMatrix(true, true);
  const v = new T.Vector3();
  return ['pelvis','chest','neck','head','clavicle-l','upper-arm-l','forearm-l','hand-l',
          'thigh-l','shin-l','foot-l'].map(id => {
    const o = n[id];
    if (!o) return [id, null, null, null];
    o.getWorldPosition(v);
    return [id, +v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
  });
})()`);
console.log('--- skeleton, world space ---');
for (const b of (Array.isArray(bones) ? bones : [])) console.log('  ' + String(b[0]).padEnd(13), 'x', b[1], ' y', b[2], ' z', b[3]);

const OUT = ROOT + '/.img2threejs/renders';
for (const [name, az, h, d] of [['back', 180, 1.05, 4.6], ['side', 90, 1.05, 4.6], ['front', 0, 1.05, 4.6]]) {
  const data = await ev(`window.__preview.shot(${az}, ${h}, ${d})`);
  if (typeof data === 'string') {
    fs.writeFileSync(`${OUT}/prev-${TAG}${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  } else console.log('shot failed', name, JSON.stringify(data));
}
await ev('window.__preview.pose && window.__preview.pose(); true');
for (const [name, az] of [['posed-back', 180], ['posed-side', 90]]) {
  const data = await ev(`window.__preview.shot(${az}, 1.05, 4.6)`);
  if (typeof data === 'string') fs.writeFileSync(`${OUT}/prev-${TAG}${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
console.log('errors:', errs.length ? errs.slice(0, 5).join('\n') : '(none)');
ws.close(); ch.kill(); srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
