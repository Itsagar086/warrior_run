// The devotee warrior's body: a continuous, muscled, skinned figure.
//
// Built with SdfKit: the anatomy is authored as blended signed-distance
// volumes - trapezius, deltoids, lats, pectorals, biceps, forearm flexors,
// quads, calves - polygonised into ONE seamless mesh and skinned to a
// skeleton. The existing run/jump/slide animation drives the BONES (bones are
// Object3Ds, so the animation code that rotated group pivots works unchanged),
// and the GPU bends the mesh smoothly at every joint. No seams, no robot.
//
// Landmarks come from the measured character sheet: soles y=0, knee 0.599,
// hip 1.05, shoulder 1.715, crown ~2.07. The camera rides behind the runner,
// so the back carries the anatomy budget.
import * as THREE from 'three';
import {
  orb, blob, tube, slabAbove, slabBelow, add, cut,
  bakeMesh, computeSkinAttributes, bakeVertexColors, buildSkeleton, beadRing,
} from '../utils/SdfKit.js';

const HIP = 1.05, KNEE = 0.599, ANKLE = 0.113, SHOULDER = 1.715, HEAD_BONE = 1.86;

// Arm chain, hanging with a natural ~12 degree abduction baked into the sculpt
// (the animation's swings sit on top of it). Left is -x, matching the game.
const SHO = [0.232, SHOULDER, -0.008];
const ARM_DIR = [0.208, -0.978, 0];
const ELB = [SHO[0] + ARM_DIR[0] * 0.42, SHO[1] + ARM_DIR[1] * 0.42, SHO[2]];
const WRI = [ELB[0] + 0.022, ELB[1] - 0.356, ELB[2] + 0.018];

// Leg chain, vertical.
const LEG_X = 0.100;

function bodyOps() {
  const ops = [];
  const O = (p, k) => ops.push(add(p, k));

  /* torso core */
  O(blob(0, 1.08, 0, 0.150, 0.130, 0.105), 0.05);                      // pelvis
  O(tube(0, 1.10, 0, 0, 1.42, 0.012, 0.118, 0.128), 0.06);             // abdominal column
  O(tube(-0.07, 1.55, 0.008, 0.07, 1.55, 0.008, 0.150, 0.150), 0.07);  // ribcage barrel
  O(tube(-0.09, 1.655, 0, 0.09, 1.655, 0, 0.115, 0.115), 0.06);        // upper chest
  O(blob(0, 1.34, 0.078, 0.088, 0.105, 0.045), 0.05);                  // abdominal plate

  /* the back - what the player actually sees */
  for (const s of [-1, 1]) {
    O(tube(s * 0.035, 1.772, -0.02, s * 0.195, 1.692, -0.03, 0.052, 0.052), 0.045); // trapezius
    O(orb(s * 0.264, 1.692, -0.005, 0.094), 0.04);                                  // deltoid
    O(tube(s * 0.185, 1.60, -0.055, s * 0.110, 1.30, -0.035, 0.063, 0.054), 0.05);  // latissimus
    O(blob(s * 0.088, 1.615, 0.095, 0.088, 0.066, 0.048), 0.04);                    // pectoral
    O(orb(s * 0.078, 1.015, -0.058, 0.070), 0.05);                                  // glute
  }
  for (const s of [-1, 1]) {
    O(tube(s * 0.038, 1.18, -0.105, s * 0.042, 1.56, -0.112, 0.026, 0.026), 0.04);  // erector ridge
  }
  ops.push(cut(tube(0, 1.16, -0.158, 0, 1.70, -0.188, 0.028, 0.028), 0.05));        // spine groove

  /* neck + head */
  O(tube(0, 1.72, 0, 0, 1.885, 0.01, 0.056, 0.064), 0.04);
  O(blob(0, 1.972, 0.008, 0.098, 0.118, 0.104), 0.03);                 // skull
  O(blob(0, 1.888, 0.040, 0.073, 0.056, 0.078), 0.03);                 // jaw
  O(blob(0, 1.960, 0.108, 0.020, 0.017, 0.022), 0.02);                 // nose
  O(tube(-0.045, 2.006, 0.092, 0.045, 2.006, 0.092, 0.015, 0.015), 0.02); // brow ridge

  /* arms */
  for (const s of [-1, 1]) {
    const S = [s * SHO[0], SHO[1], SHO[2]];
    const E = [s * ELB[0], ELB[1], ELB[2]];
    const W = [s * WRI[0], WRI[1], WRI[2]];
    O(tube(S[0], S[1], S[2], E[0], E[1], E[2], 0.079, 0.061), 0.045);
    O(orb(S[0] + s * 0.035, S[1] - 0.165, S[2] + 0.022, 0.070), 0.04); // bicep
    O(orb(E[0], E[1], E[2], 0.058), 0.03);                              // elbow
    O(tube(E[0], E[1], E[2], W[0], W[1], W[2], 0.065, 0.041), 0.04);   // forearm (flexor-heavy)
    O(blob(W[0], W[1] - 0.048, W[2] + 0.014, 0.058, 0.068, 0.063), 0.03); // fist
  }

  /* legs */
  for (const s of [-1, 1]) {
    const H = [s * LEG_X, HIP, 0.004];
    const K = [s * LEG_X, KNEE, 0.010];
    const A = [s * LEG_X, ANKLE, -0.012];
    O(tube(H[0], H[1], H[2], K[0], K[1], K[2], 0.112, 0.080), 0.05);
    O(blob(s * LEG_X, 0.86, 0.064, 0.068, 0.105, 0.056), 0.05);         // quadriceps
    O(orb(K[0], K[1], K[2], 0.070), 0.035);                              // knee
    O(tube(K[0], K[1], K[2], A[0], A[1], A[2], 0.070, 0.044), 0.04);    // shin
    O(blob(s * (LEG_X + 0.004), 0.455, -0.056, 0.060, 0.092, 0.058), 0.04); // calf
    O(orb(A[0], A[1], A[2], 0.047), 0.03);                               // ankle
    O(blob(s * LEG_X, 0.070, -0.085, 0.056, 0.060, 0.062), 0.03);        // heel, projecting back
    O(blob(s * LEG_X, 0.064, 0.055, 0.064, 0.058, 0.110), 0.035);        // instep
    O(blob(s * LEG_X, 0.052, 0.160, 0.072, 0.048, 0.070), 0.03);         // forefoot
    for (const tx of [-0.034, 0, 0.034]) {
      O(blob(s * LEG_X + tx, 0.040, 0.218, 0.023, 0.021, 0.030), 0.02);  // toes
    }
  }

  return ops;
}

// The dhoti: bound at the waist, wrapped over the hips as ONE mass (a centre
// gap is what makes cloth read as shorts), carried down each thigh, cut at a
// knee-length hem. The fold ridges are sculpted in, not painted on.
function clothOps() {
  const ops = [];
  const O = (p, k) => ops.push(add(p, k));

  O(blob(0, 1.09, 0.004, 0.186, 0.158, 0.162), 0.06);                        // hip wrap
  for (const s of [-1, 1]) {
    O(tube(s * 0.100, 1.02, 0.006, s * 0.108, 0.635, 0.014, 0.130, 0.148), 0.06); // leg skirt, flaring
    O(tube(s * 0.075, 1.00, 0.145, s * 0.088, 0.68, 0.162, 0.020, 0.023), 0.03);  // front fold ridge
    O(tube(s * 0.163, 0.98, 0.055, s * 0.186, 0.70, 0.045, 0.020, 0.022), 0.03);  // side fold ridge
  }
  O(tube(0, 1.03, 0.132, 0, 0.70, 0.158, 0.060, 0.074), 0.05);               // hanging front drape
  O(blob(0, 0.86, -0.128, 0.088, 0.165, 0.034), 0.05);                       // back fold cascade

  ops.push(cut(slabAbove(1.175), 0.04));                                     // waistline
  // The hem tilts: higher on the left leg, lower on the right, which is the
  // asymmetric drape every wrapped dhoti actually has.
  ops.push(cut({
    aabb: [-1e9, -1e9, -1e9, 1e9, 0.75, 1e9],
    dist(px, py) { return py - (0.655 - 0.30 * px); },
  }, 0.05));

  return ops;
}

export function buildWarrior() {
  const root = new THREE.Group();
  root.name = 'devotee-warrior';

  /* ------------------------------------------------------------ materials */
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xba7847, roughness: 0.55, metalness: 0.02, vertexColors: true,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0xe89417, roughness: 0.85, metalness: 0.0, vertexColors: true,
  });
  const sashMat = new THREE.MeshStandardMaterial({ color: 0xbb6a08, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x191113, roughness: 0.55 });
  const beadMat = new THREE.MeshStandardMaterial({ color: 0x5e3317, roughness: 0.7 });
  const janeuMat = new THREE.MeshStandardMaterial({
    color: 0xefe6d2, roughness: 0.5, emissive: 0x2a2318, emissiveIntensity: 0.6,
  });
  const tilakMat = new THREE.MeshStandardMaterial({
    color: 0xd42a12, emissive: 0xd42a12, emissiveIntensity: 0.5, roughness: 0.5,
  });

  /* ----------------------------------------------------------- the meshes */
  const bOps = bodyOps();
  const body = bakeMesh(bOps, { min: [-0.48, -0.06, -0.30], max: [0.48, 2.16, 0.30] }, 104);
  const cOps = clothOps();
  const clothBox = { min: [-0.42, 0.50, -0.34], max: [0.42, 1.30, 0.34] };
  const clothBake = bakeMesh(cOps, clothBox, 88);

  /* ------------------------------------------------------------- skeleton */
  const skel = buildSkeleton([
    { name: 'torso', parent: null, pos: [0, HIP, 0] },
    { name: 'head', parent: 'torso', pos: [0, HEAD_BONE, 0.01] },
    { name: 'upperArmL', parent: 'torso', pos: [-SHO[0], SHO[1], SHO[2]] },
    { name: 'forearmL', parent: 'upperArmL', pos: [-ELB[0], ELB[1], ELB[2]] },
    { name: 'upperArmR', parent: 'torso', pos: [SHO[0], SHO[1], SHO[2]] },
    { name: 'forearmR', parent: 'upperArmR', pos: [ELB[0], ELB[1], ELB[2]] },
    { name: 'thighL', parent: null, pos: [-LEG_X, HIP, 0.004] },
    { name: 'shinL', parent: 'thighL', pos: [-LEG_X, KNEE, 0.010] },
    { name: 'footL', parent: 'shinL', pos: [-LEG_X, ANKLE, -0.012] },
    { name: 'thighR', parent: null, pos: [LEG_X, HIP, 0.004] },
    { name: 'shinR', parent: 'thighR', pos: [LEG_X, KNEE, 0.010] },
    { name: 'footR', parent: 'shinR', pos: [LEG_X, ANKLE, -0.012] },
  ]);
  const B = skel.byName;
  const boneIndex = {};
  skel.list.forEach((bone, i) => { boneIndex[bone.name] = i; });

  // Flesh maps: which line segments each bone's tissue lives along. The torso
  // gets side rails with a bias so the lats stay with the trunk even where an
  // arm hangs close - THE fix for the smeared-shoulder failure.
  const seg = (a, b, bias) => ({ a, b, bias: bias || 0 });
  const bodySegs = [];
  bodySegs[boneIndex.torso] = { segs: [
    seg([0, 1.06, 0], [0, 1.70, 0], 0.015),
    seg([-0.17, 1.18, -0.02], [-0.215, 1.66, -0.02], 0.012),
    seg([0.17, 1.18, -0.02], [0.215, 1.66, -0.02], 0.012),
  ] };
  bodySegs[boneIndex.head] = { segs: [seg([0, 1.86, 0.01], [0, 2.09, 0.01])] };
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    bodySegs[boneIndex['upperArm' + side]] = { segs: [seg([s * SHO[0], SHO[1], SHO[2]], [s * ELB[0], ELB[1], ELB[2]])] };
    bodySegs[boneIndex['forearm' + side]] = { segs: [seg([s * ELB[0], ELB[1], ELB[2]], [s * WRI[0], WRI[1] - 0.09, WRI[2] + 0.01])] };
    bodySegs[boneIndex['thigh' + side]] = { segs: [seg([s * LEG_X, HIP, 0.004], [s * LEG_X, KNEE, 0.010])] };
    bodySegs[boneIndex['shin' + side]] = { segs: [seg([s * LEG_X, KNEE, 0.010], [s * LEG_X, ANKLE, -0.012])] };
    bodySegs[boneIndex['foot' + side]] = { segs: [seg([s * LEG_X, ANKLE, -0.012], [s * LEG_X, 0.045, 0.20])] };
  }
  const P = (a, b) => [boneIndex[a], boneIndex[b]];
  const bodyPairs = [
    P('torso', 'head'),
    P('torso', 'upperArmL'), P('torso', 'upperArmR'),
    P('upperArmL', 'forearmL'), P('upperArmR', 'forearmR'),
    P('torso', 'thighL'), P('torso', 'thighR'), P('thighL', 'thighR'),
    P('thighL', 'shinL'), P('thighR', 'shinR'),
    P('shinL', 'footL'), P('shinR', 'footR'),
  ];
  computeSkinAttributes(body.geometry, bodySegs, bodyPairs, 0.055);

  // Cloth hangs off the waist and both thighs, and must bridge between the
  // legs - a wider blend band is what lets the skirt stretch with the stride
  // instead of tearing down the middle.
  const clothSegs = [];
  clothSegs[boneIndex.torso] = { segs: [seg([0, 1.04, 0], [0, 1.17, 0], 0.02)] };
  clothSegs[boneIndex.head] = { segs: [seg([0, 99, 0], [0, 99.1, 0])] };
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    clothSegs[boneIndex['upperArm' + side]] = { segs: [seg([s * 9, 0, 0], [s * 9, 0.1, 0])] };
    clothSegs[boneIndex['forearm' + side]] = { segs: [seg([s * 9, 1, 0], [s * 9, 1.1, 0])] };
    clothSegs[boneIndex['thigh' + side]] = { segs: [seg([s * LEG_X, 1.00, 0.004], [s * LEG_X, 0.62, 0.010])] };
    clothSegs[boneIndex['shin' + side]] = { segs: [seg([s * 9, 2, 0], [s * 9, 2.1, 0])] };
    clothSegs[boneIndex['foot' + side]] = { segs: [seg([s * 9, 3, 0], [s * 9, 3.1, 0])] };
  }
  const clothPairs = [P('torso', 'thighL'), P('torso', 'thighR'), P('thighL', 'thighR')];
  computeSkinAttributes(clothBake.geometry, clothSegs, clothPairs, 0.09);

  /* -------------------------------------------------------------- shading */
  bakeVertexColors(body.geometry, body.sdf, {
    floor: 0.5,
    albedo(x, y, z, nx, ny, nz, out) {
      let m = 1;
      if (y < 0.13) m = 1 - 0.20 * Math.min(1, (0.13 - y) / 0.13);   // dust up the foot
      if (y < 0.065 && ny < -0.2) m = 0.58;                          // the sole pad
      out[0] = m; out[1] = m * 0.96; out[2] = m * 0.90;              // dusty, warm
    },
  });
  // Cloth AO samples the body too, so the wrap darkens where it meets skin.
  const combinedSdf = (x, y, z) => Math.min(clothBake.sdf(x, y, z), body.sdf(x, y, z));
  bakeVertexColors(clothBake.geometry, combinedSdf, { floor: 0.46 });

  /* ---------------------------------------------------------- skinned rig */
  const bodyMesh = new THREE.SkinnedMesh(body.geometry, skinMat);
  bodyMesh.name = 'warrior-body';
  bodyMesh.castShadow = true;
  bodyMesh.frustumCulled = false;
  const clothMesh = new THREE.SkinnedMesh(clothBake.geometry, clothMat);
  clothMesh.name = 'warrior-dhoti';
  clothMesh.castShadow = true;
  clothMesh.frustumCulled = false;

  for (const b of skel.roots) bodyMesh.add(b);
  root.add(bodyMesh);
  root.add(clothMesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(skel.list);
  bodyMesh.bind(skeleton);
  clothMesh.bind(skeleton);

  /* ---------------------------------------------------------- accessories */
  // All rigid items ride the bone they belong to; bones are Object3Ds, so
  // ordinary meshes parent straight onto them.

  // Waist sash + knot, on the torso so it leans with him.
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.034, 6, 22), sashMat);
  sash.geometry.rotateX(Math.PI / 2);
  sash.geometry.scale(1, 1, 0.86);
  sash.position.set(0, 0.128, 0.004);
  sash.castShadow = true;
  B.torso.add(sash);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), sashMat);
  knot.scale.set(1.25, 0.85, 0.9);
  knot.position.set(0.155, 0.105, 0.055);
  B.torso.add(knot);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.040, 0.16, 4, 8), sashMat);
  tail.scale.set(1, 1, 0.5);
  tail.position.set(0.170, -0.02, 0.045);
  tail.rotation.z = -0.18;
  B.torso.add(tail);

  // Janeu: the sacred thread, over the left shoulder and down to the right
  // hip. A rigid ellipse plunged inside the chest and only its back arc ever
  // showed - so instead the loop is TRACED ONTO THE BODY: every point of an
  // ideal ellipse is walked along the sculpt's own distance field until it
  // rests a thread's width above the skin (or the cloth, at the hip). The
  // result hugs shoulder, chest, hip and back exactly like a worn thread.
  {
    const surface = (x, y, z) => Math.min(body.sdf(x, y, z), clothBake.sdf(x, y, z));
    const CLEAR = 0.015;
    const centre = new THREE.Vector3(-0.012, 1.40, 0.0);
    const diag = new THREE.Vector3(-0.40, 0.917, 0).normalize();   // up over the LEFT shoulder
    const points = [];
    const pt = new THREE.Vector3();
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      pt.copy(centre)
        .addScaledVector(diag, Math.cos(t) * 0.40)
        .add(new THREE.Vector3(0, 0, Math.sin(t) * 0.20));
      for (let k = 0; k < 8; k++) {
        const d = surface(pt.x, pt.y, pt.z) - CLEAR;
        if (Math.abs(d) < 0.002) break;
        const h = 0.008;
        const gx = surface(pt.x + h, pt.y, pt.z) - surface(pt.x - h, pt.y, pt.z);
        const gy = surface(pt.x, pt.y + h, pt.z) - surface(pt.x, pt.y - h, pt.z);
        const gz = surface(pt.x, pt.y, pt.z + h) - surface(pt.x, pt.y, pt.z - h);
        const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        const step = Math.max(-0.05, Math.min(0.05, d));
        pt.x -= (gx / gl) * step;
        pt.y -= (gy / gl) * step;
        pt.z -= (gz / gl) * step;
      }
      points.push(pt.clone());
    }
    const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    const janeuGeo = new THREE.TubeGeometry(curve, 144, 0.011, 7, true);
    janeuGeo.translate(0, -HIP, 0);              // into torso-bone space
    const janeu = new THREE.Mesh(janeuGeo, janeuMat);
    B.torso.add(janeu);
  }

  // Rudraksha: neck (two loops), both upper arms, both wrists.
  const neckRing = new THREE.Mesh(beadRing(14, 0.088, 0.019), beadMat);
  neckRing.position.set(0, 0.635, 0.015);
  neckRing.rotation.x = 0.35;
  B.torso.add(neckRing);
  const neckRing2 = new THREE.Mesh(beadRing(16, 0.112, 0.017), beadMat);
  neckRing2.position.set(0, 0.60, 0.03);
  neckRing2.rotation.x = 0.5;
  B.torso.add(neckRing2);
  for (const s of [-1, 1]) {
    const arm = B[s < 0 ? 'upperArmL' : 'upperArmR'];
    const band = new THREE.Mesh(beadRing(11, 0.078, 0.018), beadMat);
    band.position.set(s * (ELB[0] - SHO[0]) * 0.45, (ELB[1] - SHO[1]) * 0.45, 0.002);
    band.rotation.z = s * -0.21;
    arm.add(band);
    const fore = B[s < 0 ? 'forearmL' : 'forearmR'];
    const wrist = new THREE.Mesh(beadRing(10, 0.058, 0.016), beadMat);
    wrist.position.set(s * (WRI[0] - ELB[0]) * 0.76, (WRI[1] - ELB[1]) * 0.76, 0.010);
    fore.add(wrist);
  }

  // Hair: pulled tight over the skull into a high crown bun - a thin cap
  // that hugs the head, a mass at the nape where the hair gathers, and a
  // two-tier bun sitting ON the crown with a bead tie at its base.
  // The cap is the SKULL'S OWN ellipsoid, grown a few millimetres and tilted
  // so the hairline sits high on the forehead and low at the nape - a sphere
  // cap of any single radius either exposes the crown or swallows the face.
  const capGeo = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  capGeo.scale(0.106, 0.126, 0.112);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.position.set(0, 0.112, -0.002);
  cap.rotation.x = -0.45;
  cap.castShadow = true;
  B.head.add(cap);
  const nape = new THREE.Mesh(new THREE.SphereGeometry(0.050, 10, 8), hairMat);
  nape.scale.set(1.25, 0.75, 0.9);
  nape.position.set(0, 0.038, -0.086);
  B.head.add(nape);
  const bunBase = new THREE.Mesh(new THREE.SphereGeometry(0.050, 10, 8), hairMat);
  bunBase.scale.set(1.12, 0.82, 1.12);
  bunBase.position.set(0, 0.252, -0.010);
  bunBase.castShadow = true;
  B.head.add(bunBase);
  const bunTop = new THREE.Mesh(new THREE.SphereGeometry(0.036, 9, 7), hairMat);
  bunTop.position.set(0, 0.296, -0.010);
  B.head.add(bunTop);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.009, 5, 12), beadMat);
  tie.geometry.rotateX(Math.PI / 2);
  tie.position.set(0, 0.222, -0.009);
  B.head.add(tie);

  // Face marks: tilak and eyes. Small, but they stop the head reading blank
  // on the start screen.
  const tilak = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.008), tilakMat);
  tilak.position.set(0, 0.128, 0.103);
  tilak.rotation.x = -0.12;
  B.head.add(tilak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), hairMat);
    eye.position.set(s * 0.034, 0.112, 0.100);
    B.head.add(eye);
  }

  return {
    root,
    bones: B,
    landmarks: { hip: HIP, shoulder: SHOULDER, head: HEAD_BONE },
    flashMaterials: [skinMat, clothMat, sashMat, hairMat],
  };
}
