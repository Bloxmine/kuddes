/**
 * Automations (Beheer → Automatiseringen): "when this happens, and these
 * conditions hold, do these things". The things are what the admin can do by
 * hand (block, IP ban, rights, messages…) plus what bots can do. Every action
 * goes in the Logboek; the admin is never hit by one.
 */
import type { IpBanDuration, IpBanScope } from './ipBans'
import type { WatchPlace } from './bots'

/** `member`: there's a member it's about. `signup`: before the account exists (it can still be refused). */
export const AUTO_TRIGGERS = {
  online: { name: 'Lid komt online', hint: 'Iemand begint een nieuw bezoek aan Kuddes (na minstens 5 minuten niets gedaan te hebben), of komt terug na de tijd die je kiest.', member: true },
  inloggen: { name: 'Lid logt in', hint: 'Iemand logt in met gebruikersnaam en wachtwoord.', member: true },
  aanmelden: { name: 'Iemand wil een account maken', hint: 'Vóórdat het account bestaat: hier kun je de aanmelding nog weigeren.', member: false },
  aanmelding: { name: 'Nieuw account gemaakt', hint: 'Net aangemeld, nog niet bevestigd of goedgekeurd.', member: true },
  nieuw_lid: { name: 'Nieuw lid toegelaten', hint: 'Na het bevestigen van het e-mailadres, of na jouw goedkeuring.', member: true },
  geplaatst: { name: 'Lid plaatst iets', hint: 'Een WieWatWaar, knuffel, reactie, forumbericht… waar anderen het zien.', member: true },
  vriendschap: { name: 'Vriendschapsverzoek gestuurd', hint: 'Iemand stuurt een ander een vriendschapsverzoek.', member: true },
  dagelijks: { name: 'Elke dag', hint: 'Op een vaste tijd; met leden bij de voorwaarden gebeurt het voor elk van hen.', member: false },
} as const
export type AutoTrigger = keyof typeof AUTO_TRIGGERS

/** `member`: needs a member to act on. `text`: has a text. `from`: sent by a bot or by the admin. `punish`: never done to the admin. */
export const AUTO_ACTIONS = {
  weigeren: {
    name: 'Aanmelding weigeren',
    hint: 'Alleen bij “Iemand wil een account maken”: het account wordt niet gemaakt.',
    member: false,
    text: false,
    from: false,
    punish: false,
  },
  bericht: { name: 'Bericht sturen', hint: 'Een bericht naar het lid.', member: true, text: true, from: true, punish: false },
  knuffel: { name: 'Knuffel op hun profiel', hint: 'Van een bot.', member: true, text: true, from: true, punish: false },
  wiewatwaar: { name: 'WieWatWaar plaatsen', hint: 'Door een bot, voor iedereen.', member: false, text: true, from: true, punish: false },
  melding: { name: 'Melding voor mij', hint: 'Komt in Beheer → Meldingen.', member: false, text: true, from: false, punish: false },
  blokkeren: { name: 'Account blokkeren', hint: 'De tekst is de reden die het lid ziet.', member: true, text: true, from: false, punish: true },
  uitloggen: { name: 'Uitloggen', hint: 'Overal uitgelogd; inloggen kan daarna gewoon weer.', member: true, text: false, from: false, punish: true },
  ip_ban: { name: 'IP bannen', hint: 'Het laatste IP-adres van het lid.', member: true, text: false, from: false, punish: true },
  zwarte_lijst: { name: 'Op de zwarte lijst', hint: 'Blokkeren, en e-mailadres en gebruikersnaam op de zwarte lijst.', member: true, text: false, from: false, punish: true },
  rechten: { name: 'Rechten geven of afpakken', hint: 'Video, muziek of radio.', member: true, text: false, from: false, punish: false },
  goedkeuren: { name: 'Aanmelding goedkeuren', hint: 'Als het lid nog op de wachtlijst staat.', member: true, text: false, from: false, punish: false },
} as const
export type AutoActionKind = keyof typeof AUTO_ACTIONS

export const AUTO_RIGHTS = { video: 'Video uploaden', muziek: 'Muziek uploaden', radio: 'Radio maken' } as const
export type AutoRight = keyof typeof AUTO_RIGHTS

export type AutoAction = {
  kind: AutoActionKind
  text: string
  /** The bot that sends it; null: the admin (for messages). */
  from: number | null
  right: AutoRight
  grant: boolean
  duration: IpBanDuration
  scope: IpBanScope
}

export type AutoConditions = {
  /** Only these members (usernames); empty: everyone. */
  members: string[]
  /** One of these words (as the word list: * is anything, disguises are caught). */
  words: string[]
  /** Away for at least this many days (Lid komt online / logt in). */
  awayDays: number
  /** Account at least / at most this many days old (0: no limit). */
  minAgeDays: number
  maxAgeDays: number
  /** At most once per member, ever. */
  once: boolean
}

export type AutomationConfig = {
  name: string
  enabled: boolean
  trigger: AutoTrigger
  /** "HH:MM", for Elke dag */
  time: string
  /** Lid komt online: away at least this many minutes before it counts as coming back; 0: every new visit (after 5 minutes of nothing). */
  awayMinutes: number
  /** Lid plaatst iets: where (empty: everywhere). */
  places: WatchPlace[]
  conditions: AutoConditions
  actions: AutoAction[]
}

export type Automation = AutomationConfig & { id: number; runs: number; lastRunAt: string | null; lastError: string | null }

export const AUTO_LIMITS = { automations: 50, actions: 10, name: 60, text: 1000, words: 300, members: 100 }

/** In texts: replaced by the member it's about (and {tekst}: what they posted). */
export const AUTO_PLACEHOLDERS = { '{voornaam}': 'roepnaam', '{naam}': 'volledige naam', '{gebruikersnaam}': 'gebruikersnaam', '{tekst}': 'wat ze plaatsten' } as const

export const newAutoAction = (kind: AutoActionKind = 'bericht'): AutoAction => ({ kind, text: '', from: null, right: 'video', grant: true, duration: '7d', scope: 'aanmelden' })

export const newAutomation = (): AutomationConfig => ({
  name: 'Nieuwe automatisering',
  enabled: false,
  trigger: 'online',
  time: '09:00',
  awayMinutes: 30,
  places: [],
  conditions: { members: [], words: [], awayDays: 0, minAgeDays: 0, maxAgeDays: 0, once: false },
  actions: [newAutoAction('bericht')],
})
