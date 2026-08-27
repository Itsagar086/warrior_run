// The sacred path itself: a wide temple causeway of warm sandstone slabs with
// two glowing golden lane dividers and Sanskrit inscriptions cut into the
// stone, recycled endlessly toward the player.
import * as THREE from 'three';

// ===== ASSET id=snake-way-ground label="Temple Stone Path" role=ground =====
function makeGroundSegment() {
  // ART DIRECTION: silhouette = wide flagstone temple causeway receding into
  // mist, flanked by mossy kerbs; signature = beveled sandstone slabs with deep
  // shadowed joints, twin glowing golden lane dividers running the length;
  // proportion = 9 units wide, 12 deep, 3 runner lanes; colors = warm sandstone
  // #c4956a, shadowed joint #4a3524, divider gold #ffc247, moss #33452a.
  const segment = new THREE.Group();

  const slabMat = new THREE.MeshStandardMaterial({ color: 0xc4956a, roughness: 0.85, metalness: 0.0 });
  const slabAltMat = new THREE.MeshStandardMaterial({ color: 0xceA277, roughness: 0.87, metalness: 0.0 });
  const bevelMat = new THREE.MeshStandardMaterial({ color: 0xdcb389, roughness: 0.78, metalness: 0.0 });
  const jointMat = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1.0 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9, metalness: 0.03 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x33452a, roughness: 1.0 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffc247,
    emissive: 0xff9500,
    emissiveIntensity: 1.35,
    roughness: 0.3,
    metalness: 0.6
  });

  const width = 9.0;
  const depth = 12.0;

  // Dark under-floor: shows through the joints between slabs so the gaps read
  // as deep shadow rather than flat lines.
  const underFloor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.3, depth), jointMat);
  underFloor.position.set(0, -0.16, 0);
  underFloor.receiveShadow = true;
  segment.add(underFloor);

  // Flagstone slabs: 3 across, 4 deep, each inset so a shadowed joint shows
  const cols = 3;
  const rows = 4;
  const slabW = width / cols;
  const slabD = depth / rows;
  const gap = 0.17;

  for (let cx = 0; cx < cols; cx++) {
    for (let cz = 0; cz < rows; cz++) {
      const x = -width / 2 + slabW * (cx + 0.5);
      const z = -depth / 2 + slabD * (cz + 0.5);
      const mat = ((cx + cz) % 2 === 0) ? slabMat : slabAltMat;

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(slabW - gap, 0.22, slabD - gap),
        mat
      );
      slab.position.set(x, -0.11, z);
      segment.add(slab);

      // Beveled cap: a slightly smaller, lighter plate on top of each slab so
      // the edges catch the moonlight and read as cut stone, not painted road.
      const bevel = new THREE.Mesh(
        new THREE.BoxGeometry(slabW - gap - 0.16, 0.03, slabD - gap - 0.16),
        bevelMat
      );
      bevel.position.set(x, 0.005, z);
      bevel.receiveShadow = true;
      segment.add(bevel);
    }
  }

  // Two glowing golden lane dividers, running between the three lanes
  [-1.1, 1.1].forEach(x => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.035, depth), goldMat);
    line.position.set(x, 0.03, 0);
    segment.add(line);

    // A wider, dimmer bloom strip under it to fake light spill on the stone
    const spill = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.012, depth),
      new THREE.MeshBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.16 })
    );
    spill.position.set(x, 0.024, 0);
    segment.add(spill);
  });

  // Raised mossy kerbs edging the causeway
  [-1, 1].forEach(side => {
    const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, depth), kerbMat);
    kerb.position.set(side * (width / 2 + 0.25), 0.02, 0);
    kerb.receiveShadow = true;
    segment.add(kerb);

    const moss = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, depth), mossMat);
    moss.position.set(side * (width / 2 + 0.25), 0.18, 0);
    segment.add(moss);
  });

  segment.userData.role = 'ground';
  segment.userData.bbox = { w: width, h: 0.3, d: depth };

  return segment;
}
// ===== END ASSET =====

// ===== ASSET id=path-inscription label="Sanskrit Path Inscription" role=scenery =====
// The reference art carries the Devanagari phrase श्रावणरत्मा cut into the
// causeway. Devanagari cannot be built from box geometry legibly and three's
// TextGeometry would need a Devanagari typeface we cannot fetch, so the glyphs
// are drawn once into a canvas and used as an alpha-masked decal. If the canvas
// is unavailable the decal falls back to darker carved bars, which is what the
// geometry-only version would have looked like.
const INSCRIPTION_TEXT = 'श्रावणरत्मा';

function makeInscriptionTexture() {
  let ctx;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Transparent ground, dark chiselled glyphs: used as a colour map so the
    // letters darken the stone and the rest of the plate stays invisible.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 150px "Nirmala UI", "Noto Sans Devanagari", "Mangal", "Segoe UI", serif';
    ctx.fillStyle = 'rgba(58, 38, 20, 0.95)';
    ctx.fillText(INSCRIPTION_TEXT, canvas.width / 2, canvas.height / 2);
    // A soft lighter offset underneath reads as the lip of the carving
    ctx.fillStyle = 'rgba(224, 186, 140, 0.5)';
    ctx.fillText(INSCRIPTION_TEXT, canvas.width / 2, canvas.height / 2 - 4);
    ctx.fillStyle = 'rgba(58, 38, 20, 0.95)';
    ctx.fillText(INSCRIPTION_TEXT, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  } catch (e) {
    return null; // headless / no 2D context - use the carved-bar fallback
  }
}

function makeInscription() {
  const group = new THREE.Group();
  const texture = makeInscriptionTexture();

  if (texture) {
    // Darker stone showing through where the glyphs are chiselled away
    const glyphMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1.0,
      transparent: true,
      map: texture,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.3, 1.08), glyphMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(0, 0.035, 0);
    group.add(plate);
  } else {
    const barMat = new THREE.MeshStandardMaterial({ color: 0x5c4028, roughness: 1.0 });
    for (let i = 0; i < 7; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.012, 0.09), barMat);
      bar.position.set(-2.4 + i * 0.8, 0.03, 0);
      group.add(bar);
    }
    // The headline stroke Devanagari hangs its letters from
    const rule = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.012, 0.07), barMat);
    rule.position.set(0, 0.03, -0.24);
    group.add(rule);
  }

  group.userData.role = 'scenery';
  return group;
}
// ===== END ASSET =====

const GROUND_SEGMENTS = 7;
const SEGMENT_DEPTH = 12.0;
const groundPool = [];

// Inscriptions repeat every 20 units, independently of the 12-unit slabs
const INSCRIPTION_SPACING = 20.0;
const INSCRIPTION_COUNT = 6;
const inscriptionPool = [];

export function createTrack(scene) {
  for (let i = 0; i < GROUND_SEGMENTS; i++) {
    const g = makeGroundSegment();
    g.position.set(0, 0, -i * SEGMENT_DEPTH + 12);
    scene.add(g);
    groundPool.push(g);
  }

  for (let i = 0; i < INSCRIPTION_COUNT; i++) {
    const ins = makeInscription();
    ins.position.set(0, 0, -i * INSCRIPTION_SPACING + 10);
    scene.add(ins);
    inscriptionPool.push(ins);
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

  inscriptionPool.forEach(ins => {
    ins.position.z += scrollDelta;
    if (ins.position.z > 12) {
      ins.position.z -= INSCRIPTION_COUNT * INSCRIPTION_SPACING;
    }
  });
}

export { makeGroundSegment, makeInscription, makeInscriptionTexture, GROUND_SEGMENTS, SEGMENT_DEPTH, INSCRIPTION_TEXT };
