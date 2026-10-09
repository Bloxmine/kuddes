/**
 * The turn-based games played peer to peer, behind one interface so the
 * server can replay any of them (server/routes/games.ts).
 */
import * as dammen from './dammen'
import * as mancala from '../mancala'
import * as pool from './pool'
import * as schaken from './schaken'
import * as vier from './vieropeenrij'

export type Player = 0 | 1

export type Outcome = {
  over: boolean
  winner: Player | null
  /** Score per player (Mancala: the stores; Dammen: pieces left; Vier op een rij: 1 for the winner). */
  scores: [number, number]
  /** Numbers for achievements; the highest over all games counts. */
  highlights: Record<Player, Record<string, number>>
}

export type TurnRules = {
  /** Plays the moves from the start; throws on anything illegal. */
  replay(moves: unknown[], first: Player): Outcome
}

const ints = (v: unknown): v is number => Number.isInteger(v)

export const TURN_RULES = {
  mancala: {
    replay(moves, first) {
      if (!moves.every(ints)) throw new Error('Ongeldige zet')
      const { state, highlights } = mancala.replay(moves as number[], first)
      return { over: state.over, winner: mancala.winner(state), scores: [mancala.score(state, 0), mancala.score(state, 1)], highlights }
    },
  },
  vieropeenrij: {
    replay(moves, first) {
      if (!moves.every(ints)) throw new Error('Ongeldige zet')
      const { state, highlights } = vier.replay(moves as number[], first)
      return { over: state.over, winner: state.winner, scores: [state.winner === 0 ? 1 : 0, state.winner === 1 ? 1 : 0], highlights }
    },
  },
  dammen: {
    replay(moves, first) {
      if (!moves.every((m) => Array.isArray(m) && m.length >= 2 && m.length <= 30 && m.every(ints))) throw new Error('Ongeldige zet')
      const { state, highlights } = dammen.replay(moves as number[][], first)
      return {
        over: state.over,
        winner: state.winner,
        scores: [dammen.pieceCount(state, 0), dammen.pieceCount(state, 1)],
        highlights: { 0: { ...highlights[0] }, 1: { ...highlights[1] } },
      }
    },
  },
  schaken: {
    replay(moves, first) {
      if (!moves.every((m) => Array.isArray(m) && (m.length === 2 || m.length === 3) && m.every(ints))) throw new Error('Ongeldige zet')
      const { state, highlights } = schaken.replay(moves as schaken.ChessMove[], first)
      return { over: state.over, winner: state.winner, scores: [schaken.materialTaken(state, 0), schaken.materialTaken(state, 1)], highlights: { 0: { ...highlights[0] }, 1: { ...highlights[1] } } }
    },
  },
  pool: poolRules(8),
  pool9: poolRules(9),
} satisfies Record<string, TurnRules>

/** 8-ball or 9-ball: the score is the balls each player potted. */
function poolRules(variant: pool.Variant): TurnRules {
  return {
    replay(moves, first) {
      const { state, highlights } = pool.replay(moves as pool.Shot[], first, variant)
      return { over: state.over, winner: state.winner, scores: [state.pottedBy[0].length, state.pottedBy[1].length], highlights: { 0: { ...highlights[0] }, 1: { ...highlights[1] } } }
    },
  }
}

export type TurnKind = keyof typeof TURN_RULES
export const isTurnKind = (v: string): v is TurnKind => v in TURN_RULES
