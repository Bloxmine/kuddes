import { and, asc, count, eq, isNotNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { FORUM_LIMITS, SECTION_ICONS, slugify } from '../../shared/forum'
import { db } from '../db/client'
import { chatChannels, forumBans, forumModerators, forumSections, users } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { requireAdmin } from '../lib/forum'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { findUser, summaryColumns } from '../lib/users'

const sectionSchema = z.object({
  name: z.string().trim().min(2, 'Geef het forumdeel een naam.').max(FORUM_LIMITS.sectionName),
  category: z.string().trim().min(2, 'Kies een categorie.').max(40),
  description: z.string().trim().max(FORUM_LIMITS.sectionDescription).default(''),
  icon: z.enum(SECTION_ICONS).default('comment'),
  position: z.number().int().min(0).max(10_000).default(100),
  staffOnly: z.boolean().default(false),
  /** Put inside another section, as a subforum (one level deep). */
  parentId: z.number().int().positive().nullable().default(null),
})

/**
 * A subforum hangs under a section that isn't a subforum itself, and a
 * section with subforums can't become one. It takes its parent's category.
 */
async function checkParent(parentId: number | null | undefined, selfId: number | null) {
  if (!parentId) return null
  if (parentId === selfId) throw new HttpError(400, 'Een forumdeel kan niet in zichzelf staan.')
  const [parent] = await db.select().from(forumSections).where(eq(forumSections.id, parentId))
  if (!parent) throw notFound('Dat forumdeel bestaat niet (meer).')
  if (parent.parentId) throw new HttpError(400, `"${parent.name}" is zelf al een subforum: kies een hoofdforum.`)
  if (selfId) {
    const [{ n }] = await db.select({ n: count() }).from(forumSections).where(eq(forumSections.parentId, selfId))
    if (n > 0) throw new HttpError(400, 'Dit forumdeel heeft zelf subfora, dus het kan geen subforum worden.')
  }
  return parent
}

/** Everything on /forum/beheer; only for forum admins. */
export const forumAdminRoutes = new Hono<AppEnv>()
  .get('/forum/admin', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const [sections, admins, mods, bans, channels] = await Promise.all([
      db.select().from(forumSections).orderBy(asc(forumSections.position), asc(forumSections.id)),
      db.select(summaryColumns).from(users).where(eq(users.forumRole, 'admin')).orderBy(asc(users.nickname)),
      db.select({ sectionId: forumModerators.sectionId, user: summaryColumns }).from(forumModerators).innerJoin(users, eq(users.id, forumModerators.userId)),
      db
        .select({ ban: forumBans, user: summaryColumns })
        .from(forumBans)
        .innerJoin(users, eq(users.id, forumBans.userId))
        .orderBy(asc(forumBans.createdAt)),
      db.select().from(chatChannels).orderBy(asc(chatChannels.position)),
    ])
    return c.json({
      sections: sections.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), moderators: mods.filter((m) => m.sectionId === s.id).map((m) => toSummary(m.user)) })),
      admins: admins.map(toSummary),
      bans: bans.map(({ ban, user }) => ({ user: toSummary(user), reason: ban.reason, until: ban.until?.toISOString() ?? null, createdAt: ban.createdAt.toISOString() })),
      channels: channels.map((ch) => ({ name: ch.name, topic: ch.topic, position: ch.position })),
    })
  })

  .post('/forum/admin/sections', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const input = parse(sectionSchema, await c.req.json().catch(() => null))
    const parent = await checkParent(input.parentId, null)
    if (parent) input.category = parent.category
    const base = slugify(input.name)
    const taken = new Set((await db.select({ slug: forumSections.slug }).from(forumSections)).map((r) => r.slug))
    // "nieuw", "zoeken" etc. are pages of their own
    for (const reserved of ['nieuw', 'zoeken', 'chat', 'lid', 'beheer', 'tag']) taken.add(reserved)
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const [row] = await db.insert(forumSections).values({ ...input, slug }).returning()
    return c.json({ slug: row.slug }, 201)
  })

  .patch('/forum/admin/sections/:id', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const id = Number(c.req.param('id'))
    const input = parse(sectionSchema.partial(), await c.req.json().catch(() => null))
    const parent = input.parentId !== undefined ? await checkParent(input.parentId, id) : null
    if (parent) input.category = parent.category
    const [row] = await db.update(forumSections).set(input).where(eq(forumSections.id, id)).returning()
    if (!row) throw notFound('Dit forumdeel bestaat niet.')
    // The subforums move along with their parent's category
    if (input.category && !row.parentId) await db.update(forumSections).set({ category: input.category }).where(eq(forumSections.parentId, id))
    return c.body(null, 204)
  })

  // Removes the section with all its threads
  .delete('/forum/admin/sections/:id', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const [{ n }] = await db.select({ n: count() }).from(forumSections)
    if (n <= 1) throw new HttpError(400, 'Het forum heeft minstens één forumdeel nodig.')
    const deleted = await db.delete(forumSections).where(eq(forumSections.id, Number(c.req.param('id')))).returning()
    if (!deleted.length) throw notFound('Dit forumdeel bestaat niet.')
    return c.body(null, 204)
  })

  .post('/forum/admin/moderators', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const input = parse(z.object({ username: z.string().min(1, 'Wie?'), sectionId: z.number().int(), add: z.boolean() }), await c.req.json().catch(() => null))
    const user = await findUser(input.username)
    const [section] = await db.select({ id: forumSections.id }).from(forumSections).where(eq(forumSections.id, input.sectionId))
    if (!section) throw notFound('Dit forumdeel bestaat niet.')
    if (input.add) await db.insert(forumModerators).values({ sectionId: section.id, userId: user.id }).onConflictDoNothing()
    else await db.delete(forumModerators).where(and(eq(forumModerators.sectionId, section.id), eq(forumModerators.userId, user.id)))
    return c.body(null, 204)
  })

  // Ban for a number of days, or for good (days: null)
  .post('/forum/admin/bans', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const input = parse(
      z.object({ username: z.string().min(1, 'Wie?'), reason: z.string().trim().max(200).default(''), days: z.number().int().min(1).max(3650).nullable() }),
      await c.req.json().catch(() => null),
    )
    const user = await findUser(input.username)
    if (user.id === me.id) throw new HttpError(400, 'Je kunt jezelf niet verbannen.')
    if (user.forumRole === 'admin') throw new HttpError(400, 'Neem eerst de beheerdersrechten af.')
    const until = input.days ? new Date(Date.now() + input.days * 86_400_000) : null
    await db
      .insert(forumBans)
      .values({ userId: user.id, reason: input.reason, until, bannedById: me.id })
      .onConflictDoUpdate({ target: forumBans.userId, set: { reason: input.reason, until, bannedById: me.id, createdAt: new Date() } })
    return c.body(null, 204)
  })

  .delete('/forum/admin/bans/:username', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const user = await findUser(c.req.param('username'))
    await db.delete(forumBans).where(eq(forumBans.userId, user.id))
    return c.body(null, 204)
  })

  .post('/forum/admin/channels', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const input = parse(
      z.object({
        name: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,24}$/, 'Een kanaalnaam heeft 2 tot 24 letters, cijfers of streepjes.'),
        topic: z.string().trim().max(FORUM_LIMITS.chatTopic).default(''),
      }),
      await c.req.json().catch(() => null),
    )
    const [exists] = await db.select({ id: chatChannels.id }).from(chatChannels).where(eq(chatChannels.name, input.name))
    if (exists) throw new HttpError(409, `#${input.name} bestaat al.`)
    await db.insert(chatChannels).values({ ...input, position: 100 })
    return c.json({ name: input.name }, 201)
  })

  .delete('/forum/admin/channels/:name', async (c) => {
    const me = requireUser(c)
    requireAdmin(me)
    const [{ n }] = await db.select({ n: count() }).from(chatChannels).where(isNotNull(chatChannels.id))
    if (n <= 1) throw new HttpError(400, 'Er moet minstens één kanaal blijven.')
    await db.delete(chatChannels).where(eq(chatChannels.name, c.req.param('name')))
    return c.body(null, 204)
  })
