import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { ALL_SPRAY_CANS, SPRAY_CANS, type SprayProgress } from '../../shared/spray'
import { db } from '../db/client'
import { sprayProgress } from '../db/schema'
import { checkSoon } from '../lib/achievements'
import { parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, type AppEnv } from '../lib/session'

const TRACKED: readonly string[] = [...SPRAY_CANS.basic, ...SPRAY_CANS.special]

async function progressOf(userId: number): Promise<SprayProgress> {
  const [row] = await db.select().from(sprayProgress).where(eq(sprayProgress.userId, userId))
  const tried = (row?.cans ?? []).filter((c) => ALL_SPRAY_CANS.includes(c))
  return { tried, unlocked: TRACKED.every((c) => tried.includes(c)), photos: row?.photos ?? 0 }
}

const eventSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('can'), data: z.object({ name: z.string().refine((n) => ALL_SPRAY_CANS.includes(n), 'Onbekende bus.'), set: z.string() }) }),
  z.object({ name: z.literal('unlock'), data: z.null().optional() }),
  z.object({ name: z.literal('photo'), data: z.null().optional() }),
])

/** The Graffitimuur's progress: kept per member, so it follows you to another computer. */
export const sprayRoutes = new Hono<AppEnv>()
  .get('/spray/progress', async (c) => c.json(await progressOf(requireUser(c).id)))

  .post('/spray/progress', rateLimit('graffiti', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const event = parse(eventSchema, await c.req.json().catch(() => null))
    if (event.name === 'can') {
      const can = event.data.name
      await db
        .insert(sprayProgress)
        .values({ userId: me.id, cans: [can] })
        .onConflictDoUpdate({
          target: sprayProgress.userId,
          set: { cans: sql`case when ${can} = any(${sprayProgress.cans}) then ${sprayProgress.cans} else array_append(${sprayProgress.cans}, ${can}) end`, updatedAt: new Date() },
        })
    } else if (event.name === 'photo') {
      await db
        .insert(sprayProgress)
        .values({ userId: me.id, photos: 1 })
        .onConflictDoUpdate({ target: sprayProgress.userId, set: { photos: sql`${sprayProgress.photos} + 1`, updatedAt: new Date() } })
    }
    // "unlock" follows from the cans themselves; it's only a cue to check achievements now
    checkSoon(me.id)
    return c.json(await progressOf(me.id))
  })
