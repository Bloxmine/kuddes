/**
 * The games the server referees (Memory, Stapelgek, Kleurwissel, Mastermind,
 * Poker, Yacht Dice; rules in shared/games/): it keeps the shuffled cards in games.secret, runs every
 * action and sends each player only what they may see.
 */
import { randomInt } from 'node:crypto'
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { kleurwissel } from '../../shared/games/kleurwissel'
import { mastermind } from '../../shared/games/mastermind'
import { memory } from '../../shared/games/memory'
import { poker } from '../../shared/games/poker'
import { NotAllowed, type Referee } from '../../shared/games/referee'
import { stapelgek } from '../../shared/games/stapelgek'
import { yacht } from '../../shared/games/yacht'
import { db } from '../db/client'
import { games } from '../db/schema'
import { HttpError } from './errors'
import { announce, finishGame, loadGame, send, seatOf, userOfSeat, withGameLock, type Joined } from './gameCore'
import { gamePlayers } from '../db/schema'

export const REFEREES = { memory, stapelgek, kleurwissel, mastermind: mastermind('klassiek'), mastermind8: mastermind('modern'), poker, yacht } as unknown as Record<string, Referee<unknown, unknown>>
export type RefereeKind = 'memory' | 'stapelgek' | 'kleurwissel' | 'mastermind' | 'mastermind8' | 'poker' | 'yacht'
export const isRefereeKind = (kind: string): kind is RefereeKind => kind in REFEREES

/** Unpredictable shuffles: nobody can work out the deck from the game number. */
const random = () => randomInt(2 ** 31) / 2 ** 31

/**
 * The game's state, dealt the first time it's needed. Both players can ask at
 * the same moment (they connect together): only the first deal is kept.
 */
async function stateOf(j: Joined): Promise<unknown> {
  const g = j.game
  const saved = (g.secret as { state?: unknown } | null)?.state
  if (saved) return saved
  // Everyone who said yes, on seats 0, 1, 2…; who starts goes round with the game number
  const count = Math.max(2, j.players.filter((p) => p.status === 'meedoen').length)
  // Mastermind: `first` is the code maker, who swaps every game between the same two
  const maker = MASTERMIND_KINDS.includes(g.kind) ? await nextMaker(j) : null
  const state = REFEREES[g.kind].start(count, maker ?? g.id % count, random)
  const guesserId = maker === null ? undefined : userOfSeat(j, maker === 0 ? 1 : 0)
  const [dealt] = await db
    .update(games)
    .set({ secret: { state, ...(guesserId && { guesserId }) } })
    .where(and(eq(games.id, g.id), isNull(games.secret)))
    .returning({ id: games.id })
  if (dealt) return state
  const [row] = await db.select({ secret: games.secret }).from(games).where(eq(games.id, g.id))
  return (row.secret as { state: unknown }).state
}

const MASTERMIND_KINDS = ['mastermind', 'mastermind8']

/** The new state, keeping what else is stored next to it (Mastermind's guesserId). */
const keepSecret = (state: unknown) => sql`coalesce(${games.secret}, '{}'::jsonb) || ${JSON.stringify({ state })}::jsonb`

/**
 * Who makes the code this time: whoever guessed in the last Mastermind game
 * (classic or modern) between these two, however long ago and whatever they
 * played in between. The first time, the one who was challenged makes it
 * and the challenger guesses.
 */
async function nextMaker(j: Joined): Promise<number> {
  const a = userOfSeat(j, 0)
  const b = userOfSeat(j, 1)
  if (a === null || b === null) return 1
  const [last] = await db
    .select({ guesserId: sql<number>`(${games.secret} ->> 'guesserId')::int` })
    .from(games)
    .where(
      and(
        inArray(games.kind, MASTERMIND_KINDS),
        ne(games.id, j.game.id),
        sql`${games.secret} ->> 'guesserId' is not null`,
        or(and(eq(games.hostId, a), eq(games.guestId, b)), and(eq(games.hostId, b), eq(games.guestId, a))),
      ),
    )
    .orderBy(desc(games.id))
    .limit(1)
  if (!last) return 1
  return last.guesserId === a ? 0 : 1
}

/** What one player sees. */
export async function refereeView(j: Joined, userId: number) {
  const done = j.game.status !== 'bezig' && j.game.status !== 'uitgenodigd'
  return REFEREES[j.game.kind].view(await stateOf(j), seatOf(j, userId) ?? 0, done)
}

export async function broadcastReferee(gameId: number) {
  const j = await loadGame(gameId)
  for (const p of j.players) if (p.status !== 'geweigerd') send(gameId, p.userId, 'state', await refereeView(j, p.userId))
}

/** Stores the result when the state says it's over. */
async function finishIfOver(j: Joined, state: unknown, reason: 'uitgespeeld' | 'opgegeven' | 'verlaten') {
  const outcome = REFEREES[j.game.kind].outcome(state)
  if (!outcome.over) return false
  await finishGame(j.game, {
    winnerId: outcome.winner === null ? null : userOfSeat(j, outcome.winner),
    scores: outcome.scores,
    moves: [],
    highlights: outcome.highlights,
    reason,
  })
  return true
}

/** One action of a player: checked, played and sent to both. */
export function refereeAct(gameId: number, userId: number, action: unknown) {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    const game = j.game
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const rules = REFEREES[game.kind]
    const you = seatOf(j, userId)
    if (you === null || j.players.find((p) => p.userId === userId)?.status !== 'meedoen') throw new HttpError(403, 'Je speelt niet (meer) mee.')
    let state: unknown
    try {
      state = rules.act(await stateOf(j), you, action, random)
    } catch (e) {
      if (e instanceof NotAllowed) throw new HttpError(409, e.message)
      throw e
    }
    await db.update(games).set({ secret: keepSecret(state) }).where(eq(games.id, game.id))
    const over = await finishIfOver(j, state, 'uitgespeeld')
    await broadcastReferee(gameId)
    return rules.view(state, you, over)
  })
}

/** The score so far, for when someone resigns or leaves. */
export async function refereeScores(j: Joined): Promise<{ scores: number[]; highlights: Record<number, Record<string, number>> }> {
  const o = REFEREES[j.game.kind].outcome(await stateOf(j))
  return { scores: o.scores, highlights: o.highlights }
}

/**
 * Players who gave up or left a game with more players: the others go on
 * without them, and the last one left wins.
 */
export function refereeDrop(gameId: number, userIds: number[], reason: 'opgegeven' | 'verlaten') {
  return withGameLock(gameId, async () => {
    const j = await loadGame(gameId)
    if (j.game.status !== 'bezig') return
    const rules = REFEREES[j.game.kind]
    let state = await stateOf(j)
    for (const id of userIds) {
      const seat = seatOf(j, id)
      if (seat === null) continue
      state = rules.drop(state, seat)
      await db.update(gamePlayers).set({ status: 'weg' }).where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, id)))
    }
    await db.update(games).set({ secret: keepSecret(state) }).where(eq(games.id, gameId))
    const fresh = await loadGame(gameId)
    if (!(await finishIfOver(fresh, state, reason))) await announce(gameId)
    await broadcastReferee(gameId)
  })
}
