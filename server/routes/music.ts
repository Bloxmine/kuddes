/**
 * Muziek (/muziek): artist pages, songs (converted in server/lib/musicProcessing.ts),
 * the charts (this week's plays), likes and upload rights (asked like Kuddes Video's).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { and, count, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import {
  AUDIO_TYPES,
  MUSIC_GENRES,
  MUSIC_LIMITS,
  MUSIC_UPLOAD_REASONS,
  isMusicGenre,
  type ChartEntry,
  type MusicArtist,
  type MusicGenre,
  type MusicTrack,
  type MusicUploadAccess,
  type MusicUploadReason,
  type TrackCredit,
} from '../../shared/music'
import { slugify } from '../../shared/forum'
import { VIDEO_REQUEST_LIMITS } from '../../shared/videos'
import { db } from '../db/client'
import { musicPages, trackLikes, trackPlays, tracks, users, videoUploadRequests, type User } from '../db/schema'
import { clientIp } from '../lib/clientIp'
import { HttpError, notFound, parse } from '../lib/errors'
import { enqueueTrack, musicTempDir, musicTempFile } from '../lib/musicProcessing'
import { rateLimit } from '../lib/rateLimit'
import { absolute } from '../lib/seo'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { findUser, summaryColumns } from '../lib/users'
import { admins, deliverMessage } from '../lib/videoAccess'


const genres = Object.keys(MUSIC_GENRES) as [MusicGenre, ...MusicGenre[]]
const mayUploadMusic = (u: User) => u.musicUploadAllowed || u.forumRole === 'admin'
const notBlocked = isNull(users.blockedAt)

export async function musicAccess(user: User): Promise<MusicUploadAccess> {
  const [request] = await db
    .select()
    .from(videoUploadRequests)
    .where(and(eq(videoUploadRequests.userId, user.id), eq(videoUploadRequests.kind, 'muziek')))
    .orderBy(desc(videoUploadRequests.id))
    .limit(1)
  return {
    allowed: mayUploadMusic(user),
    request: request
      ? {
          status: request.status,
          reasons: request.reasons.filter((r): r is MusicUploadReason => r in MUSIC_UPLOAD_REASONS),
          motivation: request.motivation,
          answer: request.answer,
          createdAt: request.createdAt.toISOString(),
          handledAt: request.handledAt?.toISOString() ?? null,
        }
      : null,
  }
}

type TrackRow = { track: typeof tracks.$inferSelect; user: Parameters<typeof toSummary>[0]; artist: { id: number; slug: string; name: string } }

const selectTracks = () =>
  db
    .select({ track: tracks, user: summaryColumns, artist: { id: musicPages.id, slug: musicPages.slug, name: musicPages.name } })
    .from(tracks)
    .innerJoin(users, eq(users.id, tracks.userId))
    .innerJoin(musicPages, eq(musicPages.id, tracks.artistId))

const ready = and(eq(tracks.status, 'klaar'), notBlocked)

async function toTracks(rows: TrackRow[], viewer: User | null): Promise<MusicTrack[]> {
  const ids = rows.map((r) => r.track.id)
  const [likes, mine] = ids.length
    ? await Promise.all([
        db.select({ id: trackLikes.trackId, n: count() }).from(trackLikes).where(inArray(trackLikes.trackId, ids)).groupBy(trackLikes.trackId),
        viewer ? db.select({ id: trackLikes.trackId }).from(trackLikes).where(and(inArray(trackLikes.trackId, ids), eq(trackLikes.userId, viewer.id))) : [],
      ])
    : [[], []]
  return rows.map(({ track: t, user, artist }) => ({
    id: t.id,
    title: t.title,
    genre: isMusicGenre(t.genre) ? t.genre : 'anders',
    description: t.description,
    audioUrl: uploadUrl(t.audioPath),
    coverUrl: uploadUrl(t.coverPath),
    duration: t.duration,
    released: t.releasedOn ? { date: t.releasedOn, yearOnly: t.releaseYearOnly } : null,
    credits: t.credits,
    status: t.status as MusicTrack['status'],
    plays: t.plays,
    likes: likes.find((l) => l.id === t.id)?.n ?? 0,
    liked: mine.some((m) => m.id === t.id),
    artist: { ...artist, user: toSummary(user) },
    createdAt: t.createdAt.toISOString(),
    mine: viewer?.id === t.userId,
  }))
}

async function toArtists(rows: { page: typeof musicPages.$inferSelect; user: Parameters<typeof toSummary>[0] }[], viewer: User | null): Promise<MusicArtist[]> {
  const ids = rows.map((r) => r.page.id)
  const stats = ids.length
    ? await db
        .select({ artistId: tracks.artistId, n: count(), plays: sql<number>`coalesce(sum(${tracks.plays}), 0)::int` })
        .from(tracks)
        .where(and(inArray(tracks.artistId, ids), eq(tracks.status, 'klaar')))
        .groupBy(tracks.artistId)
    : []
  return rows.map(({ page, user }) => {
    const s = stats.find((x) => x.artistId === page.id)
    return {
      id: page.id,
      slug: page.slug,
      user: toSummary(user),
      name: page.name,
      bio: page.bio,
      genre: isMusicGenre(page.genre) ? page.genre : 'anders',
      bannerUrl: uploadUrl(page.bannerPath),
      bannerY: page.bannerY,
      avatarUrl: uploadUrl(page.avatarPath),
      trackCount: s?.n ?? 0,
      plays: Number(s?.plays ?? 0),
      mine: viewer?.id === page.userId,
    }
  })
}

const artistRows = () => db.select({ page: musicPages, user: summaryColumns }).from(musicPages).innerJoin(users, eq(users.id, musicPages.userId))

/** The charts: the most played songs over the 7 days before `until`. */
async function chartCounts(until: Date, limit: number) {
  const from = new Date(until.getTime() - 7 * 86_400_000)
  return db
    .select({ trackId: trackPlays.trackId, n: count() })
    .from(trackPlays)
    .innerJoin(tracks, eq(tracks.id, trackPlays.trackId))
    .innerJoin(users, eq(users.id, tracks.userId))
    .where(and(gte(trackPlays.playedAt, from), lt(trackPlays.playedAt, until), ready))
    .groupBy(trackPlays.trackId)
    .orderBy(desc(count()), trackPlays.trackId)
    .limit(limit)
}

/** Who already counted as a play (per listener and song) in the last half hour. */
const recentPlays = new Map<string, number>()
const PLAY_DEDUPE_MS = 30 * 60 * 1000

const pageSchema = z.object({
  name: z.string().trim().min(1, 'Geef je artiestennaam.').max(MUSIC_LIMITS.name),
  bio: z.string().trim().max(MUSIC_LIMITS.bio).default(''),
  genre: z.enum(genres),
})

/** Ready songs by id, as the viewer sees them (for the timeline). */
export async function tracksByIds(ids: number[], viewer: User | null): Promise<MusicTrack[]> {
  if (!ids.length) return []
  return toTracks(await selectTracks().where(and(inArray(tracks.id, ids), ready)), viewer)
}

/** One ready song, as the viewer sees it (for what's on now on Kuddes Radio). */
export async function musicTrackById(id: number, viewer: User | null): Promise<MusicTrack | null> {
  const [row] = await selectTracks().where(and(eq(tracks.id, id), ready))
  return row ? (await toTracks([row], viewer))[0] : null
}

/** Release date and credits of a song, as sent by the upload form or the edit dialog. */
const releaseSchema = z.object({
  releasedOn: z.iso.date('Ongeldige datum.').nullable().optional(),
  releaseYearOnly: z.boolean().optional(),
  credits: z
    .array(
      z.object({
        role: z.string().trim().min(1, 'Vul in wat iemand deed.').max(MUSIC_LIMITS.creditRole),
        name: z.string().trim().min(1, 'Vul een naam in.').max(MUSIC_LIMITS.creditName),
        username: z.string().trim().max(40).nullable().optional(),
      }),
    )
    .max(MUSIC_LIMITS.credits, `Maximaal ${MUSIC_LIMITS.credits} namen.`)
    .optional(),
})

/** Credits with a username only keep it when that member exists (so the link works). */
async function checkedCredits(credits: TrackCredit[] | undefined) {
  if (!credits) return undefined
  const names = [...new Set(credits.map((c) => c.username?.replace(/^@/, '').toLowerCase()).filter((u): u is string => !!u))]
  const found = names.length ? await db.select({ username: users.username }).from(users).where(and(inArray(users.username, names), notBlocked)) : []
  return credits.map((c) => {
    const u = c.username?.replace(/^@/, '').toLowerCase()
    return { role: c.role, name: c.name, username: u && found.some((f) => f.username === u) ? u : null }
  })
}

/** One of your own artist or band pages, or a 404. */
async function ownPage(me: User, id: number) {
  const [page] = Number.isInteger(id) ? await db.select().from(musicPages).where(and(eq(musicPages.id, id), eq(musicPages.userId, me.id))) : []
  if (!page) throw notFound('Deze muziekpagina bestaat niet (meer).')
  return page
}

/** Words that are already pages under /muziek. */
const RESERVED_SLUGS = new Set(['hitlijst', 'uploaden', 'zoeken', 'nieuw'])

/** A free address for a new page: the wish, or with -2, -3… behind it. */
async function freeSlug(wish: string) {
  const base = (wish || 'band').slice(0, 40)
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    if (RESERVED_SLUGS.has(slug)) continue
    const [taken] = await db.select({ id: musicPages.id }).from(musicPages).where(eq(musicPages.slug, slug))
    if (!taken) return slug
  }
}

export const musicRoutes = new Hono<AppEnv>()
  // Looking around: songs by genre or search, newest or most played, and the artists
  .get('/music', async (c) => {
    const viewer = c.get('user')
    const genre = c.req.query('genre')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const sort = c.req.query('sort') === 'nieuw' ? 'nieuw' : 'populair'
    const filters: (SQL | undefined)[] = [ready, isMusicGenre(genre) ? eq(tracks.genre, genre) : undefined, q ? or(ilike(tracks.title, like), ilike(musicPages.name, like), ilike(users.nickname, like)) : undefined]
    const [rows, newest, artists, genreCounts] = await Promise.all([
      selectTracks()
        .where(and(...filters))
        .orderBy(...(sort === 'nieuw' ? [desc(tracks.id)] : [desc(tracks.plays), desc(tracks.id)]))
        .limit(40),
      selectTracks().where(and(...filters)).orderBy(desc(tracks.id)).limit(10),
      artistRows()
        .where(and(notBlocked, isMusicGenre(genre) ? eq(musicPages.genre, genre) : undefined, q ? or(ilike(musicPages.name, like), ilike(users.nickname, like)) : undefined))
        .orderBy(desc(musicPages.createdAt))
        .limit(12),
      db.select({ genre: tracks.genre, n: count() }).from(tracks).innerJoin(users, eq(users.id, tracks.userId)).where(ready).groupBy(tracks.genre),
    ])
    return c.json({
      tracks: await toTracks(rows, viewer),
      newest: await toTracks(newest, viewer),
      artists: await toArtists(artists, viewer),
      genres: Object.fromEntries(genreCounts.map((g) => [g.genre, g.n])) as Partial<Record<MusicGenre, number>>,
    })
  })

  // The charts of this week, with last week's places
  .get('/music/charts', async (c) => {
    const viewer = c.get('user')
    const limit = Math.min(Number(c.req.query('limit')) || 40, 40)
    const now = new Date()
    const [thisWeek, lastWeek] = await Promise.all([chartCounts(now, limit), chartCounts(new Date(now.getTime() - 7 * 86_400_000), 100)])
    if (!thisWeek.length) return c.json([] satisfies ChartEntry[])
    const rows = await selectTracks().where(inArray(tracks.id, thisWeek.map((r) => r.trackId)))
    const list = await toTracks(rows, viewer)
    const result: ChartEntry[] = thisWeek.flatMap((r, i) => {
      const track = list.find((t) => t.id === r.trackId)
      if (!track) return []
      const before = lastWeek.findIndex((l) => l.trackId === r.trackId)
      return [{ rank: i + 1, lastRank: before >= 0 ? before + 1 : null, weekPlays: r.n, track }]
    })
    return c.json(result)
  })

  .get('/music/artists/:slug', async (c) => {
    const viewer = c.get('user')
    const [row] = await artistRows().where(and(eq(musicPages.slug, c.req.param('slug').toLowerCase()), notBlocked))
    if (!row) throw notFound('Deze muziekpagina bestaat niet (meer).')
    // The owner also sees songs that are still being converted (or failed)
    const own = viewer?.id === row.page.userId
    const [rows, others] = await Promise.all([
      selectTracks()
        .where(and(eq(tracks.artistId, row.page.id), own ? undefined : eq(tracks.status, 'klaar')))
        .orderBy(desc(tracks.id)),
      // The member's other bands
      artistRows().where(and(eq(musicPages.userId, row.page.userId), ne(musicPages.id, row.page.id))),
    ])
    return c.json({ artist: (await toArtists([row], viewer))[0], tracks: await toTracks(rows, viewer), others: await toArtists(others, viewer) })
  })

  // For the Kuddes Muziek gadget on a profile: their own songs, or the ones they liked
  .get('/music/users/:username/tracks', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 5, 1), 20)
    const show = c.req.query('show')
    const rows =
      show === 'favorieten'
        ? await selectTracks()
            .innerJoin(trackLikes, and(eq(trackLikes.trackId, tracks.id), eq(trackLikes.userId, user.id)))
            .where(ready)
            .orderBy(desc(trackLikes.createdAt))
            .limit(limit)
        : await selectTracks()
            .where(and(eq(tracks.userId, user.id), ready))
            .orderBy(...(show === 'populair' ? [desc(tracks.plays), desc(tracks.id)] : [desc(tracks.id)]))
            .limit(limit)
    const pages = await db.select({ slug: musicPages.slug, name: musicPages.name }).from(musicPages).where(eq(musicPages.userId, user.id)).orderBy(musicPages.id)
    return c.json({ artists: pages, tracks: await toTracks(rows, viewer) })
  })

  .get('/music/me', async (c) => {
    const me = requireUser(c)
    const rows = await artistRows().where(eq(musicPages.userId, me.id)).orderBy(musicPages.id)
    return c.json({ access: await musicAccess(me), artists: await toArtists(rows, me) })
  })

  // A new artist or band page (only with upload rights)
  .post('/music/artists', rateLimit('muziekpagina', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    if (!mayUploadMusic(me)) throw new HttpError(403, 'Vraag eerst of je muziek mag uploaden.')
    const input = parse(pageSchema, await c.req.json().catch(() => null))
    const [{ n }] = await db.select({ n: count() }).from(musicPages).where(eq(musicPages.userId, me.id))
    if (n >= MUSIC_LIMITS.bands) throw new HttpError(400, `Je kunt maximaal ${MUSIC_LIMITS.bands} artiesten- of bandpagina's hebben.`)
    // Your first page gets your username in its address; the others their name
    const named = slugify(input.name)
    const slug = await freeSlug(n === 0 ? me.username : named === 'onderwerp' && !/onderwerp/i.test(input.name) ? 'band' : named)
    const [page] = await db.insert(musicPages).values({ userId: me.id, slug, ...input }).returning()
    const [row] = await artistRows().where(eq(musicPages.id, page.id))
    return c.json((await toArtists([row], me))[0], 201)
  })

  .put('/music/artists/:id{[0-9]+}', rateLimit('muziekpagina', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const page = await ownPage(me, Number(c.req.param('id')))
    const input = parse(pageSchema, await c.req.json().catch(() => null))
    await db.update(musicPages).set(input).where(eq(musicPages.id, page.id))
    const [row] = await artistRows().where(eq(musicPages.id, page.id))
    return c.json((await toArtists([row], me))[0])
  })

  // Removing a band removes its songs too
  .delete('/music/artists/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const page = await ownPage(me, Number(c.req.param('id')))
    const songs = await db.select({ audio: tracks.audioPath, cover: tracks.coverPath }).from(tracks).where(eq(tracks.artistId, page.id))
    await db.delete(musicPages).where(eq(musicPages.id, page.id))
    await Promise.all([removeUpload(page.bannerPath), removeUpload(page.avatarPath), ...songs.flatMap((t) => [removeUpload(t.audio), removeUpload(t.cover)])])
    return c.body(null, 204)
  })

  .put(
    '/music/artists/:id{[0-9]+}/banner',
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).') } }),
    rateLimit('banners', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const page = await ownPage(me, Number(c.req.param('id')))
      const body = await c.req.parseBody()
      const y = Math.min(100, Math.max(0, Math.round(Number(body.y ?? page.bannerY)))) || 0
      const stored = body.file instanceof File && body.file.size > 0 ? await storeImage(body.file, 'banners') : null
      await db.update(musicPages).set({ bannerY: y, ...(stored && { bannerPath: stored.path }) }).where(eq(musicPages.id, page.id))
      if (stored) await removeUpload(page.bannerPath)
      return c.body(null, 204)
    },
  )

  // The band's own picture (square), instead of the member's profile photo
  .put(
    '/music/artists/:id{[0-9]+}/avatar',
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).') } }),
    rateLimit('bandfoto', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const page = await ownPage(me, Number(c.req.param('id')))
      const body = await c.req.parseBody()
      if (!(body.file instanceof File) || body.file.size === 0) throw new HttpError(400, 'Kies een afbeelding.')
      const stored = await storeImage(body.file, 'covers', `${me.id}-`)
      await db.update(musicPages).set({ avatarPath: stored.path }).where(eq(musicPages.id, page.id))
      await removeUpload(page.avatarPath)
      return c.json({ avatarUrl: uploadUrl(stored.path) })
    },
  )

  .delete('/music/artists/:id{[0-9]+}/avatar', async (c) => {
    const me = requireUser(c)
    const page = await ownPage(me, Number(c.req.param('id')))
    await db.update(musicPages).set({ avatarPath: null }).where(eq(musicPages.id, page.id))
    await removeUpload(page.avatarPath)
    return c.body(null, 204)
  })

  .delete('/music/artists/:id{[0-9]+}/banner', async (c) => {
    const me = requireUser(c)
    const page = await ownPage(me, Number(c.req.param('id')))
    await db.update(musicPages).set({ bannerPath: null }).where(eq(musicPages.id, page.id))
    await removeUpload(page.bannerPath)
    return c.body(null, 204)
  })

  // Asking for upload rights: the admin gets it as a message, and answers on /beheer
  .post('/me/music-access', rateLimit('uploadrechten aanvragen', 3, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(
      z.object({
        reasons: z.array(z.enum(Object.keys(MUSIC_UPLOAD_REASONS) as [MusicUploadReason])).min(1, 'Kies minstens één reden.'),
        motivation: z.string().trim().max(VIDEO_REQUEST_LIMITS.motivation),
        agree: z.literal(true, { message: 'Je moet akkoord gaan met de regels.' }),
      }),
      await c.req.json().catch(() => null),
    )
    if (mayUploadMusic(me)) throw new HttpError(409, 'Je mag al muziek uploaden.')
    if (input.reasons.includes('anders') && input.motivation.length < 10) {
      throw new HttpError(400, 'Vertel kort wat voor muziek je wilt uploaden.', { motivation: 'Vertel kort wat voor muziek je wilt uploaden.' })
    }
    const reasons = [...new Set(input.reasons)]
    const [row] = await db.insert(videoUploadRequests).values({ userId: me.id, kind: 'muziek', reasons, motivation: input.motivation }).onConflictDoNothing().returning()
    if (!row) throw new HttpError(409, 'Je aanvraag ligt al bij de beheerder.')
    const message = [
      `${me.name} (@${me.username}) wil graag muziek uploaden op Kuddes.`,
      '',
      '**Waarom:**',
      ...reasons.map((r) => `- ${MUSIC_UPLOAD_REASONS[r]}`),
      ...(input.motivation ? ['', '**Toelichting:**', input.motivation] : []),
      '',
      'Akkoord met de regels voor muziek: ja',
      '',
      `Goedkeuren of afwijzen: [Beheer → Muziek-rechten](${absolute('/beheer?tab=muziek')})`,
    ].join('\n')
    for (const admin of await admins()) await deliverMessage(me.id, admin.id, `Aanvraag: muziek uploaden (@${me.username})`, message)
    return c.json(await musicAccess(me), 201)
  })

  // A song: the file, a cover (optional), title, genre and a bit of text
  .post(
    '/tracks',
    bodyLimit({ maxSize: MUSIC_LIMITS.bytes + MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, `Dit bestand is te groot (maximaal ${MUSIC_LIMITS.bytes / 1024 / 1024} MB).`) } }),
    rateLimit('muziek uploaden', 30, 24 * 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      if (!mayUploadMusic(me)) throw new HttpError(403, 'Vraag eerst of je muziek mag uploaden.')
      const body = await c.req.parseBody()
      const page = await ownPage(me, Number(body.artistId)).catch(() => {
        throw new HttpError(400, 'Kies op welke artiesten- of bandpagina dit nummer komt.')
      })
      const [{ n }] = await db.select({ n: count() }).from(tracks).where(eq(tracks.userId, me.id))
      if (n >= MUSIC_LIMITS.perMember) throw new HttpError(400, `Je kunt maximaal ${MUSIC_LIMITS.perMember} nummers hebben.`)
      const input = parse(
        z.object({
          title: z.string().trim().min(1, 'Geef het nummer een titel.').max(MUSIC_LIMITS.title),
          genre: z.enum(genres, { message: 'Kies een genre.' }),
          description: z.string().trim().max(MUSIC_LIMITS.description).default(''),
        }),
        { title: body.title, genre: body.genre, description: typeof body.description === 'string' ? body.description : '' },
      )
      const release = parse(releaseSchema, {
        releasedOn: typeof body.releasedOn === 'string' && body.releasedOn ? body.releasedOn : null,
        releaseYearOnly: body.releaseYearOnly === 'true',
        credits: typeof body.credits === 'string' && body.credits ? JSON.parse(body.credits) : [],
      })
      const file = body.file
      if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Kies een muziekbestand.', { file: 'Kies een muziekbestand.' })
      if (file.size > MUSIC_LIMITS.bytes) throw new HttpError(413, `Dit bestand is te groot (maximaal ${MUSIC_LIMITS.bytes / 1024 / 1024} MB).`)
      if (file.type && !AUDIO_TYPES.includes(file.type)) throw new HttpError(415, 'Dit soort bestand kunnen we niet gebruiken. Kies een MP3, WAV, FLAC, OGG of M4A.')
      const cover = body.cover instanceof File && body.cover.size > 0 ? await storeImage(body.cover, 'covers', `${me.id}-`) : null
      const [row] = await db
        .insert(tracks)
        .values({ userId: me.id, artistId: page.id, title: input.title, genre: input.genre, description: input.description, coverPath: cover?.path ?? null, releasedOn: release.releasedOn ?? null, releaseYearOnly: !!release.releaseYearOnly, credits: (await checkedCredits(release.credits)) ?? [] })
        .returning()
      await mkdir(musicTempDir(), { recursive: true })
      await writeFile(musicTempFile(row.id), Buffer.from(await file.arrayBuffer()))
      enqueueTrack(row.id)
      const [created] = await selectTracks().where(eq(tracks.id, row.id))
      return c.json((await toTracks([created], me))[0], 201)
    },
  )

  // Several songs at once, in the order asked (a radio show's playlist)
  .get('/tracks', async (c) => {
    const viewer = c.get('user')
    const ids = (c.req.query('ids') ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 100)
    if (!ids.length) return c.json([] satisfies MusicTrack[])
    const list = await toTracks(await selectTracks().where(and(inArray(tracks.id, ids), ready)), viewer)
    return c.json(ids.flatMap((id) => list.find((t) => t.id === id) ?? []))
  })

  .get('/tracks/:id{[0-9]+}', async (c) => {
    const viewer = c.get('user')
    const [row] = await selectTracks().where(and(eq(tracks.id, Number(c.req.param('id'))), notBlocked))
    if (!row || (row.track.status !== 'klaar' && viewer?.id !== row.track.userId)) throw notFound('Dit nummer bestaat niet (meer).')
    return c.json((await toTracks([row], viewer))[0])
  })

  .patch('/tracks/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({
        title: z.string().trim().min(1).max(MUSIC_LIMITS.title).optional(),
        genre: z.enum(genres).optional(),
        description: z.string().trim().max(MUSIC_LIMITS.description).optional(),
        artistId: z.number().int().positive().optional(),
      }).extend(releaseSchema.shape),
      await c.req.json().catch(() => null),
    )
    // Moving it to another of your pages
    if (input.artistId) await ownPage(me, input.artistId)
    const credits = await checkedCredits(input.credits)
    const [row] = await db
      .update(tracks)
      .set({ ...input, ...(credits && { credits }) })
      .where(and(eq(tracks.id, Number(c.req.param('id'))), eq(tracks.userId, me.id)))
      .returning()
    if (!row) throw notFound()
    return c.body(null, 204)
  })

  // The maker or the admin
  .delete('/tracks/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [row] = await db.select().from(tracks).where(eq(tracks.id, Number(c.req.param('id'))))
    if (!row) throw notFound()
    if (row.userId !== me.id && me.forumRole !== 'admin') throw new HttpError(403, 'Dit is niet jouw nummer.')
    await db.delete(tracks).where(eq(tracks.id, row.id))
    await Promise.all([removeUpload(row.audioPath), removeUpload(row.coverPath)])
    return c.body(null, 204)
  })

  // Played: counts once per listener and song per half hour (who isn't kept, only when)
  .post('/tracks/:id{[0-9]+}/play', async (c) => {
    const viewer = c.get('user')
    const id = Number(c.req.param('id'))
    const [row] = await db.select({ userId: tracks.userId, status: tracks.status }).from(tracks).where(eq(tracks.id, id))
    if (!row || row.status !== 'klaar') throw notFound()
    if (viewer?.id === row.userId) return c.body(null, 204)
    const key = `${viewer?.id ?? clientIp(c)}:${id}`
    const now = Date.now()
    if ((recentPlays.get(key) ?? 0) > now - PLAY_DEDUPE_MS) return c.body(null, 204)
    recentPlays.set(key, now)
    if (recentPlays.size > 50_000) for (const [k, t] of recentPlays) if (t < now - PLAY_DEDUPE_MS) recentPlays.delete(k)
    await db.insert(trackPlays).values({ trackId: id })
    await db.update(tracks).set({ plays: sql`${tracks.plays} + 1` }).where(eq(tracks.id, id))
    return c.body(null, 204)
  })

  .post('/tracks/:id{[0-9]+}/like', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const id = Number(c.req.param('id'))
    const [row] = await db.select({ userId: tracks.userId }).from(tracks).where(and(eq(tracks.id, id), eq(tracks.status, 'klaar')))
    if (!row) throw notFound()
    if (row.userId === me.id) throw new HttpError(400, 'Je eigen nummer kun je niet liken.')
    await db.insert(trackLikes).values({ trackId: id, userId: me.id }).onConflictDoNothing()
    return c.body(null, 204)
  })

  .delete('/tracks/:id{[0-9]+}/like', async (c) => {
    const me = requireUser(c)
    await db.delete(trackLikes).where(and(eq(trackLikes.trackId, Number(c.req.param('id'))), eq(trackLikes.userId, me.id)))
    return c.body(null, 204)
  })
