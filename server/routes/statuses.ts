import { POLL_LIMITS } from '../../shared/polls'
import { checkSoon } from '../lib/achievements'
import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { STATUS_MAX_LENGTH, STATUS_MAX_PHOTOS, type Page, type Status } from '../../shared/api'
import { MOODS } from '../../shared/moods'
import { PICKABLE_ICONS } from '../../shared/icons'
import { db } from '../db/client'
import { activities, glitters, kuddeMembers, statusPhotos, kuddePhotos, kuddes, photos, statusPollVotes, statuses, users, type User } from '../db/schema'
import { fillStatusPolls, loadSocial, statusPhotosFor, recordActivity, toStatusCore, visibleTo } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { glittersFor } from '../lib/glitters'
import { rateLimit } from '../lib/rateLimit'
import { deviceFrom } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, requireProfileAccess, summaryColumns } from '../lib/users'
import { friendsOf, notifyMentions, unnotify } from '../lib/notifications'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'
import { statusCreated, statusDeleted } from '../lib/federation/outbox'
import { fediverseAccounts } from '../lib/federation/servers'

const PAGE_SIZE = 10

const pollSchema = z.object({
  question: z.string().trim().min(1, 'Stel een vraag voor je poll.').max(POLL_LIMITS.question, `De vraag mag maximaal ${POLL_LIMITS.question} tekens hebben.`),
  options: z
    .array(z.string().trim().max(POLL_LIMITS.option, `Een antwoord mag maximaal ${POLL_LIMITS.option} tekens hebben.`))
    .transform((o) => o.filter(Boolean))
    .pipe(z.array(z.string()).min(2, 'Een poll heeft minstens 2 antwoorden.').max(POLL_LIMITS.options, `Maximaal ${POLL_LIMITS.options} antwoorden.`)),
})

const statusSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Wat doe je nu?')
    .max(STATUS_MAX_LENGTH, `Een WieWatWaar mag maximaal ${STATUS_MAX_LENGTH} tekens hebben.`),
  where: z
    .string()
    .trim()
    .max(60, 'De plek mag maximaal 60 tekens hebben.')
    .transform((s) => s || null)
    .nullable()
    .optional(),
  mood: z
    .string()
    .refine((m) => m in MOODS, 'Onbekend gevoel.')
    .nullable()
    .optional()
    .transform((m) => m || null),
  visibility: z.enum(['iedereen', 'vrienden']).default('iedereen'),
  icon: z.enum(PICKABLE_ICONS).nullable().optional(),
  /** Up to STATUS_MAX_PHOTOS photos, in order: the member's own (their Foto's box) or from an open Kudde they're in. */
  photos: z
    .array(z.object({ kind: z.enum(['eigen', 'kudde']), id: z.number().int().positive() }))
    .max(STATUS_MAX_PHOTOS, `Je kunt maximaal ${STATUS_MAX_PHOTOS} foto's toevoegen.`)
    .default([])
    // the same photo twice counts once
    .transform((list) => list.filter((p, i) => list.findIndex((q) => q.kind === p.kind && q.id === p.id) === i)),
  poll: pollSchema.nullable().optional(),
  glitterId: z.number().int().positive().nullable().optional(),
  /** Post as this Kudde (its owner only); it's always for everyone then. */
  kudde: z.string().max(60).nullable().optional(),
})

const cursor = (value: string | undefined) => {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Loads a page of statuses (only those the viewer may see) with respect and reactions. */
export async function loadStatuses(where: SQL | undefined, viewer: User | null, limit: number): Promise<Page<Status>> {
  const rows = await db
    .select({ status: statuses, user: summaryColumns, activityId: activities.id, kudde: { slug: kuddes.slug, name: kuddes.name, imagePath: kuddes.imagePath } })
    .from(statuses)
    .innerJoin(users, eq(users.id, statuses.userId))
    .innerJoin(activities, eq(activities.statusId, statuses.id))
    .leftJoin(kuddes, eq(kuddes.id, statuses.kuddeId))
    .where(and(visibleTo(viewer), where, notHidden('wiewatwaar', statuses.id)))
    .orderBy(desc(statuses.createdAt), desc(statuses.id))
    .limit(limit + 1)

  const page = rows.slice(0, limit)
  const [social, photoRows, glitterImages] = await Promise.all([
    loadSocial(page.map((r) => r.activityId), viewer),
    statusPhotosFor(page.map((r) => r.status.id)),
    glittersFor(page.map((r) => r.status.glitterId)),
  ])
  const items = page.map((r) => ({
    ...toStatusCore(r.status, r.user, photoRows.get(r.status.id) ?? [], viewer, (r.status.glitterId && glitterImages.get(r.status.glitterId)) || null, r.kudde),
    ...social.get(r.activityId)!,
  }))
  await fillStatusPolls(items, viewer)
  return { items, nextCursor: rows.length > limit ? page[page.length - 1].status.id : null }
}

export const statusRoutes = new Hono<AppEnv>()
  // The WieWatWaar feed on the homepage
  .get('/statuses', async (c) => {
    const before = cursor(c.req.query('before'))
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const conditions = [
      before ? sql`(${statuses.createdAt}, ${statuses.id}) < (select s.created_at, s.id from ${statuses} s where s.id = ${before})` : undefined,
      // Posts from Mastodon and the like are in Overzicht → Fediverse, not here
      sql`${statuses.userId} not in ${fediverseAccounts}`,
      q ? or(ilike(statuses.text, pattern), ilike(statuses.where, pattern), ilike(users.nickname, pattern), ilike(users.name, pattern)) : undefined,
    ]
    return c.json(await loadStatuses(and(...conditions), c.get('user'), PAGE_SIZE))
  })

  .get('/users/:username/statuses', async (c) => {
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(c.get('user'), user)
    const before = cursor(c.req.query('before'))
    const limit = Math.min(Number(c.req.query('limit')) || PAGE_SIZE, 50)
    return c.json(
      // The ones posted as a Kudde belong to the Kudde, not the profile
      await loadStatuses(and(eq(statuses.userId, user.id), isNull(statuses.kuddeId), before ? sql`(${statuses.createdAt}, ${statuses.id}) < (select s.created_at, s.id from ${statuses} s where s.id = ${before})` : undefined), c.get('user'), limit),
    )
  })

  .post('/statuses', rateLimit('WieWatWaar', 30, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(statusSchema, await c.req.json().catch(() => null))
    const ownIds = input.photos.filter((p) => p.kind === 'eigen').map((p) => p.id)
    const kuddeIds = input.photos.filter((p) => p.kind === 'kudde').map((p) => p.id)
    if (ownIds.length) {
      const found = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(inArray(photos.id, ownIds), eq(photos.userId, me.id)))
      if (found.length !== ownIds.length) throw new HttpError(400, 'Je kunt alleen je eigen foto’s toevoegen.', { photos: 'Onbekende foto.' })
    }
    // Kudde photos: from open Kuddes you're in (a besloten Kudde's photos stay in the Kudde)
    if (kuddeIds.length) {
      const found = await db
        .selectDistinct({ id: kuddePhotos.id })
        .from(kuddePhotos)
        .innerJoin(kuddes, eq(kuddes.id, kuddePhotos.kuddeId))
        .innerJoin(kuddeMembers, and(eq(kuddeMembers.kuddeId, kuddes.id), eq(kuddeMembers.userId, me.id)))
        .where(and(inArray(kuddePhotos.id, kuddeIds), eq(kuddes.visibility, 'openbaar'), eq(kuddes.photosShareable, true), inArray(kuddeMembers.role, ['owner', 'member'])))
      if (found.length !== kuddeIds.length) throw new HttpError(400, 'Je kunt alleen foto’s gebruiken van open Kuddes waar je lid van bent (en die dat toestaan).', { photos: 'Onbekende foto.' })
    }

    // As a Kudde: its owners and beheerders who may speak for it, and always for everyone
    const [asKudde] = input.kudde
      ? await db
          .select({ id: kuddes.id, slug: kuddes.slug })
          .from(kuddes)
          .innerJoin(
            kuddeMembers,
            and(
              eq(kuddeMembers.kuddeId, kuddes.id),
              eq(kuddeMembers.userId, me.id),
              or(eq(kuddeMembers.role, 'owner'), and(eq(kuddeMembers.role, 'member'), sql`'namens' = any(${kuddeMembers.rights})`)),
            ),
          )
          .where(eq(kuddes.slug, input.kudde))
      : []
    if (input.kudde && !asKudde) throw new HttpError(403, 'Je kunt alleen een WieWatWaar plaatsen namens een Kudde waarvoor je dat mag.')
    const visibility = asKudde ? 'iedereen' : input.visibility

    const [glitter] = input.glitterId ? await db.select({ id: glitters.id }).from(glitters).where(eq(glitters.id, input.glitterId)) : []
    if (input.glitterId && !glitter) throw new HttpError(400, 'Dit glitterplaatje bestaat niet (meer).', { glitterId: 'Onbekend glitterplaatje.' })

    const statusId = await db.transaction(async (tx) => {
      const [status] = await tx
        .insert(statuses)
        .values({
          userId: me.id,
          text: input.text,
          where: input.where ?? null,
          mood: input.mood,
          icon: input.icon ?? null,
          visibility,
          kuddeId: asKudde?.id ?? null,
          poll: input.poll ? { ...input.poll, closed: false } : null,
          glitterId: glitter?.id ?? null,
          device: deviceFrom(c.req.header('user-agent')),
        })
        .returning({ id: statuses.id })
      if (input.photos.length)
        await tx.insert(statusPhotos).values(input.photos.map((p, position) => ({ statusId: status.id, position, photoId: p.kind === 'eigen' ? p.id : null, kuddePhotoId: p.kind === 'kudde' ? p.id : null })))
      if (glitter) await tx.update(glitters).set({ uses: sql`${glitters.uses} + 1` }).where(eq(glitters.id, glitter.id))
      await recordActivity({ type: 'status', actorId: me.id, statusId: status.id, kuddeId: asKudde?.id ?? null, visibility }, tx)
      return status.id
    })

    if (input.poll) checkSoon(me.id)
    statusCreated(statusId)
    // Toezicht: the watching bot checks it (and can take it away again)
    checkPost({
      author: me,
      place: 'wiewatwaar',
      text: input.text,
      link: `/profiel/${me.username}`,
      remove: async () => {
        const [activity] = await db.select({ id: activities.id }).from(activities).where(eq(activities.statusId, statusId))
        await db.delete(statuses).where(eq(statuses.id, statusId))
        await unnotify(`status:${statusId}`)
        if (activity) await unnotify(`activity:${activity.id}`)
      },
    })
    // A friends-only WieWatWaar only notifies friends who are mentioned
    await notifyMentions({
      text: input.text,
      actorId: me.id,
      ref: `status:${statusId}`,
      message: 'noemde je in een WieWatWaar',
      link: asKudde ? `/kuddes/${asKudde.slug}` : `/profiel/${me.username}`,
      canSee: visibility === 'vrienden' ? (ids) => friendsOf(me.id, ids) : undefined,
    })
    const { items } = await loadStatuses(eq(statuses.id, statusId), me, 1)
    return c.json(items[0], 201)
  })

  // Vote in (or change your vote in) the poll of a WieWatWaar you can see
  .post('/statuses/:id/vote', rateLimit('stemmen', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const { items } = await loadStatuses(eq(statuses.id, id), me, 1)
    const status = items[0]
    if (!status) throw notFound('Deze WieWatWaar bestaat niet (meer).')
    if (!status.poll) throw new HttpError(400, 'Deze WieWatWaar heeft geen poll.')
    if (status.poll.closed) throw new HttpError(400, 'Deze poll is gesloten.')
    const { option } = parse(z.object({ option: z.number().int().min(0).max(status.poll.options.length - 1) }), await c.req.json().catch(() => null))
    await db.insert(statusPollVotes).values({ statusId: id, userId: me.id, option }).onConflictDoUpdate({ target: [statusPollVotes.statusId, statusPollVotes.userId], set: { option } })
    checkSoon(me.id)
    return c.json((await loadStatuses(eq(statuses.id, id), me, 1)).items[0])
  })

  .post('/statuses/:id/close', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const [row] = await db.select().from(statuses).where(and(eq(statuses.id, id), eq(statuses.userId, me.id)))
    if (!row?.poll) throw notFound('Deze poll bestaat niet (meer).')
    await db.update(statuses).set({ poll: { ...row.poll, closed: true } }).where(eq(statuses.id, id))
    return c.json((await loadStatuses(eq(statuses.id, id), me, 1)).items[0])
  })

  .delete('/statuses/:id', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const [activity] = await db.select({ id: activities.id }).from(activities).where(eq(activities.statusId, id))
    const [deleted] = await db
      .delete(statuses)
      .where(and(eq(statuses.id, id), eq(statuses.userId, me.id)))
      .returning({ id: statuses.id })
    if (!deleted) throw notFound()
    statusDeleted(me, id)
    await unnotify(`status:${id}`)
    if (activity) await unnotify(`activity:${activity.id}`)
    return c.body(null, 204)
  })
