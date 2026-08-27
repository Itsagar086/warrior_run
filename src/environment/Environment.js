// Everything flanking the road: the abyss below, distant Mount Kailash, and
// the recycled roadside shrines and decorative temple pillars.
import * as THREE from 'three';
import { makePillarObstacle } from '../entities/Obstacles.js';

// ===== ASSET id=mount-kailash-peak label="Mount Kailash Distant Peak" role=scenery =====
function makeMountKailash() {
  const kailash = new THREE.Group();

  const mountainMat = new THREE.MeshStandardMaterial({
    color: '#343859',
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true
  });
  const snowMat = new THREE.MeshStandardMaterial({
    color: '#edf5ff',
    emissive: '#bed2fa',
    emissiveIntensity: 0.35,
    roughness: 0.4
  });
  const auraMat = new THREE.MeshBasicMaterial({
    color: '#ffd700',
    transparent: true,
    opacity: 0.18
  });

  const baseGeo = new THREE.ConeGeometry(120, 140, 7);
  const baseMesh = new THREE.Mesh(baseGeo, mountainMat);
  baseMesh.position.set(0, 70, 0);
  kailash.add(baseMesh);

  const snowGeo = new THREE.ConeGeometry(60, 65, 7);
  const snowMesh = new THREE.Mesh(snowGeo, snowMat);
  snowMesh.position.set(0, 108, 0);
  kailash.add(snowMesh);

  const auraMesh = new THREE.Mesh(new THREE.SphereGeometry(110, 16, 16), auraMat);
  auraMesh.position.set(0, 120, -10);
  kailash.add(auraMesh);

  kailash.userData.role = 'scenery';
  return kailash;
}
// ===== END ASSET =====

// ===== ASSET id=roadside-shrine label="Roadside Shrine" role=scenery =====
function makeRoadsideShrine() {
  const shrine = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: '#4a445c', roughness: 0.85 });
  const jadeLightMat = new THREE.MeshStandardMaterial({
    color: '#4de0c0',
    emissive: '#4de0c0',
    emissiveIntensity: 1.2,
    roughness: 0.2
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), stoneMat);
  base.position.set(0, 0.2, 0);
  shrine.add(base);

  const pillars = [
    [-0.4, -0.4], [-0.4, 0.4], [0.4, -0.4], [0.4, 0.4]
  ];
  pillars.forEach(([px, pz]) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), stoneMat);
    post.position.set(px, 0.85, pz);
    shrine.add(post);
  });

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.6, 4), stoneMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 1.6, 0);
  shrine.add(roof);

  const jadeLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.35, 8), jadeLightMat);
  jadeLamp.position.set(0, 0.75, 0);
  shrine.add(jadeLamp);

  shrine.userData.role = 'scenery';
  return shrine;
}
// ===== END ASSET =====

const SHRINE_COUNT = 10;
const DECO_PILLAR_COUNT = 10;
const shrinePool = [];
const decoPillarPool = [];

export function createEnvironment(scene) {
  // Side Mist / Abyss Plane below
  const abyssMat = new THREE.MeshBasicMaterial({ color: '#131122' });
  const abyssPlane = new THREE.Mesh(new THREE.PlaneGeometry(160, 240), abyssMat);
  abyssPlane.rotation.x = -Math.PI / 2;
  abyssPlane.position.set(0, -1.8, -40);
  scene.add(abyssPlane);

  // Distant Mount Kailash Silhouette
  const kailash = makeMountKailash();
  kailash.position.set(0, 0, -420);
  scene.add(kailash);

  // Roadside Shrines Pool
  for (let i = 0; i < SHRINE_COUNT; i++) {
    const s = makeRoadsideShrine();
    const side = (i % 2 === 0) ? -4.6 : 4.6;
    s.position.set(side, 0, -i * 18.0);
    scene.add(s);
    shrinePool.push(s);
  }

  // Roadside Decorative Pillars (Scenery)
  for (let i = 0; i < DECO_PILLAR_COUNT; i++) {
    const p = makePillarObstacle();
    p.userData.role = 'scenery'; // prevent collision
    const side = (i % 2 === 0) ? -4.8 : 4.8;
    p.position.set(side, 0, -i * 22.0 - 10);
    scene.add(p);
    decoPillarPool.push(p);
  }

  return { shrinePool, decoPillarPool };
}

// Scrolls the roadside scenery and wraps it around behind the player.
export function updateEnvironment(scrollDelta) {
  // Update Roadside Scenery Scroll
  shrinePool.forEach(s => {
    s.position.z += scrollDelta;
    if (s.position.z > 14) {
      s.position.z -= SHRINE_COUNT * 18.0;
    }
  });
  decoPillarPool.forEach(p => {
    p.position.z += scrollDelta;
    if (p.position.z > 14) {
      p.position.z -= DECO_PILLAR_COUNT * 22.0;
    }
  });
}

export { makeMountKailash, makeRoadsideShrine, SHRINE_COUNT, DECO_PILLAR_COUNT };
