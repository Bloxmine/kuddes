import { PICKABLE_ICONS } from '../../shared/icons'
import { and, asc, count, countDistinct, desc, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Gadget, GadgetChannel, ItemRespect, RadioStation, SharedDoc, SharedDocItem } from '../../shared/api'
import { docSettings } from '../../shared/documents'
import { MUSIC_ORDERS, type MusicOrder, CLOCK_ZONES, COVER_COLORS, DRINK_KINDS, SERIES_PLATFORMS, SERIES_STATUS, type DrinkKind, type SeriesPlatform, type SeriesStatus, COVER_STYLES, GAME_PLATFORMS, RESPECT_GADGETS, SHELF_LOOKS_FOR, type ClockZone, type GamePlatform, type RespectGadget, DEFAULT_CONFIG, GADGET_TYPES, LIMITS, isDocGadget, NOTE_COLORS, YOUTUBE_ID, type CoverColor, type GadgetConfig, type GadgetType } from '../../shared/gadgets'
import { isCountry } from '../../shared/countries'
import { MK_CHARACTERS, MK_CONTROLLERS, MK_FRIEND_CODE, MK_POINTS_MAX, MK_TRACKS, MK_VEHICLES, type MkCharacter, type MkController, type MkVehicle } from '../../shared/mariokart'
import { NAME_FONTS, type NameFont } from '../../shared/customization'
import { toPhoto } from '../lib/photos'
import { toSummary } from '../lib/serialize'
import { db } from '../db/client'
import { documents, gadgetRespect, gadgets, photos, pollVotes, users, videos, type User } from '../db/schema'
import { selectVideos, toVideoSummary, videoVisibleTo } from '../lib/videos'
import { achievementOverview } from '../lib/achievements'
import { ACHIEVEMENT_KEYS, type AchievementKey } from '../../shared/achievements'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, type AppEnv } from '../lib/session'
import { findUser, requireProfileAccess, summaryColumns } from '../lib/users'
import { gadgetRecipes } from './recipes'
import { gadgetBlogs } from './blogs'
import { GAMES } from '../../shared/games'
import { BREATH_PATTERNS, MINDFULNESS_COLORS, MINDFULNESS_LIMITS, MINDFULNESS_PARTS, type BreathPattern, type MindfulnessColor, type MindfulnessPart } from '../../shared/gadgets'
import { MOODS } from '../../shared/moods'
import { PET_BACKGROUNDS, PET_COLORS, PET_HATS, PET_SPECIES, SCRAPBOOK_PAPERS, type PetAction, type PetBackground, type PetHat, type PetSpecies, type ScrapbookPaper } from '../../shared/gadgets'
import { PET_ACTION_KEYS, carePet, gadgetForum, gadgetGlitters, gadgetPet, gadgetScores, ownGlitters, petOwns, petShop } from '../lib/gadgetExtras'

type GadgetRow = typeof gadgets.$inferSelect

const text = (max: number, label: string) => z.string().trim().max(max, `${label} mag maximaal ${max} tekens hebben.`)
const track = z.object({
  videoId: z.string().regex(YOUTUBE_ID, 'Dat is geen geldige YouTube-link.'),
  title: text(LIMITS.trackTitle, 'Een titel'),
})

const docGadget = z.object({ docId: z.number().int().positive().nullable() })

const cover = {
  id: z.string().regex(/^[a-z0-9]{1,16}$/i),
  mediaId: z.number().int().positive().optional(),
  title: text(LIMITS.coverTitle, 'Een titel').min(1, 'Elke titel moet ingevuld zijn.'),
  color: z.enum(Object.keys(COVER_COLORS) as [CoverColor]),
  style: z.enum(COVER_STYLES),
  rating: z.number().min(0).max(5).multipleOf(0.5, 'Sterren gaan per halve.'),
  note: text(LIMITS.coverNote, 'Wat je ervan vond'),
  icon: z.enum(PICKABLE_ICONS).optional(),
}

const shelfLook = (type: keyof typeof SHELF_LOOKS_FOR) => z.enum(SHELF_LOOKS_FOR[type]).optional()

/** What each type of gadget may contain. */
const CONFIG_SCHEMAS = {
  notities: z.object({
    notes: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9]{1,16}$/i),
          text: text(LIMITS.noteText, 'Een notitie'),
          color: z.enum(Object.keys(NOTE_COLORS) as [keyof typeof NOTE_COLORS]),
        }),
      )
      .max(LIMITS.notes, `Maximaal ${LIMITS.notes} notities.`),
  }),
  muziek: z.object({
    tracks: z.array(track).max(LIMITS.tracks, `Maximaal ${LIMITS.tracks} nummers.`),
    autoplay: z.boolean().optional(),
    order: z.enum(Object.keys(MUSIC_ORDERS) as [MusicOrder]).optional(),
  }),
  video: z.object({ videos: z.array(track).max(LIMITS.videos, `Maximaal ${LIMITS.videos} video’s.`) }),
  aftellen: z.object({
    target: z.union([z.literal(''), z.iso.datetime({ offset: true, message: 'Kies een geldige datum en tijd.' })]),
    doneText: text(LIMITS.doneText, 'De tekst'),
  }),
  poll: z.object({
    question: text(LIMITS.question, 'De vraag'),
    options: z
      .array(text(LIMITS.option, 'Een antwoord'))
      .min(2, 'Een poll heeft minstens 2 antwoorden.')
      .max(LIMITS.options, `Maximaal ${LIMITS.options} antwoorden.`),
    closed: z.boolean(),
  }),
  kuddesvideo: z.object({
    mode: z.enum(['nieuwste', 'gekozen']),
    videoIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/)).max(LIMITS.kuddesvideos, `Maximaal ${LIMITS.kuddesvideos} video’s.`),
  }),
  prestaties: z.object({
    featured: z.array(z.enum(ACHIEVEMENT_KEYS as [AchievementKey])).max(LIMITS.featured, `Kies maximaal ${LIMITS.featured} prestaties.`),
    showStats: z.boolean(),
  }),
  boeken: z.object({
    books: z.array(z.object({ ...cover, author: text(LIMITS.author, 'De schrijver') })).max(LIMITS.books, `Maximaal ${LIMITS.books} boeken.`),
    look: shelfLook('boeken'),
  }),
  films: z.object({
    movies: z
      .array(z.object({ ...cover, year: z.union([z.literal(''), z.string().regex(/^(18|19|20)\d\d$/, 'Vul een geldig jaar in.')]) }))
      .max(LIMITS.movies, `Maximaal ${LIMITS.movies} films.`),
    look: shelfLook('films'),
  }),
  platen: z.object({
    albums: z
      .array(z.object({ ...cover, artist: text(LIMITS.author, 'De artiest'), format: z.enum(['cd', 'lp']) }))
      .max(LIMITS.albums, `Maximaal ${LIMITS.albums} albums.`),
    look: shelfLook('platen'),
  }),
  spellen: z.object({
    games: z
      .array(z.object({ ...cover, platform: z.enum(Object.keys(GAME_PLATFORMS) as [GamePlatform]) }))
      .max(LIMITS.games, `Maximaal ${LIMITS.games} spellen.`),
    look: shelfLook('spellen'),
  }),
  recepten: z.object({ show: z.enum(['eigen', 'lekker', 'beide']), count: z.number().int().min(1).max(12) }),
  kanaal: z.object({
    featured: z.string().regex(/^[A-Za-z0-9_-]{11}$/).nullable(),
    show: z.enum(['populair', 'nieuwste', 'gekozen']),
    highlights: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/)).max(LIMITS.highlights, `Kies maximaal ${LIMITS.highlights} hoogtepunten.`),
  }),
  radio: z
    .object({
      autoplay: z.boolean().optional(),
      autoplayStation: z.string().regex(/^[a-z0-9]{2,30}$/).optional(),
      channels: z
        .array(z.string().regex(/^[a-z0-9]{2,30}$/, 'Onbekende zender.'))
        .min(1, 'Kies minstens één zender.')
        .max(LIMITS.radioChannels, `Kies maximaal ${LIMITS.radioChannels} zenders.`)
        .transform((c) => [...new Set(c)]),
    })
    // The autoplay station must be one of the gadget's own; otherwise the first plays
    .transform(({ autoplayStation, ...r }) => (autoplayStation && r.channels.includes(autoplayStation) ? { ...r, autoplayStation } : r)),
  klok: z.object({
    zone: z.enum(Object.keys(CLOCK_ZONES) as [ClockZone]),
    label: text(LIMITS.clockLabel, 'De tekst bij de klok'),
    style: z.enum(['analoog', 'digitaal']),
  }),
  lijstje: z.object({
    items: z
      .array(z.object({ id: z.string().regex(/^[a-z0-9]{1,16}$/i), text: text(LIMITS.listItem, 'Een regel').min(1, 'Lege regels kunnen niet.') }))
      .max(LIMITS.listItems, `Maximaal ${LIMITS.listItems} regels.`),
    numbered: z.boolean(),
  }),
  landen: z.object({
    been: z.array(z.string().refine(isCountry, 'Onbekend land.')).max(LIMITS.countries).transform((c) => [...new Set(c)]),
    wish: z.array(z.string().refine(isCountry, 'Onbekend land.')).max(LIMITS.countries).transform((c) => [...new Set(c)]),
  }),
  links: z.object({
    links: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9]{1,16}$/i),
          title: text(LIMITS.linkTitle, 'Een naam').min(1, 'Geef elke website een naam.'),
          url: z.string().trim().max(LIMITS.url).regex(/^https?:\/\/[^\s/$.?#].[^\s]*$/i, 'Een link begint met http:// of https://'),
        }),
      )
      .max(LIMITS.links, `Maximaal ${LIMITS.links} websites.`),
  }),
  mariokart: z
    .object({
      character: z.enum(Object.keys(MK_CHARACTERS) as [MkCharacter]),
      vehicle: z.enum(Object.keys(MK_VEHICLES) as [MkVehicle]),
      vr: z.number().int().min(0).max(MK_POINTS_MAX, `VR gaat tot ${MK_POINTS_MAX}.`),
      br: z.number().int().min(0).max(MK_POINTS_MAX, `BR gaat tot ${MK_POINTS_MAX}.`),
      friendCode: z.union([z.literal(''), z.string().trim().regex(MK_FRIEND_CODE, 'Een vriendcode heeft 12 cijfers: 1234-5678-9012.')]),
      track: z.string().refine((t) => MK_TRACKS.includes(t), 'Kies een baan uit de lijst.'),
      controller: z.enum(Object.keys(MK_CONTROLLERS) as [MkController]),
      drift: z.enum(['handmatig', 'automatisch']),
      wiimmfi: z.boolean(),
    })
    // A heavy driver can't take a light kart, just like in the game
    .refine((m) => MK_VEHICLES[m.vehicle].weight === MK_CHARACTERS[m.character].weight, { message: 'Deze kart of motor past niet bij het gewicht van je coureur.', path: ['vehicle'] }),
  tekst: z.object({
    text: text(LIMITS.text, 'De tekst'),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    font: z.enum(Object.keys(NAME_FONTS) as [NameFont]),
    align: z.enum(['links', 'midden']),
  }),
  foto: z.object({ photoId: z.number().int().positive().nullable(), caption: text(LIMITS.photoCaption, 'Het onderschrift'), frame: z.enum(['polaroid', 'lijst', 'geen']) }),
  teller: z.object({ label: text(LIMITS.counterLabel, 'De tekst'), style: z.enum(['kilometer', 'led', 'klassiek']) }),
  citaat: z.object({ quote: text(LIMITS.quote, 'Het citaat'), author: text(LIMITS.quoteAuthor, 'Wie het zei'), style: z.enum(['krijtbord', 'briefje', 'neon']) }),
  drank: z.object({
    drinks: z
      .array(
        z.object({
          ...cover,
          kind: z.enum(Object.keys(DRINK_KINDS) as [DrinkKind]),
          maker: text(LIMITS.author, 'De brouwer of het wijnhuis'),
          year: z.union([z.literal(''), z.string().regex(/^(18|19|20)\d\d$/, 'Vul een geldig jaar in.')]),
        }),
      )
      .max(LIMITS.drinks, `Maximaal ${LIMITS.drinks} drankjes.`),
    look: shelfLook('drank'),
  }),
  series: z.object({
    series: z
      .array(
        z
          .object({
            ...cover,
            seasons: z.number().int().min(1).max(LIMITS.seasons, `Maximaal ${LIMITS.seasons} seizoenen.`),
            season: z.number().int().min(1).max(LIMITS.seasons),
            status: z.enum(Object.keys(SERIES_STATUS) as [SeriesStatus]),
            platform: z.enum(Object.keys(SERIES_PLATFORMS) as [SeriesPlatform]),
          })
          // You can't be on season 6 of 5
          .transform((s) => ({ ...s, season: Math.min(s.season, s.seasons) })),
      )
      .max(LIMITS.series, `Maximaal ${LIMITS.series} series.`),
    look: shelfLook('series'),
  }),
  huisdier: z.object({
    species: z.enum(Object.keys(PET_SPECIES) as [PetSpecies]),
    name: text(LIMITS.petName, 'De naam'),
    color: z.enum(PET_COLORS),
    background: z.enum(Object.keys(PET_BACKGROUNDS) as [PetBackground]).optional(),
    hat: z.enum(Object.keys(PET_HATS) as [PetHat]).optional(),
  }),
  forum: z.object({ show: z.enum(['berichten', 'onderwerpen']), count: z.number().int().min(1).max(LIMITS.forumItems), showStats: z.boolean() }),
  plakboek: z.object({
    source: z.enum(['verzameling', 'uploads', 'gekozen']),
    picked: z.array(z.number().int().positive()).max(LIMITS.scrapbook, `Kies maximaal ${LIMITS.scrapbook} plaatjes.`),
    paper: z.enum(Object.keys(SCRAPBOOK_PAPERS) as [ScrapbookPaper]),
  }),
  spelscores: z.object({
    kinds: z.array(z.enum(Object.keys(GAMES) as [string])).max(Object.keys(GAMES).length),
    recent: z.boolean(),
    style: z.enum(['scorebord', 'simpel']),
  }),
  blog: z.object({ count: z.number().int().min(1).max(10), featured: z.number().int().positive().nullable(), showStats: z.boolean(), look: z.enum(['dagboek', 'simpel']) }),
  mindfulness: z.object({
    parts: z.array(z.enum(Object.keys(MINDFULNESS_PARTS) as [MindfulnessPart])).max(4),
    breath: z.enum(Object.keys(BREATH_PATTERNS) as [BreathPattern]),
    color: z.enum(Object.keys(MINDFULNESS_COLORS) as [MindfulnessColor]),
    mantras: z.array(z.string().trim().min(1).max(MINDFULNESS_LIMITS.mantra)).max(MINDFULNESS_LIMITS.mantras),
    feeling: z.object({ mood: z.enum(Object.keys(MOODS) as [string]), note: z.string().trim().max(MINDFULNESS_LIMITS.note), at: z.iso.datetime() }).nullable(),
    log: z.array(z.object({ mood: z.enum(Object.keys(MOODS) as [string]), at: z.iso.datetime() })).max(MINDFULNESS_LIMITS.log),
    grateful: z.array(z.string().trim().max(MINDFULNESS_LIMITS.gratefulItem)).max(MINDFULNESS_LIMITS.grateful),
  }),
  kuddesradio: z.object({ show: z.enum(['mijn', 'gevolgd']) }),
  kuddesmuziek: z.object({ show: z.enum(['nieuwste', 'populair', 'favorieten']), count: z.number().int().min(1).max(20), look: z.enum(['speler', 'lijst']) }),
  fotografie: z.object({ show: z.enum(['nieuwste', 'populair', 'album']), albumId: z.number().int().positive().nullable(), count: z.number().int().min(3).max(24), look: z.enum(['wand', 'strook']) }),
  bestanden: z.object({ docIds: z.array(z.number().int().positive()).max(LIMITS.sharedDocs, `Kies maximaal ${LIMITS.sharedDocs} bestanden.`) }),
  woord: docGadget,
  rekenblad: docGadget,
  presentatie: docGadget,
  paint: docGadget,
  mindmap: docGadget,
  planner: docGadget,
  formulier: docGadget,
  kladblok: docGadget,
  rekenmachine: z.object({
    mode: z.enum(['rekenmachine', 'grafiek']),
    functions: z.array(text(LIMITS.graphFunction, 'Een functie')).max(LIMITS.graphFunctions, `Maximaal ${LIMITS.graphFunctions} functies.`),
  }),
} satisfies Record<GadgetType, z.ZodType>

const typeSchema = z.enum(Object.keys(GADGET_TYPES) as [GadgetType])

async function parseConfig(type: GadgetType, config: unknown, owner: User, gadgetId?: number) {
  const parsed = parse(CONFIG_SCHEMAS[type], config)
  // A video gadget may only show your own videos
  if (type === 'kuddesvideo' || type === 'kanaal') {
    const cfg = parsed as Partial<GadgetConfig['kuddesvideo'] & GadgetConfig['kanaal']>
    const ids = [...(cfg.videoIds ?? []), ...(cfg.highlights ?? []), ...(cfg.featured ? [cfg.featured] : [])]
    if (ids.length) {
      const own = await db.select({ id: videos.publicId }).from(videos).where(and(eq(videos.userId, owner.id), inArray(videos.publicId, ids)))
      if (own.length !== new Set(ids).size) throw new HttpError(400, 'Je kunt alleen je eigen video’s kiezen.')
    }
  }
  // Backgrounds and hats from the pet shop have to be bought first
  if (type === 'huisdier') {
    const cfg = parsed as GadgetConfig['huisdier']
    for (const item of [cfg.background, cfg.hat]) {
      if (item && !(gadgetId ? await petOwns(gadgetId, item) : PET_BACKGROUNDS[item as PetBackground]?.price === 0 || PET_HATS[item as PetHat]?.price === 0))
        throw new HttpError(400, 'Koop dit eerst in de winkel van je huisdier.')
    }
  }
  // The scrapbook shows your own glitterplaatjes, or ones from your collection
  if (type === 'plakboek') {
    const picked = [...new Set((parsed as GadgetConfig['plakboek']).picked)]
    ;(parsed as GadgetConfig['plakboek']).picked = picked
    if (!(await ownGlitters(owner.id, picked))) throw new HttpError(400, 'Je kunt alleen glitterplaatjes uit je eigen verzameling of uploads kiezen.')
  }
  // The featured photo must be one of your own
  if (type === 'foto') {
    const photoId = (parsed as GadgetConfig['foto']).photoId
    if (photoId) {
      const [own] = await db.select({ id: photos.id }).from(photos).where(and(eq(photos.id, photoId), eq(photos.userId, owner.id)))
      if (!own) throw new HttpError(400, 'Je kunt alleen een foto uit je eigen Foto\'s kiezen.')
    }
  }
  // Files from Tools: your own, and of the gadget's kind
  if (type === 'bestanden' || isDocGadget(type)) {
    const ids = type === 'bestanden' ? [...new Set((parsed as GadgetConfig['bestanden']).docIds)] : [(parsed as GadgetConfig['woord']).docId].filter((x): x is number => !!x)
    if (type === 'bestanden') (parsed as GadgetConfig['bestanden']).docIds = ids
    if (ids.length) {
      const own = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.userId, owner.id), inArray(documents.id, ids), type === 'bestanden' ? undefined : eq(documents.kind, type)))
      if (own.length !== ids.length) throw new HttpError(400, 'Je kunt alleen je eigen bestanden kiezen.')
    }
  }
  return parsed
}

/** The file ids a gadget shows. */
const gadgetDocIds = (g: GadgetRow): number[] =>
  g.type === 'bestanden' ? (g.config as GadgetConfig['bestanden']).docIds : isDocGadget(g.type) && (g.config as GadgetConfig['woord']).docId ? [(g.config as GadgetConfig['woord']).docId!] : []

/** The videos a Kuddes Video gadget shows this viewer: the owner's latest, or the picked ones in order. */
async function gadgetVideos(g: GadgetRow, viewer: User | null) {
  const cfg = g.config as GadgetConfig['kuddesvideo']
  if (cfg.mode === 'gekozen') {
    if (!cfg.videoIds.length) return []
    const rows = await selectVideos().where(and(eq(videos.userId, g.userId), inArray(videos.publicId, cfg.videoIds), videoVisibleTo(viewer, 'link'), eq(videos.status, 'klaar')))
    return cfg.videoIds.flatMap((id) => rows.filter((r) => r.video.publicId === id).map(toVideoSummary))
  }
  const rows = await selectVideos()
    .where(and(eq(videos.userId, g.userId), videoVisibleTo(viewer, 'lijst'), eq(videos.status, 'klaar')))
    .orderBy(desc(videos.id))
    .limit(LIMITS.kuddesvideos)
  return rows.map(toVideoSummary)
}

/** The Videokanaal gadget: the owner's channel as this viewer may see it. */
async function gadgetChannel(g: GadgetRow, viewer: User | null): Promise<GadgetChannel> {
  const cfg = g.config as GadgetConfig['kanaal']
  const mine = and(eq(videos.userId, g.userId), videoVisibleTo(viewer, 'lijst'), eq(videos.status, 'klaar'))
  const [[stats], popular] = await Promise.all([
    db.select({ n: count(), views: sql<number>`coalesce(sum(${videos.views}), 0)::int` }).from(videos).where(mine),
    selectVideos().where(mine).orderBy(desc(cfg.show === 'nieuwste' ? videos.id : videos.views), desc(videos.id)).limit(LIMITS.highlights + 1),
  ])
  // Picked videos may also be ones shared by link only
  const picked = [...(cfg.featured ? [cfg.featured] : []), ...(cfg.show === 'gekozen' ? cfg.highlights : [])]
  const pickedRows = picked.length
    ? (await selectVideos().where(and(eq(videos.userId, g.userId), inArray(videos.publicId, picked), videoVisibleTo(viewer, 'link'), eq(videos.status, 'klaar')))).map(toVideoSummary)
    : []
  const byId = (id: string) => pickedRows.find((v) => v.id === id) ?? null
  const featured = (cfg.featured && byId(cfg.featured)) || (popular[0] ? toVideoSummary(popular[0]) : null)
  const highlights =
    cfg.show === 'gekozen'
      ? cfg.highlights.map(byId).filter((v): v is NonNullable<typeof v> => !!v && v.id !== featured?.id)
      : popular.map(toVideoSummary).filter((v) => v.id !== featured?.id).slice(0, LIMITS.highlights)
  return { videoCount: stats.n, views: stats.views, featured, highlights }
}

/** Item ids that still exist in a gadget (respect for a removed book doesn't count). */
function itemIds(g: GadgetRow): string[] {
  const c = g.config as Record<string, { id: string }[]>
  const list = { boeken: c.books, films: c.movies, platen: c.albums, spellen: c.games, lijstje: c.items, drank: c.drinks, series: c.series }[g.type as RespectGadget]
  return (list ?? []).map((i) => i.id)
}

const isRespectGadget = (type: GadgetType): type is RespectGadget => (RESPECT_GADGETS as readonly string[]).includes(type)

/** Serialises gadgets, with poll results and videos for the viewer. */
async function toGadgets(rows: GadgetRow[], viewer: User | null): Promise<Gadget[]> {
  const pollIds = rows.filter((g) => g.type === 'poll').map((g) => g.id)
  const [tallies, mine] = pollIds.length
    ? await Promise.all([
        db
          .select({ gadgetId: pollVotes.gadgetId, option: pollVotes.option, n: count() })
          .from(pollVotes)
          .where(inArray(pollVotes.gadgetId, pollIds))
          .groupBy(pollVotes.gadgetId, pollVotes.option),
        viewer
          ? db
              .select({ gadgetId: pollVotes.gadgetId, option: pollVotes.option })
              .from(pollVotes)
              .where(and(inArray(pollVotes.gadgetId, pollIds), eq(pollVotes.userId, viewer.id)))
          : Promise.resolve([]),
      ])
    : [[], []]

  const videoLists = new Map(await Promise.all(rows.filter((g) => g.type === 'kuddesvideo').map(async (g) => [g.id, await gadgetVideos(g, viewer)] as const)))
  const recipeLists = new Map(
    await Promise.all(
      rows.filter((g) => g.type === 'recepten').map(async (g) => {
        const cfg = g.config as GadgetConfig['recepten']
        return [g.id, await gadgetRecipes(g.userId, cfg.show, cfg.count, viewer)] as const
      }),
    ),
  )
  const channels = new Map(await Promise.all(rows.filter((g) => g.type === 'kanaal').map(async (g) => [g.id, await gadgetChannel(g, viewer)] as const)))
  const respectIds = rows.filter((g) => isRespectGadget(g.type)).map((g) => g.id)
  const [respectCounts, myRespect] = respectIds.length
    ? await Promise.all([
        db.select({ gadgetId: gadgetRespect.gadgetId, itemId: gadgetRespect.itemId, n: count() }).from(gadgetRespect).where(inArray(gadgetRespect.gadgetId, respectIds)).groupBy(gadgetRespect.gadgetId, gadgetRespect.itemId),
        viewer ? db.select({ gadgetId: gadgetRespect.gadgetId, itemId: gadgetRespect.itemId }).from(gadgetRespect).where(and(inArray(gadgetRespect.gadgetId, respectIds), eq(gadgetRespect.userId, viewer.id))) : Promise.resolve([]),
      ])
    : [[], []]
  const respectOf = (g: GadgetRow): Record<string, ItemRespect> | null => {
    if (!isRespectGadget(g.type)) return null
    return Object.fromEntries(
      itemIds(g).map((id) => [
        id,
        { count: respectCounts.find((r) => r.gadgetId === g.id && r.itemId === id)?.n ?? 0, mine: myRespect.some((r) => r.gadgetId === g.id && r.itemId === id) },
      ]),
    )
  }
  const photoIds = rows.filter((g) => g.type === 'foto').map((g) => (g.config as GadgetConfig['foto']).photoId).filter((x): x is number => !!x)
  const photoRows = photoIds.length ? await db.select({ photo: photos, user: summaryColumns }).from(photos).innerJoin(users, eq(users.id, photos.userId)).where(inArray(photos.id, photoIds)) : []
  const counterOwners = [...new Set(rows.filter((g) => g.type === 'teller').map((g) => g.userId))]
  const viewRows = counterOwners.length ? await db.select({ id: users.id, views: users.views }).from(users).where(inArray(users.id, counterOwners)) : []
  const extras = async <T,>(type: GadgetType, load: (g: GadgetRow) => Promise<T>) => new Map(await Promise.all(rows.filter((g) => g.type === type).map(async (g) => [g.id, await load(g)] as const)))
  const [pets, forums, scrapbooks, scores, blogLists] = await Promise.all([
    extras('huisdier', (g) => gadgetPet(g, viewer)),
    extras('forum', gadgetForum),
    extras('plakboek', (g) => gadgetGlitters(g, viewer)),
    extras('spelscores', gadgetScores),
    extras('blog', (g) => gadgetBlogs(g.userId, g.config as GadgetConfig['blog'], viewer)),
  ])
  // Titles of the files in file gadgets (a deleted file just drops out)
  const docIds = [...new Set(rows.flatMap(gadgetDocIds))]
  const docRows = docIds.length
    ? await db
        .select({ id: documents.id, userId: documents.userId, kind: documents.kind, title: documents.title, words: documents.words, updatedAt: documents.updatedAt })
        .from(documents)
        .where(inArray(documents.id, docIds))
    : []
  const docsOf = (g: GadgetRow): SharedDocItem[] | null =>
    g.type === 'bestanden' || isDocGadget(g.type)
      ? gadgetDocIds(g).flatMap((id) =>
          docRows
            .filter((d) => d.id === id && d.userId === g.userId)
            .map((d) => ({ id: d.id, kind: d.kind, title: d.title, words: d.words, updatedAt: d.updatedAt.toISOString() })),
        )
      : null
  const owners = [...new Set(rows.filter((g) => g.type === 'prestaties').map((g) => g.userId))]
  const overviews = new Map(await Promise.all(owners.map(async (id) => [id, await achievementOverview(id)] as const)))

  return rows.map((g) => {
    let poll = null
    if (g.type === 'poll') {
      const options = (g.config as { options: string[] }).options
      const counts = options.map((_, i) => tallies.find((t) => t.gadgetId === g.id && t.option === i)?.n ?? 0)
      poll = { counts, total: counts.reduce((a, b) => a + b, 0), myVote: mine.find((m) => m.gadgetId === g.id)?.option ?? null }
    }
    return {
      id: g.id,
      type: g.type,
      title: g.title,
      enabled: g.enabled,
      config: g.config,
      createdAt: g.createdAt.toISOString(),
      poll,
      videos: videoLists.get(g.id) ?? null,
      achievements: g.type === 'prestaties' ? (overviews.get(g.userId) ?? null) : null,
      recipes: recipeLists.get(g.id) ?? null,
      channel: channels.get(g.id) ?? null,
      photo:
        g.type === 'foto'
          ? (() => {
              const row = photoRows.find((r) => r.photo.id === (g.config as GadgetConfig['foto']).photoId && r.photo.userId === g.userId)
              return row ? toPhoto(row.photo, row.user, viewer?.id) : null
            })()
          : null,
      views: g.type === 'teller' ? (viewRows.find((r) => r.id === g.userId)?.views ?? 0) : null,
      respect: respectOf(g),
      pet: pets.get(g.id) ?? null,
      forum: forums.get(g.id) ?? null,
      glitters: scrapbooks.get(g.id) ?? null,
      scores: scores.get(g.id) ?? null,
      blogs: blogLists.get(g.id) ?? null,
      docs: docsOf(g),
    } as Gadget
  })
}

async function ownGadget(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(gadgets)
    .where(and(eq(gadgets.id, id), eq(gadgets.userId, userId)))
  if (!row) throw notFound('Deze gadget bestaat niet (meer).')
  return row
}

export const gadgetRoutes = new Hono<AppEnv>()
  // A member's gadgets; switched off ones only for themselves
  .get('/users/:username/gadgets', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(viewer, user)
    const isSelf = viewer?.id === user.id
    const rows = await db
      .select()
      .from(gadgets)
      .where(and(eq(gadgets.userId, user.id), isSelf ? undefined : eq(gadgets.enabled, true)))
      .orderBy(asc(gadgets.id))
    return c.json(await toGadgets(rows, viewer))
  })

  // For the Gadgetmarkt: how many members show each kind of gadget
  .get('/gadgets/populair', async (c) => {
    requireUser(c)
    const rows = await db
      .select({ type: gadgets.type, n: countDistinct(gadgets.userId) })
      .from(gadgets)
      .where(eq(gadgets.enabled, true))
      .groupBy(gadgets.type)
    return c.json(Object.fromEntries(rows.map((r) => [r.type, r.n])) as Partial<Record<GadgetType, number>>)
  })

  .post('/me/gadgets', rateLimit('gadgets', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({ type: typeSchema, title: text(LIMITS.title, 'Een titel').optional(), config: z.unknown().optional() }),
      await c.req.json().catch(() => null),
    )
    const [{ n }] = await db.select({ n: count() }).from(gadgets).where(eq(gadgets.userId, me.id))
    if (n >= LIMITS.gadgets) throw new HttpError(400, `Je kunt maximaal ${LIMITS.gadgets} gadgets hebben.`)
    const config = input.config === undefined ? DEFAULT_CONFIG[input.type] : await parseConfig(input.type, input.config, me)
    const [row] = await db
      .insert(gadgets)
      .values({ userId: me.id, type: input.type, title: input.title ?? GADGET_TYPES[input.type].name, config })
      .returning()
    const [gadget] = await toGadgets([row], me)
    return c.json(gadget, 201)
  })

  .patch('/me/gadgets/:id', rateLimit('gadgets bewerken', 600, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const row = await ownGadget(me.id, Number(c.req.param('id')))
    const input = parse(
      z.object({ title: text(LIMITS.title, 'Een titel').optional(), enabled: z.boolean().optional(), config: z.unknown().optional() }),
      await c.req.json().catch(() => null),
    )
    const config = input.config === undefined ? undefined : await parseConfig(row.type, input.config, me, row.id)
    // Changing the answers of a poll makes the old votes meaningless
    const pollChanged =
      row.type === 'poll' &&
      config &&
      JSON.stringify((config as { options: string[] }).options) !== JSON.stringify((row.config as { options: string[] }).options)
    const [updated] = await db.transaction(async (tx) => {
      if (pollChanged) await tx.delete(pollVotes).where(eq(pollVotes.gadgetId, row.id))
      return tx
        .update(gadgets)
        .set({
          ...(input.title !== undefined && { title: input.title || GADGET_TYPES[row.type].name }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          ...(config && { config }),
        })
        .where(eq(gadgets.id, row.id))
        .returning()
    })
    const [gadget] = await toGadgets([updated], me)
    return c.json(gadget)
  })

  .delete('/me/gadgets/:id', async (c) => {
    const me = requireUser(c)
    const row = await ownGadget(me.id, Number(c.req.param('id')))
    await db.delete(gadgets).where(eq(gadgets.id, row.id))
    return c.body(null, 204)
  })

  // A file from Tools in someone's gadget, to look at (members only, as profiles are)
  .get('/gadgets/:id{[0-9]+}/documents/:docId{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select()
      .from(gadgets)
      .where(eq(gadgets.id, Number(c.req.param('id'))))
    const docId = Number(c.req.param('docId'))
    if (!row || (!row.enabled && row.userId !== me.id) || !gadgetDocIds(row).includes(docId)) throw notFound('Dit bestand wordt niet (meer) gedeeld.')
    // Not when the owner's profile is for friends only and you aren't one
    const [owner] = await db.select().from(users).where(eq(users.id, row.userId))
    if (owner) await requireProfileAccess(me, owner)
    const [found] = await db
      .select({ doc: documents, owner: summaryColumns })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.userId))
      .where(and(eq(documents.id, docId), eq(documents.userId, row.userId)))
    if (!found) throw notFound('Dit bestand bestaat niet meer.')
    const d = found.doc
    return c.json({
      id: d.id,
      kind: d.kind,
      title: d.title,
      words: d.words,
      updatedAt: d.updatedAt.toISOString(),
      html: d.html,
      content: d.content ?? null,
      settings: docSettings(d.settings),
      owner: toSummary(found.owner),
    } satisfies SharedDoc)
  })

  // Feed, pet or play with someone's Virtueel huisdier (or your own)
  .post('/gadgets/:id/huisdier', rateLimit('huisdier', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { action } = parse(z.object({ action: z.enum(PET_ACTION_KEYS as [PetAction]) }), await c.req.json().catch(() => null))
    const [row] = await db
      .select()
      .from(gadgets)
      .where(and(eq(gadgets.id, Number(c.req.param('id'))), eq(gadgets.type, 'huisdier')))
    if (!row || (!row.enabled && row.userId !== me.id)) throw notFound('Dit huisdier bestaat niet (meer).')
    const refused = await carePet(row, me, action)
    if (refused) throw new HttpError(400, refused)
    const [gadget] = await toGadgets([row], me)
    return c.json(gadget)
  })

  // The pet shop, for the owner: buy a background or hat, or use one
  .post('/gadgets/:id/huisdier/winkel', rateLimit('huisdierwinkel', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { item, buy } = parse(z.object({ item: z.string().max(20), buy: z.boolean() }), await c.req.json().catch(() => null))
    const row = await ownGadget(me.id, Number(c.req.param('id')))
    if (row.type !== 'huisdier') throw notFound('Dit huisdier bestaat niet (meer).')
    const refused = await petShop(row, item, buy)
    if (refused) throw new HttpError(400, refused)
    const [updated] = await db.select().from(gadgets).where(eq(gadgets.id, row.id))
    const [gadget] = await toGadgets([updated], me)
    return c.json(gadget)
  })

  // Vote (or change your vote) on a poll
  .post('/gadgets/:id/vote', rateLimit('stemmen', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select()
      .from(gadgets)
      .where(and(eq(gadgets.id, Number(c.req.param('id'))), eq(gadgets.type, 'poll'), eq(gadgets.enabled, true)))
    if (!row) throw notFound('Deze poll bestaat niet (meer).')
    const config = row.config as { options: string[]; closed: boolean; question: string }
    if (config.closed) throw new HttpError(400, 'Deze poll is gesloten.')
    const { option } = parse(
      z.object({ option: z.number().int().min(0).max(config.options.length - 1, 'Dat antwoord bestaat niet.') }),
      await c.req.json().catch(() => null),
    )
    await db
      .insert(pollVotes)
      .values({ gadgetId: row.id, userId: me.id, option })
      .onConflictDoUpdate({ target: [pollVotes.gadgetId, pollVotes.userId], set: { option, createdAt: new Date() } })
    const [gadget] = await toGadgets([row], me)
    return c.json(gadget)
  })

  // Respect for one item: a book, a film, a line in a list (not for your own)
  .post('/gadgets/:id/items/:item/respect', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const [row] = await db
      .select()
      .from(gadgets)
      .where(and(eq(gadgets.id, Number(c.req.param('id'))), eq(gadgets.enabled, true)))
    if (!row || !isRespectGadget(row.type)) throw notFound('Deze gadget bestaat niet (meer).')
    const item = c.req.param('item')
    if (!itemIds(row).includes(item)) throw notFound('Dit staat er niet (meer) in.')
    if (row.userId === me.id) throw new HttpError(400, 'Je kunt je eigen keuzes geen respect geven.')
    const { on } = parse(z.object({ on: z.boolean() }), await c.req.json().catch(() => null))
    if (on) await db.insert(gadgetRespect).values({ gadgetId: row.id, itemId: item, userId: me.id }).onConflictDoNothing()
    else await db.delete(gadgetRespect).where(and(eq(gadgetRespect.gadgetId, row.id), eq(gadgetRespect.itemId, item), eq(gadgetRespect.userId, me.id)))
    const [gadget] = await toGadgets([row], me)
    return c.json(gadget)
  })

  // SomaFM's stations with what's playing now, for the Radio gadget (cached a minute)
  .get('/radio/somafm', async (c) => {
    c.header('Cache-Control', 'public, max-age=60')
    return c.json(await somaStations())
  })

  // The title of a YouTube video, so members don't have to type it
  .get('/youtube/:id', rateLimit('youtube', 120, 60 * 60 * 1000), async (c) => {
    requireUser(c)
    const id = c.req.param('id')
    if (!YOUTUBE_ID.test(id)) throw new HttpError(400, 'Dat is geen geldige YouTube-link.')
    const cached = titleCache.get(id)
    if (cached !== undefined) return c.json({ videoId: id, title: cached })
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (res.status === 404 || res.status === 400) throw new HttpError(404, 'Deze video bestaat niet of mag niet ingesloten worden.')
      const data = (await res.json()) as { title?: string }
      const title = (data.title ?? '').slice(0, LIMITS.trackTitle)
      if (titleCache.size > 2000) titleCache.clear()
      titleCache.set(id, title)
      return c.json({ videoId: id, title })
    } catch (e) {
      if (e instanceof HttpError) throw e
      // YouTube unreachable: the member can type the title themselves
      return c.json({ videoId: id, title: '' })
    }
  })

const titleCache = new Map<string, string>()

let somaCache: { at: number; stations: RadioStation[] } | null = null

/** SomaFM's own station list; the last good one is kept when SomaFM can't be reached. */
async function somaStations(): Promise<RadioStation[]> {
  if (somaCache && Date.now() - somaCache.at < 60_000) return somaCache.stations
  try {
    const res = await fetch('https://api.somafm.com/channels.json', { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'Kuddes' } })
    const data = (await res.json()) as { channels?: { id: string; title: string; description: string; genre: string; image: string; listeners: string; lastPlaying: string }[] }
    const stations = (data.channels ?? [])
      .filter((ch) => /^[a-z0-9]{2,30}$/.test(ch.id))
      .map((ch) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        genre: ch.genre.replace(/\|/g, ', '),
        // Only SomaFM's own logos
        image: /^https:\/\/api\.somafm\.com\//.test(ch.image) ? ch.image : '',
        listeners: Number(ch.listeners) || 0,
        nowPlaying: ch.lastPlaying ?? '',
      }))
    somaCache = { at: Date.now(), stations }
    return stations
  } catch {
    return somaCache?.stations ?? []
  }
}
