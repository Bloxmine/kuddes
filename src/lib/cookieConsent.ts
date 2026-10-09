/**
 * The cookie choice: Kuddes itself only uses what's needed (the login
 * session, your settings in this browser). Content from other services,
 * which can set their own cookies or see your IP address, only loads after
 * you allow it, per service. Kept in this browser; /cookies changes it, and
 * every embed updates straight away (useConsent).
 */
import { useSyncExternalStore } from 'react'

export const OPTIONAL_SERVICES = {
  youtube: { name: 'YouTube', icon: 'youtube', what: "Video's in berichten, het forum, nieuws en de video- en muziekgadgets (via youtube-nocookie.com, van Google)." },
  somafm: { name: 'SomaFM', icon: 'radio_modern', what: 'De internetradio in de radiogadget: zenderlogo’s en de muziek zelf (SomaFM, Verenigde Staten).' },
} as const

export type OptionalCookie = keyof typeof OPTIONAL_SERVICES
export type CookieConsent = Record<OptionalCookie, boolean>

const KEY = 'kuddes-cookie-consent'
const listeners = new Set<() => void>()
let cached: { raw: string | null; value: CookieConsent | null } | null = null

export function readCookieConsent(): CookieConsent | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // storage blocked: ask again next time
  }
  if (cached?.raw === raw) return cached.value
  let value: CookieConsent | null = null
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<CookieConsent>) : null
    value = parsed ? { youtube: parsed.youtube === true, somafm: parsed.somafm === true } : null
  } catch {
    value = null
  }
  cached = { raw, value }
  return value
}

export function saveCookieConsent(consent: CookieConsent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(consent))
  } catch {
    // storage blocked: it holds for this page only
    cached = { raw: JSON.stringify(consent), value: consent }
  }
  listeners.forEach((l) => l())
}

/** Allow one service (from a blocked embed's button), keeping the rest as it was. */
export function allowService(kind: OptionalCookie) {
  saveCookieConsent({ youtube: false, somafm: false, ...readCookieConsent(), [kind]: true })
}

export function hasOptionalConsent(kind: OptionalCookie) {
  return readCookieConsent()?.[kind] === true
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab changed it
  const onStorage = (e: StorageEvent) => e.key === KEY && listener()
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The whole choice, or null when it hasn't been made yet; updates live. */
export function useCookieConsent(): CookieConsent | null {
  return useSyncExternalStore(subscribe, readCookieConsent, () => null)
}

/** Whether one service may load; updates live. */
export function useConsent(kind: OptionalCookie): boolean {
  return useCookieConsent()?.[kind] === true
}
