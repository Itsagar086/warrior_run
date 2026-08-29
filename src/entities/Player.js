// The devotee warrior. The figure is one continuous, muscled, SKINNED mesh -
// sculpted as blended signed-distance anatomy, polygonised with marching cubes
// and weighted to a skeleton (see WarriorBody.js and utils/SdfKit.js). The
// animation below drives the BONES: bones are Object3Ds, so the same rotation
// writes that used to swing rigid group pivots now bend the mesh smoothly at
// every joint. This file re-rigs nothing - it just runs him.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from '../systems/AudioSystem.js';
import { spawnFX } from '../systems/FXSystem.js';
import { swing, swingForward, bounce } from '../utils/AnimationHelper.js';
import { shakeCamera } from '../core/CameraRig.js';
import { buildWarrior } from './WarriorBody.js';

// Joint heights, measured up from the soles so the figure stands on y = 0.
// Read back off the built body in makePlayer, so a re-sculpt with different
// proportions cannot silently desynchronise the animation from the mesh.
let HIP_Y = 1.05;
let SHOULDER_Y = 1.715;
let HEAD_Y = 1.86;
let TORSO_H = SHOULDER_Y - HIP_Y;

const DUST_COUNT = 8;

// Motion trail: a few simplified silhouettes at where the devotee was a moment
// ago. Full clones of the rig would be three times his mesh count in
// transparent geometry, which is a lot of overdraw for a smear.
const TRAIL_GHOSTS = 3;
const TRAIL_SAMPLE_GAP = 4;                        // frames between ghosts
const TRAIL_HISTORY = TRAIL_GHOSTS * TRAIL_SAMPLE_GAP + 2;
const TRAIL_OPACITY = [0.15, 0.09, 0.045];
// The trail only shows when he is actually moving across or up the lane, so a
// straight run does not just look like a thicker player.
const TRAIL_FULL_AT = 0.85;

// ===== ASSET id=devotee-warrior label="Devotee Warrior" role=player =====
function makePlayer() {
  // ART DIRECTION: silhouette = a lean, strongly muscled Hindu warrior devotee;
  // signature = topknot bun, rudraksha at the neck, both arms and both wrists,
  // the janeu across the back, a knee-length saffron dhoti, bare feet;
  // build = ONE continuous skinned mesh for the body and one for the cloth,
  // bent by bones - which is why he moves like a body and not like a puppet.
  const playerGroup = new THREE.Group();

  const W = buildWarrior();
  playerGroup.add(W.root);

  HIP_Y = W.landmarks.hip;
  SHOULDER_Y = W.landmarks.shoulder;
  HEAD_Y = W.landmarks.head;
  TORSO_H = SHOULDER_Y - HIP_Y;

  /* ------------------------------------------------------- foot dust puff */
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) dustPositions[i * 3 + 1] = -99; // parked out of sight
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xe8d6ba,
    size: 0.17,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  }));
  dust.name = 'footDust';
  dust.frustumCulled = false;
  playerGroup.add(dust);

  /* ------------------------------------------------------------- metadata */
  playerGroup.userData.role = 'player';
  playerGroup.userData.bbox = { w: 0.9, h: 2.1, d: 0.6 };
  playerGroup.userData.anchors = {
    feet: { x: 0, y: 0, z: 0 },
    belowFeet: { x: 0, y: -0.1, z: 0 },
    hip: { x: 0, y: HIP_Y, z: 0 },
    chest: { x: 0, y: HIP_Y + TORSO_H * 0.7, z: 0.15 },
    back: { x: 0, y: HIP_Y + TORSO_H * 0.7, z: -0.16 },
    leftHand: { x: -0.34, y: SHOULDER_Y - 0.7, z: 0 },
    rightHand: { x: 0.34, y: SHOULDER_Y - 0.7, z: 0 },
    head: { x: 0, y: HEAD_Y, z: 0 },
    topOfHead: { x: 0, y: HEAD_Y + 0.4, z: 0 }
  };

  // Pulsed when he takes a hit, instead of strobing his visibility on and off.
  playerGroup.userData.bodyMaterials = W.flashMaterials;

  // The animation's contract. Every entry is a BONE: the same .rotation and
  // .position writes that drove the old rigid pivots now deform the skinned
  // mesh smoothly through the shoulders, elbows, hips, knees and ankles.
  playerGroup.userData.parts = {
    torso: W.bones.torso, head: W.bones.head, dust,
    leftUpperArm: W.bones.upperArmL, leftLowerArm: W.bones.forearmL,
    rightUpperArm: W.bones.upperArmR, rightLowerArm: W.bones.forearmR,
    leftUpperLeg: W.bones.thighL, leftLowerLeg: W.bones.shinL, leftFoot: W.bones.footL,
    rightUpperLeg: W.bones.thighR, rightLowerLeg: W.bones.shinR, rightFoot: W.bones.footR
  };

  return playerGroup;
}
// ===== END ASSET =====

let player = null;
let parts = null;
let shieldMesh = null;
let clock = null;

// Foot-dust particle state, parallel to the Points geometry buffer
const dustVel = [];
const dustLife = new Float32Array(DUST_COUNT);
let dustCursor = 0;
let prevStride = 0;

const trailGhosts = [];
const trailHistory = [];
let trailCursor = 0;
let hitFlash = 0;
let slideDrop = 0;

// Builds the devotee, caches his joints and hangs Vishnu's shield on him.
export function createPlayer(scene, gameClock) {
  clock = gameClock;

  player = makePlayer();
  player.position.set(0, 0, 0);
  player.rotation.y = Math.PI; // Face down -Z toward Kailash
  scene.add(player);
  window.__gameEntities.player = player;

  parts = player.userData.parts;
  for (let i = 0; i < DUST_COUNT; i++) {
    dustVel.push(new THREE.Vector3());
    dustLife[i] = 0;
  }

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

  buildTrail(scene);

  return player;
}

// Three fading silhouettes, parented to the scene rather than the player so
// they keep their own position while he moves.
function buildTrail(scene) {
  const torsoGeo = new THREE.BoxGeometry(0.55, 0.65, 0.28);
  const headGeo = new THREE.SphereGeometry(0.26, 10, 8);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.24);

  for (let i = 0; i < TRAIL_GHOSTS; i++) {
    const ghost = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffb46a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = HIP_Y + TORSO_H / 2;
    ghost.add(torso);

    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = HEAD_Y;
    ghost.add(head);

    [-0.14, 0.14].forEach(x => {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(x, HIP_Y - 0.36, 0);
      ghost.add(leg);
    });

    ghost.scale.setScalar(0.94 - i * 0.03);
    ghost.name = 'playerGhost' + i;
    ghost.visible = false;
    ghost.userData.material = mat;
    scene.add(ghost);
    trailGhosts.push(ghost);
  }
}

export function getPlayer() {
  return player;
}

export function getPlayerParts() {
  return parts;
}

// Drops the trail history, so a new run does not smear from where the last one
// ended.
export function resetPlayerTrail() {
  trailHistory.length = 0;
  trailCursor = 0;
  hitFlash = 0;
  for (let i = 0; i < trailGhosts.length; i++) {
    trailGhosts[i].visible = false;
    trailGhosts[i].userData.material.opacity = 0;
  }
}

// Records where he is now and fades the ghosts in behind him. They only show
// while he is crossing lanes or airborne - that is where the motion is.
function updateTrail() {
  if (!trailGhosts.length) return;

  trailHistory[trailCursor % TRAIL_HISTORY] = { x: player.position.x, y: player.position.y };
  trailCursor++;

  const running = state.phase === 'playing';
  for (let i = 0; i < trailGhosts.length; i++) {
    const ghost = trailGhosts[i];
    const back = (i + 1) * TRAIL_SAMPLE_GAP;
    const sample = trailHistory[(trailCursor - 1 - back + TRAIL_HISTORY * 2) % TRAIL_HISTORY];

    if (!running || !sample || trailCursor <= back) {
      ghost.visible = false;
      continue;
    }

    const moved = Math.hypot(sample.x - player.position.x, sample.y - player.position.y);
    const strength = Math.min(1, moved / TRAIL_FULL_AT);
    const opacity = TRAIL_OPACITY[i] * strength;

    if (opacity < 0.005) {
      ghost.visible = false;
      continue;
    }
    ghost.visible = true;
    ghost.position.set(sample.x, sample.y, player.position.z);
    ghost.rotation.y = player.rotation.y;
    ghost.scale.y = (0.94 - i * 0.03) * player.scale.y;
    ghost.userData.material.opacity = opacity;
  }
}

// A hit reads as a warm pulse through the body that decays with the stumble
// window, rather than the old on/off visibility strobe.
function updateHitFlash(dt, elapsed) {
  const target = state.stumbleTimer > 0
    ? Math.abs(Math.sin(elapsed * 13)) * Math.min(1, state.stumbleTimer / 0.6)
    : 0;
  hitFlash = THREE.MathUtils.lerp(hitFlash, target, Math.min(1, 14 * dt));

  const mats = player.userData.bodyMaterials;
  if (!mats) return;
  for (let i = 0; i < mats.length; i++) {
    // Emissive colour is a uniform, not a shader define, so pulsing it costs
    // nothing and cannot trigger a recompile.
    if (mats[i].emissive) mats[i].emissive.setRGB(hitFlash * 0.85, hitFlash * 0.12, hitFlash * 0.05);
  }
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

/* ------------------------------------------------------------- animation */

const approach = (current, target, rate, dt) =>
  THREE.MathUtils.lerp(current, target, Math.min(1, rate * dt));

// Kicks a couple of dust particles out from under the planted foot.
function emitDust(footX) {
  if (!parts || !parts.dust) return;
  const arr = parts.dust.geometry.attributes.position.array;

  for (let n = 0; n < 2; n++) {
    const i = dustCursor % DUST_COUNT;
    dustCursor++;

    arr[i * 3] = footX + (Math.random() - 0.5) * 0.1;
    arr[i * 3 + 1] = 0.04;
    arr[i * 3 + 2] = (Math.random() - 0.5) * 0.12;

    // Puffs outward and back, the way dust trails a runner
    dustVel[i].set(
      (Math.random() - 0.5) * 0.9,
      0.45 + Math.random() * 0.5,
      -(0.5 + Math.random() * 0.7)
    );
    dustLife[i] = 0.45 + Math.random() * 0.25;
  }
}

function updateDust(dt, running) {
  if (!parts || !parts.dust) return;
  const attr = parts.dust.geometry.attributes.position;
  const arr = attr.array;
  let alive = false;

  for (let i = 0; i < DUST_COUNT; i++) {
    if (dustLife[i] <= 0) continue;
    dustLife[i] -= dt;
    if (dustLife[i] <= 0) {
      arr[i * 3 + 1] = -99; // park it out of sight
      continue;
    }
    alive = true;
    dustVel[i].y -= 1.6 * dt; // settles back down
    arr[i * 3] += dustVel[i].x * dt;
    arr[i * 3 + 1] += dustVel[i].y * dt;
    arr[i * 3 + 2] += dustVel[i].z * dt;
  }

  attr.needsUpdate = true;
  parts.dust.visible = alive || running;
}

// Human running gait: legs alternate, lower legs follow through, arms swing
// opposite, torso rocks and the head bobs at twice stride rate.
function animateRun(time, dt) {
  const t = time * 10;

  // Legs drive from the hip, and the shin trails the thigh rather than moving
  // with it - that lag is most of what separates a run from a march.
  parts.leftUpperLeg.rotation.x = swing(t, 0.7);
  parts.rightUpperLeg.rotation.x = swing(t + Math.PI, 0.7);

  parts.leftLowerLeg.rotation.x = swingForward(t + 0.5, 0.6);
  parts.rightLowerLeg.rotation.x = swingForward(t + Math.PI + 0.5, 0.6);

  parts.leftUpperArm.rotation.x = swing(t + Math.PI, 0.5);
  parts.rightUpperArm.rotation.x = swing(t, 0.5);

  // Elbows carried bent, opening on the backswing and tucking on the drive
  parts.leftLowerArm.rotation.x = -0.55 - swingForward(t + Math.PI + 0.6, 0.45);
  parts.rightLowerArm.rotation.x = -0.55 - swingForward(t + 0.6, 0.45);

  // Arms carried slightly OUT from the lats, swaying with the stride.
  // Carrying them across the body pressed them into the torso and made the
  // two arms read as different sizes mid-swing.
  parts.leftUpperArm.rotation.z = -0.06 + swing(t + Math.PI, 0.06);
  parts.rightUpperArm.rotation.z = 0.06 + swing(t, 0.06);

  // Ankles roll through the stride
  parts.leftFoot.rotation.x = swing(t + 0.9, 0.25);
  parts.rightFoot.rotation.x = swing(t + Math.PI + 0.9, 0.25);

  // Shoulders counter-rotate against the hips. This is the single biggest
  // reason the old gait read as robotic: the whole trunk was rigid.
  parts.torso.rotation.y = swing(t, 0.14);
  parts.torso.rotation.z = swing(t, 0.045);
  parts.torso.rotation.x = 0.12 + bounce(t, 0.025);
  parts.torso.position.y = HIP_Y + bounce(t, 0.035);

  // The head holds its line against the shoulder yaw and bobs twice a stride
  parts.head.rotation.y = swing(t + Math.PI, 0.08);
  parts.head.rotation.z = swing(t + Math.PI, 0.035);
  parts.head.position.y = (HEAD_Y - HIP_Y) + swing(time * 20, 0.01);

  // Each zero crossing is one foot planting: puff dust under that foot
  const stride = Math.sin(t);
  if (prevStride <= 0 && stride > 0) emitDust(0.14);
  else if (prevStride >= 0 && stride < 0) emitDust(-0.14);
  prevStride = stride;
}

// Airborne: a hero leap. Arms raised and SPREAD - the old pose swung them
// behind the torso, where the chase camera lost them. One knee drives up,
// the trailing leg kicks back, the chest opens.
function animateJump(dt) {
  const rate = 12;
  parts.leftUpperArm.rotation.x = approach(parts.leftUpperArm.rotation.x, -0.55, rate, dt);
  parts.rightUpperArm.rotation.x = approach(parts.rightUpperArm.rotation.x, -0.55, rate, dt);
  parts.leftLowerArm.rotation.x = approach(parts.leftLowerArm.rotation.x, -0.35, rate, dt);
  parts.rightLowerArm.rotation.x = approach(parts.rightLowerArm.rotation.x, -0.35, rate, dt);
  parts.leftUpperArm.rotation.z = approach(parts.leftUpperArm.rotation.z, -0.7, rate, dt);
  parts.rightUpperArm.rotation.z = approach(parts.rightUpperArm.rotation.z, 0.7, rate, dt);

  parts.leftUpperLeg.rotation.x = approach(parts.leftUpperLeg.rotation.x, -0.85, rate, dt);
  parts.rightUpperLeg.rotation.x = approach(parts.rightUpperLeg.rotation.x, 0.35, rate, dt);
  parts.leftLowerLeg.rotation.x = approach(parts.leftLowerLeg.rotation.x, 0.75, rate, dt);
  parts.rightLowerLeg.rotation.x = approach(parts.rightLowerLeg.rotation.x, 1.05, rate, dt);
  parts.leftFoot.rotation.x = approach(parts.leftFoot.rotation.x, 0.35, rate, dt);
  parts.rightFoot.rotation.x = approach(parts.rightFoot.rotation.x, 0.45, rate, dt);

  parts.torso.rotation.x = approach(parts.torso.rotation.x, -0.08, rate, dt);
  parts.torso.rotation.z = approach(parts.torso.rotation.z, 0, rate, dt);
  parts.torso.rotation.y = approach(parts.torso.rotation.y, 0, rate, dt);
  parts.torso.position.y = approach(parts.torso.position.y, HIP_Y, rate, dt);
  parts.head.rotation.y = approach(parts.head.rotation.y, 0, rate, dt);
  parts.head.position.y = approach(parts.head.position.y, HEAD_Y - HIP_Y, rate, dt);
}

// Sliding: legs thrown forward, torso back, the group squashed by updatePlayer.
function animateSlide(dt) {
  const rate = 14;
  parts.leftUpperLeg.rotation.x = approach(parts.leftUpperLeg.rotation.x, -1.15, rate, dt);
  parts.rightUpperLeg.rotation.x = approach(parts.rightUpperLeg.rotation.x, -1.05, rate, dt);
  parts.leftLowerLeg.rotation.x = approach(parts.leftLowerLeg.rotation.x, 0.2, rate, dt);
  parts.rightLowerLeg.rotation.x = approach(parts.rightLowerLeg.rotation.x, 0.25, rate, dt);

  parts.leftUpperArm.rotation.x = approach(parts.leftUpperArm.rotation.x, 0.35, rate, dt);
  parts.rightUpperArm.rotation.x = approach(parts.rightUpperArm.rotation.x, 0.35, rate, dt);
  parts.leftLowerArm.rotation.x = approach(parts.leftLowerArm.rotation.x, -0.25, rate, dt);
  parts.rightLowerArm.rotation.x = approach(parts.rightLowerArm.rotation.x, -0.25, rate, dt);

  parts.torso.rotation.x = approach(parts.torso.rotation.x, -0.45, rate, dt);
  parts.torso.rotation.z = approach(parts.torso.rotation.z, 0, rate, dt);
  parts.torso.rotation.y = approach(parts.torso.rotation.y, 0, rate, dt);
  parts.torso.position.y = approach(parts.torso.position.y, HIP_Y, rate, dt);
  parts.leftUpperArm.rotation.z = approach(parts.leftUpperArm.rotation.z, -0.55, rate, dt);
  parts.rightUpperArm.rotation.z = approach(parts.rightUpperArm.rotation.z, 0.55, rate, dt);
  parts.head.rotation.y = approach(parts.head.rotation.y, 0, rate, dt);
  parts.head.position.y = approach(parts.head.position.y, HEAD_Y - HIP_Y, rate, dt);
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
  }
  player.visible = true;
  updateHitFlash(dt, clock.getElapsedTime());

  // Lane X Interpolation
  state.playerX = THREE.MathUtils.lerp(state.playerX, state.targetX, CONFIG.LANE_SWITCH_SPEED * dt);
  player.position.x = state.playerX;

  // Jump Gravity Kinematics
  if (!state.isGrounded) {
    state.playerVY += CONFIG.GRAVITY * dt;
    state.playerY += state.playerVY * dt;

    if (state.playerY <= state.groundY) {
      // Scale the knock with how hard he came down, so a hop is not a slam
      const impact = Math.min(1, Math.abs(state.playerVY) / 13);
      state.playerY = state.groundY;
      state.playerVY = 0;
      state.isGrounded = true;
      state.canDoubleJump = true;
      if (impact > 0.25) shakeCamera(impact);
    }
  }

  // Slide Timer
  if (state.isSliding) {
    state.slideTimer -= dt;
    if (state.slideTimer <= 0) {
      state.isSliding = false;
    }
  }

  // Position Root. Sliding used to SCALE the figure to half height, which
  // flattened the sculpted body into paper. Now the hips drop instead: the
  // torso and both thigh roots sink together after the pose writes, the legs
  // fold forward, and the mesh keeps its volume all the way down.
  const targetDrop = state.isSliding ? 0.42 : 0;
  slideDrop = approach(slideDrop, targetDrop, 14, dt);
  player.position.y = state.playerY;

  updateTrail();

  // Animate Rig Limbs
  if (parts) {
    if (state.isSliding) {
      animateSlide(dt);
    } else if (!state.isGrounded) {
      animateJump(dt);
    } else {
      animateRun(clock.getElapsedTime(), dt);
    }

    // The slide drop, applied AFTER the pose writes (they set absolute
    // heights). The thigh roots are root-level bones, so they sink explicitly
    // and rise back to HIP_Y as the drop eases out.
    parts.torso.position.y -= slideDrop;
    parts.leftUpperLeg.position.y = HIP_Y - slideDrop;
    parts.rightUpperLeg.position.y = HIP_Y - slideDrop;

    updateDust(dt, state.isGrounded && !state.isSliding);
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
