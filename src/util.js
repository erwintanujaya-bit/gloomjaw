import * as THREE from 'three';

export const V = THREE.Vector3;
export const k = (dt, r) => Math.min(1, dt * r);           // frame-rate independent easing factor
export const ease = x => x * x * (3 - 2 * x);
export const frac = x => x - Math.floor(x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const wrapA = x => Math.atan2(Math.sin(x), Math.cos(x));
export const smoothstep = (a, b, x) => ease(clamp((x - a) / (b - a), 0, 1));
/** envelope: ramps up over `a` seconds, holds, ramps down over the last `b` seconds */
export const env = (tt, dur, a, b) => (tt < 0 || tt > dur ? 0 : Math.max(0, Math.min(1, tt / a, (dur - tt) / b)));

/** small seeded random generator so the world is the same every time */
export function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
