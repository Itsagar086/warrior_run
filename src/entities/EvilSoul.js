// Evil souls: head-height spirits that sine-drift across the lanes while
// bobbing, so the devotee must slide under them.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { swing } from '../utils/AnimationHelper.js';

// ===== ASSET id=moving-evil-soul label="Floating Evil Soul" role=obstacle =====
function makeEvilSoul() {
  // ART DIRECTION: silhouette = dark floating spirit with glowing dark purple emissive orb core and outer wispy transparent ghost shell with cyan eyes.
  const soul = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: '#3b0a45',
    emissive: '#8800cc',
    emissiveIntensity: 1.0,
    roughness: 0.3
  });

  const shellMat = new THREE.MeshStandardMaterial({
    color: '#1a0524',
    emissive: '#5500aa',
    emissiveIntensity: 0.5,
    roughness: 0.4,
    transparent: true,
    opacity: 0.55
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: '#00ffee',
    emissive: '#00ffee',
    emissiveIntensity: 1.2
  });

  // Inner Glowing Core Orb
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 14), coreMat);
  core.position.set(0, 1.35, 0);
  soul.add(core);

  // Outer Transparent Wispy Ghost Shell
  const outerShell = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 16), shellMat);
  outerShell.position.set(0, 1.35, 0);
  soul.add(outerShell);

  // Glowing Skull Eyes
  [-0.12, 0.12].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(ex, 1.42, 0.3);
    soul.add(eye);
  });

  // Wispy Trailing Shroud Tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.1, 8), shellMat);
  tail.position.set(0, 0.7, 0);
  tail.rotation.x = Math.PI;
  soul.add(tail);

  // Floating Aura Ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 8, 16), eyeMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 1.35, 0);
  soul.add(ring);

  soul.userData.role = 'obstacle';
  soul.userData.obstacleType = 'evilSoul';
  // Zone 2: costs a life rather than ending the run, because the soul drifts
  // laterally and can converge on the player's lane with little warning.
  soul.userData.zone = 2;
  // The orb rides at head height, so a slide passes clean underneath it.
  soul.userData.duckable = true;
  soul.userData.bbox = { w: 1.0, h: 1.5, d: 1.0 };
  return soul;
}
// ===== END ASSET =====

// Scrolls with the world, drifting laterally and bobbing as it comes.
export function updateEvilSoul(obs, scrollDelta, clock) {
  obs.position.z += scrollDelta;
  const time = clock.getElapsedTime();
  const laneW = CONFIG.LANE_WIDTH || 2.2;
  // Lateral sine drift across lanes AND vertical bobbing
  const phase = obs.userData.soulPhase || 0;
  obs.position.x = (obs.userData.soulBaseX || 0) + swing(time * 1.5 + phase, laneW * 0.5);
  obs.position.y = 0.3 + swing(time * 3.0, 0.3);
}

export { makeEvilSoul };
