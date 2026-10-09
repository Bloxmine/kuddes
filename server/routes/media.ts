import { PICKABLE_ICONS } from '../../shared/icons'
/**
 * Recensies (shared/media.ts): the collection, reviews with stars and
 * respect, and putting an item in your kast (server/lib/mediaShelf.ts).
 */
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { COVER_COLORS, COVER_STYLES, DRINK_KINDS, GAME_PLATFORMS, SERIES_PLATFORMS, type CoverColor, type DrinkKind, type GamePlatform, type SeriesPlatform } from '../../shared/gadgets'
import {
  MEDIA_KIND_KEYS,
  MEDIA_LIMITS,
  MEDIA_PHOTO,
  MEDIA_SORTS,
  isMediaKind,
  mediaSlug,
  type MediaInput,
  type MediaItem,
  type MediaKind,
  type MediaList,
  type MediaReview,
  type MediaSort,
  type RecentReview,
} from '../../shared/media'
import { db } from '../db/client'
import { mediaItems, mediaReviewRespects, mediaReviews, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { putOnShelf, shelfState, shelvedBy, takeOffShelf, toMediaSummary } from '../lib/mediaShelf'
import { recordActivity } from '../lib/activities'
import { rateLimit } from '../lib/rateLimit'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, summaryColumns } from '../lib/users'

type ItemRow = typeof mediaItems.$inferSelect
type ReviewRow = typeof mediaReviews.$inferSelect

const text = (max: number, label: string) => z.string().trim().max(max, `${label} mag maximaal ${max} tekens hebben.`)
const stars = z.number({ message: 'Geef eerst sterren.' }).min(0.5, 'Geef minstens een halve ster.').max(5).multipleOf(0.5, 'Sterren gaan per halve.')

const itemSchema = z.object({
  kind: z.enum(MEDIA_KIND_KEYS as [MediaKind], { message: 'Kies wat het is.' }),
  title: text(MEDIA_LIMITS.title, 'De titel').min(1, 'Vul de titel in.'),
  creator: text(MEDIA_LIMITS.creator, 'De maker'),
  year: z.union([z.literal(''), z.string().regex(/^(18|19|20)\d\d$/, 'Vul een jaar in, zoals 1997.')]),
  genre: text(MEDIA_LIMITS.genre, 'Het genre'),
  description: text(MEDIA_LIMITS.description, 'De beschrijving'),
  color: z.enum(Object.keys(COVER_COLORS) as [CoverColor]),
  style: z.enum(COVER_STYLES),
  details: z.object({
    gamePlatform: z.enum(Object.keys(GAME_PLATFORMS) as [GamePlatform]).optional(),
    seriesPlatform: z.enum(Object.keys(SERIES_PLATFORMS) as [SeriesPlatform]).optional(),
    seasons: z.number().int().min(1).max(50).optional(),
    format: z.enum(['cd', 'lp']).optional(),
    drinkKind: z.enum(Object.keys(DRINK_KINDS) as [DrinkKind]).optional(),
    icon: z.enum(PICKABLE_ICONS).optional(),
  }),
  photo: z.string().regex(MEDIA_PHOTO, 'Upload de foto opnieuw.').nullable(),
}) satisfies z.ZodType<MediaInput, unknown>

/** A photo is named after who uploaded it: you can only use your own (or keep the one that's there). */
function checkPhoto(photo: string | null, me: User, kept: string | null = null) {
  if (photo && photo !== kept && MEDIA_PHOTO.exec(photo)?.[1] !== String(me.id)) throw new HttpError(400, 'Je kunt alleen je eigen foto’s gebruiken.')
}

const columns = ({ photo, ...input }: MediaInput) => ({ ...input, details: detailsFor(input.kind, input.details), slug: mediaSlug(input.title), photoPath: photo })

/** Only the details that belong to the kind. */
function detailsFor(kind: MediaKind, d: MediaInput['details']): MediaInput['details'] {
  const icon = d.icon ? { icon: d.icon } : {}
  if (kind === 'spellen') return { gamePlatform: d.gamePlatform ?? 'pc', ...icon }
  if (kind === 'series') return { seriesPlatform: d.seriesPlatform ?? 'anders', seasons: d.seasons ?? 1, ...icon }
  if (kind === 'muziek') return { format: d.format ?? 'cd', ...icon }
  if (kind === 'drank') return { drinkKind: d.drinkKind ?? 'speciaal', ...icon }
  return icon
}

async function respectedBy(viewer: User | null, ids: number[]) {
  if (!viewer || !ids.length) return new Set<number>()
  const rows = await db.select({ id: mediaReviewRespects.reviewId }).from(mediaReviewRespects).where(and(eq(mediaReviewRespects.userId, viewer.id), inArray(mediaReviewRespects.reviewId, ids)))
  return new Set(rows.map((r) => r.id))
}

const toReview = (r: ReviewRow, user: Parameters<typeof toSummary>[0], respected: Set<number>): MediaReview => ({
  id: r.id,
  user: toSummary(user),
  rating: r.rating,
  text: r.text,
  respect: r.respect,
  respected: respected.has(r.id),
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
})

const visibleReviewer = sql`${users.blockedAt} is null`

async function findItem(id: number) {
  const [row] = Number.isInteger(id) ? await db.select().from(mediaItems).where(eq(mediaItems.id, id)) : []
  if (!row) throw notFound('Dit staat (nog) niet in de collectie.')
  return row
}

/** The item's stars and number of reviews, counted again after a review changes. */
async function recount(itemId: number) {
  await db
    .update(mediaItems)
    .set({
      reviews: sql`(select count(*)::int from ${mediaReviews} where ${mediaReviews.itemId} = ${itemId})`,
      rating: sql`coalesce((select avg(${mediaReviews.rating}) from ${mediaReviews} where ${mediaReviews.itemId} = ${itemId}), 0)`,
      lastReviewAt: sql`(select max(${mediaReviews.createdAt}) from ${mediaReviews} where ${mediaReviews.itemId} = ${itemId})`,
    })
    .where(eq(mediaItems.id, itemId))
}

async function toItem(row: ItemRow, viewer: User | null): Promise<MediaItem> {
  const [adder] = row.addedBy ? await db.select(summaryColumns).from(users).where(eq(users.id, row.addedBy)) : []
  const spreadRows = await db
    .select({ stars: sql<number>`ceil(${mediaReviews.rating})::int`, n: count() })
    .from(mediaReviews)
    .where(eq(mediaReviews.itemId, row.id))
    .groupBy(sql`ceil(${mediaReviews.rating})`)
  const spread: MediaItem['spread'] = [0, 0, 0, 0, 0]
  for (const s of spreadRows) if (s.stars >= 1 && s.stars <= 5) spread[s.stars - 1] = s.n
  const [mine] = viewer ? await db.select().from(mediaReviews).where(and(eq(mediaReviews.itemId, row.id), eq(mediaReviews.userId, viewer.id))) : []
  return {
    ...toMediaSummary(row),
    addedBy: adder ? toSummary(adder) : null,
    canEdit: !!viewer && (viewer.forumRole === 'admin' || (row.addedBy === viewer.id && viewer.emailVerifiedAt !== null)),
    spread,
    mine: mine && viewer ? toReview(mine, viewer, await respectedBy(viewer, [mine.id])) : null,
    shelf: viewer ? await shelfState(viewer.id, row) : null,
    onShelves: await shelvedBy(row),
    createdAt: row.createdAt.toISOString(),
  }
}

const SORTS: Record<MediaSort, SQL[]> = {
  nieuwste: [sql`${mediaItems.lastReviewAt} desc nulls last`, desc(mediaItems.id)],
  beste: [desc(sql`case when ${mediaItems.reviews} > 0 then ${mediaItems.rating} else 0 end`), desc(mediaItems.reviews), asc(mediaItems.title)],
  meeste: [desc(mediaItems.reviews), desc(mediaItems.rating), asc(mediaItems.title)],
  alfabet: [asc(sql`lower(${mediaItems.title})`)],
}

export const mediaRoutes = new Hono<AppEnv>()
  // The collection: by kind, searched, sorted; or what one member reviewed (?van=)
  .get('/media', async (c) => {
    const kind = c.req.query('soort')
    const rawSort = c.req.query('sort') ?? 'nieuwste'
    const sort: MediaSort = rawSort in MEDIA_SORTS ? (rawSort as MediaSort) : 'nieuwste'
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const perPage = Math.min(Number(c.req.query('limit')) || MEDIA_LIMITS.perPage, 60)

    const scope: (SQL | undefined)[] = []
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      scope.push(or(ilike(mediaItems.title, like), ilike(mediaItems.creator, like), ilike(mediaItems.genre, like)))
    }
    const by = c.req.query('van')
    if (by) {
      const member = await findUser(by)
      scope.push(inArray(mediaItems.id, db.select({ id: mediaReviews.itemId }).from(mediaReviews).where(eq(mediaReviews.userId, member.id))))
    }
    const countRows = await db
      .select({ kind: mediaItems.kind, n: count() })
      .from(mediaItems)
      .where(and(...scope))
      .groupBy(mediaItems.kind)
    const counts = Object.fromEntries([['alles', 0], ...MEDIA_KIND_KEYS.map((k) => [k, 0])]) as MediaList['counts']
    for (const r of countRows) {
      if (isMediaKind(r.kind)) counts[r.kind] = r.n
      counts.alles += r.n
    }
    const total = isMediaKind(kind) ? counts[kind] : counts.alles
    const pages = Math.max(1, Math.ceil(total / perPage))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const rows = await db
      .select()
      .from(mediaItems)
      .where(and(...scope, isMediaKind(kind) ? eq(mediaItems.kind, kind) : undefined))
      .orderBy(...SORTS[sort])
      .limit(perPage)
      .offset((page - 1) * perPage)
    const result: MediaList = { items: rows.map(toMediaSummary), total, page, pages, counts }
    return c.json(result)
  })

  // The latest reviews (with text), for the side column
  .get('/media/recent', async (c) => {
    const viewer = c.get('user')
    const kind = c.req.query('soort')
    const limit = Math.min(Number(c.req.query('limit')) || 6, 20)
    const rows = await db
      .select({ review: mediaReviews, user: summaryColumns, item: mediaItems })
      .from(mediaReviews)
      .innerJoin(users, eq(users.id, mediaReviews.userId))
      .innerJoin(mediaItems, eq(mediaItems.id, mediaReviews.itemId))
      .where(and(visibleReviewer, sql`${mediaReviews.text} <> ''`, isMediaKind(kind) ? eq(mediaItems.kind, kind) : undefined))
      .orderBy(desc(mediaReviews.createdAt))
      .limit(limit)
    const respected = await respectedBy(viewer, rows.map((r) => r.review.id))
    const result: RecentReview[] = rows.map((r) => {
      const { id, slug, kind: k, title, creator, color, style, details, year, photoUrl } = toMediaSummary(r.item)
      return { ...toReview(r.review, r.user, respected), item: { id, slug, kind: k, title, creator, color, style, details, year, photoUrl } }
    })
    return c.json(result)
  })

  .get('/media/:id{[0-9]+}', async (c) => c.json(await toItem(await findItem(Number(c.req.param('id'))), c.get('user'))))

  // The reviews, most respected first or newest first
  .get('/media/:id{[0-9]+}/reviews', async (c) => {
    const viewer = c.get('user')
    const item = await findItem(Number(c.req.param('id')))
    const newest = c.req.query('sort') === 'nieuwste'
    const perPage = 10
    const [{ total }] = await db
      .select({ total: count() })
      .from(mediaReviews)
      .innerJoin(users, eq(users.id, mediaReviews.userId))
      .where(and(eq(mediaReviews.itemId, item.id), visibleReviewer))
    const pages = Math.max(1, Math.ceil(total / perPage))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const rows = await db
      .select({ review: mediaReviews, user: summaryColumns })
      .from(mediaReviews)
      .innerJoin(users, eq(users.id, mediaReviews.userId))
      .where(and(eq(mediaReviews.itemId, item.id), visibleReviewer))
      // Reviews with something to read before just stars
      .orderBy(...(newest ? [desc(mediaReviews.createdAt)] : [desc(sql`${mediaReviews.text} <> ''`), desc(mediaReviews.respect), desc(mediaReviews.createdAt)]))
      .limit(perPage)
      .offset((page - 1) * perPage)
    // A shared link to one review (?uitgelicht=): that one on top
    const featuredId = Number(c.req.query('uitgelicht')) || null
    const [featured] = featuredId
      ? await db
          .select({ review: mediaReviews, user: summaryColumns })
          .from(mediaReviews)
          .innerJoin(users, eq(users.id, mediaReviews.userId))
          .where(and(eq(mediaReviews.id, featuredId), eq(mediaReviews.itemId, item.id), visibleReviewer))
      : []
    const respected = await respectedBy(viewer, [...rows.map((r) => r.review.id), ...(featured ? [featured.review.id] : [])])
    return c.json({
      reviews: rows.filter((r) => r.review.id !== featured?.review.id).map((r) => toReview(r.review, r.user, respected)),
      featured: featured ? toReview(featured.review, featured.user, respected) : null,
      total,
      page,
      pages,
    })
  })

  // A photo for an item you add or edit; it's only kept once an item uses it
  .post(
    '/media/photos',
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die foto is te groot (max 8 MB).') } }),
    rateLimit('recensiefoto’s', 60, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const body = await c.req.parseBody()
      const stored = await storeImage(body.file, 'media', `${me.id}-`)
      return c.json({ path: stored.path, url: uploadUrl(stored.path) }, 201)
    },
  )

  // Something new in the collection (not when it's there already)
  .post('/media', rateLimit('recensies toevoegen', 40, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(itemSchema, await c.req.json().catch(() => null))
    checkPhoto(input.photo, me)
    const [existing] = await db
      .select({ id: mediaItems.id, slug: mediaItems.slug })
      .from(mediaItems)
      .where(and(eq(mediaItems.kind, input.kind), sql`lower(${mediaItems.title}) = lower(${input.title})`, sql`lower(${mediaItems.creator}) = lower(${input.creator})`))
    if (existing) throw new HttpError(409, `Dit staat al in de collectie: /recensies/${existing.id}-${existing.slug}`, undefined, `bestaat:${existing.id}-${existing.slug}`)
    const [row] = await db
      .insert(mediaItems)
      .values({ ...columns(input), addedBy: me.id })
      .returning()
    return c.json(await toItem(row, me), 201)
  })

  // Who added it (and the admin) can correct it
  .patch('/media/:id{[0-9]+}', rateLimit('recensies bewerken', 200, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const item = await findItem(Number(c.req.param('id')))
    if (me.forumRole !== 'admin' && item.addedBy !== me.id) throw new HttpError(403, 'Alleen wie dit heeft toegevoegd kan het aanpassen.')
    const input = parse(itemSchema, await c.req.json().catch(() => null))
    checkPhoto(input.photo, me, item.photoPath)
    const [row] = await db
      .update(mediaItems)
      .set(columns(input))
      .where(eq(mediaItems.id, item.id))
      .returning()
      .catch((e: unknown) => {
        if (String((e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code) === '23505') throw new HttpError(409, 'Er staat al iets met deze titel en maker in de collectie.')
        throw e
      })
    if (item.photoPath && item.photoPath !== row.photoPath) await removeUpload(item.photoPath)
    return c.json(await toItem(row, me))
  })

  // Removing: the admin, or who added it as long as nobody else reviewed it
  .delete('/media/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const item = await findItem(Number(c.req.param('id')))
    const [{ others }] = await db
      .select({ others: count() })
      .from(mediaReviews)
      .where(and(eq(mediaReviews.itemId, item.id), sql`${mediaReviews.userId} <> ${me.id}`))
    if (me.forumRole !== 'admin' && (item.addedBy !== me.id || others > 0)) throw new HttpError(403, 'Dit kun je niet (meer) weghalen: anderen hebben er al een recensie over geschreven.')
    await db.delete(mediaItems).where(eq(mediaItems.id, item.id))
    await removeUpload(item.photoPath)
    return c.body(null, 204)
  })

  // Your review: stars, and what you thought (writing again changes it)
  .put('/media/:id{[0-9]+}/review', rateLimit('recensies', 120, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const item = await findItem(Number(c.req.param('id')))
    const input = parse(z.object({ rating: stars, text: text(MEDIA_LIMITS.review, 'Je recensie') }), await c.req.json().catch(() => null))
    const [saved] = await db
      .insert(mediaReviews)
      .values({ itemId: item.id, userId: me.id, ...input })
      .onConflictDoUpdate({ target: [mediaReviews.itemId, mediaReviews.userId], set: { ...input, updatedAt: new Date() } })
      // xmax is 0 for a row that was just inserted, not updated
      .returning({ id: mediaReviews.id, isNew: sql<boolean>`xmax = 0` })
    await recount(item.id)
    // A new review goes on the timeline (changing it later doesn't post it again)
    if (saved.isNew) await recordActivity({ type: 'review', actorId: me.id, mediaReviewId: saved.id })
    return c.json(await toItem(await findItem(item.id), me))
  })

  .delete('/media/:id{[0-9]+}/review', async (c) => {
    const me = requireUser(c)
    const item = await findItem(Number(c.req.param('id')))
    await db.delete(mediaReviews).where(and(eq(mediaReviews.itemId, item.id), eq(mediaReviews.userId, me.id)))
    await recount(item.id)
    return c.json(await toItem(await findItem(item.id), me))
  })

  // Respect for a review
  .post('/media/reviews/:id{[0-9]+}/respect', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const [review] = await db.select().from(mediaReviews).where(eq(mediaReviews.id, Number(c.req.param('id'))))
    if (!review) throw notFound('Deze recensie bestaat niet (meer).')
    if (review.userId === me.id) throw new HttpError(400, 'Je kunt je eigen recensie geen respect geven.')
    const added = await db.insert(mediaReviewRespects).values({ reviewId: review.id, userId: me.id }).onConflictDoNothing().returning()
    const [r] = added.length ? await db.update(mediaReviews).set({ respect: sql`${mediaReviews.respect} + 1` }).where(eq(mediaReviews.id, review.id)).returning() : [review]
    return c.json({ respect: r.respect, respected: true })
  })

  .delete('/media/reviews/:id{[0-9]+}/respect', async (c) => {
    const me = requireUser(c)
    const [review] = await db.select().from(mediaReviews).where(eq(mediaReviews.id, Number(c.req.param('id'))))
    if (!review) throw notFound('Deze recensie bestaat niet (meer).')
    const removed = await db.delete(mediaReviewRespects).where(and(eq(mediaReviewRespects.reviewId, review.id), eq(mediaReviewRespects.userId, me.id))).returning()
    const [r] = removed.length ? await db.update(mediaReviews).set({ respect: sql`greatest(${mediaReviews.respect} - 1, 0)` }).where(eq(mediaReviews.id, review.id)).returning() : [review]
    return c.json({ respect: r.respect, respected: false })
  })

  // In your kast: with your stars and a bit of your review (or your own words)
  .put('/media/:id{[0-9]+}/shelf', rateLimit('kasten', 200, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const item = await findItem(Number(c.req.param('id')))
    const input = parse(z.object({ rating: z.number().min(0).max(5).multipleOf(0.5), note: text(MEDIA_LIMITS.snippet, 'Het stukje voor je kast') }), await c.req.json().catch(() => null))
    const result = await putOnShelf(me.id, item, input.rating, input.note)
    return c.json({ ...result, item: await toItem(item, me) })
  })

  .delete('/media/:id{[0-9]+}/shelf', async (c) => {
    const me = requireUser(c)
    const item = await findItem(Number(c.req.param('id')))
    await takeOffShelf(me.id, item)
    return c.json(await toItem(item, me))
  })
