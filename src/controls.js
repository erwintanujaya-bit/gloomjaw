import { input } from './state.js';
import { orbitDrag } from './camera.js';

/*
 * How far the stick is pushed (0..1) decides how Gloomjaw moves.
 *   returns { gait: 'idle' | 'walk' | 'run', amount: 0..1 }
 * For 'walk', amount is the share of walking speed; for 'run', the share of the
 * range between a brisk trot and a full sprint.
 *
 * TODO(human): tune this feel. The version below is a plain starting point:
 * a small dead-zone, walk up to 60%, run beyond 75% (with a gap so it does not
 * flicker between walk and run when a thumb wobbles).
 */
export function stickToGait(mag, wasRunning) {
  const DEAD = 0.12, WALK_MAX = 0.6, RUN_ON = 0.75, RUN_OFF = 0.6;
  if (mag < DEAD) return { gait: 'idle', amount: 0 };
  const runNow = wasRunning ? mag > RUN_OFF : mag > RUN_ON;
  if (runNow) return { gait: 'run', amount: Math.min(1, (mag - RUN_OFF) / (1 - RUN_OFF)) };
  return { gait: 'walk', amount: Math.min(1, (mag - DEAD) / (WALK_MAX - DEAD)) };
}

const STICK_R = 62;           // pixels of thumb travel for a full push

export function initControls(hooks) {
  const layer = document.getElementById('touch');
  const base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob');
  let stickId = null, camId = null, ox = 0, oy = 0, lx = 0, ly = 0;
  const touchStick = { sx: 0, sy: 0, mag: 0 };
  const keys = new Set();
  const btn = { up: false, down: false };

  /* ----- joystick (left half) + camera drag (right half) ----- */
  layer.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    hooks.touched();
    if (e.clientX < window.innerWidth * 0.5 && stickId === null) {
      stickId = e.pointerId; ox = e.clientX; oy = e.clientY;
      base.style.transform = `translate(${ox}px,${oy}px) translate(-50%,-50%)`; knob.style.transform = base.style.transform;
      base.classList.add('on'); knob.classList.add('on');
    } else if (e.clientX >= window.innerWidth * 0.5 && camId === null) {
      camId = e.pointerId; lx = e.clientX; ly = e.clientY;
    } else return;
    layer.setPointerCapture(e.pointerId);
  });
  layer.addEventListener('pointermove', e => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const len = Math.hypot(dx, dy);
      if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
      knob.style.transform = `translate(${ox + dx}px,${oy + dy}px) translate(-50%,-50%)`;
      touchStick.sx = dx / STICK_R; touchStick.sy = -dy / STICK_R; touchStick.mag = Math.min(1, len / STICK_R);
    } else if (e.pointerId === camId) {
      orbitDrag(e.clientX - lx, e.clientY - ly);
      lx = e.clientX; ly = e.clientY;
    }
  });
  const release = e => {
    if (e.pointerId === stickId) {
      stickId = null; touchStick.sx = touchStick.sy = touchStick.mag = 0;
      base.classList.remove('on'); knob.classList.remove('on');
    }
    if (e.pointerId === camId) camId = null;
  };
  layer.addEventListener('pointerup', release);
  layer.addEventListener('pointercancel', release);

  /* ----- buttons ----- */
  const press = (id, fn, hold) => {
    const el = document.getElementById(id);
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); hooks.touched();
      el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      fn(true);
    });
    const up = e => { el.classList.remove('down'); if (hold) fn(false); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  press('bFly', on => on && hooks.fly());
  press('bFire', on => on && hooks.fire());
  press('bRoar', on => on && hooks.roar());
  press('bUp', on => { btn.up = on; }, true);
  press('bDown', on => { btn.down = on; }, true);
  document.getElementById('bPause').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); hooks.pause(); });

  /* ----- keyboard (for testing on a PC) ----- */
  window.addEventListener('keydown', e => {
    const c = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) e.preventDefault();
    if (e.repeat) return;
    keys.add(c);
    if (c === 'Space') hooks.fly();
    else if (c === 'KeyF') hooks.fire();
    else if (c === 'KeyR') hooks.roar();
    else if (c === 'Escape' || c === 'KeyP') hooks.pause();
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  /* ----- stop Safari doing its own thing ----- */
  const stop = e => e.preventDefault();
  ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'selectstart', 'dblclick'].forEach(n => document.addEventListener(n, stop));
  document.addEventListener('touchmove', stop, { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastEnd < 350) e.preventDefault(); lastEnd = n; }, { passive: false });

  /** call once per frame: merges touch + keyboard into `input` */
  return function updateInput() {
    if (touchStick.mag > 0) {
      input.sx = touchStick.sx; input.sy = touchStick.sy; input.mag = touchStick.mag;
    } else {
      let x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      let y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      const len = Math.hypot(x, y);
      if (len > 0) { x /= len; y /= len; }
      input.sx = x; input.sy = y;
      input.mag = len > 0 ? (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0.45) : 0;
    }
    input.up = btn.up || keys.has('KeyE') || keys.has('PageUp');
    input.down = btn.down || keys.has('KeyQ') || keys.has('PageDown');
  };
}
