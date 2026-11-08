# Gloomjaw: Biome Adventure

A 3D web game I'm building with my son Asher (8). He designed the dragon
**Gloomjaw** and the biome world. He plays on an **iPhone 16 in Safari**, so
everything must work great there first.

## The game in one line
Explore the five biomes from Asher's poster as Gloomjaw: walk, run, fly,
breathe fire and roar.

## Who reads/plays what
- **Player:** Asher, age 8. Big buttons, simple words, instant fun, no reading walls.
- **Owner:** me (Erwin). I test on a Windows Surface Pro and my Android phone,
  then send Asher a link.

## Tech decisions (keep unless I agree to change)
- **Vite + three.js (current npm version) + plain JavaScript (ES modules).**
  No heavy frameworks. No physics engine (hand-written motion is fine).
- **Mobile-first:** landscape, touch controls, 60 fps target on iPhone 16.
  Cap pixel ratio at 2, shadows only where they matter, few draw calls.
- **Static build** deployable to GitHub Pages (or Netlify). Relative asset paths.
- **iOS Safari rules:** `viewport-fit=cover` + safe-area insets, block pinch and
  double-tap zoom (`touch-action: none`, gesture events), unlock audio on first
  tap, no reliance on the Fullscreen API (iPhone Safari lacks it). Add a web app
  manifest + apple-touch-icon so "Add to Home Screen" opens it like an app.
- **Sound:** Web Audio, synthesized (no audio files needed yet). Remember the
  iPhone silent switch mutes web audio: show a small "turn sound on" hint.
- **Saving:** localStorage only (per device), wrapped in try/catch.

## Assets
- `assets/gloomjaw.glb` — Gloomjaw, 12k triangles, Meshy Smart Rig (58 bones,
  no animations). Textures already compressed to 2048 JPEG and a **glow
  (emissive) map** added for the purple cracks. 4.3 MB.
- `assets/concept/` — Asher's concept art: `gloomjaw-sheet.jpg` (turnaround),
  `biome-dragon-poster.jpg` (all biomes and other dragons), clean views.
- `tools/repack_glb.py` — compresses a Meshy GLB's textures and adds the glow
  map. Use it for future dragons: `python3 tools/repack_glb.py in.glb out.glb`.

## How Gloomjaw is animated (read `docs/rig-notes.md` before touching motion)
All motion is **procedural**: bones are rotated by code every frame. The
working implementation is in `reference/gloomjaw-viewer-prototype.html`
(three.js r128, single file). Port its logic, do not reinvent it:
`setupRig`, `pose`, `legIK`, `move`, `animateRig`, the fire/starburst particles,
the lion-style roar synth. Note: the prototype loads the model from a base64
text file; in this project load `assets/gloomjaw.glb` directly.

## Docs
- `docs/phase1-spec.md` — what to build now (start here)
- `docs/roadmap.md` — later phases, for context only
- `docs/rig-notes.md` — bone map, axis conventions, IK, gotchas
- `docs/motion-spec.md` — the realism rules for walk/run/fly

## Working style
- Build in small steps, run it, check it. Keep a short `CHANGELOG.md`.
- Put tunable numbers in one `TUNE` object per system.
- When you finish a step, tell me how to test it on my phone (LAN URL from
  `npm run dev -- --host`).
- Ask me before adding any dependency beyond three.js and Vite.
