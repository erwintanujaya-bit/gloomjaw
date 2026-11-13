import * as THREE from 'three';
import { V, wrapA } from './util.js';
import { G } from './state.js';

const _q = new THREE.Quaternion(), _v = new V();

/** wrap a bone with its rest pose and the world X/Y/Z axes expressed in the bone's own frame */
export function mk(by, n) {
  const b = by[n]; if (!b) return null;
  const inv = b.getWorldQuaternion(new THREE.Quaternion()).invert();
  return {
    b, rest: b.quaternion.clone(),
    x: new V(1, 0, 0).applyQuaternion(inv).normalize(),
    y: new V(0, 1, 0).applyQuaternion(inv).normalize(),
    z: new V(0, 0, 1).applyQuaternion(inv).normalize(),
  };
}

/** pose(bone, ax, ay, az): rest * rot(X) * rot(Y) * rot(Z), angles about the model's rest axes */
export function pose(e, ax, ay, az) {
  if (!e) return;
  const q = e.b.quaternion.copy(e.rest);
  if (ax) q.multiply(_q.setFromAxisAngle(e.x, ax));
  if (ay) q.multiply(_q.setFromAxisAngle(e.y, ay));
  if (az) q.multiply(_q.setFromAxisAngle(e.z, az));
}

/** build the rig from a dragon's `bones` map (see dragons.js) */
export function setupRig(B) {
  const inner = G.inner;
  const by = {};
  inner.traverse(o => { if (o.isBone) by[o.name] = o; });
  inner.updateMatrixWorld(true);
  const missing = [];
  const one = n => { if (!n) return null; const e = mk(by, n); if (!e) missing.push(n); return e; };
  const chain = names => names.map(one);
  const r = {
    spine: one(B.spine), chest: one(B.chest),
    neck: one(B.neck), head: one(B.head),
    jaw: one(B.jaw), skull: one(B.skull),
    shoulders: (B.shoulders || []).map(one),
    wr: chain(B.wr), wl: chain(B.wl),
    // wing fingers: used for the flight twitch
    frF: B.frF.map(chain), flF: B.flF.map(chain),
    tail: chain(B.tail),
    mouth: by[B.mouth],
  };
  // legs: hip, knee, ankle, toe. walk = lateral sequence, run = rotary gallop (phase offsets)
  r.legs = B.legs.map(L => ({ ...L, hip: one(L.hip), knee: one(L.knee), ankle: one(L.ankle), toe: by[L.toe] }));
  if (!r.mouth) missing.push(B.mouth);
  if (missing.length) console.warn('Bones not found in this model:', missing.join(', '));

  // which way does each knee fold? rotate it +/-0.5 and see which raises the toe
  r.legs.forEach(L => {
    const fy = () => { inner.updateMatrixWorld(true); return L.toe.getWorldPosition(_v).y; };
    pose(L.knee, 0.5); const up = fy();
    pose(L.knee, -0.5); const dn = fy();
    pose(L.knee, 0);
    L.ks = up >= dn ? 1 : -1;
  });
  inner.updateMatrixWorld(true);

  // rest leg geometry in model space, used by the foot IK
  const loc = b => inner.worldToLocal(b.getWorldPosition(new V()));
  r.legs.forEach(L => {
    const H = loc(L.hip.b), K = loc(L.knee.b), A = loc(L.ankle.b);
    L.restA = A;
    L.L1 = Math.hypot(K.y - H.y, K.z - H.z);
    L.L2 = Math.hypot(A.y - K.y, A.z - K.z);
    L.a2rest = Math.atan2(A.z - K.z, A.y - K.y);
    L.cross = Math.sign((K.y - H.y) * (A.z - K.z) - (K.z - H.z) * (A.y - K.y)) || 1;
    L.plant = inner.localToWorld(A.clone());
    L.lift = L.plant.clone(); L.land = L.plant.clone();
    L.swing = false; L.curl = 0;
  });
  return r;
}

/* two-bone leg IK in the leg's side plane (model space) */
const _a = new V(), _b = new V(), _c = new V(), _e = new V();
export function legIK(L, targetW) {
  const inner = G.inner;
  const H = inner.worldToLocal(L.hip.b.getWorldPosition(_a));
  const T = inner.worldToLocal(_b.copy(targetW));
  let ty = T.y - H.y, tz = T.z - H.z, d = Math.hypot(ty, tz);
  const lo = Math.abs(L.L1 - L.L2) + 1e-3, hi = (L.L1 + L.L2) * 0.998;
  if (d < 1e-5) { ty = -lo; tz = 0; d = lo; }
  if (d > hi) { ty *= hi / d; tz *= hi / d; d = hi; } else if (d < lo) { ty *= lo / d; tz *= lo / d; d = lo; }
  const aT = Math.atan2(tz, ty);
  const beta = Math.acos(Math.max(-1, Math.min(1, (L.L1 * L.L1 + d * d - L.L2 * L.L2) / (2 * L.L1 * d))));
  let a1 = aT + beta, ky = L.L1 * Math.cos(a1), kz = L.L1 * Math.sin(a1);
  if (Math.sign(ky * (tz - kz) - kz * (ty - ky)) !== L.cross) { a1 = aT - beta; ky = L.L1 * Math.cos(a1); kz = L.L1 * Math.sin(a1); }
  const a2 = Math.atan2(tz - kz, ty - ky);
  pose(L.hip, 0); pose(L.knee, 0); L.hip.b.updateMatrixWorld(true);
  const K0 = inner.worldToLocal(L.knee.b.getWorldPosition(_c));
  const dh = wrapA(a1 - Math.atan2(K0.z - H.z, K0.y - H.y));
  pose(L.hip, dh); L.hip.b.updateMatrixWorld(true);
  const K1 = inner.worldToLocal(L.knee.b.getWorldPosition(_c)), A1 = inner.worldToLocal(L.ankle.b.getWorldPosition(_e));
  const dk = wrapA(a2 - Math.atan2(A1.z - K1.z, A1.y - K1.y));
  return [dh, dk, wrapA(a2 - L.a2rest)];
}
