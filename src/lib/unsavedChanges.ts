/**
 * Unsaved changes: a form that has them registers itself here
 * (useUnsavedChanges). Leaving the page then asks first: the browser's own
 * question when closing the tab, and our pop-up (UnsavedGuard.tsx) for links
 * inside Kuddes and for code that calls confirmLeave() before moving on.
 */
import { useEffect, useId, useRef, useSyncExternalStore } from 'react'

export type UnsavedEntry = {
  /** What isn't saved, e.g. "je eigen thema". */
  what: string
  /** Saves it; the pop-up then offers "Opslaan en verdergaan". */
  save?: () => Promise<unknown>
}

const entries = new Map<string, UnsavedEntry>()
let asking: { resolve: (leave: boolean) => void } | null = null
const listeners = new Set<() => void>()
let version = 0

function changed() {
  version++
  for (const l of listeners) l()
}

export const hasUnsaved = () => entries.size > 0
export const unsavedEntries = () => [...entries.values()]

/** Keeps track while `dirty`; forgets it when clean or when the form goes away. */
export function useUnsavedChanges(dirty: boolean, entry: UnsavedEntry) {
  const id = useId()
  const latest = useRef(entry)
  useEffect(() => {
    latest.current = entry
  })
  useEffect(() => {
    if (!dirty) return
    entries.set(id, {
      get what() {
        return latest.current.what
      },
      save: latest.current.save ? () => latest.current.save?.() ?? Promise.resolve() : undefined,
    })
    changed()
    return () => {
      entries.delete(id)
      changed()
    }
  }, [dirty, id])
}

/** Ask before going somewhere else; resolves true to go on (saved or not), false to stay. */
export function confirmLeave(): Promise<boolean> {
  if (!hasUnsaved()) return Promise.resolve(true)
  asking?.resolve(false)
  return new Promise((resolve) => {
    asking = { resolve }
    changed()
  })
}

/** The pop-up's answer. */
export function answerLeave(leave: boolean) {
  const a = asking
  asking = null
  changed()
  a?.resolve(leave)
}

/** For the pop-up: whether it's open, and what isn't saved. */
export function useLeaveQuestion() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return { open: !!asking, entries: unsavedEntries() }
}
