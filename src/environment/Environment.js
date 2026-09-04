// Everything flanking and behind the path: ancient temple pillars wrapped in
// vines, the dark forest canopy behind them, hanging vine curtains, the fire
// torches that light the way, the night sky dome and Mount Kailash on the
// horizon.
import * as THREE from 'three';
import { mergeStatic } from '../utils/MeshMerge.js';
import { SKY_TOP_COLOR, SKY_HORIZON_COLOR, makeRadialGlowTexture, getFlickerTime } from './Lighting.js';

// ===== ASSET id=ram-mandir-temple label="Ram Mandir Ayodhya" role=scenery =====
function makeMountKailash() {
  // ART DIRECTION — Ayodhya Ram Mandir (faithful to the reference photo):
  //  • PINK SANDSTONE — the distinctive muted rose (#c4a08a) with lighter (#d4b49a)
  //    and darker (#a07868) accents. NOT golden, NOT yellow.
  //  • WHITE stepped platform (jagati) — contrasts with the pink temple above it.
  //  • THREE horizontal TIERS that step inward like a pyramid — each with its own
  //    sloped roof overhang projecting past the walls.
  //  • MANY SMALL CHHATRIS (dome-topped mini pavilions) lining the edges of every
  //    tier. This is the signature of the real temple — dozens of them.
  //  • CENTRAL SHIKHARA — beehive-profile curvilinear tower rising from the top
  //    tier, ribbed with horizontal bands, topped by amalaka + kalasha + dhwaja.
  //  • MANDAPA — pillared entrance hall projecting forward, with arched openings
  //    and its own smaller shikhara above it.
  //  • GRAND CENTRAL STAIRCASE leading up to the mandapa.
  //  • RED DHWAJA (saffron flag) at the very top on a gold pole.
  //  • Everything fog: false so it stays visible on the horizon.
  const mandir = new THREE.Group();

  // ── MATERIALS ─────────────────────────────────────────────
  const pinkStone = new THREE.MeshStandardMaterial({
    color: 0xc4a08a, roughness: 0.84, metalness: 0.02, flatShading: true, fog: false
  });
  const pinkLight = new THREE.MeshStandardMaterial({
    color: 0xd4b49a, roughness: 0.80, metalness: 0.02, flatShading: true, fog: false
  });
  const pinkDark = new THREE.MeshStandardMaterial({
    color: 0xa07868, roughness: 0.88, metalness: 0.02, flatShading: true, fog: false
  });
  const whitePlat = new THREE.MeshStandardMaterial({
    color: 0xe8e0d8, roughness: 0.75, metalness: 0.0, flatShading: true, fog: false
  });
  const whiteBright = new THREE.MeshStandardMaterial({
    color: 0xf2ece4, roughness: 0.70, metalness: 0.0, flatShading: true, fog: false
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4a84a, emissive: 0xb8860b, emissiveIntensity: 0.7,
    roughness: 0.35, metalness: 0.5, fog: false
  });
  const flagMat = new THREE.MeshBasicMaterial({
    color: 0xff3300, side: THREE.DoubleSide, fog: false
  });
  const darkVoid = new THREE.MeshStandardMaterial({
    color: 0x2a1a10, roughness: 1.0, fog: false
  });
  // Saffron — the sacred Hindu colour, used for accents on roof edges and bands
  const saffronMat = new THREE.MeshStandardMaterial({
    color: 0xff6a00, emissive: 0xff4400, emissiveIntensity: 0.5,
    roughness: 0.6, metalness: 0.1, fog: false
  });
  const saffronBright = new THREE.MeshStandardMaterial({
    color: 0xff8c1a, emissive: 0xff6600, emissiveIntensity: 0.7,
    roughness: 0.5, metalness: 0.1, fog: false
  });
  // Diya / festival light — warm glowing emissive for night decoration
  const diyaMat = new THREE.MeshBasicMaterial({
    color: 0xffcc44, fog: false
  });
  const diyaGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff9922, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });

  // Helper: build a small chhatri (dome pavilion) at a given position and scale
  function addChhatri(x, y, z, s) {
    // Pillared base
    const base = new THREE.Mesh(new THREE.BoxGeometry(8 * s, 10 * s, 8 * s), pinkLight);
    base.position.set(x, y + 5 * s, z);
    mandir.add(base);
    // Four tiny pillars at corners
    for (const dx of [-2.8 * s, 2.8 * s]) {
      for (const dz of [-2.8 * s, 2.8 * s]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * s, 0.8 * s, 10 * s, 6), pinkDark);
        p.position.set(x + dx, y + 5 * s, z + dz);
        mandir.add(p);
      }
    }
    // Dome (flattened sphere on top)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.5 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), pinkStone);
    dome.position.set(x, y + 10.5 * s, z);
    mandir.add(dome);
    // Tiny kalasha finial
    const kal = new THREE.Mesh(new THREE.SphereGeometry(1.2 * s, 6, 5), goldMat);
    kal.position.set(x, y + 14 * s, z);
    mandir.add(kal);
    const spk = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 3.5 * s, 5), goldMat);
    spk.position.set(x, y + 16.5 * s, z);
    mandir.add(spk);
  }

  // ── WHITE STEPPED PLATFORM (JAGATI) ──────────────────────
  // 5 steps, wide and low — the white base the pink temple sits on
  const PLAT_W = 320, PLAT_D = 220;
  const STEP_H = 4;
  const STEPS = 5;
  for (let i = 0; i < STEPS; i++) {
    const shrink = i * 16;
    const mat = i % 2 === 0 ? whitePlat : whiteBright;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W - shrink, STEP_H, PLAT_D - shrink), mat);
    slab.position.set(0, i * STEP_H + STEP_H / 2, 0);
    mandir.add(slab);
  }
  const platTop = STEPS * STEP_H; // = 20

  // ── TIER 1 (BOTTOM) — widest level with colonnade ───────
  const T1_W = 230, T1_D = 160, T1_H = 30;
  const t1Body = new THREE.Mesh(new THREE.BoxGeometry(T1_W, T1_H, T1_D), pinkStone);
  t1Body.position.set(0, platTop + T1_H / 2, 0);
  mandir.add(t1Body);
  // Moulding band
  const t1Band = new THREE.Mesh(new THREE.BoxGeometry(T1_W + 3, 2.5, T1_D + 3), pinkDark);
  t1Band.position.set(0, platTop + T1_H * 0.55, 0);
  mandir.add(t1Band);
  // Colonnade — pillars around the perimeter (front and sides visible)
  for (let col = 0; col < 10; col++) {
    const px = -T1_W / 2 + 14 + col * (T1_W - 28) / 9;
    // Front row
    const pf = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, T1_H - 4, 7), pinkDark);
    pf.position.set(px, platTop + T1_H / 2, T1_D / 2 + 0.5);
    mandir.add(pf);
  }
  for (let col = 0; col < 7; col++) {
    const pz = -T1_D / 2 + 14 + col * (T1_D - 28) / 6;
    for (const side of [-1, 1]) {
      const ps = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, T1_H - 4, 7), pinkDark);
      ps.position.set(side * (T1_W / 2 + 0.5), platTop + T1_H / 2, pz);
      mandir.add(ps);
    }
  }
  // Roof overhang (slab projecting past walls)
  const t1Roof = new THREE.Mesh(new THREE.BoxGeometry(T1_W + 18, 4, T1_D + 18), pinkLight);
  t1Roof.position.set(0, platTop + T1_H + 2, 0);
  mandir.add(t1Roof);
  const t1RoofEdge = new THREE.Mesh(new THREE.BoxGeometry(T1_W + 22, 2, T1_D + 22), pinkDark);
  t1RoofEdge.position.set(0, platTop + T1_H + 4.5, 0);
  mandir.add(t1RoofEdge);
  // Saffron band along tier 1 roof edge
  const t1Saffron = new THREE.Mesh(new THREE.BoxGeometry(T1_W + 24, 1.5, T1_D + 24), saffronMat);
  t1Saffron.position.set(0, platTop + T1_H + 6, 0);
  mandir.add(t1Saffron);
  const T1_TOP = platTop + T1_H + 7;

  // Chhatris on tier 1 — corners + midpoints along front
  const c1s = 0.9;
  [[-T1_W/2-2, T1_D/2+2], [T1_W/2+2, T1_D/2+2], [-T1_W/2-2, -T1_D/2-2], [T1_W/2+2, -T1_D/2-2],
   [-T1_W/4, T1_D/2+2], [T1_W/4, T1_D/2+2], [0, T1_D/2+2],
   [-T1_W/2-2, 0], [T1_W/2+2, 0]
  ].forEach(([cx, cz]) => addChhatri(cx, T1_TOP, cz, c1s));

  // ── TIER 2 (MIDDLE) ─────────────────────────────────────
  const T2_W = 160, T2_D = 110, T2_H = 28;
  const t2Body = new THREE.Mesh(new THREE.BoxGeometry(T2_W, T2_H, T2_D), pinkStone);
  t2Body.position.set(0, T1_TOP + T2_H / 2, 0);
  mandir.add(t2Body);
  const t2Band = new THREE.Mesh(new THREE.BoxGeometry(T2_W + 3, 2.5, T2_D + 3), pinkDark);
  t2Band.position.set(0, T1_TOP + T2_H * 0.55, 0);
  mandir.add(t2Band);
  // Arched niches along the face (visual depth)
  for (let n = 0; n < 6; n++) {
    const nx = -T2_W / 2 + 18 + n * (T2_W - 36) / 5;
    const niche = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 2), darkVoid);
    niche.position.set(nx, T1_TOP + T2_H * 0.45, T2_D / 2 + 0.5);
    mandir.add(niche);
    // Arch top on each niche
    const archTop = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 2, 8, 1, false, 0, Math.PI), pinkLight);
    archTop.rotation.z = Math.PI / 2;
    archTop.rotation.y = Math.PI / 2;
    archTop.position.set(nx, T1_TOP + T2_H * 0.45 + 8, T2_D / 2 + 0.5);
    mandir.add(archTop);
  }
  // Roof overhang
  const t2Roof = new THREE.Mesh(new THREE.BoxGeometry(T2_W + 16, 3.5, T2_D + 16), pinkLight);
  t2Roof.position.set(0, T1_TOP + T2_H + 1.5, 0);
  mandir.add(t2Roof);
  const t2RoofEdge = new THREE.Mesh(new THREE.BoxGeometry(T2_W + 20, 2, T2_D + 20), pinkDark);
  t2RoofEdge.position.set(0, T1_TOP + T2_H + 4, 0);
  mandir.add(t2RoofEdge);
  // Saffron band along tier 2
  const t2Saffron = new THREE.Mesh(new THREE.BoxGeometry(T2_W + 22, 1.2, T2_D + 22), saffronMat);
  t2Saffron.position.set(0, T1_TOP + T2_H + 5.5, 0);
  mandir.add(t2Saffron);
  const T2_TOP = T1_TOP + T2_H + 6.5;

  // Chhatris on tier 2
  const c2s = 0.8;
  [[-T2_W/2-2, T2_D/2+2], [T2_W/2+2, T2_D/2+2], [-T2_W/2-2, -T2_D/2-2], [T2_W/2+2, -T2_D/2-2],
   [-T2_W/4, T2_D/2+2], [T2_W/4, T2_D/2+2],
   [-T2_W/2-2, 0], [T2_W/2+2, 0]
  ].forEach(([cx, cz]) => addChhatri(cx, T2_TOP, cz, c2s));

  // ── TIER 3 (TOP) — the shikhara rises from here ────────
  const T3_W = 100, T3_D = 75, T3_H = 22;
  const t3Body = new THREE.Mesh(new THREE.BoxGeometry(T3_W, T3_H, T3_D), pinkLight);
  t3Body.position.set(0, T2_TOP + T3_H / 2, 0);
  mandir.add(t3Body);
  const t3Band = new THREE.Mesh(new THREE.BoxGeometry(T3_W + 3, 2, T3_D + 3), pinkDark);
  t3Band.position.set(0, T2_TOP + T3_H * 0.55, 0);
  mandir.add(t3Band);
  const t3Roof = new THREE.Mesh(new THREE.BoxGeometry(T3_W + 14, 3, T3_D + 14), pinkLight);
  t3Roof.position.set(0, T2_TOP + T3_H + 1, 0);
  mandir.add(t3Roof);
  const t3RoofEdge = new THREE.Mesh(new THREE.BoxGeometry(T3_W + 17, 1.6, T3_D + 17), pinkDark);
  t3RoofEdge.position.set(0, T2_TOP + T3_H + 3.2, 0);
  mandir.add(t3RoofEdge);
  // Saffron band along tier 3 — every tier roof carries one
  const t3Saffron = new THREE.Mesh(new THREE.BoxGeometry(T3_W + 19, 1.0, T3_D + 19), saffronMat);
  t3Saffron.position.set(0, T2_TOP + T3_H + 4.4, 0);
  mandir.add(t3Saffron);
  const T3_TOP = T2_TOP + T3_H + 5.0;

  // Corner chhatris on tier 3
  const c3s = 0.7;
  [[-T3_W/2-1, T3_D/2+1], [T3_W/2+1, T3_D/2+1], [-T3_W/2-1, -T3_D/2-1], [T3_W/2+1, -T3_D/2-1]]
    .forEach(([cx, cz]) => addChhatri(cx, T3_TOP, cz, c3s));

  // ── MAIN SHIKHARA (beehive curvilinear tower) ───────────
  // Stacked ribbed rings, each smaller than the last, following a smooth
  // beehive curve. Horizontal bands between groups of rings.
  const SHIK_H = 110, SHIK_TIERS = 18, SHIK_BASE_R = 32;
  for (let t = 0; t < SHIK_TIERS; t++) {
    const frac = t / SHIK_TIERS;
    // Beehive profile: starts wide, curves inward gently, narrows sharply at top
    const profile = Math.cos(frac * Math.PI * 0.48) * (1 - frac * 0.35);
    const r = SHIK_BASE_R * profile;
    const tierH = SHIK_H / SHIK_TIERS;
    // Alternate between slightly different pinks for the ribbed look
    const mat = t % 3 === 0 ? pinkDark : (t % 3 === 1 ? pinkStone : pinkLight);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, tierH, 12), mat);
    ring.position.set(0, T3_TOP + t * tierH + tierH / 2, 0);
    mandir.add(ring);
  }

  // Amalaka (ribbed disc at shikhara summit)
  const shikTop = T3_TOP + SHIK_H;
  const amalaka = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 5, 16), goldMat);
  amalaka.position.set(0, shikTop + 2.5, 0);
  mandir.add(amalaka);
  // Kalasha (pot)
  const kalasha = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), goldMat);
  kalasha.position.set(0, shikTop + 8, 0);
  mandir.add(kalasha);
  // Tall gold flagpole rising from the kalasha, thick enough to read at
  // horizon distance. It stays OUTSIDE the flag group (and so gets merged):
  // a pole does not flap, only the cloth does.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 45, 8), goldMat);
  pole.position.set(0, shikTop + 30.5, 0);
  mandir.add(pole);

  // ── RED DHWAJA (saffron flag, waving in the wind) ────────
  // Nothing in this group is merged, so the cloth can animate at runtime.
  // Scaled up 3x: at ~520 units out a 26-unit flag is a few pixels of nothing.
  const FLAG_S = 3;
  const flagGroup = new THREE.Group();
  flagGroup.position.set(2.5, shikTop + 44, 0);
  flagGroup.rotation.y = -0.4;          // 3/4 turn toward the camera down -Z
  flagGroup.userData.noMerge = true;

  // Wavy flag shape — the curved edges read as cloth caught in the wind
  const flagShape = new THREE.Shape();
  flagShape.moveTo(0, 0);
  flagShape.quadraticCurveTo(8 * FLAG_S, 5 * FLAG_S, 16 * FLAG_S, 3 * FLAG_S);
  flagShape.quadraticCurveTo(22 * FLAG_S, 1 * FLAG_S, 26 * FLAG_S, 4 * FLAG_S);
  flagShape.lineTo(25 * FLAG_S, -2 * FLAG_S);
  flagShape.quadraticCurveTo(18 * FLAG_S, -4 * FLAG_S, 12 * FLAG_S, -1 * FLAG_S);
  flagShape.quadraticCurveTo(6 * FLAG_S, 1 * FLAG_S, 0, -2 * FLAG_S);
  flagShape.lineTo(0, 0);
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(flagShape), flagMat);
  flag.userData.noMerge = true;
  flagGroup.add(flag);

  // Saffron secondary pennant below the main dhwaja
  const pennantShape = new THREE.Shape();
  pennantShape.moveTo(0, -2 * FLAG_S);
  pennantShape.quadraticCurveTo(10 * FLAG_S, -5 * FLAG_S, 18 * FLAG_S, -3 * FLAG_S);
  pennantShape.lineTo(16 * FLAG_S, -6 * FLAG_S);
  pennantShape.quadraticCurveTo(8 * FLAG_S, -8 * FLAG_S, 0, -5 * FLAG_S);
  pennantShape.lineTo(0, -2 * FLAG_S);
  const pennant = new THREE.Mesh(new THREE.ShapeGeometry(pennantShape), saffronBright);
  pennant.userData.noMerge = true;
  flagGroup.add(pennant);

  mandir.add(flagGroup);
  // Belt and braces: every mesh in the group carries noMerge, whatever it is
  flagGroup.traverse(o => { o.userData.noMerge = true; });
  // Store reference for animation
  mandir.userData.flagGroup = flagGroup;

  // ── MANDAPA (pillared entrance hall, projecting forward) ─
  const MAND_W = 90, MAND_H = 32, MAND_D = 55;
  const mandZ = T1_D / 2 + MAND_D / 2 - 5;
  // Main body
  const mandBody = new THREE.Mesh(new THREE.BoxGeometry(MAND_W, MAND_H, MAND_D), pinkStone);
  mandBody.position.set(0, platTop + MAND_H / 2, mandZ);
  mandir.add(mandBody);
  // Arched openings along the mandapa front
  for (let a = 0; a < 5; a++) {
    const ax = -MAND_W / 2 + 12 + a * (MAND_W - 24) / 4;
    const archVoid = new THREE.Mesh(new THREE.BoxGeometry(10, 22, 5), darkVoid);
    archVoid.position.set(ax, platTop + 12, mandZ + MAND_D / 2);
    mandir.add(archVoid);
    // Semicircular arch top
    const aTop = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 5, 5, 8, 1, false, 0, Math.PI), pinkLight
    );
    aTop.rotation.z = Math.PI / 2;
    aTop.rotation.y = Math.PI / 2;
    aTop.position.set(ax, platTop + 23, mandZ + MAND_D / 2);
    mandir.add(aTop);
  }
  // Mandapa pillars (between arches)
  for (let col = 0; col < 6; col++) {
    const px = -MAND_W / 2 + 6 + col * (MAND_W - 12) / 5;
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, MAND_H - 2, 7), pinkDark);
    pil.position.set(px, platTop + MAND_H / 2, mandZ + MAND_D / 2);
    mandir.add(pil);
  }
  // Mandapa roof overhang + saffron accent
  const mandRoof = new THREE.Mesh(new THREE.BoxGeometry(MAND_W + 12, 3, MAND_D + 10), pinkLight);
  mandRoof.position.set(0, platTop + MAND_H + 1.5, mandZ);
  mandir.add(mandRoof);
  const mandSaffron = new THREE.Mesh(new THREE.BoxGeometry(MAND_W + 14, 1.2, MAND_D + 12), saffronBright);
  mandSaffron.position.set(0, platTop + MAND_H + 3.5, mandZ);
  mandir.add(mandSaffron);
  // Smaller shikhara above the mandapa
  const MSHIK_H = 55, MSHIK_TIERS = 10, MSHIK_R = 18;
  for (let t = 0; t < MSHIK_TIERS; t++) {
    const frac = t / MSHIK_TIERS;
    const profile = Math.cos(frac * Math.PI * 0.48) * (1 - frac * 0.35);
    const r = MSHIK_R * profile;
    const tierH = MSHIK_H / MSHIK_TIERS;
    const mat = t % 3 === 0 ? pinkDark : pinkStone;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, tierH, 10), mat);
    ring.position.set(0, platTop + MAND_H + 3 + t * tierH + tierH / 2, mandZ);
    mandir.add(ring);
  }
  // Mandapa finial
  const mShikTop = platTop + MAND_H + 3 + MSHIK_H;
  const mAm = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 3.5, 12), goldMat);
  mAm.position.set(0, mShikTop + 2, mandZ);
  mandir.add(mAm);
  const mKal = new THREE.Mesh(new THREE.SphereGeometry(2.8, 8, 6), goldMat);
  mKal.position.set(0, mShikTop + 5.5, mandZ);
  mandir.add(mKal);
  // Chhatris flanking mandapa
  [[-MAND_W/2, mandZ + MAND_D/4], [MAND_W/2, mandZ + MAND_D/4],
   [-MAND_W/2, mandZ - MAND_D/4], [MAND_W/2, mandZ - MAND_D/4]]
    .forEach(([cx, cz]) => addChhatri(cx, platTop + MAND_H + 3, cz, 0.65));

  // ── GRAND STAIRCASE (leading up to the mandapa) ─────────
  const STAIR_W = 50;
  for (let s = 0; s < 6; s++) {
    const stair = new THREE.Mesh(
      new THREE.BoxGeometry(STAIR_W - s * 2, STEP_H, 10),
      s % 2 === 0 ? whitePlat : whiteBright
    );
    const sy = platTop - (6 - s) * STEP_H + STEP_H / 2;
    const sz = mandZ + MAND_D / 2 + 4 + s * 8;
    stair.position.set(0, sy, sz);
    mandir.add(stair);
  }

  // ── DIYA FESTIVAL LIGHTS (night decoration) ─────────────
  // Small glowing dots along the platform edges and tier rooflines — like
  // diyas lit for a festival, giving the temple a warm glow at night.
  //
  // These are emissive/basic meshes, NOT lights: the scene's point-light count
  // is fixed at four forever (adding one recompiles every shader mid-run), so
  // festival glow is faked with a bright core plus an additive halo sprite.
  //
  // NOTE: this block must stay BELOW the mandapa and staircase sections — it
  // reads MAND_W / MAND_H / MAND_D / mandZ, and those are `const`, so placing
  // it above their declarations throws a temporal-dead-zone ReferenceError and
  // takes the whole environment down with it.

  // Helper: place a line of diyas along an edge
  function addDiyaRow(startX, endX, y, z, count) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const x = startX + (endX - startX) * t;
      // Diya flame (small bright dot)
      const diya = new THREE.Mesh(new THREE.SphereGeometry(0.8, 5, 4), diyaMat);
      diya.position.set(x, y, z);
      mandir.add(diya);
      // Soft glow around it
      const glow = new THREE.Mesh(new THREE.SphereGeometry(2.2, 5, 4), diyaGlowMat);
      glow.position.set(x, y, z);
      mandir.add(glow);
    }
  }

  // Platform edge diyas (front)
  addDiyaRow(-PLAT_W / 2 + 20, PLAT_W / 2 - 20, platTop + 1, PLAT_D / 2 - 10, 16);
  // Tier 1 roof edge diyas (front + back)
  addDiyaRow(-T1_W / 2, T1_W / 2, T1_TOP + 1, T1_D / 2 + 8, 12);
  addDiyaRow(-T1_W / 2, T1_W / 2, T1_TOP + 1, -T1_D / 2 - 8, 12);
  // Tier 2 roof edge diyas
  addDiyaRow(-T2_W / 2, T2_W / 2, T2_TOP + 1, T2_D / 2 + 8, 8);
  // Mandapa front diyas
  addDiyaRow(-MAND_W / 2, MAND_W / 2, platTop + MAND_H + 5, mandZ + MAND_D / 2 + 4, 8);
  // Staircase edge diyas (both sides, stepping down with the stairs)
  for (let s = 0; s < 5; s++) {
    const sz = mandZ + MAND_D / 2 + 6 + s * 8;
    const sy = platTop - (6 - s) * STEP_H + STEP_H;
    for (const side of [-1, 1]) {
      const diya = new THREE.Mesh(new THREE.SphereGeometry(0.7, 5, 4), diyaMat);
      diya.position.set(side * 24, sy + 1, sz);
      mandir.add(diya);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(1.8, 5, 4), diyaGlowMat);
      glow.position.set(side * 24, sy + 1, sz);
      mandir.add(glow);
    }
  }

  // ── DIVINE GLOW (warm golden halo behind the temple) ────
  const glowTex = makeRadialGlowTexture(
    'rgba(255, 200, 120, 0.50)', 'rgba(255, 160, 60, 0.18)', 'rgba(255, 130, 40, 0.0)'
  );
  if (glowTex) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 620),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0.50,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      })
    );
    halo.position.set(0, shikTop * 0.6, -15);
    halo.renderOrder = -1;
    mandir.add(halo);
  }

  mandir.userData.role = 'scenery';
  return mandir;
}
// ===== END ASSET =====

// ===== ASSET id=night-sky-dome label="Night Sky" role=scenery =====
function makeSkyDome() {
  // ART DIRECTION: dark blue-purple night, near-black overhead grading to a
  // warmer indigo at the horizon. Unlit, unfogged, drawn behind everything.
  const uniforms = {
    topColor: { value: new THREE.Color(SKY_TOP_COLOR) },
    horizonColor: { value: new THREE.Color(SKY_HORIZON_COLOR) }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = clamp(pow(max(h, 0.0), 0.55), 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
      }
    `
  });

  const sky = new THREE.Mesh(new THREE.SphereGeometry(620, 24, 16), material);
  sky.renderOrder = -1;
  sky.userData.role = 'scenery';
  return sky;
}
// ===== END ASSET =====

// ===== ASSET id=temple-pillar label="Ancient Temple Pillar" role=scenery =====
function makeTemplePillar() {
  // ART DIRECTION: silhouette = tall square temple pillar with a stepped
  // capital, standing shoulder-height to the trees; signature = carved relief
  // bands, weathered warm grey stone, dark green vines climbing the shaft.
  const pillar = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.92, metalness: 0.02 });
  const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x6d5a43, roughness: 0.95, metalness: 0.02 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x38512e, roughness: 1.0 });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1e3d22, roughness: 0.95 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x27522c, roughness: 0.95 });

  const shaftHeight = 4.6;

  // Stepped plinth
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 1.5), stoneDarkMat);
  base1.position.set(0, 0.16, 0);
  pillar.add(base1);

  const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.26, 1.25), stoneMat);
  base2.position.set(0, 0.45, 0);
  pillar.add(base2);

  // Main shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.95, shaftHeight, 0.95), stoneMat);
  shaft.position.set(0, 0.58 + shaftHeight / 2, 0);
  shaft.castShadow = true;
  pillar.add(shaft);

  // Carved relief bands down the shaft
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.42, 1.02), stoneDarkMat);
    band.position.set(0, 1.35 + i * 1.35, 0);
    pillar.add(band);
  }

  // Stepped capital
  const capital1 = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.26, 1.28), stoneMat);
  capital1.position.set(0, shaftHeight + 0.72, 0);
  pillar.add(capital1);

  const capital2 = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.3, 1.62), stoneDarkMat);
  capital2.position.set(0, shaftHeight + 1.0, 0);
  pillar.add(capital2);

  // Moss creeping up from the base
  const moss = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.7, 0.99), mossMat);
  moss.position.set(0, 1.0, 0);
  moss.scale.set(1.01, 1, 1.01);
  pillar.add(moss);

  // Vines spiralling up the shaft
  for (let v = 0; v < 2; v++) {
    const points = [];
    const dir = v === 0 ? 1 : -1;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const angle = dir * t * Math.PI * 2.4 + v * 2.0;
      const y = 0.4 + t * (shaftHeight + 0.4);
      points.push(new THREE.Vector3(Math.cos(angle) * 0.52, y, Math.sin(angle) * 0.52));
    }
    const vine = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.035, 5, false),
      vineMat
    );
    pillar.add(vine);

    // A few leaf clusters along it
    for (let l = 1; l < 5; l++) {
      const p = points[l * 2];
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), leafMat);
      leaf.position.copy(p);
      leaf.scale.set(1.3, 0.6, 1.0);
      pillar.add(leaf);
    }
  }

  pillar.userData.role = 'scenery';
  return pillar;
}
// ===== END ASSET =====

// ===== ASSET id=canopy-tree label="Dark Canopy Tree" role=scenery =====
function makeTree() {
  // ART DIRECTION: silhouette = heavy rounded canopy on a slim dark trunk,
  // massed into a wall of forest behind the pillars; signature = overlapping
  // dark green spheres, near-black trunk, sways from the base.
  const tree = new THREE.Group();

  // Everything hangs off the trunk group so swaying it moves the whole tree
  const trunkGroup = new THREE.Group();
  trunkGroup.name = 'trunk';
  tree.add(trunkGroup);

  const barkMat = new THREE.MeshStandardMaterial({ color: 0x33241a, roughness: 1.0 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d4a2a, roughness: 0.98 });

  const height = 3.4 + Math.random() * 1.8;

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.27, height, 7), barkMat);
  trunk.position.set(0, height / 2, 0);
  trunkGroup.add(trunk);

  // Overlapping canopy spheres
  const blobs = [
    [0, height + 0.5, 0, 1.65],
    [-0.85, height + 0.15, 0.35, 1.15],
    [0.9, height + 0.25, -0.3, 1.25],
    [0.1, height + 1.35, 0.15, 1.0]
  ];
  blobs.forEach(([x, y, z, r], i) => {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 8), leafMat);
    blob.position.set(x, y, z);
    blob.scale.set(1, 0.82, 1);
    trunkGroup.add(blob);
  });

  // Per-tree phase so the canopy does not sway in lockstep
  mergeStatic(trunkGroup);

  tree.userData.swayPhase = Math.random() * Math.PI * 2;
  tree.userData.swayAmount = 0.018 + Math.random() * 0.022;
  tree.userData.role = 'scenery';
  return tree;
}
// ===== END ASSET =====

// ===== ASSET id=vine-curtain label="Hanging Vine Curtain" role=scenery =====
function makeVineCurtain() {
  // ART DIRECTION: a ragged sheet of creeper hanging between the trees, broken
  // into strands of different lengths so the silhouette stays organic.
  const curtain = new THREE.Group();

  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1a3520, roughness: 0.98 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x214726, roughness: 0.98 });

  const strands = 7;
  for (let i = 0; i < strands; i++) {
    const x = -1.5 + (i / (strands - 1)) * 3.0;
    const len = 1.4 + Math.random() * 2.6;

    const points = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      points.push(new THREE.Vector3(
        x + Math.sin(t * 3 + i) * 0.12,
        -t * len,
        Math.cos(t * 2 + i) * 0.1
      ));
    }
    const strand = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.025, 4, false),
      vineMat
    );
    curtain.add(strand);

    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), leafMat);
    tip.position.set(x, -len, 0);
    tip.scale.set(1.2, 0.7, 1.0);
    curtain.add(tip);
  }

  curtain.userData.role = 'scenery';
  return curtain;
}
// ===== END ASSET =====

// ===== ASSET id=stone-pedestal label="Mossy Stone Pedestal" role=scenery =====
function makeStonePedestal() {
  // ART DIRECTION: silhouette = a squat carved block at the path's edge, its
  // crown gone green; signature = a chamfered cap over a recessed carved panel,
  // moss lying in flat patches on top; colors = warm stone #9b8060, moss
  // #33502a. Decoration - it stands clear of the running lanes.
  const pedestal = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9b8060, roughness: 0.92, metalness: 0.02 });
  const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x74604a, roughness: 0.95 });
  const carveMat = new THREE.MeshStandardMaterial({ color: 0xb2916c, roughness: 0.88 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x33502a, roughness: 1.0 });

  const H = 1.85;

  // Stepped footing
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.86), stoneDarkMat);
  plinth.position.set(0, 0.07, 0);
  plinth.receiveShadow = true;
  pedestal.add(plinth);

  const step = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.72), stoneMat);
  step.position.set(0, 0.2, 0);
  pedestal.add(step);

  // Tall carved shaft - upright and narrow, so its silhouette is a shrine post
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.56, H - 0.5, 0.56), stoneMat);
  body.position.set(0, 0.26 + (H - 0.5) / 2, 0);
  body.castShadow = true;
  body.receiveShadow = true;
  pedestal.add(body);

  // Deep carved panel down each face, with a relief inside it
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([sx, sz]) => {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(sx === 0 ? 0.38 : 0.03, H - 0.85, sx === 0 ? 0.03 : 0.38),
      stoneDarkMat
    );
    panel.position.set(sx * 0.28, 0.26 + (H - 0.5) / 2, sz * 0.28);
    pedestal.add(panel);

    for (let i = 0; i < 3; i++) {
      const relief = new THREE.Mesh(
        new THREE.BoxGeometry(sx === 0 ? 0.22 : 0.02, 0.05, sx === 0 ? 0.02 : 0.22),
        carveMat
      );
      relief.position.set(sx * 0.295, 0.62 + i * 0.3, sz * 0.295);
      pedestal.add(relief);
    }
  });

  // Flared cap and cornice
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.64), stoneDarkMat);
  neck.position.set(0, H - 0.2, 0);
  pedestal.add(neck);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.8), stoneMat);
  cap.position.set(0, H - 0.07, 0);
  cap.castShadow = true;
  pedestal.add(cap);

  // Moss over the crown and creeping up from the base
  const patches = [[-0.14, 0.26, 0.2, 0.22], [0.18, 0.22, -0.16, 0.26], [0.02, 0.3, 0.02, 0.2]];
  patches.forEach(([x, w, z, d]) => {
    const moss = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), mossMat);
    moss.position.set(x, H + 0.02, z);
    pedestal.add(moss);
  });

  const mossSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.58), mossMat);
  mossSkirt.position.set(0, 0.42, 0);
  pedestal.add(mossSkirt);

  pedestal.userData.role = 'scenery';
  return pedestal;
}
// ===== END ASSET =====

// ===== ASSET id=path-torch label="Path Fire Torch" role=scenery =====
function makeTorchBrazier() {
  // ART DIRECTION: silhouette = a carved stone bowl on a mossy pedestal with an
  // open fire burning in it; signature = warm orange flame against cold stone,
  // the only warm light on the path. Carries its own point light.
  const torch = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.92 });
  const stoneDarkMat = new THREE.MeshStandardMaterial({ color: 0x6d5a43, roughness: 0.95 });
  const mossMat = new THREE.MeshStandardMaterial({ color: 0x38512e, roughness: 1.0 });
  const emberMat = new THREE.MeshStandardMaterial({
    color: 0x3a0d00, emissive: 0xff3300, emissiveIntensity: 1.1, roughness: 0.8
  });
  const flameOuterMat = new THREE.MeshBasicMaterial({
    color: 0xff6a12, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const flameCoreMat = new THREE.MeshBasicMaterial({
    color: 0xffc46a, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });

  const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.28, 0.95), stoneDarkMat);
  base.position.set(0, 0.14, 0);
  torch.add(base);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 1.0, 8), stoneMat);
  column.position.set(0, 0.78, 0);
  column.castShadow = true;
  torch.add(column);

  const mossRing = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 8), mossMat);
  mossRing.position.set(0, 0.5, 0);
  torch.add(mossRing);

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.32, 0.34, 10), stoneMat);
  bowl.position.set(0, 1.42, 0);
  torch.add(bowl);

  const embers = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), emberMat);
  embers.position.set(0, 1.58, 0);
  torch.add(embers);

  // Flame group: the light flickers it via userData.flame
  const flame = new THREE.Group();
  flame.position.set(0, 1.62, 0);
  torch.add(flame);

  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.5, 7), flameOuterMat);
  flameOuter.position.set(0, 0.25, 0);
  flameOuter.userData.noMerge = true;
  flame.add(flameOuter);

  const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), flameCoreMat);
  flameCore.position.set(0, 0.17, 0);
  flameCore.userData.noMerge = true;
  flame.add(flameCore);

  // No light of its own: a shared pool lights whichever flames are nearest the
  // devotee. Nine point lights, most of them far behind the camera, was costing
  // a full PBR evaluation per pixel each for nothing. See syncWarmLights.
  torch.userData.flame = flame;
  torch.userData.lightHeight = 1.95;

  mergeStatic(torch);

  torch.userData.role = 'scenery';
  return torch;
}
// ===== END ASSET =====

const PILLAR_SPACING = 15.0;
const PILLAR_PAIRS = 8;
const PILLAR_OFFSET_X = 6.2;

const TORCH_SPACING = 30.0;
const TORCH_PAIRS = 3;
const TORCH_OFFSET_X = 5.4;

const TREE_SPACING = 9.0;
const TREE_ROWS = 12;
const TREE_OFFSET_X = 10.5;

const PEDESTAL_SPACING = 24.0;
const PEDESTAL_PAIRS = 5;
const PEDESTAL_OFFSET_X = 4.9;

const CURTAIN_SPACING = 36.0;
const CURTAIN_COUNT = 4;

const pillarPool = [];
const torchPool = [];
const treePool = [];
const curtainPool = [];
const pedestalPool = [];

let swayTime = 0;
let templeFlag = null;

export function createEnvironment(scene) {
  // Night sky dome
  scene.add(makeSkyDome());

  // Dark forest floor either side of the causeway
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x14200f, roughness: 1.0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 1100), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.12, -380);
  floor.receiveShadow = true;
  scene.add(floor);

  // Distant Ram Mandir — mergeStatic collapses everything EXCEPT the flag
  // (which carries userData.noMerge so it stays a separate object for animation)
  const temple = makeMountKailash();
  // Grab the flag BEFORE merging. Plain assignment to the module-level `let`
  // above - declaring it const/let here would shadow it and the flag would
  // never animate.
  templeFlag = temple.userData.flagGroup;
  const kailash = mergeStatic(temple);
  kailash.position.set(0, 0, -520);
  // The chase camera sits at y3.4 and looks DOWN at (0, 1.2, -12) - a 6.9°
  // pitch that puts the highest visible point at z=-520 around y=217. The
  // temple stands 287 units to the tip of its dhwaja, so at full size the
  // shikhara, kalasha, pole and flag were all cropped off the top of the
  // screen. Scaled to fit, the whole silhouette - flag included - is in frame.
  kailash.scale.setScalar(0.70);
  scene.add(kailash);

  // Temple pillars, both sides, every 15 units
  for (let i = 0; i < PILLAR_PAIRS; i++) {
    for (const side of [-1, 1]) {
      const p = mergeStatic(makeTemplePillar());
      p.position.set(side * PILLAR_OFFSET_X, 0, -i * PILLAR_SPACING + 10);
      p.rotation.y = side < 0 ? 0.06 : -0.06;
      scene.add(p);
      pillarPool.push(p);
    }
  }

  // Fire torches, both sides, every 30 units
  for (let i = 0; i < TORCH_PAIRS; i++) {
    for (const side of [-1, 1]) {
      const t = makeTorchBrazier();
      t.position.set(side * TORCH_OFFSET_X, 0, -i * TORCH_SPACING - 4);
      scene.add(t);
      torchPool.push(t);
    }
  }

  // Dense tree canopy behind the pillars, two staggered rows per side
  for (let i = 0; i < TREE_ROWS; i++) {
    for (const side of [-1, 1]) {
      // A back-row tree only every other slot: enough to close the canopy
      // without doubling the tree count.
      const rows = (i % 2 === 0) ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        const t = makeTree();
        const x = side * (TREE_OFFSET_X + row * 5.0 + Math.random() * 2.2);
        const z = -i * TREE_SPACING + 12 - row * 4.5 - Math.random() * 3.0;
        t.position.set(x, 0, z);
        scene.add(t);
        treePool.push(t);
      }
    }
  }

  // Mossy pedestals along the causeway edge, clear of the running lanes
  for (let i = 0; i < PEDESTAL_PAIRS; i++) {
    for (const side of [-1, 1]) {
      const p = mergeStatic(makeStonePedestal());
      p.position.set(side * PEDESTAL_OFFSET_X, 0, -i * PEDESTAL_SPACING - 14);
      p.rotation.y = (Math.random() - 0.5) * 0.3;
      scene.add(p);
      pedestalPool.push(p);
    }
  }

  // Occasional vine curtains hanging between the trees
  for (let i = 0; i < CURTAIN_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const c = mergeStatic(makeVineCurtain());
    c.position.set(side * (TREE_OFFSET_X + 1.5), 5.2, -i * CURTAIN_SPACING - 8);
    scene.add(c);
    curtainPool.push(c);
  }

  return { pillarPool, torchPool, treePool, curtainPool, pedestalPool };
}

// Scrolls the roadside scenery, wraps it around behind the player, and sways
// the canopy.
export function updateEnvironment(scrollDelta, dt = 0) {
  swayTime += dt;

  // Dhwaja flag waving — a gentle oscillation so it looks like wind is blowing
  if (templeFlag) {
    templeFlag.rotation.y = -0.4 + Math.sin(swayTime * 2.5) * 0.25;
    templeFlag.rotation.z = Math.sin(swayTime * 3.2 + 1.0) * 0.08;
    templeFlag.scale.x = 1.0 + Math.sin(swayTime * 4.0) * 0.06;
  }

  // Update Roadside Scenery Scroll
  pillarPool.forEach(p => {
    p.position.z += scrollDelta;
    if (p.position.z > 14) {
      p.position.z -= PILLAR_PAIRS * PILLAR_SPACING;
    }
  });

  // The flames breathe here now that they no longer hang off their own light
  const flicker = getFlickerTime();
  torchPool.forEach((t, i) => {
    t.position.z += scrollDelta;
    if (t.position.z > 14) {
      t.position.z -= TORCH_PAIRS * TORCH_SPACING;
    }
    const flame = t.userData.flame;
    if (flame) {
      const s = 1 + Math.sin(flicker * 8 + i) * 0.09;
      flame.scale.set(s, 1 + Math.sin(flicker * 11 + i) * 0.14, s);
    }
  });

  treePool.forEach(t => {
    t.position.z += scrollDelta;
    if (t.position.z > 16) {
      t.position.z -= TREE_ROWS * TREE_SPACING;
    }
    const trunk = t.children[0];
    if (trunk) {
      trunk.rotation.z = Math.sin(swayTime + t.userData.swayPhase) * t.userData.swayAmount;
      trunk.rotation.x = Math.sin(swayTime * 0.7 + t.userData.swayPhase) * t.userData.swayAmount * 0.6;
    }
  });

  pedestalPool.forEach(p => {
    p.position.z += scrollDelta;
    if (p.position.z > 14) {
      p.position.z -= PEDESTAL_PAIRS * PEDESTAL_SPACING;
    }
  });

  curtainPool.forEach(c => {
    c.position.z += scrollDelta;
    if (c.position.z > 16) {
      c.position.z -= CURTAIN_COUNT * CURTAIN_SPACING;
    }
    c.rotation.z = Math.sin(swayTime * 0.8 + c.position.z) * 0.02;
  });
}

export {
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeStonePedestal,
  PILLAR_SPACING,
  TORCH_SPACING
};
