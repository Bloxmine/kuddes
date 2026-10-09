/**
 * Group chats in Kuddes Messenger (shared/messenger.ts): a few friends in one
 * conversation. The lines go to everyone in it over their Messenger stream
 * (server/lib/messenger.ts), each with their own view of the group.
 */
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { MessengerGroup, MessengerGroupLine } from '../../shared/messenger'
import { db } from '../db/client'
import { glitters, messengerGroupLines, messengerGroupMembers, messengerGroups, users } from '../db/schema'
import { notFound } from './errors'
import { glitterImage } from './glitters'
import { contactColumns, send, toContact } from './messenger'

type GroupRow = typeof messengerGroups.$inferSelect
type LineRow = typeof messengerGroupLines.$inferSelect

export async function memberIds(groupId: number): Promise<number[]> {
  const rows = await db.select({ id: messengerGroupMembers.userId }).from(messengerGroupMembers).where(eq(messengerGroupMembers.groupId, groupId))
  return rows.map((r) => r.id)
}

/** The groups as `viewerId` sees them: the people in it, and how many lines they haven't read. */
async function toGroups(groups: GroupRow[], viewerId: number): Promise<MessengerGroup[]> {
  if (!groups.length) return []
  const ids = groups.map((g) => g.id)
  const [members, counts] = await Promise.all([
    db
      .select({ groupId: messengerGroupMembers.groupId, joinedAt: messengerGroupMembers.joinedAt, ...contactColumns })
      .from(messengerGroupMembers)
      .innerJoin(users, eq(users.id, messengerGroupMembers.userId))
      .where(inArray(messengerGroupMembers.groupId, ids))
      .orderBy(messengerGroupMembers.joinedAt),
    db
      .select({
        groupId: messengerGroupMembers.groupId,
        // Written out with an alias: inside a subquery drizzle leaves column names bare
        unread: sql<number>`(select count(*)::int from messenger_group_lines gl where gl.group_id = "messenger_group_members"."group_id" and gl.id > "messenger_group_members"."last_read_id" and gl.sender_id is distinct from ${viewerId}::int)`,
        lastLineAt: sql<string | null>`(select max(gl.created_at) from messenger_group_lines gl where gl.group_id = "messenger_group_members"."group_id")`,
      })
      .from(messengerGroupMembers)
      .where(and(inArray(messengerGroupMembers.groupId, ids), eq(messengerGroupMembers.userId, viewerId))),
  ])
  return groups.map((g) => {
    const mine = counts.find((x) => x.groupId === g.id)
    return {
      id: g.id,
      name: g.name,
      members: members
        .filter((m) => m.groupId === g.id)
        .map(({ groupId: _g, joinedAt: _j, ...row }) => {
          const { note: _n, unread: _u, lastLineAt: _l, ...member } = toContact(row)
          return member
        }),
      unread: mine?.unread ?? 0,
      lastLineAt: mine?.lastLineAt ? new Date(mine.lastLineAt).toISOString() : null,
      mine: g.createdBy === viewerId,
    }
  })
}

/** The groups a member is in. */
export async function groupsOf(userId: number): Promise<MessengerGroup[]> {
  const rows = await db
    .select({ group: messengerGroups })
    .from(messengerGroups)
    .innerJoin(messengerGroupMembers, eq(messengerGroupMembers.groupId, messengerGroups.id))
    .where(eq(messengerGroupMembers.userId, userId))
  return (await toGroups(rows.map((r) => r.group), userId)).sort((a, b) => (b.lastLineAt ?? '').localeCompare(a.lastLineAt ?? '') || a.name.localeCompare(b.name, 'nl'))
}

/** One group, for someone in it (anyone else gets a 404). */
export async function groupFor(groupId: number, userId: number): Promise<MessengerGroup> {
  const [row] = await db
    .select({ group: messengerGroups })
    .from(messengerGroups)
    .innerJoin(messengerGroupMembers, and(eq(messengerGroupMembers.groupId, messengerGroups.id), eq(messengerGroupMembers.userId, userId)))
    .where(eq(messengerGroups.id, groupId))
  if (!row) throw notFound('Deze groep bestaat niet (meer), of je zit er niet in.')
  const [group] = await toGroups([row.group], userId)
  return group
}

/** Tells everyone in the group how it looks now (each their own view), e.g. after a new name or new people. */
export async function announceGroup(groupId: number) {
  for (const id of await memberIds(groupId)) {
    const group = await groupFor(groupId, id).catch(() => null)
    if (group) send(id, 'group', group)
  }
}

async function toGroupLines(rows: LineRow[]): Promise<MessengerGroupLine[]> {
  const glitterIds = [...new Set(rows.map((r) => r.glitterId).filter((x): x is number => x !== null))]
  const senderIds = [...new Set(rows.map((r) => r.senderId).filter((x): x is number => x !== null))]
  const [glitterRows, senders] = await Promise.all([
    glitterIds.length ? db.select().from(glitters).where(inArray(glitters.id, glitterIds)) : [],
    senderIds.length ? db.select({ id: users.id, nickname: users.nickname }).from(users).where(inArray(users.id, senderIds)) : [],
  ])
  return rows.map((r) => ({
    id: r.id,
    groupId: r.groupId,
    from: r.senderId,
    fromName: senders.find((s) => s.id === r.senderId)?.nickname ?? 'Iemand',
    kind: r.kind,
    text: r.text,
    glitter: glitterImage(glitterRows.find((g) => g.id === r.glitterId) ?? null),
    share: r.share,
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Stores a line and sends it to everyone in the group; the sender has read it. */
export async function addGroupLine(
  groupId: number,
  senderId: number | null,
  kind: LineRow['kind'],
  text = '',
  glitterId: number | null = null,
  share: string | null = null,
): Promise<MessengerGroupLine> {
  const [row] = await db.insert(messengerGroupLines).values({ groupId, senderId, kind, text, glitterId, share }).returning()
  if (senderId) await db.update(messengerGroupMembers).set({ lastReadId: row.id }).where(and(eq(messengerGroupMembers.groupId, groupId), eq(messengerGroupMembers.userId, senderId)))
  const [line] = await toGroupLines([row])
  for (const id of await memberIds(groupId)) send(id, 'groupLine', line)
  return line
}

/** A page of a group's lines, oldest first. */
export async function groupLines(groupId: number, before: number | null, limit: number) {
  const rows = await db
    .select()
    .from(messengerGroupLines)
    .where(before ? and(eq(messengerGroupLines.groupId, groupId), lt(messengerGroupLines.id, before)) : eq(messengerGroupLines.groupId, groupId))
    .orderBy(desc(messengerGroupLines.id))
    .limit(limit + 1)
  return { lines: await toGroupLines(rows.slice(0, limit).reverse()), hasMore: rows.length > limit }
}
