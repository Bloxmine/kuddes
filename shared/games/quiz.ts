/** Kuddes Quiz: ten questions, all players (two to four) at once; the server keeps the answers (server/lib/quiz.ts). */

/** A seat: 0 invited the others. */
export type Player = number

export const QUIZ_ROUNDS = 10
export const ANSWER_MS = 20_000
export const REVEAL_MS = 4_500
export const START_MS = 3_000

/** Points for a right answer: 500, plus up to 500 for being quick. */
export const quizPoints = (correct: boolean, msLeft: number) => (correct ? 500 + Math.round((500 * Math.max(0, msLeft)) / ANSWER_MS) : 0)

export type QuizRoundView = {
  round: number
  question: string
  category: string
  answers: string[]
  /** When answering stops (server time, ms since 1970). */
  deadline: number
  /** Your pick; who has picked (not what); and whether everyone else has. */
  mine: number | null
  answered: boolean[]
  opponentAnswered: boolean
  /** After the round: the right answer and what everyone picked (per seat). */
  reveal: { correct: number; picks: (number | null)[]; points: number[] } | null
}

export type QuizView = {
  phase: 'wachten' | 'aftellen' | 'vraag' | 'uitslag' | 'klaar'
  you: Player
  /** Per seat. */
  scores: number[]
  correct: number[]
  /** Who dropped out (gave up or left). */
  out: boolean[]
  current: QuizRoundView | null
  /** When the next thing happens (countdown, next question). */
  next: number | null
  serverNow: number
}
