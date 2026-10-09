import { and, count, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { FAMILY_LABELS, RELATIONSHIP_STATUSES, RELATION_LIMITS, WITH_PARTNER, type FamilyLabel, type MyRelations, type RelationshipStatus } from '../../shared/relations'
import { db } from '../db/client'
import { relations, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { incomingRelations, profileRelations } from '../lib/relations'
import { requireUser, type AppEnv } from '../lib/session'
import { findUser, friendshipState } from '../lib/users'

/** Relations are only between friends. */
async function friendOf(me: User, username: string) {
  const other = await findUser(username)
  if (other.id === me.id) throw new HttpError(400, 'Dat ben je zelf.')
  if ((await friendshipState(me.id, other.id)) !== 'friends') throw new HttpError(403, `Je bent (nog) geen vrienden met ${other.nickname}.`)
  return other
}

async function myRelations(me: User): Promise<MyRelations> {
  const [overview, incoming, [partner]] = await Promise.all([
    profileRelations(me, me),
    incomingRelations(me.id),
    db.select({ id: relations.id }).from(relations).where(and(eq(relations.userId, me.id), eq(relations.kind, 'partner'))),
  ])
  return { ...overview, incoming, partnerId: partner?.id ?? null }
}

const statusSchema = z.object({
  status: z.enum(Object.keys(RELATIONSHIP_STATUSES) as [RelationshipStatus]).nullable(),
  partner: z.string().nullable().optional(),
})

export const relationRoutes = new Hono<AppEnv>()
  .get('/me/relations', async (c) => c.json(await myRelations(requireUser(c))))

  // Relatiestatus, and who with (they get a request to confirm)
  .put('/me/relationship', rateLimit('relatiestatus', 30, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(statusSchema, await c.req.json().catch(() => null))
    await db.update(users).set({ relationshipStatus: input.status }).where(eq(users.id, me.id))
    const wantsPartner = input.status && WITH_PARTNER.includes(input.status) && input.partner
    const [current] = await db.select().from(relations).where(and(eq(relations.userId, me.id), eq(relations.kind, 'partner')))
    const currentPartner = current ? (await db.select({ username: users.username }).from(users).where(eq(users.id, current.otherId)))[0]?.username : null

    if (!wantsPartner || (current && currentPartner !== input.partner?.toLowerCase())) {
      // No partner any more, or a different one: the old link goes, both ways
      if (current) {
        await db
          .delete(relations)
          .where(
            and(
              eq(relations.kind, 'partner'),
              or(and(eq(relations.userId, me.id), eq(relations.otherId, current.otherId)), and(eq(relations.userId, current.otherId), eq(relations.otherId, me.id))),
            ),
          )
      }
    }
    if (wantsPartner) {
      const other = await friendOf(me, input.partner!)
      // They already asked you: then this confirms it
      const [theirs] = await db.select().from(relations).where(and(eq(relations.userId, other.id), eq(relations.otherId, me.id), eq(relations.kind, 'partner')))
      const confirmed = theirs?.status === 'pending' || theirs?.status === 'accepted'
      if (theirs && theirs.status === 'pending') await db.update(relations).set({ status: 'accepted', respondedAt: new Date() }).where(eq(relations.id, theirs.id))
      await db
        .insert(relations)
        .values({ userId: me.id, otherId: other.id, kind: 'partner', label: input.status!, status: confirmed ? 'accepted' : 'pending' })
        .onConflictDoUpdate({ target: [relations.userId, relations.otherId, relations.kind], set: { label: input.status! } })
    }
    // A confirmed couple shares the status
    await db
      .update(relations)
      .set({ label: input.status ?? '' })
      .where(and(eq(relations.userId, me.id), eq(relations.kind, 'partner')))
    return c.json(await myRelations(me))
  })

  .post('/me/best-friends', rateLimit('beste vrienden', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { username } = parse(z.object({ username: z.string() }), await c.req.json().catch(() => null))
    const other = await friendOf(me, username)
    const [{ n }] = await db.select({ n: count() }).from(relations).where(and(eq(relations.userId, me.id), eq(relations.kind, 'beste_vriend')))
    if (n >= RELATION_LIMITS.bestFriends) throw new HttpError(400, `Je kunt maximaal ${RELATION_LIMITS.bestFriends} beste vrienden kiezen.`)
    await db.insert(relations).values({ userId: me.id, otherId: other.id, kind: 'beste_vriend', status: 'accepted' }).onConflictDoNothing()
    return c.json(await myRelations(me))
  })

  .delete('/me/best-friends/:username', async (c) => {
    const me = requireUser(c)
    const other = await findUser(c.req.param('username'))
    await db.delete(relations).where(and(eq(relations.userId, me.id), eq(relations.otherId, other.id), eq(relations.kind, 'beste_vriend')))
    return c.json(await myRelations(me))
  })

  // "X is mijn zus": X confirms
  .post('/me/family', rateLimit('familie', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ username: z.string(), label: z.enum(Object.keys(FAMILY_LABELS) as [FamilyLabel]) }), await c.req.json().catch(() => null))
    const other = await friendOf(me, input.username)
    const [{ n }] = await db.select({ n: count() }).from(relations).where(and(eq(relations.userId, me.id), eq(relations.kind, 'familie')))
    if (n >= RELATION_LIMITS.family) throw new HttpError(400, 'Je hebt al heel veel familie toegevoegd.')
    // Already confirmed the other way round: then it's confirmed straight away
    const [theirs] = await db.select().from(relations).where(and(eq(relations.userId, other.id), eq(relations.otherId, me.id), eq(relations.kind, 'familie')))
    await db
      .insert(relations)
      .values({ userId: me.id, otherId: other.id, kind: 'familie', label: input.label, status: theirs ? 'accepted' : 'pending' })
      .onConflictDoUpdate({ target: [relations.userId, relations.otherId, relations.kind], set: { label: input.label } })
    if (theirs?.status === 'pending') await db.update(relations).set({ status: 'accepted', respondedAt: new Date() }).where(eq(relations.id, theirs.id))
    return c.json(await myRelations(me))
  })

  // Confirm a partner or family request
  .post('/relations/:id/accept', async (c) => {
    const me = requireUser(c)
    const [r] = await db
      .select()
      .from(relations)
      .where(and(eq(relations.id, Number(c.req.param('id'))), eq(relations.otherId, me.id), eq(relations.status, 'pending')))
    if (!r) throw notFound('Dit verzoek staat niet (meer) open.')
    await db.update(relations).set({ status: 'accepted', respondedAt: new Date() }).where(eq(relations.id, r.id))
    if (r.kind === 'partner') {
      // You now share the status, and you're each other's partner (replacing an old one of yours)
      await db.delete(relations).where(and(eq(relations.userId, me.id), eq(relations.kind, 'partner')))
      await db.insert(relations).values({ userId: me.id, otherId: r.userId, kind: 'partner', label: r.label, status: 'accepted', respondedAt: new Date() })
      await db.update(users).set({ relationshipStatus: r.label }).where(eq(users.id, me.id))
    } else {
      // On your side it says "Familie" until you pick the right word
      await db
        .insert(relations)
        .values({ userId: me.id, otherId: r.userId, kind: 'familie', label: 'familie', status: 'accepted', respondedAt: new Date() })
        .onConflictDoUpdate({ target: [relations.userId, relations.otherId, relations.kind], set: { status: 'accepted' } })
    }
    return c.json(await myRelations(me))
  })

  // Decline a request, or remove one of your own (family or partner), both ways
  .delete('/relations/:id', async (c) => {
    const me = requireUser(c)
    const [r] = await db
      .select()
      .from(relations)
      .where(and(eq(relations.id, Number(c.req.param('id'))), or(eq(relations.userId, me.id), eq(relations.otherId, me.id))))
    if (!r) throw notFound('Dit bestaat niet (meer).')
    await db
      .delete(relations)
      .where(and(eq(relations.kind, r.kind), or(and(eq(relations.userId, r.userId), eq(relations.otherId, r.otherId)), and(eq(relations.userId, r.otherId), eq(relations.otherId, r.userId)))))
    return c.json(await myRelations(me))
  })
