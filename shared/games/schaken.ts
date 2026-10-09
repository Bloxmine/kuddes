/**
 * Schaken (chess), FIDE rules. The same rules run in both browsers and on
 * the server: players send each other only [from, to] (plus the piece a pawn
 * becomes), and the server replays the whole game before a result counts.
 *
 * Squares are 0–63: square = row * 8 + column, row 0 is Black's back rank
 * (rank 8) and column 0 is the a-file, as seen from White's side. The player
 * who moves first plays White.
 *
 * In it: castling, en passant, promotion (to any piece), check, checkmate and
 * stalemate, and the draws by insufficient material, the fifty-move rule and
 * threefold repetition (claimed automatically).
 */

export type Player = 0 | 1
export type PieceType = 'k' | 'q' | 'r' | 'b' | 'n' | 'p'
export type Piece = { owner: Player; type: PieceType }

/** A move: from, to, and for a promotion the new piece (0 queen, 1 rook, 2 bishop, 3 knight). */
export type ChessMove = [from: number, to: number] | [from: number, to: number, promo: number]

export const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n']

export type EndReason = 'schaakmat' | 'pat' | 'materiaal' | 'vijftig' | 'herhaling'

export type ChessState = {
  board: (Piece | null)[]
  /** Which player has White (moves first). */
  white: Player
  turn: Player
  over: boolean
  /** null while playing or for a draw */
  winner: Player | null
  reason: EndReason | null
  /** Whether the player to move is in check. */
  check: boolean
  /** Castling still allowed: [White king side, White queen side, Black king side, Black queen side]. */
  castling: [boolean, boolean, boolean, boolean]
  /** The square a pawn may be taken on en passant (the one it skipped), or null. */
  ep: number | null
  /** Plies since the last capture or pawn move (fifty-move rule). */
  quiet: number
  /** How often each position occurred (threefold repetition). */
  seen: Record<string, number>
  moves: ChessMove[]
}

/** What one move did, for the animation, the sounds and the achievements. */
export type MoveResult = { state: ChessState; captured: Piece | null; castled: boolean; promoted: boolean; enPassant: boolean }

const other = (p: Player): Player => (p === 0 ? 1 : 0)
export const rowOf = (sq: number) => sq >> 3
export const colOf = (sq: number) => sq & 7
const at = (r: number, c: number) => (r < 0 || r > 7 || c < 0 || c > 7 ? -1 : r * 8 + c)

/** Material, for the score on the player cards. */
export const VALUES: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

const BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']

export function initialState(first: Player): ChessState {
  const black = other(first)
  const board: (Piece | null)[] = Array(64).fill(null)
  for (let c = 0; c < 8; c++) {
    board[at(0, c)] = { owner: black, type: BACK[c] }
    board[at(1, c)] = { owner: black, type: 'p' }
    board[at(6, c)] = { owner: first, type: 'p' }
    board[at(7, c)] = { owner: first, type: BACK[c] }
  }
  const s: ChessState = { board, white: first, turn: first, over: false, winner: null, reason: null, check: false, castling: [true, true, true, true], ep: null, quiet: 0, seen: {}, moves: [] }
  s.seen[positionKey(s)] = 1
  return s
}

/** Pawns of `p` move towards row 0 when they're White. */
const forward = (s: ChessState, p: Player) => (p === s.white ? -1 : 1)

const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
]
const KING = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
]
const ROOK_DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const BISHOP_DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

/** Whether `by` attacks square `sq` on this board. */
export function attacked(s: ChessState, board: (Piece | null)[], sq: number, by: Player): boolean {
  const r = rowOf(sq)
  const c = colOf(sq)
  const is = (i: number, types: PieceType[]) => i >= 0 && board[i]?.owner === by && types.includes(board[i]!.type)
  // Pawns attack diagonally forward (for them): look back from here
  const f = forward(s, by)
  if (is(at(r - f, c - 1), ['p']) || is(at(r - f, c + 1), ['p'])) return true
  for (const [dr, dc] of KNIGHT) if (is(at(r + dr, c + dc), ['n'])) return true
  for (const [dr, dc] of KING) if (is(at(r + dr, c + dc), ['k'])) return true
  const slide = (dirs: number[][], types: PieceType[]) =>
    dirs.some(([dr, dc]) => {
      for (let k = 1; k < 8; k++) {
        const i = at(r + dr * k, c + dc * k)
        if (i < 0) return false
        const p = board[i]
        if (p) return p.owner === by && types.includes(p.type)
      }
      return false
    })
  return slide(ROOK_DIRS, ['r', 'q']) || slide(BISHOP_DIRS, ['b', 'q'])
}

const kingOf = (board: (Piece | null)[], p: Player) => board.findIndex((x) => x?.owner === p && x.type === 'k')

/** Moves that follow how the pieces move, before checking your own king. */
function pseudoMoves(s: ChessState, p: Player): ChessMove[] {
  const out: ChessMove[] = []
  const b = s.board
  for (let sq = 0; sq < 64; sq++) {
    const piece = b[sq]
    if (!piece || piece.owner !== p) continue
    const r = rowOf(sq)
    const c = colOf(sq)
    const target = (i: number) => i >= 0 && b[i]?.owner !== p
    if (piece.type === 'p') {
      const f = forward(s, p)
      const lastRow = f === -1 ? 0 : 7
      const push = (to: number) => {
        if (rowOf(to) === lastRow) for (let k = 0; k < 4; k++) out.push([sq, to, k])
        else out.push([sq, to])
      }
      const one = at(r + f, c)
      if (one >= 0 && !b[one]) {
        push(one)
        const startRow = f === -1 ? 6 : 1
        const two = at(r + 2 * f, c)
        if (r === startRow && !b[two]) out.push([sq, two])
      }
      for (const dc of [-1, 1]) {
        const d = at(r + f, c + dc)
        if (d < 0) continue
        if ((b[d] && b[d]!.owner !== p) || d === s.ep) push(d)
      }
    } else if (piece.type === 'n' || piece.type === 'k') {
      for (const [dr, dc] of piece.type === 'n' ? KNIGHT : KING) {
        const i = at(r + dr, c + dc)
        if (target(i)) out.push([sq, i])
      }
    } else {
      const dirs = piece.type === 'r' ? ROOK_DIRS : piece.type === 'b' ? BISHOP_DIRS : [...ROOK_DIRS, ...BISHOP_DIRS]
      for (const [dr, dc] of dirs) {
        for (let k = 1; k < 8; k++) {
          const i = at(r + dr * k, c + dc * k)
          if (i < 0) break
          if (b[i]) {
            if (b[i]!.owner !== p) out.push([sq, i])
            break
          }
          out.push([sq, i])
        }
      }
    }
  }
  // Castling: king and rook unmoved, nothing between, and the king doesn't pass through check
  const isWhite = p === s.white
  const row = isWhite ? 7 : 0
  const king = at(row, 4)
  if (b[king]?.type === 'k' && b[king]?.owner === p && !attacked(s, b, king, other(p))) {
    const [kSide, qSide] = isWhite ? [s.castling[0], s.castling[1]] : [s.castling[2], s.castling[3]]
    const rookAt = (col: number) => b[at(row, col)]?.type === 'r' && b[at(row, col)]?.owner === p
    if (kSide && rookAt(7) && !b[at(row, 5)] && !b[at(row, 6)] && !attacked(s, b, at(row, 5), other(p))) out.push([king, at(row, 6)])
    if (qSide && rookAt(0) && !b[at(row, 1)] && !b[at(row, 2)] && !b[at(row, 3)] && !attacked(s, b, at(row, 3), other(p))) out.push([king, at(row, 2)])
  }
  return out
}

/** The board after a move (no checks on whether it's allowed). */
function boardAfter(s: ChessState, m: ChessMove): (Piece | null)[] {
  const b = [...s.board]
  const [from, to] = m
  const piece = b[from]!
  // En passant: the pawn taken isn't on the square moved to
  if (piece.type === 'p' && to === s.ep && !b[to]) b[at(rowOf(from), colOf(to))] = null
  // Castling: the rook comes along
  if (piece.type === 'k' && Math.abs(colOf(to) - colOf(from)) === 2) {
    const row = rowOf(from)
    if (colOf(to) === 6) {
      b[at(row, 5)] = b[at(row, 7)]
      b[at(row, 7)] = null
    } else {
      b[at(row, 3)] = b[at(row, 0)]
      b[at(row, 0)] = null
    }
  }
  b[to] = m.length === 3 ? { owner: piece.owner, type: PROMOTIONS[m[2]] } : piece
  b[from] = null
  return b
}

export function legalMoves(s: ChessState): ChessMove[] {
  if (s.over) return []
  const p = s.turn
  return pseudoMoves(s, p).filter((m) => {
    const b = boardAfter(s, m)
    return !attacked(s, b, kingOf(b, p), other(p))
  })
}

const sameMove = (a: ChessMove, b: ChessMove) => a[0] === b[0] && a[1] === b[1] && (a[2] ?? -1) === (b[2] ?? -1)
export const isLegal = (s: ChessState, m: ChessMove) => Array.isArray(m) && legalMoves(s).some((x) => sameMove(x, m))

/** The position for repetition: pieces, whose turn, castling and en passant. */
function positionKey(s: ChessState): string {
  const pieces = s.board.map((p) => (p ? (p.owner === s.white ? p.type.toUpperCase() : p.type) : '.')).join('')
  return `${pieces} ${s.turn === s.white ? 'w' : 'b'} ${s.castling.map((c) => (c ? 1 : 0)).join('')} ${s.ep ?? '-'}`
}

/** Neither side can ever mate: kings alone, or a single bishop or knight, or bishops all on one colour. */
function insufficient(board: (Piece | null)[]): boolean {
  const pieces = board.map((p, i) => (p && p.type !== 'k' ? { ...p, i } : null)).filter((p): p is Piece & { i: number } => !!p)
  if (pieces.some((p) => p.type === 'p' || p.type === 'r' || p.type === 'q')) return false
  if (pieces.length <= 1) return true
  // Only bishops, all on squares of the same colour
  return pieces.every((p) => p.type === 'b') && new Set(pieces.map((p) => (rowOf(p.i) + colOf(p.i)) % 2)).size === 1
}

export function applyMove(s: ChessState, m: ChessMove): MoveResult {
  if (!isLegal(s, m)) throw new Error('Ongeldige zet')
  const [from, to] = m
  const piece = s.board[from]!
  const enPassant = piece.type === 'p' && to === s.ep && !s.board[to]
  const captured = enPassant ? s.board[at(rowOf(from), colOf(to))] : s.board[to]
  const castled = piece.type === 'k' && Math.abs(colOf(to) - colOf(from)) === 2
  const board = boardAfter(s, m)

  // Moving the king or a rook (or losing a rook) ends castling on that side
  const castling: ChessState['castling'] = [...s.castling]
  const touch = (sq: number) => {
    if (sq === 63) castling[0] = false
    if (sq === 56) castling[1] = false
    if (sq === 7) castling[2] = false
    if (sq === 0) castling[3] = false
    if (sq === 60) castling[0] = castling[1] = false
    if (sq === 4) castling[2] = castling[3] = false
  }
  touch(from)
  touch(to)

  const doubleStep = piece.type === 'p' && Math.abs(rowOf(to) - rowOf(from)) === 2
  const next: ChessState = {
    ...s,
    board,
    turn: other(s.turn),
    castling,
    ep: doubleStep ? (from + to) / 2 : null,
    quiet: piece.type === 'p' || captured ? 0 : s.quiet + 1,
    seen: { ...s.seen },
    moves: [...s.moves, m],
  }
  const key = positionKey(next)
  next.seen[key] = (next.seen[key] ?? 0) + 1

  const mover = s.turn
  const opponent = other(mover)
  next.check = attacked(next, board, kingOf(board, opponent), mover)
  const replies = legalMoves(next)
  if (replies.length === 0) {
    next.over = true
    next.winner = next.check ? mover : null
    next.reason = next.check ? 'schaakmat' : 'pat'
  } else if (insufficient(board)) {
    next.over = true
    next.reason = 'materiaal'
  } else if (next.quiet >= 100) {
    next.over = true
    next.reason = 'vijftig'
  } else if (next.seen[key] >= 3) {
    next.over = true
    next.reason = 'herhaling'
  }
  return { state: next, captured, castled, promoted: m.length === 3, enPassant }
}

/** Material a player has taken, for the score. */
export function materialTaken(s: ChessState, p: Player): number {
  const start = 39
  const left = s.board.reduce((n, x) => n + (x && x.owner !== p ? VALUES[x.type] : 0), 0)
  return start - left
}

export type GameHighlights = { captures: number; promotions: number; mate: number }

/** Plays a list of moves from the start. Throws on the first illegal move. */
export function replay(moves: ChessMove[], first: Player): { state: ChessState; highlights: Record<Player, GameHighlights> } {
  let state = initialState(first)
  const highlights: Record<Player, GameHighlights> = { 0: { captures: 0, promotions: 0, mate: 0 }, 1: { captures: 0, promotions: 0, mate: 0 } }
  for (const m of moves) {
    const mover = state.turn
    const r = applyMove(state, m)
    if (r.captured) highlights[mover].captures++
    if (r.promoted) highlights[mover].promotions++
    if (r.state.reason === 'schaakmat') highlights[mover].mate = 1
    state = r.state
  }
  return { state, highlights }
}

/** "e4", "Pxd5"… the square name, for screen readers and the move list. */
export const squareName = (sq: number) => `${'abcdefgh'[colOf(sq)]}${8 - rowOf(sq)}`
