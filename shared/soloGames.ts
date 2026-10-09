/**
 * Games you play on your own, in your browser: Patience (Klondike), Bellen
 * schieten (like the classic flash Bubble Shooter), Mahjong and Bejeweled 3
 * (shared/bejeweled.ts). A finished game is sent to Kuddes for your best
 * score, the high-score list and the achievements. Bejeweled keeps them per
 * game mode: its scores are stored as kind "bejeweled.<mode>".
 */
import type { UserSummary } from './api'

export const SOLO_GAMES = {
  patience: {
    name: 'Patience',
    tagline: 'Het kaartspel voor als je even niets te doen hebt',
    description: 'Klondike, zoals op de computer van vroeger: bouw vier stapels van aas tot heer, per kleur. Leg kaarten om en om rood en zwart aflopend op de tafel. Met één of drie kaarten tegelijk van de stapel.',
    icon: 'playing_cards',
    /** Scores above this can't be real. */
    maxScore: 20_000,
  },
  bellen: {
    name: 'Bellen schieten',
    tagline: 'Drie op een rij, en plop!',
    description: 'Schiet bellen omhoog: drie of meer van dezelfde kleur tegen elkaar knallen uit elkaar, en alles wat dan los hangt valt naar beneden. Mis je te vaak, dan zakt het plafond. Hoe ver kom jij?',
    icon: 'rainbow',
    maxScore: 10_000_000,
  },
  mahjong: {
    name: 'Mahjong',
    tagline: 'Zoek de paren, van boven naar beneden',
    description: 'De schildpad van 144 stenen: haal steeds twee gelijke stenen weg die vrij liggen (niets erop, en links of rechts niets ernaast). Elke bloem past bij elke bloem, elk seizoen bij elk seizoen. Ruim de hele stapel op!',
    icon: 'diamond',
    maxScore: 100_000,
  },
  mijnenveger: {
    name: 'Mijnenveger',
    tagline: 'Vind de mijnen zonder dat het boem zegt',
    description: 'De mijnenveger van de computer van vroeger: open de vakjes zonder op een mijn te klikken. Een getal zegt hoeveel mijnen eromheen liggen; zet er een vlag op als je het zeker weet. Beginner, Gemiddeld of Expert: hoe sneller je klaar bent, hoe meer punten.',
    icon: 'bomb',
    maxScore: 10_000,
  },
  bejeweled: {
    name: 'Bejeweled',
    tagline: 'Drie op een rij, met vuur, sterren en hyperkubussen',
    description: 'Wissel juwelen om tot er drie of meer op een rij liggen. Speel Classic, Zen, Lightning, Butterflies, Diamond Mine of Ice Storm, verdien de badges van het spel (ze zijn ook prestaties op Kuddes) en strijd per spelsoort om de hoogste score.',
    icon: 'ruby',
    // Ice Storm and Zen can go on for a long time
    maxScore: 2_000_000_000,
  },
} as const satisfies Record<string, { name: string; tagline: string; description: string; icon: string; maxScore: number }>

export type SoloKind = keyof typeof SOLO_GAMES
export const SOLO_KINDS = Object.keys(SOLO_GAMES) as SoloKind[]
export const isSoloKind = (v: unknown): v is SoloKind => typeof v === 'string' && v in SOLO_GAMES

/** `mode`: the game mode, for games that have them (Bejeweled). */
export type SoloResult = { score: number; won: boolean; details: Record<string, number>; mode?: string }

export type SoloOverview = {
  /** Yours (when logged in). */
  best: number | null
  played: number
  won: number
  /** The best score of each member, highest first. */
  top: { user: UserSummary; score: number; at: string }[]
}

export const soloHref = (kind: SoloKind) => `/spellen/alleen/${kind}`
