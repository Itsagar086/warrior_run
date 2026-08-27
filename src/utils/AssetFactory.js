// Single access point for every makeXxx mesh generator in the game.
//
// Each builder lives beside the code that gives it behaviour - the player with
// his animation, the hazards with their movement - so this module imports them
// and re-exports them together. The collectibles have no behaviour of their
// own beyond being picked up, so their builders live here.
import * as THREE from 'three';

import { makePlayer } from '../entities/Player.js';
import { makeAsuraDemon } from '../entities/AsuraDemon.js';
import { makeEvilSoul } from '../entities/EvilSoul.js';
import { makeRivalNaga } from '../entities/NagaChaser.js';
import { makePillarObstacle, makeFirePit, makeBoulder, makeBrokenRoad } from '../entities/Obstacles.js';
import { makeGroundSegment } from '../environment/Track.js';
import { makeTrishulProjectile } from '../systems/PowerSystem.js';
import {
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
} from '../environment/Environment.js';
import { makeInscription } from '../environment/Track.js';

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

export {
  makePlayer,
  makeTrishulProjectile,
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
  makeRivalNaga,
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeInscription,
};

// Legacy global registry, kept so tooling that pokes at window.__game still works.
window.__game = window.__game || {};
window.__game.factories = Object.assign(window.__game.factories || {}, {
  makePlayer,
  makeTrishulProjectile,
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
  makeRivalNaga,
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeInscription,
});
