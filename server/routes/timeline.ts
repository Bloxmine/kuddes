import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ActivityType } from '../../shared/api'
import { db } from '../db/client'
import { activities, activityComments, activityRespects, remoteFollows, statuses, users, type User } from '../db/schema'
import { loadSocial, loadTimeline, visibleTo } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { ONLINE_WINDOW_MS, toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { acceptedFriendsOf, summaryColumns } from '../lib/users'
import { friendsOf, notify, notifyMentions, unnotify } from '../lib/notifications'
import { HIDDEN_STATUS } from '../../shared/onlineStatus'
import { checkPost } from '../lib/moderation'
import { respected } from '../lib/federation/outbox'
import { fediverseAccounts } from '../lib/federation/servers'
import { refreshCounts, repliesOf } from '../lib/federation/api'
import { remoteOf } from '../lib/federation/actors'
import { withDefaults } from '../../shared/customization'
import { serverInfo } from '../lib/siteSettings'

const PAGE_SIZE = 20

/** The tabs on the timeline and which activity types they show. */
const TABS: Record<string, ActivityType[]> = {
  wiewatwaars: ['status'],
  fotos: ['photo', 'avatar'],
  knuffels: ['knuffel'],
  vrienden: ['friendship'],
  kuddes: ['kudde_join'],
  videos: ['video'],
  recepten: ['recipe'],
  recensies: ['review'],
  blogs: ['blog'],
  muziek: ['track'],
  radio: ['radio'],
  fotografie: ['photography'],
}

const commentSchema = z.object({
  text: z.string().trim().min(1, 'Schrijf een reactie.').max(500, 'Een reactie mag maximaal 500 tekens hebben.'),
})

/** A timeline item the viewer is allowed to see, or 404. */
async function findVisibleActivity(id: number, viewer: User) {
  const [row] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.id, id), visibleTo(viewer)))
  if (!row) throw notFound('Dit bericht bestaat niet (meer).')
  return row
}

/** What a reaction is on, in the notification ("reageerde op je WieWatWaar"). */
const ON_WHAT: Partial<Record<ActivityType, string>> = { status: 'je WieWatWaar', photo: 'je foto', knuffel: 'een knuffel van jou', video: 'je video', recipe: 'je recept', review: 'je recensie', blog: 'je blog', track: 'je nummer', radio: 'je uitzending', photography: 'je foto' }

/** A reaction tells the owner of what it's on, and whoever is mentioned in it (if they can see it). */
async function notifyComment(activityId: number, commentId: number, me: User, text: string) {
  const [a] = await db
    .select({ type: activities.type, ownerId: activities.actorId, visibility: activities.visibility, owner: users.username })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.actorId))
    .where(eq(activities.id, activityId))
  if (!a) return
  const ref = `activity:${activityId}/comment:${commentId}`
  const link = a.type === 'status' ? `/profiel/${a.owner}` : '/tijdlijn'
  await notify({ userIds: [a.ownerId], actorId: me.id, kind: 'reactie', ref, message: `reageerde op ${ON_WHAT[a.type] ?? 'iets van jou'}`, text, link })
  await notifyMentions({
    text,
    actorId: me.id,
    ref,
    message: 'noemde je in een reactie',
    link,
    // The owner already heard about it
    canSee: async (ids) => (a.visibility === 'vrienden' ? await friendsOf(a.ownerId, ids) : ids).filter((id) => id !== a.ownerId),
  })
}

/** Respect for a WieWatWaar from another server goes there too (as a Like). */
async function federateRespect(activityId: number, me: User, undo: boolean) {
  const [s] = await db
    .select({ apId: statuses.apId, userId: statuses.userId })
    .from(activities)
    .innerJoin(statuses, eq(statuses.id, activities.statusId))
    .where(eq(activities.id, activityId))
  if (s?.apId) respected(me, { userId: s.userId, objectUri: s.apId }, undo)
}

async function socialOf(id: number, viewer: User) {
  return (await loadSocial([id], viewer)).get(id)!
}

export const timelineRoutes = new Hono<AppEnv>()
  .get('/timeline', async (c) => {
    const types = TABS[c.req.query('tab') ?? '']
    const before = Number(c.req.query('before'))
    // "Vrienden": only you and your friends, and what's about you (a knuffel on your profile)
    const viewer = c.get('user')
    const friendsOnly = c.req.query('van') === 'vrienden' && viewer
    // Fediverse: posts of the accounts outside Kuddes you follow (or are friends with); the other tabs leave them out
    const fediverse = c.req.query('tab') === 'fediverse'
    if (fediverse && (!viewer || !serverInfo().fediverse)) return c.json({ items: [], nextCursor: null })
    // Posts from outside Kuddes that the viewer gets: of accounts they follow (or are friends with), or boosted by those
    const theirFediverse = viewer
      ? and(
          eq(activities.type, 'status'),
          or(
            and(
              sql`${activities.actorId} in ${fediverseAccounts}`,
              or(
                sql`${activities.actorId} in (select ${remoteFollows.targetId} from ${remoteFollows} where ${remoteFollows.followerId} = ${viewer.id})`,
                inArray(activities.actorId, acceptedFriendsOf(viewer.id)),
              ),
            ),
            sql`${activities.boostedById} in (select ${remoteFollows.targetId} from ${remoteFollows} where ${remoteFollows.followerId} = ${viewer.id})`,
          ),
        )
      : undefined
    const mixIn = !!viewer && serverInfo().fediverse && withDefaults(viewer.preferences).fediverseInOverzicht
    const where = and(
      fediverse
        ? theirFediverse
        : or(and(sql`${activities.actorId} not in ${fediverseAccounts}`, isNull(activities.boostedById)), mixIn ? theirFediverse : undefined),
      types ? inArray(activities.type, types) : undefined,
      friendsOnly ? or(eq(activities.actorId, viewer.id), eq(activities.targetUserId, viewer.id), inArray(activities.actorId, acceptedFriendsOf(viewer.id))) : undefined,
      // In date order: what's from before the last one shown (posts from elsewhere can come in later than they were written)
      Number.isInteger(before) && before > 0 ? sql`(${activities.createdAt}, ${activities.id}) < (select a.created_at, a.id from ${activities} a where a.id = ${before})` : undefined,
    )
    return c.json(await loadTimeline(where, c.get('user'), PAGE_SIZE))
  })

  // The replies on its own server to a post from Mastodon, Pixelfed and the like (read from there, not stored)
  .get('/activities/:id/fediverse-replies', rateLimit('fediverse-reacties', 120, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const activity = await findVisibleActivity(Number(c.req.param('id')), me)
    const [row] = await db
      .select({ userId: statuses.userId, apId: statuses.apId, remoteApiId: statuses.remoteApiId })
      .from(activities)
      .innerJoin(statuses, eq(statuses.id, activities.statusId))
      .where(eq(activities.id, activity.id))
    const remote = row?.apId ? await remoteOf(row.userId) : null
    if (!row || !remote || remote.actor.weide) return c.json([])
    // Not in the newest posts of their API yet: look once more
    if (!row.remoteApiId) {
      await refreshCounts(remote).catch(() => {})
      ;[row.remoteApiId] = (await db.select({ id: statuses.remoteApiId }).from(statuses).where(eq(statuses.apId, row.apId!))).map((r) => r.id)
    }
    return c.json(await repliesOf(remote, row).catch(() => []))
  })

  .post('/activities/:id/respect', rateLimit('respect', 200, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const activity = await findVisibleActivity(Number(c.req.param('id')), me)
    const [given] = await db.insert(activityRespects).values({ activityId: activity.id, userId: me.id }).onConflictDoNothing().returning()
    if (given) await federateRespect(activity.id, me, false)
    return c.json(await socialOf(activity.id, me))
  })

  .delete('/activities/:id/respect', async (c) => {
    const me = requireUser(c)
    const activity = await findVisibleActivity(Number(c.req.param('id')), me)
    const [taken] = await db
      .delete(activityRespects)
      .where(and(eq(activityRespects.activityId, activity.id), eq(activityRespects.userId, me.id)))
      .returning()
    if (taken) await federateRespect(activity.id, me, true)
    return c.json(await socialOf(activity.id, me))
  })

  .post('/activities/:id/comments', rateLimit('reacties', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const activity = await findVisibleActivity(Number(c.req.param('id')), me)
    const input = parse(commentSchema, await c.req.json().catch(() => null))
    const [comment] = await db.insert(activityComments).values({ activityId: activity.id, userId: me.id, text: input.text }).returning({ id: activityComments.id })
    await notifyComment(activity.id, comment.id, me, input.text)
    // Toezicht: the watching bot checks it (and can take it away again)
    checkPost({
      author: me,
      place: 'reactie',
      text: input.text,
      link: '/tijdlijn',
      remove: async () => {
        await db.delete(activityComments).where(eq(activityComments.id, comment.id))
        await unnotify(`activity:${activity.id}/comment:${comment.id}`)
      },
    })
    return c.json(await socialOf(activity.id, me), 201)
  })

  // The commenter, or the owner of the item, can remove a reaction
  .delete('/comments/:id', async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select({ activityId: activityComments.activityId, authorId: activityComments.userId, ownerId: activities.actorId })
      .from(activityComments)
      .innerJoin(activities, eq(activities.id, activityComments.activityId))
      .where(eq(activityComments.id, Number(c.req.param('id'))))
    if (!row) throw notFound()
    if (row.authorId !== me.id && row.ownerId !== me.id) throw new HttpError(403, 'Dit is niet jouw reactie.')
    await db.delete(activityComments).where(eq(activityComments.id, Number(c.req.param('id'))))
    await unnotify(`activity:${row.activityId}/comment:${c.req.param('id')}`)
    return c.json(await socialOf(row.activityId, me))
  })

  .get('/friends/online', async (c) => {
    const me = requireUser(c)
    const rows = await db
      .select(summaryColumns)
      .from(users)
      .where(
        and(
          inArray(users.id, acceptedFriendsOf(me.id)),
          gt(users.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_MS)),
          ne(users.onlineStatus, HIDDEN_STATUS),
        ),
      )
      .orderBy(desc(users.lastSeenAt))
      .limit(30)
    return c.json(rows.map(toSummary))
  })
