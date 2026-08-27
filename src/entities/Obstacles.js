// The hazards of the Snake Way: the sacred fire pit that ends a run outright,
// the rolling boulder, the temple arch you must duck under, and the broken
// causeway you must jump. Plus the shared recycled obstacle pool.
import * as THREE from 'three';
import { spawnFX } from '../systems/FXSystem.js';
import { createFireLight, makeRadialGlowTexture } from '../environment/Lighting.js';
import { makeAsuraDemon } from './AsuraDemon.js';
import { makeEvilSoul } from './EvilSoul.js';
import { makeCobra } from './CobraSnake.js';

// ===== ASSET id=sacred-fire-pit label="Sacred Fire Pit" role=obstacle =====
function makeFirePit() {
  // ART DIRECTION: silhouette = a low ring of dressed stone with three tongues
  // of fire standing out of it; signature = the only Zone 1 hazard on the path,
  // so it reads hot and absolute - orange light spilling across the flagstones;
  // colors = warm grey stone #8b7f6e, flame #ff4400 into #ffcc55.
  const firePit = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b7f6e, roughness: 0.94, metalness: 0.02 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x2a0900, emissive: 0xff3300, emissiveIntensity: 1.4, roughness: 0.85
  });
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.6,
    roughness: 0.3, transparent: true, opacity: 0.92
  });
  const flameCoreMat = new THREE.MeshStandardMaterial({
    color: 0xffcc55, emissive: 0xffcc55, emissiveIntensity: 1.8, roughness: 0.3
  });

  // Stone ring, laid flat on the ground
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.25, 8, 16), stoneMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.2, 0);
  ring.castShadow = true;
  ring.receiveShadow = true;
  firePit.add(ring);

  // Glowing coal bed inside the ring
  const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 14), emberMat);
  embers.position.set(0, 0.14, 0);
  firePit.add(embers);

  // Three tongues of flame, offset off centre so they read as one fire
  const flames = [];
  const offsets = [
    [0.0, 0.46, 0.0, 1.0],
    [-0.22, 0.4, 0.14, 0.78],
    [0.2, 0.42, -0.16, 0.86]
  ];
  offsets.forEach(([x, y, z, s], i) => {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.8, 8), i === 0 ? flameCoreMat : flameMat);
    flame.position.set(x, y, z);
    flame.scale.setScalar(s);
    flame.userData.baseScale = s;
    flame.userData.phase = i * 1.7;
    firePit.add(flame);
    flames.push(flame);
  });
  firePit.userData.flames = flames;

  // Warm light thrown up out of the pit
  const light = createFireLight();
  light.position.set(0, 0.95, 0);
  firePit.add(light);

  // Warm glow pooled on the flagstones around the pit
  const glowTex = makeRadialGlowTexture(
    'rgba(255, 150, 60, 0.55)', 'rgba(255, 105, 30, 0.22)', 'rgba(255, 80, 0, 0.0)'
  );
  if (glowTex) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 4.2),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(0, 0.05, 0);
    firePit.add(glow);
  }

  firePit.userData.role = 'obstacle';
  firePit.userData.obstacleType = 'firePit';
  firePit.userData.zone = 1;
  firePit.userData.bbox = { w: 1.9, h: 1.3, d: 1.9 };
  firePit.userData.collider = { type: 'sphere', radius: 0.75, offset: [0, 0.3, 0] };

  return firePit;
}
// ===== END ASSET =====

// ===== ASSET id=rolling-boulder label="Rolling Boulder" role=obstacle =====
// Opens real gaps in a sphere's shell by dropping a scattering of its triangles,
// so the dark core inside shows through as cracks. Falls back to the intact
// sphere where the geometry is stubbed (headless tests).
function crackedShell(radius, segments) {
  const geo = new THREE.SphereGeometry(radius, segments, segments);
  if (typeof geo.toNonIndexed !== 'function') return geo;

  const solid = geo.toNonIndexed();
  const pos = solid.attributes && solid.attributes.position;
  if (!pos || typeof pos.getX !== 'function') return geo;

  const kept = [];
  const triangles = pos.count / 3;
  for (let t = 0; t < triangles; t++) {
    // Deterministic scatter: every 17th and 23rd triangle becomes a crack
    if (t % 17 === 0 || t % 23 === 0) continue;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      kept.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
  }

  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kept), 3));
  if (typeof shell.computeVertexNormals === 'function') shell.computeVertexNormals();
  return shell;
}

function makeBoulder() {
  // ART DIRECTION: silhouette = a boulder the height of the devotee's chest,
  // rolling down the causeway; signature = pale cracked shell over a black core
  // that shows through the fissures, trailing dust; colors = cracked stone
  // #7a7a6a over a near-black interior.
  const boulderGroup = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x7a7a6a,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x24211c, roughness: 1.0 });

  // The rolling part: dark core plus the cracked shell around it
  const core = new THREE.Group();
  core.name = 'boulderCore';
  core.position.set(0, 0.9, 0);
  boulderGroup.add(core);

  const inner = new THREE.Mesh(new THREE.SphereGeometry(0.86, 12, 12), coreMat);
  core.add(inner);

  const shell = new THREE.Mesh(crackedShell(0.9, 12), stoneMat);
  shell.castShadow = true;
  core.add(shell);

  // A couple of dust puffs clinging to its base
  const dustMat = new THREE.MeshStandardMaterial({
    color: 0x8a7966, roughness: 0.95, transparent: true, opacity: 0.45
  });
  [[-0.7, 0.16, -0.5, 0.3], [0.65, 0.14, -0.6, 0.26], [-0.1, 0.12, -0.85, 0.22]].forEach(([x, y, z, r]) => {
    const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), dustMat);
    puff.position.set(x, y, z);
    boulderGroup.add(puff);
  });

  boulderGroup.userData.boulderCore = core;
  boulderGroup.userData.role = 'obstacle';
  boulderGroup.userData.obstacleType = 'boulder';
  boulderGroup.userData.zone = 2;
  boulderGroup.userData.bbox = { w: 1.8, h: 1.8, d: 1.8 };
  boulderGroup.userData.collider = { type: 'sphere', radius: 0.9, offset: [0, 0.9, 0] };
  // The devotee can land on top: the shell's crown sits at 1.8
  boulderGroup.userData.standHeight = 1.8;

  return boulderGroup;
}
// ===== END ASSET =====

// ===== ASSET id=temple-arch-gate label="Temple Arch Gate" role=obstacle =====
function makeTempleArch() {
  // ART DIRECTION: silhouette = a squat carved gateway straddling one lane, its
  // lintel too low to run through; signature = Sanskrit reliefs raised out of
  // the jambs, vines over the beam; the devotee slides under it or takes
  // another lane. colors = warm stone #9b8060, relief shadow #7a6449.
  const arch = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9b8060, roughness: 0.9, metalness: 0.02 });
  const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x7a6449, roughness: 0.95 });
  const carveMat = new THREE.MeshStandardMaterial({ color: 0xb59674, roughness: 0.85 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1e3d22, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2b5c31, roughness: 0.95 });

  const JAMB_X = 0.95;
  const JAMB_H = 1.35;   // lintel underside: too low to run under, fine to slide
  const JAMB_W = 0.42;

  [-1, 1].forEach(side => {
    const x = side * JAMB_X;

    // Footing
    const footing = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W + 0.22, 0.2, JAMB_W + 0.22), stoneDarkMat);
    footing.position.set(x, 0.1, 0);
    footing.receiveShadow = true;
    arch.add(footing);

    // Jamb
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W, JAMB_H, JAMB_W), stoneMat);
    jamb.position.set(x, 0.2 + JAMB_H / 2, 0);
    jamb.castShadow = true;
    arch.add(jamb);

    // Sanskrit reliefs: thin bars raised proud of the jamb face
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.02), carveMat);
      bar.position.set(x, 0.42 + i * 0.26, JAMB_W / 2 + 0.012);
      arch.add(bar);

      // the headline stroke Devanagari letters hang from
      const rule = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.02), carveMat);
      rule.position.set(x, 0.42 + i * 0.26 + 0.045, JAMB_W / 2 + 0.012);
      arch.add(rule);
    }

    // Capital under the lintel
    const capital = new THREE.Mesh(new THREE.BoxGeometry(JAMB_W + 0.2, 0.16, JAMB_W + 0.2), stoneDarkMat);
    capital.position.set(x, 0.2 + JAMB_H + 0.08, 0);
    capital.castShadow = true;
    arch.add(capital);
  });

  // Lintel across the top
  const lintelY = 0.2 + JAMB_H + 0.16 + 0.16;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(JAMB_X * 2 + JAMB_W + 0.3, 0.32, JAMB_W + 0.18), stoneMat);
  lintel.position.set(0, lintelY, 0);
  lintel.castShadow = true;
  arch.add(lintel);

  const cornice = new THREE.Mesh(new THREE.BoxGeometry(JAMB_X * 2 + JAMB_W + 0.62, 0.18, JAMB_W + 0.36), stoneDarkMat);
  cornice.position.set(0, lintelY + 0.25, 0);
  cornice.castShadow = true;
  arch.add(cornice);

  // Vines spilling over the beam
  [-0.55, 0.4].forEach((vx, i) => {
    const points = [];
    for (let s = 0; s <= 6; s++) {
      const t = s / 6;
      points.push(new THREE.Vector3(
        vx + Math.sin(t * 4 + i) * 0.12,
        lintelY + 0.3 - t * (0.9 + i * 0.4),
        JAMB_W / 2 + 0.06 + Math.cos(t * 3) * 0.05
      ));
    }
    const vine = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.03, 5, false),
      vineMat
    );
    arch.add(vine);

    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), leafMat);
    leaf.position.copy(points[points.length - 1]);
    leaf.scale.set(1.3, 0.6, 1.0);
    arch.add(leaf);
  });

  arch.userData.role = 'obstacle';
  arch.userData.obstacleType = 'archGate';
  arch.userData.zone = 2;
  // The lintel is low: sliding clears it, standing does not
  arch.userData.duckable = true;
  arch.userData.bbox = { w: 2.6, h: 2.2, d: 0.7 };

  return arch;
}
// ===== END ASSET =====

// ===== ASSET id=broken-road-pit label="Broken Causeway" role=obstacle =====
function makeBrokenRoad() {
  // ART DIRECTION: silhouette = the causeway sheared clean through, two slabs
  // with a black void between them; signature = crumbled stone teeth along both
  // broken edges, violet void light rising out of the gap; the devotee jumps it.
  const brokenGap = new THREE.Group();

  const slabMat = new THREE.MeshStandardMaterial({ color: 0xb08a63, roughness: 0.9 });
  const slabEdgeMat = new THREE.MeshStandardMaterial({ color: 0x6b5540, roughness: 0.95 });
  const voidMat = new THREE.MeshStandardMaterial({
    color: 0x07040f, emissive: 0x1b0433, emissiveIntensity: 0.7, roughness: 1.0
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x8833ff, emissive: 0xaa44ff, emissiveIntensity: 1.2
  });

  const SLAB_W = 2.0;   // one lane wide, matching what the collision actually tests
  const SLAB_D = 1.2;
  const GAP = 1.6;      // the hole itself; slabs + gap span 4 units of causeway

  // The void under the missing stone
  const voidFloor = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, 0.5, GAP), voidMat);
  voidFloor.position.set(0, -0.55, 0);
  brokenGap.add(voidFloor);

  const voidWalls = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W - 0.04, 0.6, GAP - 0.04), voidMat);
  voidWalls.position.set(0, -0.28, 0);
  brokenGap.add(voidWalls);

  // The two surviving platforms, fore and aft of the hole
  [-1, 1].forEach(side => {
    const z = side * (GAP / 2 + SLAB_D / 2);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, 0.24, SLAB_D), slabMat);
    slab.position.set(0, -0.1, z);
    slab.receiveShadow = true;
    brokenGap.add(slab);

    const lip = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, 0.06, 0.1), slabEdgeMat);
    lip.position.set(0, 0.02, z - side * (SLAB_D / 2));
    brokenGap.add(lip);

    // Crumbled teeth along the broken edge
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + Math.random() * 0.07, 0), slabEdgeMat);
      tooth.position.set(
        -SLAB_W / 2 + 0.2 + i * (SLAB_W - 0.4) / 4,
        -0.04,
        z - side * (SLAB_D / 2 + 0.02)
      );
      tooth.scale.set(1.0, 0.55, 0.8);
      tooth.rotation.y = Math.random() * Math.PI;
      brokenGap.add(tooth);
    }

    // Violet rune light along the fracture
    const crack = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W - 0.15, 0.02, 0.07), glowMat);
    crack.position.set(0, 0.03, z - side * (SLAB_D / 2 - 0.06));
    brokenGap.add(crack);
  });

  brokenGap.userData.role = 'obstacle';
  brokenGap.userData.obstacleType = 'brokenRoad';
  brokenGap.userData.zone = 2;
  brokenGap.userData.bbox = { w: SLAB_W, h: 0.5, d: GAP + SLAB_D * 2 };

  return brokenGap;
}
// ===== END ASSET =====

const OBSTACLE_POOL_SIZE = 21;
const obstaclePool = [];

// Pre-builds every hazard once; spawning only toggles visibility afterwards.
export function createObstaclePool(scene) {
  const builders = [makeFirePit, makeBoulder, makeTempleArch, makeAsuraDemon,
                    makeBrokenRoad, makeEvilSoul, makeCobra];

  builders.forEach(build => {
    for (let i = 0; i < 3; i++) {
      const obs = build();
      obs.visible = false;
      scene.add(obs);
      obstaclePool.push(obs);
      window.__gameEntities.registerObstacle(obs);
    }
  });

  return obstaclePool;
}

export function getObstaclePool() {
  return obstaclePool;
}

// Rolls the boulder toward the player and kicks up its dust trail.
export function updateBoulder(obs, dt, speed) {
  const core = obs.userData.boulderCore;
  if (core) core.rotation.x += speed * dt;

  if (Math.random() < 0.25) {
    spawnFX(new THREE.Vector3(obs.position.x, 0.1, obs.position.z), '#8a7966', 1, 0.3);
  }
}

// Flickers the three tongues of flame in the pit.
export function updateFirePit(obs, clock) {
  const flames = obs.userData.flames;
  if (!flames) return;
  const time = clock.getElapsedTime();
  for (let i = 0; i < flames.length; i++) {
    const flame = flames[i];
    const base = flame.userData.baseScale || 1;
    flame.scale.y = base * (Math.sin(time * 12 + flame.userData.phase) * 0.3 + 1.0);
  }
}

export { makeTempleArch, makeFirePit, makeBoulder, makeBrokenRoad, OBSTACLE_POOL_SIZE };
