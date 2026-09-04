// End-of-run screens: the death card with the score breakdown and retry
// button, and the victory card for reaching Mount Kailash.
import { showPause, fadeOverlay, OVERLAY_FADE_MS } from './HUD.js';

let gameOverOverlay = null;
let victoryOverlay = null;
let ascensionOverlay = null;

export function initGameOverScreens(root) {
  // Game Over Overlay
  gameOverOverlay = document.createElement('div');
  gameOverOverlay.id = 'game-over-overlay';
  gameOverOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at center, rgba(40, 20, 30, 0.9) 0%, rgba(15, 12, 25, 0.97) 80%);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 200;
    pointer-events: auto;
    padding: 24px;
    text-align: center;
    opacity: 0;
    transition: opacity ${OVERLAY_FADE_MS}ms ease;
  `;
  gameOverOverlay.innerHTML = `
    <div style="max-width: 480px; background: rgba(32, 36, 63, 0.95); border: 3px solid #ff4500; border-radius: 20px; padding: 32px 28px; box-shadow: 0 0 35px rgba(255, 69, 0, 0.6);">
      <div style="font-size: 13px; letter-spacing: 3px; color: #ff8c2e; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        यात्रा अधूरी — YATRA ADHOORI
      </div>
      <h2 style="font-size: 30px; color: #fff5cc; margin: 0 0 16px; font-weight: 900;">
        FALLEN ON THE SACRED PATH
      </h2>
      <div style="background: rgba(58, 47, 107, 0.5); border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(201, 162, 75, 0.3);">
        <div style="font-size: 16px; color: #d6cfec; margin-bottom: 6px;">
          Punya Accrued: <b id="go-punya-val" style="color: #ffaa33; font-size: 20px;">0</b>
        </div>
        <div style="font-size: 16px; color: #d6cfec;">
          Yatra Covered: <b id="go-dist-val" style="color: #4de0c0; font-size: 20px;">0m</b> / 2000m
        </div>
        <div id="go-best-val" style="font-size: 13px; color: #a79ec4; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(201, 162, 75, 0.25);">
          Best: 0 punya
        </div>
      </div>
      <button id="btn-restart" style="background: linear-gradient(135deg, #ff8c2e, #c2410c); border: 2px solid #ffd700; color: #ffffff; font-size: 17px; font-weight: 900; letter-spacing: 1.5px; padding: 12px 36px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 20px rgba(255,140,46,0.8);">
        🙏 PUNAH YATRA — RESTART PILGRIMAGE 🙏
      </button>
    </div>
  `;
  root.appendChild(gameOverOverlay);

  gameOverOverlay.querySelector('#btn-restart').addEventListener('click', () => {
    fadeOverlay(gameOverOverlay, false);
    if (window.__restartGame) window.__restartGame();
  });

  // Ascension Overlay: the choice at the summit gates
  ascensionOverlay = document.createElement('div');
  ascensionOverlay.id = 'ascension-overlay';
  ascensionOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at center, rgba(30, 34, 66, 0.88) 0%, rgba(12, 12, 28, 0.97) 80%);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 200;
    pointer-events: auto;
    padding: 24px;
    text-align: center;
    opacity: 0;
    transition: opacity ${OVERLAY_FADE_MS}ms ease;
  `;
  ascensionOverlay.innerHTML = `
    <div style="max-width: 520px; background: rgba(28, 32, 60, 0.96); border: 3px solid #ffd700; border-radius: 20px; padding: 34px 30px; box-shadow: 0 0 45px rgba(255, 215, 0, 0.45);">
      <div style="font-size: 13px; letter-spacing: 3px; color: #ffd700; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        🙏 श्री राम मंदिर — THE SACRED GATES
      </div>
      <h2 style="font-size: 30px; color: #fff5cc; margin: 0 0 10px; font-weight: 900;">
        🕉️ RAM MANDIR STANDS BEFORE YOU
      </h2>
      <div style="font-size: 15px; color: #d6cfec; line-height: 1.55; margin-bottom: 10px;">
        2000m of sacred yatra walked. Punya earned: <b id="asc-punya-val" style="color:#ffaa33;">0</b>
      </div>
      <div style="font-size: 14px; color: #a79ec4; line-height: 1.5; margin-bottom: 22px;">
        Offer pranam and complete the darshan — or walk on past the mandir,
        where the path never ends, the way grows crueller every league, and all
        punya is doubled and deepens the further you dare.
      </div>
      <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;">
        <button id="btn-ascend" style="background: linear-gradient(135deg, #4de0c0, #207260); border: 2px solid #fff; color: #ffffff; font-size: 16px; font-weight: 900; letter-spacing: 1px; padding: 13px 26px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 22px rgba(77,224,192,0.7);">
          🙏 DARSHAN — COMPLETE YATRA
        </button>
        <button id="btn-eternal" style="background: linear-gradient(135deg, #8a5cf6, #4c2894); border: 2px solid #ffd700; color: #ffffff; font-size: 16px; font-weight: 900; letter-spacing: 1px; padding: 13px 26px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 22px rgba(138,92,246,0.7);">
          🕉️ WALK THE ETERNAL PATH
        </button>
      </div>
    </div>
  `;
  root.appendChild(ascensionOverlay);
  ascensionOverlay.querySelector('#btn-ascend').addEventListener('click', () => {
    if (window.__ascendAtKailash) window.__ascendAtKailash();
  });
  ascensionOverlay.querySelector('#btn-eternal').addEventListener('click', () => {
    if (window.__walkEternalPath) window.__walkEternalPath();
  });

  // Victory Overlay (Mount Kailash Reached)
  victoryOverlay = document.createElement('div');
  victoryOverlay.id = 'victory-overlay';
  victoryOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at center, rgba(30, 70, 90, 0.92) 0%, rgba(15, 20, 45, 0.98) 80%);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 200;
    pointer-events: auto;
    padding: 24px;
    text-align: center;
    opacity: 0;
    transition: opacity ${OVERLAY_FADE_MS}ms ease;
  `;
  victoryOverlay.innerHTML = `
    <div style="max-width: 520px; background: rgba(32, 36, 63, 0.95); border: 3px solid #ffd700; border-radius: 20px; padding: 36px 30px; box-shadow: 0 0 45px rgba(77, 224, 192, 0.7);">
      <div style="font-size: 14px; letter-spacing: 3px; color: #4de0c0; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        दर्शन सम्पूर्ण — DARSHAN COMPLETE
      </div>
      <h2 style="font-size: 32px; color: #fff5cc; margin: 0 0 16px; font-weight: 900; text-shadow: 0 0 16px #4de0c0;">
        🙏 जय श्री राम — RAM MANDIR REACHED! 🕉️
      </h2>
      <p style="font-size: 15px; color: #e2dcfa; line-height: 1.6; margin-bottom: 20px;">
        You have traversed all 2000 meters of the sacred yatra, vanquished the Asura hazards, and received the divine darshan at the sacred Ram Mandir of Ayodhya!
      </p>
      <div style="background: rgba(58, 47, 107, 0.6); border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid #c9a24b;">
        <div style="font-size: 18px; color: #ffffff;">
          Sacred Punya Earned: <b id="vic-punya-val" style="color: #ffd700; font-size: 24px;">0</b>
        </div>
        <div id="vic-best-val" style="font-size: 13px; color: #a79ec4; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(201, 162, 75, 0.25);">
          Best: 0 punya
        </div>
      </div>
      <button id="btn-vic-restart" style="background: linear-gradient(135deg, #4de0c0, #207260); border: 2px solid #fff; color: #ffffff; font-size: 17px; font-weight: 900; letter-spacing: 1.5px; padding: 14px 40px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 25px rgba(77,224,192,0.8);">
        🙏 PUNAH DARSHAN — WALK AGAIN 🕉️
      </button>
    </div>
  `;
  root.appendChild(victoryOverlay);

  victoryOverlay.querySelector('#btn-vic-restart').addEventListener('click', () => {
    fadeOverlay(victoryOverlay, false);
    if (window.__restartGame) window.__restartGame();
  });
}

export function showAscension(punya) {
  const val = ascensionOverlay.querySelector('#asc-punya-val');
  if (val) val.textContent = Math.floor(punya).toLocaleString();
  fadeOverlay(ascensionOverlay, true);
}

export function hideAscension() {
  fadeOverlay(ascensionOverlay, false);
}

export function hideEndScreens() {
  fadeOverlay(gameOverOverlay, false);
  fadeOverlay(victoryOverlay, false);
  if (ascensionOverlay) fadeOverlay(ascensionOverlay, false);
}

export function showGameOver(score, isVictory = false, best = null) {
  showPause(false);

  const bestText = best
    ? `${best.isNewBest ? 'NEW BEST! ' : 'Best: '}${Math.floor(best.punya)} punya · ${Math.floor(best.distance)}m`
    : '';

  const paintBest = (el) => {
    if (!el) return;
    el.textContent = bestText;
    el.style.display = bestText ? 'block' : 'none';
    el.style.color = best && best.isNewBest ? '#ffd700' : '#a79ec4';
  };

  if (isVictory) {
    if (victoryOverlay) {
      fadeOverlay(victoryOverlay, true);
      const vVal = victoryOverlay.querySelector('#vic-punya-val');
      if (vVal) vVal.textContent = Math.floor(score);
      paintBest(victoryOverlay.querySelector('#vic-best-val'));
    }
  } else {
    if (gameOverOverlay) {
      fadeOverlay(gameOverOverlay, true);
      const gVal = gameOverOverlay.querySelector('#go-punya-val');
      if (gVal) gVal.textContent = Math.floor(score);
      const dVal = gameOverOverlay.querySelector('#go-dist-val');
      if (dVal && window.__game) dVal.textContent = `${Math.floor(window.__game.state.distance)}m`;
      paintBest(gameOverOverlay.querySelector('#go-best-val'));
    }
  }
}
