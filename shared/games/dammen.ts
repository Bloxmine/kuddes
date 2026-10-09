/**
 * Dammen: international draughts on a 10×10 board (FMJD rules). The same
 * rules run in both browsers and on the server: players send each other only
 * the squares a piece visits, and the server replays the whole list of moves
 * to check a result before it counts.
 *
 * Squares are the 50 dark squares, 0-based (0–49 for the usual 1–50). Square 0
 * is the top-left dark square seen from White's side. Black starts on 0–19,
 * White on 30–49; White moves first and its men move up (towards row 0).
 *
 * Rules in short: men step one square forward and capture forward and
 * backward; kings fly. Capturing is compulsory and you must take the most
 * pieces possible. Captured pieces come off only after the whole move, can't
 * be jumped twice and block the way until then. A man is crowned only if it
 * ends its move on the far row. No legal move means you lose; 50 plies in a
 * row of only king moves without a capture is a draw.
 */

export type Player = 0 | 1

export type Piece = { owner: Player; king: boolean }

/** A move: the squares the piece visits, from start to finish (0-based). A plain move has 2 entries; a capture lists every landing square. */
export type DamMove = number[]

export type DamState = {
  /** 50 entries, one per dark square */
  board: (Piece | null)[]
  /** Which player has the white pieces (moves first). */
  white: Player
  turn: Player
  over: boolean
  /** null while playing or for a draw */
  winner: Player | null
  moves: DamMove[]
  /** Plies in a row with only king moves and no captures */
  quietKingPlies: number
}

/** What one move did, for the animation and the achievements. */
export type MoveResult = {
  state: DamState
  /** Squares of the pieces taken, in the order they were jumped. */
  captured: number[]
  crowned: boolean
}

/** A legal move with the pieces it takes. */
export type LegalMove = { path: DamMove; captured: number[] }

export const SQUARES = 50
export const SIZE = 10
/** Plies of only king moves without a capture that end the game in a draw. */
export const QUIET_KING_DRAW = 50

const other = (p: Player): Player => (p === 0 ? 1 : 0)

/** Row/column on a 10×10 grid (row 0 = top = Black's back row, from White's view) and back. */
export function squareToRC(sq: number): { r: number; c: number } {
  const r = Math.floor(sq / 5)
  const c = 2 * (sq % 5) + (r % 2 === 0 ? 1 : 0)
  return { r, c }
}

export function rcToSquare(r: number, c: number): number | null {
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null
  if ((r + c) % 2 === 0) return null
  return r * 5 + Math.floor(c / 2)
}

export const isWhite = (s: DamState, p: Player) => s.white === p

/** The four diagonal directions as [dr, dc]; the order fixes which of two equal paths is found first. */
const DIRS: [number, number][] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** Neighbour of a square one step in a direction, or null off the board. */
const NEXT: (number | null)[][] = Array.from({ length: SQUARES }, (_, sq) => {
  const { r, c } = squareToRC(sq)
  return DIRS.map(([dr, dc]) => rcToSquare(r + dr, c + dc))
})

/** Row direction a player's men move in: White up, Black down. */
const forward = (s: DamState, p: Player) => (isWhite(s, p) ? -1 : 1)

/** The far row where a player's men are crowned. */
const onFarRow = (s: DamState, p: Player, sq: number) => (isWhite(s, p) ? sq < 5 : sq >= 45)

function emptyBoard(): (Piece | null)[] {
  return Array.from({ length: SQUARES }, () => null)
}

export function initialState(first: Player): DamState {
  const board = emptyBoard()
  const black = other(first)
  for (let i = 0; i < 20; i++) board[i] = { owner: black, king: false }
  for (let i = 30; i < 50; i++) board[i] = { owner: first, king: false }
  return { board, white: first, turn: first, over: false, winner: null, moves: [], quietKingPlies: 0 }
}

/**
 * A position to start from, for tests and puzzles: `board` has 50 entries,
 * `white` has the white pieces and `turn` moves next. The game is marked over
 * straight away if the player to move has no legal move.
 */
export function fromPosition(board: (Piece | null)[], white: Player, turn: Player): DamState {
  if (board.length !== SQUARES) throw new Error(`Bord moet ${SQUARES} velden hebben`)
  const s: DamState = {
    board: board.map((p) => (p ? { owner: p.owner, king: p.king } : null)),
    white,
    turn,
    over: false,
    winner: null,
    moves: [],
    quietKingPlies: 0,
  }
  if (legalMoves(s).length === 0) return { ...s, over: true, winner: other(turn) }
  return s
}

/** Every complete capture sequence for the piece on `from`, longest or not. */
function captureSequences(s: DamState, from: number): LegalMove[] {
  const piece = s.board[from]!
  const out: LegalMove[] = []
  const taken = new Set<number>()
  // The moving piece has left its start square, so that square counts as empty
  const isEmpty = (sq: number) => sq === from || s.board[sq] === null
  const isPrey = (sq: number) => {
    const p = s.board[sq]
    return sq !== from && p !== null && p.owner !== piece.owner && !taken.has(sq)
  }

  const walk = (at: number, path: number[], captured: number[]) => {
    let extended = false
    for (let d = 0; d < 4; d++) {
      let sq = NEXT[at][d]
      if (piece.king) {
        while (sq !== null && isEmpty(sq)) sq = NEXT[sq][d]
      }
      if (sq === null || !isPrey(sq)) continue
      let land = NEXT[sq][d]
      while (land !== null && isEmpty(land)) {
        extended = true
        taken.add(sq)
        walk(land, [...path, land], [...captured, sq])
        taken.delete(sq)
        if (!piece.king) break
        land = NEXT[land][d]
      }
    }
    if (!extended && captured.length > 0) out.push({ path, captured })
  }

  walk(from, [from], [])
  return out
}

export function legalMoves(s: DamState): LegalMove[] {
  if (s.over) return []
  const me = s.turn
  let captures: LegalMove[] = []
  for (let sq = 0; sq < SQUARES; sq++) {
    const p = s.board[sq]
    if (p && p.owner === me) captures.push(...captureSequences(s, sq))
  }
  if (captures.length > 0) {
    const most = Math.max(...captures.map((m) => m.captured.length))
    captures = captures.filter((m) => m.captured.length === most)
    // Two sequences with the same landing squares are one move; keep the first
    const seen = new Set<string>()
    return captures.filter((m) => {
      const key = m.path.join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const moves: LegalMove[] = []
  const fwd = forward(s, me)
  for (let sq = 0; sq < SQUARES; sq++) {
    const p = s.board[sq]
    if (!p || p.owner !== me) continue
    for (let d = 0; d < 4; d++) {
      if (!p.king && DIRS[d][0] !== fwd) continue
      let to = NEXT[sq][d]
      while (to !== null && s.board[to] === null) {
        moves.push({ path: [sq, to], captured: [] })
        if (!p.king) break
        to = NEXT[to][d]
      }
    }
  }
  return moves
}

const samePath = (a: number[], b: unknown) =>
  Array.isArray(b) && a.length === b.length && a.every((sq, i) => sq === b[i])

const findMove = (s: DamState, path: DamMove) => legalMoves(s).find((m) => samePath(m.path, path))

export const isLegal = (s: DamState, path: DamMove) => findMove(s, path) !== undefined

export function applyMove(s: DamState, path: DamMove): MoveResult {
  const move = findMove(s, path)
  if (!move) throw new Error(`Ongeldige zet: ${Array.isArray(path) ? path.map((sq) => sq + 1).join('-') : String(path)}`)
  const me = s.turn
  const board = [...s.board]
  const from = move.path[0]
  const to = move.path[move.path.length - 1]
  const piece = board[from]!
  board[from] = null
  for (const sq of move.captured) board[sq] = null
  const crowned = !piece.king && onFarRow(s, me, to)
  board[to] = { owner: me, king: piece.king || crowned }

  const quietKingPlies = piece.king && move.captured.length === 0 ? s.quietKingPlies + 1 : 0
  const next: DamState = {
    board,
    white: s.white,
    turn: other(me),
    over: false,
    winner: null,
    moves: [...s.moves, [...move.path]],
    quietKingPlies,
  }
  // No legal move for the opponent (no pieces or all blocked) loses; that wins over the draw rule
  if (legalMoves(next).length === 0) {
    next.over = true
    next.winner = me
  } else if (quietKingPlies >= QUIET_KING_DRAW) {
    next.over = true
  }
  return { state: next, captured: [...move.captured], crowned }
}

export const pieceCount = (s: DamState, p: Player) => s.board.filter((x) => x !== null && x.owner === p).length

/** Per-player highlights of a game, for the achievements. */
export type GameHighlights = { bestCapture: number; kings: number }

/**
 * Plays a list of moves from the start. Throws on the first illegal move,
 * so a list that comes back is a real game.
 */
export function replay(moves: DamMove[], first: Player): { state: DamState; highlights: Record<Player, GameHighlights> } {
  let state = initialState(first)
  const highlights: Record<Player, GameHighlights> = { 0: { bestCapture: 0, kings: 0 }, 1: { bestCapture: 0, kings: 0 } }
  for (const path of moves) {
    const mover = state.turn
    const result = applyMove(state, path)
    const h = highlights[mover]
    h.bestCapture = Math.max(h.bestCapture, result.captured.length)
    if (result.crowned) h.kings++
    state = result.state
  }
  return { state, highlights }
}
