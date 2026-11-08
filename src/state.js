import { V } from './util.js';

export const FIRE_DUR = 5.2;
export const ROAR_DUR = 3.2;      // main roar 1.9 s + three grunts

/** things every module needs to look at (filled in by main.js) */
export const G = {
  model: null, inner: null, rig: null, glowMat: null,
  scene: null, camera: null,
  t: 0,
  heightAt: () => 0,               // replaced by world.js
};

/** Gloomjaw's movement state */
export const S = {
  mode: 'idle',          // idle | walk | run | fly   (what we are doing now)
  flying: false,         // player wants to be in the air (Fly button)
  fs: 'ground',          // ground > crouch > climb > cruise > land > touch;  jump: ground > jwind > hop > touch
  sprintW: 0,            // 0..1, eased sprint amount (speed boost in the air)
  ft: 0, heading: 0, pos: new V(), speed: 0, turn: 0, turnRaw: 0,
  edge: 0,               // 0..1, how close to the edge of the world
  gy: 0, gyInit: false,  // terrain height under the body (smoothed)
  alt: 0, vy: 0, tgtAlt: 4, // alt = height ABOVE the ground
  step: 0, runW: 0, gp: 0, hz: 0.8, roll: 0, pitch: 0, pedal: 0, bob: 0, crouch: 0, support: 4,
  wp: 0, wRate: 0.25, amp: 0.05, base: 0.08, sweep: 0, glide: 0, flaps: 0,
};

export const act = { fire: -1, roar: -1, flap: 0 };

/** player input, filled by controls.js */
export const input = {
  sx: 0, sy: 0, mag: 0,          // stick: sx right+, sy forward+, mag 0..1
  up: false, down: false,        // flight height
  sprint: false,                 // Sprint button held (Shift on a keyboard)
  camYaw: 0,                     // direction the camera looks (set by camera.js)
};
