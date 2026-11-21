import { storage } from './storage';

let ctx: AudioContext | null = null;
let muted = storage.getMuted();

export const isMuted = () => muted;
export const setMuted = (m: boolean) => {
  muted = m;
  storage.setMuted(m);
};

function tone(
  freq: number,
  duration: number,
  type: OscillatorType,
  gain: number,
  delay = 0,
  slideTo?: number
) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo)
      osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    // Audio is optional.
  }
}

export const sfx = {
  slide: (cells: number) =>
    tone(220, 0.05 * cells + 0.08, 'triangle', 0.05, 0, 140),
  collect: (delay: number) => tone(880, 0.12, 'sine', 0.08, delay, 1320),
  bump: () => tone(110, 0.08, 'square', 0.03),
  clear: () => {
    tone(523, 0.12, 'sine', 0.08);
    tone(659, 0.12, 'sine', 0.08, 0.1);
    tone(784, 0.22, 'sine', 0.08, 0.2);
  },
};
