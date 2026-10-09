import { desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Suggestion } from '../../shared/api'
import { db } from '../db/client'
import { suggestions, users } from '../db/schema'
import { parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireVerified, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

const suggestionSchema = z.object({
  kind: z.enum(['suggestie', 'probleem']).default('suggestie'),
  title: z.string().trim().min(3, 'Geef je bericht een titel.').max(100, 'De titel mag maximaal 100 tekens hebben.'),
  body: z.string().trim().min(5, 'Vertel iets meer.').max(3000, 'Maximaal 3000 tekens.'),
  page: z.string().trim().max(300).optional(),
})

export const suggestionRoutes = new Hono<AppEnv>()
  // Suggestions are public; problem reports are only stored for the team
  .get('/suggestions', async (c) => {
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const rows = await db
      .select({ suggestion: suggestions, user: summaryColumns })
      .from(suggestions)
      .leftJoin(users, eq(users.id, suggestions.userId))
      .where(eq(suggestions.kind, 'suggestie'))
      .orderBy(desc(suggestions.id))
      .limit(limit)
    const result: Suggestion[] = rows.map(({ suggestion, user }) => ({
      id: suggestion.id,
      kind: suggestion.kind,
      title: suggestion.title,
      body: suggestion.body,
      createdAt: suggestion.createdAt.toISOString(),
      user: user ? toSummary(user) : null,
      status: suggestion.status,
      statusNote: suggestion.statusNote,
    }))
    return c.json(result)
  })

  .post('/suggestions', rateLimit('suggesties', 10, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(suggestionSchema, await c.req.json().catch(() => null))
    await db.insert(suggestions).values({ ...input, page: input.page ?? null, userId: me.id })
    return c.json({ ok: true }, 201)
  })
