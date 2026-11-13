import { V, k, ease, frac, lerp, clamp, wrapA } from './util.js';
import { G, S, act, input } from './state.js';
import { pose, legIK } from './rig.js';
import { burst } from './audio.js';
import { spawnDust } from './effects.js';
import { stickToGait } from './controls.js';
import { riderOn } from './rider.js';

/* TUNE: change these numbers to adjust how Gloomjaw moves */
export const TUNE = {
  // speed (units/s), steps per second, share of time a foot is down, foot lift height
  walkSpeed: 1.8, walkHz: 0.9, walkDuty: 0.66, walkLift: 0.32,
  runSpeed: 6.8, runHz: 2.2, runDuty: 0.4, runLift: 0.55,
  // flying: flaps per second, flaps before a glide, glide length (s), starting height
  climbHz: 1.7, cruiseHz: 1.15, flapsBeforeGlide: 3, glideTime: 1.8, cruiseAlt: 4,
  flySpeedMin: 1.4, flySpeedMax: 9,          // slowest / fastest flight (stick pushed 0 / 1)
  vertSpeed: 4.5, minAlt: 2.4, maxAlt: 30,   // Up/Down button speed and height limits
  // turning (radians per second, top speed of the turn)
  turnWalk: 2.6, turnRun: 2.0, turnFly: 1.6, turnEase: 3.2,
  // jump: how fast Gloomjaw leaves the ground (units/s), gravity, wind-up crouch (s)
  jumpSpeed: 8, gravity: 15, jumpWind: 0.16,
  sprintFly: 1.6,                            // Sprint button while flying = this many times faster
};

const TUNE_BASE = { ...TUNE };
/** switch to a dragon's own numbers: the defaults above plus that dragon's `tune` overrides */
export function applyTune(overrides = {}) { Object.assign(TUNE, TUNE_BASE, overrides); }

const air = () => S.fs === 'climb' || S.fs === 'cruise' || S.fs === 'land';

// wing beat: fast power downstroke (40%), slower recovery upstroke (60%). +1 = up, -1 = down
export const wingCurve = p => (p < 0.4 ? 1 - 2 * ease(p / 0.4) : -1 + 2 * ease((p - 0.4) / 0.6));

export function dustAtFeet(n) { G.rig.legs.forEach(L => spawnDust(L.plant, n)); }

export function resetMotion() {
  S.pos.set(0, 0, 0); S.heading = 0; S.mode = 'idle'; S.flying = false; S.fs = 'ground'; S.ft = 0;
  S.sprintW = 0; S.foldW = 1; S.speed = 0; S.turn = 0; S.turnRaw = 0; S.alt = 0; S.vy = 0; S.tgtAlt = TUNE.cruiseAlt;
  input.camYaw = 0;
  S.gyInit = false; S.roll = 0; S.pitch = 0; S.crouch = 0; S.bob = 0; S.glide = 0; S.flaps = 0;
  act.fire = -1; act.roar = -1;
  if (G.rig) G.rig.legs.forEach(L => { L.swing = false; });
}

export function toggleFly() { S.flying = !S.flying; }

/** Jump button: on the ground it hops; tapped again in the air Gloomjaw flaps up into flight */
export function jump() {
  if (S.flying) return;
  if (S.fs === 'ground' && S.alt < 0.3) { S.fs = 'jwind'; S.ft = 0; }
  else if (S.fs === 'hop' || S.fs === 'jwind') S.flying = true;
}

function sampleGround(x, z, fx, fz) {
  const h = G.heightAt;
  const rx = -fz, rz = fx;                        // sideways vector (on the dragon's +X side use -rx)
  const front = h(x + fx * 2.2, z + fz * 2.2), back = h(x - fx * 2.2, z - fz * 2.2);
  const a = h(x + rx * 1.1, z + rz * 1.1), b = h(x - rx * 1.1, z - rz * 1.1);
  return { avg: (front + back + a + b) * 0.25, slope: (front - back) / 4.4, side: (b - a) / 2.2 };
}

export function move(dt) {
  const t = G.t;
  const fly = S.flying;
  const h = G.heightAt;

  /* ---- 1. what is the player asking for? ---- */
  // The stick steers relative to the dragon: up = keep going, left = turn left, right = turn right. Hold left and
  // it keeps turning (a circle), while the chase camera swings round behind it so the world rolls past.
  // Using the dragon's own heading (not the camera's) means the camera can never fight the steering.
  const cy = S.heading, fxC = Math.sin(cy), fzC = Math.cos(cy);
  const wx = fxC * input.sy + -fzC * input.sx, wz = fzC * input.sy + fxC * input.sx;
  const gait = fly ? { gait: 'fly', amount: input.mag } : stickToGait(input.mag, input.sprint);
  S.sprintW += ((input.sprint ? 1 : 0) - S.sprintW) * k(dt, 3);
  S.foldW += ((S.fs === 'ground' || S.fs === 'touch' ? 1 : 0) - S.foldW) * k(dt, 3);   // wings tuck in while on the ground
  let want = (input.mag > 0.12 && gait.gait !== 'idle') ? Math.atan2(wx, wz) : null;

  S.mode = fly ? 'fly' : gait.gait;
  const m = S.mode;

  /* ---- 2. flight state machine: ground > crouch > climb > cruise > land > touch > ground ---- */
  if (fly) S.tgtAlt = clamp(S.tgtAlt + ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * TUNE.vertSpeed * dt, TUNE.minAlt, TUNE.maxAlt);
  switch (S.fs) {
    case 'ground': if (fly) { S.fs = 'crouch'; S.ft = 0; S.tgtAlt = Math.max(S.tgtAlt, TUNE.cruiseAlt); } break;
    case 'crouch':
      S.ft += dt;
      if (!fly) S.fs = 'ground';
      else if (S.ft > 0.45) { S.fs = 'climb'; S.vy = 5.5; burst(200, 0.8, 0.3); dustAtFeet(3); }
      break;
    case 'climb': {
      const vyT = clamp((S.tgtAlt - S.alt) * 1.1, 1.6, 6);
      S.vy += (vyT - S.vy) * k(dt, 1.4); S.alt += S.vy * dt;
      if (S.alt >= S.tgtAlt - 0.2) S.fs = 'cruise';
      if (!fly) S.fs = 'land';
      break;
    }
    case 'cruise': {
      const tgt = S.tgtAlt + 0.35 * Math.sin(t * 0.45) - (S.glide > 0 ? 0.3 : 0), na = S.alt + (tgt - S.alt) * k(dt, 1.3);
      S.vy = (na - S.alt) / Math.max(dt, 1e-4); S.alt = na;
      if (!fly) S.fs = 'land';
      break;
    }
    case 'land':
      S.vy += ((S.alt < 1.4 ? -0.7 : -clamp(S.alt * 0.45, 1.6, 7)) - S.vy) * k(dt, 2.2);
      S.alt += S.vy * dt;
      if (fly) { S.fs = 'climb'; S.vy = Math.max(S.vy, 1.5); }
      else if (S.alt <= 0) { S.alt = 0; S.vy = 0; S.fs = 'touch'; S.ft = 0; burst(110, 0.9, 0.35); dustAtFeet(3); }
      break;
    case 'touch': S.ft += dt; if (S.ft > 0.6) S.fs = 'ground'; break;
    case 'jwind':                                   // squat, then spring
      S.ft += dt;
      if (fly) { S.fs = 'crouch'; S.ft = 0; S.tgtAlt = Math.max(S.tgtAlt, TUNE.cruiseAlt); }
      else if (S.ft > TUNE.jumpWind) { S.fs = 'hop'; S.vy = TUNE.jumpSpeed; burst(170, 0.7, 0.25); dustAtFeet(3); }
      break;
    case 'hop':                                     // simple arc; a second Jump tap becomes a takeoff
      S.vy -= TUNE.gravity * dt; S.alt += S.vy * dt;
      if (fly) { S.fs = 'climb'; S.vy = Math.max(S.vy, 3.5); S.tgtAlt = Math.max(S.tgtAlt, S.alt + 2.5, TUNE.cruiseAlt); }
      else if (S.alt <= 0 && S.vy < 0) { S.alt = 0; S.vy = 0; S.fs = 'touch'; S.ft = 0.25; burst(110, 0.9, 0.35); dustAtFeet(4); }
      break;
  }
  const inAir = air();
  const hov = S.fs === 'ground' && act.flap > 0;
  if (S.fs === 'ground') S.alt += ((hov ? 1.4 : 0) - S.alt) * k(dt, hov ? 1.6 : 1.2);
  S.pedal += ((hov && S.alt > 0.4 ? 1 : 0) - S.pedal) * k(dt, 3);

  /* ---- 3. steering and speed ---- */
  const err = want === null ? 0 : wrapA(want - S.heading);
  const maxTurn = inAir ? TUNE.turnFly : m === 'run' ? TUNE.turnRun : TUNE.turnWalk;
  const canTurn = S.fs !== 'crouch' && S.fs !== 'touch';
  const turnT = (want !== null && canTurn) ? clamp(err * TUNE.turnEase, -maxTurn, maxTurn) : 0;
  S.turnRaw += (turnT - S.turnRaw) * k(dt, 8);       // smooth, no snapping
  S.heading += S.turnRaw * dt;
  S.turn = clamp(S.turnRaw, -0.9, 0.9);

  let spT = 0;
  if (S.fs === 'ground') {
    if (m === 'walk') spT = TUNE.walkSpeed * gait.amount;
    else if (m === 'run') spT = lerp(TUNE.walkSpeed * 1.2, TUNE.runSpeed, gait.amount);
    spT *= 0.35 + 0.65 * Math.max(0, Math.cos(err));  // slow down while swinging around
  } else if (S.fs === 'jwind' || S.fs === 'hop') spT = S.speed;     // keep the run-up momentum through the jump
  else if (S.fs === 'climb') spT = Math.max(3, lerp(TUNE.flySpeedMin, TUNE.flySpeedMax, input.mag)) * lerp(1, TUNE.sprintFly, S.sprintW);
  else if (S.fs === 'cruise') spT = lerp(TUNE.flySpeedMin, TUNE.flySpeedMax, input.mag) * lerp(1, TUNE.sprintFly, S.sprintW);
  else if (S.fs === 'land') spT = S.alt < 1.4 ? 1.2 : Math.min(4, lerp(TUNE.flySpeedMin, TUNE.flySpeedMax, input.mag));
  S.speed += (spT - S.speed) * k(dt, S.fs === 'touch' ? 4 : 1.6);
  const fx = Math.sin(S.heading), fz = Math.cos(S.heading);
  S.pos.x += fx * S.speed * dt; S.pos.z += fz * S.speed * dt;      // the world has no edge: it is built around you as you go

  /* ---- 4. terrain under the body ---- */
  const g = sampleGround(S.pos.x, S.pos.z, fx, fz);
  let gT = g.avg;
  if (S.fs === 'climb' || S.fs === 'cruise') gT = Math.max(gT, h(S.pos.x + fx * 7, S.pos.z + fz * 7), h(S.pos.x + fx * 14, S.pos.z + fz * 14) - 1);
  if (!S.gyInit) { S.gy = gT; S.gyInit = true; }
  S.gy += (gT - S.gy) * k(dt, S.fs === 'ground' || S.fs === 'touch' || S.fs === 'crouch' ? 9 : 4);

  /* ---- 5. gait ---- */
  const stepping = S.fs === 'ground' && S.alt < 0.2 && (m === 'walk' || m === 'run' || S.speed > 0.2);
  S.step += ((stepping ? 1 : 0) - S.step) * k(dt, 4);
  S.runW += ((m === 'run' ? 1 : 0) - S.runW) * k(dt, 2.5);
  S.hz = lerp(TUNE.walkHz, TUNE.runHz, S.runW) * (0.45 + 0.55 * Math.min(1, S.speed / lerp(TUNE.walkSpeed, TUNE.runSpeed, S.runW)));
  if (stepping) S.gp += S.hz * dt;
  // crouch before takeoff and after landing
  const crT = S.fs === 'crouch' || S.fs === 'jwind' ? 1 : S.fs === 'touch' ? Math.max(0, 1 - S.ft / 0.6) : 0;
  S.crouch += (crT - S.crouch) * k(dt, S.fs === 'touch' && S.ft < 0.12 ? 25 : 6);
  // body bob: walk dips twice per cycle, run lifts when few feet are down (airborne phase)
  let bobT = 0;
  if (S.step > 0.01) bobT = S.runW > 0.5 ? Math.max(0, 2 - S.support) * 0.12 : -0.045 * Math.cos(4 * Math.PI * S.gp);
  S.bob += (bobT * S.step - S.bob) * k(dt, 10);

  /* ---- 6. wings ---- */
  let rate = 0.25, amp = 0.05, base = 0.08, sweep = 0;
  if (S.fs === 'crouch' || S.fs === 'jwind') { base = 0.45; rate = 0.5; }
  else if (S.fs === 'hop') { rate = 1.5; amp = 0.65; base = 0.15; }
  else if (S.fs === 'climb') { rate = TUNE.climbHz; amp = 1; base = 0.1; }
  else if (S.fs === 'cruise') { rate = TUNE.cruiseHz; amp = S.glide > 0 ? 0 : 0.75; base = S.glide > 0 ? 0.16 : 0.1; }
  else if (S.fs === 'land') { if (S.alt < 1.6) { rate = 1.9; amp = 0.9; base = 0.2; sweep = -0.35; } else { rate = 1; amp = 0.15; base = 0.16; } }
  else if (S.fs === 'touch') { base = -0.05; }
  else if (hov) { rate = 1.6; amp = 0.95; base = 0.1; }
  else if (m === 'run' && S.step > 0.3) { rate = 3; amp = 0.1; base = 0.18; }
  else if (m === 'walk' && S.step > 0.3) { rate = 0.8; amp = 0.03; base = -0.12; }
  S.wRate += (rate - S.wRate) * k(dt, 4);
  S.amp += (amp - S.amp) * k(dt, S.fs === 'climb' ? 8 : 3.5);
  S.base += (base - S.base) * k(dt, 3);
  S.sweep += (sweep - S.sweep) * k(dt, 3);
  const prev = S.wp;
  S.wp = frac(S.wp + S.wRate * dt);
  if (S.wp < prev) {
    if (S.amp > 0.4) burst(260, 0.8, 0.28);
    if (S.fs === 'cruise' && S.glide <= 0 && ++S.flaps >= TUNE.flapsBeforeGlide) { S.glide = TUNE.glideTime; S.flaps = 0; }
  }
  if (S.glide > 0) S.glide -= dt;

  /* ---- 7. body pose in the world ---- */
  const lift = -0.12 * S.amp * wingCurve(S.wp) * Math.min(1, S.alt);
  let rollT, pitchT;
  if (inAir) {
    rollT = -Math.min(0.45, S.turn * S.speed * 0.14);
    pitchT = S.fs === 'land' && S.alt < 1.4 ? -0.32 : -Math.atan2(S.vy, Math.max(2, S.speed)) * 0.8;
  } else {
    const gA = 2 * Math.PI * S.gp;
    rollT = -S.turn * S.speed * 0.04 + S.step * (1 - S.runW) * 0.035 * Math.sin(gA) + Math.atan(g.side) * 0.5;
    pitchT = S.crouch * 0.07 + S.runW * S.step * 0.035 * Math.sin(gA) - Math.atan(g.slope) * 0.7;   // lean with the hill
    if (S.fs === 'hop') pitchT -= Math.atan2(S.vy, Math.max(3, S.speed)) * 0.5;                    // nose up going up, down coming down
  }
  S.roll += (rollT - S.roll) * k(dt, 3);
  S.pitch += (pitchT - S.pitch) * k(dt, 3);
  G.model.position.set(S.pos.x, S.gy + S.alt + S.bob + lift - S.crouch * 0.42, S.pos.z);
  G.model.rotation.set(S.pitch, S.heading, S.roll);
}

function onPlant(L) {
  if (S.step < 0.5) return;
  burst(140, S.runW > 0.5 ? 0.5 : 0.26, 0.18);
  if (S.runW > 0.5) spawnDust(L.plant, 2);
}

const tailS = { y: [0, 0, 0, 0, 0, 0], yv: [0, 0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0, 0], pv: [0, 0, 0, 0, 0, 0] };
let prevBodyY = 0, bodyVY = 0;
const _f = new V(), _n = new V(), _t = new V();

/** fk = fire amount 0..1, rk = roar amount 0..1 */
export function animateRig(fk, rk, dt) {
  const r = G.rig, model = G.model, inner = G.inner, t = G.t, inAir = air();
  const h = G.heightAt;
  const by = model.position.y;
  bodyVY += ((by - prevBodyY) / Math.max(dt, 1e-4) - bodyVY) * k(dt, 8);
  prevBodyY = by;
  const gA = 2 * Math.PI * S.gp;

  // spine flexes (gathers) and extends in the gallop
  const flex = S.runW * S.step * 0.11 * Math.sin(gA);
  pose(r.spine, 0.015 * Math.sin(t * 1.7) + flex + S.crouch * 0.05);
  pose(r.chest, -flex * 0.7);

  // neck + head: stay steady against body pitch and bob, pump when running, look around when idle
  const pump = S.runW * S.step * 0.08 * Math.sin(gA + 0.6);
  const n = 0.03 * Math.sin(t * 1.3) - rk * 0.12 + fk * 0.1 + S.runW * S.step * 0.12 + pump - S.pitch * 0.5 - (inAir ? 0.06 : 0) + S.crouch * 0.1;
  const ny = 0.05 * Math.sin(t * 0.6) * (1 - S.step * 0.6) + S.turn * 0.25;
  const hd = 0.03 * Math.sin(t * 1.3 - 0.5) - rk * 0.32 + fk * 0.04 + pump * 0.5 - S.pitch * 0.3 - S.bob * 0.5;
  const hy = (0.07 * Math.sin(t * 0.5) + 0.03 * Math.sin(t * 1.3)) * (1 - S.step * 0.7) * (1 - fk);
  pose(r.neck, n, ny);
  pose(r.head, hd, hy);
  r.shoulders.forEach((e, i) => pose(e, -(n + hd), -(ny + hy), (i ? -1 : 1) * 0.05 * S.step * (1 - S.runW) * Math.sin(gA + i * Math.PI)));
  pose(r.jaw, 0.03 + 0.02 * Math.sin(t * 1.7) + fk * 0.42 + rk * 0.6);
  pose(r.skull, -(fk * 0.1 + rk * 0.16));

  // tail: spring chain, each segment follows the one before it
  const sway = S.step * lerp(0.14, 0.06, S.runW) * Math.sin(gA - 0.8) + 0.03 * Math.sin(t * 0.7);
  const yawDrive = -S.turn * (inAir ? 0.9 : 0.6) + sway;
  const pBase = inAir ? -0.01 : S.step * S.runW * 0.035;
  r.tail.forEach((e, i) => {
    const ty = i === 0 ? yawDrive : tailS.y[i - 1], tp = i === 0 ? pBase - bodyVY * 0.02 : tailS.p[i - 1] * 0.85 + pBase * 0.15;
    tailS.yv[i] += (55 * (ty - tailS.y[i]) - 8 * tailS.yv[i]) * dt; tailS.y[i] += tailS.yv[i] * dt;
    tailS.pv[i] += (55 * (tp - tailS.p[i]) - 8 * tailS.pv[i]) * dt; tailS.p[i] += tailS.pv[i] * dt;
    pose(e, tailS.p[i], tailS.y[i] * (1 + rk));
  });

  // wings: power downstroke, wrist folds on the upstroke, still while gliding
  const v = wingCurve(S.wp), fold = (S.wp >= 0.4 ? Math.sin(Math.PI * (S.wp - 0.4) / 0.6) : 0) * S.amp;
  const W = G.dragon ? G.dragon.wing : { offset: 0, scale: 1, fold: 0 };
  const tip = 0.04 * Math.sin(t * 2.3) * (S.glide > 0 ? 1 : 0.3), a = W.offset + W.fold * (riderOn() ? W.riderFold ?? 1 : 1) * S.foldW + S.base + S.amp * v * W.scale;
  [[r.wr, 1, r.frF], [r.wl, -1, r.flF]].forEach(([w, s, fingers], j) => {
    // on the ground the wings can also swing back (foldSweep), bend at the elbow and wrist (foldElbow/foldWrist)
    const fw = S.foldW * (riderOn() ? W.riderFold ?? 1 : 1);
    pose(w[0], 0, s * (S.sweep * 0.5 + (W.foldSweep || 0) * fw), s * a);
    pose(w[1], 0, s * (W.foldElbowY || 0) * fw, s * (S.amp * 0.18 * v + (W.foldElbow || 0) * fw));
    pose(w[2], 0, s * (0.32 * fold - S.sweep * 0.3), s * (-0.5 * fold + (W.foldWrist || 0) * fw + tip * (j ? -1 : 1) + 0.12 * S.amp * Math.sin(2 * Math.PI * S.wp - 0.9)));
    // finger twitch: each finger lags a little behind the wing, curls hard on the downstroke,
    // and just flexes gently while gliding (staggered per finger and per joint)
    const airW = inAir ? 1 : 0.25;
    fingers.forEach((chain, fi) => chain.forEach((bone, bi) => {
      const lag = 0.07 * (fi * 2 + bi + 1);
      const vf = wingCurve(frac(S.wp - lag + 1));
      const down = Math.max(0, -vf);                              // 0..1, strongest in the downstroke
      const curl = S.amp * (0.3 + 0.8 * down) * (0.6 + 0.25 * bi) * (vf > 0 ? -0.5 : 1);
      const flex = 0.15 * Math.sin(t * 2.6 + fi * 1.7 + bi * 0.9 + j) * (S.glide > 0 || S.amp < 0.3 ? 1 : 0.4);
      pose(bone, 0, 0, s * airW * (curl + flex));
    }));
  });
  if (G.glowMat) G.glowMat.emissiveIntensity = 1.1 + 0.35 * Math.sin(t * 2.2) + rk * 2.5 + fk * 1.6;

  // legs: planted-foot IK on the ground, loose dangle in the air
  model.updateMatrixWorld(true);
  const gW = 1 - Math.min(1, S.alt / 0.6), sc = model.scale.x;
  const fwd = _f.set(Math.sin(S.heading), 0, Math.cos(S.heading));
  const duty = lerp(TUNE.walkDuty, TUNE.runDuty, S.runW), liftH = lerp(TUNE.walkLift, TUNE.runLift, S.runW);
  const half = S.speed * duty / Math.max(S.hz, 0.1) / 2;
  let support = 0;
  r.legs.forEach((L, i) => {
    const nW = inner.localToWorld(_n.copy(L.restA));
    nW.y = h(nW.x, nW.z) + L.restA.y * sc;            // ankle sits just above the ground under this foot
    let target = L.plant;
    const ph = frac(S.gp + lerp(L.walk, L.run, S.runW));
    if (S.step > 0.05 && S.alt < 0.2) {
      if (ph < duty) {
        if (L.swing) { L.plant.copy(L.land); L.swing = false; onPlant(L); }
        target = L.plant; support++; L.curl = 0;
      } else {
        if (!L.swing) { L.lift.copy(L.plant); L.swing = true; }
        const u = (ph - duty) / (1 - duty);
        L.land.copy(nW).addScaledVector(fwd, half);
        L.land.y = h(L.land.x, L.land.z) + L.restA.y * sc;
        target = _t.copy(L.lift).lerp(L.land, ease(u));
        target.y += liftH * Math.sin(Math.PI * u);
        L.curl = Math.sin(Math.PI * u);
      }
    } else {
      L.plant.lerp(nW, k(dt, S.alt > 0.2 ? 10 : 4)); L.swing = false; support++; L.curl = 0; target = L.plant;
    }
    let dh = 0, dk = 0, da = 0;
    if (gW > 0.001) [dh, dk, da] = legIK(L, target);
    let fh = 0, fkn = 0, fa = 0;
    if (gW < 1) {
      const reach = S.fs === 'land' && S.alt < 1.6 ? 1 : 0;
      fh = (L.front ? 0.12 : 0.22) + 0.07 * Math.sin(t * 1.8 + i * 1.3) - reach * (L.front ? 0.35 : 0.2);
      fkn = 0.12;
      fa = 0.3 + 0.06 * Math.sin(t * 1.8 + i) - reach * 0.2;
      fh += S.pedal * 0.4 * Math.sin(t * 6.5 + i * 1.7);
      fkn += S.pedal * 0.3 * (0.5 + 0.5 * Math.sin(t * 6.5 + i * 1.7 + 1.2));
    }
    pose(L.hip, lerp(fh, dh, gW));
    pose(L.knee, lerp(L.ks * fkn, dk, gW));
    pose(L.ankle, lerp(fa, -da + L.curl * 0.35, gW));
  });
  S.support = support;
}
