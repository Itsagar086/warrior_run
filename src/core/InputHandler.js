// Keyboard, on-screen button and swipe input, mapped onto the devotee's
// actions. Pause lives here too - it is a control, not a game rule.
import { state } from './GameState.js';
import { switchLane, doJump, doSlide } from '../entities/Player.js';
import { useHeldPower, unleashUltimate } from '../systems/PowerSystem.js';
import { showPause } from '../ui/HUD.js';

const keys = {};

export function togglePause() {
  if (state.phase === 'playing') {
    state.phase = 'paused';
    showPause(true);
  } else if (state.phase === 'paused') {
    state.phase = 'playing';
    showPause(false);
  }
}

window.__togglePause = togglePause;
window.__inputLaneChange = switchLane;
window.__inputJump = doJump;
window.__inputSlide = doSlide;
window.__triggerPower = useHeldPower;
window.__triggerUltimate = unleashUltimate;

export function initInput() {
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
    } else if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      useHeldPower();
    } else if (e.code === 'KeyC') {
      unleashUltimate();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
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
}
