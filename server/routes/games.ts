/**
 * Kuddes Spellen. Friends invite each other; the game itself runs peer to
 * peer over a WebRTC data channel. The server only:
 *  - passes the WebRTC setup (offer, answer, ICE) between the two players,
 *  - relays the game when a direct connection doesn't work (strict NAT),
 *  - keeps the result, after replaying the moves with the shared rules.
 * Rooms live in memory, like the chat: one server process.
 */
import { createHmac } from 'node:crypto'
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { GAMES, GAME_LIMITS, isGameKind } from '../../shared/games'
import { TURN_RULES, isTurnKind, type Outcome } from '../../shared/games/rules'
import { firstPlayer } from '../../shared/mancala'
import { db } from '../db/client'
import { gamePlayers, games, users } from '../db/schema'
import { achievementOverview, gameStats, takeUnseenAchievements } from '../lib/achievements'
import { HttpError, notFound, parse } from '../lib/errors'
import {
  announce,
  finishGame,
  isOnline,
  loadGame,
  myGame,
  othersOf,
  opponentOf,
  withPlayers,
  type Joined,
  roomOf,
  rooms,
  selectGames,
  send,
  toGame,
  userOfSide,
  withGameLock,
  type GameRow,
} from '../lib/gameCore'
import { answer, quizDrop, quizJoined, quizScores, quizView, stopQuiz } from '../lib/quiz'
import { gameNews, inviteLines } from '../lib/messenger'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { findUser, friendshipBetween, summaryColumns, requireProfileAccess } from '../lib/users'
import { broadcastZeeslag, placeFleet, shoot, zeeslagScores, zeeslagView } from '../lib/zeeslag'
import { broadcastReferee, isRefereeKind, refereeAct, refereeDrop, refereeScores, refereeView } from '../lib/referee'

/** Invites nobody answers and games nobody finishes are closed after a day. */
let lastExpiry = 0
async function expireGames() {
  if (Date.now() - lastExpiry < 60_000) return
  lastExpiry = Date.now()
  const before = new Date(Date.now() - GAME_LIMITS.staleHours * 3600_000)
  await db.update(games).set({ status: 'geannuleerd', finishedAt: new Date() }).where(and(eq(games.status, 'uitgenodigd'), lt(games.createdAt, before)))
  await db
    .update(games)
    .set({ status: 'afgebroken', finishedAt: new Date() })
    .where(and(eq(games.status, 'bezig'), lt(games.startedAt, before)))
}

// ------------------------------------------------------------ finishing

/** Plays a turn-based game's moves with its rules; a bad list is a 400. */
function replayOrThrow(row: GameRow, moves: unknown[]): Outcome {
  if (!isTurnKind(row.kind)) throw new HttpError(400, 'Dit spel werkt anders.')
  try {
    return TURN_RULES[row.kind].replay(moves, firstPlayer(row.id))
  } catch {
    throw new HttpError(400, 'Deze zetten kloppen niet.')
  }
}

const outcomeWinner = (row: GameRow, o: Outcome) => (o.winner === null ? null : userOfSide(row, o.winner))

function finishTurnGame(row: GameRow, o: Outcome, moves: unknown[], reason: 'uitgespeeld' | 'opgegeven' | 'verlaten', winnerId: number | null) {
  return finishGame(row, { winnerId, scores: o.scores, moves, highlights: o.highlights, reason })
}

/** Resigning or leaving a server-refereed game: the score so far, and the other player wins. */
async function endServerGame(row: GameRow, winnerId: number, reason: 'opgegeven' | 'verlaten') {
  if (row.kind === 'quiz') {
    stopQuiz(row.id)
    const { scores, moves, correct } = quizScores(await loadGame(row.id))
    await finishGame(row, { winnerId, scores, moves, highlights: Object.fromEntries(correct.map((n, p) => [p, { correct: n }])), reason })
  } else if (isRefereeKind(row.kind)) {
    const { scores, highlights } = await refereeScores(await loadGame(row.id))
    await finishGame(row, { winnerId, scores, moves: [], highlights, reason })
    await broadcastReferee(row.id)
  } else {
    const { scores, moves } = zeeslagScores(row)
    await finishGame(row, { winnerId, scores, moves, highlights: { 0: {}, 1: {} }, reason })
  }
  if (row.kind === 'zeeslag') await broadcastZeeslag(row.id)
}

/** The state a server-refereed game shows this player. */
const serverView = async (row: GameRow, userId: number) =>
  row.kind === 'quiz' ? quizView(await loadGame(row.id), userId) : isRefereeKind(row.kind) ? await refereeView(await loadGame(row.id), userId) : zeeslagView(row, userId)

// ------------------------------------------------------------------ ICE

/**
 * STUN servers for finding a direct route between the two players. With
 * TURN_URLS and TURN_SECRET (coturn's use-auth-secret) players behind strict
 * NAT get a relay too; without it the game falls back to relaying through
 * this server, which also works, just a little slower.
 */
function iceServers(userId: number) {
  const servers: { urls: string[]; username?: string; credential?: string }[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }]
  const turn = process.env.TURN_URLS?.split(',').map((s) => s.trim()).filter(Boolean)
  if (turn?.length && process.env.TURN_SECRET) {
    const username = `${Math.floor(Date.now() / 1000) + 6 * 3600}:${userId}`
    const credential = createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64')
    servers.push({ urls: turn, username, credential })
  }
  return servers
}

// ------------------------------------------------------------ invites

/** Games a member is in, as a subquery (with these statuses of theirs). */
const gamesOf = (userId: number, statuses: ('uitgenodigd' | 'meedoen' | 'geweigerd' | 'weg')[]) =>
  inArray(games.id, db.select({ id: gamePlayers.gameId }).from(gamePlayers).where(and(eq(gamePlayers.userId, userId), inArray(gamePlayers.status, statuses))))

const status = (j: Joined, userId: number) => j.players.find((p) => p.userId === userId)?.status ?? null

/**
 * Starts a game with everyone who said yes: they get seats 0, 1, 2… in the
 * order they were invited, and the guest is whoever sits on seat 1.
 */
async function startGame(gameId: number) {
  const j = await loadGame(gameId)
  const playing = j.players.filter((p) => p.status === 'meedoen').sort((a, b) => a.seat - b.seat)
  const rest = j.players.filter((p) => p.status !== 'meedoen')
  // Two steps, so no two players ever share a seat on the way
  await Promise.all(j.players.map((p) => db.update(gamePlayers).set({ seat: p.seat + 100 }).where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, p.userId)))))
  await Promise.all(
    [...playing, ...rest].map((p, i) => db.update(gamePlayers).set({ seat: i }).where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, p.userId)))),
  )
  await db
    .update(games)
    .set({ status: 'bezig', startedAt: new Date(), guestId: playing[1].userId })
    .where(and(eq(games.id, gameId), eq(games.status, 'uitgenodigd')))
  await announce(gameId)
}

/** Everyone answered: start with who said yes, or call it off when nobody did. */
async function settleInvite(gameId: number) {
  const j = await loadGame(gameId)
  if (j.game.status !== 'uitgenodigd' || j.players.some((p) => p.status === 'uitgenodigd')) return announce(gameId)
  if (j.players.filter((p) => p.status === 'meedoen').length >= 2) return startGame(gameId)
  await db.update(games).set({ status: 'geweigerd', finishedAt: new Date() }).where(eq(games.id, gameId))
  await announce(gameId)
}

// ---------------------------------------------------------------- routes

const signalSchema = z.object({
  kind: z.enum(['offer', 'answer', 'ice', 'move', 'sync', 'emote', 'spray']),
  data: z.unknown(),
  to: z.number().int().optional(),
})
const movesSchema = z.object({ moves: z.array(z.unknown()).max(1000), resign: z.boolean().optional() })

export const gameRoutes = new Hono<AppEnv>()
  // Your invites, games in progress and recent results
  .get('/games', async (c) => {
    const me = requireUser(c)
    await expireGames()
    const mine = gamesOf(me.id, ['uitgenodigd', 'meedoen', 'weg'])
    const [openRows, recentRows] = await Promise.all([
      selectGames()
        .where(and(mine, inArray(games.status, ['uitgenodigd', 'bezig'])))
        .orderBy(desc(games.createdAt)),
      selectGames()
        .where(and(mine, inArray(games.status, ['klaar', 'geweigerd', 'afgebroken'])))
        .orderBy(desc(sql`coalesce(${games.finishedAt}, ${games.createdAt})`))
        .limit(15),
    ])
    const [open, recent] = await Promise.all([withPlayers(openRows), withPlayers(recentRows)])
    const all = open.map((r) => ({ g: toGame(r, me.id), mine: status(r, me.id) }))
    return c.json({
      incoming: all.filter((x) => x.g.status === 'uitgenodigd' && x.mine === 'uitgenodigd').map((x) => x.g),
      outgoing: all.filter((x) => x.g.status === 'uitgenodigd' && x.mine === 'meedoen').map((x) => x.g),
      active: all.filter((x) => x.g.status === 'bezig' && x.mine === 'meedoen').map((x) => x.g),
      recent: recent.map((r) => toGame(r, me.id)),
      stats: await gameStats(me.id),
    })
  })

  // Most wins, for the hub
  .get('/games/leaderboard', async (c) => {
    const rows = await db
      .select({ ...summaryColumns, wins: count() })
      .from(games)
      .innerJoin(users, eq(users.id, games.winnerId))
      .where(and(eq(games.status, 'klaar'), sql`${users.blockedAt} is null`))
      .groupBy(users.id)
      .orderBy(desc(count()), users.username)
      .limit(10)
    return c.json(rows.map(({ wins, ...u }) => ({ user: toSummary(u), wins })))
  })

  // New achievements, for the pop-ups (invites arrive in Messenger)
  .get('/games/live', async (c) => {
    const me = requireUser(c)
    await expireGames()
    return c.json({ achievements: await takeUnseenAchievements(me.id) })
  })

  .get('/games/ice', (c) => {
    const me = requireUser(c)
    return c.json({ iceServers: iceServers(me.id) })
  })

  // Invite one friend, or (for games with more players) up to three
  .post('/games', rateLimit('uitdagingen', 30, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({ kind: z.string(), username: z.string().optional(), usernames: z.array(z.string()).max(3).optional() }),
      await c.req.json().catch(() => null),
    )
    if (!isGameKind(input.kind)) throw new HttpError(400, 'Dit spel bestaat niet.')
    const names = [...new Set((input.usernames ?? (input.username ? [input.username] : [])).map((u) => u.toLowerCase()))]
    const most = GAMES[input.kind].players - 1
    if (!names.length) throw new HttpError(400, 'Kies wie je wilt uitdagen.')
    if (names.length > most) throw new HttpError(400, most === 1 ? 'Dit spel is voor twee: kies één vriend.' : `Je kunt maximaal ${most} vrienden uitnodigen.`)
    const invited = []
    for (const name of names) {
      const other = await findUser(name)
      if (other.id === me.id) throw new HttpError(400, 'Je kunt niet tegen jezelf spelen.')
      if (other.blockedAt) throw notFound('Dit lid bestaat niet.')
      const friendship = await friendshipBetween(me.id, other.id)
      if (friendship?.status !== 'accepted') throw new HttpError(403, `Je kunt alleen je vrienden uitdagen (${other.nickname} is nog geen vriend).`)
      invited.push(other)
    }
    await expireGames()

    // Just the two of you and there's already an open invite or game: go there
    if (invited.length === 1) {
      const other = invited[0]
      const [existing] = await db
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.kind, input.kind),
            inArray(games.status, ['uitgenodigd', 'bezig']),
            or(and(eq(games.hostId, me.id), eq(games.guestId, other.id)), and(eq(games.hostId, other.id), eq(games.guestId, me.id))),
          ),
        )
        .limit(1)
      if (existing) {
        const j = await loadGame(existing.id)
        if (j.players.length === 2) return c.json(toGame(j, me.id))
      }
    }

    const [{ n }] = await db.select({ n: count() }).from(games).where(and(eq(games.hostId, me.id), eq(games.status, 'uitgenodigd')))
    if (n >= GAME_LIMITS.openInvites) throw new HttpError(429, `Je hebt al ${n} openstaande uitdagingen. Wacht tot er een is beantwoord.`)
    const [row] = await db.insert(games).values({ kind: input.kind, hostId: me.id, guestId: invited[0].id }).returning()
    await db.insert(gamePlayers).values([
      { gameId: row.id, userId: me.id, seat: 0, status: 'meedoen' },
      ...invited.map((u, i) => ({ gameId: row.id, userId: u.id, seat: i + 1, status: 'uitgenodigd' as const })),
    ])
    // The invite arrives in Messenger, in the conversation with each friend
    await inviteLines(me.id, invited.map((u) => u.id), row.id)
    return c.json(toGame(await loadGame(row.id), me.id), 201)
  })

  .get('/games/:id', async (c) => {
    const me = requireUser(c)
    return c.json(toGame(await myGame(Number(c.req.param('id')), me), me.id))
  })

  .post('/games/:id/accept', async (c) => {
    const me = requireUser(c)
    const j = await myGame(Number(c.req.param('id')), me)
    if (j.game.status !== 'uitgenodigd' || status(j, me.id) !== 'uitgenodigd') throw new HttpError(409, 'Deze uitdaging staat niet meer open.')
    await db.update(gamePlayers).set({ status: 'meedoen' }).where(and(eq(gamePlayers.gameId, j.game.id), eq(gamePlayers.userId, me.id)))
    await settleInvite(j.game.id)
    await gameNews(me.id, j.game.hostId, j.game.id, 'meedoen')
    return c.json(toGame(await loadGame(j.game.id), me.id))
  })

  // Decline (an invited friend) or withdraw (who invited: for everyone)
  .post('/games/:id/decline', async (c) => {
    const me = requireUser(c)
    const j = await myGame(Number(c.req.param('id')), me)
    if (j.game.status !== 'uitgenodigd') throw new HttpError(409, 'Deze uitdaging staat niet meer open.')
    if (j.game.hostId === me.id) {
      await db.update(games).set({ status: 'geannuleerd', finishedAt: new Date() }).where(eq(games.id, j.game.id))
      await announce(j.game.id)
      for (const p of j.players) if (p.userId !== me.id && (p.status === 'uitgenodigd' || p.status === 'meedoen')) await gameNews(me.id, p.userId, j.game.id, 'ingetrokken')
    } else {
      await db.update(gamePlayers).set({ status: 'geweigerd' }).where(and(eq(gamePlayers.gameId, j.game.id), eq(gamePlayers.userId, me.id)))
      await settleInvite(j.game.id)
      await gameNews(me.id, j.game.hostId, j.game.id, 'geweigerd')
    }
    return c.body(null, 204)
  })

  // Who invited starts with whoever said yes so far (games with more players)
  .post('/games/:id/start', async (c) => {
    const me = requireUser(c)
    const j = await myGame(Number(c.req.param('id')), me)
    if (j.game.hostId !== me.id || j.game.status !== 'uitgenodigd') throw new HttpError(409, 'Dit spel kun je niet (meer) starten.')
    if (j.players.filter((p) => p.status === 'meedoen').length < 2) throw new HttpError(409, 'Er moet nog minstens één vriend ja zeggen.')
    // Who didn't answer yet misses this one
    await db.update(gamePlayers).set({ status: 'weg' }).where(and(eq(gamePlayers.gameId, j.game.id), eq(gamePlayers.status, 'uitgenodigd')))
    await startGame(j.game.id)
    return c.json(toGame(await loadGame(j.game.id), me.id))
  })

  // The room: WebRTC setup and relayed moves from the other player, and whether they're here
  .get('/games/:id/stream', async (c) => {
    const me = requireUser(c)
    const row = await myGame(Number(c.req.param('id')), me)
    if (!['uitgenodigd', 'bezig'].includes(row.game.status)) throw new HttpError(409, 'Dit spel is al afgelopen.')
    const gameId = row.game.id
    const others = othersOf(row, me.id)
    return streamSSE(c, async (stream) => {
      const room = roomOf(gameId)
      const set = room.streams.get(me.id) ?? new Set()
      set.add(stream)
      room.streams.set(me.id, set)
      room.lastSeen.set(me.id, Date.now())
      const here = others.filter((id) => isOnline(room, id))
      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ game: toGame(row, me.id), peerOnline: here.length > 0, online: here }) })
      // Also on a second connection (a reload can open the new one before the old one is noticed as closed)
      for (const id of others) send(gameId, id, 'peer', { online: true, userId: me.id })
      // Server-refereed games: the current state, and the quiz starts once both are here
      if (row.game.status === 'bezig' && GAMES[row.game.kind as keyof typeof GAMES]?.mode === 'server') {
        await stream.writeSSE({ event: 'state', data: JSON.stringify(await serverView(row.game, me.id)) })
        if (row.game.kind === 'quiz') void quizJoined(gameId).catch((e) => console.error('quiz join failed', e))
      }

      let open = true
      stream.onAbort(() => {
        open = false
      })
      while (open) {
        await stream.sleep(20_000)
        if (open) await stream.writeSSE({ event: 'ping', data: '' }).catch(() => (open = false))
      }
      set.delete(stream)
      room.lastSeen.set(me.id, Date.now())
      if (set.size === 0) {
        room.streams.delete(me.id)
        for (const id of others) send(gameId, id, 'peer', { online: false, userId: me.id })
      }
      if (room.streams.size === 0 && room.reports.size === 0) setTimeout(() => rooms.get(gameId)?.streams.size === 0 && rooms.delete(gameId), 10 * 60_000)
    })
  })

  // A message for the other player (WebRTC setup, or the game when the direct connection fails)
  .post('/games/:id/signal', rateLimit('spelberichten', 900, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const input = parse(signalSchema, await c.req.json().catch(() => null))
    if (JSON.stringify(input.data ?? null).length > 20_000) throw new HttpError(413, 'Dit bericht is te groot.')
    // To one player, or everyone else who's here
    const others = othersOf(await loadGame(game.id), me.id)
    const room = rooms.get(game.id)
    const to = (input.to !== undefined ? others.filter((id) => id === input.to) : others).filter((id) => isOnline(room, id))
    for (const id of to) send(game.id, id, 'signal', { kind: input.kind, data: input.data, from: me.id })
    return c.json({ delivered: to.length > 0 })
  })

  // The end of a game, from each player: both must report the same moves
  .post('/games/:id/result', rateLimit('spelresultaten', 60, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.status === 'klaar') return c.json(toGame(await loadGame(game.id), me.id))
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const input = parse(movesSchema, await c.req.json().catch(() => null))
    const outcome = replayOrThrow(game, input.moves)
    const opponent = opponentOf(game, me.id)

    if (input.resign) {
      await finishTurnGame(game, outcome, input.moves, 'opgegeven', opponent)
    } else {
      if (!outcome.over) throw new HttpError(400, 'Dit spel is nog niet uitgespeeld.')
      const room = roomOf(game.id)
      const key = JSON.stringify(input.moves)
      const mine = room.reports.get(me.id)
      const theirs = room.reports.get(opponent)
      if (theirs && theirs.moves === key) {
        await finishTurnGame(game, outcome, input.moves, 'uitgespeeld', outcomeWinner(game, outcome))
      } else if (theirs) {
        // Two different games: something's wrong, so it doesn't count
        await db.update(games).set({ status: 'afgebroken', finishedAt: new Date() }).where(eq(games.id, game.id))
        room.reports.clear()
        await announce(game.id)
      } else if (!isOnline(room, opponent) || (mine?.moves === key && Date.now() - mine.at > 12_000)) {
        // The other player left right at the end, or never reported back
        await finishTurnGame(game, outcome, input.moves, 'uitgespeeld', outcomeWinner(game, outcome))
      } else {
        if (mine?.moves !== key) room.reports.set(me.id, { moves: key, at: Date.now() })
        return c.json({ waiting: true }, 202)
      }
    }
    return c.json(toGame(await loadGame(game.id), me.id))
  })

  // Your opponent left and didn't come back: the win is yours
  .post('/games/:id/claim', async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const opponent = opponentOf(game, me.id)
    const room = rooms.get(game.id)
    const gone = room?.lastSeen.get(opponent) ?? game.startedAt?.getTime() ?? 0
    // With more players: go on without whoever left
    const j = await loadGame(game.id)
    if (j.players.filter((p) => p.status === 'meedoen').length > 2 && (isRefereeKind(game.kind) || game.kind === 'quiz')) {
      const goneFor = (id: number) => Date.now() - (room?.lastSeen.get(id) ?? game.startedAt?.getTime() ?? 0)
      const left = othersOf(j, me.id).filter((id) => j.players.find((p) => p.userId === id)?.status === 'meedoen' && !isOnline(room, id) && goneFor(id) >= GAME_LIMITS.forfeitSeconds * 1000)
      if (!left.length) throw new HttpError(409, 'Iedereen is er nog, of is net weg. Wacht nog even.')
      await (game.kind === 'quiz' ? quizDrop(game.id, left, 'verlaten') : refereeDrop(game.id, left, 'verlaten'))
      return c.json(toGame(await loadGame(game.id), me.id))
    }
    if (isOnline(room, opponent) || Date.now() - gone < GAME_LIMITS.forfeitSeconds * 1000) {
      throw new HttpError(409, 'Je tegenstander is er nog of is net weg. Wacht nog even.')
    }
    if (!isTurnKind(game.kind)) {
      await endServerGame(game, me.id, 'verlaten')
      return c.json(toGame(await loadGame(game.id), me.id))
    }
    const input = parse(movesSchema, await c.req.json().catch(() => null))
    const outcome = replayOrThrow(game, input.moves)
    if (outcome.over) await finishTurnGame(game, outcome, input.moves, 'uitgespeeld', outcomeWinner(game, outcome))
    else await finishTurnGame(game, outcome, input.moves, 'verlaten', me.id)
    return c.json(toGame(await loadGame(game.id), me.id))
  })

  // ------------------------------------------- server-refereed games

  .get('/games/:id/state', async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (GAMES[game.kind as keyof typeof GAMES]?.mode !== 'server') throw new HttpError(400, 'Dit spel werkt anders.')
    return c.json(await serverView(game, me.id))
  })

  // An action in a card game (Memory, Stapelgek, Kleurwissel): the server checks and plays it
  .post('/games/:id/play', rateLimit('kaartzetten', 600, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (!isRefereeKind(game.kind)) throw new HttpError(400, 'Dit spel werkt anders.')
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 500) throw new HttpError(400, 'Dat kan niet.')
    return c.json(await refereeAct(game.id, me.id, (body as { action?: unknown }).action))
  })

  // Giving up in Zeeslag or the quiz
  .post('/games/:id/resign', async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.status !== 'bezig') throw new HttpError(409, 'Dit spel is niet bezig.')
    const j = await loadGame(game.id)
    const playing = j.players.filter((p) => p.status === 'meedoen')
    // A card game with more players goes on without you
    if (playing.length > 2 && (isRefereeKind(game.kind) || game.kind === 'quiz')) {
      await (game.kind === 'quiz' ? quizDrop(game.id, [me.id], 'opgegeven') : refereeDrop(game.id, [me.id], 'opgegeven'))
      return c.json(toGame(await loadGame(game.id), me.id))
    }
    // Leaving the wall with more friends: the others spray on
    if (game.kind === 'spray' && playing.length > 2) {
      await db.update(gamePlayers).set({ status: 'weg' }).where(and(eq(gamePlayers.gameId, game.id), eq(gamePlayers.userId, me.id)))
      await announce(game.id)
      return c.json(toGame(await loadGame(game.id), me.id))
    }
    // The graffiti wall has no winner: stopping just ends the session
    if (game.kind === 'spray') {
      await db.update(games).set({ status: 'afgebroken', finishedAt: new Date() }).where(and(eq(games.id, game.id), eq(games.status, 'bezig')))
      await announce(game.id)
      return c.json(toGame(await loadGame(game.id), me.id))
    }
    if (isTurnKind(game.kind)) throw new HttpError(400, 'Geef op via het spel zelf.')
    await withGameLock(game.id, async () => {
      const { game: fresh } = await loadGame(game.id)
      if (fresh.status === 'bezig') await endServerGame(fresh, opponentOf(fresh, me.id), 'opgegeven')
    })
    return c.json(toGame(await loadGame(game.id), me.id))
  })

  .post('/games/:id/zeeslag/fleet', rateLimit('vloot', 60, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.kind !== 'zeeslag') throw new HttpError(400, 'Dit is geen zeeslag.')
    const { ships } = parse(
      z.object({ ships: z.array(z.object({ x: z.number().int(), y: z.number().int(), len: z.number().int(), dir: z.enum(['h', 'v']) })).max(10) }),
      await c.req.json().catch(() => null),
    )
    await placeFleet(game.id, me.id, ships)
    return c.json(zeeslagView((await loadGame(game.id)).game, me.id))
  })

  .post('/games/:id/zeeslag/shot', rateLimit('schoten', 240, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.kind !== 'zeeslag') throw new HttpError(400, 'Dit is geen zeeslag.')
    const { x, y } = parse(z.object({ x: z.number().int(), y: z.number().int() }), await c.req.json().catch(() => null))
    const result = await shoot(game.id, me.id, x, y)
    return c.json(result)
  })

  .post('/games/:id/quiz/answer', rateLimit('quizantwoorden', 120, 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { game } = await myGame(Number(c.req.param('id')), me)
    if (game.kind !== 'quiz') throw new HttpError(400, 'Dit is geen quiz.')
    const { round, choice } = parse(z.object({ round: z.number().int(), choice: z.number().int() }), await c.req.json().catch(() => null))
    await answer(game.id, me.id, round, choice)
    return c.json(quizView(await loadGame(game.id), me.id))
  })

  // Achievements and game stats of a member (public, like the profile)
  .get('/users/:username/achievements', async (c) => {
    const user = await findUser(c.req.param('username'))
    if (user.blockedAt) throw notFound('Dit lid bestaat niet.')
    await requireProfileAccess(c.get('user'), user)
    return c.json(await achievementOverview(user.id))
  })

  // Games between a member and you, or their recent results
  .get('/users/:username/games', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(viewer, user)
    const rows = await withPlayers(
      await selectGames()
        .where(and(eq(games.status, 'klaar'), gamesOf(user.id, ['meedoen', 'weg'])))
        .orderBy(desc(games.finishedAt))
        .limit(10),
    )
    return c.json(rows.map((r) => toGame(r, viewer?.id ?? null)))
  })

