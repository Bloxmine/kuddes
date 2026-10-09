/**
 * Co-DJs' microphones. The host's studio and each DJ connect directly
 * (WebRTC, with the same STUN/TURN servers as the games): the DJ's mic goes to
 * the host, the host sends back the show without the DJ's own voice. When a
 * direct connection doesn't work within a few seconds, the DJ's mic goes
 * through the Kuddes server instead (a second or so later), and the DJ hears
 * the show like any listener.
 */
import type { RadioEvents } from '../../../shared/radio'
import { api } from '../../lib/api'
import type { Mixer } from './mixer'

type Signal = RadioEvents['dj']
export type DjMode = 'verbinden' | 'direct' | 'via-kuddes'

let iceCache: Promise<RTCIceServer[]> | null = null
export function iceServers(): Promise<RTCIceServer[]> {
  iceCache ??= api<{ iceServers: RTCIceServer[] }>('/games/ice')
    .then((r) => r.iceServers)
    .catch(() => {
      iceCache = null
      return [{ urls: 'stun:stun.l.google.com:19302' }]
    })
  return iceCache
}

const DIRECT_TIMEOUT_MS = 10_000

/** The host's side: one connection per DJ in the studio. */
export class HostDjLinks {
  private peers = new Map<number, { pc: RTCPeerConnection | null; mode: DjMode; timer: number }>()
  onChange: (() => void) | null = null
  private mixer: Mixer

  constructor(mixer: Mixer) {
    this.mixer = mixer
  }

  mode(id: number): DjMode | null {
    return this.peers.get(id)?.mode ?? null
  }

  ids() {
    return [...this.peers.keys()]
  }

  private send(to: number, kind: 'offer' | 'ice' | 'kick', payload?: unknown) {
    return api('/radio/live/signal', { method: 'POST', body: { to, kind, payload } }).catch(() => undefined)
  }

  async handle(e: Signal) {
    const peer = this.peers.get(e.from)
    if (e.kind === 'join') return this.connect(e.from)
    if (e.kind === 'leave') return this.drop(e.from)
    if (e.kind === 'relay') return this.relay(e.from)
    if (!peer?.pc) return
    if (e.kind === 'answer') await peer.pc.setRemoteDescription(e.payload as RTCSessionDescriptionInit).catch(() => this.relay(e.from))
    if (e.kind === 'ice' && e.payload) await peer.pc.addIceCandidate(e.payload as RTCIceCandidateInit).catch(() => undefined)
  }

  private async connect(id: number) {
    this.drop(id)
    const returnFeed = this.mixer.addDj(id)
    const pc = new RTCPeerConnection({ iceServers: await iceServers() })
    const peer = { pc, mode: 'verbinden' as DjMode, timer: window.setTimeout(() => peer.mode !== 'direct' && this.relay(id), DIRECT_TIMEOUT_MS) }
    this.peers.set(id, peer)
    this.onChange?.()
    for (const track of returnFeed.getAudioTracks()) pc.addTrack(track, returnFeed)
    pc.ontrack = (ev) => this.mixer.setDjInput(id, ev.streams[0] ?? new MediaStream([ev.track]))
    pc.onicecandidate = (ev) => ev.candidate && void this.send(id, 'ice', ev.candidate.toJSON())
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        peer.mode = 'direct'
        clearTimeout(peer.timer)
        this.onChange?.()
      }
      if (pc.connectionState === 'failed') void this.relay(id)
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.send(id, 'offer', pc.localDescription?.toJSON())
  }

  /** Through the server: the studio asks for the DJ's stream (the server tells the DJ to start sending). */
  private relay(id: number) {
    const peer = this.peers.get(id)
    if (!peer || peer.mode === 'via-kuddes') return
    clearTimeout(peer.timer)
    peer.pc?.close()
    peer.pc = null
    peer.mode = 'via-kuddes'
    const el = new Audio(`/api/radio/live/relay/${id}?t=${Date.now()}`)
    el.preload = 'auto'
    this.mixer.setDjInput(id, el)
    this.onChange?.()
  }

  kick(id: number) {
    void this.send(id, 'kick')
    this.drop(id)
  }

  drop(id: number) {
    const peer = this.peers.get(id)
    if (peer) {
      clearTimeout(peer.timer)
      peer.pc?.close()
      this.peers.delete(id)
    }
    this.mixer.removeDj(id)
    this.onChange?.()
  }

  close() {
    for (const id of this.ids()) this.drop(id)
  }
}

/** The DJ's side: their microphone (silent until they push to talk) to the host. */
export class DjLink {
  private pc: RTCPeerConnection | null = null
  private recorder: MediaRecorder | null = null
  private sending = Promise.resolve()
  /** What the DJ hears: the host's return feed, or (through the server) the show itself. */
  readonly ears = new Audio()
  mode: DjMode = 'verbinden'
  onChange: (() => void) | null = null
  onKicked: (() => void) | null = null

  private host: string
  private mic: MediaStream

  constructor(host: string, mic: MediaStream) {
    this.host = host
    this.mic = mic
    this.talk(false)
  }

  private base() {
    return `/radio/stations/${encodeURIComponent(this.host)}/dj`
  }

  private send(kind: 'answer' | 'ice' | 'relay', payload?: unknown) {
    return api(`${this.base()}/signal`, { method: 'POST', body: { kind, payload } }).catch(() => undefined)
  }

  async join() {
    await api(`${this.base()}/join`, { method: 'POST' })
  }

  talk(on: boolean) {
    for (const t of this.mic.getAudioTracks()) t.enabled = on
  }

  async handle(e: Signal) {
    if (e.kind === 'kick') {
      this.close(false)
      this.onKicked?.()
      return
    }
    if (e.kind === 'relay') return this.startRelay()
    if (e.kind === 'offer') {
      this.pc?.close()
      const pc = new RTCPeerConnection({ iceServers: await iceServers() })
      this.pc = pc
      for (const track of this.mic.getAudioTracks()) pc.addTrack(track, this.mic)
      pc.ontrack = (ev) => {
        this.ears.srcObject = ev.streams[0] ?? new MediaStream([ev.track])
        void this.ears.play().catch(() => undefined)
      }
      pc.onicecandidate = (ev) => ev.candidate && void this.send('ice', ev.candidate.toJSON())
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          this.mode = 'direct'
          this.onChange?.()
        }
      }
      await pc.setRemoteDescription(e.payload as RTCSessionDescriptionInit)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await this.send('answer', pc.localDescription?.toJSON())
    }
    if (e.kind === 'ice' && e.payload && this.pc) await this.pc.addIceCandidate(e.payload as RTCIceCandidateInit).catch(() => undefined)
  }

  /** Through the server: a fresh recording of the mic, in small pieces; the DJ hears the show itself. */
  private startRelay() {
    this.pc?.close()
    this.pc = null
    this.recorder?.stop()
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m))
    if (!mime) return
    const recorder = new MediaRecorder(this.mic, { mimeType: mime, audioBitsPerSecond: 64_000 })
    let first = true
    recorder.ondataavailable = (ev) => {
      if (!ev.data.size) return
      const isFirst = first
      first = false
      // One at a time, in order
      this.sending = this.sending.then(() =>
        fetch(`/api${this.base()}/piece${isFirst ? '?first=1' : ''}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' }, body: ev.data })
          .then(() => undefined)
          .catch(() => undefined),
      )
    }
    recorder.start(250)
    this.recorder = recorder
    this.ears.srcObject = null
    this.ears.src = `/api/radio/stations/${encodeURIComponent(this.host)}/stream?t=${Date.now()}`
    void this.ears.play().catch(() => undefined)
    this.mode = 'via-kuddes'
    this.onChange?.()
  }

  close(tellServer = true) {
    this.pc?.close()
    this.pc = null
    if (this.recorder?.state === 'recording') this.recorder.stop()
    this.ears.pause()
    this.ears.srcObject = null
    this.ears.removeAttribute('src')
    this.mic.getTracks().forEach((t) => t.stop())
    if (tellServer) void api(`${this.base()}/leave`, { method: 'POST' }).catch(() => undefined)
  }
}
