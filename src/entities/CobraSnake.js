// The cobra coiled on the path: a Naga in miniature that sways where it sits
// and flares its hood when the devotee closes on it.
import * as THREE from 'three';
import { swing } from '../utils/AnimationHelper.js';

const BODY_GREEN = 0x1a5c2a;
const BELLY_GREEN = 0x4a8c3a;
const GOLD = 0xd4af37;

// The spine, in the cobra's own YZ plane: a low coil that doubles back on
// itself and then rears up toward the devotee. +z is toward the player.
const SPINE = [
  [0.10, -0.62],
  [0.26, -0.20],
  [0.46, 0.02],
  [0.68, -0.16],
  [0.90, -0.30],
  [1.10, -0.26],
  [1.28, -0.12],
  [1.42, 0.04],
  [1.54, 0.18],
  [1.64, 0.30]
];
const SEGMENTS = SPINE.length - 1;

// ===== ASSET id=cobra-naga label="Cobra Naga" role=obstacle =====
function makeCobra() {
  // ART DIRECTION: silhouette = a reared cobra, its body an S from the
  // flagstones up to a flared hood at chest height; signature = the pale belly
  // stripe running up the front, a gold collar at the throat and two lit yellow
  // eyes; colors = dark green #1a5c2a, belly #4a8c3a, collar gold #d4af37.
  const cobra = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color: BODY_GREEN, roughness: 0.55, metalness: 0.15 });
  const bellyMat = new THREE.MeshStandardMaterial({ color: BELLY_GREEN, roughness: 0.65, metalness: 0.05 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: GOLD, emissive: 0x6b4a00, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.9
  });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffee44, emissive: 0xffdd00, emissiveIntensity: 1.6, roughness: 0.3
  });
  const tongueMat = new THREE.MeshStandardMaterial({ color: 0xaa1844, roughness: 0.6 });

  // One cylinder per span of the spine, each laid along its own span so the
  // body actually curves. Siblings, not a chain, so the idle sway cannot
  // accumulate into a lean.
  const segments = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const [y0, z0] = SPINE[i];
    const [y1, z1] = SPINE[i + 1];
    const dy = y1 - y0;
    const dz = z1 - z0;
    const span = Math.hypot(dy, dz);
    const t = i / (SEGMENTS - 1);

    // Thick through the coil, tapering toward the throat
    const rBottom = 0.25 - t * 0.09;
    const rTop = 0.25 - ((i + 1) / (SEGMENTS - 1)) * 0.09;

    const seg = new THREE.Group();
    seg.name = 'cobraSegment' + i;
    seg.position.set(0, (y0 + y1) / 2, (z0 + z1) / 2);
    seg.rotation.x = Math.atan2(dz, dy);   // lay the segment along its span
    cobra.add(seg);

    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, span * 1.22, 10), bodyMat);
    mesh.castShadow = true;
    seg.add(mesh);

    // Pale belly stripe down the front of the coil
    const belly = new THREE.Mesh(new THREE.BoxGeometry(rTop * 1.0, span * 1.1, 0.04), bellyMat);
    belly.position.set(0, 0, rTop * 0.92);
    seg.add(belly);

    seg.userData.basePos = { y: seg.position.y, z: seg.position.z };
    seg.userData.baseRotX = seg.rotation.x;
    seg.userData.swayPhase = i * 0.5;
    seg.userData.swayAmount = 0.035 + t * 0.055;
    segments.push(seg);
  }

  // Throat: a node at the top of the spine that the collar, hood and head hang
  // from, so they all move together when the hood flares.
  const [topY, topZ] = SPINE[SPINE.length - 1];
  const throat = new THREE.Group();
  throat.name = 'throat';
  throat.position.set(0, topY, topZ);
  throat.rotation.x = -0.22;
  cobra.add(throat);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 16), goldMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, -0.13, 0.02);
  throat.add(collar);

  // Hood: a flattened sphere that widens as the devotee gets close
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.position.set(0, 0.22, -0.1);
  throat.add(hood);

  const hoodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), bodyMat);
  hoodMesh.scale.set(1.2, 1.35, 0.24);
  hoodMesh.castShadow = true;
  hood.add(hoodMesh);

  const hoodMark = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 12), bellyMat);
  hoodMark.position.set(0, 0.06, -0.1);
  hood.add(hoodMark);

  // Head, out in front of the hood
  const head = new THREE.Group();
  head.name = 'cobraHead';
  head.position.set(0, -0.04, 0.28);
  hood.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), bodyMat);
  skull.scale.set(1.0, 0.76, 1.4);
  skull.castShadow = true;
  head.add(skull);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.2), bellyMat);
  jaw.position.set(0, -0.07, 0.04);
  head.add(jaw);

  [-0.07, 0.07].forEach(ex => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), eyeMat);
    eye.position.set(ex, 0.045, 0.13);
    head.add(eye);
  });

  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.012, 0.15), tongueMat);
  tongue.position.set(0, -0.06, 0.24);
  head.add(tongue);

  cobra.userData.segments = segments;
  cobra.userData.throat = throat;
  cobra.userData.hood = hood;
  cobra.userData.hoodMesh = hoodMesh;
  cobra.userData.role = 'obstacle';
  cobra.userData.obstacleType = 'cobra';
  cobra.userData.zone = 2;
  cobra.userData.bbox = { w: 1.1, h: 2.0, d: 1.1 };

  return cobra;
}
// ===== END ASSET =====

// Idle sway travelling up the body, and a hood that flares as the devotee
// closes. `distance` is how far ahead of the player the cobra still is.
export function updateCobra(obs, scrollDelta, clock, distance) {
  obs.position.z += scrollDelta;

  const time = clock.getElapsedTime();
  const segments = obs.userData.segments;
  if (!segments) return;

  // The wave runs up the snake, so the head lags the coil
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const phase = time * 2.4 - seg.userData.swayPhase;
    seg.position.x = swing(phase, seg.userData.swayAmount);
    seg.rotation.z = swing(phase, seg.userData.swayAmount * 0.6);
    seg.rotation.x = seg.userData.baseRotX + swing(time * 1.8 - seg.userData.swayPhase, 0.025);
  }

  const throat = obs.userData.throat;
  if (throat) throat.position.x = swing(time * 2.4 - segments.length * 0.5, 0.06);

  // Flare: none beyond 18 units out, full by 6
  const flare = Math.max(0, Math.min(1, (18 - distance) / 12));
  const hoodMesh = obs.userData.hoodMesh;
  if (hoodMesh) {
    hoodMesh.scale.x = 1.2 + flare * 0.75;
    hoodMesh.scale.y = 1.35 + flare * 0.2;
  }
}

export { makeCobra };
