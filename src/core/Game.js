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

import { createPlayer, updatePlayer, setShieldVisible } from '../entities/Player.js';
import { createObstaclePool } from '../entities/Obstacles.js';
import { createNaga, triggerNagaChase, updateNaga, hideNaga } from '../entities/NagaChaser.js';

import { createUIRoot, initHUD, initPauseOverlay, updateHUD, showBanner, showPause } from '../ui/HUD.js';
import { initStartScreen, showSplash } from '../ui/StartScreen.js';
import { initGameOverScreens, showGameOver } from '../ui/GameOver.js';

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
camera.position.set(0, 3.4, 6.2);
camera.lookAt(0, 1.2, -10);
camera.updateProjectionMatrix();

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
initSpawnSystem(scene, clock);
initPowerSystem(scene);
initInput();
// ===== END SYSTEM =====

// ===== SYSTEM id=system-update-loop label="Simulation Update Loop" =====
function updateSimulation(dt) {
  if (state.phase !== 'playing') return;

  // Speed Ramp
  state.speed = Math.min(CONFIG.MAX_SPEED, state.speed + CONFIG.SPEED_RAMP * dt);
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
  state.speed = CONFIG.BASE_SPEED;
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

  // Always update particle effects and the torch flicker
  updateFX(dt);
  updateLighting(dt);

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
