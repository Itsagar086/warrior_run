// The three divine powers: Sudarshan Chakra, Shiva's Trishul and Vishnu's
// Protective Shield - how they are primed by orbs, cast, and what they do.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from './AudioSystem.js';
import { spawnFX } from './FXSystem.js';
import { showBanner } from '../ui/HUD.js';
import { setShieldVisible } from '../entities/Player.js';
import { resolveNagaChase } from '../entities/NagaChaser.js';
import { getObstaclePool } from '../entities/Obstacles.js';
import { asuraDeathBurst } from '../entities/AsuraDemon.js';

// ===== ASSET id=trishul-bolt label="Flying Trishul Bolt" role=projectile =====
function makeTrishulProjectile() {
  // ART DIRECTION: silhouette = slender silver trident hurled prongs-first down the lane with a trailing divine comet aura; signature = three tapered prongs on a spinning shaft, golden damru collar, pale blue energy wake; proportion = compact 1.4m bolt; colors = trishul silver #dbe5eb, damru gold #e5b035, divine wake #9fe8ff.
  const trishul = new THREE.Group();

  const silverMat = new THREE.MeshStandardMaterial({
    color: '#dbe5eb',
    emissive: '#bfe9ff',
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.95
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#e5b035',
    emissive: '#ff9900',
    emissiveIntensity: 0.8,
    roughness: 0.3,
    metalness: 0.9
  });
  const auraMat = new THREE.MeshBasicMaterial({
    color: '#9fe8ff',
    transparent: true,
    opacity: 0.28
  });

  // Shaft laid along Z; the bolt travels toward -Z, so all tips point that way
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 10), silverMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0, 0.18);
  trishul.add(shaft);

  // Central prong
  const centerProng = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 8), silverMat);
  centerProng.rotation.x = -Math.PI / 2;
  centerProng.position.set(0, 0, -0.52);
  trishul.add(centerProng);

  // Twin outer prongs curving forward off the shaft
  [-0.2, 0.2].forEach(px => {
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -0.16),
      new THREE.Vector3(px, 0, -0.26),
      new THREE.Vector3(px, 0, -0.50)
    ]);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(armCurve, 12, 0.033, 6, false), silverMat);
    trishul.add(arm);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 7), silverMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(px, 0, -0.62);
    trishul.add(tip);
  });

  // Golden Damru collar at the prong junction
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 14), goldMat);
  collar.position.set(0, 0, -0.06);
  trishul.add(collar);

  // Trailing divine wake behind the bolt
  const wake = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.7, 8), auraMat);
  wake.rotation.x = Math.PI / 2;
  wake.position.set(0, 0, 0.72);
  trishul.add(wake);

  trishul.userData.role = 'projectile';
  trishul.userData.bbox = { w: 0.55, h: 0.35, d: 1.4 };

  return trishul;
}
// ===== END ASSET =====

// Projectile Mesh Pool (Sudarshan Chakra & Trishul)
const projectilePool = [];
const chakraGeo = new THREE.TorusGeometry(0.42, 0.08, 8, 20);
const chakraMat = new THREE.MeshStandardMaterial({
  color: '#ffaa22',
  emissive: '#ff9900',
  emissiveIntensity: 1.0,
  roughness: 0.2,
  metalness: 0.9
});

export function initPowerSystem(scene) {
  for (let i = 0; i < 3; i++) {
    const pMesh = new THREE.Mesh(chakraGeo, chakraMat);
    pMesh.rotation.x = Math.PI / 2;
    pMesh.visible = false;
    scene.add(pMesh);
    projectilePool.push({
      mesh: pMesh,
      active: false,
      type: 'chakra',
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 0, -1),
      speed: 40.0,
      dist: 0,
      maxDist: 70.0
    });
  }

  // The Trishul flies as its own trident bolt (one per lane), not a re-skinned chakra
  for (let i = 0; i < 3; i++) {
    const tMesh = makeTrishulProjectile();
    tMesh.visible = false;
    scene.add(tMesh);
    projectilePool.push({
      mesh: tMesh,
      active: false,
      type: 'trishul',
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 0, -1),
      speed: 46.0,
      dist: 0,
      maxDist: 70.0
    });
  }

  return projectilePool;
}

export function getProjectilePool() {
  return projectilePool;
}

const DIVINE_POWERS = ['sudarshan_chakra', 'trishul', 'vishnu_shield'];

// One place that actually performs a power, shared by both systems: E spends
// the held power, C spends a full Shakti bar on a random one.
function executePower(power) {
  state.lastPowerUsed = power;
  playSound('power');

  if (power === 'sudarshan_chakra') {
    showBanner('⚡ SUDARSHAN CHAKRA UNLEASHED! ⚡', 2.0);
    launchProjectile('chakra', state.playerX, 0.9);
  } else if (power === 'trishul') {
    showBanner('🔱 SHIVA\'S TRISHUL PURIFIES THE PATH! 🔱', 2.0);
    launchProjectile('trishul', -2.2, 1.0);
    launchProjectile('trishul', 0, 1.0);
    launchProjectile('trishul', 2.2, 1.0);
  } else if (power === 'vishnu_shield') {
    showBanner('🛡️ VISHNU\'S PROTECTIVE SHIELD ACTIVE! 🛡️', 2.5);
    state.shieldTimer = 5.5;
    setShieldVisible(true);
  }

  // Naga escape condition with power
  if (state.chase.active) {
    resolveNagaChase(true);
  }
}

// E - use the power in hand. Never touches the Shakti bar.
export function useHeldPower() {
  if (state.phase !== 'playing') return;
  if (!state.heldPower) {
    showBanner('NO DIVINE POWER IN HAND \u2014 GRAB AN ORB!', 1.2);
    return;
  }
  const power = state.heldPower;
  state.heldPower = null;
  executePower(power);
}

// C - unleash the Shakti ultimate. Never touches the held power.
export function unleashUltimate() {
  if (state.phase !== 'playing') return;
  if (state.shakti < state.maxShakti) {
    showBanner(`SHAKTI ${Math.floor(state.shakti)}/${state.maxShakti} \u2014 FILL THE BAR TO UNLEASH`, 1.2);
    return;
  }
  state.shakti = 0;
  executePower(DIVINE_POWERS[Math.floor(Math.random() * DIVINE_POWERS.length)]);
}

export function launchProjectile(type, laneX, startY) {
  for (let i = 0; i < projectilePool.length; i++) {
    const p = projectilePool[i];
    // Each entry owns the mesh for its own power, so match on type
    if (!p.active && p.type === type) {
      p.active = true;
      p.pos.set(laneX, startY, 0);
      p.mesh.position.copy(p.pos);
      p.mesh.visible = true;
      p.dist = 0;
      break;
    }
  }
}

// Power orb pickup: tops up Shakti and primes the next power in the cycle.
export function collectPowerOrb(orb) {
  orb.visible = false;
  // The orb's power goes IN HAND - what you see on the track is what you get,
  // and the newest pickup replaces whatever you were holding. The Shakti bar
  // is deliberately untouched: these are two separate systems.
  state.heldPower = orb.userData.power || 'sudarshan_chakra';

  playSound('power');
  spawnFX(orb.position, '#4de0c0', 20);

  const NAMES = {
    sudarshan_chakra: '\u26a1 SUDARSHAN CHAKRA',
    trishul: '\ud83d\udd31 SHIVA\'S TRISHUL',
    vishnu_shield: '\ud83d\udee1\ufe0f VISHNU\'S SHIELD',
  };
  showBanner(`${NAMES[state.heldPower]} IN HAND \u2014 PRESS E!`, 2.0);
}

// Flies active bolts down the lane and blasts whatever they touch.
export function updateProjectiles(dt) {
  // Update Projectiles
  for (let i = 0; i < projectilePool.length; i++) {
    const p = projectilePool[i];
    if (p.active) {
      p.pos.addScaledVector(p.dir, p.speed * dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.z += dt * (p.type === 'trishul' ? 12.0 : 25.0);
      p.dist += p.speed * dt;

      // Check collision with obstacles
      const obstaclePool = getObstaclePool();
      for (let j = 0; j < obstaclePool.length; j++) {
        const obs = obstaclePool[j];
        if (obs.visible) {
          const dx = Math.abs(p.pos.x - obs.position.x);
          const dz = Math.abs(p.pos.z - obs.position.z);
          if (dx < 1.2 && dz < 1.4) {
            obs.visible = false;
            state.punya += 50 * state.combo;
            playSound('blast');
            if (obs.userData.obstacleType === 'asura') asuraDeathBurst(obs, spawnFX);
            else spawnFX(obs.position, '#ffd700', 25);
            break;
          }
        }
      }

      if (p.dist >= p.maxDist) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }
}

export function resetProjectiles() {
  projectilePool.forEach(p => { p.active = false; p.mesh.visible = false; });
}

export { makeTrishulProjectile };
