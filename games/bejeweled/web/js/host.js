// Running on Kuddes (index.html?host=kuddes, in an iframe on /spellen/alleen/bejeweled):
// your badges and best scores come from your Kuddes account, badge progress and
// finished games go back to it (they're achievements and high scores there), and
// the page around the game hears about it. Without ?host the game works on its own.
import { store, setStorePrefix } from './util.js';

export const HOSTED = new URLSearchParams(location.search).get('host') === 'kuddes';

let userId = null;
let known = new Set();
let pending = null;
let timer = 0;

/** Tells the Kuddes page something happened ({ source: 'bejeweled', type }). */
export function tell(type, data = {}) {
  if (HOSTED && window.parent !== window) window.parent.postMessage({ source: 'bejeweled', type, ...data }, location.origin);
}

/** Before the game starts: whose game this is, and their badges and bests. `badgeIds`: the badges Kuddes knows. */
export async function initHost(badgeIds) {
  if (!HOSTED) return;
  known = new Set(badgeIds);
  let progress = null;
  try {
    const r = await fetch('/api/bejeweled', { credentials: 'same-origin' });
    if (r.ok) progress = await r.json();
  } catch (e) {
    console.warn('kuddes', e);
  }
  userId = progress?.userId ?? null;
  // Every member their own saves and settings in this browser; visitors share one
  setStorePrefix(userId ? `bj3h5.u${userId}.` : 'bj3h5.guest.');
  if (!userId) return;
  // What the account has wins when it's further than this browser
  const badges = store('badges') || {};
  let behind = false;
  for (const id of known) {
    const mine = badges[id] || { value: 0, level: 0 };
    const theirs = progress.badges[id] || { value: 0, level: 0 };
    if (mine.value > theirs.value) behind = true;
    badges[id] = { value: Math.max(mine.value, theirs.value), level: Math.max(mine.level, theirs.level) };
  }
  store('badges', badges);
  for (const [mode, best] of Object.entries(progress.bests || {})) {
    const mine = store(mode + 'Best');
    if (!mine || best.score > mine.score) store(mode + 'Best', best);
  }
  // Played further here than the account knows (e.g. while the connection was gone)
  if (behind) badgesChanged(badges, true);
}

export const signedIn = () => HOSTED && !!userId;

/** The badge counts changed; they're sent a moment later (or now, for a new level). */
export function badgesChanged(data, now = false) {
  if (!signedIn()) return;
  pending = {};
  for (const id of known) if (data[id]?.value) pending[id] = data[id].value;
  clearTimeout(timer);
  if (now) flush();
  else timer = setTimeout(flush, 4000);
}

/** Sends the badge counts that are still waiting (also when the page goes away). */
export function flush() {
  clearTimeout(timer);
  if (!pending || !signedIn()) return;
  const body = JSON.stringify({ badges: pending });
  pending = null;
  fetch('/api/bejeweled/badges', { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' })
    .then((r) => r.ok && tell('progress'))
    .catch((e) => console.warn('kuddes', e));
}

/** A finished game (or, in Zen, how far you got): onto the high-score list of its mode. */
export function submitScore(mode, score, details) {
  if (!signedIn() || !(score > 0)) return;
  flush();
  const clean = {};
  for (const [k, v] of Object.entries(details)) if (Number.isFinite(v)) clean[k] = Math.round(v);
  fetch('/api/solo/bejeweled/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ score: Math.round(score), won: false, mode, details: clean }),
    keepalive: true,
    credentials: 'same-origin',
  })
    .then((r) => r.ok && tell('score', { mode, score }))
    .catch((e) => console.warn('kuddes', e));
}

if (HOSTED) {
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.hidden && flush());
}
