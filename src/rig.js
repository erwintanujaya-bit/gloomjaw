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

export function setupRig() {
  const inner = G.inner;
  const by = {};
  inner.traverse(o => { if (o.isBone) by[o.name] = o; });
  inner.updateMatrixWorld(true);
  const chain = names => names.map(n => mk(by, n));
  const r = {
    spine: mk(by, 'Bone_003'), chest: mk(by, 'Bone_002'),
    neck: mk(by, 'Bone_021'), head: mk(by, 'Bone_020'),
    jaw: mk(by, 'Bone_033'), skull: mk(by, 'Bone_035'),
    shoulders: [mk(by, 'Bone_041'), mk(by, 'Bone_047')],
    wr: chain(['Bone_025', 'Bone_024', 'Bone_023']),
    wl: chain(['Bone_028', 'Bone_027', 'Bone_026']),
    // wing fingers (two per wing): used for the flight twitch
    frF: [chain(['Bone_049', 'Bone_048']), chain(['Bone_052', 'Bone_051', 'Bone_050'])],
    flF: [chain(['Bone_054', 'Bone_053']), chain(['Bone_057', 'Bone_056', 'Bone_055'])],
    tail: chain(['Bone_019', 'Bone_018', 'Bone_017', 'Bone_016', 'Bone_015', 'Bone_014']),
    mouth: by.Bone_032,
  };
  // legs: hip, knee, ankle, toe. walk = lateral sequence, run = rotary gallop (phase offsets)
  r.legs = [
    { hip: 'Bone_039', knee: 'Bone_038', ankle: 'Bone_037', toe: 'Bone_036', front: 1, side: 1, walk: 0.75, run: 0.5 },
    { hip: 'Bone_045', knee: 'Bone_044', ankle: 'Bone_043', toe: 'Bone_042', front: 1, side: -1, walk: 0.25, run: 0.6 },
    { hip: 'Bone_013', knee: 'Bone_012', ankle: 'Bone_010', toe: 'Bone_009', front: 0, side: 1, walk: 0.5, run: 0.1 },
    { hip: 'Bone_008', knee: 'Bone_007', ankle: 'Bone_005', toe: 'Bone_004', front: 0, side: -1, walk: 0, run: 0 },
  ].map(L => ({ ...L, hip: mk(by, L.hip), knee: mk(by, L.knee), ankle: mk(by, L.ankle), toe: by[L.toe] }));

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
