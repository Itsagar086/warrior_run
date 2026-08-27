// What appears on the path and when: the obstacle spawn table with its
// distance gates and forced intervals, the collectible stream, and the
// per-frame scrolling and despawning of everything spawned.
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { swing } from '../utils/AnimationHelper.js';
import { makeOmGlyph, makeRudrakshaBead, makePowerOrb } from '../utils/AssetFactory.js';
import { getObstaclePool, updateBoulder, updateFirePit } from '../entities/Obstacles.js';
import { updateCobra } from '../entities/CobraSnake.js';
import { getPlayer } from '../entities/Player.js';
import { updateAsura } from '../entities/AsuraDemon.js';
import { updateEvilSoul } from '../entities/EvilSoul.js';
import { resolveNagaChase } from '../entities/NagaChaser.js';
import { resolveObstacleCollision } from './CollisionSystem.js';
import { collectOm, collectRudraksha } from './ScoreSystem.js';
import { collectPowerOrb } from './PowerSystem.js';

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

  for (let i = 0; i < 4; i++) {
    const r = makeRudrakshaBead();
    r.visible = false;
    scene.add(r);
    rudrakshaPool.push(r);
    window.__gameEntities.registerCollectible(r);
  }

  for (let i = 0; i < 4; i++) {
    const orb = makePowerOrb();
    orb.visible = false;
    scene.add(orb);
    powerOrbPool.push(orb);
    window.__gameEntities.registerCollectible(orb);
  }
}

export function spawnObstacleAt(z) {
  const dist = state.distance;
  const eligibleTypes = ['firePit', 'archGate', 'boulder'];

  if (dist >= 150) eligibleTypes.push('evilSoul');
  if (dist >= 200) eligibleTypes.push('asura');
  if (dist >= 250) eligibleTypes.push('cobra');
  if (dist >= 300) eligibleTypes.push('brokenRoad');

  // Priority check to guarantee consistent interval appearance
  let chosenType = null;
  if (dist >= 200 && (dist - lastAsuraDist) >= 140) {
    chosenType = 'asura';
  } else if (dist >= 300 && (dist - lastBrokenRoadDist) >= 250) {
    chosenType = 'brokenRoad';
  } else if (dist >= 150 && (dist - lastEvilSoulDist) >= 150) {
    chosenType = 'evilSoul';
  } else if (dist >= 250 && (dist - lastCobraDist) >= 180) {
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

  const chosenLane = Math.floor(Math.random() * 3);
  const laneX = CONFIG.LANES[chosenLane];

  freeObs.position.set(laneX, CONFIG.SURFACE_Y, z);
  freeObs.visible = true;
  if (type === 'evilSoul') {
    freeObs.userData.soulBaseX = laneX;
    // Per-instance phase, so two souls on screen do not drift in lockstep
    freeObs.userData.soulPhase = Math.random() * Math.PI * 2;
  }
}

export function spawnCollectibleAt(z) {
  // Chance for rare Rudraksha vs Om Glyphs
  if (Math.random() < 0.16) {
    const freeR = rudrakshaPool.find(r => !r.visible);
    if (freeR) {
      // Rare rudraksha spawns off-lane or tricky edge
      const sideOffsets = [-3.1, -2.2, 0, 2.2, 3.1];
      const rx = sideOffsets[Math.floor(Math.random() * sideOffsets.length)];
      freeR.position.set(rx, 1.1, z);
      freeR.visible = true;
      return;
    }
  }

  // Standard Om Glyph line
  const freeOm = omPool.find(o => !o.visible);
  if (freeOm) {
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOm.position.set(laneX, 0.9, z);
    freeOm.visible = true;
  }
}

export function spawnPowerOrbAt(z) {
  const freeOrb = powerOrbPool.find(o => !o.visible);
  if (freeOrb) {
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOrb.position.set(laneX, 1.2, z);
    freeOrb.visible = true;
  }
}

// Distance-driven spawn triggers.
export function updateSpawning() {
  // Spawn Obstacles & Pickups based on distance traveled
  if (state.distance >= nextObstacleDist) {
    spawnObstacleAt(CONFIG.SPAWN_Z);
    nextObstacleDist = state.distance + (18.0 - (state.speed - 16.0) * 0.35);
  }
  if (state.distance >= nextCollectibleDist) {
    spawnCollectibleAt(CONFIG.SPAWN_Z - 2);
    nextCollectibleDist = state.distance + 8.5;
  }
  if (state.distance >= nextPowerOrbDist) {
    spawnPowerOrbAt(CONFIG.SPAWN_Z - 4);
    nextPowerOrbDist = state.distance + 95.0;
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
      om.rotation.y += dt * 3.5;

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
      r.rotation.y += dt * 2.5;
      r.position.y = 1.1 + swing(clock.getElapsedTime() * 4, 0.15);

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
      orb.rotation.y += dt * 3.0;

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
  nextObstacleDist = 20;
  nextCollectibleDist = 8;
  nextPowerOrbDist = 80;

  // Clear Obstacles & Pickups
  getObstaclePool().forEach(o => { o.visible = false; });
  omPool.forEach(o => { o.visible = false; });
  rudrakshaPool.forEach(r => { r.visible = false; });
  powerOrbPool.forEach(p => { p.visible = false; });
}
