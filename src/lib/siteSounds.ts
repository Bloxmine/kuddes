/**
 * The site's notification sounds, made with the Web Audio API like the game
 * sounds (src/features/games/sounds.ts): a ding-dong for a new message, a
 * pling for a request, a little tune for an invite, a fanfare for an
 * achievement, and blips for the chat. Messenger messages use the MSN sound
 * file in public/sounds. Members switch them off under
 * Instellingen → Weergave; browsers only allow sound after a first click.
 */

let ctx: AudioContext | null = null
let enabled = { notifications: true, chat: true }
let last = 0

/** Follows the member's settings (usePreferences). */
export function setSiteSounds(next: { notifications: boolean; chat: boolean }) {
  enabled = next
}

/** The audio, once it may play: right away, or as soon as the browser lets it start (null if it can't). */
async function audio(): Promise<AudioContext | null> {
  if (typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
  return ctx.state === 'running' ? ctx : null
}

// The first click or key wakes the audio up, so later notifications can be heard
if (typeof window !== 'undefined') {
  const wake = () => {
    if (enabled.notifications || enabled.chat) void audio()
  }
  window.addEventListener('pointerdown', wake, { passive: true })
  window.addEventListener('keydown', wake)
}

/** A soft bell: a sine with a quieter overtone, dying away. */
function bell(ac: AudioContext, at: number, freq: number, length: number, volume: number) {
  for (const [mult, v] of [[1, 1], [2.01, 0.25], [3.02, 0.08]] as const) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq * mult, at)
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(volume * v, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
    osc.connect(gain).connect(ac.destination)
    osc.start(at)
    osc.stop(at + length + 0.05)
  }
}

/** Plays notes (frequency, start, length) now, unless another sound just played. */
function play(kind: 'notifications' | 'chat', notes: [number, number, number][], volume: number, gap = 900) {
  if (!enabled[kind]) return
  const now = performance.now()
  // Several things arriving at once make one sound, not a cacophony
  if (now - last < gap) return
  last = now
  // The first sound after the page opens waits a moment for the audio to start (it isn't dropped),
  // but not for long: sounds shouldn't pile up and all play at once on your first click
  void audio().then((ac) => {
    if (!ac || performance.now() - now > 2000) return
    const t = ac.currentTime + 0.02
    for (const [f, at, length] of notes) bell(ac, t + at, f, length, volume)
  })
}

/** A new personal message: ding-dong. */
export const playMessageSound = () => play('notifications', [[1318.5, 0, 0.5], [1046.5, 0.18, 0.7]], 0.11)

/** A friend or relation request: two quick plings up. */
export const playRequestSound = () => play('notifications', [[880, 0, 0.35], [1318.5, 0.11, 0.55]], 0.1)

/** Someone invites you to a game or the Graffitimuur: a cheerful little tune. */
export const playInviteSound = () => play('notifications', [[784, 0, 0.3], [988, 0.1, 0.3], [1175, 0.2, 0.3], [1568, 0.3, 0.6]], 0.09)

/** An achievement: a short fanfare, then a sparkle. */
export const playAchievementSound = () =>
  play('notifications', [[523.3, 0, 0.35], [659.3, 0.12, 0.35], [784, 0.24, 0.35], [1046.5, 0.36, 0.9], [2093, 0.62, 0.5], [2637, 0.7, 0.45]], 0.1)

/** A new line in the chat from someone else: a quiet blip. */
export const playChatSound = () => play('chat', [[1567.98, 0, 0.12]], 0.045, 250)

/** Your name in the chat: a brighter double blip. */
export const playMentionSound = () => play('chat', [[1318.5, 0, 0.18], [1975.5, 0.09, 0.3]], 0.09, 250)

/** Sound files (public/sounds/), each loaded once. */
const files = new Map<string, Promise<AudioBuffer | null>>()
function loadFile(ac: AudioContext, url: string) {
  let buffer = files.get(url)
  if (!buffer) {
    buffer = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((data) => ac.decodeAudioData(data))
      .catch(() => {
        files.delete(url)
        return null
      })
    files.set(url, buffer)
  }
  return buffer
}

/** Plays a sound file, unless it took too long to load (then the moment has passed). */
function playFile(url: string, volume: number, started: number) {
  void audio().then(async (ac) => {
    if (!ac) return
    const buffer = await loadFile(ac, url)
    if (!buffer || performance.now() - started > 2500) return
    const source = ac.createBufferSource()
    const gain = ac.createGain()
    gain.gain.value = volume
    source.buffer = buffer
    source.connect(gain).connect(ac.destination)
    source.start()
  })
}

/** A new message in Kuddes Messenger: the classic MSN "type" sound (public/sounds/messenger-type.mp3). */
export function playMessengerSound() {
  if (!enabled.chat) return
  const now = performance.now()
  if (now - last < 400) return
  last = now
  playFile('/sounds/messenger-type.mp3', 0.7, now)
}

/** A nudge: the MSN nudge sound (public/sounds/nudge.mp3). */
export function playNudgeSound() {
  if (!enabled.chat) return
  const now = performance.now()
  if (now - last < 300) return
  last = now
  playFile('/sounds/nudge.mp3', 0.8, now)
}
