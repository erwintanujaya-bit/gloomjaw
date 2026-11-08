# Phase 1: Controls + Void Jungle

Goal: Asher opens a link on his iPhone 16 in Safari and can **roam the Void
Jungle as Gloomjaw** with touch controls. Free exploring, no goals yet.

## 1. Project setup
- Vite project, three.js from npm, ES modules. Folders: `src/` (game code),
  `public/` (glb, icons, manifest).
- Copy `assets/gloomjaw.glb` to `public/models/`.
- Port from `reference/gloomjaw-viewer-prototype.html` into modules, e.g.
  `rig.js` (setupRig, pose, legIK), `motion.js` (move, animateRig, TUNE),
  `effects.js` (fire + starbursts, dust, motes), `audio.js` (roar, fire,
  flap, footsteps), `world.js`, `controls.js`, `camera.js`, `ui.js`, `main.js`.
- Update three.js API differences from r128 (e.g. color space settings).

## 2. Screens
- **Title screen:** "Gloomjaw" logo text, the dragon idling behind it, one big
  **Play** button. That tap also unlocks audio.
- **Rotate hint:** if portrait, a friendly "Turn your phone sideways" overlay.
- **Sound hint:** small one-time tip: "No sound? Flip the silent switch."
- **Pause button** (top corner): Resume, Sound on/off, Restart.

## 3. Controls (landscape, touch; keyboard too for testing on PC)
- **Left thumb joystick** (appears where the thumb lands, left half of screen):
  small push = walk, full push = run. Direction is relative to the camera.
  Gloomjaw turns smoothly toward the stick direction (no instant snapping).
- **Right side buttons** (large, thumb-reachable, safe-area aware):
  **Fly** (toggle: takeoff / land), **Fire**, **Roar**. While flying, add
  **Up** and **Down** buttons (or hold Fly = climb) to change height.
- **Drag on the right half** (not on a button) to orbit the camera; it
  eases back behind Gloomjaw after 2 s idle.
- Keyboard: WASD/arrows move, Shift run, Space fly, F fire, R roar.
- Multi-touch must work (steer while pressing Fire).

## 4. Movement (replace the prototype's auto-circling with player control)
- Keep the prototype's gait system, IK, takeoff/cruise/glide/land states,
  springy tail, banking. Speed and turn now come from the joystick.
- In flight: joystick steers and sets speed, Up/Down change altitude,
  flap-glide rhythm stays automatic. Can't go below terrain.
- Walking follows the **terrain height** (feet IK onto the ground surface,
  body height follows the average of the feet).

## 5. Void Jungle biome
- ~200 x 200 unit play area with gentle hills (procedural noise heightmap).
- Dark ground, glowing purple mushrooms (instanced), twisted dark trees,
  rocks, a few glowing pools, floating purple motes, fog and a soft sky.
- A soft boundary: thicker fog and Gloomjaw gently turns back at the edge.
- Match the mood of `assets/concept/gloomjaw-sheet.jpg` (left panel background).

## 6. Camera
- Third-person chase camera behind and above, smooth follow, pulls back
  further when running and flying, never clips into terrain.

## 7. Requested tweaks from the last session
- **Wing fingers twitch in flight:** small staggered curls on finger bones
  `049/048, 052/051/050` and `054/053, 057/056/055`, stronger on the
  downstroke, gentle flex while gliding.
- **Roar shakes the screen strongly:** a big rumble that peaks with the main
  roar and fades over the three grunts (camera shake, not model shake).

## 8. iPhone polish
- `viewport-fit=cover`, safe-area padding for buttons.
- Block page scroll, pinch zoom, double-tap zoom, text selection, callouts.
- Web app manifest + apple-touch-icon (a Gloomjaw eye or silhouette) so
  Add to Home Screen gives an app icon and full-screen launch.
- Loading screen with progress while the 4.3 MB model downloads.

## 9. Deploy
- `npm run build` produces a static `dist/`.
- Set up GitHub Pages deploy (GitHub Actions) or give me Netlify steps.
  Ask me which I prefer before setting it up.

## Done when
- [ ] Plays at a steady ~60 fps on iPhone 16 Safari (check with a frame counter in dev).
- [ ] Walk, run, fly, land, fire, roar all work with touch, including at the same time.
- [ ] Feet stay planted on hills, no sliding, no knees bending backward.
- [ ] Wing fingers twitch in flight; roar shakes the screen.
- [ ] Title, rotate hint, pause menu, loading screen work.
- [ ] Works from Home Screen icon.
- [ ] I have a link I can send to Asher.
