/**
 * Memory: 18 pairs face down. On your turn you turn two cards; a pair is
 * yours and you go again, otherwise they're shown to both players and turned
 * back, and it's the other one's turn. Most pairs wins.
 */
import { NotAllowed, other, shuffle, type Player, type Referee } from './referee'

/** The pictures: Farm-Fresh icons, one per pair. */
export const MEMORY_FACES = [
  'heart',
  'star',
  'cake',
  'coins',
  'rosette',
  'bomb',
  'brain',
  'camera',
  'clock',
  'cup',
  'drink',
  'film',
  'house',
  'lightbulb',
  'music',
  'paintcan',
  'rainbow',
  'ruby',
  'world',
  'television',
  'key',
  'bell',
  'apple',
  'flower',
  'hamburger',
  'pizza',
  'umbrella',
  'diamond',
] as const

export const PAIRS = 18

export type MemoryState = {
  /** The picture on each card (an index into MEMORY_FACES). */
  faces: number[]
  /** Who found each card's pair. */
  owner: (Player | null)[]
  /** The cards turned this turn (0 or 1). */
  open: number[]
  /** The last two that didn't match: shown until the next card is turned. */
  miss: [number, number] | null
  turn: Player
  pairs: [number, number]
  /** Pairs in a row this turn, and the most ever per player. */
  streak: number
  bestStreak: [number, number]
  over: boolean
  /** Every card turned, in order: [player, card]. */
  log: [Player, number][]
}

export type MemoryCard = { face: number | null; owner: Player | null; open: boolean; miss: boolean }

export type MemoryView = {
  you: Player
  turn: Player
  cards: MemoryCard[]
  pairs: [number, number]
  over: boolean
  /** How many cards were turned so far, to notice a new one. */
  turned: number
}

export const memory: Referee<MemoryState, MemoryView> = {
  maxPlayers: 2,

  start(_count, first, random) {
    const pictures = shuffle(
      MEMORY_FACES.map((_, i) => i),
      random,
    ).slice(0, PAIRS)
    const faces = shuffle([...pictures, ...pictures], random)
    return { faces, owner: faces.map(() => null), open: [], miss: null, turn: first as 0 | 1, pairs: [0, 0], streak: 0, bestStreak: [0, 0], over: false, log: [] }
  },

  view(s, you, done) {
    return {
      you,
      turn: s.turn,
      cards: s.faces.map((face, i) => {
        const open = s.open.includes(i)
        const miss = !!s.miss?.includes(i)
        const visible = done || s.owner[i] !== null || open || miss
        return { face: visible ? face : null, owner: s.owner[i], open, miss }
      }),
      pairs: s.pairs,
      over: s.over,
      turned: s.log.length,
    }
  },

  act(s, you, action) {
    if (s.over) throw new NotAllowed('Het spel is al uit.')
    if (s.turn !== you) throw new NotAllowed('Je bent niet aan de beurt.')
    const i = (action as { flip?: unknown })?.flip
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= s.faces.length) throw new NotAllowed('Die kaart bestaat niet.')
    const card = i as number
    if (s.owner[card] !== null || s.open.includes(card)) throw new NotAllowed('Die kaart ligt al open.')
    const next: MemoryState = { ...s, owner: [...s.owner], open: [...s.open, card], miss: null, pairs: [...s.pairs], bestStreak: [...s.bestStreak], log: [...s.log, [you, card]] }
    if (next.open.length < 2) return next
    const [a, b] = next.open
    next.open = []
    if (s.faces[a] === s.faces[b]) {
      next.owner[a] = next.owner[b] = you
      next.pairs[you]++
      next.streak = s.streak + 1
      next.bestStreak[you] = Math.max(next.bestStreak[you], next.streak)
      next.over = next.owner.every((o) => o !== null)
    } else {
      next.miss = [a, b]
      next.turn = other(you)
      next.streak = 0
    }
    return next
  },

  // Games of two end through the server when someone leaves; nothing to do here
  drop(s) {
    return s
  },

  outcome(s) {
    const [a, b] = s.pairs
    return {
      over: s.over,
      winner: !s.over || a === b ? null : a > b ? 0 : 1,
      scores: [a, b],
      highlights: { 0: { pairs: a, streak: s.bestStreak[0] }, 1: { pairs: b, streak: s.bestStreak[1] } },
    }
  },
}
