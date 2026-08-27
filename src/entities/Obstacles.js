// The static hazards of the Snake Way - fire pits, rolling boulders, temple
// pillars and broken road gaps - plus the shared recycled obstacle pool.
import * as THREE from 'three';
import { spawnFX } from '../systems/FXSystem.js';
import { makeAsuraDemon } from './AsuraDemon.js';
import { makeEvilSoul } from './EvilSoul.js';

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

const OBSTACLE_POOL_SIZE = 18;
const obstaclePool = [];

// Pre-builds every hazard once; spawning only toggles visibility afterwards.
export function createObstaclePool(scene) {
  for (let i = 0; i < 3; i++) {
    const pit = makeFirePit();
    pit.visible = false;
    scene.add(pit);
    obstaclePool.push(pit);
    window.__gameEntities.registerObstacle(pit);
  }
  for (let i = 0; i < 3; i++) {
    const b = makeBoulder();
    b.visible = false;
    scene.add(b);
    obstaclePool.push(b);
    window.__gameEntities.registerObstacle(b);
  }
  for (let i = 0; i < 3; i++) {
    const pil = makePillarObstacle();
    pil.visible = false;
    scene.add(pil);
    obstaclePool.push(pil);
    window.__gameEntities.registerObstacle(pil);
  }
  for (let i = 0; i < 3; i++) {
    const asura = makeAsuraDemon();
    asura.visible = false;
    scene.add(asura);
    obstaclePool.push(asura);
    window.__gameEntities.registerObstacle(asura);
  }
  for (let i = 0; i < 3; i++) {
    const broken = makeBrokenRoad();
    broken.visible = false;
    scene.add(broken);
    obstaclePool.push(broken);
    window.__gameEntities.registerObstacle(broken);
  }
  for (let i = 0; i < 3; i++) {
    const soul = makeEvilSoul();
    soul.visible = false;
    scene.add(soul);
    obstaclePool.push(soul);
    window.__gameEntities.registerObstacle(soul);
  }

  return obstaclePool;
}

export function getObstaclePool() {
  return obstaclePool;
}

// Rolling spin and the dust it kicks up.
export function updateBoulder(obs, dt) {
  // Boulder special spin & dust
  if (obs.userData.boulderCore) {
    obs.userData.boulderCore.rotation.x += dt * 6.0;
  }
  if (Math.random() < 0.25) {
    spawnFX(new THREE.Vector3(obs.position.x, 0.1, obs.position.z), '#8a7966', 1, 0.3);
  }
}

export { makePillarObstacle, makeFirePit, makeBoulder, makeBrokenRoad, OBSTACLE_POOL_SIZE };
