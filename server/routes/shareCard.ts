import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { INTERESTS, type InterestKey } from '../../shared/profileExtras'
import { SHARE_CARD_LIMITS, withCardDefaults } from '../../shared/shareCard'
import { db } from '../db/client'
import { users } from '../db/schema'
import { notFound, parse } from '../lib/errors'
import { requireUser, type AppEnv } from '../lib/session'
import { forgetCard } from '../lib/ogImage'
import { shareCardOf } from '../lib/shareCard'

const settingsSchema = z.object({
  enabled: z.boolean(),
  photo: z.boolean(),
  city: z.boolean(),
  age: z.boolean(),
  about: z.boolean(),
  interests: z
    .array(z.enum(Object.keys(INTERESTS) as [InterestKey]))
    .max(SHARE_CARD_LIMITS.interests, `Kies maximaal ${SHARE_CARD_LIMITS.interests} favorieten.`),
  music: z.boolean(),
  gamerTags: z.boolean(),
  design: z.boolean(),
  message: z.string().trim().max(SHARE_CARD_LIMITS.message, `Houd het kort: maximaal ${SHARE_CARD_LIMITS.message} tekens.`),
})

/** The profielkaartje: public when it's on, and your own settings. */
export const shareCardRoutes = new Hono<AppEnv>()
  .get('/share-card/:username', async (c) => {
    const card = await shareCardOf(c.req.param('username'))
    if (!card) throw notFound('Dit kaartje bestaat niet, of staat uit.')
    return c.json(card)
  })

  .get('/me/share-card', async (c) => {
    const me = requireUser(c)
    return c.json({ settings: withCardDefaults(me.shareCard), card: await shareCardOf(me.username, true) })
  })

  .put('/me/share-card', async (c) => {
    const me = requireUser(c)
    const settings = parse(settingsSchema, await c.req.json().catch(() => null))
    await db.update(users).set({ shareCard: settings }).where(eq(users.id, me.id))
    forgetCard('kaartje', me.username)
    return c.json({ settings, card: await shareCardOf(me.username, true) })
  })
