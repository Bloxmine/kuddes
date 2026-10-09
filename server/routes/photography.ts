/**
 * Fotografie (/fotografie): members who like taking photos get a page of
 * their own, Flickr-style: their best photos (from their normal Foto's, or
 * uploaded there, which also puts them in Foto's), with the camera they used.
 * Each page says who may see it: everyone (also without an account),
 * members, or friends.
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Photo } from '../../shared/api'
import { PHOTOGRAPHY_LIMITS, PHOTOGRAPHY_VISIBILITY, PHOTO_PAGE_LIMITS, type PhotoComment, type PhotoPageData, type PhotographyKudde, type PhotographyPage, type PhotographyPhoto, type PhotographyVisibility } from '../../shared/photography'
import { db } from '../db/client'
import { kuddeMembers, kuddePhotos, kuddes, photoComments, photoFaves, photoRespects, photographyPages, photos, users, type User } from '../db/schema'
import { albumsOf } from './photos'
import { friendsOf, notify, notifyMentions, unnotify } from '../lib/notifications'
import { HttpError, notFound, parse } from '../lib/errors'
import { toPhoto } from '../lib/photos'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { acceptedFriendsOf, findUser, friendshipState, summaryColumns } from '../lib/users'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'

type PageRow = typeof photographyPages.$inferSelect

const pageSchema = z.object({
  title: z.string().trim().min(1, 'Geef je pagina een titel.').max(PHOTOGRAPHY_LIMITS.title),
  about: z.string().trim().max(PHOTOGRAPHY_LIMITS.about).default(''),
  gear: z.string().trim().max(PHOTOGRAPHY_LIMITS.gear).default(''),
  visibility: z.enum(Object.keys(PHOTOGRAPHY_VISIBILITY) as [PhotographyVisibility]),
  showExif: z.boolean().default(true),
  bannerPhotoId: z.number().int().positive().nullable().optional(),
  bannerY: z.number().int().min(0).max(100).optional(),
})

/** Which pages a viewer may see, as SQL: everyone's, members' when logged in, friends' when friends. */
function visibleTo(viewer: User | null): SQL {
  const open = eq(photographyPages.visibility, 'iedereen')
  if (!viewer) return open
  return or(open, eq(photographyPages.visibility, 'leden'), eq(photographyPages.userId, viewer.id), inArray(photographyPages.userId, acceptedFriendsOf(viewer.id)))!
}

async function canSee(page: PageRow, viewer: User | null) {
  if (page.visibility === 'iedereen') return true
  if (!viewer) return false
  if (page.visibility === 'leden' || page.userId === viewer.id) return true
  return (await friendshipState(viewer.id, page.userId)) === 'friends'
}

const onPage = and(eq(photos.inPhotography, true), isNull(users.blockedAt))

/** Photos with how many favourites they have, and whether the viewer gave one. */
async function withFaves(rows: { photo: typeof photos.$inferSelect; user: Parameters<typeof toPhoto>[1] }[], viewer: User | null): Promise<PhotographyPhoto[]> {
  const ids = rows.map((r) => r.photo.id)
  const [counts, mine, respects, myRespects] = ids.length
    ? await Promise.all([
        db.select({ id: photoFaves.photoId, n: count() }).from(photoFaves).where(inArray(photoFaves.photoId, ids)).groupBy(photoFaves.photoId),
        viewer ? db.select({ id: photoFaves.photoId }).from(photoFaves).where(and(inArray(photoFaves.photoId, ids), eq(photoFaves.userId, viewer.id))) : [],
        db.select({ id: photoRespects.photoId, n: count() }).from(photoRespects).where(inArray(photoRespects.photoId, ids)).groupBy(photoRespects.photoId),
        viewer ? db.select({ id: photoRespects.photoId }).from(photoRespects).where(and(inArray(photoRespects.photoId, ids), eq(photoRespects.userId, viewer.id))) : [],
      ])
    : [[], [], [], []]
  return rows.map(({ photo, user }) => ({
    ...toPhoto(photo, user, viewer?.id),
    faves: counts.find((c) => c.id === photo.id)?.n ?? 0,
    faved: mine.some((m) => m.id === photo.id),
    views: photo.views,
    respects: respects.find((r) => r.id === photo.id)?.n ?? 0,
    respected: myRespects.some((m) => m.id === photo.id),
  }))
}

// Written out with an alias: inside a subquery drizzle leaves column names bare
const faveCount = sql<number>`(select count(*)::int from photo_faves pf where pf.photo_id = "photos"."id")`

async function toPages(rows: { page: PageRow; user: Parameters<typeof toSummary>[0] }[], viewer: User | null): Promise<PhotographyPage[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.page.userId)
  const bannerIds = rows.map((r) => r.page.bannerPhotoId).filter((x): x is number => !!x)
  const [counts, faves, covers, banners] = await Promise.all([
    db.select({ userId: photos.userId, n: count() }).from(photos).where(and(inArray(photos.userId, ids), eq(photos.inPhotography, true))).groupBy(photos.userId),
    db
      .select({ userId: photos.userId, n: count() })
      .from(photoFaves)
      .innerJoin(photos, eq(photos.id, photoFaves.photoId))
      .where(and(inArray(photos.userId, ids), eq(photos.inPhotography, true)))
      .groupBy(photos.userId),
    // A few of the best photos of each, for the cover
    db
      .select({ photo: photos, user: summaryColumns, rank: sql<number>`row_number() over (partition by ${photos.userId} order by ${faveCount} desc, ${photos.id} desc)` })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(inArray(photos.userId, ids), eq(photos.inPhotography, true))),
    bannerIds.length ? db.select({ id: photos.id, path: photos.path }).from(photos).where(inArray(photos.id, bannerIds)) : [],
  ])
  return rows.map(({ page, user }) => ({
    user: toSummary(user),
    title: page.title,
    about: page.about,
    gear: page.gear,
    visibility: page.visibility as PhotographyVisibility,
    showExif: page.showExif,
    bannerPhotoId: page.bannerPhotoId,
    bannerUrl: uploadUrl(banners.find((b) => b.id === page.bannerPhotoId)?.path ?? null),
    bannerY: page.bannerY,
    photoCount: counts.find((c) => c.userId === page.userId)?.n ?? 0,
    faveCount: faves.find((c) => c.userId === page.userId)?.n ?? 0,
    cover: covers
      .filter((c) => c.photo.userId === page.userId && Number(c.rank) <= 4)
      .sort((a, b) => Number(a.rank) - Number(b.rank))
      .map((c): Photo => toPhoto(c.photo, c.user, viewer?.id)),
    mine: viewer?.id === page.userId,
  }))
}

/** Photography Kuddes the viewer may see (open ones, and closed ones they're in), with a few of their photos. */
async function photographyKuddes(viewer: User | null, q: string): Promise<PhotographyKudde[]> {
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const memberOf = viewer ? sql`${kuddes.id} in (select ${kuddeMembers.kuddeId} from ${kuddeMembers} where ${kuddeMembers.userId} = ${viewer.id} and ${kuddeMembers.role} <> 'pending')` : sql`false`
  const rows = await db
    .select({
      kudde: kuddes,
      // Written out with aliases: inside a subquery drizzle leaves column names bare
      members: sql<number>`(select count(*)::int from kudde_members km where km.kudde_id = "kuddes"."id" and km.role <> 'pending')`,
      photoCount: sql<number>`(select count(*)::int from kudde_photos kp where kp.kudde_id = "kuddes"."id")`,
    })
    .from(kuddes)
    .where(and(eq(kuddes.photography, true), or(eq(kuddes.visibility, 'openbaar'), memberOf), q ? ilike(kuddes.name, like) : undefined))
    .orderBy(desc(kuddes.createdAt))
    .limit(12)
  if (!rows.length) return []
  const covers = await db
    .select({ kuddeId: kuddePhotos.kuddeId, path: kuddePhotos.path, rank: sql<number>`row_number() over (partition by ${kuddePhotos.kuddeId} order by ${kuddePhotos.id} desc)` })
    .from(kuddePhotos)
    .where(inArray(kuddePhotos.kuddeId, rows.map((r) => r.kudde.id)))
  return rows.map(({ kudde, members, photoCount }) => ({
    slug: kudde.slug,
    name: kudde.name,
    imageUrl: uploadUrl(kudde.imagePath),
    memberCount: Number(members),
    photoCount: Number(photoCount),
    cover: covers.filter((c) => c.kuddeId === kudde.id && Number(c.rank) <= 4).map((c) => uploadUrl(c.path)!),
  }))
}

async function pageOf(userId: number) {
  const [row] = await db.select({ page: photographyPages, user: summaryColumns }).from(photographyPages).innerJoin(users, eq(users.id, photographyPages.userId)).where(eq(photographyPages.userId, userId))
  return row ?? null
}

export const photographyRoutes = new Hono<AppEnv>()
  .get('/photography/me', async (c) => {
    const me = requireUser(c)
    const row = await pageOf(me.id)
    return c.json(row ? (await toPages([row], me))[0] : null)
  })

  // Make your page, or change it
  .put('/photography/me', rateLimit('fotografie', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(pageSchema, await c.req.json().catch(() => null))
    // The banner: one of your own photos
    if (input.bannerPhotoId) {
      const [own] = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, input.bannerPhotoId), eq(photos.userId, me.id)))
      if (!own) throw new HttpError(400, 'Kies een van je eigen foto’s als banner.')
    }
    await db.insert(photographyPages).values({ userId: me.id, ...input }).onConflictDoUpdate({ target: photographyPages.userId, set: input })
    return c.json((await toPages([(await pageOf(me.id))!], me))[0])
  })

  // The page goes; the photos stay in your Foto's
  .delete('/photography/me', async (c) => {
    const me = requireUser(c)
    await db.transaction(async (tx) => {
      await tx.update(photos).set({ inPhotography: false }).where(eq(photos.userId, me.id))
      await tx.delete(photographyPages).where(eq(photographyPages.userId, me.id))
    })
    return c.body(null, 204)
  })

  // Looking around: pages and the newest (or most liked) photos, with a search
  .get('/photography', async (c) => {
    const viewer = c.get('user')
    const popular = c.req.query('sort') === 'populair'
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const search = q ? or(ilike(photos.caption, like), sql`${photos.exif}->>'camera' ilike ${like}`, ilike(users.nickname, like)) : undefined
    const pageSearch = q ? or(ilike(photographyPages.title, like), ilike(photographyPages.gear, like), ilike(users.nickname, like)) : undefined
    const [pageRows, photoRows] = await Promise.all([
      db
        .select({ page: photographyPages, user: summaryColumns })
        .from(photographyPages)
        .innerJoin(users, eq(users.id, photographyPages.userId))
        .where(and(visibleTo(viewer), isNull(users.blockedAt), pageSearch))
        .orderBy(desc(photographyPages.createdAt))
        .limit(24),
      db
        .select({ photo: photos, user: summaryColumns })
        .from(photos)
        .innerJoin(users, eq(users.id, photos.userId))
        .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
        .where(and(onPage, visibleTo(viewer), search))
        .orderBy(...(popular ? [desc(faveCount), desc(photos.id)] : [desc(photos.id)]))
        .limit(48),
    ])
    return c.json({ pages: await toPages(pageRows, viewer), photos: await withFaves(photoRows, viewer), kuddes: await photographyKuddes(viewer, q) })
  })

  .get('/photography/:username', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const row = await pageOf(user.id)
    if (!row || user.blockedAt) throw notFound('Deze fotografiepagina bestaat niet (meer).')
    if (!(await canSee(row.page, viewer))) throw new HttpError(viewer ? 403 : 401, viewer ? 'Alleen vrienden kunnen deze pagina zien.' : 'Log in om deze pagina te zien.')
    return c.json((await toPages([row], viewer))[0])
  })

  .get('/photography/:username/photos', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const row = await pageOf(user.id)
    if (!row || !(await canSee(row.page, viewer))) throw notFound()
    const popular = c.req.query('sort') === 'populair'
    const album = Number(c.req.query('album')) || null
    const rows = await db
      .select({ photo: photos, user: summaryColumns })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(eq(photos.userId, user.id), onPage, album ? eq(photos.albumId, album) : undefined))
      .orderBy(...(popular ? [desc(faveCount), desc(photos.id)] : [desc(photos.id)]))
      .limit(200)
    return c.json(await withFaves(rows, viewer))
  })

  // Their favourites: photos by others they gave a star (that the viewer may see too)
  .get('/photography/:username/faves', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const row = await pageOf(user.id)
    if (!row || !(await canSee(row.page, viewer))) throw notFound()
    const rows = await db
      .select({ photo: photos, user: summaryColumns })
      .from(photoFaves)
      .innerJoin(photos, eq(photos.id, photoFaves.photoId))
      .innerJoin(users, eq(users.id, photos.userId))
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photoFaves.userId, user.id), onPage, visibleTo(viewer)))
      .orderBy(desc(photoFaves.createdAt))
      .limit(200)
    return c.json(await withFaves(rows, viewer))
  })

  // One photo on its own page, with what's around it (the album or the photostream) and the reactions
  .get('/photography/photos/:id{[0-9]+}', async (c) => {
    const viewer = c.get('user')
    const [row] = await db
      .select({ photo: photos, user: summaryColumns, page: photographyPages })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photos.id, Number(c.req.param('id'))), onPage))
    if (!row) throw notFound('Deze foto staat niet (meer) op een fotografiepagina.')
    if (!(await canSee(row.page, viewer))) throw new HttpError(viewer ? 403 : 401, viewer ? 'Alleen vrienden kunnen deze foto zien.' : 'Log in om deze foto te zien.')
    const albumParam = Number(c.req.query('album')) || null
    const albums = await albumsOf(row.photo.userId)
    const inAlbum = albumParam ? albums.find((a) => a.id === albumParam) : undefined
    const [[photo], around, comments, respecters] = await Promise.all([
      withFaves([{ photo: row.photo, user: row.user }], viewer),
      db
        .select({ id: photos.id, path: photos.path, width: photos.width, height: photos.height })
        .from(photos)
        .where(and(eq(photos.userId, row.photo.userId), eq(photos.inPhotography, true), inAlbum ? eq(photos.albumId, inAlbum.id) : undefined))
        .orderBy(desc(photos.id))
        .limit(300),
      db
        .select({ comment: photoComments, user: summaryColumns })
        .from(photoComments)
        .innerJoin(users, eq(users.id, photoComments.userId))
        .where(and(eq(photoComments.photoId, row.photo.id), isNull(users.blockedAt), notHidden('foto', photoComments.id)))
        .orderBy(photoComments.id),
      db
        .select(summaryColumns)
        .from(photoRespects)
        .innerJoin(users, eq(users.id, photoRespects.userId))
        .where(and(eq(photoRespects.photoId, row.photo.id), isNull(users.blockedAt)))
        .orderBy(desc(photoRespects.createdAt))
        .limit(30),
    ])
    const result: PhotoPageData = {
      photo,
      pageTitle: row.page.title,
      album: albums.find((a) => a.id === row.photo.albumId) ?? null,
      context: { album: inAlbum ? { id: inAlbum.id, name: inAlbum.name } : null, photos: around.map((p) => ({ id: p.id, url: uploadUrl(p.path)!, width: p.width, height: p.height })) },
      comments: comments.map(({ comment, user }): PhotoComment => ({
        id: comment.id,
        user: toSummary(user),
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        canDelete: !!viewer && (viewer.id === comment.userId || viewer.id === row.photo.userId || viewer.forumRole === 'admin'),
      })),
      respecters: respecters.map(toSummary),
      mine: viewer?.id === row.photo.userId,
    }
    return c.json(result)
  })

  .post('/photography/photos/:id{[0-9]+}/comments', rateLimit('reacties', 120, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const [row] = await db
      .select({ photo: photos, page: photographyPages, owner: users.username })
      .from(photos)
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(eq(photos.id, Number(c.req.param('id'))), eq(photos.inPhotography, true)))
    if (!row || !(await canSee(row.page, me))) throw notFound()
    const { text } = parse(
      z.object({ text: z.string().trim().min(1, 'Schrijf een reactie.').max(PHOTO_PAGE_LIMITS.comment, `Een reactie mag maximaal ${PHOTO_PAGE_LIMITS.comment} tekens hebben.`) }),
      await c.req.json().catch(() => null),
    )
    const [comment] = await db.insert(photoComments).values({ photoId: row.photo.id, userId: me.id, text }).returning({ id: photoComments.id })
    // The photographer hears about it, and who's mentioned (if they may see the page)
    const ref = `photo:${row.photo.id}/comment:${comment.id}`
    const link = `/fotografie/${row.owner}/foto/${row.photo.id}`
    checkPost({ author: me, place: 'foto', text, link })
    await notify({ userIds: [row.photo.userId], actorId: me.id, kind: 'reactie', ref, message: 'reageerde op je foto', text, link })
    await notifyMentions({
      text,
      actorId: me.id,
      ref,
      message: 'noemde je bij een foto',
      link,
      canSee: async (ids) => (row.page.visibility === 'vrienden' ? await friendsOf(row.photo.userId, ids) : ids).filter((id) => id !== row.photo.userId),
    })
    return c.body(null, 201)
  })

  // The writer, the photographer or the admin
  .delete('/photo-comments/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select({ comment: photoComments, ownerId: photos.userId })
      .from(photoComments)
      .innerJoin(photos, eq(photos.id, photoComments.photoId))
      .where(eq(photoComments.id, Number(c.req.param('id'))))
    if (!row) throw notFound()
    if (row.comment.userId !== me.id && row.ownerId !== me.id && me.forumRole !== 'admin') throw new HttpError(403, 'Dit is niet jouw reactie.')
    await db.delete(photoComments).where(eq(photoComments.id, row.comment.id))
    await unnotify(`photo:${row.comment.photoId}/comment:${row.comment.id}`)
    return c.body(null, 204)
  })

  // Opening a photo: one more view (not your own)
  .post('/photography/photos/:id{[0-9]+}/view', rateLimit('bekeken', 600, 60 * 60 * 1000), async (c) => {
    const viewer = c.get('user')
    const id = Number(c.req.param('id'))
    await db
      .update(photos)
      .set({ views: sql`${photos.views} + 1` })
      .where(and(eq(photos.id, id), eq(photos.inPhotography, true), viewer ? sql`${photos.userId} <> ${viewer.id}` : undefined))
    return c.body(null, 204)
  })

  .post('/photography/photos/:id{[0-9]+}/fave', rateLimit('favorieten', 300, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const id = Number(c.req.param('id'))
    const [row] = await db
      .select({ page: photographyPages })
      .from(photos)
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photos.id, id), eq(photos.inPhotography, true)))
    if (!row || !(await canSee(row.page, me))) throw notFound()
    await db.insert(photoFaves).values({ photoId: id, userId: me.id }).onConflictDoNothing()
    return c.body(null, 204)
  })

  // Respect, like everywhere on Kuddes (not for your own photos)
  .post('/photography/photos/:id{[0-9]+}/respect', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const id = Number(c.req.param('id'))
    const [row] = await db
      .select({ page: photographyPages, ownerId: photos.userId })
      .from(photos)
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photos.id, id), eq(photos.inPhotography, true)))
    if (!row || !(await canSee(row.page, me))) throw notFound()
    if (row.ownerId === me.id) throw new HttpError(400, 'Je kunt geen respect geven aan je eigen foto.')
    await db.insert(photoRespects).values({ photoId: id, userId: me.id }).onConflictDoNothing()
    return c.body(null, 204)
  })

  .delete('/photography/photos/:id{[0-9]+}/respect', async (c) => {
    const me = requireUser(c)
    await db.delete(photoRespects).where(and(eq(photoRespects.photoId, Number(c.req.param('id'))), eq(photoRespects.userId, me.id)))
    return c.body(null, 204)
  })

  .delete('/photography/photos/:id{[0-9]+}/fave', async (c) => {
    const me = requireUser(c)
    await db.delete(photoFaves).where(and(eq(photoFaves.photoId, Number(c.req.param('id'))), eq(photoFaves.userId, me.id)))
    return c.body(null, 204)
  })
