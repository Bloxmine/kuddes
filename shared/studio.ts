/**
 * Kuddes Studio: a music project, like a small FL Studio. Channels make the
 * sound (a drum sound or a synth, all synthesized in the browser), patterns
 * hold what they play (steps for drums, notes for synths), and the playlist
 * puts patterns one after the other into a song. A step is a sixteenth note;
 * a bar has 16.
 */

export const STEPS_PER_BAR = 16

export const STUDIO_LIMITS = {
  channels: 24,
  patterns: 32,
  notes: 512,
  clips: 256,
  tracks: 8,
  bars: 128,
  minTempo: 40,
  maxTempo: 240,
  name: 40,
  /** MIDI note numbers: C1 to C7. */
  lowKey: 24,
  highKey: 96,
}

/** How long a pattern can be: 1, 2, 3 or 4 bars. */
export const PATTERN_LENGTHS = [16, 32, 48, 64] as const
export type PatternLength = (typeof PATTERN_LENGTHS)[number]

export const DRUM_SOUNDS = {
  kick: 'Kick',
  snare: 'Snare',
  clap: 'Clap',
  hihat: 'Hi-hat',
  openhat: 'Open hi-hat',
  tom: 'Tom',
  rim: 'Rimshot',
  cowbell: 'Koebel',
  crash: 'Crash',
  shaker: 'Shaker',
} as const
export type DrumSound = keyof typeof DRUM_SOUNDS

export const SYNTH_SOUNDS = {
  piano: 'Piano',
  epiano: 'Elektrische piano',
  orgel: 'Orgel',
  bas: 'Synth-bas',
  lead: 'Lead',
  pad: 'Pad',
  pluk: 'Pluk',
} as const
export type SynthSound = keyof typeof SYNTH_SOUNDS

/** Channel and pattern colours, like FL Studio's. */
export const STUDIO_COLORS = ['#e8813a', '#e0c341', '#8cc63f', '#3fb8a9', '#4a9fe0', '#8a6fe0', '#d860b0', '#e05555', '#a0a0a0'] as const

export type StudioChannel = {
  id: string
  name: string
  type: 'drum' | 'synth'
  sound: DrumSound | SynthSound
  color: string
  /** 0 to 1 */
  volume: number
  /** -1 (left) to 1 (right) */
  pan: number
  mute: boolean
  solo: boolean
}

/** A note in the piano roll: `start` and `length` in steps. */
export type StudioNote = { key: number; start: number; length: number; velocity: number }

/** What one channel plays in a pattern: velocities per step for a drum (0 is off), notes for a synth. */
export type PatternPart = { steps: number[]; notes: StudioNote[] }

export type StudioPattern = { id: string; name: string; color: string; length: PatternLength; parts: Record<string, PatternPart> }

/** A pattern placed in the playlist, from `bar` (counting from 0) on a track. */
export type StudioClip = { id: string; pattern: string; track: number; bar: number }

export type StudioProject = {
  tempo: number
  /** 0 to 100: how much later the second sixteenth of each pair comes. */
  swing: number
  /** 0 to 1 */
  master: number
  channels: StudioChannel[]
  patterns: StudioPattern[]
  playlist: StudioClip[]
}
