import { asc, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import { z } from 'zod'
import type { ChatChannel, ChatLine, ChatUser } from '../../shared/api'
import { FORUM_LIMITS, type ChatKind } from '../../shared/forum'
import { db } from '../db/client'
import { chatChannels, chatMessages, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { activeBan, rolesOf } from '../lib/forum'
import { toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'

const HISTORY = 100
const HEARTBEAT_MS = 25_000
const KICK_MS = 5 * 60 * 1000

/**
 * Live chat, IRC style. Everyone in a channel holds an EventSource stream
 * (SSE); messages are posted with plain requests and sent to every stream in
 * the channel. One server process keeps the connections in memory.
 */
type Client = { id: number; user: ChatUser; stream: SSEStreamingApi }

const channels = new Map<number, Set<Client>>()
/** "userId:channelId" -> kicked until */
const kicked = new Map<string, number>()
/** Flood protection: timestamps of each member's recent lines. */
const recentLines = new Map<number, number[]>()
let nextClientId = 1

export const chatOnlineCount = () => new Set([...channels.values()].flatMap((set) => [...set].map((c) => c.user.id))).size

function usersIn(channelId: number): ChatUser[] {
  const seen = new Map<number, ChatUser>()
  for (const c of channels.get(channelId) ?? []) seen.set(c.user.id, c.user)
  return [...seen.values()].sort((a, b) => a.nickname.localeCompare(b.nickname, 'nl'))
}

function broadcast(channelId: number, event: string, data: unknown) {
  const payload = JSON.stringify(data)
  for (const c of channels.get(channelId) ?? []) void c.stream.writeSSE({ event, data: payload }).catch(() => undefined)
}

async function chatUser(user: User): Promise<ChatUser> {
  const role = (await rolesOf([user.id])).get(user.id)
  return { ...toSummary(user), forumRole: role?.role ?? null, moderator: user.forumRole === 'admin' || !!role?.sections.length }
}

async function channelByName(name: string) {
  const [row] = await db.select().from(chatChannels).where(eq(chatChannels.name, name.replace(/^#/, '').toLowerCase()))
  if (!row) throw notFound('Dit kanaal bestaat niet.')
  return row
}

async function save(channelId: number, user: ChatUser | null, kind: ChatKind, text: string): Promise<ChatLine> {
  const [row] = await db.insert(chatMessages).values({ channelId, userId: user?.id ?? null, kind, text }).returning()
  return { id: row.id, kind, user, text, createdAt: row.createdAt.toISOString() }
}

/** Joins and parts aren't stored; they only go to who's there now. */
function ephemeral(kind: ChatKind, user: ChatUser, text = ''): ChatLine {
  return { id: -Date.now(), kind, user, text, createdAt: new Date().toISOString() }
}

export const chatRoutes = new Hono<AppEnv>()
  .get('/chat/channels', async (c) => {
    const rows = await db.select().from(chatChannels).orderBy(asc(chatChannels.position), asc(chatChannels.id))
    const result: ChatChannel[] = rows.map((r) => ({ name: r.name, topic: r.topic, online: usersIn(r.id).length }))
    return c.json(result)
  })

  // Join a channel: history, then live lines, user list updates and heartbeats
  .get('/chat/:name/stream', async (c) => {
    const me = requireUser(c)
    const channel = await channelByName(c.req.param('name'))
    const ban = await activeBan(me.id)
    if (ban) throw new HttpError(403, 'Je bent verbannen van het forum en de chat.')
    const kickedUntil = kicked.get(`${me.id}:${channel.id}`) ?? 0
    if (kickedUntil > Date.now()) throw new HttpError(403, `Je bent uit #${channel.name} gezet. Probeer het over ${Math.ceil((kickedUntil - Date.now()) / 60000)} minuten opnieuw.`)
    const user = await chatUser(me)

    const history = await db
      .select({ message: chatMessages, user: summaryColumns })
      .from(chatMessages)
      .leftJoin(users, eq(users.id, chatMessages.userId))
      .where(eq(chatMessages.channelId, channel.id))
      .orderBy(desc(chatMessages.id))
      .limit(HISTORY)
    const roles = await rolesOf(history.map((h) => h.message.userId).filter((x): x is number => x !== null))
    const lines: ChatLine[] = history.reverse().map(({ message, user: u }) => ({
      id: message.id,
      kind: message.kind,
      user: u?.id ? { ...toSummary(u), forumRole: roles.get(u.id)?.role ?? null, moderator: roles.get(u.id)?.role != null } : null,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    }))

    return streamSSE(c, async (stream) => {
      const client: Client = { id: nextClientId++, user, stream }
      const set = channels.get(channel.id) ?? new Set<Client>()
      const wasHere = [...set].some((x) => x.user.id === me.id)
      set.add(client)
      channels.set(channel.id, set)

      await stream.writeSSE({ event: 'hello', data: JSON.stringify({ channel: channel.name, topic: channel.topic, history: lines, users: usersIn(channel.id) }) })
      if (!wasHere) broadcast(channel.id, 'line', ephemeral('join', user))
      broadcast(channel.id, 'users', usersIn(channel.id))

      let open = true
      stream.onAbort(() => {
        open = false
      })
      while (open) {
        await stream.sleep(HEARTBEAT_MS)
        if (open) await stream.writeSSE({ event: 'ping', data: '' }).catch(() => (open = false))
      }

      set.delete(client)
      if (![...set].some((x) => x.user.id === me.id)) broadcast(channel.id, 'line', ephemeral('part', user))
      broadcast(channel.id, 'users', usersIn(channel.id))
    })
  })

  /**
   * Say something. "/me zwaait" is an action; moderators can also use
   * "/topic nieuw onderwerp" and "/kick naam [reden]".
   */
  .post('/chat/:name/messages', async (c) => {
    const me = requireVerified(c)
    const channel = await channelByName(c.req.param('name'))
    if (await activeBan(me.id)) throw new HttpError(403, 'Je bent verbannen van het forum en de chat.')
    if (![...(channels.get(channel.id) ?? [])].some((x) => x.user.id === me.id)) throw new HttpError(409, `Je zit niet in #${channel.name}.`)
    const { text: raw } = parse(z.object({ text: z.string().trim().min(1).max(FORUM_LIMITS.chat, `Maximaal ${FORUM_LIMITS.chat} tekens.`) }), await c.req.json().catch(() => null))

    // At most 8 lines per 10 seconds
    const now = Date.now()
    const times = (recentLines.get(me.id) ?? []).filter((t) => t > now - 10_000)
    if (times.length >= 8) throw new HttpError(429, 'Rustig aan! Je stuurt te veel berichten achter elkaar.')
    recentLines.set(me.id, [...times, now])

    const user = await chatUser(me)
    const [command, ...rest] = raw.startsWith('/') ? raw.slice(1).split(/\s+/) : [null]
    const arg = raw.replace(/^\/\S+\s*/, '')

    if (command === null) {
      broadcast(channel.id, 'line', await save(channel.id, user, 'msg', raw))
    } else if (command === 'me') {
      if (!arg) throw new HttpError(400, 'Gebruik: /me doet iets')
      broadcast(channel.id, 'line', await save(channel.id, user, 'me', arg))
    } else if (command === 'topic') {
      if (!user.moderator) throw new HttpError(403, 'Alleen moderators en beheerders kunnen het onderwerp veranderen.')
      const topic = arg.slice(0, FORUM_LIMITS.chatTopic)
      await db.update(chatChannels).set({ topic }).where(eq(chatChannels.id, channel.id))
      broadcast(channel.id, 'topic', { topic })
      broadcast(channel.id, 'line', await save(channel.id, user, 'topic', topic))
    } else if (command === 'kick') {
      if (!user.moderator) throw new HttpError(403, 'Alleen moderators en beheerders kunnen iemand uit het kanaal zetten.')
      const [name, ...why] = rest
      const target = [...(channels.get(channel.id) ?? [])].find((x) => x.user.username === name?.toLowerCase() || x.user.nickname.toLowerCase() === name?.toLowerCase())
      if (!target) throw new HttpError(404, `${name ?? 'Die persoon'} zit niet in #${channel.name}.`)
      if (target.user.forumRole === 'admin' && me.forumRole !== 'admin') throw new HttpError(403, 'Je kunt een beheerder niet uit het kanaal zetten.')
      kicked.set(`${target.user.id}:${channel.id}`, now + KICK_MS)
      const line = await save(channel.id, user, 'kick', `${target.user.nickname}${why.length ? ` (${why.join(' ')})` : ''}`)
      broadcast(channel.id, 'line', line)
      for (const x of [...(channels.get(channel.id) ?? [])].filter((x) => x.user.id === target.user.id)) {
        await x.stream.writeSSE({ event: 'kicked', data: JSON.stringify({ by: user.nickname, reason: why.join(' ') }) }).catch(() => undefined)
        x.stream.abort()
      }
    } else {
      throw new HttpError(400, `Onbekend commando /${command}. Typ /help voor de commando's.`)
    }
    return c.body(null, 204)
  })
