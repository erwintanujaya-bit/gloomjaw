import { isMuted, setMuted } from './audio.js';

const $ = id => document.getElementById(id);

/* localStorage can be blocked (private mode), so always wrap it */
const store = {
  get(key) { try { return localStorage.getItem('gloomjaw.' + key); } catch (e) { return null; } },
  set(key, v) { try { localStorage.setItem('gloomjaw.' + key, v); } catch (e) { /* ignore */ } },
};

export function loadSettings() {
  if (store.get('muted') === '1') setMuted(true);
  refreshSoundButton();
}
function refreshSoundButton() { $('bSound').textContent = isMuted() ? 'Sound: off' : 'Sound: on'; }

export function setProgress(p) { $('loadBar').style.width = Math.round(clamp01(p) * 100) + '%'; }
const clamp01 = x => Math.max(0, Math.min(1, x));
export function loadFailed() {
  $('loadText').textContent = "Gloomjaw didn't load";
  $('loadSub').textContent = 'Close this page and open it again.';
}
export function showLoading(text) {
  const el = $('loading');
  $('loadText').textContent = text; $('loadSub').textContent = 'Loading the 3D dragon'; setProgress(0);
  el.style.transition = 'none'; el.style.opacity = '1'; el.style.pointerEvents = 'auto';
  el.classList.remove('hidden');
}
export function hideLoading() {
  const el = $('loading');
  el.style.transition = 'opacity .5s'; el.style.opacity = '0'; el.style.pointerEvents = 'none';
  setTimeout(() => el.classList.add('hidden'), 520);
}

export function showTitle(on) { $('title').classList.toggle('hidden', !on); }
export function showHud(on) { $('hud').classList.toggle('hidden', !on); }
export function showPause(on) { $('pause').classList.toggle('hidden', !on); }

/** Fly button: "Fly" on the ground, "Land" in the air; Up/Down only while flying */
export function setFlying(flying) {
  document.body.classList.toggle('flying', flying);
  $('bFly').classList.toggle('active', flying);
  $('flyLabel').textContent = flying ? 'Land' : 'Fly';
}

/** Rider button: highlighted while the rider is on Gloomjaw. Remembers the choice on this device. */
export function setRiderButton(on, save = true) {
  $('bRide').classList.toggle('on', on);
  $('rideLabel').textContent = on ? 'Knight: on' : 'Knight';
  if (save) store.set('rider', on ? '1' : '0');
}
export const savedRider = () => store.get('rider') === '1';

/** dragon picker on the title screen: one big card per dragon */
export const savedDragon = () => store.get('dragon');
export const saveDragon = id => store.set('dragon', id);
export function buildPicker(dragons, onPick) {
  const box = $('picker');
  box.textContent = '';
  for (const [id, d] of Object.entries(dragons)) {
    const b = document.createElement('button');
    b.className = 'pick'; b.dataset.id = id;
    b.innerHTML = `<b></b><small></small>`;
    b.firstChild.textContent = d.name; b.lastChild.textContent = d.tag;
    b.addEventListener('click', e => { e.preventDefault(); onPick(id); });
    box.appendChild(b);
  }
}
export function setPicked(id) {
  document.querySelectorAll('#picker .pick').forEach(b => b.classList.toggle('on', b.dataset.id === id));
}

let toastTimer = 0;
export function toast(msg, ms = 5000) {
  const el = $('toast');
  el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}
/** one-time tip about the iPhone silent switch */
export function maybeSoundHint() {
  if (store.get('soundHint') === '1') return;
  store.set('soundHint', '1');
  toast('No sound? Flip the silent switch! \u{1F514}', 6000);
}

export function showFps(on) { $('fps').classList.toggle('hidden', !on); }
export function setFpsText(t) { $('fps').textContent = t; }

export function initMenus(h) {
  const tap = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); fn(); });
  tap('bPlay', h.play);
  tap('bResume', h.resume);
  tap('bRestart', h.restart);
  tap('bChange', h.change);
  tap('bSound', () => { setMuted(!isMuted()); store.set('muted', isMuted() ? '1' : '0'); refreshSoundButton(); });
}
