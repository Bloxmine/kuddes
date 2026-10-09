import { createReadStream, createWriteStream } from 'node:fs'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { and, count, desc, eq, ilike, inArray, lt, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { clientIp } from '../lib/clientIp'
import { z } from 'zod'
import type { Page, VideoComment, VideoCommentPage, VideoDetail } from '../../shared/api'
import { COMMENT_VOTES, isVideoCategory, VIDEO_CATEGORIES, VIDEO_LIMITS, VIDEO_REQUEST_LIMITS, VIDEO_TYPES, VIDEO_UPLOAD_REASONS, type VideoCategory, type VideoUploadReason } from '../../shared/videos'
import { config } from '../config'
import { db } from '../db/client'
import { users, videoCommentVotes, videoComments, videoFavorites, videoRatings, videoUploadRequests, videos, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl } from '../lib/serialize'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { bodyLimit } from 'hono/body-limit'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, summaryColumns } from '../lib/users'
import { admins, deliverMessage, mayUploadVideos, requestMessage, uploadAccess } from '../lib/videoAccess'
import { enqueueVideo, tempFile } from '../lib/videoProcessing'
import { newPublicId, ratingAvg, relatedScore, selectVideos, toVideoSummary, videoVisibleTo } from '../lib/videos'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'

const PAGE_SIZE = 20
const VIEW_DEDUPE_MS = 30 * 60 * 1000

const metaSchema = z.object({
  title: z.string().trim().min(1, 'Geef je video een titel.').max(VIDEO_LIMITS.title, `Een titel mag maximaal ${VIDEO_LIMITS.title} tekens hebben.`),
  description: z.string().trim().max(VIDEO_LIMITS.description, `Een beschrijving mag maximaal ${VIDEO_LIMITS.description} tekens hebben.`).default(''),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(VIDEO_LIMITS.tag, `Een tag mag maximaal ${VIDEO_LIMITS.tag} tekens hebben.`))
    .max(VIDEO_LIMITS.tags, `Maximaal ${VIDEO_LIMITS.tags} tags.`)
    .transform((t) => [...new Set(t)])
    .default([]),
  category: z.string().refine(isVideoCategory, 'Kies een categorie.').default('overig'),
  visibility: z.enum(['openbaar', 'verborgen', 'vrienden']).default('openbaar'),
})

/** A video the viewer may open by its link, or a 404 (also for ones they may not see). */
async function watchable(publicId: string, viewer: User | null) {
  const [row] = await selectVideos()
    .where(and(eq(videos.publicId, publicId), videoVisibleTo(viewer, 'link')))
    .limit(1)
  if (!row) throw notFound('Deze video bestaat niet (meer) of je mag hem niet bekijken.')
  return row
}

async function ownVideo(publicId: string, me: User) {
  const [row] = await db
    .select()
    .from(videos)
    .where(and(eq(videos.publicId, publicId), eq(videos.userId, me.id)))
  if (!row) throw notFound('Deze video bestaat niet (meer).')
  return row
}

/** Deletes a video's files (converted video, thumbnail and any unprocessed upload). */
export async function removeFiles(v: typeof videos.$inferSelect) {
  const files = [v.filePath, v.thumbPath].filter((p): p is string => !!p).map((p) => path.join(config.uploadDir, p))
  await Promise.all([...files.map((f) => rm(f, { force: true })), rm(tempFile(v.id), { force: true })])
}

// Views count once per visitor per half hour
const recentViews = new Map<string, number>()

export const videoRoutes = new Hono<AppEnv>()
  /**
   * Lists and search. sort: nieuwste | meest-bekeken | best-beoordeeld | nu
   * (being watched now). Only public videos (and friends' friends-only ones).
   */
  .get('/videos', async (c) => {
    const viewer = c.get('user')
    const sort = c.req.query('sort') ?? 'nieuwste'
    const category = c.req.query('category')
    const tag = (c.req.query('tag') ?? '').trim().toLowerCase().slice(0, VIDEO_LIMITS.tag)
    const q = (c.req.query('q') ?? '').trim().slice(0, 80)
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const limit = Math.min(Number(c.req.query('limit')) || PAGE_SIZE, 50)
    const offset = Math.max(Number(c.req.query('offset')) || 0, 0)
    const order =
      sort === 'meest-bekeken'
        ? [desc(videos.views), desc(videos.id)]
        : sort === 'best-beoordeeld'
          ? [desc(ratingAvg), desc(videos.views)]
          : sort === 'nu'
            ? [sql`${videos.lastViewedAt} desc nulls last`, desc(videos.id)]
            : [desc(videos.id)]
    const rows = await selectVideos()
      .where(
        and(
          videoVisibleTo(viewer, 'lijst'),
          eq(videos.status, 'klaar'),
          isVideoCategory(category) ? eq(videos.category, category) : undefined,
          tag ? sql`${tag} = any(${videos.tags})` : undefined,
          q
            ? or(ilike(videos.title, pattern), ilike(videos.description, pattern), sql`${q.toLowerCase()} = any(${videos.tags})`, ilike(users.nickname, pattern))
            : undefined,
        ),
      )
      .orderBy(...order)
      .limit(limit + 1)
      .offset(offset)
    const result: Page<ReturnType<typeof toVideoSummary>> = {
      items: rows.slice(0, limit).map(toVideoSummary),
      nextCursor: rows.length > limit ? offset + limit : null,
    }
    return c.json(result)
  })

  /**
   * "Aanbevolen voor jou": videos sharing tags with what you rated highly,
   * favourited or commented on, that you haven't rated yet. Popular ones
   * for visitors and new members.
   */
  .get('/videos/aanbevolen', async (c) => {
    const viewer = c.get('user')
    const limit = Math.min(Number(c.req.query('limit')) || 8, 24)
    let tags: string[] = []
    if (viewer) {
      const liked = await db
        .select({ tags: videos.tags })
        .from(videos)
        .where(
          or(
            inArray(videos.id, db.select({ id: videoRatings.videoId }).from(videoRatings).where(and(eq(videoRatings.userId, viewer.id), sql`${videoRatings.stars} >= 4`))),
            inArray(videos.id, db.select({ id: videoFavorites.videoId }).from(videoFavorites).where(eq(videoFavorites.userId, viewer.id))),
            inArray(videos.id, db.select({ id: videoComments.videoId }).from(videoComments).where(eq(videoComments.userId, viewer.id))),
          ),
        )
        .limit(50)
      const counts = new Map<string, number>()
      for (const t of liked.flatMap((l) => l.tags)) counts.set(t, (counts.get(t) ?? 0) + 1)
      tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
    }
    const tagArray = tags.length ? sql`array[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]` : sql`'{}'::text[]`
    const rows = await selectVideos()
      .where(
        and(
          videoVisibleTo(viewer, 'lijst'),
          eq(videos.status, 'klaar'),
          viewer ? ne(videos.userId, viewer.id) : undefined,
          viewer
            ? sql`${videos.id} not in (select ${videoRatings.videoId} from ${videoRatings} where ${videoRatings.userId} = ${viewer.id})`
            : undefined,
        ),
      )
      .orderBy(
        desc(sql`cardinality(array(select unnest(${videos.tags}) intersect select unnest(${tagArray}))) * 3 + ln(${videos.views} + 1) * 0.5 + ${ratingAvg} * 0.4`),
        desc(videos.id),
      )
      .limit(limit)
    return c.json(rows.map(toVideoSummary))
  })

  .get('/videos/categorieen', async (c) => {
    const viewer = c.get('user')
    const rows = await db
      .select({ category: videos.category, n: count() })
      .from(videos)
      .where(and(videoVisibleTo(viewer, 'lijst'), eq(videos.status, 'klaar')))
      .groupBy(videos.category)
    return c.json(Object.fromEntries(Object.keys(VIDEO_CATEGORIES).map((k) => [k, rows.find((r) => r.category === k)?.n ?? 0])))
  })

  // Who a channel belongs to, for its header (the profile itself is for members only)
  .get('/users/:username/channel', async (c) => {
    const user = await findUser(c.req.param('username'))
    // The featured video only while it's still a public, ready video of theirs
    const [featured] = user.channelFeatured
      ? await db
          .select({ id: videos.publicId })
          .from(videos)
          .where(and(eq(videos.publicId, user.channelFeatured), eq(videos.userId, user.id), eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar')))
      : []
    return c.json({
      user: toSummary(user),
      createdAt: user.createdAt.toISOString(),
      bannerUrl: uploadUrl(user.channelBannerPath),
      bannerY: user.channelBannerY,
      description: user.channelDescription,
      featured: featured?.id ?? null,
    })
  })

  // What the channel says about itself, and which video is big at the top
  .put('/me/channel', rateLimit('kanaal', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(
      z.object({ description: z.string().trim().max(VIDEO_LIMITS.channelDescription, `Maximaal ${VIDEO_LIMITS.channelDescription} tekens.`), featured: z.string().trim().max(40).nullable() }),
      await c.req.json().catch(() => null),
    )
    if (input.featured) {
      const [own] = await db
        .select({ id: videos.id })
        .from(videos)
        .where(and(eq(videos.publicId, input.featured), eq(videos.userId, me.id), eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar')))
      if (!own) throw new HttpError(400, 'Kies een van je eigen openbare video’s.')
    }
    await db.update(users).set({ channelDescription: input.description, channelFeatured: input.featured }).where(eq(users.id, me.id))
    return c.body(null, 204)
  })

  // The wide image at the top of your channel (a new picture and/or where it's cropped)
  .put(
    '/me/channel-banner',
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).') } }),
    rateLimit('banners', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const body = await c.req.parseBody()
      const y = Math.min(100, Math.max(0, Math.round(Number(body.y ?? me.channelBannerY)))) || 0
      const stored = body.file instanceof File && body.file.size > 0 ? await storeImage(body.file, 'banners') : null
      await db.update(users).set({ channelBannerY: y, ...(stored && { channelBannerPath: stored.path }) }).where(eq(users.id, me.id))
      if (stored) await removeUpload(me.channelBannerPath)
      return c.json({ bannerUrl: uploadUrl(stored?.path ?? me.channelBannerPath), bannerY: y })
    },
  )

  .delete('/me/channel-banner', async (c) => {
    const me = requireUser(c)
    await db.update(users).set({ channelBannerPath: null }).where(eq(users.id, me.id))
    await removeUpload(me.channelBannerPath)
    return c.body(null, 204)
  })

  // A member's channel: their uploads, or their favourites
  .get('/users/:username/videos', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const tab = c.req.query('tab') === 'favorieten' ? 'favorieten' : 'uploads'
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const rows =
      tab === 'uploads'
        ? await selectVideos()
            .where(and(eq(videos.userId, user.id), videoVisibleTo(viewer, viewer?.id === user.id ? 'link' : 'lijst')))
            .orderBy(desc(videos.id))
            .limit(limit)
        : await selectVideos()
            .innerJoin(videoFavorites, eq(videoFavorites.videoId, videos.id))
            .where(and(eq(videoFavorites.userId, user.id), videoVisibleTo(viewer, 'lijst'), eq(videos.status, 'klaar')))
            .orderBy(desc(videoFavorites.createdAt))
            .limit(limit)
    return c.json(rows.map(toVideoSummary))
  })

  .get('/videos/:id', async (c) => {
    const viewer = c.get('user')
    const row = await watchable(c.req.param('id'), viewer)
    const v = row.video
    const [[fav], [comments], mine, favorited] = await Promise.all([
      db.select({ n: count() }).from(videoFavorites).where(eq(videoFavorites.videoId, v.id)),
      db.select({ n: count() }).from(videoComments).where(eq(videoComments.videoId, v.id)),
      viewer ? db.select({ stars: videoRatings.stars }).from(videoRatings).where(and(eq(videoRatings.videoId, v.id), eq(videoRatings.userId, viewer.id))) : Promise.resolve([]),
      viewer
        ? db.select({ n: count() }).from(videoFavorites).where(and(eq(videoFavorites.videoId, v.id), eq(videoFavorites.userId, viewer.id))).then(([r]) => r.n > 0)
        : Promise.resolve(false),
    ])
    const isOwner = viewer?.id === v.userId
    const detail: VideoDetail = {
      ...toVideoSummary(row),
      description: v.description,
      fileUrl: v.status === 'klaar' ? `/api/videos/${v.publicId}/file` : null,
      width: v.width,
      height: v.height,
      myRating: mine[0]?.stars ?? null,
      favorited,
      favoriteCount: fav.n,
      commentCount: comments.n,
      canEdit: isOwner,
      error: isOwner ? v.error : null,
    }
    return c.json(detail)
  })

  // Streams the MP4, with Range support so the player can seek
  .get('/videos/:id/file', async (c) => {
    const viewer = c.get('user')
    const { video: v } = await watchable(c.req.param('id'), viewer)
    if (v.status !== 'klaar' || !v.filePath) throw notFound()
    const file = path.join(config.uploadDir, v.filePath)
    const { size } = await stat(file).catch(() => {
      throw notFound()
    })
    const range = c.req.header('range')?.match(/^bytes=(\d*)-(\d*)$/)
    let start = 0
    let end = size - 1
    if (range) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start > end || start >= size) {
        return c.body(null, 416, { 'Content-Range': `bytes */${size}` })
      }
    }
    const headers: Record<string, string> = {
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      // Friends-only videos must not end up in shared caches
      'Cache-Control': v.visibility === 'openbaar' ? 'public, max-age=86400' : 'private, max-age=3600',
    }
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return c.body(stream, range ? 206 : 200, headers)
  })

  // Counted when playback starts, not on page load
  .post('/videos/:id/view', async (c) => {
    const viewer = c.get('user')
    const { video: v } = await watchable(c.req.param('id'), viewer)
    const who = viewer ? `u${viewer.id}` : `ip${clientIp(c)}`
    const key = `${who}:${v.id}`
    const now = Date.now()
    if (viewer?.id !== v.userId && (recentViews.get(key) ?? 0) < now - VIEW_DEDUPE_MS) {
      recentViews.set(key, now)
      if (recentViews.size > 50_000) recentViews.clear()
      await db.update(videos).set({ views: sql`${videos.views} + 1`, lastViewedAt: new Date() }).where(eq(videos.id, v.id))
    } else {
      await db.update(videos).set({ lastViewedAt: new Date() }).where(eq(videos.id, v.id))
    }
    return c.body(null, 204)
  })

  .get('/videos/:id/related', async (c) => {
    const viewer = c.get('user')
    const { video: v } = await watchable(c.req.param('id'), viewer)
    const rows = await selectVideos()
      .where(and(videoVisibleTo(viewer, 'lijst'), eq(videos.status, 'klaar'), ne(videos.id, v.id)))
      .orderBy(desc(relatedScore(v)), desc(videos.id))
      .limit(Math.min(Number(c.req.query('limit')) || 12, 24))
    return c.json(rows.map(toVideoSummary))
  })

  // May you upload? New members ask the admin first (watching is always allowed)
  .get('/me/video-access', async (c) => c.json(await uploadAccess(requireUser(c))))

  .post('/me/video-access', rateLimit('uploadrechten aanvragen', 3, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(
      z.object({
        reasons: z
          .array(z.enum(Object.keys(VIDEO_UPLOAD_REASONS) as [VideoUploadReason]))
          .min(1, 'Kies minstens één reden.')
          .max(Object.keys(VIDEO_UPLOAD_REASONS).length),
        motivation: z.string().trim().max(VIDEO_REQUEST_LIMITS.motivation, `Maximaal ${VIDEO_REQUEST_LIMITS.motivation} tekens.`),
        agree: z.literal(true, { message: 'Je moet akkoord gaan met de regels.' }),
      }),
      await c.req.json().catch(() => null),
    )
    if (mayUploadVideos(me)) throw new HttpError(409, 'Je mag al video’s uploaden.')
    if (input.reasons.includes('anders') && input.motivation.length < 10) {
      throw new HttpError(400, 'Vertel kort waarvoor je video’s wilt uploaden.', { motivation: 'Vertel kort waarvoor je video’s wilt uploaden.' })
    }
    const reasons = [...new Set(input.reasons)]
    const [row] = await db
      .insert(videoUploadRequests)
      .values({ userId: me.id, reasons, motivation: input.motivation })
      .onConflictDoNothing()
      .returning()
    if (!row) throw new HttpError(409, 'Je aanvraag ligt al bij de beheerder.')
    // The admin gets it in their inbox
    for (const admin of await admins()) {
      await deliverMessage(me.id, admin.id, `Aanvraag: video's uploaden (@${me.username})`, requestMessage(me, reasons, input.motivation))
    }
    return c.json(await uploadAccess(me), 201)
  })

  // Step 1 of uploading: the details. Step 2 is PUT …/file.
  .post('/videos', rateLimit('video’s uploaden', 20, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    if (!mayUploadVideos(me)) throw new HttpError(403, 'Je mag nog geen video’s uploaden. Vraag het aan op de uploadpagina.')
    const input = parse(metaSchema, await c.req.json().catch(() => null))
    const [{ n }] = await db
      .select({ n: count() })
      .from(videos)
      .where(and(eq(videos.userId, me.id), inArray(videos.status, ['uploaden', 'verwerken'])))
    if (n >= 3) throw new HttpError(429, 'Wacht even tot je andere video’s klaar zijn.')
    const [row] = await db
      .insert(videos)
      .values({ publicId: newPublicId(), userId: me.id, title: input.title, description: input.description, tags: input.tags, category: input.category as VideoCategory, visibility: input.visibility })
      .returning()
    return c.json({ id: row.publicId }, 201)
  })

  // Step 2: the file itself as the raw request body, streamed to disk
  .put('/videos/:id/file', async (c) => {
    const me = requireUser(c)
    const v = await ownVideo(c.req.param('id'), me)
    if (!mayUploadVideos(me)) throw new HttpError(403, 'Je mag geen video’s uploaden.')
    if (v.status !== 'uploaden') throw new HttpError(409, 'Voor deze video is al een bestand geüpload.')
    const type = (c.req.header('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!VIDEO_TYPES.includes(type)) throw new HttpError(415, 'Dit soort bestand kunnen we niet gebruiken. Kies een MP4, MOV, WebM of MKV.')
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > VIDEO_LIMITS.bytes) throw new HttpError(413, `Deze video is te groot (maximaal ${VIDEO_LIMITS.bytes / 1024 / 1024} MB).`)
    const body = c.req.raw.body
    if (!body) throw new HttpError(400, 'Er kwam geen bestand mee.')

    let received = 0
    const limit = new Transform({
      transform(chunk: Buffer, _enc, done) {
        received += chunk.length
        if (received > VIDEO_LIMITS.bytes) done(new HttpError(413, `Deze video is te groot (maximaal ${VIDEO_LIMITS.bytes / 1024 / 1024} MB).`))
        else done(null, chunk)
      },
    })
    const target = tempFile(v.id)
    try {
      await pipeline(Readable.fromWeb(body as import('node:stream/web').ReadableStream), limit, createWriteStream(target))
    } catch (e) {
      await rm(target, { force: true })
      if (e instanceof HttpError) throw e
      throw new HttpError(400, 'Het uploaden is onderbroken. Probeer het nog eens.')
    }
    if (received === 0) {
      await rm(target, { force: true })
      throw new HttpError(400, 'Het bestand is leeg.')
    }
    await db.update(videos).set({ status: 'verwerken' }).where(eq(videos.id, v.id))
    enqueueVideo(v.id)
    return c.json({ id: v.publicId, status: 'verwerken' })
  })

  .patch('/videos/:id', async (c) => {
    const me = requireUser(c)
    const v = await ownVideo(c.req.param('id'), me)
    const input = parse(metaSchema.partial(), await c.req.json().catch(() => null))
    await db
      .update(videos)
      .set({ ...input, category: input.category as VideoCategory | undefined })
      .where(eq(videos.id, v.id))
    return c.json({ id: v.publicId })
  })

  .delete('/videos/:id', async (c) => {
    const me = requireUser(c)
    const v = await ownVideo(c.req.param('id'), me)
    await db.delete(videos).where(eq(videos.id, v.id))
    await removeFiles(v)
    return c.body(null, 204)
  })

  .post('/videos/:id/rating', rateLimit('beoordelen', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { video: v } = await watchable(c.req.param('id'), me)
    if (v.status !== 'klaar') throw new HttpError(400, 'Deze video wordt nog verwerkt.')
    if (v.userId === me.id) throw new HttpError(400, 'Je kunt je eigen video niet beoordelen.')
    const { stars } = parse(z.object({ stars: z.number().int().min(1, 'Kies 1 tot 5 sterren.').max(5, 'Kies 1 tot 5 sterren.') }), await c.req.json().catch(() => null))
    await db
      .insert(videoRatings)
      .values({ videoId: v.id, userId: me.id, stars })
      .onConflictDoUpdate({ target: [videoRatings.videoId, videoRatings.userId], set: { stars } })
    const [r] = await db
      .select({ avg: sql<number>`coalesce(avg(${videoRatings.stars}), 0)::float`, n: count() })
      .from(videoRatings)
      .where(eq(videoRatings.videoId, v.id))
    return c.json({ rating: Math.round(r.avg * 10) / 10, ratingCount: r.n, myRating: stars })
  })

  .post('/videos/:id/favorite', async (c) => {
    const me = requireUser(c)
    const { video: v } = await watchable(c.req.param('id'), me)
    await db.insert(videoFavorites).values({ videoId: v.id, userId: me.id }).onConflictDoNothing()
    return c.json({ favorited: true })
  })

  .delete('/videos/:id/favorite', async (c) => {
    const me = requireUser(c)
    const { video: v } = await watchable(c.req.param('id'), me)
    await db.delete(videoFavorites).where(and(eq(videoFavorites.videoId, v.id), eq(videoFavorites.userId, me.id)))
    return c.json({ favorited: false })
  })

  .get('/videos/:id/comments', async (c) => {
    const viewer = c.get('user')
    const { video: v } = await watchable(c.req.param('id'), viewer)
    const before = Number(c.req.query('before')) || null
    const select = () => db.select({ comment: videoComments, user: summaryColumns }).from(videoComments).innerJoin(users, eq(users.id, videoComments.userId))
    const [rows, topRows] = await Promise.all([
      select()
        .where(and(eq(videoComments.videoId, v.id), before ? lt(videoComments.id, before) : undefined, notHidden('video', videoComments.id)))
        .orderBy(desc(videoComments.id))
        .limit(PAGE_SIZE + 1),
      // The best two, above the rest (on the first page)
      before
        ? Promise.resolve([])
        : select()
            .where(and(eq(videoComments.videoId, v.id), sql`${videoComments.likes} >= ${COMMENT_VOTES.topMinLikes}`, sql`${videoComments.likes} > ${videoComments.dislikes}`))
            .orderBy(desc(sql`${videoComments.likes} - ${videoComments.dislikes}`), desc(videoComments.likes), desc(videoComments.id))
            .limit(COMMENT_VOTES.top),
    ])
    const page = rows.slice(0, PAGE_SIZE)
    const ids = [...page, ...topRows].map((r) => r.comment.id)
    const mine = viewer && ids.length ? await db.select().from(videoCommentVotes).where(and(eq(videoCommentVotes.userId, viewer.id), inArray(videoCommentVotes.commentId, ids))) : []
    const toComment = ({ comment, user }: (typeof rows)[number]): VideoComment => ({
      id: comment.id,
      user: toSummary(user),
      text: comment.text,
      createdAt: comment.createdAt.toISOString(),
      canDelete: !!viewer && (viewer.id === comment.userId || viewer.id === v.userId),
      likes: comment.likes,
      dislikes: comment.dislikes,
      myVote: (mine.find((m) => m.commentId === comment.id)?.vote ?? 0) as -1 | 0 | 1,
      canVote: !!viewer && viewer.id !== comment.userId,
      hidden: comment.dislikes - comment.likes >= COMMENT_VOTES.hideAt,
    })
    const result: VideoCommentPage = {
      items: page.map(toComment),
      top: topRows.map(toComment),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].comment.id : null,
    }
    return c.json(result)
  })

  .post('/videos/:id/comments', rateLimit('reacties', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const { video: v } = await watchable(c.req.param('id'), me)
    const { text } = parse(
      z.object({ text: z.string().trim().min(1, 'Schrijf eerst een reactie.').max(VIDEO_LIMITS.comment, `Maximaal ${VIDEO_LIMITS.comment} tekens.`) }),
      await c.req.json().catch(() => null),
    )
    const [row] = await db.insert(videoComments).values({ videoId: v.id, userId: me.id, text }).returning()
    checkPost({ author: me, place: 'video', text, link: `/video/kijk?v=${v.publicId}` })
    const comment: VideoComment = { id: row.id, user: toSummary(me), text: row.text, createdAt: row.createdAt.toISOString(), canDelete: true, likes: 0, dislikes: 0, myVote: 0, canVote: false, hidden: false }
    return c.json(comment, 201)
  })

  // A thumb up (1), down (-1) or none (0) on someone else's comment
  .post('/video-comments/:id/vote', rateLimit('duimpjes', 600, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const [row] = await db.select({ comment: videoComments, video: videos }).from(videoComments).innerJoin(videos, eq(videos.id, videoComments.videoId)).where(eq(videoComments.id, Number(c.req.param('id'))))
    if (!row) throw notFound('Deze reactie bestaat niet (meer).')
    await watchable(row.video.publicId, me)
    if (row.comment.userId === me.id) throw new HttpError(400, 'Je kunt niet op je eigen reactie stemmen.')
    const { vote } = parse(z.object({ vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }), await c.req.json().catch(() => null))
    const id = row.comment.id
    if (vote === 0) await db.delete(videoCommentVotes).where(and(eq(videoCommentVotes.commentId, id), eq(videoCommentVotes.userId, me.id)))
    else await db.insert(videoCommentVotes).values({ commentId: id, userId: me.id, vote }).onConflictDoUpdate({ target: [videoCommentVotes.commentId, videoCommentVotes.userId], set: { vote } })
    const [counts] = await db
      .update(videoComments)
      .set({
        likes: sql`(select count(*)::int from ${videoCommentVotes} where ${videoCommentVotes.commentId} = ${id} and ${videoCommentVotes.vote} = 1)`,
        dislikes: sql`(select count(*)::int from ${videoCommentVotes} where ${videoCommentVotes.commentId} = ${id} and ${videoCommentVotes.vote} = -1)`,
      })
      .where(eq(videoComments.id, id))
      .returning({ likes: videoComments.likes, dislikes: videoComments.dislikes })
    return c.json({ ...counts, myVote: vote, hidden: counts.dislikes - counts.likes >= COMMENT_VOTES.hideAt })
  })

  // The comment's author or the video's uploader
  .delete('/video-comments/:id', async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select({ comment: videoComments, ownerId: videos.userId })
      .from(videoComments)
      .innerJoin(videos, eq(videos.id, videoComments.videoId))
      .where(eq(videoComments.id, Number(c.req.param('id'))))
    if (!row || (row.comment.userId !== me.id && row.ownerId !== me.id)) throw notFound('Deze reactie bestaat niet (meer).')
    await db.delete(videoComments).where(eq(videoComments.id, row.comment.id))
    return c.body(null, 204)
  })

/** Removes a member's video files when their account is deleted (the rows go with the account). */
export async function removeVideosOf(userId: number) {
  const rows = await db.select().from(videos).where(eq(videos.userId, userId))
  await Promise.all(rows.map(removeFiles))
}

