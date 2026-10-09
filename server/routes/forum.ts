import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, ne, or, sql, isNotNull } from 'drizzle-orm'
import { withDefaults } from '../../shared/customization'
import { Hono } from 'hono'
import { clientIp } from '../lib/clientIp'
import { z } from 'zod'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { bodyLimit } from 'hono/body-limit'
import { config } from '../config'
import { removeUpload, storeAnimated } from '../lib/uploads'
import { PICKABLE_ICONS } from '../../shared/icons'
import type { ForumIndex, ForumPost, ForumProfile, ForumProfileComment, ForumSection, ForumSectionPage, ForumThreadPage, Page } from '../../shared/api'
import { FORUM_LIMITS, FORUM_REACTIONS, POSTS_PER_PAGE, SIGNATURE_IMAGE_SRC, THREADS_PER_PAGE, parseSignatureImage, threadHref, type ForumReaction, type SignatureImage } from '../../shared/forum'
import { db } from '../db/client'
import { forumModerators, forumPollVotes, forumPosts, forumProfileComments, forumProfiles, forumReactions, forumSections, forumThreads, users, type User, hiddenItems } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { activeBan, canModerate, forumViewer, loadAuthors, moderatedSections, requireNotBanned, rolesOf, toThreadSummaries } from '../lib/forum'
import { rateLimit } from '../lib/rateLimit'
import { isOnline, toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, summaryColumns } from '../lib/users'
import { notify, notifyMentions, unnotify } from '../lib/notifications'
import { chatOnlineCount } from './chat'
import { pollSchema } from '../lib/polls'
import type { PollView } from '../../shared/polls'
import { checkPost } from '../lib/moderation'

const tagList = z
  .array(z.string().trim().toLowerCase().min(1).max(FORUM_LIMITS.tag, `Een tag mag maximaal ${FORUM_LIMITS.tag} tekens hebben.`))
  .max(FORUM_LIMITS.tags, `Maximaal ${FORUM_LIMITS.tags} tags.`)
  .transform((t) => [...new Set(t)])

const titleSchema = z.string().trim().min(3, 'Geef je onderwerp een titel van minstens 3 tekens.').max(FORUM_LIMITS.title, `Een titel mag maximaal ${FORUM_LIMITS.title} tekens hebben.`)
const bodySchema = z.string().trim().min(1, 'Schrijf eerst een bericht.').max(FORUM_LIMITS.body, `Een bericht mag maximaal ${FORUM_LIMITS.body} tekens hebben.`)

const recentViews = new Map<string, number>()

/** The thread's poll with its results and the viewer's vote. */
async function threadPoll(thread: typeof forumThreads.$inferSelect, viewer: User | null): Promise<PollView | null> {
  if (!thread.poll) return null
  const [tallies, mine] = await Promise.all([
    db.select({ option: forumPollVotes.option, n: count() }).from(forumPollVotes).where(eq(forumPollVotes.threadId, thread.id)).groupBy(forumPollVotes.option),
    viewer ? db.select({ option: forumPollVotes.option }).from(forumPollVotes).where(and(eq(forumPollVotes.threadId, thread.id), eq(forumPollVotes.userId, viewer.id))) : Promise.resolve([]),
  ])
  const counts = thread.poll.options.map((_, i) => tallies.find((t) => t.option === i)?.n ?? 0)
  return { ...thread.poll, counts, total: counts.reduce((a, b) => a + b, 0), myVote: mine[0]?.option ?? null }
}

async function sectionBySlug(slug: string) {
  const [row] = await db.select().from(forumSections).where(eq(forumSections.slug, slug))
  if (!row) throw notFound('Dit forumdeel bestaat niet.')
  return row
}

async function threadById(id: number) {
  const [row] = await db.select().from(forumThreads).where(eq(forumThreads.id, id))
  if (!row) throw notFound('Dit onderwerp bestaat niet (meer).')
  return row
}

async function postById(id: number) {
  const [row] = await db
    .select({ post: forumPosts, thread: forumThreads })
    .from(forumPosts)
    .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
    .where(eq(forumPosts.id, id))
  if (!row) throw notFound('Dit bericht bestaat niet (meer).')
  return row
}

/**
 * All sections with their counts, last post and moderators. A section counts
 * together with its subforums (one level deep), like on the old forums.
 */
async function loadSections(): Promise<ForumSection[]> {
  const sections = await db.select().from(forumSections).orderBy(asc(forumSections.position), asc(forumSections.id))
  if (!sections.length) return []
  const [threadCounts, postCounts, mods] = await Promise.all([
    db.select({ sectionId: forumThreads.sectionId, n: count() }).from(forumThreads).groupBy(forumThreads.sectionId),
    db.select({ sectionId: forumThreads.sectionId, n: sql<number>`coalesce(sum(${forumThreads.postCount}), 0)::int` }).from(forumThreads).groupBy(forumThreads.sectionId),
    db.select({ sectionId: forumModerators.sectionId, user: summaryColumns }).from(forumModerators).innerJoin(users, eq(users.id, forumModerators.userId)),
  ])
  // The latest thread activity per section
  const latest = await db
    .selectDistinctOn([forumThreads.sectionId], { sectionId: forumThreads.sectionId, id: forumThreads.id, title: forumThreads.title, at: forumThreads.lastPostAt, userId: forumThreads.lastPostUserId })
    .from(forumThreads)
    .orderBy(forumThreads.sectionId, desc(forumThreads.lastPostAt))
  const posterIds = latest.map((l) => l.userId).filter((x): x is number => x !== null)
  const posters = posterIds.length ? await db.select(summaryColumns).from(users).where(inArray(users.id, posterIds)) : []
  const byId = new Map(sections.map((s) => [s.id, s]))

  return sections.map((s) => {
    const children = sections.filter((c) => c.parentId === s.id)
    const family = [s, ...children]
    const sum = (rows: { sectionId: number; n: number }[]) => family.reduce((n, f) => n + (rows.find((r) => r.sectionId === f.id)?.n ?? 0), 0)
    const last = latest.filter((l) => family.some((f) => f.id === l.sectionId)).sort((a, b) => b.at.getTime() - a.at.getTime())[0]
    const poster = last?.userId ? posters.find((p) => p.id === last.userId) : undefined
    const parent = s.parentId ? byId.get(s.parentId) : undefined
    return {
      id: s.id,
      slug: s.slug,
      category: parent?.category ?? s.category,
      name: s.name,
      description: s.description,
      icon: s.icon,
      position: s.position,
      staffOnly: s.staffOnly,
      parent: parent ? { id: parent.id, slug: parent.slug, name: parent.name } : null,
      subforums: children.map((c) => ({ id: c.id, slug: c.slug, name: c.name, icon: c.icon })),
      threadCount: sum(threadCounts),
      postCount: sum(postCounts),
      lastPost: last ? { threadId: last.id, threadTitle: last.title, sectionSlug: byId.get(last.sectionId)?.slug ?? s.slug, at: last.at.toISOString(), user: poster ? toSummary(poster) : null } : null,
      moderators: mods.filter((m) => m.sectionId === s.id || m.sectionId === s.parentId).map((m) => toSummary(m.user)),
    }
  })
}

async function reactionsFor(postIds: number[], viewer: User | null) {
  if (!postIds.length) return new Map<number, ForumPost['reactions']>()
  const rows = await db
    .select({ postId: forumReactions.postId, reaction: forumReactions.reaction, n: count(), mine: sql<boolean>`bool_or(${forumReactions.userId} = ${viewer?.id ?? 0})` })
    .from(forumReactions)
    .where(inArray(forumReactions.postId, postIds))
    .groupBy(forumReactions.postId, forumReactions.reaction)
  const map = new Map<number, ForumPost['reactions']>()
  for (const r of rows) {
    if (!(r.reaction in FORUM_REACTIONS)) continue
    map.set(r.postId, [...(map.get(r.postId) ?? []), { reaction: r.reaction as ForumReaction, count: r.n, mine: !!r.mine }])
  }
  return map
}

/** Whether a member may start a thread here. */
async function canStartThread(user: User, section: typeof forumSections.$inferSelect) {
  return !section.staffOnly || (await canModerate(user, section.id))
}

async function ensureProfile(userId: number) {
  await db.insert(forumProfiles).values({ userId }).onConflictDoNothing()
}

const SIGNATURE_BYTES = 2 * 1024 * 1024

/** Signature pictures that aren't used any more (replaced, or never saved) go once they're a day old. */
async function sweepSignatureImages(userId: number, signature: string) {
  const dir = path.join(config.uploadDir, 'signatures')
  const used = new Set(signature.split('\n').map(parseSignatureImage).filter((x): x is SignatureImage => !!x).map((p) => p.src.replace(/^\/uploads\//, '')))
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.startsWith(`${userId}-`))
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  await Promise.all(
    files
      .filter((f) => !used.has(`signatures/${f}`))
      .map(async (f) => {
        const st = await stat(path.join(dir, f)).catch(() => null)
        if (st && st.mtimeMs < dayAgo) await removeUpload(`signatures/${f}`)
      }),
  )
}

export const forumRoutes = new Hono<AppEnv>()
  .get('/forum', async (c) => {
    const viewer = c.get('user')
    const [sections, [threads], [posts], [members], newestRows, onlineRows, tagRows, viewerInfo] = await Promise.all([
      loadSections(),
      db.select({ n: count() }).from(forumThreads),
      db.select({ n: count() }).from(forumPosts).where(isNull(forumPosts.deletedAt)),
      db.select({ n: sql<number>`count(distinct ${forumPosts.userId})::int` }).from(forumPosts),
      db.select(summaryColumns).from(users).where(isNotNull(users.emailVerifiedAt)).orderBy(desc(users.id)).limit(1),
      db.select(summaryColumns).from(users).where(sql`${users.lastSeenAt} > now() - interval '5 minutes'`).orderBy(desc(users.lastSeenAt)).limit(40),
      db.execute<{ tag: string; count: number }>(sql`select tag, count(*)::int as count from ${forumThreads}, unnest(${forumThreads.tags}) as tag group by tag order by count desc, tag limit 20`),
      forumViewer(viewer),
    ])
    const result: ForumIndex = {
      sections,
      stats: { threads: threads.n, posts: posts.n, members: members.n, newest: newestRows[0] ? toSummary(newestRows[0]) : null },
      online: onlineRows.filter(isOnline).map(toSummary),
      chatting: chatOnlineCount(),
      tags: [...tagRows].map((r) => ({ tag: r.tag, count: Number(r.count) })),
      viewer: viewerInfo,
    }
    return c.json(result)
  })

  .get('/forum/sections/:slug', async (c) => {
    const viewer = c.get('user')
    const section = await sectionBySlug(c.req.param('slug'))
    const [[{ n }], all] = await Promise.all([db.select({ n: count() }).from(forumThreads).where(eq(forumThreads.sectionId, section.id)), loadSections()])
    const info = all.find((s) => s.id === section.id)!
    const pages = Math.max(1, Math.ceil(n / THREADS_PER_PAGE))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const rows = await db
      .select()
      .from(forumThreads)
      .where(eq(forumThreads.sectionId, section.id))
      .orderBy(desc(forumThreads.pinned), desc(forumThreads.lastPostAt))
      .limit(THREADS_PER_PAGE)
      .offset((page - 1) * THREADS_PER_PAGE)
    const moderate = await canModerate(viewer, section.id)
    const result: ForumSectionPage = {
      section: info,
      subforums: all.filter((s) => s.parent?.id === section.id),
      threads: await toThreadSummaries(rows),
      page,
      pages,
      canPost: !!viewer && (!section.staffOnly || moderate),
      canModerate: moderate,
    }
    return c.json(result)
  })

  // ?pagina=2, or ?bericht=123 to open the page that post is on
  .get('/forum/threads/:id', async (c) => {
    const viewer = c.get('user')
    const thread = await threadById(Number(c.req.param('id')))
    const postId = Number(c.req.query('bericht')) || null
    const [{ n: total }] = await db.select({ n: count() }).from(forumPosts).where(eq(forumPosts.threadId, thread.id))
    const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE))
    let page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    if (postId) {
      const [{ n: before }] = await db
        .select({ n: count() })
        .from(forumPosts)
        .where(and(eq(forumPosts.threadId, thread.id), lt(forumPosts.id, postId)))
      page = Math.floor(before / POSTS_PER_PAGE) + 1
    }
    // Count a view once per visitor per half hour
    const who = viewer ? `u${viewer.id}` : `ip${clientIp(c)}`
    const key = `${who}:${thread.id}`
    if ((recentViews.get(key) ?? 0) < Date.now() - 30 * 60 * 1000) {
      recentViews.set(key, Date.now())
      if (recentViews.size > 50_000) recentViews.clear()
      await db.update(forumThreads).set({ views: sql`${forumThreads.views} + 1` }).where(eq(forumThreads.id, thread.id))
      thread.views++
    }
    const rows = await db
      .select()
      .from(forumPosts)
      .where(eq(forumPosts.threadId, thread.id))
      .orderBy(asc(forumPosts.id))
      .limit(POSTS_PER_PAGE)
      .offset((page - 1) * POSTS_PER_PAGE)
    const moderate = await canModerate(viewer, thread.sectionId)
    const editorIds = rows.map((p) => p.editedById).filter((x): x is number => x !== null)
    // Hidden after reports: shown like a removed post, so the thread still reads
    const hiddenIds = new Set(
      rows.length
        ? (await db.select({ id: hiddenItems.targetId }).from(hiddenItems).where(and(eq(hiddenItems.kind, 'forum'), inArray(hiddenItems.targetId, rows.map((p) => p.id))))).map((h) => h.id)
        : [],
    )
    const [authors, reactions, editors, [summary], banned, poll] = await Promise.all([
      loadAuthors(rows.map((p) => p.userId).filter((x): x is number => x !== null), thread.sectionId),
      reactionsFor(rows.map((p) => p.id), viewer),
      editorIds.length ? db.select({ id: users.id, nickname: users.nickname }).from(users).where(inArray(users.id, editorIds)) : Promise.resolve([]),
      toThreadSummaries([thread]),
      viewer ? activeBan(viewer.id) : Promise.resolve(null),
      threadPoll(thread, viewer),
    ])
    const result: ForumThreadPage = {
      thread: { ...summary, sectionId: thread.sectionId },
      poll,
      canVote: !!viewer && !banned && !thread.locked,
      canClosePoll: !!poll && !poll.closed && !!viewer && (moderate || viewer.id === thread.userId),
      posts: rows.map((p, i) => {
        const own = !!viewer && viewer.id === p.userId
        const deleted = !!p.deletedAt || hiddenIds.has(p.id)
        return {
          id: p.id,
          number: (page - 1) * POSTS_PER_PAGE + i + 1,
          author: p.userId ? (authors.get(p.userId) ?? null) : null,
          body: deleted ? '' : p.body,
          createdAt: p.createdAt.toISOString(),
          editedAt: p.editedAt?.toISOString() ?? null,
          editedBy: editors.find((e) => e.id === p.editedById)?.nickname ?? null,
          deleted,
          reactions: deleted ? [] : (reactions.get(p.id) ?? []),
          canEdit: !deleted && !banned && (moderate || (own && !thread.locked)),
          canDelete: !deleted && !banned && (moderate || (own && !thread.locked)),
        }
      }),
      page,
      pages,
      canReply: !!viewer && !banned && (!thread.locked || moderate),
      canModerate: moderate,
    }
    return c.json(result)
  })

  .post('/forum/sections/:slug/threads', rateLimit('forumonderwerpen', 20, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    await requireNotBanned(me)
    const section = await sectionBySlug(c.req.param('slug'))
    if (!(await canStartThread(me, section))) throw new HttpError(403, 'In dit forumdeel kunnen alleen beheerders een onderwerp starten.')
    const input = parse(
      z.object({ title: titleSchema, tags: tagList.default([]), body: bodySchema, poll: pollSchema.nullable().optional(), icon: z.enum(PICKABLE_ICONS).nullable().optional() }),
      await c.req.json().catch(() => null),
    )
    const thread = await db.transaction(async (tx) => {
      const now = new Date()
      const [t] = await tx
        .insert(forumThreads)
        .values({ sectionId: section.id, userId: me.id, icon: input.icon ?? null, title: input.title, tags: input.tags, postCount: 1, lastPostAt: now, lastPostUserId: me.id, poll: input.poll ? { ...input.poll, closed: false } : null })
        .returning()
      const [p] = await tx.insert(forumPosts).values({ threadId: t.id, userId: me.id, body: input.body, createdAt: now }).returning({ id: forumPosts.id })
      return { ...t, postId: p.id }
    })
    await ensureProfile(me.id)
    checkPost({ author: me, place: 'forum', text: `${input.title}\n${input.body}`, link: `${threadHref(section.slug, thread.id, thread.title)}#bericht-${thread.postId}` })
    await notifyMentions({
      text: input.body,
      actorId: me.id,
      ref: `forum-post:${thread.postId}`,
      message: `noemde je in het forum: "${thread.title}"`,
      link: `${threadHref(section.slug, thread.id, thread.title)}#bericht-${thread.postId}`,
    })
    return c.json({ id: thread.id, section: section.slug, title: thread.title }, 201)
  })

  // One vote per member in a thread's poll; voting again changes it
  .post('/forum/threads/:id/vote', rateLimit('stemmen', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    await requireNotBanned(me)
    const thread = await threadById(Number(c.req.param('id')))
    if (!thread.poll) throw new HttpError(400, 'Dit onderwerp heeft geen poll.')
    if (thread.poll.closed) throw new HttpError(400, 'Deze poll is gesloten.')
    if (thread.locked) throw new HttpError(403, 'Dit onderwerp is gesloten.')
    const { option } = parse(z.object({ option: z.number().int().min(0).max(thread.poll.options.length - 1) }), await c.req.json().catch(() => null))
    await db.insert(forumPollVotes).values({ threadId: thread.id, userId: me.id, option }).onConflictDoUpdate({ target: [forumPollVotes.threadId, forumPollVotes.userId], set: { option } })
    return c.json(await threadPoll(thread, me))
  })

  .post('/forum/threads/:id/poll/close', async (c) => {
    const me = requireUser(c)
    const thread = await threadById(Number(c.req.param('id')))
    if (!thread.poll) throw new HttpError(400, 'Dit onderwerp heeft geen poll.')
    if (thread.userId !== me.id && !(await canModerate(me, thread.sectionId))) throw new HttpError(403, 'Alleen wie het onderwerp startte kan de poll sluiten.')
    const closed = { ...thread.poll, closed: true }
    await db.update(forumThreads).set({ poll: closed }).where(eq(forumThreads.id, thread.id))
    return c.json(await threadPoll({ ...thread, poll: closed }, me))
  })

  .post('/forum/threads/:id/posts', rateLimit('forumberichten', 120, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    await requireNotBanned(me)
    const thread = await threadById(Number(c.req.param('id')))
    if (thread.locked && !(await canModerate(me, thread.sectionId))) throw new HttpError(403, 'Dit onderwerp is gesloten.')
    const { body } = parse(z.object({ body: bodySchema }), await c.req.json().catch(() => null))
    const post = await db.transaction(async (tx) => {
      const [p] = await tx.insert(forumPosts).values({ threadId: thread.id, userId: me.id, body }).returning()
      await tx
        .update(forumThreads)
        .set({ postCount: sql`${forumThreads.postCount} + 1`, lastPostAt: p.createdAt, lastPostUserId: me.id })
        .where(eq(forumThreads.id, thread.id))
      return p
    })
    await ensureProfile(me.id)
    const [{ n }] = await db.select({ n: count() }).from(forumPosts).where(eq(forumPosts.threadId, thread.id))
    const page = Math.ceil(n / POSTS_PER_PAGE)
    const [section] = await db.select({ slug: forumSections.slug }).from(forumSections).where(eq(forumSections.id, thread.sectionId))
    if (section) {
      const link = `${threadHref(section.slug, thread.id, thread.title, page)}#bericht-${post.id}`
      checkPost({ author: me, place: 'forum', text: body, link })
      // Who started the topic hears about replies (unless they switched that off)
      const [starter] = thread.userId && thread.userId !== me.id ? await db.select().from(users).where(eq(users.id, thread.userId)) : []
      const tellStarter = !!starter && !starter.blockedAt && withDefaults(starter.preferences).forumReplies
      if (tellStarter) await notify({ userIds: [starter.id], actorId: me.id, kind: 'forum', ref: `forum-post:${post.id}`, message: `reageerde op je onderwerp "${thread.title}"`, text: body, link })
      await notifyMentions({
        text: body,
        actorId: me.id,
        ref: `forum-post:${post.id}`,
        message: `noemde je in het forum: "${thread.title}"`,
        link,
        // The starter already got one for this reply
        canSee: async (ids) => (tellStarter ? ids.filter((id) => id !== starter.id) : ids),
      })
    }
    return c.json({ id: post.id, page }, 201)
  })

  .patch('/forum/posts/:id', async (c) => {
    const me = requireUser(c)
    await requireNotBanned(me)
    const { post, thread } = await postById(Number(c.req.param('id')))
    const moderate = await canModerate(me, thread.sectionId)
    if (post.deletedAt || !(moderate || (post.userId === me.id && !thread.locked))) throw new HttpError(403, 'Je kunt dit bericht niet bewerken.')
    const { body } = parse(z.object({ body: bodySchema }), await c.req.json().catch(() => null))
    await db.update(forumPosts).set({ body, editedAt: new Date(), editedById: me.id }).where(eq(forumPosts.id, post.id))
    return c.body(null, 204)
  })

  // The first post can't go on its own: delete the thread instead
  .delete('/forum/posts/:id', async (c) => {
    const me = requireUser(c)
    const { post, thread } = await postById(Number(c.req.param('id')))
    const moderate = await canModerate(me, thread.sectionId)
    if (post.deletedAt || !(moderate || (post.userId === me.id && !thread.locked))) throw new HttpError(403, 'Je kunt dit bericht niet verwijderen.')
    const [first] = await db.select({ id: forumPosts.id }).from(forumPosts).where(eq(forumPosts.threadId, thread.id)).orderBy(asc(forumPosts.id)).limit(1)
    if (first.id === post.id) throw new HttpError(400, 'Dit is het eerste bericht. Verwijder het hele onderwerp als het weg moet.')
    await db.update(forumPosts).set({ deletedAt: new Date(), deletedById: me.id }).where(eq(forumPosts.id, post.id))
    await unnotify(`forum-post:${post.id}`)
    return c.body(null, 204)
  })

  // Toggle a smiley reaction
  .post('/forum/posts/:id/reactions', rateLimit('reacties', 600, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    await requireNotBanned(me)
    const { post } = await postById(Number(c.req.param('id')))
    if (post.deletedAt) throw notFound('Dit bericht is verwijderd.')
    const { reaction } = parse(z.object({ reaction: z.enum(Object.keys(FORUM_REACTIONS) as [ForumReaction]) }), await c.req.json().catch(() => null))
    const removed = await db
      .delete(forumReactions)
      .where(and(eq(forumReactions.postId, post.id), eq(forumReactions.userId, me.id), eq(forumReactions.reaction, reaction)))
      .returning()
    if (!removed.length) await db.insert(forumReactions).values({ postId: post.id, userId: me.id, reaction })
    return c.json((await reactionsFor([post.id], me)).get(post.id) ?? [])
  })

  // Starters change title and tags; moderators also pin, lock and move
  .patch('/forum/threads/:id', async (c) => {
    const me = requireUser(c)
    await requireNotBanned(me)
    const thread = await threadById(Number(c.req.param('id')))
    const moderate = await canModerate(me, thread.sectionId)
    const input = parse(
      z.object({ title: titleSchema.optional(), tags: tagList.optional(), pinned: z.boolean().optional(), locked: z.boolean().optional(), section: z.string().optional() }),
      await c.req.json().catch(() => null),
    )
    const own = thread.userId === me.id && !thread.locked
    if ((input.title !== undefined || input.tags !== undefined) && !(moderate || own)) throw new HttpError(403, 'Je kunt dit onderwerp niet aanpassen.')
    if ((input.pinned !== undefined || input.locked !== undefined || input.section !== undefined) && !moderate) {
      throw new HttpError(403, 'Alleen moderators kunnen onderwerpen vastzetten, sluiten of verplaatsen.')
    }
    let sectionId = thread.sectionId
    if (input.section) {
      const target = await sectionBySlug(input.section)
      if (!(await canModerate(me, target.id))) throw new HttpError(403, 'Je kunt niet verplaatsen naar een forumdeel dat je niet modereert.')
      sectionId = target.id
    }
    await db
      .update(forumThreads)
      .set({ title: input.title, tags: input.tags, pinned: input.pinned, locked: input.locked, sectionId })
      .where(eq(forumThreads.id, thread.id))
    return c.body(null, 204)
  })

  .delete('/forum/threads/:id', async (c) => {
    const me = requireUser(c)
    const thread = await threadById(Number(c.req.param('id')))
    const moderate = await canModerate(me, thread.sectionId)
    // Starters may take their own thread back while nobody has replied yet
    if (!moderate && !(thread.userId === me.id && thread.postCount <= 1)) throw new HttpError(403, 'Je kunt dit onderwerp niet verwijderen.')
    await db.delete(forumThreads).where(eq(forumThreads.id, thread.id))
    return c.body(null, 204)
  })

  // Threads by title, post text or tag
  .get('/forum/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 80)
    const tag = (c.req.query('tag') ?? '').trim().toLowerCase().slice(0, FORUM_LIMITS.tag)
    const user = c.req.query('lid')
    if (!q && !tag && !user) return c.json([])
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const author = user ? await findUser(user) : null
    const rows = await db
      .select()
      .from(forumThreads)
      .where(
        and(
          tag ? sql`${tag} = any(${forumThreads.tags})` : undefined,
          author ? eq(forumThreads.userId, author.id) : undefined,
          q
            ? or(
                ilike(forumThreads.title, pattern),
                inArray(
                  forumThreads.id,
                  db.select({ id: forumPosts.threadId }).from(forumPosts).where(and(ilike(forumPosts.body, pattern), isNull(forumPosts.deletedAt))),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(forumThreads.lastPostAt))
      .limit(50)
    return c.json(await toThreadSummaries(rows))
  })

  // A thread card for embeds (doesn't count as a view)
  .get('/forum/threads/:id/summary', async (c) => {
    const thread = await threadById(Number(c.req.param('id')))
    const [summary] = await toThreadSummaries([thread])
    return c.json(summary)
  })

  // Newest activity, for the index
  .get('/forum/recent', async (c) => {
    const rows = await db.select().from(forumThreads).orderBy(desc(forumThreads.lastPostAt)).limit(Math.min(Number(c.req.query('limit')) || 8, 20))
    return c.json(await toThreadSummaries(rows))
  })

  // A member's forum profile
  .get('/forum/users/:username', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const [[profile], [posts], [threads], [reactions], [range], recentPostRows, recentThreadRows, roles, ban, moderated] = await Promise.all([
      db.select().from(forumProfiles).where(eq(forumProfiles.userId, user.id)),
      db.select({ n: count() }).from(forumPosts).where(and(eq(forumPosts.userId, user.id), isNull(forumPosts.deletedAt))),
      db.select({ n: count() }).from(forumThreads).where(eq(forumThreads.userId, user.id)),
      db
        .select({ n: count() })
        .from(forumReactions)
        .innerJoin(forumPosts, eq(forumPosts.id, forumReactions.postId))
        .where(and(eq(forumPosts.userId, user.id), ne(forumReactions.userId, user.id))),
      db
        .select({ first: sql<Date | null>`min(${forumPosts.createdAt})`, last: sql<Date | null>`max(${forumPosts.createdAt})` })
        .from(forumPosts)
        .where(eq(forumPosts.userId, user.id)),
      db
        .select({ post: forumPosts, thread: { id: forumThreads.id, title: forumThreads.title }, section: forumSections.slug })
        .from(forumPosts)
        .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
        .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
        .where(and(eq(forumPosts.userId, user.id), isNull(forumPosts.deletedAt)))
        .orderBy(desc(forumPosts.id))
        .limit(8),
      db.select().from(forumThreads).where(eq(forumThreads.userId, user.id)).orderBy(desc(forumThreads.createdAt)).limit(8),
      rolesOf([user.id]),
      activeBan(user.id),
      db
        .select({ slug: forumSections.slug, name: forumSections.name })
        .from(forumModerators)
        .innerJoin(forumSections, eq(forumSections.id, forumModerators.sectionId))
        .where(eq(forumModerators.userId, user.id)),
    ])
    const plain = (text: string) =>
      text
        .replace(/^>.*$/gm, '')
        .replace(/\*\*|~~|\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
    const toIso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null)
    const result: ForumProfile = {
      user: toSummary(user),
      forumRole: roles.get(user.id)?.role ?? null,
      moderates: moderated,
      title: profile?.title ?? '',
      signature: profile?.signature ?? '',
      postCount: posts.n,
      threadCount: threads.n,
      reactionsReceived: reactions.n,
      firstPostAt: toIso(range?.first ?? null),
      lastPostAt: toIso(range?.last ?? null),
      banned: !!ban,
      recentPosts: recentPostRows.map((r) => ({
        id: r.post.id,
        threadId: r.thread.id,
        threadTitle: r.thread.title,
        section: r.section,
        excerpt: plain(r.post.body),
        createdAt: r.post.createdAt.toISOString(),
      })),
      recentThreads: await toThreadSummaries(recentThreadRows),
      isSelf: viewer?.id === user.id,
    }
    return c.json(result)
  })

  .patch('/forum/me', async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({
        title: z.string().trim().max(FORUM_LIMITS.forumTitle, `Een titel mag maximaal ${FORUM_LIMITS.forumTitle} tekens hebben.`).optional(),
        signature: z.string().trim().max(FORUM_LIMITS.signature, `Een handtekening mag maximaal ${FORUM_LIMITS.signature} tekens hebben.`).optional(),
      }),
      await c.req.json().catch(() => null),
    )
    if (input.signature !== undefined) {
      // Pictures: only your own uploads, and not too many
      const pictures = input.signature.split('\n').map(parseSignatureImage).filter((x): x is SignatureImage => !!x)
      if (pictures.some((p) => SIGNATURE_IMAGE_SRC.exec(p.src)?.[1] !== String(me.id))) throw new HttpError(400, 'Je kunt alleen je eigen plaatjes in je handtekening zetten.')
      if (pictures.length > FORUM_LIMITS.signatureImages) throw new HttpError(400, `Maximaal ${FORUM_LIMITS.signatureImages} plaatjes in je handtekening.`)
    }
    await db
      .insert(forumProfiles)
      .values({ userId: me.id, title: input.title ?? '', signature: input.signature ?? '' })
      .onConflictDoUpdate({ target: forumProfiles.userId, set: { ...input, updatedAt: new Date() } })
    if (input.signature !== undefined) void sweepSignatureImages(me.id, input.signature)
    return c.body(null, 204)
  })

  // A picture for your signature (a userbar or banner); moving GIFs keep moving
  .post(
    '/forum/me/signature-images',
    bodyLimit({ maxSize: SIGNATURE_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Dat plaatje is te groot (max 2 MB).') } }),
    rateLimit('handtekeningplaatjes', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      await requireNotBanned(me)
      const body = await c.req.parseBody()
      const stored = await storeAnimated(body.file, SIGNATURE_BYTES, 900, 300, 'signatures', `${me.id}-`)
      return c.json({ url: `/uploads/${stored.path}`, width: stored.width, height: stored.height }, 201)
    },
  )

  // "Discussie" on forum profiles
  .get('/forum/users/:username/comments', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const before = Number(c.req.query('before')) || null
    const rows = await db
      .select({ comment: forumProfileComments, author: summaryColumns })
      .from(forumProfileComments)
      .innerJoin(users, eq(users.id, forumProfileComments.authorId))
      .where(and(eq(forumProfileComments.profileUserId, user.id), before ? lt(forumProfileComments.id, before) : undefined))
      .orderBy(desc(forumProfileComments.id))
      .limit(21)
    const page = rows.slice(0, 20)
    const result: Page<ForumProfileComment> = {
      items: page.map(({ comment, author }) => ({
        id: comment.id,
        author: toSummary(author),
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        canDelete: !!viewer && (viewer.id === comment.authorId || viewer.id === user.id || viewer.forumRole === 'admin'),
      })),
      nextCursor: rows.length > 20 ? page[page.length - 1].comment.id : null,
    }
    return c.json(result)
  })

  .post('/forum/users/:username/comments', rateLimit('discussie', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    await requireNotBanned(me)
    const user = await findUser(c.req.param('username'))
    const { text } = parse(
      z.object({ text: z.string().trim().min(1, 'Schrijf eerst iets.').max(FORUM_LIMITS.comment, `Maximaal ${FORUM_LIMITS.comment} tekens.`) }),
      await c.req.json().catch(() => null),
    )
    const [row] = await db.insert(forumProfileComments).values({ profileUserId: user.id, authorId: me.id, text }).returning()
    return c.json({ id: row.id }, 201)
  })

  .delete('/forum/profile-comments/:id', async (c) => {
    const me = requireUser(c)
    const [row] = await db.select().from(forumProfileComments).where(eq(forumProfileComments.id, Number(c.req.param('id'))))
    if (!row || !(row.authorId === me.id || row.profileUserId === me.id || me.forumRole === 'admin')) throw notFound('Dit bericht bestaat niet (meer).')
    await db.delete(forumProfileComments).where(eq(forumProfileComments.id, row.id))
    return c.body(null, 204)
  })

  // Which sections the viewer can pick when moving a thread
  .get('/forum/moderated', async (c) => {
    const me = requireUser(c)
    const ids = await moderatedSections(me)
    if (!ids.length) return c.json([])
    const rows = await db.select({ slug: forumSections.slug, name: forumSections.name }).from(forumSections).where(inArray(forumSections.id, ids)).orderBy(asc(forumSections.position))
    return c.json(rows)
  })
