// The Eternal Ascent, end to end on the live game:
//   run -> gates of Kailash -> WALK ETERNAL -> x2 punya -> deepen to x3 ->
//   league stages -> death -> eternal death card -> retry -> clean state ->
//   gates again -> ASCEND -> victory. Every arrow asserted.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';

const ROOT = 'd:/GAMES/warrior_run', PORT = 8231, DBG = 9415;
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
const prof = 'C:/nlret-' + process.pid; fs.mkdirSync(prof, { recursive: true });
const ch = spawn(CHROME, ['--headless', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof,
  '--window-size=1100,700', '--no-first-run', '--no-sandbox', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--mute-audio', '--disable-extensions',
  `http://127.0.0.1:${PORT}/index.html`], { stdio: 'ignore' });
let pg = null;
for (let i = 0; i < 100; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json();
    pg = l.find((t) => t.type === 'page' && t.url.includes(`:${PORT}/index.html`));
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
    errs.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0]);
};
const send = (me, pa = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method: me, params: pa })); return new Promise((r) => pend.set(i, r)); };
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return { __error: (r.result.exceptionDetails.exception?.description || '').split('\n')[0] };
  return r.result?.result?.value;
};
await send('Runtime.enable');
for (let i = 0; i < 60; i++) {
  if (await ev(`!!(window.__gameEntities && window.__gameEntities.player)`)) break;
  await new Promise((r) => setTimeout(r, 500));
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push([name, !!ok, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

// helper: wait until an in-page condition holds
const until = async (expr, tries = 40, ms = 250) => {
  for (let i = 0; i < tries; i++) {
    const v = await ev(expr);
    if (v === true) return true;
    await new Promise((r) => setTimeout(r, ms));
  }
  return false;
};

// ---- start a run
await ev(`window.__startGame(); true`);
check('run starts', await until(`window.__game.state.phase === 'playing'`));

// ---- walk to the gates (teleport to 1999, let the sim cross 2000 itself)
await ev(`window.__game.state.distance = 1999; true`);
check('gates: phase becomes ascension', await until(`window.__game.state.phase === 'ascension'`));
check('gates: overlay visible', await ev(
  `getComputedStyle(document.getElementById('ascension-overlay')).display !== 'none'`));

// ---- choose the Eternal Path
await ev(`document.getElementById('btn-eternal').click(); true`);
check('eternal: playing again', await until(`window.__game.state.phase === 'playing'`));
check('eternal: flag + x2 punya', await ev(
  `window.__game.state.eternal === true && window.__game.state.eternalMult === 2`));
check('eternal: overlay hidden', await until(
  `getComputedStyle(document.getElementById('ascension-overlay')).opacity === '0'
   || getComputedStyle(document.getElementById('ascension-overlay')).display === 'none'`));
check('eternal: no re-trigger at 2000+', await ev(
  `window.__game.state.phase === 'playing' && window.__game.state.distance >= 2000`));

// ---- deepen: cross 3000 -> x3
await ev(`window.__game.state.distance = 2999; true`);
check('deepen: x3 at 3000m', await until(`window.__game.state.eternalMult === 3`));

// ---- league stages beyond the table
const league = await ev(`(async () => {
  const { updateSpawning } = await import('/src/systems/SpawnSystem.js');
  const { state } = await import('/src/core/GameState.js');
  state.distance = 4210;
  updateSpawning();
  const banner = document.getElementById('hud-banner') || document.querySelector('[id*=banner]');
  return banner ? banner.textContent : '(no banner element)';
})()`);
check('league banner announces', String(league).includes('LEAGUE'), String(league).trim().slice(0, 44));

// ---- HUD label in eternal mode
const hud = await ev(`(() => {
  const els = [...document.querySelectorAll('div,span,b')];
  return els.some((e) => /PUNYA/.test(e.textContent) && /\\u00d7 ?3/.test(e.textContent))
      || [...els].some((e) => /\\d+m \\u00b7/.test(e.textContent));
})()`);
check('HUD shows eternal distance label', hud);

// ---- die on the eternal path
await ev(`(async () => {
  const { resolveObstacleCollision } = await import('/src/systems/CollisionSystem.js');
  const { state } = await import('/src/core/GameState.js');
  const player = window.__gameEntities.player;
  state.lives = 1; state.stumbleTimer = 0; state.shieldTimer = 0;
  state.playerY = 0; state.isGrounded = true; state.isSliding = false;
  resolveObstacleCollision({ position: { x: player.position.x, z: player.position.z },
    visible: true, userData: { obstacleType: 'asura', zone: 2 } }, 'asura');
  return true;
})()`);
check('eternal death: gameOver phase', await until(`window.__game.state.phase === 'gameOver'`));
const deathCard = await ev(`document.getElementById('game-over-overlay').textContent`);
check('eternal death card: Beyond Kailash', String(deathCard).includes('Beyond Kailash'),
      (String(deathCard).match(/Walked Beyond[^\\n]{0,30}/) || [''])[0]);

// ---- retry: everything resets
await ev(`document.getElementById('btn-restart').click(); true`);
check('retry: playing', await until(`window.__game.state.phase === 'playing'`));
check('retry: eternal state cleared', await ev(
  `window.__game.state.eternal === false && window.__game.state.eternalMult === 1
   && window.__game.state.distance < 5`));

// ---- second visit to the gates: ASCEND
await ev(`window.__game.state.distance = 1999; true`);
await until(`window.__game.state.phase === 'ascension'`);
await ev(`document.getElementById('btn-ascend').click(); true`);
check('ascend: victory phase', await until(`window.__game.state.phase === 'victory'`));
check('ascend: victory overlay visible', await ev(
  `getComputedStyle(document.getElementById('victory-overlay')).display !== 'none'`));

// ---- restart from victory
await ev(`document.getElementById('btn-vic-restart').click(); true`);
check('victory restart: clean run', await until(
  `window.__game.state.phase === 'playing' && window.__game.state.distance < 5`));

console.log('\npage exceptions during the whole flow:', errs.length ? errs.slice(0, 5).join(' | ') : '(none)');
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? `ALL ${results.length} CHECKS PASS` : `${failed} CHECKS FAILED`);
ws.close(); ch.kill(); srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
