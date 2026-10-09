import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { SavedDesign, SharedDesign, SharedDesignList } from '../../shared/api'
import { MAX_SAVED_DESIGNS, MAX_SHARED_DESIGNS, SHARED_DESIGNS_PAGE, SHARED_DESIGN_TEXT_MAX, type CustomTheme, type ProfileColors } from '../../shared/customization'
import { db } from '../db/client'
import { savedDesigns, sharedDesignRespects, sharedDesigns, users, type User } from '../db/schema'
import { customThemeSchema, profileColorsSchema } from '../lib/customization'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

const KINDS = ['design', 'thema'] as const
const isKind = (k: unknown): k is (typeof KINDS)[number] => KINDS.includes(k as never)

const nameSchema = z.string().trim().min(1, 'Geef het een naam.').max(40, 'Een naam mag maximaal 40 tekens hebben.')
const descriptionSchema = z.string().trim().max(SHARED_DESIGN_TEXT_MAX, `Een beschrijving mag maximaal ${SHARED_DESIGN_TEXT_MAX} tekens hebben.`)

const respectCount = sql<number>`(select count(*)::int from shared_design_respects r where r.design_id = ${sharedDesigns.id})`
const respectedBy = (viewer: User | null) =>
  viewer ? sql<boolean>`exists(select 1 from shared_design_respects r where r.design_id = ${sharedDesigns.id} and r.user_id = ${viewer.id})` : sql<boolean>`false`

/** A look as it goes into the gallery: without a background photo (that stays the sharer's own upload). */
function withoutPhoto(kind: 'design' | 'thema', data: ProfileColors | CustomTheme) {
  const { image, ...rest } = data as ProfileColors & CustomTheme
  void image
  return kind === 'design' ? parse(profileColorsSchema, rest) : parse(customThemeSchema, rest)
}

async function load(id: number, viewer: User | null) {
  const [row] = await db
    .select({ design: sharedDesigns, user: summaryColumns, respects: respectCount, respected: respectedBy(viewer) })
    .from(sharedDesigns)
    .innerJoin(users, eq(users.id, sharedDesigns.userId))
    .where(and(eq(sharedDesigns.id, id), sql`${users.blockedAt} is null`))
  if (!row) throw notFound('Dit design staat niet (meer) in de galerij.')
  return row
}

type Row = Awaited<ReturnType<typeof load>>

const toShared = ({ design: d, user, respects, respected }: Row) =>
  ({ id: d.id, kind: d.kind, name: d.name, description: d.description, data: d.data, user: toSummary(user), uses: d.uses, respects, respected, createdAt: d.createdAt.toISOString() }) as SharedDesign

export const designGalleryRoutes = new Hono<AppEnv>()
  // Browse: site themes or profile designs, your own, search, newest / most respect / most used
  .get('/designs', async (c) => {
    const viewer = c.get('user') ?? null
    const kind = c.req.query('soort')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const sort = c.req.query('sort')
    const scope: (SQL | undefined)[] = [sql`${users.blockedAt} is null`]
    if (c.req.query('filter') === 'mijn') {
      if (!viewer) throw new HttpError(401, 'Je moet ingelogd zijn.')
      scope.push(eq(sharedDesigns.userId, viewer.id))
    }
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, '\\$&')}%`
      scope.push(or(ilike(sharedDesigns.name, like), ilike(sharedDesigns.description, like), ilike(users.nickname, like)))
    }

    const countRows = await db
      .select({ kind: sharedDesigns.kind, n: count() })
      .from(sharedDesigns)
      .innerJoin(users, eq(users.id, sharedDesigns.userId))
      .where(and(...scope))
      .groupBy(sharedDesigns.kind)
    const counts = { alles: 0, thema: 0, design: 0 }
    for (const r of countRows) {
      if (isKind(r.kind)) counts[r.kind] = r.n
      counts.alles += r.n
    }
    const total = isKind(kind) ? counts[kind] : counts.alles
    const pages = Math.max(1, Math.ceil(total / SHARED_DESIGNS_PAGE))
    const page = Math.min(Math.max(1, Number(c.req.query('pagina')) || 1), pages)
    const order = sort === 'populair' ? [desc(respectCount), desc(sharedDesigns.id)] : sort === 'gebruikt' ? [desc(sharedDesigns.uses), desc(sharedDesigns.id)] : [desc(sharedDesigns.id)]
    const rows = await db
      .select({ design: sharedDesigns, user: summaryColumns, respects: respectCount, respected: respectedBy(viewer) })
      .from(sharedDesigns)
      .innerJoin(users, eq(users.id, sharedDesigns.userId))
      .where(and(...scope, isKind(kind) ? eq(sharedDesigns.kind, kind) : undefined))
      .orderBy(...order)
      .limit(SHARED_DESIGNS_PAGE)
      .offset((page - 1) * SHARED_DESIGNS_PAGE)
    return c.json({ items: rows.map(toShared), total, page, pages, counts } satisfies SharedDesignList)
  })

  // Share one of your own saved themes or designs (a copy, without its background photo)
  .post('/designs', rateLimit('designs delen', 30, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({ savedId: z.number().int(), name: nameSchema.optional(), description: descriptionSchema.default('') }),
      await c.req.json().catch(() => null),
    )
    const [saved] = await db
      .select()
      .from(savedDesigns)
      .where(and(eq(savedDesigns.id, input.savedId), eq(savedDesigns.userId, me.id)))
    if (!saved) throw notFound('Dit design staat niet (meer) bij je designs.')
    const [{ n }] = await db.select({ n: count() }).from(sharedDesigns).where(eq(sharedDesigns.userId, me.id))
    if (n >= MAX_SHARED_DESIGNS) throw new HttpError(400, `Je kunt maximaal ${MAX_SHARED_DESIGNS} designs delen. Haal er eerst een uit de galerij.`)
    const data = withoutPhoto(saved.kind, saved.data)
    const same = await db
      .select({ id: sharedDesigns.id })
      .from(sharedDesigns)
      .where(and(eq(sharedDesigns.userId, me.id), sql`${sharedDesigns.data} = ${JSON.stringify(data)}::jsonb`))
    if (same.length) throw new HttpError(400, 'Dit design staat al in de galerij.')
    const [row] = await db
      .insert(sharedDesigns)
      .values({ userId: me.id, kind: saved.kind, name: input.name ?? saved.name, description: input.description, data })
      .returning({ id: sharedDesigns.id })
    return c.json(toShared(await load(row.id, me)), 201)
  })

  // Change the name or description of your own
  .patch('/designs/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ name: nameSchema.optional(), description: descriptionSchema.optional() }), await c.req.json().catch(() => null))
    const { design } = await load(Number(c.req.param('id')), me)
    if (design.userId !== me.id) throw new HttpError(403, 'Dit is niet jouw design.')
    await db
      .update(sharedDesigns)
      .set({ ...(input.name && { name: input.name }), ...(input.description !== undefined && { description: input.description }) })
      .where(eq(sharedDesigns.id, design.id))
    return c.json(toShared(await load(design.id, me)))
  })

  // Out of the gallery: by whoever shared it, or the admin. Copies others kept stay theirs.
  .delete('/designs/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const { design } = await load(Number(c.req.param('id')), me)
    if (design.userId !== me.id && me.forumRole !== 'admin') throw new HttpError(403, 'Dit is niet jouw design.')
    await db.delete(sharedDesigns).where(eq(sharedDesigns.id, design.id))
    return c.body(null, 204)
  })

  .post('/designs/:id{[0-9]+}/respect', async (c) => {
    const me = requireUser(c)
    const { design } = await load(Number(c.req.param('id')), me)
    if (design.userId === me.id) throw new HttpError(400, 'Je kunt geen respect geven aan je eigen design.')
    await db.insert(sharedDesignRespects).values({ userId: me.id, designId: design.id }).onConflictDoNothing()
    return c.json(toShared(await load(design.id, me)))
  })

  .delete('/designs/:id{[0-9]+}/respect', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    await db.delete(sharedDesignRespects).where(and(eq(sharedDesignRespects.userId, me.id), eq(sharedDesignRespects.designId, id)))
    return c.json(toShared(await load(id, me)))
  })

  // Someone takes it: counted (not for your own), and with `keep` a copy goes into their Mijn thema's / Mijn designs
  .post('/designs/:id{[0-9]+}/use', rateLimit('designs gebruiken', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { keep } = parse(z.object({ keep: z.boolean() }), await c.req.json().catch(() => null))
    const { design } = await load(Number(c.req.param('id')), me)
    let saved: SavedDesign | null = null
    if (keep) {
      const [{ n }] = await db.select({ n: count() }).from(savedDesigns).where(and(eq(savedDesigns.userId, me.id), eq(savedDesigns.kind, design.kind)))
      if (n >= MAX_SAVED_DESIGNS) {
        throw new HttpError(400, `Je kunt maximaal ${MAX_SAVED_DESIGNS} ${design.kind === 'design' ? 'designs' : "thema's"} bewaren. Verwijder er eerst een.`)
      }
      const [row] = await db.insert(savedDesigns).values({ userId: me.id, kind: design.kind, name: design.name, data: design.data }).returning()
      saved = { id: row.id, kind: row.kind, name: row.name, data: row.data, updatedAt: row.updatedAt.toISOString() } as SavedDesign
    }
    if (design.userId !== me.id) await db.update(sharedDesigns).set({ uses: sql`${sharedDesigns.uses} + 1` }).where(eq(sharedDesigns.id, design.id))
    return c.json({ saved })
  })
