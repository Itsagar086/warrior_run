// Entry point: boots the renderer, builds the world, wires the systems
// together and drives the frame loop.
import * as THREE from 'three';
import { boot } from 'playlabs-boot';

import { CONFIG } from '../utils/Constants.js';
import { state } from './GameState.js';
import { LIGHTING, BACKGROUND_COLOR, setupLighting, updateLighting, enableShadows } from '../environment/Lighting.js';

import { initFX, updateFX } from '../systems/FXSystem.js';
import { playSound } from '../systems/AudioSystem.js';
import { loadBest, endRun, updateCombo, addDistancePunya } from '../systems/ScoreSystem.js';
import { initSpawnSystem, updateSpawning, updateObstacles, updateCollectibles, resetSpawns } from '../systems/SpawnSystem.js';
import { initPowerSystem, updateProjectiles, resetProjectiles } from '../systems/PowerSystem.js';

import { createTrack, updateTrack } from '../environment/Track.js';
import { createEnvironment, updateEnvironment } from '../environment/Environment.js';

import { createPlayer, updatePlayer, setShieldVisible, resetPlayerTrail } from '../entities/Player.js';
import { createObstaclePool } from '../entities/Obstacles.js';
import { createNaga, triggerNagaChase, updateNaga, hideNaga } from '../entities/NagaChaser.js';

import { createFireLights, syncFireLights } from '../environment/Lighting.js';
import { createUIRoot, initHUD, initPauseOverlay, updateHUD, showBanner, showPause } from '../ui/HUD.js';
import { initStartScreen, showSplash } from '../ui/StartScreen.js';
import { initGameOverScreens, showGameOver } from '../ui/GameOver.js';

import { initCameraRig, updateCamera } from './CameraRig.js';
import { initInput } from './InputHandler.js';
import '../utils/AssetFactory.js';

// ===== SYSTEM id=system-boot label="Renderer, Camera & Frame Clock" =====
const {
  renderer,
  scene,
  camera,
  clock,
  canvas
} = boot({
  camera: 'custom',
  lighting: LIGHTING,
  bg: BACKGROUND_COLOR
});

// Setup custom chase camera
camera.fov = 58;
camera.near = 0.1;
camera.far = 700;
camera.updateProjectionMatrix();
initCameraRig(camera);

// Replace the engine's warm sunset rig with the moonlit night rig, and set
// the fog and sky the reference art calls for.
setupLighting(scene, renderer);

// Setup FX Pool
initFX(scene);
// ===== END SYSTEM =====

// ===== SYSTEM id=system-ui-init label="Interface Assembly" =====
const uiRoot = createUIRoot();
initHUD(uiRoot);
initStartScreen(uiRoot);
initGameOverScreens(uiRoot);
initPauseOverlay(uiRoot);

// Legacy global registry, kept so tooling that pokes at window.__game still works.
window.__game = window.__game || {};
window.__game.ui = Object.assign(window.__game.ui || {}, {
  updateHUD, showBanner, showPause, showSplash, showGameOver
});
// Renderer/scene handles for tooling (draw-call counts, scene inspection).
Object.assign(window.__game, { renderer, scene, camera });

loadBest();
showSplash();

// ===== SYSTEM id=system-warmup label="Render Pipeline Warm-up" =====
// three.js compiles a material's shader the first time that material is
// actually rendered. Every hazard in the pool is built hidden, so without this
// each type compiled the moment it first appeared - a 0.5-1.6s freeze mid-run,
// several times per game. Compiling everything up front moves that cost behind
// the splash screen, where nobody is playing.
//
// Both passes matter: compileAsync builds the programs (in parallel where the
// driver supports it), and one throwaway render forces the texture uploads that
// would otherwise stall on first draw.
async function warmUpPipeline() {
  const hidden = [];
  scene.traverse(o => {
    if (!o.visible) { hidden.push(o); o.visible = true; }
  });

  try {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(scene, camera);
    } else if (typeof renderer.compile === 'function') {
      renderer.compile(scene, camera);
    }
    // The splash overlay covers the canvas, so these frames are never seen.
    // Two passes: the first compiles the shadow-depth programs for every caster
    // and uploads textures, the second catches anything the shadow pass itself
    // pulled in. Forcing the shadow map to refresh makes sure casters are not
    // skipped because the map was still considered current.
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  } catch (e) {
    // Warm-up is best effort; a failure here costs smoothness, not correctness.
  }

  for (let i = 0; i < hidden.length; i++) hidden[i].visible = false;
  window.__game.warmedUp = true;
}
// ===== END SYSTEM =====
// ===== END SYSTEM =====

// ===== SYSTEM id=system-world-build label="World & Entity Construction" =====
createTrack(scene);
createEnvironment(scene);
const player = createPlayer(scene, clock);
const naga = createNaga(scene, clock);
const obstaclePool = createObstaclePool(scene);

// The devotee catches the moonlight and receives shadows; hazards cast them
enableShadows(player, { cast: true, receive: true });
enableShadows(naga, { cast: true });
obstaclePool.forEach(o => enableShadows(o, { cast: true }));

// One fire light per pooled pit, owned by the scene so the light count is fixed
createFireLights(scene, obstaclePool.filter(o => o.userData.obstacleType === 'firePit').length);
initSpawnSystem(scene, clock);
initPowerSystem(scene);
initInput();
// ===== END SYSTEM =====

// ===== SYSTEM id=system-update-loop label="Simulation Update Loop" =====
function updateSimulation(dt) {
  if (state.phase !== 'playing') return;

  // Speed: a step every SPEED_STEP_DISTANCE metres, eased into rather than
  // snapped to, so neither the start of a run nor crossing a threshold reads as
  // a jolt.
  const gained = Math.floor(state.distance / CONFIG.SPEED_STEP_DISTANCE) * CONFIG.SPEED_STEP;
  const targetSpeed = Math.min(CONFIG.MAX_SPEED, CONFIG.BASE_SPEED + gained);
  state.speed = THREE.MathUtils.lerp(state.speed, targetSpeed, Math.min(1, CONFIG.SPEED_EASE * dt));
  const scrollDelta = state.speed * dt;
  state.distance += scrollDelta;

  updateCombo(dt);

  // Base Punya score climbs with distance
  addDistancePunya(scrollDelta);

  // Distance Goal Check (2000m to Kailash)
  if (state.distance >= CONFIG.KAILASH_DISTANCE) {
    endRun(true);
    return;
  }

  // Naga Chase Trigger Check
  if (!state.chase.active && state.distance >= state.chase.nextDist) {
    triggerNagaChase();
  }

  // Update Player Physics
  updatePlayer(dt);

  updateTrack(scrollDelta);
  updateEnvironment(scrollDelta, dt);
  updateSpawning();

  updateObstacles(dt, scrollDelta);
  if (state.phase !== 'playing') return; // a fatal hazard ended the run

  updateCollectibles(dt, scrollDelta);
  updateProjectiles(dt);

  updateNaga(dt);
  if (state.phase !== 'playing') return; // the Naga's strike ended the run

  // Update HUD
  updateHUD(state.punya, state.distance, state.shakti, state.activePower, state.combo, state.lives);
}
// ===== END SYSTEM =====

// ===== SYSTEM id=system-game-flow label="Game Start and Restart" =====
window.__startGame = function() {
  state.phase = 'playing';
  state.punya = 0;
  state.shakti = 40;
  state.lives = 3;
  state.stumbleTimer = 0;
  state.distance = 0;
  state.speed = 0; // eases up to BASE_SPEED over the first moment of the run
  state.lane = 1;
  state.playerX = 0;
  state.targetX = 0;
  state.playerY = 0;
  state.playerVY = 0;
  state.groundY = CONFIG.SURFACE_Y;
  state.standingOn = null;
  state.isGrounded = true;
  state.canDoubleJump = true;
  state.isSliding = false;
  state.activePower = 'sudarshan_chakra';
  state.shieldTimer = 0;
  state.combo = 1;
  state.comboTimer = 0;
  state.pathMistakes = 0;
  state.chase.active = false;
  state.chase.survived = 0;
  state.chase.nextDist = CONFIG.NAGA_CHASE_INTERVAL;
  state.chase.nagaZ = 20.0;
  state.chase.nagaTargetZ = 20.0;
  hideNaga();
  setShieldVisible(false);
  showPause(false);

  resetSpawns();
  resetProjectiles();
  resetPlayerTrail();

  playSound('om');
  showBanner('ASCENDING THE SNAKE WAY TO KAILASH!', 2.5);
};

window.__restartGame = function() {
  window.__startGame();
};
// ===== END SYSTEM =====

// ===== SYSTEM id=system-render-loop label="Animation & Render Loop" =====
// The simulation runs on a fixed step so collision can never be stepped over,
// and catches up over at most MAX_CATCH_UP_STEPS frames. The old loop clamped
// dt to a single 1/60 step, which meant a dropped frame advanced the world by
// 16ms no matter how long the stall was - so any hitch read as the game
// freezing and then resuming rather than simply stuttering.
const FIXED_STEP = 1 / 60;
const MAX_CATCH_UP_STEPS = 4;
let simAccumulator = 0;
let lastFrameTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  // Real frame time. clock.getDelta() cannot be used for this: the animation
  // code samples clock.getElapsedTime() mid-frame, which advances the clock and
  // makes the next getDelta() report less than the true frame duration.
  const now = performance.now();
  let frameTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // Discard time beyond the catch-up budget rather than spiralling after a
  // genuine stall (alt-tab, GC, a breakpoint).
  const maxFrame = FIXED_STEP * MAX_CATCH_UP_STEPS;
  if (frameTime > maxFrame) frameTime = maxFrame;
  simAccumulator += frameTime;

  let steps = 0;
  while (simAccumulator >= FIXED_STEP && steps < MAX_CATCH_UP_STEPS) {
    const dt = FIXED_STEP;

    // Update simulation when active
    if (state.phase === 'playing') {
      updateSimulation(dt);
    }

    // Always update particle effects and the torch flicker
    updateFX(dt);
    updateLighting(dt);

    simAccumulator -= FIXED_STEP;
    steps++;
  }

  // Park the fire lights on whichever pits are live this frame
  syncFireLights(obstaclePool);

  // The chase camera is presentation, not simulation, so it eases on the real
  // frame time - that keeps it smooth on a 144Hz display where the fixed
  // simulation step only fires every other frame.
  updateCamera(frameTime);

  // Unconditional Render
  renderer.render(scene, camera);
}

// Compile shaders and upload textures before anyone can press start.
warmUpPipeline();

// Start Render Loop
animate();
// ===== END SYSTEM =====

// Post Ready message to Sandboxed Host
window.parent?.postMessage({ kind: 'ready' }, '*');

window.addEventListener('error', (e) => {
  window.parent?.postMessage({ kind: 'error', message: e.message }, '*');
});
window.addEventListener('unhandledrejection', (e) => {
  window.parent?.postMessage({ kind: 'error', message: e.reason?.message || 'Promise rejected' }, '*');
});
// ===== END SYSTEM =====
