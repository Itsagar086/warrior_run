// Punya (merit), the Rudraksha combo multiplier, Shakti gains, and the
// persisted record for the best run so far.
import { CONFIG } from '../utils/Constants.js';
import { state } from '../core/GameState.js';
import { playSound } from './AudioSystem.js';
import { spawnFX } from './FXSystem.js';
import { showBanner, showPause } from '../ui/HUD.js';
import { showGameOver } from '../ui/GameOver.js';

// Where the best run is persisted between sessions.
const BEST_KEY = 'naga-loka-runner:best';

// Merit accrues simply for covering ground, scaled by the active combo.
export function addDistancePunya(scrollDelta) {
  state.punya += scrollDelta * 0.5 * state.combo;
}

export function updateCombo(dt) {
  // Combo Multiplier Decay
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) {
      state.combo = 1;
    }
  }
}

// Om glyph: a little merit and a trickle of Shakti.
export function collectOm(om) {
  om.visible = false;
  state.punya += CONFIG.OM_GLYPH_PUNYA * state.combo;
  state.shakti = Math.min(state.maxShakti, state.shakti + 1.5);
  playSound('om');
  spawnFX(om.position, '#ffaa22', 12);
}

// Rudraksha bead: the multiplier pickup.
export function collectRudraksha(r) {
  r.visible = false;
  state.combo = Math.min(6, state.combo + CONFIG.RUDRAKSHA_PUNYA_MULT - 1);
  state.comboTimer = 12.0; // 12 seconds multiplier extension
  state.punya += 75 * state.combo;
  state.shakti = Math.min(state.maxShakti, state.shakti + 15);
  playSound('rudraksha');
  spawnFX(r.position, '#ffffff', 26);
  showBanner('🕉️ SACRED RUDRAKSHA! 3x PUNYA MULTIPLIER! 🕉️', 2.0);
}

export function loadBest() {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) return;
    const best = JSON.parse(raw);
    state.highScore = Number(best.punya) || 0;
    state.bestDistance = Number(best.distance) || 0;
  } catch (e) {
    // Storage can be blocked inside the sandboxed frame; records are optional.
  }
}

export function saveBest() {
  const punya = Math.floor(state.punya);
  const dist = Math.floor(state.distance);
  let changed = false;
  if (punya > state.highScore) { state.highScore = punya; changed = true; }
  if (dist > state.bestDistance) { state.bestDistance = dist; changed = true; }
  if (!changed) return;
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify({
      punya: state.highScore,
      distance: state.bestDistance
    }));
  } catch (e) {
    // Non-fatal: the in-session record still stands.
  }
}

// Ends the run exactly once, banking the record before the overlay reads it.
export function endRun(isVictory) {
  state.phase = isVictory ? 'victory' : 'gameOver';
  const isNewBest = Math.floor(state.punya) > state.highScore;
  saveBest();
  showPause(false);
  showGameOver(state.punya, isVictory, {
    punya: state.highScore,
    distance: state.bestDistance,
    isNewBest
  });
}
