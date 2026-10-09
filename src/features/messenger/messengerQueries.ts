import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import {
  groupKey,
  type MessengerContact,
  type MessengerContacts,
  type MessengerConversation,
  type MessengerEvents,
  type MessengerGroup,
  type MessengerGroupConversation,
  type MessengerGroupLine,
  type MessengerLine,
} from '../../../shared/messenger'
import type { Me } from '../../../shared/api'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { showBrowserNotification } from '../../lib/browserNotify'
import { onCallSignal } from './calls'
import { useAuth } from '../../lib/auth'
import { playInviteSound, playMessageSound, playMessengerSound, playNudgeSound } from '../../lib/siteSounds'
import { gameKeys } from '../games/gameQueries'
import { chatArrived, closeChat, setTyping, shake, shakeScreen } from './messengerStore'

export const messengerKeys = {
  all: ['messenger'] as const,
  contacts: ['messenger', 'contacts'] as const,
  chat: (username: string) => ['messenger', 'with', username] as const,
  group: (id: number) => ['messenger', 'groep', id] as const,
}

export const useContacts = (enabled = true) =>
  useQuery({ queryKey: messengerKeys.contacts, queryFn: () => api<MessengerContacts>('/messenger/contacts'), enabled, staleTime: 60_000 })

export const useConversation = (username: string) =>
  useQuery({ queryKey: messengerKeys.chat(username), queryFn: () => api<MessengerConversation>(`/messenger/with/${encodeURIComponent(username)}`), staleTime: Infinity })

export const useGroupConversation = (id: number) =>
  useQuery({ queryKey: messengerKeys.group(id), queryFn: () => api<MessengerGroupConversation>(`/messenger/groups/${id}`), staleTime: Infinity, retry: false })

function addToGroup(queryClient: QueryClient, line: MessengerGroupLine) {
  queryClient.setQueryData<MessengerGroupConversation>(messengerKeys.group(line.groupId), (c) => (c && !c.lines.some((l) => l.id === line.id) ? { ...c, lines: [...c.lines, line] } : c))
}

function patchGroup(queryClient: QueryClient, id: number, patch: (g: MessengerGroup) => MessengerGroup) {
  queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, groups: d.groups.map((g) => (g.id === id ? patch(g) : g)) } : d))
}

/** A group as it is now: in the list (added if it's new) and in its open conversation. */
function putGroup(queryClient: QueryClient, group: MessengerGroup) {
  queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) =>
    d ? { ...d, groups: d.groups.some((g) => g.id === group.id) ? d.groups.map((g) => (g.id === group.id ? group : g)) : [group, ...d.groups] } : d,
  )
  queryClient.setQueryData<MessengerGroupConversation>(messengerKeys.group(group.id), (c) => (c ? { ...c, group } : c))
}

function dropGroup(queryClient: QueryClient, id: number) {
  queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, groups: d.groups.filter((g) => g.id !== id) } : d))
  queryClient.removeQueries({ queryKey: messengerKeys.group(id) })
  closeChat(groupKey(id))
}

export function useSendGroupLine(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { text: string; glitterId?: number | null; share?: string | null } | { nudge: true }) =>
      'nudge' in body ? api<MessengerGroupLine>(`/messenger/groups/${id}/nudge`, { method: 'POST' }) : api<MessengerGroupLine>(`/messenger/groups/${id}`, { method: 'POST', body }),
    onSuccess: (line) => {
      addToGroup(queryClient, line)
      patchGroup(queryClient, id, (g) => ({ ...g, lastLineAt: line.createdAt }))
      if (line.kind === 'nudge') {
        shakeScreen()
        playNudgeSound()
      }
    },
  })
}

/** Start a group, rename it, add people, remove someone or leave. */
export function useGroupActions() {
  const queryClient = useQueryClient()
  const create = useMutation({
    mutationFn: (body: { name: string; usernames: string[] }) => api<MessengerGroup>('/messenger/groups', { method: 'POST', body }),
    onSuccess: (group) => putGroup(queryClient, group),
  })
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api<MessengerGroup>(`/messenger/groups/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: (group) => putGroup(queryClient, group),
  })
  const add = useMutation({
    mutationFn: ({ id, usernames }: { id: number; usernames: string[] }) => api<MessengerGroup>(`/messenger/groups/${id}/members`, { method: 'POST', body: { usernames } }),
    onSuccess: (group) => putGroup(queryClient, group),
  })
  const remove = useMutation({
    mutationFn: ({ id, username }: { id: number; username: string }) => api<void>(`/messenger/groups/${id}/members/${encodeURIComponent(username)}`, { method: 'DELETE' }),
    onSuccess: (_, { id, username }) => {
      if (username === '@me') dropGroup(queryClient, id)
      else void queryClient.invalidateQueries({ queryKey: messengerKeys.group(id) })
    },
  })
  return { create, rename, add, remove }
}

export async function loadOlderGroup(queryClient: QueryClient, id: number) {
  const current = queryClient.getQueryData<MessengerGroupConversation>(messengerKeys.group(id))
  if (!current?.lines.length) return
  const older = await api<MessengerGroupConversation>(`/messenger/groups/${id}?voor=${current.lines[0].id}`)
  queryClient.setQueryData<MessengerGroupConversation>(messengerKeys.group(id), (c) =>
    c ? { ...c, hasMore: older.hasMore, lines: [...older.lines.filter((l) => !c.lines.some((x) => x.id === l.id)), ...c.lines] } : c,
  )
}

export function markGroupRead(queryClient: QueryClient, id: number, upTo: number) {
  patchGroup(queryClient, id, (g) => ({ ...g, unread: 0 }))
  return api<void>(`/messenger/groups/${id}/read`, { method: 'POST', body: { upTo } }).catch(() => undefined)
}

/** Adds a line to a cached conversation (once). */
function addToChat(queryClient: QueryClient, username: string, line: MessengerLine) {
  queryClient.setQueryData<MessengerConversation>(messengerKeys.chat(username), (c) => (c && !c.lines.some((l) => l.id === line.id) ? { ...c, lines: [...c.lines, line] } : c))
}

function patchContact(queryClient: QueryClient, id: number, patch: (c: MessengerContact) => MessengerContact) {
  queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, contacts: d.contacts.map((c) => (c.id === id ? patch(c) : c)) } : d))
}

export function useSendLine(username: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { text: string; glitterId?: number | null; share?: string | null } | { nudge: true }) =>
      'nudge' in body
        ? api<MessengerLine>(`/messenger/with/${encodeURIComponent(username)}/nudge`, { method: 'POST' })
        : api<MessengerLine>(`/messenger/with/${encodeURIComponent(username)}`, { method: 'POST', body }),
    // The stream brings it too; whichever comes first
    onSuccess: (line) => {
      addToChat(queryClient, username, line)
      patchContact(queryClient, line.to, (c) => ({ ...c, lastLineAt: line.createdAt }))
      // Your own nudge shakes your screen too, with the sound
      if (line.kind === 'nudge') {
        shakeScreen()
        playNudgeSound()
      }
    },
  })
}

/** Older lines, above the ones shown. */
export async function loadOlder(queryClient: QueryClient, username: string) {
  const current = queryClient.getQueryData<MessengerConversation>(messengerKeys.chat(username))
  if (!current?.lines.length) return
  const older = await api<MessengerConversation>(`/messenger/with/${encodeURIComponent(username)}?voor=${current.lines[0].id}`)
  queryClient.setQueryData<MessengerConversation>(messengerKeys.chat(username), (c) =>
    c ? { ...c, hasMore: older.hasMore, lines: [...older.lines.filter((l) => !c.lines.some((x) => x.id === l.id)), ...c.lines] } : c,
  )
}

/** What a line says, in a pop-up: the text, or what came with it. */
function lineSummary(line: { kind: string; text: string; glitter: unknown; share: string | null }) {
  if (line.kind === 'nudge') return 'stuurt je een nudge!'
  if (line.kind === 'invite') return 'nodigt je uit voor een spel'
  if (line.kind === 'game') return 'Er is nieuws in je spel'
  if (line.text) return line.text.length > 120 ? `${line.text.slice(0, 117)}…` : line.text
  if (line.glitter) return 'stuurt een glitterplaatje'
  if (line.share) return 'deelt iets van Kuddes'
  return 'stuurt een bericht'
}

export function markRead(queryClient: QueryClient, username: string, contactId: number, upTo: number) {
  patchContact(queryClient, contactId, (c) => ({ ...c, unread: 0 }))
  return api<void>(`/messenger/with/${encodeURIComponent(username)}/read`, { method: 'POST', body: { upTo } }).catch(() => undefined)
}

/**
 * The live connection: one EventSource per tab while you're logged in. New
 * lines go into the conversations and open a window, presence updates the
 * contact list, and a nudge shakes the window.
 */
export function useMessengerConnection() {
  const { user, waiting } = useAuth()
  const queryClient = useQueryClient()
  // On the waitlist there's no Messenger yet
  const me = user && !waiting ? user.id : null

  useEffect(() => {
    if (me === null) return
    const connect = () => {
      const source = new EventSource('/api/messenger/stream')
      const on = <E extends keyof MessengerEvents>(event: E, handle: (data: MessengerEvents[E]) => void | Promise<void>) =>
        source.addEventListener(event, (e) => {
          try {
            void handle(JSON.parse((e as MessageEvent<string>).data) as MessengerEvents[E])
          } catch {
            // a broken event: skip it
          }
        })

      /** A pop-up from the browser while Kuddes is in the background (a chat window opens anyway). */
      const popUp = (from: number, kind: 'notifyMessenger' | 'notifyGames', body: string, tag: string) => {
        const contact = queryClient.getQueryData<MessengerContacts>(messengerKeys.contacts)?.contacts.find((c) => c.id === from)
        void showBrowserNotification(kind, { title: contact?.nickname ?? 'Kuddes Messenger', body, url: location.pathname + location.search, tag, icon: contact?.avatarUrl })
      }

      const usernameOf = async (id: number) => {
        const find = () => queryClient.getQueryData<MessengerContacts>(messengerKeys.contacts)?.contacts.find((c) => c.id === id)
        // A new friend isn't in the list yet
        return (find() ?? (await queryClient.fetchQuery({ queryKey: messengerKeys.contacts, queryFn: () => api<MessengerContacts>('/messenger/contacts') }), find()))?.username ?? null
      }

      // (Re)connected: catch up on what came in while the line was down
      source.addEventListener('hello', () => void queryClient.invalidateQueries({ queryKey: messengerKeys.all }))

      on('line', async (line) => {
        const theirs = line.from !== me
        const other = theirs ? line.from : line.to
        const username = await usernameOf(other)
        if (!username) return
        addToChat(queryClient, username, line)
        patchContact(queryClient, other, (c) => ({ ...c, lastLineAt: line.createdAt, unread: theirs ? c.unread + 1 : c.unread }))
        if (line.game) {
          // The invite further up shows how it went now
          queryClient.setQueriesData<MessengerConversation>({ queryKey: ['messenger', 'with'] }, (c) =>
            c ? { ...c, lines: c.lines.map((l) => (l.game?.id === line.game!.id ? { ...l, game: line.game } : l)) } : c,
          )
          void queryClient.invalidateQueries({ queryKey: gameKeys.all })
        }
        window.dispatchEvent(new CustomEvent('kuddes:messenger-line', { detail: line }))
        if (!theirs) return

        setTyping(line.from, 0)
        // While playing a game (or for news about one), no window over the table: a flashing button
        const inGame = location.pathname.startsWith('/spellen/') || location.pathname.startsWith('/graffiti')
        chatArrived(username, line.kind === 'game' || inGame)
        if (line.kind === 'nudge') {
          shake(username)
          shakeScreen()
          playNudgeSound()
        } else if (line.kind === 'invite') playInviteSound()
        else if (line.kind === 'game') playMessageSound()
        else playMessengerSound()
        popUp(other, line.kind === 'invite' || line.kind === 'game' ? 'notifyGames' : 'notifyMessenger', lineSummary(line), `chat-${username}`)
      })

      on('groupLine', (line) => {
        addToGroup(queryClient, line)
        const theirs = line.from !== me
        patchGroup(queryClient, line.groupId, (g) => ({ ...g, lastLineAt: line.createdAt, unread: theirs ? g.unread + 1 : g.unread }))
        // A new name or new people: the group itself is announced separately
        if (!theirs) return
        if (line.from) setTyping(`g${line.groupId}:${line.from}`, 0)
        const key = groupKey(line.groupId)
        const inGame = location.pathname.startsWith('/spellen/') || location.pathname.startsWith('/graffiti')
        chatArrived(key, inGame || line.kind !== 'msg')
        if (line.kind === 'nudge') {
          shake(key)
          shakeScreen()
          playNudgeSound()
        } else if (line.kind === 'msg') playMessengerSound()
        if (line.kind === 'msg' || line.kind === 'nudge') {
          const group = queryClient.getQueryData<MessengerContacts>(messengerKeys.contacts)?.groups.find((g) => g.id === line.groupId)
          const body = line.kind === 'nudge' ? 'stuurt een nudge!' : lineSummary(line)
          void showBrowserNotification('notifyMessenger', { title: group?.name ?? 'Groepsgesprek', body: `${line.fromName}: ${body}`, url: location.pathname + location.search, tag: `groep-${line.groupId}` })
        }
      })

      // Something new behind the bell (or it was opened in another tab)
      on('notify', ({ unread }) => {
        queryClient.setQueryData<Me | null>(keys.me, (m) => (m ? { ...m, unreadNotifications: unread } : m))
        if (unread) void queryClient.invalidateQueries({ queryKey: keys.notifications })
      })

      // A voice call (calls.ts): who it is, from your friends
      on('call', (data) =>
        onCallSignal(data, async (id) => {
          const find = () => queryClient.getQueryData<MessengerContacts>(messengerKeys.contacts)?.contacts.find((c) => c.id === id)
          return find() ?? (await queryClient.fetchQuery({ queryKey: messengerKeys.contacts, queryFn: () => api<MessengerContacts>('/messenger/contacts') }), find()) ?? null
        }),
      )

      on('group', (group) => putGroup(queryClient, group))
      on('groupGone', ({ id }) => dropGroup(queryClient, id))
      on('groupTyping', ({ group, from }) => setTyping(`g${group}:${from}`, Date.now() + 5000))
      on('groupRead', ({ group }) => patchGroup(queryClient, group, (g) => ({ ...g, unread: 0 })))

      on('presence', (contact) => {
        patchContact(queryClient, contact.id, (c) => ({ ...contact, unread: c.unread, lastLineAt: c.lastLineAt }))
        // The same friend in a group you're both in
        const asMember = (m: MessengerGroup['members'][number]) => (m.id === contact.id ? { ...m, online: contact.online, status: contact.status, nickname: contact.nickname, avatarUrl: contact.avatarUrl } : m)
        queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, groups: d.groups.map((g) => ({ ...g, members: g.members.map(asMember) })) } : d))
        queryClient.setQueriesData<MessengerGroupConversation>({ queryKey: ['messenger', 'groep'] }, (c) => (c ? { ...c, group: { ...c.group, members: c.group.members.map(asMember) } } : c))
        queryClient.setQueryData<MessengerConversation>(messengerKeys.chat(contact.username), (c) => (c ? { ...c, contact: { ...contact, unread: c.contact.unread, lastLineAt: c.contact.lastLineAt } } : c))
      })

      on('typing', ({ from }) => setTyping(from, Date.now() + 5000))

      on('read', async ({ with: other, upTo }) => {
        patchContact(queryClient, other, (c) => ({ ...c, unread: 0 }))
        const username = await usernameOf(other)
        if (!username) return
        const now = new Date().toISOString()
        queryClient.setQueryData<MessengerConversation>(messengerKeys.chat(username), (c) =>
          c ? { ...c, lines: c.lines.map((l) => (l.from === other && l.id <= upTo && !l.readAt ? { ...l, readAt: now } : l)) } : c,
        )
      })
      return source
    }
    let source = connect()
    // A page going into the back/forward cache keeps its connection otherwise; browsers only
    // allow six per site, so after a few reloads nothing would load any more
    const hide = () => source.close()
    const show = (e: PageTransitionEvent) => {
      if (e.persisted) source = connect()
    }
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', show)
    return () => {
      source.close()
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', show)
    }
  }, [me, queryClient])
}

/** An open conversation's window: with a friend (keyed by username) or a group (`groep:<id>`). */
export type ChatTarget = { key: string; kind: 'friend'; contact: MessengerContact } | { key: string; kind: 'group'; group: MessengerGroup }

/** Everything a window can be, by its key. */
export function useChatTargets(): Map<string, ChatTarget> {
  const { data } = useContacts()
  return useMemo(() => {
    const map = new Map<string, ChatTarget>()
    for (const contact of data?.contacts ?? []) map.set(contact.username, { key: contact.username, kind: 'friend', contact })
    for (const group of data?.groups ?? []) map.set(groupKey(group.id), { key: groupKey(group.id), kind: 'group', group })
    return map
  }, [data])
}

export const chatName = (t: ChatTarget) => (t.kind === 'friend' ? t.contact.nickname : t.group.name)
export const chatUnread = (t: ChatTarget) => (t.kind === 'friend' ? t.contact.unread : t.group.unread)
