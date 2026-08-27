// The opening screen: what the Snake Way is, the controls, and the button
// that begins the pilgrimage.
import { showPause, fadeOverlay, OVERLAY_FADE_MS } from './HUD.js';
import { hideEndScreens } from './GameOver.js';

let splashOverlay = null;

export function initStartScreen(root) {
  // Splash Screen Overlay
  splashOverlay = document.createElement('div');
  splashOverlay.id = 'splash-overlay';
  splashOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at center, rgba(58, 47, 107, 0.85) 0%, rgba(32, 36, 63, 0.96) 80%);
    display: flex;
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
  splashOverlay.innerHTML = `
    <div style="max-width: 580px; background: rgba(26, 22, 43, 0.9); border: 3px solid #c9a24b; border-radius: 20px; padding: 32px 28px; box-shadow: 0 0 35px rgba(255, 140, 46, 0.5);">
      <div style="font-size: 14px; letter-spacing: 3px; color: #4de0c0; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        NAGA LOKA · SACRED ASCENT
      </div>
      <h1 style="font-size: 32px; color: #fff5cc; margin: 0 0 12px; text-shadow: 0 0 14px #ff8c2e; font-weight: 900; line-height: 1.2;">
        SAIYAN THROUGH THE SNAKE WAY
      </h1>
      <p style="font-size: 15px; color: #d6cfec; line-height: 1.6; margin-bottom: 20px;">
        Sprint the ancient serpentine causeway as a devotee warrior. Dodge sacred fire pits, Asura demons, floating souls, broken gaps, and temple pillars while collecting <b>Om Glyphs</b> and <b>Rudraksha Beads</b> to reach the holy summit of <b>Mount Kailash (2000m)</b>!
      </p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; text-align: left; background: rgba(58, 47, 107, 0.4); padding: 14px; border-radius: 10px; border: 1px solid rgba(201, 162, 75, 0.4);">
        <div style="font-size: 13px; color: #ffe6aa;">
          <b>🕹️ CONTROLS:</b><br>
          • <b>A / D / Arrows:</b> Switch Lanes<br>
          • <b>W / Space:</b> Jump / Double Jump<br>
          • <b>S / Down:</b> Slide Under
        </div>
        <div style="font-size: 13px; color: #ffe6aa;">
          <b>✨ DIVINE POWERS:</b><br>
          • <b>Shift / Tap:</b> Cast Power<br>
          • <b>Chakra:</b> Blasts lane ahead<br>
          • <b>Trishul / Shield:</b> Triple lane blast & barrier
        </div>
      </div>
      <button id="btn-start" style="background: linear-gradient(135deg, #ff8c2e, #c2410c); border: 2px solid #ffd700; color: #ffffff; font-size: 18px; font-weight: 900; letter-spacing: 1.5px; padding: 14px 40px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 20px rgba(255,140,46,0.8); transition: transform 0.15s, box-shadow 0.15s;">
        BEGIN SACRED PILGRIMAGE 🕉️
      </button>
    </div>
  `;
  root.appendChild(splashOverlay);

  splashOverlay.querySelector('#btn-start').addEventListener('click', () => {
    fadeOverlay(splashOverlay, false);
    if (window.__startGame) window.__startGame();
  });
}

export function showSplash() {
  fadeOverlay(splashOverlay, true);
  hideEndScreens();
  showPause(false);
}
