// Web Audio로 합성하는 효과음 (에셋 없이)
let ctx: AudioContext | null = null;
let enabled = true;
let master: GainNode | null = null;

export function setSound(on: boolean) { enabled = on; }

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol = 0.4, freq = 1200, delay = 0) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

export type Sfx = 'click' | 'hit' | 'crit' | 'weak' | 'magic' | 'heal' | 'reaction' | 'break' | 'miss' | 'death' | 'levelup' | 'win' | 'lose' | 'buff' | 'warn' | 'coin' | 'open';

export function sfx(name: Sfx) {
  if (!enabled) return;
  switch (name) {
    case 'click': tone(660, 0.05, 'square', 0.15); break;
    case 'hit': noise(0.12, 0.5, 900); tone(140, 0.1, 'square', 0.25, 70); break;
    case 'crit': noise(0.18, 0.7, 1400); tone(220, 0.16, 'sawtooth', 0.3, 80); break;
    case 'weak': noise(0.14, 0.6, 1800); tone(520, 0.12, 'triangle', 0.3, 260); break;
    case 'magic': tone(880, 0.25, 'sine', 0.25, 440); tone(1320, 0.2, 'triangle', 0.15, 660, 0.03); break;
    case 'heal': tone(523, 0.18, 'sine', 0.25); tone(784, 0.25, 'sine', 0.2, undefined, 0.08); break;
    case 'buff': tone(440, 0.12, 'triangle', 0.2, 880); break;
    case 'reaction': tone(330, 0.4, 'sawtooth', 0.3, 990); noise(0.35, 0.5, 600); tone(660, 0.3, 'square', 0.15, 1320, 0.1); break;
    case 'break': noise(0.5, 0.8, 2500); tone(1200, 0.4, 'square', 0.25, 120); break;
    case 'miss': tone(300, 0.12, 'sine', 0.15, 200); break;
    case 'death': tone(220, 0.5, 'sawtooth', 0.25, 55); break;
    case 'warn': tone(440, 0.12, 'square', 0.2); tone(440, 0.12, 'square', 0.2, undefined, 0.18); break;
    case 'coin': tone(988, 0.08, 'square', 0.15); tone(1319, 0.15, 'square', 0.15, undefined, 0.07); break;
    case 'open': tone(392, 0.1, 'triangle', 0.2); tone(523, 0.1, 'triangle', 0.2, undefined, 0.08); tone(659, 0.2, 'triangle', 0.2, undefined, 0.16); break;
    case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.15, undefined, i * 0.09)); break;
    case 'win': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, undefined, i * 0.12)); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sine', 0.2, undefined, i * 0.2)); break;
  }
}
