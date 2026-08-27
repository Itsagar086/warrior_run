// The rival Naga: the serpent that hunts a devotee who keeps misreading the
// path. It closes steadily, is shoved back by clean dodges, and strikes when
// it gets close enough.
import * as THREE from 'three';
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from '../systems/AudioSystem.js';
import { spawnFX } from '../systems/FXSystem.js';
import { endRun } from '../systems/ScoreSystem.js';
import { showBanner } from '../ui/HUD.js';
import { getPlayer } from './Player.js';
import { swing } from '../utils/AnimationHelper.js';

// ===== ASSET id=rival-naga-chaser label="Rival Naga" role=enemy =====
function makeRivalNaga() {
  // ART DIRECTION: silhouette = predatory giant cobra surging low across the path; signature = flared iridescent emerald-violet cobra hood, segmented ventral belly plates, glowing predatory amber eyes with venom fangs; proportion = low-profile menacing serpent (1.5m tall, coiled 1.8m depth); colors = emerald dorsal #1b6354, violet flank #603075, mint belly #7ae0b8, eye glow #ffcc00.
  const nagaGroup = new THREE.Group();

  const dorsalMat = new THREE.MeshStandardMaterial({
  color: '#1b6354',
  roughness: 0.4,
  metalness: 0.35
  });
  const violetMat = new THREE.MeshStandardMaterial({
  color: '#603075',
  roughness: 0.5,
  metalness: 0.3
  });
  const bellyMat = new THREE.MeshStandardMaterial({
  color: '#7ae0b8',
  roughness: 0.6,
  metalness: 0.1
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffcc00' });
  const fangMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 });
  const tongueMat = new THREE.MeshStandardMaterial({ color: '#aa1844', roughness: 0.6 });

  // Coiled Sinuous Body along ground (+Z forward toward player, tail trailing -Z)
  const bodyCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0.0, 0.14, -0.9),
  new THREE.Vector3(-0.65, 0.16, -0.4),
  new THREE.Vector3(0.0, 0.20, 0.1),
  new THREE.Vector3(0.70, 0.24, -0.2),
  new THREE.Vector3(0.45, 0.32, 0.5),
  new THREE.Vector3(0.0, 0.55, 0.4),
  new THREE.Vector3(0.0, 0.95, 0.3),
  new THREE.Vector3(0.0, 1.30, 0.25)
  ]);
  const bodyMesh = new THREE.Mesh(new THREE.TubeGeometry(bodyCurve, 36, 0.18, 12, false), dorsalMat);
  bodyMesh.castShadow = true;
  nagaGroup.add(bodyMesh);

  // Pale Segmented Belly Plates on the upright chest portion
  for (let y = 0.55; y <= 1.25; y += 0.10) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.08), bellyMat);
  plate.position.set(0, y, 0.35 - (y - 0.55) * 0.12);
  nagaGroup.add(plate);
  }

  // Upright Cobra Hood Group
  const hoodGroup = new THREE.Group();
  hoodGroup.name = 'hood';
  hoodGroup.position.set(0, 1.15, 0.28);
  nagaGroup.add(hoodGroup);

  // Flared Cobra Hood (broad lateral wings)
  const hoodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.14, 0.55, 14), dorsalMat);
  hoodMesh.scale.set(1.4, 1.0, 0.35);
  hoodMesh.position.set(0, 0.05, 0);
  hoodGroup.add(hoodMesh);

  // Violet dorsal marking patches on hood back
  const hoodMark = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 12), violetMat);
  hoodMark.position.set(0, 0.08, -0.08);
  hoodGroup.add(hoodMark);

  // Serpent Head Group
  const headGroup = new THREE.Group();
  headGroup.name = 'head';
  headGroup.position.set(0, 1.45, 0.26);
  nagaGroup.add(headGroup);

  // Triangular Viper Cranium
  const cranium = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.38, 6), dorsalMat);
  cranium.rotation.x = Math.PI / 2;
  cranium.scale.set(1.1, 0.65, 1.0);
  headGroup.add(cranium);

  // Lower Jaw
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.08, 0.28), bellyMat);
  jaw.position.set(0, -0.09, 0.04);
  headGroup.add(jaw);

  // Glowing Predatory Eyes (+Z facing)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeL.position.set(-0.13, 0.05, 0.08);
  headGroup.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), eyeMat);
  eyeR.position.set(0.13, 0.05, 0.08);
  headGroup.add(eyeR);

  // Venom Fangs
  const fangL = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), fangMat);
  fangL.position.set(-0.08, -0.04, 0.14);
  fangL.rotation.x = Math.PI;
  headGroup.add(fangL);

  const fangR = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 4), fangMat);
  fangR.position.set(0.08, -0.04, 0.14);
  fangR.rotation.x = Math.PI;
  headGroup.add(fangR);

  // Forked Crimson Tongue
  const tongueStem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.18), tongueMat);
  tongueStem.position.set(0, -0.06, 0.22);
  headGroup.add(tongueStem);

  const forkL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), tongueMat);
  forkL.position.set(-0.025, -0.06, 0.32);
  forkL.rotation.y = 0.4;
  headGroup.add(forkL);

  const forkR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.01, 0.08), tongueMat);
  forkR.position.set(0.025, -0.06, 0.32);
  forkR.rotation.y = -0.4;
  headGroup.add(forkR);

  nagaGroup.userData.role = 'enemy';
  nagaGroup.userData.bbox = { w: 1.6, h: 1.5, d: 1.8 };
  nagaGroup.userData.collider = { type: 'sphere', radius: 0.85, offset: [0, 0.75, 0] };

  return nagaGroup;
}
// ===== END ASSET =====

let rivalNaga = null;
let clock = null;

export function createNaga(scene, gameClock) {
  clock = gameClock;

  // Rival Naga Chaser
  rivalNaga = makeRivalNaga();
  rivalNaga.position.set(0, 0, 15.0);
  rivalNaga.visible = false;
  scene.add(rivalNaga);

  return rivalNaga;
}

export function getNaga() {
  return rivalNaga;
}

export function hideNaga() {
  if (rivalNaga) rivalNaga.visible = false;
}

export function triggerNagaChase(reason) {
  state.chase.active = true;
  state.chase.survived = 0;
  state.chase.nagaZ = 16.0;
  // A mistake-summoned chase starts further back: it arrives when the devotee
  // is already hurt, so it must be survivable rather than an execution.
  state.chase.nagaTargetZ = reason === 'mistakes' ? 9.0 : 7.0;
  state.pathMistakes = 0;
  rivalNaga.visible = true;
  rivalNaga.position.set(state.playerX, 0, 16.0);
  playSound('hiss');
  showBanner(
    reason === 'mistakes'
      ? '⚔️ THE NAGA SMELLS YOUR STUMBLES! DODGE 3 HAZARDS! ⚔️'
      : '⚔️ NAGA CHASE! SURVIVE 3 OBSTACLES! ⚔️',
    3.0
  );
}

export function resolveNagaChase(escapedByPower = false) {
  state.chase.active = false;
  state.chase.nextDist = state.distance + CONFIG.NAGA_CHASE_INTERVAL;
  state.chase.nagaTargetZ = 25.0; // retreat
  state.pathMistakes = 0;

  const bonus = escapedByPower ? 350 : 250;
  state.punya += bonus * state.combo;
  showBanner(`✨ NAGA ESCAPED! +${bonus} PUNYA BONUS! ✨`, 2.5);
  playSound('rudraksha');
  spawnFX(rivalNaga.position, '#4de0c0', 25);
}

// A mistake is a hazard the devotee failed to read: it summons the Naga, and
// while the Naga is already hunting it lets the serpent gain ground instead.
export function registerPathMistake() {
  if (state.chase.active) {
    state.chase.survived = 0;
    state.chase.nagaTargetZ -= 2.5;
    playSound('hiss');
    showBanner('🐍 YOU STUMBLED — THE NAGA GAINS GROUND! 🐍', 1.8);
    return;
  }

  state.pathMistakes++;
  if (state.pathMistakes >= CONFIG.NAGA_MISTAKE_TRIGGER) {
    triggerNagaChase('mistakes');
    return;
  }

  const left = CONFIG.NAGA_MISTAKE_TRIGGER - state.pathMistakes;
  showBanner(
    `⚠️ HAZARD HIT! ${state.lives} LIVES LEFT · ${left} MISSTEP${left === 1 ? '' : 'S'} FROM THE NAGA ⚠️`,
    2.2
  );
}

// The Naga is close enough to bite. It costs a life, or the run on the last one.
export function nagaStrike() {
  if (state.stumbleTimer > 0) return;

  const player = getPlayer();

  playSound('hiss');
  spawnFX(new THREE.Vector3(player.position.x, 1.0, player.position.z), '#7ae0b8', 24);

  // Vishnu's shield turns the strike aside
  if (state.shieldTimer > 0) {
    state.chase.nagaZ = 12.0;
    state.chase.nagaTargetZ = 12.0;
    state.stumbleTimer = 0.8;
    showBanner('🛡️ THE NAGA RECOILS FROM VISHNU\'S SHIELD! 🛡️', 2.0);
    return;
  }

  if (state.lives > 1) {
    state.lives--;
    state.stumbleTimer = 1.5;
    state.chase.survived = 0;
    state.chase.nagaZ = CONFIG.NAGA_RECOIL_Z;
    state.chase.nagaTargetZ = CONFIG.NAGA_RECOIL_Z;
    playSound('blast');
    spawnFX(player.position, '#ff8c2e', 20);
    showBanner(`🐍 THE NAGA STRIKES! ${state.lives} LIVES REMAINING! 🐍`, 2.0);
  } else {
    state.lives = 0;
    playSound('blast');
    spawnFX(player.position, '#ff4500', 30);
    endRun(false);
  }
}

// Closes on the player, and bites if it reaches striking range. Returns early
// when a strike ends the run so the caller can stop the frame.
export function updateNaga(dt) {
  // Update Naga Chaser Behavior
  if (state.chase.active) {
    // The serpent gains ground continuously; clean dodges shove it back
    state.chase.nagaTargetZ = Math.max(
      CONFIG.NAGA_CATCH_Z - 0.4,
      state.chase.nagaTargetZ - CONFIG.NAGA_CLOSE_RATE * dt
    );
  }

  if (rivalNaga.visible) {
    state.chase.nagaZ = THREE.MathUtils.lerp(state.chase.nagaZ, state.chase.nagaTargetZ, dt * 4.0);
    rivalNaga.position.set(state.playerX * 0.8, 0, state.chase.nagaZ);
    rivalNaga.rotation.y = Math.PI + swing(clock.getElapsedTime() * 6.0, 0.2);

    if (state.chase.active && state.chase.nagaZ <= CONFIG.NAGA_CATCH_Z) {
      nagaStrike();
      if (state.phase !== 'playing') return;
    }

    if (!state.chase.active && state.chase.nagaZ > 22.0) {
      rivalNaga.visible = false;
    }
  }
}

export { makeRivalNaga };
