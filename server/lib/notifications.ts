/**
 * Notifications behind the bell in the top bar: a knuffel on your profile,
 * someone mentioning you with @gebruikersnaam, a reaction on what you posted.
 * Friend and relation requests are counted on their own (toMe). A new one
 * lights up the bell right away over the Messenger stream.
 */
import { and, count, eq, inArray, isNull, like, lt, or, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { notifications, users } from '../db/schema'
import { send } from './messenger'
import { acceptedFriendsOf } from './users'

type Kind = (typeof notifications.$inferInsert)['kind']

/** How long they're kept. */
const KEEP_DAYS = 60
/** At most this many people notified from one text. */
const MAX_MENTIONS = 10

/** "@sanne" and "@piet_88" in a text; not e-mail addresses (piet@example.org). Forum quotes don't count. */
export function mentionedIn(text: string): string[] {
  const own = text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('>'))
    .join('\n')
  const names = [...own.matchAll(/(?<![\p{L}\p{N}_.@-])@([a-z0-9][a-z0-9_.-]{1,19})/giu)].map((m) => m[1].toLowerCase().replace(/[.-]+$/, ''))
  return [...new Set(names)].slice(0, MAX_MENTIONS)
}

const snippetOf = (text: string) => {
  const plain = text.replace(/\s+/g, ' ').trim()
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain
}

export async function unreadCount(userId: number): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
  return n
}

/** Adds one (once per person and thing) and tells them. Never to yourself. */
export async function notify(input: { userIds: number[]; actorId: number; kind: Kind; ref: string; message: string; text?: string; link: string }) {
  const userIds = [...new Set(input.userIds)].filter((id) => id !== input.actorId)
  if (!userIds.length) return
  const added = await db
    .insert(notifications)
    .values(userIds.map((userId) => ({ userId, actorId: input.actorId, kind: input.kind, ref: input.ref, message: input.message, snippet: snippetOf(input.text ?? ''), link: input.link })))
    .onConflictDoNothing()
    .returning({ userId: notifications.userId })
  for (const { userId } of added) send(userId, 'notify', { unread: await unreadCount(userId) })
}

/**
 * Notifies who's mentioned in `text`, as far as `canSee` lets them see it
 * (e.g. only friends, for a friends-only WieWatWaar). Blocked accounts aren't.
 */
export async function notifyMentions(input: { text: string; actorId: number; ref: string; message: string; link: string; canSee?: (ids: number[]) => Promise<number[]> }) {
  const names = mentionedIn(input.text)
  if (!names.length) return
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.username, names), isNull(users.blockedAt), sql`${users.emailVerifiedAt} is not null`))
  let ids = found.map((u) => u.id).filter((id) => id !== input.actorId)
  if (ids.length && input.canSee) ids = await input.canSee(ids)
  await notify({ userIds: ids, actorId: input.actorId, kind: 'mention', ref: input.ref, message: input.message, text: input.text, link: input.link })
}

/** For something friends-only: who of `ids` is `ownerId` or one of their friends. */
export async function friendsOf(ownerId: number, ids: number[]): Promise<number[]> {
  if (!ids.length) return []
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), sql`(${users.id} = ${ownerId} or ${users.id} in ${acceptedFriendsOf(ownerId)})`))
  return rows.map((r) => r.id)
}

/**
 * When the thing itself goes (a deleted knuffel or reaction), its
 * notifications go too, and those of what's under it ("activity:4/comment:9").
 */
export async function unnotify(ref: string) {
  await db.delete(notifications).where(or(eq(notifications.ref, ref), like(notifications.ref, `${ref.replace(/[%_\\]/g, '\\$&')}/%`)))
}

/** Old ones are cleared now and then, when you look at the list. */
export async function pruneNotifications(userId: number) {
  await db.delete(notifications).where(and(eq(notifications.userId, userId), lt(notifications.createdAt, new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000))))
}
