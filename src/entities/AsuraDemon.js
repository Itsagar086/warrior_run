// Asura demons: horned brutes that charge the devotee down the lane, closing
// faster than the world scrolls.
import * as THREE from 'three';
import { swing, swingOpposed, bounce } from '../utils/AnimationHelper.js';

const FLESH = 0x8b0000;      // lit chest, face and forearms
const FLESH_DARK = 0x4a0000; // the mass of the body, in shadow
const HORN = 0x1a1210;

// ===== ASSET id=running-demon-asura label="Asura Running Demon" role=obstacle =====
function makeAsuraDemon() {
  // ART DIRECTION: silhouette = a squat wide-shouldered brute leaning into a
  // charge, head low between two heavy curved horns; signature = the horns
  // sweeping up and out, a barrel chest lighter than the limbs, and two burning
  // eyes; proportion = shorter and far wider than the devotee, arms hanging
  // past the hip; colors = dark red #8b0000 over near-black red #4a0000.
  const asura = new THREE.Group();

  const fleshMat = new THREE.MeshStandardMaterial({ color: FLESH, roughness: 0.72, metalness: 0.05 });
  const darkMat = new THREE.MeshStandardMaterial({ color: FLESH_DARK, roughness: 0.8, metalness: 0.05 });
  const hornMat = new THREE.MeshStandardMaterial({ color: HORN, roughness: 0.45, metalness: 0.25 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffaa22, emissive: 0xff5500, emissiveIntensity: 2.0, roughness: 0.3
  });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.5, metalness: 0.3 });

  const HIP_Y = 0.78;
  const CHEST_Y = 1.28;

  /* ------------------------------------------------------------- torso */
  // Pivots at the waist so the whole upper body can lean into the charge
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, HIP_Y, 0);
  torso.rotation.x = 0.22;      // leaning forward, always coming at you
  asura.add(torso);

  // Barrel chest: wide at the shoulders, narrowing to the gut
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.36, 0.62, 10), fleshMat);
  chest.position.set(0, 0.34, 0);
  chest.scale.set(1.15, 1, 0.85);
  chest.castShadow = true;
  torso.add(chest);

  // Slabs of shoulder muscle either side, so the outline is not a cylinder
  [-1, 1].forEach(side => {
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), darkMat);
    delt.position.set(side * 0.5, 0.52, 0);
    delt.scale.set(1, 0.9, 0.95);
    delt.castShadow = true;
    torso.add(delt);
  });

  const gut = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), darkMat);
  gut.position.set(0, 0.04, 0.03);
  gut.scale.set(1.15, 0.85, 0.95);
  torso.add(gut);

  // Pectoral ridge catching the light, as in the reference's lit chest
  [-1, 1].forEach(side => {
    const pec = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), fleshMat);
    pec.position.set(side * 0.2, 0.42, 0.2);
    pec.scale.set(1.1, 0.8, 0.6);
    torso.add(pec);
  });

  /* -------------------------------------------------------------- head */
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.74, 0.06);
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), fleshMat);
  skull.scale.set(1.1, 0.95, 1.0);
  skull.castShadow = true;
  head.add(skull);

  // Heavy brow, which is what makes the face read as fierce rather than blank
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.11, 0.2), darkMat);
  brow.position.set(0, 0.09, 0.19);
  brow.rotation.x = -0.22;
  head.add(brow);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), darkMat);
  jaw.position.set(0, -0.16, 0.12);
  head.add(jaw);

  // Tusks jutting up from the lower jaw
  [-0.11, 0.11].forEach(tx => {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), hornMat);
    tusk.position.set(tx, -0.08, 0.22);
    head.add(tusk);
  });

  // Two heavy horns sweeping up and outward - cones, not thin curling tubes,
  // which is what made the old ones look like antennae
  [-1, 1].forEach(side => {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.46, 7), hornMat);
    horn.position.set(side * 0.21, 0.28, -0.02);
    horn.rotation.z = side * -0.55;
    horn.rotation.x = -0.18;
    horn.castShadow = true;
    head.add(horn);

    // A second, smaller spur behind it for weight
    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), hornMat);
    spur.position.set(side * 0.24, 0.18, -0.16);
    spur.rotation.z = side * -0.7;
    head.add(spur);
  });

  // Burning eyes under the brow
  [-0.11, 0.11].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), eyeMat);
    eye.position.set(ex, 0.02, 0.22);
    head.add(eye);
  });

  /* -------------------------------------------------------------- arms */
  function buildArm(side) {
    const sign = side === 'L' ? -1 : 1;

    const upper = new THREE.Group();
    upper.name = 'arm' + side;
    upper.position.set(sign * 0.52, 0.46, 0);
    upper.rotation.z = sign * 0.16;
    torso.add(upper);

    const bicep = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.3, 6, 8), darkMat);
    bicep.position.set(0, -0.2, 0);
    bicep.castShadow = true;
    upper.add(bicep);

    const fore = new THREE.Group();
    fore.name = 'forearm' + side;
    fore.position.set(0, -0.42, 0);
    upper.add(fore);

    // Forearms thicker than the biceps: top-heavy, ape-like, deliberately
    // longer than human proportion
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.32, 6, 8), fleshMat);
    forearm.position.set(0, -0.22, 0);
    forearm.castShadow = true;
    fore.add(forearm);

    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), darkMat);
    fist.position.set(0, -0.46, 0.02);
    fore.add(fist);

    // Claws on the knuckles
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 5), clawMat);
      claw.position.set(i * 0.08, -0.55, 0.1);
      claw.rotation.x = 0.5;
      fore.add(claw);
    }
    return upper;
  }
  buildArm('L');
  buildArm('R');

  /* -------------------------------------------------------------- legs */
  function buildLeg(side) {
    const sign = side === 'L' ? -1 : 1;

    const leg = new THREE.Group();
    leg.name = 'leg' + side;
    leg.position.set(sign * 0.23, HIP_Y, 0);
    asura.add(leg);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 6, 8), darkMat);
    thigh.position.set(0, -0.2, 0);
    thigh.castShadow = true;
    leg.add(thigh);

    const shin = new THREE.Group();
    shin.name = 'shin' + side;
    shin.position.set(0, -0.4, 0);
    leg.add(shin);

    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.2, 6, 8), darkMat);
    calf.position.set(0, -0.16, 0);
    calf.castShadow = true;
    shin.add(calf);

    // Splayed clawed foot
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.11, 0.34), darkMat);
    foot.position.set(0, -0.34, 0.07);
    shin.add(foot);

    for (let i = -1; i <= 1; i++) {
      const toe = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 5), clawMat);
      toe.position.set(i * 0.08, -0.36, 0.25);
      toe.rotation.x = Math.PI / 2;
      shin.add(toe);
    }
    return leg;
  }
  buildLeg('L');
  buildLeg('R');

  asura.userData.role = 'obstacle';
  asura.userData.obstacleType = 'asura';
  asura.userData.zone = 2;
  asura.userData.bbox = { w: 1.6, h: 2.0, d: 1.1 };

  return asura;
}
// ===== END ASSET =====

// Charges the devotee with a heavy stomping stride: the legs pound, the arms
// pump across the body, and the whole mass drops on each footfall.
export function updateAsura(obs, dt, scrollDelta, clock) {
  // Asuras run toward the player from ahead
  obs.position.z += scrollDelta + 6.0 * dt;

  const time = clock.getElapsedTime();
  const t = time * 7.5;   // slower and heavier than the devotee's stride

  const legL = obs.getObjectByName('legL');
  const legR = obs.getObjectByName('legR');
  const shinL = obs.getObjectByName('shinL');
  const shinR = obs.getObjectByName('shinR');
  const armL = obs.getObjectByName('armL');
  const armR = obs.getObjectByName('armR');
  const foreL = obs.getObjectByName('forearmL');
  const foreR = obs.getObjectByName('forearmR');
  const torso = obs.getObjectByName('torso');
  const head = obs.getObjectByName('head');

  if (legL) legL.rotation.x = swing(t, 0.72);
  if (legR) legR.rotation.x = swingOpposed(t, 0.72);
  // Knees snap through late, which is what gives a stomp its weight
  if (shinL) shinL.rotation.x = Math.max(0, -Math.sin(t + 0.7)) * 0.85;
  if (shinR) shinR.rotation.x = Math.max(0, Math.sin(t + 0.7)) * 0.85;

  if (armL) {
    armL.rotation.x = swingOpposed(t, 0.75);
    armL.rotation.z = 0.16 + swing(t, 0.1);
  }
  if (armR) {
    armR.rotation.x = swing(t, 0.75);
    armR.rotation.z = -0.16 + swingOpposed(t, 0.1);
  }
  if (foreL) foreL.rotation.x = -0.75 - Math.max(0, Math.sin(t)) * 0.4;
  if (foreR) foreR.rotation.x = -0.75 - Math.max(0, -Math.sin(t)) * 0.4;

  if (torso) {
    // Leaning into the charge, rolling with each stride, dropping on impact
    torso.rotation.x = 0.22 + swing(t * 2, 0.04);
    torso.rotation.y = swing(t, 0.1);
    torso.position.y = 0.78 - bounce(t, 0.06);
  }
  if (head) head.rotation.y = swingOpposed(t, 0.06);
}

// Struck down: a burst of red-orange embers where the demon stood.
export function asuraDeathBurst(obs, spawnFX) {
  spawnFX(obs.position, '#ff5500', 18, 1.2);
  spawnFX(obs.position, '#ffaa22', 10, 0.8);
  spawnFX(obs.position, '#8b0000', 8, 1.5);
}

export { makeAsuraDemon };
