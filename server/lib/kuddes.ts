import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { Attendance, Kudde, KuddeEvent } from '../../shared/api'
import { KUDDE_RIGHTS, KUDDE_RIGHT_KEYS, type KuddeCategory, type KuddeRight } from '../../shared/kuddes'
import { HttpError } from './errors'
import { db } from '../db/client'
import { kuddeEvents, kuddeMembers, kuddes, eventAttendees, users, type User } from '../db/schema'
import { toSummary, uploadUrl, type SummaryRow } from './serialize'
import { summaryColumns } from './users'

/** Members only: people waiting for approval don't count. */
export const memberCount = sql<number>`(select count(*)::int from ${kuddeMembers} where ${kuddeMembers.kuddeId} = ${kuddes.id} and ${kuddeMembers.role} <> 'pending')`

export const kuddeColumns = {
  id: kuddes.id,
  slug: kuddes.slug,
  name: kuddes.name,
  description: kuddes.description,
  imagePath: kuddes.imagePath,
  createdAt: kuddes.createdAt,
  category: kuddes.category,
  subcategory: kuddes.subcategory,
  address: kuddes.address,
  city: kuddes.city,
  phone: kuddes.phone,
  website: kuddes.website,
  visibility: kuddes.visibility,
  photosShareable: kuddes.photosShareable,
  photography: kuddes.photography,
  memberCount,
}

export type KuddeRow = Omit<typeof kuddes.$inferSelect, 'id' | 'creatorId' | 'design' | 'info' | 'views'> & { memberCount: number }

export const toKudde = (row: KuddeRow): Kudde => ({
  slug: row.slug,
  name: row.name,
  description: row.description,
  imageUrl: uploadUrl(row.imagePath),
  memberCount: row.memberCount,
  createdAt: row.createdAt.toISOString(),
  category: row.category as KuddeCategory,
  subcategory: row.subcategory,
  address: row.address,
  city: row.city,
  phone: row.phone,
  website: row.website,
  visibility: row.visibility,
  photosShareable: row.photosShareable,
  photography: row.photography,
})

export async function membershipOf(kuddeId: number, userId: number) {
  const [row] = await db
    .select({ role: kuddeMembers.role })
    .from(kuddeMembers)
    .where(and(eq(kuddeMembers.kuddeId, kuddeId), eq(kuddeMembers.userId, userId)))
  return row?.role ?? 'none'
}

/** A member's role and what they may do in running the Kudde: owners everything, beheerders their rights. */
export async function rightsOf(kuddeId: number, userId: number): Promise<{ role: 'owner' | 'member' | 'pending' | 'none'; rights: KuddeRight[] }> {
  const [row] = await db
    .select({ role: kuddeMembers.role, rights: kuddeMembers.rights })
    .from(kuddeMembers)
    .where(and(eq(kuddeMembers.kuddeId, kuddeId), eq(kuddeMembers.userId, userId)))
  if (!row) return { role: 'none', rights: [] }
  return { role: row.role, rights: row.role === 'owner' ? KUDDE_RIGHT_KEYS : row.role === 'member' ? row.rights.filter((r) => KUDDE_RIGHT_KEYS.includes(r)) : [] }
}

/** Throws unless the member may do this in the Kudde. */
export async function requireRight(kuddeId: number, userId: number, right: KuddeRight) {
  const { rights } = await rightsOf(kuddeId, userId)
  if (!rights.includes(right)) throw new HttpError(403, `Je mag dit niet doen in deze Kudde (${KUDDE_RIGHTS[right].name.toLowerCase()}).`)
}

/** Kuddes the member belongs to (not pending), for "Mijn Kuddes" in the Agenda. */
export const memberKuddeIds = (userId: number) =>
  sql`(select ${kuddeMembers.kuddeId} from ${kuddeMembers} where ${kuddeMembers.userId} = ${userId} and ${kuddeMembers.role} <> 'pending')`

type EventRow = typeof kuddeEvents.$inferSelect

/** Events with their Kudde, counts and the viewer's own answer. */
export async function toEvents(rows: EventRow[], viewer: User | null): Promise<KuddeEvent[]> {
  if (rows.length === 0) return []
  const eventIds = rows.map((e) => e.id)
  const kuddeIds = [...new Set(rows.map((e) => e.kuddeId))]
  const creatorIds = [...new Set(rows.map((e) => e.creatorId).filter((x): x is number => x !== null))]
  const [kuddeRows, creators, tallies, mine, roles] = await Promise.all([
    db
      .select({ id: kuddes.id, slug: kuddes.slug, name: kuddes.name, imagePath: kuddes.imagePath, category: kuddes.category, visibility: kuddes.visibility })
      .from(kuddes)
      .where(inArray(kuddes.id, kuddeIds)),
    creatorIds.length ? db.select(summaryColumns).from(users).where(inArray(users.id, creatorIds)) : Promise.resolve([] as SummaryRow[]),
    db
      .select({ eventId: eventAttendees.eventId, status: eventAttendees.status, n: count() })
      .from(eventAttendees)
      .where(inArray(eventAttendees.eventId, eventIds))
      .groupBy(eventAttendees.eventId, eventAttendees.status),
    viewer
      ? db
          .select({ eventId: eventAttendees.eventId, status: eventAttendees.status })
          .from(eventAttendees)
          .where(and(inArray(eventAttendees.eventId, eventIds), eq(eventAttendees.userId, viewer.id)))
      : Promise.resolve([] as { eventId: number; status: Attendance }[]),
    viewer
      ? db
          .select({ kuddeId: kuddeMembers.kuddeId, role: kuddeMembers.role })
          .from(kuddeMembers)
          .where(and(inArray(kuddeMembers.kuddeId, kuddeIds), eq(kuddeMembers.userId, viewer.id)))
      : Promise.resolve([] as { kuddeId: number; role: string }[]),
  ])

  return rows.flatMap((e) => {
    const kudde = kuddeRows.find((b) => b.id === e.kuddeId)
    if (!kudde) return []
    const creator = creators.find((u) => u.id === e.creatorId)
    const tally = (status: Attendance) => tallies.find((t) => t.eventId === e.id && t.status === status)?.n ?? 0
    const isOwner = roles.some((r) => r.kuddeId === e.kuddeId && r.role === 'owner')
    return [
      {
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        kudde: {
          slug: kudde.slug,
          name: kudde.name,
          imageUrl: uploadUrl(kudde.imagePath),
          category: kudde.category as KuddeCategory,
          visibility: kudde.visibility,
        },
        creator: creator ? toSummary(creator) : null,
        going: tally('ja'),
        maybe: tally('misschien'),
        myStatus: mine.find((m) => m.eventId === e.id)?.status ?? null,
        canEdit: !!viewer && (e.creatorId === viewer.id || isOwner),
      },
    ]
  })
}
