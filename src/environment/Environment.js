// Everything flanking and behind the path: ancient temple pillars wrapped in
// vines, the dark forest canopy behind them, hanging vine curtains, the fire
// torches that light the way, the night sky dome and Mount Kailash on the
// horizon.
import * as THREE from 'three';
import { mergeStatic } from '../utils/MeshMerge.js';
import { SKY_TOP_COLOR, SKY_HORIZON_COLOR, makeRadialGlowTexture, getFlickerTime } from './Lighting.js';

// ===== ASSET id=ram-mandir-temple label="Ram Mandir Temple" role=scenery =====
function makeMountKailash() {
  // ART DIRECTION: silhouette = the grand Ram Mandir of Ayodhya on the horizon,
  // a three-shikhara Nagara-style temple glowing with divine warmth; the central
  // shikhara (tower) dominates, flanked by two smaller ones; mandapa (pillared
  // hall) in front; a broad stepped platform (jagati) at the base; everything
  // fog-exempt so it stays visible through the mist. This is the pilgrim's
  // destination — the sacred abode of Lord Ram.
  const mandir = new THREE.Group();

  // ----- materials -----
  const sandstoneMat = new THREE.MeshStandardMaterial({
    color: 0xe8c78a, roughness: 0.82, metalness: 0.02, flatShading: true, fog: false
  });
  const sandstoneLight = new THREE.MeshStandardMaterial({
    color: 0xf5dca8, roughness: 0.78, metalness: 0.02, flatShading: true, fog: false
  });
  const sandstoneDark = new THREE.MeshStandardMaterial({
    color: 0xc6a060, roughness: 0.88, metalness: 0.02, flatShading: true, fog: false
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffd700, emissive: 0xff9500, emissiveIntensity: 0.8,
    roughness: 0.3, metalness: 0.6, flatShading: true, fog: false
  });
  const goldBright = new THREE.MeshStandardMaterial({
    color: 0xffe44d, emissive: 0xffaa00, emissiveIntensity: 1.2,
    roughness: 0.2, metalness: 0.7, fog: false
  });
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0xf0d090, emissive: 0xdaa520, emissiveIntensity: 0.35,
    roughness: 0.65, metalness: 0.1, flatShading: true, fog: false
  });

  // ----- jagati (stepped platform base) -----
  const PLAT_W = 280, PLAT_D = 180;
  for (let step = 0; step < 4; step++) {
    const shrink = step * 12;
    const h = 6;
    const mat = step % 2 === 0 ? sandstoneMat : sandstoneLight;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(PLAT_W - shrink, h, PLAT_D - shrink), mat);
    plat.position.set(0, step * h + h / 2, 0);
    mandir.add(plat);
  }
  const platTop = 24;

  // ----- garbhagriha (sanctum body) -----
  const BODY_W = 120, BODY_H = 65, BODY_D = 90;
  const body = new THREE.Mesh(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D), sandstoneMat);
  body.position.set(0, platTop + BODY_H / 2, 0);
  mandir.add(body);

  // Horizontal moulding bands on the body (3 tiers)
  for (let i = 0; i < 3; i++) {
    const bandY = platTop + 18 + i * 18;
    const band = new THREE.Mesh(new THREE.BoxGeometry(BODY_W + 4, 3, BODY_D + 4), sandstoneDark);
    band.position.set(0, bandY, 0);
    mandir.add(band);
  }

  // ----- central shikhara (main tower - Nagara curvilinear) -----
  // Built as stacked, shrinking octagonal tiers to approximate the curved profile
  const SHIK_BASE = 48, SHIK_H = 130, SHIK_TIERS = 14;
  for (let t = 0; t < SHIK_TIERS; t++) {
    const frac = t / SHIK_TIERS;
    // Parabolic taper: wide at base, curving inward toward the top
    const radius = SHIK_BASE * (1 - frac * frac) * 0.5;
    const tierH = SHIK_H / SHIK_TIERS;
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.88, radius, tierH, 8),
      t % 3 === 0 ? sandstoneLight : sandstoneMat
    );
    tier.position.set(0, platTop + BODY_H + t * tierH + tierH / 2, 0);
    mandir.add(tier);
  }

  // Amalaka (ribbed disc at the top of the shikhara)
  const amalakaY = platTop + BODY_H + SHIK_H;
  const amalaka = new THREE.Mesh(new THREE.CylinderGeometry(10, 12, 6, 16), goldMat);
  amalaka.position.set(0, amalakaY + 3, 0);
  mandir.add(amalaka);

  // Kalasha (golden pot finial)
  const kalasha = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 10), goldBright);
  kalasha.position.set(0, amalakaY + 12, 0);
  mandir.add(kalasha);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(2, 14, 8), goldBright);
  spike.position.set(0, amalakaY + 22, 0);
  mandir.add(spike);

  // ----- flanking shikharas (smaller, same profile) -----
  [-70, 70].forEach(xOff => {
    const FLANK_BASE = 30, FLANK_H = 85, FLANK_TIERS = 10;
    for (let t = 0; t < FLANK_TIERS; t++) {
      const frac = t / FLANK_TIERS;
      const radius = FLANK_BASE * (1 - frac * frac) * 0.5;
      const tierH = FLANK_H / FLANK_TIERS;
      const tier = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.88, radius, tierH, 8),
        t % 3 === 0 ? sandstoneLight : sandstoneMat
      );
      tier.position.set(xOff, platTop + BODY_H * 0.6 + t * tierH + tierH / 2, 0);
      mandir.add(tier);
    }
    // Flanking amalaka + kalasha
    const fAmY = platTop + BODY_H * 0.6 + FLANK_H;
    const fAm = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 4, 12), goldMat);
    fAm.position.set(xOff, fAmY + 2, 0);
    mandir.add(fAm);
    const fKal = new THREE.Mesh(new THREE.SphereGeometry(3.5, 10, 8), goldBright);
    fKal.position.set(xOff, fAmY + 8, 0);
    mandir.add(fKal);
    const fSpk = new THREE.Mesh(new THREE.ConeGeometry(1.5, 10, 6), goldBright);
    fSpk.position.set(xOff, fAmY + 15, 0);
    mandir.add(fSpk);
  });

  // ----- mandapa (pillared entrance hall, front of sanctum) -----
  const MAND_W = 80, MAND_H = 40, MAND_D = 50;
  const mandapa = new THREE.Mesh(new THREE.BoxGeometry(MAND_W, MAND_H, MAND_D), sandstoneLight);
  mandapa.position.set(0, platTop + MAND_H / 2, BODY_D / 2 + MAND_D / 2 - 8);
  mandir.add(mandapa);

  // Mandapa dome (smaller shikhara over the hall)
  const MDOME_TIERS = 7, MDOME_H = 50, MDOME_BASE = 28;
  for (let t = 0; t < MDOME_TIERS; t++) {
    const frac = t / MDOME_TIERS;
    const radius = MDOME_BASE * (1 - frac * frac) * 0.5;
    const tierH = MDOME_H / MDOME_TIERS;
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.85, radius, tierH, 8),
      domeMat
    );
    tier.position.set(0, platTop + MAND_H + t * tierH + tierH / 2, BODY_D / 2 + MAND_D / 2 - 8);
    mandir.add(tier);
  }

  // Mandapa pillars (4 pairs along the front)
  for (let col = 0; col < 4; col++) {
    const px = -30 + col * 20;
    for (const dz of [0, MAND_D - 10]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3, MAND_H - 4, 8), sandstoneDark);
      pillar.position.set(px, platTop + (MAND_H - 4) / 2, BODY_D / 2 + dz - 4);
      mandir.add(pillar);
    }
  }

  // ----- entrance arched doorway (torana) -----
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(22, 32, 4), sandstoneDark);
  doorFrame.position.set(0, platTop + 16, BODY_D / 2 + MAND_D - 10);
  mandir.add(doorFrame);
  const doorVoid = new THREE.Mesh(new THREE.BoxGeometry(16, 28, 6), new THREE.MeshStandardMaterial({
    color: 0x1a0f06, roughness: 1.0, fog: false
  }));
  doorVoid.position.set(0, platTop + 14, BODY_D / 2 + MAND_D - 10);
  mandir.add(doorVoid);

  // ----- stairs leading up to the mandapa -----
  for (let s = 0; s < 8; s++) {
    const stair = new THREE.Mesh(
      new THREE.BoxGeometry(40, 3, 8),
      s % 2 === 0 ? sandstoneMat : sandstoneLight
    );
    stair.position.set(0, platTop - (8 - s) * 3 + 1.5, BODY_D / 2 + MAND_D + s * 6);
    mandir.add(stair);
  }

  // ----- side pavilions (smaller gopurams at corners of the platform) -----
  [[-120, -60], [120, -60], [-120, 60], [120, 60]].forEach(([cx, cz]) => {
    const pav = new THREE.Mesh(new THREE.BoxGeometry(20, 25, 20), sandstoneMat);
    pav.position.set(cx, platTop + 12.5, cz);
    mandir.add(pav);
    const pavDome = new THREE.Mesh(new THREE.ConeGeometry(12, 20, 8), domeMat);
    pavDome.position.set(cx, platTop + 35, cz);
    mandir.add(pavDome);
    const pavKal = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), goldBright);
    pavKal.position.set(cx, platTop + 48, cz);
    mandir.add(pavKal);
  });

  // ----- divine golden halo behind the temple -----
  const glowTex = makeRadialGlowTexture(
    'rgba(255, 215, 100, 0.55)', 'rgba(255, 170, 50, 0.20)', 'rgba(255, 140, 0, 0.0)'
  );
  if (glowTex) {
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshBasicMaterial({
        map: glowTex, transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      })
    );
    halo.position.set(0, 130, -10);
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

  // Distant Mount Kailash
  const kailash = mergeStatic(makeMountKailash());
  kailash.position.set(0, 0, -520);
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
