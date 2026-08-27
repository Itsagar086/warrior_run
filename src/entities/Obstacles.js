// The hazards of the Snake Way: the sacred fire pit that ends a run outright,
// the rolling boulder, the temple arch you must duck under, and the broken
// causeway you must jump. Plus the shared recycled obstacle pool.
import * as THREE from 'three';
import { spawnFX } from '../systems/FXSystem.js';
import { makeRadialGlowTexture } from '../environment/Lighting.js';
import { makeInscriptionTexture } from '../environment/Track.js';
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

  // Logs stacked across the coals, as in the reference campfire
  const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3221, roughness: 0.95 });
  const logCharMat = new THREE.MeshStandardMaterial({
    color: 0x231710, emissive: 0xff4400, emissiveIntensity: 0.5, roughness: 0.9
  });
  [[-0.18, 0.26, 0.5], [0.2, -0.22, -0.6], [0.0, 0.02, 1.35]].forEach(([lx, lz, rot], i) => {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.075, 0.92, 7), i === 2 ? logCharMat : logMat);
    log.position.set(lx, 0.26, lz);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rot;
    log.castShadow = true;
    firePit.add(log);
  });

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

  // The pit's point light is not parented here on purpose - see syncFireLights
  // in Lighting.js. A light that toggles with a pooled obstacle changes the
  // scene's light count and forces three.js to recompile every shader.

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
    color: 0x8f9179,
    roughness: 0.94,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide
  });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x1d1f18, roughness: 1.0 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x4a6b34, roughness: 1.0, flatShading: true });

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

  // Moss clinging to the shell, as on the reference's weathered ball
  [[0.42, 0.62, 0.38, 0.34], [-0.55, 0.3, -0.5, 0.28], [0.1, -0.6, 0.62, 0.3], [-0.3, 0.2, 0.78, 0.22]]
    .forEach(([mx, my, mz, r]) => {
      const patch = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 6), mossMat);
      patch.position.set(mx, my, mz).multiplyScalar(1.06);
      patch.scale.set(1, 0.5, 1);
      core.add(patch);
    });

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
  // ART DIRECTION: silhouette = a thick carved slab lying square across the
  // lane, high enough to catch a running foot; signature = Sanskrit cut into
  // its face and molten gold light along the leading edge, matching the
  // reference tile; the devotee jumps it. colors = path sandstone #c4956a with
  // a gold #ffaa22 edge.
  const slabGroup = new THREE.Group();

  const slabMat = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.88 });
  const slabTopMat = new THREE.MeshStandardMaterial({ color: 0xd3a479, roughness: 0.82 });
  const slabEdgeMat = new THREE.MeshStandardMaterial({ color: 0x7d6046, roughness: 0.95 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffaa22, emissive: 0xff8800, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.5
  });

  const SLAB_W = 2.0;   // one lane wide, matching what the collision actually tests
  const SLAB_D = 1.7;
  const SLAB_H = 0.52;  // tall enough that running into it is a trip, not a step

  // The block itself, sunk slightly so it sits into the causeway
  const body = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W, SLAB_H, SLAB_D), slabMat);
  body.position.set(0, SLAB_H / 2 - 0.06, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  slabGroup.add(body);

  // Cut top face, split into tiles like the reference
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j += 2) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W / 3 - 0.06, 0.04, SLAB_D / 2 - 0.06), slabTopMat);
      tile.position.set(i * (SLAB_W / 3), SLAB_H - 0.05, j * (SLAB_D / 4));
      slabGroup.add(tile);
    }
  }

  // Sanskrit carved across the face, the same decal the causeway uses
  const texture = makeInscriptionTexture();
  if (texture) {
    const carving = new THREE.Mesh(
      new THREE.PlaneGeometry(SLAB_W * 0.82, SLAB_D * 0.42),
      new THREE.MeshStandardMaterial({
        map: texture, transparent: true, color: 0xffffff, roughness: 1.0,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2
      })
    );
    carving.rotation.x = -Math.PI / 2;
    carving.position.set(0, SLAB_H - 0.02, 0);
    slabGroup.add(carving);
  }

  // Chiselled side courses
  [-1, 1].forEach(side => {
    const course = new THREE.Mesh(new THREE.BoxGeometry(0.06, SLAB_H * 0.7, SLAB_D), slabEdgeMat);
    course.position.set(side * (SLAB_W / 2), SLAB_H * 0.4, 0);
    slabGroup.add(course);
  });

  // Molten gold along the leading edge - the read at speed, and the warning
  [-1, 1].forEach(side => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(SLAB_W + 0.05, 0.09, 0.1), goldMat);
    edge.position.set(0, SLAB_H - 0.08, side * (SLAB_D / 2));
    slabGroup.add(edge);

    const spill = new THREE.Mesh(
      new THREE.BoxGeometry(SLAB_W + 0.4, 0.012, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.22, depthWrite: false })
    );
    spill.position.set(0, 0.02, side * (SLAB_D / 2 + 0.18));
    slabGroup.add(spill);
  });

  slabGroup.userData.role = 'obstacle';
  slabGroup.userData.obstacleType = 'brokenRoad';
  slabGroup.userData.zone = 2;
  slabGroup.userData.bbox = { w: SLAB_W, h: SLAB_H, d: SLAB_D };

  return slabGroup;
}
// ===== END ASSET =====

// Scratch vector reused by the dust trail, so the hot loop allocates nothing.
const dustPoint = new THREE.Vector3();

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
    dustPoint.set(obs.position.x, 0.1, obs.position.z);
    spawnFX(dustPoint, '#8a7966', 1, 0.3);
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
