import * as THREE from 'three';
import { V, canvasTex } from './util.js';
import { G, S, input } from './state.js';

const TUNE_MIN = 2.4;                 // never ask the dragon to fly lower than this above the ground

/*
 * RING CHALLENGE: at the start there is ONE fire ring ahead of the dragon, and no arrow. Fly through it and the race
 * begins: the 60 second clock starts, a winding trail of rings appears, and an arrow points at the next one. Every ring you
 * pass is +1 and a new ring appears at the far end of the trail. When time is up main.js shows the score.
 * states: 'free' (looking for the first ring) > 'run' > 'over'
 */

/* RING: tune the challenge here (world units, seconds) */
export const RING = {
  radius: 8,             // how big the ring is (the dragon is about 7 long)
  tube: 1.0,             // how thick the fire is
  firstDistance: 60,     // how far ahead the very first ring is
  spacing: [60, 110],    // distance from one ring to the next (random in this range, so no two rounds match)
  gentle: 0.12,          // on a straight stretch the trail wanders only this much (radians, +/-)
  sharp: [0.6, 1.7],     // a sharp bend turns the trail by this much (radians): you have to slow down for it (the big ones are hairpins)
  straights: [2, 4],     // how many near-straight rings come after a sharp bend
  ahead: 6,              // rings laid out at once (they glow through the fog, so you can see the next bends coming)
  time: 60,              // length of the challenge
  forgive: 1.1,          // how generous the hit test is (1.1 = the ring counts out to 110% of its radius)
  lowest: 0.9,           // the lowest rings: centre this many radii above the ground (skimming the ground)
  highest: 55,           // the highest rings: centre this far above the ground
  climb: [14, 34],       // how much higher or lower the next ring is than the one before (random in this range)
};

export const game = { state: 'free', score: 0, time: RING.time };

const SLOTS = 8, EMBERS = 90;
let scene = null, hooks = {}, slots = [], rings = [], dying = [], embers = null, emberData = [], ready = false;
const tail = { pos: new V(), hdg: 0, streak: 0, off: 10, y: null };
const _P = new V(), _d = new V(), _u = new V(), _v = new V(), _n = new V();

/** call once, after the scene exists. hooks: { start(), score(n), time(sec), end(score) } */
export function initRings(sc, h) {
  scene = sc; hooks = h;
  const geo = new THREE.TorusGeometry(RING.radius, RING.tube, 8, 40);
  const glowGeo = new THREE.TorusGeometry(RING.radius, RING.tube * 2.2, 6, 40);
  for (let i = 0; i < SLOTS; i++) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, fog: false }));
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    g.add(core, glow); g.visible = false; g.frustumCulled = false;
    scene.add(g);
    slots.push({ group: g, core, glow, used: false });
  }
  // embers drifting up off the fire (one Points object for every ring)
  const tex = canvasTex(64, 64, c => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  const n = SLOTS * EMBERS, pos = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(0);
  for (let i = 0; i < n; i++) emberData.push({ a: Math.random() * 6.283, ph: Math.random(), sp: 0.5 + Math.random() * 0.9, off: (Math.random() - 0.5) * 1.4 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  embers = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 2.4, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  embers.frustumCulled = false;
  scene.add(embers);
  ready = true;
}

const takeSlot = () => { const s = slots.find(x => !x.used); if (s) s.used = true; return s; };

/** how much the trail turns at the next ring: a few near-straight rings, then a sharp bend, and so on */
function nextTurn() {
  if (tail.streak > 0) { tail.streak--; return (Math.random() * 2 - 1) * RING.gentle; }
  tail.streak = RING.straights[0] + Math.floor(Math.random() * (RING.straights[1] - RING.straights[0] + 1));
  return (Math.random() < 0.5 ? -1 : 1) * (RING.sharp[0] + Math.random() * (RING.sharp[1] - RING.sharp[0]));
}

/** how high above the ground the next ring is: it jumps up or down by a good amount, so the course has real highs and lows */
function nextOffset() {
  const lo = RING.radius * RING.lowest, hi = RING.highest, mid = (lo + hi) / 2;
  const up = tail.off < mid ? Math.random() < 0.7 : Math.random() < 0.3;       // low rings are usually followed by a climb, high ones by a dive
  const d = RING.climb[0] + Math.random() * (RING.climb[1] - RING.climb[0]);
  return Math.min(hi, Math.max(lo, tail.off + (up ? d : -d)));
}

/** put one more ring at the end of the trail (gap, turn and height are chosen at random unless given) */
function addRing(gap = RING.spacing[0] + Math.random() * (RING.spacing[1] - RING.spacing[0]), turn = nextTurn(), off = nextOffset()) {
  const slot = takeSlot();
  if (!slot) return;
  tail.hdg += turn;
  tail.pos.x += Math.sin(tail.hdg) * gap; tail.pos.z += Math.cos(tail.hdg) * gap;
  const y = G.heightAt(tail.pos.x, tail.pos.z) + off;
  const pos = new V(tail.pos.x, y, tail.pos.z);
  // the ring faces along the way the trail runs, including up or down
  const n = new V(Math.sin(tail.hdg) * gap, tail.y === null ? 0 : y - tail.y, Math.cos(tail.hdg) * gap).normalize();
  tail.off = off; tail.y = y;
  slot.group.position.copy(pos); slot.group.lookAt(pos.x + n.x, pos.y, pos.z + n.z);     // the ring faces along the trail
  slot.group.scale.setScalar(1); slot.group.visible = true;
  slot.core.material.opacity = 1;
  rings.push({ pos, n, slot, prevS: null, off });
}

function clearRings() {
  rings.forEach(r => { r.slot.used = false; r.slot.group.visible = false; });
  dying.forEach(r => { r.slot.used = false; r.slot.group.visible = false; });
  rings = []; dying = [];
}

/** the start of a round: ONE ring straight ahead of the dragon */
function layFirst() {
  clearRings();
  tail.pos.set(S.pos.x, 0, S.pos.z); tail.hdg = S.heading; tail.streak = 0; tail.y = null;
  addRing(RING.firstDistance, 0, RING.radius * RING.lowest + 2 + Math.random() * 3);     // the first ring is low and easy
}

/** a whole trail of rings, starting from the dragon (used if you wander far away in the middle of a round) */
function layTrail() {
  clearRings();
  tail.pos.set(S.pos.x, 0, S.pos.z); tail.hdg = S.heading; tail.streak = 2; tail.off = 12; tail.y = null;       // the first rings are straight ahead
  while (rings.length < RING.ahead) addRing();
}

/** back to waiting for the first ring (Play, Play again, Start over, new dragon) */
export function resetRings() {
  if (!ready) return;
  game.state = 'free'; game.score = 0; game.time = RING.time;
  layFirst(); S.assistAlt = null;
  hooks.score && hooks.score(0); hooks.time && hooks.time(RING.time);
}
export function hideRings() { if (!ready) return; clearRings(); game.state = 'free'; S.assistAlt = null; if (embers) embers.visible = false; }

function collect(ring) {
  rings.splice(rings.indexOf(ring), 1);
  dying.push({ slot: ring.slot, t: 0 });
  if (game.state === 'free') {                                       // the first ring: the race begins
    game.state = 'run'; game.time = RING.time; hooks.start && hooks.start();
    tail.pos.set(ring.pos.x, 0, ring.pos.z); tail.hdg = Math.atan2(ring.n.x, ring.n.z); tail.streak = 2; tail.off = ring.off; tail.y = ring.pos.y;   // the trail carries on from here
  }
  game.score++;
  hooks.score && hooks.score(game.score);
  while (rings.length < RING.ahead && (game.state === 'run')) addRing();
}

export function updateRings(dt) {
  if (!ready) return;
  if (game.state === 'over') return;
  if (embers && !embers.visible) embers.visible = true;
  const m = G.model;
  _P.set(S.pos.x, m.position.y + 1.6, S.pos.z);                       // the middle of the dragon's body

  // did the dragon fly through a ring? (it crossed the ring's flat face, close enough to the middle)
  for (const r of rings.slice()) {
    _d.subVectors(_P, r.pos);
    const s = _d.dot(r.n);
    if (r.prevS !== null && r.prevS * s < 0) {
      _v.copy(r.n).multiplyScalar(s); _d.sub(_v);
      if (_d.length() < RING.radius * RING.forgive) { collect(r); continue; }
    }
    r.prevS = s;
  }
  // wandered far from every ring: lay new ones ahead of the dragon
  if (rings.length && rings.every(r => r.pos.distanceTo(_P) > 300)) { if (game.state === 'run') layTrail(); else layFirst(); }
  // which way is the next ring? A little arrow at the top of the screen, once the race has begun and when it is not straight ahead.
  // (Before the first ring there is no arrow: you look for it yourself.)
  if (hooks.arrow && game.state !== 'run') hooks.arrow(0, false);
  else if (hooks.arrow && rings[0]) {
    const a = Math.atan2(rings[0].pos.x - _P.x, rings[0].pos.z - _P.z), rel = Math.atan2(Math.sin(a - input.camYaw), Math.cos(a - input.camYaw));
    hooks.arrow(-rel * 57.2958, Math.abs(rel) > 0.4);        // degrees, clockwise on screen; +rel = ring is to the left
  }

  // the clock
  if (game.state === 'run') {
    game.time -= dt;
    if (game.time <= 0) { game.time = 0; game.state = 'over'; hooks.time && hooks.time(0); clearRings(); S.assistAlt = null; embers.visible = false; hooks.end && hooks.end(game.score); return; }
    hooks.time && hooks.time(game.time);
  }

  // glide to the height of the next ring (see assistAlt in motion.js)
  S.assistAlt = rings[0] ? Math.max(TUNE_MIN, rings[0].pos.y - 1.6 - S.gy) : null;

  // looks: the next ring in line glows golden-orange, the rest red-orange; fire flickers; a ring you just passed swells and fades
  const t = G.t;
  slots.forEach(sl => { if (sl.used) { sl.glow.material.opacity = 0.16 + 0.06 * Math.sin(t * 7 + sl.group.id); } });
  rings.forEach((r, i) => {
    r.slot.core.material.color.set(i === 0 ? 0xffa21c : 0xff4e0c);
    r.slot.glow.material.color.set(i === 0 ? 0xff8a1e : 0xff5a14);
    r.slot.group.scale.setScalar(i === 0 ? 1 + 0.04 * Math.sin(t * 6) : 1);
  });
  for (const r of dying.slice()) {
    r.t += dt;
    const u = r.t / 0.4;
    if (u >= 1) { r.slot.used = false; r.slot.group.visible = false; dying.splice(dying.indexOf(r), 1); continue; }
    r.slot.group.scale.setScalar(1 + u * 0.9); r.slot.core.material.opacity = 1 - u; r.slot.glow.material.opacity = 0.5 * (1 - u);
  }
  updateEmbers(dt);
}

/** embers: little sparks that ride round each ring and float upward */
function updateEmbers(dt) {
  const pos = embers.geometry.attributes.position.array, col = embers.geometry.attributes.color.array;
  let i = 0;
  for (const sl of slots) {
    const ring = rings.find(r => r.slot === sl);
    for (let k = 0; k < EMBERS; k++, i++) {
      const e = emberData[i];
      if (!ring) { col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0; continue; }
      e.ph += dt * e.sp * 0.6; if (e.ph > 1) { e.ph -= 1; e.a = Math.random() * 6.283; }
      _u.set(-ring.n.z, 0, ring.n.x).normalize();                      // sideways across the ring face
      _v.crossVectors(ring.n, _u);                                      // up across the ring face
      const r = RING.radius + e.off, c = Math.cos(e.a) * r, s = Math.sin(e.a) * r;
      pos[i * 3] = ring.pos.x + _u.x * c + _v.x * s;
      pos[i * 3 + 1] = ring.pos.y + _u.y * c + _v.y * s + e.ph * 4.5;
      pos[i * 3 + 2] = ring.pos.z + _u.z * c + _v.z * s;
      const f = (1 - e.ph) * (ring === rings[0] ? 1 : 0.75);
      col[i * 3] = 1.0 * f; col[i * 3 + 1] = (0.55 + 0.25 * (1 - e.ph)) * f; col[i * 3 + 2] = 0.12 * f;
    }
  }
  embers.geometry.attributes.position.needsUpdate = true; embers.geometry.attributes.color.needsUpdate = true;
}

/** for tests in the browser: where is the next ring? */
export function nextRing() { return rings[0] ? { pos: rings[0].pos.clone(), n: rings[0].n.clone() } : null; }
export const ringCount = () => rings.length;
