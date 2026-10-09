/**
 * Vier op een rij: 7 columns, 6 rows, drop discs; four in a row (across,
 * down or diagonal) wins. Like Mancala, both browsers and the server run
 * these rules, and the server replays the moves before a result counts.
 */

export type Player = 0 | 1

export const COLS = 7
export const ROWS = 6

export type VierState = {
  /** Row 0 is the top; index = row * COLS + col. */
  grid: (Player | null)[]
  turn: Player
  over: boolean
  winner: Player | null
  /** The four (or more) winning cells. */
  line: number[]
  moves: number[]
}

export function initialState(first: Player): VierState {
  return { grid: Array(COLS * ROWS).fill(null), turn: first, over: false, winner: null, line: [], moves: [] }
}

export const legalMoves = (s: VierState) => (s.over ? [] : [...Array(COLS).keys()].filter((c) => s.grid[c] === null))
export const isLegal = (s: VierState, col: number) => Number.isInteger(col) && legalMoves(s).includes(col)

/** The row a disc dropped in `col` lands on. */
export function dropRow(s: VierState, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (s.grid[r * COLS + col] === null) return r
  return -1
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

/** The line through (r, c) for player p, if it's four or longer. */
function lineAt(grid: (Player | null)[], r: number, c: number, p: Player): { cells: number[]; diagonal: boolean } | null {
  for (const [dr, dc] of DIRECTIONS) {
    const cells = [r * COLS + c]
    for (const sign of [1, -1]) {
      let rr = r + dr * sign
      let cc = c + dc * sign
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr * COLS + cc] === p) {
        cells.push(rr * COLS + cc)
        rr += dr * sign
        cc += dc * sign
      }
    }
    if (cells.length >= 4) return { cells, diagonal: dr !== 0 && dc !== 0 }
  }
  return null
}

export function applyMove(s: VierState, col: number): { state: VierState; row: number; diagonal: boolean } {
  if (!isLegal(s, col)) throw new Error(`Ongeldige zet: ${col}`)
  const row = dropRow(s, col)
  const grid = [...s.grid]
  grid[row * COLS + col] = s.turn
  const line = lineAt(grid, row, col, s.turn)
  const full = grid.every((x) => x !== null)
  const over = !!line || full
  return {
    state: { grid, turn: over ? s.turn : s.turn === 0 ? 1 : 0, over, winner: line ? s.turn : null, line: line?.cells ?? [], moves: [...s.moves, col] },
    row,
    diagonal: !!line?.diagonal,
  }
}

export type VierHighlights = { quickWin: number; diagonalWin: number }

export function replay(moves: number[], first: Player): { state: VierState; highlights: Record<Player, VierHighlights> } {
  let state = initialState(first)
  let diagonal = false
  for (const m of moves) {
    const r = applyMove(state, m)
    state = r.state
    diagonal = r.diagonal
  }
  const highlights: Record<Player, VierHighlights> = { 0: { quickWin: 0, diagonalWin: 0 }, 1: { quickWin: 0, diagonalWin: 0 } }
  if (state.winner !== null) {
    const discs = state.grid.filter((x) => x === state.winner).length
    highlights[state.winner] = { quickWin: discs <= 6 ? 1 : 0, diagonalWin: diagonal ? 1 : 0 }
  }
  return { state, highlights }
}
