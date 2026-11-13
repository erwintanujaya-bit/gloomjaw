import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V, smoothstep, lerp, canvasTex, clamp } from './util.js';
import { G, S } from './state.js';

/*
 * Biomes. A biome is a THEME (colours, how many props, which props). The world has no edge:
 *   - the ground is built in square tiles ("chunks") around the player and thrown away behind them,
 *   - trees, mushrooms and rocks are placed by a repeatable pattern (the same spot always gets the same prop),
 *     and re-laid around the player every few steps,
 *   - lava lakes / glowing pools come from the same kind of pattern, one chance per big square.
 * Nothing is stored for the whole world, so you can walk forever.
 */

export const WORLD_TUNE = {
  hillHeight: 13,       // overall hill size (bigger = taller hills)
  hillScale: 48,        // distance between hills
  fogColor: 0x20123a,
  fogNear: 26, fogFar: 125,
  poolChance: 0.6, poolR: 4.5, poolRSpan: 4, poolDepth: 0.3,
};
const WORLD_BASE = { ...WORLD_TUNE };               // the defaults; each theme overrides some of them

const CHUNK = 64, STEP = 2, SEG = CHUNK / STEP, VN = SEG + 1, BN = VN + 2;   // tile size, vertex spacing, vertices per side (+1 border for smooth normals)
const VIEW = 2;                                      // tiles kept around the player: (2*VIEW+1)^2 = 25
const CELL = 8, REACH = 15;                          // props are laid in 8-unit squares out to 15 squares (120 units)...
const LAY_STEP = 16;                                 // ...and laid again whenever the player has moved 16 units (so at top speed it is only a couple of times a second)

const THEMES = {
  /* Gloomjaw's home: purple glowing mushrooms, twisted trees, glowing pools */
  void: {
    name: 'Void Jungle',
    tune: {},
    fog: 0x20123a,
    sky: { top: 0x07030f, mid: 0x1b0e33 },
    stars: { color: 0xcdb2ff, opacity: 0.8 },
    terrain: { c1: 0x0c0716, c2: 0x1a1030, c3: 0x2a1a48, pool: 0x5a2a9a, poolMix: 0.5, vein: 0 },
    lights: { hemiSky: 0xb9a4ee, hemiGround: 0x1a0e2c, hemi: 0.6, sun: 0xfff0f8, sunI: 1.5, rim: 0xb36bff, rimI: 1.6 },
    pool: { stops: [[0, 'rgba(230,180,255,1)'], [0.55, 'rgba(150,70,255,.9)'], [0.9, 'rgba(90,30,180,.5)'], [1, 'rgba(60,10,140,0)']] },
    props: 'jungle', dens: { mush: 0.62, tree: 0.245, rock: 0.22 },
    rock: 0x2b2140, rockGlow: 0,
    trunk: 0x1d1429, bulb: { color: 0x3a1470, emissive: 0x9a40ff },
    motes: 0xb36bff, dust: 0x8a78a8,
  },

  /* Emberclaw's home: black basalt, glowing lava lakes and cracks, charred trees, obsidian spikes, embers */
  lava: {
    name: 'Lava Lands',
    tune: { hillHeight: 17, hillScale: 40, fogNear: 22, fogFar: 108, poolChance: 0.75, poolR: 6, poolRSpan: 6, poolDepth: 0.7 },
    fog: 0x2e0d05,
    sky: { top: 0x0c0302, mid: 0x3d1208 },
    stars: { color: 0xffa868, opacity: 0.55 },
    terrain: { c1: 0x080403, c2: 0x140a08, c3: 0x241210, pool: 0x5a1e0c, poolMix: 0.75, vein: 1 },
    lights: { hemiSky: 0xff9a62, hemiGround: 0x2c0a04, hemi: 0.38, sun: 0xffc890, sunI: 1.25, rim: 0xff4a14, rimI: 1.3 },
    pool: { stops: [[0, 'rgba(255,240,150,1)'], [0.45, 'rgba(255,130,25,.97)'], [0.85, 'rgba(210,50,0,.6)'], [1, 'rgba(120,10,0,0)']] },
    props: 'volcano', dens: { spike: 0.5, tree: 0.18, rock: 0.33 },
    rock: 0x2a1a16, rockGlow: 0.22,
    trunk: 0x140c0a, bulb: { color: 0x4a1608, emissive: 0xff6a10 },
    motes: 0xff8a2a, dust: 0x6b5048,
  },
};
export const WORLD_IDS = Object.keys(THEMES);

/* ---------- noise ---------- */
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** a repeatable random number for a spot in the world: the same (cx, cz, salt) always gives the same answer */
const rnd = (cx, cz, salt) => hash(cx * 3 + salt * 7919, cz * 5 - salt * 104729);

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * f, z * f); norm += amp; amp *= 0.5; f *= 2.03; }
  return sum / norm;
}

/* ---------- height of the ground ---------- */
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x / WORLD_TUNE.hillScale + 11.3, z / WORLD_TUNE.hillScale - 7.1) - 0.5) * WORLD_TUNE.hillHeight;
  h = lerp(h, 0, 1 - smoothstep(9, 26, r));            // flat meadow where the dragon starts
  return h;
}

/* pools: each 64x64 square has one chance of a pool (never close to the start) */
const poolCache = new Map();
function poolOf(pcx, pcz) {
  const key = pcx * 100003 + pcz;
  let p = poolCache.get(key);
  if (p !== undefined) return p;
  p = null;
  if (rnd(pcx, pcz, 1) < WORLD_TUNE.poolChance) {
    const x = (pcx + 0.15 + 0.7 * rnd(pcx, pcz, 2)) * CHUNK, z = (pcz + 0.15 + 0.7 * rnd(pcx, pcz, 3)) * CHUNK;
    if (Math.hypot(x, z) > 34) p = { x, z, r: WORLD_TUNE.poolR + rnd(pcx, pcz, 4) * WORLD_TUNE.poolRSpan, level: baseHeight(x, z) - WORLD_TUNE.poolDepth };
  }
  poolCache.set(key, p);
  return p;
}
/** the pools in the 3x3 squares around a point (they can reach over a square's border) */
function poolsNear(x, z) {
  const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK), out = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const p = poolOf(pcx + i, pcz + j); if (p) out.push(p); }
  return out;
}
function stamped(x, z, plist) {
  let h = baseHeight(x, z);
  for (const p of plist) {
    const d = Math.hypot(x - p.x, z - p.z);
    const w = 1 - smoothstep(p.r * 0.85, p.r * 1.7, d);
    if (w > 0) h = lerp(h, p.level, w);
  }
  return h;
}
const heightSlow = (x, z) => stamped(x, z, poolsNear(x, z));

/* ---------- the ground, in tiles ---------- */
let scene, T = THEMES.void, groundMat = null, indexAttr = null;
let mats = {}, pulses = [], built = [];
let sun, fireLight, sky;
const chunks = new Map();                           // key -> { cx, cz, mesh, H }
const ckey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);

const add = o => { scene.add(o); built.push(o); return o; };
const pulse = (mat, base, amp, speed, phase = 0) => pulses.push({ mat, base, amp, speed, phase });

function chunkIndex() {
  const idx = new Uint32Array(SEG * SEG * 6);
  let q = 0;
  for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
    const a = j * VN + i, b = a + 1, c = a + VN, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  return new THREE.BufferAttribute(idx, 1);
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color(), _pc = new THREE.Color(), _tmp = new THREE.Color();
const _vein = new THREE.Color(1.0, 0.52, 0.1);

function buildChunk(cx, cz) {
  const ox = cx * CHUNK, oz = cz * CHUNK, plist = poolsNear(ox + CHUNK / 2, oz + CHUNK / 2);
  // heights, with one extra ring of samples so the lighting matches across tile borders (no visible seams)
  const H = new Float32Array(BN * BN);
  for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) H[j * BN + i] = stamped(ox + (i - 1) * STEP, oz + (j - 1) * STEP, plist);
  const pos = new Float32Array(VN * VN * 3), nor = new Float32Array(VN * VN * 3), col = new Float32Array(VN * VN * 3);
  const { pool, poolMix, vein } = T.terrain;
  _c1.set(T.terrain.c1); _c2.set(T.terrain.c2); _c3.set(T.terrain.c3); _pc.set(pool);
  for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
    const o = (j * VN + i) * 3, hi = (j + 1) * BN + (i + 1);
    const lx = i * STEP, lz = j * STEP, x = ox + lx, z = oz + lz, y = H[hi];
    pos[o] = lx; pos[o + 1] = y; pos[o + 2] = lz;
    const nx = H[hi - 1] - H[hi + 1], nz = H[hi - BN] - H[hi + BN], nl = Math.hypot(nx, 2 * STEP, nz);
    nor[o] = nx / nl; nor[o + 1] = 2 * STEP / nl; nor[o + 2] = nz / nl;
    const n = fbm(x / 9 + 3, z / 9 + 5);
    _tmp.copy(_c1).lerp(_c2, clamp(n * 1.3 + y * 0.04, 0, 1)).lerp(_c3, clamp((n - 0.55) * 2.2, 0, 0.7));
    for (const p of plist) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 2) _tmp.lerp(_pc, (1 - d / (p.r * 2)) * poolMix); }
    if (vein) {                                       // glowing cracks: thin bright lines where a second noise crosses its middle
      const ridge = 1 - Math.abs(2 * fbm(x / 11 + 21, z / 11 - 13) - 1);
      _tmp.lerp(_vein, smoothstep(0.915, 0.985, ridge) * 0.9 * smoothstep(12, 30, Math.hypot(x, z)));
    }
    col[o] = _tmp.r; col[o + 1] = _tmp.g; col[o + 2] = _tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(indexAttr);                            // all tiles share one index list
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, groundMat);
  mesh.position.set(ox, 0, oz);
  mesh.receiveShadow = true;
  scene.add(mesh);
  chunks.set(ckey(cx, cz), { cx, cz, mesh, H });
}

function dropChunk(c) {
  scene.remove(c.mesh); c.mesh.geometry.dispose();
  chunks.delete(ckey(c.cx, c.cz));
}

/** ground height anywhere: read it from the tile (exactly matching the drawn triangles), or work it out if the tile is not built yet */
let lastC = null;
function heightAt(x, z) {
  const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
  let c = lastC;
  if (!c || c.cx !== cx || c.cz !== cz) { c = chunks.get(ckey(cx, cz)); if (!c) return heightSlow(x, z); lastC = c; }
  const lx = (x - cx * CHUNK) / STEP, lz = (z - cz * CHUNK) / STEP;
  const i = Math.min(SEG - 1, lx | 0), j = Math.min(SEG - 1, lz | 0), fx = lx - i, fz = lz - j;
  const H = c.H, o = (j + 1) * BN + (i + 1);
  const a = H[o], b = H[o + 1], cc = H[o + BN], d = H[o + BN + 1];
  return fx + fz <= 1 ? a + (b - a) * fx + (cc - a) * fz : d + (b - d) * (1 - fz) + (cc - d) * (1 - fx);
}

let pcx = 1e9, pcz = 1e9;
/** keep the 5x5 tiles around the player built (a few per frame when walking), and drop the far ones */
function updateChunks(px, pz, all = false) {
  const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK);
  let budget = all ? 1e9 : 1;
  const want = [];
  for (let j = -VIEW; j <= VIEW; j++) for (let i = -VIEW; i <= VIEW; i++) if (!chunks.has(ckey(ccx + i, ccz + j))) want.push([ccx + i, ccz + j, Math.max(Math.abs(i), Math.abs(j)) * 10 + Math.abs(i) + Math.abs(j)]);
  want.sort((a, b) => a[2] - b[2]);
  for (const [cx, cz, pr] of want) {
    if (pr < 10 || budget-- > 0) buildChunk(cx, cz);       // the tile you stand on is never late; the others come one per frame, nearest first
  }
  for (const c of [...chunks.values()]) if (Math.abs(c.cx - ccx) > VIEW + 1 || Math.abs(c.cz - ccz) > VIEW + 1) dropChunk(c);
}

/* ---------- props: laid out around the player from the repeatable pattern ---------- */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V(), _p = new V(), _e = new THREE.Euler();
function put(mesh, i, x, y, z, rotY, sx, sy, sz) {
  _e.set(0, rotY, 0); _q.setFromEuler(_e);
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

/** a tube that gets thinner along its length */
function taperedTube(points, r0, r1, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points), seg = points.length * 2;
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position;
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg), rad = lerp(r0, r1, i / seg);
    for (let j = 0; j <= radial; j++) {
      const k2 = i * (radial + 1) + j;
      p.setXYZ(k2, c.x + (p.getX(k2) - c.x) * rad, c.y + (p.getY(k2) - c.y) * rad, c.z + (p.getZ(k2) - c.z) * rad);
    }
  }
  g.computeVertexNormals();
  return g;
}

function makeTree(seed) {
  let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const trunkParts = [], glowParts = [];
  const H = 6 + r() * 3, twist = 2 + r() * 2, lean = 0.4 + r() * 0.5;
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const u = i / 6;
    pts.push(new V(Math.sin(u * twist + seed) * lean * u * 2, u * H, Math.cos(u * twist * 0.8 + seed) * lean * u * 2));
  }
  trunkParts.push(taperedTube(pts, 0.7, 0.16));
  const branches = 3 + Math.floor(r() * 3);
  for (let b = 0; b < branches; b++) {
    const u = 0.45 + r() * 0.5, o = pts[Math.min(6, Math.round(u * 6))].clone();
    const ang = r() * 6.28, len = 2 + r() * 2.5, up = 0.8 + r() * 1.6;
    const bp = [o.clone(), o.clone().add(new V(Math.cos(ang) * len * 0.5, up * 0.2, Math.sin(ang) * len * 0.5)),
      o.clone().add(new V(Math.cos(ang + 0.7) * len, up * 0.7, Math.sin(ang + 0.7) * len)),
      o.clone().add(new V(Math.cos(ang + 0.4) * len * 1.2, up * 1.4, Math.sin(ang + 0.4) * len * 1.2))];
    trunkParts.push(taperedTube(bp, 0.2, 0.05, 4));
    const tip = bp[3], bulb = new THREE.SphereGeometry(0.28 + r() * 0.22, 6, 4);
    bulb.translate(tip.x, tip.y, tip.z);
    glowParts.push(bulb);
  }
  const trunk = mergeGeometries(trunkParts), glow = mergeGeometries(glowParts);
  return mergeGeometries([trunk, glow], true);       // two groups: trunk + glowing bulbs (or embers, in the Lava Lands)
}

let P = null;                                       // prop meshes: { stems, caps1, caps2, spikes, trees: [3], rocks }
const CAP = { mush: 900, spike: 1500, tree: 200, rock: 520 };

function buildPropMeshes() {
  P = { trees: [] };
  mats.trunk = new THREE.MeshStandardMaterial({ color: T.trunk, roughness: 1 });
  mats.bulb = new THREE.MeshStandardMaterial({ color: T.bulb.color, emissive: T.bulb.emissive, emissiveIntensity: 0.9, roughness: 0.6 });
  pulse(mats.bulb, 0.9, 0.25, 0.9);
  for (let v = 0; v < 3; v++) { const m = new THREE.InstancedMesh(makeTree(5 + v * 17), [mats.trunk, mats.bulb], CAP.tree); P.trees.push(m); }
  mats.rock = new THREE.MeshStandardMaterial({ color: T.rock, roughness: 1, flatShading: true, emissive: 0xff3a08, emissiveIntensity: T.rockGlow });
  P.rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.rock, CAP.rock);
  if (T.props === 'volcano') {
    mats.spike = new THREE.MeshStandardMaterial({ color: 0x140a08, emissive: 0xc82a05, emissiveIntensity: 0.4, roughness: 0.55, flatShading: true });
    pulse(mats.spike, 0.4, 0.15, 1.4);
    P.spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), mats.spike, CAP.spike);
  } else {
    mats.stem = new THREE.MeshStandardMaterial({ color: 0x2c2140, roughness: 0.9 });
    mats.cap1 = new THREE.MeshStandardMaterial({ color: 0x3a1470, emissive: 0x8a2cff, emissiveIntensity: 0.9, roughness: 0.5 });
    mats.cap2 = new THREE.MeshStandardMaterial({ color: 0x5a2290, emissive: 0xb050ff, emissiveIntensity: 0.75, roughness: 0.5 });
    pulse(mats.cap1, 0.9, 0.2, 1.6); pulse(mats.cap2, 0.75, 0.2, 1.3, 2);
    P.stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.13, 1, 6).translate(0, 0.5, 0), mats.stem, CAP.mush);
    const capG = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    P.caps1 = new THREE.InstancedMesh(capG, mats.cap1, CAP.mush); P.caps2 = new THREE.InstancedMesh(capG, mats.cap2, CAP.mush);
  }
  [...P.trees, P.rocks, P.spikes, P.stems, P.caps1, P.caps2].forEach(m => { if (m) { m.frustumCulled = false; m.count = 0; add(m); } });
}

let lcx = 1e9, lcz = 1e9, lpx = 1e9, lpz = 1e9;
/** lay props in every 8-unit square within reach of the player; a square always grows the same things */
function layProps(px, pz) {
  const ccx = Math.floor(px / CELL), ccz = Math.floor(pz / CELL);
  lcx = ccx; lcz = ccz; lpx = px; lpz = pz;
  const nt = [0, 0, 0]; let nr = 0, ns = 0, nm1 = 0, nm2 = 0, nms = 0;
  const near = new Set();                           // pools anywhere in the laid area
  for (let j = Math.floor((ccz - REACH) * CELL / CHUNK) - 1; j <= Math.floor((ccz + REACH) * CELL / CHUNK) + 1; j++)
    for (let i = Math.floor((ccx - REACH) * CELL / CHUNK) - 1; i <= Math.floor((ccx + REACH) * CELL / CHUNK) + 1; i++) { const p = poolOf(i, j); if (p) near.add(p); }
  const pools = [...near];
  const ok = (x, z) => Math.hypot(x, z) > 14 && !pools.some(p => Math.hypot(p.x - x, p.z - z) < p.r * 1.5);
  const dens = T.dens;
  for (let cz = ccz - REACH; cz <= ccz + REACH; cz++) for (let cx = ccx - REACH; cx <= ccx + REACH; cx++) {
    if ((cx - ccx) ** 2 + (cz - ccz) ** 2 > REACH * REACH) continue;        // round, not square: the fog hides the edge
    // mushrooms (jungle) or spikes (lava)
    if (dens.mush) {
      const n = Math.floor(dens.mush + rnd(cx, cz, 10));
      for (let m = 0; m < n && nms < CAP.mush; m++) {
        const x = (cx + rnd(cx, cz, 11 + m)) * CELL, z = (cz + rnd(cx, cz, 13 + m)) * CELL;
        if (!ok(x, z)) continue;
        const y = heightAt(x, z), sz = 0.5 + rnd(cx, cz, 15 + m) * 1.8, h = 0.5 + rnd(cx, cz, 17 + m) * 1.2, rot = rnd(cx, cz, 19 + m) * 6;
        put(P.stems, nms, x, y - 0.05, z, rot, sz, h * sz, sz);
        const cs = sz * (0.8 + rnd(cx, cz, 21 + m) * 0.6), ch = sz * (0.5 + rnd(cx, cz, 23 + m) * 0.4);
        if (rnd(cx, cz, 25 + m) < 0.5) put(P.caps1, nm1++, x, y + h * sz - 0.05, z, rot, cs, ch, cs);
        else put(P.caps2, nm2++, x, y + h * sz - 0.05, z, rot, cs, ch, cs);
        nms++;
      }
    }
    if (dens.spike) {
      const n = Math.floor(dens.spike + rnd(cx, cz, 30));
      for (let m = 0; m < n && ns < CAP.spike - 1; m++) {
        const x = (cx + rnd(cx, cz, 31 + m)) * CELL, z = (cz + rnd(cx, cz, 33 + m)) * CELL;
        if (!ok(x, z)) continue;
        const y = heightAt(x, z), sz = 0.5 + rnd(cx, cz, 35 + m) ** 2 * 2.2;
        put(P.spikes, ns++, x, y - 0.1, z, rnd(cx, cz, 37 + m) * 6, sz, sz * (1.8 + rnd(cx, cz, 39 + m) * 2.4), sz);
        put(P.spikes, ns++, x + (rnd(cx, cz, 41 + m) - 0.5) * 1.6, heightAt(x + 0.5, z) - 0.1, z + (rnd(cx, cz, 43 + m) - 0.5) * 1.6, rnd(cx, cz, 45 + m) * 6, sz * 0.6, sz * (1.2 + rnd(cx, cz, 47 + m) * 1.6), sz * 0.6);
      }
    }
    if (rnd(cx, cz, 50) < dens.tree) {
      const x = (cx + rnd(cx, cz, 51)) * CELL, z = (cz + rnd(cx, cz, 52)) * CELL, v = Math.floor(rnd(cx, cz, 53) * 3);
      if (ok(x, z) && nt[v] < CAP.tree) { const sc = 0.8 + rnd(cx, cz, 54) * 0.9; put(P.trees[v], nt[v]++, x, heightAt(x, z) - 0.3, z, rnd(cx, cz, 55) * 6.28, sc, sc * (0.9 + rnd(cx, cz, 56) * 0.4), sc); }
    }
    if (rnd(cx, cz, 60) < dens.rock) {
      const x = (cx + rnd(cx, cz, 61)) * CELL, z = (cz + rnd(cx, cz, 62)) * CELL;
      if (ok(x, z) && nr < CAP.rock) { const r1 = rnd(cx, cz, 63), sz = 0.4 + r1 * r1 * 3.2; put(P.rocks, nr++, x, heightAt(x, z) + sz * 0.15, z, rnd(cx, cz, 64) * 6, sz, sz * 0.6, sz * (0.8 + rnd(cx, cz, 65) * 0.5)); }
    }
  }
  P.trees.forEach((m, v) => { m.count = nt[v]; m.instanceMatrix.needsUpdate = true; });
  P.rocks.count = nr; P.rocks.instanceMatrix.needsUpdate = true;
  if (P.spikes) { P.spikes.count = ns; P.spikes.instanceMatrix.needsUpdate = true; }
  if (P.stems) {
    P.stems.count = nms; P.caps1.count = nm1; P.caps2.count = nm2;
    [P.stems, P.caps1, P.caps2].forEach(m => { m.instanceMatrix.needsUpdate = true; });
  }
  layPools(pools, px, pz);
}

/* ---------- glowing pools / lava lakes: a few discs, moved to wherever the nearest pools are ---------- */
let poolDiscs = [];
function buildPoolDiscs() {
  const tex = canvasTex(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    T.pool.stops.forEach(([at, c]) => gr.addColorStop(at, c));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  poolDiscs = [];
  const geo = new THREE.CircleGeometry(1, 28);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.visible = false;
    add(m); poolDiscs.push(m);
  }
}
function layPools(pools, px, pz) {
  const list = pools.filter(p => Math.hypot(p.x - px, p.z - pz) < 170).sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz)).slice(0, poolDiscs.length);
  poolDiscs.forEach((m, i) => {
    const p = list[i]; m.visible = !!p;
    if (p) { m.position.set(p.x, p.level + 0.12, p.z); m.scale.setScalar(p.r * 1.25); }
  });
}

/* ---------- sky and lights ---------- */
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(T.sky.top) }, mid: { value: new THREE.Color(T.sky.mid) }, hor: { value: new THREE.Color(T.fog) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
      void main(){ float h = normalize(vP).y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.9, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat);
  sky.renderOrder = -10;
  add(sky);
  // a few stars (floating embers, in the Lava Lands)
  const n = 260, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rnd(i, 1, 70) * 6.28, e = Math.acos(1 - rnd(i, 2, 71) * 0.9) * 0.95, d = 280;
    p[i * 3] = Math.sin(e) * Math.cos(a) * d; p[i * 3 + 1] = Math.cos(e) * d; p[i * 3 + 2] = Math.sin(e) * Math.sin(a) * d;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: T.stars.color, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: T.stars.opacity, depthWrite: false }));
  stars.frustumCulled = false; sky.add(stars);
}

function buildLights() {
  const L = T.lights;
  // intensities x PI: modern three.js lights are "physical", so this matches the prototype's look
  add(new THREE.HemisphereLight(L.hemiSky, L.hemiGround, L.hemi * Math.PI));
  sun = new THREE.DirectionalLight(L.sun, L.sunI * Math.PI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 60 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  add(sun); add(sun.target);
  const rim = new THREE.DirectionalLight(L.rim, L.rimI * Math.PI);
  rim.position.set(-8, 5, -7); add(rim);
  if (!fireLight) { fireLight = new THREE.PointLight(0xa040ff, 0, 14, 1.6); scene.add(fireLight); }   // survives biome changes
}

export function getFireLight() { return fireLight; }
export const worldName = () => T.name;

function disposeWorld() {
  for (const c of [...chunks.values()]) dropChunk(c);
  lastC = null;
  for (const o of built) {
    scene.remove(o);
    o.traverse(c => {
      if (c.isInstancedMesh) c.dispose();
      if (c.geometry) c.geometry.dispose();
      const ms = c.material ? [].concat(c.material) : [];
      ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  if (groundMat) groundMat.dispose();
  built = []; pulses = []; mats = {}; poolDiscs = []; poolCache.clear(); P = null;
}

/** build (or rebuild) a biome. Called once at start and again when the chosen dragon lives somewhere else. */
export function buildWorld(sc, id = 'void') {
  scene = sc;
  if (built.length || chunks.size) disposeWorld();
  T = THEMES[id] || THEMES.void;
  Object.assign(WORLD_TUNE, WORLD_BASE, T.tune);
  WORLD_TUNE.fogColor = T.fog;
  scene.background = new THREE.Color(T.fog);
  scene.fog = new THREE.Fog(T.fog, WORLD_TUNE.fogNear, WORLD_TUNE.fogFar);

  groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  if (T.terrain.vein) {
    // bright vertex colours (the cracks) also glow by themselves, so lava lines stay lit even in shade
    groundMat.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += max(vColor.rgb - vec3(0.42), 0.0) * 2.4;');
    };
  }
  indexAttr = chunkIndex();
  G.heightAt = heightAt;
  pcx = pcz = 1e9; lcx = lcz = 1e9; lpx = lpz = 1e9;
  updateChunks(0, 0, true);                          // everything around the start, before the first frame
  buildSky();
  buildLights();
  buildPropMeshes();
  buildPoolDiscs();
  layProps(0, 0);
  return T;                                         // the theme (main.js reads its particle colours)
}

/** per-frame: tiles and props follow the player, the sun follows the dragon (so the small shadow map covers it), glow pulses */
export function updateWorld(dt, camPos) {
  const t = G.t;
  const px = S.pos.x, pz = S.pos.z;
  // the player was moved far away at once (Start over): build the ground under them straight away
  const jumped = Math.abs(Math.floor(px / CHUNK) - pcx) > 1 || Math.abs(Math.floor(pz / CHUNK) - pcz) > 1;
  updateChunks(px, pz, jumped && pcx !== 1e9);
  pcx = Math.floor(px / CHUNK); pcz = Math.floor(pz / CHUNK);
  if (Math.hypot(px - lpx, pz - lpz) >= LAY_STEP) layProps(px, pz);
  sun.position.set(px + 6, S.gy + 14, pz + 7);
  sun.target.position.set(px, S.gy, pz);
  sky.position.copy(camPos);
  for (const p of pulses) p.mat.emissiveIntensity = p.base + p.amp * Math.sin(t * p.speed + p.phase);
  poolDiscs.forEach((m, i) => { m.material.opacity = 0.75 + 0.2 * Math.sin(t * 1.1 + i * 1.7); });
}
