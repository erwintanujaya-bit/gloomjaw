# Changelog

## Phase 1: controls + Void Jungle
- Vite + three.js (npm) project, plain JS modules. `npm run dev` shows a LAN URL for phones.
- Ported the prototype's rig, leg IK, gait/flight state machine, springy tail, fire, roar synth
  into `rig.js`, `motion.js`, `effects.js`, `audio.js` (see `docs/rig-notes.md`).
- Player control: left thumb joystick (walk / run), Fly/Land, Fire, Roar, Up/Down while flying,
  drag right half to orbit the camera (swings back after 2 s). Keyboard: WASD/arrows, Shift, Space, F, R, Q/E.
- Terrain: procedural hills, feet and body follow the ground (leans with slopes), flat start meadow.
- Void Jungle: instanced glowing mushrooms, twisted trees, rocks, glowing pools, motes, stars, fog,
  hills that rise at the edge plus thicker fog and a gentle turn-back.
- Wing fingers twitch in flight; roar shakes the camera (peaks with the main roar, fades over the grunts).
- Title, loading bar, rotate hint, pause menu (Resume / Sound / Start over), one-time silent-switch tip.
- iPhone polish: safe areas, no zoom/scroll/selection, manifest + apple-touch-icon.
- Performance: all particles are `THREE.Points` (one draw call each); adaptive pixel ratio if fps drops.

### Differences from the r128 prototype
- three.js r187: `outputColorSpace`, physical light units (light intensities x PI), `Clock` still works.
- Sprites replaced with GPU point systems; mushrooms, trees and rocks use InstancedMesh.
- `?fps` in the URL shows a frame counter (always on in dev).
