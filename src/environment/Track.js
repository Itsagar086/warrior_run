// The Snake Way itself: recycled sandstone road segments that scroll toward
// the player and wrap around for an endless path.
import * as THREE from 'three';

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

// Recycled Ground Segments
const GROUND_SEGMENTS = 7;
const SEGMENT_DEPTH = 12.0;
const groundPool = [];

export function createTrack(scene) {
  for (let i = 0; i < GROUND_SEGMENTS; i++) {
    const g = makeGroundSegment();
    g.position.set(0, 0, -i * SEGMENT_DEPTH + 12);
    scene.add(g);
    groundPool.push(g);
  }

  return groundPool;
}

// Scrolls each segment toward the player, wrapping it to the far end.
export function updateTrack(scrollDelta) {
  // Update Ground Scroll
  groundPool.forEach(g => {
    g.position.z += scrollDelta;
    if (g.position.z > SEGMENT_DEPTH) {
      g.position.z -= GROUND_SEGMENTS * SEGMENT_DEPTH;
    }
  });
}

export { makeGroundSegment, GROUND_SEGMENTS, SEGMENT_DEPTH };
