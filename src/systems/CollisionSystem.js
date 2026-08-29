// Player-versus-hazard collision. Zone 1 hazards end the run outright; Zone 2
// hazards cost a life and grant a brief stumble window.
//
// Returns one of:
//   'end'  - the run is over, stop updating this frame
//   'skip' - contact was resolved (cleared, blocked or absorbed); skip despawn
//   'none' - no contact
import { state } from '../core/GameState.js';
import { getPlayer } from '../entities/Player.js';
import { playSound } from './AudioSystem.js';
import { spawnFX } from './FXSystem.js';
import { registerPathMistake } from '../entities/NagaChaser.js';
import { asuraDeathBurst } from '../entities/AsuraDemon.js';
import { endRun } from './ScoreSystem.js';
import { shakeCamera } from '../core/CameraRig.js';

// How much vertical space each hazard actually threatens, in world units.
// THE fix for "I jumped clean over it and still died": collision used to test
// only x/z, and height existed for exactly three special-cased types - every
// other hazard killed the player at any altitude. Now each declares its
// dangerous band, deliberately a touch smaller than the art so near-misses
// feel like misses:
//   firePit    flames on the road; feet above 0.35 sail over them
//   boulder    the rock's mass (landing on top is handled separately)
//   archGate   the crossbeam: its stone underside sits at 1.55, so the
//              danger starts at 1.6 - nobody dies below the visible beam
//   brokenRoad a pit - dangerous from below, cleared while airborne
//   evilSoul   floats at head height; slide under it or leap clean over
//   cobra      strikes low and mid - jump it; sliding into it is a bite
//   asura      a charging wall of muscle up to 1.75, clearable near apex
const HAZARD_SPAN = {
  firePit: [0, 0.35],
  boulder: [0.15, 1.55],
  archGate: [1.6, 2.6],
  brokenRoad: [-2.0, 0.5],
  evilSoul: [1.2, 2.0],
  cobra: [0, 1.35],
  asura: [0, 1.75],
};
const DEFAULT_SPAN = [0, 1.6];

// The player's own vertical band. Sliding hugs the road; airborne the legs
// tuck, so the body is shorter than standing - which is exactly what makes
// clearing a hazard by jumping physically honest instead of impossible.
function playerBand() {
  const bottom = state.playerY;
  const height = state.isSliding ? 1.15 : (state.isGrounded ? 2.0 : 1.6);
  return [bottom, bottom + height];
}

export function resolveObstacleCollision(obs, oType) {
  const player = getPlayer();

  // Check collision with Player
  const dx = Math.abs(player.position.x - obs.position.x);
  const dz = Math.abs(player.position.z - obs.position.z);

  // Define effective collision thresholds based on obstacle shape
  let hitZ = 0.95;
  let hitX = 0.95;
  if (oType === 'brokenRoad') { hitZ = 1.6; hitX = 1.1; }
  else if (oType === 'evilSoul') { hitZ = 0.8; hitX = 0.8; }
  else if (oType === 'boulder') { hitZ = 1.05; hitX = 1.05; }

  if (dx < hitX && dz < hitZ) {
    // Safe land on top of Boulders. The crown of the shell is the stand
    // height the asset itself declares, so the devotee never floats above the
    // rock or sinks into it when the boulder's size changes.
    const standHeight = obs.userData.standHeight || 1.5;
    if (oType === 'boulder' && state.playerY >= standHeight - 0.35 && state.playerVY <= 0) {
      state.playerY = standHeight;
      state.playerVY = 0;
      state.isGrounded = true;
      state.canDoubleJump = true;
      // Remember the support so gravity resumes when the boulder passes
      state.groundY = standHeight;
      state.standingOn = obs;
      return 'skip';
    }

    // The vertical gate. Whatever the hazard, if the player's body band and
    // the hazard's band do not overlap, there IS no contact: a jump that
    // clears a slab clears it, a slide that fits under a beam fits. This one
    // test replaces the old firePit / brokenRoad / duckable special cases.
    const span = HAZARD_SPAN[oType] || DEFAULT_SPAN;
    const [pBottom, pTop] = playerBand();
    if (pBottom >= span[1] || pTop <= span[0]) {
      return 'none';
    }

    // Shield protection absorbs hit completely
    if (state.shieldTimer > 0) {
      obs.visible = false;
      if (obs.userData.obstacleType === 'asura') asuraDeathBurst(obs, spawnFX);
      else spawnFX(obs.position, '#4de0c0', 20);
      playSound('blast');
      state.punya += 50 * state.combo;
      return 'skip';
    }

    // Ignore hit during stumble invulnerability
    if (state.stumbleTimer > 0) {
      return 'skip';
    }

    // TWO-ZONE OBSTACLE SYSTEM:
    const zone = obs.userData.zone || 1;

    if (zone === 2 && state.lives > 1) {
      // Zone 2 Obstacle: First touch costs 1 life + 1.5s invincibility/stumble timer
      state.lives--;
      state.stumbleTimer = 1.5;
      obs.visible = false;
      playSound('blast');
      spawnFX(player.position, '#ff8c2e', 20);
      shakeCamera(1.8);
      // Misreading the path is what actually summons the Naga
      registerPathMistake();
    } else {
      // Zone 1 Hazard OR final life lost in Zone 2 -> Game Over
      state.lives = 0;
      playSound('blast');
      spawnFX(player.position, '#ff4500', 30);
      shakeCamera(2.6);
      endRun(false);
      return 'end';
    }
  }

  return 'none';
}
