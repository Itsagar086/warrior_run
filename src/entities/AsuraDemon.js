// Asura demons: horned brutes that charge the devotee down the lane, closing
// faster than the world scrolls.
//
// The body is one continuous SDF-sculpted, skinned mesh (see utils/SdfKit.js):
// hulking traps, a gut, ape-heavy forearms - with the war paint, the loincloth
// and the black mane painted into vertex colours, and the horns, tusks, claws,
// burning eyes and a spiked club riding the bones as rigid accessories.
// updateAsura is untouched: it finds torso/head/arm/leg by name, and those
// names now belong to BONES, so the same rotations bend the brute smoothly.
import * as THREE from 'three';
import { swing, swingOpposed, bounce } from '../utils/AnimationHelper.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  orb, blob, tube, add, cut,
  bakeMesh, computeSkinAttributes, bakeVertexColors, buildSkeleton,
} from '../utils/SdfKit.js';

const HIP = 0.78;

// Joint landmarks. Left is -x; the demon faces +z, toward the player.
const SHO = [0.54, 1.28, 0];
const ELB = [0.63, 0.84, 0.02];
const WRI = [0.66, 0.44, 0.07];
const LEG_X = 0.24;
const KNEE = [0.25, 0.42, 0.02];
const ANKLE = [0.25, 0.10, -0.02];

function demonOps() {
  const ops = [];
  const O = (p, k) => ops.push(add(p, k));

  /* trunk: gut-heavy, top-heavier */
  O(blob(0, 0.80, 0, 0.27, 0.17, 0.21), 0.06);                          // pelvis
  O(orb(0, 0.92, 0.09, 0.26), 0.07);                                     // gut
  O(tube(-0.16, 1.22, 0, 0.16, 1.22, 0, 0.235, 0.235), 0.08);            // chest barrel
  O(tube(-0.10, 1.36, 0, 0.10, 1.36, 0, 0.20, 0.20), 0.07);              // upper chest
  for (const s of [-1, 1]) {
    O(tube(s * 0.05, 1.50, -0.02, s * 0.40, 1.34, -0.01, 0.085, 0.085), 0.06); // trapezius slab
    O(orb(s * 0.52, 1.28, 0, 0.15), 0.05);                                     // deltoid boulder
    O(tube(s * 0.34, 1.18, -0.09, s * 0.20, 0.92, -0.06, 0.085, 0.075), 0.06); // latissimus
    O(blob(s * 0.17, 1.20, 0.185, 0.135, 0.10, 0.06), 0.05);                   // pectoral
  }
  ops.push(cut(tube(0, 0.95, -0.245, 0, 1.42, -0.275, 0.03, 0.03), 0.05));     // spine groove

  /* head, low between the shoulders */
  O(tube(0, 1.38, 0.01, 0, 1.58, 0.04, 0.105, 0.110), 0.05);             // bull neck
  O(blob(0, 1.68, 0.06, 0.155, 0.145, 0.150), 0.04);                     // skull
  O(blob(0, 1.56, 0.15, 0.115, 0.065, 0.095), 0.04);                     // jaw
  O(tube(-0.09, 1.735, 0.175, 0.09, 1.735, 0.175, 0.035, 0.035), 0.03);  // heavy brow

  /* arms: ape-long, forearms thicker than the biceps */
  for (const s of [-1, 1]) {
    const S = [s * SHO[0], SHO[1], SHO[2]];
    const E = [s * ELB[0], ELB[1], ELB[2]];
    const W = [s * WRI[0], WRI[1], WRI[2]];
    O(tube(S[0], S[1], S[2], E[0], E[1], E[2], 0.105, 0.085), 0.05);
    O(orb(E[0], E[1], E[2], 0.08), 0.04);
    O(tube(E[0], E[1], E[2], W[0], W[1], W[2], 0.115, 0.088), 0.05);
    O(blob(W[0], W[1] - 0.06, W[2] + 0.02, 0.095, 0.105, 0.10), 0.04);   // fist
  }

  /* legs: short and planted */
  for (const s of [-1, 1]) {
    const H = [s * LEG_X, HIP, 0];
    const K = [s * KNEE[0], KNEE[1], KNEE[2]];
    const A = [s * ANKLE[0], ANKLE[1], ANKLE[2]];
    O(tube(H[0], H[1], H[2], K[0], K[1], K[2], 0.125, 0.095), 0.05);
    O(orb(K[0], K[1], K[2], 0.09), 0.04);
    O(tube(K[0], K[1], K[2], A[0], A[1], A[2], 0.095, 0.065), 0.045);
    O(blob(s * 0.25, 0.30, -0.07, 0.07, 0.09, 0.06), 0.04);              // calf
    O(tube(A[0], A[1], A[2], s * 0.25, 0.06, 0.20, 0.07, 0.06), 0.04);   // splayed foot
    O(orb(s * 0.25, 0.08, -0.09, 0.06), 0.03);                            // heel
  }

  return ops;
}

// Everything that is colour rather than geometry: the maroon hide, the lighter
// chest, the red war paint, the dark loincloth, the black mane. Painted per
// vertex, so the whole brute stays ONE mesh and one draw call.
function demonAlbedo(x, y, z, nx, ny, nz, out) {
  let r = 0.30, g = 0.17, b = 0.22;                        // maroon-purple hide

  if (z > 0.05 && y > 0.70 && y < 1.38 && Math.abs(x) < 0.32) {
    r = 0.42; g = 0.22; b = 0.23;                          // lit chest and gut
  }
  if ((Math.abs(x) > 0.44 && y < 1.0) || y < 0.45) {
    r *= 0.72; g *= 0.72; b *= 0.72;                       // forearms and shins darker
  }

  // War paint: verticals across the chest, rings on the arms, slashes on the back.
  const paint =
    (z > 0.12 && y > 1.0 && y < 1.38 && Math.abs(Math.sin(x * 14)) > 0.80) ||
    (Math.abs(x) > 0.40 && y > 0.95 && Math.abs(Math.sin(y * 22)) > 0.86) ||
    (z < -0.10 && y > 0.85 && y < 1.45 && Math.abs(Math.sin((x + y) * 10)) > 0.87);
  if (paint) { r = 0.62; g = 0.12; b = 0.08; }

  // Loincloth wrap.
  if (y > 0.54 && y < 0.94 && Math.abs(x) < 0.34) { r = 0.12; g = 0.09; b = 0.07; }

  // The mane: black, over the crown and pouring down the back of the neck.
  if ((y > 1.70 && z < 0.10) || (z < -0.14 && y > 1.42 && Math.abs(x) < 0.24)) {
    r = 0.06; g = 0.05; b = 0.06;
  }

  out[0] = r; out[1] = g; out[2] = b;
}

let template = null;

// ===== ASSET id=running-demon-asura label="Asura Running Demon" role=obstacle =====
function buildTemplate() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.62, metalness: 0.03, vertexColors: true,
  });
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xd8c9ac, roughness: 0.5, metalness: 0.05 });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x241a16, roughness: 0.5, metalness: 0.3 });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffaa22, emissive: 0xff5500, emissiveIntensity: 2.0, roughness: 0.3,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x494950, roughness: 0.45, metalness: 0.6 });

  const bake = bakeMesh(demonOps(), { min: [-0.95, -0.05, -0.34], max: [0.95, 1.95, 0.46] }, 100);

  /* skeleton, named exactly as updateAsura expects */
  const skel = buildSkeleton([
    { name: 'torso', parent: null, pos: [0, HIP, 0] },
    { name: 'head', parent: 'torso', pos: [0, 1.52, 0.05] },
    { name: 'armL', parent: 'torso', pos: [-SHO[0], SHO[1], SHO[2]] },
    { name: 'forearmL', parent: 'armL', pos: [-ELB[0], ELB[1], ELB[2]] },
    { name: 'armR', parent: 'torso', pos: [SHO[0], SHO[1], SHO[2]] },
    { name: 'forearmR', parent: 'armR', pos: [ELB[0], ELB[1], ELB[2]] },
    { name: 'legL', parent: null, pos: [-LEG_X, HIP, 0] },
    { name: 'shinL', parent: 'legL', pos: [-KNEE[0], KNEE[1], KNEE[2]] },
    { name: 'legR', parent: null, pos: [LEG_X, HIP, 0] },
    { name: 'shinR', parent: 'legR', pos: [KNEE[0], KNEE[1], KNEE[2]] },
  ]);
  const B = skel.byName;
  const boneIndex = {};
  skel.list.forEach((bone, i) => { boneIndex[bone.name] = i; });

  const seg = (a, b, bias) => ({ a, b, bias: bias || 0 });
  const segs = [];
  segs[boneIndex.torso] = { segs: [
    seg([0, 0.80, 0], [0, 1.42, 0], 0.02),
    seg([-0.30, 0.95, -0.03], [-0.44, 1.30, -0.02], 0.015),
    seg([0.30, 0.95, -0.03], [0.44, 1.30, -0.02], 0.015),
  ] };
  segs[boneIndex.head] = { segs: [seg([0, 1.52, 0.04], [0, 1.82, 0.06])] };
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    segs[boneIndex['arm' + side]] = { segs: [seg([s * SHO[0], SHO[1], SHO[2]], [s * ELB[0], ELB[1], ELB[2]])] };
    segs[boneIndex['forearm' + side]] = { segs: [seg([s * ELB[0], ELB[1], ELB[2]], [s * 0.66, 0.34, 0.09])] };
    segs[boneIndex['leg' + side]] = { segs: [seg([s * LEG_X, HIP, 0], [s * KNEE[0], KNEE[1], KNEE[2]])] };
    segs[boneIndex['shin' + side]] = { segs: [seg([s * KNEE[0], KNEE[1], KNEE[2]], [s * 0.25, 0.06, 0.18])] };
  }
  const P = (a, b) => [boneIndex[a], boneIndex[b]];
  computeSkinAttributes(bake.geometry, segs, [
    P('torso', 'head'),
    P('torso', 'armL'), P('torso', 'armR'),
    P('armL', 'forearmL'), P('armR', 'forearmR'),
    P('torso', 'legL'), P('torso', 'legR'), P('legL', 'legR'),
    P('legL', 'shinL'), P('legR', 'shinR'),
  ], 0.06);

  bakeVertexColors(bake.geometry, bake.sdf, { floor: 0.45, albedo: demonAlbedo });

  const mesh = new THREE.SkinnedMesh(bake.geometry, bodyMat);
  mesh.name = 'asura-body';
  mesh.castShadow = true;
  for (const b of skel.roots) mesh.add(b);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(skel.list));

  // Pose slack for frustum culling: the demons are pooled, so culling must
  // keep working - a generous bounding sphere covers every animation pose.
  bake.geometry.computeBoundingSphere();
  bake.geometry.boundingSphere.radius *= 1.6;

  /* -------------------------------------------------- rigid accessories */
  // Demons are POOLED: several can be on screen, and every mesh is a draw
  // call. So the rigid trim is baked down per bone, per material - horns,
  // spurs and tusks become one mesh, the mane one, each fist's claws one, the
  // club two (wood and iron) - 11 meshes per demon instead of 36.
  const euler = new THREE.Euler();
  const m4 = new THREE.Matrix4();
  const baked = [];
  const bakeInto = (geo, x, y, z, rx, ry, rz) => {
    const g = geo.clone();
    m4.makeRotationFromEuler(euler.set(rx || 0, ry || 0, rz || 0));
    m4.setPosition(x, y, z);
    g.applyMatrix4(m4);
    baked.push(g);
    geo.dispose();
    return g;
  };
  const flush = (bone, mat, shadow = true) => {
    const merged = new THREE.Mesh(mergeGeometries(baked.splice(0), false), mat);
    merged.castShadow = shadow;
    bone.add(merged);
    return merged;
  };

  // Head bone-ware: the horn crown, spurs and tusks share the bone material...
  for (const s2 of [-1, 1]) {
    bakeInto(new THREE.ConeGeometry(0.11, 0.46, 7), s2 * 0.21, 0.40, -0.02, -0.18, 0, s2 * -0.55);
    bakeInto(new THREE.ConeGeometry(0.06, 0.2, 6), s2 * 0.24, 0.30, -0.15, 0, 0, s2 * -0.7);
    bakeInto(new THREE.ConeGeometry(0.030, 0.12, 6), s2 * 0.105, 0.095, 0.185, 0, 0, 0);
  }
  flush(B.head, hornMat);

  // ...the mane is its own dark crest...
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x14100f, roughness: 0.8 });
  for (const [mx, my, mz, rx, len] of [
    [0, 0.34, -0.10, -0.9, 0.30], [0, 0.28, -0.17, -1.25, 0.26],
    [-0.09, 0.30, -0.13, -1.05, 0.24], [0.09, 0.30, -0.13, -1.05, 0.24],
    [0, 0.20, -0.21, -1.5, 0.22],
  ]) bakeInto(new THREE.ConeGeometry(0.055, len, 6), mx, my, mz, rx, 0, 0);
  flush(B.head, maneMat);

  // ...and the burning eyes stay separate: they glow, nothing else does.
  for (const s2 of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), eyeMat);
    eye.position.set(s2 * 0.09, 0.185, 0.165);
    B.head.add(eye);
  }

  // Claws per fist, talons per foot.
  for (const s2 of [-1, 1]) {
    for (let i = -1; i <= 1; i++) {
      bakeInto(new THREE.ConeGeometry(0.03, 0.11, 5), s2 * 0.03 + i * 0.07, -0.50, 0.14, 0.6, 0, 0);
    }
    flush(B[s2 < 0 ? 'forearmL' : 'forearmR'], clawMat, false);
    for (let i = -1; i <= 1; i++) {
      bakeInto(new THREE.ConeGeometry(0.035, 0.12, 5), i * 0.08, -0.35, 0.26, Math.PI / 2, 0, 0);
    }
    flush(B[s2 < 0 ? 'shinL' : 'shinR'], clawMat, false);
  }

  // The spiked club, gripped in the right fist: every arm pump in updateAsura
  // swings it. Baked in club-local space, then hung off the forearm bone.
  const clubFrame = new THREE.Matrix4().makeRotationX(1.05).setPosition(0.03, -0.46, 0.08);
  bakeInto(new THREE.CylinderGeometry(0.035, 0.042, 0.72, 7), 0, 0.22, 0);
  baked[baked.length - 1].applyMatrix4(clubFrame);
  const wood = flush(B.forearmR, woodMat);
  void wood;
  const headGeo = new THREE.SphereGeometry(0.115, 10, 8);
  headGeo.scale(1, 1.25, 1);
  bakeInto(headGeo, 0, 0.58, 0);
  baked[baked.length - 1].applyMatrix4(clubFrame);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bakeInto(new THREE.ConeGeometry(0.028, 0.11, 5),
      Math.cos(a) * 0.115, 0.58 + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.115,
      Math.sin(a) * Math.PI / 2 * 0.9, 0, -Math.cos(a) * Math.PI / 2 * 0.9);
    baked[baked.length - 1].applyMatrix4(clubFrame);
  }
  flush(B.forearmR, ironMat);

  group.userData.role = 'obstacle';
  group.userData.obstacleType = 'asura';
  group.userData.zone = 2;
  group.userData.bbox = { w: 1.6, h: 2.0, d: 1.1 };

  return group;
}

function makeAsuraDemon() {
  // The sculpt bakes once; every pooled demon is a skeleton-aware clone that
  // shares the geometry and materials.
  if (!template) template = buildTemplate();
  return cloneSkinned(template);
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
