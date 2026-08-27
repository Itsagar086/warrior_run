// Sinusoidal limb-animation helpers. Each one is the exact expression the
// entity animation code used inline before the reorganisation, named.

// Math.sin(angle) * amp - the basic limb swing.
export function swing(angle, amp) {
  return Math.sin(angle) * amp;
}

// The opposite half of a gait cycle: -Math.sin(angle) * amp.
export function swingOpposed(angle, amp) {
  return -Math.sin(angle) * amp;
}

// Forward half of the swing only, clamped at rest: Math.max(0, sin * amp).
export function swingForward(angle, amp) {
  return Math.max(0, Math.sin(angle) * amp);
}

// Backward half of the swing only, clamped at rest: Math.max(0, -sin * amp).
export function swingBack(angle, amp) {
  return Math.max(0, -Math.sin(angle) * amp);
}

// Always-positive bob, twice per cycle: Math.abs(Math.sin(angle)) * amp.
export function bounce(angle, amp) {
  return Math.abs(Math.sin(angle)) * amp;
}
