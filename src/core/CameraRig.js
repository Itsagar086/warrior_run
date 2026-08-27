// The chase camera: sits above and behind the devotee, eases rather than snaps,
// and takes a small knock when he lands or gets hit.
import * as THREE from 'three';
import { state } from './GameState.js';

// Resting offset behind and above the devotee
const HEIGHT = 3.4;
const DISTANCE = 6.2;

// How hard the camera chases; low numbers trail further behind the action
const FOLLOW_X = 10.0;
const FOLLOW_Y = 8.0;
const LOOK_EASE = 9.0;

// Peak random offset of a full-strength shake, in world units. Deliberately
// small - this should register as weight, not as a camera fault.
const SHAKE_AMPLITUDE = 0.02;
const SHAKE_DECAY = 4.5;

let camera = null;
let shake = 0;

const lookTarget = new THREE.Vector3(0, 1.2, -12);
const shakeOffset = new THREE.Vector3();

export function initCameraRig(cam) {
  camera = cam;
  camera.position.set(0, HEIGHT, DISTANCE);
  lookTarget.set(0, 1.2, -12);
  shake = 0;
}

// Knocks the camera. `strength` scales the amplitude: 1 is a landing, more is a
// hit. Never shortens a shake already in progress.
export function shakeCamera(strength = 1) {
  shake = Math.max(shake, strength);
}

export function updateCamera(dt) {
  if (!camera) return;

  const airborne = state.playerY > 0 ? state.playerY : 0;

  // Follow. Height eases too - it used to snap straight to the jump height,
  // which read as the camera flinching every time he left the ground.
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, state.playerX * 0.65, Math.min(1, FOLLOW_X * dt));
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, HEIGHT + airborne * 0.35, Math.min(1, FOLLOW_Y * dt));
  camera.position.z = DISTANCE;

  // Aim point eases as well, so a lane change sweeps instead of cutting
  const ease = Math.min(1, LOOK_EASE * dt);
  lookTarget.x = THREE.MathUtils.lerp(lookTarget.x, state.playerX * 0.35, ease);
  lookTarget.y = THREE.MathUtils.lerp(lookTarget.y, 1.2 + airborne * 0.25, ease);
  lookTarget.z = -12;

  // Shake, decaying away over about a quarter second
  if (shake > 0.001) {
    shake = Math.max(0, shake - SHAKE_DECAY * dt * shake - 0.35 * dt);
    const amp = SHAKE_AMPLITUDE * shake;
    shakeOffset.set(
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp,
      (Math.random() * 2 - 1) * amp * 0.5
    );
    camera.position.add(shakeOffset);
  } else {
    shake = 0;
  }

  camera.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);
}

export function getShake() {
  return shake;
}
