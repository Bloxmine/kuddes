/**
 * Kuddes Messenger (shared/messenger.ts, server/lib/messenger.ts): live chat
 * between friends. The stream carries new lines, presence and typing; lines
 * are sent with plain requests.
 */
import type { ServerResponse } from 'node:http'
import { sharePreview } from '../lib/sharePreview'
import { and, eq, isNull, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { CALL_SIGNALS, MESSENGER_LIMITS, type MessengerContacts, type MessengerConversation } from '../../shared/messenger'
import { withDefaults } from '../../shared/customization'
import { db } from '../db/client'
import { glitters, messengerLines, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { addLine, announcePresence, connect, isConnected, contactColumns, contactsOf, conversation, send, toContact, toLines } from '../lib/messenger'
import { groupsOf } from '../lib/messengerGroups'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { findUser, friendshipBetween } from '../lib/users'

const HEARTBEAT_MS = 25_000
/** Flood protection: each member's recent lines, and the last nudge per pair. */
const recentLines = new Map<number, number[]>()
const lastNudge = new Map<string, number>()
/** Calls started per member in the last minute. */
const recentCalls = new Map<number, number[]>()

/** The friend you talk to: only friends can chat. */
async function friend(me: User, username: string): Promise<User> {
  const other = await findUser(username)
  if (other.id === me.id || other.blockedAt) throw notFound('Dit lid bestaat niet.')
  if (other.domain) throw new HttpError(400, `Chatten met iemand op een andere server kan nog niet; zet een knuffel op het profiel van ${other.nickname}.`)
  const friendship = await friendshipBetween(me.id, other.id)
  if (friendship?.status !== 'accepted') throw new HttpError(403, `Je kunt alleen met je vrienden chatten (${other.nickname} is nog geen vriend).`)
  return other
}

function floodCheck(userId: number) {
  const now = Date.now()
  const times = (recentLines.get(userId) ?? []).filter((t) => t > now - 10_000)
  if (times.length >= 10) throw new HttpError(429, 'Rustig aan! Je stuurt te veel berichten achter elkaar.')
  recentLines.set(userId, [...times, now])
}

export const messengerRoutes = new Hono<AppEnv>()
  .get('/messenger/contacts', async (c) => {
    const me = requireUser(c)
    const [contacts, groups] = await Promise.all([contactsOf(me.id), groupsOf(me.id)])
    const friends = new Set(contacts.map((f) => f.id))
    const result: MessengerContacts = { note: me.messengerNote, contacts, groups, favorites: me.messengerFavorites.filter((id) => friends.has(id)) }
    return c.json(result)
  })

  // Your pinned friends, in the order you want them (only friends)
  .put('/messenger/favorites', async (c) => {
    const me = requireUser(c)
    const { ids } = parse(
      z.object({ ids: z.array(z.number().int().positive()).max(MESSENGER_LIMITS.favorites, `Je kunt maximaal ${MESSENGER_LIMITS.favorites} favorieten hebben.`) }),
      await c.req.json().catch(() => null),
    )
    const friends = new Set((await contactsOf(me.id)).map((f) => f.id))
    const favorites = [...new Set(ids)].filter((id) => friends.has(id))
    await db.update(users).set({ messengerFavorites: favorites }).where(eq(users.id, me.id))
    return c.json({ favorites })
  })

  // New lines, presence and typing, for as long as the tab is open
  .get('/messenger/stream', (c) => {
    const me = requireUser(c)
    return streamSSE(c, async (stream) => {
      const signOff = connect(me.id, stream)
      let open = true
      const leave = () => {
        if (!open) return
        open = false
        signOff()
      }
      stream.onAbort(leave)
      // A closed tab: noticed right away (onAbort alone only fires at the next write), so friends see you go offline
      ;(c.env as { outgoing?: ServerResponse } | undefined)?.outgoing?.once('close', leave)
      await stream.writeSSE({ event: 'hello', data: '{}' })
      while (open) {
        await stream.sleep(HEARTBEAT_MS)
        if (open) await stream.writeSSE({ event: 'ping', data: '' }).catch(leave)
      }
    })
  })

  // Your personal message, under your name in your friends' lists
  .put('/messenger/note', async (c) => {
    const me = requireVerified(c)
    const { note } = parse(z.object({ note: z.string().trim().max(MESSENGER_LIMITS.note, `Maximaal ${MESSENGER_LIMITS.note} tekens.`) }), await c.req.json().catch(() => null))
    await db.update(users).set({ messengerNote: note }).where(eq(users.id, me.id))
    await announcePresence(me.id)
    return c.json({ note })
  })

  // The conversation with a friend: the latest lines, or older ones with ?voor=
  .get('/messenger/with/:username', async (c) => {
    const me = requireUser(c)
    const other = await friend(me, c.req.param('username'))
    const before = Number(c.req.query('voor')) || null
    const [row] = await db.select(contactColumns).from(users).where(eq(users.id, other.id))
    const { lines, hasMore } = await conversation(me.id, other.id, before, MESSENGER_LIMITS.page)
    const unread = lines.filter((l) => l.from === other.id && !l.readAt).length
    const result: MessengerConversation = { contact: toContact(row, unread), lines, hasMore }
    return c.json(result)
  })

  // The preview of something shared in a line, as this member may see it
  .get('/share', async (c) => {
    const me = requireUser(c)
    const preview = await sharePreview(c.req.query('path') ?? '', me)
    if (!preview) throw new HttpError(404, 'Dit bestaat niet (meer) of je mag het niet zien.')
    return c.json(preview)
  })

  .post('/messenger/with/:username', async (c) => {
    const me = requireVerified(c)
    const other = await friend(me, c.req.param('username'))
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
    // Sent with a message counts, like with a knuffel
    if (glitter) await db.update(glitters).set({ uses: sql`${glitters.uses} + 1` }).where(eq(glitters.id, glitter.id))
    // Something from the site: only what you can see yourself, stored as its own address
    const preview = share ? await sharePreview(share, me) : null
    if (share && !preview) throw new HttpError(400, 'Dit kun je niet delen: de pagina bestaat niet (meer) of is niet van Kuddes.')
    const [line] = await toLines([await addLine(me.id, other.id, 'msg', text, null, glitter?.id ?? null, preview?.href ?? null)], me.id)
    return c.json(line, 201)
  })

  // A nudge: their window shakes. Not too often.
  .post('/messenger/with/:username/nudge', async (c) => {
    const me = requireVerified(c)
    const other = await friend(me, c.req.param('username'))
    const key = `${me.id}:${other.id}`
    if ((lastNudge.get(key) ?? 0) > Date.now() - MESSENGER_LIMITS.nudgeSeconds * 1000) throw new HttpError(429, 'Je kunt niet zo vaak een nudge sturen.')
    floodCheck(me.id)
    lastNudge.set(key, Date.now())
    const [line] = await toLines([await addLine(me.id, other.id, 'nudge')], me.id)
    return c.json(line, 201)
  })

  // A voice call: the browsers set it up through here, then talk to each other directly.
  // Only between friends who both allow calls; the callee must be online.
  .post('/messenger/with/:username/call', async (c) => {
    const me = requireVerified(c)
    const other = await friend(me, c.req.param('username'))
    const input = parse(
      z.object({ id: z.string().regex(/^[a-z0-9-]{8,40}$/i), kind: z.enum(CALL_SIGNALS), payload: z.unknown().optional() }),
      await c.req.json().catch(() => null),
    )
    if (JSON.stringify(input.payload ?? null).length > 20_000) throw new HttpError(413, 'Te veel gegevens.')
    if (input.kind === 'offer') {
      if (!withDefaults(me.preferences).allowCalls) throw new HttpError(403, 'Zet eerst bellen aan bij Instellingen › Privacy.')
      if (!withDefaults(other.preferences).allowCalls) throw new HttpError(403, `${other.nickname} kan niet gebeld worden.`)
      if (!isConnected(other.id)) throw new HttpError(409, `${other.nickname} is nu niet online.`)
      const now = Date.now()
      const times = (recentCalls.get(me.id) ?? []).filter((t) => t > now - 60_000)
      if (times.length >= 6) throw new HttpError(429, 'Je belt te vaak achter elkaar. Probeer het zo nog eens.')
      recentCalls.set(me.id, [...times, now])
    }
    send(other.id, 'call', { from: me.id, id: input.id, kind: input.kind, payload: input.payload })
    return c.body(null, 204)
  })

  // "… is aan het typen"
  .post('/messenger/with/:username/typing', async (c) => {
    const me = requireVerified(c)
    const other = await friend(me, c.req.param('username'))
    send(other.id, 'typing', { from: me.id })
    return c.body(null, 204)
  })

  // You've seen their lines up to this one
  .post('/messenger/with/:username/read', async (c) => {
    const me = requireUser(c)
    const other = await findUser(c.req.param('username'))
    const { upTo } = parse(z.object({ upTo: z.number().int().positive() }), await c.req.json().catch(() => null))
    await db
      .update(messengerLines)
      .set({ readAt: new Date() })
      .where(and(eq(messengerLines.senderId, other.id), eq(messengerLines.recipientId, me.id), lte(messengerLines.id, upTo), isNull(messengerLines.readAt)))
    send(me.id, 'read', { with: other.id, upTo })
    return c.body(null, 204)
  })
