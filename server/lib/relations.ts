import { and, eq, inArray, or } from 'drizzle-orm'
import { FAMILY_LABELS, RELATIONSHIP_STATUSES, type FamilyLabel, type ProfileRelations, type RelationRequest, type RelationshipStatus } from '../../shared/relations'
import { db } from '../db/client'
import { relations, users, type User } from '../db/schema'
import { toSummary } from './serialize'
import { summaryColumns } from './users'

const isStatus = (v: string | null): v is RelationshipStatus => !!v && v in RELATIONSHIP_STATUSES
const isFamily = (v: string): v is FamilyLabel => v in FAMILY_LABELS

/** A member's relations as `viewer` may see them: unconfirmed ones only for the two people involved. */
export async function profileRelations(user: User, viewer: User | null): Promise<ProfileRelations> {
  const rows = await db
    .select({ r: relations, other: summaryColumns })
    .from(relations)
    .innerJoin(users, eq(users.id, relations.otherId))
    .where(eq(relations.userId, user.id))
  const involved = (otherId: number) => viewer?.id === user.id || viewer?.id === otherId

  const partnerRow = rows.find((x) => x.r.kind === 'partner')
  const partner =
    partnerRow && (partnerRow.r.status === 'accepted' || involved(partnerRow.r.otherId))
      ? { user: toSummary(partnerRow.other), confirmed: partnerRow.r.status === 'accepted' }
      : null
  return {
    status: isStatus(user.relationshipStatus) ? user.relationshipStatus : null,
    partner,
    bestFriends: rows.filter((x) => x.r.kind === 'beste_vriend').map((x) => toSummary(x.other)),
    family: rows
      .filter((x) => x.r.kind === 'familie' && (x.r.status === 'accepted' || involved(x.r.otherId)))
      .map((x) => ({ id: x.r.id, user: toSummary(x.other), label: isFamily(x.r.label) ? x.r.label : 'familie', confirmed: x.r.status === 'accepted' })),
  }
}

/** Partner and family requests waiting for this member. */
export async function incomingRelations(userId: number): Promise<RelationRequest[]> {
  const rows = await db
    .select({ r: relations, from: summaryColumns })
    .from(relations)
    .innerJoin(users, eq(users.id, relations.userId))
    .where(and(eq(relations.otherId, userId), eq(relations.status, 'pending'), inArray(relations.kind, ['partner', 'familie'])))
  return rows.map(({ r, from }) => ({
    id: r.id,
    kind: r.kind as 'partner' | 'familie',
    from: toSummary(from),
    label: r.kind === 'partner' ? (isStatus(r.label) ? RELATIONSHIP_STATUSES[r.label] : 'In een relatie') : isFamily(r.label) ? FAMILY_LABELS[r.label] : 'Familie',
    createdAt: r.createdAt.toISOString(),
  }))
}

/** Unfriending ends every relation between the two, both ways. */
export async function removeRelationsBetween(a: number, b: number) {
  await db.delete(relations).where(or(and(eq(relations.userId, a), eq(relations.otherId, b)), and(eq(relations.userId, b), eq(relations.otherId, a))))
}
