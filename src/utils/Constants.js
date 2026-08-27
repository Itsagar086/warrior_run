// Tuning constants for the Snake Way: lane geometry, speeds, zone values,
// spawn distances and scoring rates.

export const CONFIG = {
  LANE_WIDTH: 2.2,
  LANES: [-2.2, 0, 2.2],
  BASE_SPEED: 16.0,
  MAX_SPEED: 28.0,
  // Per-second acceleration. A full 2000m run lasts ~2 minutes, so this must be
  // steep enough to actually reach MAX_SPEED before Kailash.
  SPEED_RAMP: 0.13,
  GRAVITY: -34.0,
  // Tuned so the devotee actually rises 2.5 units in ~0.4s. The analytic value
  // for that is 13.04, but the loop integrates with symplectic Euler, which
  // undershoots the true apex by v0*dt/2 (~0.11 at 60fps) - so 13.32 is what
  // puts the observed peak at 2.5.
  JUMP_IMPULSE: 13.3248,
  DOUBLE_JUMP_IMPULSE: 10.8,
  LANE_SWITCH_SPEED: 15.0,
  SLIDE_DURATION: 0.6,
  KAILASH_DISTANCE: 2000,
  NAGA_CHASE_INTERVAL: 280,
  NAGA_CHASE_REQ_OBSTACLES: 3,
  NAGA_MISTAKE_TRIGGER: 2,   // path mistakes that summon the Naga (3rd hit is fatal)
  NAGA_CATCH_Z: 1.7,         // z at which the Naga is close enough to strike
  NAGA_CLOSE_RATE: 0.8,      // metres/second the Naga gains while chasing
  NAGA_DODGE_PUSH: 1.8,      // metres it is shoved back per hazard cleanly passed
  NAGA_RECOIL_Z: 9.0,        // z the Naga recoils to after a strike
  SPAWN_Z: -62.0,
  DESPAWN_Z: 8.0,
  SURFACE_Y: 0.0,
  RUDRAKSHA_PUNYA_MULT: 3,
  OM_GLYPH_PUNYA: 10,
  SHAKTI_PER_ORB: 25,
  POWER_SHAKTI_COST: 25,
};
