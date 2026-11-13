import * as THREE from 'three';
import { V, canvasTex } from './util.js';
import { G, S } from './state.js';

/*
 * The prototype used one THREE.Sprite per particle (hundreds of draw calls).
 * On a phone that is the first thing to hurt, so every effect here is a
 * THREE.Points object: ONE draw call for all of its particles.
 */

export const glowTex = canvasTex(64, 64, g => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
});
const starTex = canvasTex(64, 64, g => {
  g.translate(32, 32);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 10);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 10, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  for (let r = 0; r < 4; r++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -30); g.lineTo(3.2, -3.2); g.lineTo(-3.2, -3.2); g.closePath(); g.fill(); }
  g.rotate(Math.PI / 4); g.globalAlpha = 0.6;
  for (let r = 0; r < 4; r++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -16); g.lineTo(2, -2); g.lineTo(-2, -2); g.closePath(); g.fill(); }
});

const POINT_VS = `
attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
uniform float uScale;
varying float vA; varying float vR; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 320.0);
  vA = aAlpha; vR = aRot; vC = aColor;
}`;
const POINT_FS = `
uniform sampler2D map;
varying float vA; varying float vR; varying vec3 vC;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vR), s = sin(vR);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
  float a = texture2D(map, p).a * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vC, a);
}`;

const allSystems = [];
/** a pool of `count` particles drawn as one Points object */
class Particles {
  constructor(count, map, additive) {
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3); this.col = new Float32Array(count * 3);
    this.size = new Float32Array(count); this.alpha = new Float32Array(count); this.rot = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    this.uniforms = { map: { value: map }, uScale: { value: 800 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: POINT_VS, fragmentShader: POINT_FS,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.items = Array.from({ length: count }, (_, i) => ({ i, alive: false, age: 0, life: 1, v: new V(), p: new V() }));
    this.next = 0;
    G.scene.add(this.points);
    allSystems.push(this);
  }
  alloc() { const p = this.items[this.next]; this.next = (this.next + 1) % this.count; return p; }
  write(p, color, alpha, size, rot) {
    const i = p.i;
    this.pos[i * 3] = p.p.x; this.pos[i * 3 + 1] = p.p.y; this.pos[i * 3 + 2] = p.p.z;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    this.alpha[i] = alpha; this.size[i] = size; this.rot[i] = rot;
  }
  kill(p) { p.alive = false; this.alpha[p.i] = 0; this.size[p.i] = 0; }
  upload() {
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aRot.needsUpdate = true;
  }
}

/** call when the screen size changes: converts world size to pixels for point sprites */
export function setPointScale(pxHeight, fovDeg) {
  const s = pxHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  allSystems.forEach(p => { p.uniforms.uScale.value = s; });
}

/* ---------- breath: soft purple fire + starbursts ---------- */
const FC = [0xeccbff, 0xb14dff, 0x5e18c8].map(c => new THREE.Color(c));
const STAR = [new THREE.Color(0xffffff), new THREE.Color(0xd9b3ff)];
/** each dragon breathes its own colour: { colors: [hot, mid, cool], star: [a, b] } */
export function setBreath(b) {
  b.colors.forEach((c, i) => FC[i].set(c));
  b.star.forEach((c, i) => STAR[i].set(c));
}
let glowFire, starFire, dust, motes;
export const FIRE_RATE = 440;       // particles per second at full blast
let fireAcc = 0;

const _p = new V(), _d = new V();
export function getMouth(p, d) {
  G.rig.mouth.getWorldPosition(p);
  d.set(0, -0.12, 1).applyQuaternion(G.model.quaternion).normalize();
  p.addScaledVector(d, 0.45);
}

function emit(n) {
  getMouth(_p, _d);
  for (let k = 0; k < n; k++) {
    const star = Math.random() < 0.28;
    const sys = star ? starFire : glowFire, p = sys.alloc();
    p.star = star; p.alive = true; p.age = 0;
    p.life = star ? 0.9 + Math.random() * 0.7 : 0.7 + Math.random() * 0.45;
    p.p.copy(_p);
    const sp = star ? 2.4 : 1.5;
    p.v.copy(_d).multiplyScalar(8 + Math.random() * 3.5);
    p.v.x += (Math.random() - 0.5) * sp; p.v.y += (Math.random() - 0.5) * sp * 0.7 + 0.2; p.v.z += (Math.random() - 0.5) * sp;
    p.spin = (Math.random() - 0.5) * 8; p.tw = Math.random() * 6;
    p.sz = star ? 0.18 + Math.random() * 0.22 : 1; p.rot = Math.random() * 6.28;
  }
}

/** fk = fire amount 0..1; fireTime = seconds since the breath started */
export function emitFire(dt, fk, fireTime, fireDur) {
  if (fk > 0.5 && fireTime > 0.25 && fireTime < fireDur - 0.35) {
    fireAcc += dt * FIRE_RATE * 1.05;
    const nn = Math.floor(fireAcc); fireAcc -= nn;
    if (nn) emit(nn);
  }
}

function updateFire(dt) {
  const h = G.heightAt;
  for (const sys of [glowFire, starFire]) {
    for (const p of sys.items) {
      if (!p.alive) continue;
      p.age += dt;
      const u = p.age / p.life;
      if (u >= 1) { sys.kill(p); continue; }
      p.p.addScaledVector(p.v, dt);
      p.v.multiplyScalar(p.star ? 0.975 : 0.968);
      p.v.y += (p.star ? 0.3 : 0.8) * dt;
      const floor = h(p.p.x, p.p.z) + 0.15;
      if (p.p.y < floor) { p.p.y = floor; p.v.y = Math.abs(p.v.y) * 0.2; }
      if (p.star) {
        p.rot += p.spin * dt;
        sys.write(p, _c.copy(STAR[0]).lerp(STAR[1], u), 1 - u, p.sz * (0.55 + 0.45 * Math.sin(p.age * 28 + p.tw)), p.rot);
      } else {
        if (u < 0.3) _c.copy(FC[0]).lerp(FC[1], u / 0.3); else _c.copy(FC[1]).lerp(FC[2], (u - 0.3) / 0.7);
        sys.write(p, _c, Math.pow(1 - u, 1.2) * 0.85, 0.3 + 2.2 * u, p.rot);
      }
    }
    sys.upload();
  }
}
const _c = new THREE.Color();

/* ---------- dust puffs on hard footfalls and landing ---------- */
const DUST_COL = new THREE.Color(0x8a78a8);
export function spawnDust(p, n) {
  for (let j = 0; j < n; j++) {
    const d = dust.alloc();
    d.alive = true; d.age = 0; d.life = 0.6 + Math.random() * 0.5;
    const x = p.x + (Math.random() - 0.5) * 0.5, z = p.z + (Math.random() - 0.5) * 0.5;
    d.p.set(x, G.heightAt(x, z) + 0.15, z);
    d.v.set((Math.random() - 0.5) * 1.4, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.4);
  }
}
function updateDust(dt) {
  for (const d of dust.items) {
    if (!d.alive) continue;
    d.age += dt;
    const u = d.age / d.life;
    if (u >= 1) { dust.kill(d); continue; }
    d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(0.95);
    dust.write(d, DUST_COL, 0.45 * (1 - u), 0.4 + 1.5 * u, 0);
  }
  dust.upload();
}

/* ---------- floating purple void motes ---------- */
const MOTES = 140;
const moteData = [];
function initMotes() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  motes = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTex, color: 0xb36bff, size: 0.34, sizeAttenuation: true, transparent: true,
    opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  motes.frustumCulled = false;
  for (let i = 0; i < MOTES; i++) moteData.push({ a: Math.random() * 6.28, r: 4 + Math.random() * 34, y: Math.random() * 9, sp: 0.2 + Math.random() * 0.5 });
  G.scene.add(motes);
}
function updateMotes(dt, cx, cz) {
  const pos = motes.geometry.attributes.position.array;
  moteData.forEach((u, i) => {
    u.y += u.sp * dt; if (u.y > 9) u.y = 0;
    u.a += dt * 0.05;
    const x = cx + Math.cos(u.a) * u.r, z = cz + Math.sin(u.a) * u.r;
    pos[i * 3] = x; pos[i * 3 + 1] = G.heightAt(x, z) + u.y + 0.4; pos[i * 3 + 2] = z;
  });
  motes.geometry.attributes.position.needsUpdate = true;
  motes.material.opacity = 0.7 + 0.15 * Math.sin(G.t * 1.3);
}

/** colours of the floating motes (void sparks / lava embers) and of the dust puffs */
export function setAmbience(a) { motes.material.color.set(a.motes); DUST_COL.set(a.dust); }

export function initEffects() {
  glowFire = new Particles(360, glowTex, true);
  starFire = new Particles(120, starTex, true);
  dust = new Particles(70, glowTex, false);
  initMotes();
}

export function updateEffects(dt) {
  updateFire(dt); updateDust(dt);
  updateMotes(dt, S.pos.x, S.pos.z);
}
