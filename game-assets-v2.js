import * as THREE from 'three';
import { voxelToMesh, tickVoxels, boot } from 'playlabs-boot';
// ===== ASSET id=devotee-warrior label="Devotee Warrior" role=player =====
function makePlayer() {
  // ART DIRECTION: silhouette = athletic Hindu yogic warrior sprinting in flowing saffron dhoti; signature = sacred janeu thread across bare torso, white tripundra tilak stripes on back and shoulders, rudraksha mala and wrist/ankle beads, shikha topknot; proportion = heroic V-taper muscular back with topknot bun; colors = warm tan skin #c47948, radiant saffron #f59e0b, deep orange sash #c2410c, sacred white #ffffff, rudraksha brown #5c2b0c.
  const player = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: '#c47948', roughness: 0.6, metalness: 0.05 });
  const dhotiMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.75, metalness: 0.0 });
  const dhotiShadowMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.8, metalness: 0.0 });
  const sashMat = new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.7, metalness: 0.0 });
  const hairMat = new THREE.MeshStandardMaterial({ color: '#1a1721', roughness: 0.9, metalness: 0.1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#e5b035', roughness: 0.3, metalness: 0.85 });
  const rudrakshaMat = new THREE.MeshStandardMaterial({ color: '#5c2b0c', roughness: 0.85, metalness: 0.05 });
  const sandalMat = new THREE.MeshStandardMaterial({ color: '#452b1b', roughness: 0.9 });

  // Torso & Pelvis root group
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, 0.96, 0);
  player.add(torso);

  // Muscular V-taper torso
  const chestGeo = new THREE.BoxGeometry(0.48, 0.40, 0.28);
  const chestMesh = new THREE.Mesh(chestGeo, skinMat);
  chestMesh.position.set(0, 0.36, 0);
  chestMesh.castShadow = true;
  torso.add(chestMesh);

  // Lat / shoulder back muscles for broad athletic back
  const backGeo = new THREE.CapsuleGeometry(0.19, 0.24, 8, 12);
  const backMesh = new THREE.Mesh(backGeo, skinMat);
  backMesh.rotation.z = Math.PI / 2;
  backMesh.position.set(0, 0.42, -0.04);
  torso.add(backMesh);

  // Abdomen
  const absGeo = new THREE.BoxGeometry(0.38, 0.24, 0.24);
  const absMesh = new THREE.Mesh(absGeo, skinMat);
  absMesh.position.set(0, 0.14, 0);
  torso.add(absMesh);

  // Tripundra tilak on upper back (three horizontal white stripes)
  for (let i = -1; i <= 1; i++) {
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.016, 0.02), whiteMat);
  stripe.position.set(0, 0.44 + i * 0.035, -0.145);
  torso.add(stripe);
  }

  // Sacred Thread (Janeu) draping across left shoulder to right hip
  const threadCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.22, 0.54, -0.06),
  new THREE.Vector3(-0.16, 0.46, 0.14),
  new THREE.Vector3(0.0, 0.28, 0.14),
  new THREE.Vector3(0.18, 0.08, 0.08),
  new THREE.Vector3(0.16, 0.08, -0.12),
  new THREE.Vector3(-0.12, 0.35, -0.14),
  new THREE.Vector3(-0.22, 0.54, -0.06)
  ]);
  const janeuMesh = new THREE.Mesh(new THREE.TubeGeometry(threadCurve, 24, 0.009, 6, true), whiteMat);
  torso.add(janeuMesh);

  // Rudraksha necklace around neck
  const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 20), rudrakshaMat);
  necklace.rotation.x = Math.PI / 2 - 0.22;
  necklace.position.set(0, 0.54, 0.02);
  torso.add(necklace);

  // Saffron waist wrap / Kamarbandh sash around hips
  const sashBand = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.25, 0.22, 16), sashMat);
  sashBand.position.set(0, 0.02, 0);
  torso.add(sashBand);

  // Flowing sash tail hanging at right hip
  const sashTail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.36, 0.06), sashMat);
  sashTail.position.set(0.23, -0.12, 0.06);
  sashTail.rotation.z = -0.28;
  sashTail.rotation.y = 0.2;
  torso.add(sashTail);

  // HEAD GROUP
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.58, 0.02);
  torso.add(head);

  // Neck
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.12, 12), skinMat);
  neckMesh.position.set(0, 0.02, 0);
  head.add(neckMesh);

  // Cranium / Face sphere
  const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), skinMat);
  faceMesh.position.set(0, 0.18, 0.02);
  faceMesh.scale.set(0.95, 1.15, 1.0);
  head.add(faceMesh);

  // Yogic hair volume & topknot
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 14), hairMat);
  hairCap.position.set(0, 0.21, -0.02);
  hairCap.scale.set(0.96, 1.1, 1.02);
  head.add(hairCap);

  // Topknot bun (Shikha / Jata)
  const bunMesh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 12), hairMat);
  bunMesh.position.set(0, 0.36, -0.04);
  head.add(bunMesh);

  // Gold ring around topknot
  const bunRing = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 16), goldMat);
  bunRing.position.set(0, 0.32, -0.04);
  bunRing.rotation.x = Math.PI / 2;
  head.add(bunRing);

  // Trimmed yogic beard / jawline
  const beard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), hairMat);
  beard.position.set(0, 0.12, 0.05);
  head.add(beard);

  // White Tripundra on forehead with central red bindu dot
  for (let i = -1; i <= 1; i++) {
  const fStripe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.012, 0.01), whiteMat);
  fStripe.position.set(0, 0.23 + i * 0.022, 0.14);
  head.add(fStripe);
  }
  const binduDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.014, 8, 8),
  new THREE.MeshBasicMaterial({ color: '#ff1100' })
  );
  binduDot.position.set(0, 0.23, 0.146);
  head.add(binduDot);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#110f18' });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
  eyeL.position.set(-0.05, 0.18, 0.138);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
  eyeR.position.set(0.05, 0.18, 0.138);
  head.add(eyeL);
  head.add(eyeR);

  // LEFT ARM RIG
  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.set(-0.28, 0.44, 0);
  torso.add(armL);

  const bicepL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.20, 8, 12), skinMat);
  bicepL.position.set(0, -0.10, 0);
  armL.add(bicepL);

  // White tilak stripes on outer deltoid
  for (let i = -1; i <= 1; i++) {
  const armMarkL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), whiteMat);
  armMarkL.position.set(-0.07, -0.06 + i * 0.018, 0);
  armL.add(armMarkL);
  }

  const forearmL = new THREE.Group();
  forearmL.name = 'forearmL';
  forearmL.position.set(0, -0.20, 0);
  armL.add(forearmL);

  const armMeshL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.19, 8, 12), skinMat);
  armMeshL.position.set(0, -0.095, 0);
  forearmL.add(armMeshL);

  // Rudraksha bracelet on wrist
  const wristBeadsL = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 6, 12), rudrakshaMat);
  wristBeadsL.rotation.x = Math.PI / 2;
  wristBeadsL.position.set(0, -0.18, 0);
  forearmL.add(wristBeadsL);

  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), skinMat);
  handL.position.set(0, -0.23, 0.02);
  forearmL.add(handL);

  // RIGHT ARM RIG
  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.set(0.28, 0.44, 0);
  torso.add(armR);

  const bicepR = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.20, 8, 12), skinMat);
  bicepR.position.set(0, -0.10, 0);
  armR.add(bicepR);

  for (let i = -1; i <= 1; i++) {
  const armMarkR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), whiteMat);
  armMarkR.position.set(0.07, -0.06 + i * 0.018, 0);
  armR.add(armMarkR);
  }

  const forearmR = new THREE.Group();
  forearmR.name = 'forearmR';
  forearmR.position.set(0, -0.20, 0);
  armR.add(forearmR);

  const armMeshR = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.19, 8, 12), skinMat);
  armMeshR.position.set(0, -0.095, 0);
  forearmR.add(armMeshR);

  const wristBeadsR = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.018, 6, 12), rudrakshaMat);
  wristBeadsR.rotation.x = Math.PI / 2;
  wristBeadsR.position.set(0, -0.18, 0);
  forearmR.add(wristBeadsR);

  const handR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 8), skinMat);
  handR.position.set(0, -0.23, 0.02);
  forearmR.add(handR);

  // LEFT LEG RIG
  const legL = new THREE.Group();
  legL.name = 'legL';
  legL.position.set(-0.14, 0.88, 0);
  player.add(legL);

  // Saffron Dhoti thigh drape
  const dhotiThighL = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.38, 12), dhotiMat);
  dhotiThighL.position.set(0, -0.18, 0);
  legL.add(dhotiThighL);

  const thighFoldL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.16), dhotiShadowMat);
  thighFoldL.position.set(-0.04, -0.18, 0);
  legL.add(thighFoldL);

  const shinL = new THREE.Group();
  shinL.name = 'shinL';
  shinL.position.set(0, -0.34, 0);
  legL.add(shinL);

  // Calf muscle definition
  const calfMeshL = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.28, 8, 12), skinMat);
  calfMeshL.position.set(0, -0.16, -0.01);
  shinL.add(calfMeshL);

  // Dhoti gathered cuff fold below knee
  const dhotiCuffL = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), dhotiMat);
  dhotiCuffL.rotation.x = Math.PI / 2;
  dhotiCuffL.position.set(0, -0.03, 0);
  shinL.add(dhotiCuffL);

  // Rudraksha ankle band
  const ankleBeadsL = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 12), rudrakshaMat);
  ankleBeadsL.rotation.x = Math.PI / 2;
  ankleBeadsL.position.set(0, -0.32, 0);
  shinL.add(ankleBeadsL);

  const footL = new THREE.Group();
  footL.name = 'footL';
  footL.position.set(0, -0.38, 0);
  shinL.add(footL);

  const footMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), skinMat);
  footMeshL.position.set(0, -0.03, 0.05);
  footL.add(footMeshL);
  const sandalL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.24), sandalMat);
  sandalL.position.set(0, -0.065, 0.05);
  footL.add(sandalL);

  // RIGHT LEG RIG
  const legR = new THREE.Group();
  legR.name = 'legR';
  legR.position.set(0.14, 0.88, 0);
  player.add(legR);

  const dhotiThighR = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.38, 12), dhotiMat);
  dhotiThighR.position.set(0, -0.18, 0);
  legR.add(dhotiThighR);

  const thighFoldR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.16), dhotiShadowMat);
  thighFoldR.position.set(0.04, -0.18, 0);
  legR.add(thighFoldR);

  const shinR = new THREE.Group();
  shinR.name = 'shinR';
  shinR.position.set(0, -0.34, 0);
  legR.add(shinR);

  const calfMeshR = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.28, 8, 12), skinMat);
  calfMeshR.position.set(0, -0.16, -0.01);
  shinR.add(calfMeshR);

  const dhotiCuffR = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), dhotiMat);
  dhotiCuffR.rotation.x = Math.PI / 2;
  dhotiCuffR.position.set(0, -0.03, 0);
  shinR.add(dhotiCuffR);

  const ankleBeadsR = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 12), rudrakshaMat);
  ankleBeadsR.rotation.x = Math.PI / 2;
  ankleBeadsR.position.set(0, -0.32, 0);
  shinR.add(ankleBeadsR);

  const footR = new THREE.Group();
  footR.name = 'footR';
  footR.position.set(0, -0.38, 0);
  shinR.add(footR);

  const footMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.22), skinMat);
  footMeshR.position.set(0, -0.03, 0.05);
  footR.add(footMeshR);
  const sandalR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.24), sandalMat);
  sandalR.position.set(0, -0.065, 0.05);
  footR.add(sandalR);

  // Metadata & Anchors
  player.userData.role = 'player';
  player.userData.bbox = { w: 0.9, h: 2.0, d: 0.6 };
  player.userData.anchors = {
  feet: [0, 0, 0],
  belowFeet: [0, -0.1, 0],
  hip: [0, 0.96, 0],
  chest: [0, 1.36, 0.15],
  back: [0, 1.36, -0.16],
  leftHand: [-0.36, 0.96, 0.1],
  rightHand: [0.36, 0.96, 0.1],
  head: [0, 1.66, 0.02],
  topOfHead: [0, 1.98, -0.02]
  };

  return ((__o) => { __o.userData = __o.userData || {}; __o.userData.anchors = Object.assign(__o.userData.anchors || {}, { "feet": { x: 0, y: 0.085, z: 0 }, "belowFeet": { x: 0, y: -0.01, z: 0 }, "hip": { x: 0, y: 0.94, z: 0 }, "chest": { x: 0, y: 1.377, z: 0 }, "back": { x: 0, y: 1.263, z: -0.1 }, "leftHand": { x: -0.3575, y: 1.035, z: 0 }, "rightHand": { x: 0.3575, y: 1.035, z: 0 }, "head": { x: 0, y: 1.795, z: 0 }, "topOfHead": { x: 0, y: 1.985, z: 0 } }); return __o; })(((__o) => { __o.userData = __o.userData || {}; if (!__o.userData.role) __o.userData.role = "player"; return __o; })(player));
}
// ===== END ASSET =====

// ===== ASSET id=snake-way-ground label="Snake Way Path" role=ground =====
function makeGroundSegment() {
  // ART DIRECTION: silhouette = elevated weathered sandstone serpent road with raised curbs dropping into deep indigo mist; signature = sinuous glowing golden naga engraving inlays running down lanes, chiseled flagstone side borders, layered cliff rock foundation; proportion = 3 wide runner lanes (7.4 units width, 12 units depth); colors = sandstone #84654c, gold glow #d8a436, shadowy cliff base #262334.
  const segment = new THREE.Group();

  const stoneTopMat = new THREE.MeshStandardMaterial({ color: '#84654c', roughness: 0.85, metalness: 0.05 });
  const stoneBorderMat = new THREE.MeshStandardMaterial({ color: '#634b38', roughness: 0.9, metalness: 0.05 });
  const stoneSubMat = new THREE.MeshStandardMaterial({ color: '#262334', roughness: 0.95 });
  const goldGlyphMat = new THREE.MeshStandardMaterial({
  color: '#d8a436',
  emissive: '#ff9900',
  emissiveIntensity: 0.5,
  roughness: 0.35,
  metalness: 0.8
  });

  const width = 7.4;
  const depth = 12.0;
  const height = 0.8;

  // Main roadway roadbed
  const roadMesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, depth), stoneTopMat);
  roadMesh.position.set(0, -0.175, 0);
  roadMesh.receiveShadow = true;
  segment.add(roadMesh);

  // Rocky cliff under-structure fading into abyss
  const underBase = new THREE.Mesh(new THREE.BoxGeometry(width - 0.4, height - 0.35, depth), stoneSubMat);
  underBase.position.set(0, -0.35 - (height - 0.35) / 2, 0);
  segment.add(underBase);

  // Left & Right raised carved stone curbs with chiseled brick cuts
  const curbGeo = new THREE.BoxGeometry(0.45, 0.25, depth);
  const leftCurb = new THREE.Mesh(curbGeo, stoneBorderMat);
  leftCurb.position.set(-(width / 2 - 0.225), 0.05, 0);
  segment.add(leftCurb);

  const rightCurb = new THREE.Mesh(curbGeo, stoneBorderMat);
  rightCurb.position.set(width / 2 - 0.225, 0.05, 0);
  segment.add(rightCurb);

  // Chiseled stone joints along the curbs
  const seamMat = new THREE.MeshBasicMaterial({ color: '#3d2c1f' });
  for (let z = -depth / 2 + 1.5; z < depth / 2; z += 2.0) {
  const seamL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.26, 0.03), seamMat);
  seamL.position.set(-(width / 2 - 0.225), 0.05, z);
  segment.add(seamL);
  const seamR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.26, 0.03), seamMat);
  seamR.position.set(width / 2 - 0.225, 0.05, z);
  segment.add(seamR);
  }

  // Sinuous Golden Naga Scale Inlay patterns on all 3 lanes (x = -2.2, 0, +2.2)
  const laneOffsets = [-2.2, 0, 2.2];
  laneOffsets.forEach(laneX => {
  // Serpentine curve inlay across Z
  const nagaCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(laneX - 0.35, 0.005, -depth / 2),
  new THREE.Vector3(laneX + 0.35, 0.005, -depth / 4),
  new THREE.Vector3(laneX - 0.35, 0.005, 0),
  new THREE.Vector3(laneX + 0.35, 0.005, depth / 4),
  new THREE.Vector3(laneX - 0.35, 0.005, depth / 2)
  ]);
  const ribbonGeo = new THREE.TubeGeometry(nagaCurve, 28, 0.04, 6, false);
  const ribbonMesh = new THREE.Mesh(ribbonGeo, goldGlyphMat);
  segment.add(ribbonMesh);

  // Naga serpent scale diamond emblems and cobra heads along lane
  for (let z = -depth / 2 + 1.5; z < depth / 2; z += 3.0) {
  const scaleGlyph = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.01, 4), goldGlyphMat);
  scaleGlyph.rotation.y = Math.PI / 4;
  scaleGlyph.position.set(laneX, 0.006, z);
  segment.add(scaleGlyph);

  // Stylized Cobra Head Crest at nodes
  const headGlyph = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.20, 5), goldGlyphMat);
  headGlyph.rotation.x = Math.PI / 2;
  headGlyph.position.set(laneX, 0.007, z + 0.35);
  segment.add(headGlyph);
  }
  });

  // Flagstone transverse seams etched into stone surface
  for (let z = -depth / 2 + 2; z < depth / 2; z += 2.0) {
  const seam = new THREE.Mesh(new THREE.BoxGeometry(width - 0.9, 0.005, 0.03), seamMat);
  seam.position.set(0, 0.003, z);
  segment.add(seam);
  }

  segment.userData.role = 'ground';
  segment.userData.bbox = { w: width, h: height, d: depth };

  return segment;
}
// ===== END ASSET =====

// ===== ASSET id=naga-pillar-gate label="Temple Stone Pillar" role=obstacle =====
function makePillarObstacle() {
  // ART DIRECTION: silhouette = cracked tall temple pillar with coiled serpent reliefs and open belfry housing a glowing brass bell; signature = twin 3D naga cobras coiling the shaft, chiseled stone stress cracks, golden temple bell inside open arch; proportion = towering obstacle 3.6m tall; colors = weathered stone grey #5e6170, dark carved relief #464854, golden bell #e5b035.
  const pillar = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: '#5e6170', roughness: 0.85, metalness: 0.1 });
  const darkStoneMat = new THREE.MeshStandardMaterial({ color: '#464854', roughness: 0.9 });
  const crackMat = new THREE.MeshBasicMaterial({ color: '#2c2e38' });
  const bellGoldMat = new THREE.MeshStandardMaterial({
  color: '#e5b035',
  emissive: '#ffaa00',
  emissiveIntensity: 0.35,
  roughness: 0.25,
  metalness: 0.9
  });

  // Tiered Stepped Plinth Base
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 1.15), darkStoneMat);
  base1.position.set(0, 0.11, 0);
  base1.castShadow = true;
  pillar.add(base1);

  const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), stoneMat);
  base2.position.set(0, 0.31, 0);
  pillar.add(base2);

  const base3 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 16), stoneMat);
  base3.position.set(0, 0.47, 0);
  pillar.add(base3);

  // Main Pillar Shaft
  const shaftHeight = 1.9;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, shaftHeight, 16), stoneMat);
  shaft.position.set(0, 0.54 + shaftHeight / 2, 0);
  shaft.castShadow = true;
  pillar.add(shaft);

  // Deep vertical crack running down the stone shaft
  const crackCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.37, 2.40, 0.05),
  new THREE.Vector3(0.36, 2.10, -0.10),
  new THREE.Vector3(0.37, 1.70, 0.05),
  new THREE.Vector3(0.38, 1.20, -0.05),
  new THREE.Vector3(0.39, 0.70, 0.0)
  ]);
  const crackMesh = new THREE.Mesh(new THREE.TubeGeometry(crackCurve, 20, 0.015, 6, false), crackMat);
  pillar.add(crackMesh);

  // Coiled Naga 1 (Lower Serpent wrapping shaft)
  const coilCurve1 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.38, 0.65, 0.15),
  new THREE.Vector3(0.15, 0.85, 0.38),
  new THREE.Vector3(-0.35, 1.05, 0.18),
  new THREE.Vector3(-0.25, 1.25, -0.32),
  new THREE.Vector3(0.18, 1.45, -0.34),
  new THREE.Vector3(0.38, 1.55, 0.05),
  new THREE.Vector3(0.05, 1.65, 0.38)
  ]);
  const serpentBody1 = new THREE.Mesh(new THREE.TubeGeometry(coilCurve1, 28, 0.08, 8, false), darkStoneMat);
  serpentBody1.castShadow = true;
  pillar.add(serpentBody1);

  // Lower Cobra Head
  const snakeHead1 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), darkStoneMat);
  snakeHead1.rotation.x = -Math.PI / 2;
  snakeHead1.rotation.z = 0.2;
  snakeHead1.position.set(0.05, 1.68, 0.44);
  pillar.add(snakeHead1);

  // Coiled Naga 2 (Upper Serpent coiling up toward capital)
  const coilCurve2 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.35, 1.55, 0.18),
  new THREE.Vector3(-0.18, 1.80, -0.35),
  new THREE.Vector3(0.35, 2.05, -0.15),
  new THREE.Vector3(0.30, 2.25, 0.25),
  new THREE.Vector3(0.0, 2.38, 0.38)
  ]);
  const serpentBody2 = new THREE.Mesh(new THREE.TubeGeometry(coilCurve2, 24, 0.08, 8, false), darkStoneMat);
  serpentBody2.castShadow = true;
  pillar.add(serpentBody2);

  // Upper Cobra Head
  const snakeHead2 = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 8), darkStoneMat);
  snakeHead2.rotation.x = -Math.PI / 2;
  snakeHead2.rotation.z = 0.3;
  snakeHead2.position.set(0.0, 2.42, 0.44);
  pillar.add(snakeHead2);

  // Flared Capital Ring
  const capitalRing = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.36, 0.16, 16), stoneMat);
  capitalRing.position.set(0, 2.52, 0);
  pillar.add(capitalRing);

  // Open Belfry Arch Pavilion (4 corner posts)
  const belfryHeight = 0.65;
  const postOffsets = [
  [-0.24, -0.24],
  [-0.24, 0.24],
  [0.24, -0.24],
  [0.24, 0.24]
  ];
  postOffsets.forEach(([px, pz]) => {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, belfryHeight, 8), stoneMat);
  post.position.set(px, 2.60 + belfryHeight / 2, pz);
  pillar.add(post);
  });

  // Hanging Golden Temple Bell inside belfry
  const bellDome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 14, 0, Math.PI * 2, 0, Math.PI / 2), bellGoldMat);
  bellDome.position.set(0, 2.92, 0);
  pillar.add(bellDome);

  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), bellGoldMat);
  bellRim.rotation.x = Math.PI / 2;
  bellRim.position.set(0, 2.92, 0);
  pillar.add(bellRim);

  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), bellGoldMat);
  clapper.position.set(0, 2.84, 0);
  pillar.add(clapper);

  // Top Pagoda / Lintel Cap
  const cap1 = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.16, 0.92), stoneMat);
  cap1.position.set(0, 3.33, 0);
  pillar.add(cap1);

  const cap2 = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.14, 0.70), darkStoneMat);
  cap2.position.set(0, 3.48, 0);
  pillar.add(cap2);

  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 8), stoneMat);
  finial.position.set(0, 3.65, 0);
  pillar.add(finial);

  pillar.userData.role = 'obstacle';
  pillar.userData.obstacleType = 'pillar';
  pillar.userData.zone = 2;
  pillar.userData.bbox = { w: 1.2, h: 3.6, d: 1.2 };
  pillar.userData.collider = { type: 'box', size: [1.0, 3.4, 1.0], offset: [0, 1.7, 0] };

  return pillar;
}
// ===== END ASSET =====

// ===== ASSET id=sacred-fire-pit label="Sacred Fire Pit" role=obstacle =====
function makeFirePit() {
  // ART DIRECTION: silhouette = low circular stone havan kunda with rolling saffron flames and glowing embers; signature = two-tiered dressed sandstone ring, intense red-orange coal bed, stylized energetic flame tongues; proportion = broad hazard ring 1.8m diameter, 0.85m flame height; colors = sandstone bricks #7e6653, ember bed #ff2200, flame gradient #ff4500 to #ffa600, white hot core #fff5b0.
  const firePit = new THREE.Group();

  const brickMat = new THREE.MeshStandardMaterial({ color: '#7e6653', roughness: 0.9, metalness: 0.05 });
  const innerBrickMat = new THREE.MeshStandardMaterial({ color: '#5a4739', roughness: 0.95 });
  const coalMat = new THREE.MeshStandardMaterial({
  color: '#330800',
  emissive: '#ff2200',
  emissiveIntensity: 0.9,
  roughness: 0.7
  });

  const flameOuterMat = new THREE.MeshStandardMaterial({
  color: '#ff4500',
  emissive: '#ff3700',
  emissiveIntensity: 1.3,
  roughness: 0.2
  });
  const flameMidMat = new THREE.MeshStandardMaterial({
  color: '#ffa600',
  emissive: '#ff9900',
  emissiveIntensity: 1.6,
  roughness: 0.2
  });
  const flameCoreMat = new THREE.MeshBasicMaterial({ color: '#fff5b0' });

  // Outer Brick Tier (Circle of 14 radial stone blocks)
  const outerBrickCount = 14;
  const outerRadius = 0.82;
  for (let i = 0; i < outerBrickCount; i++) {
  const angle = (i / outerBrickCount) * Math.PI * 2;
  const brick = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.22), brickMat);
  brick.position.set(Math.cos(angle) * outerRadius, 0.08, Math.sin(angle) * outerRadius);
  brick.rotation.y = -angle;
  firePit.add(brick);
  }

  // Inner Raised Brick Tier (Circle of 10 blocks)
  const innerBrickCount = 10;
  const innerRadius = 0.58;
  for (let i = 0; i < innerBrickCount; i++) {
  const angle = (i / innerBrickCount) * Math.PI * 2 + 0.15;
  const brick = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.20), innerBrickMat);
  brick.position.set(Math.cos(angle) * innerRadius, 0.18, Math.sin(angle) * innerRadius);
  brick.rotation.y = -angle;
  firePit.add(brick);
  }

  // Glowing Coal / Ash Bed
  const coalBed = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.12, 14), coalMat);
  coalBed.position.set(0, 0.16, 0);
  firePit.add(coalBed);

  // Stylized Layered Fire Spire
  const mainFlame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.76, 8), flameMidMat);
  mainFlame.position.set(0, 0.54, 0);
  mainFlame.scale.set(1.0, 1.0, 0.8);
  firePit.add(mainFlame);

  const coreFlame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.46, 8), flameCoreMat);
  coreFlame.position.set(0, 0.39, 0.02);
  firePit.add(coreFlame);

  // Surrounding spiraling flame tongues
  const subFlames = [
  { pos: [0.18, 0.44, 0.12], rot: [0.2, 0.4, -0.3], r: 0.15, h: 0.52, mat: flameOuterMat },
  { pos: [-0.16, 0.42, -0.10], rot: [-0.3, 1.2, 0.2], r: 0.16, h: 0.56, mat: flameMidMat },
  { pos: [-0.14, 0.40, 0.14], rot: [0.3, -0.8, 0.3], r: 0.14, h: 0.48, mat: flameOuterMat },
  { pos: [0.12, 0.41, -0.15], rot: [-0.2, -0.4, -0.25], r: 0.13, h: 0.50, mat: flameMidMat }
  ];
  subFlames.forEach(f => {
  const flameMesh = new THREE.Mesh(new THREE.ConeGeometry(f.r, f.h, 7), f.mat);
  flameMesh.position.set(...f.pos);
  flameMesh.rotation.set(...f.rot);
  firePit.add(flameMesh);
  });

  // Floating spark embers
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffe666' });
  const sparkPositions = [
  [0.15, 0.82, -0.10],
  [-0.12, 0.88, 0.14],
  [0.08, 0.95, 0.08],
  [-0.20, 0.76, -0.05]
  ];
  sparkPositions.forEach(([sx, sy, sz]) => {
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), sparkMat);
  spark.position.set(sx, sy, sz);
  firePit.add(spark);
  });

  firePit.userData.role = 'obstacle';
  firePit.userData.obstacleType = 'firePit';
  firePit.userData.zone = 1;
  firePit.userData.bbox = { w: 1.8, h: 0.85, d: 1.8 };
  firePit.userData.collider = { type: 'sphere', radius: 0.75, offset: [0, 0.3, 0] };

  return firePit;
}
// ===== END ASSET =====

// ===== ASSET id=rolling-boulder label="Rolling Boulder" role=obstacle =====
function makeBoulder() {
  // ART DIRECTION: silhouette = heavy faceted ancient boulder inscribed with glowing Sanskrit runes and trailing dust; signature = angular faceted rock planes, glowing gold equatorial rune band, glowing stress fractures; proportion = massive spherical threat 2.2m diameter; colors = earthy sandstone grey-brown #786b5e, glowing runic gold #cba248, dust haze #8a7966.
  const boulderGroup = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
  color: '#786b5e',
  roughness: 0.85,
  metalness: 0.15,
  flatShading: true
  });
  const runeMat = new THREE.MeshStandardMaterial({
  color: '#cba248',
  emissive: '#ffaa00',
  emissiveIntensity: 0.7,
  roughness: 0.3,
  metalness: 0.8
  });
  const crackMat = new THREE.MeshBasicMaterial({ color: '#ffb733' });
  const dustMat = new THREE.MeshStandardMaterial({ color: '#8a7966', roughness: 0.9, opacity: 0.6, transparent: true });

  // Main Faceted Boulder
  const boulderMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.02, 1), stoneMat);
  boulderMesh.position.set(0, 1.1, 0);
  boulderMesh.scale.set(1.05, 0.98, 1.02);
  boulderMesh.castShadow = true;
  boulderGroup.add(boulderMesh);
  boulderGroup.userData.boulderCore = boulderMesh;

  // Encircling Rune Band
  const runeTorus = new THREE.Mesh(new THREE.TorusGeometry(1.04, 0.035, 8, 24), runeMat);
  runeTorus.rotation.x = Math.PI / 2 + 0.1;
  runeTorus.position.set(0, 1.1, 0);
  boulderGroup.add(runeTorus);

  // Inscribed Glyph Nodes around the band
  for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.04), runeMat);
  glyph.position.set(Math.cos(angle) * 1.05, 1.1 + Math.sin(angle * 2) * 0.06, Math.sin(angle) * 1.05);
  glyph.rotation.y = -angle;
  boulderGroup.add(glyph);
  }

  // Glowing golden stress cracks on the rock face
  const crackCurve1 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 2.08, 0.0),
  new THREE.Vector3(0.35, 1.75, 0.45),
  new THREE.Vector3(0.65, 1.35, 0.60),
  new THREE.Vector3(0.85, 0.95, 0.40)
  ]);
  const crack1 = new THREE.Mesh(new THREE.TubeGeometry(crackCurve1, 16, 0.018, 6, false), crackMat);
  boulderGroup.add(crack1);

  const crackCurve2 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.35, 1.75, 0.45),
  new THREE.Vector3(-0.25, 1.55, 0.70),
  new THREE.Vector3(-0.65, 1.15, 0.55)
  ]);
  const crack2 = new THREE.Mesh(new THREE.TubeGeometry(crackCurve2, 12, 0.014, 6, false), crackMat);
  boulderGroup.add(crack2);

  // Ground Dust and debris puffs
  const dustPuffs = [
  [-0.6, 0.15, -0.6, 0.28],
  [0.7, 0.12, -0.5, 0.24],
  [-0.2, 0.18, -0.8, 0.32],
  [0.5, 0.10, 0.6, 0.20]
  ];
  dustPuffs.forEach(([dx, dy, dz, dr]) => {
  const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(dr, 0), dustMat);
  puff.position.set(dx, dy, dz);
  boulderGroup.add(puff);
  });

  boulderGroup.userData.role = 'obstacle';
  boulderGroup.userData.obstacleType = 'boulder';
  boulderGroup.userData.zone = 2;
  boulderGroup.userData.bbox = { w: 2.2, h: 2.2, d: 2.2 };
  boulderGroup.userData.collider = { type: 'sphere', radius: 1.05, offset: [0, 1.1, 0] };

  return boulderGroup;
}
// ===== END ASSET =====

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

// ===== ASSET id=broken-road-pit label="Broken Road Gap" role=obstacle =====
function makeBrokenRoad() {
  // ART DIRECTION: silhouette = fractured gaping void in sandstone roadbed; signature = left crumble and right crumble road edge pieces flanking an empty dark gap in the middle with glowing purple void energy.
  const brokenGap = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: '#453427', roughness: 0.9 });
  const darkGapMat = new THREE.MeshStandardMaterial({ color: '#0a0614', emissive: '#260442', emissiveIntensity: 0.6, roughness: 0.95 });
  const glowMat = new THREE.MeshStandardMaterial({ color: '#8833ff', emissive: '#aa44ff', emissiveIntensity: 1.0 });

  // Dark Void Pit Base under missing floor
  const voidBase = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.4, 3.2), darkGapMat);
  voidBase.position.set(0, -0.35, 0);
  brokenGap.add(voidBase);

  // Left Crumble Road Edge Piece
  const leftCrumble = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 3.2), stoneMat);
  leftCrumble.position.set(-1.05, -0.05, 0);
  brokenGap.add(leftCrumble);

  // Right Crumble Road Edge Piece
  const rightCrumble = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 3.2), stoneMat);
  rightCrumble.position.set(1.05, -0.05, 0);
  brokenGap.add(rightCrumble);

  // Jagged Fractured Stone Fragments along edges
  const edgePositions = [
    [-0.8, 0.02, -1.5], [0.0, 0.02, -1.55], [0.8, 0.02, -1.45],
    [-0.75, 0.02, 1.5], [0.1, 0.02, 1.48], [0.85, 0.02, 1.52],
    [-1.0, 0.04, -0.6], [1.0, 0.04, 0.6]
  ];
  edgePositions.forEach(([x, y, z]) => {
    const frag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24, 0), stoneMat);
    frag.position.set(x, y, z);
    frag.scale.set(1.1, 0.4, 0.8);
    brokenGap.add(frag);
  });

  // Glowing rune energy cracks across front & back edges
  const crack = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, 0.12), glowMat);
  crack.position.set(0, -0.15, -1.5);
  brokenGap.add(crack);
  const crackBack = crack.clone();
  crackBack.position.z = 1.5;
  brokenGap.add(crackBack);

  brokenGap.userData.role = 'obstacle';
  brokenGap.userData.obstacleType = 'brokenRoad';
  brokenGap.userData.zone = 2;
  brokenGap.userData.bbox = { w: 2.1, h: 0.4, d: 3.2 };
  return brokenGap;
}
// ===== END ASSET =====

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
  soul.userData.zone = 1;
  soul.userData.bbox = { w: 1.0, h: 1.5, d: 1.0 };
  return soul;
}
// ===== END ASSET =====

// ===== ASSET id=rudraksha-bead label="Rudraksha Bead Cluster" role=collectible =====
function makeRudrakshaBead() {
  // ART DIRECTION: silhouette = floating sacred mala ring of carved rudraksha seeds with golden spacer caps and divine halo; signature = faceted grooved rudraksha seeds, golden spacer beads, guru bead with hanging twin tassels; proportion = compact floating collectible 0.8m wide; colors = rich rudraksha brown #6e3412, radiant gold #e5b035, divine white halo #ffffff.
  const beadCluster = new THREE.Group();

  const beadMat = new THREE.MeshStandardMaterial({
  color: '#6e3412',
  roughness: 0.85,
  metalness: 0.1,
  flatShading: true
  });
  const goldCapMat = new THREE.MeshStandardMaterial({
  color: '#e5b035',
  emissive: '#ffbb00',
  emissiveIntensity: 0.35,
  roughness: 0.25,
  metalness: 0.9
  });
  const auraMat = new THREE.MeshBasicMaterial({
  color: '#ffffff',
  transparent: true,
  opacity: 0.22
  });

  // Floating Divine Aura Disc / Halo
  const haloMesh = new THREE.Mesh(new THREE.SphereGeometry(0.44, 16, 16), auraMat);
  beadCluster.add(haloMesh);

  // Circular gold thread holding the beads
  const ringRadius = 0.28;
  const threadMesh = new THREE.Mesh(new THREE.TorusGeometry(ringRadius, 0.012, 8, 24), goldCapMat);
  beadCluster.add(threadMesh);

  // 9 Sacred Rudraksha Beads arranged around the ring
  const beadCount = 9;
  for (let i = 0; i < beadCount; i++) {
  const angle = (i / beadCount) * Math.PI * 2;
  const bx = Math.cos(angle) * ringRadius;
  const by = Math.sin(angle) * ringRadius;

  // Faceted grooved rudraksha seed
  const bead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.068, 1), beadMat);
  bead.position.set(bx, by, 0);
  bead.scale.set(1.0, 1.15, 1.0);
  beadCluster.add(bead);

  // Golden spacer beads
  const spacer = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), goldCapMat);
  const spacerAngle = angle + (Math.PI / beadCount);
  spacer.position.set(Math.cos(spacerAngle) * ringRadius, Math.sin(spacerAngle) * ringRadius, 0);
  beadCluster.add(spacer);
  }

  // Large Central Guru Bead at bottom
  const guruBead = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 1), beadMat);
  guruBead.position.set(0, -ringRadius - 0.04, 0);
  beadCluster.add(guruBead);

  const guruCap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 8), goldCapMat);
  guruCap.position.set(0, -ringRadius - 0.10, 0);
  beadCluster.add(guruCap);

  // Hanging twin golden tassels
  const tasselCurve1 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.01, -ringRadius - 0.12, 0),
  new THREE.Vector3(-0.04, -ringRadius - 0.20, 0.02),
  new THREE.Vector3(-0.08, -ringRadius - 0.28, -0.01)
  ]);
  const tasselMesh1 = new THREE.Mesh(new THREE.TubeGeometry(tasselCurve1, 12, 0.018, 6, false), goldCapMat);
  beadCluster.add(tasselMesh1);

  const tasselCurve2 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.01, -ringRadius - 0.12, 0),
  new THREE.Vector3(0.04, -ringRadius - 0.20, -0.02),
  new THREE.Vector3(0.08, -ringRadius - 0.28, 0.01)
  ]);
  const tasselMesh2 = new THREE.Mesh(new THREE.TubeGeometry(tasselCurve2, 12, 0.018, 6, false), goldCapMat);
  beadCluster.add(tasselMesh2);

  beadCluster.userData.role = 'collectible';
  beadCluster.userData.bbox = { w: 0.8, h: 0.8, d: 0.8 };

  return beadCluster;
}
// ===== END ASSET =====

// ===== ASSET id=om-glyph label="Om Glyph" role=collectible =====
function makeOmGlyph() {
  // ART DIRECTION: silhouette = glowing sacred ॐ (Om) emblem centered on a radiant gold sunburst disk; signature = smooth golden Devanagari curves, central bindu star, rotating lotus halo; proportion = clean legible 0.7m pickup; colors = brilliant holy gold #ffaa22, core glow #fff5cc.
  const omGroup = new THREE.Group();

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#ffaa22',
    emissive: '#ff8800',
    emissiveIntensity: 0.7,
    roughness: 0.25,
    metalness: 0.85
  });
  const haloMat = new THREE.MeshBasicMaterial({
    color: '#ffdd66',
    transparent: true,
    opacity: 0.35
  });

  // Sunburst / Lotus disc background
  const sunburst = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 16), haloMat);
  sunburst.rotation.x = Math.PI / 2;
  omGroup.add(sunburst);

  // Radiating ray teeth
  for (let i = 0; i < 12; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), goldMat);
    const angle = (i / 12) * Math.PI * 2;
    ray.position.set(Math.cos(angle) * 0.33, Math.sin(angle) * 0.33, 0);
    ray.rotation.z = angle - Math.PI / 2;
    omGroup.add(ray);
  }

  // Left-top curve of ॐ (3-like upper loop)
  const curveUpper = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.18, 0.06, 0.02),
    new THREE.Vector3(-0.14, 0.18, 0.02),
    new THREE.Vector3(-0.02, 0.16, 0.02),
    new THREE.Vector3(-0.04, 0.06, 0.02)
  ]);
  const upperMesh = new THREE.Mesh(new THREE.TubeGeometry(curveUpper, 16, 0.024, 6, false), goldMat);
  omGroup.add(upperMesh);

  // Left-bottom curve of ॐ (3-like lower sweeping loop)
  const curveLower = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.04, 0.06, 0.02),
    new THREE.Vector3(-0.01, -0.08, 0.02),
    new THREE.Vector3(-0.15, -0.16, 0.02),
    new THREE.Vector3(-0.20, -0.06, 0.02)
  ]);
  const lowerMesh = new THREE.Mesh(new THREE.TubeGeometry(curveLower, 16, 0.024, 6, false), goldMat);
  omGroup.add(lowerMesh);

  // Right sweeping wing / tail curve
  const curveTail = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.04, 0.06, 0.02),
    new THREE.Vector3(0.08, 0.04, 0.02),
    new THREE.Vector3(0.18, 0.14, 0.02),
    new THREE.Vector3(0.16, -0.12, 0.02)
  ]);
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curveTail, 16, 0.022, 6, false), goldMat);
  omGroup.add(tailMesh);

  // Crescent Chandrabindu at top right
  const crescentCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.06, 0.20, 0.02),
    new THREE.Vector3(0.14, 0.17, 0.02),
    new THREE.Vector3(0.22, 0.20, 0.02)
  ]);
  const crescentMesh = new THREE.Mesh(new THREE.TubeGeometry(crescentCurve, 10, 0.016, 6, false), goldMat);
  omGroup.add(crescentMesh);

  // Top Bindu Dot
  const binduMesh = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), goldMat);
  binduMesh.position.set(0.14, 0.25, 0.02);
  omGroup.add(binduMesh);

  omGroup.userData.role = 'collectible';
  omGroup.userData.bbox = { w: 0.7, h: 0.7, d: 0.3 };

  return omGroup;
}
// ===== END ASSET =====

// ===== ASSET id=divine-power-orb label="Divine Power Orb" role=collectible =====
function makePowerOrb() {
  // ART DIRECTION: silhouette = translucent crystalline bubble enclosing the trinity of divine artifacts (Sudarshan Chakra, Shiva's Trishul, Vishnu's Shield); signature = glass bubble with rim sheen, spoked golden chakra discus, silver three-pronged trishul with damru, cyan kite shield; proportion = compact 1.0m power sphere; colors = glass bubble #a0d8ff, chakra gold #e5b035, trishul silver #dbe5eb, shield azure #2a75d3.
  const orbGroup = new THREE.Group();

  const glassMat = new THREE.MeshStandardMaterial({
  color: '#a0d8ff',
  roughness: 0.1,
  metalness: 0.2,
  transparent: true,
  opacity: 0.35
  });
  const goldMat = new THREE.MeshStandardMaterial({
  color: '#e5b035',
  emissive: '#ff9900',
  emissiveIntensity: 0.45,
  roughness: 0.3,
  metalness: 0.85
  });
  const silverMat = new THREE.MeshStandardMaterial({
  color: '#dbe5eb',
  emissive: '#ffffff',
  emissiveIntensity: 0.25,
  roughness: 0.2,
  metalness: 0.9
  });
  const shieldMat = new THREE.MeshStandardMaterial({
  color: '#2a75d3',
  emissive: '#4de0c0',
  emissiveIntensity: 0.4,
  roughness: 0.3,
  metalness: 0.7
  });

  // Outer Translucent Glass Bubble
  const sphereMesh = new THREE.Mesh(new THREE.SphereGeometry(0.48, 20, 20), glassMat);
  orbGroup.add(sphereMesh);

  // Outer Gimbal Light Ring
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.016, 8, 32), goldMat);
  rimRing.rotation.x = Math.PI / 4;
  orbGroup.add(rimRing);

  // 1. LEFT ITEM: Sudarshan Chakra (Golden spoked discus)
  const chakraGroup = new THREE.Group();
  chakraGroup.position.set(-0.20, 0, 0);
  chakraGroup.scale.set(0.65, 0.65, 0.65);
  orbGroup.add(chakraGroup);

  const chakraRim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 16), goldMat);
  chakraGroup.add(chakraRim);
  const chakraHub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12), goldMat);
  chakraHub.rotation.x = Math.PI / 2;
  chakraGroup.add(chakraHub);

  for (let i = 0; i < 8; i++) {
  const angle = (i / 8) * Math.PI * 2;
  const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 4), goldMat);
  tooth.position.set(Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, 0);
  tooth.rotation.z = angle - Math.PI / 2 - 0.2;
  chakraGroup.add(tooth);
  }

  // 2. CENTER ITEM: Shiva's Trishul (Silver Trident with golden Damru drum)
  const trishulGroup = new THREE.Group();
  trishulGroup.position.set(0, 0, 0.04);
  trishulGroup.scale.set(0.75, 0.75, 0.75);
  orbGroup.add(trishulGroup);

  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.54, 8), silverMat);
  trishulGroup.add(staff);

  const centerProng = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 6), silverMat);
  centerProng.position.set(0, 0.36, 0);
  trishulGroup.add(centerProng);

  const leftProngCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.24, 0),
  new THREE.Vector3(-0.11, 0.27, 0),
  new THREE.Vector3(-0.09, 0.40, 0)
  ]);
  const leftProng = new THREE.Mesh(new THREE.TubeGeometry(leftProngCurve, 10, 0.018, 6, false), silverMat);
  trishulGroup.add(leftProng);

  const rightProngCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.24, 0),
  new THREE.Vector3(0.11, 0.27, 0),
  new THREE.Vector3(0.09, 0.40, 0)
  ]);
  const rightProng = new THREE.Mesh(new THREE.TubeGeometry(rightProngCurve, 10, 0.018, 6, false), silverMat);
  trishulGroup.add(rightProng);

  // Golden Damru Drum on staff
  const damru1 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 8), goldMat);
  damru1.position.set(0, 0.18, 0);
  trishulGroup.add(damru1);
  const damru2 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 8), goldMat);
  damru2.rotation.x = Math.PI;
  damru2.position.set(0, 0.13, 0);
  trishulGroup.add(damru2);

  // 3. RIGHT ITEM: Vishnu's Protective Shield
  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(0.20, 0, 0);
  shieldGroup.scale.set(0.65, 0.65, 0.65);
  orbGroup.add(shieldGroup);

  const shieldBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.02, 0.44, 4), shieldMat);
  shieldBody.scale.set(1.1, 1.0, 0.25);
  shieldGroup.add(shieldBody);

  const shieldRim = new THREE.Mesh(
  new THREE.TorusGeometry(0.20, 0.02, 6, 16),
  new THREE.MeshBasicMaterial({ color: '#4de0c0' })
  );
  shieldRim.scale.set(0.9, 1.2, 1.0);
  shieldGroup.add(shieldRim);

  orbGroup.userData.role = 'collectible';
  orbGroup.userData.bbox = { w: 1.0, h: 1.0, d: 1.0 };

  return orbGroup;
}
// ===== END ASSET =====

// ===== ASSET id=rival-naga-chaser label="Rival Naga" role=enemy =====
function makeRivalNaga() {
  // ART DIRECTION: silhouette = predatory giant cobra surging low across the path; signature = flared iridescent emerald-violet cobra hood, segmented ventral belly plates, glowing predatory amber eyes with venom fangs; proportion = low-profile menacing serpent (1.5m tall, coiled 1.8m depth); colors = emerald dorsal #1b6354, violet flank #603075, mint belly #7ae0b8, eye glow #ffcc00.
  const nagaGroup = new THREE.Group();

  const dorsalMat = new THREE.MeshStandardMaterial({
  color: '#1b6354',
  roughness: 0.4,
  metalness: 0.35
  });
  const violetMat = new THREE.MeshStandardMaterial({
  color: '#603075',
  roughness: 0.5,
  metalness: 0.3
  });
  const bellyMat = new THREE.MeshStandardMaterial({
  color: '#7ae0b8',
  roughness: 0.6,
  metalness: 0.1
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffcc00' });
  const fangMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: '#aa1844', roughness: 0.6 });

  // Coiled Sinuous Body along ground (+Z forward toward player, tail trailing -Z)
  const bodyCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 0.14, -0.9),
  new THREE.Vector3(-0.65, 0.16, -0.4),
  new THREE.Vector3(0.0, 0.20, 0.1),
  new THREE.Vector3(0.70, 0.24, -0.2),
  new THREE.Vector3(0.45, 0.32, 0.5),
  new THREE.Vector3(0.0, 0.55, 0.4),
  new THREE.Vector3(0.0, 0.95, 0.3),
  new THREE.Vector3(0.0, 1.30, 0.25)
  ]);
  const bodyMesh = new THREE.Mesh(new THREE.TubeGeometry(bodyCurve, 36, 0.18, 12, false), dorsalMat);
  bodyMesh.castShadow = true;
  nagaGroup.add(bodyMesh);

  // Pale Segmented Belly Plates on the upright chest portion
  for (let y = 0.55; y <= 1.25; y += 0.10) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), bellyMat);
  plate.position.set(0, y, 0.35 - (y - 0.55) * 0.12);
  nagaGroup.add(plate);
  }

  // Upright Cobra Hood Group
  const hoodGroup = new THREE.Group();
  hoodGroup.name = 'hood';
  hoodGroup.position.set(0, 1.15, 0.28);
  nagaGroup.add(hoodGroup);

  // Flared Cobra Hood (broad lateral wings)
  const hoodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.14, 0.55, 14), dorsalMat);
  hoodMesh.scale.set(1.4, 1.0, 0.35);
  hoodMesh.position.set(0, 0.05, 0);
  hoodGroup.add(hoodMesh);

  // Violet dorsal marking patches on hood back
  const hoodMark = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12), violetMat);
  hoodMark.position.set(0, 0.08, -0.08);
  hoodGroup.add(hoodMark);

  // Serpent Head Group
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.set(0, 1.45, 0.26);
  nagaGroup.add(headGroup);

  // Triangular Viper Cranium
  const cranium = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 6), dorsalMat);
  cranium.rotation.x = Math.PI / 2;
  cranium.scale.set(1.1, 0.65, 1.0);
  headGroup.add(cranium);

  // Lower Jaw
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.28), bellyMat);
  jaw.position.set(0, -0.09, 0.04);
  headGroup.add(jaw);

  // Glowing Predatory Eyes (+Z facing)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeL.position.set(-0.13, 0.05, 0.08);
  headGroup.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeR.position.set(0.13, 0.05, 0.08);
  headGroup.add(eyeR);

  // Venom Fangs
  const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), fangMat);
  fangL.position.set(-0.08, -0.04, 0.14);
  fangL.rotation.x = Math.PI;
  headGroup.add(fangL);

  const fangR = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), fangMat);
  fangR.position.set(0.08, -0.04, 0.14);
  fangR.rotation.x = Math.PI;
  headGroup.add(fangR);

  // Forked Crimson Tongue
  const tongueStem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.18), tongueMat);
  tongueStem.position.set(0, -0.06, 0.22);
  headGroup.add(tongueStem);

  const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), tongueMat);
  forkL.position.set(-0.025, -0.06, 0.32);
  forkL.rotation.y = 0.4;
  headGroup.add(forkL);

  const forkR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), tongueMat);
  forkR.position.set(0.025, -0.06, 0.32);
  forkR.rotation.y = -0.4;
  headGroup.add(forkR);

  nagaGroup.userData.role = 'enemy';
  nagaGroup.userData.bbox = { w: 1.6, h: 1.5, d: 1.8 };
  nagaGroup.userData.collider = { type: 'sphere', radius: 0.85, offset: [0, 0.75, 0] };

  return nagaGroup;
}
// ===== END ASSET =====

window.__game = window.__game || {};
window.__game.factories = {
  makePlayer,
  makeGroundSegment,
  makePillarObstacle,
  makeFirePit,
  makeBoulder,
  makeAsuraDemon,
  makeBrokenRoad,
  makeEvilSoul,
  makeRudrakshaBead,
  makeOmGlyph,
  makePowerOrb,
  makeRivalNaga
};