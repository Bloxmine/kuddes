/**
 * Stapelgek, for 2 to 4 players: get rid of your stock pile first. In the middle are four
 * building piles that go up from 1 to 12 (a full pile is cleared away); you
 * play onto them from your hand, the top of your stock pile or the top of one
 * of your four discard piles. Jokers count as any number. Your turn ends when
 * you put a card from your hand on one of your discard piles.
 *
 * Cards: twelve of each number 1–12 and 18 jokers (0). Everyone starts with
 * a stock pile (20 cards with two players, fewer with more so a game doesn't
 * drag on) and 5 cards in their hand, and fills up to 5 at the start of each
 * turn (and whenever the hand is empty during the turn).
 */
import { NotAllowed, nextSeat, shuffle, type Player, type Referee } from './referee'

export const JOKER = 0
/** Cards on each stock pile, by number of players. */
export const stockSize = (players: number) => (players <= 2 ? 20 : players === 3 ? 16 : 14)
export const HAND_SIZE = 5

export type StapelState = {
  draw: number[]
  /** Cards from finished building piles, shuffled back in when the draw pile runs out. */
  cleared: number[]
  /** The building piles: the cards on them (only the count matters for what comes next). */
  build: number[][]
  stock: number[][]
  hands: number[][]
  discards: number[][][]
  /** Who gave up or left: their turns are skipped. */
  out: boolean[]
  /** How big the stock piles started. */
  stockStart: number
  turn: Player
  over: boolean
  winner: Player | null
  /** Cards each player played from their stock pile, and jokers used, for the highlights. */
  fromStock: number[]
  /** Moves so far, and the last one for the messages and sounds. */
  count: number
  last: { by: Player; what: 'bouw' | 'afleg'; card: number; from: From; pile: number; completed: boolean } | null
}

export type From = 'hand' | 'stapel' | 'afleg'

/** `pas` only when your hand is empty and there's nothing left to draw. */
export type StapelAction = { t: 'bouw'; from: From; i: number; pile: number } | { t: 'afleg'; i: number; pile: number } | { t: 'pas' }

export type StapelView = {
  you: Player
  turn: Player
  hand: number[]
  handCounts: number[]
  /** Top card and cards left on each stock pile. */
  stockTop: (number | null)[]
  stockLeft: number[]
  stockStart: number
  discards: number[][][]
  out: boolean[]
  /** What each building pile needs next (1–12), and how many cards are on it. */
  build: { next: number; size: number; top: number | null }[]
  drawLeft: number
  over: boolean
  winner: Player | null
  count: number
  last: StapelState['last']
}

/** The number a pile needs next. */
export const nextFor = (pile: number[]) => pile.length + 1

function take(s: StapelState, random: () => number): number | null {
  if (!s.draw.length && s.cleared.length) {
    s.draw = shuffle(s.cleared, random)
    s.cleared = []
  }
  return s.draw.pop() ?? null
}

function fillHand(s: StapelState, p: Player, random: () => number) {
  while (s.hands[p].length < HAND_SIZE) {
    const c = take(s, random)
    if (c === null) break
    s.hands[p].push(c)
  }
}

const clone = (s: StapelState): StapelState => ({
  ...s,
  draw: [...s.draw],
  cleared: [...s.cleared],
  build: s.build.map((p) => [...p]),
  stock: s.stock.map((p) => [...p]),
  hands: s.hands.map((h) => [...h]),
  discards: s.discards.map((d) => d.map((p) => [...p])),
  out: [...s.out],
  fromStock: [...s.fromStock],
})

const nextUp = (s: StapelState, p: Player) => nextSeat(p, s.hands.length, s.out)

export const stapelgek: Referee<StapelState, StapelView> = {
  maxPlayers: 4,

  start(count, first, random) {
    const deck: number[] = []
    for (let v = 1; v <= 12; v++) for (let k = 0; k < 12; k++) deck.push(v)
    for (let k = 0; k < 18; k++) deck.push(JOKER)
    const draw = shuffle(deck, random)
    const size = stockSize(count)
    const s: StapelState = {
      draw,
      cleared: [],
      build: [[], [], [], []],
      stock: Array.from({ length: count }, () => draw.splice(-size)),
      hands: Array.from({ length: count }, () => []),
      discards: Array.from({ length: count }, () => [[], [], [], []]),
      out: Array(count).fill(false),
      stockStart: size,
      turn: first,
      over: false,
      winner: null,
      fromStock: Array(count).fill(0),
      count: 0,
      last: null,
    }
    fillHand(s, first, random)
    return s
  },

  view(s, you) {
    const top = (p: Player) => s.stock[p][s.stock[p].length - 1] ?? null
    return {
      you,
      turn: s.turn,
      hand: s.hands[you],
      handCounts: s.hands.map((h) => h.length),
      stockTop: s.stock.map((_, p) => top(p)),
      stockLeft: s.stock.map((p) => p.length),
      stockStart: s.stockStart,
      discards: s.discards,
      out: s.out,
      build: s.build.map((p) => ({ next: nextFor(p), size: p.length, top: p[p.length - 1] ?? null })),
      drawLeft: s.draw.length + s.cleared.length,
      over: s.over,
      winner: s.winner,
      count: s.count,
      last: s.last,
    }
  },

  act(s, you, action, random) {
    if (s.over) throw new NotAllowed('Het spel is al uit.')
    if (s.turn !== you) throw new NotAllowed('Je bent niet aan de beurt.')
    const a = action as StapelAction
    const next = clone(s)
    next.count++
    if (a?.t === 'pas') {
      if (next.hands[you].length) throw new NotAllowed('Leg eerst een kaart af om je beurt te eindigen.')
      next.turn = nextUp(next, you)
      fillHand(next, next.turn, random)
      return next
    }
    if (!a || (a.t !== 'bouw' && a.t !== 'afleg') || !Number.isInteger(a.pile) || a.pile < 0 || a.pile > 3) throw new NotAllowed('Dat kan niet.')

    if (a.t === 'afleg') {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= next.hands[you].length) throw new NotAllowed('Die kaart heb je niet.')
      const [card] = next.hands[you].splice(a.i, 1)
      next.discards[you][a.pile].push(card)
      next.last = { by: you, what: 'afleg', card, from: 'hand', pile: a.pile, completed: false }
      next.turn = nextUp(next, you)
      fillHand(next, next.turn, random)
      return next
    }

    // Building: where the card comes from
    let card: number | undefined
    if (a.from === 'hand') {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i >= next.hands[you].length) throw new NotAllowed('Die kaart heb je niet.')
      card = next.hands[you][a.i]
    } else if (a.from === 'stapel') card = next.stock[you][next.stock[you].length - 1]
    else if (a.from === 'afleg') {
      if (!Number.isInteger(a.i) || a.i < 0 || a.i > 3) throw new NotAllowed('Die aflegstapel bestaat niet.')
      card = next.discards[you][a.i][next.discards[you][a.i].length - 1]
    }
    if (card === undefined) throw new NotAllowed('Daar ligt geen kaart.')
    const pile = next.build[a.pile]
    if (card !== JOKER && card !== nextFor(pile)) throw new NotAllowed(`Op deze stapel moet een ${nextFor(pile)}.`)
    if (a.from === 'hand') next.hands[you].splice(a.i, 1)
    else if (a.from === 'stapel') {
      next.stock[you].pop()
      next.fromStock[you]++
    } else next.discards[you][a.i].pop()
    pile.push(card)
    const completed = pile.length === 12
    if (completed) {
      next.cleared.push(...pile)
      next.build[a.pile] = []
    }
    next.last = { by: you, what: 'bouw', card, from: a.from, pile: a.pile, completed }
    if (!next.stock[you].length) {
      next.over = true
      next.winner = you
    } else if (!next.hands[you].length) fillHand(next, you, random)
    return next
  },

  drop(s, seat) {
    const next = clone(s)
    next.out[seat] = true
    // Their cards leave the table
    next.cleared.push(...next.hands[seat], ...next.discards[seat].flat())
    next.hands[seat] = []
    next.discards[seat] = [[], [], [], []]
    const left = next.out.filter((o) => !o).length
    if (left === 1) {
      next.over = true
      next.winner = next.out.findIndex((o) => !o)
    } else if (next.turn === seat) {
      next.turn = nextUp(next, seat)
      while (next.hands[next.turn].length < HAND_SIZE && next.draw.length) next.hands[next.turn].push(next.draw.pop()!)
    }
    return next
  },

  outcome(s) {
    return {
      over: s.over,
      winner: s.winner,
      scores: s.stock.map((p) => s.stockStart - p.length),
      highlights: Object.fromEntries(s.fromStock.map((n, p) => [p, { fromStock: n }])),
    }
  },
}
