import { Hono } from 'hono'
import { z } from 'zod'
import { REPORT_KINDS, REPORT_LIMITS, REPORT_REASONS, type ReportKind, type ReportReason, type ReportResult } from '../../shared/safety'
import { parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { report } from '../lib/reports'
import { requireUser, type AppEnv } from '../lib/session'
import { quiet } from '../lib/siteSettings'

/** "Melden": a member reports a post, profile or message (server/lib/reports.ts). */
export const reportRoutes = new Hono<AppEnv>()
  // The quiet mode's line at the top of every page (for visitors too)
  .get('/notice', (c) => c.json({ notice: quiet()?.notice || null }))
  .post('/reports', rateLimit('meldingen', 20, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({
        kind: z.enum(Object.keys(REPORT_KINDS) as [ReportKind]),
        targetId: z.number().int().positive(),
        reason: z.enum(Object.keys(REPORT_REASONS) as [ReportReason], { error: 'Kies waarom je het meldt.' }),
        note: z.string().trim().max(REPORT_LIMITS.note).default(''),
      }),
      await c.req.json().catch(() => null),
    )
    return c.json((await report(me, input)) satisfies ReportResult, 201)
  })
