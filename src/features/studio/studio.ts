import {
  DRUM_SOUNDS,
  STEPS_PER_BAR,
  STUDIO_COLORS,
  SYNTH_SOUNDS,
  type DrumSound,
  type PatternLength,
  type PatternPart,
  type StudioChannel,
  type StudioPattern,
  type StudioProject,
  type SynthSound,
} from '../../../shared/studio'

export const newId = () => crypto.randomUUID().slice(0, 8)

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
/** C4 for 60, as on a piano. */
export const noteName = (key: number) => `${NAMES[key % 12]}${Math.floor(key / 12) - 1}`
export const isBlack = (key: number) => NAMES[key % 12].includes('#')

export function newChannel(type: 'drum' | 'synth', sound: DrumSound | SynthSound, index: number): StudioChannel {
  return {
    id: newId(),
    name: type === 'drum' ? DRUM_SOUNDS[sound as DrumSound] : SYNTH_SOUNDS[sound as SynthSound],
    type,
    sound,
    color: STUDIO_COLORS[index % STUDIO_COLORS.length],
    volume: 0.78,
    pan: 0,
    mute: false,
    solo: false,
  }
}

export const emptyPart = (): PatternPart => ({ steps: [], notes: [] })

export function newPattern(n: number, length: PatternLength = 16): StudioPattern {
  return { id: newId(), name: `Patroon ${n}`, color: STUDIO_COLORS[(n - 1) % STUDIO_COLORS.length], length, parts: {} }
}

/** Steps from a string: x is a hit, o a soft one ("x...x..." is a kick on 1 and 2). */
const beat = (s: string) => [...s].map((c) => (c === 'x' ? 0.8 : c === 'o' ? 0.45 : 0))

/** A new project starts with a beat and a bass line, like FL Studio's template, so there's something to hear. */
export function newProject(): StudioProject {
  const ch = [
    newChannel('drum', 'kick', 0),
    newChannel('drum', 'clap', 1),
    newChannel('drum', 'hihat', 2),
    newChannel('drum', 'openhat', 3),
    newChannel('drum', 'snare', 7),
    newChannel('synth', 'bas', 4),
    newChannel('synth', 'epiano', 5),
  ]
  const [kick, clap, hat, open, snare, bass, keys] = ch
  const main = newPattern(1)
  main.parts = {
    [kick.id]: { steps: beat('x...x...x...x...'), notes: [] },
    [clap.id]: { steps: beat('....x.......x...'), notes: [] },
    [hat.id]: { steps: beat('..x...x...x...xo'), notes: [] },
    [open.id]: { steps: beat('..............x.'), notes: [] },
    [snare.id]: emptyPart(),
    [bass.id]: {
      steps: [],
      notes: [
        { key: 36, start: 0, length: 3, velocity: 0.8 },
        { key: 36, start: 3, length: 1, velocity: 0.6 },
        { key: 48, start: 6, length: 2, velocity: 0.8 },
        { key: 34, start: 8, length: 3, velocity: 0.8 },
        { key: 34, start: 11, length: 1, velocity: 0.6 },
        { key: 41, start: 14, length: 2, velocity: 0.8 },
      ],
    },
    [keys.id]: {
      steps: [],
      notes: [60, 63, 67, 70].flatMap((key) => [
        { key, start: 0, length: 6, velocity: 0.6 },
        { key: key - 2, start: 8, length: 6, velocity: 0.6 },
      ]),
    },
  }
  const intro = newPattern(2)
  intro.parts = {
    [hat.id]: { steps: beat('x.x.x.x.x.x.x.x.'), notes: [] },
    [kick.id]: { steps: beat('x.........x.....'), notes: [] },
  }
  return {
    tempo: 120,
    swing: 0,
    master: 0.8,
    channels: ch,
    patterns: [main, intro],
    playlist: [{ id: newId(), pattern: intro.id, track: 0, bar: 0 }, ...[1, 2, 3, 4].map((bar) => ({ id: newId(), pattern: main.id, track: 1, bar }))],
  }
}

/** "002:3:4" for bar 2, beat 3, step 4, as on GarageBand's display. */
export function lcdPosition(step: number) {
  const bar = Math.floor(step / STEPS_PER_BAR) + 1
  const beat = Math.floor((step % STEPS_PER_BAR) / 4) + 1
  return `${String(bar).padStart(3, '0')}.${beat}.${(step % 4) + 1}`
}

/** "0:07.5" */
export function lcdTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0').replace('.', ',')}`
}
