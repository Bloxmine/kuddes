/**
 * Poker: Texas Hold'em for 2 to 4 players, refereed by the server (the deck
 * and everyone's cards are secret; server/lib/referee.ts). Everyone starts
 * with 1000 chips. Each hand: two cards each, blinds, then betting before
 * the flop, after the flop (3 cards), the turn and the river (1 each). The
 * best five of your two and the five on the table wins the pot; with all-ins
 * there are side pots. The blinds go up every few hands, and the game ends
 * when one player has all the chips.
 */
import { NotAllowed, shuffle, type Player, type Referee } from './referee'

export const POKER = { chips: 1000, smallBlind: 10, blindsUpEvery: 6 }

/** A card: 0–51. Rank 2..14 (ace high), suit 0..3 (♠ ♥ ♦ ♣). */
export type Card = number
export const rankOf = (c: Card) => (c % 13) + 2
export const suitOf = (c: Card) => Math.floor(c / 13)
export const SUITS = ['♠', '♥', '♦', '♣'] as const
export const RANK_NAMES: Record<number, string> = { 11: 'B', 12: 'V', 13: 'H', 14: 'A' }
export const rankLabel = (r: number) => RANK_NAMES[r] ?? String(r)

// ------------------------------------------------------------------ hands

export const HAND_NAMES = ['Hoge kaart', 'Paar', 'Twee paar', 'Drie gelijke', 'Straat', 'Kleur', 'Full house', 'Vier gelijke', 'Straight flush', 'Royal flush'] as const

/** A hand's value, to compare: [category, tie-breakers…]; bigger is better. */
export type HandValue = number[]

function value5(cards: Card[]): HandValue {
  const ranks = cards.map(rankOf).sort((a, b) => b - a)
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]))
  const uniq = [...new Set(ranks)]
  // A straight, with the wheel (A-2-3-4-5) counting 5 high
  let straightHigh = 0
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0]
    else if (ranks.join() === '14,5,4,3,2') straightHigh = 5
  }
  const counts = uniq.map((r) => [ranks.filter((x) => x === r).length, r]).sort((a, b) => b[0] - a[0] || b[1] - a[1])
  const byCount = counts.map((c) => c[1])
  if (straightHigh && flush) return [straightHigh === 14 ? 9 : 8, straightHigh]
  if (counts[0][0] === 4) return [7, ...byCount]
  if (counts[0][0] === 3 && counts[1][0] === 2) return [6, ...byCount]
  if (flush) return [5, ...ranks]
  if (straightHigh) return [4, straightHigh]
  if (counts[0][0] === 3) return [3, ...byCount]
  if (counts[0][0] === 2 && counts[1][0] === 2) return [2, ...byCount]
  if (counts[0][0] === 2) return [1, ...byCount]
  return [0, ...ranks]
}

export function compareHands(a: HandValue, b: HandValue): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The best five of up to seven cards. */
export function bestHand(cards: Card[]): { value: HandValue; cards: Card[] } {
  let best: { value: HandValue; cards: Card[] } | null = null
  const n = cards.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const five = [cards[a], cards[b], cards[c], cards[d], cards[e]]
            const value = value5(five)
            if (!best || compareHands(value, best.value) > 0) best = { value, cards: five }
          }
  return best ?? { value: [0], cards }
}

export const handName = (v: HandValue) => HAND_NAMES[v[0]]

// ------------------------------------------------------------------ state

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type HandResult = {
  hand: number
  /** Per pot: who won how much, and with what. */
  pots: { amount: number; winners: Player[] }[]
  /** Hands shown at the showdown (only who went to it). */
  shown: { seat: Player; cards: Card[]; name: string; best: Card[] }[]
  board: Card[]
  /** Everyone else folded: nothing is shown. */
  uncontested: boolean
}

export type PokerState = {
  count: number
  chips: number[]
  /** Out of the game: no chips left, or gave up. */
  out: boolean[]
  hand: number
  dealer: Player
  smallBlind: number
  deck: Card[]
  holes: Card[][]
  board: Card[]
  street: Street
  /** In this hand so far, and in this betting round. */
  committed: number[]
  bet: number[]
  folded: boolean[]
  allIn: boolean[]
  /** Who's to act; who acted since the last raise. */
  toAct: Player
  acted: boolean[]
  /** The size of the last raise (the next must be at least this). */
  lastRaise: number
  last: HandResult | null
  /** What happened, for the table: [seat, action, amount]. */
  log: [Player, string, number][]
  over: boolean
  /** Numbers for achievements: the best hand category a pot was won with, pots won. */
  bestHand: number[]
  potsWon: number[]
}

export type PokerView = {
  you: Player
  count: number
  chips: number[]
  out: boolean[]
  hand: number
  dealer: Player
  smallBlind: number
  /** Your two cards; the others' only as a count. */
  mine: Card[]
  board: Card[]
  street: Street
  pot: number
  bet: number[]
  committed: number[]
  folded: boolean[]
  allIn: boolean[]
  toAct: Player
  /** For you, when it's your turn: what calling costs and how far you can raise (to). */
  toCall: number
  minRaiseTo: number
  maxRaiseTo: number
  last: HandResult | null
  log: [Player, string, number][]
  over: boolean
  /** When the game is over: everyone's cards of the last hand. */
  holes: Card[][] | null
}

const alive = (s: PokerState, p: Player) => !s.out[p]
/** In the hand: dealt in and not folded. */
const inHand = (s: PokerState, p: Player) => alive(s, p) && !s.folded[p]
const canAct = (s: PokerState, p: Player) => inHand(s, p) && !s.allIn[p]

function nextFrom(s: PokerState, from: Player, ok: (p: Player) => boolean): Player {
  for (let k = 1; k <= s.count; k++) {
    const p = (from + k) % s.count
    if (ok(p)) return p
  }
  return from
}

/** Moves chips from a player into their bet (all-in when it's everything). */
function put(s: PokerState, p: Player, amount: number) {
  const n = Math.min(amount, s.chips[p])
  s.chips[p] -= n
  s.bet[p] += n
  s.committed[p] += n
  if (s.chips[p] === 0) s.allIn[p] = true
  return n
}

function dealHand(s: PokerState, random: () => number) {
  s.hand++
  // The blinds go up every few hands
  s.smallBlind = POKER.smallBlind * (1 + Math.floor((s.hand - 1) / POKER.blindsUpEvery))
  s.deck = shuffle(Array.from({ length: 52 }, (_, i) => i), random)
  s.holes = Array.from({ length: s.count }, () => [])
  s.board = []
  s.street = 'preflop'
  s.committed = Array(s.count).fill(0)
  s.bet = Array(s.count).fill(0)
  s.folded = s.out.map((o) => o)
  s.allIn = Array(s.count).fill(false)
  s.acted = Array(s.count).fill(false)
  s.dealer = s.hand === 1 ? s.dealer : nextFrom(s, s.dealer, (p) => alive(s, p))
  for (let round = 0; round < 2; round++) for (let p = 0; p < s.count; p++) if (alive(s, p)) s.holes[p].push(s.deck.pop()!)
  const players = s.out.filter((o) => !o).length
  // Heads-up the dealer is the small blind
  const sb = players === 2 ? s.dealer : nextFrom(s, s.dealer, (p) => alive(s, p))
  const bb = nextFrom(s, sb, (p) => alive(s, p))
  put(s, sb, s.smallBlind)
  put(s, bb, s.smallBlind * 2)
  s.log = [...s.log.slice(-40), [sb, 'kleine blind', s.bet[sb]], [bb, 'grote blind', s.bet[bb]]]
  s.lastRaise = s.smallBlind * 2
  s.toAct = nextFrom(s, bb, (p) => canAct(s, p))
  // Nobody can act (everyone all-in on the blinds): straight to the showdown
  if (!canAct(s, s.toAct) || roundDone(s)) advance(s, random)
}

/** The betting round is done when everyone who can act has, and matched the highest bet. */
function roundDone(s: PokerState) {
  const high = Math.max(...s.bet)
  const actors = Array.from({ length: s.count }, (_, p) => p).filter((p) => canAct(s, p))
  if (actors.length === 0) return true
  // One player left who can act and nobody to call: done once they've matched
  return actors.every((p) => s.acted[p] && s.bet[p] === high)
}

/** Splits the pots at the showdown (side pots from what everyone put in), and deals the next hand. */
function showdown(s: PokerState, random: () => number) {
  const contenders = Array.from({ length: s.count }, (_, p) => p).filter((p) => inHand(s, p))
  const values = new Map(contenders.map((p) => [p, bestHand([...s.holes[p], ...s.board])]))
  const levels = [...new Set(s.committed.filter((c) => c > 0))].sort((a, b) => a - b)
  const pots: HandResult['pots'] = []
  let prev = 0
  for (const level of levels) {
    const amount = s.committed.reduce((sum, c) => sum + Math.max(0, Math.min(c, level) - prev), 0)
    const eligible = contenders.filter((p) => s.committed[p] >= level)
    prev = level
    if (!amount) continue
    if (!eligible.length) {
      // Only folded players reached this level: it goes to the best of the rest
      const last = pots[pots.length - 1]
      if (last) last.amount += amount
      continue
    }
    let best: Player[] = []
    for (const p of eligible) {
      if (!best.length) best = [p]
      else {
        const d = compareHands(values.get(p)!.value, values.get(best[0])!.value)
        if (d > 0) best = [p]
        else if (d === 0) best.push(p)
      }
    }
    const merged = pots.find((x) => x.winners.join() === best.join())
    if (merged) merged.amount += amount
    else pots.push({ amount, winners: best })
  }
  for (const pot of pots) {
    const share = Math.floor(pot.amount / pot.winners.length)
    pot.winners.forEach((p, i) => (s.chips[p] += share + (i < pot.amount - share * pot.winners.length ? 1 : 0)))
    pot.winners.forEach((p) => {
      s.potsWon[p]++
      // The best hand anyone won a pot with (for the achievements)
      s.bestHand[p] = Math.max(s.bestHand[p], values.get(p)!.value[0])
    })
  }
  const shown = contenders.map((p) => {
    const v = values.get(p)!
    return { seat: p, cards: s.holes[p], name: handName(v.value), best: v.cards }
  })
  s.last = { hand: s.hand, pots, shown, board: s.board, uncontested: false }
  finishHand(s, random)
}

/** Everyone else folded: the last one takes it all, without showing. */
function takeUncontested(s: PokerState, winner: Player, random: () => number) {
  const amount = s.committed.reduce((a, b) => a + b, 0)
  s.chips[winner] += amount
  s.potsWon[winner]++
  s.last = { hand: s.hand, pots: [{ amount, winners: [winner] }], shown: [], board: s.board, uncontested: true }
  finishHand(s, random)
}

function finishHand(s: PokerState, random: () => number) {
  for (let p = 0; p < s.count; p++) if (s.chips[p] === 0) s.out[p] = true
  if (s.out.filter((o) => !o).length <= 1) {
    s.over = true
    return
  }
  dealHand(s, random)
}

/** After an action: next player, next street, or the end of the hand. */
function advance(s: PokerState, random: () => number) {
  const seats = Array.from({ length: s.count }, (_, p) => p)
  const left = seats.filter((p) => inHand(s, p))
  if (left.length === 1) return takeUncontested(s, left[0], random)
  if (!roundDone(s)) {
    s.toAct = nextFrom(s, s.toAct, (p) => canAct(s, p))
    return
  }
  // The next street; when fewer than two players can still bet, deal on to the showdown
  for (;;) {
    if (s.street === 'river') return showdown(s, random)
    const n = s.street === 'preflop' ? 3 : 1
    for (let i = 0; i < n; i++) s.board.push(s.deck.pop()!)
    s.street = s.street === 'preflop' ? 'flop' : s.street === 'flop' ? 'turn' : 'river'
    s.bet = Array(s.count).fill(0)
    s.acted = Array(s.count).fill(false)
    s.lastRaise = s.smallBlind * 2
    if (seats.filter((p) => canAct(s, p)).length >= 2) {
      // After the flop the first player after the dealer starts
      s.toAct = nextFrom(s, s.dealer, (p) => canAct(s, p))
      return
    }
  }
}

const clone = (s: PokerState): PokerState => structuredClone(s)

export const poker: Referee<PokerState, PokerView> = {
  maxPlayers: 4,

  start(count, first, random) {
    const s: PokerState = {
      count,
      chips: Array(count).fill(POKER.chips),
      out: Array(count).fill(false),
      hand: 0,
      dealer: first,
      smallBlind: POKER.smallBlind,
      deck: [],
      holes: [],
      board: [],
      street: 'preflop',
      committed: [],
      bet: [],
      folded: [],
      allIn: [],
      toAct: first,
      acted: [],
      lastRaise: POKER.smallBlind * 2,
      last: null,
      log: [],
      over: false,
      bestHand: Array(count).fill(0),
      potsWon: Array(count).fill(0),
    }
    dealHand(s, random)
    return s
  },

  view(s, you, done) {
    const high = Math.max(0, ...s.bet)
    const toCall = Math.max(0, high - (s.bet[you] ?? 0))
    const stack = (s.chips[you] ?? 0) + (s.bet[you] ?? 0)
    return {
      you,
      count: s.count,
      chips: s.chips,
      out: s.out,
      hand: s.hand,
      dealer: s.dealer,
      smallBlind: s.smallBlind,
      mine: s.holes[you] ?? [],
      board: s.board,
      street: s.street,
      pot: s.committed.reduce((a, b) => a + b, 0),
      bet: s.bet,
      committed: s.committed,
      folded: s.folded,
      allIn: s.allIn,
      toAct: s.toAct,
      toCall: Math.min(toCall, s.chips[you] ?? 0),
      minRaiseTo: Math.min(stack, high + Math.max(s.lastRaise, s.smallBlind * 2)),
      maxRaiseTo: stack,
      last: s.last,
      log: s.log.slice(-12),
      over: s.over,
      holes: done || s.over ? s.holes : null,
    }
  },

  act(state, you, action, random) {
    if (state.over) throw new NotAllowed('Het spel is al uit.')
    if (state.toAct !== you || !canAct(state, you)) throw new NotAllowed('Je bent niet aan de beurt.')
    const s = clone(state)
    const a = (action ?? {}) as { do?: string; to?: number }
    const high = Math.max(...s.bet)
    const toCall = high - s.bet[you]
    switch (a.do) {
      case 'fold':
        s.folded[you] = true
        s.log.push([you, 'past', 0])
        break
      case 'check':
        if (toCall > 0) throw new NotAllowed(`Je moet ${toCall} bijleggen, of passen.`)
        s.log.push([you, 'checkt', 0])
        break
      case 'call': {
        if (toCall <= 0) throw new NotAllowed('Er is niets om te callen: check.')
        const n = put(s, you, toCall)
        s.log.push([you, s.allIn[you] ? 'all-in' : 'callt', n])
        break
      }
      case 'raise': {
        const to = Math.floor(Number(a.to))
        const stack = s.chips[you] + s.bet[you]
        if (!Number.isFinite(to)) throw new NotAllowed('Hoeveel wil je inzetten?')
        const min = high + Math.max(s.lastRaise, s.smallBlind * 2)
        // All-in for less than a full raise is allowed; otherwise at least the minimum
        if (to < Math.min(min, stack)) throw new NotAllowed(`Verhoog naar minstens ${min}.`)
        if (to > stack) throw new NotAllowed('Zoveel fiches heb je niet.')
        if (to <= high) throw new NotAllowed('Dat is geen verhoging: call of check.')
        const raise = to - high
        put(s, you, to - s.bet[you])
        // A full raise opens the betting again
        if (raise >= s.lastRaise) {
          s.lastRaise = raise
          s.acted = s.acted.map(() => false)
        }
        s.log.push([you, s.allIn[you] ? 'all-in' : high === 0 ? 'zet in' : 'verhoogt naar', to])
        break
      }
      default:
        throw new NotAllowed('Kies: passen, checken, callen of verhogen.')
    }
    s.acted[you] = true
    advance(s, random)
    return s
  },

  // Someone gave up or left: their cards go, their chips stay in the pot, and they're out
  drop(state, seat) {
    const s = clone(state)
    s.folded[seat] = true
    s.out[seat] = true
    s.chips[seat] = 0
    if (s.out.filter((o) => !o).length <= 1) {
      // The last one left takes what's on the table
      const winner = s.out.findIndex((o) => !o)
      if (winner >= 0) s.chips[winner] += s.committed.reduce((a, b) => a + b, 0)
      s.over = true
      return s
    }
    if (s.toAct === seat) {
      s.acted[seat] = true
      advance(s, Math.random)
    }
    return s
  },

  outcome(s) {
    const winner = s.over ? s.chips.findIndex((c, p) => c > 0 && !s.out[p]) : -1
    return {
      over: s.over,
      winner: winner >= 0 ? winner : null,
      scores: s.chips,
      highlights: Object.fromEntries(s.chips.map((_, p) => [p, { bestHand: s.bestHand[p], potsWon: s.potsWon[p] }])),
    }
  },
}
