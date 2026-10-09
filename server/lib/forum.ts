import { and, count, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { ForumAuthor, ForumThreadSummary, ForumViewer } from '../../shared/api'
import type { ForumRole } from '../../shared/forum'
import { db } from '../db/client'
import { forumBans, forumModerators, forumPosts, forumProfiles, forumSections, forumThreads, users, type User } from '../db/schema'
import { HttpError } from './errors'
import { toSummary, type SummaryRow } from './serialize'
import { summaryColumns } from './users'

/** An active ban (not expired), or null. */
export async function activeBan(userId: number) {
  const [ban] = await db
    .select()
    .from(forumBans)
    .where(and(eq(forumBans.userId, userId), or(isNull(forumBans.until), gt(forumBans.until, new Date()))))
  return ban ?? null
}

/** Section ids the member moderates; every section for admins. */
export async function moderatedSections(user: User | null): Promise<number[]> {
  if (!user) return []
  if (user.forumRole === 'admin') return (await db.select({ id: forumSections.id }).from(forumSections)).map((r) => r.id)
  const own = (await db.select({ id: forumModerators.sectionId }).from(forumModerators).where(eq(forumModerators.userId, user.id))).map((r) => r.id)
  if (!own.length) return []
  // Moderating a section includes its subforums
  const subs = await db.select({ id: forumSections.id }).from(forumSections).where(inArray(forumSections.parentId, own))
  return [...new Set([...own, ...subs.map((r) => r.id)])]
}

export async function forumViewer(user: User | null): Promise<ForumViewer> {
  if (!user) return null
  const [moderates, ban] = await Promise.all([moderatedSections(user), activeBan(user.id)])
  return {
    role: user.forumRole === 'admin' ? 'admin' : moderates.length ? 'moderator' : null,
    moderates,
    banned: ban ? { reason: ban.reason, until: ban.until?.toISOString() ?? null } : null,
  }
}

export async function canModerate(user: User | null, sectionId: number) {
  if (!user) return false
  if (user.forumRole === 'admin') return true
  // The moderators of the section, or of the section it's a subforum of
  const [section] = await db.select({ parentId: forumSections.parentId }).from(forumSections).where(eq(forumSections.id, sectionId))
  const ids = [sectionId, ...(section?.parentId ? [section.parentId] : [])]
  const [row] = await db
    .select({ id: forumModerators.userId })
    .from(forumModerators)
    .where(and(inArray(forumModerators.sectionId, ids), eq(forumModerators.userId, user.id)))
  return !!row
}

export function requireAdmin(user: User) {
  if (user.forumRole !== 'admin') throw new HttpError(403, 'Alleen forumbeheerders kunnen dit doen.')
}

/** Banned members can read, but not post, react or chat. */
export async function requireNotBanned(user: User) {
  const ban = await activeBan(user.id)
  if (ban) {
    const until = ban.until ? ` tot ${ban.until.toLocaleDateString('nl-NL')}` : ''
    throw new HttpError(403, `Je bent verbannen van het forum${until}.${ban.reason ? ` Reden: ${ban.reason}` : ''}`)
  }
}

/** The role shown next to a name: admin, moderator (anywhere) or nothing. */
export async function rolesOf(userIds: number[]): Promise<Map<number, { role: ForumRole; sections: number[] }>> {
  const map = new Map<number, { role: ForumRole; sections: number[] }>()
  if (!userIds.length) return map
  const [rows, mods] = await Promise.all([
    db.select({ id: users.id, role: users.forumRole }).from(users).where(inArray(users.id, userIds)),
    db.select().from(forumModerators).where(inArray(forumModerators.userId, userIds)),
  ])
  for (const r of rows) {
    const sections = mods.filter((m) => m.userId === r.id).map((m) => m.sectionId)
    map.set(r.id, { role: r.role === 'admin' ? 'admin' : sections.length ? 'moderator' : null, sections })
  }
  return map
}

/** Authors for a page of posts: name, avatar, forum title, signature, post count and role. */
export async function loadAuthors(userIds: number[], sectionId: number | null): Promise<Map<number, ForumAuthor>> {
  const ids = [...new Set(userIds)]
  const map = new Map<number, ForumAuthor>()
  if (!ids.length) return map
  const [rows, profiles, counts, roles] = await Promise.all([
    db.select({ ...summaryColumns, createdAt: users.createdAt }).from(users).where(inArray(users.id, ids)),
    db.select().from(forumProfiles).where(inArray(forumProfiles.userId, ids)),
    db
      .select({ userId: forumPosts.userId, n: count() })
      .from(forumPosts)
      .where(and(inArray(forumPosts.userId, ids), isNull(forumPosts.deletedAt)))
      .groupBy(forumPosts.userId),
    rolesOf(ids),
  ])
  for (const u of rows) {
    const profile = profiles.find((p) => p.userId === u.id)
    const role = roles.get(u.id)
    map.set(u.id, {
      ...toSummary(u),
      forumRole: role?.role ?? null,
      moderatorHere: sectionId !== null && !!role?.sections.includes(sectionId),
      title: profile?.title ?? '',
      signature: profile?.signature ?? '',
      postCount: counts.find((c) => c.userId === u.id)?.n ?? 0,
      joinedAt: u.createdAt.toISOString(),
    })
  }
  return map
}

type ThreadRow = typeof forumThreads.$inferSelect

/** Thread rows to list entries, with starters, last posters and section names. */
export async function toThreadSummaries(rows: ThreadRow[]): Promise<ForumThreadSummary[]> {
  if (!rows.length) return []
  const userIds = [...new Set(rows.flatMap((t) => [t.userId, t.lastPostUserId]).filter((x): x is number => x !== null))]
  const sectionIds = [...new Set(rows.map((t) => t.sectionId))]
  const [people, sections] = await Promise.all([
    userIds.length ? db.select(summaryColumns).from(users).where(inArray(users.id, userIds)) : Promise.resolve([] as SummaryRow[]),
    db.select({ id: forumSections.id, slug: forumSections.slug, name: forumSections.name }).from(forumSections).where(inArray(forumSections.id, sectionIds)),
  ])
  const person = (id: number | null) => {
    const u = id !== null ? people.find((p) => p.id === id) : undefined
    return u ? toSummary(u) : null
  }
  return rows.map((t) => {
    const section = sections.find((s) => s.id === t.sectionId)
    return {
      id: t.id,
      section: { slug: section?.slug ?? '', name: section?.name ?? '' },
      title: t.title,
      icon: t.icon,
      tags: t.tags,
      pinned: t.pinned,
      locked: t.locked,
      views: t.views,
      replies: Math.max(0, t.postCount - 1),
      createdAt: t.createdAt.toISOString(),
      starter: person(t.userId),
      lastPostAt: t.lastPostAt.toISOString(),
      lastPostUser: person(t.lastPostUserId),
      hasPoll: !!t.poll,
    }
  })
}
