/**
 * What every game shares: loading and serialising games, the rooms (live
 * connections per game, in memory like the chat) and finishing a game.
 */
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { SSEStreamingApi } from 'hono/streaming'
import { isGameKind, type GameEnd, type GamePlayer, type GameSummary } from '../../shared/games'
import { firstPlayer } from '../../shared/mancala'
import { db } from '../db/client'
import { gamePlayers, games, users, type User } from '../db/schema'
import { checkAchievements } from './achievements'
import { notFound } from './errors'
import { toSummary } from './serialize'

export type GameRow = typeof games.$inferSelect

const hosts = alias(users, 'host')
const guests = alias(users, 'guest')
const summaryOf = (t: typeof hosts | typeof guests) => ({
  id: t.id,
  username: t.username,
  name: t.name,
  nickname: t.nickname,
  avatarPath: t.avatarPath,
  lastSeenAt: t.lastSeenAt,
  onlineStatus: t.onlineStatus,
})
export const selectGames = () =>
  db
    .select({ game: games, host: summaryOf(hosts), guest: summaryOf(guests) })
    .from(games)
    .innerJoin(hosts, eq(hosts.id, games.hostId))
    .innerJoin(guests, eq(guests.id, games.guestId))

type JoinedRow = Awaited<ReturnType<ReturnType<typeof selectGames>['execute']>>[number]
export type PlayerRow = { userId: number; seat: number; status: GamePlayer['status']; score: number; user: Parameters<typeof toSummary>[0] }
/** A game with its host and guest, and everyone in it (in seat order). */
export type Joined = JoinedRow & { players: PlayerRow[] }

/** Adds the players to games from selectGames(), in one query. */
export async function withPlayers(rows: JoinedRow[]): Promise<Joined[]> {
  if (!rows.length) return []
  const list = await db
    .select({
      gameId: gamePlayers.gameId,
      userId: gamePlayers.userId,
      seat: gamePlayers.seat,
      status: gamePlayers.status,
      score: gamePlayers.score,
      user: { id: users.id, username: users.username, name: users.name, nickname: users.nickname, avatarPath: users.avatarPath, lastSeenAt: users.lastSeenAt, onlineStatus: users.onlineStatus },
    })
    .from(gamePlayers)
    .innerJoin(users, eq(users.id, gamePlayers.userId))
    .where(inArray(gamePlayers.gameId, rows.map((r) => r.game.id)))
    .orderBy(asc(gamePlayers.seat))
  return rows.map((r) => ({ ...r, players: list.filter((p) => p.gameId === r.game.id) }))
}

/** The players still in it (invited or playing), not who said no or left. */
export const activePlayers = (j: Joined) => j.players.filter((p) => p.status === 'uitgenodigd' || p.status === 'meedoen')
/** The seat of a member in a game, or null. */
export const seatOf = (j: Joined, userId: number) => j.players.find((p) => p.userId === userId)?.seat ?? null
export const userOfSeat = (j: Joined, seat: number) => j.players.find((p) => p.seat === seat)?.userId ?? null
/** Everyone else still in the game. */
export const othersOf = (j: Joined, userId: number) => activePlayers(j).filter((p) => p.userId !== userId).map((p) => p.userId)

export function toGame(j: Joined, viewerId: number | null): GameSummary {
  const { game: g, host, guest } = j
  return {
    id: g.id,
    kind: isGameKind(g.kind) ? g.kind : 'mancala',
    status: g.status,
    host: toSummary(host),
    guest: toSummary(guest),
    you: viewerId === g.hostId ? 'host' : viewerId === g.guestId ? 'guest' : null,
    players: j.players.map((p) => ({ user: toSummary(p.user), seat: p.seat, status: p.status, score: p.score })),
    seat: viewerId === null ? null : seatOf(j, viewerId),
    winnerId: g.status === 'klaar' ? g.winnerId : null,
    first: firstPlayer(g.id),
    winner: g.status !== 'klaar' ? null : g.winnerId === null ? 'gelijk' : g.winnerId === g.hostId ? 'host' : 'guest',
    hostScore: g.hostScore,
    guestScore: g.guestScore,
    endReason: g.endReason,
    moves: g.status === 'klaar' ? g.moves : [],
    createdAt: g.createdAt.toISOString(),
    startedAt: g.startedAt?.toISOString() ?? null,
    finishedAt: g.finishedAt?.toISOString() ?? null,
  }
}

export async function loadGame(id: number): Promise<Joined> {
  if (!Number.isInteger(id)) throw notFound('Dit spel bestaat niet.')
  const [row] = await selectGames().where(eq(games.id, id))
  if (!row) throw notFound('Dit spel bestaat niet.')
  return (await withPlayers([row]))[0]
}

/** A game you play in (or were invited to). */
export async function myGame(id: number, me: User) {
  const row = await loadGame(id)
  if (!row.players.some((p) => p.userId === me.id && p.status !== 'geweigerd')) throw notFound('Dit spel bestaat niet.')
  return row
}

export const opponentOf = (g: GameRow, userId: number) => (g.hostId === userId ? g.guestId : g.hostId)
/** 0 for the host, 1 for the guest. */
export const sideOf = (g: GameRow, userId: number): 0 | 1 => (g.hostId === userId ? 0 : 1)
export const userOfSide = (g: GameRow, side: 0 | 1) => (side === 0 ? g.hostId : g.guestId)

// ------------------------------------------------------------------ rooms

export type Room = {
  streams: Map<number, Set<SSEStreamingApi>>
  /** When each player was last connected (for claiming a win when someone leaves). */
  lastSeen: Map<number, number>
  /** Finished move lists each player reported, waiting for the other's. */
  reports: Map<number, { moves: string; at: number }>
}
export const rooms = new Map<number, Room>()
export const roomOf = (id: number) => {
  let room = rooms.get(id)
  if (!room) {
    room = { streams: new Map(), lastSeen: new Map(), reports: new Map() }
    rooms.set(id, room)
  }
  return room
}
export const isOnline = (room: Room | undefined, userId: number) => (room?.streams.get(userId)?.size ?? 0) > 0

export function send(gameId: number, userId: number | 'both', event: string, data: unknown) {
  const room = rooms.get(gameId)
  if (!room) return
  const payload = JSON.stringify(data)
  for (const [id, set] of room.streams) {
    if (userId !== 'both' && id !== userId) continue
    for (const s of set) void s.writeSSE({ event, data: payload }).catch(() => undefined)
  }
}

/** Tells every player (who's in the room) the game's new state. */
export async function announce(gameId: number) {
  const row = await loadGame(gameId)
  for (const p of row.players) send(gameId, p.userId, 'game', toGame(row, p.userId))
}

// ------------------------------------------------------------ finishing

export type Finish = {
  winnerId: number | null
  /** Per seat. */
  scores: number[]
  moves: unknown[]
  highlights: Record<number, Record<string, number>>
  reason: GameEnd
}

/** Stores the result (once, even if both players report at the same moment), hands out achievements and tells the room. */
export async function finishGame(row: GameRow, f: Finish) {
  const [updated] = await db
    .update(games)
    .set({
      status: 'klaar',
      winnerId: f.winnerId,
      hostScore: f.scores[0] ?? 0,
      guestScore: f.scores[1] ?? 0,
      moves: f.moves,
      highlights: { host: f.highlights[0] ?? {}, guest: f.highlights[1] ?? {} },
      endReason: f.reason,
      finishedAt: new Date(),
    })
    .where(and(eq(games.id, row.id), eq(games.status, 'bezig')))
    .returning()
  if (!updated) return false
  rooms.get(row.id)?.reports.clear()
  // Everyone's own score and highlights
  const players = await db.select({ userId: gamePlayers.userId, seat: gamePlayers.seat }).from(gamePlayers).where(and(eq(gamePlayers.gameId, row.id), ne(gamePlayers.status, 'geweigerd')))
  await Promise.all(
    players.map((p) =>
      db
        .update(gamePlayers)
        .set({ score: f.scores[p.seat] ?? 0, highlights: f.highlights[p.seat] ?? {} })
        .where(and(eq(gamePlayers.gameId, row.id), eq(gamePlayers.userId, p.userId))),
    ),
  )
  await Promise.all(players.map((p) => checkAchievements(p.userId, true)))
  await announce(row.id)
  return true
}

/** Runs one change to a game at a time (two quick shots or answers can't cross). */
const locks = new Map<number, Promise<unknown>>()
export function withGameLock<T>(gameId: number, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(gameId) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(
    gameId,
    next.catch(() => undefined),
  )
  return next
}
