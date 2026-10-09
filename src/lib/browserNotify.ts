/**
 * Pop-ups from the browser ("browsermeldingen") while Kuddes is in the
 * background: only once the browser allows them, and only for the kinds
 * switched on in Instellingen (shared/customization.ts, BROWSER_NOTIFY_KINDS).
 * Through the service worker when there is one (needed on Android), so a
 * click opens the right page; otherwise a plain Notification.
 */
import type { BrowserNotifyKind, Preferences } from '../../shared/customization'

let prefs: Pick<Preferences, 'notifyBrowser' | BrowserNotifyKind> | null = null
let navigate: ((to: string) => void) | null = null

/** Kept up to date by useBrowserNotifications. */
export function setNotifyContext(next: { prefs: Preferences; navigate: (to: string) => void }) {
  prefs = next.prefs
  navigate = next.navigate
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

/** While you're looking at the site there's no pop-up: the bell, Messenger and sounds already show it. */
const inBackground = () => document.visibilityState === 'hidden' || !document.hasFocus()

export async function showBrowserNotification(
  kind: BrowserNotifyKind,
  n: { title: string; body?: string; url: string; tag?: string; icon?: string | null; force?: boolean },
) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (!n.force && (!prefs?.notifyBrowser || !prefs[kind] || !inBackground())) return
  const options: NotificationOptions = {
    body: n.body,
    // A member's photo when there is one, else the Kuddes icon
    icon: n.icon || '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    // The same tag replaces the previous one (e.g. one per chat)
    tag: n.tag,
    data: { url: n.url },
  }
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration?.active) {
      await registration.showNotification(n.title, options)
      return
    }
  } catch {
    // no service worker: a plain one
  }
  const note = new Notification(n.title, options)
  note.onclick = () => {
    window.focus()
    navigate?.(n.url)
    note.close()
  }
}
