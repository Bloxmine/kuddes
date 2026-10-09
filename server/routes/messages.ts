import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono } from 'hono'
import { botEvent } from '../lib/bots'
import { z } from 'zod'
import type { Message, MessageBox, MessageSummary, Page, Recipient } from '../../shared/api'
import { withDefaults } from '../../shared/customization'
import { db } from '../db/client'
import { messages, users, type User } from '../db/schema'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, type SummaryRow } from '../lib/serialize'
import { requireUser, type AppEnv, unverifiedMessage } from '../lib/session'
import { friendshipState } from '../lib/users'

const PAGE_SIZE = 20
const MAX_SUBJECT = 120
const MAX_BODY = 5000

type MessageRow = typeof messages.$inferSelect

/**
 * Whether `sender` may message `recipient`, and why not. Members choose who
 * can (Privacy settings); answering someone who wrote to you always works.
 */
export async function messagePermission(sender: User, recipient: User): Promise<string | null> {
  if (sender.id === recipient.id) return 'Je kunt jezelf geen bericht sturen.'
  if (recipient.domain) return `Privéberichten naar andere servers kunnen nog niet; zet een knuffel op het profiel van ${recipient.nickname}.`
  const setting = withDefaults(recipient.preferences).messagesFrom
  if (setting === 'iedereen') return null
  const [wroteToYou] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.senderId, recipient.id), eq(messages.recipientId, sender.id), isNotNull(messages.sentAt)))
    .limit(1)
  if (wroteToYou) return null
  if (setting === 'niemand') return `${recipient.nickname} ontvangt geen berichten.`
  return (await friendshipState(sender.id, recipient.id)) === 'friends'
    ? null
    : `Alleen vrienden van ${recipient.nickname} kunnen een bericht sturen.`
}

/** Plain text for previews: no formatting marks, links reduced to their text. */
const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|~~|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)

const sender = alias(users, 'sender')
const recipient = alias(users, 'recipient')

const selection = {
  message: messages,
  from: {
    id: sender.id,
    username: sender.username,
    name: sender.name,
    nickname: sender.nickname,
    avatarPath: sender.avatarPath,
    lastSeenAt: sender.lastSeenAt,
    onlineStatus: sender.onlineStatus,
    isBot: sender.isBot,
  },
  to: {
    id: recipient.id,
    username: recipient.username,
    name: recipient.name,
    nickname: recipient.nickname,
    avatarPath: recipient.avatarPath,
    lastSeenAt: recipient.lastSeenAt,
    onlineStatus: recipient.onlineStatus,
    isBot: recipient.isBot,
  },
}

type Joined = { message: MessageRow; from: SummaryRow; to: { [K in keyof SummaryRow]: SummaryRow[K] | null } | null }

const joined = () =>
  db.select(selection).from(messages).innerJoin(sender, eq(sender.id, messages.senderId)).leftJoin(recipient, eq(recipient.id, messages.recipientId))

function boxOf(m: MessageRow, meId: number): MessageBox {
  if (!m.sentAt) return 'concepten'
  return m.recipientId === meId ? 'inbox' : 'verzonden'
}

function toSummaryOf({ message: m, from, to }: Joined, meId: number): MessageSummary {
  const box = boxOf(m, meId)
  return {
    id: m.id,
    box,
    from: toSummary(from),
    to: to?.id ? toSummary(to as SummaryRow) : null,
    subject: m.subject,
    preview: plain(m.body),
    sentAt: m.sentAt?.toISOString() ?? null,
    updatedAt: m.updatedAt.toISOString(),
    read: box !== 'inbox' || !!m.readAt,
  }
}

/** Messages in one box of the member, as a SQL condition. */
function inBox(box: MessageBox, meId: number) {
  switch (box) {
    case 'inbox':
      return and(eq(messages.recipientId, meId), isNotNull(messages.sentAt), eq(messages.deletedByRecipient, false))
    case 'verzonden':
      return and(eq(messages.senderId, meId), isNotNull(messages.sentAt), eq(messages.deletedBySender, false))
    case 'concepten':
      return and(eq(messages.senderId, meId), isNull(messages.sentAt))
  }
}

/** A message the member can see (as sender or recipient, not deleted on their side). */
async function visibleMessage(id: number, meId: number): Promise<Joined> {
  const [row] = await joined()
    .where(
      and(
        eq(messages.id, id),
        or(
          and(eq(messages.senderId, meId), eq(messages.deletedBySender, false)),
          and(eq(messages.recipientId, meId), isNotNull(messages.sentAt), eq(messages.deletedByRecipient, false)),
        ),
      ),
    )
    .limit(1)
  if (!row) throw notFound('Dit bericht bestaat niet (meer).')
  return row as Joined
}

/** Delete one side's copy; the row goes when neither side has it any more. */
async function removeFor(m: MessageRow, meId: number) {
  if (!m.sentAt) {
    if (m.senderId === meId) await db.delete(messages).where(eq(messages.id, m.id))
    return
  }
  const bySender = m.deletedBySender || m.senderId === meId
  const byRecipient = m.deletedByRecipient || m.recipientId === meId
  if (bySender && byRecipient) await db.delete(messages).where(eq(messages.id, m.id))
  else await db.update(messages).set({ deletedBySender: bySender, deletedByRecipient: byRecipient }).where(eq(messages.id, m.id))
}

const draftSchema = z.object({
  to: z.string().trim().max(60).nullable().optional(),
  subject: z.string().trim().max(MAX_SUBJECT, `Een onderwerp mag maximaal ${MAX_SUBJECT} tekens hebben.`).optional(),
  body: z.string().max(MAX_BODY, `Een bericht mag maximaal ${MAX_BODY} tekens hebben.`).optional(),
  replyToId: z.number().int().positive().nullable().optional(),
  /** Send now; otherwise it's saved as a concept. */
  send: z.boolean().optional(),
})

type DraftInput = z.infer<typeof draftSchema>

async function findRecipient(username: string | null | undefined) {
  if (!username) return null
  const [row] = await db.select().from(users).where(eq(users.username, username.toLowerCase().replace(/^@/, ''))).limit(1)
  if (!row) throw new HttpError(400, `Er is geen lid met de naam ${username}.`, { to: `Er is geen lid met de naam ${username}.` })
  return row
}

/** Validates a message that's about to be sent. */
async function checkSendable(me: User, to: User | null, subject: string, body: string) {
  if (!to) throw new HttpError(400, 'Aan wie wil je dit bericht sturen?', { to: 'Aan wie wil je dit bericht sturen?' })
  if (!body.trim()) throw new HttpError(400, 'Schrijf eerst een bericht.', { body: 'Schrijf eerst een bericht.' })
  const denied = await messagePermission(me, to)
  if (denied) throw new HttpError(403, denied, { to: denied })
  return { subject: subject.trim() || '(geen onderwerp)', body: body.trim() }
}

// Saving concepts happens often (autosave); sending itself is limited separately
const saveLimit = rateLimit('berichten', 600, 60 * 60 * 1000)
const MAX_SENT_PER_HOUR = 40

async function checkSendRate(meId: number) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(eq(messages.senderId, meId), sql`${messages.sentAt} > now() - interval '1 hour'`))
  if (n >= MAX_SENT_PER_HOUR) throw new HttpError(429, 'Rustig aan! Je hebt het afgelopen uur al veel berichten verstuurd.')
}

async function toMessage(row: Joined, meId: number): Promise<Message> {
  const m = row.message
  return {
    ...toSummaryOf(row, meId),
    body: m.body,
    replyToId: m.replyToId,
    canReply: m.recipientId === meId && !!m.sentAt,
  }
}

async function saveOrSend(me: User, input: DraftInput, existing: MessageRow | null) {
  if (input.send && !me.emailVerifiedAt) throw new HttpError(403, unverifiedMessage(), undefined, 'unverified')
  // A concept may have a half-typed recipient; only sending needs a real one
  const recipientRow =
    input.to !== undefined
      ? await findRecipient(input.to).catch((e) => {
          if (input.send) throw e
          return null
        })
      : existing?.recipientId
        ? await findUserById(existing.recipientId)
        : null
  const subject = input.subject ?? existing?.subject ?? ''
  const body = input.body ?? existing?.body ?? ''
  const replyToId = input.replyToId !== undefined ? input.replyToId : (existing?.replyToId ?? null)
  const now = new Date()

  if (input.send) await checkSendRate(me.id)
  const values = input.send
    ? { ...(await checkSendable(me, recipientRow, subject, body)), recipientId: recipientRow!.id, sentAt: now }
    : { subject, body, recipientId: recipientRow?.id ?? null }

  const [row] = existing
    ? await db
        .update(messages)
        .set({ ...values, replyToId, updatedAt: now })
        .where(eq(messages.id, existing.id))
        .returning()
    : await db
        .insert(messages)
        .values({ ...values, senderId: me.id, replyToId })
        .returning()
  // A message to a bot: it may answer (never one bot to another)
  if (input.send && recipientRow?.isBot && !me.isBot) botEvent({ trigger: 'bericht', botId: recipientRow.id, member: me, subject: row.subject, text: row.body })
  return row
}

async function findUserById(id: number) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ?? null
}

export const messageRoutes = new Hono<AppEnv>()
  .get('/messages', async (c) => {
    const me = requireUser(c)
    const box = (['inbox', 'verzonden', 'concepten'] as const).find((b) => b === c.req.query('box')) ?? 'inbox'
    const before = Number(c.req.query('before')) || null
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const person = box === 'inbox' ? sender : recipient
    const rows = await joined()
      .where(
        and(
          inBox(box, me.id),
          before ? lt(messages.id, before) : undefined,
          q
            ? or(ilike(messages.subject, pattern), ilike(messages.body, pattern), ilike(person.nickname, pattern), ilike(person.username, pattern))
            : undefined,
        ),
      )
      .orderBy(desc(messages.id))
      .limit(PAGE_SIZE + 1)
    const page = rows.slice(0, PAGE_SIZE) as Joined[]
    const result: Page<MessageSummary> = {
      items: page.map((r) => toSummaryOf(r, me.id)),
      nextCursor: rows.length > PAGE_SIZE ? page[page.length - 1].message.id : null,
    }
    return c.json(result)
  })

  // Unread messages and the number of concepts, for the header and the box tabs
  .get('/messages/counts', async (c) => {
    const me = requireUser(c)
    const [[unread], [drafts]] = await Promise.all([
      db.select({ n: count() }).from(messages).where(and(inBox('inbox', me.id), isNull(messages.readAt))),
      db.select({ n: count() }).from(messages).where(inBox('concepten', me.id)),
    ])
    return c.json({ unread: unread.n, concepten: drafts.n })
  })

  // Members to send to, with whether they accept your message
  .get('/messages/recipients', async (c) => {
    const me = requireUser(c)
    const q = (c.req.query('q') ?? '').trim().replace(/^@/, '').slice(0, 60)
    if (q.length < 1) return c.json([])
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const rows = await db
      .select()
      .from(users)
      .where(and(or(ilike(users.username, pattern), ilike(users.name, pattern), ilike(users.nickname, pattern)), sql`${users.id} <> ${me.id}`))
      .orderBy(sql`${users.username} = ${q.toLowerCase()} desc`, users.nickname)
      .limit(8)
    const result: Recipient[] = await Promise.all(
      rows.map(async (u) => {
        const reason = await messagePermission(me, u)
        return { ...toSummary(u), allowed: !reason, reason }
      }),
    )
    return c.json(result)
  })

  .get('/messages/:id', async (c) => {
    const me = requireUser(c)
    const row = await visibleMessage(Number(c.req.param('id')), me.id)
    // Opening a message marks it read
    if (row.message.recipientId === me.id && row.message.sentAt && !row.message.readAt) {
      row.message.readAt = new Date()
      await db.update(messages).set({ readAt: row.message.readAt }).where(eq(messages.id, row.message.id))
    }
    return c.json(await toMessage(row, me.id))
  })

  // Send a message, or save it as a concept
  .post('/messages', saveLimit, async (c) => {
    const me = requireUser(c)
    const input = parse(draftSchema, await c.req.json().catch(() => null))
    const row = await saveOrSend(me, input, null)
    return c.json(await toMessage(await visibleMessage(row.id, me.id), me.id), 201)
  })

  // Change a concept, or send it
  .patch('/messages/:id', saveLimit, async (c) => {
    const me = requireUser(c)
    const { message } = await visibleMessage(Number(c.req.param('id')), me.id)
    if (message.sentAt || message.senderId !== me.id) throw new HttpError(400, 'Alleen concepten kun je nog aanpassen.')
    const input = parse(draftSchema, await c.req.json().catch(() => null))
    const row = await saveOrSend(me, input, message)
    return c.json(await toMessage(await visibleMessage(row.id, me.id), me.id))
  })

  .delete('/messages/:id', async (c) => {
    const me = requireUser(c)
    const { message } = await visibleMessage(Number(c.req.param('id')), me.id)
    await removeFor(message, me.id)
    return c.body(null, 204)
  })

  // Several at once from the list: delete, or mark (un)read
  .post('/messages/bulk', async (c) => {
    const me = requireUser(c)
    const input = parse(
      z.object({ ids: z.array(z.number().int().positive()).min(1).max(100), action: z.enum(['delete', 'read', 'unread']) }),
      await c.req.json().catch(() => null),
    )
    const rows = await db
      .select()
      .from(messages)
      .where(and(inArray(messages.id, input.ids), or(eq(messages.senderId, me.id), eq(messages.recipientId, me.id))))
    if (input.action === 'delete') {
      for (const m of rows) await removeFor(m, me.id)
    } else {
      const own = rows.filter((m) => m.recipientId === me.id && m.sentAt).map((m) => m.id)
      if (own.length) {
        await db
          .update(messages)
          .set({ readAt: input.action === 'read' ? new Date() : null })
          .where(inArray(messages.id, own))
      }
    }
    return c.json({ count: rows.length })
  })
