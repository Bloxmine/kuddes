/**
 * Kuddes Radio while it's live, kept in memory: the host's browser sends its
 * mix in pieces of about a second (WebM/Opus from MediaRecorder); ffmpeg turns
 * that into one MP3 stream of RADIO_LIMITS.bitrate kbit/s, which goes out to
 * every listener as it comes. A station's page follows along through an event
 * stream (live or not, the song on now, the chat, and for the studio the
 * set-up messages of the co-DJs' microphones).
 *
 * A show ends when the host stops it, or when nothing has come in for a while
 * (the tab was closed). Nothing is recorded.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { SSEStreamingApi } from 'hono/streaming'
import type { UserSummary } from '../../shared/api'
import type { MusicTrack } from '../../shared/music'
import { RADIO_LIMITS, type RadioChatLine, type RadioEvents, type RadioLive } from '../../shared/radio'

/** No piece from the host for this long: the show is over. */
const SILENT_MS = 20_000
/** What a new listener gets first, so it starts right away (about 3 seconds). */
const HEAD_BYTES = (RADIO_LIMITS.bitrate * 1000 * 3) / 8

type Listener = { ip: string; push: (chunk: Uint8Array) => void; close: () => void }
/** A co-DJ's microphone that goes through the server (when a direct connection didn't work). */
type Relay = { started: boolean; viewers: Set<Listener> }

type Session = {
  stationId: number
  title: string
  since: Date
  ffmpeg: ChildProcessWithoutNullStreams
  /** The number of the next piece we expect from the host. */
  seq: number
  lastPieceAt: number
  recent: Buffer[]
  recentBytes: number
  listeners: Set<Listener>
  track: MusicTrack | null
  djs: Map<number, UserSummary>
  relays: Map<number, Relay>
  chat: RadioChatLine[]
  ended: boolean
}

const sessions = new Map<number, Session>()
/** Who follows a station's page (listeners and the studio): stream and who they are. */
const watchers = new Map<number, Set<{ userId: number | null; stream: SSEStreamingApi }>>()
let chatId = 1

export const isLive = (stationId: number) => sessions.has(stationId)
export const liveCount = () => sessions.size
export const liveStations = () => [...sessions.keys()]

export function liveState(stationId: number): RadioLive | null {
  const s = sessions.get(stationId)
  if (!s) return null
  return { title: s.title, since: s.since.toISOString(), listeners: s.listeners.size, track: s.track, djs: [...s.djs.values()] }
}

function emit<E extends keyof RadioEvents>(stationId: number, event: E, data: RadioEvents[E], onlyUser?: number) {
  const payload = JSON.stringify(data)
  for (const w of watchers.get(stationId) ?? []) {
    if (onlyUser !== undefined && w.userId !== onlyUser) continue
    void w.stream.writeSSE({ event, data: payload }).catch(() => undefined)
  }
}

/** The listener count changed, a song started…: everyone on the page sees it. */
export const announce = (stationId: number) => emit(stationId, 'live', liveState(stationId))

// The count changes often while people tune in; tell the page at most every few seconds
const countTimers = new Map<number, NodeJS.Timeout>()
function announceSoon(stationId: number) {
  if (countTimers.has(stationId)) return
  countTimers.set(
    stationId,
    setTimeout(() => {
      countTimers.delete(stationId)
      announce(stationId)
    }, 3000),
  )
}

export function watch(stationId: number, userId: number | null, stream: SSEStreamingApi) {
  const set = watchers.get(stationId) ?? new Set()
  const entry = { userId, stream }
  set.add(entry)
  watchers.set(stationId, set)
  return () => {
    set.delete(entry)
    if (!set.size) watchers.delete(stationId)
  }
}

/** A set-up message for one person's microphone connection (the host, or a co-DJ). */
export const signal = (stationId: number, toUserId: number, data: RadioEvents['dj']) => emit(stationId, 'dj', data, toUserId)

/** On air: ffmpeg starts, waiting for the first piece. `format`: what MediaRecorder makes (webm or ogg). */
export function start(stationId: number, title: string, format: 'webm' | 'ogg') {
  if (sessions.has(stationId)) stop(stationId)
  const ffmpeg = spawn(
    'ffmpeg',
    [
      ...['-nostdin', '-hide_banner', '-loglevel', 'error'],
      // Start as soon as the first piece is in, and don't hold anything back
      ...['-fflags', '+nobuffer', '-probesize', '32768', '-analyzeduration', '0'],
      ...['-f', format === 'ogg' ? 'ogg' : 'matroska', '-i', 'pipe:0'],
      ...['-vn', '-c:a', 'libmp3lame', '-b:a', `${RADIO_LIMITS.bitrate}k`, '-ar', '44100', '-ac', '2'],
      ...['-flush_packets', '1', '-f', 'mp3', 'pipe:1'],
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const session: Session = {
    stationId,
    title,
    since: new Date(),
    ffmpeg,
    seq: 0,
    lastPieceAt: Date.now(),
    recent: [],
    recentBytes: 0,
    listeners: new Set(),
    track: null,
    djs: new Map(),
    relays: new Map(),
    chat: [],
    ended: false,
  }
  ffmpeg.stdout.on('data', (chunk: Buffer) => {
    session.recent.push(chunk)
    session.recentBytes += chunk.length
    while (session.recentBytes - session.recent[0].length > HEAD_BYTES) session.recentBytes -= session.recent.shift()!.length
    const bytes = new Uint8Array(chunk)
    for (const l of session.listeners) l.push(bytes)
  })
  ffmpeg.stderr.on('data', (d: Buffer) => console.error(`radio ${stationId}:`, d.toString().trim()))
  ffmpeg.stdin.on('error', () => undefined)
  ffmpeg.on('close', () => {
    if (!session.ended) stop(stationId)
  })
  sessions.set(stationId, session)
  announce(stationId)
}

/** A piece of the host's mix. Sent one at a time, in order; a repeat (a retry) is skipped. */
export function piece(stationId: number, seq: number, data: Buffer): 'ok' | 'off' | 'gap' {
  const s = sessions.get(stationId)
  if (!s) return 'off'
  if (seq < s.seq) return 'ok'
  // A missing piece would break the WebM stream: the studio has to start again
  if (seq > s.seq) return 'gap'
  s.seq++
  s.lastPieceAt = Date.now()
  s.ffmpeg.stdin.write(data)
  return 'ok'
}

export function stop(stationId: number) {
  const s = sessions.get(stationId)
  if (!s) return
  s.ended = true
  sessions.delete(stationId)
  s.ffmpeg.stdin.end()
  setTimeout(() => s.ffmpeg.kill('SIGKILL'), 3000).unref()
  for (const l of s.listeners) l.close()
  for (const r of s.relays.values()) for (const v of r.viewers) v.close()
  announce(stationId)
}

export function setTitle(stationId: number, title: string) {
  const s = sessions.get(stationId)
  if (s) s.title = title
  announce(stationId)
}

export function setTrack(stationId: number, track: MusicTrack | null) {
  const s = sessions.get(stationId)
  if (!s) return
  s.track = track
  announce(stationId)
}

/** A new listener: the last few seconds first, then everything as it comes. Null when it's full or off air. */
export function listen(stationId: number, ip: string): ReadableStream<Uint8Array> | null {
  const s = sessions.get(stationId)
  if (!s || s.listeners.size >= RADIO_LIMITS.listeners) return null
  if ([...s.listeners].filter((l) => l.ip === ip).length >= RADIO_LIMITS.listenersPerIp) return null
  let listener: Listener
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      listener = {
        ip,
        push: (chunk) => {
          // A listener that can't keep up (more than ~10 s behind) is dropped, not buffered forever
          if (!open) return
          if ((controller.desiredSize ?? 0) < -RADIO_LIMITS.bitrate * 125 * 10) return listener.close()
          controller.enqueue(chunk)
        },
        close: () => {
          if (!open) return
          open = false
          s.listeners.delete(listener)
          announceSoon(stationId)
          try {
            controller.close()
          } catch {
            // already closed by the browser
          }
        },
      }
      for (const chunk of s.recent) controller.enqueue(new Uint8Array(chunk))
      s.listeners.add(listener)
      announceSoon(stationId)
    },
    cancel() {
      listener.close()
    },
  })
}

export function addChat(stationId: number, user: UserSummary, text: string) {
  const s = sessions.get(stationId)
  if (!s) return null
  const line: RadioChatLine = { id: chatId++, user, text, at: new Date().toISOString() }
  s.chat = [...s.chat.slice(-49), line]
  emit(stationId, 'chat', line)
  return line
}

export const chatOf = (stationId: number) => sessions.get(stationId)?.chat ?? []

// ------------------------------------------------------------------ co-DJs

export function djJoined(stationId: number, dj: UserSummary) {
  const s = sessions.get(stationId)
  if (!s) return false
  if (!s.djs.has(dj.id) && s.djs.size >= RADIO_LIMITS.djsLive) return false
  s.djs.set(dj.id, dj)
  announce(stationId)
  return true
}

export function djLeft(stationId: number, djId: number) {
  const s = sessions.get(stationId)
  if (!s) return
  s.djs.delete(djId)
  const relay = s.relays.get(djId)
  if (relay) for (const v of relay.viewers) v.close()
  s.relays.delete(djId)
  announce(stationId)
}

export const isDjIn = (stationId: number, djId: number) => !!sessions.get(stationId)?.djs.has(djId)

/**
 * A piece of a co-DJ's microphone, through the server: on to the host's
 * studio. A WebM stream can't be joined halfway, so the studio asks for a
 * fresh start (relayListen) and pieces only go out from that first one.
 */
export function relayPiece(stationId: number, djId: number, data: Buffer, first: boolean) {
  const s = sessions.get(stationId)
  if (!s?.djs.has(djId)) return false
  const relay = s.relays.get(djId)
  // Nobody listening yet, or still the recording from before the restart
  if (!relay || (!first && !relay.started)) return true
  relay.started = true
  const bytes = new Uint8Array(data)
  for (const v of relay.viewers) v.push(bytes)
  return true
}

/** The host's studio listens to a co-DJ's microphone through the server (the DJ then starts a fresh recording). */
export function relayListen(stationId: number, djId: number): ReadableStream<Uint8Array> | null {
  const s = sessions.get(stationId)
  if (!s?.djs.has(djId)) return null
  for (const v of s.relays.get(djId)?.viewers ?? []) v.close()
  const relay: Relay = { started: false, viewers: new Set() }
  s.relays.set(djId, relay)
  let viewer: Listener
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      viewer = {
        ip: '',
        push: (chunk) => open && controller.enqueue(chunk),
        close: () => {
          if (!open) return
          open = false
          relay.viewers.delete(viewer)
          try {
            controller.close()
          } catch {
            // already closed
          }
        },
      }
      relay.viewers.add(viewer)
    },
    cancel() {
      viewer.close()
    },
  })
}

// A host that disappeared (closed the tab, lost the connection): the show ends
setInterval(() => {
  const now = Date.now()
  for (const s of sessions.values()) if (now - s.lastPieceAt > SILENT_MS) stop(s.stationId)
}, 5000).unref()
