/**
 * Kudde categories, like Hyves' "Netwerken": groups, spots, schools, studies,
 * companies, clubs and foundations. Places (spots, schools…) also have an address.
 */
export const KUDDE_CATEGORIES = {
  groepen: {
    name: 'Groepen',
    /** In the bar of categories on /kuddes: a short name and a line under it. */
    bar: { name: 'Groepen', hint: 'hobby & muziek' },
    singular: 'groep',
    icon: 'group',
    about: 'Groepen zijn Kuddes over alles wat je leuk vindt: je hobby, je favoriete band of die ene serie. Iedereen kan er een starten.',
    subcategories: ['Hobby & vrije tijd', 'Muziek', 'Sport', 'Games', 'Films & series', 'Humor', 'Overig'],
    place: false,
  },
  spots: {
    name: 'Spots',
    bar: { name: 'Spots', hint: 'cafés & clubs' },
    singular: 'spot',
    icon: 'drink',
    about: 'Spots zijn de Kuddes voor bezoekers van bars, restaurants & clubs. Word lid van je favoriete plek en zie wat er te doen is.',
    subcategories: ['Cafés & clubs', 'Restaurants', 'Entertainment & kunst', 'Winkels', 'Sport & recreatie', 'Overig'],
    place: true,
  },
  scholen: {
    name: 'Scholen',
    bar: { name: 'Scholen', hint: 'je oude klas' },
    singular: 'school',
    icon: 'book',
    about: 'Vind je (oud-)klasgenoten terug in de Kudde van je basisschool of middelbare school.',
    subcategories: ['Basisschool', 'Middelbare school', 'Overig'],
    place: true,
  },
  studie: {
    name: 'MBO/HBO/Universiteit',
    bar: { name: 'Studie', hint: 'mbo, hbo & uni' },
    singular: 'opleiding',
    icon: 'medal_gold_1',
    about: 'Kuddes voor studenten en alumni van MBO, HBO en universiteit, en voor studieverenigingen.',
    subcategories: ['MBO', 'HBO', 'Universiteit', 'Studievereniging'],
    place: true,
  },
  bedrijven: {
    name: 'Bedrijven',
    bar: { name: 'Bedrijven', hint: "collega's & werk" },
    singular: 'bedrijf',
    icon: 'user_suit',
    about: "Collega's en oud-collega's bij elkaar, van de bakker om de hoek tot de multinational.",
    subcategories: ['Horeca', 'Winkel', 'Kantoor', 'Zorg', 'Techniek & ICT', 'Overig'],
    place: true,
  },
  verenigingen: {
    name: 'Verenigingen',
    bar: { name: 'Verenigingen', hint: 'sport & scouting' },
    singular: 'vereniging',
    icon: 'sport_soccer',
    about: 'Sportclubs, muziekverenigingen, scouting en studentenverenigingen: plan samen trainingen, wedstrijden en feesten.',
    subcategories: ['Sport', 'Muziek & cultuur', 'Scouting', 'Studentenvereniging', 'Hobby', 'Overig'],
    place: true,
  },
  stichtingen: {
    name: 'Stichtingen',
    bar: { name: 'Stichtingen', hint: 'goede doelen' },
    singular: 'stichting',
    icon: 'heart',
    about: 'Goede doelen, buurthuizen en andere stichtingen: vrijwilligers, donateurs en iedereen die meehelpt bij elkaar.',
    subcategories: ['Goed doel', 'Zorg & welzijn', 'Natuur & dieren', 'Cultuur & erfgoed', 'Onderwijs', 'Buurt & wijk', 'Geloof & levensbeschouwing', 'Overig'],
    place: true,
  },
} as const

export type KuddeCategory = keyof typeof KUDDE_CATEGORIES

export const isKuddeCategory = (v: unknown): v is KuddeCategory => typeof v === 'string' && v in KUDDE_CATEGORIES

/** Open: anyone can join and see the events. Besloten: joining needs the owner's OK. */
export type KuddeVisibility = 'openbaar' | 'besloten'

export const EVENT_LIMITS = { title: 100, description: 2000, location: 120 }

/** More about a Kudde, filled in by its owner; every field is optional ('' = not shown). */
export type KuddeInfo = {
  /** What the group does. */
  activities: string
  /** When they meet ("elke vrijdag vanaf 20:00"). */
  when: string
  /** Opening hours, one line per day or group of days (places only). */
  hours: string
}
export const KUDDE_INFO_LIMITS = { activities: 1500, when: 120, hours: 400 }
export const EMPTY_KUDDE_INFO: KuddeInfo = { activities: '', when: '', hours: '' }

/**
 * What a beheerder of a Kudde may do. An owner may do everything (and also
 * chooses the beheerders and can delete the Kudde); a beheerder gets some of these.
 */
export const KUDDE_RIGHTS = {
  bewerken: { name: 'Kudde bewerken', hint: 'de gegevens en de foto' },
  pimpen: { name: 'Pimpen', hint: 'het design van de Kudde' },
  gadgets: { name: 'Gadgets', hint: 'toevoegen en instellen' },
  aanvragen: { name: 'Aanvragen', hint: 'nieuwe leden toelaten' },
  prikbord: { name: "Prikbord en foto's", hint: 'berichten en foto’s van anderen weghalen, vastpinnen' },
  namens: { name: 'Namens de Kudde', hint: 'op het prikbord en als WieWatWaar' },
} as const
export type KuddeRight = keyof typeof KUDDE_RIGHTS
export const KUDDE_RIGHT_KEYS = Object.keys(KUDDE_RIGHTS) as KuddeRight[]

export const KUDDE_PHOTO_LIMITS = { caption: 120, perKudde: 500 }

/** A link that opens a place on OpenStreetMap (in a new tab). */
export const mapHref = (place: string) => `https://www.openstreetmap.org/search?query=${encodeURIComponent(place)}`

/** Where a Kudde photo opens (its Foto's box with the photo big); also how it's written in a post. */
export const kuddePhotoHref = (slug: string, id: number) => `/kuddes/${slug}?foto=${id}`
