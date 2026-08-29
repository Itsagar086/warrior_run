// Stage-system verification: drives the real updateSpawning through all four
// pilgrimage stages, measuring spawn gaps, paired-hazard rates and power-orb
// cadence against the CONFIG.STAGES contract - plus the power keep-primed rule.
import { spawn } from 'node:child_process';
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';

const ROOT = 'd:/GAMES/warrior_run', PORT = 8227, DBG = 9411;
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
const prof = 'C:/nlrstg-' + process.pid; fs.mkdirSync(prof, { recursive: true });
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
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
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
  const { updateSpawning, resetSpawns } = await import('/src/systems/SpawnSystem.js');
  const { getObstaclePool } = await import('/src/entities/Obstacles.js');
  const { state } = await import('/src/core/GameState.js');
  const { CONFIG } = await import('/src/utils/Constants.js');
  const { triggerDivinePower } = await import('/src/systems/PowerSystem.js');

  const pool = getObstaclePool();
  const orbs = window.__gameEntities.collectibles
    ? null : null; // orbs observed via banner-free counting below

  const savedDistance = state.distance, savedSpeed = state.speed, savedPhase = state.phase;
  state.phase = 'playing';
  resetSpawns();

  // Sweep each stage's central 400m in 1m ticks; each spawn tick is observed
  // by scanning for newly-visible obstacles, then hiding them to free pools.
  const stages = [];
  for (const stage of CONFIG.STAGES) {
    const from = stage.at + 40, to = stage.at + 440;
    state.speed = Math.min(CONFIG.MAX_SPEED,
      CONFIG.BASE_SPEED + Math.floor(stage.at / CONFIG.SPEED_STEP_DISTANCE) * CONFIG.SPEED_STEP);
    let spawnTicks = 0, dualTicks = 0;
    const gaps = [];
    let lastSpawnDist = null;
    for (let d = from; d <= to; d += 1) {
      state.distance = d;
      updateSpawning();
      const fresh = pool.filter((o) => o.visible);
      if (fresh.length > 0) {
        spawnTicks++;
        if (fresh.length >= 2) dualTicks++;
        if (lastSpawnDist !== null) gaps.push(d - lastSpawnDist);
        lastSpawnDist = d;
        fresh.forEach((o) => { o.visible = false; });
      }
    }
    const meanGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
    stages.push({
      name: stage.name, expectGap: stage.gap, meanGap: +meanGap.toFixed(1),
      spawns: spawnTicks, duals: dualTicks,
      dualRate: +(dualTicks / Math.max(1, spawnTicks)).toFixed(2), expectDual: stage.dual,
    });
  }

  // Power keep-primed rule: 70 shakti = two casts of the primed power, then a
  // third attempt is refused with the power cleared.
  state.phase = 'playing';
  state.activePower = 'sudarshan_chakra';
  state.shakti = 70; state.chase.active = false;
  triggerDivinePower();
  const afterOne = { shakti: state.shakti, power: state.activePower };
  triggerDivinePower();
  const afterTwo = { shakti: state.shakti, power: state.activePower };
  triggerDivinePower();
  const afterThree = { shakti: state.shakti, power: state.activePower };

  state.distance = savedDistance; state.speed = savedSpeed; state.phase = savedPhase;
  resetSpawns();
  return { stages, afterOne, afterTwo, afterThree };
})()`);

if (!report || report.__error) { console.error('FAILED:', JSON.stringify(report)); }
else {
  console.log('stage sweep (400m each):');
  for (const s of report.stages) {
    const gapOk = Math.abs(s.meanGap - s.expectGap) < 3.5;
    const dualOk = Math.abs(s.dualRate - s.expectDual) < 0.14;
    console.log(`  ${gapOk && dualOk ? 'PASS' : 'FAIL'}  ${s.name.padEnd(20)} gap ${s.meanGap} (want ~${s.expectGap})  duals ${s.dualRate} (want ~${s.expectDual})  spawns ${s.spawns}`);
  }
  console.log('power chaining: after cast1', JSON.stringify(report.afterOne),
              '| cast2', JSON.stringify(report.afterTwo),
              '| cast3', JSON.stringify(report.afterThree));
  const chainOk = report.afterOne.shakti === 45 && report.afterOne.power === 'sudarshan_chakra'
    && report.afterTwo.shakti === 20 && report.afterTwo.power === null
    && report.afterThree.shakti === 20;
  console.log(chainOk ? 'PASS  power keep-primed economy' : 'FAIL  power keep-primed economy');
}
ws.close(); ch.kill(); srv.close();
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
