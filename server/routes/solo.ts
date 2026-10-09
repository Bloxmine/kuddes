/** Games on your own (shared/soloGames.ts): finished games, best scores and the high-score list. */
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { isBejeweledMode } from '../../shared/bejeweled'
import { SOLO_GAMES, isSoloKind, type SoloKind, type SoloOverview } from '../../shared/soloGames'
import { db } from '../db/client'
import { soloScores, users, type User } from '../db/schema'
import { checkSoon } from '../lib/achievements'
import { HttpError, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

function kindOf(raw: string): SoloKind {
  if (!isSoloKind(raw)) throw new HttpError(404, 'Dit spel bestaat niet.')
  return raw
}

/** What's stored in solo_scores.kind: Bejeweled per game mode ("bejeweled.zen"), the rest as it is. */
function storedKind(kind: SoloKind, mode: string | undefined): string {
  if (kind !== 'bejeweled') return kind
  if (mode !== undefined && !isBejeweledMode(mode)) throw new HttpError(400, 'Die spelsoort bestaat niet.')
  return `bejeweled.${mode ?? 'classic'}`
}

async function overview(kind: string, viewer: User | null): Promise<SoloOverview> {
  // Everyone's best, highest first (blocked members left out)
  const best = db
    .select({ userId: soloScores.userId, score: sql<number>`max(${soloScores.score})`.as('score'), at: sql<Date>`max(${soloScores.createdAt})`.as('at') })
    .from(soloScores)
    .where(eq(soloScores.kind, kind))
    .groupBy(soloScores.userId)
    .as('best')
  const [top, mine] = await Promise.all([
    db
      .select({ user: summaryColumns, score: best.score, at: best.at })
      .from(best)
      .innerJoin(users, eq(users.id, best.userId))
      .where(sql`${users.blockedAt} is null`)
      .orderBy(desc(best.score))
      .limit(10),
    viewer
      ? db
          .select({ best: sql<number | null>`max(${soloScores.score})`, played: count(), won: sql<number>`count(*) filter (where ${soloScores.won})::int` })
          .from(soloScores)
          .where(and(eq(soloScores.kind, kind), eq(soloScores.userId, viewer.id)))
      : Promise.resolve([]),
  ])
  return {
    best: mine[0]?.best ?? null,
    played: mine[0]?.played ?? 0,
    won: mine[0]?.won ?? 0,
    top: top.map((r) => ({ user: toSummary(r.user), score: Number(r.score), at: new Date(r.at).toISOString() })),
  }
}

export const soloRoutes = new Hono<AppEnv>()
  .get('/solo/:kind', async (c) => c.json(await overview(storedKind(kindOf(c.req.param('kind')), c.req.query('mode')), c.get('user'))))

  // A finished game
  .post('/solo/:kind/scores', rateLimit('spelletjes', 240, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const kind = kindOf(c.req.param('kind'))
    const input = parse(
      z.object({
        score: z.number().int().min(0).max(SOLO_GAMES[kind].maxScore, 'Die score kan niet kloppen.'),
        won: z.boolean(),
        details: z.record(z.string().max(20), z.number().finite()).refine((d) => Object.keys(d).length <= 12),
        mode: z.string().max(20).optional(),
      }),
      await c.req.json().catch(() => null),
    )
    const stored = storedKind(kind, input.mode)
    await db.insert(soloScores).values({ userId: me.id, kind: stored, score: input.score, won: input.won, details: input.details })
    checkSoon(me.id)
    return c.json(await overview(stored, me), 201)
  })
