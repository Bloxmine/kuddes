/**
 * Kuddes Studio's sound: every drum and instrument is synthesized with Web
 * Audio (no samples to download), and a look-ahead scheduler plays the
 * patterns or the song in time. The same code renders a WAV offline.
 */
import { STEPS_PER_BAR, type DrumSound, type StudioChannel, type StudioPattern, type StudioProject, type SynthSound } from '../../../shared/studio'

export const midiFreq = (key: number) => 440 * 2 ** ((key - 69) / 12)

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>()
function noise(ctx: BaseAudioContext) {
  let b = noiseBuffers.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    noiseBuffers.set(ctx, b)
  }
  return b
}

/** One drum hit at `t`. */
export function drum(ctx: BaseAudioContext, sound: DrumSound, t: number, out: AudioNode, vel = 0.8) {
  // A sound through a gain that jumps up and dies away
  const env = (src: AudioNode, peak: number, decay: number, at = t, attack = 0.001) => {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * vel), at + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
    src.connect(g).connect(out)
  }
  const osc = (type: OscillatorType, f0: number, f1: number | null, sweep: number, len: number, at = t) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f0, at)
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, at + sweep)
    o.start(at)
    o.stop(at + len)
    return o
  }
  const hiss = (type: BiquadFilterType, freq: number, len: number, at = t, q = 1) => {
    const s = ctx.createBufferSource()
    s.buffer = noise(ctx)
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    s.connect(f)
    s.start(at)
    s.stop(at + len)
    return f
  }
  switch (sound) {
    case 'kick':
      env(osc('sine', 165, 42, 0.11, 0.6), 1.1, 0.5)
      env(hiss('lowpass', 1800, 0.03), 0.25, 0.012)
      break
    case 'snare':
      env(hiss('highpass', 1300, 0.3), 0.75, 0.2)
      env(osc('triangle', 230, 165, 0.07, 0.15), 0.6, 0.1)
      break
    case 'clap':
      // A few hands just after each other, then the room
      for (const d of [0, 0.011, 0.023]) env(hiss('bandpass', 1400, 0.03, t + d, 1.2), 0.9, 0.012, t + d)
      env(hiss('bandpass', 1300, 0.35, t + 0.03, 0.9), 0.55, 0.22, t + 0.03)
      break
    case 'hihat':
      env(hiss('highpass', 7500, 0.08), 0.45, 0.045)
      break
    case 'openhat':
      env(hiss('highpass', 7000, 0.5), 0.4, 0.35)
      break
    case 'tom':
      env(osc('sine', 210, 105, 0.25, 0.5), 0.9, 0.38)
      break
    case 'rim':
      env(osc('square', 1650, null, 0, 0.05), 0.25, 0.02)
      env(hiss('bandpass', 3000, 0.05, t, 3), 0.5, 0.02)
      break
    case 'cowbell': {
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.frequency.value = 820
      osc('square', 545, null, 0, 0.5).connect(f)
      osc('square', 815, null, 0, 0.5).connect(f)
      env(f, 0.35, 0.32)
      break
    }
    case 'crash':
      env(hiss('highpass', 4500, 2), 0.5, 1.6, t, 0.003)
      break
    case 'shaker':
      env(hiss('bandpass', 6500, 0.15, t, 1.5), 0.45, 0.07, t, 0.02)
      break
  }
}

type Osc = { type: OscillatorType; ratio: number; detune: number; gain: number; decay?: number }
type Preset = { oscs: Osc[]; attack: number; decay: number; sustain: number; release: number; filter?: { freq: number; env: number; decay: number; q: number } }

const PRESETS: Record<SynthSound, Preset> = {
  piano: {
    oscs: [
      { type: 'triangle', ratio: 1, detune: 0, gain: 0.55 },
      { type: 'sine', ratio: 2, detune: 0, gain: 0.22 },
      { type: 'sine', ratio: 3, detune: 0, gain: 0.08, decay: 0.3 },
    ],
    attack: 0.004,
    decay: 0.9,
    sustain: 0.15,
    release: 0.35,
    filter: { freq: 1600, env: 3000, decay: 0.4, q: 0.7 },
  },
  epiano: {
    oscs: [
      { type: 'sine', ratio: 1, detune: 0, gain: 0.6 },
      { type: 'triangle', ratio: 1, detune: 5, gain: 0.18 },
      { type: 'sine', ratio: 4, detune: 0, gain: 0.22, decay: 0.22 },
    ],
    attack: 0.005,
    decay: 1.3,
    sustain: 0.25,
    release: 0.35,
  },
  orgel: {
    oscs: [
      { type: 'sine', ratio: 0.5, detune: 0, gain: 0.22 },
      { type: 'sine', ratio: 1, detune: 0, gain: 0.35 },
      { type: 'sine', ratio: 2, detune: 0, gain: 0.25 },
      { type: 'sine', ratio: 3, detune: 0, gain: 0.12 },
      { type: 'sine', ratio: 4, detune: 0, gain: 0.08 },
    ],
    attack: 0.012,
    decay: 0.1,
    sustain: 0.9,
    release: 0.08,
  },
  bas: {
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: 0, gain: 0.45 },
      { type: 'square', ratio: 0.5, detune: 0, gain: 0.35 },
    ],
    attack: 0.004,
    decay: 0.25,
    sustain: 0.6,
    release: 0.08,
    filter: { freq: 280, env: 1600, decay: 0.15, q: 6 },
  },
  lead: {
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -9, gain: 0.32 },
      { type: 'sawtooth', ratio: 1, detune: 9, gain: 0.32 },
      { type: 'square', ratio: 2, detune: 0, gain: 0.08 },
    ],
    attack: 0.01,
    decay: 0.2,
    sustain: 0.7,
    release: 0.15,
    filter: { freq: 2000, env: 2500, decay: 0.3, q: 2 },
  },
  pad: {
    oscs: [
      { type: 'sawtooth', ratio: 1, detune: -14, gain: 0.25 },
      { type: 'sawtooth', ratio: 1, detune: 14, gain: 0.25 },
      { type: 'triangle', ratio: 2, detune: 0, gain: 0.18 },
    ],
    attack: 0.45,
    decay: 1,
    sustain: 0.8,
    release: 1,
    filter: { freq: 1000, env: 700, decay: 1.2, q: 1 },
  },
  pluk: {
    oscs: [
      { type: 'square', ratio: 1, detune: 0, gain: 0.4 },
      { type: 'sawtooth', ratio: 2, detune: 5, gain: 0.18 },
    ],
    attack: 0.002,
    decay: 0.3,
    sustain: 0,
    release: 0.15,
    filter: { freq: 500, env: 4500, decay: 0.12, q: 3 },
  },
}

/**
 * One synth note from `t`. With a length it ends by itself; without one it
 * holds until the returned release is called (typing on the keyboard).
 */
export function synth(ctx: BaseAudioContext, sound: SynthSound, key: number, t: number, length: number | null, out: AudioNode, vel = 0.8) {
  const p = PRESETS[sound]
  const f = midiFreq(key)
  const peak = 0.32 * vel
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(peak, t + p.attack)
  amp.gain.setTargetAtTime(peak * p.sustain, t + p.attack, p.decay / 3)
  let into: AudioNode = amp
  if (p.filter) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = p.filter.q
    lp.frequency.setValueAtTime(Math.min(18000, p.filter.freq + p.filter.env * vel), t)
    lp.frequency.setTargetAtTime(p.filter.freq, t + 0.005, p.filter.decay / 3)
    lp.connect(amp)
    into = lp
  }
  amp.connect(out)
  const oscs = p.oscs.map((o) => {
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.value = f * o.ratio
    osc.detune.value = o.detune
    const g = ctx.createGain()
    g.gain.setValueAtTime(o.gain, t)
    if (o.decay) g.gain.setTargetAtTime(0, t, o.decay / 3)
    osc.connect(g).connect(into)
    osc.start(t)
    return osc
  })
  const end = (at: number) => oscs.forEach((o) => o.stop(at + p.release * 4 + 0.05))
  if (length !== null) {
    amp.gain.setTargetAtTime(0, t + length, p.release / 3)
    end(t + length)
    return () => {}
  }
  return () => {
    const now = ctx.currentTime
    amp.gain.cancelScheduledValues(now)
    amp.gain.setValueAtTime(amp.gain.value, now)
    amp.gain.setTargetAtTime(0, now, p.release / 3)
    end(now)
  }
}

/** Whether a channel is heard: not muted, and soloed if anything is. */
export const audible = (ch: StudioChannel, all: StudioChannel[]) => !ch.mute && (!all.some((c) => c.solo) || ch.solo)

export const patternBars = (p: StudioPattern) => p.length / STEPS_PER_BAR

/** The song's length in steps: up to the end of the last clip. */
export function songSteps(project: StudioProject) {
  let bars = 0
  for (const c of project.playlist) {
    const p = project.patterns.find((x) => x.id === c.pattern)
    if (p) bars = Math.max(bars, c.bar + patternBars(p))
  }
  return bars * STEPS_PER_BAR
}

export type PlayMode = { song: false; pattern: string } | { song: true }

/** How many steps until it starts over: the pattern, or the song (at least a bar). */
export function playLength(project: StudioProject, mode: PlayMode) {
  if (mode.song) return Math.max(STEPS_PER_BAR, songSteps(project))
  return (project.patterns.find((x) => x.id === mode.pattern) ?? project.patterns[0])?.length ?? STEPS_PER_BAR
}

/** Which patterns sound at a step, and where in them. */
function activeAt(project: StudioProject, mode: PlayMode, step: number): [StudioPattern, number][] {
  if (!mode.song) {
    const p = project.patterns.find((x) => x.id === mode.pattern) ?? project.patterns[0]
    return p ? [[p, step % p.length]] : []
  }
  const bar = Math.floor(step / STEPS_PER_BAR)
  const out: [StudioPattern, number][] = []
  for (const c of project.playlist) {
    const p = project.patterns.find((x) => x.id === c.pattern)
    if (p && bar >= c.bar && bar < c.bar + patternBars(p)) out.push([p, step - c.bar * STEPS_PER_BAR])
  }
  return out
}

/**
 * Plays a project: a channel strip (volume, pan) per channel into the
 * master, a compressor so loud beats don't crackle, and a meter.
 */
export class Player {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly meter: AnalyserNode
  private strips = new Map<string, { gain: GainNode; pan: StereoPannerNode }>()
  private timer: ReturnType<typeof setInterval> | null = null
  private next = 0
  private step = 0
  private queue: { step: number; time: number }[] = []
  private held = new Map<string, () => void>()
  mode: PlayMode = { song: false, pattern: '' }
  metronome = false

  private project: () => StudioProject

  constructor(ctx: BaseAudioContext, project: () => StudioProject) {
    this.ctx = ctx
    this.project = project
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -10
    comp.ratio.value = 4
    this.master = ctx.createGain()
    this.meter = ctx.createAnalyser()
    this.meter.fftSize = 512
    this.master.connect(comp).connect(this.meter).connect(ctx.destination)
    this.sync()
  }

  /** Volumes, pans and the master as they are in the project now. */
  sync() {
    const p = this.project()
    this.master.gain.value = p.master
    for (const ch of p.channels) this.strip(ch)
  }

  /** A channel's strip, made the first time it's needed (also for a sound tried in the library). */
  private strip(ch: StudioChannel) {
    let s = this.strips.get(ch.id)
    if (!s) {
      s = { gain: this.ctx.createGain(), pan: this.ctx.createStereoPanner() }
      s.gain.connect(s.pan).connect(this.master)
      this.strips.set(ch.id, s)
    }
    // Volume knobs feel even when the gain goes with the square
    s.gain.gain.value = ch.volume * ch.volume
    s.pan.pan.value = ch.pan
    return s.gain
  }

  /** Everything that sounds at one step, from `time`. */
  scheduleStep(step: number, time: number) {
    const p = this.project()
    const dur = 60 / p.tempo / 4
    for (const [pattern, local] of activeAt(p, this.mode, step)) {
      for (const ch of p.channels) {
        if (!audible(ch, p.channels)) continue
        const part = pattern.parts[ch.id]
        if (!part) continue
        if (ch.type === 'drum') {
          const v = part.steps[local] ?? 0
          if (v > 0) drum(this.ctx, ch.sound as DrumSound, time, this.strip(ch), v)
        } else for (const n of part.notes) if (n.start === local) synth(this.ctx, ch.sound as SynthSound, n.key, time, n.length * dur * 0.98, this.strip(ch), n.velocity)
      }
    }
    if (this.metronome && step % 4 === 0) this.click(time, step % STEPS_PER_BAR === 0)
  }

  private click(t: number, accent: boolean) {
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.frequency.value = accent ? 1600 : 1100
    g.gain.setValueAtTime(0.25, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    o.connect(g).connect(this.ctx.destination)
    o.start(t)
    o.stop(t + 0.06)
  }

  length() {
    return playLength(this.project(), this.mode)
  }

  get playing() {
    return this.timer !== null
  }

  start(from = 0) {
    if (this.timer) return
    if (this.ctx instanceof AudioContext) void this.ctx.resume()
    this.step = from
    this.next = this.ctx.currentTime + 0.06
    this.queue = []
    this.timer = setInterval(() => this.tick(), 25)
    this.tick()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.queue = []
  }

  private tick() {
    const p = this.project()
    const dur = 60 / p.tempo / 4
    while (this.next < this.ctx.currentTime + 0.12) {
      if (this.step >= this.length()) this.step = 0
      const swing = this.step % 2 ? (p.swing / 100) * dur * 0.5 : 0
      this.scheduleStep(this.step, this.next + swing)
      this.queue.push({ step: this.step, time: this.next })
      this.next += dur
      this.step++
    }
  }

  /** The step you hear now (for the play line), or null when stopped. */
  position(): number | null {
    if (!this.timer) return null
    const now = this.ctx.currentTime
    while (this.queue.length > 1 && this.queue[1].time <= now) this.queue.shift()
    return this.queue[0] && this.queue[0].time <= now ? this.queue[0].step : null
  }

  /** How loud it is right now, 0 to 1. */
  level() {
    const d = new Float32Array(this.meter.fftSize)
    this.meter.getFloatTimeDomainData(d)
    let peak = 0
    for (const v of d) peak = Math.max(peak, Math.abs(v))
    return Math.min(1, peak)
  }

  /** A sound right away: a click on a channel, a key in the piano roll. */
  preview(ch: StudioChannel, key = 60) {
    if (this.ctx instanceof AudioContext) void this.ctx.resume()
    const t = this.ctx.currentTime + 0.01
    if (ch.type === 'drum') drum(this.ctx, ch.sound as DrumSound, t, this.strip(ch))
    else synth(this.ctx, ch.sound as SynthSound, key, t, 0.35, this.strip(ch))
  }

  /** Holding a note down (typing on the computer keyboard), until noteOff. */
  noteOn(ch: StudioChannel, key: number) {
    if (this.ctx instanceof AudioContext) void this.ctx.resume()
    const id = `${ch.id}:${key}`
    if (this.held.has(id)) return
    if (ch.type === 'drum') return this.preview(ch)
    this.held.set(id, synth(this.ctx, ch.sound as SynthSound, key, this.ctx.currentTime + 0.005, null, this.strip(ch)))
  }

  noteOff(ch: StudioChannel, key: number) {
    const id = `${ch.id}:${key}`
    this.held.get(id)?.()
    this.held.delete(id)
  }

  close() {
    this.stop()
    for (const r of this.held.values()) r()
    if (this.ctx instanceof AudioContext) void this.ctx.close()
  }
}

export type RenderOptions = { rate?: number; mono?: boolean; maxSeconds?: number }

/** How long a render is: the steps, and a bit of time for the last notes to ring out (cut at `maxSeconds`). */
export function renderSeconds(project: StudioProject, mode: PlayMode, maxSeconds = Infinity) {
  return Math.min(maxSeconds, playLength(project, mode) * (60 / project.tempo / 4) + 2)
}

/**
 * The pattern or the whole song as a 16-bit WAV. Stereo at 44.1 kHz unless
 * asked otherwise; with `maxSeconds` it's cut there and fades out.
 */
export async function renderWav(project: StudioProject, mode: PlayMode, opts: RenderOptions = {}): Promise<Blob> {
  const rate = opts.rate ?? 44100
  const dur = 60 / project.tempo / 4
  const seconds = renderSeconds(project, mode, opts.maxSeconds)
  const ctx = new OfflineAudioContext(opts.mono ? 1 : 2, Math.ceil(seconds * rate), rate)
  const player = new Player(ctx, () => project)
  player.mode = mode
  const steps = Math.min(playLength(project, mode), Math.ceil(seconds / dur))
  for (let s = 0; s < steps; s++) player.scheduleStep(s, 0.02 + s * dur + (s % 2 ? (project.swing / 100) * dur * 0.5 : 0))
  if (opts.maxSeconds !== undefined && seconds >= opts.maxSeconds) {
    player.master.gain.setValueAtTime(project.master, seconds - 0.4)
    player.master.gain.linearRampToValueAtTime(0, seconds)
  }
  return wav(await ctx.startRendering())
}

function wav(buffer: AudioBuffer): Blob {
  const ch = buffer.numberOfChannels
  const n = buffer.length
  const view = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const text = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  view.setUint32(4, 36 + n * ch * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, ch, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * ch * 2, true)
  view.setUint16(32, ch * 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, n * ch * 2, true)
  const data = Array.from({ length: ch }, (_, i) => buffer.getChannelData(i))
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]))
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  return new Blob([view], { type: 'audio/wav' })
}
