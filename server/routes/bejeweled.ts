/**
 * Bejeweled 3 on Kuddes (games/bejeweled, shared/bejeweled.ts): the game asks
 * for your badges and best scores when it starts, and sends its badge counts
 * back while you play. Scores themselves go to /api/solo/bejeweled/scores.
 */
import { and, eq, like, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { BEJEWELED_BADGE_KEYS, badgeLevel, isBejeweledMode, type BejeweledBadge, type BejeweledBadgeState, type BejeweledProgress } from '../../shared/bejeweled'
import { db } from '../db/client'
import { bejeweledProgress, soloScores } from '../db/schema'
import { checkSoon } from '../lib/achievements'
import { parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, type AppEnv } from '../lib/session'

type Badges = Partial<Record<BejeweledBadge, BejeweledBadgeState>>

async function progressOf(userId: number): Promise<BejeweledProgress> {
  const [row, bests] = await Promise.all([
    db.select({ badges: bejeweledProgress.badges }).from(bejeweledProgress).where(eq(bejeweledProgress.userId, userId)),
    // The best game per mode, with the level it got to
    db
      .selectDistinctOn([soloScores.kind], { kind: soloScores.kind, score: soloScores.score, level: sql<number>`coalesce((${soloScores.details}->>'level')::int, 0)` })
      .from(soloScores)
      .where(and(eq(soloScores.userId, userId), like(soloScores.kind, 'bejeweled.%')))
      .orderBy(soloScores.kind, sql`${soloScores.score} desc`),
  ])
  const progress: BejeweledProgress = { userId, badges: row[0]?.badges ?? {}, bests: {} }
  for (const b of bests) {
    const mode = b.kind.slice('bejeweled.'.length)
    if (isBejeweledMode(mode)) progress.bests[mode] = { score: b.score, level: Number(b.level) }
  }
  return progress
}

const count = z.number().int().min(0).max(2_000_000_000)

export const bejeweledRoutes = new Hono<AppEnv>()
  .get('/bejeweled', async (c) => {
    const me = c.get('user')
    // Without an account the game keeps everything in the browser
    return c.json(me ? await progressOf(me.id) : ({ userId: null, badges: {}, bests: {} } satisfies BejeweledProgress))
  })

  // The counts from the game: kept when they're higher, the levels worked out here
  .put('/bejeweled/badges', rateLimit('bejeweled', 600, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ badges: z.partialRecord(z.enum(BEJEWELED_BADGE_KEYS as [BejeweledBadge]), count) }), await c.req.json().catch(() => null))
    // Two updates at once (two new badges in one move) must not undo each other: one at a time per member
    const { badges, changed } = await db.transaction(async (tx) => {
      await tx.insert(bejeweledProgress).values({ userId: me.id }).onConflictDoNothing()
      const [row] = await tx.select({ badges: bejeweledProgress.badges }).from(bejeweledProgress).where(eq(bejeweledProgress.userId, me.id)).for('update')
      const badges: Badges = { ...row?.badges }
      let changed = false
      for (const key of BEJEWELED_BADGE_KEYS) {
        const value = input.badges[key]
        if (value === undefined || value <= (badges[key]?.value ?? 0)) continue
        badges[key] = { value, level: badgeLevel(key, value) }
        changed = true
      }
      if (changed) await tx.update(bejeweledProgress).set({ badges, updatedAt: new Date() }).where(eq(bejeweledProgress.userId, me.id))
      return { badges, changed }
    })
    if (changed) checkSoon(me.id)
    return c.json({ badges })
  })
