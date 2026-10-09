import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Me, Notification, NotificationList } from '../../shared/api'
import type { BrowserNotifyKind } from '../../shared/customization'
import type { MessengerContacts } from '../../shared/messenger'
import { messengerKeys } from '../features/messenger/messengerQueries'
import { api } from './api'
import { setNotifyContext, showBrowserNotification } from './browserNotify'
import { usePreferences } from './preferences'
import { keys, useMessageCounts } from './queries'
import { setTabCount } from './tabBadge'

const KIND_PREF: Record<Notification['kind'], BrowserNotifyKind> = { knuffel: 'notifyKnuffels', mention: 'notifyMentions', reactie: 'notifyReactions', radio: 'notifyRadio', forum: 'notifyForum', kudde: 'notifyReactions', suggestie: 'notifyReactions', volger: 'notifyRequests' }

/** Calls `onMore(now, before)` when `value` goes up (not for what was already there when the page opened). */
function useIncrease(value: number | undefined, onMore: (now: number, before: number) => void) {
  const prev = useRef<number | undefined>(undefined)
  const more = useRef(onMore)
  useEffect(() => {
    more.current = onMore
  })
  useEffect(() => {
    if (value === undefined) return
    const was = prev.current
    prev.current = value
    if (was !== undefined && value > was) more.current(value, was)
  }, [value])
}

/**
 * What's new, in the tab (a count in the title, a dot on the icon) and as a
 * pop-up from the browser while Kuddes is in the background: personal
 * messages, requests and the bell. Messenger, calls and achievements pop up
 * where they arrive (messengerQueries.ts, useNotificationSounds.ts).
 * Mounted once, in the layout.
 */
export function useBrowserNotifications(user: Me | null) {
  const navigate = useNavigate()
  const { prefs } = usePreferences()
  const member = !!user?.emailVerified
  useEffect(() => setNotifyContext({ prefs, navigate }), [prefs, navigate])

  // A pop-up clicked while this tab was open: the service worker asks us to go there
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const onMessage = (e: MessageEvent<{ kuddes?: string; url?: string }>) => {
      if (e.data?.kuddes !== 'navigate' || !e.data.url) return
      const to = new URL(e.data.url, location.origin)
      if (to.origin === location.origin) navigate(to.pathname + to.search + to.hash)
    }
    sw.addEventListener('message', onMessage)
    return () => sw.removeEventListener('message', onMessage)
  }, [navigate])

  const { data: counts } = useMessageCounts(member)
  const { data: bell } = useQuery({ queryKey: keys.notifications, queryFn: () => api<NotificationList>('/notifications'), enabled: member })
  // Read from the cache Messenger keeps up to date (it fetches it itself)
  const { data: messenger } = useQuery({ queryKey: messengerKeys.contacts, queryFn: () => api<MessengerContacts>('/messenger/contacts'), enabled: member, staleTime: Infinity })

  const requests = user ? user.pendingFriendRequests + user.pendingRelationRequests : 0
  const chats = (messenger?.contacts.filter((c) => c.unread > 0).length ?? 0) + (messenger?.groups.filter((g) => g.unread > 0).length ?? 0)
  const total = member ? (counts?.unread ?? 0) + requests + (user?.unreadNotifications ?? 0) + chats : 0

  useEffect(() => setTabCount(total, { title: prefs.tabCount, icon: prefs.tabIcon }), [total, prefs.tabCount, prefs.tabIcon])

  useIncrease(member ? counts?.unread : undefined, (now) =>
    void showBrowserNotification('notifyMessages', {
      title: 'Nieuw bericht op Kuddes',
      body: now === 1 ? 'Je hebt een ongelezen bericht.' : `Je hebt ${now} ongelezen berichten.`,
      url: '/berichten',
      tag: 'berichten',
    }),
  )

  useIncrease(member ? requests : undefined, () =>
    void showBrowserNotification('notifyRequests', { title: 'Nieuw verzoek op Kuddes', body: 'Iemand wil je vriend worden of een relatie met je op zijn profiel zetten.', url: '/vrienden', tag: 'verzoeken' }),
  )

  // The bell: each new one on its own
  const seen = useRef<number | null>(null)
  useEffect(() => {
    if (!bell) return
    const newest = bell.items[0]?.id ?? 0
    if (seen.current === null) {
      seen.current = newest
      return
    }
    const fresh = bell.items.filter((n) => n.id > seen.current! && !n.read)
    seen.current = Math.max(seen.current, newest)
    for (const n of fresh.slice(0, 3).reverse()) {
      void showBrowserNotification(KIND_PREF[n.kind], { title: `${n.actor.nickname} ${n.message}`, body: n.snippet, url: n.link, tag: `melding-${n.id}`, icon: n.actor.avatarUrl })
    }
  }, [bell])

  // Logged out: the tab is plain again
  useEffect(() => {
    if (!member) setTabCount(0, { title: false, icon: false })
  }, [member])
}
