// Synthesised sound effects - no audio files, every cue is an oscillator.

// ===== SYSTEM id=system-audio label="Sound Synthesis" =====
let audioCtx = null;
export function playSound(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'jump') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(540, t + 0.18);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
    } else if (type === 'om') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, t); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, t + 0.25); // E5
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else if (type === 'rudraksha') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.setValueAtTime(659.25, t + 0.08);
      osc.frequency.setValueAtTime(880, t + 0.16);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.45);
    } else if (type === 'power') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(720, t + 0.3);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
    } else if (type === 'blast') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    } else if (type === 'hiss') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(300, t + 0.4);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  } catch (e) {}
}
// ===== END SYSTEM =====
