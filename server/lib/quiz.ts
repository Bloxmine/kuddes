/**
 * Kuddes Quiz, run by the server: it picks ten questions, shows them to all
 * players (two to four) at the same time, keeps the right answers to itself
 * until the round is over and hands out the points (quicker = more). Whoever
 * gives up or leaves a quiz with more players drops out; the others go on.
 */
import { randomInt } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { ANSWER_MS, QUIZ_ROUNDS, REVEAL_MS, START_MS, quizPoints, type QuizView } from '../../shared/games/quiz'
import { QUIZ_CATEGORIES, QUIZ_QUESTIONS } from '../data/quizQuestions'
import { db } from '../db/client'
import { gamePlayers, games } from '../db/schema'
import { HttpError } from './errors'
import { announce, finishGame, isOnline, loadGame, rooms, seatOf, send, userOfSeat, withGameLock, type GameRow, type Joined } from './gameCore'

/** Per seat: what they picked, when, and the points it got. */
type Round = { q: number; order: number[]; picks: (number | null)[]; at: (number | null)[]; points: number[] }
type Secret = {
  phase: 'wachten' | 'aftellen' | 'vraag' | 'uitslag' | 'klaar'
  /** Players, and who dropped out (gave up or left). */
  count: number
  out: boolean[]
  rounds: Round[]
  round: number
  /** When the current phase ends. */
  until: number
  /** When the current question was shown. */
  shownAt: number
}

const shuffle = <T>(list: T[]) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Ten questions from as many different categories as possible. */
function pickQuestions(count: number): Round[] {
  const byCategory = new Map<string, number[]>()
  QUIZ_QUESTIONS.forEach((q, i) => byCategory.set(q.category, [...(byCategory.get(q.category) ?? []), i]))
  const pools = shuffle([...byCategory.values()].map(shuffle))
  const picked: number[] = []
  for (let k = 0; picked.length < QUIZ_ROUNDS; k++) {
    const pool = pools[k % pools.length]
    const next = pool.shift()
    if (next !== undefined) picked.push(next)
    if (pools.every((p) => p.length === 0)) break
  }
  return picked.map((q) => ({ q, order: shuffle([0, 1, 2, 3]), picks: Array(count).fill(null), at: Array(count).fill(null), points: Array(count).fill(0) }))
}

/** Everyone who said yes plays; quizzes from before there could be more players had two. */
function secretOf(j: Joined): Secret {
  const saved = j.game.secret as (Secret & { count?: number }) | null
  if (saved) return { ...saved, count: saved.count ?? 2, out: saved.out ?? [false, false] }
  const count = Math.max(2, j.players.filter((p) => p.status === 'meedoen' || p.status === 'weg').length)
  return { phase: 'wachten', count, out: Array(count).fill(false), rounds: pickQuestions(count), round: 0, until: 0, shownAt: 0 }
}
const seats = (s: Secret) => Array.from({ length: s.count }, (_, p) => p)
const playing = (s: Secret) => seats(s).filter((p) => !s.out[p])

async function save(g: GameRow, s: Secret) {
  await db.update(games).set({ secret: s }).where(eq(games.id, g.id))
}

const totals = (s: Secret) => {
  const scores = Array<number>(s.count).fill(0)
  const correct = Array<number>(s.count).fill(0)
  for (const r of s.rounds.slice(0, s.phase === 'klaar' ? s.rounds.length : s.phase === 'uitslag' ? s.round + 1 : s.round)) {
    for (const p of seats(s)) {
      scores[p] += r.points[p]
      if (r.picks[p] !== null && r.order[r.picks[p]!] === 0) correct[p]++
    }
  }
  return { scores, correct }
}

export function quizView(j: Joined, userId: number): QuizView {
  const g = j.game
  const s = secretOf(j)
  const you = seatOf(j, userId) ?? 0
  const { scores, correct } = totals(s)
  const r = s.rounds[s.round]
  const showing = s.phase === 'vraag' || s.phase === 'uitslag'
  const question = showing && r ? QUIZ_QUESTIONS[r.q] : null
  return {
    phase: g.status === 'klaar' ? 'klaar' : s.phase,
    you,
    scores,
    correct,
    out: s.out,
    current:
      question && r
        ? {
            round: s.round,
            question: question.q,
            category: QUIZ_CATEGORIES[question.category],
            answers: r.order.map((i) => question.answers[i]),
            deadline: s.phase === 'vraag' ? s.until : s.shownAt + ANSWER_MS,
            mine: r.picks[you],
            answered: r.picks.map((p) => p !== null),
            opponentAnswered: playing(s).every((p) => p === you || r.picks[p] !== null),
            reveal: s.phase === 'uitslag' ? { correct: r.order.indexOf(0), picks: r.picks, points: r.points } : null,
          }
        : null,
    next: s.phase === 'aftellen' || s.phase === 'uitslag' ? s.until : null,
    serverNow: Date.now(),
  }
}

async function broadcast(gameId: number) {
  const j = await loadGame(gameId)
  for (const p of j.players) if (p.status !== 'geweigerd') send(gameId, p.userId, 'state', quizView(j, p.userId))
}

// ------------------------------------------------------------------ the clock

const timers = new Map<number, ReturnType<typeof setTimeout>>()

function schedule(gameId: number, at: number) {
  clearTimeout(timers.get(gameId))
  timers.set(
    gameId,
    setTimeout(() => void step(gameId).catch((e) => console.error('quiz step failed', e)), Math.max(0, at - Date.now())),
  )
}

/** Moves the quiz on when the current phase's time is up. */
function step(gameId: number) {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    const game = j.game
    if (game.status !== 'bezig') return
    const s = secretOf(j)
    if (Date.now() < s.until - 50 && s.phase !== 'wachten') return schedule(gameId, s.until)
    if (s.phase === 'aftellen') showQuestion(s)
    else if (s.phase === 'vraag') reveal(s)
    else if (s.phase === 'uitslag') {
      if (s.round + 1 >= s.rounds.length) return end(j, s)
      s.round++
      showQuestion(s)
    } else return
    await save(game, s)
    schedule(gameId, s.until)
    await broadcast(gameId)
  })
}

function showQuestion(s: Secret) {
  s.phase = 'vraag'
  s.shownAt = Date.now()
  s.until = s.shownAt + ANSWER_MS
}

function reveal(s: Secret) {
  const r = s.rounds[s.round]
  for (const p of seats(s)) {
    const pick = r.picks[p]
    r.points[p] = pick === null ? 0 : quizPoints(r.order[pick] === 0, s.shownAt + ANSWER_MS - (r.at[p] ?? Infinity))
  }
  s.phase = 'uitslag'
  s.until = Date.now() + REVEAL_MS
}

/** The highest score wins (among who's still playing); a tie at the top is a draw. */
function winnerOf(s: Secret, scores: number[]) {
  const left = playing(s)
  if (left.length === 1) return left[0]
  const best = Math.max(...left.map((p) => scores[p]))
  const top = left.filter((p) => scores[p] === best)
  return top.length === 1 ? top[0] : null
}

async function end(j: Joined, s: Secret, reason: 'uitgespeeld' | 'opgegeven' | 'verlaten' = 'uitgespeeld') {
  const game = j.game
  s.phase = 'klaar'
  await save(game, s)
  stopQuiz(game.id)
  const { scores, correct } = totals(s)
  const winner = winnerOf(s, scores)
  await finishGame(game, {
    winnerId: winner === null ? null : userOfSeat(j, winner),
    scores,
    moves: s.rounds.map((r) => ({ q: r.q, picks: r.picks, points: r.points })),
    highlights: Object.fromEntries(seats(s).map((p) => [p, { correct: correct[p] }])),
    reason,
  })
  await broadcast(game.id)
}

/**
 * Called when someone joins the room: the quiz starts once both players are
 * there, and picks up where it was after a server restart.
 */
export function quizJoined(gameId: number) {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    const game = j.game
    if (game.status !== 'bezig') return
    const s = secretOf(j)
    const room = rooms.get(gameId)
    if (s.phase === 'wachten') {
      if (!game.secret) await save(game, s)
      // Everyone who plays must be here
      if (!j.players.filter((p) => p.status === 'meedoen').every((p) => isOnline(room, p.userId))) return broadcast(gameId)
      s.phase = 'aftellen'
      s.until = Date.now() + START_MS
      await save(game, s)
    }
    if (!timers.has(gameId)) schedule(gameId, s.until)
    await broadcast(gameId)
  })
}

export function answer(gameId: number, userId: number, round: number, choice: number) {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    const game = j.game
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const s = secretOf(j)
    if (s.phase !== 'vraag' || s.round !== round) throw new HttpError(409, 'Deze vraag is al voorbij.')
    if (Date.now() > s.until) throw new HttpError(409, 'Te laat!')
    if (!Number.isInteger(choice) || choice < 0 || choice > 3) throw new HttpError(400, 'Kies een antwoord.')
    const you = seatOf(j, userId)
    if (you === null || s.out[you]) throw new HttpError(403, 'Je speelt niet (meer) mee.')
    const r = s.rounds[s.round]
    if (r.picks[you] !== null) throw new HttpError(409, 'Je hebt al geantwoord.')
    r.picks[you] = choice
    r.at[you] = Date.now()
    // Everyone answered: no need to wait for the clock
    if (playing(s).every((p) => r.picks[p] !== null)) {
      reveal(s)
      schedule(gameId, s.until)
    }
    await save(game, s)
    await broadcast(gameId)
  })
}

export function quizScores(j: Joined): { scores: number[]; moves: unknown[]; correct: number[] } {
  const s = secretOf(j)
  const { scores, correct } = totals(s)
  return { scores, correct, moves: s.rounds.map((r) => ({ q: r.q, picks: r.picks, points: r.points })) }
}

/** A finished or stopped quiz no longer needs its clock. */
export function stopQuiz(gameId: number) {
  clearTimeout(timers.get(gameId))
  timers.delete(gameId)
}

/**
 * Players who gave up or left a quiz with more players: they drop out and the
 * others go on; with one left, that one wins.
 */
export function quizDrop(gameId: number, userIds: number[], reason: 'opgegeven' | 'verlaten') {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    if (j.game.status !== 'bezig') return
    const s = secretOf(j)
    for (const id of userIds) {
      const seat = seatOf(j, id)
      if (seat === null) continue
      s.out[seat] = true
      await db.update(gamePlayers).set({ status: 'weg' }).where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, id)))
    }
    if (playing(s).length <= 1) return end(await loadGame(gameId), s, reason)
    // Waiting only for who dropped out: on to the answer
    const r = s.rounds[s.round]
    if (s.phase === 'vraag' && playing(s).every((p) => r.picks[p] !== null)) {
      reveal(s)
      schedule(gameId, s.until)
    }
    await save(j.game, s)
    await announce(gameId)
    await broadcast(gameId)
  })
}
