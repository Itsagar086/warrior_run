# NAGA LOKA RUNNER — COMPLETE PROJECT CONTEXT

> **Purpose of this file.** This is the full engineering knowledge base for the game. Give it to any AI assistant (Claude Desktop, a new chat, a new dev) and they will have everything needed to make changes correctly without reading the whole codebase first. Every number in here is copied from the actual source, not remembered.
>
> **Last verified against source:** 4 September 2026 · 29 modules · 6,658 lines.

---

## TABLE OF CONTENTS

**PART A — ORIENTATION**
1. [What This Game Is](#1-what-this-game-is)
2. [How To Run It](#2-how-to-run-it)
3. [Tech Stack & Boot Sequence](#3-tech-stack--boot-sequence)
4. [Coordinate System & Conventions](#4-coordinate-system--conventions)

**PART B — THE CODEBASE**
5. [Complete File Map](#5-complete-file-map)
6. [Every Tuning Constant](#6-every-tuning-constant-configjs)
7. [The Game State Object](#7-the-game-state-object)
8. [Public API — Every Exported Function](#8-public-api--every-exported-function)
9. [Global Debug Hooks](#9-global-debug-hooks)

**PART C — THE CHARACTER**
10. [Character Specification (Full Sculpt Spec)](#10-character-specification-full-sculpt-spec)
11. [The SDF Toolkit (SdfKit.js)](#11-the-sdf-toolkit-sdfkitjs)
12. [Player Animation System](#12-player-animation-system)
13. [The Asura Demon](#13-the-asura-demon)

**PART D — GAMEPLAY SYSTEMS**
14. [Game Loop & Frame Timing](#14-game-loop--frame-timing)
15. [Collision System](#15-collision-system)
16. [All Obstacles — Full Specs](#16-all-obstacles--full-specs)
17. [Collectibles](#17-collectibles)
18. [Divine Power System](#18-divine-power-system)
19. [Naga Chase](#19-naga-chase)
20. [Spawn Director & Difficulty](#20-spawn-director--difficulty)
21. [Scoring Economy](#21-scoring-economy)
22. [Camera](#22-camera)
23. [Environment, Track & Lighting](#23-environment-track--lighting)
24. [UI / HUD](#24-ui--hud)
25. [Audio](#25-audio)

**PART E — WORKING ON IT**
26. [Testing](#26-testing)
27. [Performance Rules (Do Not Break These)](#27-performance-rules-do-not-break-these)
28. [Known Gotchas & Hard-Won Lessons](#28-known-gotchas--hard-won-lessons)
29. [Recipes: How To Make Common Changes](#29-recipes-how-to-make-common-changes)
30. [Roadmap / Ideas Not Yet Built](#30-roadmap--ideas-not-yet-built)

---
---

# PART A — ORIENTATION

## 1. WHAT THIS GAME IS

**Naga Loka Runner — Saiyan Through the Snake Way** is a 3-lane 3-D endless runner in Three.js.

- **Setting:** A moonlit temple causeway ("the Snake Way") through Naga Loka, the serpent realm of Hindu cosmology, leading to Mount Kailash (Shiva's abode).
- **Player:** A bare-chested Hindu warrior-devotee — janeu (sacred thread), rudraksha beads, saffron dhoti, topknot.
- **Objective:** Survive 2000 m of hazards. At 2000 m the player chooses to **Ascend** (win) or **Walk the Eternal Path** (endless mode, punya ×2 and deepening).
- **Fail:** 3 lives. Fire pits kill instantly. Everything else costs a life.
- **Economy:** Punya (score) · Shakti (ultimate meter) · Combo (×1–×6).
- **Two power systems:** `E` = use the power in your hand · `C` = unleash a random power from a full Shakti bar.

**Repo:** https://github.com/Itsagar086/warrior_run
**Live:** https://warrior-run.vercel.app
**Local path:** `d:\GAMES\warrior_run`

---

## 2. HOW TO RUN IT

```bash
cd d:\GAMES\warrior_run
node serve.mjs                 # → http://localhost:8000
node serve.mjs 5500            # different port if 8000 is taken
```

Or double-click **`run.bat`** (starts server + opens browser automatically).

**You cannot open `index.html` directly from disk.** The game is ES modules; browsers block module imports over `file://`. It must be served over HTTP. `serve.mjs` is plain Node with zero dependencies — no `npm install`, no `package.json`.

**Other URLs on the same server:**

| URL | What |
|---|---|
| `/` | the game |
| `/devtools/player-preview.html` | hero character alone, orbit camera |
| `/devtools/player-preview.html?who=asura` | demon alone |
| `/docs/game-report.html` | design document (styled) |
| `/docs/game-report.md` | design document (markdown) |
| `/docs/PROJECT-CONTEXT.md` | this file |

---

## 3. TECH STACK & BOOT SEQUENCE

### Stack

| Thing | Version / Detail |
|---|---|
| Renderer | Three.js **0.184.0** via jsDelivr CDN + import map |
| Addons used | `MarchingCubes`, `BufferGeometryUtils` (mergeVertices/mergeGeometries), `SkeletonUtils` (clone) |
| Physics | **None.** Rapier 0.12.0 is listed in `metadata-v2.json` and preloaded in `index.html`, but the game uses hand-written kinematics. Do not assume Rapier is active. |
| Engine shim | `playlabs-boot` / `playlabs-*` — embedded in `index.html` as base64 `data:` URI modules. Provides `boot()` → renderer, scene, camera, clock. |
| Modules | Native ES modules, no bundler, no build step |
| Persistence | `localStorage` key `naga-loka-runner:best` |
| Audio | Web Audio API oscillators (no files) |
| Textures | Canvas 2D drawn at runtime (no image files) |
| Fonts | Google Fonts preloaded in `index.html` (UI only) |

**Zero binary assets.** Every mesh is generated in code. The entire game is text.

### Boot sequence (`src/core/Game.js`, top to bottom)

1. `boot({ lighting: LIGHTING })` — engine creates renderer / scene / camera / clock / canvas.
2. `setupLighting(scene, renderer)` — **strips the engine's warm sunset rig entirely** and installs the moonlit night rig.
3. `createUIRoot()` → `initHUD()`, `initStartScreen()`, `initGameOverScreens()`, `initPauseOverlay()`.
4. `createTrack(scene)`, `createEnvironment(scene)`, `createWarmLights(scene)`.
5. `createPlayer(scene, clock)`, `createNaga(scene, clock)`.
6. `createObstaclePool(scene)`, `initSpawnSystem(scene, clock)`, `initPowerSystem(scene)`, `initFX(scene)`.
7. `loadBest()` — read localStorage records.
8. `initInput()`.
9. `warmUpPipeline()` — makes **everything** visible for one frame and calls `renderer.compileAsync(scene, camera)` so every shader is compiled behind the splash. **Critical for no mid-run freezes.**
10. `animate()` starts. Phase is `splash` until the player clicks the start button → `window.__startGame()`.

---

## 4. COORDINATE SYSTEM & CONVENTIONS

```
        +Y up
         │
         │
         └──── +X right (player's right)
        ╱
      +Z  toward the camera / toward the player
```

- **The player never moves in Z.** He sits at `z = 0`. The world scrolls toward him at `+z`.
- **Spawn at `z = -62`** (`CONFIG.SPAWN_Z`), **despawn at `z > 8`** (`CONFIG.DESPAWN_Z`).
- **Three lanes:** `x = -2.2, 0, +2.2` (`CONFIG.LANES`). Lane index `0 | 1 | 2`.
- **Ground is `y = 0`** (`CONFIG.SURFACE_Y`). The player's feet sit at `playerY`.
- **Rotations are RADIANS** (Three.js standard). A past bug wrote degrees here — never do that.
- **Scroll per frame:** `scrollDelta = state.speed * dt`. Everything on the path does `position.z += scrollDelta`.
- **Distance is in metres** and equals accumulated `scrollDelta`.
- The character faces **+Z** (toward the camera is behind him, so he faces away — his back is what the player sees; the anatomy budget goes to the back).

### Naming conventions

- `makeXxx()` = pure mesh builder, returns a `THREE.Group`, no side effects.
- `createXxx(scene, ...)` = builds + adds to scene + registers pools.
- `updateXxx(dt, ...)` = per-frame update.
- `userData.role` = `'enemy' | 'obstacle' | 'collectible' | 'ground' | 'scenery'`.
- `userData.obstacleType` = the key used by collision + spawn (`'firePit'`, `'boulder'`, …).
- `userData.zone` = `1` (instant death) or `2` (costs a life).

---
---

# PART B — THE CODEBASE

## 5. COMPLETE FILE MAP

```
warrior_run/
├── index.html              77   import map, boot sandbox shim, entry script
├── serve.mjs               74   zero-dep dev server
├── run.bat                      one-click Windows launcher
├── metadata-v2.json             export manifest (Crayon Game Builder origin)
├── docs/
│   ├── game-report.html         styled design document
│   ├── game-report.md           same, markdown
│   └── PROJECT-CONTEXT.md       ← THIS FILE
├── devtools/
│   ├── player-preview.html      character viewer (?who=asura for demon)
│   └── tests/                   6 headless Chrome regression suites + README
└── src/                    6658 total
    ├── core/
    │   ├── Game.js         345   ★ ENTRY. boot, world build, warm-up, updateSimulation, animate
    │   ├── GameState.js     64   the single shared mutable `state` object
    │   ├── InputHandler.js  81   keydown → verbs; touch swipe; pause
    │   └── CameraRig.js     75   eased chase camera + shake
    ├── entities/
    │   ├── Player.js       559   rig contract, animations, physics, dust, trail, shield
    │   ├── WarriorBody.js  379   ★ THE CHARACTER SCULPT (SDF → mesh → skinning)
    │   ├── Obstacles.js    441   firePit, boulder, archGate, brokenRoad + the 21-object pool
    │   ├── AsuraDemon.js   334   SDF demon + updateAsura + death burst
    │   ├── CobraSnake.js   179   coiled cobra, spine wave, hood flare
    │   ├── EvilSoul.js      86   floating spirit, sine drift
    │   ├── NagaChaser.js   281   rival serpent: trigger/pursue/strike/escape
    │   └── Collectibles.js 318   Om glyph, rudraksha bead, 3 power pickups
    ├── systems/
    │   ├── SpawnSystem.js  382   ★ stage table, spawn decisions, pools, per-frame recycling
    │   ├── CollisionSystem.js 131 ★ HAZARD_SPAN vertical gate, two-zone damage
    │   ├── PowerSystem.js  264   E/C two-system powers, projectiles
    │   ├── ScoreSystem.js   96   punya, combo, shakti gains, localStorage, endRun
    │   ├── FXSystem.js      70   48-spark particle pool
    │   └── AudioSystem.js   71   6 oscillator cues
    ├── environment/
    │   ├── Environment.js  618   Kailash, sky shader, pillars, trees, vines, torches, pedestals
    │   ├── Track.js        229   causeway segments, lane dividers, Sanskrit decals
    │   └── Lighting.js     215   night rig, warm-light pool, stage moods, shadow setup
    ├── ui/
    │   ├── HUD.js          406   4 cards, banner, touch buttons, pause overlay
    │   ├── GameOver.js     208   death/victory/ascension overlays
    │   └── StartScreen.js   71   splash + controls tutorial
    └── utils/
        ├── SdfKit.js       397   ★ SDF prims, marching cubes bake, skinning, AO, skeleton
        ├── MeshMerge.js    189   mergeStatic / mergeRigidWithin — draw-call collapsing
        ├── Constants.js     57   ★ ALL TUNING VALUES
        ├── AssetFactory.js  85   re-export hub for every makeXxx
        └── AnimationHelper.js 27 swing / swingOpposed / swingForward / swingBack / bounce
```

★ = the files you will touch most.

---

## 6. EVERY TUNING CONSTANT (`Constants.js`)

Everything gameplay-tunable lives in `src/utils/Constants.js` as `CONFIG`. Complete list:

### Lane geometry
| Key | Value | Meaning |
|---|---|---|
| `LANE_WIDTH` | `2.2` | distance between lane centres |
| `LANES` | `[-2.2, 0, 2.2]` | lane X positions, index 0/1/2 |
| `LANE_SWITCH_SPEED` | `15.0` | lerp rate for lane change easing |

### Speed
| Key | Value | Meaning |
|---|---|---|
| `BASE_SPEED` | `12.0` | u/s at run start |
| `MAX_SPEED` | `22.0` | hard cap (only reached ~4000 m, i.e. eternal mode) |
| `SPEED_STEP` | `0.5` | speed gained per step |
| `SPEED_STEP_DISTANCE` | `200` | metres between steps |
| `SPEED_EASE` | `2.6` | lerp rate toward the stepped target |

> A 2000 m run finishes at **17 u/s**, not 22. Run starts from `speed = 0` and eases up.

### Player physics
| Key | Value | Meaning |
|---|---|---|
| `GRAVITY` | `-34.0` | u/s² |
| `JUMP_IMPULSE` | `13.3248` | ⚠️ tuned for symplectic Euler; analytic value is 13.04. Gives observed apex 2.5 u |
| `DOUBLE_JUMP_IMPULSE` | `10.8` | mid-air second jump |
| `SLIDE_DURATION` | `0.6` | seconds |
| `SURFACE_Y` | `0.0` | ground plane |

### Spawn
| Key | Value |
|---|---|
| `SPAWN_Z` | `-62.0` |
| `DESPAWN_Z` | `8.0` |

### Goal / Naga
| Key | Value | Meaning |
|---|---|---|
| `KAILASH_DISTANCE` | `2000` | goal line, triggers ascension choice |
| `NAGA_CHASE_INTERVAL` | `280` | metres between scheduled chases |
| `NAGA_CHASE_REQ_OBSTACLES` | `3` | clean dodges needed to escape |
| `NAGA_MISTAKE_TRIGGER` | `2` | path mistakes that summon it early |
| `NAGA_CATCH_Z` | `1.7` | z at which it strikes |
| `NAGA_CLOSE_RATE` | `0.8` | m/s it gains while chasing |
| `NAGA_DODGE_PUSH` | `1.8` | metres pushed back per clean dodge |
| `NAGA_RECOIL_Z` | `9.0` | where it retreats after a strike |

### Scoring
| Key | Value |
|---|---|
| `OM_GLYPH_PUNYA` | `10` |
| `RUDRAKSHA_PUNYA_MULT` | `3` (adds +2 to combo, capped at 6) |
| `SHAKTI_PER_OM` | `3` |
| `SHAKTI_PER_BEAD` | `12` |

> **Power pickups grant ZERO shakti — by design.** See §18.

### Difficulty stages
```js
STAGES: [
  { at: 0,    name: 'THE FOREST PATH',     gap: 18.0, dual: 0.0,  pressure: 1.0,  orbEvery: 80 },
  { at: 500,  name: "THE SERPENT'S COILS", gap: 15.5, dual: 0.18, pressure: 0.85, orbEvery: 68 },
  { at: 1000, name: 'THE BURNING GHATS',   gap: 13.5, dual: 0.30, pressure: 0.72, orbEvery: 58 },
  { at: 1500, name: "KAILASH'S SHADOW",    gap: 12.0, dual: 0.42, pressure: 0.62, orbEvery: 50 },
]
```
- `at` — metre the stage begins (also used as the stage identity key).
- `gap` — base metres between obstacle spawns.
- `dual` — probability of a second obstacle in a different lane at the same depth.
- `pressure` — multiplier on forced-hazard intervals (lower = more frequent).
- `orbEvery` — metres between power pickups.

**Values NOT in CONFIG** (hardcoded where used, worth knowing):

| Value | Where | Meaning |
|---|---|---|
| `1.5` | CollisionSystem | stumble i-frame seconds after a Zone 2 hit |
| `5.5` | PowerSystem | Vishnu shield duration |
| `12.0` | ScoreSystem | combo decay timer (seconds) |
| `6` | ScoreSystem | combo cap |
| `8.5` | SpawnSystem | metres between collectible lines |
| `50` | Collision/Power | punya per hazard destroyed (× combo) |
| `250 / 350` | NagaChaser | naga escape bonus by dodge / by power |
| `150 × stage` | SpawnSystem | stage crossing bonus (eternal: `200 × mult`) |
| `1000` | Game.js | metres between eternal multiplier deepenings |
| `-18.0` | Player | downward slam velocity when sliding in mid-air |

---

## 7. THE GAME STATE OBJECT

`src/core/GameState.js` exports a single mutable `state`. Every system imports it. Accessible in the browser console as `window.__getGameState()`.

```js
export const state = {
  phase: 'splash',      // 'splash'|'playing'|'paused'|'ascension'|'gameOver'|'victory'
  punya: 0,             // score
  shakti: 40,           // ⚠️ module default; __startGame() resets it to 0
  maxShakti: 100,
  eternal: false,       // walking past Kailash?
  eternalMult: 1,       // punya multiplier in eternal mode
  nextMultDist: 3000,   // next deepening threshold
  distance: 0,          // metres
  lives: 3,
  lane: 1,              // 0|1|2
  playerX: 0,           // eased actual X
  targetX: 0,           // lane target X
  playerY: 0,           // feet height
  playerVY: 0,          // vertical velocity
  groundY: 0,           // surface currently falling toward (0 or a boulder top)
  standingOn: null,     // the boulder object being ridden, or null
  isGrounded: true,
  canDoubleJump: true,
  isSliding: false,
  slideTimer: 0,
  heldPower: null,      // 'sudarshan_chakra'|'trishul'|'vishnu_shield'|null  → E
  lastPowerUsed: null,  // what the last E or C actually fired (for tests/HUD)
  shieldTimer: 0,
  speed: 16.0,          // ⚠️ module default; __startGame() resets it to 0
  combo: 1,
  comboTimer: 0,
  pathMistakes: 0,      // Zone-2 hits since last chase
  chase: {
    active: false,
    survived: 0,        // hazards cleanly passed this chase
    nextDist: 280,
    nagaZ: 20.0,        // current z
    nagaTargetZ: 20.0,  // eased-toward z
  },
  powerCycleIndex: 0,   // rotates chakra→trishul→shield
  highScore: 0,
  bestDistance: 0,
  stumbleTimer: 0,      // i-frames
};
```

> **⚠️ Trap:** the literals `shakti: 40` and `speed: 16.0` are *module-load defaults only*. `window.__startGame()` sets `shakti = 0` and `speed = 0`. Never quote the literals as the in-game starting values.

**Also registered globally:**
```js
window.__gameEntities = { player, obstacles[], collectibles[],
                          registerObstacle(o), registerCollectible(o) };
window.__game = { CONFIG, state, factories: {...} };
```

---

## 8. PUBLIC API — EVERY EXPORTED FUNCTION

### core/CameraRig.js
```js
initCameraRig(cam)            // store the camera reference
shakeCamera(strength = 1)     // impulse; decays automatically
updateCamera(dt)              // call with REAL frame time, not sub-step dt
getShake()
```

### core/InputHandler.js
```js
togglePause()
initInput()                   // installs keydown/keyup/touch listeners
```

### core/GameState.js
```js
state                         // the shared object
```

### entities/Player.js
```js
createPlayer(scene, gameClock)
getPlayer()                   // → THREE.Group (the root)
getPlayerParts()              // → the bone map (see §12)
resetPlayerTrail()
setShieldVisible(visible)
makePlayer()                  // pure builder
switchLane(delta)             // -1 | +1
doJump()
doSlide()
updatePlayer(dt)
```

### entities/WarriorBody.js
```js
buildWarrior()  // → { root, bones, landmarks:{hip,shoulder,head}, flashMaterials }
```

### entities/Obstacles.js
```js
createObstaclePool(scene)     // builds 21 obstacles (7 types × 3)
getObstaclePool()             // → array
updateBoulder(obs, dt, speed)
updateFirePit(obs, clock)
makeTempleArch() makeFirePit() makeBoulder() makeBrokenRoad()
OBSTACLE_POOL_SIZE
```

### entities/AsuraDemon.js
```js
updateAsura(obs, dt, scrollDelta, clock)
asuraDeathBurst(obs, spawnFX)
makeAsuraDemon()
```

### entities/CobraSnake.js
```js
updateCobra(obs, scrollDelta, clock, distance)   // `distance` = z distance to player, drives hood flare
makeCobra()
```

### entities/EvilSoul.js
```js
updateEvilSoul(obs, scrollDelta, clock)
makeEvilSoul()
```

### entities/NagaChaser.js
```js
createNaga(scene, gameClock)
getNaga()  hideNaga()
triggerNagaChase(reason)      // reason 'mistakes' starts it further back
resolveNagaChase(escapedByPower = false)
registerPathMistake()         // called by CollisionSystem on every Zone 2 hit
nagaStrike()
updateNaga(dt)
makeRivalNaga()
```

### entities/Collectibles.js
```js
updateOmGlyph(om, dt)
updateRudraksha(bead, dt, elapsed)
updatePowerPickup(pickup, dt, elapsed)
makeOmGlyph() makeRudrakshaBead()
makeChakraPickup() makeTrishulPickup() makeShieldPickup()
```

### systems/CollisionSystem.js
```js
resolveObstacleCollision(obs, oType)   // → 'end' | 'skip' | 'none'
```

### systems/SpawnSystem.js
```js
initSpawnSystem(scene, gameClock)
spawnObstacleAt(z, excludeLane = null) // → lane index used, or undefined
spawnCollectibleAt(z)
POWER_CYCLE = ['sudarshan_chakra','trishul','vishnu_shield']
updateSpawning()
updateObstacles(dt, scrollDelta)       // scroll + animate + collide + despawn
updateCollectibles(dt, scrollDelta)
resetSpawns()
```

### systems/PowerSystem.js
```js
initPowerSystem(scene)
getProjectilePool()
useHeldPower()        // ← E key
unleashUltimate()     // ← C key
launchProjectile(type, laneX, startY)
collectPowerOrb(orb)
updateProjectiles(dt)
resetProjectiles()
makeTrishulProjectile()
```

### systems/ScoreSystem.js
```js
addDistancePunya(scrollDelta)
updateCombo(dt)
collectOm(om)
collectRudraksha(r)
loadBest()  saveBest()
endRun(isVictory)     // sets phase, saves record, shows overlay
```

### systems/FXSystem.js
```js
initFX(scene)
spawnFX(pos, colorHex, count = 8, speedMult = 1.0)
updateFX(dt)
```

### systems/AudioSystem.js
```js
playSound(type)   // 'jump'|'om'|'rudraksha'|'power'|'blast'|'hiss'
```

### environment/Lighting.js
```js
LIGHTING  SKY_TOP_COLOR  SKY_HORIZON_COLOR  BACKGROUND_COLOR
FOG_COLOR  FOG_DENSITY
setStageMood(index)          // 0..4, lerps the moon colour
setupLighting(scene, renderer)
makeRadialGlowTexture(inner, mid, outer)   // → CanvasTexture | null (headless)
createWarmLights(scene)      // the fixed pool of 4
syncWarmLights(emitters)     // park them on nearest flames each frame
updateLighting(dt)
getFlickerTime()  getMoonLight()
enableShadows(root, { cast, receive })
```

### environment/Track.js
```js
createTrack(scene)  updateTrack(scrollDelta)
makeGroundSegment() makeInscription() makeInscriptionTexture()
GROUND_SEGMENTS = 7  SEGMENT_DEPTH = 12.0  INSCRIPTION_TEXT = 'श्रावणरत्मा'
```

### environment/Environment.js
```js
createEnvironment(scene)  updateEnvironment(scrollDelta, dt = 0)
makeMountKailash() makeSkyDome() makeTemplePillar() makeTree()
makeVineCurtain() makeTorchBrazier() makeStonePedestal()
```

### ui/HUD.js
```js
OVERLAY_FADE_MS = 320
fadeOverlay(el, visible, display = 'flex')
createUIRoot()  initHUD(root)  initPauseOverlay(root)
updateHUD(punya, distance, shakti, power, combo, lives, eternal = false, eternalMult = 1)
showBanner(text, duration = 2.5)
showPause(visible)
```

### ui/GameOver.js
```js
initGameOverScreens(root)
showAscension(punya)  hideAscension()  hideEndScreens()
showGameOver(score, isVictory = false, best = null)
```

### ui/StartScreen.js
```js
initStartScreen(root)  showSplash()
```

### utils/AnimationHelper.js
```js
swing(angle, amp)          // sin(a)*amp
swingOpposed(angle, amp)   // -sin(a)*amp
swingForward(angle, amp)   // max(0, sin(a)*amp)
swingBack(angle, amp)      // max(0, -sin(a)*amp)
bounce(angle, amp)         // abs(sin(a))*amp
```

### utils/MeshMerge.js
```js
mergeRigidWithin(pivots)   // merge children per pivot, per material
mergeStatic(root)          // collapse a whole static prop
```
> Opt a mesh out of merging with `mesh.userData.noMerge = true` (used by animated flames).

### utils/SdfKit.js
See §11 for the full toolkit.

---

## 9. GLOBAL DEBUG HOOKS

Available in the browser console at runtime. The headless tests drive the game through these.

```js
window.__getGameState()      // the live state object
window.__game.CONFIG         // tuning constants
window.__game.state          // same state
window.__game.factories      // every makeXxx builder
window.__gameEntities        // { player, obstacles[], collectibles[] }

window.__startGame()         // start / restart a run (resets everything)
window.__togglePause()
window.__inputLaneChange(-1) // or +1
window.__inputJump()
window.__inputSlide()
window.__triggerPower()      // = E
window.__triggerUltimate()   // = C
window.__ascendAtKailash()   // choose Ascend at the gates
window.__walkEternalPath()   // choose the Eternal Path
```

**Useful console one-liners:**
```js
// jump straight to the last stage
__getGameState().distance = 1500;

// give yourself a full ultimate
__getGameState().shakti = 100;

// hand yourself the trishul
__getGameState().heldPower = 'trishul';

// test the Kailash choice immediately
__getGameState().distance = 1999;

// infinite lives for debugging
setInterval(() => __getGameState().lives = 3, 100);
```

---
---

# PART C — THE CHARACTER

## 10. CHARACTER SPECIFICATION (FULL SCULPT SPEC)

**File:** `src/entities/WarriorBody.js` (379 lines). Entry point `buildWarrior()`.

The character is **not** made of boxes and cylinders. It is a **signed-distance-field sculpt** polygonised by marching cubes into one seamless skinned mesh.

### Pipeline

```
bodyOps()  →  ~45 blended SDF primitives
                ↓  bakeMesh(ops, box, resolution)
           MarchingCubes (isolation=0, field = −distance)
                ↓  calibrated affine remap + mergeVertices weld
           one seamless BufferGeometry
                ↓  computeSkinAttributes(geo, boneSegs, adjacencyPairs, band)
           skinIndex / skinWeight attributes
                ↓  bakeVertexColors(geo, sdf, { floor, albedo })
           baked AO + painted albedo in vertex colours
                ↓  new THREE.SkinnedMesh(geo, mat) + bind(skeleton)
           the devotee
```

### Measured landmarks (world units, standing at origin)

| Landmark | Y | Notes |
|---|---|---|
| soles | `0` | ground contact |
| toes | `0.040` | |
| heel | `0.070` | projects back at `z = -0.085` |
| `ANKLE` | `0.113` | bone |
| calf peak | `0.455` | |
| `KNEE` | `0.599` | bone |
| quadriceps | `0.86` | |
| `HIP` | `1.05` | **root bone / torso pivot** |
| pelvis | `1.08` | |
| abdominal plate | `1.34` | |
| ribcage barrel | `1.55` | |
| pectorals | `1.615` | |
| upper chest | `1.655` | |
| deltoid / trapezius | `1.692` / `1.772` | |
| `SHOULDER` | `1.715` | bone |
| `HEAD_BONE` | `1.86` | bone |
| jaw | `1.888` | |
| skull centre | `1.972` | |
| brow ridge | `2.006` | |
| crown | `~2.07` | total height ≈ 2.07 |

### Arm chain constants

```js
const SHO     = [0.232, 1.715, -0.008];   // shoulder (right side; left mirrors -x)
const ARM_DIR = [0.208, -0.978, 0];       // ~12° natural abduction baked in
const ELB     = [SHO[0] + ARM_DIR[0]*0.42, SHO[1] + ARM_DIR[1]*0.42, SHO[2]];
const WRI     = [ELB[0] + 0.022, ELB[1] - 0.356, ELB[2] + 0.018];
const LEG_X   = 0.100;                    // leg centreline offset from midline
```

### The body sculpt — every primitive

`O(prim, k)` = additive with smooth-min blend radius `k`. Mirrored for `s = -1, +1`.

**Torso core**
| Part | Primitive | Blend |
|---|---|---|
| pelvis | `blob(0, 1.08, 0, 0.150, 0.130, 0.105)` | 0.05 |
| abdominal column | `tube(0,1.10,0 → 0,1.42,0.012, r 0.118→0.128)` | 0.06 |
| ribcage barrel | `tube(∓0.07, 1.55, 0.008, r 0.150)` | 0.07 |
| upper chest | `tube(∓0.09, 1.655, 0, r 0.115)` | 0.06 |
| abdominal plate | `blob(0, 1.34, 0.078, 0.088, 0.105, 0.045)` | 0.05 |

**The back** (mirrored — this is what the camera sees, so it gets the budget)
| Part | Primitive | Blend |
|---|---|---|
| trapezius | `tube(s·0.035,1.772,-0.02 → s·0.195,1.692,-0.03, r 0.052)` | 0.045 |
| deltoid | `orb(s·0.264, 1.692, -0.005, 0.094)` | 0.04 |
| latissimus | `tube(s·0.185,1.60,-0.055 → s·0.110,1.30,-0.035, r 0.063→0.054)` | 0.05 |
| pectoral | `blob(s·0.088, 1.615, 0.095, 0.088, 0.066, 0.048)` | 0.04 |
| glute | `orb(s·0.078, 1.015, -0.058, 0.070)` | 0.05 |
| erector ridge | `tube(s·0.038,1.18,-0.105 → s·0.042,1.56,-0.112, r 0.026)` | 0.04 |
| **spine groove** | `cut(tube(0,1.16,-0.158 → 0,1.70,-0.188, r 0.028))` | 0.05 |

**Neck + head**
| Part | Primitive | Blend |
|---|---|---|
| neck | `tube(0,1.72,0 → 0,1.885,0.01, r 0.056→0.064)` | 0.04 |
| skull | `blob(0, 1.972, 0.008, 0.098, 0.118, 0.104)` | 0.03 |
| jaw | `blob(0, 1.888, 0.040, 0.073, 0.056, 0.078)` | 0.03 |
| nose | `blob(0, 1.960, 0.108, 0.020, 0.017, 0.022)` | 0.02 |
| brow ridge | `tube(∓0.045, 2.006, 0.092, r 0.015)` | 0.02 |

**Arms** (per side)
| Part | Primitive | Blend |
|---|---|---|
| upper arm | `tube(S → E, r 0.079→0.061)` | 0.045 |
| bicep | `orb(S.x + s·0.035, S.y−0.165, S.z+0.022, 0.070)` | 0.04 |
| elbow | `orb(E, 0.058)` | 0.03 |
| forearm | `tube(E → W, r 0.065→0.041)` (flexor-heavy taper) | 0.04 |
| fist | `blob(W.x, W.y−0.048, W.z+0.014, 0.058, 0.068, 0.063)` | 0.03 |

**Legs + feet** (per side, `H=hip K=knee A=ankle`)
| Part | Primitive | Blend |
|---|---|---|
| thigh | `tube(H → K, r 0.112→0.080)` | 0.05 |
| quadriceps | `blob(s·0.100, 0.86, 0.064, 0.068, 0.105, 0.056)` | 0.05 |
| knee | `orb(K, 0.070)` | 0.035 |
| shin | `tube(K → A, r 0.070→0.044)` | 0.04 |
| calf | `blob(s·0.104, 0.455, -0.056, 0.060, 0.092, 0.058)` | 0.04 |
| ankle | `orb(A, 0.047)` | 0.03 |
| **heel** | `blob(s·0.100, 0.070, -0.085, 0.056, 0.060, 0.062)` | 0.03 |
| **instep** | `blob(s·0.100, 0.064, 0.055, 0.064, 0.058, 0.110)` | 0.035 |
| **forefoot** | `blob(s·0.100, 0.052, 0.160, 0.072, 0.048, 0.070)` | 0.03 |
| **toes ×3** | `blob(s·0.100 + tx, 0.040, 0.218, 0.023, 0.021, 0.030)` for `tx ∈ {-0.034, 0, 0.034}` | 0.02 |

### The dhoti (separate SDF bake)

```js
hip wrap          blob(0, 1.09, 0.004, 0.186, 0.158, 0.162)            k 0.06
leg skirt   (×2)  tube(s·0.100,1.02,0.006 → s·0.108,0.635,0.014, r 0.130→0.148)  k 0.06
front fold  (×2)  tube(s·0.075,1.00,0.145 → s·0.088,0.68,0.162, r 0.020→0.023)   k 0.03
side fold   (×2)  tube(s·0.163,0.98,0.055 → s·0.186,0.70,0.045, r 0.020→0.022)   k 0.03
front drape       tube(0,1.03,0.132 → 0,0.70,0.158, r 0.060→0.074)     k 0.05
back cascade      blob(0, 0.86, -0.128, 0.088, 0.165, 0.034)           k 0.05
waistline cut     cut(slabAbove(1.175))                                k 0.04
hem cut (TILTED)  cut({ dist(px,py){ return py - (0.655 - 0.30*px); } })  k 0.05
```
> The **tilted hem** — higher on the left leg, lower on the right — is what makes it read as a real wrapped dhoti rather than a skirt. Do not flatten it.
>
> The hip wrap is deliberately **one mass across the centre**. A centre gap makes the cloth read as shorts.

### Bake boxes and resolutions

```js
body  = bakeMesh(bodyOps(),  { min: [-0.48, -0.06, -0.30], max: [0.48, 2.16, 0.30] }, 104);
cloth = bakeMesh(clothOps(), { min: [-0.42,  0.50, -0.34], max: [0.42, 1.30, 0.34] },  88);
```
> Raising resolution costs bake time at boot (roughly cubic). 104 is the tested balance. If you raise it, re-time the boot.

### The skeleton — 12 bones

```js
buildSkeleton([
  { name: 'torso',     parent: null,        pos: [0, 1.05, 0] },
  { name: 'head',      parent: 'torso',     pos: [0, 1.86, 0.01] },
  { name: 'upperArmL', parent: 'torso',     pos: [-0.232, 1.715, -0.008] },
  { name: 'forearmL',  parent: 'upperArmL', pos: [-ELB.x, ELB.y, ELB.z] },
  { name: 'upperArmR', parent: 'torso',     pos: [ 0.232, 1.715, -0.008] },
  { name: 'forearmR',  parent: 'upperArmR', pos: [ ELB.x, ELB.y, ELB.z] },
  { name: 'thighL',    parent: null,        pos: [-0.100, 1.05, 0.004] },
  { name: 'shinL',     parent: 'thighL',    pos: [-0.100, 0.599, 0.010] },
  { name: 'footL',     parent: 'shinL',     pos: [-0.100, 0.113, -0.012] },
  { name: 'thighR',    parent: null,        pos: [ 0.100, 1.05, 0.004] },
  { name: 'shinR',     parent: 'thighR',    pos: [ 0.100, 0.599, 0.010] },
  { name: 'footR',     parent: 'shinR',     pos: [ 0.100, 0.113, -0.012] },
])
```
> **Note:** `thighL`/`thighR` have `parent: null` — they are siblings of the torso, not children. This is what lets the slide drop the hips and the legs together with independent control.

### Skinning — the anti-smearing design

Weighting is **not** generic nearest-bone. Each bone declares the *line segments its flesh lives along*, and blending is permitted **only between anatomically adjacent bone pairs**:

```js
bodySegs[torso] = { segs: [
  seg([0, 1.06, 0],       [0, 1.70, 0],        0.015),   // central column, +bias
  seg([-0.17, 1.18, -0.02], [-0.215, 1.66, -0.02], 0.012), // left side rail
  seg([ 0.17, 1.18, -0.02], [ 0.215, 1.66, -0.02], 0.012), // right side rail
]};
```
The **side rails with a bias** are THE fix for the smeared-shoulder failure: without them, lat vertices near a hanging arm got captured by the arm bone and the shoulders tore into fans when the arms swung.

Adjacency pairs (only these may blend):
```
torso↔head, torso↔upperArmL/R, upperArmL/R↔forearmL/R,
torso↔thighL/R, thighL↔thighR, thighL/R↔shinL/R, shinL/R↔footL/R
```
Blend band: **body 0.055**, **cloth 0.09** (wider so the skirt stretches between the legs instead of tearing).

Cloth is skinned only to `torso` + both thighs. Other bones get their segments parked at absurd coordinates (`[s*9, 0, 0]`, `[0, 99, 0]`) so they can never claim a cloth vertex.

### Materials

| Material | Colour | Roughness | Notes |
|---|---|---|---|
| skin | `0xba7847` | 0.55 | `metalness 0.02`, `vertexColors: true` (carries AO + dusty soles) |
| cloth (dhoti) | `0xe89417` | 0.85 | saffron, `vertexColors: true` |
| sash | `0xbb6a08` | 0.8 | |
| hair | `0x191113` | 0.55 | near-black |
| beads | `0x5e3317` | 0.7 | rudraksha brown |
| janeu | `0xefe6d2` | 0.5 | `emissive 0x2a2318 @ 0.6` — sacred thread glows faintly |
| tilak | `0xd42a12` | 0.5 | `emissive 0xd42a12 @ 0.5` — forehead mark |

### Signature kit (rigid accessories parented to bones)

- **Janeu (sacred thread)** — traced as a `TubeGeometry` along an ellipse, each point walked along the SDF gradient until it sits at clearance `0.015` above `min(body.sdf, cloth.sdf)`. It genuinely hugs the body instead of floating.
- **Rudraksha neck loops ×2**, **arm bead rings**, **wrist bead rings** — built via `beadRing(count, ringRadius, beadRadius, jitter)`.
- **Hair:** skull-conforming cap (sphere scaled `0.106 / 0.126 / 0.112`, `thetaLength 0.55π`, `rotation.x = -0.45`) + a two-tier topknot bun with a tie.
- **Dusty soles:** painted into vertex colours — `if (y < 0.065 && normalY < -0.2) multiplier = 0.58`.

### What `buildWarrior()` returns

```js
{
  root,          // THREE.Group named 'devotee-warrior'
  bones,         // { torso, head, upperArmL, forearmL, upperArmR, forearmR,
                 //   thighL, shinL, footL, thighR, shinR, footR }
  landmarks: { hip: 1.05, shoulder: 1.715, head: 1.86 },
  flashMaterials // materials that get tinted during the hit-flash
}
```

---

## 11. THE SDF TOOLKIT (`SdfKit.js`)

The reusable character engine. 397 lines, no dependencies beyond Three.js.

### Primitives
```js
orb(x, y, z, r)                             // sphere
blob(x, y, z, rx, ry, rz)                   // ellipsoid
tube(ax,ay,az, bx,by,bz, ra, rb)            // capped cone / capsule between two points
slabAbove(y0)                                // half-space y > y0
slabBelow(y0)                                // half-space y < y0
add(prim, k = 0.04)                          // union with smooth-min radius k
cut(prim, k = 0.04)                          // smooth subtraction
```
Custom primitives just need `{ aabb: [minx,miny,minz,maxx,maxy,maxz], dist(px,py,pz) }`.

### Baking
```js
bakeMesh(ops, box, res, opts)  // → { geometry, sdf }
```
- Evaluates the op list into a `MarchingCubes` field (`isolation = 0`, field value = `−distance`).
- Handles the **axis-permutation calibration**: probes with a box of deliberately distinct half-extents to detect how MarchingCubes maps its internal axes, then applies the correct affine remap. Without this, models come out transposed.
- Welds with `mergeVertices`, recomputes normals.
- Returns the geometry **and** the `sdf(x,y,z)` closure, so other code (janeu tracing, AO) can query the field afterward.

```js
computeSkinAttributes(geometry, boneSegments, adjacency, band = 0.05)
```
- For each vertex: find the nearest bone segment (minus its `bias`), then look for a *second* bone that is (a) within `band` distance and (b) in the adjacency list. Weight the two by relative distance.
- Writes `skinIndex` / `skinWeight` attributes.

```js
bakeVertexColors(geometry, sdf, { floor, albedo })
```
- Samples the SDF around each vertex normal for ambient occlusion, clamped to `floor`.
- `albedo(x, y, z, nx, ny, nz)` callback returns a multiplier — this is how war paint and dusty soles are painted.

```js
buildSkeleton(defs)      // → { root, list, byName, skeleton }
beadRing(beadCount, ringRadius, beadRadius, jitter = 0.2)  // → merged BufferGeometry
```

### Reusing this for a new character
1. Write a `xxxOps()` function returning `add()`/`cut()` primitives.
2. `bakeMesh(ops, box, res)`.
3. Define bones with `buildSkeleton()`.
4. Map flesh segments + adjacency, call `computeSkinAttributes`.
5. `bakeVertexColors` for AO/paint.
6. `new THREE.SkinnedMesh(geo, mat)`, `.add(skeleton.root)`, `.bind(skeleton.skeleton)`.

Both the devotee and the Asura demon were built this way.

---

## 12. PLAYER ANIMATION SYSTEM

**File:** `src/entities/Player.js`

### The rig contract

`player.userData.parts` maps animation names → bones. **Every entry except `dust` is a `THREE.Bone`.** Because bones are `Object3D`s, animation code that once rotated rigid group pivots drives a continuous skinned mesh unchanged.

| `parts` key | bone name |
|---|---|
| `torso` | `torso` |
| `head` | `head` |
| `leftUpperArm` | `upperArmL` |
| `leftLowerArm` | `forearmL` |
| `rightUpperArm` | `upperArmR` |
| `rightLowerArm` | `forearmR` |
| `leftUpperLeg` | `thighL` |
| `leftLowerLeg` | `shinL` |
| `leftFoot` | `footL` |
| `rightUpperLeg` | `thighR` |
| `rightLowerLeg` | `shinR` |
| `rightFoot` | `footR` |
| `dust` | particle group (not a bone) |

Local constants: `HIP_Y = 1.05`, `HEAD_Y = 1.86`.

### `animateRun(time, dt)`

```js
stridePhase += dt * (5.5 + state.speed * 0.55);   // cadence couples to speed
const t = stridePhase;

leftUpperLeg.rotation.x  = -0.18 + swing(t, 0.75);           // forward-biased hip drive
rightUpperLeg.rotation.x = -0.18 + swing(t + Math.PI, 0.75);
leftLowerLeg.rotation.x  = swingForward(t + 0.55, 0.9);      // shin lags thigh by 0.55 rad
leftFoot.rotation.x      = 0.18 + swing(t + 0.9, 0.4);       // toe-down bias
leftUpperArm.rotation.z  = ∓0.06 outward sway
leftLowerArm.rotation.x  = -0.7 - swingForward(t + π + 0.6, 0.5);
torso.rotation.y         = swing(t, 0.14);                   // counter-rotation
torso.rotation.x         = 0.10 + state.speed * 0.004 + bounce(t, 0.025);
torso.position.y         = HIP_Y + bounce(t, 0.045);
```
Dust puffs emit at each stride zero-crossing (a footplant).

### `animateJump()`
Hero spread pose eased with `approach()`:
- upper arms `rotation.x ≈ -0.55`, `rotation.z = ∓0.7` (arms out and **up**, never behind the torso — the chase camera would lose them)
- lead knee drive `-0.85`, trailing `0.35`

### `animateSlide()`
- `torso.rotation.x = -0.45`, arms out `z = ∓0.55`
- **`parts.torso.position.y = HIP_Y;`** ← ABSOLUTE WRITE, not eased. See §28 gotcha #3.

### Slide hip drop (in `updatePlayer`)
```js
const targetDrop = state.isSliding ? 0.34 : 0;
slideDrop = approach(slideDrop, targetDrop, 14, dt);
...
parts.torso.position.y        -= slideDrop;
parts.leftUpperLeg.position.y  = HIP_Y - slideDrop;
parts.rightUpperLeg.position.y = HIP_Y - slideDrop;
```
> **Never use `scale.y` to squash for a slide.** It made the character paper-thin. The drop is a real pose.

### `updatePlayer(dt)` order of operations
1. Release boulder support if it slid away (`state.standingOn` check → restore `groundY = 0`, drop the player).
2. Decrement `stumbleTimer`; run hit flash.
3. Lane easing: `playerX = lerp(playerX, targetX, LANE_SWITCH_SPEED * dt)`.
4. Gravity: `playerVY += GRAVITY * dt; playerY += playerVY * dt;` — landing scales camera shake by impact.
5. Slide timer countdown.
6. Shield timer / visibility.
7. Choose and run the animation (`run` / `jump` / `slide`).
8. Apply the slide hip drop.
9. Dust + ghost trail.

### Other player features
- **Ghost trail:** 3 ghosts, sampled every 4 frames, opacities `[0.15, 0.09, 0.045]`, fully on at 85% of max speed.
- **Dust:** 8 pooled particles at the feet.
- **Shield:** teal sphere `radius 1.25`, opacity 0.45, emissive, spins on Y while `shieldTimer > 0`.

---

## 13. THE ASURA DEMON

**File:** `src/entities/AsuraDemon.js` (334 lines). Same SDF pipeline as the hero.

- **Bones:** `torso, head, armL, armR, forearmL, forearmR, legL, legR, shinL, shinR` — `updateAsura` finds them with `getObjectByName`.
- **Albedo painting:** maroon hide base; red war-paint stripes via `sin()` bands; darker loincloth region; mane.
- **Accessories** merged per bone and per material — **36 meshes → 11**.
- **Spiked club** attached to `forearmR`.
- **Pooling:** one template is built, then `SkeletonUtils.clone()` produces the pool instances (they share geometry).
- **Behaviour:** charges the player at `scrollDelta + 6 u/s`; stomping gait pumps arms and legs on sines; club swings.
- **Death:** `asuraDeathBurst(obs, spawnFX)` fires a three-colour ember burst.

---
---

# PART D — GAMEPLAY SYSTEMS

## 14. GAME LOOP & FRAME TIMING

**File:** `src/core/Game.js`

```js
const MAX_SUB_STEP = 1 / 30;        // longest single physics step
const MAX_CATCH_UP_STEPS = 4;       // max sub-steps per frame

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let frameTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  const maxFrame = MAX_SUB_STEP * MAX_CATCH_UP_STEPS;   // 0.1333 s
  if (frameTime > maxFrame) frameTime = maxFrame;       // discard, don't spiral

  const steps = Math.max(1, Math.ceil(frameTime / MAX_SUB_STEP));
  const dt = frameTime / steps;                          // SUBDIVIDE, don't truncate
  for (let i = 0; i < steps; i++) {
    if (state.phase === 'playing') updateSimulation(dt);
    updateFX(dt);
    updateLighting(dt);
  }
  updateCamera(frameTime);        // ← REAL frame time, outside the loop
  renderer.render(scene, camera);
}
```

**Why `performance.now()` and not the THREE clock:** animation code calls `clock.getElapsedTime()` mid-frame, which would corrupt `clock.getDelta()`.

**Why not a fixed 60 Hz accumulator:** on 144 Hz only ~42% of frames moved the world, in a 2-2-3 cadence — permanent micro-stutter.

**Tunnelling safety:** at max speed 22 u/s, one 1/30 s sub-step moves 0.73 units. The smallest collision window is ≥1.6 units. Safe.

### `updateSimulation(dt)` — exact order

```
1. speed ease + scrollDelta + distance accumulate
2. updateCombo(dt)
3. addDistancePunya(scrollDelta)
4. Kailash check → phase='ascension', showAscension(), RETURN
5. eternal deepening check (every 1000 m → eternalMult++)
6. Naga scheduled-chase check
7. updatePlayer(dt)
8. updateTrack(scrollDelta)
9. updateEnvironment(scrollDelta, dt)
10. updateSpawning()
11. updateObstacles(dt, scrollDelta)     ← collisions happen here; may end the run
    if (phase !== 'playing') return
12. updateCollectibles(dt, scrollDelta)
13. updateProjectiles(dt)
14. updateNaga(dt)                        ← may end the run
    if (phase !== 'playing') return
15. updateHUD(punya, distance, shakti, heldPower, combo, lives, eternal, eternalMult)
```

---

## 15. COLLISION SYSTEM

**File:** `src/systems/CollisionSystem.js`. Single export: `resolveObstacleCollision(obs, oType)` → `'end' | 'skip' | 'none'`.

### Step 1 — proximity test (per-shape thresholds)

```js
let hitZ = 0.95, hitX = 0.95;                              // default
if (oType === 'brokenRoad') { hitZ = 1.6;  hitX = 1.1;  }
else if (oType === 'evilSoul') { hitZ = 0.8;  hitX = 0.8;  }
else if (oType === 'boulder')  { hitZ = 1.05; hitX = 1.05; }
if (dx < hitX && dz < hitZ) { ... }
```

### Step 2 — stand-on-boulder (before the vertical gate)

```js
const standHeight = obs.userData.standHeight || 1.5;
if (oType === 'boulder' && state.playerY >= standHeight - 0.35 && state.playerVY <= 0) {
  state.playerY = standHeight; state.playerVY = 0;
  state.isGrounded = true; state.canDoubleJump = true;
  state.groundY = standHeight; state.standingOn = obs;
  return 'skip';
}
```

### Step 3 — the vertical gate ★

```js
const HAZARD_SPAN = {
  firePit:    [0,    0.35],
  boulder:    [0.15, 1.55],
  archGate:   [1.6,  2.6],
  brokenRoad: [-2.0, 0.5],
  evilSoul:   [1.2,  2.0],
  cobra:      [0,    1.35],
  asura:      [0,    1.75],
};
const DEFAULT_SPAN = [0, 1.6];

function playerBand() {
  const bottom = state.playerY;
  const height = state.isSliding ? 1.15 : (state.isGrounded ? 2.0 : 1.6);
  return [bottom, bottom + height];
}

const [pBottom, pTop] = playerBand();
if (pBottom >= span[1] || pTop <= span[0]) return 'none';   // vertically clear
```
> **Player band heights:** grounded 2.0 · airborne **1.6** (legs tuck) · sliding **1.15**.
> The airborne tuck is what makes jumps physically honest.

### Step 4 — mitigations, then damage

```
shieldTimer > 0   → destroy the obstacle, +50×combo punya, FX, return 'skip'
stumbleTimer > 0  → return 'skip' (i-frames)
zone === 2 && lives > 1 → lives--, stumbleTimer = 1.5, hide obstacle,
                          shakeCamera(1.8), registerPathMistake()
otherwise         → lives = 0, shakeCamera(2.6), endRun(false), return 'end'
```

---

## 16. ALL OBSTACLES — FULL SPECS

Seven types, 3 instances each = **21 pooled objects**, built once at boot in `createObstaclePool(scene)`.

| Type | Zone | Span | File | Key details |
|---|---|---|---|---|
| `firePit` | **1** (instant death) | `[0, 0.35]` | Obstacles.js | stone ring, log fire, 3 flame cones each with own sine phase (`sin(time*12 + phase)`); flames marked `noMerge`; borrows a pooled warm light |
| `boulder` | 2 | `[0.15, 1.55]` | Obstacles.js | `crackedShell()` drops every 17th and 23rd triangle for cracks; dark core spins `rotation.x += speed*dt`; moss; dust 25% of frames; `standHeight` ≈ 1.8 |
| `archGate` | 2 | `[1.6, 2.6]` | Obstacles.js | `JAMB_H = 1.35`, lintel underside at 1.55, Sanskrit relief bars, vines. **Slide only — jumping cannot fit.** |
| `brokenRoad` | 2 | `[-2.0, 0.5]` | Obstacles.js | actually a raised slab `2.0 × 0.52 × 1.7`, gold warning edges, inscription decal. Jump it. |
| `asura` | 2 | `[0, 1.75]` | AsuraDemon.js | charges at `scroll + 6 u/s`; SDF body; club on `forearmR` |
| `evilSoul` | 2 | `[1.2, 2.0]` | EvilSoul.js | drifts `x = baseX + swing(t*1.5 + phase, LANE_WIDTH*0.5)`, bobs `y = 0.3 + swing(t*3.0, 0.3)`. **Slide under or jump over.** |
| `cobra` | 2 | `[0, 1.35]` | CobraSnake.js | 10 spine segments as **siblings** (a parent chain accumulated lean); wave `phase = t*2.4 − swayPhase`; hood flare `clamp((18 − dist)/12)` → `scale.x 1.2→1.95`, `scale.y 1.35→1.55` |

**The answer key:**
- **Jump:** firePit, boulder, brokenRoad, cobra, asura (near apex)
- **Slide:** archGate, evilSoul
- **Ride:** boulder (land on top, double jump re-arms)
- **Never slide into:** cobra, asura

---

## 17. COLLECTIBLES

**File:** `src/entities/Collectibles.js`. Geometries and materials are **shared module-level singletons** across every instance.

### Pools (created in `initSpawnSystem`)
| Pool | Count |
|---|---|
| Om glyphs | 18 |
| Rudraksha beads | 12 (two full arcs + slack) |
| Power pickups | 6 (2 each of chakra / trishul / shield) |

### Om Glyph
Gold disc (`CylinderGeometry 0.3 × 0.035`) standing on edge + bright torus rim + the **ॐ drawn to a 256×256 canvas** and applied to both faces (so it reads through the spin). Falls back to no glyph if canvas is unavailable (headless). Spins `rotation.y += dt * 3.5`.
**Grants:** `+10 × combo × eternalMult` punya, `+3` shakti.

### Rudraksha Bead
`bumpyBeadGeometry(0.2)` — a sphere whose vertices are pushed along their normals by `sin(atan2(z,x)*5)*0.055` (vertical furrows) plus `sin(x*41 + y*27 + z*33)*0.02` (grain) — inside a gold torus halo. Spins on Y and Z, bobs `baseY + swing(elapsed*3 + phase, 0.13)`.
**Grants:** `+75 × combo × eternalMult` punya, `+12` shakti, **combo → min(6, combo + 2)**, resets the 12 s combo timer.

**Bead arcs:** 3–5 beads, spacing 2.4. Two shapes, 50/50:
- **sweep** — curves from one lane to another using `curve = 0.5 − cos(t·π)·0.5`, height stays 1.1
- **jump arc** — same lane, height `1.1 + sin(t·π)·1.15` (peaks where a jumping player would be)

### Power pickups
| Pickup | Look | `userData.power` |
|---|---|---|
| Chakra | 3 counter-rotating gold rings + hub + 10 rim teeth | `sudarshan_chakra` |
| Trishul | upright trident, **cold blue-white** (never confused with gold at speed) | `trishul` |
| Shield | teal disc, tilted `rotation.x 0.34, z 0.12` so it never disappears edge-on | `vishnu_shield` |

All carry `userData.collectibleType = 'power'` and `baseY = 1.2`.
**Grants:** the power **in hand** (for `E`). **Zero shakti — deliberate.**

---

## 18. DIVINE POWER SYSTEM

**File:** `src/systems/PowerSystem.js`

### ⚠️ THE CORE DESIGN RULE — TWO SEPARATE SYSTEMS

These are **independent** and must never be merged. This was explicitly specified and re-specified.

| | **Channel 1 — Held Power** | **Channel 2 — Shakti Ultimate** |
|---|---|---|
| Key | **`E`** (also Shift) | **`C`** |
| Source | power pickups on the track | Om glyphs (+3) and beads (+12) **only** |
| What you get | exactly the power you picked up | **one of the three at random** |
| Cost | the item leaves your hand | the **entire** bar drains to 0 |
| Touches Shakti? | **NEVER** | yes, drains it fully |
| Touched by pickups? | yes, newest replaces old | **NEVER** — pickups grant 0 shakti |

### The three powers

| Power | Effect |
|---|---|
| `sudarshan_chakra` | one projectile down the player's current lane (`launchProjectile('chakra', state.playerX, 0.9)`) |
| `trishul` | three projectiles simultaneously at `x = -2.2, 0, +2.2`, startY 1.0 |
| `vishnu_shield` | `state.shieldTimer = 5.5`, shield sphere visible; absorbs one hazard and repels the Naga |

### The code

```js
const DIVINE_POWERS = ['sudarshan_chakra', 'trishul', 'vishnu_shield'];

function executePower(power) {            // shared by BOTH channels
  state.lastPowerUsed = power;
  playSound('power');
  /* ... banner + effect per power ... */
  if (state.chase.active) resolveNagaChase(true);   // ANY power escapes the Naga
}

export function useHeldPower() {          // ← E
  if (state.phase !== 'playing') return;
  if (!state.heldPower) { showBanner('NO DIVINE POWER IN HAND — GRAB AN ORB!', 1.2); return; }
  const power = state.heldPower;
  state.heldPower = null;                 // hand empties
  executePower(power);                    // shakti untouched
}

export function unleashUltimate() {       // ← C
  if (state.phase !== 'playing') return;
  if (state.shakti < state.maxShakti) {
    showBanner(`SHAKTI ${Math.floor(state.shakti)}/${state.maxShakti} — FILL THE BAR TO UNLEASH`, 1.2);
    return;                               // spends NOTHING when not full
  }
  state.shakti = 0;                       // full drain
  executePower(DIVINE_POWERS[Math.floor(Math.random() * DIVINE_POWERS.length)]);
}

export function collectPowerOrb(orb) {
  orb.visible = false;
  state.heldPower = orb.userData.power || 'sudarshan_chakra';   // in hand
  playSound('power'); spawnFX(orb.position, '#4de0c0', 20);
  showBanner(`${NAMES[state.heldPower]} IN HAND — PRESS E!`, 2.0);
  // NOTE: state.shakti is deliberately NOT touched here
}
```

### Projectiles
Own pre-built pool. Per frame: advance along `dir`, spin (`chakra 25 rad/s`, `trishul 12 rad/s`), and box-test every visible obstacle at `|dx| < 1.2 && |dz| < 1.4`. A hit → hide obstacle, `+50 × combo` punya, `playSound('blast')`, asura gets its death burst. Retire at `maxDist` (40 units).

### Power pickup rotation
`POWER_CYCLE = ['sudarshan_chakra', 'trishul', 'vishnu_shield']` advanced by `state.powerCycleIndex` so a run always sees all three; cadence from `stage.orbEvery`.

---

## 19. NAGA CHASE

**File:** `src/entities/NagaChaser.js`

### Triggers
- **Scheduled:** `state.distance >= state.chase.nextDist` (every `NAGA_CHASE_INTERVAL = 280` m).
- **Mistakes:** `registerPathMistake()` is called by CollisionSystem on every Zone 2 hit. At `NAGA_MISTAKE_TRIGGER = 2` it summons the chase with `reason = 'mistakes'`.

```js
triggerNagaChase(reason) {
  state.chase.active = true;
  state.chase.survived = 0;
  state.chase.nagaZ = 16.0;
  state.chase.nagaTargetZ = reason === 'mistakes' ? 9.0 : 7.0;  // mercy when already hurt
  state.pathMistakes = 0;
  rivalNaga.visible = true;
  playSound('hiss');
}
```

### Pursuit (per frame)
```js
if (state.chase.active) {
  state.chase.nagaTargetZ = Math.max(NAGA_CATCH_Z - 0.4,
                                     state.chase.nagaTargetZ - NAGA_CLOSE_RATE * dt);
}
state.chase.nagaZ = lerp(nagaZ, nagaTargetZ, dt * 4.0);
rivalNaga.position.set(state.playerX * 0.8, 0, state.chase.nagaZ);   // mirrors 80% of lane
rivalNaga.rotation.y = Math.PI + swing(elapsed * 6.0, 0.2);
if (state.chase.active && nagaZ <= NAGA_CATCH_Z) nagaStrike();
if (!state.chase.active && nagaZ > 22.0) rivalNaga.visible = false;
```

### Escapes
1. **Clean dodges** — each hazard passed pushes it back `NAGA_DODGE_PUSH = 1.8`; `survived >= 3` → `resolveNagaChase(false)`, **+250 × combo**.
2. **Any power (E or C)** → `resolveNagaChase(true)`, **+350 × combo**.
3. Stumbling mid-chase: `survived = 0`, naga gains 2.5 units.

### Strike (`nagaStrike()`)
```
stumbleTimer > 0  → ignored
shieldTimer > 0   → naga knocked to z 12, stumbleTimer = 0.8, banner
lives > 1         → lives--, stumbleTimer = 1.5, shakeCamera(2.0),
                    survived = 0, nagaZ = NAGA_RECOIL_Z (9.0)
otherwise         → lives = 0, endRun(false)
```

### Appearance
CatmullRom tube body (coils low then rears to 1.30), mint belly plates every 0.10 from y 0.55→1.25, flared hood (`CylinderGeometry(0.38, 0.14, 0.55)` scaled `1.4 × 1.0 × 0.35`), violet torus marking, triangular cranium, amber `MeshBasicMaterial` eyes, white fangs, forked crimson tongue. Colours: dorsal `#1b6354`, violet `#603075`, belly `#7ae0b8`, eyes `#ffcc00`.

---

## 20. SPAWN DIRECTOR & DIFFICULTY

**File:** `src/systems/SpawnSystem.js`

### `currentStage()`
Reads `CONFIG.STAGES` for the highest `at <= distance`. **Beyond Kailash in eternal mode** it synthesises leagues:

```js
const k = Math.floor((distance - 2000) / 500) + 1;   // league number
return {
  at: 2000 + (k - 1) * 500,
  name: `THE ETERNAL PATH · LEAGUE ${k}`,
  moodIndex: 4,
  gap:      Math.max(10.5, 12.0 - k * 0.25),
  dual:     Math.min(0.5,  0.42 + k * 0.02),
  pressure: Math.max(0.5,  0.62 - k * 0.02),
  orbEvery: Math.max(44,   50 - k),
  arcChance: 0.14,
  crossBonus: 200,
};
```
All curves approach floors asymptotically — always harder, never impossible.

### `updateSpawning()` (per frame)
```js
const stage = currentStage();

// stage transition: banner + mood + bonus
if (stage.at !== stageIdx) {
  stageIdx = stage.at;
  showBanner(`⛰️ ${numeral} · ${stage.name}`, 2.6);
  setStageMood(stage.moodIndex ?? tableIdx);
  if (!first) state.punya += (stage.crossBonus || 150 * max(1, tableIdx)) * state.eternalMult;
}

// obstacles
if (distance >= nextObstacleDist) {
  const usedLane = spawnObstacleAt(SPAWN_Z);
  if (usedLane != null && Math.random() < stage.dual) spawnObstacleAt(SPAWN_Z, usedLane);
  nextObstacleDist = distance + Math.max(10.0, stage.gap - (state.speed - BASE_SPEED) * 0.15);
}

// collectibles every 8.5 m
if (distance >= nextCollectibleDist) { spawnCollectibleAt(SPAWN_Z - 2); nextCollectibleDist = distance + 8.5; }

// power pickups
if (distance >= nextPowerOrbDist) { spawnPowerOrbAt(SPAWN_Z - 4); nextPowerOrbDist = distance + stage.orbEvery; }
```

### `spawnObstacleAt(z, excludeLane)` — type selection

**Distance gates** (what is allowed to appear yet):
```js
const eligibleTypes = ['firePit', 'archGate', 'boulder'];   // from 0 m
if (dist >= 150) eligibleTypes.push('evilSoul');
if (dist >= 200) eligibleTypes.push('asura');
if (dist >= 250) eligibleTypes.push('cobra');
if (dist >= 300) eligibleTypes.push('brokenRoad');
```

**Forced intervals** (checked in this order; `p = stage.pressure`):
```js
if (dist >= 200 && dist - lastAsuraDist      >= 140 * p) → 'asura'
else if (dist >= 300 && dist - lastBrokenRoadDist >= 250 * p) → 'brokenRoad'
else if (dist >= 150 && dist - lastEvilSoulDist   >= 150 * p) → 'evilSoul'
else if (dist >= 250 && dist - lastCobraDist      >= 180 * p) → 'cobra'
else → uniform random from eligibleTypes
```

**Lane choice:** random 0–2; if it equals `excludeLane`, rotate to a different one. This is what guarantees a paired spawn always leaves a clean third lane.

### `updateObstacles(dt, scrollDelta)`
Per visible obstacle: scroll `+= scrollDelta` → run its type-specific animator → `resolveObstacleCollision()` → handle the return (`'end'` stops the frame; `'skip'` skips despawn) → if `z > DESPAWN_Z` hide it. Clean passes during a chase increment `state.chase.survived` and push the Naga back.

---

## 21. SCORING ECONOMY

**File:** `src/systems/ScoreSystem.js`

| Source | Formula |
|---|---|
| Distance | `punya += scrollDelta * 0.5 * combo * eternalMult` |
| Om glyph | `+10 * combo * eternalMult`, `shakti += 3` |
| Rudraksha | `+75 * combo * eternalMult`, `shakti += 12`, `combo = min(6, combo + 2)`, `comboTimer = 12.0` |
| Hazard destroyed | `+50 * combo` (projectile hit or shield absorb) |
| Naga escape | `+250 * combo` (dodge) / `+350 * combo` (power) |
| Stage crossing | `+150 * stageIndex` (eternal: `+200 * eternalMult`) |

**Combo:** cap **6**, decays to 1 when `comboTimer` hits 0 (12 s from the last bead).

**Eternal multiplier:** ×2 at Kailash, +1 per further 1000 m.

**Persistence:**
```js
const BEST_KEY = 'naga-loka-runner:best';
// { punya: <int>, distance: <int> }
loadBest()  // at boot
saveBest()  // inside endRun, before the overlay reads the record
```
All storage access is wrapped in try/catch — sandboxed iframes block it and the game must still run.

**`endRun(isVictory)`** sets `phase`, computes `isNewBest`, saves, hides pause, shows the overlay, and for eternal runs rewrites the distance line to `Walked Beyond Kailash: <n>m · ×<mult> punya`.

---

## 22. CAMERA

**File:** `src/core/CameraRig.js`

| Constant | Value |
|---|---|
| `HEIGHT` | 3.4 |
| `DISTANCE` | 6.2 |
| `FOLLOW_X` | 10 (lerp rate) |
| `FOLLOW_Y` | 8 (lerp rate) |
| `LOOK_EASE` | 9 |
| `SHAKE_AMPLITUDE` | 0.02 |

- Follows **65%** of the player's lane offset (parallax).
- Height adds **35%** of jump altitude, eased at rate 8 (it used to snap — read as flinching).
- Look-target eases separately so lane changes sweep rather than cut.
- `shakeCamera(strength)` adds a decaying random offset; landing scales it by impact (`min(1, |playerVY| / 13)`, only if `> 0.25`).
- **`updateCamera(frameTime)` is called with REAL frame time, outside the sub-step loop** — this is what keeps it smooth at 144 Hz.

---

## 23. ENVIRONMENT, TRACK & LIGHTING

### Track (`Track.js`)
- **7 segments × 12 units deep**, wrapping: `if (z > SEGMENT_DEPTH) z -= GROUND_SEGMENTS * SEGMENT_DEPTH`.
- Each segment: dark under-floor (joints read as shadow) + 3×4 grid of beveled sandstone slabs (`gap 0.17`) + 2 glowing gold lane dividers at `x = ±1.1` with dim spill strips + mossy kerbs.
- Colours: sandstone `0xc4956a` / `0xcea277`, bevel `0xdcb389`, joint `0x4a3220`, kerb `0x8b7355`, moss `0x33452a`, gold `0xffc247` emissive `0xff9500 @ 1.35`.
- **6 Sanskrit inscriptions** (`श्रावणरत्मा`) on a 20-unit rhythm, canvas-drawn, with a carved-bar fallback for headless.
- Each segment is `mergeStatic()`-collapsed.

### Environment (`Environment.js`, 618 lines)
Builders: `makeMountKailash`, `makeSkyDome`, `makeTemplePillar`, `makeTree`, `makeVineCurtain`, `makeStonePedestal`, `makeTorchBrazier`.

- **Kailash:** `ConeGeometry(150, 195, 4)` rock body at y 78 + snow cap `ConeGeometry(116, 151, 4)` at y 101 (deliberately sized proud of the rock to stop z-fighting) + a 560-unit additive radial halo + 3 lesser ridges. **All `fog: false`** so it stays visible.
- **Sky dome:** custom `ShaderMaterial`, `BackSide`, `depthWrite: false`, `fog: false`. Fragment mixes `horizonColor → topColor` by `pow(max(h,0), 0.55)`.
- Curtains: `CURTAIN_COUNT = 4`. Everything scroll-and-wraps like the track.

### Lighting (`Lighting.js`)
```js
SKY_TOP_COLOR      = 0x0a0a1a
SKY_HORIZON_COLOR  = 0x1a0a2e
FOG_COLOR          = 0x0a0a2e
FOG_DENSITY        = 0.018        // FogExp2
MOON_COLOR         = 0xc8d8ff  @ 1.55  (the only shadow caster)
AMBIENT            = 0x0a0a2e  @ 0.55
HEMISPHERE         = sky 0x8fa8d8 / ground 0x3a2c1f @ 0.75
TORCH              = 0xff6600  @ 2, distance 8
```
- `setupLighting()` **removes every engine light first**, then installs the night rig and sets `scene.environmentIntensity = 0.2`.
- Shadow camera clamped to `left -16, right 16, top 20, bottom -16, near 1, far 78`, mapSize 1024, `bias -0.0012`, `normalBias 0.02`.
- **Warm light pool: exactly `WARM_LIGHT_COUNT = 4`.** `syncWarmLights(emitters)` filters emitters to `-34 < z < 10`, sorts by `|z|`, parks the 4 lights on the nearest, flickers them `(sin(elapsed*8 + phase) * 0.4 + 1.6) * lightBoost`, and sets **spares to intensity 0 rather than removing them**.
- **Stage moods** (`setStageMood(index)`), moon colour lerped at `dt * 1.2`:
  ```
  0 → 0xcfe0ff  forest, cold clear moonlight
  1 → 0xc2e6d6  serpent's coils, green-tinged
  2 → 0xe8cfae  burning ghats, ember-warmed
  3 → 0xe6ecff  kailash's shadow, pale summit
  4 → 0xd9c6ff  eternal path, otherworldly violet
  ```

---

## 24. UI / HUD

**File:** `src/ui/HUD.js` (406 lines). All DOM, built in code, no HTML templates.

### The four cards
| id / card | Content |
|---|---|
| Punya | `🕉️` merit total + combo badge (only shown above ×1) |
| Distance | `🏔️ To Mount Kailash` + progress bar; eternal mode → `2340m · ×3 PUNYA` |
| Lives | `♥♥♥` → `♥♥♡` → `♥♡♡`, colour shifts as they drain |
| Shakti | bar + **two truth lines**: `#hud-power-slot` (`ULTIMATE CHARGING n/100` or gold `🔥 READY — PRESS C`) and `#hud-held-power` (`🔱 TRISHUL IN HAND — PRESS E` or `NO POWER IN HAND`) |

`updateHUD(...)` caches the last displayed value per element and only writes `textContent` when a floored value actually changed.

### Banner
`showBanner(text, duration = 2.5)` — one reusable strip; a stored timeout clears it; a new banner pre-empts the old.

### Touch controls
Six buttons: `◀ ▶` lanes, `SLIDE`, `JUMP`, **`POWER (E)`**, **`ULT (C)`** — all call the same functions as the keyboard.

### Screens
- `StartScreen.js` — title + full controls tutorial (**including the C-key ultimate explanation**) → `window.__startGame()`.
- `GameOver.js` — `showGameOver(score, isVictory, best)`, `showAscension(punya)` / `hideAscension()`, `hideEndScreens()`. All use `fadeOverlay(el, visible)` with `OVERLAY_FADE_MS = 320`.

---

## 25. AUDIO

**File:** `src/systems/AudioSystem.js` — 71 lines, single export `playSound(type)`.

Lazy `AudioContext` on first cue (autoplay policy), resumed if suspended, entire body wrapped in try/catch.

| Cue | Wave | Envelope |
|---|---|---|
| `jump` | sine | 220 → 540 Hz over 0.18 s, gain 0.2 |
| `om` | triangle | C5 523.25 → E5 659.25 Hz, gain 0.25, 0.35 s |
| `rudraksha` | sine | 440 → 659.25 → 880 Hz stepped, gain 0.35, 0.45 s |
| `power` | sawtooth | 180 → 720 Hz, gain 0.3, 0.35 s |
| `blast` | square | 140 → 40 Hz, gain 0.35, 0.25 s |
| `hiss` | sawtooth | 800 → 300 Hz, gain 0.2, 0.4 s |

Design rule: **devotion rises, danger falls.**

---
---

# PART E — WORKING ON IT

## 26. TESTING

Suites live in `devtools/tests/` and boot the **real game** in headless Chrome via CDP.

| Suite | What it proves |
|---|---|
| `collisiontest.mjs` | 20-case fairness matrix: every hazard × run/jump/slide, land-on-boulder, lane isolation, wrong-move cases |
| `stagetest.mjs` | sweeps 400 m of each stage measuring real spawn gaps + dual rates vs the table; **the full two-system power contract** (15 unleashes → ≥2 distinct powers, bar exactly 0 every time), driven through real keyboard events |
| `eternaltest.mjs` | 17 checks: both gate choices, multiplier deepening, league banners, eternal death card, both restart paths |
| `runtest.mjs` | live play: boot → play → real slide via the input path → mid-slide numbers + recovery |
| `playertest.mjs` | rig integrity: parts contract + skinned-**vertex** deformation per bone |
| `preview.mjs` | renders hero or demon alone for art direction |

Run them with `node devtools/tests/<name>.mjs` (server must be running).

### ⚠️ Headless Chrome gotchas (learned the hard way)
- Use **`--headless`**, NOT `--headless=new` — in Chrome 152 the "new" mode opens **visible windows**.
- **NEVER run `taskkill /IM chrome.exe`** — it kills the user's real browser. (This happened twice. Don't.)
- SwiftShader runs game-time far slower than wall-time (dt clamping). **Poll `state.isSliding` etc.; never `sleep()` wall time.**
- Capture render + `toDataURL` + state sample in a **single `evaluate`** so they're atomic.
- `node --check` on a `.js` file misses ESM errors (e.g. duplicate exports) — copy to `.mjs` first.

---

## 27. PERFORMANCE RULES (DO NOT BREAK THESE)

| Metric | Budget |
|---|---|
| Allocations per frame | **0** |
| Pooled obstacles | 21 |
| Pooled FX sparks | 48 |
| Point lights | **exactly 4, forever** |
| Hero triangles | ~95 k, GPU-skinned |
| Meshes per demon | 11 |

### The four hard rules

1. **Never create geometry, materials or meshes during play.** Everything is pre-instantiated at boot and recycled with `visible = true/false`. Hot loops reuse module-level scratch `Vector3`s.

2. **Never change the number of lights.** Three.js bakes the point-light *count* into every shader's cache key. Adding or removing one forces a **full recompile of every material** — a hard freeze mid-run. That is why spares are dimmed to `intensity = 0` instead of being removed.

3. **Every material must exist before `warmUpPipeline()` runs.** A material that first renders mid-run compiles mid-run and freezes the frame for hundreds of ms. This is why the whole pool is built at boot even though it costs startup time.

4. **Merge static props.** `mergeStatic()` collapses a prop to one mesh per material. A temple pillar was 18 draw calls; a ground segment 31. Opt animated meshes out with `userData.noMerge = true`.

### Other levers already in place
- HUD writes are change-detected.
- Shadow camera clamped tightly to the visible causeway.
- Fog hides spawn (`z −62`) and recycle (`z +8`).
- Vertex-baked AO and painted albedo = surface richness at zero runtime cost.
- Camera eases on real frame time, outside the sub-step loop.

---

## 28. KNOWN GOTCHAS & HARD-WON LESSONS

**1. Rotations are radians.** A template once wrote degrees into `rotation` — a thigh value of `3.0` became 172°, legs inverted.

**2. Never `scale.y` a character to squash it.** The slide used `scale.y = 0.5` and the devotee looked paper-thin. Use a real pose (hip drop).

**3. `animateSlide` must write `torso.position.y` ABSOLUTELY, not ease toward it.**
```js
parts.torso.position.y = HIP_Y;      // ✅ absolute
// ❌ approach(parts.torso.position.y, HIP_Y, ...) — the slide drop is subtracted
//    from this value later in the frame, creating a feedback loop whose
//    equilibrium was ~1.8 units UNDERGROUND.
```

**4. `state.shakti = 40` and `state.speed = 16` in GameState.js are module defaults only.** `__startGame()` sets them to 0. Don't quote the literals.

**5. Never merge the E and C systems.** Power pickups must grant **0 shakti**. `E` must never reduce shakti. `C` must never consume the held power. This was specified explicitly, broken once, and re-specified. See §18.

**6. The arch gate's collision band starts at 1.6, above its visible 1.55 underside.** Deliberate — nobody should die below a beam they visually cleared. Keep all spans slightly *smaller* than the art.

**7. `thighL`/`thighR` are root bones (`parent: null`), not children of `torso`.** Changing that breaks the slide hip drop.

**8. Cobra segments are siblings, not a chain.** A parent chain accumulated the sway into a permanent lean.

**9. The camera must be updated with real frame time, outside the sub-step loop.** Inside it, the easing runs N times per frame at 144 Hz and the camera snaps.

**10. Bash heredocs mangle regex escapes** (`\b`, `\1` become literal 0x08/0x01 bytes). Use the Write tool for patch scripts, not heredocs.

**11. Everything canvas-related needs a headless fallback.** `getOmTexture()`, `makeInscriptionTexture()`, `makeRadialGlowTexture()` all return `null` gracefully; callers must handle it. Same for geometry attribute guards (`if (!pos || typeof pos.getX !== 'function') return geo;`).

**12. Git:** nothing is committed automatically. The user commits only when they explicitly ask. Last commit was `354b942 divine powers`.

---

## 29. RECIPES: HOW TO MAKE COMMON CHANGES

### Add a new obstacle type
1. Write `makeXxx()` in `src/entities/` (or `Obstacles.js` for simple props). Set:
   ```js
   group.userData.role = 'obstacle';
   group.userData.obstacleType = 'xxx';
   group.userData.zone = 2;              // 1 = instant death
   ```
2. Add its vertical band to `HAZARD_SPAN` in `CollisionSystem.js` — **required**, or it falls back to `[0, 1.6]`.
3. Add the builder to the pool table in `createObstaclePool()` (`Obstacles.js`) — 3 instances.
4. Add it to `eligibleTypes` (with a distance gate) in `spawnObstacleAt()`.
5. Optionally add a forced-interval rule and a `lastXxxDist` tracker.
6. Add an animator branch in `updateObstacles()`.
7. Add a case to `devtools/tests/collisiontest.mjs`.
8. Re-export from `AssetFactory.js`.

### Tune difficulty
Edit `CONFIG.STAGES` in `Constants.js` — `gap` (lower = denser), `dual` (paired-spawn chance), `pressure` (lower = forced hazards more often), `orbEvery`. For eternal mode edit the synthesis formulas in `currentStage()` (`SpawnSystem.js`). Then run `stagetest.mjs` to verify the real measured gaps match.

### Add a new divine power
1. Add its id to `DIVINE_POWERS` in `PowerSystem.js` (this alone puts it in the `C` random pool).
2. Add a branch in `executePower(power)`.
3. Build a pickup in `Collectibles.js` with `userData.collectibleType = 'power'` and `userData.power = 'your_id'`; add it to the pool in `initSpawnSystem` and to `POWER_CYCLE`.
4. Add its display name to the `NAMES` maps in `PowerSystem.collectPowerOrb` **and** `HUD.js`.
5. Update `StartScreen.js` tutorial text.

### Change the character's look
Everything is in `WarriorBody.js`:
- **Muscle size** → change the `orb`/`blob`/`tube` radii in `bodyOps()`.
- **Proportions** → change `HIP / KNEE / ANKLE / SHOULDER / HEAD_BONE`, then update the matching bone positions in `buildSkeleton()` **and** the flesh segments in `bodySegs` — all three must agree.
- **Clothing** → `clothOps()`; the hem is the `cut()` with `dist(px,py) { return py - (0.655 - 0.30*px); }`.
- **Colours** → the materials block at the top of `buildWarrior()`.
- **Detail level** → the `104` / `88` resolution arguments to `bakeMesh` (cubic cost).
- Preview instantly at `/devtools/player-preview.html`.

### Add a new stage / change stage moods
`CONFIG.STAGES` for the table; `STAGE_MOODS` array in `Lighting.js` for the moon tint; `STAGE_NUMERALS` in `SpawnSystem.js` for the numeral label.

### Change the goal distance
`CONFIG.KAILASH_DISTANCE`. Also check: the HUD progress bar, `state.nextMultDist` initial value (3000 = Kailash + 1000), and `eternaltest.mjs`.

### Add a sound
Add a branch to `playSound(type)` in `AudioSystem.js` — one oscillator + one gain envelope. Follow the rule: devotion rises, danger falls.

---

## 30. ROADMAP / IDEAS NOT YET BUILT

Discussed but not implemented:

- **Boss encounter at Kailash** — a scripted Naga king fight instead of a straight goal line.
- **Named eternal leagues** with unique hazard mixes rather than synthesised numbers.
- **Daily seed / challenge mode** — deterministic RNG from a date seed.
- **Additional powers:** Agni Astra (lane of fire), Vayu (speed burst), Garuda (temporary flight).
- **Mid-run pickups for lives** (currently there is no way to regain a life).
- **Mobile-specific tuning** — the touch buttons work but the difficulty curve was tuned on keyboard.
- **Music** — there is no background track, only SFX.
- **Leaderboard** — scores are local-only.

---

## QUICK REFERENCE CARD

```
RUN:            node serve.mjs   →   http://localhost:8000    (or double-click run.bat)
PREVIEW HERO:   /devtools/player-preview.html
STATE:          window.__getGameState()
START RUN:      window.__startGame()
TUNING:         src/utils/Constants.js
CHARACTER:      src/entities/WarriorBody.js
COLLISION:      src/systems/CollisionSystem.js  (HAZARD_SPAN)
DIFFICULTY:     CONFIG.STAGES + SpawnSystem.currentStage()
POWERS:         src/systems/PowerSystem.js      (E = held, C = ultimate — SEPARATE)
LOOP:           src/core/Game.js                (updateSimulation, animate)

LANES:   -2.2 | 0 | +2.2        GROUND: y = 0        SPAWN: z = -62   DESPAWN: z = +8
GRAVITY: -34                    JUMP: 13.3248        DOUBLE: 10.8     SLIDE: 0.6 s
SPEED:   12 → +0.5/200m → 22    GOAL: 2000 m         LIVES: 3
PLAYER BAND: grounded 2.0 · airborne 1.6 · sliding 1.15
```

---

<p align="center">
ॐ<br>
<b>Naga Loka Runner — Saiyan Through the Snake Way</b><br>
<a href="https://github.com/Itsagar086/warrior_run">GitHub</a> ·
<a href="https://warrior-run.vercel.app">Play</a><br>
<i>Complete project context · verified against 6,658 lines of source</i>
</p>
