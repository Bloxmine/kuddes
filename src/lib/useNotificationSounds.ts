import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Me } from '../../shared/api'
import { useLive } from '../features/games/gameQueries'
import { ACHIEVEMENTS, isAchievementKey } from '../../shared/achievements'
import { api } from './api'
import { showBrowserNotification } from './browserNotify'
import { useAuth } from './auth'
import { keys, useMessageCounts } from './queries'
import { usePreferences } from './preferences'
import { playAchievementSound, playMessageSound, playRequestSound, setSiteSounds } from './siteSounds'

/** Calls `onMore` when `value` goes up while you're here (not for what was already there when the page opened). */
function useIncrease(value: number | undefined, owner: string | null, onMore: () => void) {
  const prev = useRef<{ owner: string | null; value: number } | null>(null)
  useEffect(() => {
    if (value === undefined) return
    const was = prev.current
    prev.current = { owner, value }
    if (was && was.owner === owner && value > was.value) onMore()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the number changes
  }, [value, owner])
}

/**
 * Plays the notification sounds (src/lib/siteSounds.ts) when something new
 * comes in: a personal message, a friend or relation request, an
 * achievement. Kuddes Messenger plays its own (messages, nudges, invites to a
 * game or the Graffitimuur). Mounted once, in the layout.
 */
export function useNotificationSounds() {
  const { user: me, waiting } = useAuth()
  // On the waitlist there are no messages, requests or games to hear about
  const user = waiting ? null : me
  const { prefs } = usePreferences()
  const owner = user?.username ?? null
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')

  useEffect(() => setSiteSounds({ notifications: prefs.notificationSounds, chat: prefs.chatSounds }), [prefs.notificationSounds, prefs.chatSounds])

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // The same queries as the envelope, the bell and the game pop-ups (shared cache); the
  // member is fetched now and then too, so new requests show up without a reload
  const { data: counts } = useMessageCounts(!!user)
  // (also on the waitlist: that's how being approved shows up without a reload)
  useQuery({ queryKey: keys.me, queryFn: () => api<Me | null>('/auth/me'), enabled: !!me, refetchInterval: 30_000, refetchIntervalInBackground: false })
  const { data: live } = useLive(!!user && visible)

  useIncrease(counts?.unread, owner, playMessageSound)
  useIncrease(user ? user.pendingFriendRequests + user.pendingRelationRequests : undefined, owner, playRequestSound)
  // A knuffel, a mention or a reaction (the bell)
  useIncrease(user?.unreadNotifications, owner, playRequestSound)

  // Achievements are handed out once, so each one that arrives is new
  const heardAchievements = useRef(new Set<string>())
  useEffect(() => {
    const fresh = (live?.achievements ?? []).filter((k) => !heardAchievements.current.has(k))
    if (!fresh.length) return
    fresh.forEach((k) => heardAchievements.current.add(k))
    playAchievementSound()
    for (const k of fresh.filter(isAchievementKey)) {
      void showBrowserNotification('notifyAchievements', { title: `Prestatie verdiend: ${ACHIEVEMENTS[k].name}`, body: ACHIEVEMENTS[k].description, url: `/prestaties/${owner}`, tag: `prestatie-${k}` })
    }
  }, [live, owner])
}
