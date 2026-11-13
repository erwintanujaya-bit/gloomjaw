import { V, k, lerp, clamp, wrapA, smoothstep } from './util.js';
import { G, S, act, input } from './state.js';

/* CAM: tune the chase camera here */
export const CAM = {
  distWalk: 9.5, distRun: 12, distFly: 14.5, // how far behind (world units); smaller = closer
  pitchGround: 0.3, pitchFly: 0.2,           // how high above (radians)
  lookHeight: 2.2,                           // aim a bit above Gloomjaw's middle
  follow: 6,                                 // position follow speed
  idleReturn: 2.0,                           // seconds of no dragging before it swings back behind
  returnRate: 1.6,
  shakeMax: 0.6,                             // roar shake in world units
};

const cam = { yaw: Math.PI, pitch: 0.32, dist: 14, idle: 99, target: new V(), init: false, title: false, titleAng: 0 };

export function resetCamera() { cam.init = false; cam.idle = 99; input.camYaw = S.heading; }
export function setTitleCamera(on) { cam.title = on; cam.init = false; }

/** drag on the right half of the screen */
export function orbitDrag(dx, dy) {
  cam.yaw -= dx * 0.0085;
  cam.pitch = clamp(cam.pitch + dy * 0.0065, 0.04, 1.2);
  cam.idle = 0;
}

/** how hard the screen shakes: peaks with the main roar, then fades through the three grunts */
function roarShake(tr) {
  if (tr < 0) return 0;
  let a = 0;
  if (tr < 2.1) { const u = tr / 1.9; a = u < 0.3 ? Math.sin((u / 0.3) * Math.PI / 2) : 1 - 0.55 * Math.min(1, (u - 0.3) / 0.7); }
  [[2.0, 0.8], [2.38, 0.55], [2.72, 0.38]].forEach(([s, m]) => { const d = tr - s; if (d >= 0 && d < 0.45) a = Math.max(a, m * (1 - d / 0.45)); });
  return a;
}

const _tgt = new V(), _right = new V(), _up = new V(0, 1, 0);
export function updateCamera(dt) {
  const camera = G.camera, t = G.t;
  const want = _tgt.set(S.pos.x, S.gy + S.alt + CAM.lookHeight, S.pos.z);
  if (!cam.init) { cam.target.copy(want); cam.yaw = S.heading + Math.PI; cam.init = true; }
  cam.target.lerp(want, k(dt, CAM.follow));

  cam.idle += dt;
  if (cam.title) {
    cam.titleAng += dt * 0.25;
    cam.yaw = S.heading + 0.5 + Math.sin(cam.titleAng) * 0.5;       // slow sway around the front
    cam.pitch += (0.2 - cam.pitch) * k(dt, 2); cam.dist += (15 - cam.dist) * k(dt, 2);
  } else {
    // swing back behind the dragon only when nobody is steering: turning the picture while a thumb is on the stick
    // makes "left" mean something different from one moment to the next
    if (cam.idle > CAM.idleReturn && input.mag < 0.12) {
      cam.yaw += wrapA(S.heading + Math.PI - cam.yaw) * k(dt, CAM.returnRate);
      cam.pitch += ((S.flying ? CAM.pitchFly : CAM.pitchGround) - cam.pitch) * k(dt, 1.2);
    }
    const flyW = smoothstep(0.5, 3, S.alt);
    const distT = lerp(lerp(CAM.distWalk, CAM.distRun, S.runW), CAM.distFly, flyW);
    cam.dist += (distT - cam.dist) * k(dt, 1.5);
  }

  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cam.dist * cp, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cam.dist * cp);
  const floor = G.heightAt(camera.position.x, camera.position.z) + 1.3;      // never go into the ground
  if (camera.position.y < floor) camera.position.y = floor;

  camera.lookAt(cam.target);
  input.camYaw = cam.yaw + Math.PI;                                          // the direction the camera looks

  // roar shake (camera only, not the model)
  const sh = roarShake(act.roar) * CAM.shakeMax;
  if (sh > 0) {
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const nx = Math.sin(t * 61) + 0.6 * Math.sin(t * 97 + 1.3), ny = Math.sin(t * 73 + 0.7) + 0.6 * Math.sin(t * 119);
    camera.position.addScaledVector(_right, nx * sh * 0.5).addScaledVector(_up, ny * sh * 0.5);
    camera.rotateZ(Math.sin(t * 53 + 2) * sh * 0.05);
  }
}
