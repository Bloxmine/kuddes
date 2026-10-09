/**
 * Voice calls in Kuddes Messenger: the two browsers talk to each other
 * directly (WebRTC); the server only passes on how to reach each other
 * (POST /messenger/with/:username/call, the "call" event on the stream).
 * Only between friends who both allowed calls in Instellingen › Privacy.
 * One call at a time; CallWindow.tsx shows it.
 */
import { useSyncExternalStore } from 'react'
import type { UserSummary } from '../../../shared/api'
import type { CallSignal, MessengerEvents } from '../../../shared/messenger'
import { api, errorMessage } from '../../lib/api'
import { showBrowserNotification } from '../../lib/browserNotify'

export type CallPeer = Pick<UserSummary, 'id' | 'username' | 'nickname' | 'avatarUrl'>

export type CallState =
  | { phase: 'idle'; note?: string }
  | { phase: 'outgoing' | 'incoming' | 'connecting' | 'connected'; id: string; peer: CallPeer; muted: boolean; since: number | null }

/** No answer within this time: the call stops. */
const RING_MS = 40_000

let state: CallState = { phase: 'idle' }
const listeners = new Set<() => void>()
const set = (next: CallState) => {
  state = next
  listeners.forEach((l) => l())
}

export const useCall = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )

// The connection itself, outside React
let pc: RTCPeerConnection | null = null
let local: MediaStream | null = null
let remoteAudio: HTMLAudioElement | null = null
let pendingOffer: RTCSessionDescriptionInit | null = null
let queuedIce: RTCIceCandidateInit[] = []
let ringTimer: number | null = null
let ringing: { stop: () => void } | null = null

const signal = (peer: CallPeer, id: string, kind: CallSignal, payload?: unknown) =>
  api<void>(`/messenger/with/${encodeURIComponent(peer.username)}/call`, { method: 'POST', body: { id, kind, payload } })

let ice: RTCIceServer[] | null = null
async function iceServers() {
  ice ??= await api<{ iceServers: RTCIceServer[] }>('/games/ice')
    .then((r) => r.iceServers)
    .catch(() => [{ urls: 'stun:stun.l.google.com:19302' }])
  return ice
}

/** A soft "tring tring" while it rings (both ways), made in the browser. */
function ring(incoming: boolean) {
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return { stop: () => undefined }
  const ctx = new AudioCtx()
  const beep = () => {
    const t = ctx.currentTime
    for (const [freq, at] of incoming ? [[880, 0], [660, 0.18], [880, 0.6], [660, 0.78]] : [[440, 0], [440, 0.45]]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, t + at)
      gain.gain.exponentialRampToValueAtTime(incoming ? 0.12 : 0.05, t + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t + at)
      osc.stop(t + at + 0.18)
    }
  }
  beep()
  const timer = window.setInterval(beep, incoming ? 2200 : 3000)
  return {
    stop: () => {
      window.clearInterval(timer)
      void ctx.close()
    },
  }
}

function stopRinging() {
  ringing?.stop()
  ringing = null
  if (ringTimer) window.clearTimeout(ringTimer)
  ringTimer = null
}

function cleanup(note?: string) {
  stopRinging()
  pc?.close()
  pc = null
  local?.getTracks().forEach((t) => t.stop())
  local = null
  if (remoteAudio) remoteAudio.srcObject = null
  pendingOffer = null
  queuedIce = []
  set({ phase: 'idle', note })
}

async function connect(peer: CallPeer, id: string) {
  local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const conn = new RTCPeerConnection({ iceServers: await iceServers() })
  pc = conn
  local.getTracks().forEach((t) => conn.addTrack(t, local!))
  conn.onicecandidate = (e) => e.candidate && void signal(peer, id, 'ice', e.candidate.toJSON()).catch(() => undefined)
  conn.ontrack = (e) => {
    remoteAudio ??= Object.assign(new Audio(), { autoplay: true })
    remoteAudio.srcObject = e.streams[0]
    void remoteAudio.play().catch(() => undefined)
  }
  conn.onconnectionstatechange = () => {
    if (pc !== conn || state.phase === 'idle') return
    if (conn.connectionState === 'connected') {
      stopRinging()
      set({ ...state, phase: 'connected', since: state.since ?? Date.now() })
    } else if (conn.connectionState === 'failed') {
      cleanup('De verbinding is verbroken.')
    }
  }
  return conn
}

const micError = (e: unknown) =>
  e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
    ? 'Kuddes mag je microfoon niet gebruiken. Sta het toe in je browser en probeer het opnieuw.'
    : e instanceof DOMException && e.name === 'NotFoundError'
      ? 'Er is geen microfoon gevonden.'
      : errorMessage(e)

/** Calling a friend. */
export async function startCall(peer: CallPeer) {
  if (state.phase !== 'idle') return
  const id = crypto.randomUUID()
  set({ phase: 'outgoing', id, peer, muted: false, since: null })
  try {
    const conn = await connect(peer, id)
    const offer = await conn.createOffer()
    await conn.setLocalDescription(offer)
    await signal(peer, id, 'offer', offer)
    ringing = ring(false)
    ringTimer = window.setTimeout(() => {
      void signal(peer, id, 'hangup').catch(() => undefined)
      cleanup(`${peer.nickname} neemt niet op.`)
    }, RING_MS)
  } catch (e) {
    cleanup(micError(e))
  }
}

export async function acceptCall() {
  if (state.phase !== 'incoming' || !pendingOffer) return
  const { peer, id } = state
  stopRinging()
  set({ ...state, phase: 'connecting' })
  try {
    const conn = await connect(peer, id)
    await conn.setRemoteDescription(pendingOffer)
    for (const c of queuedIce) await conn.addIceCandidate(c).catch(() => undefined)
    queuedIce = []
    const answer = await conn.createAnswer()
    await conn.setLocalDescription(answer)
    await signal(peer, id, 'answer', answer)
  } catch (e) {
    void signal(peer, id, 'hangup').catch(() => undefined)
    cleanup(micError(e))
  }
}

export function rejectCall() {
  if (state.phase !== 'incoming') return
  void signal(state.peer, state.id, 'reject').catch(() => undefined)
  cleanup()
}

export function hangUp() {
  if (state.phase === 'idle') return
  void signal(state.peer, state.id, state.phase === 'incoming' ? 'reject' : 'hangup').catch(() => undefined)
  cleanup()
}

export function toggleMute() {
  if (state.phase === 'idle' || !local) return
  const muted = !state.muted
  local.getAudioTracks().forEach((t) => (t.enabled = !muted))
  set({ ...state, muted })
}

export const clearCallNote = () => state.phase === 'idle' && state.note && set({ phase: 'idle' })

/** A signal from the other side, from the Messenger stream; `peerOf` finds who it is among your friends. */
export async function onCallSignal(data: MessengerEvents['call'], peerOf: (id: number) => Promise<CallPeer | null>) {
  // This call, as it is now (null: another call, or none)
  const cur = state.phase !== 'idle' && state.id === data.id ? state : null
  const ours = !!cur
  switch (data.kind) {
    case 'offer': {
      const peer = await peerOf(data.from)
      if (!peer) return
      // Already in a call: they hear it's busy
      if (state.phase !== 'idle') return void signal(peer, data.id, 'busy').catch(() => undefined)
      pendingOffer = data.payload as RTCSessionDescriptionInit
      set({ phase: 'incoming', id: data.id, peer, muted: false, since: null })
      ringing = ring(true)
      ringTimer = window.setTimeout(() => cleanup(`Gemiste oproep van ${peer.nickname}.`), RING_MS + 5000)
      void showBrowserNotification('notifyCalls', { title: `${peer.nickname} belt je`, body: 'Neem op in Kuddes Messenger.', url: location.pathname + location.search, tag: `bellen-${data.id}`, icon: peer.avatarUrl })
      return
    }
    case 'answer':
      if (!cur || !pc) return
      stopRinging()
      set({ ...cur, phase: 'connecting' })
      await pc.setRemoteDescription(data.payload as RTCSessionDescriptionInit)
      for (const c of queuedIce) await pc.addIceCandidate(c).catch(() => undefined)
      queuedIce = []
      return
    case 'ice':
      if (!ours) return
      if (pc?.remoteDescription) await pc.addIceCandidate(data.payload as RTCIceCandidateInit).catch(() => undefined)
      else queuedIce.push(data.payload as RTCIceCandidateInit)
      return
    case 'hangup':
      if (cur) cleanup(cur.phase === 'incoming' ? `Gemiste oproep van ${cur.peer.nickname}.` : 'Het gesprek is beëindigd.')
      return
    case 'reject':
      if (cur) cleanup(`${cur.peer.nickname} neemt nu niet op.`)
      return
    case 'busy':
      if (cur) cleanup(`${cur.peer.nickname} is al in gesprek.`)
      return
  }
}
