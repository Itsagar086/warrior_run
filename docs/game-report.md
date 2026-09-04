# ॐ Naga Loka Runner — Saiyan Through the Snake Way

> **A 3-D endless runner in which a Hindu warrior-devotee sprints the sacred serpent causeway toward Mount Kailash — 2000 metres of fire, demons and temptation between him and the summit, and an eternal path beyond it for those who refuse to stop.**

| | |
|---|---|
| **Engine** | Three.js 0.184.0 (ES modules, CDN import map) |
| **Source** | 6,658 lines · 29 modules |
| **Platform** | Web · Keyboard + Touch |
| **Assets** | 100% procedural — zero binary files |
| **Play** | <https://warrior-run.vercel.app> |
| **Source** | <https://github.com/Itsagar086/warrior_run> |

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technical Architecture](#2-technical-architecture)
3. [Game Engine & Core Systems](#3-game-engine--core-systems)
4. [Player System](#4-player-system)
5. [Obstacle System](#5-obstacle-system)
6. [Divine Power System](#6-divine-power-system)
7. [The Naga Chase](#7-the-naga-chase)
8. [Collectibles & Scoring](#8-collectibles--scoring)
9. [Spawn System & Difficulty Stages](#9-spawn-system--difficulty-stages)
10. [Environment & Visual Design](#10-environment--visual-design)
11. [UI and HUD](#11-ui-and-hud)
12. [Audio System](#12-audio-system)
13. [Game Rules & How to Play](#13-game-rules--how-to-play)
14. [Key Algorithms & Math](#14-key-algorithms--math)
15. [Development Journey](#15-development-journey)
16. [Performance Considerations](#16-performance-considerations)

---

## 1. Project Overview

### The Game

**Naga Loka Runner — Saiyan Through the Snake Way** is a lane-based 3-D endless runner. The player is a bare-chested warrior-devotee — janeu across his back, rudraksha at his throat and wrists, saffron dhoti at his waist — sprinting a moonlit temple causeway carved with Sanskrit, three lanes wide, flanked by torch-lit pillars and dark forest. The destination glows on the horizon the entire run: the snow-crowned pyramid of **Mount Kailash**.

### The Mythology

- **Naga Loka** — in Hindu cosmology, the subterranean realm of the serpent-beings, the Nagas. The causeway the devotee runs is the "Snake Way" through their domain; its guardians (the coiled cobras, the hunting rival Naga) test whether he is worthy of passage.
- **Mount Kailash** — the abode of **Lord Shiva**, the axis of the world, the most sacred summit in Hindu, Buddhist and Jain tradition. Reaching it completes the pilgrimage.
- **Lord Vishnu** — the preserver, lends the devotee two of his instruments: the *Sudarshan Chakra* (his spinning discus) and his protective shield.
- **Lord Shiva** — lends the *Trishul*, the trident that purifies all three lanes at once.
- **Punya** (merit), **Shakti** (divine energy), **Om** glyphs and **Rudraksha** beads (Shiva's sacred seed) form the game's entire economy — every scoring word in the HUD is drawn from the tradition.
- The **Asura** demons and **evil souls** that block the path are the classic adversaries of the devas — obstacles of the spirit made physical.

### Goal & Win Condition

Survive **2000 m** of hazards to reach the Gates of Kailash. There the run pauses on a choice: **Ascend** — completing the pilgrimage and banking the score as a victory — or **Walk the Eternal Path**: an endless continuation beyond the mountain where the road grows crueller every league and all punya is multiplied ×2, deepening every further 1000 m. Death at any point ends the run; best punya and best distance persist between sessions.

### Platform & Technology

- **Web-native**, no install: a single `index.html` plus ES modules served statically.
- **Three.js 0.184.0** from CDN via import map; the `playlabs-boot` engine shim (embedded in `index.html` as a `data:` module) supplies renderer/scene/camera/clock bootstrap.
- **Zero binary assets** — every mesh is generated in code, every texture is drawn to a canvas at runtime, every sound is a Web Audio oscillator. The whole game is text.
- Input: keyboard and full touch controls; persistence via `localStorage`.

---

## 2. Technical Architecture

Twenty-nine ES modules in five layers, organised so every file owns one concern and the dependency arrows only ever point downward.

### File & Folder Structure

```
warrior_run/
├── index.html                 shell: import map, boot sandbox, entry <script>
├── serve.mjs                  zero-dependency dev server (node serve.mjs → :8000)
├── metadata-v2.json           export manifest (engine, renderer, platforms)
├── docs/                      this report
├── devtools/
│   ├── player-preview.html    renders the hero (or ?who=asura) alone, for art direction
│   └── tests/                 6 headless regression suites (see §15)
└── src/
    ├── core/                  the beating heart
    │   ├── Game.js            345  entry: boot, world build, warm-up, sim + render loop
    │   ├── GameState.js        64  the single mutable state object every system shares
    │   ├── InputHandler.js     81  keyboard + touch-swipe → verbs (jump/slide/lane/E/C)
    │   └── CameraRig.js        75  eased chase camera + impact shake
    ├── entities/              things with a body and behaviour
    │   ├── Player.js          559  rig contract, run/jump/slide animation, physics, dust
    │   ├── WarriorBody.js     379  the hero's SDF-sculpted, skinned body (see §4)
    │   ├── Obstacles.js       441  fire pit, boulder, arch gate, broken slab + the pool
    │   ├── AsuraDemon.js      334  SDF-sculpted demon brute, war paint, spiked club
    │   ├── CobraSnake.js      179  coiled cobra, spine-wave sway, proximity hood-flare
    │   ├── EvilSoul.js         86  head-height spirit, sine drift + bob
    │   ├── NagaChaser.js      281  the rival serpent: trigger, pursuit, strike, escape
    │   └── Collectibles.js    318  Om coins, rudraksha beads, three power pickups
    ├── systems/               rules that act on entities
    │   ├── SpawnSystem.js     382  stage table, distance-gated spawning, pools, recycling
    │   ├── CollisionSystem.js 131  3-D hazard bands, two-zone damage, stand-on-boulder
    │   ├── PowerSystem.js     264  held power (E), Shakti ultimate (C), projectiles
    │   ├── ScoreSystem.js      96  punya, combo, shakti gains, localStorage best
    │   ├── FXSystem.js         70  48-spark particle pool
    │   └── AudioSystem.js      71  six synthesised cues, zero audio files
    ├── environment/
    │   ├── Track.js           229  flagstone causeway, gold lane lines, Sanskrit decals
    │   ├── Environment.js     618  Kailash, sky dome shader, pillars, trees, torches
    │   └── Lighting.js        215  moonlight night rig, warm-light pool, stage moods
    ├── ui/
    │   ├── HUD.js             406  punya/distance/lives/shakti cards, banner, touch pad
    │   ├── StartScreen.js      71  splash card with full controls tutorial
    │   └── GameOver.js        208  death card, victory card, Kailash ascension choice
    └── utils/
        ├── Constants.js        57  every tuning number in one place, incl. STAGES table
        ├── AnimationHelper.js  27  swing / swingForward / bounce — the gait vocabulary
        ├── SdfKit.js          397  SDF sculpting → marching cubes → skinning engine
        ├── MeshMerge.js       189  draw-call collapser for static props
        └── AssetFactory.js     85  single re-export point for every makeXxx builder
```

### Why It Is Organised This Way

- **Separation of concerns by game-architecture role.** *Entities* know how to look and move; *systems* know the rules that connect them; *core* owns time, input and state; *environment* is scenery with no gameplay; *ui* is pure DOM; *utils* are dependency-free helpers. A designer tuning difficulty touches one file (`Constants.js`); an artist reshaping the hero touches one file (`WarriorBody.js`).
- **One shared state object, imported everywhere** (`GameState.js`) rather than a message bus — the right size of solution for a game this scale, and trivially inspectable (`window.__getGameState()`).
- **Builders live beside behaviour.** `makeAsuraDemon()` sits in the same file as `updateAsura()`, so shape and motion evolve together; `AssetFactory.js` re-exports all builders for tooling.

### Module Dependency Graph

Arrows only point downward — no layer imports from above it, and there are no cycles:

```
Entry        index.html → core/Game.js
                 ▼
Core         InputHandler · CameraRig · GameState
                 ▼
Systems      SpawnSystem · CollisionSystem · PowerSystem · ScoreSystem · FXSystem · AudioSystem
                 ▼
Entities     Player · WarriorBody · Obstacles · AsuraDemon · CobraSnake · EvilSoul · NagaChaser · Collectibles
                 ▼
Env + UI     Track · Environment · Lighting · HUD · StartScreen · GameOver
                 ▼
Utils        Constants · AnimationHelper · SdfKit · MeshMerge · AssetFactory
                 ▼
External     three · three/addons (MarchingCubes, BufferGeometryUtils, SkeletonUtils) · playlabs-boot
```

### How the Game Bootstraps

`index.html` declares the **import map** — bare specifiers `three` and `three/addons/` resolve to the jsDelivr CDN, while the `playlabs-*` engine modules are embedded as base64 `data:` URLs, so the engine ships inside the HTML file itself. A small inline sandbox shim guards `localStorage`/rAF for iframe hosts, then `<script type="module" src="./src/core/Game.js">` starts everything:

1. `boot()` (playlabs-boot) creates renderer, scene, camera, clock and canvas.
2. `setupLighting()` strips the engine's sunset rig and installs the moonlit night.
3. UI root, HUD, splash, end screens and pause overlay are assembled in the DOM.
4. Track, environment, player, Naga and the full obstacle pool are constructed *hidden*.
5. `warmUpPipeline()` force-compiles every shader behind the splash screen (§16).
6. `animate()` starts the frame loop; the game waits in phase `splash` until the player presses *Begin Sacred Pilgrimage*, which calls `window.__startGame()`.

---

## 3. Game Engine & Core Systems

A variable-timestep loop with a bounded sub-step — smooth at any refresh rate, and incapable of tunnelling the player through a hazard after a stall.

### The Frame Loop

Each rendered frame advances the world by exactly its own duration. The loop measures real frame time with `performance.now()` (the shared THREE clock cannot be used, because animation code samples `getElapsedTime()` mid-frame, which would corrupt `getDelta()`), clamps it to a catch-up budget, and splits long frames into equal sub-steps:

```js
// src/core/Game.js
const MAX_SUB_STEP = 1 / 30;
const MAX_CATCH_UP_STEPS = 4;

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let frameTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  // Discard time beyond the catch-up budget rather than spiralling after a
  // genuine stall (alt-tab, GC, a breakpoint).
  const maxFrame = MAX_SUB_STEP * MAX_CATCH_UP_STEPS;
  if (frameTime > maxFrame) frameTime = maxFrame;

  // One step per frame in the normal case; only a long frame is subdivided
  const steps = Math.max(1, Math.ceil(frameTime / MAX_SUB_STEP));
  const dt = frameTime / steps;
  for (let i = 0; i < steps; i++) {
    if (state.phase === 'playing') updateSimulation(dt);
    updateFX(dt);
    updateLighting(dt);
  }
  updateCamera(frameTime);   // presentation eases on REAL frame time
  renderer.render(scene, camera);
}
```

> **Why not a fixed 60 Hz accumulator?** The loop originally stepped a fixed 1/60 s fed by an accumulator. On a 144 Hz display only ~42% of rendered frames moved the world, in an uneven 2-2-3 cadence — constant micro-stutter no GPU could fix. The current design advances every frame by its true duration, keeps a 1/30 s upper bound per sub-step (at max speed 22 u/s that is 0.73 units of travel against collision windows ≥ 1.6 units — no tunnelling), and caps catch-up at 4 sub-steps so a stall becomes slow-motion, never a teleport.

### Delta Time Everywhere

All motion is `value += rate × dt`; all easing is frame-rate-corrected lerp, `lerp(a, b, min(1, k·dt))`. Distance itself derives from speed: `scrollDelta = state.speed × dt` — the world scrolls toward the player, who never moves in Z.

### The Chase Camera

`CameraRig.js` parks the eye 6.2 units behind and 3.4 above the devotee and *eases* on every axis: X follows at 65% of the player's lane offset (rate 10), height adds 35% of jump altitude (rate 8 — it used to snap, which read as flinching), and the look-target eases separately (rate 9) so a lane change sweeps rather than cuts. Impact shake is a decaying random offset with an amplitude of just 0.02 world units — weight, not wobble. Critically the camera updates on *real frame time*, outside the sub-step loop, so it stays silk on 144 Hz.

### The Speed Ramp

Speed starts at **0** on the starting line and eases toward a stepped target: **12 u/s base, +0.5 every 200 m, capped at 22** — a 2000 m pilgrimage tops out at 17 u/s, and only the Eternal Path ever sees the cap (at 4000 m). The easing constant (`SPEED_EASE 2.6`) makes each step a swell rather than a jolt.

### The Phase System

| Phase | Entered by | What runs |
|---|---|---|
| **splash** | page load | render loop only; world visible behind the start card |
| **playing** | `__startGame()` / resume / eternal choice | full simulation |
| **paused** | `P` / `Esc` (guarded: only from *playing*) | render only, overlay shown |
| **ascension** | crossing 2000 m (non-eternal) | world freezes at the gates; choice overlay |
| **gameOver** | `endRun(false)` | death card with score + best |
| **victory** | `endRun(true)` via Ascend | victory card |

---

## 4. Player System

One continuous, muscled, GPU-skinned body — sculpted in signed-distance fields, polygonised by marching cubes, and driven by the same bone rotations the animation code always wrote.

### How the Character Is Built

The devotee is *not* assembled from boxes and cylinders. `SdfKit.js` provides a miniature character pipeline: anatomy is authored as ~45 blended signed-distance volumes (`orb`, `blob`, `tube` primitives with smooth-min union and smooth subtraction), the field is polygonised with Three.js `MarchingCubes` into a single seamless mesh, welded, and skinned to a 12-bone skeleton with a purpose-built weighting pass. `WarriorBody.js` is the sculpt itself:

- **Measured proportions** — soles y=0, knee 0.599, hip 1.05, shoulder 1.715, crown ≈ 2.07: every landmark taken from the character reference sheet by pixel measurement (§15).
- **Sculpted anatomy** — trapezius, deltoids, latissimus wings, pectorals, erector ridges beside a subtracted spine groove, biceps, flexor-heavy forearms, quads, calves, real feet with heel/instep/toes.
- **The dhoti** is its own SDF bake: a hip wrap, per-thigh cloth columns, a tilted knee-length hem — skinned to the waist *and both thighs* with a wide blend band so the skirt stretches with the stride.
- **Signature kit** as rigid accessories on bones: the janeu traced *onto the body surface* by walking an ellipse along the SDF gradient until it hugs the skin; two rudraksha neck loops; arm and wrist bead rings; the high crown bun with its tie; a dusty darker sole painted into vertex colours.
- **Baked ambient occlusion** — SDF-sampled AO written into vertex colours: free depth at runtime.

> **The rig contract.** The animation drives `userData.parts`: `torso, head, leftUpperArm, leftLowerArm, rightUpperArm, rightLowerArm, leftUpperLeg, leftLowerLeg, leftFoot, rightUpperLeg, rightLowerLeg, rightFoot, dust`. Every entry except `dust` is a `THREE.Bone` — and since bones are Object3Ds, the animation code that once rotated rigid group pivots now bends a continuous mesh at every joint, unchanged.

### The Running Animation

The gait is pure sinusoidal composition, cadence-coupled to the game's actual speed:

```js
// src/entities/Player.js
let stridePhase = 0;
function animateRun(time, dt) {
  stridePhase += dt * (5.5 + state.speed * 0.55);   // legs churn faster as the run accelerates
  const t = stridePhase;

  // Forward-biased hip drive; the shin lags the thigh and the heel kicks up hard
  parts.leftUpperLeg.rotation.x  = -0.18 + swing(t, 0.75);
  parts.rightUpperLeg.rotation.x = -0.18 + swing(t + Math.PI, 0.75);
  parts.leftLowerLeg.rotation.x  = swingForward(t + 0.55, 0.9);

  // Elbows pumped, opening on the backswing and tucking on the drive
  parts.leftLowerArm.rotation.x  = -0.7 - swingForward(t + Math.PI + 0.6, 0.5);

  // Ankles roll with a toe-down bias, flashing the darker sole at the camera
  parts.leftFoot.rotation.x = 0.18 + swing(t + 0.9, 0.4);

  // Trunk counter-rotation — the single biggest anti-robot ingredient
  parts.torso.rotation.y = swing(t, 0.14);
  parts.torso.rotation.x = 0.10 + state.speed * 0.004 + bounce(t, 0.025);
  parts.torso.position.y = HIP_Y + bounce(t, 0.045);
}
```

Opposite limbs run π out of phase; `swingForward` clamps knees so they only ever bend the human way; dust puffs are emitted at each stride's zero-crossing — exactly when a foot plants.

### Jump Physics

Symplectic Euler with tuned constants: gravity **−34 u/s²**, impulse **13.3248**, double-jump impulse **10.8** (mid-air, once, re-armed on landing or when stepping off a boulder). The odd-looking impulse is deliberate: the integrator undershoots the analytic apex by `v₀·dt/2`, so 13.3248 — not the textbook 13.04 — is what puts the *observed* apex at 2.5 units (§14). While airborne the pose eases into a hero leap: arms raised and spread wide (never behind the torso, where the chase camera would lose them), lead knee driving, trailing leg kicked back.

### Slide Mechanics

`S`/`↓` starts a **0.6 s** slide (mid-air it first slams down at −18 u/s). The visual is a genuine pose, not a scale trick: the torso and both thigh-root bones sink together by an eased **0.34 units**, the legs fold forward, arms flare for balance, and the body keeps its volume all the way down. For collision the player's band top drops to **1.15** — low enough to pass under the arch lintel and the floating souls. Recovery is the same easing in reverse.

### Lane Switching

Three lanes at x = −2.2, 0, +2.2. Input moves a *target*; position eases every frame — `state.playerX = lerp(playerX, targetX, LANE_SWITCH_SPEED × dt)` with rate 15 — giving the characteristic swoop, while the camera follows at 65% for parallax.

### The Vishnu Shield Visual

A translucent teal sphere (radius 1.25, emissive, 45% opacity) parented to the player group at chest height, hidden until the shield power triggers. It spins on Y while `shieldTimer` runs (5.5 s), absorbs one hazard contact outright, and turns the Naga's strike aside.

---

## 5. Obstacle System

Seven hazard types, one honest 3-D collision model, and a pool that never allocates during play.

### The Roster

| Hazard | Zone | Vertical band | Behaviour | Correct answer |
|---|---|---|---|---|
| **Sacred Fire Pit** | 1 — run ends | `[0, 0.35]` | Stone ring, log fire, three flame cones flickering on individual sine phases; borrows a pooled warm light when near. | Jump it (or lane away) |
| **Rolling Boulder** | 2 — costs a life | `[0.15, 1.55]` | Cracked shell over a dark core, spinning at road speed (`core.rotation.x += speed·dt`), moss patches, dust puffs 25% of frames. | Jump over — or **land on top** (standHeight 1.8) and ride it |
| **Asura Demon** | 2 | `[0, 1.75]` | Charges the player at **scroll + 6 u/s**. One continuous SDF body with baked war paint; stomping gait pumps arms/legs via sine, swings a spiked club from the forearm bone. | Jump near apex, double-jump, lane away — or destroy with a power |
| **Evil Soul** | 2 | `[1.2, 2.0]` | Glowing spirit orb at head height; drifts a full lane-width laterally on a sine while bobbing vertically (§14). Zone 2 *because* it can converge with little warning. | Slide under — or leap clean over |
| **Broken Causeway** | 2 | `[−2, 0.5]` | A 0.52-high carved slab across the lane, molten-gold warning edge. Grounded contact trips; airborne (playerY ≥ 0.5) clears. | Jump the gap |
| **Temple Arch Gate** | 2 | `[1.6, 2.6]` | Carved jambs + lintel whose stone underside sits at 1.55 — the collision band starts at 1.6, so nobody dies below the visible beam. | Slide under (jumping cannot fit) |
| **Cobra Naga** | 2 | `[0, 1.35]` | Ten spine segments as *siblings* (a chain accumulated lean), a wave running up the coil so the head lags; the hood flares from none at 18 units out to full at 6. | Jump it — sliding into it is a bite |

### The Two-Zone Damage Model

- **Zone 1** (fire pit only): sacred fire is absolute — contact ends the run outright, whatever the lives count.
- **Zone 2** (everything else): costs **1 life**, hides the obstacle, grants a **1.5 s stumble** invulnerability window, shakes the camera — and counts as a *path mistake* toward summoning the Naga (§7). On the last life, Zone 2 behaves like Zone 1.

### Honest 3-D Collision

The resolver first tests lane/depth proximity (tuned per shape), then a **vertical gate**: each hazard declares the band of space it actually threatens, and the player carries a real body band — full height 2.0 grounded, **1.6 tucked while airborne** (knees up), 1.15 sliding. No overlap, no contact:

```js
// src/systems/CollisionSystem.js
const HAZARD_SPAN = {
  firePit: [0, 0.35],   boulder: [0.15, 1.55],  archGate: [1.6, 2.6],
  brokenRoad: [-2.0, 0.5], evilSoul: [1.2, 2.0], cobra: [0, 1.35],  asura: [0, 1.75],
};

function playerBand() {
  const bottom = state.playerY;
  const height = state.isSliding ? 1.15 : (state.isGrounded ? 2.0 : 1.6);
  return [bottom, bottom + height];
}

// inside resolveObstacleCollision, after the x/z proximity test:
const span = HAZARD_SPAN[oType] || DEFAULT_SPAN;
const [pBottom, pTop] = playerBand();
if (pBottom >= span[1] || pTop <= span[0]) return 'none';   // vertically clear
```

Before the gate, one special case runs: **landing on a boulder** — falling onto the shell's crown (playerY ≥ standHeight − 0.35, descending) parks the player on top, re-arms the double jump, and remembers the support so gravity resumes the moment it slides out from underfoot. Shield and stumble i-frames are checked after the gate, so a clean dodge never wastes them. A 20-case regression matrix pins all of this down.

### The Obstacle Pool

All seven builders × 3 instances = **21 obstacles, built once at boot, never destroyed**. Spawning toggles `visible` and sets a position; despawn (z > 8, behind the camera) toggles it back. The pool is also the reason shader warm-up works — every material exists before the first frame.

---

## 6. Divine Power System

Two fully independent channels of divinity: the power you carry in your hand, and the ultimate you charge with devotion.

### The Three Powers

| Power | Deity | Effect | Details |
|---|---|---|---|
| **⚡ Sudarshan Chakra** | Vishnu | Blasts the player's own lane | One spinning discus projectile down current lane; 25 u/s, 40-unit range, spins at 25 rad/s |
| **🔱 Shiva's Trishul** | Shiva | Purifies all three lanes | Three trident projectiles launched simultaneously at x = −2.2, 0, +2.2 |
| **🛡️ Vishnu's Shield** | Vishnu | 5.5 s of protection | Absorbs one hazard contact (destroying the hazard, +50×combo punya) and repels the Naga's strike |

### Channel 1 — The Held Power (`E`)

Chakra, trishul and shield **pickups** appear on the track — each one visibly *is* its power (the discus with counter-rotating rings and teeth, the upright trident in cold blue so it never reads as gold at speed, the tilted teal shield disc). Grabbing one puts that exact power *in hand*; the newest pickup replaces the old. `E` (or Shift, or the POWER button) spends it. The Shakti bar is untouched throughout — this channel is item-based, not energy-based.

### Channel 2 — The Shakti Ultimate (`C`)

The Shakti bar starts every run at **0** and charges only from devotion: **Om glyphs +3** and **Rudraksha beads +12** — never from power pickups. Below 100, `C` refuses politely and spends nothing. At 100 the bar glows gold (*🔥 ULTIMATE READY — PRESS C*) and `C` erupts **one of the three powers at random**, draining the bar completely back to zero:

```js
// src/systems/PowerSystem.js
const DIVINE_POWERS = ['sudarshan_chakra', 'trishul', 'vishnu_shield'];

export function unleashUltimate() {
  if (state.phase !== 'playing') return;
  if (state.shakti < state.maxShakti) {
    showBanner(`SHAKTI ${Math.floor(state.shakti)}/${state.maxShakti} — FILL THE BAR TO UNLEASH`, 1.2);
    return;
  }
  state.shakti = 0;
  executePower(DIVINE_POWERS[Math.floor(Math.random() * DIVINE_POWERS.length)]);
}
```

### Projectiles & Hit Detection

Projectiles come from their own pre-built pool. Each frame a live projectile advances along its direction, spins, and box-tests every visible obstacle (|dx| < 1.2, |dz| < 1.4). A hit hides the obstacle, awards **+50 × combo punya**, plays the blast, and bursts particles — a slain Asura gets his own three-colour ember death burst. Projectiles retire at max range and return to the pool.

### VFX & the Naga

Every activation fires the sawtooth power cue and a burst from the 48-spark particle pool; banners announce the power by name. And crucially: **using any power while the Naga hunts resolves the chase instantly** — the serpent recoils, and the escape bonus is the larger one (+350 × combo).

---

## 7. The Naga Chase

The rival serpent is the game's pressure valve: it punishes sloppy runs, rewards clean ones, and gives the divine powers a defensive job.

### What Summons It

- **Scheduled hunts:** every **280 m** of distance, the Naga rises regardless — a rhythm of terror built into the pilgrimage.
- **Path mistakes:** every Zone 2 hit registers a mistake; **2 mistakes** summon it early. A mistake-summoned chase starts further back (target z 9.0 vs 7.0) — it arrives when the devotee is already hurt, so it must be survivable rather than an execution.

### The Pursuit

The serpent appears 16 units behind and closes continuously at **0.8 m/s** (eased with `lerp(nagaZ, targetZ, 4·dt)`, swaying on a sine as it comes, mirroring 80% of the player's lane). Every hazard *cleanly passed* during the chase shoves it back **1.8 units**; surviving **3** obstacles resolves the chase (+250 × combo punya). Stumbling mid-chase resets that count to zero and hands the serpent 2.5 units of ground.

### The Strike

If it closes to **z ≤ 1.7** it bites: −1 life, 1.5 s stumble, camera shake 2.0, and the serpent recoils to z 9 to build the dread again — or, on the last life, the run ends. An active Vishnu shield turns the strike aside entirely and forces a retreat.

### Three Escapes

1. **Dodge cleanly** — three passed hazards and it breaks off (+250×combo).
2. **Outlast it flawlessly** — every clean pass buys 1.8 m of breathing room.
3. **Unleash divinity** — any power (E or C) ends the chase on the spot (+350×combo).

### How It Looks

A single always-resident entity (hidden between hunts): a CatmullRom-swept tube body coiling low then rearing, segmented mint belly plates, a flared iridescent emerald-violet hood, glowing amber eyes, white fangs and a forked crimson tongue. Its idle menace is the same `swing()` vocabulary as everything else.

---

## 8. Collectibles & Scoring

One currency of merit — punya — fed by distance, devotion and combat, multiplied by combo and by how far past Kailash you dare to walk.

### The Collectibles

| Pickup | Punya | Shakti | Other effects |
|---|---|---|---|
| **ॐ Om Glyph** — a spinning gold coin with the symbol canvas-drawn onto both faces | +10 × combo × mult | +3 | the bread-crumb line of the path (one every ~8.5 m) |
| **Rudraksha Bead** — furrowed seed in a gold halo, arriving in curved arcs of 3–5 | +75 × combo × mult | +12 | **combo → min(6, +2)** and the 12 s combo timer refreshes — three effects in one bead |
| **Power pickups** — chakra / trishul / shield | — | 0 (by design) | puts that power in hand for `E`; offered in strict rotation so a run sees all three |

### Every Punya Source

| Source | Formula |
|---|---|
| Covering ground | +0.5 / metre × combo × eternalMult |
| Om glyph | +10 × combo × eternalMult |
| Rudraksha bead | +75 × combo × eternalMult |
| Hazard destroyed (projectile or shield) | +50 × combo |
| Naga escaped by dodging / by power | +250 / +350 × combo |
| Entering a new stage | +150 × stage (eternal leagues: +200 × mult) |

### Combo, Shakti, Persistence

- **Combo:** beads push the multiplier toward ×6; a 12-second decay timer resets it to ×1 when it lapses. Everything punya-flavoured scales by it, which is why bead arcs are worth committing a line to.
- **Shakti:** the ultimate meter (§6) — 0→100, Om +3 / bead +12, drained to zero by `C`. The HUD bar dims below 100 and glows gold at full.
- **Eternal multiplier:** ×2 on stepping past Kailash, +1 every further 1000 m — walk 5 km and every Om is worth five.
- **High score:** best punya and best distance persist under the `localStorage` key `naga-loka-runner:best`, loaded at boot, saved at run end, and wrapped in try/catch so a sandboxed frame that blocks storage degrades to session records.

---

## 9. Spawn System & Difficulty Stages

A distance-driven spawn director reading from a four-stage difficulty table — then synthesising infinite "leagues" beyond the mountain.

### The Stage Table

| Stage | From | Spawn gap | Paired hazards | Interval pressure | Power orb every |
|---|---|---|---|---|---|
| **I · The Forest Path** | 0 m | 18.0 m | 0% | ×1.00 | 80 m |
| **II · The Serpent's Coils** | 500 m | 15.5 m | 18% | ×0.85 | 68 m |
| **III · The Burning Ghats** | 1000 m | 13.5 m | 30% | ×0.72 | 58 m |
| **IV · Kailash's Shadow** | 1500 m | 12.0 m | 42% | ×0.62 | 50 m |
| **∞ · Eternal League k** | 2000 m +500k | max(10.5, 12−0.25k) | min(50%, 42+2k) | max(0.5, 0.62−0.02k) | max(44, 50−k) |

Each stage is announced with a banner, retints the moonlight to its mood (§10), and pays a crossing bonus. The working gap also tightens slightly with speed: `max(10, stage.gap − (speed − 12) × 0.15)`.

### How Spawning Decides

1. **Type gating by distance** — the first 300 m introduce the cast gradually: souls at 150 m, asuras at 200 m, cobras at 250 m, broken slabs at 300 m.
2. **Forced intervals** — signature hazards are guaranteed to reappear: an asura at least every 140 m, a slab every 250 m, a soul every 150 m, a cobra every 180 m — all multiplied by the stage's pressure factor, so the guarantees tighten as the pilgrimage climbs. Otherwise the type is drawn uniformly from the eligible list.
3. **Paired hazards** — at the stage's dual chance, a second obstacle spawns at the same depth in a *different* lane. Two of three lanes blocked always leaves a clean lane, plus the jump/slide answer on the blocked ones — pressure without unfairness.
4. **Collectibles** — an Om line every 8.5 m; bead arcs replace it with stage-scaled probability (5% → 14%), swept as a lane-change curve or a jump arc that peaks exactly where a jumping player would be.
5. **Power pickups** — cycled chakra → trishul → shield at the stage's cadence, so luck never starves a run of one power.

Everything spawns at `z = −62`, scrolls with the world, and recycles behind the camera at `z = +8` — visibility toggles on a pre-built pool, zero allocation, zero GC spikes.

---

## 10. Environment & Visual Design

A moonlit night in saffron and indigo: warm sacred stone against a cold sky, with the destination always burning white on the horizon.

### The Snake Way Itself

`Track.js` builds **7 ground segments of 12 units** — each a 3×4 grid of beveled sandstone slabs over a dark under-floor (so joints read as depth), twin **glowing golden lane dividers** with fake light-spill strips, and mossy kerbs. Segments scroll toward the camera and wrap to the far end: an infinite causeway from 84 units of geometry. Six Sanskrit inscription decals — the phrase *श्रावणरत्मा* drawn to a canvas (Devanagari cannot be built from boxes) — recycle on their own 20-unit rhythm so they never align with the slab grid.

### Scenery Pools

`Environment.js` pools temple pillars (vine-wrapped, carved), dark canopy trees, hanging vine curtains, stone pedestals and **torch braziers** along both flanks — all built once, `mergeStatic`-collapsed into a few draw calls each, and recycled by the same scroll-and-wrap pattern.

### Mount Kailash & the Sky

The destination is a four-sided pyramid (rock body + snow cap sized a whisker proud to kill z-fighting) with a 560-unit radial-gradient halo of divine light, flanked by lesser ridges so it sits in a range. The sky is a **custom shader dome** grading near-black indigo overhead into warm horizon purple. Both opt out of fog — which is what keeps the peak visible through the mist and creates the depth read: fogged path, clear destination.

### Lighting

- **Moonlight:** one cool directional (`#c8d8ff`, 1.55) from top-left, the scene's only shadow-caster, its shadow camera clamped tightly to the visible causeway.
- **Ambient + hemisphere:** a barely-there indigo ambient and a cool-sky/warm-ground hemisphere — the reason shadowed sandstone still reads sand-coloured, not brown.
- **The warm-light pool:** exactly **4 point lights** for every flame in the world. Each frame they park on the nearest visible torches/fire pits and flicker on sine phases; spares dim to zero instead of being removed — because Three.js bakes the light *count* into every shader's cache key, and a changing count means recompiling every material mid-run (§16).
- **Stage moods:** the moon lerps between five tints — cold forest blue, serpent green, ember, pale summit light, eternal violet — colour-only, so the shader set never changes.
- **Fog:** exponential (`FogExp2`, density 0.018) — the mist that swallows the path a few segments out and hides all spawning and recycling.

---

## 11. UI and HUD

All DOM, all built in code, updated once per simulated frame with change-detection so the browser never re-lays-out text that didn't change.

### The HUD Cards

| Element | Shows | Notes |
|---|---|---|
| **🕉️ Punya** | merit total + combo badge | badge appears only above ×1 ("✨ 6x PUNYA MULTIPLIER") |
| **🏔️ To Mount Kailash** | distance + progress bar | eternal mode swaps to `2340m · ×3 PUNYA` |
| **♥ Lives** | ♥♥♥ / ♥♥♡ / ♥♡♡ | colour and glow shift as they drain |
| **⚡ Shakti** | 0–100 bar + two truth lines | line 1: `ULTIMATE CHARGING 47/100` or gold `🔥 READY — PRESS C`; line 2: `🔱 TRISHUL IN HAND — PRESS E` or `NO POWER IN HAND` |

`updateHUD()` runs at the end of every simulation step but caches the last-shown value per element — `textContent` is only touched when a floor()ed value actually changed.

### Banners

One reusable announcement strip under the top cards. `showBanner(text, seconds)` handles power names, stage announcements, Naga warnings, shakti prompts and eternal milestones; a stored timeout clears it and a new banner pre-empts the old.

### Screens

- **Start** — title card with the full controls and both power systems documented; the button calls `window.__startGame()`.
- **Pause** — `P`/`Esc` toggle, phase-guarded so it can't fire over other overlays.
- **Ascension** — the gates of Kailash: punya so far and two buttons, *ASCEND* vs *WALK THE ETERNAL PATH*.
- **Game Over / Victory** — score breakdown, best-run comparison, retry; the death card relabels itself *"Walked Beyond Kailash: 4210m · ×3 punya"* for eternal runs. All overlays share one fade helper.

### Touch Controls

Six on-screen buttons — ◀ ▶ lanes, SLIDE, JUMP, **POWER (E)**, **ULT (C)** — wired to the same verb functions as the keyboard, plus swipe gestures on the canvas (horizontal = lane, up = jump, down = slide). Mobile plays the identical game.

---

## 12. Audio System

Seventy-one lines, six cues, zero files: every sound is an oscillator envelope.

The Web Audio context is created lazily on the first cue (satisfying autoplay policy — the first sound follows a user gesture) and resumed if suspended. Each cue is one oscillator, one gain envelope:

| Cue | Waveform | Frequency shape | Fired by |
|---|---|---|---|
| **jump** | sine | 220 → 540 Hz over 0.18 s | jump & double jump |
| **om** | triangle | C5 → E5 (523 → 659 Hz) | Om pickup, run start, eternal milestones |
| **rudraksha** | sine | A4→E5→A5 arpeggio steps | bead pickup, Naga escaped |
| **power** | sawtooth | 180 → 720 Hz rising sweep | power pickup & every cast |
| **blast** | square | 140 → 40 Hz falling thud | hits, kills, deaths |
| **hiss** | sawtooth | 800 → 300 Hz falling rasp | the Naga — summon, gain, strike |

**Why no audio files?** The whole project is a zero-asset build — meshes from math, textures from canvas, audio from oscillators. Nothing to download, nothing to license, nothing to 404; the entire game works from a text checkout. Each cue is also pitched to its meaning: devotion ascends (om, rudraksha rise), danger descends (blast, hiss fall).

---

## 13. Game Rules & How to Play

### The Rules

1. You run automatically, accelerating from 12 u/s (+0.5 every 200 m). Steer between three lanes; jump, double-jump and slide to survive what the path throws at you.
2. You carry **3 lives**. Most hazards cost one and grant 1.5 s of stumble-invulnerability; the **sacred fire pit ends the run outright** — and so does any hit on your last life.
3. Every stumble is a *path mistake*: two of them — or simply every 280 m — summon the **rival Naga**. Survive 3 hazards cleanly, or spend a divine power, to escape it.
4. Collect Om glyphs and Rudraksha beads for punya, combo (up to ×6) and Shakti. Grab power pickups to hold a divine weapon in hand.
5. At **2000 m** you reach the Gates of Kailash and choose: **Ascend** (victory) or **walk the Eternal Path** — endless, crueller every league, all punya ×2 and deepening every 1000 m.

### Controls

| Action | Keyboard | Touch |
|---|---|---|
| Switch lane | `A`/`D` or `←`/`→` | ◀ ▶ buttons, or swipe left/right |
| Jump / double jump | `W`, `↑` or `Space` (press again mid-air) | JUMP button, or swipe up |
| Slide | `S` or `↓` | SLIDE button, or swipe down |
| **Use held power** | `E` (also `Shift`) | POWER (E) button |
| **Unleash Shakti ultimate** | `C` — full bar only | ULT (C) button |
| Pause | `P` or `Esc` | tap the Shakti card |

### Cheat-Sheet: What Beats What

**Jump:** fire pit, boulder, broken slab, cobra, asura (near apex) · **Slide:** arch gate, evil soul · **Never slide into** a cobra or an asura · **Boulders** can also be ridden — land on top and the double jump re-arms.

### Strategy for High Scores

- **Keep the combo alive.** ×6 turns 0.5/m into 3/m — bead arcs are worth a risky line.
- **Bank the ultimate for the Naga.** A power-escape pays +350×combo — at ×6 that's 2,100 punya.
- **Hold the shield for late stages**, where 42–50% paired spawns make raw dodging expensive.
- **Walk the Eternal Path.** The multiplier compounds: league punya dwarfs the pilgrimage itself.

---

## 14. Key Algorithms & Math

### The Sinusoidal Gait Vocabulary

```js
// src/utils/AnimationHelper.js
export function swing(angle, amp)        { return Math.sin(angle) * amp; }          // full limb swing
export function swingOpposed(angle, amp) { return -Math.sin(angle) * amp; }         // the other leg
export function swingForward(angle, amp) { return Math.max(0, Math.sin(angle) * amp); } // knees bend one way
export function bounce(angle, amp)       { return Math.abs(Math.sin(angle)) * amp; }    // two footfalls per cycle
```

Every character in the game — devotee, asura, cobra, naga, souls — animates from these four functions with phase offsets. Opposite limbs are `t` vs `t + π`; the shin trails the thigh by 0.55 rad; `bounce` gives the body two dips per stride because a run has two footfalls per cycle.

### Symplectic Euler Jump — and the 13.3248 Story

```js
// per sub-step:
state.playerVY += CONFIG.GRAVITY * dt;    // -34 u/s²  (velocity first…)
state.playerY  += state.playerVY * dt;    // …then position: symplectic Euler
```

Updating velocity before position makes the integrator *symplectic* — energy-stable, but it undershoots the analytic apex by exactly `v₀·dt/2` (≈ 0.11 units at 60 fps). The analytic impulse for a 2.5-unit apex is `√(2·34·2.5) = 13.04`; the shipped **13.3248** compensates for the integrator, so the *observed* peak is 2.5. Total airtime ≈ 0.78 s — comfortably longer than any hazard's 0.07–0.16 s pass-through window, which is the mathematical guarantee behind "a well-timed jump always fits".

### Frame-rate-safe Lerp (lanes, camera, speed, Naga)

```js
state.playerX = THREE.MathUtils.lerp(state.playerX, state.targetX, CONFIG.LANE_SWITCH_SPEED * dt); // rate 15
```

Exponential approach: each second removes a fixed *fraction* of the remaining distance, so the swoop decelerates naturally into the target lane. The same one-liner (different rates) drives the camera (8–10), the speed ramp (2.6), the Naga's pursuit (4), and every pose transition (`approach()`, rates 12–14).

### The Evil Soul Drift

```js
// src/entities/EvilSoul.js
obs.position.x = baseX + swing(time * 1.5 + phase, LANE_WIDTH * 0.5);  // ±1.1 units of lateral drift
obs.position.y = 0.3   + swing(time * 3.0, 0.3);                       // bobbing at double rate
```

Two incommensurate sine rates make the motion feel alive rather than mechanical; each soul carries a random phase so two on screen never move in lockstep.

### IoU Silhouette Matching (development-time)

During the character build, every sculpt iteration was rendered and compared against the reference art by **intersection-over-union of binary silhouettes**, normalised to equal height: `IoU = |A∩B| / |A∪B|`, plus a 40-band width profile that localised *where* the model was too thin. This turned art direction into measurement: 0.68 → 0.77 (mask cleanup) → 0.81 (measured widening) — and a proposed change that *felt* right but measured 0.72 was rejected on the number.

### Difficulty Scaling

```js
// src/systems/SpawnSystem.js
// working spawn gap: the stage's base, tightened slightly by current speed
nextObstacleDist = state.distance + Math.max(10.0, stage.gap - (state.speed - CONFIG.BASE_SPEED) * 0.15);

// beyond Kailash, leagues synthesise forever with asymptotic floors:
gap      = Math.max(10.5, 12.0 - k * 0.25);
dual     = Math.min(0.5,  0.42 + k * 0.02);
pressure = Math.max(0.5,  0.62 - k * 0.02);
```

Every scaling curve approaches a floor or ceiling asymptotically — difficulty always rises, but reaction time never falls below human.

---

## 15. Development Journey

### Origins & Reorganisation

The game began as a **Crayon Game Builder export**: four flat files (`game-assets-v2.js`, `game-main-v2.js`, `game-state-v2.js`, `game-ui-v2.js`) and an `index.html` carrying the engine. It was rebuilt into the current **29-module ES architecture** with zero logic changes first — structure before features — then every system was reworked in place. The split surfaced real bugs of its own (a duplicate export that blocked boot, variables orphaned between files) which seeded the testing culture below.

### The Character Pipeline

The hero went through three complete generations:

1. **Primitive assembly** — the original box-and-cylinder figure; readable, robotic.
2. **img2threejs reconstruction** — a staged, quality-gated pipeline measured a character reference sheet (pixel-profiled landmarks: 7.9 head-units, hip at exactly half height), produced a validated sculpt spec and a generated factory. Its blockout supplied the measured *skeleton* — and its review gates supplied the IoU discipline (§14).
3. **SDF sculpt** — the shipped body: blended signed-distance anatomy → marching cubes → one seamless mesh → custom skinning (nearest-bone with blending permitted only between anatomically adjacent bones — the fix for auto-skinning's smeared shoulders). The Asura was rebuilt with the same engine, war paint baked into vertex colours.

### Bugs Worth Remembering

| Bug | Root cause | Fix |
|---|---|---|
| Mid-run freezes (0.5–1.6 s) | shader compilation on first appearance of pooled hazards | full-scene `compileAsync` warm-up behind the splash |
| Permanent micro-stutter on 144 Hz | fixed 60 Hz step: only 42% of frames moved the world | variable timestep with bounded sub-steps (§3) |
| Recompile hitches near fire | light *count* is baked into Three.js shader cache keys | fixed pool of 4 warm lights, parked on nearest flames, spares dimmed not removed |
| "I jumped over it and still died" | collision tested only x/z — height was special-cased for 3 of 7 types | per-hazard vertical spans + a real player body band (§5) |
| Paper-thin slide | slide scaled the whole rig to `scale.y = 0.5` | hip-drop pose on the bones; scale never touched |
| Slider sank underground | pose eased toward a base the drop was subtracted from — a feedback loop with equilibrium 1.8 units below the road | absolute pose write; the drop keeps its own easing |
| Jump apex 2.39 not 2.5 | symplectic Euler undershoot `v₀·dt/2` | impulse solved as 13.3248 (§14) |
| Full Shakti bar, "collect orb first" | power un-equipped below one cast; only orbs re-equipped | redesigned into the two independent E/C systems (§6) |
| Hidden double bead grant | a hard-coded +15 shakti buried mid-function, undocumented by any constant | one line, one named constant |

### The Testing Approach

Every gameplay system ships with a headless regression suite in `devtools/tests/` — each boots the *real game* in headless Chrome and asserts against the live modules:

- `collisiontest.mjs` — the 20-case fairness matrix: every hazard × run/jump/slide, land-on-boulder, lane isolation, and the wrong-move cases.
- `stagetest.mjs` — sweeps 400 m of each stage measuring real spawn gaps and dual rates against the table; plus the full two-system power contract, including randomness (15 unleashes must produce ≥2 distinct powers, bar drained to exactly 0 every time) driven through the real keyboard events.
- `eternaltest.mjs` — 17 checks across the whole Kailash lifecycle: both gate choices, multiplier deepening, league banners, the eternal death card, both restart paths.
- `runtest.mjs` — live gameplay: boot → play → trigger a real slide via the input path → verify the mid-slide numbers and the recovery, capturing pixels and state *in the same JS tick*.
- `playertest.mjs` — rig integrity: the parts contract, and skinned-*vertex* deformation per bone (a bone that stops moving geometry fails loudly).
- `preview.mjs` — renders hero or demon alone for art direction.

Earlier phases also used a Node `vm.SourceTextModule` harness with stubbed THREE (148 assertions across 5 suites), fuzz testing of the input verbs, and CDP-driven play-throughs — the guards in entity code (`if (typeof geo.translate === 'function')`) are its legacy.

---

## 16. Performance Considerations

The budget philosophy: pay everything once at boot, then never allocate, never compile, never surprise the frame.

| Metric | Value |
|---|---|
| Allocations per frame | **0** |
| Pooled obstacles | 21 |
| Pooled FX sparks | 48 |
| Point lights, ever | 4 |
| Hero triangles | ~95 k (GPU-skinned) |
| Meshes per demon | 11 (down from 36) |

### Pooling Everywhere

Obstacles (21), Om glyphs (18), beads (12), power pickups (6), projectiles, FX sparks (48), ground segments (7), inscriptions (6), pillars/trees/torches/curtains — every dynamic object is pre-instantiated at boot and recycled by toggling `visible`. Hot loops reuse module-level scratch `Vector3`s. The steady-state frame performs **zero allocations**, so the GC has nothing to collect and no excuse to pause mid-run.

### Why Pre-Instantiation (and not lazy creation)

Three reasons, in order of pain: (1) first-use **shader compilation** — a material that first renders mid-run freezes the frame for hundreds of milliseconds, so every material must exist for the boot-time `compileAsync` warm-up to find; (2) GC spikes from geometry churn; (3) deterministic memory — the game's footprint at minute 30 is its footprint at second 3.

### Draw Calls & Triangles

`mergeStatic()` collapses each static prop to one mesh per material (a temple pillar was 18 draw calls, a ground segment 31 — merging more than halved a scene that had reached ~1200 visible meshes). Character accessories are baked per bone, per material — the demon dropped from 36 meshes to **11**, and pooled demons share geometry via `SkeletonUtils.clone`. The hero is 2 skinned meshes + a handful of accessory meshes; skinning runs on the GPU. Fire flames opt out of merging (`noMerge`) because they animate.

### The Light Budget

The subtlest constraint in the codebase: Three.js bakes the point-light *count* into every shader's cache key. Nine lights (six torches + three fire pits) once meant both a per-pixel cost and — far worse — a full shader recompile whenever a pooled pit toggled. The fix is architectural: a **fixed pool of four** warm lights that are parked each frame on the nearest visible flames, with spares dimmed to zero intensity — because a zero-intensity light still counts toward the cache key and keeps the program set stable forever.

### Keeping the Loop Lean

- HUD writes are change-detected; DOM is touched only when a displayed integer actually changes.
- The shadow camera is clamped to the visible causeway — distant trees never enter the shadow pass.
- Fog doubles as a culling ally: spawn (z −62) and recycle (z +8) both happen invisibly.
- Baked vertex AO and painted soles/war-paint deliver surface richness with zero runtime cost.
- The camera eases on real frame time outside the sub-step loop — presentation stays 144 Hz-smooth even when simulation subdivides.

---

<p align="center">
ॐ<br>
<b>Naga Loka Runner — Saiyan Through the Snake Way</b><br><br>
⭐ <a href="https://github.com/Itsagar086/warrior_run">GitHub Repository</a> · 🎮 <a href="https://warrior-run.vercel.app">Play the Live Game</a><br><br>
<i>Game design document · generated from a complete read of the 6,658-line source tree · Three.js 0.184 · 100% procedural assets · ॥ शुभ यात्रा ॥</i>
</p>
