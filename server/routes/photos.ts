import { and, count, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { db } from '../db/client'
import { photoAlbums, photographyPages, photos, users, activities } from '../db/schema'
import { recordActivity } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, imageSize, removeUpload, storeImage } from '../lib/uploads'
import { toPhoto } from '../lib/photos'
import { findUser, summaryColumns, requireProfileAccess } from '../lib/users'
import { PHOTO_EDIT_LIMITS, PHOTO_FILTERS, PHOTO_FRAMES, PHOTO_LOOKS, isUnedited, type PhotoFilter, type PhotoFrame, type PhotoLook } from '../../shared/photoEdits'
import { PICKABLE_ICONS } from '../../shared/icons'
import { PHOTO_ALBUM_LIMITS, PHOTO_PAGE_LIMITS, type PhotoAlbum } from '../../shared/photography'
import { cleanExif, exifSchema, jsonField } from '../lib/photography'
import { unnotify } from '../lib/notifications'
import { uploadUrl } from '../lib/serialize'

const captionSchema = z.string().trim().max(120, 'Een onderschrift mag maximaal 120 tekens hebben.')

const unit = z.number().min(0).max(1)
const slider = z.number().int().min(-100).max(100)
const editsSchema = z.object({
  steps: z
    .array(
      z.discriminatedUnion('t', [
        z.object({ t: z.literal('rotate'), turns: z.union([z.literal(1), z.literal(2), z.literal(3)]) }),
        z.object({ t: z.literal('flip'), axis: z.enum(['h', 'v']) }),
        z.object({ t: z.literal('crop'), x: unit, y: unit, w: z.number().min(0.01).max(1), h: z.number().min(0.01).max(1) }),
        z.object({ t: z.literal('redeye'), x: unit, y: unit, r: z.number().min(0.001).max(0.5) }),
      ]),
    )
    .max(PHOTO_EDIT_LIMITS.steps, 'Dat zijn te veel bewerkingen; begin opnieuw vanaf het origineel.'),
  light: slider,
  contrast: slider,
  saturation: slider,
  warmth: slider,
  vignette: z.number().int().min(0).max(100),
  filter: z.enum(Object.keys(PHOTO_FILTERS) as [PhotoFilter, ...PhotoFilter[]]),
  look: z.enum(Object.keys(PHOTO_LOOKS) as [PhotoLook, ...PhotoLook[]]).nullish(),
  frame: z.enum(Object.keys(PHOTO_FRAMES) as [PhotoFrame, ...PhotoFrame[]]).nullish(),
})

const albumSchema = z.object({
  name: z.string().trim().min(1, 'Geef het album een naam.').max(PHOTO_ALBUM_LIMITS.name, `Een naam mag maximaal ${PHOTO_ALBUM_LIMITS.name} tekens hebben.`),
  description: z.string().trim().max(PHOTO_ALBUM_LIMITS.description).default(''),
  icon: z.enum(PICKABLE_ICONS).nullable().default(null),
})

/** An album of yours, or a 404; null stays null (no album). */
async function ownAlbum(id: number | null | undefined, userId: number) {
  if (id === null || id === undefined) return null
  const [album] = await db.select().from(photoAlbums).where(and(eq(photoAlbums.id, id), eq(photoAlbums.userId, userId)))
  if (!album) throw new HttpError(400, 'Dit album bestaat niet (meer).', { albumId: 'Kies een van je eigen albums.' })
  return album
}

/** A member's albums with their size and cover (the chosen photo, or the newest). */
export async function albumsOf(userId: number): Promise<PhotoAlbum[]> {
  const rows = await db.select().from(photoAlbums).where(eq(photoAlbums.userId, userId)).orderBy(photoAlbums.position, photoAlbums.id)
  if (!rows.length) return []
  const ids = rows.map((a) => a.id)
  const [counts, newest] = await Promise.all([
    db.select({ albumId: photos.albumId, n: count() }).from(photos).where(inArray(photos.albumId, ids)).groupBy(photos.albumId),
    db.select({ albumId: photos.albumId, id: max(photos.id) }).from(photos).where(inArray(photos.albumId, ids)).groupBy(photos.albumId),
  ])
  const coverIds = rows.map((a) => a.coverPhotoId ?? newest.find((n) => n.albumId === a.id)?.id).filter((x): x is number => !!x)
  const covers = coverIds.length ? await db.select({ id: photos.id, path: photos.path, albumId: photos.albumId }).from(photos).where(inArray(photos.id, coverIds)) : []
  return rows.map((a) => {
    const coverId = a.coverPhotoId ?? newest.find((n) => n.albumId === a.id)?.id
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      icon: a.icon,
      coverUrl: uploadUrl(covers.find((c) => c.id === coverId)?.path ?? null),
      count: counts.find((c) => c.albumId === a.id)?.n ?? 0,
    }
  })
}

async function ownPhoto(id: string, userId: number) {
  const [photo] = await db.select().from(photos).where(and(eq(photos.id, Number(id)), eq(photos.userId, userId)))
  if (!photo) throw notFound()
  return photo
}

export const photoRoutes = new Hono<AppEnv>()
  .get('/users/:username/photos', async (c) => {
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(c.get('user'), user)
    // ?album=12 for one album, ?album=geen for the photos in none
    const album = c.req.query('album')
    const inAlbum = album === 'geen' ? isNull(photos.albumId) : Number(album) > 0 ? eq(photos.albumId, Number(album)) : undefined
    const rows = await db
      .select({ photo: photos, user: summaryColumns })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(eq(photos.userId, user.id), inAlbum))
      .orderBy(desc(photos.id))
      .limit(200)
    return c.json(rows.map((r) => toPhoto(r.photo, r.user, c.get('user')?.id)))
  })

  // One photo (for an embed in a forum post); photos are public, like the Foto's box
  .get('/photos/:id{[0-9]+}', async (c) => {
    const [row] = await db
      .select({ photo: photos, user: summaryColumns })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(eq(photos.id, Number(c.req.param('id'))), isNull(users.blockedAt)))
    if (!row) throw notFound('Deze foto bestaat niet (meer).')
    return c.json(toPhoto(row.photo, row.user, c.get('user')?.id))
  })

  .get('/photos/recent', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 14, 50)
    const rows = await db
      .select({ photo: photos, user: summaryColumns })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .orderBy(desc(photos.id))
      .limit(limit)
    return c.json(rows.map((r) => toPhoto(r.photo, r.user, c.get('user')?.id)))
  })

  .post(
    '/photos',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die foto is te groot (max 8 MB).')
      },
    }),
    rateLimit('uploads', 60, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const body = await c.req.parseBody()
      const caption = parse(captionSchema, typeof body.caption === 'string' ? body.caption : '')
      const album = await ownAlbum(Number(body.albumId) || null, me.id)
      // Camera details read in the browser (never a location: the schema only knows camera fields)
      const exif = cleanExif(parse(exifSchema.nullable(), jsonField(body.exif)))
      const inPhotography = body.inPhotography === 'true'
      const [page] = inPhotography ? await db.select({ visibility: photographyPages.visibility }).from(photographyPages).where(eq(photographyPages.userId, me.id)) : []
      if (inPhotography && !page) throw new HttpError(400, 'Maak eerst je fotografiepagina.')
      // Uploaded while writing a WieWatWaar or a post: that post goes on the timeline, the photo not a second time
      const forPost = body.forPost === 'true' && !inPhotography
      const stored = await storeImage(body.file, 'photos')
      const photo = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(photos)
          .values({ userId: me.id, path: stored.path, caption, width: stored.width, height: stored.height, albumId: album?.id ?? null, exif, showExif: !!exif && body.showExif === 'true', inPhotography })
          .returning()
        // Straight onto the photography page: on the timeline as such, for who may see that page
        if (!forPost)
          await recordActivity(
            page ? { type: 'photography', actorId: me.id, photoId: created.id, visibility: page.visibility === 'vrienden' ? 'vrienden' : 'iedereen' } : { type: 'photo', actorId: me.id, photoId: created.id },
            tx,
          )
        return created
      })
      return c.json(toPhoto(photo, me, me.id), 201)
    },
  )

  // The caption, album, camera details and whether they show, and whether it's on your photography page
  .patch('/photos/:id', async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({
        caption: captionSchema.optional(),
        description: z.string().trim().max(PHOTO_PAGE_LIMITS.description, `Een beschrijving mag maximaal ${PHOTO_PAGE_LIMITS.description} tekens hebben.`).optional(),
        albumId: z.number().int().positive().nullable().optional(),
        exif: exifSchema.nullable().optional(),
        showExif: z.boolean().optional(),
        inPhotography: z.boolean().optional(),
      }),
      await c.req.json().catch(() => null),
    )
    if (input.albumId) await ownAlbum(input.albumId, me.id)
    const [page] = input.inPhotography ? await db.select({ visibility: photographyPages.visibility }).from(photographyPages).where(eq(photographyPages.userId, me.id)) : []
    if (input.inPhotography && !page) throw new HttpError(400, 'Maak eerst je fotografiepagina.')
    const [photo] = await db
      .update(photos)
      .set({
        ...(input.caption !== undefined && { caption: input.caption }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.albumId !== undefined && { albumId: input.albumId }),
        ...(input.exif !== undefined && { exif: cleanExif(input.exif) }),
        ...(input.showExif !== undefined && { showExif: input.showExif }),
        ...(input.inPhotography !== undefined && { inPhotography: input.inPhotography }),
      })
      .where(and(eq(photos.id, Number(c.req.param('id'))), eq(photos.userId, me.id)))
      .returning()
    if (!photo) throw notFound()
    // Put on the photography page for the first time: on the timeline as a photography photo
    if (input.inPhotography && page) {
      const [seen] = await db.select({ id: activities.id }).from(activities).where(and(eq(activities.photoId, photo.id), eq(activities.type, 'photography')))
      if (!seen) await recordActivity({ type: 'photography', actorId: me.id, photoId: photo.id, visibility: page.visibility === 'vrienden' ? 'vrienden' : 'iedereen' })
    }
    return c.json(toPhoto(photo, me, me.id))
  })

  // The edited version, made in the browser from the original; the original stays
  .put(
    '/photos/:id/image',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die foto is te groot (max 8 MB).')
      },
    }),
    rateLimit('uploads', 60, 60 * 60 * 1000),
    async (c) => {
      const me = requireUser(c)
      const photo = await ownPhoto(c.req.param('id'), me.id)
      const body = await c.req.parseBody()
      let raw: unknown = null
      try {
        raw = JSON.parse(typeof body.edits === 'string' ? body.edits : '')
      } catch {
        // checked below
      }
      const edits = parse(editsSchema, raw)
      const caption = typeof body.caption === 'string' ? parse(captionSchema, body.caption) : photo.caption
      if (isUnedited(edits)) return c.json(toPhoto(await restore(photo, caption), me, me.id))
      const stored = await storeImage(body.file, 'photos')
      const [updated] = await db
        .update(photos)
        .set({ path: stored.path, width: stored.width, height: stored.height, originalPath: photo.originalPath ?? photo.path, edits, caption })
        .where(eq(photos.id, photo.id))
        .returning()
      // An earlier edited version isn't needed any more
      if (photo.originalPath) await removeUpload(photo.path)
      return c.json(toPhoto(updated, me, me.id))
    },
  )

  // Back to the photo as it was uploaded
  .post('/photos/:id/original', async (c) => {
    const me = requireUser(c)
    const photo = await ownPhoto(c.req.param('id'), me.id)
    return c.json(toPhoto(await restore(photo, photo.caption), me, me.id))
  })

  // Albums
  .get('/users/:username/albums', async (c) => {
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(c.get('user'), user)
    return c.json(await albumsOf(user.id))
  })

  .post('/me/albums', rateLimit('albums', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(albumSchema, await c.req.json().catch(() => null))
    const [{ n }] = await db.select({ n: count() }).from(photoAlbums).where(eq(photoAlbums.userId, me.id))
    if (n >= PHOTO_ALBUM_LIMITS.perMember) throw new HttpError(400, `Je kunt maximaal ${PHOTO_ALBUM_LIMITS.perMember} albums maken.`)
    const [created] = await db
      .insert(photoAlbums)
      .values({ userId: me.id, ...input, position: sql`(select coalesce(max(${photoAlbums.position}), 0) + 1 from ${photoAlbums} where ${photoAlbums.userId} = ${me.id})` })
      .returning()
    return c.json((await albumsOf(me.id)).find((a) => a.id === created.id), 201)
  })

  .patch('/albums/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const album = await ownAlbum(Number(c.req.param('id')), me.id)
    const input = parse(albumSchema.partial().extend({ coverPhotoId: z.number().int().positive().nullable().optional() }), await c.req.json().catch(() => null))
    if (input.coverPhotoId) {
      const [ok] = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, input.coverPhotoId), eq(photos.albumId, album!.id)))
      if (!ok) throw new HttpError(400, 'Kies een foto uit dit album als omslag.')
    }
    await db.update(photoAlbums).set(input).where(eq(photoAlbums.id, album!.id))
    return c.json((await albumsOf(me.id)).find((a) => a.id === album!.id))
  })

  // The photos stay, outside any album
  .delete('/albums/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const album = await ownAlbum(Number(c.req.param('id')), me.id)
    await db.delete(photoAlbums).where(eq(photoAlbums.id, album!.id))
    return c.body(null, 204)
  })

  .delete('/photos/:id', async (c) => {
    const me = requireUser(c)
    const [photo] = await db
      .delete(photos)
      .where(and(eq(photos.id, Number(c.req.param('id'))), eq(photos.userId, me.id)))
      .returning()
    if (!photo) throw notFound()
    await Promise.all([removeUpload(photo.path), removeUpload(photo.originalPath), unnotify(`photo:${photo.id}`)])
    return c.body(null, 204)
  })

async function restore(photo: typeof photos.$inferSelect, caption: string) {
  if (!photo.originalPath) {
    if (caption === photo.caption) return photo
    const [updated] = await db.update(photos).set({ caption }).where(eq(photos.id, photo.id)).returning()
    return updated
  }
  const size = await imageSize(photo.originalPath)
  const [updated] = await db
    .update(photos)
    .set({ path: photo.originalPath, originalPath: null, edits: null, caption, ...size })
    .where(eq(photos.id, photo.id))
    .returning()
  await removeUpload(photo.path)
  return updated
}
