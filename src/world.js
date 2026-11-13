import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { V, rng, smoothstep, lerp, canvasTex, clamp } from './util.js';
import { G, S } from './state.js';

/*
 * Biomes (a self-contained module: terrain, props, lighting, sky, ambience).
 * Each one is a THEME below: colours, how many props, and which props. buildWorld(scene, id) builds one,
 * and tears down the previous one, so every dragon can have its own home.
 */

export const WORLD_TUNE = {
  half: 120,            // terrain grid covers -half..half (play area is ~200 x 200 inside)
  hillHeight: 13,       // overall hill size (bigger = taller hills)
  hillScale: 48,        // distance between hills
  fogColor: 0x20123a,
  fogNear: 26, fogFar: 125,
  mushrooms: 300, trees: 120, rocks: 110, pools: 7,
  poolR: 4.5, poolRSpan: 4, poolDepth: 0.3,
};

const WORLD_BASE = { ...WORLD_TUNE };               // the defaults; each theme overrides some of them

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
    props: 'jungle',
    rock: 0x2b2140, rockGlow: 0,
    trunk: 0x1d1429, bulb: { color: 0x3a1470, emissive: 0x9a40ff },
    motes: 0xb36bff, dust: 0x8a78a8,
  },

  /* Emberclaw's home: black basalt, glowing lava lakes and cracks, charred trees, obsidian spikes, embers */
  lava: {
    name: 'Lava Lands',
    tune: { hillHeight: 17, hillScale: 40, fogNear: 22, fogFar: 108, pools: 9, trees: 90, rocks: 150, poolR: 6, poolRSpan: 6, poolDepth: 0.7 },
    fog: 0x2e0d05,
    sky: { top: 0x0c0302, mid: 0x3d1208 },
    stars: { color: 0xffa868, opacity: 0.55 },
    terrain: { c1: 0x080403, c2: 0x140a08, c3: 0x241210, pool: 0x5a1e0c, poolMix: 0.75, vein: 1 },
    lights: { hemiSky: 0xff9a62, hemiGround: 0x2c0a04, hemi: 0.38, sun: 0xffc890, sunI: 1.25, rim: 0xff4a14, rimI: 1.3 },
    pool: { stops: [[0, 'rgba(255,240,150,1)'], [0.45, 'rgba(255,130,25,.97)'], [0.85, 'rgba(210,50,0,.6)'], [1, 'rgba(120,10,0,0)']] },
    props: 'volcano',
    rock: 0x2a1a16, rockGlow: 0.22,
    trunk: 0x140c0a, bulb: { color: 0x4a1608, emissive: 0xff6a10 },
    motes: 0xff8a2a, dust: 0x6b5048,
  },
};
export const WORLD_IDS = Object.keys(THEMES);

/* ---------- height map (value noise) ---------- */
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
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
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x / WORLD_TUNE.hillScale + 11.3, z / WORLD_TUNE.hillScale - 7.1) - 0.5) * WORLD_TUNE.hillHeight;
  const rim = smoothstep(84, 118, r);
  h += rim * rim * 24;                                  // hills rise around the edge: a natural wall
  h = lerp(h, 0, 1 - smoothstep(9, 26, r));            // flat meadow where the dragon starts
  return h;
}

let pools = [];                // {x,z,r,level}
function stampedHeight(x, z) {
  let h = baseHeight(x, z);
  for (const p of pools) {
    const d = Math.hypot(x - p.x, z - p.z);
    const w = 1 - smoothstep(p.r * 0.85, p.r * 1.7, d);
    if (w > 0) h = lerp(h, p.level, w);
  }
  return h;
}

/* fast height lookup from a precomputed 1-unit grid (bilinear) */
let grid = null, N = 0;
function heightAt(x, z) {
  const H = WORLD_TUNE.half;
  const gx = clamp(x + H, 0, N - 1.001), gz = clamp(z + H, 0, N - 1.001);
  const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
  const i = iz * N + ix;
  const a = grid[i], b = grid[i + 1], c = grid[i + N], d = grid[i + N + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/* ---------- builders ---------- */
let sun, fireLight, sky, scene, T = THEMES.void;
let mats = {}, poolMeshes = [], pulses = [];
let built = [];                                   // everything the current biome added to the scene, so it can be removed

const add = o => { scene.add(o); built.push(o); return o; };
/** things that gently pulse their glow */
const pulse = (mat, base, amp, speed, phase = 0) => pulses.push({ mat, base, amp, speed, phase });

function disposeWorld() {
  for (const o of built) {
    scene.remove(o);
    o.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      const ms = c.material ? [].concat(c.material) : [];
      ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
  }
  built = []; poolMeshes = []; pulses = []; mats = {};
}

function buildGrid() {
  const H = WORLD_TUNE.half;
  N = H * 2 + 1;
  // pools first (their level comes from the un-stamped ground)
  const r = rng(99), list = [];
  for (let tries = 0; list.length < WORLD_TUNE.pools && tries < 200; tries++) {
    const a = r() * Math.PI * 2, d = 28 + r() * 52, rad = WORLD_TUNE.poolR + r() * WORLD_TUNE.poolRSpan;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (list.some(p => Math.hypot(p.x - x, p.z - z) < 24)) continue;
    list.push({ x, z, r: rad, level: baseHeight(x, z) - WORLD_TUNE.poolDepth });
  }
  pools = list;
  grid = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) grid[iz * N + ix] = stampedHeight(ix - H, iz - H);
  G.heightAt = heightAt;
}

function buildTerrain() {
  const H = WORLD_TUNE.half, STEP = 2, M = H * 2 / STEP + 1;
  const pos = new Float32Array(M * M * 3), col = new Float32Array(M * M * 3);
  const { c1: a1, c2: a2, c3: a3, pool, poolMix, vein } = T.terrain;
  const c1 = new THREE.Color(a1), c2 = new THREE.Color(a2), c3 = new THREE.Color(a3), poolC = new THREE.Color(pool), tmp = new THREE.Color();
  const veinC = new THREE.Color(1.0, 0.52, 0.1);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = -H + i * STEP, z = -H + j * STEP, y = heightAt(x, z), n = fbm(x / 9 + 3, z / 9 + 5);
    const o = (j * M + i) * 3;
    pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
    tmp.copy(c1).lerp(c2, clamp(n * 1.3 + y * 0.04, 0, 1)).lerp(c3, clamp((n - 0.55) * 2.2, 0, 0.7));
    for (const p of pools) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 2) tmp.lerp(poolC, (1 - d / (p.r * 2)) * poolMix); }
    if (vein) {                                       // glowing cracks: thin bright lines where a second noise crosses its middle
      const ridge = 1 - Math.abs(2 * fbm(x / 11 + 21, z / 11 - 13) - 1);
      tmp.lerp(veinC, smoothstep(0.915, 0.985, ridge) * 0.9 * smoothstep(12, 30, Math.hypot(x, z)));
    }
    col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
  }
  const idx = new Uint32Array((M - 1) * (M - 1) * 6);
  let q = 0;
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < M - 1; i++) {
    const a = j * M + i, b = a + 1, c = a + M, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  if (vein) {
    // bright vertex colours (the cracks) also glow by themselves, so lava lines stay lit even in shade
    mat.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += max(vColor.rgb - vec3(0.42), 0.0) * 2.4;');
    };
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  add(mesh);
}

/** random spots on the ground, away from the start meadow and the pools */
function scatter(count, rand, minR, maxR) {
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 8; tries++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(lerp(minR * minR, maxR * maxR, rand()));
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (pools.some(p => Math.hypot(p.x - x, p.z - z) < p.r * 1.5)) continue;
    out.push({ x, z, y: heightAt(x, z) });
  }
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V(), _p = new V(), _e = new THREE.Euler();
function place(mesh, i, x, y, z, rotY, sx, sy, sz) {
  _e.set(0, rotY, 0); _q.setFromEuler(_e);
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

function buildMushrooms() {
  const r = rng(7), spots = scatter(WORLD_TUNE.mushrooms, r, 14, 100);
  mats.stem = new THREE.MeshStandardMaterial({ color: 0x2c2140, roughness: 0.9 });
  mats.cap1 = new THREE.MeshStandardMaterial({ color: 0x3a1470, emissive: 0x8a2cff, emissiveIntensity: 0.9, roughness: 0.5 });
  mats.cap2 = new THREE.MeshStandardMaterial({ color: 0x5a2290, emissive: 0xb050ff, emissiveIntensity: 0.75, roughness: 0.5 });
  pulse(mats.cap1, 0.9, 0.2, 1.6); pulse(mats.cap2, 0.75, 0.2, 1.3, 2);
  const stemG = new THREE.CylinderGeometry(0.08, 0.13, 1, 6).translate(0, 0.5, 0);
  const capG = new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  const stems = new THREE.InstancedMesh(stemG, mats.stem, spots.length);
  const n1 = spots.length >> 1, n2 = spots.length - n1;
  const caps1 = new THREE.InstancedMesh(capG, mats.cap1, n1), caps2 = new THREE.InstancedMesh(capG, mats.cap2, n2);
  spots.forEach((s, i) => {
    const sz = 0.5 + r() * 1.8, h = 0.5 + r() * 1.2, rot = r() * 6;
    place(stems, i, s.x, s.y - 0.05, s.z, rot, sz, h * sz, sz);
    const cs = sz * (0.8 + r() * 0.6);
    if (i < n1) place(caps1, i, s.x, s.y + h * sz - 0.05, s.z, rot, cs, sz * (0.5 + r() * 0.4), cs);
    else place(caps2, i - n1, s.x, s.y + h * sz - 0.05, s.z, rot, cs, sz * (0.5 + r() * 0.4), cs);
  });
  [stems, caps1, caps2].forEach(m => { m.frustumCulled = false; add(m); });
}

/** Lava Lands: jagged obsidian spikes with a hot glow, in clumps */
function buildSpikes() {
  const r = rng(11), spots = scatter(230, r, 14, 100);
  mats.spike = new THREE.MeshStandardMaterial({ color: 0x140a08, emissive: 0xc82a05, emissiveIntensity: 0.4, roughness: 0.55, flatShading: true });
  pulse(mats.spike, 0.4, 0.15, 1.4);
  const geo = new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, mats.spike, spots.length * 2);
  let n = 0;
  spots.forEach(s => {
    const sz = 0.5 + r() * r() * 2.2;
    place(mesh, n++, s.x, s.y - 0.1, s.z, r() * 6, sz, sz * (1.8 + r() * 2.4), sz);
    place(mesh, n++, s.x + (r() - 0.5) * 1.6, s.y - 0.1, s.z + (r() - 0.5) * 1.6, r() * 6, sz * 0.6, sz * (1.2 + r() * 1.6), sz * 0.6);   // a smaller one beside it
  });
  mesh.frustumCulled = false;
  add(mesh);
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
  const r = rng(seed), trunkParts = [], glowParts = [];
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

function buildTrees() {
  mats.trunk = new THREE.MeshStandardMaterial({ color: T.trunk, roughness: 1 });
  mats.bulb = new THREE.MeshStandardMaterial({ color: T.bulb.color, emissive: T.bulb.emissive, emissiveIntensity: 0.9, roughness: 0.6 });
  pulse(mats.bulb, 0.9, 0.25, 0.9);
  const r = rng(31), spots = scatter(WORLD_TUNE.trees, r, 16, 104), variants = 3;
  for (let v = 0; v < variants; v++) {
    const mine = spots.filter((_, i) => i % variants === v);
    const mesh = new THREE.InstancedMesh(makeTree(5 + v * 17), [mats.trunk, mats.bulb], mine.length);
    mine.forEach((s, i) => { const sc = 0.8 + r() * 0.9; place(mesh, i, s.x, s.y - 0.3, s.z, r() * 6.28, sc, sc * (0.9 + r() * 0.4), sc); });
    mesh.frustumCulled = false;
    add(mesh);
  }
}

function buildRocks() {
  const r = rng(53), spots = scatter(WORLD_TUNE.rocks, r, 12, 104);
  mats.rock = new THREE.MeshStandardMaterial({ color: T.rock, roughness: 1, flatShading: true, emissive: 0xff3a08, emissiveIntensity: T.rockGlow });
  const mesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.rock, spots.length);
  spots.forEach((s, i) => { const sz = 0.4 + r() * r() * 3.2; place(mesh, i, s.x, s.y + sz * 0.15, s.z, r() * 6, sz, sz * 0.6, sz * (0.8 + r() * 0.5)); });
  mesh.frustumCulled = false;
  add(mesh);
}

function buildPools() {
  const tex = canvasTex(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    T.pool.stops.forEach(([at, c]) => gr.addColorStop(at, c));
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  pools.forEach(p => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r * 1.25, 28), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, p.level + 0.12, p.z);
    add(m); poolMeshes.push(m);
  });
}

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
  const n = 260, p = new Float32Array(n * 3), r = rng(5);
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, e = Math.acos(1 - r() * 0.9) * 0.95, d = 280;
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

/** build (or rebuild) a biome. Called once at start and again when the chosen dragon lives somewhere else. */
export function buildWorld(sc, id = 'void') {
  scene = sc;
  if (built.length) disposeWorld();
  T = THEMES[id] || THEMES.void;
  Object.assign(WORLD_TUNE, WORLD_BASE, T.tune);
  WORLD_TUNE.fogColor = T.fog;
  scene.background = new THREE.Color(T.fog);
  scene.fog = new THREE.Fog(T.fog, WORLD_TUNE.fogNear, WORLD_TUNE.fogFar);
  buildGrid();
  buildTerrain();
  buildSky();
  buildLights();
  if (T.props === 'volcano') buildSpikes(); else buildMushrooms();
  buildTrees();
  buildRocks();
  buildPools();
  return T;                                         // the theme (main.js reads its particle colours)
}

/** per-frame: sun follows the dragon (so the small shadow map covers it), fog thickens at the edge, glow pulses */
export function updateWorld(dt, camPos) {
  const t = G.t;
  sun.position.set(S.pos.x + 6, S.gy + 14, S.pos.z + 7);
  sun.target.position.set(S.pos.x, S.gy, S.pos.z);
  const e = smoothstep(0, 1, S.edge || 0);
  scene.fog.near = lerp(WORLD_TUNE.fogNear, 6, e);
  scene.fog.far = lerp(WORLD_TUNE.fogFar, 48, e);
  sky.position.copy(camPos);
  for (const p of pulses) p.mat.emissiveIntensity = p.base + p.amp * Math.sin(t * p.speed + p.phase);
  poolMeshes.forEach((m, i) => { m.material.opacity = 0.75 + 0.2 * Math.sin(t * 1.1 + i * 1.7); });
}
