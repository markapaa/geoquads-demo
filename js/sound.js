// Soft, short sounds made with WebAudio (no audio files needed).
// Sound is OFF by default: players turn it on with the Sound button.
import { getSound, setSound } from "./storage.js";

let enabled = getSound();
let ctx;

export const isSoundEnabled = () => enabled;
export function setSoundEnabled(on) {
  enabled = !!on;
  setSound(enabled);
}

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** One gentle "pluck": a sine wave that fades out quickly. */
function tone({ freq = 440, to = null, dur = 0.18, gain = 0.05, delay = 0 } = {}) {
  if (!enabled) return;
  try {
    const c = getCtx();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  } catch {
    /* audio not available: ignore */
  }
}

export const sfx = {
  select: () => tone({ freq: 660, dur: 0.07, gain: 0.025 }),
  deselect: () => tone({ freq: 500, dur: 0.06, gain: 0.02 }),
  shuffle: () => {
    tone({ freq: 420, to: 560, dur: 0.12, gain: 0.03 });
  },
  correct: () => {
    tone({ freq: 523, dur: 0.22, gain: 0.05 }); // C
    tone({ freq: 659, dur: 0.26, gain: 0.05, delay: 0.09 }); // E
  },
  wrong: () => tone({ freq: 220, to: 165, dur: 0.22, gain: 0.05 }),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.35, gain: 0.05, delay: i * 0.11 }));
  },
};
