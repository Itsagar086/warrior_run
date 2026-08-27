// The devotee warrior: a fully human figure built from primitives, rigged so
// every joint pivots where a real one would, plus the running, jumping and
// sliding animation and the dust his feet kick up.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from '../systems/AudioSystem.js';
import { spawnFX } from '../systems/FXSystem.js';
import { swing, swingForward } from '../utils/AnimationHelper.js';

const SKIN = 0x8b5e3c;
const HAIR = 0x2c1810;
const TILAK = 0xff2200;
const DHOTI = 0xff6600;
const FOOT = 0x6b4423;
const THREAD = 0xffffff;

// Joint heights, measured up from the soles so the figure stands on y = 0
const FOOT_H = 0.08;
const LOWER_LEG_H = 0.35;
const UPPER_LEG_H = 0.38;
const HIP_Y = FOOT_H + LOWER_LEG_H + UPPER_LEG_H; // 0.81
const TORSO_H = 0.65;
const SHOULDER_Y = HIP_Y + TORSO_H - 0.06;
const UPPER_ARM_H = 0.35;
const HEAD_Y = HIP_Y + TORSO_H + 0.26;

const DUST_COUNT = 8;

// Moves a geometry so a limb rotates about its joint rather than its middle.
// Guarded because the headless test harness stubs geometry out.
function shiftGeometry(geo, x, y, z) {
  if (typeof geo.translate === 'function') geo.translate(x, y, z);
  return geo;
}

// Widens the top of a box and narrows its base, for a V-tapered torso. Applied
// before shiftGeometry, while the geometry is still centred on its own origin.
function taperGeometry(geo, topScale, bottomScale) {
  const pos = geo.attributes && geo.attributes.position;
  if (!pos || typeof pos.getY !== 'function') return geo;
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getY(i) > 0 ? topScale : bottomScale;
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  pos.needsUpdate = true;
  if (typeof geo.computeVertexNormals === 'function') geo.computeVertexNormals();
  return geo;
}

// ===== ASSET id=devotee-warrior label="Devotee Warrior" role=player =====
function makePlayer() {
  // ART DIRECTION: silhouette = a lean human Hindu warrior mid-stride, bare
  // chested above a saffron dhoti; signature = topknot bun, red tilak, the
  // white sacred janeu thread crossing the torso; proportion = ~2.1 units tall,
  // built as a real skeleton so the run reads as biomechanics not clockwork;
  // colors = warm brown skin #8b5e3c, saffron #ff6600, dark hair #2c1810.
  const playerGroup = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.9 });
  const tilakMat = new THREE.MeshStandardMaterial({ color: TILAK, emissive: TILAK, emissiveIntensity: 0.4, roughness: 0.5 });
  const dhotiMat = new THREE.MeshStandardMaterial({ color: DHOTI, roughness: 0.8, metalness: 0.0 });
  const footMat = new THREE.MeshStandardMaterial({ color: FOOT, roughness: 0.85 });
  const threadMat = new THREE.MeshStandardMaterial({ color: THREAD, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.18 });

  /* ---------------------------------------------------------------- torso */
  // Pivots at the waist so the run's lean rocks from the hips
  const torsoGeo = shiftGeometry(
    taperGeometry(new THREE.BoxGeometry(0.55, TORSO_H, 0.28), 1.1, 0.86),
    0, TORSO_H / 2, 0
  );
  const torso = new THREE.Mesh(torsoGeo, skinMat);
  torso.name = 'torso';
  torso.position.set(0, HIP_Y, 0);
  torso.castShadow = true;
  playerGroup.add(torso);

  // Sacred thread, worn diagonally across the chest and back
  const janeu = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.015, 8, 20), threadMat);
  janeu.name = 'janeu';
  janeu.position.set(0, TORSO_H * 0.62, 0.01);
  janeu.rotation.set(0.42, 0, 0.72);
  janeu.scale.set(1.06, 1.06, 1.06);
  torso.add(janeu);

  /* ----------------------------------------------------------------- head */
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 16), skinMat);
  head.name = 'head';
  head.position.set(0, HEAD_Y - HIP_Y, 0.01);
  head.castShadow = true;
  torso.add(head);

  const hairBun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), hairMat);
  hairBun.name = 'hairBun';
  hairBun.position.set(0, 0.26, -0.06);
  head.add(hairBun);

  // Hair shell so the bun does not float off a bald head
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.283, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hairMat);
  hairCap.name = 'hairCap';
  hairCap.position.set(0, 0.01, -0.02);
  head.add(hairCap);

  const tilak = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), tilakMat);
  tilak.name = 'tilak';
  tilak.position.set(0, 0.07, 0.27);
  tilak.rotation.x = Math.PI / 2;
  head.add(tilak);

  /* ---------------------------------------------------------------- dhoti */
  const dhoti = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.55, 0.26), dhotiMat);
  dhoti.name = 'dhoti';
  dhoti.position.set(0, HIP_Y - 0.16, 0);
  dhoti.castShadow = true;
  playerGroup.add(dhoti);

  /* ----------------------------------------------------------------- arms */
  function buildArm(side) {
    const sign = side === 'left' ? -1 : 1;

    const upperGeo = shiftGeometry(new THREE.CylinderGeometry(0.1, 0.09, UPPER_ARM_H, 10), 0, -UPPER_ARM_H / 2, 0);
    const upperArm = new THREE.Mesh(upperGeo, skinMat);
    upperArm.name = side + 'UpperArm';
    upperArm.position.set(sign * 0.34, SHOULDER_Y - HIP_Y, 0);
    upperArm.castShadow = true;
    torso.add(upperArm);

    const lowerGeo = shiftGeometry(new THREE.CylinderGeometry(0.09, 0.08, 0.32, 10), 0, -0.16, 0);
    const lowerArm = new THREE.Mesh(lowerGeo, skinMat);
    lowerArm.name = side + 'LowerArm';
    lowerArm.position.set(0, -UPPER_ARM_H, 0);
    lowerArm.castShadow = true;
    upperArm.add(lowerArm);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), skinMat);
    hand.name = side + 'Hand';
    hand.position.set(0, -0.34, 0.01);
    lowerArm.add(hand);

    return { upperArm, lowerArm };
  }

  const leftArm = buildArm('left');
  const rightArm = buildArm('right');

  /* ----------------------------------------------------------------- legs */
  function buildLeg(side) {
    const sign = side === 'left' ? -1 : 1;

    const upperGeo = shiftGeometry(new THREE.CylinderGeometry(0.12, 0.11, UPPER_LEG_H, 10), 0, -UPPER_LEG_H / 2, 0);
    const upperLeg = new THREE.Mesh(upperGeo, skinMat);
    upperLeg.name = side + 'UpperLeg';
    upperLeg.position.set(sign * 0.14, HIP_Y, 0);
    upperLeg.castShadow = true;
    playerGroup.add(upperLeg);

    const lowerGeo = shiftGeometry(new THREE.CylinderGeometry(0.1, 0.09, LOWER_LEG_H, 10), 0, -LOWER_LEG_H / 2, 0);
    const lowerLeg = new THREE.Mesh(lowerGeo, skinMat);
    lowerLeg.name = side + 'LowerLeg';
    lowerLeg.position.set(0, -UPPER_LEG_H, 0);
    lowerLeg.castShadow = true;
    upperLeg.add(lowerLeg);

    const footGeo = shiftGeometry(new THREE.BoxGeometry(0.14, FOOT_H, 0.22), 0, -FOOT_H / 2, 0.05);
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.name = side + 'Foot';
    foot.position.set(0, -LOWER_LEG_H, 0);
    foot.castShadow = true;
    lowerLeg.add(foot);

    return { upperLeg, lowerLeg, foot };
  }

  const leftLeg = buildLeg('left');
  const rightLeg = buildLeg('right');

  /* ------------------------------------------------------- foot dust puff */
  const dustGeo = new THREE.BufferGeometry();
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) dustPositions[i * 3 + 1] = -99; // parked out of sight
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));

  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xd9c3a5,
    size: 0.11,
    transparent: true,
    opacity: 0.75,
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

  playerGroup.userData.parts = {
    torso, head, hairBun, tilak, janeu, dhoti, dust,
    leftUpperArm: leftArm.upperArm, leftLowerArm: leftArm.lowerArm,
    rightUpperArm: rightArm.upperArm, rightLowerArm: rightArm.lowerArm,
    leftUpperLeg: leftLeg.upperLeg, leftLowerLeg: leftLeg.lowerLeg, leftFoot: leftLeg.foot,
    rightUpperLeg: rightLeg.upperLeg, rightLowerLeg: rightLeg.lowerLeg, rightFoot: rightLeg.foot
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

  return player;
}

export function getPlayer() {
  return player;
}

export function getPlayerParts() {
  return parts;
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

  parts.leftUpperLeg.rotation.x = swing(t, 0.7);
  parts.rightUpperLeg.rotation.x = swing(t + Math.PI, 0.7);

  parts.leftLowerLeg.rotation.x = swingForward(t + 0.5, 0.6);
  parts.rightLowerLeg.rotation.x = swingForward(t + Math.PI + 0.5, 0.6);

  parts.leftUpperArm.rotation.x = swing(t + Math.PI, 0.5);
  parts.rightUpperArm.rotation.x = swing(t, 0.5);

  // Elbows carried bent, opening slightly on the backswing
  parts.leftLowerArm.rotation.x = -0.5 - swingForward(t + Math.PI, 0.35);
  parts.rightLowerArm.rotation.x = -0.5 - swingForward(t, 0.35);

  // Ankles roll through the stride
  parts.leftFoot.rotation.x = swing(t + 0.9, 0.25);
  parts.rightFoot.rotation.x = swing(t + Math.PI + 0.9, 0.25);

  parts.torso.rotation.z = swing(t, 0.03);
  parts.torso.rotation.x = 0.1;

  // Head bob, twice per stride. Set from the base height rather than
  // accumulated, so it oscillates instead of drifting upward.
  parts.head.position.y = (HEAD_Y - HIP_Y) + swing(time * 20, 0.008);

  // Each zero crossing is one foot planting: puff dust under that foot
  const stride = Math.sin(t);
  if (prevStride <= 0 && stride > 0) emitDust(0.14);
  else if (prevStride >= 0 && stride < 0) emitDust(-0.14);
  prevStride = stride;
}

// Airborne: arms up, knees tucked, eased in so it does not snap.
function animateJump(dt) {
  const rate = 12;
  parts.leftUpperArm.rotation.x = approach(parts.leftUpperArm.rotation.x, -0.8, rate, dt);
  parts.rightUpperArm.rotation.x = approach(parts.rightUpperArm.rotation.x, -0.8, rate, dt);
  parts.leftLowerArm.rotation.x = approach(parts.leftLowerArm.rotation.x, -0.5, rate, dt);
  parts.rightLowerArm.rotation.x = approach(parts.rightLowerArm.rotation.x, -0.5, rate, dt);

  parts.leftUpperLeg.rotation.x = approach(parts.leftUpperLeg.rotation.x, 0.6, rate, dt);
  parts.rightUpperLeg.rotation.x = approach(parts.rightUpperLeg.rotation.x, 0.6, rate, dt);
  parts.leftLowerLeg.rotation.x = approach(parts.leftLowerLeg.rotation.x, 0.9, rate, dt);
  parts.rightLowerLeg.rotation.x = approach(parts.rightLowerLeg.rotation.x, 0.9, rate, dt);

  parts.torso.rotation.x = approach(parts.torso.rotation.x, -0.05, rate, dt);
  parts.torso.rotation.z = approach(parts.torso.rotation.z, 0, rate, dt);
  parts.head.position.y = approach(parts.head.position.y, HEAD_Y - HIP_Y, rate, dt);
}

// Sliding: legs thrown forward, torso back, the group squashed by updatePlayer.
function animateSlide(dt) {
  const rate = 14;
  parts.leftUpperLeg.rotation.x = approach(parts.leftUpperLeg.rotation.x, -1.15, rate, dt);
  parts.rightUpperLeg.rotation.x = approach(parts.rightUpperLeg.rotation.x, -1.05, rate, dt);
  parts.leftLowerLeg.rotation.x = approach(parts.leftLowerLeg.rotation.x, 0.2, rate, dt);
  parts.rightLowerLeg.rotation.x = approach(parts.rightLowerLeg.rotation.x, 0.25, rate, dt);

  parts.leftUpperArm.rotation.x = approach(parts.leftUpperArm.rotation.x, 0.9, rate, dt);
  parts.rightUpperArm.rotation.x = approach(parts.rightUpperArm.rotation.x, -0.4, rate, dt);
  parts.leftLowerArm.rotation.x = approach(parts.leftLowerArm.rotation.x, -0.3, rate, dt);
  parts.rightLowerArm.rotation.x = approach(parts.rightLowerArm.rotation.x, -0.3, rate, dt);

  parts.torso.rotation.x = approach(parts.torso.rotation.x, -0.6, rate, dt);
  parts.torso.rotation.z = approach(parts.torso.rotation.z, 0, rate, dt);
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

  // Position Root. Sliding squashes the whole figure to half height and drops
  // it half a unit, easing back over the slide's tail.
  const targetSquash = state.isSliding ? 0.5 : 1.0;
  player.scale.y = approach(player.scale.y, targetSquash, 14, dt);
  player.position.y = state.playerY;

  // Keep the shield a sphere while the body squashes underneath it
  if (shieldMesh && player.scale.y > 0.01) shieldMesh.scale.y = 1 / player.scale.y;

  // Animate Rig Limbs
  if (parts) {
    if (state.isSliding) {
      animateSlide(dt);
    } else if (!state.isGrounded) {
      animateJump(dt);
    } else {
      animateRun(clock.getElapsedTime(), dt);
    }

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
