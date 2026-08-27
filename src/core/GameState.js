// Every mutable value a run owns: score, lives, distance, kinematics, timers.
// Moved verbatim during the src/ reorganisation.
import { CONFIG } from '../utils/Constants.js';

export const state = {
  phase: 'splash', // 'splash' | 'playing' | 'paused' | 'gameOver' | 'victory'
  punya: 0,
  shakti: 40,
  maxShakti: 100,
  distance: 0,
  lives: 3,
  lane: 1, // 0: left, 1: center, 2: right
  playerX: 0,
  targetX: 0,
  playerY: 0,
  playerVY: 0,
  groundY: 0,        // surface the player currently falls toward
  standingOn: null,  // obstacle being stood on (boulder top), if any
  isGrounded: true,
  canDoubleJump: true,
  isSliding: false,
  slideTimer: 0,
  activePower: null, // 'sudarshan_chakra' | 'trishul' | 'vishnu_shield'
  shieldTimer: 0,
  speed: 16.0,
  combo: 1,
  comboTimer: 0,
  pathMistakes: 0,   // hits taken since the last Naga chase
  chase: {
    active: false,
    survived: 0,
    nextDist: 280,
    nagaZ: 20.0,
    nagaTargetZ: 20.0,
  },
  powerCycleIndex: 0,
  highScore: 0,
  bestDistance: 0,
  stumbleTimer: 0,
};

window.__getGameState = () => state;
window.__gameEntities = {
  player: null,
  obstacles: [],
  collectibles: [],
  registerObstacle(obj) {
    this.obstacles = this.obstacles.filter(o => o.parent !== null);
    this.obstacles.push(obj);
  },
  registerCollectible(obj) {
    this.collectibles = this.collectibles.filter(o => o.parent !== null);
    this.collectibles.push(obj);
  },
};

window.__game = window.__game || {};
Object.assign(window.__game, { CONFIG, state });
