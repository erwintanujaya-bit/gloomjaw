import * as THREE from 'three';
import { V, k, lerp } from './util.js';
import { G, S } from './state.js';

/* RIDER: tune the little rider on Gloomjaw's back here (sizes are world units; Gloomjaw is about 7 long) */
export const RIDER = {
  scale: 1,                  // 1 = a kid about 1.6 tall sitting up
  seatForward: 0,            // slide the seat along the back (+ = toward the head)
  seatSink: 0.12,            // how far the seat sinks into the back
  capeFlutter: 0.5,
};

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
let root = null, body = null, cape = null, capeBase = null, arms = [];

function part(geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true;
  return o;
}

/** a small low-poly kid with a gold helmet and a flowing violet cape (about 9 meshes) */
function buildKid() {
  const g = new THREE.Group();
  const jacket = mat(0x7a3bd0), skin = mat(0xf0c8a0), gold = mat(0xffd34d, { roughness: 0.5 }), dark = mat(0x1c0f33), pants = mat(0x2b1a55);
  // legs astride the dragon's back
  g.add(part(new THREE.CapsuleGeometry(0.12, 0.5, 3, 6), pants, 0.3, 0.12, 0.05, 0.1, 0, 1.0));
  g.add(part(new THREE.CapsuleGeometry(0.12, 0.5, 3, 6), pants, -0.3, 0.12, 0.05, 0.1, 0, -1.0));
  body = new THREE.Group(); body.position.y = 0.15; g.add(body);
  body.add(part(new THREE.CapsuleGeometry(0.27, 0.45, 4, 8), jacket, 0, 0.45, 0));
  body.add(part(new THREE.SphereGeometry(0.3, 12, 10), skin, 0, 1.12, 0.02));
  body.add(part(new THREE.SphereGeometry(0.345, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), gold, 0, 1.15, 0));      // helmet
  body.add(part(new THREE.BoxGeometry(0.34, 0.1, 0.06), dark, 0, 1.12, 0.3));                                       // visor
  body.add(part(new THREE.ConeGeometry(0.07, 0.3, 6), gold, 0, 1.55, -0.02));                                       // helmet crest
  // arms reach forward to hold on to Gloomjaw's neck
  arms = [1, -1].map(s => {
    const a = part(new THREE.CapsuleGeometry(0.085, 0.42, 3, 6), jacket, 0.32 * s, 0.62, 0.3, 1.15, 0, 0.12 * s);
    body.add(a); return a;
  });
  // cape: a strip that waves in the wind
  const cg = new THREE.PlaneGeometry(0.62, 1.15, 2, 6);
  cg.translate(0, -0.575, 0);
  capeBase = Float32Array.from(cg.attributes.position.array);
  cape = new THREE.Mesh(cg, mat(0x4a1a8c, { side: THREE.DoubleSide }));
  cape.position.set(0, 0.95, -0.22); cape.rotation.x = -0.35; cape.castShadow = true;
  body.add(cape);
  return g;
}

/** put the rider on Gloomjaw's back (after the rig exists). It follows the spine bone from then on. */
export function initRider(visible) {
  const inner = G.inner, bone = G.rig.chest.b;
  root = buildKid();
  inner.updateMatrixWorld(true);
  // find the top of the back right above the chest bone
  const pw = bone.getWorldPosition(new V());
  const meshes = []; inner.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hit = new THREE.Raycaster(new V(pw.x, pw.y + 30, pw.z + RIDER.seatForward), new V(0, -1, 0)).intersectObjects(meshes, false)[0];
  const seat = hit ? hit.point.clone() : pw.clone().add(new V(0, 1, 0));
  seat.y -= RIDER.seatSink;
  seat.z += RIDER.seatForward;
  // express that spot in the bone's own space, and cancel the bone's rotation/scale so the rider stands upright at 1:1
  const ws = bone.getWorldScale(new V()).x;
  root.position.copy(bone.worldToLocal(seat));
  root.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  root.scale.setScalar(RIDER.scale / ws);
  bone.add(root);
  root.visible = !!visible;
  return root;
}

export function setRider(on) { if (root) root.visible = on; }
export const riderOn = () => !!(root && root.visible);

const pos = new Float32Array(0);
export function updateRider(dt) {
  if (!root || !root.visible) return;
  const t = G.t, sp = Math.min(1, S.speed / 8);
  const air = S.fs === 'climb' || S.fs === 'cruise' || S.fs === 'land';
  // lean forward when fast or in the air, sway into turns, bob with the steps
  const lean = 0.08 + 0.3 * sp + (air ? 0.15 : 0) + 0.12 * S.sprintW;
  body.rotation.x += (lean - body.rotation.x) * k(dt, 5);
  body.rotation.z += (-S.turn * 0.4 - body.rotation.z) * k(dt, 5);
  body.position.y = 0.15 + 0.03 * Math.sin(t * 6 * (0.3 + sp)) * S.step;
  arms.forEach((a, i) => { a.rotation.x = 1.15 + 0.05 * Math.sin(t * 7 + i); });
  // cape flutter: the faster, the harder it waves
  const p = cape.geometry.attributes.position, amp = RIDER.capeFlutter * (0.12 + 0.9 * sp + 0.3 * (air ? 1 : 0));
  for (let i = 0; i < p.count; i++) {
    const y = -capeBase[i * 3 + 1];                          // 0 at the neck, 1.15 at the tip
    p.setZ(i, capeBase[i * 3 + 2] - amp * y * (0.6 + 0.4 * Math.sin(t * 9 - y * 5 + capeBase[i * 3] * 4)));
  }
  p.needsUpdate = true;
}
