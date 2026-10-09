/**
 * Kuddes Messenger: live chat between friends, in a pop-up in the corner of
 * every page (like Windows Live Messenger) or full screen at /messenger.
 * Game invites arrive here as a line with the game in it. Personal messages
 * ("berichten") and the forum chat are separate.
 */
import type { UserSummary } from './api'
import type { GameSummary } from './games'
import type { GlitterImage } from './glitters'

export const MESSENGER_LIMITS = {
  /** Characters in one message. */
  text: 1000,
  /** Characters in the personal message under your name. */
  note: 100,
  /** Friends pinned at the top of your contact list. */
  favorites: 12,
  /** Lines per page of history. */
  page: 50,
  /** Seconds between two nudges to the same friend. */
  nudgeSeconds: 15,
  /** A group chat: characters in its name, and people in it (you included). */
  groupName: 40,
  groupSize: 20,
}

/** What happened to an invite (a "game" line): the invited friend plays along or not, or the invite was withdrawn. */
export type GameNews = 'meedoen' | 'geweigerd' | 'ingetrokken'

export type MessengerKind = 'msg' | 'nudge' | 'invite' | 'game'

export type MessengerLine = {
  id: number
  /** Who sent it and to whom (user ids). */
  from: number
  to: number
  kind: MessengerKind
  /** The message; for a "game" line one of GameNews. */
  text: string
  /** Invites and game news: the game, as the reader sees it. */
  game: GameSummary | null
  /** A glitterplaatje sent with the message (or on its own). */
  glitter: GlitterImage | null
  /** Something from the site shared with it (a page address); its preview comes from /api/share for each reader. */
  share: string | null
  createdAt: string
  /** When the reader saw it (only lines to you). */
  readAt: string | null
}

/** A friend in your contact list. */
export type MessengerContact = UserSummary & {
  /** "Online", "Bezig", … or "Offline" (also for who shows as offline). */
  status: string
  note: string
  /** Lines from them you haven't read. */
  unread: number
  /** When you last talked, for "Recente gesprekken". */
  lastLineAt: string | null
  /** They can be called (they allowed it in Instellingen). */
  calls: boolean
}

/** `favorites`: the ids of the friends you pinned, in your order. */
export type MessengerContacts = { note: string; contacts: MessengerContact[]; groups: MessengerGroup[]; favorites: number[] }

export type MessengerConversation = { contact: MessengerContact; lines: MessengerLine[]; hasMore: boolean }

/**
 * A group chat: a few friends in one conversation. In the Messenger store a
 * group's window is keyed `groep:<id>` (usernames can't have a colon).
 */
export type MessengerGroup = {
  id: number
  name: string
  /** Everyone in it, you too, with their status. */
  members: (UserSummary & { status: string })[]
  /** Lines you haven't read. */
  unread: number
  lastLineAt: string | null
  /** You started it: you can also remove people. */
  mine: boolean
}

export type MessengerGroupKind = 'msg' | 'nudge' | 'created' | 'joined' | 'left' | 'removed' | 'renamed'

export type MessengerGroupLine = {
  id: number
  groupId: number
  /** Who wrote it or did it (null: an account that's gone). */
  from: number | null
  /** Their name at the time it's shown, for members who've left since. */
  fromName: string
  kind: MessengerGroupKind
  /** The message; for joined/removed the names, for renamed the new name. */
  text: string
  glitter: GlitterImage | null
  share: string | null
  createdAt: string
}

export type MessengerGroupConversation = { group: MessengerGroup; lines: MessengerGroupLine[]; hasMore: boolean }

/** The window key of a group in the Messenger store, and back. */
export const groupKey = (id: number) => `groep:${id}`
export const groupIdOf = (key: string) => (key.startsWith('groep:') ? Number(key.slice(6)) || null : null)

/** What the stream sends (event name → data). */
export type MessengerEvents = {
  line: MessengerLine
  /** A friend came online, went offline, or changed their status, name, photo or personal message. */
  presence: MessengerContact
  typing: { from: number }
  /** You read up to this line from them (on another tab too). */
  read: { with: number; upTo: number }
  groupLine: MessengerGroupLine
  /** A group you're in was made, changed (name, people), or you were added. */
  group: MessengerGroup
  /** You left a group, or were removed from it. */
  groupGone: { id: number }
  groupTyping: { group: number; from: number }
  groupRead: { group: number; upTo: number }
  /** Something new behind the bell (a knuffel, a mention, a reaction). */
  notify: { unread: number }
  /** A voice call (src/features/messenger/calls.ts): setting it up between the two browsers, and ending it. `id` is the call. */
  call: { from: number; id: string; kind: CallSignal; payload?: unknown }
}

/** What goes back and forth to set up a call: an offer and answer (SDP), network routes (ICE), and the end. */
export const CALL_SIGNALS = ['offer', 'answer', 'ice', 'hangup', 'reject', 'busy'] as const
export type CallSignal = (typeof CALL_SIGNALS)[number]

export const OFFLINE = 'Offline'
