import * as THREE from 'three';
import { voxelToMesh, tickVoxels, boot } from 'playlabs-boot';
// ===== SYSTEM id=system-hud label="HUD and UI Management" =====
let hudContainer = null;
let splashOverlay = null;
let gameOverOverlay = null;
let victoryOverlay = null;
let bannerEl = null;
let punyaValEl = null;
let distValEl = null;
let distBarEl = null;
let shaktiBarEl = null;
let powerSlotEl = null;
let comboBadgeEl = null;

function initUI() {
  if (document.getElementById('snake-way-ui-root')) return;

  const root = document.createElement('div');
  root.id = 'snake-way-ui-root';
  root.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    font-family: 'Trebuchet MS', 'Cinzel', 'Segoe UI', sans-serif;
    user-select: none;
    z-index: 100;
    overflow: hidden;
  `;
  document.body.appendChild(root);

  // HUD Top Bar
  hudContainer = document.createElement('div');
  hudContainer.id = 'hud-container';
  hudContainer.style.cssText = `
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    pointer-events: none;
    transition: opacity 0.3s;
  `;
  root.appendChild(hudContainer);

  // Left Card: Punya & Multiplier
  const punyaCard = document.createElement('div');
  punyaCard.style.cssText = `
    background: linear-gradient(135deg, rgba(32, 36, 63, 0.88), rgba(58, 47, 107, 0.92));
    border: 2px solid #c9a24b;
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), inset 0 0 10px rgba(201, 162, 75, 0.25);
    min-width: 140px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  `;
  punyaCard.innerHTML = `
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #ffaa33; font-weight: 700;">
      🕉️ PUNYA (MERIT)
    </div>
    <div id="hud-punya-val" style="font-size: 24px; font-weight: 900; color: #fff5cc; text-shadow: 0 0 8px #ff8c2e;">
      0
    </div>
    <div id="hud-combo-badge" style="display: none; font-size: 11px; font-weight: 800; color: #4de0c0; background: rgba(77, 224, 192, 0.18); border-radius: 6px; padding: 2px 6px; width: fit-content;">
      1x MULTIPLIER
    </div>
  `;
  hudContainer.appendChild(punyaCard);
  punyaValEl = punyaCard.querySelector('#hud-punya-val');
  comboBadgeEl = punyaCard.querySelector('#hud-combo-badge');

  // Center Card: Mount Kailash Distance
  const distCard = document.createElement('div');
  distCard.style.cssText = `
    background: linear-gradient(135deg, rgba(32, 36, 63, 0.88), rgba(58, 47, 107, 0.92));
    border: 2px solid #4de0c0;
    border-radius: 12px;
    padding: 10px 20px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    text-align: center;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  `;
  distCard.innerHTML = `
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #4de0c0; font-weight: 700;">
      🏔️ TO MOUNT KAILASH
    </div>
    <div id="hud-dist-val" style="font-size: 18px; font-weight: 800; color: #ffffff;">
      0m / 2000m
    </div>
    <div style="width: 100%; height: 8px; background: rgba(255, 255, 255, 0.15); border-radius: 4px; overflow: hidden; margin-top: 2px;">
      <div id="hud-dist-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #ff8c2e, #4de0c0); transition: width 0.15s linear;"></div>
    </div>
  `;
  hudContainer.appendChild(distCard);
  distValEl = distCard.querySelector('#hud-dist-val');
  distBarEl = distCard.querySelector('#hud-dist-bar');

  // Lives Counter Card
  const livesCard = document.createElement('div');
  livesCard.id = 'hud-lives-card';
  livesCard.style.cssText = `
    background: linear-gradient(135deg, rgba(32, 36, 63, 0.88), rgba(107, 47, 47, 0.92));
    border: 2px solid #ff4444;
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45), inset 0 0 10px rgba(255, 68, 68, 0.15);
    min-width: 100px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
  `;
  livesCard.innerHTML = `
    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #ff6666; font-weight: 700;">
      ♥ LIVES
    </div>
    <div id="hud-lives-val" style="font-size: 22px; font-weight: 900; color: #ff4444; text-shadow: 0 0 8px #ff2222; letter-spacing: 3px;">
      ♥♥♥
    </div>
  `;
  hudContainer.appendChild(livesCard);

  // Right Card: Shakti & Divine Power
  const shaktiCard = document.createElement('div');
  shaktiCard.style.cssText = `
    background: linear-gradient(135deg, rgba(32, 36, 63, 0.88), rgba(58, 47, 107, 0.92));
    border: 2px solid #ff8c2e;
    border-radius: 12px;
    padding: 10px 16px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    min-width: 160px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: auto;
    cursor: pointer;
  `;
  shaktiCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #ff8c2e; font-weight: 700;">
        ⚡ SHAKTI ENERGY
      </div>
    </div>
    <div style="width: 100%; height: 10px; background: rgba(255, 255, 255, 0.15); border-radius: 5px; overflow: hidden;">
      <div id="hud-shakti-bar" style="width: 40%; height: 100%; background: linear-gradient(90deg, #ff8c2e, #ffe666); box-shadow: 0 0 8px #ff8c2e; transition: width 0.2s;"></div>
    </div>
    <div id="hud-power-slot" style="font-size: 11px; font-weight: 800; color: #c9a24b; margin-top: 2px; text-align: center;">
      DIVINE POWER: NONE
    </div>
  `;
  hudContainer.appendChild(shaktiCard);
  shaktiBarEl = shaktiCard.querySelector('#hud-shakti-bar');
  powerSlotEl = shaktiCard.querySelector('#hud-power-slot');

  shaktiCard.addEventListener('click', () => {
    if (window.__triggerPower) window.__triggerPower();
  });

  // Action / Naga Chase Banner
  bannerEl = document.createElement('div');
  bannerEl.id = 'hud-banner';
  bannerEl.style.cssText = `
    position: absolute;
    top: 96px;
    left: 50%;
    transform: translateX(-50%) scale(0.9);
    background: linear-gradient(135deg, rgba(200, 30, 30, 0.92), rgba(58, 47, 107, 0.96));
    border: 2px solid #ffd700;
    border-radius: 20px;
    padding: 8px 24px;
    color: #fff5cc;
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 1px;
    box-shadow: 0 0 24px rgba(255, 140, 46, 0.7);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s, transform 0.25s;
    text-align: center;
  `;
  root.appendChild(bannerEl);

  // Touch On-Screen Controls for Mobile / Pointer
  const touchControls = document.createElement('div');
  touchControls.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 20px;
    right: 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    pointer-events: auto;
    z-index: 50;
  `;
  touchControls.innerHTML = `
    <div style="display: flex; gap: 12px;">
      <button id="btn-left" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(32,36,63,0.85); border: 2px solid #c9a24b; color: #fff; font-size: 22px; font-weight: 900; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer;">◀</button>
      <button id="btn-right" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(32,36,63,0.85); border: 2px solid #c9a24b; color: #fff; font-size: 22px; font-weight: 900; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer;">▶</button>
    </div>
    <div style="display: flex; gap: 12px;">
      <button id="btn-slide" style="width: 58px; height: 58px; border-radius: 50%; background: rgba(32,36,63,0.85); border: 2px solid #4de0c0; color: #4de0c0; font-size: 13px; font-weight: 900; box-shadow: 0 4px 12px rgba(0,0,0,0.5); cursor: pointer;">SLIDE<br>▼</button>
      <button id="btn-jump" style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #ff8c2e, #c2410c); border: 2px solid #fff; color: #fff; font-size: 14px; font-weight: 900; box-shadow: 0 4px 16px rgba(255,140,46,0.6); cursor: pointer;">JUMP<br>▲</button>
      <button id="btn-power" style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #3a2f6b, #4de0c0); border: 2px solid #c9a24b; color: #fff; font-size: 12px; font-weight: 900; box-shadow: 0 4px 16px rgba(77,224,192,0.5); cursor: pointer;">DIVINE<br>POWER</button>
    </div>
  `;
  root.appendChild(touchControls);

  touchControls.querySelector('#btn-left').addEventListener('pointerdown', (e) => { e.preventDefault(); if (window.__inputLaneChange) window.__inputLaneChange(-1); });
  touchControls.querySelector('#btn-right').addEventListener('pointerdown', (e) => { e.preventDefault(); if (window.__inputLaneChange) window.__inputLaneChange(1); });
  touchControls.querySelector('#btn-jump').addEventListener('pointerdown', (e) => { e.preventDefault(); if (window.__inputJump) window.__inputJump(); });
  touchControls.querySelector('#btn-slide').addEventListener('pointerdown', (e) => { e.preventDefault(); if (window.__inputSlide) window.__inputSlide(); });
  touchControls.querySelector('#btn-power').addEventListener('pointerdown', (e) => { e.preventDefault(); if (window.__triggerPower) window.__triggerPower(); });

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
    splashOverlay.style.display = 'none';
    if (window.__startGame) window.__startGame();
  });

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
  `;
  gameOverOverlay.innerHTML = `
    <div style="max-width: 480px; background: rgba(32, 36, 63, 0.95); border: 3px solid #ff4500; border-radius: 20px; padding: 32px 28px; box-shadow: 0 0 35px rgba(255, 69, 0, 0.6);">
      <div style="font-size: 13px; letter-spacing: 3px; color: #ff8c2e; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        PILGRIMAGE INTERRUPTED
      </div>
      <h2 style="font-size: 30px; color: #fff5cc; margin: 0 0 16px; font-weight: 900;">
        FALLEN ON THE SNAKE WAY
      </h2>
      <div style="background: rgba(58, 47, 107, 0.5); border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid rgba(201, 162, 75, 0.3);">
        <div style="font-size: 16px; color: #d6cfec; margin-bottom: 6px;">
          Punya Accrued: <b id="go-punya-val" style="color: #ffaa33; font-size: 20px;">0</b>
        </div>
        <div style="font-size: 16px; color: #d6cfec;">
          Distance Reached: <b id="go-dist-val" style="color: #4de0c0; font-size: 20px;">0m</b> / 2000m
        </div>
      </div>
      <button id="btn-restart" style="background: linear-gradient(135deg, #ff8c2e, #c2410c); border: 2px solid #ffd700; color: #ffffff; font-size: 17px; font-weight: 900; letter-spacing: 1.5px; padding: 12px 36px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 20px rgba(255,140,46,0.8);">
        RETRY ASCENT ⚡
      </button>
    </div>
  `;
  root.appendChild(gameOverOverlay);

  gameOverOverlay.querySelector('#btn-restart').addEventListener('click', () => {
    gameOverOverlay.style.display = 'none';
    if (window.__restartGame) window.__restartGame();
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
  `;
  victoryOverlay.innerHTML = `
    <div style="max-width: 520px; background: rgba(32, 36, 63, 0.95); border: 3px solid #ffd700; border-radius: 20px; padding: 36px 30px; box-shadow: 0 0 45px rgba(77, 224, 192, 0.7);">
      <div style="font-size: 14px; letter-spacing: 3px; color: #4de0c0; text-transform: uppercase; font-weight: 800; margin-bottom: 8px;">
        DIVINE ENLIGHTENMENT ACHIEVED
      </div>
      <h2 style="font-size: 32px; color: #fff5cc; margin: 0 0 16px; font-weight: 900; text-shadow: 0 0 16px #4de0c0;">
        🕉️ MOUNT KAILASH REACHED! 🏔️
      </h2>
      <p style="font-size: 15px; color: #e2dcfa; line-height: 1.6; margin-bottom: 20px;">
        You have traversed all 2000 meters of the perilous Snake Way, vanquished the Asura hazards, and ascended to the sacred abode of Lord Shiva and Lord Vishnu!
      </p>
      <div style="background: rgba(58, 47, 107, 0.6); border-radius: 12px; padding: 16px; margin-bottom: 24px; border: 1px solid #c9a24b;">
        <div style="font-size: 18px; color: #ffffff;">
          Final Sacred Punya: <b id="vic-punya-val" style="color: #ffd700; font-size: 24px;">0</b>
        </div>
      </div>
      <button id="btn-vic-restart" style="background: linear-gradient(135deg, #4de0c0, #207260); border: 2px solid #fff; color: #ffffff; font-size: 17px; font-weight: 900; letter-spacing: 1.5px; padding: 14px 40px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 25px rgba(77,224,192,0.8);">
        ASCEND AGAIN 🕉️
      </button>
    </div>
  `;
  root.appendChild(victoryOverlay);

  victoryOverlay.querySelector('#btn-vic-restart').addEventListener('click', () => {
    victoryOverlay.style.display = 'none';
    if (window.__restartGame) window.__restartGame();
  });
}

function updateHUD(punya, distance, shakti, power, combo, lives) {
  if (!hudContainer) initUI();
  if (punyaValEl) punyaValEl.textContent = Math.floor(punya);
  if (distValEl) distValEl.textContent = `${Math.floor(distance)}m / 2000m`;
  if (distBarEl) {
    const pct = Math.min(100, (distance / 2000) * 100);
    distBarEl.style.width = `${pct}%`;
  }
  if (shaktiBarEl) {
    shaktiBarEl.style.width = `${Math.min(100, Math.max(0, shakti))}%`;
  }
  if (powerSlotEl) {
    if (power === 'sudarshan_chakra') {
      powerSlotEl.innerHTML = `<span style="color: #ffaa22;">⚡ SUDARSHAN CHAKRA</span> (READY)`;
    } else if (power === 'trishul') {
      powerSlotEl.innerHTML = `<span style="color: #dbe5eb;">🔱 SHIVA'S TRISHUL</span> (READY)`;
    } else if (power === 'vishnu_shield') {
      powerSlotEl.innerHTML = `<span style="color: #4de0c0;">🛡️ VISHNU'S SHIELD</span> (READY)`;
    } else {
      powerSlotEl.innerHTML = `COLLECT POWER ORB`;
    }
  }
  if (comboBadgeEl) {
    if (combo > 1) {
      comboBadgeEl.style.display = 'inline-block';
      comboBadgeEl.textContent = `✨ ${combo}x PUNYA MULTIPLIER`;
    } else {
      comboBadgeEl.style.display = 'none';
    }
  }
  // Update lives hearts display
  const livesEl = document.getElementById('hud-lives-val');
  if (livesEl && lives !== undefined) {
    const l = Math.max(0, Math.min(3, Math.floor(lives)));
    if (l === 3) livesEl.textContent = '♥♥♥';
    else if (l === 2) livesEl.textContent = '♥♥♡';
    else if (l === 1) livesEl.textContent = '♥♡♡';
    else livesEl.textContent = '♡♡♡';
    livesEl.style.color = l >= 2 ? '#ff4444' : l === 1 ? '#ff8c00' : '#888888';
    livesEl.style.textShadow = l >= 2 ? '0 0 8px #ff2222' : l === 1 ? '0 0 8px #ff8c00' : 'none';
  }
}

function showBanner(text, duration = 2.5) {
  if (!bannerEl) initUI();
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  bannerEl.style.transform = 'translateX(-50%) scale(1.05)';
  setTimeout(() => {
    if (bannerEl) {
      bannerEl.style.opacity = '0';
      bannerEl.style.transform = 'translateX(-50%) scale(0.9)';
    }
  }, duration * 1000);
}

function showSplash() {
  if (!splashOverlay) initUI();
  if (splashOverlay) splashOverlay.style.display = 'flex';
  if (gameOverOverlay) gameOverOverlay.style.display = 'none';
  if (victoryOverlay) victoryOverlay.style.display = 'none';
}

function showGameOver(score, isVictory = false) {
  if (!gameOverOverlay) initUI();
  if (isVictory) {
    if (victoryOverlay) {
      victoryOverlay.style.display = 'flex';
      const vVal = victoryOverlay.querySelector('#vic-punya-val');
      if (vVal) vVal.textContent = Math.floor(score);
    }
  } else {
    if (gameOverOverlay) {
      gameOverOverlay.style.display = 'flex';
      const gVal = gameOverOverlay.querySelector('#go-punya-val');
      if (gVal) gVal.textContent = Math.floor(score);
      const dVal = gameOverOverlay.querySelector('#go-dist-val');
      if (dVal && window.__game) dVal.textContent = `${Math.floor(window.__game.state.distance)}m`;
    }
  }
}

window.__game = window.__game || {};
window.__game.ui = { initUI, updateHUD, showSplash, showGameOver, showBanner };