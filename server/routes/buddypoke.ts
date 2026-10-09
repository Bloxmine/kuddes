import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { and, count, desc, eq, inArray, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config'
import { db } from '../db/client'
import { buddyEvents, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { acceptedFriendsOf, findUser, summaryColumns } from '../lib/users'

const HISTORY_LIMIT = 100
const STATE_MAX_BYTES = 20_000

/** Mood and poke ids from the BuddyPoke data, so only real ones are stored. */
const known = await (async () => {
  const file = path.join(config.buddypokeDir, 'js/data/moods.js')
  if (!existsSync(file)) return null
  type Item = { id: string; name: string; icon?: string }
  const { MOODS, POKES } = (await import(pathToFileURL(file).href)) as { MOODS: { list: Item[] }; POKES: { list: Item[] } }
  const byId = (list: Item[]) => new Map(list.map((i) => [i.id, { name: i.name, icon: Number(i.icon) || 0 }]))
  return { moods: byId(MOODS.list), pokes: byId(POKES.list) }
})()

const actionId = (kind: 'moods' | 'pokes') =>
  z
    .string()
    .regex(/^[A-Za-z0-9_]{1,40}$/, 'Ongeldige BuddyPoke-actie.')
    .refine((id) => !known || known[kind].has(id), 'Onbekende BuddyPoke-actie.')

const comment = z.string().trim().max(100, 'Een opmerking mag maximaal 100 tekens hebben.')

// Appearance codes use BuddyPoke's own base64 alphabet (see web/js/buddy.js)
const appearanceCode = z.string().max(8000).regex(/^[A-Za-z0-9_/=]+$/, 'Ongeldige BuddyPoke-code.')

const stateSchema = z
  .object({
    gold: z.number().int().min(0).max(1_000_000),
    ledger: z.array(z.object({ t: z.number(), amount: z.number().int(), why: z.string().max(80) })).max(40),
    daily: z.record(z.string(), z.record(z.string(), z.number().int().min(0))),
    lastDaily: z.string().max(10).nullable(),
    owned: z.array(z.string().max(40)).max(300),
    /** Newest received poke the member has seen, for the unread badge. */
    seenId: z.number().int().min(0),
  })
  .strict()

const patchSchema = z.object({
  code: appearanceCode.optional(),
  mood: actionId('moods').optional(),
  comment: comment.optional(),
  state: stateSchema.optional(),
})

const pokeSchema = z.object({
  to: z.string().min(1).max(40),
  a: actionId('pokes'),
  m: comment.default(''),
  p: z.boolean().default(false),
})

type EventRow = typeof buddyEvents.$inferSelect

/** An event as the app's history expects it: {id, type, fr, to, a, t, m, p}, with 'me' for the viewer. */
function toAppEvent(e: EventRow, me: User, usernames: Map<number, string>) {
  const side = (id: number | null) => (id === null || id === me.id ? 'me' : (usernames.get(id) ?? 'unknown'))
  return { id: String(e.id), type: e.type, fr: side(e.fromId), to: side(e.toId), a: e.action, t: e.createdAt.getTime(), m: e.comment, p: e.private }
}

/** Events in the member's own history (the ones they haven't removed). */
const myHistory = (me: User) =>
  or(and(eq(buddyEvents.fromId, me.id), eq(buddyEvents.hiddenByFrom, false)), and(eq(buddyEvents.toId, me.id), eq(buddyEvents.hiddenByTo, false)))

export const buddypokeRoutes = new Hono<AppEnv>()
  /**
   * Everything the BuddyPoke app needs at start: the member's buddy, their
   * friends' buddies, the history and gold. `?with=username` adds a member to
   * poke who isn't a friend (from the "Poke!" button on a profile).
   */
  .get('/buddypoke/me', async (c) => {
    const me = requireUser(c)
    const withUsername = c.req.query('with')?.toLowerCase()

    const history = await db
      .select()
      .from(buddyEvents)
      .where(myHistory(me))
      .orderBy(desc(buddyEvents.id))
      .limit(HISTORY_LIMIT)

    // Friends, plus anyone in the history, plus the member to poke
    const others = new Set<number>()
    for (const e of history) for (const id of [e.fromId, e.toId]) if (id && id !== me.id) others.add(id)
    const friendRows = await db
      .select({ ...summaryColumns, buddyCode: users.buddyCode, buddyMood: users.buddyMood })
      .from(users)
      .where(or(inArray(users.id, acceptedFriendsOf(me.id)), others.size ? inArray(users.id, [...others]) : undefined, withUsername ? eq(users.username, withUsername) : undefined))
    const friendIds = new Set(
      (await db.select({ id: users.id }).from(users).where(inArray(users.id, acceptedFriendsOf(me.id)))).map((r) => r.id),
    )
    const people = friendRows.filter((u) => u.id !== me.id)
    const usernames = new Map(people.map((u) => [u.id, u.username]))

    // When each person last changed mood, for "moodTime"
    const moodTimes = people.length
      ? await db
          .select({ fromId: buddyEvents.fromId, createdAt: buddyEvents.createdAt })
          .from(buddyEvents)
          .where(and(eq(buddyEvents.type, 'mood'), inArray(buddyEvents.fromId, people.map((u) => u.id))))
          .orderBy(desc(buddyEvents.id))
      : []

    const [[sent], [received]] = await Promise.all([
      db.select({ n: count() }).from(buddyEvents).where(and(eq(buddyEvents.type, 'poke'), eq(buddyEvents.fromId, me.id))),
      db.select({ n: count() }).from(buddyEvents).where(and(eq(buddyEvents.type, 'poke'), eq(buddyEvents.toId, me.id))),
    ])

    let state: z.infer<typeof stateSchema> | null = null
    try {
      state = me.buddyState ? stateSchema.parse(JSON.parse(me.buddyState)) : null
    } catch {
      state = null
    }
    const seenId = state?.seenId ?? 0

    return c.json({
      me: { username: me.username, name: me.nickname, code: me.buddyCode, mood: me.buddyMood, comment: me.buddyMoodComment ?? '' },
      friends: people.map((u) => ({
        id: u.username,
        name: u.nickname,
        code: u.buddyCode,
        mood: u.buddyMood,
        moodTime: moodTimes.find((m) => m.fromId === u.id)?.createdAt.getTime() ?? 0,
        isFriend: friendIds.has(u.id),
        profile: toSummary(u),
      })),
      history: history.map((e) => toAppEvent(e, me, usernames)),
      pokeCnt: sent.n,
      recCnt: received.n,
      unread: history.filter((e) => e.type === 'poke' && e.toId === me.id && e.id > seenId).length,
      state,
    })
  })

  .patch('/buddypoke/me', async (c) => {
    const me = requireUser(c)
    const input = parse(patchSchema, await c.req.json().catch(() => null))
    if (input.state && JSON.stringify(input.state).length > STATE_MAX_BYTES) throw new HttpError(413, 'Te veel BuddyPoke-gegevens.')

    const moodChanged = input.mood !== undefined && (input.mood !== me.buddyMood || (input.comment ?? '') !== (me.buddyMoodComment ?? ''))
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          ...(input.code !== undefined && { buddyCode: input.code, buddyEnabled: me.buddyEnabled || !me.buddyCode }),
          ...(input.mood !== undefined && { buddyMood: input.mood, buddyMoodComment: input.comment ?? '' }),
          ...(input.state !== undefined && { buddyState: JSON.stringify(input.state) }),
        })
        .where(eq(users.id, me.id))
      if (moodChanged) {
        await tx.insert(buddyEvents).values({ type: 'mood', fromId: me.id, action: input.mood!, comment: input.comment ?? '' })
      }
    })
    return c.body(null, 204)
  })

  .post('/buddypoke/pokes', rateLimit('pokes', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(pokeSchema, await c.req.json().catch(() => null))
    const target = await findUser(input.to)
    if (target.id === me.id) throw new HttpError(400, 'Je kunt jezelf niet poken.')
    const [event] = await db
      .insert(buddyEvents)
      .values({ type: 'poke', fromId: me.id, toId: target.id, action: input.a, comment: input.m, private: input.p })
      .returning()
    return c.json(toAppEvent(event, me, new Map([[target.id, target.username]])), 201)
  })

  // Removes an event from the member's own history only
  .delete('/buddypoke/events/:id', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const [event] = await db.select().from(buddyEvents).where(eq(buddyEvents.id, id))
    if (!event || (event.fromId !== me.id && event.toId !== me.id)) throw notFound()
    if (event.fromId === me.id) await db.update(buddyEvents).set({ hiddenByFrom: true }).where(eq(buddyEvents.id, id))
    if (event.toId === me.id) await db.update(buddyEvents).set({ hiddenByTo: true }).where(eq(buddyEvents.id, id))
    return c.body(null, 204)
  })

  .delete('/buddypoke/events', async (c) => {
    const me = requireUser(c)
    await db.update(buddyEvents).set({ hiddenByFrom: true }).where(eq(buddyEvents.fromId, me.id))
    await db.update(buddyEvents).set({ hiddenByTo: true }).where(eq(buddyEvents.toId, me.id))
    return c.body(null, 204)
  })

  /** Recent pokes a member received, for their profile. Private pokes only show to the two people involved. */
  .get('/buddypoke/users/:username/pokes', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const rows = await db
      // The poker's buddy too, so the profile can play the poke with both buddies
      .select({ event: buddyEvents, from: summaryColumns, fromCode: users.buddyCode })
      .from(buddyEvents)
      .innerJoin(users, eq(users.id, buddyEvents.fromId))
      .where(
        and(
          eq(buddyEvents.type, 'poke'),
          eq(buddyEvents.toId, user.id),
          eq(buddyEvents.hiddenByTo, false),
          viewer && (viewer.id === user.id) ? undefined : or(eq(buddyEvents.private, false), viewer ? eq(buddyEvents.fromId, viewer.id) : undefined),
        ),
      )
      .orderBy(desc(buddyEvents.id))
      .limit(8)
    return c.json(
      rows.map(({ event, from, fromCode }) => ({
        id: event.id,
        from: toSummary(from),
        fromCode,
        action: event.action,
        // Name and icon (index in web/assets/icons.png) from the BuddyPoke data
        name: known?.pokes.get(event.action)?.name ?? event.action,
        icon: known?.pokes.get(event.action)?.icon ?? 0,
        comment: event.comment,
        private: event.private,
        createdAt: event.createdAt.toISOString(),
      })),
    )
  })
