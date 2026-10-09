/**
 * Game sounds, made with the Web Audio API instead of sound files: marbles
 * tapping on wood, discs dropping into Vier op een rij, pieces on the
 * draughts board, splashes and booms for Zeeslag, the quiz's dings and
 * buzzers, and a few for every game (a smiley, your turn, the result). Off
 * when the player turned them off (remembered in this browser) and until the
 * page may play sound (after a first click).
 */

const MUTE_KEY = 'kuddes.games.sound'

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

export function soundOn(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== 'uit'
  } catch {
    return true
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, on ? 'aan' : 'uit')
  } catch {
    // Not remembered, but still switched for now
  }
  muted = !on
}

let muted = !soundOn()

function audio(): AudioContext | null {
  if (muted || typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  // Browsers start it suspended until someone has clicked on the page
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx.state === 'running' ? ctx : null
}

// The first click or key anywhere wakes the audio up, so the opponent's moves can be heard too
if (typeof window !== 'undefined') {
  const wake = () => {
    if (!muted) audio()
  }
  window.addEventListener('pointerdown', wake, { passive: true })
  window.addEventListener('keydown', wake)
}

function noiseBuffer(ac: AudioContext) {
  if (noise) return noise
  noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

/** One short tone that dies away (and slides to `to`, if given). */
function tone(ac: AudioContext, at: number, freq: number, length: number, volume: number, type: OscillatorType = 'sine', to?: number) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + length)
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  osc.connect(gain).connect(ac.destination)
  osc.start(at)
  osc.stop(at + length + 0.02)
}

/** A burst of filtered noise: a short click of glass on glass, or (longer, lower) a splash or a boom. */
function click(ac: AudioContext, at: number, freq: number, volume: number, length = 0.03, type: BiquadFilterType = 'bandpass', q = 3) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  src.loop = length > 0.18
  const filter = ac.createBiquadFilter()
  filter.type = type
  filter.frequency.value = freq
  filter.Q.value = q
  const gain = ac.createGain()
  gain.gain.setValueAtTime(volume, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(at)
  src.stop(at + length + 0.02)
}

/** A few notes one after the other. */
function melody(ac: AudioContext, notes: [freq: number, at: number, length: number][], volume: number, type: OscillatorType = 'triangle') {
  const t = ac.currentTime + 0.01
  for (const [f, at, length] of notes) tone(ac, t + at, f, length, volume, type)
}

const vary = (n: number, by: number) => n * (1 + (Math.random() - 0.5) * by)

/** A marble dropping into a pit (or, deeper and fuller, into a store). */
export function playDrop(store = false) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  click(ac, t, vary(store ? 2600 : 3400, 0.3), 0.35)
  tone(ac, t, vary(store ? 1500 : 2300, 0.18), 0.09, 0.08)
  // The wooden board under it
  tone(ac, t, vary(store ? 150 : 210, 0.1), 0.07, store ? 0.22 : 0.16, 'triangle')
  // A second, softer tap as it settles
  click(ac, t + vary(0.045, 0.4), vary(4200, 0.3), 0.12)
}

/** Scooping the marbles out of a pit: a short rattle. */
export function playPickUp(count: number) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  for (let i = 0; i < Math.min(count, 5); i++) click(ac, t + i * vary(0.025, 0.5), vary(3800, 0.4), 0.18)
}

/** A capture: a little rising chime. */
export function playCapture() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  ;[880, 1109, 1319].forEach((f, i) => tone(ac, t + i * 0.07, f, 0.25, 0.06, 'triangle'))
}

// ------------------------------------------------------------ Vier op een rij

/** A disc dropping into the board: a plastic clack and a low thunk. */
export function playDisc() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  click(ac, t, vary(1800, 0.2), 0.3, 0.05)
  tone(ac, t, vary(160, 0.1), 0.12, 0.3, 'triangle', 90)
  click(ac, t + 0.06, vary(2400, 0.3), 0.1)
}

// ------------------------------------------------------------ Dammen

/** A piece set down on the wooden board. */
export function playPiece() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  click(ac, t, vary(1200, 0.2), 0.3, 0.04, 'bandpass', 2)
  tone(ac, t, vary(260, 0.1), 0.08, 0.2, 'triangle')
}

/** Jumping over pieces: a tap for each piece taken. */
export function playJump(taken: number) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  for (let i = 0; i < Math.min(taken, 6); i++) {
    click(ac, t + i * 0.11, vary(1500, 0.2), 0.32, 0.04, 'bandpass', 2)
    tone(ac, t + i * 0.11, vary(330 + i * 40, 0.05), 0.08, 0.18, 'triangle')
  }
}

/** A piece crowned to a dam. */
export function playCrown() {
  const ac = audio()
  if (!ac) return
  melody(ac, [[784, 0, 0.18], [988, 0.09, 0.18], [1175, 0.18, 0.18], [1568, 0.27, 0.35]], 0.07)
}

// ------------------------------------------------------------ Zeeslag

/** A shot in the water. */
export function playSplash() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  click(ac, t, 900, 0.35, 0.45, 'lowpass', 0.7)
  click(ac, t + 0.03, 2600, 0.1, 0.3, 'bandpass', 1)
}

/** A hit: a boom (bigger when the ship sinks). */
export function playBoom(sunk = false) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  tone(ac, t, 120, sunk ? 0.9 : 0.5, 0.5, 'sine', 35)
  click(ac, t, 500, sunk ? 0.6 : 0.45, sunk ? 0.9 : 0.5, 'lowpass', 0.8)
  if (sunk) melody(ac, [[392, 0.5, 0.25], [311, 0.72, 0.25], [262, 0.94, 0.5]], 0.06)
}

// ------------------------------------------------------------ Quiz

/** Right answer. */
export function playCorrect() {
  const ac = audio()
  if (!ac) return
  melody(ac, [[1047, 0, 0.2], [1568, 0.1, 0.4]], 0.08, 'sine')
}

/** Wrong (or too late). */
export function playWrong() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.01
  tone(ac, t, 180, 0.35, 0.09, 'sawtooth', 140)
  tone(ac, t, 185, 0.35, 0.06, 'square', 142)
}

/** A tick of the clock: in the countdown, and in the last seconds of a question. */
export function playTick(high = false) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  click(ac, t, high ? 5200 : 3800, 0.25, 0.025)
  tone(ac, t, high ? 1760 : 1320, 0.05, 0.05)
}

// ------------------------------------------------------------ Schaken

/** Check (a warning ping), or checkmate (a low chord). */
export function playCheck(mate: boolean) {
  const ac = audio()
  if (!ac) return
  if (mate) melody(ac, [[392, 0, 0.5], [311, 0.05, 0.6], [196, 0.1, 0.8]], 0.08)
  else melody(ac, [[1319, 0, 0.12], [1319, 0.14, 0.2]], 0.06, 'square')
}

// ------------------------------------------------------------ Pool

/** Two balls touching: a sharp clack, louder when harder. */
export function playBallClick(strength: number) {
  const ac = audio()
  if (!ac || strength < 0.01) return
  const t = ac.currentTime + 0.002
  const v = Math.min(0.5, 0.06 + strength * 0.8)
  click(ac, t, vary(3200, 0.2), v, 0.025, 'bandpass', 1.5)
  tone(ac, t, vary(2600, 0.1), 0.04, v * 0.3)
}

/** A ball against the cushion: a soft thud. */
export function playCushion(strength: number) {
  const ac = audio()
  if (!ac || strength < 0.02) return
  const t = ac.currentTime + 0.002
  tone(ac, t, vary(110, 0.1), 0.09, Math.min(0.35, 0.05 + strength * 0.7), 'sine', 70)
}

/** A ball dropping in a pocket and rolling down the gully. */
export function playPocket(strength: number) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.002
  const v = Math.min(0.45, 0.15 + strength * 0.4)
  tone(ac, t, 150, 0.15, v, 'triangle', 80)
  click(ac, t, 700, v * 0.6, 0.12, 'lowpass', 1)
  for (let i = 1; i <= 4; i++) click(ac, t + 0.12 + i * vary(0.07, 0.3), vary(900 - i * 80, 0.2), v * 0.3, 0.04, 'bandpass', 2)
}

// ------------------------------------------------------------ cards

/** A card turned over. */
export function playCardFlip() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.003
  click(ac, t, vary(2400, 0.2), 0.22, 0.06, 'bandpass', 0.8)
}

/** A card put down on a pile. */
export function playCardPlace() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.003
  click(ac, t, vary(1400, 0.2), 0.3, 0.08, 'lowpass', 0.7)
  click(ac, t + 0.01, vary(3200, 0.2), 0.08, 0.03)
}

/** Taking cards from the deck (a few quick slides). */
export function playCardDraw(n = 1) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.003
  for (let i = 0; i < Math.min(n, 4); i++) click(ac, t + i * 0.09, vary(1800, 0.2), 0.18, 0.09, 'bandpass', 0.6)
}

/** Dice rattling in a cup and tumbling onto the table. */
export function playDice(n = 5) {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.003
  for (let i = 0; i < 6; i++) click(ac, t + i * 0.035 + Math.random() * 0.01, vary(2600, 0.3), 0.12, 0.03, 'bandpass', 0.5)
  for (let i = 0; i < Math.min(n, 5); i++) click(ac, t + 0.26 + i * vary(0.06, 0.4), vary(1500, 0.3), 0.22, 0.05, 'bandpass', 0.7)
}

/** A pair found, a pile completed, a card that fits well: a happy blip. */
export function playGood() {
  const ac = audio()
  if (!ac) return
  melody(ac, [[880, 0, 0.12], [1319, 0.07, 0.22]], 0.06, 'sine')
}

// ------------------------------------------------------------ every game

/** A smiley arriving. */
export function playEmote() {
  const ac = audio()
  if (!ac) return
  const t = ac.currentTime + 0.005
  tone(ac, t, 520, 0.12, 0.12, 'sine', 1100)
  tone(ac, t + 0.02, 1320, 0.1, 0.04)
}

/** It's your turn. */
export function playYourTurn() {
  const ac = audio()
  if (!ac) return
  melody(ac, [[880, 0, 0.16], [1175, 0.08, 0.3]], 0.045, 'sine')
}

/** The end of a game. */
export function playResult(result: 'win' | 'verlies' | 'gelijk') {
  const ac = audio()
  if (!ac) return
  if (result === 'win') melody(ac, [[523, 0, 0.16], [659, 0.12, 0.16], [784, 0.24, 0.16], [1047, 0.36, 0.5], [784, 0.52, 0.12], [1047, 0.62, 0.6]], 0.08)
  else if (result === 'verlies') melody(ac, [[392, 0, 0.3], [370, 0.28, 0.3], [349, 0.56, 0.3], [330, 0.84, 0.7]], 0.07)
  else melody(ac, [[659, 0, 0.2], [659, 0.22, 0.2], [784, 0.44, 0.45]], 0.07)
}
