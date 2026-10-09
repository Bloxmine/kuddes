/**
 * Group chats in Kuddes Messenger (server/lib/messengerGroups.ts): start one
 * with a few friends, talk, add people, rename it, leave it.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { MESSENGER_LIMITS, type MessengerGroupConversation } from '../../shared/messenger'
import { db } from '../db/client'
import { glitters, messengerGroupMembers, messengerGroups, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { send } from '../lib/messenger'
import { addGroupLine, announceGroup, groupFor, groupLines, memberIds } from '../lib/messengerGroups'
import { rateLimit } from '../lib/rateLimit'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { sharePreview } from '../lib/sharePreview'
import { acceptedFriendsOf } from '../lib/users'

const nameSchema = z.string().trim().min(1, 'Geef de groep een naam.').max(MESSENGER_LIMITS.groupName, `Een naam mag maximaal ${MESSENGER_LIMITS.groupName} tekens hebben.`)
const usernamesSchema = z.array(z.string().trim().toLowerCase().max(30)).max(MESSENGER_LIMITS.groupSize)

/** Flood protection, like in a conversation with one friend. */
const recentLines = new Map<number, number[]>()
const lastNudge = new Map<number, number>()
function floodCheck(userId: number) {
  const now = Date.now()
  const times = (recentLines.get(userId) ?? []).filter((t) => t > now - 10_000)
  if (times.length >= 10) throw new HttpError(429, 'Rustig aan! Je stuurt te veel berichten achter elkaar.')
  recentLines.set(userId, [...times, now])
}

const groupId = (raw: string) => {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) throw notFound()
  return id
}

/** Only your own friends can be added (by username), and not blocked accounts. */
async function friendsByName(me: User, usernames: string[]) {
  const wanted = [...new Set(usernames)].filter((u) => u && u !== me.username)
  if (!wanted.length) return []
  const rows = await db
    .select({ id: users.id, nickname: users.nickname })
    .from(users)
    .where(and(inArray(users.username, wanted), sql`${users.id} in ${acceptedFriendsOf(me.id)}`, sql`${users.blockedAt} is null`))
  if (rows.length !== wanted.length) throw new HttpError(400, 'Je kunt alleen je eigen vrienden in een groep zetten.')
  return rows
}

const names = (list: { nickname: string }[]) => (list.length > 1 ? `${list.slice(0, -1).map((x) => x.nickname).join(', ')} en ${list.at(-1)!.nickname}` : (list[0]?.nickname ?? ''))

export const messengerGroupRoutes = new Hono<AppEnv>()
  // A new group with a few of your friends
  .post('/messenger/groups', rateLimit('groepsgesprekken', 20, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(z.object({ name: nameSchema, usernames: usernamesSchema }), await c.req.json().catch(() => null))
    const friends = await friendsByName(me, input.usernames)
    if (friends.length < 2) throw new HttpError(400, 'Kies minstens twee vrienden; met één vriend chat je gewoon samen.', { usernames: 'Kies minstens twee vrienden.' })
    if (friends.length + 1 > MESSENGER_LIMITS.groupSize) throw new HttpError(400, `Een groep kan maximaal ${MESSENGER_LIMITS.groupSize} mensen hebben.`)
    const [group] = await db.insert(messengerGroups).values({ name: input.name, createdBy: me.id }).returning()
    await db.insert(messengerGroupMembers).values([me.id, ...friends.map((f) => f.id)].map((userId) => ({ groupId: group.id, userId })))
    await announceGroup(group.id)
    await addGroupLine(group.id, me.id, 'created', input.name)
    return c.json(await groupFor(group.id, me.id), 201)
  })

  .get('/messenger/groups/:id', async (c) => {
    const me = requireUser(c)
    const id = groupId(c.req.param('id'))
    const group = await groupFor(id, me.id)
    const before = Number(c.req.query('voor')) || null
    const { lines, hasMore } = await groupLines(id, before, MESSENGER_LIMITS.page)
    const result: MessengerGroupConversation = { group, lines, hasMore }
    return c.json(result)
  })

  .post('/messenger/groups/:id', async (c) => {
    const me = requireVerified(c)
    const id = groupId(c.req.param('id'))
    await groupFor(id, me.id)
    const { text, glitterId, share } = parse(
      z
        .object({
          text: z.string().trim().max(MESSENGER_LIMITS.text, `Een bericht mag maximaal ${MESSENGER_LIMITS.text} tekens hebben.`),
          glitterId: z.number().int().positive().nullable().optional(),
          share: z.string().trim().max(300).nullable().optional(),
        })
        .refine((m) => m.text.length > 0 || m.glitterId || m.share, { message: 'Typ eerst een bericht of kies een glitterplaatje.', path: ['text'] }),
      await c.req.json().catch(() => null),
    )
    floodCheck(me.id)
    const [glitter] = glitterId ? await db.select().from(glitters).where(eq(glitters.id, glitterId)) : []
    if (glitterId && !glitter) throw new HttpError(400, 'Dit glitterplaatje bestaat niet (meer).')
    if (glitter) await db.update(glitters).set({ uses: sql`${glitters.uses} + 1` }).where(eq(glitters.id, glitter.id))
    const preview = share ? await sharePreview(share, me) : null
    if (share && !preview) throw new HttpError(400, 'Dit kun je niet delen: de pagina bestaat niet (meer) of is niet van Kuddes.')
    return c.json(await addGroupLine(id, me.id, 'msg', text, glitter?.id ?? null, preview?.href ?? null), 201)
  })

  // A nudge shakes everyone's screen; once in a while per group
  .post('/messenger/groups/:id/nudge', async (c) => {
    const me = requireVerified(c)
    const id = groupId(c.req.param('id'))
    await groupFor(id, me.id)
    if ((lastNudge.get(id) ?? 0) > Date.now() - MESSENGER_LIMITS.nudgeSeconds * 1000) throw new HttpError(429, 'Er is net al een nudge gestuurd in deze groep.')
    floodCheck(me.id)
    lastNudge.set(id, Date.now())
    return c.json(await addGroupLine(id, me.id, 'nudge'), 201)
  })

  .post('/messenger/groups/:id/typing', async (c) => {
    const me = requireVerified(c)
    const id = groupId(c.req.param('id'))
    const ids = await memberIds(id)
    if (!ids.includes(me.id)) throw notFound()
    for (const other of ids) if (other !== me.id) send(other, 'groupTyping', { group: id, from: me.id })
    return c.body(null, 204)
  })

  .post('/messenger/groups/:id/read', async (c) => {
    const me = requireUser(c)
    const id = groupId(c.req.param('id'))
    const { upTo } = parse(z.object({ upTo: z.number().int().positive() }), await c.req.json().catch(() => null))
    await db
      .update(messengerGroupMembers)
      .set({ lastReadId: sql`greatest(${messengerGroupMembers.lastReadId}, ${upTo})` })
      .where(and(eq(messengerGroupMembers.groupId, id), eq(messengerGroupMembers.userId, me.id)))
    send(me.id, 'groupRead', { group: id, upTo })
    return c.body(null, 204)
  })

  // A new name, by anyone in it
  .patch('/messenger/groups/:id', async (c) => {
    const me = requireVerified(c)
    const id = groupId(c.req.param('id'))
    const group = await groupFor(id, me.id)
    const { name } = parse(z.object({ name: nameSchema }), await c.req.json().catch(() => null))
    if (name === group.name) return c.json(group)
    await db.update(messengerGroups).set({ name }).where(eq(messengerGroups.id, id))
    await addGroupLine(id, me.id, 'renamed', name)
    await announceGroup(id)
    return c.json(await groupFor(id, me.id))
  })

  // More people: anyone in it can add their own friends
  .post('/messenger/groups/:id/members', async (c) => {
    const me = requireVerified(c)
    const id = groupId(c.req.param('id'))
    await groupFor(id, me.id)
    const { usernames } = parse(z.object({ usernames: usernamesSchema.min(1, 'Kies wie je wilt toevoegen.') }), await c.req.json().catch(() => null))
    const current = await memberIds(id)
    const added = (await friendsByName(me, usernames)).filter((f) => !current.includes(f.id))
    if (!added.length) throw new HttpError(400, 'Die zitten al in de groep.')
    if (current.length + added.length > MESSENGER_LIMITS.groupSize) throw new HttpError(400, `Een groep kan maximaal ${MESSENGER_LIMITS.groupSize} mensen hebben.`)
    await db.insert(messengerGroupMembers).values(added.map((f) => ({ groupId: id, userId: f.id })))
    await addGroupLine(id, me.id, 'joined', names(added))
    await announceGroup(id)
    return c.json(await groupFor(id, me.id))
  })

  // Leave (yourself), or remove someone (only the one who started it)
  .delete('/messenger/groups/:id/members/:username', async (c) => {
    const me = requireUser(c)
    const id = groupId(c.req.param('id'))
    const group = await groupFor(id, me.id)
    const username = c.req.param('username').toLowerCase()
    const self = username === me.username || username === '@me'
    const target = self ? { id: me.id, nickname: me.nickname } : group.members.find((m) => m.username === username)
    if (!target) throw notFound('Die zit niet in deze groep.')
    if (!self && !group.mine) throw new HttpError(403, 'Alleen wie de groep begon, kan mensen eruit halen.')
    await db.delete(messengerGroupMembers).where(and(eq(messengerGroupMembers.groupId, id), eq(messengerGroupMembers.userId, target.id)))
    send(target.id, 'groupGone', { id })
    // The last one out: the group goes
    if (!(await memberIds(id)).length) {
      await db.delete(messengerGroups).where(eq(messengerGroups.id, id))
      return c.body(null, 204)
    }
    await addGroupLine(id, me.id, self ? 'left' : 'removed', self ? '' : target.nickname)
    await announceGroup(id)
    return c.body(null, 204)
  })
