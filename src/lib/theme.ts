import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Me } from '../../shared/api'
import type { BackgroundEffect } from '../../shared/backgroundEffects'
import { CUSTOM_THEME_KEY, customThemeVars, type CustomTheme } from '../../shared/customization'
import { DEFAULT_THEME, isTheme, type ThemeKey } from '../../shared/themes'
import { api } from './api'
import { useAuth } from './auth'

const STORAGE_KEY = 'kuddes.theme'
const VARS_KEY = 'kuddes.themeVars'

/** A built-in theme, or "eigen": the member's own colours. */
export type ThemeChoice = ThemeKey | typeof CUSTOM_THEME_KEY

function readStored(): ThemeKey | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

let appliedVars: string[] = []

// The moving background of the own theme (shown by SiteEffect), kept here so
// the theme editor's preview and the saved theme go through the same place
let siteEffect: BackgroundEffect | null = null
const siteEffectListeners = new Set<() => void>()
const setSiteEffect = (next: BackgroundEffect | null) => {
  if (JSON.stringify(next) === JSON.stringify(siteEffect)) return
  siteEffect = next
  siteEffectListeners.forEach((l) => l())
}
export const subscribeSiteEffect = (listener: () => void) => {
  siteEffectListeners.add(listener)
  return () => void siteEffectListeners.delete(listener)
}
export const getSiteEffect = () => siteEffect

/** Sets the custom theme's colours on <html> (or removes them with null). */
export function applyCustomVars(theme: CustomTheme | null) {
  const style = document.documentElement.style
  appliedVars.forEach((name) => style.removeProperty(name))
  appliedVars = []
  // A photo behind the page: text that stands on it gets a see-through label (global.css)
  if (theme?.image) document.documentElement.dataset.pageImage = ''
  else delete document.documentElement.dataset.pageImage
  setSiteEffect(theme?.effect ?? null)
  if (!theme) return
  for (const [name, value] of Object.entries(customThemeVars(theme))) {
    style.setProperty(name, value)
    appliedVars.push(name)
  }
}

/** Shows a theme on the page (also used to undo a preview). */
export function applyTheme(theme: ThemeChoice, custom: CustomTheme | null) {
  const isCustom = theme === CUSTOM_THEME_KEY && !!custom
  const key = isCustom ? CUSTOM_THEME_KEY : theme === CUSTOM_THEME_KEY ? DEFAULT_THEME : theme
  if (key === DEFAULT_THEME) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = key
  applyCustomVars(isCustom ? custom : null)
  try {
    localStorage.setItem(STORAGE_KEY, key)
    if (isCustom) localStorage.setItem(VARS_KEY, JSON.stringify(customThemeVars(custom)))
    else localStorage.removeItem(VARS_KEY)
  } catch {
    // not remembered for the next visit; the account setting still is
  }
}

/**
 * The active colour theme. Logged-in members keep it on their account (so it
 * follows them to other devices); visitors keep it in this browser. index.html
 * applies the stored theme before the first paint.
 */
export function useTheme() {
  const { user, setUser } = useAuth()
  const [guestTheme, setGuestTheme] = useState<ThemeKey>(() => readStored() ?? DEFAULT_THEME)
  // A member who never picked one keeps what they chose as a visitor
  const theme: ThemeChoice =
    user && (isTheme(user.theme) || (user.theme === CUSTOM_THEME_KEY && user.customTheme)) ? (user.theme as ThemeChoice) : guestTheme
  const custom = user?.customTheme ?? null
  const customKey = custom ? JSON.stringify(custom) : ''

  // eslint-disable-next-line react-hooks/exhaustive-deps -- customKey stands in for custom
  useEffect(() => applyTheme(theme, custom), [theme, customKey])

  const save = useMutation({
    mutationFn: (changes: { theme: ThemeChoice; customTheme?: CustomTheme }) =>
      api<Me>('/me', { method: 'PATCH', body: changes }),
    onSuccess: setUser,
  })

  const setTheme = (next: ThemeChoice) => {
    if (next === CUSTOM_THEME_KEY && !custom) return
    applyTheme(next, custom)
    if (next !== CUSTOM_THEME_KEY) setGuestTheme(next)
    if (user) save.mutate({ theme: next })
  }

  /** Save your own colours and switch to them. */
  const saveCustom = (colors: CustomTheme) => save.mutateAsync({ theme: CUSTOM_THEME_KEY, customTheme: colors })

  return { theme, setTheme, custom, saveCustom, saving: save.isPending, error: save.error }
}
