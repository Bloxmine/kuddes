import { and, asc, count, desc, eq, gte, ilike, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { KuddeCategoryCounts, KuddeDetail } from '../../shared/api'
import { EMPTY_KUDDE_INFO, KUDDE_CATEGORIES, KUDDE_INFO_LIMITS, KUDDE_RIGHT_KEYS, isKuddeCategory, type KuddeCategory, type KuddeRight } from '../../shared/kuddes'
import { db } from '../db/client'
import { activities, kuddeEvents, kuddeMembers, kuddePhotos, kuddePosts, kuddes, users } from '../db/schema'
import { recordActivity } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { kuddeColumns, memberCount, membershipOf, requireRight, rightsOf, toKudde, toEvents } from '../lib/kuddes'
import { notify } from '../lib/notifications'
import { findUser, summaryColumns, requireProfileAccess } from '../lib/users'
import { ownsImages, profileColorsSchema } from '../lib/customization'
import { checkSoon } from '../lib/achievements'
import { groupMembershipChanged } from '../lib/federation/groups'
import { resolveHandle } from '../lib/federation/actors'
import { HANDLE_PATTERN } from '../../shared/federation'
import { serverInfo } from '../lib/siteSettings'
import { clientIp } from '../lib/clientIp'

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} mag maximaal ${max} tekens hebben.`)
    .transform((s) => s || null)
    .nullable()
    .optional()

const categorySchema = z.string().refine(isKuddeCategory, 'Kies een categorie.')

const detailsSchema = z.object({
  description: z.string().trim().max(1000, 'De omschrijving mag maximaal 1000 tekens hebben.').optional(),
  category: categorySchema.optional(),
  subcategory: optional(40, 'De subcategorie'),
  address: optional(120, 'Het adres'),
  city: optional(60, 'De plaats'),
  phone: optional(30, 'Het telefoonnummer').refine((p) => !p || /^[0-9+()\-\s/]{6,30}$/.test(p), 'Ongeldig telefoonnummer.'),
  website: optional(200, 'De website').refine((w) => !w || /^https?:\/\/\S+\.\S+/i.test(w), 'Een website begint met http:// of https://'),
  visibility: z.enum(['openbaar', 'besloten']).optional(),
  photosShareable: z.boolean().optional(),
  photography: z.boolean().optional(),
  info: z
    .object({
      activities: z.string().trim().max(KUDDE_INFO_LIMITS.activities, `"Wat doen we?" mag maximaal ${KUDDE_INFO_LIMITS.activities} tekens hebben.`),
      when: z.string().trim().max(KUDDE_INFO_LIMITS.when, `"Wanneer?" mag maximaal ${KUDDE_INFO_LIMITS.when} tekens hebben.`),
      hours: z.string().trim().max(KUDDE_INFO_LIMITS.hours, `De openingstijden mogen maximaal ${KUDDE_INFO_LIMITS.hours} tekens hebben.`),
    })
    .optional(),
})

const createSchema = detailsSchema.extend({
  name: z.string().trim().min(3, 'De naam moet minstens 3 tekens hebben.').max(60, 'De naam mag maximaal 60 tekens hebben.'),
})

/** A subcategory must belong to the category; places keep their address, others lose it (phone and website are for every Kudde). */
function cleanDetails<T extends z.infer<typeof detailsSchema>>(input: T, category: KuddeCategory): T {
  const info = KUDDE_CATEGORIES[category]
  const subcategory = input.subcategory && (info.subcategories as readonly string[]).includes(input.subcategory) ? input.subcategory : null
  if (input.subcategory !== undefined && input.subcategory && !subcategory) {
    throw new HttpError(400, 'Kies een subcategorie uit de lijst.', { subcategory: 'Kies een subcategorie uit de lijst.' })
  }
  return {
    ...input,
    ...(input.subcategory !== undefined && { subcategory }),
    ...(!info.place && { address: null, city: null }),
  }
}

/** "CMD Survivors!" -> "cmd-survivors" */
function slugify(name: string) {
  return (
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'kudde'
  )
}

async function findKudde(slug: string) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, slug)).limit(1)
  if (!kudde) throw notFound('Deze Kudde bestaat niet.')
  return kudde
}


const ownerCount = (kuddeId: number) =>
  db
    .select({ n: count() })
    .from(kuddeMembers)
    .where(and(eq(kuddeMembers.kuddeId, kuddeId), eq(kuddeMembers.role, 'owner')))
    .then(([r]) => r.n)

/** The owners and beheerders (members with rights), owners first. */
const managersOf = (kuddeId: number) =>
  db
    .select({ user: summaryColumns, role: kuddeMembers.role, rights: kuddeMembers.rights })
    .from(kuddeMembers)
    .innerJoin(users, eq(users.id, kuddeMembers.userId))
    .where(and(eq(kuddeMembers.kuddeId, kuddeId), or(eq(kuddeMembers.role, 'owner'), and(eq(kuddeMembers.role, 'member'), sql`cardinality(${kuddeMembers.rights}) > 0`))))
    .orderBy(sql`${kuddeMembers.role} = 'owner' desc`, asc(kuddeMembers.joinedAt))

/** When each visitor last counted as a view of each Kudde, so reloading doesn't push the teller up. */
const lastViews = new Map<string, number>()
const VIEW_DEDUPE_MS = 30 * 60 * 1000

async function countView(kuddeId: number, visitor: string) {
  const key = `${kuddeId}:${visitor}`
  const now = Date.now()
  if (now - (lastViews.get(key) ?? 0) < VIEW_DEDUPE_MS) return
  lastViews.set(key, now)
  // Forget old ones now and then, so the map doesn't grow forever
  if (lastViews.size > 50_000) for (const [k, at] of lastViews) if (now - at > VIEW_DEDUPE_MS) lastViews.delete(k)
  await db.update(kuddes).set({ views: sql`${kuddes.views} + 1` }).where(eq(kuddes.id, kuddeId))
}

export const kuddeRoutes = new Hono<AppEnv>()
  // ?category=spots&sub=Cafés%20%26%20clubs&q=paradiso&sort=populair|nieuwste
  .get('/kuddes', async (c) => {
    const rawSort = c.req.query('sort')
    const sort = rawSort === 'nieuwste' || rawSort === 'az' ? rawSort : 'populair'
    const limit = Math.min(Number(c.req.query('limit')) || 50, 100)
    const category = c.req.query('category')
    const sub = c.req.query('sub')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    // "!community@lemmy.world": looked up there, and a Kudde from then on
    if (c.get('user') && HANDLE_PATTERN.test(q) && serverInfo().fediverse) {
      const remote = await resolveHandle(q.startsWith('@') ? `!${q.slice(1)}` : q.startsWith('!') ? q : `!${q}`).catch(() => null)
      const [kudde] = remote ? await db.select(kuddeColumns).from(kuddes).where(eq(kuddes.remoteActorId, remote.user.id)) : []
      if (kudde) return c.json([toKudde(kudde)])
    }
    const rows = await db
      .select(kuddeColumns)
      .from(kuddes)
      .where(
        and(
          isKuddeCategory(category) ? eq(kuddes.category, category) : undefined,
          sub ? eq(kuddes.subcategory, sub) : undefined,
          q ? or(ilike(kuddes.name, pattern), ilike(kuddes.city, pattern), ilike(kuddes.address, pattern), ilike(kuddes.description, pattern)) : undefined,
        ),
      )
      .orderBy(...(sort === 'nieuwste' ? [desc(kuddes.id)] : sort === 'az' ? [asc(sql`lower(${kuddes.name})`)] : [desc(memberCount), desc(kuddes.id)]))
      .limit(limit)
    return c.json(rows.map(toKudde))
  })

  .get('/kuddes/categories', async (c) => {
    const rows = await db.select({ category: kuddes.category, n: count() }).from(kuddes).groupBy(kuddes.category)
    const counts = Object.fromEntries(Object.keys(KUDDE_CATEGORIES).map((k) => [k, rows.find((r) => r.category === k)?.n ?? 0]))
    return c.json(counts as KuddeCategoryCounts)
  })

  .get('/users/:username/kuddes', async (c) => {
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(c.get('user'), user)
    const rows = await db
      .select(kuddeColumns)
      .from(kuddes)
      .innerJoin(kuddeMembers, eq(kuddeMembers.kuddeId, kuddes.id))
      .where(and(eq(kuddeMembers.userId, user.id), ne(kuddeMembers.role, 'pending')))
      .orderBy(desc(kuddeMembers.joinedAt))
    return c.json(rows.map(toKudde))
  })

  .get('/kuddes/:slug', async (c) => {
    const viewer = c.get('user')
    const kudde = await findKudde(c.req.param('slug'))
    const access = viewer ? await rightsOf(kudde.id, viewer.id) : null
    const membership = access?.role ?? null
    const isMember = membership === 'owner' || membership === 'member'
    if (membership !== 'owner') await countView(kudde.id, viewer ? `u${viewer.id}` : `ip${clientIp(c)}`)
    const eventsHidden = kudde.visibility === 'besloten' && !isMember

    const [[creator], members, [{ n }], upcoming, requests, managers] = await Promise.all([
      kudde.creatorId ? db.select(summaryColumns).from(users).where(eq(users.id, kudde.creatorId)) : Promise.resolve([]),
      db
        .select(summaryColumns)
        .from(kuddeMembers)
        .innerJoin(users, eq(users.id, kuddeMembers.userId))
        .where(and(eq(kuddeMembers.kuddeId, kudde.id), ne(kuddeMembers.role, 'pending')))
        .orderBy(desc(kuddeMembers.joinedAt))
        .limit(60),
      db
        .select({ n: count() })
        .from(kuddeMembers)
        .where(and(eq(kuddeMembers.kuddeId, kudde.id), ne(kuddeMembers.role, 'pending'))),
      eventsHidden
        ? Promise.resolve([])
        : db
            .select()
            .from(kuddeEvents)
            // Still show today's events that already started
            .where(and(eq(kuddeEvents.kuddeId, kudde.id), gte(sql`coalesce(${kuddeEvents.endsAt}, ${kuddeEvents.startsAt})`, sql`now() - interval '6 hours'`)))
            .orderBy(asc(kuddeEvents.startsAt))
            .limit(20),
      access?.rights.includes('aanvragen')
        ? db
            .select(summaryColumns)
            .from(kuddeMembers)
            .innerJoin(users, eq(users.id, kuddeMembers.userId))
            .where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.role, 'pending')))
            .orderBy(asc(kuddeMembers.joinedAt))
        : Promise.resolve([]),
      managersOf(kudde.id),
    ])

    const detail: KuddeDetail = {
      ...toKudde({ ...kudde, memberCount: n }),
      creator: creator ? toSummary(creator) : null,
      members: members.map(toSummary),
      membership,
      canPost: isMember,
      events: await toEvents(upcoming, viewer),
      eventsHidden,
      requests: requests.map(toSummary),
      rights: access?.rights ?? [],
      managers: managers.map((m) => ({ user: toSummary(m.user), role: m.role === 'owner' ? 'owner' : 'beheerder', rights: m.role === 'owner' ? KUDDE_RIGHT_KEYS : m.rights, creator: m.user.id === kudde.creatorId })),
      design: kudde.design,
      info: { ...EMPTY_KUDDE_INFO, ...kudde.info },
    }
    return c.json(detail)
  })

  .post(
    '/kuddes',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
      },
    }),
    rateLimit('Kuddes aanmaken', 10, 24 * 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const body = await c.req.parseBody()
      const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : undefined)
      const parsed = parse(createSchema, {
        name: text('name'),
        description: text('description') ?? '',
        category: text('category') ?? 'groepen',
        subcategory: text('subcategory'),
        address: text('address'),
        city: text('city'),
        phone: text('phone'),
        website: text('website'),
        visibility: text('visibility') ?? 'openbaar',
        photography: text('photography') === 'true',
      })
      const input = cleanDetails(parsed, parsed.category as KuddeCategory)

      const [taken] = await db
        .select({ id: kuddes.id })
        .from(kuddes)
        .where(sql`lower(${kuddes.name}) = lower(${input.name})`)
      if (taken) throw new HttpError(409, 'Er bestaat al een Kudde met deze naam.', { name: 'Er bestaat al een Kudde met deze naam.' })

      const image = body.file instanceof File && body.file.size > 0 ? await storeImage(body.file, 'kuddes') : null

      // Find a free slug: "minecraft", "minecraft-2", ...
      const base = slugify(input.name)
      const existing = await db
        .select({ slug: kuddes.slug })
        .from(kuddes)
        .where(sql`${kuddes.slug} = ${base} or ${kuddes.slug} like ${`${base}-%`}`)
      // "categories" is taken by /kuddes/categories
      const used = new Set([...existing.map((r) => r.slug), 'categories'])
      let slug = base
      for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`

      const kudde = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(kuddes)
          .values({
            slug,
            name: input.name,
            description: input.description ?? '',
            category: input.category,
            subcategory: input.subcategory ?? null,
            address: input.address ?? null,
            city: input.city ?? null,
            phone: input.phone ?? null,
            website: input.website ?? null,
            visibility: input.visibility ?? 'openbaar',
            photography: input.photography ?? false,
            imagePath: image?.path ?? null,
            creatorId: me.id,
          })
          .returning()
        await tx.insert(kuddeMembers).values({ kuddeId: created.id, userId: me.id, role: 'owner' })
        await recordActivity({ type: 'kudde_join', actorId: me.id, kuddeId: created.id }, tx)
        return created
      })
      return c.json(toKudde({ ...kudde, memberCount: 1 }), 201)
    },
  )

  // Change the details (the owner)
  .patch('/kuddes/:slug', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireRight(kudde.id, me.id, 'bewerken')
    const parsed = parse(detailsSchema, await c.req.json().catch(() => null))
    const input = cleanDetails(parsed, (parsed.category ?? kudde.category) as KuddeCategory)
    const [updated] = await db.update(kuddes).set(input).where(eq(kuddes.id, kudde.id)).returning()
    // Opening a closed Kudde lets everyone who was waiting in
    if (kudde.visibility === 'besloten' && updated.visibility === 'openbaar') {
      await db
        .update(kuddeMembers)
        .set({ role: 'member' })
        .where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.role, 'pending')))
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(kuddeMembers)
      .where(and(eq(kuddeMembers.kuddeId, kudde.id), ne(kuddeMembers.role, 'pending')))
    return c.json(toKudde({ ...updated, memberCount: n }))
  })

  // Join an open Kudde, or ask to join a closed one
  .post('/kuddes/:slug/membership', rateLimit('Kuddes', 100, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    const role = kudde.visibility === 'besloten' ? 'pending' : 'member'
    await db.transaction(async (tx) => {
      const joined = await tx
        .insert(kuddeMembers)
        .values({ kuddeId: kudde.id, userId: me.id, role })
        .onConflictDoNothing()
        .returning({ userId: kuddeMembers.userId })
      if (joined.length && role === 'member') await recordActivity({ type: 'kudde_join', actorId: me.id, kuddeId: kudde.id }, tx)
    })
    // A community elsewhere (Lemmy): joining follows it there
    await groupMembershipChanged(me, kudde, true)
    return c.json({ membership: await membershipOf(kudde.id, me.id) })
  })

  // Leave, or withdraw a request
  .delete('/kuddes/:slug/membership', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    if ((await membershipOf(kudde.id, me.id)) === 'owner' && (await ownerCount(kudde.id)) <= 1) {
      throw new HttpError(400, 'Je bent de enige eigenaar. Maak eerst iemand anders eigenaar, of verwijder de Kudde als je ermee wilt stoppen.')
    }
    await db.delete(kuddeMembers).where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.userId, me.id)))
    await db
      .delete(activities)
      .where(and(eq(activities.type, 'kudde_join'), eq(activities.actorId, me.id), eq(activities.kuddeId, kudde.id)))
    await groupMembershipChanged(me, kudde, false)
    return c.json({ membership: 'none' })
  })

  // The owner lets someone in, or turns them down
  .post('/kuddes/:slug/requests/:username', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireRight(kudde.id, me.id, 'aanvragen')
    const user = await findUser(c.req.param('username'))
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(kuddeMembers)
        .set({ role: 'member', joinedAt: new Date() })
        .where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.userId, user.id), eq(kuddeMembers.role, 'pending')))
        .returning({ userId: kuddeMembers.userId })
      if (!updated.length) throw notFound('Deze aanvraag bestaat niet (meer).')
      await recordActivity({ type: 'kudde_join', actorId: user.id, kuddeId: kudde.id }, tx)
    })
    return c.body(null, 204)
  })

  .delete('/kuddes/:slug/requests/:username', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireRight(kudde.id, me.id, 'aanvragen')
    const user = await findUser(c.req.param('username'))
    await db
      .delete(kuddeMembers)
      .where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.userId, user.id), eq(kuddeMembers.role, 'pending')))
    return c.body(null, 204)
  })

  // The owner's own design: colours, patterns, the title bar and its font
  .put('/kuddes/:slug/design', rateLimit('Kudde-design', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireRight(kudde.id, me.id, 'pimpen')
    const { design } = parse(z.object({ design: profileColorsSchema.nullable() }), await c.req.json().catch(() => null))
    if (!ownsImages(me.id, design)) throw new HttpError(400, 'Je kunt alleen je eigen achtergronden gebruiken.')
    await db.update(kuddes).set({ design }).where(eq(kuddes.id, kudde.id))
    checkSoon(me.id)
    return c.json({ design })
  })

  // A new picture for the Kudde (owner); the old one is removed
  .put(
    '/kuddes/:slug/image',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die foto is te groot (max 8 MB).')
      },
    }),
    rateLimit('uploads', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireUser(c)
      const kudde = await findKudde(c.req.param('slug'))
      await requireRight(kudde.id, me.id, 'bewerken')
      const body = await c.req.parseBody()
      if (!(body.file instanceof File) || !body.file.size) throw new HttpError(400, 'Kies een foto.')
      const image = await storeImage(body.file, 'kuddes')
      await db.update(kuddes).set({ imagePath: image.path }).where(eq(kuddes.id, kudde.id))
      await removeUpload(kudde.imagePath)
      return c.json({ imageUrl: `/uploads/${image.path}` })
    },
  )

  .delete('/kuddes/:slug/image', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireRight(kudde.id, me.id, 'bewerken')
    await db.update(kuddes).set({ imagePath: null }).where(eq(kuddes.id, kudde.id))
    await removeUpload(kudde.imagePath)
    return c.body(null, 204)
  })

  // An owner makes a member an owner or a beheerder (with some rights), or a plain member again
  .put('/kuddes/:slug/managers/:username', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    if ((await membershipOf(kudde.id, me.id)) !== 'owner') throw new HttpError(403, 'Alleen een eigenaar kan beheerders kiezen.')
    const target = await findUser(c.req.param('username'))
    const input = parse(
      z.object({ role: z.enum(['owner', 'beheerder', 'lid']), rights: z.array(z.enum(KUDDE_RIGHT_KEYS as [KuddeRight, ...KuddeRight[]])).default([]) }),
      await c.req.json().catch(() => null),
    )
    const current = await membershipOf(kudde.id, target.id)
    if (current !== 'owner' && current !== 'member') throw new HttpError(400, `${target.nickname} is geen lid van deze Kudde.`)
    if (target.id === kudde.creatorId && target.id !== me.id) throw new HttpError(403, 'Wie de Kudde gemaakt heeft, blijft eigenaar.')
    if (current === 'owner' && input.role !== 'owner' && (await ownerCount(kudde.id)) <= 1) throw new HttpError(400, 'Er moet minstens één eigenaar blijven.')
    if (input.role === 'beheerder' && !input.rights.length) throw new HttpError(400, 'Kies wat de beheerder mag doen.')
    await db
      .update(kuddeMembers)
      .set({ role: input.role === 'owner' ? 'owner' : 'member', rights: input.role === 'beheerder' ? [...new Set(input.rights)] : [] })
      .where(and(eq(kuddeMembers.kuddeId, kudde.id), eq(kuddeMembers.userId, target.id)))
    if (input.role !== 'lid' && current !== input.role)
      await notify({
        userIds: [target.id],
        actorId: me.id,
        kind: 'kudde',
        ref: `kudde-beheer:${kudde.id}:${target.id}:${Date.now()}`,
        message: input.role === 'owner' ? `maakte je eigenaar van de Kudde ${kudde.name}` : `maakte je beheerder van de Kudde ${kudde.name}`,
        link: `/kuddes/${kudde.slug}`,
      })
    return c.body(null, 204)
  })

  .delete('/kuddes/:slug', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    if ((await membershipOf(kudde.id, me.id)) !== 'owner') throw new HttpError(403, 'Alleen de maker kan deze Kudde verwijderen.')
    const postPhotos = await db.select({ path: kuddePosts.photoPath }).from(kuddePosts).where(eq(kuddePosts.kuddeId, kudde.id))
    const albumPhotos = await db.select({ path: kuddePhotos.path }).from(kuddePhotos).where(eq(kuddePhotos.kuddeId, kudde.id))
    await db.delete(kuddes).where(eq(kuddes.id, kudde.id))
    await Promise.all([kudde.imagePath, ...postPhotos.map((p) => p.path), ...albumPhotos.map((p) => p.path)].map((p) => removeUpload(p)))
    return c.body(null, 204)
  })
