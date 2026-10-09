/**
 * Mastermind: one player (the code maker) hides a row of coloured pegs, the
 * other (the guesser) tries to find it. After every guess the maker's side of
 * the board says how many pegs are the right colour in the right place
 * (black) and how many are the right colour in the wrong place (white).
 * Colours may repeat. Cracked within the rows: the guesser wins; otherwise the
 * maker does. Klassiek: 6 colours, 4 pegs, 10 rows; modern (like Super
 * Mastermind): 8 colours, 5 pegs, 12 rows.
 *
 * Who guesses swaps every game between the same two players (the server
 * picks the maker from their previous Mastermind game: server/lib/referee.ts).
 * The code only lives in the server's state; the guesser never sees it
 * before the end.
 */
import { NotAllowed, other, type Player, type Referee } from './referee'

export const MASTERMIND_MODES = {
  klassiek: { name: 'Klassiek', colours: 6, pegs: 4, rows: 10 },
  modern: { name: 'Modern', colours: 8, pegs: 5, rows: 12 },
} as const
export type MastermindMode = keyof typeof MASTERMIND_MODES

/** The colours of the pegs, in order: the first 6 are the classic set. */
export const PEG_COLOURS = [
  { name: 'Rood', hex: '#d8322f' },
  { name: 'Geel', hex: '#f4c824' },
  { name: 'Groen', hex: '#2f9e44' },
  { name: 'Blauw', hex: '#2a6fd6' },
  { name: 'Wit', hex: '#f4f4f0' },
  { name: 'Zwart', hex: '#26262b' },
  { name: 'Oranje', hex: '#f07c1c' },
  { name: 'Paars', hex: '#8e44c4' },
] as const

export type Guess = { pegs: number[]; black: number; white: number }

export type MastermindState = {
  mode: MastermindMode
  maker: Player
  guesser: Player
  /** The secret row; null until the maker has chosen it. */
  code: number[] | null
  guesses: Guess[]
  over: boolean
  solved: boolean
  /** Who gave up (the other one wins). */
  gaveUp: Player | null
}

export type MastermindView = {
  you: Player
  mode: MastermindMode
  maker: Player
  guesser: Player
  /** For the maker always, for the guesser only at the end. */
  code: number[] | null
  /** Whether the maker has chosen (without telling the guesser what). */
  codeSet: boolean
  guesses: Guess[]
  over: boolean
  solved: boolean
}

/** Black: right colour, right place. White: right colour, wrong place (each peg counts once). */
export function score(code: number[], guess: number[]): { black: number; white: number } {
  let black = 0
  const left = new Map<number, number>()
  const rest: number[] = []
  code.forEach((c, i) => {
    if (guess[i] === c) black++
    else {
      left.set(c, (left.get(c) ?? 0) + 1)
      rest.push(guess[i])
    }
  })
  let white = 0
  for (const g of rest) {
    const n = left.get(g) ?? 0
    if (n > 0) {
      white++
      left.set(g, n - 1)
    }
  }
  return { black, white }
}

function readRow(action: unknown, key: 'code' | 'guess', mode: MastermindMode): number[] {
  const { colours, pegs } = MASTERMIND_MODES[mode]
  const row = (action as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(row) || row.length !== pegs || row.some((c) => !Number.isInteger(c) || c < 0 || c >= colours)) {
    throw new NotAllowed(`Kies ${pegs} kleuren.`)
  }
  return row as number[]
}

/** Points like the real game: the maker scores the guesses it took (one extra when not cracked), the guesser the rows it had left. */
function points(s: MastermindState): number[] {
  const { rows } = MASTERMIND_MODES[s.mode]
  const out = [0, 0]
  if (!s.over) return out
  if (s.solved) out[s.guesser] = rows - s.guesses.length + 1
  else out[s.maker] = s.guesses.length + 1
  return out
}

export const mastermind = (mode: MastermindMode): Referee<MastermindState, MastermindView> => ({
  maxPlayers: 2,

  // `first` is the code maker this time
  start(_count, first) {
    return { mode, maker: first, guesser: other(first), code: null, guesses: [], over: false, solved: false, gaveUp: null }
  },

  view(s, you, done) {
    return {
      you,
      mode: s.mode,
      maker: s.maker,
      guesser: s.guesser,
      code: you === s.maker || done || s.over ? s.code : null,
      codeSet: s.code !== null,
      guesses: s.guesses,
      over: s.over,
      solved: s.solved,
    }
  },

  act(s, you, action) {
    if (s.over) throw new NotAllowed('Het spel is al uit.')
    if (s.code === null) {
      if (you !== s.maker) throw new NotAllowed('De ander kiest eerst de geheime code.')
      return { ...s, code: readRow(action, 'code', s.mode) }
    }
    if (you !== s.guesser) throw new NotAllowed('Jij hebt de code gemaakt: de ander raadt.')
    const pegs = readRow(action, 'guess', s.mode)
    const result = score(s.code, pegs)
    const guesses = [...s.guesses, { pegs, ...result }]
    const solved = result.black === MASTERMIND_MODES[s.mode].pegs
    return { ...s, guesses, solved, over: solved || guesses.length >= MASTERMIND_MODES[s.mode].rows }
  },

  drop(s, seat) {
    return { ...s, over: true, gaveUp: seat }
  },

  outcome(s) {
    const scores = points(s)
    const winner = !s.over ? null : s.gaveUp !== null ? other(s.gaveUp) : s.solved ? s.guesser : s.maker
    const { rows } = MASTERMIND_MODES[s.mode]
    return {
      over: s.over,
      winner,
      scores,
      // For the achievements: cracking it in few tries (higher is better: rows left)
      highlights: {
        [s.guesser]: { crackedLeft: s.solved ? rows - s.guesses.length : 0 },
        [s.maker]: { unbroken: s.over && !s.solved && s.gaveUp === null ? 1 : 0 },
      } as Record<Player, Record<string, number>>,
    }
  },
})

/** Whose turn it is: the maker's until the code is set, then the guesser's. */
export const mastermindTurn = (v: Pick<MastermindView, 'codeSet' | 'maker' | 'guesser'>): Player => (v.codeSet ? v.guesser : v.maker)
