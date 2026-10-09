/**
 * Bejeweled 3 (the HTML5 port in games/bejeweled/, served at /bejeweled/):
 * its game modes and its badges, which are also achievements on Kuddes.
 * The badges here must match BADGES in games/bejeweled/web/js/badges.js.
 */

export const BEJEWELED_MODES = {
  classic: 'Classic',
  zen: 'Zen',
  lightning: 'Lightning',
  butterflies: 'Butterflies',
  mine: 'Diamond Mine',
  icestorm: 'Ice Storm',
  poker: 'Poker',
} as const

export type BejeweledMode = keyof typeof BEJEWELED_MODES
export const BEJEWELED_MODE_KEYS = Object.keys(BEJEWELED_MODES) as BejeweledMode[]
export const isBejeweledMode = (v: unknown): v is BejeweledMode => typeof v === 'string' && v in BEJEWELED_MODES

/**
 * kind 'total': counts add up over all games; 'best': the best single value;
 * 'once': earned or not (Levelord: the level you reached). `levels`: bronze,
 * silver, gold and platinum (one value for 'once').
 */
export type BejeweledBadgeDef = { name: string; kind: 'total' | 'best' | 'once'; levels: readonly number[] }

// The badges of the modes the port has (Quest isn't there)
export const BEJEWELED_BADGES = {
  inferno: { name: 'Inferno', kind: 'total', levels: [50, 400, 1400, 3400] },
  stellar: { name: 'Stellar', kind: 'total', levels: [25, 150, 550, 1300] },
  chromatic: { name: 'Chromatic', kind: 'total', levels: [25, 150, 550, 1300] },
  blaster: { name: 'Blaster', kind: 'best', levels: [30, 40, 50, 60] },
  bejeweler: { name: 'Bejeweler', kind: 'best', levels: [50000, 150000, 300000, 500000] },
  finalfrenzy: { name: 'Final Frenzy', kind: 'best', levels: [20000, 30000, 40000, 60000] },
  highvoltage: { name: 'High Voltage', kind: 'best', levels: [100000, 300000, 500000, 750000] },
  anteup: { name: 'Ante Up', kind: 'best', levels: [100000, 300000, 500000, 750000] },
  gambler: { name: 'The Gambler', kind: 'total', levels: [10, 30, 60, 100] },
  glacial: { name: 'Glacial Explorer', kind: 'best', levels: [100000, 300000, 500000, 750000] },
  icebreaker: { name: 'Ice Breaker', kind: 'best', levels: [5, 8, 12, 15] },
  diamondmine: { name: 'Diamond Mine', kind: 'best', levels: [100000, 300000, 500000, 750000] },
  relichunter: { name: 'Relic Hunter', kind: 'best', levels: [5, 8, 12, 15] },
  monarch: { name: 'Butterfly Monarch', kind: 'best', levels: [100000, 300000, 500000, 750000] },
  bonanza: { name: 'Butterfly Bonanza', kind: 'best', levels: [4, 6, 8, 10] },
  annihilator: { name: 'Annihilator', kind: 'once', levels: [1] },
  superstar: { name: 'Superstar', kind: 'once', levels: [1] },
  levelord: { name: 'Levelord', kind: 'once', levels: [10] },
} as const satisfies Record<string, BejeweledBadgeDef>

export type BejeweledBadge = keyof typeof BEJEWELED_BADGES
export const BEJEWELED_BADGE_KEYS = Object.keys(BEJEWELED_BADGES) as BejeweledBadge[]

/** How far you are with each badge: the count (or best value) and the level reached (0 = none yet). */
export type BejeweledBadgeState = { value: number; level: number }

/** The level a value reaches: 0 to 4 (bronze to platinum), or 0/1 for a 'once' badge. */
export function badgeLevel(key: BejeweledBadge, value: number): number {
  const levels: readonly number[] = BEJEWELED_BADGES[key].levels
  let level = 0
  while (level < levels.length && value >= levels[level]) level++
  return level
}

/** What the game gets from /api/bejeweled when it runs on Kuddes. */
export type BejeweledProgress = {
  /** null when nobody is logged in: then the game keeps everything in the browser. */
  userId: number | null
  badges: Partial<Record<BejeweledBadge, BejeweledBadgeState>>
  bests: Partial<Record<BejeweledMode, { score: number; level: number }>>
}
