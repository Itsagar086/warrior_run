// The in-run interface: Punya and combo, distance to Kailash, lives, the
// Shakti meter with the primed power, the action banner, the touch controls
// and the pause card.

let hudContainer = null;
let bannerEl = null;
let punyaValEl = null;
let distValEl = null;
let distBarEl = null;
let shaktiBarEl = null;
let powerSlotEl = null;
let comboBadgeEl = null;
let pauseOverlay = null;
let bannerTimeoutId = null;

// Last values pushed to the DOM, so the HUD only writes when something changes.
const shown = {
  punya: null, dist: null, distPct: null, shakti: null,
  power: undefined, combo: null, lives: null
};

// Every full-screen overlay fades rather than cutting. Toggling display alone
// snaps the screen; this drives opacity across a transition and only then
// takes the element out of the layout.
export const OVERLAY_FADE_MS = 320;

export function fadeOverlay(el, visible, display = 'flex') {
  if (!el) return;
  if (el._fadeTimer) { clearTimeout(el._fadeTimer); el._fadeTimer = null; }

  if (visible) {
    el.style.display = display;
    // A frame between display and opacity, or the browser has nothing to
    // transition from.
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  } else {
    el.style.opacity = '0';
    el._fadeTimer = setTimeout(() => {
      el.style.display = 'none';
      el._fadeTimer = null;
    }, OVERLAY_FADE_MS);
  }
}

// Creates (or returns) the single overlay root every UI piece attaches to.
export function createUIRoot() {
  const existing = document.getElementById('snake-way-ui-root');
  if (existing) return existing;

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

  return root;
}

export function initHUD(root) {
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
}

export function initPauseOverlay(root) {
  // Pause Overlay
  pauseOverlay = document.createElement('div');
  pauseOverlay.id = 'pause-overlay';
  pauseOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(15, 12, 25, 0.72);
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 190;
    pointer-events: auto;
    padding: 24px;
    text-align: center;
    opacity: 0;
    transition: opacity ${OVERLAY_FADE_MS}ms ease;
  `;
  pauseOverlay.innerHTML = `
    <div style="max-width: 380px; background: rgba(32, 36, 63, 0.95); border: 3px solid #c9a24b; border-radius: 20px; padding: 28px 26px; box-shadow: 0 0 30px rgba(201, 162, 75, 0.5);">
      <h2 style="font-size: 26px; color: #fff5cc; margin: 0 0 10px; font-weight: 900; letter-spacing: 2px;">
        &#9208; PILGRIMAGE PAUSED
      </h2>
      <p style="font-size: 14px; color: #d6cfec; line-height: 1.6; margin-bottom: 20px;">
        The Snake Way waits. Press <b>P</b> or <b>Esc</b> to resume the ascent.
      </p>
      <button id="btn-resume" style="background: linear-gradient(135deg, #4de0c0, #207260); border: 2px solid #fff; color: #ffffff; font-size: 16px; font-weight: 900; letter-spacing: 1.5px; padding: 12px 34px; border-radius: 30px; cursor: pointer; box-shadow: 0 0 20px rgba(77,224,192,0.7);">
        RESUME &#9654;
      </button>
    </div>
  `;
  root.appendChild(pauseOverlay);

  pauseOverlay.querySelector('#btn-resume').addEventListener('click', () => {
    if (window.__togglePause) window.__togglePause();
  });
}

export function updateHUD(punya, distance, shakti, power, combo, lives) {
  const punyaWhole = Math.floor(punya);
  if (punyaValEl && punyaWhole !== shown.punya) {
    shown.punya = punyaWhole;
    punyaValEl.textContent = punyaWhole;
  }

  const distWhole = Math.floor(distance);
  if (distValEl && distWhole !== shown.dist) {
    shown.dist = distWhole;
    distValEl.textContent = `${distWhole}m / 2000m`;
  }
  if (distBarEl) {
    // One decimal is finer than a pixel on that bar; anything more is churn.
    const pct = Math.round(Math.min(100, (distance / 2000) * 100) * 10) / 10;
    if (pct !== shown.distPct) {
      shown.distPct = pct;
      distBarEl.style.width = `${pct}%`;
    }
  }
  if (shaktiBarEl) {
    const pct = Math.round(Math.min(100, Math.max(0, shakti)));
    if (pct !== shown.shakti) {
      shown.shakti = pct;
      shaktiBarEl.style.width = `${pct}%`;
    }
  }
  if (powerSlotEl && power !== shown.power) {
    shown.power = power;
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
  if (comboBadgeEl && combo !== shown.combo) {
    shown.combo = combo;
    if (combo > 1) {
      comboBadgeEl.style.display = 'inline-block';
      comboBadgeEl.textContent = `✨ ${combo}x PUNYA MULTIPLIER`;
    } else {
      comboBadgeEl.style.display = 'none';
    }
  }
  // Update lives hearts display
  const livesEl = document.getElementById('hud-lives-val');
  if (livesEl && lives !== undefined && lives !== shown.lives) {
    shown.lives = lives;
    const l = Math.max(0, Math.min(3, Math.floor(lives)));
    if (l === 3) livesEl.textContent = '♥♥♥';
    else if (l === 2) livesEl.textContent = '♥♥♡';
    else if (l === 1) livesEl.textContent = '♥♡♡';
    else livesEl.textContent = '♡♡♡';
    livesEl.style.color = l >= 2 ? '#ff4444' : l === 1 ? '#ff8c00' : '#888888';
    livesEl.style.textShadow = l >= 2 ? '0 0 8px #ff2222' : l === 1 ? '0 0 8px #ff8c00' : 'none';
  }
}

export function showBanner(text, duration = 2.5) {
  if (!bannerEl) return;
  bannerEl.textContent = text;
  bannerEl.style.opacity = '1';
  bannerEl.style.transform = 'translateX(-50%) scale(1.05)';
  if (bannerTimeoutId !== null) clearTimeout(bannerTimeoutId);
  bannerTimeoutId = setTimeout(() => {
    bannerTimeoutId = null;
    if (bannerEl) {
      bannerEl.style.opacity = '0';
      bannerEl.style.transform = 'translateX(-50%) scale(0.9)';
    }
  }, duration * 1000);
}

export function showPause(visible) {
  fadeOverlay(pauseOverlay, visible);
}
