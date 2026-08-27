// The devotee warrior: mesh, running/jump/slide poses, lane switching and
// the airborne kinematics that carry him over the Snake Way.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from '../systems/AudioSystem.js';
import { spawnFX } from '../systems/FXSystem.js';
import { swing, swingOpposed, swingForward, swingBack, bounce } from '../utils/AnimationHelper.js';

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

let player = null;
let playerLimbs = null;
let shieldMesh = null;
let clock = null;

// Builds the devotee, caches his limb nodes and hangs Vishnu's shield on him.
export function createPlayer(scene, gameClock) {
  clock = gameClock;

  // Instantiate Player
  player = makePlayer();
  player.position.set(0, 0, 0);
  player.rotation.y = Math.PI; // Face down -Z toward Kailash
  scene.add(player);
  window.__gameEntities.player = player;

  // Cache Player Limb Nodes for Running Animation
  playerLimbs = {
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
  shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 16), shieldAuraMat);
  shieldMesh.position.set(0, 1.0, 0);
  shieldMesh.visible = false;
  player.add(shieldMesh);

  return player;
}

export function getPlayer() {
  return player;
}

export function getPlayerLimbs() {
  return playerLimbs;
}

export function setShieldVisible(visible) {
  if (shieldMesh) shieldMesh.visible = visible;
}

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

function updatePlayer(dt) {
  // Let go of a boulder top once it has slid out from under the player, so the
  // devotee falls back to the road instead of hovering at boulder height.
  if (state.standingOn) {
    const support = state.standingOn;
    const stillOn = support.visible &&
      Math.abs(player.position.x - support.position.x) < 1.05 &&
      Math.abs(player.position.z - support.position.z) < 1.15;
    if (!stillOn) {
      state.standingOn = null;
      state.groundY = CONFIG.SURFACE_Y;
      if (state.isGrounded) {
        state.isGrounded = false;
        state.canDoubleJump = true;
      }
    }
  }

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

    if (state.playerY <= state.groundY) {
      state.playerY = state.groundY;
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
      playerLimbs.legL.rotation.x = swing(t, 0.75);
      playerLimbs.legR.rotation.x = swingOpposed(t, 0.75);

      if (playerLimbs.shinL) playerLimbs.shinL.rotation.x = swingBack(t, 0.85);
      if (playerLimbs.shinR) playerLimbs.shinR.rotation.x = swingForward(t, 0.85);

      playerLimbs.armL.rotation.x = swingOpposed(t, 0.75);
      playerLimbs.armR.rotation.x = swing(t, 0.75);

      if (playerLimbs.torso) {
        playerLimbs.torso.position.y = 0.96 + bounce(t * 2, 0.06);
        playerLimbs.torso.rotation.x = 0.14 + (state.speed / 60) * 0.1;
        playerLimbs.torso.rotation.z = swingOpposed(t, 0.05);
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

export { makePlayer, switchLane, doJump, doSlide, updatePlayer };
