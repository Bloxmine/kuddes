/** A Kudde's own Foto's box: members add photos, everyone who may see the Kudde can look. */
import { and, count, desc, eq, inArray, max } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { KuddePhoto, KuddePhotoList, MyKuddePhotos, SharedKuddePhoto } from '../../shared/api'
import { KUDDE_PHOTO_LIMITS } from '../../shared/kuddes'
import { db } from '../db/client'
import { kuddeMembers, kuddePhotoAlbums, kuddePhotos, kuddes, photos, users, type User } from '../db/schema'
import { PICKABLE_ICONS } from '../../shared/icons'
import { PHOTO_ALBUM_LIMITS } from '../../shared/photography'
import { cleanExif, exifSchema, jsonField } from '../lib/photography'
import { HttpError, notFound, parse } from '../lib/errors'
import { rightsOf } from '../lib/kuddes'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl, type SummaryRow } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, copyUpload, removeUpload, storeImage } from '../lib/uploads'
import { summaryColumns } from '../lib/users'

/** A beheerder with the "Prikbord en foto's" right looks after the photos like an owner. */
async function membershipOf(kuddeId: number, userId: number) {
  const { role, rights } = await rightsOf(kuddeId, userId)
  return rights.includes('prikbord') ? 'owner' : role
}
type Role = Awaited<ReturnType<typeof membershipOf>>
const isAdmin = (u: User | null) => u?.forumRole === 'admin'
const isMember = (role: Role | null) => role === 'owner' || role === 'member'

async function findKudde(slug: string) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, slug)).limit(1)
  if (!kudde) throw notFound('Deze Kudde bestaat niet.')
  return kudde
}

function toKuddePhoto(p: typeof kuddePhotos.$inferSelect, user: SummaryRow, viewer: User | null, role: Role | null): KuddePhoto {
  return {
    id: p.id,
    url: uploadUrl(p.path)!,
    caption: p.caption,
    width: p.width,
    height: p.height,
    createdAt: p.createdAt.toISOString(),
    user: toSummary(user),
    canDelete: !!viewer && (viewer.id === p.userId || role === 'owner' || isAdmin(viewer)),
    albumId: p.albumId,
    exif: p.showExif || viewer?.id === p.userId ? (p.exif ?? null) : null,
    showExif: p.showExif,
    sourcePhotoId: p.sourcePhotoId,
  }
}

const albumSchema = z.object({
  name: z.string().trim().min(1, 'Geef het album een naam.').max(PHOTO_ALBUM_LIMITS.name, `Een naam mag maximaal ${PHOTO_ALBUM_LIMITS.name} tekens hebben.`),
  description: z.string().trim().max(PHOTO_ALBUM_LIMITS.description).default(''),
  icon: z.enum(PICKABLE_ICONS).nullable().default(null),
})

/** A Kudde's albums with their size and cover (the newest photo in it). */
async function albumsOf(kuddeId: number, viewer: User | null, role: Role | null): Promise<KuddePhotoList['albums']> {
  const rows = await db.select().from(kuddePhotoAlbums).where(eq(kuddePhotoAlbums.kuddeId, kuddeId)).orderBy(kuddePhotoAlbums.name)
  if (!rows.length) return []
  const ids = rows.map((a) => a.id)
  const stats = await db
    .select({ albumId: kuddePhotos.albumId, n: count(), newest: max(kuddePhotos.id) })
    .from(kuddePhotos)
    .where(inArray(kuddePhotos.albumId, ids))
    .groupBy(kuddePhotos.albumId)
  const newest = stats.map((s) => s.newest).filter((x): x is number => !!x)
  const covers = newest.length ? await db.select({ id: kuddePhotos.id, path: kuddePhotos.path }).from(kuddePhotos).where(inArray(kuddePhotos.id, newest)) : []
  return rows.map((a) => {
    const s = stats.find((x) => x.albumId === a.id)
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      count: s?.n ?? 0,
      coverUrl: uploadUrl(covers.find((c) => c.id === s?.newest)?.path ?? null),
      mine: !!viewer && (a.createdBy === viewer.id || role === 'owner' || isAdmin(viewer)),
    }
  })
}

/** An album of this Kudde you may change (you made it, or you own the Kudde). */
async function ownAlbum(id: number, me: User) {
  const [album] = await db.select().from(kuddePhotoAlbums).where(eq(kuddePhotoAlbums.id, id))
  if (!album) throw notFound('Dit album bestaat niet (meer).')
  const role = await membershipOf(album.kuddeId, me.id)
  if (album.createdBy !== me.id && role !== 'owner' && !isAdmin(me)) throw new HttpError(403, 'Alleen wie het album maakte, of de beheerder, kan het veranderen.')
  return album
}

/** An album id from a form or JSON, if it's one of this Kudde's. */
async function albumOf(kuddeId: number, id: unknown) {
  const n = Number(id)
  if (!n) return null
  const [album] = await db.select({ id: kuddePhotoAlbums.id }).from(kuddePhotoAlbums).where(and(eq(kuddePhotoAlbums.id, n), eq(kuddePhotoAlbums.kuddeId, kuddeId)))
  if (!album) throw new HttpError(400, 'Dit album bestaat niet (meer).')
  return album.id
}

export const kuddePhotoRoutes = new Hono<AppEnv>()
  // The photo picker's "Kuddes" tab: the photos of the open Kuddes you're in
  .get('/me/kudde-photos', async (c) => {
    const me = requireUser(c)
    const mine = await db
      .select({ kudde: kuddes, role: kuddeMembers.role })
      .from(kuddeMembers)
      .innerJoin(kuddes, eq(kuddes.id, kuddeMembers.kuddeId))
      .where(and(eq(kuddeMembers.userId, me.id), inArray(kuddeMembers.role, ['owner', 'member'])))
    // Open Kuddes that let their photos be used elsewhere (the owner can switch that off)
    const open = mine.filter((m) => m.kudde.visibility === 'openbaar' && m.kudde.photosShareable)
    const rows = open.length
      ? await db
          .select({ photo: kuddePhotos, user: summaryColumns })
          .from(kuddePhotos)
          .innerJoin(users, eq(users.id, kuddePhotos.userId))
          .where(inArray(kuddePhotos.kuddeId, open.map((m) => m.kudde.id)))
          .orderBy(desc(kuddePhotos.id))
          .limit(400)
      : []
    const result: MyKuddePhotos = {
      kuddes: open
        .map((m) => ({
          slug: m.kudde.slug,
          name: m.kudde.name,
          imageUrl: uploadUrl(m.kudde.imagePath),
          photos: rows.filter((r) => r.photo.kuddeId === m.kudde.id).slice(0, 60).map((r) => toKuddePhoto(r.photo, r.user, me, m.role)),
        }))
        .filter((k) => k.photos.length)
        .sort((a, b) => b.photos[0].id - a.photos[0].id),
      closed: mine.length - open.length,
    }
    return c.json(result)
  })

  // One photo, for an embed in a post: like the Kudde's own Foto's box, a besloten Kudde's are for its members
  .get('/kudde-photos/:id', async (c) => {
    const viewer = c.get('user')
    const id = Number(c.req.param('id'))
    if (!Number.isInteger(id) || id <= 0) throw notFound()
    const [row] = await db
      .select({ photo: kuddePhotos, user: summaryColumns, kudde: kuddes })
      .from(kuddePhotos)
      .innerJoin(users, eq(users.id, kuddePhotos.userId))
      .innerJoin(kuddes, eq(kuddes.id, kuddePhotos.kuddeId))
      .where(eq(kuddePhotos.id, id))
    if (!row) throw notFound('Deze foto bestaat niet (meer).')
    const role = viewer ? await membershipOf(row.kudde.id, viewer.id) : null
    if ((row.kudde.visibility === 'besloten' || !row.kudde.photosShareable) && !isMember(role) && !isAdmin(viewer))
      throw new HttpError(403, row.kudde.visibility === 'besloten' ? 'Deze foto is van een besloten Kudde.' : 'Deze Kudde deelt haar foto’s niet buiten de Kudde.')
    const result: SharedKuddePhoto = { ...toKuddePhoto(row.photo, row.user, viewer ?? null, role), kudde: { slug: row.kudde.slug, name: row.kudde.name } }
    return c.json(result)
  })

  .get('/kuddes/:slug/photos', async (c) => {
    const viewer = c.get('user')
    const kudde = await findKudde(c.req.param('slug'))
    const role = viewer ? await membershipOf(kudde.id, viewer.id) : null
    // A closed Kudde's photos are for its members only
    if (kudde.visibility === 'besloten' && !isMember(role) && !isAdmin(viewer)) throw new HttpError(403, "Alleen leden zien de foto's van deze besloten Kudde.")
    const [rows, [{ n }]] = await Promise.all([
      db
        .select({ photo: kuddePhotos, user: summaryColumns })
        .from(kuddePhotos)
        .innerJoin(users, eq(users.id, kuddePhotos.userId))
        .where(eq(kuddePhotos.kuddeId, kudde.id))
        .orderBy(desc(kuddePhotos.id))
        .limit(200),
      db.select({ n: count() }).from(kuddePhotos).where(eq(kuddePhotos.kuddeId, kudde.id)),
    ])
    const list: KuddePhotoList = { items: rows.map((r) => toKuddePhoto(r.photo, r.user, viewer ?? null, role)), total: n, canUpload: isMember(role), albums: await albumsOf(kudde.id, viewer ?? null, role) }
    return c.json(list)
  })

  .post(
    '/kuddes/:slug/photos',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die foto is te groot (max 8 MB).')
      },
    }),
    rateLimit('uploads', 60, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const kudde = await findKudde(c.req.param('slug'))
      const role = await membershipOf(kudde.id, me.id)
      if (!isMember(role)) throw new HttpError(403, "Word eerst lid van deze Kudde om foto's toe te voegen.")
      const [{ n }] = await db.select({ n: count() }).from(kuddePhotos).where(eq(kuddePhotos.kuddeId, kudde.id))
      if (n >= KUDDE_PHOTO_LIMITS.perKudde) throw new HttpError(400, `Deze Kudde heeft al ${KUDDE_PHOTO_LIMITS.perKudde} foto's; haal er eerst een paar weg.`)
      const body = await c.req.parseBody()
      const caption = parse(z.string().trim().max(KUDDE_PHOTO_LIMITS.caption, `Een onderschrift mag maximaal ${KUDDE_PHOTO_LIMITS.caption} tekens hebben.`), typeof body.caption === 'string' ? body.caption : '')
      const albumId = await albumOf(kudde.id, body.albumId)
      // Camera details read in the browser (never a location: the schema only knows camera fields)
      const exif = cleanExif(parse(exifSchema.nullable(), jsonField(body.exif)))
      const stored = await storeImage(body.file, 'photos')
      const [photo] = await db
        .insert(kuddePhotos)
        .values({ kuddeId: kudde.id, userId: me.id, path: stored.path, caption, width: stored.width, height: stored.height, albumId, exif, showExif: !!exif && body.showExif === 'true' })
        .returning()
      return c.json(toKuddePhoto(photo, me, me, role), 201)
    },
  )

  // A photography Kudde: members put in photos from their own photography page (a copy, with its title and camera details)
  .post('/kuddes/:slug/photos/from-photography', rateLimit('uploads', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const kudde = await findKudde(c.req.param('slug'))
    if (!kudde.photography) throw new HttpError(400, 'Dit kan alleen in een Fotografie-Kudde.')
    const role = await membershipOf(kudde.id, me.id)
    if (!isMember(role)) throw new HttpError(403, "Word eerst lid van deze Kudde om foto's toe te voegen.")
    const input = parse(z.object({ photoIds: z.array(z.number().int().positive()).min(1, 'Kies een foto.').max(50), albumId: z.number().int().positive().nullable().optional() }), await c.req.json().catch(() => null))
    const albumId = await albumOf(kudde.id, input.albumId)
    const mine = await db
      .select()
      .from(photos)
      .where(and(inArray(photos.id, input.photoIds), eq(photos.userId, me.id), eq(photos.inPhotography, true)))
    // Each photo once in a Kudde
    const already = new Set(
      (await db.select({ id: kuddePhotos.sourcePhotoId }).from(kuddePhotos).where(and(eq(kuddePhotos.kuddeId, kudde.id), inArray(kuddePhotos.sourcePhotoId, input.photoIds)))).map((r) => r.id),
    )
    const todo = mine.filter((p) => !already.has(p.id))
    const [{ n }] = await db.select({ n: count() }).from(kuddePhotos).where(eq(kuddePhotos.kuddeId, kudde.id))
    if (n + todo.length > KUDDE_PHOTO_LIMITS.perKudde) throw new HttpError(400, `Deze Kudde kan nog ${Math.max(0, KUDDE_PHOTO_LIMITS.perKudde - n)} foto's hebben.`)
    for (const p of todo) {
      const path = await copyUpload(p.path)
      await db.insert(kuddePhotos).values({
        kuddeId: kudde.id,
        userId: me.id,
        path,
        caption: p.caption.slice(0, KUDDE_PHOTO_LIMITS.caption),
        width: p.width,
        height: p.height,
        albumId,
        exif: p.exif,
        showExif: p.showExif,
        sourcePhotoId: p.id,
      })
    }
    return c.json({ added: todo.length, skipped: input.photoIds.length - todo.length }, 201)
  })

  // The uploader or the owner: its caption, album and camera details
  .patch('/kudde-photos/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [photo] = await db.select().from(kuddePhotos).where(eq(kuddePhotos.id, Number(c.req.param('id'))))
    if (!photo) throw notFound('Deze foto bestaat niet (meer).')
    const role = await membershipOf(photo.kuddeId, me.id)
    if (photo.userId !== me.id && role !== 'owner' && !isAdmin(me)) throw new HttpError(403, 'Dit is niet jouw foto.')
    const input = parse(
      z.object({
        caption: z.string().trim().max(KUDDE_PHOTO_LIMITS.caption).optional(),
        albumId: z.number().int().positive().nullable().optional(),
        exif: exifSchema.nullable().optional(),
        showExif: z.boolean().optional(),
      }),
      await c.req.json().catch(() => null),
    )
    if (input.albumId) await albumOf(photo.kuddeId, input.albumId)
    const [updated] = await db
      .update(kuddePhotos)
      .set({
        ...(input.caption !== undefined && { caption: input.caption }),
        ...(input.albumId !== undefined && { albumId: input.albumId }),
        ...(input.exif !== undefined && { exif: cleanExif(input.exif) }),
        ...(input.showExif !== undefined && { showExif: input.showExif }),
      })
      .where(eq(kuddePhotos.id, photo.id))
      .returning()
    return c.json(toKuddePhoto(updated, me, me, role))
  })

  // Albums: members make them
  .post('/kuddes/:slug/albums', rateLimit('albums', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const kudde = await findKudde(c.req.param('slug'))
    const role = await membershipOf(kudde.id, me.id)
    if (!isMember(role)) throw new HttpError(403, 'Word eerst lid van deze Kudde.')
    const input = parse(albumSchema, await c.req.json().catch(() => null))
    const [{ n }] = await db.select({ n: count() }).from(kuddePhotoAlbums).where(eq(kuddePhotoAlbums.kuddeId, kudde.id))
    if (n >= PHOTO_ALBUM_LIMITS.perMember) throw new HttpError(400, `Een Kudde kan maximaal ${PHOTO_ALBUM_LIMITS.perMember} albums hebben.`)
    const [created] = await db.insert(kuddePhotoAlbums).values({ kuddeId: kudde.id, createdBy: me.id, ...input }).returning()
    return c.json((await albumsOf(kudde.id, me, role)).find((a) => a.id === created.id), 201)
  })

  .patch('/kudde-albums/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const album = await ownAlbum(Number(c.req.param('id')), me)
    const input = parse(albumSchema.partial(), await c.req.json().catch(() => null))
    await db.update(kuddePhotoAlbums).set(input).where(eq(kuddePhotoAlbums.id, album.id))
    return c.json((await albumsOf(album.kuddeId, me, await membershipOf(album.kuddeId, me.id))).find((a) => a.id === album.id))
  })

  // The photos stay, outside any album
  .delete('/kudde-albums/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const album = await ownAlbum(Number(c.req.param('id')), me)
    await db.delete(kuddePhotoAlbums).where(eq(kuddePhotoAlbums.id, album.id))
    return c.body(null, 204)
  })

  .delete('/kudde-photos/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [photo] = await db.select().from(kuddePhotos).where(eq(kuddePhotos.id, Number(c.req.param('id'))))
    if (!photo) throw notFound('Deze foto bestaat niet (meer).')
    const role = await membershipOf(photo.kuddeId, me.id)
    if (photo.userId !== me.id && role !== 'owner' && !isAdmin(me)) throw new HttpError(403, 'Dit is niet jouw foto.')
    await db.delete(kuddePhotos).where(and(eq(kuddePhotos.id, photo.id)))
    await removeUpload(photo.path)
    return c.body(null, 204)
  })
