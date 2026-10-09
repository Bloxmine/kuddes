/**
 * Kuddes Radio (/radio): stations, their planned shows, followers, co-DJs,
 * sound buttons, hosting rights (asked like Kuddes Video's), and going live
 * (the stream itself is in server/lib/radioLive.ts).
 */
import { randomBytes } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import type { ServerResponse } from 'node:http'
import { z } from 'zod'
import { AUDIO_TYPES } from '../../shared/music'
import {
  RADIO_GENRES,
  RADIO_LIMITS,
  RADIO_UPLOAD_REASONS,
  SOUND_COLORS,
  isRadioGenre,
  type RadioAccess,
  type RadioGenre,
  type RadioShow,
  type RadioSound,
  type RadioStation,
  type RadioUploadReason,
} from '../../shared/radio'
import { VIDEO_REQUEST_LIMITS } from '../../shared/videos'
import { config } from '../config'
import { db } from '../db/client'
import { radioDjs, radioFollows, radioShows, radioSounds, radioStations, tracks, users, videoUploadRequests, type User } from '../db/schema'
import { clientIp } from '../lib/clientIp'
import { HttpError, notFound, parse } from '../lib/errors'
import { recordActivity } from '../lib/activities'
import { notify, unnotify } from '../lib/notifications'
import * as live from '../lib/radioLive'
import { rateLimit } from '../lib/rateLimit'
import { absolute } from '../lib/seo'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { findUser, summaryColumns } from '../lib/users'
import { admins, deliverMessage } from '../lib/videoAccess'
import { run } from '../lib/videoProcessing'
import { musicTrackById } from './music'

const genres = Object.keys(RADIO_GENRES) as [RadioGenre, ...RadioGenre[]]
export const mayHostRadio = (u: User) => u.radioAllowed || u.forumRole === 'admin'
const notBlocked = isNull(users.blockedAt)
const HEARTBEAT_MS = 25_000

export async function radioAccess(user: User): Promise<RadioAccess> {
  const [request] = await db
    .select()
    .from(videoUploadRequests)
    .where(and(eq(videoUploadRequests.userId, user.id), eq(videoUploadRequests.kind, 'radio')))
    .orderBy(desc(videoUploadRequests.id))
    .limit(1)
  return {
    allowed: mayHostRadio(user),
    request: request
      ? {
          status: request.status,
          reasons: request.reasons.filter((r): r is RadioUploadReason => r in RADIO_UPLOAD_REASONS),
          motivation: request.motivation,
          answer: request.answer,
          createdAt: request.createdAt.toISOString(),
          handledAt: request.handledAt?.toISOString() ?? null,
        }
      : null,
  }
}

type StationRow = { station: typeof radioStations.$inferSelect; user: Parameters<typeof toSummary>[0] }
const stationRows = () => db.select({ station: radioStations, user: summaryColumns }).from(radioStations).innerJoin(users, eq(users.id, radioStations.userId))

const toShow = (s: typeof radioShows.$inferSelect, withPlaylist = false): RadioShow => ({
  id: s.id,
  title: s.title,
  description: s.description,
  startsAt: s.startsAt.toISOString(),
  endsAt: s.endsAt.toISOString(),
  playlist: withPlaylist ? s.playlist : [],
})

async function toStations(rows: StationRow[], viewer: User | null): Promise<RadioStation[]> {
  const ids = rows.map((r) => r.station.userId)
  if (!ids.length) return []
  const now = new Date()
  const [followers, mine, djOf, next] = await Promise.all([
    db.select({ id: radioFollows.stationId, n: count() }).from(radioFollows).where(inArray(radioFollows.stationId, ids)).groupBy(radioFollows.stationId),
    viewer ? db.select({ id: radioFollows.stationId }).from(radioFollows).where(and(inArray(radioFollows.stationId, ids), eq(radioFollows.userId, viewer.id))) : [],
    viewer ? db.select({ id: radioDjs.stationId }).from(radioDjs).where(and(inArray(radioDjs.stationId, ids), eq(radioDjs.userId, viewer.id))) : [],
    // The next show of each: the first that hasn't ended
    db
      .selectDistinctOn([radioShows.stationId])
      .from(radioShows)
      .where(and(inArray(radioShows.stationId, ids), gt(radioShows.endsAt, now)))
      .orderBy(radioShows.stationId, asc(radioShows.startsAt)),
  ])
  return rows.map(({ station: s, user }) => {
    const upcoming = next.find((n) => n.stationId === s.userId)
    return {
      user: toSummary(user),
      name: s.name,
      description: s.description,
      genre: isRadioGenre(s.genre) ? s.genre : 'anders',
      bannerUrl: uploadUrl(s.bannerPath),
      bannerY: s.bannerY,
      followers: followers.find((f) => f.id === s.userId)?.n ?? 0,
      following: mine.some((m) => m.id === s.userId),
      mine: viewer?.id === s.userId,
      dj: djOf.some((d) => d.id === s.userId),
      live: live.liveState(s.userId),
      next: upcoming ? toShow(upcoming) : null,
    }
  })
}

async function stationOf(username: string, viewer: User | null) {
  const user = await findUser(username)
  const [row] = await stationRows().where(and(eq(radioStations.userId, user.id), notBlocked))
  if (!row) throw notFound('Deze zender bestaat niet (meer).')
  return { user, row, station: (await toStations([row], viewer))[0] }
}

/** Your own station, or a 400 when you haven't made one. */
async function ownStation(me: User) {
  if (!mayHostRadio(me)) throw new HttpError(403, 'Vraag eerst of je radio mag maken.')
  const [row] = await db.select().from(radioStations).where(eq(radioStations.userId, me.id))
  if (!row) throw new HttpError(400, 'Maak eerst je zender.')
  return row
}

/** You're one of this station's co-DJs. */
async function djOf(username: string, me: User) {
  const host = await findUser(username)
  const [row] = await db
    .select({ id: radioDjs.userId })
    .from(radioDjs)
    .where(and(eq(radioDjs.stationId, host.id), eq(radioDjs.userId, me.id)))
  if (!row) throw new HttpError(403, 'Je bent geen DJ bij deze zender.')
  return host
}

const soundOf = (s: typeof radioSounds.$inferSelect): RadioSound => ({ id: s.id, name: s.name, url: uploadUrl(s.path)!, color: s.color })

const stationSchema = z.object({
  name: z.string().trim().min(1, 'Geef je zender een naam.').max(RADIO_LIMITS.name),
  description: z.string().trim().max(RADIO_LIMITS.description).default(''),
  genre: z.enum(genres),
})

const showSchema = z
  .object({
    title: z.string().trim().min(1, 'Geef de uitzending een titel.').max(RADIO_LIMITS.title),
    description: z.string().trim().max(RADIO_LIMITS.description).default(''),
    startsAt: z.iso.datetime({ offset: true }),
    minutes: z.number().int().min(15).max(RADIO_LIMITS.showHours * 60),
    playlist: z.array(z.number().int().positive()).max(RADIO_LIMITS.playlist).default([]),
  })
  .refine((s) => new Date(s.startsAt).getTime() > Date.now() - 60 * 60 * 1000, { message: 'Kies een tijd in de toekomst.', path: ['startsAt'] })

/** Only songs that exist and are ready: the rest is dropped from a playlist. */
async function readyTracks(ids: number[]) {
  if (!ids.length) return []
  const rows = await db.select({ id: tracks.id }).from(tracks).where(and(inArray(tracks.id, ids), eq(tracks.status, 'klaar')))
  return ids.filter((id) => rows.some((r) => r.id === id))
}

const audioStream = (body: ReadableStream<Uint8Array>, type: string) =>
  new Response(body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      // For proxies that would otherwise wait for the end
      'X-Accel-Buffering': 'no',
    },
  })

export const radioRoutes = new Hono<AppEnv>()
  // ---------------------------------------------------------- looking around
  .get('/radio', async (c) => {
    const viewer = c.get('user')
    const genre = c.req.query('genre')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const now = new Date()
    const liveIds = live.liveStations()
    const [liveRows, stations, upcoming, genreCounts] = await Promise.all([
      liveIds.length ? stationRows().where(and(inArray(radioStations.userId, liveIds), notBlocked)) : [],
      stationRows()
        .where(and(notBlocked, isRadioGenre(genre) ? eq(radioStations.genre, genre) : undefined, q ? or(ilike(radioStations.name, like), ilike(users.nickname, like)) : undefined))
        .orderBy(sql`${radioStations.lastLiveAt} desc nulls last`, desc(radioStations.createdAt))
        .limit(40),
      db
        .select({ show: radioShows, station: radioStations, user: summaryColumns })
        .from(radioShows)
        .innerJoin(radioStations, eq(radioStations.userId, radioShows.stationId))
        .innerJoin(users, eq(users.id, radioShows.stationId))
        .where(and(gt(radioShows.endsAt, now), lt(radioShows.startsAt, new Date(now.getTime() + 7 * 86_400_000)), notBlocked, isRadioGenre(genre) ? eq(radioStations.genre, genre) : undefined))
        .orderBy(asc(radioShows.startsAt))
        .limit(20),
      db.select({ genre: radioStations.genre, n: count() }).from(radioStations).innerJoin(users, eq(users.id, radioStations.userId)).where(notBlocked).groupBy(radioStations.genre),
    ])
    return c.json({
      live: (await toStations(liveRows, viewer)).filter((s) => !isRadioGenre(genre) || s.genre === genre),
      stations: await toStations(stations, viewer),
      upcoming: upcoming.map(({ show, station, user }): RadioShow => ({ ...toShow(show), station: { name: station.name, user: toSummary(user), genre: isRadioGenre(station.genre) ? station.genre : 'anders' } })),
      genres: Object.fromEntries(genreCounts.map((g) => [g.genre, g.n])) as Partial<Record<RadioGenre, number>>,
    })
  })

  .get('/radio/stations/:username', async (c) => {
    const viewer = c.get('user')
    const { user, station } = await stationOf(c.req.param('username'), viewer)
    const shows = await db
      .select()
      .from(radioShows)
      .where(and(eq(radioShows.stationId, user.id), gt(radioShows.endsAt, new Date())))
      .orderBy(asc(radioShows.startsAt))
      .limit(RADIO_LIMITS.shows)
    return c.json({ station, shows: shows.map((s) => toShow(s)), chat: live.chatOf(user.id) })
  })

  // The show itself: an endless MP3 for an <audio> element
  .get('/radio/stations/:username/stream', async (c) => {
    const user = await findUser(c.req.param('username'))
    if (user.blockedAt || !live.isLive(user.id)) throw notFound('Deze zender is nu niet live.')
    const body = live.listen(user.id, clientIp(c))
    if (!body) throw new HttpError(503, 'Deze uitzending zit vol. Probeer het straks nog eens.')
    return audioStream(body, 'audio/mpeg')
  })

  // Live or not, what's on, the chat, and (for the studio and DJs) the microphones' set-up
  .get('/radio/stations/:username/events', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    return streamSSE(c, async (stream) => {
      const leave = live.watch(user.id, viewer?.id ?? null, stream)
      let open = true
      const close = () => {
        if (!open) return
        open = false
        leave()
      }
      stream.onAbort(close)
      ;(c.env as { outgoing?: ServerResponse } | undefined)?.outgoing?.once('close', close)
      await stream.writeSSE({ event: 'live', data: JSON.stringify(live.liveState(user.id)) })
      while (open) {
        await stream.sleep(HEARTBEAT_MS)
        if (open) await stream.writeSSE({ event: 'ping', data: '' }).catch(close)
      }
    })
  })

  // For the Kuddes Radio gadget on a profile: their own station, and the ones they follow
  .get('/radio/users/:username', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const [own, followed] = await Promise.all([
      stationRows().where(and(eq(radioStations.userId, user.id), notBlocked)),
      stationRows()
        .innerJoin(radioFollows, and(eq(radioFollows.stationId, radioStations.userId), eq(radioFollows.userId, user.id)))
        .where(notBlocked)
        .orderBy(desc(radioFollows.createdAt))
        .limit(12),
    ])
    const following = await toStations(
      followed.map((r) => ({ station: r.station, user: r.user })),
      viewer,
    )
    return c.json({
      own: own[0] ? (await toStations([own[0]], viewer))[0] : null,
      // Live ones first
      following: following.sort((a, b) => Number(!!b.live) - Number(!!a.live)),
    })
  })

  .post('/radio/stations/:username/follow', async (c) => {
    const me = requireVerified(c)
    const { user } = await stationOf(c.req.param('username'), me)
    if (user.id === me.id) throw new HttpError(400, 'Je eigen zender hoef je niet te volgen.')
    await db.insert(radioFollows).values({ stationId: user.id, userId: me.id }).onConflictDoNothing()
    return c.body(null, 204)
  })

  .delete('/radio/stations/:username/follow', async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    await db.delete(radioFollows).where(and(eq(radioFollows.stationId, user.id), eq(radioFollows.userId, me.id)))
    return c.body(null, 204)
  })

  .post('/radio/stations/:username/chat', rateLimit('radiochat', 30, 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const user = await findUser(c.req.param('username'))
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(RADIO_LIMITS.chat) }), await c.req.json().catch(() => null))
    const [row] = await db.select(summaryColumns).from(users).where(eq(users.id, me.id))
    if (!live.addChat(user.id, toSummary(row), text)) throw new HttpError(409, 'Deze zender is nu niet live.')
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- your station
  .get('/radio/me', async (c) => {
    const me = requireUser(c)
    const [row] = await stationRows().where(eq(radioStations.userId, me.id))
    const [djs, sounds, shows, djAt] = await Promise.all([
      db.select(summaryColumns).from(radioDjs).innerJoin(users, eq(users.id, radioDjs.userId)).where(eq(radioDjs.stationId, me.id)),
      db.select().from(radioSounds).where(eq(radioSounds.userId, me.id)).orderBy(asc(radioSounds.id)),
      db
        .select()
        .from(radioShows)
        .where(and(eq(radioShows.stationId, me.id), gt(radioShows.endsAt, new Date())))
        .orderBy(asc(radioShows.startsAt)),
      // Stations where you're a co-DJ
      stationRows().innerJoin(radioDjs, and(eq(radioDjs.stationId, radioStations.userId), eq(radioDjs.userId, me.id))).where(notBlocked),
    ])
    return c.json({
      access: await radioAccess(me),
      station: row ? (await toStations([row], me))[0] : null,
      djs: djs.map(toSummary),
      sounds: sounds.map(soundOf),
      shows: shows.map((s) => toShow(s, true)),
      djAt: await toStations(
        djAt.map((r) => ({ station: r.station, user: r.user })),
        me,
      ),
    })
  })

  .put('/radio/me', rateLimit('zender', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    if (!mayHostRadio(me)) throw new HttpError(403, 'Vraag eerst of je radio mag maken.')
    const input = parse(stationSchema, await c.req.json().catch(() => null))
    await db.insert(radioStations).values({ userId: me.id, ...input }).onConflictDoUpdate({ target: radioStations.userId, set: input })
    const [row] = await stationRows().where(eq(radioStations.userId, me.id))
    return c.json((await toStations([row], me))[0])
  })

  .put(
    '/radio/me/banner',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
      },
    }),
    rateLimit('banners', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const station = await ownStation(me)
      const body = await c.req.parseBody()
      const y = Math.min(100, Math.max(0, Math.round(Number(body.y ?? station.bannerY)))) || 0
      const stored = body.file instanceof File && body.file.size > 0 ? await storeImage(body.file, 'banners') : null
      await db.update(radioStations).set({ bannerY: y, ...(stored && { bannerPath: stored.path }) }).where(eq(radioStations.userId, me.id))
      if (stored) await removeUpload(station.bannerPath)
      return c.body(null, 204)
    },
  )

  .delete('/radio/me/banner', async (c) => {
    const me = requireUser(c)
    const [station] = await db.select().from(radioStations).where(eq(radioStations.userId, me.id))
    if (station) {
      await db.update(radioStations).set({ bannerPath: null }).where(eq(radioStations.userId, me.id))
      await removeUpload(station.bannerPath)
    }
    return c.body(null, 204)
  })

  // Asking to host: the admin gets it as a message, and answers on /beheer
  .post('/me/radio-access', rateLimit('uploadrechten aanvragen', 3, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(
      z.object({
        reasons: z.array(z.enum(Object.keys(RADIO_UPLOAD_REASONS) as [RadioUploadReason])).min(1, 'Kies minstens één reden.'),
        motivation: z.string().trim().max(VIDEO_REQUEST_LIMITS.motivation),
        agree: z.literal(true, { message: 'Je moet akkoord gaan met de regels.' }),
      }),
      await c.req.json().catch(() => null),
    )
    if (mayHostRadio(me)) throw new HttpError(409, 'Je mag al radio maken.')
    if (input.reasons.includes('anders') && input.motivation.length < 10) {
      throw new HttpError(400, 'Vertel kort wat voor radio je wilt maken.', { motivation: 'Vertel kort wat voor radio je wilt maken.' })
    }
    const reasons = [...new Set(input.reasons)]
    const [row] = await db.insert(videoUploadRequests).values({ userId: me.id, kind: 'radio', reasons, motivation: input.motivation }).onConflictDoNothing().returning()
    if (!row) throw new HttpError(409, 'Je aanvraag ligt al bij de beheerder.')
    const message = [
      `${me.name} (@${me.username}) wil graag radio maken op Kuddes.`,
      '',
      '**Waarom:**',
      ...reasons.map((r) => `- ${RADIO_UPLOAD_REASONS[r]}`),
      ...(input.motivation ? ['', '**Toelichting:**', input.motivation] : []),
      '',
      'Akkoord met de regels voor radio: ja',
      '',
      `Goedkeuren of afwijzen: [Beheer → Radio-rechten](${absolute('/beheer?tab=radio')})`,
    ].join('\n')
    for (const admin of await admins()) await deliverMessage(me.id, admin.id, `Aanvraag: radio maken (@${me.username})`, message)
    return c.json(await radioAccess(me), 201)
  })

  // ---------------------------------------------------------- programming
  .post('/radio/me/shows', rateLimit('uitzendingen', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    await ownStation(me)
    const input = parse(showSchema, await c.req.json().catch(() => null))
    const [{ n }] = await db.select({ n: count() }).from(radioShows).where(and(eq(radioShows.stationId, me.id), gt(radioShows.endsAt, new Date())))
    if (n >= RADIO_LIMITS.shows) throw new HttpError(400, `Je kunt maximaal ${RADIO_LIMITS.shows} uitzendingen vooruit plannen.`)
    const startsAt = new Date(input.startsAt)
    const [row] = await db
      .insert(radioShows)
      .values({ stationId: me.id, title: input.title, description: input.description, startsAt, endsAt: new Date(startsAt.getTime() + input.minutes * 60_000), playlist: await readyTracks(input.playlist) })
      .returning()
    return c.json(toShow(row, true), 201)
  })

  .put('/radio/me/shows/:id{[0-9]+}', async (c) => {
    const me = requireVerified(c)
    await ownStation(me)
    const input = parse(showSchema, await c.req.json().catch(() => null))
    const startsAt = new Date(input.startsAt)
    const [row] = await db
      .update(radioShows)
      .set({ title: input.title, description: input.description, startsAt, endsAt: new Date(startsAt.getTime() + input.minutes * 60_000), playlist: await readyTracks(input.playlist) })
      .where(and(eq(radioShows.id, Number(c.req.param('id'))), eq(radioShows.stationId, me.id)))
      .returning()
    if (!row) throw notFound()
    return c.json(toShow(row, true))
  })

  .delete('/radio/me/shows/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    await db.delete(radioShows).where(and(eq(radioShows.id, Number(c.req.param('id'))), eq(radioShows.stationId, me.id)))
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- co-DJs
  .post('/radio/me/djs', async (c) => {
    const me = requireVerified(c)
    const station = await ownStation(me)
    const { username } = parse(z.object({ username: z.string().trim().min(1) }), await c.req.json().catch(() => null))
    const dj = await findUser(username.replace(/^@/, ''))
    if (dj.id === me.id) throw new HttpError(400, 'Jij bent de host al.')
    if (!dj.emailVerifiedAt || dj.blockedAt) throw new HttpError(400, 'Dit lid kan geen DJ zijn.')
    const [{ n }] = await db.select({ n: count() }).from(radioDjs).where(eq(radioDjs.stationId, me.id))
    if (n >= RADIO_LIMITS.djs) throw new HttpError(400, `Je kunt maximaal ${RADIO_LIMITS.djs} DJ’s hebben.`)
    const [added] = await db.insert(radioDjs).values({ stationId: me.id, userId: dj.id }).onConflictDoNothing().returning()
    if (added) {
      await notify({ userIds: [dj.id], actorId: me.id, kind: 'radio', ref: `radio-dj/${me.id}/${dj.id}`, message: `heeft je DJ gemaakt bij ${station.name}`, link: `/radio/${me.username}` })
    }
    return c.json(toSummary(dj), 201)
  })

  .delete('/radio/me/djs/:username', async (c) => {
    const me = requireUser(c)
    const dj = await findUser(c.req.param('username'))
    await db.delete(radioDjs).where(and(eq(radioDjs.stationId, me.id), eq(radioDjs.userId, dj.id)))
    await unnotify(`radio-dj/${me.id}/${dj.id}`)
    if (live.isDjIn(me.id, dj.id)) {
      live.signal(me.id, dj.id, { from: me.id, kind: 'kick' })
      live.djLeft(me.id, dj.id)
    }
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- sound buttons
  .post(
    '/radio/me/sounds',
    bodyLimit({
      maxSize: RADIO_LIMITS.soundBytes + 64 * 1024,
      onError: () => {
        throw new HttpError(413, `Dit geluid is te groot (maximaal ${RADIO_LIMITS.soundBytes / 1024 / 1024} MB).`)
      },
    }),
    rateLimit('geluiden', 60, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      await ownStation(me)
      const [{ n }] = await db.select({ n: count() }).from(radioSounds).where(eq(radioSounds.userId, me.id))
      if (n >= RADIO_LIMITS.sounds) throw new HttpError(400, `Je kunt maximaal ${RADIO_LIMITS.sounds} geluiden hebben.`)
      const body = await c.req.parseBody()
      const input = parse(
        z.object({ name: z.string().trim().min(1, 'Geef het geluid een naam.').max(RADIO_LIMITS.soundName), color: z.enum(SOUND_COLORS as [string, ...string[]]).default(SOUND_COLORS[0]) }),
        { name: body.name, color: body.color },
      )
      const file = body.file
      if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Kies een geluidsbestand.')
      if (file.type && !AUDIO_TYPES.includes(file.type)) throw new HttpError(415, 'Dit soort bestand kunnen we niet gebruiken. Kies een MP3, WAV, OGG of M4A.')
      // Short and without the file's own details, as an MP3 that plays everywhere
      const tmp = path.join(config.uploadDir, 'tmp-music', `geluid-${randomBytes(8).toString('hex')}`)
      const rel = `radio/${me.id}-${randomBytes(12).toString('hex')}.mp3`
      await mkdir(path.dirname(tmp), { recursive: true })
      await mkdir(path.join(config.uploadDir, 'radio'), { recursive: true })
      await writeFile(tmp, Buffer.from(await file.arrayBuffer()))
      try {
        await run(
          'ffmpeg',
          ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-i', tmp, '-map', '0:a:0', '-vn', '-t', String(RADIO_LIMITS.soundSeconds), '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-map_metadata', '-1', '-y', path.join(config.uploadDir, rel)],
          60_000,
        )
      } catch {
        await rm(path.join(config.uploadDir, rel), { force: true })
        throw new HttpError(400, 'Dit bestand is geen geluid dat we kunnen lezen.')
      } finally {
        await rm(tmp, { force: true })
      }
      const [row] = await db.insert(radioSounds).values({ userId: me.id, name: input.name, color: input.color, path: rel }).returning()
      return c.json(soundOf(row), 201)
    },
  )

  .delete('/radio/me/sounds/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .delete(radioSounds)
      .where(and(eq(radioSounds.id, Number(c.req.param('id'))), eq(radioSounds.userId, me.id)))
      .returning()
    if (row) await removeUpload(row.path)
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- going live (the host's studio)
  .post('/radio/live/start', rateLimit('live gaan', 30, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const station = await ownStation(me)
    const input = parse(z.object({ title: z.string().trim().min(1, 'Geef je uitzending een titel.').max(RADIO_LIMITS.title), format: z.enum(['webm', 'ogg']) }), await c.req.json().catch(() => null))
    if (!live.isLive(me.id) && live.liveCount() >= RADIO_LIMITS.liveShows) throw new HttpError(503, 'Er zijn nu al te veel uitzendingen live. Probeer het straks nog eens.')
    live.start(me.id, input.title, input.format)
    // Followers hear about it (not again if you went live less than an hour ago)
    const quiet = station.lastLiveAt && Date.now() - station.lastLiveAt.getTime() < 60 * 60 * 1000
    await db.update(radioStations).set({ lastLiveAt: new Date() }).where(eq(radioStations.userId, me.id))
    if (!quiet) {
      await recordActivity({ type: 'radio', actorId: me.id, title: input.title })
      const followers = await db.select({ id: radioFollows.userId }).from(radioFollows).where(eq(radioFollows.stationId, me.id))
      await notify({
        userIds: followers.map((f) => f.id),
        actorId: me.id,
        kind: 'radio',
        ref: `radio-live/${me.id}/${Date.now()}`,
        message: `is live op ${station.name}`,
        text: input.title,
        link: `/radio/${me.username}`,
      })
    }
    return c.body(null, 204)
  })

  // A piece of the mix (about a second), in order
  .post('/radio/live/piece', async (c) => {
    const me = requireUser(c)
    const seq = Number(c.req.query('seq'))
    if (!Number.isInteger(seq) || seq < 0) throw new HttpError(400, 'Ongeldig stuk.')
    const result = live.piece(me.id, seq, Buffer.from(await c.req.arrayBuffer()))
    if (result === 'off') throw new HttpError(409, 'Je bent niet (meer) live.')
    if (result === 'gap') throw new HttpError(409, 'Er ging een stuk verloren.', undefined, 'gap')
    return c.body(null, 204)
  })

  .post('/radio/live/now', async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ trackId: z.number().int().positive().nullable(), title: z.string().trim().min(1).max(RADIO_LIMITS.title).optional() }), await c.req.json().catch(() => null))
    if (!live.isLive(me.id)) throw new HttpError(409, 'Je bent niet live.')
    if (input.title) live.setTitle(me.id, input.title)
    if (input.trackId !== undefined) live.setTrack(me.id, input.trackId ? await musicTrackById(input.trackId, me) : null)
    return c.body(null, 204)
  })

  .post('/radio/live/stop', async (c) => {
    const me = requireUser(c)
    live.stop(me.id)
    return c.body(null, 204)
  })

  // Set-up messages from the host to one of their DJs
  .post('/radio/live/signal', async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ to: z.number().int().positive(), kind: z.enum(['offer', 'answer', 'ice', 'kick']), payload: z.unknown().optional() }), await c.req.json().catch(() => null))
    if (!live.isDjIn(me.id, input.to)) throw new HttpError(409, 'Deze DJ is niet (meer) in de studio.')
    live.signal(me.id, input.to, { from: me.id, kind: input.kind, payload: input.payload })
    if (input.kind === 'kick') live.djLeft(me.id, input.to)
    return c.body(null, 204)
  })

  // A DJ's microphone through the server (when a direct connection doesn't work): the DJ starts a fresh recording for it
  .get('/radio/live/relay/:djId{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const djId = Number(c.req.param('djId'))
    const body = live.relayListen(me.id, djId)
    if (!body) throw notFound('Deze DJ is niet in de studio.')
    live.signal(me.id, djId, { from: me.id, kind: 'relay' })
    return audioStream(body, 'audio/webm')
  })

  // ---------------------------------------------------------- co-DJ in someone's show
  .post('/radio/stations/:username/dj/join', async (c) => {
    const me = requireVerified(c)
    const host = await djOf(c.req.param('username'), me)
    const [row] = await db.select(summaryColumns).from(users).where(eq(users.id, me.id))
    if (!live.isLive(host.id)) throw new HttpError(409, 'Deze zender is nu niet live.')
    if (!live.djJoined(host.id, toSummary(row))) throw new HttpError(409, `Er zijn al ${RADIO_LIMITS.djsLive} DJ’s in de studio.`)
    live.signal(host.id, host.id, { from: me.id, kind: 'join' })
    return c.json({ hostId: host.id })
  })

  .post('/radio/stations/:username/dj/leave', async (c) => {
    const me = requireUser(c)
    const host = await findUser(c.req.param('username'))
    if (live.isDjIn(host.id, me.id)) {
      live.djLeft(host.id, me.id)
      live.signal(host.id, host.id, { from: me.id, kind: 'leave' })
    }
    return c.body(null, 204)
  })

  .post('/radio/stations/:username/dj/signal', async (c) => {
    const me = requireUser(c)
    const host = await findUser(c.req.param('username'))
    const input = parse(z.object({ kind: z.enum(['offer', 'answer', 'ice', 'relay']), payload: z.unknown().optional() }), await c.req.json().catch(() => null))
    if (!live.isDjIn(host.id, me.id)) throw new HttpError(409, 'Je bent niet (meer) in de studio.')
    live.signal(host.id, host.id, { from: me.id, kind: input.kind, payload: input.payload })
    return c.body(null, 204)
  })

  .post('/radio/stations/:username/dj/piece', async (c) => {
    const me = requireUser(c)
    const host = await findUser(c.req.param('username'))
    if (!live.relayPiece(host.id, me.id, Buffer.from(await c.req.arrayBuffer()), c.req.query('first') === '1')) throw new HttpError(409, 'Je bent niet (meer) in de studio.')
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- the admin
  .post('/radio/stations/:username/stop', async (c) => {
    const me = requireUser(c)
    if (me.forumRole !== 'admin') throw new HttpError(403, 'Alleen de beheerder kan dit.')
    const user = await findUser(c.req.param('username'))
    live.stop(user.id)
    return c.body(null, 204)
  })

// Planned shows that ended long ago are cleared away now and then
setInterval(
  () => void db.delete(radioShows).where(lt(radioShows.endsAt, new Date(Date.now() - 7 * 86_400_000))).catch(() => undefined),
  6 * 60 * 60 * 1000,
).unref()

