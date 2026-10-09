import { and, asc, count, desc, eq, gte, inArray, max, ne, or, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { KUDDE_GADGET_DEFAULTS, KUDDE_GADGET_LIMITS as L, KUDDE_GADGET_TYPES, type KuddeGadget, type KuddeGadgetConfig, type KuddeGadgetType, type OwnedKudde } from '../../shared/kuddeGadgets'
import { db } from '../db/client'
import { kuddeEvents, kuddeGadgets, kuddeMembers, kuddePosts, kuddes, users } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rightsOf } from '../lib/kuddes'
import { KUDDE_RIGHT_KEYS, type KuddeRight } from '../../shared/kuddes'
import { ONLINE_WINDOW_MS, isOnline, toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

const text = (max: number, label: string) => z.string().trim().max(max, `${label} mag maximaal ${max} tekens hebben.`)
const people = z.number().int().min(1).max(L.people)

const CONFIG_SCHEMAS = {
  teller: z.object({ label: text(L.counterLabel, 'De tekst onder de teller'), style: z.enum(['kilometer', 'led', 'klassiek']) }),
  leden: z.object({ goal: z.number().int().min(0).max(L.goal) }),
  nieuwkomers: z.object({ count: people }),
  online: z.object({}),
  actief: z.object({ count: people, days: z.union([z.literal(7), z.literal(30)]) }),
  agenda: z.object({ count: z.number().int().min(1).max(L.events) }),
  mededeling: z.object({ text: text(L.text, 'Een mededeling'), style: z.enum(['krijtbord', 'briefje', 'neon']) }),
  regels: z.object({ rules: z.array(text(L.rule, 'Een regel')).max(L.rules, `Maximaal ${L.rules} regels.`) }),
  aftellen: z.object({
    target: z.string().max(40).refine((v) => !v || !Number.isNaN(Date.parse(v)), 'Kies een geldige datum.'),
    label: text(L.label, 'De tekst'),
    doneText: text(L.doneText, 'De tekst als het zover is'),
  }),
} satisfies { [T in KuddeGadgetType]: z.ZodType<KuddeGadgetConfig[T]> }

const TYPE_KEYS = Object.keys(KUDDE_GADGET_TYPES) as [KuddeGadgetType, ...KuddeGadgetType[]]

type Row = typeof kuddeGadgets.$inferSelect
type Kudde = typeof kuddes.$inferSelect

async function findKudde(slug: string) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, slug)).limit(1)
  if (!kudde) throw notFound('Deze Kudde bestaat niet.')
  return kudde
}

async function requireOwner(kuddeId: number, userId: number) {
  if (!(await rightsOf(kuddeId, userId)).rights.includes('gadgets')) throw new HttpError(403, 'Alleen de beheerders van deze Kudde kunnen gadgets toevoegen en aanpassen.')
}

/** A gadget and the Kudde it's on, for changing it: only by the Kudde's owner. */
async function ownGadget(id: number, userId: number) {
  const [row] = await db.select().from(kuddeGadgets).where(eq(kuddeGadgets.id, id)).limit(1)
  if (!row) throw notFound('Deze gadget bestaat niet meer.')
  await requireOwner(row.kuddeId, userId)
  return row
}

const members = (kuddeId: number) => and(eq(kuddeMembers.kuddeId, kuddeId), ne(kuddeMembers.role, 'pending'))
const DAY_MS = 86_400_000

/** What each gadget shows, worked out once per kind for all of them. */
async function withData(kudde: Kudde, rows: Row[], isMember: boolean): Promise<KuddeGadget[]> {
  const shown = new Set(rows.map((r) => r.type))
  const most = (type: 'nieuwkomers' | 'actief' | 'agenda') => Math.max(0, ...rows.filter((r) => r.type === type).map((r) => (r.config as { count: number }).count))
  const closed = kudde.visibility === 'besloten' && !isMember

  // Who wrote most on the prikbord in the last 7 or 30 days, if a gadget asks for it
  const activeFor = (days: 7 | 30) =>
    shown.has('actief') && !closed && rows.some((r) => r.type === 'actief' && (r.config as KuddeGadgetConfig['actief']).days === days)
      ? db
          .select({ user: summaryColumns, posts: count() })
          .from(kuddePosts)
          .innerJoin(users, eq(users.id, kuddePosts.userId))
          .where(and(eq(kuddePosts.kuddeId, kudde.id), gte(kuddePosts.createdAt, new Date(Date.now() - days * DAY_MS)), sql`${users.blockedAt} is null`))
          .groupBy(users.id)
          .orderBy(desc(count()))
          .limit(most('actief'))
      : Promise.resolve([])

  const [memberCount, thisWeek, newest, online, active7, active30, events] = await Promise.all([
    shown.has('leden') ? db.select({ n: count() }).from(kuddeMembers).where(members(kudde.id)).then(([r]) => r.n) : 0,
    shown.has('leden')
      ? db.select({ n: count() }).from(kuddeMembers).where(and(members(kudde.id), gte(kuddeMembers.joinedAt, new Date(Date.now() - 7 * DAY_MS)))).then(([r]) => r.n)
      : 0,
    shown.has('nieuwkomers')
      ? db.select(summaryColumns).from(kuddeMembers).innerJoin(users, eq(users.id, kuddeMembers.userId)).where(members(kudde.id)).orderBy(desc(kuddeMembers.joinedAt)).limit(most('nieuwkomers'))
      : [],
    shown.has('online')
      ? db
          .select(summaryColumns)
          .from(kuddeMembers)
          .innerJoin(users, eq(users.id, kuddeMembers.userId))
          .where(and(members(kudde.id), gte(users.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_MS))))
          .orderBy(desc(users.lastSeenAt))
          .limit(40)
      : [],
    activeFor(7),
    activeFor(30),
    shown.has('agenda') && !closed
      ? db
          .select({ id: kuddeEvents.id, title: kuddeEvents.title, startsAt: kuddeEvents.startsAt, location: kuddeEvents.location })
          .from(kuddeEvents)
          .where(and(eq(kuddeEvents.kuddeId, kudde.id), gte(sql`coalesce(${kuddeEvents.endsAt}, ${kuddeEvents.startsAt})`, sql`now()`)))
          .orderBy(asc(kuddeEvents.startsAt))
          .limit(most('agenda'))
      : [],
  ])

  return rows.map((row) => {
    const base = { id: row.id, title: row.title, enabled: row.enabled }
    const config = row.config as never
    switch (row.type) {
      case 'teller':
        return { ...base, type: 'teller', config, data: { views: kudde.views } }
      case 'leden':
        return { ...base, type: 'leden', config, data: { members: memberCount, thisWeek } }
      case 'nieuwkomers':
        return { ...base, type: 'nieuwkomers', config, data: { members: newest.slice(0, (row.config as { count: number }).count).map(toSummary) } }
      case 'online':
        // "Toon offline" stays offline here too
        return { ...base, type: 'online', config, data: { members: online.filter(isOnline).map(toSummary) } }
      case 'actief': {
        const c = row.config as KuddeGadgetConfig['actief']
        const list = c.days === 7 ? active7 : active30
        return { ...base, type: 'actief', config, data: { hidden: closed, members: list.slice(0, c.count).map((r) => ({ user: toSummary(r.user), posts: r.posts })) } }
      }
      case 'agenda':
        return {
          ...base,
          type: 'agenda',
          config,
          data: { hidden: closed, events: events.slice(0, (row.config as { count: number }).count).map((e) => ({ ...e, startsAt: e.startsAt.toISOString() })) },
        }
      default:
        return { ...base, type: row.type, config, data: null } as KuddeGadget
    }
  })
}

const listOf = (kuddeId: number) => db.select().from(kuddeGadgets).where(eq(kuddeGadgets.kuddeId, kuddeId)).orderBy(asc(kuddeGadgets.position), asc(kuddeGadgets.id))

export const kuddeGadgetRoutes = new Hono<AppEnv>()
  // The gadgets on a Kudde: the owner also gets the hidden ones (to switch them back on)
  .get('/kuddes/:slug/gadgets', async (c) => {
    const viewer = c.get('user')
    const kudde = await findKudde(c.req.param('slug'))
    const { role, rights } = viewer ? await rightsOf(kudde.id, viewer.id) : { role: 'none', rights: [] as KuddeRight[] }
    const rows = (await listOf(kudde.id)).filter((r) => r.enabled || rights.includes('gadgets'))
    return c.json(await withData(kudde, rows, role === 'owner' || role === 'member'))
  })

  // The Kuddes you run: "Toevoegen aan…" on the Gadgetmarkt, and posting a WieWatWaar as one
  .get('/me/owned-kuddes', async (c) => {
    const me = requireUser(c)
    const rows = await db
      .select({ slug: kuddes.slug, name: kuddes.name, imagePath: kuddes.imagePath, role: kuddeMembers.role, rights: kuddeMembers.rights, gadgets: sql<number>`(select count(*) from ${kuddeGadgets} g where g.kudde_id = ${kuddes.id})::int` })
      .from(kuddeMembers)
      .innerJoin(kuddes, eq(kuddes.id, kuddeMembers.kuddeId))
      .where(and(eq(kuddeMembers.userId, me.id), or(eq(kuddeMembers.role, 'owner'), and(eq(kuddeMembers.role, 'member'), sql`cardinality(${kuddeMembers.rights}) > 0`))))
      .orderBy(asc(sql`lower(${kuddes.name})`))
    return c.json(rows.map(({ imagePath, role, rights, ...k }) => ({ ...k, imageUrl: uploadUrl(imagePath), rights: role === 'owner' ? KUDDE_RIGHT_KEYS : rights }) satisfies OwnedKudde))
  })

  .post('/kuddes/:slug/gadgets', async (c) => {
    const me = requireUser(c)
    const kudde = await findKudde(c.req.param('slug'))
    await requireOwner(kudde.id, me.id)
    const { type } = parse(z.object({ type: z.enum(TYPE_KEYS) }), await c.req.json())
    const [{ n, last }] = await db.select({ n: count(), last: max(kuddeGadgets.position) }).from(kuddeGadgets).where(eq(kuddeGadgets.kuddeId, kudde.id))
    if (n >= L.gadgets) throw new HttpError(400, `Een Kudde kan maximaal ${L.gadgets} gadgets hebben.`)
    const [row] = await db
      .insert(kuddeGadgets)
      .values({ kuddeId: kudde.id, type, title: KUDDE_GADGET_TYPES[type].name, config: KUDDE_GADGET_DEFAULTS[type], position: (last ?? -1) + 1 })
      .returning()
    const [gadget] = await withData(kudde, [row], true)
    return c.json(gadget, 201)
  })

  .patch('/kudde-gadgets/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const row = await ownGadget(Number(c.req.param('id')), me.id)
    const body = parse(
      z.object({
        title: z.string().trim().min(1, 'Geef de gadget een titel.').max(L.title).optional(),
        enabled: z.boolean().optional(),
        config: z.unknown().optional(),
        /** Up or down one place among the Kudde's gadgets. */
        move: z.union([z.literal(-1), z.literal(1)]).optional(),
      }),
      await c.req.json(),
    )
    const config = body.config === undefined ? undefined : parse(CONFIG_SCHEMAS[row.type], body.config)
    await db.transaction(async (tx) => {
      if (body.title !== undefined || body.enabled !== undefined || config !== undefined)
        await tx.update(kuddeGadgets).set({ title: body.title, enabled: body.enabled, config }).where(eq(kuddeGadgets.id, row.id))
      if (body.move) {
        // Number them in order, then swap with the neighbour
        const list = await tx.select({ id: kuddeGadgets.id }).from(kuddeGadgets).where(eq(kuddeGadgets.kuddeId, row.kuddeId)).orderBy(asc(kuddeGadgets.position), asc(kuddeGadgets.id))
        const ids = list.map((g) => g.id)
        const at = ids.indexOf(row.id)
        const to = at + body.move!
        if (to >= 0 && to < ids.length) {
          ;[ids[at], ids[to]] = [ids[to], ids[at]]
          await Promise.all(ids.map((id, position) => tx.update(kuddeGadgets).set({ position }).where(eq(kuddeGadgets.id, id))))
        }
      }
    })
    return c.body(null, 204)
  })

  .delete('/kudde-gadgets/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const row = await ownGadget(Number(c.req.param('id')), me.id)
    await db.delete(kuddeGadgets).where(eq(kuddeGadgets.id, row.id))
    return c.body(null, 204)
  })

  // How many Kuddes show each kind, for the Gadgetmarkt
  .get('/kudde-gadgets/populair', async (c) => {
    const rows = await db
      .select({ type: kuddeGadgets.type, n: sql<number>`count(distinct ${kuddeGadgets.kuddeId})::int` })
      .from(kuddeGadgets)
      .where(and(eq(kuddeGadgets.enabled, true), inArray(kuddeGadgets.type, TYPE_KEYS)))
      .groupBy(kuddeGadgets.type)
    return c.json(Object.fromEntries(rows.map((r) => [r.type, r.n])))
  })
