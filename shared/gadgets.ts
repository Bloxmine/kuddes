/**
 * Profile gadgets: plaknotities, muziek, kasten, radio and many more. Members
 * add them themselves, from the Gadgetmarkt or right on their profile; nobody
 * has any by default. A new type needs an entry here (name, description,
 * category), a default config, an icon, a box and an editor. Each gadget is
 * its own box in the profile layout, under the slot key "gadget:<id>".
 */

import type { MkCharacter, MkController, MkVehicle } from './mariokart'
import type { NameFont } from './customization'

/** The groups in the Gadgetmarkt. A new gadget type picks one of these. */
export const GADGET_CATEGORIES = {
  kasten: 'Kasten en verzamelingen',
  media: 'Muziek en video',
  jezelf: 'Over jezelf',
  handig: 'Leuk en handig',
  tools: 'Tools en bestanden',
} as const
export type GadgetCategory = keyof typeof GADGET_CATEGORIES

export const GADGET_TYPES = {
  notities: { name: 'Plaknotities', description: 'Gele briefjes op je profiel, met punaise en al.', category: 'handig' },
  muziek: { name: 'Muziek', description: 'Je favoriete nummers van YouTube in een eigen speler.', category: 'media' },
  video: { name: 'Video', description: "Een of meer YouTube-video's op je profiel.", category: 'media' },
  aftellen: { name: 'Aftellen', description: 'Tel af naar je verjaardag, vakantie of dat ene feest.', category: 'handig' },
  poll: { name: 'Poll', description: 'Stel een vraag en laat je bezoekers stemmen.', category: 'handig' },
  kuddesvideo: { name: 'Kuddes Video', description: "Je eigen geüploade video's, in de Kuddes-speler.", category: 'media' },
  prestaties: { name: 'Prestaties', description: 'Je verdiende prestaties en je spelstatistieken.', category: 'jezelf' },
  boeken: { name: 'Boekenkast', description: 'De boeken die je gelezen hebt en mooi vond, in een houten winkelkast.', category: 'kasten' },
  films: { name: 'Filmrek', description: "Je favoriete films als dvd's in het rek van de videotheek.", category: 'kasten' },
  platen: { name: 'Platenkast', description: "Je favoriete albums, als cd's of langspeelplaten.", category: 'kasten' },
  spellen: { name: 'Spellenkast', description: 'Je favoriete games en bordspellen, in de kast van de gamewinkel.', category: 'kasten' },
  recepten: { name: 'Recepten', description: 'Je eigen recepten en de recepten die je lekker vindt, in je receptenbak.', category: 'kasten' },
  kanaal: { name: 'Videokanaal', description: 'Je Kuddes Video-kanaal: een uitgelichte video, je hoogtepunten en je kijkcijfers.', category: 'media' },
  radio: { name: 'Radio', description: 'De zenders van SomaFM: reclamevrije radio uit San Francisco, voor al je bezoekers.', category: 'media' },
  klok: { name: 'Klok', description: 'Hoe laat het is bij jou, of bij iemand aan de andere kant van de wereld.', category: 'handig' },
  lijstje: { name: 'Lijstje', description: 'Je top 10 van alles: snacks, liedjes, vakantieplekken. Bezoekers geven respect.', category: 'jezelf' },
  landen: { name: 'Landen', description: 'Waar je allemaal geweest bent, en waar je nog heen wilt, met vlaggetjes.', category: 'jezelf' },
  links: { name: 'Favoriete websites', description: 'De websites waar je graag komt, als knoppen op je profiel.', category: 'jezelf' },
  mariokart: { name: 'Mario Kart Wii', description: 'Je licentie: je vaste coureur, kart of motor, je VR en BR en je vriendcode.', category: 'jezelf' },
  tekst: { name: 'Tekstvak', description: 'Een eigen box met tekst, in je eigen kleuren en letters.', category: 'jezelf' },
  foto: { name: 'Uitgelichte foto', description: 'Eén foto uit je Foto\'s groot op je profiel, als polaroid of in een lijstje.', category: 'jezelf' },
  teller: { name: 'Bezoekersteller', description: 'Hoe vaak je profiel bekeken is, op een ouderwetse teller.', category: 'handig' },
  citaat: { name: 'Citaat', description: 'Een mooie uitspraak op een krijtbord, briefje of neonbord.', category: 'jezelf' },
  drank: { name: 'Drank Hall of Fame', description: 'Je favoriete bieren, wijnen en andere drankjes, als flessen achter de bar.', category: 'kasten' },
  series: { name: 'Series', description: 'De series die je kijkt, gezien hebt of nog wilt zien, als boxen in de kast.', category: 'kasten' },
  huisdier: { name: 'Virtueel huisdier', description: 'Een eigen kat, hond, konijn of draakje. Je bezoekers geven het eten, aaien het en spelen ermee.', category: 'handig' },
  forum: { name: 'Forumberichten', description: 'Je nieuwste berichten of onderwerpen op het Kuddes Forum, met je forumtitel en tellers.', category: 'jezelf' },
  plakboek: { name: 'Glitterplakboek', description: 'Je mooiste glitterplaatjes in een plakboek om doorheen te bladeren. Bezoekers kunnen ze verzamelen.', category: 'kasten' },
  fotografie: { name: 'Fotografie', description: 'Je fotostream, je best bekeken foto’s of een album van je fotografiepagina, als fotowand op je profiel.', category: 'media' },
  blog: { name: 'Blog', description: 'Je nieuwste blogs als een dagboekje op je profiel: eentje uitgelicht, en hoe vaak ze gelezen zijn.', category: 'jezelf' },
  mindfulness: { name: 'Mindfulness', description: 'Even tot rust komen: ademhalen met een cirkel, een mantra van de dag, hoe je je voelt en waar je dankbaar voor bent.', category: 'jezelf' },
  kuddesradio: { name: 'Kuddes Radio', description: 'Je eigen zender (live of wanneer je weer uitzendt), of de zenders die je volgt, met een knop om mee te luisteren.', category: 'media' },
  kuddesmuziek: { name: 'Kuddes Muziek', description: 'Je eigen nummers van Kuddes Muziek, of de nummers die je leuk vindt, in een speler op je profiel.', category: 'media' },
  spelscores: { name: 'Spelscores', description: 'Hoe vaak je won, verloor of gelijkspeelde, per spel, met je laatste potjes en je grootste rivaal.', category: 'jezelf' },
  bestanden: { name: 'Gedeelde bestanden', description: 'Bestanden uit Tools die je wilt laten zien: documenten, rekenbladen, presentaties, tekeningen en meer. Bezoekers kunnen ze bekijken, niet bewerken.', category: 'tools' },
  woord: { name: 'Woord-document', description: 'Een document uit Kuddes Woord, om op je profiel te lezen.', category: 'tools' },
  rekenblad: { name: 'Rekenblad', description: 'Een werkblad uit Kuddes Rekenblad, met de tabel en de grafieken.', category: 'tools' },
  presentatie: { name: 'Presentatie', description: 'Een presentatie uit Kuddes Presentatie om dia voor dia doorheen te klikken.', category: 'tools' },
  paint: { name: 'Tekening', description: 'Een tekening uit Kuddes Paint, in een lijstje op je profiel.', category: 'tools' },
  mindmap: { name: 'Mindmap', description: 'Een mindmap uit Kuddes Mindmap, met al zijn takken.', category: 'tools' },
  planner: { name: 'Planner', description: 'Je takenlijst uit Kuddes Planner: wat je nog moet doen, waar je mee bezig bent en wat af is.', category: 'tools' },
  formulier: { name: 'Formulier', description: 'Laat je bezoekers een formulier uit Kuddes Formulieren invullen.', category: 'tools' },
  kladblok: { name: 'Kladblok', description: 'Een notitie uit Kladblok, op een blaadje van een notitieblok.', category: 'tools' },
  rekenmachine: { name: 'Rekenmachine', description: 'Een rekenmachine voor je bezoekers, of een grafiek van je eigen functies om te bekijken en te verschuiven.', category: 'tools' },
} as const satisfies Record<string, { name: string; description: string; category: GadgetCategory }>

export type GadgetType = keyof typeof GADGET_TYPES

/** Gadgets that show one file from Tools: the gadget type is the file's kind. */
export const DOC_GADGETS = ['woord', 'rekenblad', 'presentatie', 'paint', 'mindmap', 'planner', 'formulier', 'kladblok'] as const satisfies readonly GadgetType[]
export type DocGadget = (typeof DOC_GADGETS)[number]
export const isDocGadget = (t: GadgetType): t is DocGadget => (DOC_GADGETS as readonly string[]).includes(t)

export const NOTE_COLORS = {
  geel: '#fff27a',
  roze: '#ffb3d9',
  blauw: '#a8dcff',
  groen: '#c4f0a0',
  oranje: '#ffcc80',
} as const

export type NoteColor = keyof typeof NOTE_COLORS

export type StickyNote = { id: string; text: string; color: NoteColor }

/** Cover colours for the books and dvd's (there are no cover images: we draw them). */
export const COVER_COLORS = {
  rood: ['#b3262e', '#fbe7c6'],
  blauw: ['#1f4f8b', '#f4f1e6'],
  groen: ['#2f6b3a', '#f6efd2'],
  geel: ['#f2c230', '#2a2118'],
  zwart: ['#1d1d22', '#e8c75a'],
  wit: ['#f3efe6', '#27313f'],
  roze: ['#e87fae', '#ffffff'],
  paars: ['#5b3a8c', '#fcd97a'],
  oranje: ['#e8741c', '#1e1a16'],
  turquoise: ['#1f8f93', '#fff6e0'],
} as const

export type CoverColor = keyof typeof COVER_COLORS

/** How the title is laid out on a cover, so a shelf doesn't look all the same. */
export const COVER_STYLES = ['klassiek', 'band', 'modern', 'sierlijk'] as const
export type CoverStyle = (typeof COVER_STYLES)[number]
export const COVER_STYLE_NAMES: Record<CoverStyle, string> = { klassiek: 'Klassiek', band: 'Met band', modern: 'Modern', sierlijk: 'Sierlijk' }

/** The furniture around the books, dvd's or albums. */
export const SHELF_LOOKS = {
  hout: 'Houten kast',
  klassiek: 'Klassiek mahonie',
  antiek: 'Heel klassiek',
  modern: 'Modern wit',
  videotheek: 'Videotheek',
  bioscoop: 'Bioscoop',
  tvmeubel: 'Tv-meubel',
  cdmap: 'Cd-map uit de auto',
  gamewinkel: 'Gamewinkel',
  kroeg: 'Bruin café',
  wijnkelder: 'Wijnkelder',
  simpel: 'Simpel',
} as const
export type ShelfLook = keyof typeof SHELF_LOOKS

/** Which looks each shelf gadget offers, the first is the standard one. */
export const SHELF_LOOKS_FOR = {
  boeken: ['hout', 'klassiek', 'antiek', 'modern', 'simpel'],
  films: ['videotheek', 'bioscoop', 'tvmeubel', 'hout', 'modern', 'simpel'],
  platen: ['modern', 'cdmap', 'hout', 'klassiek', 'simpel'],
  spellen: ['gamewinkel', 'tvmeubel', 'hout', 'modern', 'simpel'],
  drank: ['kroeg', 'wijnkelder', 'hout', 'modern', 'simpel'],
  series: ['tvmeubel', 'videotheek', 'hout', 'modern', 'simpel'],
} as const satisfies Record<'boeken' | 'films' | 'platen' | 'spellen' | 'drank' | 'series', readonly ShelfLook[]>

/** `mediaId`: put on the shelf from Recensies (the item links to its page there). */
/** `icon` on a shelf item: a Farm-Fresh icon on its cover (shared/icons.ts), from Recensies or picked in the kast. */
export type Book = { id: string; mediaId?: number; title: string; icon?: string; author: string; color: CoverColor; style: CoverStyle; rating: number; note: string }
export type Album = { id: string; mediaId?: number; title: string; icon?: string; artist: string; format: 'cd' | 'lp'; color: CoverColor; style: CoverStyle; rating: number; note: string }
/** What a game is played on: each gets its own kind of box on the shelf. */
export const GAME_PLATFORMS = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  nintendo: 'Nintendo (Wii, Switch…)',
  handheld: 'Nintendo DS / 3DS',
  gameboy: 'Game Boy',
  bordspel: 'Bordspel',
} as const
export type GamePlatform = keyof typeof GAME_PLATFORMS
export type ShelfGame = { id: string; mediaId?: number; title: string; icon?: string; platform: GamePlatform; color: CoverColor; style: CoverStyle; rating: number; note: string }
export type Movie = { id: string; mediaId?: number; title: string; icon?: string; year: string; color: CoverColor; style: CoverStyle; rating: number; note: string }

/** Kinds of drink: each gets its own bottle (and glass colour) behind the bar. */
export const DRINK_KINDS = {
  pils: 'Pils',
  speciaal: 'Speciaalbier',
  witbier: 'Witbier',
  donker: 'Donker bier of stout',
  rood: 'Rode wijn',
  wit: 'Witte wijn',
  rose: 'Rosé',
  bubbels: 'Champagne of cava',
  cider: 'Cider',
  sterk: 'Sterke drank',
} as const
export type DrinkKind = keyof typeof DRINK_KINDS
/** `color`: the label; `year`: the vintage, for a wine. */
export type Drink = { id: string; mediaId?: number; title: string; icon?: string; kind: DrinkKind; maker: string; year: string; color: CoverColor; style: CoverStyle; rating: number; note: string }

/** Where a series is (or was) on. */
export const SERIES_PLATFORMS = {
  netflix: 'Netflix',
  videoland: 'Videoland',
  disney: 'Disney+',
  hbo: 'HBO Max',
  prime: 'Prime Video',
  apple: 'Apple TV+',
  npo: 'NPO',
  tv: 'Gewoon op tv',
  dvd: 'Op dvd',
  anders: 'Ergens anders',
} as const
export type SeriesPlatform = keyof typeof SERIES_PLATFORMS
export const SERIES_STATUS = { kijken: 'Kijk ik nu', gezien: 'Gezien', wil: 'Wil ik nog zien' } as const
export type SeriesStatus = keyof typeof SERIES_STATUS
/** `seasons`: how many there are; `season`: the one you're on (while watching). */
export type Series = { id: string; mediaId?: number; title: string; icon?: string; seasons: number; season: number; status: SeriesStatus; platform: SeriesPlatform; color: CoverColor; style: CoverStyle; rating: number; note: string }

export type Track = { videoId: string; title: string }
export type ListItem = { id: string; text: string }
export type SiteLink = { id: string; title: string; url: string }

/** Clocks for the Klok gadget: time zones with a Dutch city name. */
export const CLOCK_ZONES = {
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/London': 'Londen',
  'Europe/Lisbon': 'Lissabon',
  'Europe/Istanbul': 'Istanbul',
  'Europe/Moscow': 'Moskou',
  'Atlantic/Canary': 'Gran Canaria',
  'Africa/Casablanca': 'Marrakech',
  'Africa/Cairo': 'Caïro',
  'Africa/Nairobi': 'Nairobi',
  'Africa/Johannesburg': 'Kaapstad',
  'Asia/Dubai': 'Dubai',
  'Asia/Kolkata': 'India',
  'Asia/Bangkok': 'Bangkok',
  'Asia/Jakarta': 'Jakarta',
  'Asia/Makassar': 'Bali',
  'Asia/Shanghai': 'China',
  'Asia/Tokyo': 'Tokio',
  'Australia/Perth': 'Perth',
  'Australia/Sydney': 'Sydney',
  'Pacific/Auckland': 'Nieuw-Zeeland',
  'America/Curacao': 'Curaçao en Aruba',
  'America/Paramaribo': 'Paramaribo',
  'America/New_York': 'New York',
  'America/Chicago': 'Chicago',
  'America/Denver': 'Denver',
  'America/Los_Angeles': 'Los Angeles',
  'America/Mexico_City': 'Mexico-Stad',
  'America/Sao_Paulo': 'São Paulo',
  'America/Buenos_Aires': 'Buenos Aires',
  'Pacific/Honolulu': 'Hawaï',
} as const
export type ClockZone = keyof typeof CLOCK_ZONES

/** The pets for the Virtueel huisdier gadget. */
export const PET_SPECIES = { kat: 'Kat', hond: 'Hond', konijn: 'Konijn', draak: 'Draakje' } as const
export type PetSpecies = keyof typeof PET_SPECIES
export const PET_COLORS = ['#f0a04b', '#8a6a4f', '#f4f1ea', '#5d5f66', '#f2c6d8', '#9fd36c', '#7cc2f0', '#b89cf0'] as const
/** What you can do for a pet; each fills one need. */
export const PET_ACTIONS = { voeren: 'Eten geven', aaien: 'Aaien', spelen: 'Spelen' } as const
export type PetAction = keyof typeof PET_ACTIONS
/** Hours for a need to go from full to empty. */
export const PET_HOURS: Record<PetAction, number> = { voeren: 24, aaien: 18, spelen: 30 }
/** How long before the same member can do the same thing again. */
export const PET_COOLDOWN_HOURS = 3
/** Coins the pet earns for its owner per bit of care: more from visitors than from yourself. */
export const PET_COINS = { visitor: 2, owner: 1 }
/** What the owner can buy in the pet shop; price 0 is free for everyone. */
export const PET_BACKGROUNDS = {
  kamer: { name: 'Kamer', price: 0 },
  tuin: { name: 'Tuin', price: 10 },
  strand: { name: 'Strand', price: 20 },
  snoep: { name: 'Snoepland', price: 30 },
  ruimte: { name: 'Ruimte', price: 40 },
  kasteel: { name: 'Kasteel', price: 60 },
} as const
export type PetBackground = keyof typeof PET_BACKGROUNDS
export const PET_HATS = {
  geen: { name: 'Geen hoedje', price: 0 },
  strik: { name: 'Strik', price: 5 },
  pet: { name: 'Petje', price: 10 },
  feest: { name: 'Feesthoedje', price: 15 },
  kerst: { name: 'Kerstmuts', price: 20 },
  tovenaar: { name: 'Tovenaarshoed', price: 35 },
  kroon: { name: 'Kroon', price: 50 },
} as const
export type PetHat = keyof typeof PET_HATS
export type PetItem = PetBackground | PetHat
/** Whether an item is a background or a hat (their keys don't overlap). */
export const petItemKind = (item: string): 'background' | 'hat' | null => (item in PET_BACKGROUNDS ? 'background' : item in PET_HATS ? 'hat' : null)
export const petItemPrice = (item: string) => (PET_BACKGROUNDS as Record<string, { price: number }>)[item]?.price ?? (PET_HATS as Record<string, { price: number }>)[item]?.price ?? null

/** Paper for the Glitterplakboek. */
export const SCRAPBOOK_PAPERS = { roze: 'Roze', blauw: 'Lichtblauw', kraft: 'Kraftpapier', ruitjes: 'Ruitjespapier', zwart: 'Zwart' } as const
export type ScrapbookPaper = keyof typeof SCRAPBOOK_PAPERS

/** SomaFM stations to start with in a new Radio gadget. */
export const RADIO_START = ['groovesalad', 'dronezone', 'lush', 'secretagent', 'u80s', 'indiepop']

type DocGadgetConfig = { docId: number | null }

export type GadgetConfig = {
  [K in DocGadget]: DocGadgetConfig
} & {
  notities: { notes: StickyNote[] }
  /** `autoplay`: start the first song when someone opens the profile (visitors can turn that off). */
  muziek: { tracks: Track[]; autoplay?: boolean; order?: MusicOrder }
  video: { videos: Track[] }
  aftellen: { target: string; doneText: string }
  poll: { question: string; options: string[]; closed: boolean }
  /** "nieuwste": your latest uploads; "gekozen": the ones you picked (public ids). */
  kuddesvideo: { mode: 'nieuwste' | 'gekozen'; videoIds: string[] }
  /** Achievements to show off (keys from shared/achievements.ts); none picked = the latest ones. */
  prestaties: { featured: string[]; showStats: boolean }
  /** `look`: the furniture; the bookcase is wood and the films a video store unless picked otherwise. */
  boeken: { books: Book[]; look?: ShelfLook }
  films: { movies: Movie[]; look?: ShelfLook }
  platen: { albums: Album[]; look?: ShelfLook }
  spellen: { games: ShelfGame[]; look?: ShelfLook }
  /** Your own recipes, the ones you found "lekker", or both (own ones first). */
  recepten: { show: 'eigen' | 'lekker' | 'beide'; count: number }
  /** `featured`: the big video (null = the most watched); highlights are picked, or the most watched or newest. */
  kanaal: { featured: string | null; show: 'populair' | 'nieuwste' | 'gekozen'; highlights: string[] }
  /**
   * SomaFM station ids, in order; `autoplay`: `autoplayStation` (or the first)
   * starts when someone opens the profile (visitors can turn that off).
   */
  radio: { channels: string[]; autoplay?: boolean; autoplayStation?: string }
  klok: { zone: ClockZone; label: string; style: 'analoog' | 'digitaal' }
  lijstje: { items: ListItem[]; numbered: boolean }
  /** ISO country codes (shared/countries.ts). */
  landen: { been: string[]; wish: string[] }
  links: { links: SiteLink[] }
  mariokart: {
    character: MkCharacter
    vehicle: MkVehicle
    /** Versus and battle rating, 1 to 9999 (0 = not filled in). */
    vr: number
    br: number
    friendCode: string
    track: string
    controller: MkController
    drift: 'handmatig' | 'automatisch'
    /** Still racing online, through Wiimmfi. */
    wiimmfi: boolean
  }
  tekst: { text: string; background: string; color: string; font: NameFont; align: 'links' | 'midden' }
  /** One of the owner's own photos. */
  foto: { photoId: number | null; caption: string; frame: 'polaroid' | 'lijst' | 'geen' }
  teller: { label: string; style: 'kilometer' | 'led' | 'klassiek' }
  citaat: { quote: string; author: string; style: 'krijtbord' | 'briefje' | 'neon' }
  drank: { drinks: Drink[]; look?: ShelfLook }
  series: { series: Series[]; look?: ShelfLook }
  /** `background` and `hat`: free ones, or ones bought with the pet's coins. */
  huisdier: { species: PetSpecies; name: string; color: string; background?: PetBackground; hat?: PetHat }
  /** Your posts (the thread they're in, with a bit of the text) or the threads you started. */
  forum: { show: 'berichten' | 'onderwerpen'; count: number; showStats: boolean }
  /** From your collection, your own uploads, or picked (glitter ids, from either). */
  plakboek: { source: 'verzameling' | 'uploads' | 'gekozen'; picked: number[]; paper: ScrapbookPaper }
  /** Game kinds to list (none = every game you played); `recent`: the last results too. */
  spelscores: { kinds: string[]; recent: boolean; style: 'scorebord' | 'simpel' }
  /** Your newest blogs; `featured`: one of yours shown big on top (null = none); `look`: a diary or a plain list. */
  blog: { count: number; featured: number | null; showStats: boolean; look: 'dagboek' | 'simpel' }
  /** Photos from the owner's photography page (/fotografie): the newest, the most liked, or one album. */
  fotografie: { show: 'nieuwste' | 'populair' | 'album'; albumId: number | null; count: number; look: 'wand' | 'strook' }
  /** Songs from /muziek: the owner's own (newest or most played), or the ones they liked. */
  kuddesmuziek: { show: 'nieuwste' | 'populair' | 'favorieten'; count: number; look: 'speler' | 'lijst' }
  /** The owner's own station, or the stations they follow. */
  kuddesradio: { show: 'mijn' | 'gevolgd' }
  /** Files from Tools to look at, in this order. */
  bestanden: { docIds: number[] }
  /** A calculator for visitors, or a graph of the owner's functions (`functions` as typed: "x^2 - 2"). */
  rekenmachine: { mode: 'rekenmachine' | 'grafiek'; functions: string[] }
  /**
   * Breathing along with a circle, a mantra, how the owner feels (with the last
   * two weeks of feelings in `log`) and what they're grateful for.
   * `mantras`: the owner's own (none = the built-in ones).
   */
  mindfulness: {
    parts: MindfulnessPart[]
    breath: BreathPattern
    color: MindfulnessColor
    mantras: string[]
    feeling: { mood: string; note: string; at: string } | null
    log: { mood: string; at: string }[]
    grateful: string[]
  }
}

/** Gadgets whose items visitors can give respect (a book, a film, a line in a list). */
export const RESPECT_GADGETS = ['boeken', 'films', 'platen', 'spellen', 'lijstje', 'drank', 'series'] as const satisfies readonly GadgetType[]
export type RespectGadget = (typeof RESPECT_GADGETS)[number]

export const LIMITS = {
  gadgets: 48,
  title: 60,
  notes: 12,
  noteText: 280,
  tracks: 30,
  videos: 5,
  trackTitle: 100,
  doneText: 120,
  question: 140,
  options: 6,
  option: 80,
  kuddesvideos: 10,
  featured: 8,
  books: 24,
  movies: 24,
  albums: 24,
  games: 24,
  coverTitle: 80,
  author: 60,
  coverNote: 200,
  highlights: 6,
  radioChannels: 12,
  clockLabel: 40,
  listItems: 10,
  listItem: 100,
  countries: 250,
  links: 12,
  linkTitle: 40,
  url: 300,
  text: 1500,
  photoCaption: 120,
  counterLabel: 40,
  quote: 280,
  quoteAuthor: 60,
  drinks: 24,
  series: 24,
  seasons: 50,
  petName: 30,
  forumItems: 10,
  scrapbook: 48,
  sharedDocs: 12,
  graphFunctions: 6,
  graphFunction: 100,
}

export const DEFAULT_CONFIG: GadgetConfig = {
  notities: { notes: [{ id: 'n1', text: 'Niet vergeten: iedereen een knuffel terugsturen! :lach:', color: 'geel' }] },
  muziek: { tracks: [] },
  video: { videos: [] },
  aftellen: { target: '', doneText: 'Het is zover!' },
  poll: { question: '', options: ['', ''], closed: false },
  kuddesvideo: { mode: 'nieuwste', videoIds: [] },
  prestaties: { featured: [], showStats: true },
  boeken: { books: [] },
  films: { movies: [] },
  platen: { albums: [] },
  spellen: { games: [] },
  recepten: { show: 'beide', count: 6 },
  kanaal: { featured: null, show: 'populair', highlights: [] },
  radio: { channels: RADIO_START },
  klok: { zone: 'Europe/Amsterdam', label: '', style: 'analoog' },
  lijstje: { items: [], numbered: true },
  landen: { been: ['NL'], wish: [] },
  links: { links: [] },
  mariokart: { character: 'mario', vehicle: 'standaardkart_m', vr: 5000, br: 5000, friendCode: '', track: 'Coconut Mall', controller: 'stuur', drift: 'handmatig', wiimmfi: false },
  tekst: { text: '', background: '#fffbe0', color: '#3a2a00', font: 'standaard', align: 'links' },
  foto: { photoId: null, caption: '', frame: 'polaroid' },
  teller: { label: 'bezoekers', style: 'kilometer' },
  citaat: { quote: '', author: '', style: 'krijtbord' },
  drank: { drinks: [] },
  series: { series: [] },
  huisdier: { species: 'kat', name: 'Pluisje', color: '#f0a04b' },
  forum: { show: 'berichten', count: 5, showStats: true },
  plakboek: { source: 'verzameling', picked: [], paper: 'roze' },
  spelscores: { kinds: [], recent: true, style: 'scorebord' },
  blog: { count: 5, featured: null, showStats: true, look: 'dagboek' },
  fotografie: { show: 'nieuwste', albumId: null, count: 9, look: 'wand' },
  kuddesmuziek: { show: 'nieuwste', count: 5, look: 'speler' },
  kuddesradio: { show: 'mijn' },
  bestanden: { docIds: [] },
  woord: { docId: null },
  rekenblad: { docId: null },
  presentatie: { docId: null },
  paint: { docId: null },
  mindmap: { docId: null },
  planner: { docId: null },
  formulier: { docId: null },
  kladblok: { docId: null },
  rekenmachine: { mode: 'rekenmachine', functions: ['x^2 - 2', '2sin(x)'] },
  mindfulness: { parts: ['adem', 'mantra', 'gevoel', 'dankbaar'], breath: 'vierkant', color: 'zee', mantras: [], feeling: null, log: [], grateful: [] },
}

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** The video id from any YouTube link (watch, youtu.be, shorts, embed, music) or a bare id. */
export function youtubeId(input: string): string | null {
  const text = input.trim()
  if (YOUTUBE_ID.test(text)) return text
  try {
    const url = new URL(text.startsWith('http') ? text : `https://${text}`)
    const host = url.hostname.replace(/^(www|m|music)\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0]
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1] ?? null
    }
    return id && YOUTUBE_ID.test(id) ? id : null
  } catch {
    return null
  }
}

export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
export const youtubeEmbed = (id: string, autoplay = true, origin?: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay ? '&autoplay=1' : ''}${origin ? `&enablejsapi=1&origin=${encodeURIComponent(origin)}` : ''}`

export type GadgetSlot = `gadget:${number}`
export const GADGET_SLOT = /^gadget:\d+$/
export const gadgetSlot = (id: number): GadgetSlot => `gadget:${id}`

/** In which order the music gadget plays its songs; "willekeurig" also starts on a random one each visit. */
export const MUSIC_ORDERS = { volgorde: 'Op volgorde', willekeurig: 'Willekeurig (shuffle)', omgekeerd: 'Nieuwste eerst' } as const
export type MusicOrder = keyof typeof MUSIC_ORDERS

// ------------------------------------------------------------ mindfulness

export const MINDFULNESS_PARTS = { adem: 'Ademhaling', mantra: 'Mantra', gevoel: 'Zo voel ik me', dankbaar: 'Dankbaar' } as const
export type MindfulnessPart = keyof typeof MINDFULNESS_PARTS

/** Breathing patterns: the steps and their seconds. */
export const BREATH_PATTERNS = {
  vierkant: { name: 'Vierkant (4-4-4-4)', hint: 'Rustig en gelijkmatig, goed tegen stress.', steps: [['in', 4], ['vast', 4], ['uit', 4], ['vast', 4]] },
  '478': { name: '4-7-8', hint: 'Lang uitademen: helpt om in slaap te vallen.', steps: [['in', 4], ['vast', 7], ['uit', 8]] },
  rustig: { name: 'Rustig (5-5)', hint: 'Even lang in als uit, zonder vasthouden.', steps: [['in', 5], ['uit', 5]] },
} as const satisfies Record<string, { name: string; hint: string; steps: readonly (readonly ['in' | 'vast' | 'uit', number])[] }>
export type BreathPattern = keyof typeof BREATH_PATTERNS

export const MINDFULNESS_COLORS = {
  zee: { name: 'Zee', a: '#5fb3d9', b: '#1f6f99' },
  bos: { name: 'Bos', a: '#7cc48a', b: '#2e7d4a' },
  avond: { name: 'Avondrood', a: '#f2a65a', b: '#c4507a' },
  lavendel: { name: 'Lavendel', a: '#b9a6ff', b: '#6d5bd0' },
} as const
export type MindfulnessColor = keyof typeof MINDFULNESS_COLORS

/** Mantras for who didn't write their own; one a day, the same for everyone. */
export const MANTRAS = [
  'Ik adem in rust, ik adem uit spanning.',
  'Dit moment is genoeg.',
  'Ik ben precies waar ik moet zijn.',
  'Het is oké om het rustig aan te doen.',
  'Ik mag fouten maken; zo leer ik.',
  'Ik doe wat ik kan, en dat is genoeg.',
  'Gedachten komen en gaan, als wolken.',
  'Ik ben lief voor mezelf.',
  'Stap voor stap kom ik er wel.',
  'Ik laat los wat ik niet kan veranderen.',
  'Vandaag kies ik voor rust.',
  'Mijn gevoelens mogen er zijn.',
  'Ik ben dankbaar voor wat er is.',
  'Ik hoef niet alles vandaag te doen.',
  'Elke ademhaling is een nieuw begin.',
  'Ik ben sterker dan ik denk.',
]

export const MINDFULNESS_LIMITS = { mantras: 10, mantra: 120, note: 80, grateful: 3, gratefulItem: 80, log: 14 }
