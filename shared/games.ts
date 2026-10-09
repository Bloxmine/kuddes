/** Kuddes Spellen: the games hub (/spellen). Games are played peer to peer (WebRTC). */
import type { UserSummary } from './api'

export const GAMES = {
  mancala: {
    name: 'Mancala',
    tagline: 'Het eeuwenoude bonenspel',
    description:
      'Zaai je knikkers rond het bord en verzamel er zoveel mogelijk in je eigen pot. Eindig in je pot en je mag nog een keer; eindig in een leeg kuiltje aan jouw kant en je pikt de knikkers van de overkant in.',
    icon: 'coins',
    players: 2,
    /** p2p: played browser to browser; server: the server referees (hidden fleets or answers). */
    mode: 'p2p',
  },
  vieropeenrij: {
    name: 'Vier op een rij',
    tagline: 'Laat je stenen vallen',
    description: 'Om de beurt laat je een steen in een kolom vallen. Wie als eerste vier op een rij heeft (recht, of schuin), wint!',
    icon: 'rosette',
    players: 2,
    mode: 'p2p',
  },
  zeeslag: {
    name: 'Zeeslag',
    tagline: 'Zoek en vernietig de vloot',
    description: 'Verstop je vijf schepen en schiet om de beurt op het bord van je tegenstander. Raak? Dan mag je nog een keer. Wie als eerste alle schepen laat zinken, wint.',
    icon: 'bomb',
    players: 2,
    mode: 'server',
  },
  dammen: {
    name: 'Dammen',
    tagline: 'Het echte Nederlandse damspel',
    description: 'Internationaal dammen op een bord van 10×10: slaan is verplicht (zoveel mogelijk!), stukken slaan ook achteruit en een dam mag ver vliegen.',
    icon: 'checkerboard',
    players: 2,
    mode: 'p2p',
  },
  spray: {
    name: 'Graffitimuur',
    tagline: 'Spuit samen een muur vol',
    description:
      'Pak een spuitbus en maak de muur mooi: druipende verf, glitter, goud en chroom, en geheime bussen voor wie alles heeft geprobeerd. Nodig een vriend uit en spuit samen op dezelfde muur, of speel alleen.',
    icon: 'paintcan',
    players: 4,
    mode: 'p2p',
  },
  quiz: {
    name: 'Kuddes Quiz',
    tagline: 'Wie weet het meest?',
    description: 'Tien vragen over van alles, tegelijk voor iedereen: met z’n tweeën of met tot vier vrienden. Goed antwoord? Punten! Hoe sneller je bent, hoe meer punten.',
    icon: 'brain',
    players: 4,
    mode: 'server',
  },
  schaken: {
    name: 'Schaken',
    tagline: 'Het koningsspel',
    description: 'Echt schaken, met rokeren, en passant en promotie. Zet de koning van je tegenstander schaakmat; pat, herhaling of te weinig stukken is remise.',
    icon: 'chess_horse',
    players: 2,
    mode: 'p2p',
  },
  pool: {
    name: 'Pool',
    tagline: 'Acht-ball in de kroeg',
    description: 'Mik, kies je kracht en stoot. Pot al je volle of halve ballen en daarna de zwarte 8. Liever 9-ball? Die kies je bij het uitdagen.',
    icon: 'sport_8ball',
    players: 2,
    mode: 'p2p',
  },
  pool9: {
    name: '9-ball',
    tagline: 'Pool met negen ballen',
    description: 'Raak altijd eerst de laagste bal op tafel. Wie de 9 pot, wint.',
    icon: 'sport_8ball',
    players: 2,
    mode: 'p2p',
    variantOf: 'pool',
  },
  mastermind: {
    name: 'Mastermind',
    tagline: 'Kraak de geheime code',
    description: 'De een verstopt een rij gekleurde pinnen, de ander raadt. Na elke poging zie je hoeveel kleuren goed staan en hoeveel er alleen goed zijn. Klassiek met 6 kleuren, of modern met 8 (kies je bij het uitdagen). Elke keer ruilen jullie van rol.',
    icon: 'color_swatch',
    players: 2,
    mode: 'server',
  },
  mastermind8: {
    name: 'Mastermind modern',
    tagline: 'Acht kleuren, vijf pinnen',
    description: 'Zoals de Super Mastermind: 8 kleuren, 5 pinnen en 12 pogingen.',
    icon: 'color_swatch',
    players: 2,
    mode: 'server',
    variantOf: 'mastermind',
  },
  poker: {
    name: 'Poker',
    tagline: "Texas Hold'em met je vrienden",
    description: 'Twee kaarten in je hand, vijf op tafel. Check, call, verhoog of pas: wie de beste vijf kaarten heeft (of blijft bluffen) wint de pot. Iedereen begint met 1000 fiches, de blinds gaan steeds omhoog, en wie alle fiches heeft, wint.',
    icon: 'poker',
    players: 4,
    mode: 'server',
  },
  memory: {
    name: 'Memory',
    tagline: 'Wie onthoudt het best?',
    description: 'Draai om de beurt twee kaarten om. Een paar? Dan is het van jou en mag je nog een keer. Wie de meeste paren vindt, wint.',
    icon: 'images',
    players: 2,
    mode: 'server',
  },
  stapelgek: {
    name: 'Stapelgek',
    tagline: 'Van 1 tot 12, en snel!',
    description: 'Bouw samen stapels op van 1 tot en met 12, met kaarten uit je hand, van je afleggers en van je eigen stapel. Wie als eerste zijn stapel kwijt is, wint.',
    icon: 'note',
    players: 4,
    mode: 'server',
  },
  kleurwissel: {
    name: 'Kleurwissel',
    tagline: 'Kleur of getal, en roep op tijd!',
    description: 'Leg een kaart van dezelfde kleur of hetzelfde getal, of wissel van kleur. Pesten met +2 en +4 mag. Wie als eerste geen kaarten meer heeft, wint.',
    icon: 'color_wheel',
    players: 4,
    mode: 'server',
  },
  yacht: {
    name: 'Yacht Dice',
    tagline: 'Vijf dobbelstenen, dertien beurten',
    description: 'Gooi tot drie keer per beurt en houd vast wat je wilt. Vul je scoreblad met drie gelijke, een full house, straten en natuurlijk: een Yacht, vijf dezelfde! Met z’n tweeën of met tot vier vrienden.',
    icon: 'dice',
    players: 4,
    mode: 'server',
  },
} as const satisfies Record<string, { name: string; tagline: string; description: string; icon: string; /** Most players in one game (with you). */ players: number; mode: 'p2p' | 'server'; variantOf?: string }>

/** The games that get their own card on /spellen (variants are picked on their main game's card). */
export const MAIN_GAMES = (Object.keys(GAMES) as (keyof typeof GAMES)[]).filter((k) => !('variantOf' in GAMES[k]))

export type GameKind = keyof typeof GAMES
export const isGameKind = (v: unknown): v is GameKind => typeof v === 'string' && v in GAMES

export type GameStatus = 'uitgenodigd' | 'bezig' | 'klaar' | 'geweigerd' | 'geannuleerd' | 'afgebroken'
/** How a finished game ended. */
export type GameEnd = 'uitgespeeld' | 'opgegeven' | 'verlaten'

/** Someone in a game: their seat (0 invited the others), and whether they're in. */
export type GamePlayer = { user: UserSummary; seat: number; status: 'uitgenodigd' | 'meedoen' | 'geweigerd' | 'weg'; score: number }

export type GameSummary = {
  id: number
  kind: GameKind
  status: GameStatus
  host: UserSummary
  guest: UserSummary
  /** Which side you are, if you play in it (games of two). */
  you: 'host' | 'guest' | null
  /** Everyone invited, in seat order; games of two have just the host and the guest. */
  players: GamePlayer[]
  /** Your seat, if you're in it. */
  seat: number | null
  /** Who won (any game; `winner` says the same for games of two). */
  winnerId: number | null
  /** 0 = the host, 1 = the guest (see shared/mancala.ts). */
  first: 0 | 1
  winner: 'host' | 'guest' | 'gelijk' | null
  hostScore: number
  guestScore: number
  endReason: GameEnd | null
  /** The whole game, once it's finished (for the final board). */
  moves: unknown[]
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export type GameStats = {
  played: number
  won: number
  lost: number
  drawn: number
  /** Wins in a row right now, and the most ever. */
  streak: number
  bestStreak: number
  bestScore: number
  opponents: number
}

/**
 * A peer-to-peer message: WebRTC setup, or (over the data channel or through
 * the server) the game itself. Through the server, `from` says who sent it;
 * `to` sends it to one player only (games with more than two).
 */
export type GameSignal = { from?: number; to?: number } & (
  | { kind: 'offer' | 'answer'; data: { type: 'offer' | 'answer'; sdp: string } }
  | { kind: 'ice'; data: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null }
  | { kind: 'move'; data: { move: unknown; n: number } }
  | { kind: 'sync'; data: { moves: unknown[] } }
  | { kind: 'emote'; data: { emote: string } }
  /** The graffiti wall's own messages (strokes, cursors, the wall), passed through as they are. */
  | { kind: 'spray'; data: unknown }
)

/** Hyves smileys you can send your opponent during a game. */
export const GAME_EMOTES = ['byebye', 'lach', 'lol', 'clap', 'cheer', 'shock', 'blink', 'cry'] as const

export const GAME_LIMITS = {
  /** Open invites you can have out at once. */
  openInvites: 5,
  /** A game nobody moves in any more is stopped after this long. */
  staleHours: 24,
  /** How long your opponent must be gone before you can claim the win. */
  forfeitSeconds: 45,
}
