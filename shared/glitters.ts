/** Glitterplaatjes (/glitterplaatjes): animated pictures to send with a knuffel. */
import type { UserSummary } from './api'

/**
 * The categories (tags), in the order of the bar on /glitterplaatjes. The
 * keys are stored with each plaatje (and used in links), so keep them; the
 * names and hints can change. A plaatje can have up to GLITTER_LIMITS.tags.
 */
export const GLITTER_CATEGORIES = {
  liefde: { name: 'Liefde', hint: 'hartjes & kusjes', icon: 'heart' },
  vriendschap: { name: 'Vriendschap', hint: 'voor je BFF', icon: 'group' },
  knuffels: { name: 'Knuffels', hint: 'een dikke knuffel', icon: 'teddy_bear' },
  groeten: { name: 'Groetjes', hint: 'hoi & doei', icon: 'email_go' },
  goedemorgen: { name: 'Dag & nacht', hint: 'slaap lekker!', icon: 'weather_moon_cloudy' },
  weekend: { name: 'Weekend', hint: 'eindelijk vrijdag!', icon: 'drink' },
  feest: { name: 'Verjaardag', hint: 'gefeliciteerd!', icon: 'cake' },
  beterschap: { name: 'Sterkte', hint: 'en beterschap', icon: 'flower' },
  bedankt: { name: 'Dankjewel', hint: 'en complimentjes', icon: 'thumb_up' },
  humor: { name: 'Lachen', hint: 'flauw & grappig', icon: 'emotion_happy' },
  reacties: { name: 'Reacties', hint: 'lol, omg, wauw', icon: 'comment' },
  feestdagen: { name: 'Feestdagen', hint: 'kerst, Pasen, Sint', icon: 'christmas_tree' },
  seizoenen: { name: 'Seizoenen', hint: 'lente tot winter', icon: 'tree_yellow' },
  dieren: { name: 'Dieren', hint: 'schattig & pluizig', icon: 'cat' },
  bling: { name: 'Bling', hint: 'glitter & sterren', icon: 'diamond' },
  namen: { name: 'Namen', hint: 'letters & namen', icon: 'font' },
  lekker: { name: 'Lekker', hint: 'eten & snoep', icon: 'icecream' },
  hobby: { name: "Hobby's", hint: 'sport & muziek', icon: 'sport_soccer' },
  spreuken: { name: 'Spreuken', hint: 'wijze woorden', icon: 'note' },
  overig: { name: 'Overig', hint: 'van alles wat', icon: 'rainbow' },
} as const satisfies Record<string, { name: string; hint: string; icon: string }>

export type GlitterCategory = keyof typeof GLITTER_CATEGORIES
export const isGlitterCategory = (v: unknown): v is GlitterCategory => typeof v === 'string' && v in GLITTER_CATEGORIES

export const GLITTER_LIMITS = {
  /** Largest file accepted; it's converted to a much smaller animated WebP. */
  bytes: 4 * 1024 * 1024,
  /** Longest side after conversion. */
  side: 400,
  title: 60,
  /** Tags per plaatje (an animal for the weekend is both). */
  tags: 4,
  perPage: 16,
}

export type Glitter = {
  id: number
  title: string
  /** One or more tags, the first is the main one. */
  categories: GlitterCategory[]
  url: string
  width: number
  height: number
  /** How often it was sent with a knuffel. */
  uses: number
  user: UserSummary
  /** In your own collection. */
  collected: boolean
  canDelete: boolean
  createdAt: string
}

/** A glitterplaatje as it appears in a knuffel. */
export type GlitterImage = { id: number; title: string; url: string; width: number; height: number }

export type GlitterList = {
  items: Glitter[]
  total: number
  page: number
  pages: number
  /** Per category, for the bar of categories (a plaatje counts in each of its tags). */
  counts: Record<GlitterCategory | 'alles', number>
}
