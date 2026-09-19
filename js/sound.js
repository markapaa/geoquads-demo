// Tiny WebAudio beeps (no audio files needed).
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

function beep({ freq = 440, dur = 0.12, type = "sine", gain = 0.06 } = {}) {
  if (!enabled) return;
  try {
    const c = getCtx();
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t0);
    g.gain.setValueAtTime(gain, t0 + Math.max(0, dur - 0.04));
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* audio not available: ignore */
  }
}

export const sfx = {
  select: () => beep({ freq: 520, dur: 0.06, type: "square", gain: 0.03 }),
  deselect: () => beep({ freq: 360, dur: 0.05, type: "square", gain: 0.03 }),
  shuffle: () => {
    beep({ freq: 400, dur: 0.05 });
    setTimeout(() => beep({ freq: 520, dur: 0.05 }), 60);
  },
  correct: () => {
    beep({ freq: 660, dur: 0.1, type: "triangle" });
    setTimeout(() => beep({ freq: 880, dur: 0.1, type: "triangle" }), 90);
  },
  wrong: () => beep({ freq: 220, dur: 0.12, type: "sawtooth" }),
  win: () => [880, 1046, 1318].forEach((f, i) => setTimeout(() => beep({ freq: f, dur: 0.1, type: "triangle" }), i * 120)),
};
