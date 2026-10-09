/**
 * The sound buttons every studio has, made right here with Web Audio (no
 * files, no one else's recordings): applause, an airhorn, a drumroll, a ding,
 * a buzzer, a fanfare, a bass drop, a rewind and the station jingle.
 */
type Render = (ctx: OfflineAudioContext) => void

const RATE = 44100

function render(seconds: number, draw: Render): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * RATE), RATE)
  draw(ctx)
  return ctx.startRendering()
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * RATE), RATE)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A burst of filtered noise (a clap, a snare hit, a cymbal). */
function burst(ctx: OfflineAudioContext, at: number, length: number, volume: number, filter: BiquadFilterType, freq: number, q = 1) {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, length)
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.setValueAtTime(volume, at)
  g.gain.exponentialRampToValueAtTime(0.001, at + length)
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(at)
}

function tone(ctx: OfflineAudioContext, type: OscillatorType, freq: number, at: number, length: number, volume: number, attack = 0.01) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(volume, at + attack)
  g.gain.exponentialRampToValueAtTime(0.001, at + length)
  o.connect(g).connect(ctx.destination)
  o.start(at)
  o.stop(at + length)
  return o
}

function bell(ctx: OfflineAudioContext, freq: number, at: number, length: number, volume: number) {
  for (const [ratio, v] of [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.25],
    [8.9, 0.12],
  ])
    tone(ctx, 'sine', freq * ratio, at, length / ratio ** 0.4, volume * v, 0.002)
}

export type BuiltinSound = { key: string; name: string; color: string; make: () => Promise<AudioBuffer> }

export const BUILTIN_SOUNDS: BuiltinSound[] = [
  {
    key: 'applaus',
    name: 'Applaus',
    color: '#3d9a6b',
    make: () =>
      render(3.5, (ctx) => {
        // Lots of hands, each clapping a little out of step
        for (let i = 0; i < 260; i++) {
          const at = Math.random() * 2.8 * Math.sqrt(Math.random())
          burst(ctx, at, 0.06 + Math.random() * 0.05, 0.12 + Math.random() * 0.12, 'bandpass', 900 + Math.random() * 1600, 0.8)
        }
      }),
  },
  {
    key: 'airhorn',
    name: 'Airhorn',
    color: '#e3702a',
    make: () =>
      render(1.9, (ctx) => {
        const shaper = ctx.createWaveShaper()
        const curve = new Float32Array(256)
        for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 128 - 1) * 4))
        shaper.curve = curve
        const out = ctx.createGain()
        out.gain.value = 0.35
        shaper.connect(out).connect(ctx.destination)
        for (const [at, length] of [
          [0, 0.22],
          [0.3, 0.22],
          [0.6, 1.1],
        ]) {
          for (const detune of [0, 7, -6, 12]) {
            const o = ctx.createOscillator()
            o.type = 'sawtooth'
            o.frequency.setValueAtTime(410 + detune, at)
            o.frequency.linearRampToValueAtTime(440 + detune, at + 0.05)
            const g = ctx.createGain()
            g.gain.setValueAtTime(0, at)
            g.gain.linearRampToValueAtTime(0.3, at + 0.02)
            g.gain.setValueAtTime(0.3, at + length - 0.05)
            g.gain.linearRampToValueAtTime(0, at + length)
            o.connect(g).connect(shaper)
            o.start(at)
            o.stop(at + length)
          }
        }
      }),
  },
  {
    key: 'tromgeroffel',
    name: 'Tromgeroffel',
    color: '#8a4fd0',
    make: () =>
      render(3.6, (ctx) => {
        // Faster and louder, then the cymbal
        for (let t = 0, i = 0; t < 2.2; i++) {
          burst(ctx, t, 0.08, 0.08 + (t / 2.2) * 0.3, 'bandpass', 2200, 0.7)
          t += 0.055
        }
        burst(ctx, 2.25, 0.25, 0.7, 'lowpass', 180)
        burst(ctx, 2.25, 1.3, 0.35, 'highpass', 5000)
      }),
  },
  {
    key: 'ding',
    name: 'Ding!',
    color: '#e0b02a',
    make: () => render(2, (ctx) => bell(ctx, 1046.5, 0, 1.8, 0.35)),
  },
  {
    key: 'fout',
    name: 'Fout!',
    color: '#d8342c',
    make: () =>
      render(1, (ctx) => {
        tone(ctx, 'square', 110, 0, 0.9, 0.22)
        tone(ctx, 'square', 116, 0, 0.9, 0.18)
      }),
  },
  {
    key: 'tadaa',
    name: 'Tadaa!',
    color: '#e2559b',
    make: () =>
      render(2.6, (ctx) => {
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = 2400
        lp.connect(ctx.destination)
        const brass = (freq: number, at: number, length: number) => {
          const o = ctx.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = freq
          const g = ctx.createGain()
          g.gain.setValueAtTime(0, at)
          g.gain.linearRampToValueAtTime(0.12, at + 0.03)
          g.gain.setValueAtTime(0.12, at + length - 0.1)
          g.gain.linearRampToValueAtTime(0, at + length)
          o.connect(g).connect(lp)
          o.start(at)
          o.stop(at + length)
        }
        brass(392, 0, 0.14)
        brass(523.3, 0.16, 0.12)
        for (const f of [523.3, 659.3, 784, 1046.5]) brass(f, 0.32, 2.1)
      }),
  },
  {
    key: 'drop',
    name: 'Bass drop',
    color: '#4b6fd8',
    make: () =>
      render(2.2, (ctx) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(180, 0)
        o.frequency.exponentialRampToValueAtTime(32, 1.8)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.9, 0)
        g.gain.exponentialRampToValueAtTime(0.001, 2.1)
        o.connect(g).connect(ctx.destination)
        o.start(0)
        o.stop(2.2)
        burst(ctx, 0, 0.3, 0.5, 'lowpass', 120)
      }),
  },
  {
    key: 'rewind',
    name: 'Rewind',
    color: '#1fa3c4',
    make: () =>
      render(1.3, (ctx) => {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(900, 0)
        o.frequency.exponentialRampToValueAtTime(60, 1.1)
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 18
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 120
        lfo.connect(lfoGain).connect(o.frequency)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.18, 0)
        g.gain.linearRampToValueAtTime(0, 1.2)
        o.connect(g).connect(ctx.destination)
        o.start(0)
        lfo.start(0)
        o.stop(1.3)
        lfo.stop(1.3)
      }),
  },
  {
    key: 'jingle',
    name: 'Jingle',
    color: '#5a6b7d',
    make: () =>
      render(2.8, (ctx) => {
        // Ding-dong-ding, the station chime
        bell(ctx, 784, 0, 1.4, 0.28)
        bell(ctx, 659.3, 0.3, 1.4, 0.28)
        bell(ctx, 523.3, 0.6, 1.4, 0.28)
        bell(ctx, 1046.5, 1.0, 1.8, 0.3)
      }),
  },
]
