import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { KuddeEventDetail } from '../../shared/api'
import { EVENT_LIMITS, isKuddeCategory } from '../../shared/kuddes'
import { db } from '../db/client'
import { kuddeEvents, kuddes, eventAttendees, users, type User } from '../db/schema'
import { memberKuddeIds, membershipOf, toEvents } from '../lib/kuddes'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

const DAY = 86_400_000

const eventSchema = z
  .object({
    title: z.string().trim().min(3, 'Geef je evenement een naam.').max(EVENT_LIMITS.title, `Een naam mag maximaal ${EVENT_LIMITS.title} tekens hebben.`),
    description: z.string().trim().max(EVENT_LIMITS.description, `Maximaal ${EVENT_LIMITS.description} tekens.`).default(''),
    location: z
      .string()
      .trim()
      .max(EVENT_LIMITS.location, `Een locatie mag maximaal ${EVENT_LIMITS.location} tekens hebben.`)
      .transform((s) => s || null)
      .nullable()
      .optional(),
    startsAt: z.iso.datetime({ offset: true, message: 'Kies wanneer het begint.' }),
    endsAt: z.iso.datetime({ offset: true, message: 'Ongeldige eindtijd.' }).nullable().optional(),
  })
  .refine((e) => !e.endsAt || new Date(e.endsAt) > new Date(e.startsAt), { message: 'Het einde moet na het begin liggen.', path: ['endsAt'] })
  .refine((e) => new Date(e.startsAt).getTime() < Date.now() + 3 * 365 * DAY, { message: 'Dat is wel heel ver weg.', path: ['startsAt'] })

async function kuddeBySlug(slug: string) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, slug)).limit(1)
  if (!kudde) throw notFound('Deze Kudde bestaat niet.')
  return kudde
}

/** Closed Kuddes only show their events to members. */
async function canSee(kudde: typeof kuddes.$inferSelect, viewer: User | null) {
  if (kudde.visibility === 'openbaar') return true
  if (!viewer) return false
  const role = await membershipOf(kudde.id, viewer.id)
  return role === 'owner' || role === 'member'
}

async function visibleEvent(id: number, viewer: User | null) {
  const [row] = await db.select({ event: kuddeEvents, kudde: kuddes }).from(kuddeEvents).innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId)).where(eq(kuddeEvents.id, id))
  if (!row || !(await canSee(row.kudde, viewer))) throw notFound('Dit evenement bestaat niet (meer).')
  return row
}

async function detail(event: typeof kuddeEvents.$inferSelect, viewer: User | null): Promise<KuddeEventDetail> {
  const [[summary], attendees] = await Promise.all([
    toEvents([event], viewer),
    db
      .select({ ...summaryColumns, status: eventAttendees.status })
      .from(eventAttendees)
      .innerJoin(users, eq(users.id, eventAttendees.userId))
      .where(eq(eventAttendees.eventId, event.id))
      .orderBy(asc(eventAttendees.status), desc(eventAttendees.createdAt))
      .limit(200),
  ])
  return { ...summary, attendees: attendees.map((a) => ({ ...toSummary(a), status: a.status })) }
}

/** iCalendar text needs commas, semicolons and newlines escaped. */
const ics = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n')
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export const eventRoutes = new Hono<AppEnv>()
  .get('/kuddes/:slug/events', async (c) => {
    const viewer = c.get('user')
    const kudde = await kuddeBySlug(c.req.param('slug'))
    if (!(await canSee(kudde, viewer))) return c.json([])
    const past = c.req.query('past') === '1'
    const rows = await db
      .select()
      .from(kuddeEvents)
      .where(and(eq(kuddeEvents.kuddeId, kudde.id), past ? lt(kuddeEvents.startsAt, sql`now()`) : gte(kuddeEvents.startsAt, sql`now() - interval '6 hours'`)))
      .orderBy(past ? desc(kuddeEvents.startsAt) : asc(kuddeEvents.startsAt))
      .limit(50)
    return c.json(await toEvents(rows, viewer))
  })

  // Members post events on their Kudde
  .post('/kuddes/:slug/events', rateLimit('evenementen', 30, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const kudde = await kuddeBySlug(c.req.param('slug'))
    const role = await membershipOf(kudde.id, me.id)
    if (role !== 'owner' && role !== 'member') throw new HttpError(403, 'Alleen leden van deze Kudde kunnen evenementen plaatsen.')
    const input = parse(eventSchema, await c.req.json().catch(() => null))
    if (new Date(input.startsAt).getTime() < Date.now() - DAY) {
      throw new HttpError(400, 'Dit evenement ligt in het verleden.', { startsAt: 'Dit evenement ligt in het verleden.' })
    }
    const [event] = await db
      .insert(kuddeEvents)
      .values({
        kuddeId: kudde.id,
        creatorId: me.id,
        title: input.title,
        description: input.description,
        location: input.location ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      })
      .returning()
    // Whoever plans it goes, of course
    await db.insert(eventAttendees).values({ eventId: event.id, userId: me.id, status: 'ja' })
    return c.json(await detail(event, me), 201)
  })

  .get('/events/:id', async (c) => {
    const viewer = c.get('user')
    const { event } = await visibleEvent(Number(c.req.param('id')), viewer)
    return c.json(await detail(event, viewer))
  })

  .patch('/events/:id', async (c) => {
    const me = requireUser(c)
    const { event } = await visibleEvent(Number(c.req.param('id')), me)
    const [summary] = await toEvents([event], me)
    if (!summary.canEdit) throw new HttpError(403, 'Alleen wie het evenement plaatste of de beheerder kan het aanpassen.')
    const input = parse(eventSchema, await c.req.json().catch(() => null))
    const [updated] = await db
      .update(kuddeEvents)
      .set({
        title: input.title,
        description: input.description,
        location: input.location ?? null,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
      })
      .where(eq(kuddeEvents.id, event.id))
      .returning()
    return c.json(await detail(updated, me))
  })

  .delete('/events/:id', async (c) => {
    const me = requireUser(c)
    const { event } = await visibleEvent(Number(c.req.param('id')), me)
    const [summary] = await toEvents([event], me)
    if (!summary.canEdit) throw new HttpError(403, 'Alleen wie het evenement plaatste of de beheerder kan het verwijderen.')
    await db.delete(kuddeEvents).where(eq(kuddeEvents.id, event.id))
    return c.body(null, 204)
  })

  // "Ik ga" / "Misschien" / null to take it back
  .post('/events/:id/attend', rateLimit('aanmelden evenementen', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { event } = await visibleEvent(Number(c.req.param('id')), me)
    const { status } = parse(z.object({ status: z.enum(['ja', 'misschien']).nullable() }), await c.req.json().catch(() => null))
    if (status) {
      await db
        .insert(eventAttendees)
        .values({ eventId: event.id, userId: me.id, status })
        .onConflictDoUpdate({ target: [eventAttendees.eventId, eventAttendees.userId], set: { status } })
    } else {
      await db.delete(eventAttendees).where(and(eq(eventAttendees.eventId, event.id), eq(eventAttendees.userId, me.id)))
    }
    return c.json(await detail(event, me))
  })

  // "Zet in je agenda": one event as an .ics file
  .get('/events/:id/ics', async (c) => {
    const viewer = c.get('user')
    const { event, kudde } = await visibleEvent(Number(c.req.param('id')), viewer)
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 2 * 3600_000)
    const origin = new URL(c.req.url).origin
    const body = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kuddes//Agenda//NL',
      'BEGIN:VEVENT',
      `UID:event-${event.id}@kuddes`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(event.startsAt)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${ics(event.title)}`,
      `DESCRIPTION:${ics(`${event.description}\n\n${kudde.name} op Kuddes`.trim())}`,
      ...(event.location ? [`LOCATION:${ics(event.location)}`] : []),
      `URL:${origin}/kuddes/${kudde.slug}/evenementen/${event.id}`,
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ].join('\r\n')
    c.header('Content-Type', 'text/calendar; charset=utf-8')
    c.header('Content-Disposition', `attachment; filename="kuddes-evenement-${event.id}.ics"`)
    return c.body(body)
  })

  /**
   * The Agenda: events between `from` and `to`. "mijn" is the Kuddes you're a
   * member of plus events you said you'd go to; "populair" is all open Kuddes.
   */
  .get('/agenda', async (c) => {
    const viewer = c.get('user')
    const view = c.req.query('view') === 'mijn' && viewer ? 'mijn' : 'populair'
    const from = new Date(c.req.query('from') ?? Date.now())
    const toParam = new Date(c.req.query('to') ?? from.getTime() + 31 * DAY)
    if (Number.isNaN(from.getTime()) || Number.isNaN(toParam.getTime())) throw new HttpError(400, 'Ongeldige periode.')
    // At most two months at a time
    const to = new Date(Math.min(toParam.getTime(), from.getTime() + 62 * DAY))
    const category = c.req.query('category')
    const sort = c.req.query('sort') === 'drukst' ? 'drukst' : 'datum'
    const going = sql<number>`(select count(*)::int from ${eventAttendees} where ${eventAttendees.eventId} = ${kuddeEvents.id} and ${eventAttendees.status} = 'ja')`

    const rows = await db
      .select({ event: kuddeEvents })
      .from(kuddeEvents)
      .innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId))
      .where(
        and(
          // A bare Date isn't serialised inside raw SQL, so pass it as text
          gte(sql`coalesce(${kuddeEvents.endsAt}, ${kuddeEvents.startsAt})`, sql`${from.toISOString()}::timestamptz`),
          lt(kuddeEvents.startsAt, to),
          isKuddeCategory(category) ? eq(kuddes.category, category) : undefined,
          view === 'mijn'
            ? sql`(${kuddeEvents.kuddeId} in ${memberKuddeIds(viewer!.id)} or (${kuddes.visibility} = 'openbaar' and ${kuddeEvents.id} in (select ${eventAttendees.eventId} from ${eventAttendees} where ${eventAttendees.userId} = ${viewer!.id})))`
            : eq(kuddes.visibility, 'openbaar'),
        ),
      )
      .orderBy(...(sort === 'drukst' ? [desc(going), asc(kuddeEvents.startsAt)] : [asc(kuddeEvents.startsAt)]))
      .limit(Math.min(Number(c.req.query('limit')) || 500, 500))
    return c.json(await toEvents(rows.map((r) => r.event), viewer))
  })

  // Events you're going to, for Home
  .get('/me/events', async (c) => {
    const me = requireUser(c)
    const ids = db.select({ id: eventAttendees.eventId }).from(eventAttendees).where(eq(eventAttendees.userId, me.id))
    const rows = await db
      .select({ event: kuddeEvents })
      .from(kuddeEvents)
      .innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId))
      .where(
        and(
          inArray(kuddeEvents.id, ids),
          gte(sql`coalesce(${kuddeEvents.endsAt}, ${kuddeEvents.startsAt})`, sql`now()`),
          // Closed Kuddes only while you're still a member
          sql`(${kuddes.visibility} = 'openbaar' or ${kuddeEvents.kuddeId} in ${memberKuddeIds(me.id)})`,
        ),
      )
      .orderBy(asc(kuddeEvents.startsAt))
      .limit(10)
    return c.json(await toEvents(rows.map((r) => r.event), me))
  })
