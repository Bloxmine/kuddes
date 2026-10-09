import { and, desc, eq, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Knuffel, Page } from '../../shared/api'
import { db } from '../db/client'
import { glitters, knuffels, users } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { glitterImage } from '../lib/glitters'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, requireProfileAccess, summaryColumns } from '../lib/users'
import { unnotify } from '../lib/notifications'
import { createKnuffel, knuffelRefusal } from '../lib/knuffels'
import { knuffelRemoved } from '../lib/federation/outbox'
import { botEvent } from '../lib/bots'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'

const PAGE_SIZE = 20

const knuffelSchema = z
  .object({
    text: z.string().trim().max(1000, 'Een knuffel mag maximaal 1000 tekens hebben.').default(''),
    glitterId: z.number().int().positive().nullable().optional(),
  })
  .refine((k) => k.text.length > 0 || k.glitterId, { message: 'Schrijf eerst een knuffel of kies een glitterplaatje.', path: ['text'] })


export const knuffelRoutes = new Hono<AppEnv>()
  .get('/users/:username/knuffels', async (c) => {
    const viewer = c.get('user')
    const profile = await findUser(c.req.param('username'))
    await requireProfileAccess(viewer, profile)
    const before = Number(c.req.query('before')) || null
    const rows = await db
      .select({ knuffel: knuffels, author: summaryColumns, glitter: glitters })
      .from(knuffels)
      .innerJoin(users, eq(users.id, knuffels.authorId))
      .leftJoin(glitters, eq(glitters.id, knuffels.glitterId))
      .where(and(eq(knuffels.profileId, profile.id), before ? lt(knuffels.id, before) : undefined, notHidden('knuffel', knuffels.id)))
      .orderBy(desc(knuffels.id))
      .limit(PAGE_SIZE + 1)

    const page = rows.slice(0, PAGE_SIZE)
    const result: Page<Knuffel> = {
      items: page.map(({ knuffel, author, glitter }) => ({
        id: knuffel.id,
        author: toSummary(author),
        text: knuffel.text,
        glitter: glitterImage(glitter),
        createdAt: knuffel.createdAt.toISOString(),
        canDelete: !!viewer && (viewer.id === knuffel.authorId || viewer.id === knuffel.profileId),
      })),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].knuffel.id : null,
    }
    return c.json(result)
  })

  .post('/users/:username/knuffels', rateLimit('knuffels', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const profile = await findUser(c.req.param('username'))
    const input = parse(knuffelSchema, await c.req.json().catch(() => null))
    const refused = await knuffelRefusal(me, profile)
    if (refused) throw new HttpError(403, refused)
    const [glitter] = input.glitterId ? await db.select().from(glitters).where(eq(glitters.id, input.glitterId)) : []
    if (input.glitterId && !glitter) throw new HttpError(400, 'Dit glitterplaatje bestaat niet (meer).')
    const knuffel = await createKnuffel(me, profile, input.text, glitter ?? null)
    // Toezicht: the watching bot checks it (and can take it away again)
    checkPost({
      author: me,
      place: 'knuffel',
      text: input.text,
      link: `/profiel/${profile.username}?tab=knuffels`,
      remove: async () => {
        await db.delete(knuffels).where(eq(knuffels.id, knuffel.id))
        await unnotify(`knuffel:${knuffel.id}`)
      },
    })
    // A knuffel for a bot: it may answer (never one bot to another)
    if (profile.isBot && !me.isBot) botEvent({ trigger: 'knuffel', botId: profile.id, member: me, text: input.text })
    const result: Knuffel = {
      id: knuffel.id,
      author: toSummary(me),
      text: knuffel.text,
      glitter: glitterImage(glitter ?? null),
      createdAt: knuffel.createdAt.toISOString(),
      canDelete: true,
    }
    return c.json(result, 201)
  })

  // The author, or the member whose profile it's on, can remove a knuffel
  .delete('/knuffels/:id', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const [knuffel] = await db.select().from(knuffels).where(eq(knuffels.id, id))
    if (!knuffel) throw notFound()
    if (knuffel.authorId !== me.id && knuffel.profileId !== me.id) throw new HttpError(403, 'Dit is niet jouw knuffel.')
    knuffelRemoved(knuffel, me)
    await db.delete(knuffels).where(eq(knuffels.id, id))
    await unnotify(`knuffel:${id}`)
    return c.body(null, 204)
  })
