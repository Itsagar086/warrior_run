import * as THREE from 'three';
import { voxelToMesh, tickVoxels, boot } from 'playlabs-boot';
// ===== ASSET id=mount-kailash-peak label="Mount Kailash Distant Peak" role=scenery =====
export function makeMountKailash() {
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
export function makeRoadsideShrine() {
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

// Pull asset factories registered by game-assets-v2.js into local scope
window.__game = window.__game || {};
window.__game.factories = window.__game.factories || {};
const {
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
  makeRivalNaga,
} = window.__game.factories;

// Register local scenery factories
window.__game.factories.makeMountKailash = makeMountKailash;
window.__game.factories.makeRoadsideShrine = makeRoadsideShrine;


// Pull state & config from game-state-v2.js
const { CONFIG, state } = window.__game;

// Pull UI functions from game-ui-v2.js
const { initUI, updateHUD, showBanner, showGameOver, showSplash } = window.__game.ui;

// 4) UI functions
// ===== SYSTEM id=system-fx label="Reward and Combat FX Pool" =====
const fxPool = [];
const FX_POOL_SIZE = 48;

function initFX(scene) {
  const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffd700' });
  for (let i = 0; i < FX_POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    fxPool.push({
      mesh,
      vel: new THREE.Vector3(),
      life: 0,
      maxLife: 1.0,
      active: false
    });
  }
}

function spawnFX(pos, colorHex, count = 8, speedMult = 1.0) {
  let spawned = 0;
  for (let i = 0; i < fxPool.length; i++) {
    const p = fxPool[i];
    if (!p.active) {
      p.active = true;
      p.life = 0;
      p.maxLife = 0.4 + Math.random() * 0.3;
      p.mesh.material.color.set(colorHex);
      p.mesh.position.copy(pos);
      p.mesh.scale.setScalar(1.0 + Math.random() * 0.6);
      p.mesh.visible = true;

      const angle = Math.random() * Math.PI * 2;
      const elev = (Math.random() - 0.2) * Math.PI;
      const spd = (3.0 + Math.random() * 4.5) * speedMult;
      p.vel.set(
        Math.cos(angle) * Math.cos(elev) * spd,
        Math.sin(elev) * spd + 2.5,
        Math.sin(angle) * Math.cos(elev) * spd
      );

      spawned++;
      if (spawned >= count) break;
    }
  }
}

function updateFX(dt) {
  for (let i = 0; i < fxPool.length; i++) {
    const p = fxPool[i];
    if (p.active) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        p.mesh.visible = false;
      } else {
        p.vel.y -= 18.0 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const scale = 1.0 - (p.life / p.maxLife);
        p.mesh.scale.setScalar(scale);
      }
    }
  }
}
// ===== END SYSTEM =====

// 5) Boot game
const {
  renderer,
  scene,
  camera,
  clock,
  canvas
} = boot({
  camera: 'custom',
  lighting: {
    palette: ['#ff8c2e', '#3a2f6b', '#4de0c0', '#c9a24b', '#20243f'],
    mood: 'sunset'
  },
  bg: '#20243f'
});

// Setup custom chase camera
camera.fov = 58;
camera.near = 0.1;
camera.far = 700;
camera.position.set(0, 3.4, 6.2);
camera.lookAt(0, 1.2, -10);
camera.updateProjectionMatrix();

// Setup FX Pool
initFX(scene);

// Initialize UI
initUI();

// ===== SYSTEM id=system-world label="Snake Way World & Scenery" =====
// Recycled Ground Segments
const GROUND_SEGMENTS = 7;
const SEGMENT_DEPTH = 12.0;
const groundPool = [];
for (let i = 0; i < GROUND_SEGMENTS; i++) {
  const g = makeGroundSegment();
  g.position.set(0, 0, -i * SEGMENT_DEPTH + 12);
  scene.add(g);
  groundPool.push(g);
}

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
const SHRINE_COUNT = 10;
const shrinePool = [];
for (let i = 0; i < SHRINE_COUNT; i++) {
  const s = makeRoadsideShrine();
  const side = (i % 2 === 0) ? -4.6 : 4.6;
  s.position.set(side, 0, -i * 18.0);
  scene.add(s);
  shrinePool.push(s);
}

// Roadside Decorative Pillars (Scenery)
const DECO_PILLAR_COUNT = 10;
const decoPillarPool = [];
for (let i = 0; i < DECO_PILLAR_COUNT; i++) {
  const p = makePillarObstacle();
  p.userData.role = 'scenery'; // prevent collision
  const side = (i % 2 === 0) ? -4.8 : 4.8;
  p.position.set(side, 0, -i * 22.0 - 10);
  scene.add(p);
  decoPillarPool.push(p);
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-entities label="Obstacles, Pickups & Enemy Chaser Pools" =====
// Instantiate Player
const player = makePlayer();
player.position.set(0, 0, 0);
player.rotation.y = Math.PI; // Face down -Z toward Kailash
scene.add(player);
window.__gameEntities.player = player;

// Cache Player Limb Nodes for Running Animation
const playerLimbs = {
  legL: player.getObjectByName('legL'),
  legR: player.getObjectByName('legR'),
  shinL: player.getObjectByName('shinL'),
  shinR: player.getObjectByName('shinR'),
  armL: player.getObjectByName('armL'),
  armR: player.getObjectByName('armR'),
  torso: player.getObjectByName('torso'),
  head: player.getObjectByName('head')
};

// Vishnu Shield Visual Sphere
const shieldAuraMat = new THREE.MeshStandardMaterial({
  color: '#4de0c0',
  emissive: '#4de0c0',
  emissiveIntensity: 0.6,
  transparent: true,
  opacity: 0.45,
  roughness: 0.2
});
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 16), shieldAuraMat);
shieldMesh.position.set(0, 1.0, 0);
shieldMesh.visible = false;
player.add(shieldMesh);

// Rival Naga Chaser
const rivalNaga = makeRivalNaga();
rivalNaga.position.set(0, 0, 15.0);
rivalNaga.visible = false;
scene.add(rivalNaga);

// Obstacles Pool
const OBSTACLE_POOL_SIZE = 18;
const obstaclePool = [];
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

// Collectibles Pool
const omPool = [];
for (let i = 0; i < 18; i++) {
  const om = makeOmGlyph();
  om.visible = false;
  scene.add(om);
  omPool.push(om);
  window.__gameEntities.registerCollectible(om);
}

const rudrakshaPool = [];
for (let i = 0; i < 4; i++) {
  const r = makeRudrakshaBead();
  r.visible = false;
  scene.add(r);
  rudrakshaPool.push(r);
  window.__gameEntities.registerCollectible(r);
}

const powerOrbPool = [];
for (let i = 0; i < 4; i++) {
  const orb = makePowerOrb();
  orb.visible = false;
  scene.add(orb);
  powerOrbPool.push(orb);
  window.__gameEntities.registerCollectible(orb);
}

// Projectile Mesh Pool (Sudarshan Chakra & Trishul)
const projectilePool = [];
const chakraGeo = new THREE.TorusGeometry(0.42, 0.08, 8, 20);
const chakraMat = new THREE.MeshStandardMaterial({
  color: '#ffaa22',
  emissive: '#ff9900',
  emissiveIntensity: 1.0,
  roughness: 0.2,
  metalness: 0.9
});
for (let i = 0; i < 3; i++) {
  const pMesh = new THREE.Mesh(chakraGeo, chakraMat);
  pMesh.rotation.x = Math.PI / 2;
  pMesh.visible = false;
  scene.add(pMesh);
  projectilePool.push({
    mesh: pMesh,
    active: false,
    type: 'chakra',
    pos: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    speed: 40.0,
    dist: 0,
    maxDist: 70.0
  });
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-audio label="Sound Synthesis" =====
let audioCtx = null;
function playSound(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(540, t + 0.18);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    } else if (type === 'om') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.25); // E5
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else if (type === 'rudraksha') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(659.25, t + 0.08);
      osc.frequency.setValueAtTime(880, t + 0.16);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    } else if (type === 'power') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.3);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else if (type === 'blast') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    } else if (type === 'hiss') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.4);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  } catch (e) {}
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-input label="Input Handling & Actions" =====
const keys = {};

function switchLane(delta) {
  if (state.phase !== 'playing') return;
  state.lane = Math.max(0, Math.min(2, state.lane + delta));
  state.targetX = CONFIG.LANES[state.lane];
}

function doJump() {
  if (state.phase !== 'playing') return;
  if (state.isGrounded) {
    state.playerVY = CONFIG.JUMP_IMPULSE;
    state.isGrounded = false;
    state.canDoubleJump = true;
    state.isSliding = false;
    playSound('jump');
  } else if (state.canDoubleJump) {
    state.playerVY = CONFIG.DOUBLE_JUMP_IMPULSE;
    state.canDoubleJump = false;
    state.isSliding = false;
    playSound('jump');
    spawnFX(player.position, '#4de0c0', 10);
  }
}

function doSlide() {
  if (state.phase !== 'playing') return;
  if (!state.isGrounded) {
    // Fast slam into slide
    state.playerVY = -18.0;
  }
  state.isSliding = true;
  state.slideTimer = CONFIG.SLIDE_DURATION;
}

function triggerDivinePower() {
  if (state.phase !== 'playing') return;
  if (!state.activePower) {
    showBanner('COLLECT POWER ORB FIRST!', 1.2);
    return;
  }
  if (state.shakti < 20) {
    showBanner('NEED MORE SHAKTI ENERGY!', 1.2);
    return;
  }

  const power = state.activePower;
  state.shakti = Math.max(0, state.shakti - 25);
  playSound('power');

  if (power === 'sudarshan_chakra') {
    showBanner('⚡ SUDARSHAN CHAKRA UNLEASHED! ⚡', 2.0);
    launchProjectile('chakra', state.playerX, 0.9);
  } else if (power === 'trishul') {
    showBanner('🔱 SHIVA\'S TRISHUL PURIFIES THE PATH! 🔱', 2.0);
    launchProjectile('trishul', -2.2, 1.0);
    launchProjectile('trishul', 0, 1.0);
    launchProjectile('trishul', 2.2, 1.0);
  } else if (power === 'vishnu_shield') {
    showBanner('🛡️ VISHNU\'S PROTECTIVE SHIELD ACTIVE! 🛡️', 2.5);
    state.shieldTimer = 5.5;
    shieldMesh.visible = true;
  }

  // Naga escape condition with power
  if (state.chase.active) {
    resolveNagaChase(true);
  }

  state.activePower = null;
}

function launchProjectile(type, laneX, startY) {
  for (let i = 0; i < projectilePool.length; i++) {
    const p = projectilePool[i];
    if (!p.active) {
      p.active = true;
      p.type = type;
      p.pos.set(laneX, startY, 0);
      p.mesh.position.copy(p.pos);
      p.mesh.visible = true;
      p.dist = 0;
      break;
    }
  }
}

window.__inputLaneChange = switchLane;
window.__inputJump = doJump;
window.__inputSlide = doSlide;
window.__triggerPower = triggerDivinePower;

window.addEventListener('keydown', (e) => {
  if (keys[e.code]) return;
  keys[e.code] = true;

  if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
    switchLane(-1);
  } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
    switchLane(1);
  } else if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Space') {
    doJump();
  } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
    doSlide();
  } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyE') {
    triggerDivinePower();
  } else if (e.code === 'Enter') {
    if (state.phase === 'splash' || state.phase === 'gameOver' || state.phase === 'victory') {
      window.__startGame();
    }
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// Touch Swipe Handling on Canvas
let touchStartX = 0;
let touchStartY = 0;
window.addEventListener('touchstart', (e) => {
  if (e.touches.length > 0) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (e.changedTouches.length > 0) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 35 || Math.abs(dy) > 35) {
      if (Math.abs(dx) > Math.abs(dy)) {
        switchLane(dx > 0 ? 1 : -1);
      } else {
        if (dy < 0) doJump();
        else doSlide();
      }
    }
  }
}, { passive: true });
// ===== END SYSTEM =====

// ===== SYSTEM id=system-spawning label="Spawning & World Scrolling" =====
let nextObstacleDist = 20;
let nextCollectibleDist = 8;
let nextPowerOrbDist = 80;
let lastAsuraDist = 0;
let lastBrokenRoadDist = 0;
let lastEvilSoulDist = 0;

function spawnObstacleAt(z) {
  const dist = state.distance;
  const eligibleTypes = ['firePit', 'pillar', 'boulder'];

  if (dist >= 150) eligibleTypes.push('evilSoul');
  if (dist >= 200) eligibleTypes.push('asura');
  if (dist >= 300) eligibleTypes.push('brokenRoad');

  // Priority check to guarantee consistent interval appearance
  let chosenType = null;
  if (dist >= 200 && (dist - lastAsuraDist) >= 140) {
    chosenType = 'asura';
  } else if (dist >= 300 && (dist - lastBrokenRoadDist) >= 250) {
    chosenType = 'brokenRoad';
  } else if (dist >= 150 && (dist - lastEvilSoulDist) >= 150) {
    chosenType = 'evilSoul';
  } else {
    chosenType = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];
  }

  let freeObs = obstaclePool.find(o => !o.visible && o.userData.obstacleType === chosenType);
  if (!freeObs) {
    freeObs = obstaclePool.find(o => !o.visible && eligibleTypes.includes(o.userData.obstacleType));
  }
  if (!freeObs) return;

  const type = freeObs.userData.obstacleType;
  if (type === 'asura') lastAsuraDist = dist;
  if (type === 'brokenRoad') lastBrokenRoadDist = dist;
  if (type === 'evilSoul') lastEvilSoulDist = dist;

  const chosenLane = Math.floor(Math.random() * 3);
  const laneX = CONFIG.LANES[chosenLane];

  freeObs.position.set(laneX, CONFIG.SURFACE_Y, z);
  freeObs.visible = true;
  if (type === 'evilSoul') {
    freeObs.userData.soulBaseX = laneX;
    freeObs.userData.soulTime = 0;
  }
}

function spawnCollectibleAt(z) {
  // Chance for rare Rudraksha vs Om Glyphs
  if (Math.random() < 0.16) {
    const freeR = rudrakshaPool.find(r => !r.visible);
    if (freeR) {
      // Rare rudraksha spawns off-lane or tricky edge
      const sideOffsets = [-3.1, -2.2, 0, 2.2, 3.1];
      const rx = sideOffsets[Math.floor(Math.random() * sideOffsets.length)];
      freeR.position.set(rx, 1.1, z);
      freeR.visible = true;
      return;
    }
  }

  // Standard Om Glyph line
  const freeOm = omPool.find(o => !o.visible);
  if (freeOm) {
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOm.position.set(laneX, 0.9, z);
    freeOm.visible = true;
  }
}

function spawnPowerOrbAt(z) {
  const freeOrb = powerOrbPool.find(o => !o.visible);
  if (freeOrb) {
    const laneX = CONFIG.LANES[Math.floor(Math.random() * 3)];
    freeOrb.position.set(laneX, 1.2, z);
    freeOrb.visible = true;
  }
}

function triggerNagaChase() {
  state.chase.active = true;
  state.chase.survived = 0;
  state.chase.nagaZ = 16.0;
  state.chase.nagaTargetZ = 3.6; // low behind player
  rivalNaga.visible = true;
  rivalNaga.position.set(state.playerX, 0, 16.0);
  playSound('hiss');
  showBanner('⚔️ NAGA CHASE! SURVIVE 3 OBSTACLES! ⚔️', 3.0);
}

function resolveNagaChase(escapedByPower = false) {
  state.chase.active = false;
  state.chase.nextDist = state.distance + CONFIG.NAGA_CHASE_INTERVAL;
  state.chase.nagaTargetZ = 25.0; // retreat

  const bonus = escapedByPower ? 350 : 250;
  state.punya += bonus * state.combo;
  showBanner(`✨ NAGA ESCAPED! +${bonus} PUNYA BONUS! ✨`, 2.5);
  playSound('rudraksha');
  spawnFX(rivalNaga.position, '#4de0c0', 25);
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-physics label="Player Movement & Physics" =====
function updatePlayer(dt) {
  // Stumble Timer (invulnerability window after Zone 2 hit)
  if (state.stumbleTimer > 0) {
    state.stumbleTimer -= dt;
    player.visible = Math.floor(clock.getElapsedTime() * 20) % 2 === 0;
  } else {
    player.visible = true;
  }

  // Lane X Interpolation
  state.playerX = THREE.MathUtils.lerp(state.playerX, state.targetX, CONFIG.LANE_SWITCH_SPEED * dt);
  player.position.x = state.playerX;

  // Jump Gravity Kinematics
  if (!state.isGrounded) {
    state.playerVY += CONFIG.GRAVITY * dt;
    state.playerY += state.playerVY * dt;

    if (state.playerY <= CONFIG.SURFACE_Y) {
      state.playerY = CONFIG.SURFACE_Y;
      state.playerVY = 0;
      state.isGrounded = true;
      state.canDoubleJump = true;
    }
  }

  // Slide Timer
  if (state.isSliding) {
    state.slideTimer -= dt;
    if (state.slideTimer <= 0) {
      state.isSliding = false;
    }
  }

  // Position Root
  player.position.y = state.playerY + (state.isSliding ? -0.45 : 0);

  // Animate Rig Limbs
  if (playerLimbs.legL && playerLimbs.legR && playerLimbs.armL && playerLimbs.armR) {
    if (state.isSliding) {
      // Slide pose
      playerLimbs.legL.rotation.x = -1.4;
      playerLimbs.legR.rotation.x = -1.3;
      if (playerLimbs.shinL) playerLimbs.shinL.rotation.x = 0.2;
      if (playerLimbs.shinR) playerLimbs.shinR.rotation.x = 0.2;
      playerLimbs.armL.rotation.x = 0.8;
      playerLimbs.armR.rotation.x = -0.5;
      if (playerLimbs.torso) {
        playerLimbs.torso.rotation.x = -0.7;
        playerLimbs.torso.position.y = 0.55;
      }
    } else if (!state.isGrounded) {
      // Air Jump pose
      playerLimbs.legL.rotation.x = -0.5;
      playerLimbs.legR.rotation.x = 0.4;
      if (playerLimbs.shinL) playerLimbs.shinL.rotation.x = 0.9;
      if (playerLimbs.shinR) playerLimbs.shinR.rotation.x = 0.4;
      playerLimbs.armL.rotation.x = -1.2;
      playerLimbs.armR.rotation.x = -1.2;
      if (playerLimbs.torso) {
        playerLimbs.torso.rotation.x = -0.1;
        playerLimbs.torso.position.y = 0.96;
      }
    } else {
      // Athletic Hindu runner stride gait
      const strideFreq = 13.0 + (state.speed - 16.0) * 0.45;
      const t = clock.getElapsedTime() * strideFreq;
      playerLimbs.legL.rotation.x = Math.sin(t) * 0.75;
      playerLimbs.legR.rotation.x = -Math.sin(t) * 0.75;

      if (playerLimbs.shinL) playerLimbs.shinL.rotation.x = Math.max(0, -Math.sin(t) * 0.85);
      if (playerLimbs.shinR) playerLimbs.shinR.rotation.x = Math.max(0, Math.sin(t) * 0.85);

      playerLimbs.armL.rotation.x = -Math.sin(t) * 0.75;
      playerLimbs.armR.rotation.x = Math.sin(t) * 0.75;

      if (playerLimbs.torso) {
        playerLimbs.torso.position.y = 0.96 + Math.abs(Math.sin(t * 2)) * 0.06;
        playerLimbs.torso.rotation.x = 0.14 + (state.speed / 60) * 0.1;
        playerLimbs.torso.rotation.z = -Math.sin(t) * 0.05;
      }
    }
  }

  // Vishnu Shield visual spin & timer
  if (state.shieldTimer > 0) {
    state.shieldTimer -= dt;
    shieldMesh.rotation.y += dt * 4.0;
    if (state.shieldTimer <= 0) {
      shieldMesh.visible = false;
    }
  }
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-update-loop label="Simulation Update Loop" =====
function updateSimulation(dt) {
  if (state.phase !== 'playing') return;

  // Speed Ramp
  state.speed = Math.min(CONFIG.MAX_SPEED, state.speed + CONFIG.SPEED_RAMP * dt);
  const scrollDelta = state.speed * dt;
  state.distance += scrollDelta;

  // Combo Multiplier Decay
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 1;
    }
  }

  // Base Punya score climbs with distance
  state.punya += scrollDelta * 0.5 * state.combo;

  // Distance Goal Check (2000m to Kailash)
  if (state.distance >= CONFIG.KAILASH_DISTANCE) {
    state.phase = 'victory';
    showGameOver(state.punya, true);
    return;
  }

  // Naga Chase Trigger Check
  if (!state.chase.active && state.distance >= state.chase.nextDist) {
    triggerNagaChase();
  }

  // Update Player Physics
  updatePlayer(dt);

  // Update Ground Scroll
  groundPool.forEach(g => {
    g.position.z += scrollDelta;
    if (g.position.z > SEGMENT_DEPTH) {
      g.position.z -= GROUND_SEGMENTS * SEGMENT_DEPTH;
    }
  });

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

  // Spawn Obstacles & Pickups based on distance traveled
  if (state.distance >= nextObstacleDist) {
    spawnObstacleAt(CONFIG.SPAWN_Z);
    nextObstacleDist = state.distance + (18.0 - (state.speed - 16.0) * 0.35);
  }
  if (state.distance >= nextCollectibleDist) {
    spawnCollectibleAt(CONFIG.SPAWN_Z - 2);
    nextCollectibleDist = state.distance + 8.5;
  }
  if (state.distance >= nextPowerOrbDist) {
    spawnPowerOrbAt(CONFIG.SPAWN_Z - 4);
    nextPowerOrbDist = state.distance + 95.0;
  }

  // Update Obstacles
  for (let i = 0; i < obstaclePool.length; i++) {
    const obs = obstaclePool[i];
    if (obs.visible) {
      const oType = obs.userData.obstacleType;

      // Special movement logic per obstacle type
      if (oType === 'asura') {
        // Asuras run toward the player from ahead
        obs.position.z += scrollDelta + 6.0 * dt;
        // Running stride animation for Asura legs & arms
        const time = clock.getElapsedTime();
        const stride = Math.sin(time * 8.0);
        const armStride = Math.sin(time * 8.0 + Math.PI);
        const legL = obs.getObjectByName('legL') || obs.children[8];
        const legR = obs.getObjectByName('legR') || obs.children[9];
        const armL = obs.getObjectByName('armL') || obs.children[6];
        const armR = obs.getObjectByName('armR') || obs.children[7];
        if (legL) legL.rotation.x = stride * 0.6;
        if (legR) legR.rotation.x = -stride * 0.6;
        if (armL) armL.rotation.x = armStride * 0.6;
        if (armR) armR.rotation.x = -armStride * 0.6;
      } else if (oType === 'evilSoul') {
        obs.position.z += scrollDelta;
        const time = clock.getElapsedTime();
        const laneW = CONFIG.LANE_WIDTH || 2.2;
        // Lateral sine drift across lanes AND vertical bobbing
        obs.position.x = (obs.userData.soulBaseX || 0) + Math.sin(time * 1.5) * (laneW * 0.5);
        obs.position.y = 0.3 + Math.sin(time * 3.0) * 0.3;
      } else {
        obs.position.z += scrollDelta;
      }

      // Boulder special spin & dust
      if (oType === 'boulder') {
        if (obs.userData.boulderCore) {
          obs.userData.boulderCore.rotation.x += dt * 6.0;
        }
        if (Math.random() < 0.25) {
          spawnFX(new THREE.Vector3(obs.position.x, 0.1, obs.position.z), '#8a7966', 1, 0.3);
        }
      }

      // Check collision with Player
      const dx = Math.abs(player.position.x - obs.position.x);
      const dz = Math.abs(player.position.z - obs.position.z);

      // Define effective collision thresholds based on obstacle shape
      let hitZ = 0.95;
      let hitX = 0.95;
      if (oType === 'brokenRoad') { hitZ = 1.6; hitX = 1.1; }
      else if (oType === 'evilSoul') { hitZ = 0.8; hitX = 0.8; }
      else if (oType === 'boulder') { hitZ = 1.05; hitX = 1.05; }

      if (dx < hitX && dz < hitZ) {
        // Safe land on top of Boulders
        if (oType === 'boulder' && state.playerY >= 1.35 && state.playerVY <= 0) {
          state.playerY = 1.5;
          state.playerVY = 0;
          state.isGrounded = true;
          continue;
        }

        // FIRE PIT JUMP COLLISION FIX:
        if (oType === 'firePit' && state.playerY >= 0.35) {
          continue;
        }

        // Broken road gap check: playerY >= 0.5 survives airborne, ground loses life
        if (oType === 'brokenRoad' && state.playerY >= 0.5) {
          continue;
        }

        state.lastCollisionRole = 'obstacle';

        // Shield protection absorbs hit completely
        if (state.shieldTimer > 0) {
          obs.visible = false;
          spawnFX(obs.position, '#4de0c0', 20);
          playSound('blast');
          state.punya += 50 * state.combo;
          continue;
        }

        // Ignore hit during stumble invulnerability
        if (state.stumbleTimer > 0) {
          continue;
        }

        // TWO-ZONE OBSTACLE SYSTEM:
        const zone = obs.userData.zone || 1;

        if (zone === 2 && state.lives > 1) {
          // Zone 2 Obstacle: First touch costs 1 life + 1.5s invincibility/stumble timer
          state.lives--;
          state.stumbleTimer = 1.5;
          obs.visible = false;
          playSound('blast');
          spawnFX(player.position, '#ff8c2e', 20);
          showBanner(`⚠️ ZONE 2 HAZARD HIT! ${state.lives} LIVES REMAINING! ⚠️`, 2.0);
        } else {
          // Zone 1 Hazard OR final life lost in Zone 2 -> Game Over
          state.lives = 0;
          state.phase = 'gameOver';
          playSound('blast');
          spawnFX(player.position, '#ff4500', 30);
          showGameOver(state.punya, false);
          return;
        }
      }

      // Check Despawn & Naga Chase obstacle count
      if (obs.position.z > CONFIG.DESPAWN_Z) {
        obs.visible = false;
        if (state.chase.active) {
          state.chase.survived++;
          if (state.chase.survived >= CONFIG.NAGA_CHASE_REQ_OBSTACLES) {
            resolveNagaChase(false);
          }
        }
      }
    }
  }

  // Update Collectibles (Om & Rudraksha)
  omPool.forEach(om => {
    if (om.visible) {
      om.position.z += scrollDelta;
      om.rotation.y += dt * 3.5;

      const dx = Math.abs(player.position.x - om.position.x);
      const dz = Math.abs(player.position.z - om.position.z);
      const dy = Math.abs(player.position.y + 0.9 - om.position.y);

      if (dx < 1.1 && dz < 1.1 && dy < 1.4) {
        om.visible = false;
        state.punya += CONFIG.OM_GLYPH_PUNYA * state.combo;
        state.shakti = Math.min(state.maxShakti, state.shakti + 1.5);
        playSound('om');
        spawnFX(om.position, '#ffaa22', 12);
      } else if (om.position.z > CONFIG.DESPAWN_Z) {
        om.visible = false;
      }
    }
  });

  rudrakshaPool.forEach(r => {
    if (r.visible) {
      r.position.z += scrollDelta;
      r.rotation.y += dt * 2.5;
      r.position.y = 1.1 + Math.sin(clock.getElapsedTime() * 4) * 0.15;

      const dx = Math.abs(player.position.x - r.position.x);
      const dz = Math.abs(player.position.z - r.position.z);

      if (dx < 1.25 && dz < 1.25) {
        r.visible = false;
        state.combo = Math.min(6, state.combo + 2);
        state.comboTimer = 12.0; // 12 seconds multiplier extension
        state.punya += 75 * state.combo;
        state.shakti = Math.min(state.maxShakti, state.shakti + 15);
        playSound('rudraksha');
        spawnFX(r.position, '#ffffff', 26);
        showBanner('🕉️ SACRED RUDRAKSHA! 3x PUNYA MULTIPLIER! 🕉️', 2.0);
      } else if (r.position.z > CONFIG.DESPAWN_Z) {
        r.visible = false;
      }
    }
  });

  powerOrbPool.forEach(orb => {
    if (orb.visible) {
      orb.position.z += scrollDelta;
      orb.rotation.y += dt * 3.0;

      const dx = Math.abs(player.position.x - orb.position.x);
      const dz = Math.abs(player.position.z - orb.position.z);

      if (dx < 1.2 && dz < 1.2) {
        orb.visible = false;
        state.shakti = Math.min(state.maxShakti, state.shakti + CONFIG.SHAKTI_PER_ORB);
        // Cycle power
        const powerList = ['sudarshan_chakra', 'trishul', 'vishnu_shield'];
        state.activePower = powerList[state.powerCycleIndex % powerList.length];
        state.powerCycleIndex++;

        playSound('power');
        spawnFX(orb.position, '#4de0c0', 20);

        const powerName = state.activePower.replace('_', ' ').toUpperCase();
        showBanner(`✨ DIVINE POWER PRIMED: ${powerName}! ✨`, 2.2);
      } else if (orb.position.z > CONFIG.DESPAWN_Z) {
        orb.visible = false;
      }
    }
  });

  // Update Projectiles
  for (let i = 0; i < projectilePool.length; i++) {
    const p = projectilePool[i];
    if (p.active) {
      p.pos.addScaledVector(p.dir, p.speed * dt);
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.z += dt * 25.0;
      p.dist += p.speed * dt;

      // Check collision with obstacles
      for (let j = 0; j < obstaclePool.length; j++) {
        const obs = obstaclePool[j];
        if (obs.visible) {
          const dx = Math.abs(p.pos.x - obs.position.x);
          const dz = Math.abs(p.pos.z - obs.position.z);
          if (dx < 1.2 && dz < 1.4) {
            obs.visible = false;
            state.punya += 50 * state.combo;
            playSound('blast');
            spawnFX(obs.position, '#ffd700', 25);
            break;
          }
        }
      }

      if (p.dist >= p.maxDist) {
        p.active = false;
        p.mesh.visible = false;
      }
    }
  }

  // Update Naga Chaser Behavior
  if (rivalNaga.visible) {
    state.chase.nagaZ = THREE.MathUtils.lerp(state.chase.nagaZ, state.chase.nagaTargetZ, dt * 4.0);
    rivalNaga.position.set(state.playerX * 0.8, 0, state.chase.nagaZ);
    rivalNaga.rotation.y = Math.PI + Math.sin(clock.getElapsedTime() * 6.0) * 0.2;

    if (!state.chase.active && state.chase.nagaZ > 22.0) {
      rivalNaga.visible = false;
    }
  }

  // Update HUD
  updateHUD(state.punya, state.distance, state.shakti, state.activePower, state.combo, state.lives);
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-game-flow label="Game Start and Restart" =====
window.__startGame = function() {
  state.phase = 'playing';
  state.score = 0;
  state.punya = 0;
  state.shakti = 40;
  state.lives = 3;
  state.stumbleTimer = 0;
  state.distance = 0;
  state.speed = CONFIG.BASE_SPEED;
  state.lane = 1;
  state.playerX = 0;
  state.targetX = 0;
  state.playerY = 0;
  state.playerVY = 0;
  state.isGrounded = true;
  state.canDoubleJump = true;
  state.isSliding = false;
  state.activePower = 'sudarshan_chakra';
  state.shieldTimer = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.chase.active = false;
  state.chase.nextDist = 280;
  rivalNaga.visible = false;
  shieldMesh.visible = false;

  nextObstacleDist = 20;
  nextCollectibleDist = 8;
  nextPowerOrbDist = 80;

  // Clear Obstacles & Pickups
  obstaclePool.forEach(o => { o.visible = false; });
  omPool.forEach(o => { o.visible = false; });
  rudrakshaPool.forEach(r => { r.visible = false; });
  powerOrbPool.forEach(p => { p.visible = false; });
  projectilePool.forEach(p => { p.active = false; p.mesh.visible = false; });

  playSound('om');
  showBanner('ASCENDING THE SNAKE WAY TO KAILASH!', 2.5);
};

window.__restartGame = function() {
  window.__startGame();
};
// ===== END SYSTEM =====

// ===== SYSTEM id=system-render-loop label="Animation & Render Loop" =====
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 1 / 60);

  // Update simulation when active
  if (state.phase === 'playing') {
    updateSimulation(dt);
  }

  // Always update particle effects
  updateFX(dt);

  // Camera Follow
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, state.playerX * 0.65, dt * 10.0);
  camera.position.y = 3.4 + (state.playerY > 0 ? state.playerY * 0.35 : 0);
  camera.position.z = 6.2;
  camera.lookAt(state.playerX * 0.35, 1.2 + (state.playerY > 0 ? state.playerY * 0.25 : 0), -12);

  // Unconditional Render
  renderer.render(scene, camera);
}

// Start Render Loop
animate();

// Post Ready message to Sandboxed Host
window.parent?.postMessage({ kind: 'ready' }, '*');

window.addEventListener('error', (e) => {
  window.parent?.postMessage({ kind: 'error', message: e.message }, '*');
});
window.addEventListener('unhandledrejection', (e) => {
  window.parent?.postMessage({ kind: 'error', message: e.reason?.message || 'Promise rejected' }, '*');
});
// ===== END SYSTEM =====