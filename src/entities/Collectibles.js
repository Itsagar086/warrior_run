// What the devotee gathers on the way to Kailash: Om glyphs, Rudraksha beads,
// and the pickups that prime each divine power.
//
// Geometry and materials are shared across every instance in a pool. These are
// the most numerous objects in the scene - eighteen Om glyphs alone - so
// building a fresh set per instance wastes memory and gives the renderer more
// state to churn through for no visual gain.
import * as THREE from 'three';
import { swing } from '../utils/AnimationHelper.js';

const GOLD = 0xffcc00;
const RUDRAKSHA_BROWN = 0x8b4513;
const TRISHUL_BLUE = 0x4488ff;
const SHIELD_TEAL = 0x4de0c0;

/* ------------------------------------------------------- shared materials */
const goldGlowMat = new THREE.MeshStandardMaterial({
  color: GOLD, emissive: GOLD, emissiveIntensity: 1.15, roughness: 0.28, metalness: 0.75
});
const goldBrightMat = new THREE.MeshStandardMaterial({
  color: 0xfff0b0, emissive: 0xffdd55, emissiveIntensity: 1.5, roughness: 0.2, metalness: 0.6
});
const goldDeepMat = new THREE.MeshStandardMaterial({
  color: 0xc98b12, emissive: 0xb06f00, emissiveIntensity: 0.75, roughness: 0.4, metalness: 0.85
});
const beadMat = new THREE.MeshStandardMaterial({
  color: RUDRAKSHA_BROWN, roughness: 0.9, metalness: 0.05, flatShading: true
});
const trishulMat = new THREE.MeshStandardMaterial({
  color: 0xdCEBFF, emissive: TRISHUL_BLUE, emissiveIntensity: 1.35, roughness: 0.22, metalness: 0.7
});
const trishulCoreMat = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x99bbff, emissiveIntensity: 1.6, roughness: 0.18, metalness: 0.5
});
const shieldMat = new THREE.MeshStandardMaterial({
  color: SHIELD_TEAL, emissive: SHIELD_TEAL, emissiveIntensity: 1.1, roughness: 0.3, metalness: 0.6
});

/* ------------------------------------------------------ shared geometries */
const beadGeo = bumpyBeadGeometry(0.2);
const beadRingGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 24);
const omDiscGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.035, 24);
const omRimGeo = new THREE.TorusGeometry(0.31, 0.028, 8, 24);
const omGlyphGeo = new THREE.PlaneGeometry(0.46, 0.46);
const chakraHubGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12);

// A rudraksha seed is furrowed, not smooth: push each vertex in or out along
// its own normal by a deterministic amount so the sphere reads as a real bead.
// Guarded, because the headless test harness stubs geometry attributes out.
function bumpyBeadGeometry(radius) {
  const geo = new THREE.SphereGeometry(radius, 12, 10);
  const pos = geo.attributes && geo.attributes.position;
  if (!pos || typeof pos.getX !== 'function') return geo;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // Vertical furrows plus a little noise, the way the seed's ridges run
    const furrow = Math.sin(Math.atan2(z, x) * 5) * 0.055;
    const grain = Math.sin(x * 41 + y * 27 + z * 33) * 0.02;
    const scale = 1 + furrow + grain;
    pos.setX(i, x * scale);
    pos.setY(i, y * (1 + grain));
    pos.setZ(i, z * scale);
  }
  pos.needsUpdate = true;
  if (typeof geo.computeVertexNormals === 'function') geo.computeVertexNormals();
  return geo;
}

// The ॐ itself, drawn once into a canvas and shared by every glyph. Devanagari
// cannot be built legibly from primitives and there is no Devanagari typeface
// we can fetch, so this is how the symbol actually reads as a symbol.
let omTexture;
let omTextureTried = false;
function getOmTexture() {
  if (omTextureTried) return omTexture;
  omTextureTried = true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return (omTexture = null);
    ctx.clearRect(0, 0, 256, 256);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 190px "Nirmala UI", "Noto Sans Devanagari", "Mangal", "Segoe UI", serif';
    ctx.fillStyle = 'rgba(90, 52, 0, 0.92)';
    ctx.fillText('ॐ', 128, 140);
    omTexture = new THREE.CanvasTexture(canvas);
    omTexture.anisotropy = 4;
    return omTexture;
  } catch (e) {
    return (omTexture = null);
  }
}

let omGlyphMat;
function getOmGlyphMaterial() {
  if (omGlyphMat !== undefined) return omGlyphMat;
  const tex = getOmTexture();
  omGlyphMat = tex
    ? new THREE.MeshStandardMaterial({
        map: tex, transparent: true, depthWrite: false,
        color: 0xffffff, emissive: 0x000000, roughness: 0.5,
        polygonOffset: true, polygonOffsetFactor: -2
      })
    : null;
  return omGlyphMat;
}

// ===== ASSET id=om-glyph label="Om Glyph" role=collectible =====
function makeOmGlyph() {
  // ART DIRECTION: silhouette = a coin of holy light standing on edge in the
  // lane; signature = a glowing golden disc with the ॐ struck into it, bright
  // enough to pick out of the dark from a lane away. colors = gold #ffcc00.
  const om = new THREE.Group();

  const disc = new THREE.Mesh(omDiscGeo, goldGlowMat);
  disc.rotation.x = Math.PI / 2;   // stand the coin up, facing the devotee
  om.add(disc);

  const rim = new THREE.Mesh(omRimGeo, goldBrightMat);
  om.add(rim);

  // The symbol on both faces, so it reads through the whole spin
  const glyphMat = getOmGlyphMaterial();
  if (glyphMat) {
    const front = new THREE.Mesh(omGlyphGeo, glyphMat);
    front.position.z = 0.021;
    om.add(front);

    const back = new THREE.Mesh(omGlyphGeo, glyphMat);
    back.position.z = -0.021;
    back.rotation.y = Math.PI;
    om.add(back);
  }

  om.userData.role = 'collectible';
  om.userData.collectibleType = 'om';
  om.userData.bbox = { w: 0.7, h: 0.7, d: 0.2 };
  return om;
}
// ===== END ASSET =====

// ===== ASSET id=rudraksha-bead label="Rudraksha Bead" role=collectible =====
function makeRudrakshaBead() {
  // ART DIRECTION: silhouette = a single furrowed seed hanging inside a ring of
  // golden light; signature = the warm dark bead against the bright halo, so a
  // line of them draws an arc the eye can follow. colors = seed brown #8b4513,
  // halo gold #ffcc00.
  const bead = new THREE.Group();

  const seed = new THREE.Mesh(beadGeo, beadMat);
  bead.add(seed);

  const ring = new THREE.Mesh(beadRingGeo, goldGlowMat);
  bead.add(ring);

  bead.userData.role = 'collectible';
  bead.userData.collectibleType = 'rudraksha';
  bead.userData.spinPhase = Math.random() * Math.PI * 2;
  bead.userData.baseY = 1.1;
  bead.userData.bbox = { w: 0.8, h: 0.8, d: 0.8 };
  return bead;
}
// ===== END ASSET =====

// ===== ASSET id=chakra-pickup label="Sudarshan Chakra Pickup" role=collectible =====
function makeChakraPickup() {
  // ART DIRECTION: silhouette = Vishnu's discus turning end over end, layered
  // rings inside a toothed rim; signature = the brightest gold on the path.
  const chakra = new THREE.Group();

  const rings = new THREE.Group();
  rings.name = 'rings';
  chakra.add(rings);

  // Layered rings, each its own node so they can counter-rotate
  [[0.34, 0.035, goldBrightMat], [0.24, 0.028, goldGlowMat], [0.15, 0.022, goldDeepMat]]
    .forEach(([radius, tube, mat], i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 20), mat);
      ring.userData.spin = (i % 2 === 0 ? 1 : -1) * (2.2 + i * 1.1);
      rings.add(ring);
    });

  const hub = new THREE.Mesh(chakraHubGeo, goldBrightMat);
  hub.rotation.x = Math.PI / 2;
  chakra.add(hub);

  // Cutting teeth around the rim
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 4), goldBrightMat);
    tooth.position.set(Math.cos(angle) * 0.38, Math.sin(angle) * 0.38, 0);
    tooth.rotation.z = angle - Math.PI / 2;
    rings.add(tooth);
  }

  chakra.userData.role = 'collectible';
  chakra.userData.collectibleType = 'power';
  chakra.userData.power = 'sudarshan_chakra';
  chakra.userData.bbox = { w: 0.9, h: 0.9, d: 0.3 };
  return chakra;
}
// ===== END ASSET =====

// ===== ASSET id=trishul-pickup label="Shiva's Trishul Pickup" role=collectible =====
function makeTrishulPickup() {
  // ART DIRECTION: silhouette = a trident standing upright in the lane, lit from
  // within; signature = cold blue-white against all the warm gold, so the two
  // powers never get confused at speed. colors = emissive blue #4488ff.
  const trishul = new THREE.Group();

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.78, 8), trishulMat);
  shaft.position.y = -0.08;
  trishul.add(shaft);

  const centre = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.3, 7), trishulCoreMat);
  centre.position.y = 0.44;
  trishul.add(centre);

  // Outer prongs, curving up off the crossbar
  [-1, 1].forEach(side => {
    const arm = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.2, 0),
        new THREE.Vector3(side * 0.15, 0.26, 0),
        new THREE.Vector3(side * 0.15, 0.42, 0)
      ]), 10, 0.028, 5, false),
      trishulMat
    );
    trishul.add(arm);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), trishulCoreMat);
    tip.position.set(side * 0.15, 0.52, 0);
    trishul.add(tip);
  });

  // Damru collar where the prongs meet the shaft
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 6, 12), trishulCoreMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.16;
  trishul.add(collar);

  trishul.userData.role = 'collectible';
  trishul.userData.collectibleType = 'power';
  trishul.userData.power = 'trishul';
  trishul.userData.bbox = { w: 0.6, h: 1.2, d: 0.3 };
  return trishul;
}
// ===== END ASSET =====

// ===== ASSET id=shield-pickup label="Vishnu's Shield Pickup" role=collectible =====
function makeShieldPickup() {
  // Not in the brief's list, but Vishnu's Shield is a live power - it absorbs a
  // hit and turns the Naga's strike aside - and the Chakra and Trishul pickups
  // replaced the orb that used to grant it. Same family, third colour.
  const shield = new THREE.Group();

  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 6), shieldMat);
  face.rotation.x = Math.PI / 2;
  shield.add(face);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.032, 6, 18), shieldMat);
  shield.add(rim);

  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), shieldMat);
  boss.position.z = 0.05;
  shield.add(boss);

  // Tilted a little off the vertical: a flat disc spinning about Y disappears
  // for a moment every half turn, and a pickup you cannot see is a pickup you
  // cannot read at speed.
  shield.rotation.x = 0.34;
  shield.rotation.z = 0.12;

  shield.userData.role = 'collectible';
  shield.userData.collectibleType = 'power';
  shield.userData.power = 'vishnu_shield';
  shield.userData.bbox = { w: 0.7, h: 0.7, d: 0.3 };
  return shield;
}
// ===== END ASSET =====

/* ------------------------------------------------------------- animation */

// Om glyphs turn end over end.
export function updateOmGlyph(om, dt) {
  om.rotation.y += dt * 3.5;
}

// Beads turn gently and breathe around whatever height their arc placed them at.
export function updateRudraksha(bead, dt, elapsed) {
  bead.rotation.y += dt * 2.5;
  bead.rotation.z += dt * 0.9;
  bead.position.y = bead.userData.baseY + swing(elapsed * 3 + bead.userData.spinPhase, 0.13);
}

// Power pickups: the chakra spins its rings against each other, the trishul and
// shield turn slowly on the spot.
export function updatePowerPickup(pickup, dt, elapsed) {
  if (pickup.userData.power === 'sudarshan_chakra') {
    const rings = pickup.children[0];
    if (rings) {
      rings.rotation.z += dt * 4.2;
      for (let i = 0; i < rings.children.length; i++) {
        const spin = rings.children[i].userData.spin;
        if (spin) rings.children[i].rotation.z += dt * spin;
      }
    }
    pickup.rotation.y += dt * 1.2;
  } else {
    pickup.rotation.y += dt * 2.0;
  }
  pickup.position.y = pickup.userData.baseY + swing(elapsed * 2.4, 0.09);
}

export { makeOmGlyph, makeRudrakshaBead, makeChakraPickup, makeTrishulPickup, makeShieldPickup };
