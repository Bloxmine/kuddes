/**
 * Kleurwissel, for 2 to 4 players: be the first to get rid of all your
 * cards. Play a card of the same colour or the same number (or symbol) as the
 * one on top, or a wild card, which lets you pick the colour. Can't (or
 * won't) play? Take a card; you may play that one straight away, otherwise
 * your turn is over.
 *
 * Cards (108): in red, yellow, green and blue one 0 and two of 1–9, and two
 * each of Overslaan, Draai om and +2; plus four Kleur kiezen and four +4.
 * Overslaan skips the next player; +2 and +4 make the next player take cards
 * and skip them too. Draai om turns the direction round; with two players
 * that means you go again, like Overslaan.
 *
 * Down to your last card? Say "Laatste kaart!" when you play the one before
 * it, or you take two cards as a penalty. The winner scores the cards
 * everyone else still holds (numbers their value, symbols 20, wild cards 50).
 */
import { NotAllowed, nextSeat, shuffle, type Player, type Referee } from './referee'

export type Colour = 'rood' | 'geel' | 'groen' | 'blauw'
export const COLOURS: Colour[] = ['rood', 'geel', 'groen', 'blauw']
export type Kind = 'getal' | 'overslaan' | 'draai' | 'plus2' | 'kleur' | 'plus4'

export type Card = { id: number; colour: Colour | null; kind: Kind; n?: number }

export const START_HAND = 7

export type KleurState = {
  draw: Card[]
  pile: Card[]
  hands: Card[][]
  /** Who gave up or left: their turns are skipped. */
  out: boolean[]
  turn: Player
  /** 1 goes up the seats, −1 down (after a Draai om). */
  dir: 1 | -1
  /** The colour to follow (the top card's, or the one picked for a wild card). */
  colour: Colour
  /** The card taken this turn: only that one may still be played. */
  drawn: number | null
  over: boolean
  winner: Player | null
  count: number
  last: { by: Player; what: 'speel' | 'pak' | 'pas'; card?: Card; penalty?: boolean; took?: number; victim?: Player } | null
  plus4: number[]
}

export type KleurAction = { t: 'speel'; id: number; kleur?: Colour; laatste?: boolean } | { t: 'pak' } | { t: 'pas' }

export type KleurView = {
  you: Player
  turn: Player
  dir: 1 | -1
  hand: Card[]
  handCounts: number[]
  out: boolean[]
  top: Card
  colour: Colour
  drawLeft: number
  drawn: number | null
  over: boolean
  winner: Player | null
  count: number
  last: KleurState['last']
  /** Once it's over: everyone's cards. */
  hands: Card[][] | null
}

export const cardPoints = (c: Card) => (c.kind === 'getal' ? c.n! : c.kind === 'kleur' || c.kind === 'plus4' ? 50 : 20)

/** Whether a card may go on the pile now. */
export const canPlay = (c: Card, top: Card, colour: Colour) =>
  c.kind === 'kleur' || c.kind === 'plus4' || c.colour === colour || (c.kind === 'getal' ? top.kind === 'getal' && top.n === c.n : c.kind === top.kind)

function deck(): Card[] {
  const cards: Omit<Card, 'id'>[] = []
  for (const colour of COLOURS) {
    cards.push({ colour, kind: 'getal', n: 0 })
    for (let n = 1; n <= 9; n++) cards.push({ colour, kind: 'getal', n }, { colour, kind: 'getal', n })
    for (const kind of ['overslaan', 'draai', 'plus2'] as const) cards.push({ colour, kind }, { colour, kind })
  }
  for (let k = 0; k < 4; k++) cards.push({ colour: null, kind: 'kleur' }, { colour: null, kind: 'plus4' })
  return cards.map((c, id) => ({ ...c, id }))
}

function take(s: KleurState, random: () => number): Card | null {
  if (!s.draw.length && s.pile.length > 1) {
    const top = s.pile.pop()!
    s.draw = shuffle(s.pile, random)
    s.pile = [top]
  }
  return s.draw.pop() ?? null
}

function give(s: KleurState, p: Player, n: number, random: () => number) {
  let got = 0
  for (let k = 0; k < n; k++) {
    const c = take(s, random)
    if (!c) break
    s.hands[p].push(c)
    got++
  }
  return got
}

const clone = (s: KleurState): KleurState => ({ ...s, draw: [...s.draw], pile: [...s.pile], hands: s.hands.map((h) => [...h]), out: [...s.out], plus4: [...s.plus4] })
const seats = (s: KleurState) => s.hands.length
const playing = (s: KleurState) => s.out.filter((o) => !o).length
/** The next player to go, and the one after (for skips). */
const after = (s: KleurState, p: Player) => nextSeat(p, seats(s), s.out, s.dir)

export const kleurwissel: Referee<KleurState, KleurView> = {
  maxPlayers: 4,

  start(count, first, random) {
    const s: KleurState = {
      draw: shuffle(deck(), random),
      pile: [],
      hands: Array.from({ length: count }, () => []),
      out: Array(count).fill(false),
      turn: first,
      dir: 1,
      colour: 'rood',
      drawn: null,
      over: false,
      winner: null,
      count: 0,
      last: null,
      plus4: Array(count).fill(0),
    }
    for (let k = 0; k < count; k++) give(s, (first + k) % count, START_HAND, random)
    // The first card on the pile is a number (others go back in)
    for (;;) {
      const c = s.draw.pop()!
      if (c.kind === 'getal') {
        s.pile.push(c)
        s.colour = c.colour!
        break
      }
      s.draw = shuffle([...s.draw, c], random)
    }
    return s
  },

  view(s, you, done) {
    return {
      you,
      turn: s.turn,
      dir: s.dir,
      hand: s.hands[you],
      handCounts: s.hands.map((h) => h.length),
      out: s.out,
      top: s.pile[s.pile.length - 1],
      colour: s.colour,
      drawLeft: s.draw.length,
      drawn: s.turn === you ? s.drawn : null,
      over: s.over,
      winner: s.winner,
      count: s.count,
      last: s.last,
      hands: done ? s.hands : null,
    }
  },

  act(s, you, action, random) {
    if (s.over) throw new NotAllowed('Het spel is al uit.')
    if (s.turn !== you) throw new NotAllowed('Je bent niet aan de beurt.')
    const a = action as KleurAction
    const next = clone(s)
    next.count++

    if (a?.t === 'pak') {
      if (s.drawn !== null) throw new NotAllowed('Je hebt al een kaart gepakt.')
      const c = take(next, random)
      if (!c) {
        // Nothing left to take: your turn is over
        next.turn = after(next, you)
        next.last = { by: you, what: 'pas' }
        return next
      }
      next.hands[you].push(c)
      next.last = { by: you, what: 'pak', took: 1 }
      // Can't play the card you took: the next one's turn
      if (canPlay(c, next.pile[next.pile.length - 1], next.colour)) next.drawn = c.id
      else next.turn = after(next, you)
      return next
    }

    if (a?.t === 'pas') {
      if (s.drawn === null) throw new NotAllowed('Pak eerst een kaart.')
      next.drawn = null
      next.turn = after(next, you)
      next.last = { by: you, what: 'pas' }
      return next
    }

    if (a?.t !== 'speel') throw new NotAllowed('Dat kan niet.')
    const i = next.hands[you].findIndex((c) => c.id === a.id)
    if (i < 0) throw new NotAllowed('Die kaart heb je niet.')
    const card = next.hands[you][i]
    if (s.drawn !== null && card.id !== s.drawn) throw new NotAllowed('Je mag alleen de kaart spelen die je net pakte.')
    if (!canPlay(card, next.pile[next.pile.length - 1], next.colour)) throw new NotAllowed('Die kaart past er niet op.')
    const wild = card.kind === 'kleur' || card.kind === 'plus4'
    if (wild && !COLOURS.includes(a.kleur as Colour)) throw new NotAllowed('Kies een kleur.')

    next.hands[you].splice(i, 1)
    next.pile.push(card)
    next.colour = wild ? (a.kleur as Colour) : card.colour!
    next.drawn = null
    let penalty = false
    // Forgot to say it on your second-to-last card
    if (next.hands[you].length === 1 && !a.laatste) {
      give(next, you, 2, random)
      penalty = true
    }
    if (card.kind === 'plus4') next.plus4[you]++
    next.last = { by: you, what: 'speel', card, penalty }

    if (!next.hands[you].length) {
      next.over = true
      next.winner = you
      return next
    }
    // Two left in the game: turning round is the same as skipping
    if (card.kind === 'draai') {
      if (playing(next) > 2) next.dir = next.dir === 1 ? -1 : 1
      else {
        next.turn = you
        return next
      }
    }
    const victim = after(next, you)
    if (card.kind === 'plus2') give(next, victim, 2, random)
    if (card.kind === 'plus4') give(next, victim, 4, random)
    if (card.kind === 'plus2' || card.kind === 'plus4' || card.kind === 'overslaan') {
      next.last.victim = victim
      next.turn = after(next, victim)
    } else next.turn = victim
    return next
  },

  drop(s, seat) {
    const next = clone(s)
    next.out[seat] = true
    // Their cards go under the draw pile
    next.draw = [...next.hands[seat], ...next.draw]
    next.hands[seat] = []
    if (playing(next) === 1) {
      next.over = true
      next.winner = next.out.findIndex((o) => !o)
    } else if (next.turn === seat) {
      next.drawn = null
      next.turn = after(next, seat)
    }
    return next
  },

  outcome(s) {
    const points = (p: Player) => s.hands[p].reduce((n, c) => n + cardPoints(c), 0)
    const scores = s.hands.map((_, p) => (p === s.winner ? s.hands.reduce((n, _h, q) => (q === p ? n : n + points(q)), 0) : 0))
    return { over: s.over, winner: s.winner, scores, highlights: Object.fromEntries(s.hands.map((_, p) => [p, { points: scores[p], plus4: s.plus4[p] }])) }
  },
}
