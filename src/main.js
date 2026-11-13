import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { V, env } from './util.js';
import { G, S, act, input, FIRE_DUR, ROAR_DUR } from './state.js';
import { setupRig } from './rig.js';
import { move, animateRig, resetMotion, toggleFly, jump, applyTune } from './motion.js';
import { DRAGONS, DEFAULT_DRAGON } from './dragons.js';
import { initRider, setRider, riderOn, updateRider, loadKnight, detachRider, RIDER } from './rider.js';
import { initEffects, updateEffects, emitFire, getMouth, setPointScale, setBreath, setAmbience } from './effects.js';
import { buildWorld, updateWorld, getFireLight } from './world.js';
import { updateCamera, setTitleCamera, resetCamera, CAM } from './camera.js';
import { initControls } from './controls.js';
import { unlockAudio, sfxFire, sfxRoar, setVoice, sfxRing, sfxGo, sfxEnd } from './audio.js';
import { initRings, updateRings, resetRings, hideRings, game as ringGame, nextRing, ringCount } from './rings.js';
import * as ui from './ui.js';

const canvas = document.getElementById('c');
const showFps = import.meta.env.DEV || new URLSearchParams(location.search).has('fps');

/* ---------- renderer / scene ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;      // cheaper than the soft one, fine on a phone

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 500);
G.scene = scene; G.camera = camera;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  setPointScale(h * pixelRatio, camera.fov);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------- game phase ---------- */
let phase = 'loading';          // loading | title | playing
let paused = false;
const isPortrait = () => window.innerHeight > window.innerWidth;

function setPaused(p) {
  if (phase !== 'playing') return;
  paused = p;
  ui.showPause(p);
}

const updateInput = initControls({
  touched: () => { /* any tap may wake audio */ },
  fly: () => { if (phase === 'playing' && !paused) { toggleFly(); ui.setFlying(S.flying); } },
  jump: () => { if (phase === 'playing' && !paused) { jump(); ui.setFlying(S.flying); } },
  ride: () => { if (phase === 'playing' && !paused) { const on = !riderOn(); setRider(on); ui.setRiderButton(on); } },
  fire: () => { if (phase === 'playing' && !paused && act.fire < 0) { act.fire = 0; sfxFire(); } },
  roar: () => { if (phase === 'playing' && !paused && act.roar < 0) { act.roar = 0; sfxRoar(); } },
  pause: () => { if (ringGame.state !== 'over') setPaused(!paused); },     // the score screen has its own button
});

ui.loadSettings();
ui.initMenus({
  play: () => {
    unlockAudio();                 // Safari needs a tap before it will make sound
    phase = 'playing'; paused = false;
    setTitleCamera(false); resetCamera();
    ui.showTitle(false); ui.showHud(true); ui.setFlying(false);
    ui.showScore(true); ui.showResult(false); resetRings();          // a fresh ring trail ahead of the dragon
    const tip = ui.maybeRingHint();
    setTimeout(ui.maybeSoundHint, tip ? 6300 : 0);
  },
  resume: () => setPaused(false),
  change: () => {                   // back to the title screen to pick a dragon
    if (phase !== 'playing') return;
    paused = false; ui.showPause(false); ui.showHud(false); ui.showResult(false); ui.showScore(false); hideRings();
    resetMotion(); resetCamera(); setTitleCamera(true);
    phase = 'title'; ui.showTitle(true);
  },
  restart: () => {
    resetMotion(); resetCamera(); ui.setFlying(false); setPaused(false); resetRings();
  },
  again: () => { ui.showResult(false); paused = false; resetRings(); },        // Play again after the score screen
});

/* ---------- load the world and Gloomjaw ---------- */
const firstDragon = DRAGONS[ui.savedDragon()] ? ui.savedDragon() : DEFAULT_DRAGON;
let worldId = DRAGONS[firstDragon].world;
const theme = buildWorld(scene, worldId);
initEffects();
setAmbience(theme);
initRings(scene, {                  // the 60 second ring challenge (rings.js)
  start: () => { ui.rememberRing(); sfxGo(); ui.toast('Go! 60 seconds!', 1800); },
  score: n => { ui.setScore(n); if (n > 0) sfxRing(n); },
  time: t => ui.setTimer(t, ringGame.state === 'free'),
  end: n => { sfxEnd(); paused = true; ui.showResult(true, n); },
});
const fireLight = getFireLight();
ui.showFps(showFps);

/** free the GPU memory of the dragon we are replacing (matters on a phone) */
function disposeModel(model) {
  scene.remove(model);
  model.traverse(o => {
    if (!o.isMesh) return;
    o.geometry.dispose();
    const m = o.material;
    if (m) { for (const key of ['map', 'normalMap', 'emissiveMap', 'metalnessMap', 'roughnessMap']) if (m[key]) m[key].dispose(); m.dispose(); }
  });
}

const loader = new GLTFLoader();
const knightReady = loadKnight(import.meta.env.BASE_URL);    // the rider loads once, in parallel with the dragon
let busy = false;

/** load a dragon from dragons.js, swap it in, and give it its own numbers, colours and voice */
function loadDragon(id, first = false) {
  const cfg = DRAGONS[id];
  if (!cfg || busy) return;
  busy = true;
  ui.showLoading(`Waking up ${cfg.name}…`);
  loader.load(import.meta.env.BASE_URL + cfg.model, gltf => knightReady.then(() => {
    const inner = gltf.scene;
    const maxAniso = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    G.glowMat = null;
    inner.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      const m = o.material;
      if (m) {
        for (const key of ['map', 'normalMap', 'emissiveMap', 'metalnessMap']) if (m[key]) m[key].anisotropy = maxAniso;
        if (m.emissiveMap) G.glowMat = m;
      }
    });
    const box = new THREE.Box3().setFromObject(inner), size = box.getSize(new V()), c = box.getCenter(new V());
    inner.position.set(-c.x, -box.min.y, -c.z);
    const model = new THREE.Group();
    model.rotation.order = 'YXZ';
    model.add(inner);
    model.scale.setScalar(cfg.size / Math.max(size.x, size.y, size.z));     // longest side = cfg.size world units
    const rider = G.model ? riderOn() : ui.savedRider();
    detachRider();                                  // the knight moves to the new dragon, so he must not be thrown away with the old one
    if (G.model) disposeModel(G.model);
    scene.add(model);
    if (cfg.world !== worldId) { worldId = cfg.world; setAmbience(buildWorld(scene, worldId)); }   // each dragon lives in its own biome
    G.model = model; G.inner = inner; G.dragon = cfg;
    model.updateMatrixWorld(true);
    G.rig = setupRig(cfg.bones);
    applyTune(cfg.tune); setBreath(cfg.breath); setVoice(cfg.voice);
    fireLight.color.set(cfg.breath.light);
    initRider(rider, cfg.rider); ui.setRiderButton(rider, false);
    resetMotion();
    resize();
    setTitleCamera(true);
    currentId = id; ui.setPicked(id); ui.saveDragon(id);
    phase = 'title';
    hideRings(); ui.showScore(false);
    ui.showTitle(true); ui.showHud(false);
    ui.hideLoading();
    busy = false;
  }).catch(err => { console.error(err); busy = false; ui.loadFailed(); }), e => {
    ui.setProgress(e.lengthComputable ? e.loaded / e.total : e.loaded / 4.8e6);
  }, err => { console.error(err); busy = false; ui.loadFailed(); });
}

let currentId = null;
ui.buildPicker(DRAGONS, id => { if (id !== currentId && phase === 'title') loadDragon(id); });
loadDragon(firstDragon, true);

/* ---------- main loop ---------- */
const clock = new THREE.Clock();
let frames = 0, acc = 0, fps = 60, lowTime = 0;
const _p = new V(), _d = new V();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);

  // frame counter + a safety net: if a phone struggles, drop the resolution a notch
  frames++; acc += dt;
  if (acc >= 0.5) {
    fps = frames / acc; frames = 0; acc = 0;
    if (showFps) ui.setFpsText(`${fps.toFixed(0)} fps\n${renderer.info.render.calls} calls\n${(renderer.info.render.triangles / 1000).toFixed(0)}k tris\nDPR ${pixelRatio.toFixed(2)}`);
    if (phase === 'playing' && !paused && fps < 45) lowTime += 0.5; else lowTime = 0;
    if (lowTime >= 3 && pixelRatio > 1.25) { pixelRatio = Math.max(1.25, pixelRatio - 0.25); resize(); lowTime = 0; }
  }

  if (G.model && G.rig) {
    const running = (phase === 'playing' && !paused && !isPortrait()) || phase === 'title';
    if (running) update(dt);
  }
  renderer.render(scene, camera);
}

/** one step of the game (everything except drawing) */
function update(dt) {
  G.t += dt;
  if (phase === 'playing') updateInput();
  else { input.mag = 0; input.sx = input.sy = 0; input.up = input.down = input.sprint = false; }
  if (act.fire >= 0) { act.fire += dt; if (act.fire > FIRE_DUR) act.fire = -1; }
  if (act.roar >= 0) { act.roar += dt; if (act.roar > ROAR_DUR) act.roar = -1; }
  const fk = env(act.fire, FIRE_DUR, 0.3, 0.4), rk = env(act.roar, ROAR_DUR, 0.25, 0.5);
  move(dt);
  if (phase === 'playing') updateRings(dt);
  animateRig(fk, rk, dt);
  updateRider(dt);
  updateCamera(dt);
  emitFire(dt, fk, act.fire, FIRE_DUR);
  if (fk > 0) { getMouth(_p, _d); fireLight.position.copy(_p); fireLight.intensity = fk * (60 + Math.random() * 25); }
  else fireLight.intensity = 0;
  updateEffects(dt);
  updateWorld(dt, camera.position);
}
resize();
frame();

// dev-only test handle: __gj.sim(seconds) fast-forwards the game in 1/60 s steps
if (import.meta.env.DEV) {
  window.__gj = {
    G, S, act, input, renderer, loadDragon, RIDER, CAM, ringGame, nextRing, ringCount,
    sim(sec) { if (phase === 'title') { ui.showTitle(false); ui.showHud(true); } phase = 'playing'; paused = false; for (let i = 0; i < sec * 60; i++) update(1 / 60); },
  };
}
