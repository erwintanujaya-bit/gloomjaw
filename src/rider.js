import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { V, k, clamp } from './util.js';
import { G, S } from './state.js';
import { mk, pose } from './rig.js';

/* RIDER: the knight on the dragon's back. Tune sizes and the seated pose here (world units; the dragon is about 7 long). */
export const RIDER = {
  height: 3.0,               // how tall the knight is when standing (he is seated, so he looks smaller)
  seatForward: 0,            // slide the seat along the back (+ = toward the head); dragons.js can override per dragon
  seatSink: 0.1,             // how far the seat sinks into the back
  hipDrop: 0.1,              // fine-tune: raise (+) or lower (-) the knight on the seat
  capeFlutter: 0.5,
  // seated pose, in radians. Thigh/shin/arm angles are about the knight's own sideways axis.
  pose: { thigh: -1.25, splay: 0.55, shin: 1.35, foot: 0.15, spine: 0.14, arm: -0.9, fore: -0.9, head: 0.0 },
};

const SOURCE = 'models/knight.glb';        // "Death Knight" by Northcliffe, CC BY-NC 4.0 (see CREDITS.md)

let knight = null;                         // { root, model, bones, hipY } once the model has loaded
let fallback = null;                       // the little kid, used only if the knight cannot load
let root = null, wantVisible = false, tilt = null;
let lean = 0, sword = null;

/* ---------------- the knight ---------------- */

/** load the knight once; call attachRider() afterwards for every dragon */
export function loadKnight(baseUrl) {
  return new Promise(resolve => {
    new GLTFLoader().load(baseUrl + SOURCE, gltf => {
      try { knight = prepareKnight(gltf.scene); } catch (e) { console.error('Knight setup failed', e); }
      resolve(!!knight);
    }, undefined, err => { console.error('Knight failed to load', err); resolve(false); });
  });
}

function prepareKnight(scene) {
  // drop the floor plane that came with the model, and keep skinned meshes from being culled
  const floors = [];
  scene.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false; o.castShadow = true;
    if (o.material && o.material.name === 'floor') floors.push(o);
  });
  floors.forEach(f => f.removeFromParent());

  const raw = {};
  scene.traverse(o => { if (o.isBone) raw[o.name] = o; });
  // three.js strips dots from node names ("toe.L_metarig" becomes "toeL_metarig"), so look bones up the same way
  const by = new Proxy(raw, { get: (t, name) => t[String(name).replace(/[.:/[\]]/g, '')] });
  const model = new THREE.Group(); model.add(scene);
  const holder = new THREE.Group(); holder.add(model);
  holder.updateMatrixWorld(true);

  // which way does he face? toes point forward from the ankles
  const w = n => by[n].getWorldPosition(new V());
  const fwd = w('toe.L_metarig').add(w('toe.R_metarig')).sub(w('foot.L_metarig')).sub(w('foot.R_metarig'));
  model.rotation.y = -Math.atan2(fwd.x, fwd.z);                     // turn so he faces +Z like the dragon
  holder.updateMatrixWorld(true);

  // scale to the wanted standing height, feet on y = 0
  const box = new THREE.Box3().setFromObject(holder);
  const sc = RIDER.height / (box.max.y - box.min.y);
  model.scale.setScalar(sc);
  holder.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(holder);
  model.position.y -= box2.min.y;
  holder.updateMatrixWorld(true);

  // the sword is a loose object in the file: hang it on his right hand so it moves with him
  scene.traverse(o => { if (o.isMesh && /sword/i.test(o.name)) sword = o; });
  if (sword) by['hand.R_metarig'].attach(sword);

  const n = name => mk(by, name);
  const bones = {
    spine: n('spine_metarig'), spine1: n('spine.001_metarig'), head: n('head_metarig'),
    thighL: n('thigh.L_metarig'), thighR: n('thigh.R_metarig'), shinL: n('shin.L_metarig'), shinR: n('shin.R_metarig'),
    footL: n('foot.L_metarig'), footR: n('foot.R_metarig'),
    armL: n('upper_arm.L_metarig'), armR: n('upper_arm.R_metarig'), foreL: n('forearm.L_metarig'), foreR: n('forearm.R_metarig'),
  };
  const hipY = by['thigh.L_metarig'].getWorldPosition(new V()).y;    // how high the hip joints are when he stands (feet on y = 0)
  if (import.meta.env.DEV) window.__knight = { holder, model, bones, by, raw, RIDER };    // dev-only handle for tuning the pose
  return { holder, model, bones, hipY, by };
}

/** pose him sitting with his legs round the dragon's back and his hands forward; sways with the ride */
function poseKnight(t) {
  const b = knight.bones, P = RIDER.pose, sw = Math.sin(t * 1.3) * 0.02;
  pose(b.spine, P.spine + lean * 0.5 + sw); pose(b.spine1, lean * 0.5);
  pose(b.head, -P.spine - lean * 0.6 + P.head);
  // sideways axis: x. splay (spread legs) is about the forward axis: z
  pose(b.thighL, P.thigh, 0, P.splay); pose(b.thighR, P.thigh, 0, -P.splay);
  pose(b.shinL, P.shin); pose(b.shinR, P.shin);
  pose(b.footL, P.foot); pose(b.footR, P.foot);
  pose(b.armL, P.arm, 0, 0.25); pose(b.armR, P.arm, 0, -0.25);
  pose(b.foreL, P.fore); pose(b.foreR, P.fore);
}

/* ---------------- fallback kid (only if the knight is missing) ---------------- */
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0, ...o });
function part(geo, m, x, y, z, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true;
  return o;
}
function buildKid() {
  const g = new THREE.Group();
  const jacket = mat(0x7a3bd0), skin = mat(0xf0c8a0), gold = mat(0xffd34d, { roughness: 0.5 }), pants = mat(0x2b1a55);
  g.add(part(new THREE.CapsuleGeometry(0.12, 0.5, 3, 6), pants, 0.3, 0.12, 0.05, 0.1, 0, 1.0));
  g.add(part(new THREE.CapsuleGeometry(0.12, 0.5, 3, 6), pants, -0.3, 0.12, 0.05, 0.1, 0, -1.0));
  g.add(part(new THREE.CapsuleGeometry(0.27, 0.45, 4, 8), jacket, 0, 0.6, 0));
  g.add(part(new THREE.SphereGeometry(0.3, 12, 10), skin, 0, 1.27, 0.02));
  g.add(part(new THREE.SphereGeometry(0.345, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), gold, 0, 1.3, 0));
  return g;
}

/* ---------------- attaching to a dragon ---------------- */

/** take the rider off the current dragon (call before that dragon's model is thrown away) */
export function detachRider() { if (root) { root.removeFromParent(); } }

/** put the rider on the current dragon's back, following its chest bone. */
export function initRider(visible, seat = {}) {
  const inner = G.inner, bone = G.rig.chest.b;
  const fwd = seat.forward ?? RIDER.seatForward, size = seat.scale ?? 1;
  if (knight) { root = knight.holder; } else { fallback = fallback || buildKid(); root = fallback; }
  root.removeFromParent();
  inner.updateMatrixWorld(true);
  // find the top of the back right above the chest bone
  const pw = bone.getWorldPosition(new V());
  const meshes = []; inner.traverse(o => { if (o.isMesh) meshes.push(o); });
  const hit = new THREE.Raycaster(new V(pw.x, pw.y + 30, pw.z + fwd), new V(0, -1, 0)).intersectObjects(meshes, false)[0];
  const spot = hit ? hit.point.clone() : pw.clone().add(new V(0, 1, 0));
  spot.y -= RIDER.seatSink;
  spot.z += fwd;
  // express that spot in the bone's own space, and cancel the bone's rotation/scale so the rider stands upright at 1:1
  const ws = bone.getWorldScale(new V()).x;
  const holder = new THREE.Group();                 // sits at the seat; the knight inside is lowered so his hips are on the seat
  holder.position.copy(bone.worldToLocal(spot));
  holder.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  holder.scale.setScalar(size / ws);
  bone.add(holder);
  holder.add(root);
  root.position.set(0, knight ? -knight.hipY + RIDER.hipDrop : 0, 0);   // hip joints end up at the seat (the thighs rotate about the hips)
  root.visible = !!visible; wantVisible = !!visible;
  tilt = holder;
  return root;
}

export function setRider(on) { wantVisible = on; if (root) root.visible = on; }
export const riderOn = () => !!(root && root.visible);

export function updateRider(dt) {
  if (!root || !root.visible) return;
  const t = G.t, sp = Math.min(1, S.speed / 8);
  const air = S.fs === 'climb' || S.fs === 'cruise' || S.fs === 'land';
  const want = 0.05 + 0.3 * sp + (air ? 0.15 : 0) + 0.1 * S.sprintW;
  lean += (want - lean) * k(dt, 5);
  if (knight) poseKnight(t);
  else root.rotation.x = lean * 0.4;
}
