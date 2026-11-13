# Changelog

## Knight rider
- The rider is now the **Death Knight** (by Northcliffe, CC BY-NC 4.0, credited on the title screen and in `CREDITS.md`).
  He is loaded once (`public/models/knight.glb`, 1.5 MB, shrunk from 4.4 MB with `tools/shrink_glb.py`), seated by code
  with legs round the dragon's back, and holds his sword up. He moves to the new dragon when you switch.
  The old little kid is only a fallback if the knight cannot load. The button is now called **Knight**.
- Pose and size live in `RIDER` in `src/rider.js` (`height`, `pose`, `hipDrop`).
- **Non-commercial:** this model's license forbids selling the game or adding ads while it is included.

## Lava Lands + calmer wings
- **Biomes are themes** (`THEMES` in `src/world.js`): colours, light, fog, props and glow. Each dragon has a
  `world` in `dragons.js`; picking Emberclaw builds the **Lava Lands**, picking Gloomjaw the Void Jungle.
  The old world is removed and its memory freed when you switch.
- Lava Lands: black basalt with glowing cracks, big lava lakes, obsidian spikes, charred trees with embers,
  red haze and floating embers.
- Emberclaw's wings now sweep back low along the body when it stands still (they used to point straight up).
  New wing settings in `dragons.js`: `foldSweep`, `foldWrist`, `riderFold`.

## Second dragon: Emberclaw
- **Dragons are data now** (`src/dragons.js`): each dragon has its model, bone map, size, breath colours, roar pitch,
  wing tweaks and rider seat. `setupRig(bones)` reads the bone map instead of hard-coded names.
- **Emberclaw** (lava dragon, from Asher's Meshy model): orange fire, higher roar, wings tucked up on the ground
  and flapping lower in the air. No jaw bone, so the head bows into the breath. `public/models/emberclaw.glb` (4.9 MB, was 17 MB).
- **Dragon picker** on the title screen (remembers the choice) and a **Change dragon** button in the pause menu.
  Only the chosen dragon's model downloads. The old model's GPU memory is freed when you switch.
- `tools/repack_glb.py in.glb out.glb orange` makes the glow map for lava dragons (default is purple).
  `tools/inspect_bones.py model.glb` prints a skeleton so bones can be matched to body parts.

## Movement update
- **Sprint:** hold the Sprint button to sprint (Shift on a keyboard). The stick now steers and sets walk speed;
  sprinting in the air is 1.6x faster. `stickToGait(mag, sprint)` in `controls.js`.
- **Jump:** tap Jump for a hop (squat, spring, landing thud). Tap Jump again in the air to flap up into flight.
  Tuned in `TUNE` (`jumpSpeed`, `gravity`, `jumpWind`). Space = jump, V = fly/land, B = rider on a keyboard.
- **Rider:** a small kid with a gold helmet and cape rides on Gloomjaw's back (`src/rider.js`). The Rider button
  turns the rider on or off and remembers the choice. The rider leans with speed and turns, and the cape flutters.
- **Closer camera:** chase distance 14/17/20 -> 9.5/12/14.5 (`CAM` in `camera.js`).

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
