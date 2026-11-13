import { FIRE_DUR } from './state.js';

let ac = null, muted = false, noiseBuf = null;

/** Safari only allows sound after a tap: call this from the Play button. */
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  try { // a silent blip fully wakes up iOS audio
    const b = a.createBuffer(1, 1, 22050), s = a.createBufferSource();
    s.buffer = b; s.connect(a.destination); s.start(0);
  } catch (e) { /* ignore */ }
}
export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function audio() {
  if (muted) return null;
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const len = ac.sampleRate * 2;
      noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { return null; }
  }
  if (ac.state === 'suspended' || ac.state === 'interrupted') ac.resume();
  return ac;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && ac && ac.state !== 'running') ac.resume(); });

function noise(a, dur) {
  const s = a.createBufferSource();
  s.buffer = noiseBuf; s.loop = true; s.start(); s.stop(a.currentTime + dur);
  return s;
}

/** a short puff of filtered noise: wing flaps, footsteps, landing thumps */
export function burst(freq, peak, dur) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, n = noise(a, dur + 0.05), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = freq;
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  n.connect(lp).connect(g).connect(a.destination);
}

export function sfxFire() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, n = noise(a, FIRE_DUR), f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(400, t0);
  f.frequency.linearRampToValueAtTime(2200, t0 + 0.5);
  f.frequency.linearRampToValueAtTime(600, t0 + FIRE_DUR);
  const g = a.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.35);
  g.gain.setValueAtTime(0.5, t0 + FIRE_DUR - 0.5);
  g.gain.linearRampToValueAtTime(0, t0 + FIRE_DUR);
  n.connect(f).connect(g).connect(a.destination);
}

/* lion-style roar: deep rising "aaOOUGH" with rough vocal growl, then a few chesty grunts */
function roarVoice(a, t0, d, f0, fPeak, fEnd, vol, peakAt) {
  const out = a.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(vol, t0 + d * peakAt);
  out.gain.setValueAtTime(vol, t0 + d * (peakAt + 0.15));
  out.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  // growl roughness: fast amplitude flutter
  const rough = a.createGain(); rough.gain.value = 0.65;
  const lfo = a.createOscillator();
  lfo.frequency.setValueAtTime(34, t0); lfo.frequency.linearRampToValueAtTime(22, t0 + d);
  const lg = a.createGain(); lg.gain.value = 0.35; lfo.connect(lg).connect(rough.gain);
  const src = a.createGain();
  [[1, 'sawtooth', 0.6], [0.5, 'square', 0.35], [1.007, 'sawtooth', 0.4]].forEach(([m, type, g]) => {
    const o = a.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0 * m, t0);
    o.frequency.linearRampToValueAtTime(fPeak * m, t0 + d * peakAt);
    o.frequency.exponentialRampToValueAtTime(fEnd * m, t0 + d);
    const og = a.createGain(); og.gain.value = g;
    o.connect(og).connect(src); o.start(t0); o.stop(t0 + d);
  });
  const n = noise(a, d), nb = a.createBiquadFilter();
  nb.type = 'bandpass'; nb.frequency.value = 700; nb.Q.value = 0.7;
  const ng = a.createGain(); ng.gain.value = 0.5; n.connect(nb).connect(ng).connect(src);
  const ws = a.createWaveShaper(), cur = new Float32Array(512);
  for (let i = 0; i < 512; i++) cur[i] = Math.tanh((i / 256 - 1) * 6);
  ws.curve = cur;
  src.connect(ws).connect(rough);
  // throat formants: wide-open "aah" turning into "ooh"
  [[320, 180, 1.4, 0.9], [750, 420, 1.6, 0.7], [2300, 1400, 3, 0.25]].forEach(([fa, fb, q, g]) => {
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
    bp.frequency.setValueAtTime(fa, t0);
    bp.frequency.linearRampToValueAtTime(fa * 1.1, t0 + d * peakAt);
    bp.frequency.exponentialRampToValueAtTime(fb, t0 + d);
    const bg = a.createGain(); bg.gain.value = g;
    rough.connect(bp).connect(bg).connect(out);
  });
  const sub = a.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(f0 * 0.5, t0); sub.frequency.exponentialRampToValueAtTime(fEnd * 0.5, t0 + d);
  const sg = a.createGain(); sg.gain.value = 0.5; sub.connect(sg).connect(out); sub.start(t0); sub.stop(t0 + d);
  lfo.start(t0); lfo.stop(t0 + d);
  out.connect(a.destination);
}

let voicePitch = 1;                      // each dragon has its own roar pitch (dragons.js)
export function setVoice(p) { voicePitch = p; }

export function sfxRoar() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, p = voicePitch;
  roarVoice(a, t0, 1.9, 95 * p, 175 * p, 62 * p, 0.42, 0.3);
  [2.0, 2.38, 2.72].forEach((s, i) => roarVoice(a, t0 + s, 0.32, (85 - i * 6) * p, (105 - i * 8) * p, 60 * p, 0.28 - i * 0.06, 0.25));
}

/* ---------- ring challenge sounds (small synthesized chimes) ---------- */
function chime(a, t0, freq, dur, vol, type = 'sine') {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
/** through a ring: a bright two-note ding that climbs a little with every ring in a row */
export function sfxRing(n) {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, f = 520 * Math.pow(1.06, Math.min(n, 12));
  chime(a, t0, f, 0.35, 0.22); chime(a, t0 + 0.07, f * 1.5, 0.45, 0.2); chime(a, t0, f * 2, 0.2, 0.06, 'triangle');
  burst(2600, 0.25, 0.25);                       // a whoosh of fire
}
/** the clock starts */
export function sfxGo() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => chime(a, t0 + i * 0.07, f, 0.35, 0.18, 'triangle'));
}
/** time is up */
export function sfxEnd() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime;
  [784, 659, 523, 392].forEach((f, i) => chime(a, t0 + i * 0.14, f, 0.5, 0.2, 'triangle'));
}
