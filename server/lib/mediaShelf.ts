/**
 * Recensies and the shelf gadgets: putting an item from the collection in a
 * member's kast (Boekenkast, Filmrek, …), with their stars and a bit of their
 * review as the note. The shelf item keeps `mediaId`, so it links back to the
 * item's page. Without that kast yet, it's added to the profile.
 */
import { randomBytes } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import { GADGET_TYPES, LIMITS as GADGET_LIMITS, type GadgetConfig } from '../../shared/gadgets'
import { MEDIA_KINDS, isMediaKind, shelfItemFrom, type MediaKind, type MediaShelf, type MediaSummary } from '../../shared/media'
import { uploadUrl } from './serialize'
import { db } from '../db/client'
import { gadgets, mediaItems } from '../db/schema'
import { HttpError } from './errors'

type ShelfType = (typeof MEDIA_KINDS)[MediaKind]['shelf']
type ItemRow = typeof mediaItems.$inferSelect

/** Which list in the gadget's config holds the items. */
export const SHELF_LIST = { boeken: 'books', films: 'movies', platen: 'albums', spellen: 'games', drank: 'drinks', series: 'series' } as const satisfies Record<ShelfType, string>
const SHELF_MAX = { boeken: GADGET_LIMITS.books, films: GADGET_LIMITS.movies, platen: GADGET_LIMITS.albums, spellen: GADGET_LIMITS.games, drank: GADGET_LIMITS.drinks, series: GADGET_LIMITS.series }

type ShelfItem = { id: string; mediaId?: number; rating: number; note: string }
const listOf = (type: ShelfType, config: unknown) => ((config as Record<string, ShelfItem[] | undefined>)[SHELF_LIST[type]] ?? []) as ShelfItem[]


/** An item of the collection for the site (lists, the timeline). */
export function toMediaSummary(r: ItemRow): MediaSummary {
  return {
    id: r.id,
    slug: r.slug,
    kind: isMediaKind(r.kind) ? r.kind : 'boeken',
    title: r.title,
    creator: r.creator,
    year: r.year,
    genre: r.genre,
    description: r.description,
    color: r.color,
    style: r.style,
    details: r.details,
    photo: r.photoPath,
    photoUrl: uploadUrl(r.photoPath),
    rating: Math.round(r.rating * 10) / 10,
    reviews: r.reviews,
  }
}

/** The item as it stands in that kind of kast (shared/media.ts). */
const shelfItem = (item: ItemRow, rating: number, note: string, existingId?: string) =>
  shelfItemFrom({ ...item, kind: item.kind as MediaKind }, rating, note, existingId ?? randomBytes(6).toString('hex'))

const shelfTypeOf = (item: ItemRow) => MEDIA_KINDS[item.kind as MediaKind].shelf

async function firstShelf(userId: number, type: ShelfType) {
  const [row] = await db.select().from(gadgets).where(and(eq(gadgets.userId, userId), eq(gadgets.type, type))).orderBy(asc(gadgets.id)).limit(1)
  return row ?? null
}

/** Your kast for this item: whether you have one, whether the item is in it and whether it's full. */
export async function shelfState(userId: number, item: ItemRow): Promise<MediaShelf> {
  const type = shelfTypeOf(item)
  const row = await firstShelf(userId, type)
  if (!row) return { gadgetId: null, onShelf: false, full: false }
  const list = listOf(type, row.config)
  return { gadgetId: row.id, onShelf: list.some((i) => i.mediaId === item.id), full: list.length >= SHELF_MAX[type] }
}

/** Puts it in your kast (or updates the stars and note when it's there already). */
export async function putOnShelf(userId: number, item: ItemRow, rating: number, note: string) {
  const type = shelfTypeOf(item)
  let row = await firstShelf(userId, type)
  let created = false
  if (!row) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(gadgets).where(eq(gadgets.userId, userId))
    if (n >= GADGET_LIMITS.gadgets) throw new HttpError(400, `Je hebt al ${GADGET_LIMITS.gadgets} gadgets: haal er eerst een weg om een ${GADGET_TYPES[type].name} te maken.`)
    ;[row] = await db
      .insert(gadgets)
      .values({ userId, type, title: GADGET_TYPES[type].name, config: { [SHELF_LIST[type]]: [] } as unknown as GadgetConfig[typeof type] })
      .returning()
    created = true
  }
  const list = listOf(type, row.config)
  const at = list.findIndex((i) => i.mediaId === item.id)
  if (at < 0 && list.length >= SHELF_MAX[type]) throw new HttpError(400, `Je ${GADGET_TYPES[type].name} is vol (${SHELF_MAX[type]} stuks). Haal er eerst iets uit.`)
  const next = at >= 0 ? list.map((x, i) => (i === at ? shelfItem(item, rating, note, x.id) : x)) : [...list, shelfItem(item, rating, note)]
  await db
    .update(gadgets)
    .set({ config: { ...(row.config as object), [SHELF_LIST[type]]: next } as unknown as GadgetConfig[typeof type] })
    .where(eq(gadgets.id, row.id))
  return { gadgetId: row.id, created, updated: at >= 0, shelf: GADGET_TYPES[type].name }
}

/** Takes it out of your kast again. */
export async function takeOffShelf(userId: number, item: ItemRow) {
  const type = shelfTypeOf(item)
  const rows = await db.select().from(gadgets).where(and(eq(gadgets.userId, userId), eq(gadgets.type, type)))
  for (const row of rows) {
    const list = listOf(type, row.config)
    if (!list.some((i) => i.mediaId === item.id)) continue
    await db
      .update(gadgets)
      .set({ config: { ...(row.config as object), [SHELF_LIST[type]]: list.filter((i) => i.mediaId !== item.id) } as unknown as GadgetConfig[typeof type] })
      .where(eq(gadgets.id, row.id))
  }
}

/** How many members have it in a kast. */
export async function shelvedBy(item: ItemRow): Promise<number> {
  const type = shelfTypeOf(item)
  const [{ n }] = await db
    .select({ n: sql<number>`count(distinct ${gadgets.userId})::int` })
    .from(gadgets)
    .where(and(eq(gadgets.type, type), eq(gadgets.enabled, true), sql`exists (select 1 from jsonb_array_elements(${gadgets.config} -> ${SHELF_LIST[type]}) e where e ->> 'mediaId' = ${String(item.id)})`))
  return n
}
