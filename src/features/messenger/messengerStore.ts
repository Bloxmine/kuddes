/**
 * What Kuddes Messenger shows where: whether the contact list is open, which
 * conversations are open (and which are minimised), who's typing and which
 * window should shake. A tiny store (useSyncExternalStore), kept for the
 * session so a reload or a new page keeps your conversations open.
 */
import { useSyncExternalStore } from 'react'

export type ChatWindow = { username: string; minimized: boolean }

type State = {
  /** The contact list pop-up is open (otherwise it's the button). */
  listOpen: boolean
  windows: ChatWindow[]
  /** The conversation you look at on /messenger. */
  active: string | null
  /** Who's typing until when (ms): a friend's user id, or `g<group>:<user id>` in a group. */
  typing: Record<string, number>
  /** username → when a nudge last came in (the window shakes). */
  shakes: Record<string, number>
  /** username → a new line came in while the window was minimised (its button flashes). */
  flashing: Record<string, boolean>
}

const SAVED = 'kuddes.messenger'

function load(): State {
  const empty: State = { listOpen: false, windows: [], active: null, typing: {}, shakes: {}, flashing: {} }
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVED) ?? 'null') as Partial<State> | null
    const listOpen = localStorage.getItem(`${SAVED}.open`) === '1'
    return { ...empty, listOpen, windows: Array.isArray(saved?.windows) ? saved.windows.slice(0, 8) : [], active: saved?.active ?? null }
  } catch {
    return empty
  }
}

let state: State = typeof window === 'undefined' ? { listOpen: false, windows: [], active: null, typing: {}, shakes: {}, flashing: {} } : load()
const listeners = new Set<() => void>()

function set(patch: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  try {
    sessionStorage.setItem(SAVED, JSON.stringify({ windows: state.windows, active: state.active }))
    localStorage.setItem(`${SAVED}.open`, state.listOpen ? '1' : '0')
  } catch {
    // Not kept then: only for this page
  }
  listeners.forEach((l) => l())
}

export function useMessengerState<T>(pick: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pick(state),
    () => pick(state),
  )
}

export const messengerState = () => state

/** Opens (or brings back) the conversation with a friend. */
export function openChat(username: string, { focus = true }: { focus?: boolean } = {}) {
  set((s) => {
    const others = s.windows.filter((w) => w.username !== username)
    const existing = s.windows.find((w) => w.username === username)
    // Newest first; a window that was already there stays where it is unless you open it yourself
    const windows = existing && !focus ? s.windows : [{ username, minimized: false }, ...others]
    return { windows, active: focus || !s.active ? username : s.active, flashing: focus ? { ...s.flashing, [username]: false } : s.flashing }
  })
  if (focus) window.dispatchEvent(new CustomEvent('kuddes:messenger-focus', { detail: username }))
}

/**
 * A new line came in: open the window without taking over (WLM opens it,
 * flashing). `quietly`: only a flashing button in the bar, not an open window
 * (game news, and anything while you're playing a game: it would cover the table).
 */
export function chatArrived(username: string, quietly = false) {
  set((s) => {
    const existing = s.windows.find((w) => w.username === username)
    if (existing) return existing.minimized ? { flashing: { ...s.flashing, [username]: true } } : {}
    if (quietly) return { windows: [...s.windows, { username, minimized: true }], flashing: { ...s.flashing, [username]: true } }
    return { windows: [...s.windows, { username, minimized: false }], active: s.active ?? username }
  })
}

export const closeChat = (username: string) =>
  set((s) => {
    const windows = s.windows.filter((w) => w.username !== username)
    return { windows, active: s.active === username ? (windows[0]?.username ?? null) : s.active }
  })

export const minimizeChat = (username: string, minimized = true) =>
  set((s) => ({ windows: s.windows.map((w) => (w.username === username ? { ...w, minimized } : w)), flashing: minimized ? s.flashing : { ...s.flashing, [username]: false } }))

export const setActive = (username: string) => set((s) => ({ active: username, flashing: { ...s.flashing, [username]: false } }))

export const setListOpen = (listOpen: boolean) => set({ listOpen })

export const setTyping = (key: string | number, until: number) => set((s) => ({ typing: { ...s.typing, [String(key)]: until } }))

export const shake = (username: string) => set((s) => ({ shakes: { ...s.shakes, [username]: Date.now() } }))

/**
 * A nudge shakes the whole screen, like on MSN (and phones vibrate), for the
 * one who sends it and the one who gets it. Not with "less motion" on.
 */
export function shakeScreen() {
  const root = document.documentElement
  if (navigator.vibrate) navigator.vibrate([90, 40, 90, 40, 140])
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || root.hasAttribute('data-reduce-motion')) return
  root.classList.remove('kuddes-nudge')
  void root.offsetWidth
  root.classList.add('kuddes-nudge')
  window.setTimeout(() => root.classList.remove('kuddes-nudge'), 700)
}
