import { useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Me } from '../../shared/api'
import { DEFAULT_PREFERENCES, TEXT_SIZES, type Preferences } from '../../shared/customization'
import { api } from './api'
import { useAuth } from './auth'
import { setTimeFormat } from './time'

const STORAGE_KEY = 'kuddes.display'

/** The member's preferences (the defaults when logged out) and a way to change them. */
export function usePreferences() {
  const { user, setUser } = useAuth()
  const prefs = user?.preferences ?? DEFAULT_PREFERENCES
  const save = useMutation({
    mutationFn: (changes: Partial<Preferences>) => api<Me>('/me', { method: 'PATCH', body: { preferences: changes } }),
    onSuccess: setUser,
  })
  return { prefs, save, setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => save.mutate({ [key]: value }) }
}

/** Display settings as attributes on <html>; index.html restores them before the first paint. */
function applyDisplay(prefs: Preferences) {
  const html = document.documentElement
  const zoom = TEXT_SIZES[prefs.textSize]
  if (zoom === 1) html.style.removeProperty('--zoom')
  else html.style.setProperty('--zoom', String(zoom))
  html.toggleAttribute('data-compact', prefs.compact)
  html.toggleAttribute('data-reduce-motion', prefs.reduceMotion)
  setTimeFormat(prefs.timeFormat)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ zoom, compact: prefs.compact, reduceMotion: prefs.reduceMotion }))
  } catch {
    // only the pre-paint restore is lost
  }
}

/**
 * Applies the display preferences and the Ctrl+Enter shortcut. Used once, in
 * the page layout.
 */
export function useApplyPreferences() {
  const { prefs } = usePreferences()
  useEffect(() => applyDisplay(prefs), [prefs])

  useEffect(() => {
    if (!prefs.sendShortcut) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.defaultPrevented) return
      const target = e.target as HTMLElement
      const form = target.closest('form')
      if (target.tagName !== 'TEXTAREA' || !form) return
      e.preventDefault()
      form.requestSubmit()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [prefs.sendShortcut])
}

/** Where to go after logging in, when no page asked for it. */
export function startPath(user: Me): string {
  switch (user.preferences.startPage) {
    case 'tijdlijn':
      return '/tijdlijn'
    case 'profiel':
      return `/profiel/${user.username}`
    default:
      return '/'
  }
}
