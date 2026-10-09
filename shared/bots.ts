/**
 * Bots (Beheer → Bots): accounts that do things by themselves, always shown
 * with a "Bot" label. A task bot follows rules ("when a new member joins,
 * put 'Welkom {voornaam}!' on their profile"); an AI bot asks a language
 * model in LM Studio what to do, with its instructions and the abilities it
 * may use (sent along as tools).
 */
import type { UserSummary } from './api'

export const BOT_KINDS = {
  taken: { name: 'Taken', hint: 'Doet vaste dingen op vaste momenten, met een tekst die jij schrijft.', icon: 'cog' },
  ai: { name: 'AI', hint: 'Laat een taalmodel in LM Studio bedenken wat hij zegt en doet, met jouw instructies.', icon: 'lightbulb' },
} as const
export type BotKind = keyof typeof BOT_KINDS

/** What a bot reacts to. `member`: there's a member it's about (the one who joined, wrote, …). */
export const BOT_TRIGGERS = {
  nieuw_lid: { name: 'Nieuw lid', hint: 'Iemand is net lid geworden (na het bevestigen van het e-mailadres, of na jouw goedkeuring).', member: true },
  verjaardag: { name: 'Verjaardag', hint: 'Een lid is vandaag jarig (om 9:00).', member: true },
  bericht: { name: 'Bericht ontvangen', hint: 'Iemand stuurt de bot een bericht.', member: true },
  knuffel: { name: 'Knuffel ontvangen', hint: 'Iemand zet een knuffel op het profiel van de bot.', member: true },
  vriendschap: { name: 'Vriendschapsverzoek', hint: 'Iemand wil vrienden worden met de bot (met “Automatisch accepteren” is het dan al geaccepteerd).', member: true },
  dagelijks: { name: 'Elke dag', hint: 'Op een vaste tijd.', member: false },
} as const
export type BotTrigger = keyof typeof BOT_TRIGGERS

/** What a task bot does. A knuffel or message goes to the member the trigger is about. */
export const BOT_ACTIONS = {
  knuffel: { name: 'Knuffel op hun profiel', member: true },
  bericht: { name: 'Bericht sturen', member: true },
  wiewatwaar: { name: 'WieWatWaar plaatsen', member: false },
  vriendschap: { name: 'Vriendschapsverzoek sturen', member: true },
} as const
export type BotAction = keyof typeof BOT_ACTIONS

/** What an AI bot may do: these go to the model as tools. */
export const BOT_ABILITIES = {
  bericht_sturen: { name: 'Berichten sturen', hint: 'Een bericht naar een lid sturen.' },
  knuffel_geven: { name: 'Knuffels geven', hint: 'Een knuffel op het profiel van een lid zetten.' },
  wiewatwaar_plaatsen: { name: 'WieWatWaars plaatsen', hint: 'Een WieWatWaar plaatsen, voor iedereen.' },
  vriendschap_sturen: { name: 'Vrienden worden', hint: 'Een lid een vriendschapsverzoek sturen, of dat van hen accepteren.' },
  lid_bekijken: { name: 'Profielen bekijken', hint: 'Naam, woonplaats en “over mij” van een lid lezen: wat elk lid ook ziet.' },
  nieuws_lezen: { name: 'Nieuws lezen', hint: 'De nieuwste berichten van Kuddes lezen.' },
} as const
export type BotAbility = keyof typeof BOT_ABILITIES

/** In a task bot's text: replaced by the member it's about. */
export const BOT_PLACEHOLDERS = { '{voornaam}': 'roepnaam', '{naam}': 'volledige naam', '{gebruikersnaam}': 'gebruikersnaam' } as const

export const BOT_LIMITS = {
  rules: 20,
  text: 1000,
  instructions: 4000,
  model: 120,
  /** Things one bot may do per hour, so a mistake can't flood the site. */
  actionsPerHour: 60,
}

export type BotRule = {
  id: string
  trigger: BotTrigger
  action: BotAction
  text: string
  /** "HH:MM", for "Elke dag" */
  time: string
  enabled: boolean
}

/** How a bot behaves, whichever kind it is. */
export type BotOptions = {
  /** Accept friend requests straight away (and the ones already waiting, when saved). */
  acceptFriends: boolean
  /** Mark messages to the bot as read, so its inbox doesn't fill up. */
  readMessages: boolean
  /** The bot's own privacy settings: everyone may send it knuffels and messages. */
  openToAll: boolean
  /** Wait this long before reacting, so it doesn't feel instant. */
  delaySeconds: number
  /** At most this many actions an hour (up to BOT_LIMITS.actionsPerHour). */
  maxPerHour: number
}

export const DEFAULT_BOT_OPTIONS: BotOptions = { acceptFriends: true, readMessages: true, openToAll: true, delaySeconds: 0, maxPerHour: 30 }
export const BOT_DELAYS = [0, 5, 30, 60, 300, 900] as const

// ---------------------------------------------------------------- toezicht (moderation)

/** Where the bot keeps watch: places others can see. Private messages are never read. */
export const WATCH_PLACES = {
  wiewatwaar: 'WieWatWaars',
  knuffel: 'Knuffels',
  reactie: 'Reacties op de tijdlijn',
  forum: 'Forumberichten',
  kudde: 'Berichten in Kuddes',
  foto: 'Reacties op foto’s',
  video: 'Reacties op video’s',
  blog: 'Blogs',
} as const
export type WatchPlace = keyof typeof WATCH_PLACES
/** Where the bot can also take a post away itself. */
export const REMOVABLE_PLACES: readonly WatchPlace[] = ['wiewatwaar', 'knuffel', 'reactie']

/** Behaviour a bot can notice. `count`/`minutes`: the numbers the admin sets, when there are any. */
export const BEHAVIOURS = {
  flood: {
    name: 'Heel veel plaatsen',
    told: 'je plaatste heel veel berichten in korte tijd',
    hint: 'Meer dan {count} berichten binnen {minutes} minuten.',
    count: true,
    minutes: true,
  },
  herhaling: {
    name: 'Steeds hetzelfde',
    told: 'je plaatste steeds hetzelfde bericht',
    hint: 'Dezelfde tekst {count} keer of vaker binnen {minutes} minuten (kopiëren en plakken).',
    count: true,
    minutes: true,
  },
  links: { name: 'Veel links', told: 'je bericht had heel veel links', hint: '{count} of meer links in één bericht.', count: true, minutes: false },
  hoofdletters: {
    name: 'Schreeuwen',
    told: 'je schreef bijna alles in hoofdletters',
    hint: 'Een bericht (vanaf 20 letters) bijna helemaal in hoofdletters.',
    count: false,
    minutes: false,
  },
  vriendverzoeken: {
    name: 'Veel vriendschapsverzoeken',
    told: 'je stuurde heel veel vriendschapsverzoeken in korte tijd',
    hint: '{count} of meer verzoeken binnen {minutes} minuten.',
    count: true,
    minutes: true,
  },
} as const
export type Behaviour = keyof typeof BEHAVIOURS
export type BehaviourRule = { on: boolean; count: number; minutes: number }

export type BotModeration = {
  enabled: boolean
  /** One per line in Beheer; * is anything ("kut*"). */
  words: string[]
  places: WatchPlace[]
  behaviours: Record<Behaviour, BehaviourRule>
  /** What happens on a word: a warning, taking the post away (where possible), a melding for the admin. */
  onWord: { warn: boolean; remove: boolean; report: boolean }
  onBehaviour: { warn: boolean; report: boolean }
  /** The warning, with {voornaam}, {reden} and {waar}. */
  warning: string
  /** A melding when a member reaches this many warnings in 30 days (0: never). */
  reportAfter: number
}

export const MODERATION_LIMITS = { words: 300, word: 60, warning: 1000, count: 100, minutes: 1440 }

export const DEFAULT_MODERATION: BotModeration = {
  enabled: false,
  words: [],
  places: ['wiewatwaar', 'knuffel', 'reactie', 'forum', 'kudde', 'foto', 'video', 'blog'],
  behaviours: {
    flood: { on: true, count: 15, minutes: 5 },
    herhaling: { on: true, count: 4, minutes: 10 },
    links: { on: false, count: 4, minutes: 0 },
    hoofdletters: { on: false, count: 0, minutes: 0 },
    vriendverzoeken: { on: true, count: 30, minutes: 10 },
  },
  onWord: { warn: true, remove: false, report: true },
  onBehaviour: { warn: true, report: false },
  warning: 'Hoi {voornaam}, even een seintje van Kuddes: {reden} ({waar}). Houd het gezellig voor iedereen, anders kijkt de beheerder ernaar.',
  reportAfter: 3,
}

/** A warning a bot gave, for Beheer. */
export type BotWarning = { id: number; bot: string; user: { username: string; nickname: string }; reason: string; detail: string; place: string; createdAt: string }

export type BotSettings = {
  kind: BotKind
  enabled: boolean
  options: BotOptions
  moderation: BotModeration
  /** Task bot */
  rules: BotRule[]
  /** AI bot */
  instructions: string
  /** Empty: the model set for LM Studio */
  model: string
  triggers: BotTrigger[]
  abilities: BotAbility[]
  /** "HH:MM", when "Elke dag" is on */
  dailyAt: string
}

export type AdminBot = BotSettings & {
  user: UserSummary
  runs: number
  lastRunAt: string | null
  lastError: string | null
}

/** Where LM Studio is (its OpenAI-compatible server, e.g. http://192.168.1.20:1234). */
export type LmStudioSettings = { url: string; apiKey: string; model: string }
