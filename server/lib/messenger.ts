/**
 * Kuddes Messenger (shared/messenger.ts): who's connected, and sending lines
 * and presence to them. Every open tab of a member holds one EventSource
 * stream; like the forum chat and the game rooms, one server process keeps
 * them in memory. Online in Messenger means: a tab is open, and your status
 * isn't "Toon offline".
 */
import { withDefaults } from '../../shared/customization'
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import type { SSEStreamingApi } from 'hono/streaming'
import type { GameSummary } from '../../shared/games'
import { OFFLINE, type GameNews, type MessengerContact, type MessengerEvents, type MessengerLine } from '../../shared/messenger'
import { HIDDEN_STATUS } from '../../shared/onlineStatus'
import { db } from '../db/client'
import { games, glitters, messengerLines, users, type User } from '../db/schema'
import { glitterImage } from './glitters'
import { selectGames, toGame, withPlayers } from './gameCore'
import { toSummary } from './serialize'
import { acceptedFriendsOf } from './users'

type Stream = { id: number; stream: SSEStreamingApi }
const streams = new Map<number, Set<Stream>>()
/** Who just closed their last tab: they only go offline after a moment (a reload shouldn't flicker). */
const leaving = new Map<number, ReturnType<typeof setTimeout>>()
const LEAVE_GRACE_MS = 5000
let nextStreamId = 1

export const isConnected = (userId: number) => (streams.get(userId)?.size ?? 0) > 0
/** Connected, or only just gone (a reload): still online for the others. */
const present = (userId: number) => isConnected(userId) || leaving.has(userId)

export function send<E extends keyof MessengerEvents>(userId: number, event: E, data: MessengerEvents[E]) {
  const payload = JSON.stringify(data)
  for (const s of streams.get(userId) ?? []) void s.stream.writeSSE({ event, data: payload }).catch(() => undefined)
}

/** The columns for a contact. */
export const contactColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  nickname: users.nickname,
  avatarPath: users.avatarPath,
  lastSeenAt: users.lastSeenAt,
  onlineStatus: users.onlineStatus,
  messengerNote: users.messengerNote,
  preferences: users.preferences,
}
type ContactRow = { [K in keyof typeof contactColumns]: User[K] }

export function toContact(row: ContactRow, unread = 0, lastLineAt: Date | string | null = null): MessengerContact {
  const online = present(row.id) && row.onlineStatus !== HIDDEN_STATUS
  return {
    ...toSummary(row),
    online,
    status: online ? row.onlineStatus : OFFLINE,
    note: row.messengerNote,
    calls: withDefaults(row.preferences).allowCalls,
    unread,
    lastLineAt: lastLineAt ? new Date(lastLineAt).toISOString() : null,
  }
}

/** Your friends, with how many unread lines each and when you last talked. */
export async function contactsOf(userId: number): Promise<MessengerContact[]> {
  const rows = await db
    .select({
      ...contactColumns,
      // Written out with an alias: inside a subquery drizzle leaves column names bare, and a bare "id" would be the line's own id
      unread: sql<number>`(select count(*)::int from messenger_lines ml where ml.sender_id = "users"."id" and ml.recipient_id = ${userId} and ml.read_at is null)`,
      lastLineAt: sql<string | null>`(select max(ml.created_at) from messenger_lines ml where least(ml.sender_id, ml.recipient_id) = least("users"."id", ${userId}::int) and greatest(ml.sender_id, ml.recipient_id) = greatest("users"."id", ${userId}::int))`,
    })
    .from(users)
    // Messenger stays on this server: friends elsewhere aren't contacts (yet)
    .where(and(sql`${users.id} in ${acceptedFriendsOf(userId)}`, isNull(users.blockedAt), isNull(users.domain)))
  return rows.map(({ unread, lastLineAt, ...r }) => toContact(r, unread, lastLineAt)).sort((a, b) => a.nickname.localeCompare(b.nickname, 'nl'))
}

async function friendIds(userId: number): Promise<number[]> {
  const rows = await db.select({ id: users.id }).from(users).where(sql`${users.id} in ${acceptedFriendsOf(userId)}`)
  return rows.map((r) => r.id)
}

/** Tells a member's friends (who are connected) how they look now: online, offline, a new status or personal message. */
export async function announcePresence(userId: number) {
  const [row] = await db.select(contactColumns).from(users).where(eq(users.id, userId))
  if (!row) return
  const contact = toContact(row)
  for (const id of await friendIds(userId)) send(id, 'presence', contact)
}

/** A tab opened the stream; returns what to call when it closes. */
export function connect(userId: number, stream: SSEStreamingApi): () => void {
  const wasOnline = present(userId)
  clearTimeout(leaving.get(userId))
  leaving.delete(userId)
  const entry = { id: nextStreamId++, stream }
  const set = streams.get(userId) ?? new Set<Stream>()
  set.add(entry)
  streams.set(userId, set)
  if (!wasOnline) void announcePresence(userId)
  return () => {
    set.delete(entry)
    if (set.size) return
    streams.delete(userId)
    leaving.set(
      userId,
      setTimeout(() => {
        leaving.delete(userId)
        if (!isConnected(userId)) void announcePresence(userId)
      }, LEAVE_GRACE_MS),
    )
  }
}

type LineRow = typeof messengerLines.$inferSelect

/** Lines as `viewerId` sees them, with the games of invites filled in. */
export async function toLines(rows: LineRow[], viewerId: number): Promise<MessengerLine[]> {
  const ids = [...new Set(rows.map((r) => r.gameId).filter((x): x is number => x !== null))]
  const found = ids.length ? await withPlayers(await selectGames().where(inArray(games.id, ids))) : []
  const byId = new Map<number, GameSummary>(found.map((j) => [j.game.id, toGame(j, viewerId)]))
  const glitterIds = [...new Set(rows.map((r) => r.glitterId).filter((x): x is number => x !== null))]
  const glitterRows = glitterIds.length ? await db.select().from(glitters).where(inArray(glitters.id, glitterIds)) : []
  return rows.map((r) => ({
    id: r.id,
    from: r.senderId,
    to: r.recipientId,
    kind: r.kind,
    text: r.text,
    game: r.gameId ? (byId.get(r.gameId) ?? null) : null,
    glitter: glitterImage(glitterRows.find((g) => g.id === r.glitterId) ?? null),
    share: r.share,
    createdAt: r.createdAt.toISOString(),
    readAt: r.recipientId === viewerId && r.readAt ? r.readAt.toISOString() : null,
  }))
}

/** Stores a line and sends it to both (each with their own view of the game). */
export async function addLine(senderId: number, recipientId: number, kind: LineRow['kind'], text = '', gameId: number | null = null, glitterId: number | null = null, share: string | null = null): Promise<LineRow> {
  const [row] = await db.insert(messengerLines).values({ senderId, recipientId, kind, text, gameId, glitterId, share }).returning()
  const [forSender] = await toLines([row], senderId)
  const [forRecipient] = await toLines([row], recipientId)
  send(senderId, 'line', forSender)
  send(recipientId, 'line', forRecipient)
  return row
}

/** A page of the conversation between two members, oldest first. */
export async function conversation(me: number, other: number, before: number | null, limit: number) {
  const pair = or(and(eq(messengerLines.senderId, me), eq(messengerLines.recipientId, other)), and(eq(messengerLines.senderId, other), eq(messengerLines.recipientId, me)))
  const rows = await db
    .select()
    .from(messengerLines)
    .where(before ? and(pair, lt(messengerLines.id, before)) : pair)
    .orderBy(desc(messengerLines.id))
    .limit(limit + 1)
  return { lines: await toLines(rows.slice(0, limit).reverse(), me), hasMore: rows.length > limit }
}

// ------------------------------------------------------------ games

/** Someone challenged friends: the invite appears in each conversation. */
export async function inviteLines(hostId: number, invited: number[], gameId: number) {
  for (const id of invited) await addLine(hostId, id, 'invite', '', gameId)
}

/** What happened to an invite, in the conversation between the two. */
export const gameNews = (fromId: number, toId: number, gameId: number, news: GameNews) => addLine(fromId, toId, 'game', news, gameId)
