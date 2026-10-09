/**
 * The studio's mixing desk, in the host's browser (Web Audio). Two decks for
 * Kuddes Muziek songs with a crossfader, the host's microphone (push-to-talk
 * or open), sound buttons, and the co-DJs' microphones. Everything together
 * goes out as one stream (`out`), which Broadcaster sends to the server.
 *
 * The host hears the music, sounds and DJs (the monitor), but not their own
 * microphone. Each DJ gets the mix without their own voice back (mix-minus).
 * When someone talks, the music dips (ducking).
 */
import type { MusicTrack } from '../../../shared/music'
import { api } from '../../lib/api'

export type DeckState = { track: MusicTrack | null; playing: boolean; time: number; duration: number; volume: number }

type Deck = { el: HTMLAudioElement; gain: GainNode; fader: GainNode; state: DeckState }
type DjInput = { gain: GainNode; analyser: AnalyserNode; returnDest: MediaStreamAudioDestinationNode; holder: HTMLAudioElement | null; talking: boolean }

const DUCK_LEVEL = 0.28

export class Mixer {
  readonly ctx = new AudioContext()
  /** What goes on air. */
  readonly out = this.ctx.createMediaStreamDestination()
  private master = this.ctx.createGain()
  private monitor = this.ctx.createGain()
  private musicBus = this.ctx.createGain()
  private padBus = this.ctx.createGain()
  private micGain = this.ctx.createGain()
  private micAnalyser = this.ctx.createAnalyser()
  private analyser = this.ctx.createAnalyser()
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  readonly decks: [Deck, Deck]
  private djs = new Map<number, DjInput>()
  private listeners = new Set<() => void>()
  private timer: number
  crossfade = 0
  micOpen = false
  ducking = true
  private fadeTimer: number | null = null
  /** Called when a deck runs out (for automix). */
  private onEnded: ((deck: 0 | 1) => void) | null = null

  setOnEnded(fn: ((deck: 0 | 1) => void) | null) {
    this.onEnded = fn
  }

  setDucking(on: boolean) {
    this.ducking = on
    this.emit()
  }

  constructor() {
    this.master.connect(this.out)
    this.master.connect(this.analyser)
    this.monitor.connect(this.ctx.destination)
    this.musicBus.connect(this.master)
    this.musicBus.connect(this.monitor)
    this.padBus.connect(this.master)
    this.padBus.connect(this.monitor)
    // The host's own voice: on air, not in their own ears
    this.micGain.gain.value = 0
    this.micGain.connect(this.master)
    this.analyser.fftSize = 1024
    this.micAnalyser.fftSize = 1024
    this.decks = [this.makeDeck(0), this.makeDeck(1)]
    this.setCrossfade(0)
    // Ducking and the meters, a few times a second
    this.timer = window.setInterval(() => this.tick(), 100)
  }

  private makeDeck(i: 0 | 1): Deck {
    const el = new Audio()
    el.preload = 'auto'
    const source = this.ctx.createMediaElementSource(el)
    const gain = this.ctx.createGain()
    const fader = this.ctx.createGain()
    source.connect(gain).connect(fader).connect(this.musicBus)
    const deck: Deck = { el, gain, fader, state: { track: null, playing: false, time: 0, duration: 0, volume: 1 } }
    const update = () => {
      deck.state = { ...deck.state, playing: !el.paused, time: el.currentTime, duration: Number.isFinite(el.duration) ? el.duration : deck.state.track?.duration ?? 0 }
      this.emit()
    }
    for (const e of ['play', 'pause', 'timeupdate', 'durationchange', 'seeked']) el.addEventListener(e, update)
    el.addEventListener('ended', () => {
      update()
      this.onEnded?.(i)
    })
    return deck
  }

  subscribe(l: () => void) {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  async resume() {
    if (this.ctx.state !== 'running') await this.ctx.resume()
  }

  // ------------------------------------------------------------ decks
  load(i: 0 | 1, track: MusicTrack) {
    const deck = this.decks[i]
    if (!track.audioUrl) return
    deck.el.src = track.audioUrl
    deck.state = { ...deck.state, track, playing: false, time: 0, duration: track.duration }
    this.emit()
  }

  async play(i: 0 | 1) {
    await this.resume()
    await this.decks[i].el.play().catch(() => undefined)
  }

  pause(i: 0 | 1) {
    this.decks[i].el.pause()
  }

  seek(i: 0 | 1, seconds: number) {
    this.decks[i].el.currentTime = seconds
  }

  eject(i: 0 | 1) {
    const deck = this.decks[i]
    deck.el.pause()
    deck.el.removeAttribute('src')
    deck.el.load()
    deck.state = { ...deck.state, track: null, playing: false, time: 0, duration: 0 }
    this.emit()
  }

  setDeckVolume(i: 0 | 1, volume: number) {
    this.decks[i].gain.gain.value = volume
    this.decks[i].state = { ...this.decks[i].state, volume }
    this.emit()
  }

  /** 0 = only deck A, 1 = only deck B; equal power in between, so the middle isn't quieter. */
  setCrossfade(x: number) {
    this.crossfade = Math.min(1, Math.max(0, x))
    this.decks[0].fader.gain.value = Math.cos((this.crossfade * Math.PI) / 2)
    this.decks[1].fader.gain.value = Math.cos(((1 - this.crossfade) * Math.PI) / 2)
    this.emit()
  }

  /** Slide the crossfader over to a deck in `seconds`. */
  fadeTo(i: 0 | 1, seconds = 6) {
    if (this.fadeTimer) clearInterval(this.fadeTimer)
    const from = this.crossfade
    const to = i
    const started = performance.now()
    this.fadeTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / (seconds * 1000))
      this.setCrossfade(from + (to - from) * t)
      if (t >= 1 && this.fadeTimer) {
        clearInterval(this.fadeTimer)
        this.fadeTimer = null
      }
    }, 50)
  }

  /** The deck that's heard most (for "now playing"). */
  onAir(): MusicTrack | null {
    const [a, b] = this.decks
    const heardA = a.state.playing ? a.fader.gain.value * a.state.volume : 0
    const heardB = b.state.playing ? b.fader.gain.value * b.state.volume : 0
    if (!heardA && !heardB) return null
    return heardA >= heardB ? a.state.track : b.state.track
  }

  // ------------------------------------------------------------ microphone
  async startMic(deviceId?: string) {
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.micSource?.disconnect()
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    this.micSource = this.ctx.createMediaStreamSource(this.micStream)
    this.micSource.connect(this.micGain)
    this.micSource.connect(this.micAnalyser)
    for (const dj of this.djs.values()) this.micGain.connect(dj.returnDest)
    this.emit()
  }

  get hasMic() {
    return !!this.micStream
  }

  setMic(open: boolean) {
    if (this.micOpen === open) return
    this.micOpen = open
    this.micGain.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, 0.02)
    this.emit()
  }

  // ------------------------------------------------------------ sound buttons
  private padCache = new Map<string, Promise<AudioBuffer>>()

  async playPad(source: string | (() => Promise<AudioBuffer>), key: string) {
    await this.resume()
    let buffer = this.padCache.get(key)
    if (!buffer) {
      buffer =
        typeof source === 'string'
          ? fetch(source)
              .then((r) => r.arrayBuffer())
              .then((b) => this.ctx.decodeAudioData(b))
          : source()
      this.padCache.set(key, buffer)
    }
    const node = this.ctx.createBufferSource()
    node.buffer = await buffer
    node.connect(this.padBus)
    node.start()
  }

  setPadVolume(v: number) {
    this.padBus.gain.value = v
  }

  setMonitorVolume(v: number) {
    this.monitor.gain.value = v
  }

  // ------------------------------------------------------------ co-DJs
  /**
   * A DJ joins: their channel on the desk, and their return feed (everything
   * except their own voice) to send them. Their microphone follows in setDjInput.
   */
  addDj(id: number): MediaStream {
    this.removeDj(id)
    const gain = this.ctx.createGain()
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = 1024
    gain.connect(this.master)
    gain.connect(this.monitor)
    gain.connect(analyser)
    const returnDest = this.ctx.createMediaStreamDestination()
    this.musicBus.connect(returnDest)
    this.padBus.connect(returnDest)
    this.micGain.connect(returnDest)
    for (const other of this.djs.values()) {
      other.gain.connect(returnDest)
      gain.connect(other.returnDest)
    }
    this.djs.set(id, { gain, analyser, returnDest, holder: null, talking: false })
    this.emit()
    return returnDest.stream
  }

  /** A DJ's microphone: a WebRTC stream, or an <audio> playing the relay through the server. */
  setDjInput(id: number, input: MediaStream | HTMLAudioElement) {
    const dj = this.djs.get(id)
    if (!dj) return
    if (dj.holder) {
      dj.holder.pause()
      dj.holder.srcObject = null
    }
    let source: AudioNode
    if (input instanceof MediaStream) {
      source = this.ctx.createMediaStreamSource(input)
      // Chrome only feeds a remote WebRTC stream into Web Audio when it's also attached to an element
      dj.holder = new Audio()
      dj.holder.srcObject = input
      dj.holder.muted = true
    } else {
      source = this.ctx.createMediaElementSource(input)
      dj.holder = input
    }
    void dj.holder.play().catch(() => undefined)
    source.connect(dj.gain)
    this.emit()
  }

  removeDj(id: number) {
    const dj = this.djs.get(id)
    if (!dj) return
    dj.gain.disconnect()
    // Their return feed isn't fed any more
    for (const node of [this.musicBus, this.padBus, this.micGain, ...[...this.djs.values()].map((d) => d.gain)]) {
      try {
        node.disconnect(dj.returnDest)
      } catch {
        // wasn't connected
      }
    }
    if (dj.holder) {
      dj.holder.pause()
      dj.holder.srcObject = null
      dj.holder.removeAttribute('src')
    }
    this.djs.delete(id)
    this.emit()
  }

  setDjVolume(id: number, v: number) {
    const dj = this.djs.get(id)
    if (dj) dj.gain.gain.value = v
  }

  djTalking(id: number) {
    return this.djs.get(id)?.talking ?? false
  }

  // ------------------------------------------------------------ meters and ducking
  private rms(analyser: AnalyserNode) {
    const data = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (const v of data) sum += v * v
    return Math.sqrt(sum / data.length)
  }

  /** The output level, 0 to 1 (for the meter). */
  level() {
    return Math.min(1, this.rms(this.analyser) * 2.5)
  }

  micLevel() {
    return this.micStream ? Math.min(1, this.rms(this.micAnalyser) * 3) : 0
  }

  private tick() {
    let changed = false
    for (const dj of this.djs.values()) {
      const talking = this.rms(dj.analyser) > 0.015
      if (talking !== dj.talking) {
        dj.talking = talking
        changed = true
      }
    }
    const someoneTalks = this.micOpen || [...this.djs.values()].some((d) => d.talking)
    this.musicBus.gain.setTargetAtTime(this.ducking && someoneTalks ? DUCK_LEVEL : 1, this.ctx.currentTime, someoneTalks ? 0.08 : 0.4)
    if (changed) this.emit()
  }

  destroy() {
    clearInterval(this.timer)
    if (this.fadeTimer) clearInterval(this.fadeTimer)
    for (const d of this.decks) d.el.pause()
    for (const id of [...this.djs.keys()]) this.removeDj(id)
    this.micStream?.getTracks().forEach((t) => t.stop())
    void this.ctx.close()
  }
}

/** The formats MediaRecorder can make that the server takes (Chrome/Edge: WebM, Firefox: either). */
export function recorderFormat(): { mime: string; format: 'webm' | 'ogg' } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const [mime, format] of [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/ogg;codecs=opus', 'ogg'],
  ] as const)
    if (MediaRecorder.isTypeSupported(mime)) return { mime, format }
  return null
}

/**
 * Sends the mix to the server: MediaRecorder makes a piece every second, and
 * those go up one at a time, in order. A piece that fails is tried again (the
 * server skips one it already had), so a short hiccup costs nothing.
 */
export class Broadcaster {
  private recorder: MediaRecorder
  private queue: Blob[] = []
  private seq = 0
  private sending = false
  private stopped = false
  /** The show ended on the server (stopped, or too long without pieces). */
  onLost: ((message: string) => void) | null = null
  /** Pieces waiting (a slow connection shows here). */
  backlog = 0

  constructor(stream: MediaStream, mime: string) {
    this.recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 128_000 })
    this.recorder.ondataavailable = (e) => {
      if (!e.data.size || this.stopped) return
      this.queue.push(e.data)
      this.backlog = this.queue.length
      void this.pump()
    }
  }

  start() {
    this.recorder.start(1000)
  }

  private async pump() {
    if (this.sending) return
    this.sending = true
    try {
      while (this.queue.length && !this.stopped) {
        const piece = this.queue[0]
        try {
          const res = await fetch(`/api/radio/live/piece?seq=${this.seq}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: piece })
          if (res.status === 409) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null
            this.stop()
            this.onLost?.(data?.error ?? 'De uitzending is gestopt.')
            return
          }
          if (!res.ok) throw new Error(String(res.status))
          this.queue.shift()
          this.seq++
          this.backlog = this.queue.length
        } catch {
          // Try the same piece again in a moment
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    } finally {
      this.sending = false
    }
  }

  stop() {
    this.stopped = true
    if (this.recorder.state !== 'inactive') this.recorder.stop()
  }
}

/** Tell the server what's on now (and the show's title). */
export const announceNow = (trackId: number | null, title?: string) => api('/radio/live/now', { method: 'POST', body: { trackId, ...(title && { title }) } }).catch(() => undefined)
