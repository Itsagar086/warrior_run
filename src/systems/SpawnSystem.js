// What appears on the path and when: the obstacle spawn table with its
// distance gates and forced intervals, the collectible stream, and the
// per-frame scrolling and despawning of everything spawned.
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import {
  makeOmGlyph, makeRudrakshaBead,
  makeChakraPickup, makeTrishulPickup, makeShieldPickup,
  updateOmGlyph, updateRudraksha, updatePowerPickup
} from '../entities/Collectibles.js';
import { getObstaclePool, updateBoulder, updateFirePit } from '../entities/Obstacles.js';
import { updateCobra } from '../entities/CobraSnake.js';
import { getPlayer } from '../entities/Player.js';
import { updateAsura } from '../entities/AsuraDemon.js';
import { updateEvilSoul } from '../entities/EvilSoul.js';
import { resolveNagaChase } from '../entities/NagaChaser.js';
import { resolveObstacleCollision } from './CollisionSystem.js';
import { collectOm, collectRudraksha } from './ScoreSystem.js';
import { collectPowerOrb } from './PowerSystem.js';
import { showBanner } from '../ui/HUD.js';
import { setStageMood } from '../environment/Lighting.js';

// Which pilgrimage stage the run is in; -1 so the first tick announces
// stage I. Stages come from CONFIG.STAGES and drive spawn gap, paired
// hazards, forced-interval pressure and power-orb cadence.
let stageIdx = -1;
const STAGE_NUMERALS = ['I', 'II', 'III', 'IV'];

function currentStage() {
  // Beyond Kailash the table ends and the path deepens forever: every 500m is
  // a new unnamed league - tighter gaps, more paired hazards, faster orbs -
  // easing toward hard floors so it stays brutal but never impossible.
  if (state.eternal && state.distance >= CONFIG.KAILASH_DISTANCE) {
    const k = Math.floor((state.distance - CONFIG.KAILASH_DISTANCE) / 500) + 1;
    return {
      at: CONFIG.KAILASH_DISTANCE + (k - 1) * 500,
      name: `THE ETERNAL PATH \u00b7 LEAGUE ${k}`,
      moodIndex: 4,
      gap: Math.max(10.5, 12.0 - k * 0.25),
      dual: Math.min(0.5, 0.42 + k * 0.02),
      pressure: Math.max(0.5, 0.62 - k * 0.02),
      orbEvery: Math.max(44, 50 - k),
      arcChance: 0.14,
      crossBonus: 200,
    };
  }
  const stages = CONFIG.STAGES;
  let s = stages[0];
  for (const stage of stages) if (state.distance >= stage.at) s = stage;
  return s;
}

let nextObstacleDist = 20;
let nextCollectibleDist = 8;
let nextPowerOrbDist = 80;
let lastAsuraDist = 0;
let lastBrokenRoadDist = 0;
let lastEvilSoulDist = 0;
let lastCobraDist = 0;

const omPool = [];
const rudrakshaPool = [];
const powerOrbPool = [];

let clock = null;

export function initSpawnSystem(scene, gameClock) {
  clock = gameClock;

  for (let i = 0; i < 18; i++) {
    const om = makeOmGlyph();
    om.visible = false;
    scene.add(om);
    omPool.push(om);
    window.__gameEntities.registerCollectible(om);
  }

  // Beads come in arcs of up to five, and an arc stays on screen a long time,
  // so the pool has to hold two full arcs plus slack.
  for (let i = 0; i < 12; i++) {
    const r = makeRudrakshaBead();
    r.visible = false;
    scene.add(r);
    rudrakshaPool.push(r);
    window.__gameEntities.registerCollectible(r);
  }

  // One pool holding all three power pickups; each carries the power it grants.
  [makeChakraPickup, makeTrishulPickup, makeShieldPickup].forEach(build => {
    for (let i = 0; i < 2; i++) {
      const pickup = build();
      pickup.visible = false;
      pickup.userData.baseY = 1.2;
      scene.add(pickup);
      powerOrbPool.push(pickup);
      window.__gameEntities.registerCollectible(pickup);
    }
  });
}

export function spawnObstacleAt(z, excludeLane = null) {
  const dist = state.distance;
  const stage = currentStage();
  const eligibleTypes = ['firePit', 'archGate', 'boulder'];

  if (dist >= 150) eligibleTypes.push('evilSoul');
  if (dist >= 200) eligibleTypes.push('asura');
  if (dist >= 250) eligibleTypes.push('cobra');
  if (dist >= 300) eligibleTypes.push('brokenRoad');

  // Forced intervals guarantee the signature hazards keep appearing; the
  // stage's pressure factor shortens every interval as the pilgrimage climbs.
  const p = stage.pressure;
  let chosenType = null;
  if (dist >= 200 && (dist - lastAsuraDist) >= 140 * p) {
    chosenType = 'asura';
  } else if (dist >= 300 && (dist - lastBrokenRoadDist) >= 250 * p) {
    chosenType = 'brokenRoad';
  } else if (dist >= 150 && (dist - lastEvilSoulDist) >= 150 * p) {
    chosenType = 'evilSoul';
  } else if (dist >= 250 && (dist - lastCobraDist) >= 180 * p) {
    chosenType = 'cobra';
  } else {
    chosenType = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];
  }

  const obstaclePool = getObstaclePool();
  let freeObs = obstaclePool.find(o => !o.visible && o.userData.obstacleType === chosenType);
  if (!freeObs) {
    freeObs = obstaclePool.find(o => !o.visible && eligibleTypes.includes(o.userData.obstacleType));
  }
  if (!freeObs) return;

  const type = freeObs.userData.obstacleType;
  if (type === 'asura') lastAsuraDist = dist;
  if (type === 'brokenRoad') lastBrokenRoadDist = dist;
  if (type === 'evilSoul') lastEvilSoulDist = dist;
  if (type === 'cobra') lastCobraDist = dist;

  let chosenLane = Math.floor(Math.random() * 3);
  if (excludeLane !== null && chosenLane === excludeLane) {
    chosenLane = (chosenLane + 1 + Math.floor(Math.random() * 2)) % 3;
  }
  const laneX = CONFIG.LANES[chosenLane];

  freeObs.position.set(laneX, CONFIG.SURFACE_Y, z);
  freeObs.visible = true;
  if (type === 'evilSoul') {
    freeObs.userData.soulBaseX = laneX;
    // Per-instance phase, so two souls on screen do not drift in lockstep
    freeObs.userData.soulPhase = Math.random() * Math.PI * 2;
  }
  return chosenLane;
}

// Beads arrive in a curved run of 3-5 rather than singly. Two shapes: a sweep
// that carries the devotee from one lane to another, and a jump arc that peaks
// where he would be at the top of a jump - both reward committing to a line.
function spawnRudrakshaArc(z) {
  const count = 3 + Math.floor(Math.random() * 3);   // 3, 4 or 5
  const free = rudrakshaPool.filter(r => !r.visible);
  if (free.length < count) return false;

  const sweep = Math.random() < 0.5;
  const fromLane = Math.floor(Math.random() * 3);
  const toLane = sweep
    ? (fromLane + (Math.random() < 0.5 ? 1 : 2)) % 3
    : fromLane;
  const spacing = 2.4;

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    // Ease the lateral move so the line curves instead of stepping across
    const curve = 0.5 - Math.cos(t * Math.PI) * 0.5;
    const x = CONFIG.LANES[fromLane] + (CONFIG.LANES[toLane] - CONFIG.LANES[fromLane]) * curve;
    // The jump arc lifts through the middle; the sweep stays at running height
    const y = sweep ? 1.1 : 1.1 + Math.sin(t * Math.PI) * 1.15;

    const bead = free[i];
    bead.userData.baseY = y;
    bead.position.set(x, y, z - i * spacing);
    bead.visible = true;
  }
  return true;
}

export function spawnCollectibleAt(z) {
  // Bead arcs get more frequent as the path gets crueller - later stages pay
  // better, which is what makes pushing deep feel worth the risk.
  const stage = currentStage();
  const tableIdx = CONFIG.STAGES.indexOf(stage);
  const arcChance = stage.arcChance !== undefined
    ? stage.arcChance
    : 0.05 + Math.max(0, tableIdx) * 0.025;
  if (Math.random() < arcChance && spawnRudrakshaArc(z)) {
    return;
  }

  // Standard Om Glyph line
  const freeOm = omPool.find(o => !o.visible);
  if (freeOm) {
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOm.position.set(laneX, 0.9, z);
    freeOm.visible = true;
  }
}

export const POWER_CYCLE = ['sudarshan_chakra', 'trishul', 'vishnu_shield'];

function spawnPowerOrbAt(z) {
  // Cycle which power is offered, so a run hands out all three in turn rather
  // than leaving it to chance.
  const wanted = POWER_CYCLE[state.powerCycleIndex % POWER_CYCLE.length];
  let freeOrb = powerOrbPool.find(o => !o.visible && o.userData.power === wanted);
  if (!freeOrb) freeOrb = powerOrbPool.find(o => !o.visible);
  if (freeOrb) {
    state.powerCycleIndex++;
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOrb.userData.baseY = 1.2;
    freeOrb.position.set(laneX, 1.2, z);
    freeOrb.visible = true;
  }
}

// Distance-driven spawn triggers.
export function updateSpawning() {
  const stage = currentStage();

  // Announce each stage as it begins: banner, lighting mood, and - for every
  // stage after the first - a punya reward for having walked this far.
  if (stage.at !== stageIdx) {
    const first = stageIdx === -1;
    stageIdx = stage.at;
    const tableIdx = CONFIG.STAGES.indexOf(stage);
    const numeral = tableIdx >= 0 ? STAGE_NUMERALS[tableIdx] : '\u221e';
    showBanner(`\u26f0\ufe0f ${numeral} \u00b7 ${stage.name}`, 2.6);
    setStageMood(stage.moodIndex !== undefined ? stage.moodIndex : Math.max(0, tableIdx));
    if (!first) {
      const bonus = (stage.crossBonus || 150 * Math.max(1, tableIdx)) * state.eternalMult;
      state.punya += bonus;
    }
  }

  // Spawn Obstacles & Pickups based on distance traveled
  if (state.distance >= nextObstacleDist) {
    const usedLane = spawnObstacleAt(CONFIG.SPAWN_Z);
    // Paired hazards: a second one in a DIFFERENT lane at the same depth.
    // Two of three lanes blocked always leaves a clean lane - plus the jump
    // or slide answer on the blocked ones - so pairs raise pressure without
    // ever being unfair.
    if (usedLane !== null && usedLane !== undefined && Math.random() < stage.dual) {
      spawnObstacleAt(CONFIG.SPAWN_Z, usedLane);
    }
    nextObstacleDist = state.distance + Math.max(10.0, stage.gap - (state.speed - CONFIG.BASE_SPEED) * 0.15);
  }
  if (state.distance >= nextCollectibleDist) {
    spawnCollectibleAt(CONFIG.SPAWN_Z - 2);
    nextCollectibleDist = state.distance + 8.5;
  }
  if (state.distance >= nextPowerOrbDist) {
    spawnPowerOrbAt(CONFIG.SPAWN_Z - 4);
    nextPowerOrbDist = state.distance + stage.orbEvery;
  }
}

// Moves every live hazard, resolves contact, and recycles what goes past.
// Returns early when a hazard ends the run.
export function updateObstacles(dt, scrollDelta) {
  const obstaclePool = getObstaclePool();
  for (let i = 0; i < obstaclePool.length; i++) {
    const obs = obstaclePool[i];
    if (obs.visible) {
      const oType = obs.userData.obstacleType;

      // Special movement logic per obstacle type
      if (oType === 'asura') {
        updateAsura(obs, dt, scrollDelta, clock);
      } else if (oType === 'evilSoul') {
        updateEvilSoul(obs, scrollDelta, clock);
      } else if (oType === 'cobra') {
        // -z is still ahead of the player, so distance shrinks as it nears
        updateCobra(obs, scrollDelta, clock, -obs.position.z);
      } else {
        obs.position.z += scrollDelta;
      }

      // Boulder rolls as it travels; the fire pit's flames flicker
      if (oType === 'boulder') {
        updateBoulder(obs, dt, state.speed);
      } else if (oType === 'firePit') {
        updateFirePit(obs, clock);
      }

      const outcome = resolveObstacleCollision(obs, oType);
      if (outcome === 'end') return;
      if (outcome === 'skip') continue;

      // Check Despawn & Naga Chase obstacle count
      if (obs.position.z > CONFIG.DESPAWN_Z) {
        obs.visible = false;
        if (state.chase.active) {
          state.chase.survived++;
          // Every hazard cleanly passed buys distance from the serpent
          state.chase.nagaTargetZ = Math.min(16.0, state.chase.nagaTargetZ + CONFIG.NAGA_DODGE_PUSH);
          if (state.chase.survived >= CONFIG.NAGA_CHASE_REQ_OBSTACLES) {
            resolveNagaChase(false);
          }
        }
      }
    }
  }
}

// Moves collectibles, and hands off anything picked up to the scoring and
// power systems.
export function updateCollectibles(dt, scrollDelta) {
  const player = getPlayer();

  // Update Collectibles (Om & Rudraksha)
  omPool.forEach(om => {
    if (om.visible) {
      om.position.z += scrollDelta;
      updateOmGlyph(om, dt);

      const dx = Math.abs(player.position.x - om.position.x);
      const dz = Math.abs(player.position.z - om.position.z);
      const dy = Math.abs(player.position.y + 0.9 - om.position.y);

      if (dx < 1.1 && dz < 1.1 && dy < 1.4) {
        collectOm(om);
      } else if (om.position.z > CONFIG.DESPAWN_Z) {
        om.visible = false;
      }
    }
  });

  rudrakshaPool.forEach(r => {
    if (r.visible) {
      r.position.z += scrollDelta;
      updateRudraksha(r, dt, clock.getElapsedTime());

      const dx = Math.abs(player.position.x - r.position.x);
      const dz = Math.abs(player.position.z - r.position.z);

      if (dx < 1.25 && dz < 1.25) {
        collectRudraksha(r);
      } else if (r.position.z > CONFIG.DESPAWN_Z) {
        r.visible = false;
      }
    }
  });

  powerOrbPool.forEach(orb => {
    if (orb.visible) {
      orb.position.z += scrollDelta;
      updatePowerPickup(orb, dt, clock.getElapsedTime());

      const dx = Math.abs(player.position.x - orb.position.x);
      const dz = Math.abs(player.position.z - orb.position.z);

      if (dx < 1.2 && dz < 1.2) {
        collectPowerOrb(orb);
      } else if (orb.position.z > CONFIG.DESPAWN_Z) {
        orb.visible = false;
      }
    }
  });
}

export function resetSpawns() {
  stageIdx = -1;
  setStageMood(0);
  nextObstacleDist = 20;
  nextCollectibleDist = 8;
  nextPowerOrbDist = 80;

  // Clear Obstacles & Pickups
  getObstaclePool().forEach(o => { o.visible = false; });
  omPool.forEach(o => { o.visible = false; });
  rudrakshaPool.forEach(r => { r.visible = false; });
  powerOrbPool.forEach(p => { p.visible = false; });
}
