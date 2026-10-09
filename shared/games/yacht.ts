/**
 * Yacht Dice (Yahtzee): five dice, thirteen rounds. On your turn you roll up
 * to three times, keeping the dice you like in between, and then write the
 * result in one empty box of your score sheet. The server rolls the dice, so
 * nobody can cheat (server/lib/referee.ts).
 */
import { NotAllowed, nextSeat, type Player, type Referee } from './referee'

export const YACHT_BOXES = {
  enen: { name: 'Enen', hint: 'alle enen opgeteld', upper: 1 },
  tweeen: { name: 'Tweeën', hint: 'alle tweeën opgeteld', upper: 2 },
  drieen: { name: 'Drieën', hint: 'alle drieën opgeteld', upper: 3 },
  vieren: { name: 'Vieren', hint: 'alle vieren opgeteld', upper: 4 },
  vijven: { name: 'Vijven', hint: 'alle vijven opgeteld', upper: 5 },
  zessen: { name: 'Zessen', hint: 'alle zessen opgeteld', upper: 6 },
  drie: { name: 'Drie gelijke', hint: 'drie dezelfde: alle ogen opgeteld', upper: 0 },
  vier: { name: 'Vier gelijke', hint: 'vier dezelfde: alle ogen opgeteld', upper: 0 },
  fullhouse: { name: 'Full house', hint: 'drie en twee dezelfde: 25 punten', upper: 0 },
  kleinestraat: { name: 'Kleine straat', hint: 'vier op een rij: 30 punten', upper: 0 },
  grotestraat: { name: 'Grote straat', hint: 'vijf op een rij: 40 punten', upper: 0 },
  yacht: { name: 'Yacht', hint: 'vijf dezelfde: 50 punten', upper: 0 },
  kans: { name: 'Kans', hint: 'alle ogen opgeteld', upper: 0 },
} as const

export type YachtBox = keyof typeof YACHT_BOXES
export const BOX_KEYS = Object.keys(YACHT_BOXES) as YachtBox[]
export const UPPER_KEYS = BOX_KEYS.filter((k) => YACHT_BOXES[k].upper > 0)
export const LOWER_KEYS = BOX_KEYS.filter((k) => YACHT_BOXES[k].upper === 0)

/** Upper section 63 or more: 35 extra. Every Yacht after the first (with 50 in the Yacht box): 100 extra. */
export const UPPER_BONUS_AT = 63
export const UPPER_BONUS = 35
export const YACHT_BONUS = 100

export type Sheet = Partial<Record<YachtBox, number>>

export type YachtState = {
  turn: Player
  dice: number[]
  held: boolean[]
  /** Rolls this turn (0 to 3). */
  rolls: number
  sheets: Sheet[]
  /** Extra Yachts, each worth YACHT_BONUS. */
  bonusYachts: number[]
  out: boolean[]
  over: boolean
  /** The box someone just filled, for the message. */
  last: { seat: Player; box: YachtBox; points: number } | null
  /** Every roll so far, to notice a new one (and shake the dice). */
  rollCount: number
}

export type YachtView = YachtState & { you: Player }

const sum = (dice: number[]) => dice.reduce((a, b) => a + b, 0)
const counts = (dice: number[]) => {
  const c = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) c[d]++
  return c
}
const hasRun = (dice: number[], length: number) => {
  const have = new Set(dice)
  for (let start = 1; start + length - 1 <= 6; start++) {
    let ok = true
    for (let n = start; n < start + length; n++) if (!have.has(n)) ok = false
    if (ok) return true
  }
  return false
}

export const isYacht = (dice: number[]) => dice.length === 5 && dice.every((d) => d === dice[0] && d > 0)

/**
 * What the dice are worth in a box. An extra Yacht is a joker when its own
 * number's box in the upper section is already filled: then Full house and
 * the straights count in full too.
 */
export function boxScore(box: YachtBox, dice: number[], sheet: Sheet = {}): number {
  const c = counts(dice)
  const most = Math.max(...c)
  const joker = isYacht(dice) && sheet.yacht !== undefined && sheet[UPPER_KEYS[dice[0] - 1]] !== undefined
  switch (box) {
    case 'drie':
      return most >= 3 ? sum(dice) : 0
    case 'vier':
      return most >= 4 ? sum(dice) : 0
    case 'fullhouse':
      return joker || (c.includes(3) && c.includes(2)) ? 25 : 0
    case 'kleinestraat':
      return joker || hasRun(dice, 4) ? 30 : 0
    case 'grotestraat':
      return joker || hasRun(dice, 5) ? 40 : 0
    case 'yacht':
      return isYacht(dice) ? 50 : 0
    case 'kans':
      return sum(dice)
    default:
      return c[YACHT_BOXES[box].upper] * YACHT_BOXES[box].upper
  }
}

export function upperTotal(sheet: Sheet) {
  return UPPER_KEYS.reduce((n, k) => n + (sheet[k] ?? 0), 0)
}

export function totalScore(sheet: Sheet, bonusYachts = 0) {
  const upper = upperTotal(sheet)
  const lower = LOWER_KEYS.reduce((n, k) => n + (sheet[k] ?? 0), 0)
  return upper + (upper >= UPPER_BONUS_AT ? UPPER_BONUS : 0) + lower + bonusYachts * YACHT_BONUS
}

const sheetFull = (sheet: Sheet) => BOX_KEYS.every((k) => sheet[k] !== undefined)

export const yacht: Referee<YachtState, YachtView> = {
  maxPlayers: 4,

  start(count, first) {
    return {
      turn: first,
      dice: [0, 0, 0, 0, 0],
      held: [false, false, false, false, false],
      rolls: 0,
      sheets: Array.from({ length: count }, () => ({})),
      bonusYachts: Array.from({ length: count }, () => 0),
      out: Array.from({ length: count }, () => false),
      over: false,
      last: null,
      rollCount: 0,
    }
  },

  // Nothing is secret: everyone sees all dice and sheets
  view(s, you) {
    return { ...s, you }
  },

  act(s, you, action, random) {
    if (s.over) throw new NotAllowed('Het spel is al uit.')
    if (s.turn !== you) throw new NotAllowed('Je bent niet aan de beurt.')
    const a = action as { t?: unknown; hold?: unknown; box?: unknown }

    if (a?.t === 'gooi') {
      if (s.rolls >= 3) throw new NotAllowed('Je hebt al drie keer gegooid: kies een vakje.')
      // The first roll of a turn throws all five; after that, the ones you keep stay
      const hold = s.rolls === 0 ? [false, false, false, false, false] : Array.isArray(a.hold) ? a.hold.slice(0, 5).map((h) => h === true) : s.held
      if (hold.length !== 5 || hold.every(Boolean)) throw new NotAllowed('Houd niet alle dobbelstenen vast: dan valt er niets te gooien.')
      const dice = s.dice.map((d, i) => (hold[i] ? d : 1 + Math.floor(random() * 6)))
      return { ...s, dice, held: hold, rolls: s.rolls + 1, rollCount: s.rollCount + 1 }
    }

    if (a?.t === 'noteer') {
      const box = a.box as YachtBox
      if (!(box in YACHT_BOXES)) throw new NotAllowed('Dat vakje bestaat niet.')
      if (s.rolls === 0) throw new NotAllowed('Gooi eerst.')
      const sheet = s.sheets[you]
      if (sheet[box] !== undefined) throw new NotAllowed('Dat vakje heb je al ingevuld.')
      const points = boxScore(box, s.dice, sheet)
      const sheets = s.sheets.map((sh, p) => (p === you ? { ...sh, [box]: points } : sh))
      // Another Yacht, after 50 in the Yacht box: 100 extra
      const bonusYachts = s.bonusYachts.map((n, p) => (p === you && isYacht(s.dice) && sheet.yacht === 50 ? n + 1 : n))
      const over = sheets.every((sh, p) => s.out[p] || sheetFull(sh))
      const turn = over ? you : nextSeat(you, sheets.length, s.out)
      return { ...s, sheets, bonusYachts, over, turn, rolls: 0, held: [false, false, false, false, false], dice: [0, 0, 0, 0, 0], last: { seat: you, box, points } }
    }

    throw new NotAllowed('Dat kan niet.')
  },

  // Someone gave up or left: the others play on; with one left, that one wins
  drop(s, seat) {
    const out = s.out.map((o, p) => o || p === seat)
    const left = out.filter((o) => !o).length
    const over = left <= 1 || s.sheets.every((sh, p) => out[p] || sheetFull(sh))
    const turn = s.turn === seat && !over ? nextSeat(seat, s.sheets.length, out) : s.turn
    return { ...s, out, over, turn, ...(s.turn === seat && { rolls: 0, held: [false, false, false, false, false], dice: [0, 0, 0, 0, 0] }) }
  },

  outcome(s) {
    const scores = s.sheets.map((sh, p) => totalScore(sh, s.bonusYachts[p]))
    const playing = scores.map((_, p) => p).filter((p) => !s.out[p])
    let winner: Player | null = null
    if (s.over && playing.length) {
      const best = Math.max(...playing.map((p) => scores[p]))
      const top = playing.filter((p) => scores[p] === best)
      winner = top.length === 1 ? top[0] : null
    }
    const highlights: Record<Player, Record<string, number>> = {}
    s.sheets.forEach((sh, p) => {
      highlights[p] = { score: scores[p], yachts: (sh.yacht === 50 ? 1 : 0) + s.bonusYachts[p] }
    })
    return { over: s.over, winner, scores, highlights }
  },
}
