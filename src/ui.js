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
  tap('bSound', () => { setMuted(!isMuted()); store.set('muted', isMuted() ? '1' : '0'); refreshSoundButton(); });
}
