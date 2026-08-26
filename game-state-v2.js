import * as THREE from 'three';
import { voxelToMesh, tickVoxels, boot } from 'playlabs-boot';
const CONFIG = {
  LANE_WIDTH: 2.2,
  LANES: [-2.2, 0, 2.2],
  BASE_SPEED: 16.0,
  MAX_SPEED: 28.0,
  SPEED_RAMP: 0.035,
  GRAVITY: -34.0,
  JUMP_IMPULSE: 12.4,
  DOUBLE_JUMP_IMPULSE: 10.8,
  LANE_SWITCH_SPEED: 15.0,
  SLIDE_DURATION: 0.65,
  KAILASH_DISTANCE: 2000,
  NAGA_CHASE_INTERVAL: 280,
  NAGA_CHASE_REQ_OBSTACLES: 3,
  SPAWN_Z: -62.0,
  DESPAWN_Z: 8.0,
  SURFACE_Y: 0.0,
  RUDRAKSHA_PUNYA_MULT: 3,
  OM_GLYPH_PUNYA: 10,
  SHAKTI_PER_ORB: 25,
};

const state = {
  phase: 'splash', // 'splash' | 'playing' | 'paused' | 'gameOver' | 'victory'
  score: 0,
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
  isGrounded: true,
  canDoubleJump: true,
  isSliding: false,
  slideTimer: 0,
  activePower: null, // 'sudarshan_chakra' | 'trishul' | 'vishnu_shield'
  shieldTimer: 0,
  speed: 16.0,
  combo: 1,
  comboTimer: 0,
  lastCollisionRole: null,
  chase: {
    active: false,
    survived: 0,
    required: 3,
    nextDist: 280,
    nagaZ: 20.0,
    nagaTargetZ: 20.0,
  },
  powerCycleIndex: 0,
  highScore: 0,
  bestDistance: 0,
  bannerText: '',
  bannerTimer: 0,
  stumbleTimer: 0,
  projectiles: [],
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