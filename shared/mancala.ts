/**
 * Mancala (Kalah, 6 pits × 4 seeds). The same rules run in both browsers and
 * on the server: players send each other only the pit they picked, and the
 * server replays the whole list of moves to check a result before it counts.
 *
 * Board: index 0–5 are player 0's pits (left to right from their side),
 * 6 is player 0's store, 7–12 are player 1's pits and 13 is player 1's store.
 * Seeds go counter-clockwise and skip the opponent's store.
 */

export type Player = 0 | 1

export type MancalaState = {
  pits: number[]
  turn: Player
  over: boolean
  moves: number[]
}

/** What one move did, for the animation and the achievements. */
export type MoveResult = {
  state: MancalaState
  /** Every pit a seed landed in, in order. */
  path: number[]
  /** Seeds taken from the opposite pit (plus the one that landed), 0 if none. */
  captured: number
  extraTurn: boolean
}

export const PITS = 6
export const SEEDS = 4
export const TOTAL_SEEDS = PITS * SEEDS * 2
export const STORE: Record<Player, number> = { 0: 6, 1: 13 }

export const pitsOf = (p: Player) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12])
export const ownerOf = (index: number): Player => (index <= 6 ? 0 : 1)
export const opposite = (index: number) => 12 - index

export function initialState(first: Player): MancalaState {
  const pits = Array.from({ length: 14 }, (_, i) => (i === 6 || i === 13 ? 0 : SEEDS))
  return { pits, turn: first, over: false, moves: [] }
}

export const legalMoves = (s: MancalaState) => (s.over ? [] : pitsOf(s.turn).filter((i) => s.pits[i] > 0))
export const isLegal = (s: MancalaState, pit: number) => legalMoves(s).includes(pit)

export function applyMove(s: MancalaState, pit: number): MoveResult {
  if (!isLegal(s, pit)) throw new Error(`Ongeldige zet: ${pit}`)
  const me = s.turn
  const pits = [...s.pits]
  const skip = STORE[me === 0 ? 1 : 0]
  let seeds = pits[pit]
  pits[pit] = 0
  let at = pit
  const path: number[] = []
  while (seeds > 0) {
    at = (at + 1) % 14
    if (at === skip) continue
    pits[at]++
    seeds--
    path.push(at)
  }

  // Landing in your own empty pit takes the seeds opposite, if there are any
  let captured = 0
  if (at !== STORE[me] && ownerOf(at) === me && pits[at] === 1 && pits[opposite(at)] > 0) {
    captured = pits[opposite(at)] + 1
    pits[STORE[me]] += captured
    pits[at] = 0
    pits[opposite(at)] = 0
  }

  const extraTurn = at === STORE[me]
  let over = false
  // When one side is empty, the other player keeps what's left on theirs
  if (pitsOf(0).every((i) => pits[i] === 0) || pitsOf(1).every((i) => pits[i] === 0)) {
    over = true
    for (const p of [0, 1] as Player[]) {
      for (const i of pitsOf(p)) {
        pits[STORE[p]] += pits[i]
        pits[i] = 0
      }
    }
  }
  const turn: Player = over || extraTurn ? me : me === 0 ? 1 : 0
  return { state: { pits, turn, over, moves: [...s.moves, pit] }, path, captured, extraTurn }
}

export const score = (s: MancalaState, p: Player) => s.pits[STORE[p]]

/** The winner once the game is over; null for a draw (24–24). */
export function winner(s: MancalaState): Player | null {
  const a = score(s, 0)
  const b = score(s, 1)
  return a === b ? null : a > b ? 0 : 1
}

/** Per-player highlights of a game, for the achievements. */
export type GameHighlights = { bestCapture: number; longestChain: number }

/**
 * Plays a list of moves from the start. Throws on the first illegal move,
 * so a list that comes back is a real game.
 */
export function replay(moves: number[], first: Player): { state: MancalaState; highlights: Record<Player, GameHighlights> } {
  let state = initialState(first)
  const highlights: Record<Player, GameHighlights> = { 0: { bestCapture: 0, longestChain: 0 }, 1: { bestCapture: 0, longestChain: 0 } }
  let chain = 0
  for (const pit of moves) {
    const mover = state.turn
    const result = applyMove(state, pit)
    const h = highlights[mover]
    h.bestCapture = Math.max(h.bestCapture, result.captured)
    chain = result.extraTurn ? chain + 1 : 0
    h.longestChain = Math.max(h.longestChain, chain)
    state = result.state
  }
  return { state, highlights }
}

/** Who moves first in a game: decided by its id, so both sides agree without asking. */
export const firstPlayer = (gameId: number): Player => (gameId % 2 === 0 ? 0 : 1)
