export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
};

// Gem colours in sprite order: red, white, green, yellow, purple, orange, blue
export const GEM_COLORS = ['#ff3040', '#ffffff', '#30ff60', '#ffee30', '#ff40ff', '#ff9020', '#30a0ff'];
export const GEM_GLOWS = ['#ff6050', '#e0e8ff', '#60ff80', '#ffe860', '#ff70ff', '#ffa040', '#60b0ff'];

export function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// On Kuddes every member gets their own saves in the browser (see host.js)
let storePrefix = 'bj3h5.';
export function setStorePrefix(prefix) { storePrefix = prefix; }

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(storePrefix + key));
    localStorage.setItem(storePrefix + key, JSON.stringify(value));
  } catch (e) {
    return null;
  }
}
