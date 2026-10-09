/**
 * The music player: one <audio> for the whole site, so a song keeps playing
 * while you click around. A queue (the list you pressed play in), shuffle
 * and repeat; the bar at the bottom (PlayerBar.tsx) shows it. A song counts
 * as played once it really started (the server ignores repeats).
 *
 * It also plays Kuddes Radio: then there's no queue, only the live stream of
 * one station (`live`). Pausing a live show stops it; playing again picks up
 * where the show is now, not where you left it.
 */
import { useSyncExternalStore } from 'react'
import type { MusicTrack } from '../../../shared/music'
import { api } from '../../lib/api'

export type PlayerState = {
  queue: MusicTrack[]
  /** The order the queue is played in (shuffled or not): indexes into `queue`. */
  order: number[]
  /** Where in `order` we are. */
  at: number
  playing: boolean
  loading: boolean
  shuffle: boolean
  repeat: boolean
  volume: number
  muted: boolean
  error: string | null
  /** Listening to a live radio show instead of songs. */
  live: LiveListen | null
}

export type LiveListen = { username: string; station: string; title: string; bannerUrl: string | null }

const VOLUME_KEY = 'kuddes.muziek.volume'
const savedVolume = () => {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return v > 0 && v <= 1 ? v : 0.8
  } catch {
    return 0.8
  }
}

let state: PlayerState = { queue: [], order: [], at: 0, playing: false, loading: false, shuffle: false, repeat: false, volume: savedVolume(), muted: false, error: null, live: null }
const listeners = new Set<() => void>()
const timeListeners = new Set<() => void>()
let audio: HTMLAudioElement | null = null
/** The song the play was counted for (once per time it's started). */
let counted: number | null = null

function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export const currentTrack = (s: PlayerState = state): MusicTrack | null => s.queue[s.order[s.at]] ?? null

function element() {
  if (audio) return audio
  audio = new Audio()
  audio.preload = 'auto'
  audio.volume = state.volume
  audio.addEventListener('playing', () => {
    set({ playing: true, loading: false, error: null })
    const track = currentTrack()
    if (track && counted !== track.id) {
      counted = track.id
      void api(`/tracks/${track.id}/play`, { method: 'POST' }).catch(() => {})
    }
  })
  audio.addEventListener('pause', () => set({ playing: false }))
  audio.addEventListener('waiting', () => set({ loading: true }))
  audio.addEventListener('ended', () => {
    if (state.live) return set({ playing: false, loading: false, error: 'De uitzending is gestopt.' })
    if (state.at < state.order.length - 1) go(state.at + 1)
    else if (state.repeat) go(0)
    else set({ playing: false })
  })
  audio.addEventListener('error', () => {
    // A stopped live stream (no src left) is not an error
    if (!audio?.getAttribute('src')) return
    set({ playing: false, loading: false, error: state.live ? 'Deze zender is nu niet live.' : 'Dit nummer kan niet worden afgespeeld.' })
  })
  for (const e of ['timeupdate', 'durationchange', 'seeked', 'emptied']) audio.addEventListener(e, () => timeListeners.forEach((l) => l()))
  return audio
}

/** Only one thing makes sound: other players on the page (a profile's music gadget, a video) stop. */
function pauseOthers() {
  for (const media of document.querySelectorAll<HTMLMediaElement>('audio, video')) if (media !== audio && !media.paused) media.pause()
}

function load(at: number) {
  const a = element()
  const track = state.queue[state.order[at]]
  if (!track?.audioUrl) return
  counted = null
  set({ at, loading: true, error: null, live: null })
  a.src = track.audioUrl
  mediaSession(track)
  pauseOthers()
  a.play().catch(() => set({ playing: false, loading: false }))
}

/** The song on the lock screen and the media keys of the keyboard. */
function mediaSession(track: MusicTrack) {
  if (!('mediaSession' in navigator)) return
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist.name, album: 'Kuddes Muziek', artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: '600x600' }] : [] })
  navigator.mediaSession.setActionHandler('play', () => player.toggle())
  navigator.mediaSession.setActionHandler('pause', () => player.toggle())
  navigator.mediaSession.setActionHandler('previoustrack', () => player.prev())
  navigator.mediaSession.setActionHandler('nexttrack', () => player.next())
}

/** Tune in: a fresh connection, so you hear the show as it is now. */
function tuneIn(live: LiveListen) {
  const a = element()
  set({ live, queue: [], order: [], at: 0, loading: true, error: null })
  a.src = `/api/radio/stations/${encodeURIComponent(live.username)}/stream?t=${Date.now()}`
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: live.title, artist: live.station, album: 'Kuddes Radio', artwork: live.bannerUrl ? [{ src: live.bannerUrl }] : [] })
    navigator.mediaSession.setActionHandler('play', () => player.toggle())
    navigator.mediaSession.setActionHandler('pause', () => player.toggle())
    navigator.mediaSession.setActionHandler('previoustrack', null)
    navigator.mediaSession.setActionHandler('nexttrack', null)
  }
  pauseOthers()
  a.play().catch(() => set({ playing: false, loading: false }))
}

/** Stop listening to a live show (the connection closes; nothing piles up while paused). */
function tuneOut() {
  if (!audio) return
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  set({ playing: false, loading: false })
}

function go(at: number) {
  if (at < 0 || at >= state.order.length) return
  load(at)
}

const shuffled = (n: number, first: number) => {
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== first)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [first, ...rest]
}

export const player = {
  /** Play `tracks` from `index` (or a random one with shuffle on); pressing the song that's on pauses or resumes it. */
  play(tracks: MusicTrack[], index = 0, opts: { shuffle?: boolean } = {}) {
    const list = tracks.filter((t) => t.audioUrl)
    if (!list.length) return
    const start = Math.max(0, list.findIndex((t) => t.id === tracks[index]?.id))
    const current = currentTrack()
    if (!opts.shuffle && current && current.id === list[start].id && audio?.src) return player.toggle()
    const shuffle = opts.shuffle ?? state.shuffle
    const first = opts.shuffle ? Math.floor(Math.random() * list.length) : start
    set({ queue: list, order: shuffle ? shuffled(list.length, first) : list.map((_, i) => i), shuffle })
    load(shuffle ? 0 : first)
  },
  /** Listen to a station live (or stop, when it's already on). */
  listen(live: LiveListen) {
    if (state.live?.username === live.username && (state.playing || state.loading)) return tuneOut()
    tuneIn(live)
  },
  /** The show's title changed. */
  liveTitle(username: string, title: string) {
    if (state.live?.username === username && state.live.title !== title) set({ live: { ...state.live, title } })
  },
  toggle() {
    const a = element()
    if (state.live) return state.playing || state.loading ? tuneOut() : tuneIn(state.live)
    if (!currentTrack()) return
    if (a.paused) {
      pauseOthers()
      void a.play().catch(() => {})
    } else a.pause()
  },
  next: () => go(state.at + 1 < state.order.length ? state.at + 1 : state.repeat ? 0 : state.at + 1),
  /** Back to the start of the song, or (in the first seconds) to the one before. */
  prev() {
    if (audio && audio.currentTime > 3) audio.currentTime = 0
    else go(state.at - 1)
  },
  jump: (at: number) => go(at),
  seek(seconds: number) {
    if (audio && Number.isFinite(seconds)) audio.currentTime = seconds
  },
  setVolume(volume: number) {
    element().volume = volume
    element().muted = false
    set({ volume, muted: false })
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      // only for now then
    }
  },
  toggleMute() {
    element().muted = !state.muted
    set({ muted: !state.muted })
  },
  toggleShuffle() {
    const shuffle = !state.shuffle
    const index = state.order[state.at] ?? 0
    // The song that's on stays on; the rest gets a new order
    const order = shuffle ? shuffled(state.queue.length, index) : state.queue.map((_, i) => i)
    set({ shuffle, order, at: shuffle ? 0 : index })
  },
  toggleRepeat: () => set({ repeat: !state.repeat }),
  /** A song changed (liked, renamed): the queue shows it too. */
  update(track: MusicTrack) {
    if (state.queue.some((t) => t.id === track.id)) set({ queue: state.queue.map((t) => (t.id === track.id ? track : t)) })
  },
  /** Removed: out of the queue, and stopped if it was on. */
  remove(id: number) {
    if (!state.queue.some((t) => t.id === id)) return
    if (currentTrack()?.id === id) player.close()
    else {
      const queue = state.queue.filter((t) => t.id !== id)
      const current = currentTrack()
      const order = queue.map((_, i) => i)
      set({ queue, order, at: Math.max(0, queue.findIndex((t) => t.id === current?.id)) })
    }
  },
  close() {
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    set({ queue: [], order: [], at: 0, playing: false, loading: false, error: null, live: null })
  },
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Everything about the player except where in the song it is. */
export const usePlayer = () => useSyncExternalStore(subscribe, () => state)

/** The song on now, and whether it's playing (for the play buttons in lists). */
export function useNowPlaying() {
  const id = useSyncExternalStore(subscribe, () => currentTrack()?.id ?? null)
  const playing = useSyncExternalStore(subscribe, () => state.playing || state.loading)
  return { id, playing }
}

const subscribeTime = (l: () => void) => {
  timeListeners.add(l)
  return () => timeListeners.delete(l)
}

/** The station you're listening to live (null: none), and whether it's on. */
export function useLiveListen() {
  const live = useSyncExternalStore(subscribe, () => state.live)
  const playing = useSyncExternalStore(subscribe, () => !!state.live && (state.playing || state.loading))
  return { live, playing }
}

/** Where in the song it is, and how long it is (seconds). */
export function usePlayerTime() {
  const time = useSyncExternalStore(subscribeTime, () => audio?.currentTime ?? 0)
  const duration = useSyncExternalStore(subscribeTime, () => (audio && Number.isFinite(audio.duration) ? audio.duration : 0))
  return { time, duration }
}
