/**
 * Zeeslag, refereed by the server: it keeps both fleets secret and answers
 * every shot, so nobody can peek at the other's board.
 */
import { eq } from 'drizzle-orm'
import { firstPlayer } from '../../shared/mancala'
import { fleetProblem, resolveShot, type Ship, type Shot, type ZeeslagView } from '../../shared/games/zeeslag'
import { db } from '../db/client'
import { games } from '../db/schema'
import { HttpError } from './errors'
import { finishGame, loadGame, send, sideOf, userOfSide, withGameLock, type GameRow } from './gameCore'

type Secret = { fleets: [Ship[] | null, Ship[] | null]; shots: Shot[]; turn: 0 | 1 }

const secretOf = (g: GameRow): Secret => {
  const s = g.secret as Partial<Secret> | null
  return { fleets: s?.fleets ?? [null, null], shots: s?.shots ?? [], turn: s?.turn ?? firstPlayer(g.id) }
}

async function save(g: GameRow, secret: Secret) {
  await db.update(games).set({ secret }).where(eq(games.id, g.id))
}

/** What one player may see. */
export function zeeslagView(g: GameRow, userId: number): ZeeslagView {
  const s = secretOf(g)
  const you = sideOf(g, userId)
  const other = you === 0 ? 1 : 0
  const done = g.status !== 'bezig' && g.status !== 'uitgenodigd'
  return {
    phase: done ? 'klaar' : s.fleets[0] && s.fleets[1] ? 'spelen' : 'plaatsen',
    you,
    fleet: s.fleets[you] ?? [],
    opponentReady: !!s.fleets[other],
    turn: s.turn,
    shots: s.shots,
    revealed: done ? (s.fleets[other] ?? null) : null,
  }
}

/** Sends each player in the room their own view. */
export async function broadcastZeeslag(gameId: number) {
  const { game } = await loadGame(gameId)
  for (const id of [game.hostId, game.guestId]) send(gameId, id, 'state', zeeslagView(game, id))
}

export function placeFleet(gameId: number, userId: number, ships: Ship[]) {
  return withGameLock(gameId, async () => {
    const { game } = await loadGame(gameId)
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const problem = fleetProblem(ships)
    if (problem) throw new HttpError(400, problem)
    const s = secretOf(game)
    const you = sideOf(game, userId)
    if (s.fleets[0] && s.fleets[1]) throw new HttpError(409, 'Het spel is al begonnen.')
    s.fleets[you] = ships.map(({ x, y, len, dir }) => ({ x, y, len, dir }))
    await save(game, s)
    await broadcastZeeslag(gameId)
  })
}

export function shoot(gameId: number, userId: number, x: number, y: number) {
  return withGameLock(gameId, async () => {
    const { game } = await loadGame(gameId)
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const s = secretOf(game)
    if (!s.fleets[0] || !s.fleets[1]) throw new HttpError(409, 'Nog niet iedereen heeft zijn schepen geplaatst.')
    const you = sideOf(game, userId)
    if (s.turn !== you) throw new HttpError(409, 'Je bent niet aan de beurt.')
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 9 || y > 9) throw new HttpError(400, 'Buiten het bord.')
    const mine = s.shots.filter((t) => t.p === you)
    if (mine.some((t) => t.x === x && t.y === y)) throw new HttpError(409, 'Daar heb je al geschoten.')
    const other = you === 0 ? 1 : 0
    const result = resolveShot(s.fleets[other]!, mine, x, y)
    s.shots.push({ p: you, x, y, r: result.r, ...(result.sunk && { sunk: result.sunk }) })
    // A hit: shoot again. A miss: the other one's turn.
    if (result.r === 'mis') s.turn = other
    const sunk = s.shots.filter((t) => t.p === you && t.r === 'gezonken').length
    await save(game, s)
    if (sunk === s.fleets[other]!.length) {
      const shots = s.shots.filter((t) => t.p === you).length
      const hl = (side: 0 | 1) => (side === you ? { sharpWin: shots <= 45 ? 1 : 0, shots } : { sharpWin: 0, shots: s.shots.filter((t) => t.p === side).length })
      await finishGame(game, {
        winnerId: userOfSide(game, you),
        scores: [s.shots.filter((t) => t.p === 0 && t.r !== 'mis').length, s.shots.filter((t) => t.p === 1 && t.r !== 'mis').length],
        moves: s.shots,
        highlights: { 0: hl(0), 1: hl(1) },
        reason: 'uitgespeeld',
      })
    }
    await broadcastZeeslag(gameId)
    return result
  })
}

/** Hits so far, for the result when someone resigns or leaves. */
export function zeeslagScores(g: GameRow): { scores: [number, number]; moves: unknown[] } {
  const s = secretOf(g)
  return { scores: [s.shots.filter((t) => t.p === 0 && t.r !== 'mis').length, s.shots.filter((t) => t.p === 1 && t.r !== 'mis').length], moves: s.shots }
}
