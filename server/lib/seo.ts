/**
 * Search engines and link previews. Crawlers and the preview bots of
 * WhatsApp, Facebook, X, Discord… don't run JavaScript, so the server puts the
 * title, description, share card and structured data of each page into the
 * HTML itself. Only what a logged-out visitor may see ends up in there.
 */
import { RECIPE_CATEGORIES, formatMinutes, recipeHref, type RecipeCategory } from '../../shared/recipes'
import { MEDIA_KINDS, mediaHref, type MediaKind } from '../../shared/media'
import { GAMES, isGameKind } from '../../shared/games'
import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm'
import { withDefaults } from '../../shared/customization'
import { slugify, threadHref } from '../../shared/forum'
import { SMILEY_PATTERN } from '../../shared/smileys'
import { VIDEO_CATEGORIES } from '../../shared/videos'
import { config } from '../config'
import { serverDomain, serverInfo } from './siteSettings'
import { db } from '../db/client'
import { forumPosts, forumSections, forumThreads, mediaItems, mediaReviews, musicPages, news, photographyPages, photos, radioStations, recipes, users, videos } from '../db/schema'

export const SITE_NAME = 'Kuddes'
export const TAGLINE = 'Het gezelligste vriendennetwerk van Nederland'
const DEFAULT_DESCRIPTION =
  'Kuddes is het gezelligste vriendennetwerk van Nederland: een profiel met knuffels, WieWatWaars, foto’s en video’s, Kuddes voor alles wat je leuk vindt, een agenda en een forum.'

/** What the server knows about a page before the app has loaded. */
export type PageMeta = {
  status: 200 | 404
  title: string
  description: string
  /** Path (and query) of the preferred URL. */
  canonical: string
  noindex?: boolean
  type?: 'website' | 'profile' | 'video.other' | 'article'
  /** Path of the share image (see server/lib/ogImage.ts). */
  image: string
  imageAlt: string
  jsonLd?: Record<string, unknown>[]
  extra?: [property: string, content: string][]
}

/** Absolute URL on the site. */
export const absolute = (path: string) => `${config.publicUrl || `http://localhost:${config.port}`}${path}`

/** Markup, smileys and extra space out of user text, for descriptions. */
export function plainText(text: string, max = 180): string {
  const plain = text
    .replace(/^>.*$/gm, '')
    // News: pictures and buttons on a line of their own, and heading marks
    .replace(/^!\[[^\]\n]*\]\([^)\n]*\)$/gm, '')
    .replace(/\[\[([^\]\n]+)\]\]\([^)\n]*\)/g, '$1')
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|~~|__|\*/g, '')
    .replace(SMILEY_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= max) return plain
  const cut = plain.slice(0, max - 1)
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : cut.length)}…`
}

/** A short hash, so share images get a new URL (and previews refresh) when they change. */
export function version(...parts: unknown[]): string {
  let h = 2166136261
  for (const ch of JSON.stringify(parts)) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

const uploadUrl = (p: string | null) => (p ? absolute(`/uploads/${p}`) : undefined)
const isoDuration = (s: number) => `PT${Math.floor(s / 60)}M${s % 60}S`
const person = (u: { username: string; name: string }) => ({ '@type': 'Person', name: u.name, alternateName: `@${u.username}`, url: absolute(`/profiel/${u.username}`) })

const page = (title: string, description = DEFAULT_DESCRIPTION, extra: Partial<PageMeta> = {}): Omit<PageMeta, 'canonical'> => ({
  status: 200,
  title: title === SITE_NAME ? `${SITE_NAME} - ${TAGLINE}` : `${title} - ${SITE_NAME}`,
  description,
  image: '/og/kuddes.jpg',
  imageAlt: `${SITE_NAME}: ${TAGLINE.toLowerCase()}`,
  ...extra,
})

/** Pages with a fixed title; `false` = keep out of search engines. */
const STATIC_PAGES: Record<string, [title: string, description?: string, index?: false]> = {
  '/kuddes': ['Kuddes', 'Groepen, spots, scholen, studies, bedrijven, verenigingen en stichtingen: vind je Kudde of begin er zelf een.', false],
  '/agenda': ['Agenda', 'Wat er te doen is: evenementen van openbare Kuddes.', false],
  '/video': ['Kuddes Video', 'Video’s van leden van Kuddes: bekijk, beoordeel en reageer, of upload je eigen video.'],
  '/forum': ['Forum', 'Het Kuddes Forum: praat mee over alles, van games tot muziek, en chat live met andere leden.'],
  '/nieuws': ['Nieuws & updates', 'Het laatste nieuws over Kuddes: nieuwe functies, tips en updates.'],
  '/suggesties': ['Suggesties', 'Ideeën van leden om Kuddes nog leuker te maken.'],
  '/privacy': ['Privacyverklaring', 'Wat Kuddes over je bewaart en waarom.'],
  '/over-kuddes': ['Over Kuddes', 'Kuddes is een gezellig, gratis vriendennetwerk zonder advertenties, in de stijl van de late jaren nul: knuffels, WieWatWaars, Kuddes, spellen en meer.'],
  '/gadgetmarkt': ['Gadgetmarkt', undefined, false],
  '/profielkaartje': ['Profielkaartje', undefined, false],
  '/graffiti': ['Graffitimuur', 'Spuit een muur vol met graffiti: druipende verf, goud, chroom, glitter en geheime bussen. Alleen, of samen met je vrienden op dezelfde muur.'],
  '/recensies': ['Recensies', 'Boeken, films, series, muziek, spellen en drankjes, beoordeeld door de leden van Kuddes. Geef sterren, schrijf je recensie en zet het in de kast op je profiel.'],
  '/recepten': ['Recepten', 'Recepten van de leden van Kuddes: van hutspot tot tompoucen, met foto’s en stap voor stap uitgelegd. Kook mee en deel je eigen recepten.'],
  // For members only (visitors get the login page), but the description is still used for link previews
  '/glitterplaatjes': ['Glitterplaatjes', 'Glitterplaatjes voor elke gelegenheid: goedemorgen, fijn weekend, beterschap, verjaardag… Verzamel ze en stuur ze mee met een knuffel.', false],
  '/tools': ['Tools', 'Programma’s om echt iets mee te maken, in de stijl van Office 2007: Kuddes Woord, Rekenblad, Presentatie, Studio, Paint, Planner, Mindmap, Formulieren, Rekenmachine en Kladblok.'],
  '/designs': ['Designgalerij', 'Thema’s voor de hele site en designs voor je profiel, gemaakt en gedeeld door de leden van Kuddes. Gebruik er een of deel je eigen.'],
  '/fotografie': ['Fotografie', 'Foto’s van Kuddes-leden die van fotograferen houden, met de camera en instellingen die ze gebruikten.'],
  '/gebruikersovereenkomst': ['Gebruikersovereenkomst', 'De afspraken voor het gebruik van Kuddes.'],
  '/cookies': ['Cookie-instellingen', undefined, false],
  '/spellen': ['Spellen', 'Speel Mancala, Vier op een rij, Zeeslag, Dammen en de Kuddes Quiz tegen je vrienden, en verdien prestaties voor op je profiel.'],
  '/aanmelden': ['Word lid', 'Maak gratis je eigen profiel op Kuddes: knuffels, WieWatWaars, foto’s en je vrienden bij elkaar.'],
  '/inloggen': ['Inloggen', undefined, false],
  '/wachtwoord-vergeten': ['Wachtwoord vergeten', undefined, false],
  '/wachtwoord-herstellen': ['Nieuw wachtwoord', undefined, false],
  '/bevestigen': ['E-mailadres bevestigen', undefined, false],
  '/nieuw-adres': ['Nieuw e-mailadres', undefined, false],
  '/instellingen': ['Instellingen', undefined, false],
  '/vrienden': ['Vrienden', undefined, false],
  '/zoeken': ['Zoeken', undefined, false],
  '/tijdlijn': ['Overzicht', undefined, false],
  '/beheer': ['Beheer', undefined, false],
  '/berichten': ['Berichten', undefined, false],
  '/messenger': ['Messenger', undefined, false],
  '/berichten/nieuw': ['Nieuw bericht', undefined, false],
  '/kuddes/nieuw': ['Nieuwe Kudde', undefined, false],
  '/forum/nieuw': ['Nieuw onderwerp', undefined, false],
  '/forum/zoeken': ['Zoeken op het forum', undefined, false],
  '/forum/chat': ['Chat', 'Live chatten met andere leden van Kuddes.', false],
  '/forum/beheer': ['Forumbeheer', undefined, false],
  '/video/zoeken': ['Video’s zoeken', undefined, false],
  '/video/uploaden': ['Video uploaden', undefined, false],
  '/muziek': ['Muziek', 'Muziek van leden van Kuddes: bands, rappers en singer-songwriters. Luister, geef likes en bekijk de hitlijst.'],
  '/muziek/hitlijst': ['Hitlijst', 'De meest beluisterde nummers van Kuddes deze week.'],
  '/muziek/uploaden': ['Muziek uploaden', undefined, false],
  '/radio': ['Kuddes Radio', 'Live radio van Kuddes-leden: muziekprogramma’s, talkshows, comedy en podcasts. Luister en chat mee, of begin je eigen zender.'],
  '/radio/studio': ['Radio maken', undefined, false],
}

/** Pages with their own share picture (server/lib/ogImage.ts, SECTIONS). */
const SECTION_CARDS: Record<string, string> = {
  '/recensies': 'recensies',
  '/recepten': 'recepten',
  '/video': 'video',
  '/glitterplaatjes': 'glitterplaatjes',
  '/spellen': 'spellen',
  '/graffiti': 'graffiti',
  '/forum': 'forum',
  '/nieuws': 'nieuws',
}

const notFoundPage = (canonical: string): PageMeta => ({ ...page('Deze pagina bestaat niet'), status: 404, noindex: true, canonical })

/** The meta tags for a URL the app shows. */
export async function pageMeta(pathname: string, query: URLSearchParams): Promise<PageMeta> {
  const path = pathname.replace(/\/+$/, '') || '/'
  const parts = path.split('/').filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p)
    } catch {
      return p
    }
  })

  if (path === '/') {
    return {
      ...page(SITE_NAME),
      canonical: '/',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: absolute('/'),
          inLanguage: 'nl-NL',
        },
        { '@context': 'https://schema.org', '@type': 'Organization', name: SITE_NAME, url: absolute('/'), logo: absolute('/kuddes-logo.png') },
      ],
    }
  }

  const fixed = STATIC_PAGES[path]
  if (fixed) {
    const [title, description, index] = fixed
    const section = SECTION_CARDS[path]
    // Their share picture shows what's there now (the newest recipes, the most-played videos…); a new URL every day
    const image = section ? { image: `/og/pagina/${section}.jpg?v=${version(new Date().toISOString().slice(0, 10))}`, imageAlt: `${title} op Kuddes` } : {}
    return { ...page(title, description, image), canonical: path, noindex: index === false }
  }
  if (parts[0] === 'berichten') return { ...page('Berichten'), canonical: path, noindex: true }

  switch (parts[0]) {
    case 'recensies':
      if (parts.length === 2 && /^\d+(-|$)/.test(parts[1])) return mediaMeta(Number.parseInt(parts[1], 10), Number(query.get('recensie')) || null)
      return { ...page('Recensies'), canonical: path, noindex: true }
    case 'recepten':
      if (parts.length === 2 && /^\d+(-|$)/.test(parts[1])) return recipeMeta(Number.parseInt(parts[1], 10))
      return { ...page('Recepten'), canonical: path, noindex: true }
    case 'spellen': {
      // A game (or an invite to one): which game, not who plays
      const kind = parts[1]
      if (kind && isGameKind(kind)) {
        const info = GAMES[kind]
        return { ...page(`${info.name} spelen`, `${info.tagline}. ${info.description}`, { image: `/og/spel/${kind}.jpg?v=${version(info.name, info.description)}`, imageAlt: info.name }), canonical: path, noindex: true }
      }
      return { ...page('Spel', 'Een potje op Kuddes Spellen.'), canonical: path, noindex: true }
    }
    // Members only: nothing about the member or the Kudde in the page (or its share preview)
    case 'prestaties':
    case 'profiel':
    case 'kuddes':
    case 'blogs':
      return membersOnlyPage(path)
    case 'fotografie':
      if (parts.length === 2) return photographerMeta(parts[1])
      if (parts.length === 4 && parts[2] === 'foto' && /^\d+$/.test(parts[3])) return photoMeta(Number(parts[3]))
      return notFoundPage(path)
    case 'nieuws':
      return parts.length === 2 ? newsMeta(parts[1]) : notFoundPage(path)
    case 'video':
      if (parts[1] === 'kijk' && parts.length === 2) return videoMeta(query.get('v') ?? '')
      if (parts[1] === 'kanaal' && parts.length === 3) return channelMeta(parts[2])
      return notFoundPage(path)
    case 'muziek':
      return parts.length === 2 ? artistMeta(parts[1]) : notFoundPage(path)
    case 'radio':
      return parts.length === 2 ? stationMeta(parts[1]) : notFoundPage(path)
    case 'forum':
      if (parts[1] === 'lid' && parts.length === 3) return membersOnlyPage(path)
      if (parts[1] === 'tag' && parts.length === 3) {
        return { ...page(`#${parts[2]} op het forum`, `Forumonderwerpen met de tag #${parts[2]}.`), canonical: path, noindex: true }
      }
      if (parts.length === 2) return sectionMeta(parts[1])
      if (parts.length === 3) return threadMeta(parts[1], parts[2], Number(query.get('pagina')) || 1)
      return notFoundPage(path)
  }
  return notFoundPage(path)
}

// ------------------------------------------------------------------ pages

async function findMember(username: string) {
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1)
  return u
}

/** Pages only members can see: a plain page, so a shared link doesn't show who or what it is. */
const membersOnlyPage = (path: string): PageMeta => ({
  ...page('Alleen voor leden', 'Log in op Kuddes om profielen, foto’s en Kuddes te bekijken.'),
  canonical: path,
  noindex: true,
})

/** A video channel is public, but only with the channel's name: the profile behind it is for members. */
async function channelMeta(username: string): Promise<PageMeta> {
  const u = await findMember(username)
  if (!u) return notFoundPage(`/video/kanaal/${username}`)
  const canonical = `/video/kanaal/${u.username}`
  if (u.blockedAt || !u.emailVerifiedAt) return { ...page('Kanaal'), canonical, noindex: true }
  return {
    ...page(`Kanaal van ${u.nickname}`, `De video’s van ${u.nickname} op Kuddes Video.`, {
      image: `/og/kanaal/${u.username}.jpg?v=${version(u.nickname, new Date().toISOString().slice(0, 10))}`,
      imageAlt: `Kanaal van ${u.nickname}`,
    }),
    canonical,
    noindex: !withDefaults(u.preferences).searchEngines,
  }
}

/** A photography page: only one open to everyone (and its maker allows search engines) is described and indexed. */
async function photographerMeta(username: string): Promise<PageMeta> {
  const u = await findMember(username)
  const [p] = u ? await db.select().from(photographyPages).where(eq(photographyPages.userId, u.id)) : []
  if (!u || !p) return notFoundPage(`/fotografie/${username}`)
  const canonical = `/fotografie/${u.username}`
  if (u.blockedAt || p.visibility !== 'iedereen') return { ...page('Fotografie'), canonical, noindex: true }
  return {
    ...page(p.title, p.about ? plainText(p.about) : `De foto’s van ${u.nickname} op Kuddes Fotografie.`),
    canonical,
    noindex: !withDefaults(u.preferences).searchEngines,
  }
}

async function photoMeta(id: number): Promise<PageMeta> {
  const [row] = await db
    .select({ photo: photos, visibility: photographyPages.visibility, user: users })
    .from(photos)
    .innerJoin(users, eq(users.id, photos.userId))
    .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
    .where(and(eq(photos.id, id), eq(photos.inPhotography, true)))
  if (!row) return notFoundPage(`/fotografie/foto/${id}`)
  const { photo, user: u } = row
  const canonical = `/fotografie/${u.username}/foto/${photo.id}`
  if (u.blockedAt || row.visibility !== 'iedereen') return { ...page('Foto'), canonical, noindex: true }
  const title = photo.caption || `Foto van ${u.nickname}`
  return {
    ...page(title, photo.description ? plainText(photo.description) : `${title}, een foto van ${u.nickname} op Kuddes Fotografie.`),
    canonical,
    noindex: !withDefaults(u.preferences).searchEngines,
  }
}

async function stationMeta(username: string): Promise<PageMeta> {
  const u = await findMember(username)
  const [station] = u ? await db.select().from(radioStations).where(eq(radioStations.userId, u.id)) : []
  if (!u || !station) return notFoundPage(`/radio/${username}`)
  const canonical = `/radio/${u.username}`
  if (u.blockedAt) return { ...page('Kuddes Radio'), canonical, noindex: true }
  return {
    ...page(station.name, station.description ? plainText(station.description) : `${station.name}, een zender van ${u.nickname} op Kuddes Radio.`),
    canonical,
    noindex: !withDefaults(u.preferences).searchEngines,
  }
}

async function artistMeta(slug: string): Promise<PageMeta> {
  const [row] = await db.select({ page: musicPages, user: users }).from(musicPages).innerJoin(users, eq(users.id, musicPages.userId)).where(eq(musicPages.slug, slug.toLowerCase()))
  if (!row) return notFoundPage(`/muziek/${slug}`)
  const { page: artist, user: u } = row
  const canonical = `/muziek/${artist.slug}`
  if (u.blockedAt) return { ...page('Muziek'), canonical, noindex: true }
  return {
    ...page(artist.name, artist.bio ? plainText(artist.bio) : `De muziek van ${artist.name} op Kuddes.`),
    canonical,
    noindex: !withDefaults(u.preferences).searchEngines,
  }
}

async function newsMeta(slug: string): Promise<PageMeta> {
  const [n] = await db
    .select({ item: news, author: { username: users.username, name: users.name } })
    .from(news)
    .leftJoin(users, eq(users.id, news.authorId))
    .where(and(eq(news.slug, slug), eq(news.published, true), lte(news.publishedAt, new Date())))
  if (!n) return notFoundPage(`/nieuws/${slug}`)
  const { item } = n
  return {
    ...page(item.title, plainText(item.summary || item.body)),
    canonical: `/nieuws/${item.slug}`,
    type: 'article',
    image: `/og/nieuws/${item.slug}.jpg?v=${version(item.title, item.label, item.summary, item.bannerPath)}`,
    imageAlt: item.title,
    extra: [
      ['article:published_time', item.publishedAt.toISOString()],
      ['article:modified_time', item.updatedAt.toISOString()],
    ],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: item.title,
        description: plainText(item.summary || item.body),
        datePublished: item.publishedAt.toISOString(),
        dateModified: item.updatedAt.toISOString(),
        author: n.author ? person(n.author) : { '@type': 'Organization', name: SITE_NAME },
        publisher: { '@type': 'Organization', name: SITE_NAME, logo: { '@type': 'ImageObject', url: absolute('/kuddes-logo.png') } },
        image: [absolute(`/og/nieuws/${item.slug}.jpg`)],
        mainEntityOfPage: absolute(`/nieuws/${item.slug}`),
      },
    ],
  }
}

async function videoMeta(publicId: string): Promise<PageMeta> {
  const [row] = await db
    .select({ v: videos, u: { username: users.username, name: users.name, blockedAt: users.blockedAt } })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.userId))
    .where(and(eq(videos.publicId, publicId), eq(videos.status, 'klaar'), inArray(videos.visibility, ['openbaar', 'verborgen'])))
  // Friends-only and unfinished videos look like missing ones to outsiders
  if (!row || row.u.blockedAt) return notFoundPage(`/video/kijk?v=${encodeURIComponent(publicId)}`)
  const { v, u } = row
  const canonical = `/video/kijk?v=${v.publicId}`
  const description = v.description ? plainText(v.description) : `${VIDEO_CATEGORIES[v.category as keyof typeof VIDEO_CATEGORIES] ?? 'Video'} van ${u.name} op Kuddes Video.`
  return {
    ...page(v.title, description),
    canonical,
    type: 'video.other',
    // Hidden ("verborgen") videos work with the link, but aren't listed
    noindex: v.visibility === 'verborgen',
    image: `/og/video/${v.publicId}.jpg?v=${version(v.title, v.thumbPath, u.name)}`,
    imageAlt: v.title,
    extra: [
      ['video:duration', String(v.duration)],
      ...v.tags.slice(0, 6).map((t): [string, string] => ['video:tag', t]),
    ],
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: v.title,
        description,
        thumbnailUrl: [absolute(`/og/video/${v.publicId}.jpg`), uploadUrl(v.thumbPath)].filter(Boolean),
        uploadDate: v.createdAt.toISOString(),
        duration: isoDuration(v.duration),
        author: person(u),
        keywords: v.tags.join(', ') || undefined,
        interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'WatchAction' }, userInteractionCount: v.views },
        url: absolute(canonical),
      },
    ],
  }
}

/** A title in Recensies: what it is, its stars and how many reviews. */
async function mediaMeta(id: number, reviewId: number | null): Promise<PageMeta> {
  const [m] = await db.select().from(mediaItems).where(eq(mediaItems.id, id))
  if (!m) return notFoundPage(`/recensies/${id}`)
  const kind = MEDIA_KINDS[m.kind as MediaKind] ?? MEDIA_KINDS.boeken
  const stars = m.reviews ? ` ${m.rating.toFixed(1).replace('.', ',')} van de 5 sterren uit ${m.reviews} ${m.reviews === 1 ? 'recensie' : 'recensies'}.` : ''
  const description = `${m.description ? plainText(m.description) : `${kind.one[0].toUpperCase()}${kind.one.slice(1)}${m.creator ? ` van ${m.creator}` : ''}.`}${stars}`.slice(0, 300)
  const TYPES: Record<MediaKind, string> = { boeken: 'Book', films: 'Movie', series: 'TVSeries', muziek: 'MusicAlbum', spellen: 'Game', drank: 'Product' }
  // A link to one review (?recensie=): that member's stars and words in the preview
  const [review] = reviewId
    ? await db
        .select({ id: mediaReviews.id, rating: mediaReviews.rating, text: mediaReviews.text, updatedAt: mediaReviews.updatedAt, name: users.nickname, blockedAt: users.blockedAt })
        .from(mediaReviews)
        .innerJoin(users, eq(users.id, mediaReviews.userId))
        .where(and(eq(mediaReviews.id, reviewId), eq(mediaReviews.itemId, m.id)))
    : []
  const shown = review && !review.blockedAt ? review : null
  const starText = (r: number) => `${String(r).replace('.', ',')} ${r === 1 ? 'ster' : 'sterren'}`
  const base = page(
    shown ? `${shown.name} over ${m.title} - Recensies` : `${m.title} - Recensies`,
    shown ? `${shown.name} geeft ${m.title} ${starText(shown.rating)}${shown.text ? `: “${plainText(shown.text, 240)}”` : '.'}` : description,
  )
  return {
    ...base,
    canonical: mediaHref(m),
    image: shown
      ? `/og/recensie/${m.id}-r${shown.id}.jpg?v=${version(m.title, m.photoPath, m.color, m.style, shown.rating, shown.text, shown.updatedAt)}`
      : `/og/recensie/${m.id}.jpg?v=${version(m.title, m.creator, m.photoPath, m.color, m.style, m.rating, m.reviews, m.description)}`,
    imageAlt: shown ? `${shown.name} over ${m.title}` : m.title,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': TYPES[m.kind as MediaKind] ?? 'CreativeWork',
        name: m.title,
        description,
        url: absolute(mediaHref(m)),
        ...(m.photoPath && { image: uploadUrl(m.photoPath) }),
        ...(m.reviews && { aggregateRating: { '@type': 'AggregateRating', ratingValue: Math.round(m.rating * 10) / 10, reviewCount: m.reviews, bestRating: 5, worstRating: 0.5 } }),
      },
    ],
  }
}

async function recipeMeta(id: number): Promise<PageMeta> {
  const [row] = await db.select({ r: recipes, u: { username: users.username, name: users.name, blockedAt: users.blockedAt } }).from(recipes).innerJoin(users, eq(users.id, recipes.userId)).where(eq(recipes.id, id))
  if (!row || row.u.blockedAt) return notFoundPage(`/recepten/${id}`)
  const { r, u } = row
  const canonical = recipeHref(r)
  const category = RECIPE_CATEGORIES[r.category as RecipeCategory]?.name ?? 'Recept'
  const description = r.intro ? plainText(r.intro) : `${category}: ${r.title}, voor ${r.servings} ${r.servings === 1 ? 'persoon' : 'personen'} in ${formatMinutes(r.minutes)}. Een recept van ${u.name} op Kuddes.`
  return {
    ...page(r.title, description),
    canonical,
    type: 'article',
    image: `/og/recept/${r.id}.jpg?v=${version(r.title, r.photoPath, r.likes, u.name)}`,
    imageAlt: r.title,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Recipe',
        name: r.title,
        description,
        image: r.photoPath ? [uploadUrl(r.photoPath)] : undefined,
        author: person(u),
        datePublished: r.createdAt.toISOString(),
        totalTime: `PT${r.minutes}M`,
        recipeYield: `${r.servings} ${r.servings === 1 ? 'persoon' : 'personen'}`,
        recipeCategory: category,
        recipeIngredient: r.ingredients,
        recipeInstructions: r.steps.filter((s) => s.text).map((s) => ({ '@type': 'HowToStep', text: s.text })),
        inLanguage: 'nl-NL',
        url: absolute(canonical),
      },
    ],
  }
}

async function sectionMeta(slug: string): Promise<PageMeta> {
  const [s] = await db.select().from(forumSections).where(eq(forumSections.slug, slug)).limit(1)
  if (!s) return notFoundPage(`/forum/${slug}`)
  return {
    ...page(`${s.name} - Forum`, s.description || `Onderwerpen in ${s.name} op het Kuddes Forum.`, {
      image: `/og/forumdeel/${s.slug}.jpg?v=${version(s.name, s.description, new Date().toISOString().slice(0, 10))}`,
      imageAlt: `${s.name} op het Kuddes Forum`,
    }),
    canonical: `/forum/${s.slug}`,
  }
}

async function threadMeta(sectionSlug: string, threadPart: string, pageNo: number): Promise<PageMeta> {
  const id = Number.parseInt(threadPart, 10)
  const guess = `/forum/${sectionSlug}/${threadPart}`
  if (!Number.isInteger(id)) return notFoundPage(guess)
  const [row] = await db
    .select({ t: forumThreads, s: { slug: forumSections.slug, name: forumSections.name }, u: { username: users.username, name: users.name } })
    .from(forumThreads)
    .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
    .leftJoin(users, eq(users.id, forumThreads.userId))
    .where(eq(forumThreads.id, id))
  if (!row) return notFoundPage(guess)
  const { t, s, u } = row
  const [first] = await db
    .select({ body: forumPosts.body })
    .from(forumPosts)
    .where(and(eq(forumPosts.threadId, t.id), isNull(forumPosts.deletedAt)))
    .orderBy(forumPosts.id)
    .limit(1)
  const canonical = threadHref(s.slug, t.id, t.title, pageNo)
  const description = first ? plainText(first.body) : `Een onderwerp in ${s.name} op het Kuddes Forum.`
  return {
    ...page(`${t.title}${pageNo > 1 ? ` (pagina ${pageNo})` : ''} - ${s.name}`, description),
    canonical,
    type: 'article',
    image: `/og/forum/${t.id}.jpg?v=${version(t.title, t.postCount, s.name)}`,
    imageAlt: t.title,
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: t.title,
        text: first ? plainText(first.body, 500) : undefined,
        author: u ? person(u) : { '@type': 'Person', name: 'Oud lid' },
        datePublished: t.createdAt.toISOString(),
        dateModified: t.lastPostAt.toISOString(),
        keywords: t.tags.join(', ') || undefined,
        isPartOf: { '@type': 'WebPage', name: s.name, url: absolute(`/forum/${s.slug}`) },
        interactionStatistic: { '@type': 'InteractionCounter', interactionType: { '@type': 'CommentAction' }, userInteractionCount: Math.max(0, t.postCount - 1) },
        url: absolute(threadHref(s.slug, t.id, t.title)),
      },
    ],
  }
}

// ------------------------------------------------------------------ HTML

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** JSON inside <script>: no way to close the tag from user text. */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028|\u2029/g, '')

/** Puts the page's tags in the built index.html, in place of its default title and description. */
export function renderHead(template: string, meta: PageMeta): string {
  const url = absolute(meta.canonical)
  const image = absolute(meta.image)
  const tag = (attr: 'name' | 'property', key: string, content: string) => `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`
  const head = [
    `<title>${escapeHtml(meta.title)}</title>`,
    tag('name', 'description', meta.description),
    meta.noindex ? tag('name', 'robots', 'noindex, follow') : tag('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    tag('property', 'og:site_name', SITE_NAME),
    tag('property', 'og:locale', 'nl_NL'),
    tag('property', 'og:type', meta.type ?? 'website'),
    tag('property', 'og:title', meta.title.replace(/ - Kuddes$/, '')),
    tag('property', 'og:description', meta.description),
    tag('property', 'og:url', url),
    tag('property', 'og:image', image),
    tag('property', 'og:image:type', 'image/jpeg'),
    tag('property', 'og:image:width', '1200'),
    tag('property', 'og:image:height', '630'),
    tag('property', 'og:image:alt', meta.imageAlt),
    ...(meta.extra ?? []).map(([k, v]) => tag('property', k, v)),
    tag('name', 'twitter:card', 'summary_large_image'),
    tag('name', 'twitter:title', meta.title.replace(/ - Kuddes$/, '')),
    tag('name', 'twitter:description', meta.description),
    tag('name', 'twitter:image', image),
    tag('name', 'twitter:image:alt', meta.imageAlt),
    ...(meta.jsonLd ?? []).map((data) => `<script type="application/ld+json">${safeJson(data)}</script>`),
  ].join('\n    ')
  return template
    .replace(/<title>[^<]*<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', `  ${head}\n  </head>`)
}

/** The public sections, linked from the content every page starts with. */
const SECTION_LINKS: [path: string, name: string][] = [
  ['/over-kuddes', 'Over Kuddes'],
  ['/forum', 'Forum'],
  ['/video', 'Kuddes Video'],
  ['/nieuws', 'Nieuws'],
  ['/recensies', 'Recensies'],
  ['/recepten', 'Recepten'],
  ['/fotografie', 'Fotografie'],
  ['/muziek', 'Muziek'],
  ['/radio', 'Kuddes Radio'],
  ['/spellen', 'Spellen'],
  ['/graffiti', 'Graffitimuur'],
  ['/designs', 'Designgalerij'],
  ['/suggesties', 'Suggesties'],
  ['/aanmelden', 'Word lid'],
]

/** What Kuddes is, on the homepage before the app has loaded. */
const HOME_INTRO = [
  'Kuddes is een gratis vriendennetwerk zonder advertenties en zonder tracking, in de stijl van de late jaren nul. Maak je eigen profiel en pimp het met een design, gadgets en glitterplaatjes.',
  'Stuur je vrienden knuffels, deel WieWatWaars met foto’s en polls, en word lid van Kuddes: groepen, spots, scholen, verenigingen en stichtingen met een prikbord, foto’s en een agenda.',
  'Praat mee op het forum, upload video’s en muziek, zend uit op Kuddes Radio, schrijf recensies en recepten, en speel spellen tegen je vrienden.',
]

/**
 * The page's heading, description and links in the HTML itself, inside
 * #root: search engines read it without running the app, and the app
 * replaces it as soon as it starts (createRoot empties the element).
 */
export function renderBody(html: string, meta: PageMeta, pathname: string): string {
  const home = pathname === '/'
  const heading = home ? `${SITE_NAME}: ${TAGLINE}` : meta.title.replace(/ - Kuddes$/, '')
  const paragraphs = home ? HOME_INTRO : [meta.description]
  const body = [
    '<div class="ssr-page">',
    `<p class="ssr-logo"><a href="/">${SITE_NAME}</a></p>`,
    `<h1>${escapeHtml(heading)}</h1>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    '<nav aria-label="Kuddes"><ul>',
    ...SECTION_LINKS.filter(([path]) => path !== pathname).map(([path, name]) => `<li><a href="${path}">${escapeHtml(name)}</a></li>`),
    '</ul></nav>',
    '</div>',
  ].join('')
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`)
}

// --------------------------------------------------------------- sitemap

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** /sitemap.xml: every public page worth finding. */
export async function sitemap(): Promise<string> {
  const LIMIT = 10_000
  const [videoRows, threadRows, sectionRows, newsRows, recipeRows, mediaRows, photographerRows, photoRows, artistRows, stationRows] = await Promise.all([
    db
      .select({ publicId: videos.publicId, createdAt: videos.createdAt, username: users.username, preferences: users.preferences })
      .from(videos)
      .innerJoin(users, eq(users.id, videos.userId))
      .where(and(eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar'), isNull(users.blockedAt)))
      .orderBy(desc(videos.createdAt))
      .limit(LIMIT),
    db
      .select({ id: forumThreads.id, title: forumThreads.title, section: forumSections.slug, lastPostAt: forumThreads.lastPostAt })
      .from(forumThreads)
      .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
      .orderBy(desc(forumThreads.lastPostAt))
      .limit(LIMIT),
    db.select({ slug: forumSections.slug }).from(forumSections),
    db.select({ slug: news.slug, updatedAt: news.updatedAt }).from(news).where(and(eq(news.published, true), lte(news.publishedAt, new Date()))),
    db
      .select({ id: recipes.id, slug: recipes.slug, updatedAt: recipes.updatedAt })
      .from(recipes)
      .innerJoin(users, eq(users.id, recipes.userId))
      .where(isNull(users.blockedAt))
      .orderBy(desc(recipes.id))
      .limit(LIMIT),
    db.select({ id: mediaItems.id, slug: mediaItems.slug, lastReviewAt: mediaItems.lastReviewAt }).from(mediaItems).orderBy(desc(mediaItems.id)).limit(LIMIT),
    // Photography, music and channels: only of members who allow search engines (filtered below)
    db
      .select({ username: users.username, preferences: users.preferences, createdAt: photographyPages.createdAt })
      .from(photographyPages)
      .innerJoin(users, eq(users.id, photographyPages.userId))
      .where(and(eq(photographyPages.visibility, 'iedereen'), isNull(users.blockedAt)))
      .limit(LIMIT),
    db
      .select({ id: photos.id, username: users.username, preferences: users.preferences, createdAt: photos.createdAt })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photos.inPhotography, true), eq(photographyPages.visibility, 'iedereen'), isNull(users.blockedAt)))
      .orderBy(desc(photos.id))
      .limit(LIMIT),
    db
      .select({ username: musicPages.slug, preferences: users.preferences, createdAt: musicPages.createdAt })
      .from(musicPages)
      .innerJoin(users, eq(users.id, musicPages.userId))
      .where(isNull(users.blockedAt))
      .limit(LIMIT),
    db
      .select({ username: users.username, preferences: users.preferences, createdAt: radioStations.createdAt })
      .from(radioStations)
      .innerJoin(users, eq(users.id, radioStations.userId))
      .where(isNull(users.blockedAt))
      .limit(LIMIT),
  ])
  const allowed = <T extends { preferences: Parameters<typeof withDefaults>[0] }>(rows: T[]) => rows.filter((r) => withDefaults(r.preferences).searchEngines)
  // A channel for everyone with a public video
  const channels = [...new Set(allowed(videoRows).map((v) => v.username))]

  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : undefined)
  const urls: [path: string, lastmod?: string][] = [
    ['/'],
    ...Object.entries(STATIC_PAGES)
      .filter(([, [, , index]]) => index !== false)
      .map(([p]): [string] => [p]),
    ...newsRows.map((n): [string, string?] => [`/nieuws/${n.slug}`, day(n.updatedAt)]),
    ...videoRows.map((v): [string, string?] => [`/video/kijk?v=${v.publicId}`, day(v.createdAt)]),
    ...sectionRows.map((s): [string] => [`/forum/${s.slug}`]),
    ...recipeRows.map((r): [string, string?] => [recipeHref(r), day(r.updatedAt)]),
    ...mediaRows.map((m): [string, string?] => [mediaHref(m), day(m.lastReviewAt)]),
    ...channels.map((u): [string] => [`/video/kanaal/${u}`]),
    ...allowed(photographerRows).map((p): [string, string?] => [`/fotografie/${p.username}`, day(p.createdAt)]),
    ...allowed(photoRows).map((p): [string, string?] => [`/fotografie/${p.username}/foto/${p.id}`, day(p.createdAt)]),
    ...allowed(artistRows).map((a): [string, string?] => [`/muziek/${a.username}`, day(a.createdAt)]),
    ...allowed(stationRows).map((s): [string, string?] => [`/radio/${s.username}`, day(s.createdAt)]),
    ...threadRows.map((t): [string, string?] => [`/forum/${t.section}/${t.id}-${slugify(t.title)}`, day(t.lastPostAt)]),
  ]
  const body = urls.map(([p, lastmod]) => `  <url><loc>${xml(absolute(p))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

// ---------------------------------------------------------------- robots

/**
 * SEO and marketing scrapers: they only cost bandwidth and bring no
 * visitors. Search engines, AI search (Google's AI Overviews, ChatGPT,
 * Perplexity…) and AI training crawlers are welcome on the public pages.
 * These are told no in robots.txt, and the ones that identify themselves get
 * a 403 as well (see server/index.ts).
 */
export const BLOCKED_BOTS = ['AhrefsBot', 'SemrushBot', 'MJ12bot', 'DotBot', 'BLEXBot', 'DataForSeoBot', 'MegaIndex', 'serpstatbot', 'barkrowler', 'SeekportBot'] as const

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const BLOCKED_BOT_PATTERN = new RegExp(BLOCKED_BOTS.map(escapeRe).join('|'), 'i')

/** Pages that aren't content: private, empty for outsiders, or endless (search). */
const PRIVATE_PATHS = [
  '/api/admin/',
  '/api/auth/',
  '/api/messages',
  '/beheer',
  '/instellingen',
  '/berichten',
  '/inloggen',
  '/vrienden',
  '/tijdlijn',
  '/zoeken',
  '/profiel/',
  '/prestaties/',
  '/forum/lid/',
  '/kuddes',
  '/agenda',
  '/kuddes/nieuw',
  '/forum/nieuw',
  '/forum/zoeken',
  '/forum/beheer',
  '/forum/chat',
  '/video/zoeken',
  '/video/uploaden',
  '/spellen/*/',
  '/buddypoke/',
  '/*?*bericht=',
]

export function robotsTxt(): string {
  return [
    `# ${serverInfo().name} (${serverDomain()})`,
    '# Search engines, AI search and AI crawlers (also for training) are welcome on the public pages.',
    '# Members-only and private pages are off limits for every crawler.',
    '',
    ...BLOCKED_BOTS.map((b) => `User-agent: ${b}`),
    'Disallow: /',
    '',
    'User-agent: *',
    // Every page asks who's logged in first; blocked, the page waits (and stays empty) for the crawler
    'Allow: /api/auth/me',
    ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`),
    'Allow: /',
    '',
    `Sitemap: ${absolute('/sitemap.xml')}`,
    '',
  ].join('\n')
}
