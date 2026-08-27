// Asura demons: horned brutes that charge the devotee from up the path,
// closing faster than the world scrolls.
import * as THREE from 'three';
import { swing, swingOpposed } from '../utils/AnimationHelper.js';

// ===== ASSET id=running-demon-asura label="Asura Running Demon" role=obstacle =====
function makeAsuraDemon() {
  // ART DIRECTION: silhouette = hunched horned demonic brute charging down the lane with glowing red eyes; signature = twin obsidian horns, dark red/black muscular torso, arms & legs, heavy spiked iron shoulder guards; proportion = menacing wide-shouldered brute 2.0m tall.
  const asura = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: '#5c1010', roughness: 0.7, metalness: 0.15 });
  const armorMat = new THREE.MeshStandardMaterial({ color: '#15151e', roughness: 0.5, metalness: 0.7 });
  const hornMat = new THREE.MeshStandardMaterial({ color: '#0a0a0f', roughness: 0.3, metalness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#ff0033', emissive: '#ff0033', emissiveIntensity: 1.2 });

  // Torso
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.85, 0.5), skinMat);
  body.name = 'torso';
  body.position.set(0, 1.05, 0);
  asura.add(body);

  // Spiked Shoulder Armor Pads
  [-0.48, 0.48].forEach(x => {
    const pad = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.4, 4), armorMat);
    pad.position.set(x, 1.5, 0);
    pad.rotation.z = x < 0 ? 0.4 : -0.4;
    asura.add(pad);
  });

  // Head & Horns
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.name = 'head';
  head.position.set(0, 1.65, 0.1);
  asura.add(head);

  // Twin Curved Horns
  [-0.18, 0.18].forEach(hx => {
    const hornCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(hx, 1.82, 0.1),
      new THREE.Vector3(hx * 1.8, 2.15, 0.05),
      new THREE.Vector3(hx * 1.3, 2.35, -0.15)
    ]);
    const horn = new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 12, 0.045, 6, false), hornMat);
    asura.add(horn);
  });

  // Glowing Red Eyes
  [-0.1, 0.1].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    eye.position.set(ex, 1.7, 0.32);
    asura.add(eye);
  });

  // Left & Right Arms
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), skinMat);
  armL.name = 'armL';
  armL.position.set(-0.48, 1.0, 0);
  asura.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.24), skinMat);
  armR.name = 'armR';
  armR.position.set(0.48, 1.0, 0);
  asura.add(armR);

  // Left & Right Legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.28), skinMat);
  legL.name = 'legL';
  legL.position.set(-0.2, 0.33, 0);
  asura.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.65, 0.28), skinMat);
  legR.name = 'legR';
  legR.position.set(0.2, 0.33, 0);
  asura.add(legR);

  asura.userData.role = 'obstacle';
  asura.userData.obstacleType = 'asura';
  asura.userData.zone = 2;
  asura.userData.bbox = { w: 1.4, h: 2.3, d: 1.0 };
  return asura;
}
// ===== END ASSET =====

// Runs toward the player from ahead, legs and arms striding.
export function updateAsura(obs, dt, scrollDelta, clock) {
  // Asuras run toward the player from ahead
  obs.position.z += scrollDelta + 6.0 * dt;
  // Running stride animation for Asura legs & arms
  const time = clock.getElapsedTime();
  const legL = obs.getObjectByName('legL') || obs.children[8];
  const legR = obs.getObjectByName('legR') || obs.children[9];
  const armL = obs.getObjectByName('armL') || obs.children[6];
  const armR = obs.getObjectByName('armR') || obs.children[7];
  if (legL) legL.rotation.x = swing(time * 8.0, 0.6);
  if (legR) legR.rotation.x = swingOpposed(time * 8.0, 0.6);
  if (armL) armL.rotation.x = swing(time * 8.0 + Math.PI, 0.6);
  if (armR) armR.rotation.x = swingOpposed(time * 8.0 + Math.PI, 0.6);
}

export { makeAsuraDemon };
