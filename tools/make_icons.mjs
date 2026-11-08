// Draws Gloomjaw's glowing eye as app icons (no dependencies: writes PNG files by hand).
// Run:  node tools/make_icons.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function pixel(u, v) {                       // u, v in -1..1
  let c = mix([40, 20, 78], [8, 4, 16], sm(0.1, 1.4, Math.hypot(u, v)));   // dark violet background
  const halo = Math.exp(-(Math.hypot(u / 0.95, v / 0.65) ** 2) * 2.2);        // purple glow behind the eye
  c = mix(c, [150, 70, 255], halo * 0.55);
  // almond-shaped eye
  const ax = Math.abs(u) / 0.78;
  const lid = ax < 1 ? 0.4 * Math.pow(1 - ax * ax, 0.85) : 0;
  const d = Math.abs(v) - lid;                                              // <0 inside the eye
  const eye = ax < 1 ? 1 - sm(-0.012, 0.012, d) : 0;
  if (eye > 0) {
    const r = Math.hypot(u / 0.9, v / 0.9);
    let iris = mix([255, 214, 120], [200, 70, 255], sm(0.05, 0.42, r));     // gold centre fading to violet
    iris = mix(iris, [90, 20, 170], sm(0.38, 0.62, r));
    // vertical slit pupil
    const pup = 1 - sm(0.8, 1.0, Math.hypot(u / 0.085, v / 0.34));
    iris = mix(iris, [6, 2, 12], pup);
    // glossy highlight
    const hl = 1 - sm(0.0, 1.0, Math.hypot((u + 0.17) / 0.07, (v + 0.15) / 0.05));
    iris = mix(iris, [255, 255, 255], hl * 0.9);
    c = mix(c, iris, eye);
  }
  const rim = Math.exp(-(((d - 0.01) / 0.02) ** 2)) * (ax < 1 ? 1 : 0);        // bright lid outline
  return mix(c, [235, 190, 255], Math.min(1, rim * 0.8));
}

function render(S) {
  const buf = Buffer.alloc(S * S * 3), SS = 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const [pr, pg, pb] = pixel(((x + (sx + 0.5) / SS) / S) * 2 - 1, ((y + (sy + 0.5) / SS) / S) * 2 - 1);
      r += pr; g += pg; b += pb;
    }
    const o = (y * S + x) * 3, n = SS * SS;
    buf[o] = r / n; buf[o + 1] = g / n; buf[o + 2] = b / n;
  }
  return png(S, S, buf);
}

fs.mkdirSync('public/icons', { recursive: true });
for (const [name, size] of [['apple-touch-icon', 180], ['icon-192', 192], ['icon-512', 512]]) {
  fs.writeFileSync(`public/icons/${name}.png`, render(size));
  console.log('wrote', name, size);
}
