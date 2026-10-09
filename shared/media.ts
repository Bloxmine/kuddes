/**
 * Recensies (/recensies): one big collection of books, films, series, music,
 * games and drinks, which members review. Every kind belongs to one of the
 * shelf gadgets, so from a review (or straight from the page) you can put it
 * in your own kast, with a bit of your review as the note.
 */
import type { UserSummary } from './api'
import type { CoverColor, CoverStyle, DrinkKind, GadgetType, GamePlatform, SeriesPlatform } from './gadgets'
import { slugify } from './forum'

export const MEDIA_KINDS = {
  boeken: { name: 'Boeken', hint: 'romans & strips', one: 'boek', icon: 'book', creator: 'Schrijver', shelf: 'boeken' },
  films: { name: 'Films', hint: 'bioscoop & dvd', one: 'film', icon: 'film', creator: 'Regisseur', shelf: 'films' },
  series: { name: 'Series', hint: 'kijken & bingen', one: 'serie', icon: 'television', creator: 'Bedenker', shelf: 'series' },
  muziek: { name: 'Muziek', hint: 'albums & platen', one: 'album', icon: 'music', creator: 'Artiest', shelf: 'platen' },
  spellen: { name: 'Spellen', hint: 'games & bordspellen', one: 'spel', icon: 'controller', creator: 'Maker', shelf: 'spellen' },
  drank: { name: 'Drankjes', hint: 'bier, wijn & meer', one: 'drankje', icon: 'drink', creator: 'Brouwer of wijnhuis', shelf: 'drank' },
} as const satisfies Record<string, { name: string; hint: string; one: string; icon: string; creator: string; shelf: GadgetType }>

export type MediaKind = keyof typeof MEDIA_KINDS
export const MEDIA_KIND_KEYS = Object.keys(MEDIA_KINDS) as MediaKind[]
export const isMediaKind = (v: unknown): v is MediaKind => typeof v === 'string' && v in MEDIA_KINDS

/** What only some kinds have: a platform (games, series), seasons, cd or lp, the kind of drink. */
export type MediaDetails = {
  gamePlatform?: GamePlatform
  seriesPlatform?: SeriesPlatform
  seasons?: number
  format?: 'cd' | 'lp'
  drinkKind?: DrinkKind
  /** A Farm-Fresh icon on the cover (shared/icons.ts), for any kind; it goes along onto shelves. */
  icon?: string
}

export const MEDIA_LIMITS = {
  title: 80,
  creator: 60,
  genre: 40,
  description: 1500,
  review: 3000,
  /** The note on a shelf (same as the shelf gadgets). */
  snippet: 200,
  perPage: 24,
}

export const MEDIA_SORTS = { nieuwste: 'Laatst beoordeeld', beste: 'Best beoordeeld', meeste: 'Meeste recensies', alfabet: 'A tot Z' } as const
export type MediaSort = keyof typeof MEDIA_SORTS

/**
 * A real photo of the item (a book cover, a bottle…), uploaded first with
 * POST /media/photos. The file name starts with the uploader's id, so you can
 * only use your own. The drawn cover (colour and style) is always needed as
 * well: that's what stands in the kasten on profiles.
 */
export const MEDIA_PHOTO = /^media\/(\d+)-[0-9a-f]{32}\.webp$/

export type MediaInput = {
  kind: MediaKind
  title: string
  creator: string
  /** '' or a year like "1997". */
  year: string
  genre: string
  description: string
  color: CoverColor
  style: CoverStyle
  details: MediaDetails
  /** Upload path of the photo, or null for only the drawn cover. */
  photo: string | null
}

export type MediaSummary = MediaInput & {
  id: number
  slug: string
  photoUrl: string | null
  /** The average of the reviews (0 without any). */
  rating: number
  reviews: number
}

export type MediaReview = {
  id: number
  user: UserSummary
  rating: number
  text: string
  respect: number
  respected: boolean
  createdAt: string
  updatedAt: string
}

/** Your shelf for this kind: whether you have one, and whether this is in it. */
export type MediaShelf = { gadgetId: number | null; onShelf: boolean; full: boolean }

export type MediaItem = MediaSummary & {
  addedBy: UserSummary | null
  canEdit: boolean
  /** How many reviews gave 1, 2, 3, 4 and 5 stars (halves round up). */
  spread: [number, number, number, number, number]
  mine: MediaReview | null
  shelf: MediaShelf | null
  /** How many members have it on a shelf through Recensies. */
  onShelves: number
  createdAt: string
}

export type MediaList = {
  items: MediaSummary[]
  total: number
  page: number
  pages: number
  counts: Record<MediaKind | 'alles', number>
}

/** A review in the "Nieuwste recensies" column, with what it's about. */
export type RecentReview = MediaReview & { item: Pick<MediaSummary, 'id' | 'slug' | 'kind' | 'title' | 'creator' | 'color' | 'style' | 'details' | 'year' | 'photoUrl'> }

export const mediaHref = (m: { id: number; slug: string }) => `/recensies/${m.id}-${m.slug}`
export const mediaSlug = (title: string) => (slugify(title) === 'onderwerp' && !/onderwerp/i.test(title) ? 'recensie' : slugify(title))

/**
 * The start of a review, for the note on your shelf: whole sentences that
 * fit, or else cut at a word with "…".
 */
export function reviewSnippet(text: string, max = MEDIA_LIMITS.snippet): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []
  let out = ''
  for (const s of sentences) {
    if ((out + s).trim().length > max) break
    out += s
  }
  if (out.trim().length >= 40) return out.trim()
  const cut = clean.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).trim()}…`
}

/** The kind of item in Recensies that each kast holds. */
export const KIND_OF_SHELF = { boeken: 'boeken', films: 'films', series: 'series', platen: 'muziek', spellen: 'spellen', drank: 'drank' } as const satisfies Record<(typeof MEDIA_KINDS)[MediaKind]['shelf'], MediaKind>

const shelfYear = (y: string) => (/^(18|19|20)\d\d$/.test(y) ? y : '')

/**
 * An item from the collection as it stands in its kast, with `mediaId`
 * linking back. Used when you put it in your kast from Recensies (server) and
 * when you pick it in the kast's editor (the browser).
 */
export function shelfItemFrom(item: Pick<MediaSummary, 'id' | 'kind' | 'title' | 'creator' | 'year' | 'color' | 'style' | 'details'>, rating: number, note: string, id: string) {
  const d = item.details
  const base = { id, mediaId: item.id, title: item.title.slice(0, 80), color: item.color, style: item.style, rating, note: note.slice(0, MEDIA_LIMITS.snippet), ...(d.icon ? { icon: d.icon } : {}) }
  const creator = item.creator.slice(0, 60)
  switch (item.kind) {
    case 'boeken':
      return { ...base, author: creator }
    case 'films':
      return { ...base, year: shelfYear(item.year) }
    case 'muziek':
      return { ...base, artist: creator, format: d.format ?? 'cd' }
    case 'spellen':
      return { ...base, platform: d.gamePlatform ?? 'pc' }
    case 'drank':
      return { ...base, kind: d.drinkKind ?? 'speciaal', maker: creator, year: shelfYear(item.year) }
    case 'series': {
      const seasons = Math.min(Math.max(d.seasons ?? 1, 1), 50)
      return { ...base, seasons, season: seasons, status: 'gezien' as const, platform: d.seriesPlatform ?? 'anders' }
    }
  }
}
