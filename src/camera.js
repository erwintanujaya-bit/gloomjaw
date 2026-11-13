import { V, k, lerp, clamp, wrapA, smoothstep } from './util.js';
import { G, S, act, input } from './state.js';

/* CAM: tune the chase camera here */
export const CAM = {
  distClose: 6, distFar: 24,                 // how far behind (world units): very close when slow, pulls right back at top speed
  speedFar: 45,                              // the speed at which the camera is fully pulled back
  fovClose: 48, fovFar: 62,                  // field of view: widens with speed
  pitchGround: 0.3, pitchFly: 0.2,           // how high above (radians)
  lookHeight: 2.2,                           // aim a bit above Gloomjaw's middle
  follow: 6,                                 // position follow speed
  idleReturn: 1.2,                           // seconds of no dragging before it swings back behind
  returnRate: 1.6,                           // how fast it swings back when you are not steering
  followTurn: 4.5,                           // how tightly it follows while steering (higher = stays more directly behind)
  shakeMax: 0.6,                             // roar shake in world units
};

const cam = { yaw: Math.PI, pitch: 0.32, dist: 14, idle: 99, target: new V(), init: false, title: false, titleAng: 0 };

export function resetCamera() { cam.init = false; cam.idle = 99; input.camYaw = S.heading; if (G.camera.fov !== 48) { G.camera.fov = 48; G.camera.updateProjectionMatrix(); } }
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
  cam.target.lerp(want, k(dt, CAM.follow + 0.3 * S.speed));      // follows tighter the faster you go

  cam.idle += dt;
  if (cam.title) {
    cam.titleAng += dt * 0.25;
    cam.yaw = S.heading + 0.5 + Math.sin(cam.titleAng) * 0.5;       // slow sway around the front
    cam.pitch += (0.2 - cam.pitch) * k(dt, 2); cam.dist += (15 - cam.dist) * k(dt, 2);
  } else {
    // stay behind the dragon: quickly while steering (so a turn shows as the world rolling past), gently otherwise.
    // After you drag the view yourself it waits a moment before swinging back.
    if (cam.idle > CAM.idleReturn) {
      cam.yaw += wrapA(S.heading + Math.PI - cam.yaw) * k(dt, input.mag > 0.12 ? CAM.followTurn : CAM.returnRate);
      cam.pitch += ((S.flying ? CAM.pitchFly : CAM.pitchGround) - cam.pitch) * k(dt, 1.2);
    }
    // the faster you go, the further the camera pulls back and the wider the view (0 = standing still, 1 = flat out)
    const sN = smoothstep(0, CAM.speedFar, S.speed);
    cam.dist += (lerp(CAM.distClose, CAM.distFar, sN) - cam.dist) * k(dt, 2);
    const fovT = lerp(CAM.fovClose, CAM.fovFar, sN);
    if (Math.abs(camera.fov - fovT) > 0.03) { camera.fov += (fovT - camera.fov) * k(dt, 3); camera.updateProjectionMatrix(); }
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
