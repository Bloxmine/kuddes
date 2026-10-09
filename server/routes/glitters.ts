import { and, arrayContains, count, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { GLITTER_CATEGORIES, GLITTER_LIMITS, isGlitterCategory, type Glitter, type GlitterCategory, type GlitterList } from '../../shared/glitters'
import { db } from '../db/client'
import { glitterCollection, glitters, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { removeUpload, storeGlitter } from '../lib/uploads'
import { summaryColumns } from '../lib/users'

export type GlitterRow = { glitter: typeof glitters.$inferSelect; user: Parameters<typeof toSummary>[0] }

export async function toGlitters(rows: GlitterRow[], viewer: User | null): Promise<Glitter[]> {
  const ids = rows.map((r) => r.glitter.id)
  const mine =
    viewer && ids.length
      ? new Set(
          (await db.select({ id: glitterCollection.glitterId }).from(glitterCollection).where(and(eq(glitterCollection.userId, viewer.id), inArray(glitterCollection.glitterId, ids)))).map(
            (r) => r.id,
          ),
        )
      : new Set<number>()
  return rows.map(({ glitter: g, user }) => ({
    id: g.id,
    title: g.title,
    categories: tagsOf(g.categories),
    url: uploadUrl(g.path)!,
    width: g.width,
    height: g.height,
    uses: g.uses,
    user: toSummary(user),
    collected: mine.has(g.id),
    // Only your own: the admin removes others' plaatjes in Beheer
    canDelete: viewer?.id === g.userId,
    createdAt: g.createdAt.toISOString(),
  }))
}

/** Known tags only, without doubles; an old or empty list becomes Overig. */
function tagsOf(stored: string[]): GlitterCategory[] {
  const tags = [...new Set(stored.filter(isGlitterCategory))]
  return tags.length ? tags : ['overig']
}

const categoriesSchema = z
  .array(z.enum(Object.keys(GLITTER_CATEGORIES) as [GlitterCategory], { message: 'Kies een bestaande categorie.' }))
  .min(1, 'Kies minstens één categorie.')
  .max(GLITTER_LIMITS.tags, `Kies maximaal ${GLITTER_LIMITS.tags} categorieën.`)
  .transform((tags) => [...new Set(tags)])

const uploadSchema = z.object({
  title: z.string().trim().min(1, 'Geef je plaatje een titel.').max(GLITTER_LIMITS.title, `De titel mag maximaal ${GLITTER_LIMITS.title} tekens hebben.`),
  categories: categoriesSchema,
})

export const glitterRoutes = new Hono<AppEnv>()
  // One glitterplaatje (for an embed in a forum post)
  .get('/glitters/:id{[0-9]+}', async (c) => {
    const rows = await db
      .select({ glitter: glitters, user: summaryColumns })
      .from(glitters)
      .innerJoin(users, eq(users.id, glitters.userId))
      .where(and(eq(glitters.id, Number(c.req.param('id'))), sql`${users.blockedAt} is null`))
    if (!rows.length) throw notFound('Dit glitterplaatje bestaat niet (meer).')
    const [g] = await toGlitters(rows, c.get('user') ?? null)
    return c.json(g)
  })
  // Browse: by category, your uploads or your collection, search, newest or most used
  .get('/glitters', async (c) => {
    const viewer = c.get('user')
    const category = c.req.query('categorie')
    const filter = c.req.query('filter')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const popular = c.req.query('sort') === 'populair'
    const perPage = Math.min(Number(c.req.query('limit')) || GLITTER_LIMITS.perPage, 48)

    const scope: (SQL | undefined)[] = []
    if (filter === 'mijn' || filter === 'verzameling') {
      if (!viewer) throw new HttpError(401, 'Je moet ingelogd zijn.')
      scope.push(
        filter === 'mijn'
          ? eq(glitters.userId, viewer.id)
          : inArray(glitters.id, db.select({ id: glitterCollection.glitterId }).from(glitterCollection).where(eq(glitterCollection.userId, viewer.id))),
      )
    }
    if (q) scope.push(ilike(glitters.title, `%${q.replace(/[%_\\]/g, '\\$&')}%`))
    scope.push(sql`${users.blockedAt} is null`)
    const inCategory = isGlitterCategory(category) ? arrayContains(glitters.categories, [category]) : undefined

    // A plaatje with two tags counts in both, but once in "alles"
    const tag = sql<string>`unnest(${glitters.categories})`
    const [countRows, [all]] = await Promise.all([
      db
        .select({ category: tag.as('category'), n: count() })
        .from(glitters)
        .innerJoin(users, eq(users.id, glitters.userId))
        .where(and(...scope))
        .groupBy(sql`1`),
      db.select({ n: count() }).from(glitters).innerJoin(users, eq(users.id, glitters.userId)).where(and(...scope)),
    ])
    const counts = Object.fromEntries([['alles', all.n], ...Object.keys(GLITTER_CATEGORIES).map((k) => [k, 0])]) as GlitterList['counts']
    for (const r of countRows) if (isGlitterCategory(r.category)) counts[r.category] = r.n
    const total = inCategory && isGlitterCategory(category) ? counts[category] : counts.alles
    const pages = Math.max(1, Math.ceil(total / perPage))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const rows = await db
      .select({ glitter: glitters, user: summaryColumns })
      .from(glitters)
      .innerJoin(users, eq(users.id, glitters.userId))
      .where(and(...scope, inCategory))
      .orderBy(...(popular ? [desc(glitters.uses), desc(glitters.id)] : [desc(glitters.id)]))
      .limit(perPage)
      .offset((page - 1) * perPage)
    const result: GlitterList = { items: await toGlitters(rows, viewer), total, page, pages, counts }
    return c.json(result)
  })

  .post('/glitters', rateLimit('glitterplaatjes uploaden', 30, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const body = await c.req.parseBody()
    const input = parse(uploadSchema, { title: body.title, categories: String(body.categories ?? '').split(',').filter(Boolean) })
    const stored = await storeGlitter(body.file, GLITTER_LIMITS.bytes, GLITTER_LIMITS.side)
    const [row] = await db
      .insert(glitters)
      .values({ userId: me.id, title: input.title, categories: input.categories, path: stored.path, width: stored.width, height: stored.height })
      .returning()
    // Your own uploads go straight into your collection
    await db.insert(glitterCollection).values({ userId: me.id, glitterId: row.id }).onConflictDoNothing()
    const [glitter] = await toGlitters([{ glitter: row, user: me }], me)
    return c.json(glitter, 201)
  })

  // Change the tags of your own plaatje
  .patch('/glitters/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ categories: categoriesSchema }), await c.req.json().catch(() => ({})))
    const [row] = await db.select({ userId: glitters.userId }).from(glitters).where(eq(glitters.id, Number(c.req.param('id'))))
    if (!row) throw notFound('Dit plaatje bestaat niet (meer).')
    if (row.userId !== me.id) throw new HttpError(403, 'Dit is niet jouw plaatje.')
    await db.update(glitters).set({ categories: input.categories }).where(eq(glitters.id, Number(c.req.param('id'))))
    return c.body(null, 204)
  })

  .delete('/glitters/:id', async (c) => {
    const me = requireUser(c)
    const [row] = await db.select().from(glitters).where(eq(glitters.id, Number(c.req.param('id'))))
    if (!row) throw notFound('Dit plaatje bestaat niet (meer).')
    if (row.userId !== me.id) throw new HttpError(403, 'Dit is niet jouw plaatje.')
    await db.delete(glitters).where(eq(glitters.id, row.id))
    await removeUpload(row.path)
    return c.body(null, 204)
  })

  // Your own album ("Verzamel")
  .post('/glitters/:id/collect', rateLimit('verzamelen', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const [row] = await db.select({ id: glitters.id }).from(glitters).where(eq(glitters.id, id))
    if (!row) throw notFound('Dit plaatje bestaat niet (meer).')
    await db.insert(glitterCollection).values({ userId: me.id, glitterId: id }).onConflictDoNothing()
    return c.body(null, 204)
  })

  .delete('/glitters/:id/collect', async (c) => {
    const me = requireUser(c)
    await db.delete(glitterCollection).where(and(eq(glitterCollection.userId, me.id), eq(glitterCollection.glitterId, Number(c.req.param('id')))))
    return c.body(null, 204)
  })
