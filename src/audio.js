// Every sound is synthesised, so the game ships no audio files.
import { rand, save, state } from './state.js';

let context = null;
let noiseBuffer = null;
let purrVoice = null;

export function unlockAudio() {
  if (!context) {
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      context = null;
    }
  }
  if (context && context.state === 'suspended') context.resume().catch(() => {});
  return context;
}

function tone(freq, duration, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
  if (!save.sound) return;
  const ctx = unlockAudio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), start + duration);
  gain.gain.setValueAtTime(1e-4, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(1e-4, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noise(duration, freq, vol, delay = 0) {
  if (!save.sound) return;
  const ctx = unlockAudio();
  if (!ctx) return;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const start = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.1;
  gain.gain.setValueAtTime(vol, start);
  gain.gain.exponentialRampToValueAtTime(1e-4, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start, rand(0, 0.25), duration + 0.02);
}

export const sfx = {
  boop: () => tone(560, 0.2, { slide: 0.45, vol: 0.22 }),
  pat: () => tone(420, 0.16, { slide: 0.7, vol: 0.12, type: 'triangle' }),
  heart: () => tone(rand(900, 1250), 0.16, { type: 'triangle', vol: 0.05 }),
  giggle: () => {
    for (let i = 0; i < 4; i++) tone(rand(720, 820) + i * 70, 0.07, { type: 'square', vol: 0.025, delay: i * 0.075 });
  },
  hop: () => tone(280, 0.22, { slide: 2.4, type: 'triangle', vol: 0.13 }),
  squeak: () => tone(980, 0.14, { slide: 1.6, type: 'square', vol: 0.04 }),
  hi: () => {
    tone(660, 0.1, { type: 'triangle', vol: 0.1 });
    tone(880, 0.14, { type: 'triangle', vol: 0.1, delay: 0.1 });
  },
  munch: () => {
    noise(0.09, 1400, 0.25);
    noise(0.07, 900, 0.18, 0.08);
  },
  drop: () => tone(1500, 0.08, { type: 'triangle', vol: 0.06 }),
  tick: () => tone(700, 0.05, { type: 'square', vol: 0.03 }),
  kick: () => tone(140, 0.18, { slide: 0.35, vol: 0.3 }),
  hat: () => noise(0.04, 7000, 0.06),
  snore: () => tone(110, 0.9, { slide: 0.75, type: 'sawtooth', vol: 0.012 }),
  grump: () => {
    tone(300, 0.12, { type: 'square', vol: 0.05 });
    tone(220, 0.18, { type: 'square', vol: 0.05, delay: 0.12 });
  },
  yay: () => {
    [660, 830, 990, 1320].forEach((freq, i) => tone(freq, 0.14, { type: 'triangle', vol: 0.08, delay: i * 0.08 }));
  },
  shutter: () => {
    noise(0.06, 3000, 0.3);
    tone(1800, 0.05, { type: 'square', vol: 0.04, delay: 0.05 });
  },
  dizzy: () => {
    for (let i = 0; i < 6; i++) tone(760 - i * 70, 0.13, { vol: 0.08, delay: i * 0.09, slide: 0.85 });
  },
  thud: () => {
    tone(95, 0.25, { slide: 0.5, vol: 0.35 });
    noise(0.12, 400, 0.25);
  },
  achoo: () => {
    noise(0.32, 2600, 0.35);
    tone(520, 0.25, { slide: 0.4, type: 'triangle', vol: 0.12 });
  },
  chime: () => {
    [1320, 1760].forEach((freq, i) => tone(freq, 0.28, { vol: 0.05, delay: i * 0.12 }));
  },
  step: () => tone(rand(190, 230), 0.035, { type: 'triangle', vol: 0.03 }),
  hum: () => {
    [523, 587, 659, 587].forEach((freq, i) => tone(freq, 0.15, { type: 'triangle', vol: 0.05, delay: i * 0.17 }));
  },
  wear: () => {
    tone(880, 0.08, { type: 'triangle', vol: 0.08 });
    tone(1320, 0.12, { type: 'triangle', vol: 0.08, delay: 0.08 });
  },
};

// The purr is one long-lived voice whose volume follows how much he is being petted.
export function updatePurr() {
  if (!context) return;
  const level = save.sound ? state.purr * 0.07 * (0.6 + 0.4 * Math.sin(state.time * Math.PI * 2 * 1.4)) : 0;
  if (!purrVoice) {
    if (level < 0.002) return;
    const osc = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 46;
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    gain.gain.value = 0;
    osc.connect(filter).connect(gain).connect(context.destination);
    osc.start();
    purrVoice = { gain };
  }
  purrVoice.gain.gain.setTargetAtTime(level, context.currentTime, 0.06);
}
