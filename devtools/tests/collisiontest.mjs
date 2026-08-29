// Collision fairness matrix: boots the real game, then exercises the SHIPPED
// resolveObstacleCollision against every obstacle type x player action,
// asserting who lives and who dies. This is the regression net for
// "I dodged it correctly and still lost a life".
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';

const ROOT = 'd:/GAMES/warrior_run', PORT = 8223, DBG = 9407;
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
const prof = 'C:/nlrcol-' + process.pid; fs.mkdirSync(prof, { recursive: true });
const ch = spawn(CHROME, ['--headless', '--remote-debugging-port=' + DBG, '--user-data-dir=' + prof,
  '--window-size=900,600', '--no-first-run', '--no-sandbox', '--use-angle=swiftshader',
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
let id = 0; const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
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

const report = await ev(`(async () => {
  const { resolveObstacleCollision } = await import('/src/systems/CollisionSystem.js');
  const { state } = await import('/src/core/GameState.js');
  const player = window.__gameEntities.player;

  // A fake hazard in the player's lane at the player's z - maximum contact.
  const fakeObs = (type, zone, extra = {}) => ({
    position: { x: player.position.x, z: player.position.z },
    visible: true,
    userData: Object.assign({ obstacleType: type, zone }, extra),
  });

  // Freeze a snapshot of everything the resolver mutates, restore per case.
  const FIELDS = ['lives','stumbleTimer','shieldTimer','playerY','playerVY',
                  'isGrounded','isSliding','canDoubleJump','groundY','standingOn',
                  'punya','phase','combo'];
  const snap = {}; for (const f of FIELDS) snap[f] = state[f];

  const cases = [
    // [name, type, zone, playerSetup, expectSurvive]
    ['firePit / run into it',      'firePit', 1, { playerY: 0,   isGrounded: true },  false],
    ['firePit / jump over',        'firePit', 1, { playerY: 0.6, isGrounded: false }, true],
    ['boulder / run into it',      'boulder', 2, { playerY: 0,   isGrounded: true },  false],
    ['boulder / land on top',      'boulder', 2, { playerY: 1.6, isGrounded: false, playerVY: -2 }, true],
    ['boulder / leap clean over',  'boulder', 2, { playerY: 1.7, isGrounded: false, playerVY: 3 },  true],
    ['archGate / run into beam',   'archGate', 2, { playerY: 0,  isGrounded: true },  false],
    ['archGate / slide under',     'archGate', 2, { playerY: 0,  isGrounded: true, isSliding: true }, true],
    ['archGate / jump into beam',  'archGate', 2, { playerY: 1.0, isGrounded: false }, false],
    ['evilSoul / run into it',     'evilSoul', 2, { playerY: 0,  isGrounded: true },  false],
    ['evilSoul / slide under',     'evilSoul', 2, { playerY: 0,  isGrounded: true, isSliding: true }, true],
    ['evilSoul / leap clean over', 'evilSoul', 2, { playerY: 2.1, isGrounded: false }, true],
    ['cobra / run into it',        'cobra', 2, { playerY: 0,    isGrounded: true },  false],
    ['cobra / jump over',          'cobra', 2, { playerY: 1.45, isGrounded: false }, true],
    ['cobra / slide INTO it',      'cobra', 2, { playerY: 0,    isGrounded: true, isSliding: true }, false],
    ['asura / run into it',        'asura', 2, { playerY: 0,    isGrounded: true },  false],
    ['asura / leap near apex',     'asura', 2, { playerY: 1.85, isGrounded: false }, true],
    ['asura / slide INTO it',      'asura', 2, { playerY: 0,    isGrounded: true, isSliding: true }, false],
    ['brokenRoad / walk into pit', 'brokenRoad', 2, { playerY: 0,   isGrounded: true },  false],
    ['brokenRoad / jump the gap',  'brokenRoad', 2, { playerY: 0.6, isGrounded: false }, true],
    ['adjacent lane, no contact',  'cobra', 2, { playerY: 0, isGrounded: true, laneOffset: 2.2 }, true],
  ];

  const rows = [];
  for (const [name, type, zone, setup, expectSurvive] of cases) {
    // clean slate: 3 lives, no i-frames, no shield, mid-run
    state.lives = 3; state.stumbleTimer = 0; state.shieldTimer = 0;
    state.phase = 'playing'; state.combo = 1;
    state.playerY = setup.playerY; state.playerVY = setup.playerVY || 0;
    state.isGrounded = !!setup.isGrounded; state.isSliding = !!setup.isSliding;
    state.standingOn = null; state.groundY = 0;

    const obs = fakeObs(type, zone, type === 'boulder' ? { standHeight: 1.8 } : {});
    if (setup.laneOffset) obs.position.x += setup.laneOffset;

    const outcome = resolveObstacleCollision(obs, type);
    const survived = state.lives === 3 && outcome !== 'end';
    const pass = survived === expectSurvive;
    rows.push({ name, outcome, lives: state.lives, survived, expectSurvive, pass });
  }
  for (const f of FIELDS) state[f] = snap[f];
  return rows;
})()`);

if (!Array.isArray(report)) { console.error('matrix failed:', JSON.stringify(report)); }
else {
  let failed = 0;
  for (const r of report) {
    if (!r.pass) failed++;
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(28)} outcome=${String(r.outcome).padEnd(5)} lives=${r.lives} survived=${r.survived} expected=${r.expectSurvive}`);
  }
  console.log(failed === 0 ? `\nALL ${report.length} CASES PASS` : `\n${failed} CASES FAILED`);
}
ws.close(); ch.kill(); srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
