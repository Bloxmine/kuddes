/**
 * Bots (shared/bots.ts): accounts that act by themselves. Something happens
 * on the site (a new member, a message to the bot…) or the clock says it's
 * time; a task bot then follows its rules, an AI bot asks LM Studio what to
 * say and do, with its abilities as tools. Bots never react to other bots,
 * do at most BOT_LIMITS.actionsPerHour things an hour, and follow the same
 * rules as members (who may knuffel or message whom).
 */
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { BOT_ABILITIES, BOT_LIMITS, type BotAbility, type BotRule, type BotTrigger, type LmStudioSettings } from '../../shared/bots'
import { db } from '../db/client'
import { bots, friendships, messages, news, siteSettings, statuses, users, type User } from '../db/schema'
import { recordActivity } from './activities'
import { befriend, friendRequestRefusal } from './friends'
import { createKnuffel, knuffelRefusal } from './knuffels'
import { friendshipBetween } from './users'
import { notifyMentions } from './notifications'
import { deliverMessage } from './videoAccess'

type BotRow = typeof bots.$inferSelect
export type BotEvent = { trigger: BotTrigger; member?: User; botId?: number; subject?: string; text?: string; accepted?: boolean }
/** One step of an AI bot, for the admin's test run. */
export type BotStep = { kind: 'actie'; name: string; args: Record<string, unknown>; result: string } | { kind: 'antwoord'; text: string }

// ---------------------------------------------------------------- LM Studio

export async function lmStudio(): Promise<LmStudioSettings> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'lmStudio'))
  const v = (row?.value ?? {}) as Partial<LmStudioSettings>
  return { url: v.url ?? '', apiKey: v.apiKey ?? '', model: v.model ?? '' }
}

export async function setLmStudio(next: LmStudioSettings) {
  await db
    .insert(siteSettings)
    .values({ key: 'lmStudio', value: next })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: next, updatedAt: new Date() } })
}

/** "http://pc:1234", "http://pc:1234/" and "http://pc:1234/v1" are all the same server. */
const apiBase = (url: string) => `${url.trim().replace(/\/+$/, '').replace(/\/v1$/, '')}/v1`

async function lmFetch(lm: LmStudioSettings, path: string, body?: unknown) {
  if (!lm.url) throw new Error('LM Studio is nog niet ingesteld (Beheer → Bots).')
  const res = await fetch(`${apiBase(lm.url)}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(lm.apiKey ? { Authorization: `Bearer ${lm.apiKey}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    // A local model can take a while, but not forever
    signal: AbortSignal.timeout(120_000),
  }).catch((e: Error) => {
    throw new Error(`LM Studio is niet bereikbaar (${e.name === 'TimeoutError' ? 'het duurde te lang' : e.message}).`)
  })
  if (!res.ok) throw new Error(`LM Studio gaf een fout (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** The models LM Studio has loaded or can load, to check the connection. */
export async function lmModels(lm: LmStudioSettings): Promise<string[]> {
  const data = (await lmFetch(lm, '/models')) as { data?: { id: string }[] }
  return (data.data ?? []).map((m) => m.id)
}

type ChatMessage =
  { role: 'system' | 'user'; content: string } | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] } | { role: 'tool'; tool_call_id: string; content: string }
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

// ---------------------------------------------------------------- doing things

// What each bot did in the last hour, so a loop or a mistake can't flood the site
const recent = new Map<number, number[]>()
// Each bot's own limit (its settings), never above BOT_LIMITS.actionsPerHour
const limits = new Map<number, number>()
function mayAct(botId: number) {
  const hourAgo = Date.now() - 60 * 60 * 1000
  const list = (recent.get(botId) ?? []).filter((t) => t > hourAgo)
  if (list.length >= Math.min(limits.get(botId) ?? BOT_LIMITS.actionsPerHour, BOT_LIMITS.actionsPerHour)) {
    recent.set(botId, list)
    return false
  }
  recent.set(botId, [...list, Date.now()])
  return true
}

const fill = (text: string, member?: User) =>
  member ? text.replaceAll('{voornaam}', member.nickname).replaceAll('{naam}', member.name).replaceAll('{gebruikersnaam}', member.username) : text

async function memberNamed(username: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, username.replace(/^@/, '').trim().toLowerCase()), isNull(users.blockedAt)))
  return u ?? null
}

async function giveKnuffel(bot: User, member: User, text: string) {
  if (member.id === bot.id) return 'Een bot zet geen knuffels op zijn eigen profiel.'
  const refused = await knuffelRefusal(bot, member)
  if (refused) return refused
  if (!text.trim()) return 'Er was geen tekst.'
  if (!mayAct(bot.id)) return 'Te veel gedaan in het afgelopen uur.'
  await createKnuffel(bot, member, text.trim().slice(0, 1000))
  return `Knuffel op het profiel van @${member.username} gezet.`
}

async function sendMessage(bot: User, member: User, subject: string, body: string) {
  // routes/messages.ts imports this file; asked for here so the two don't load each other
  const { messagePermission } = await import('../routes/messages')
  const refused = await messagePermission(bot, member)
  if (refused) return refused
  if (!body.trim()) return 'Er was geen tekst.'
  if (!mayAct(bot.id)) return 'Te veel gedaan in het afgelopen uur.'
  await deliverMessage(bot.id, member.id, subject.trim().slice(0, 120) || `Een bericht van ${bot.nickname}`, body.trim().slice(0, 5000))
  return `Bericht naar @${member.username} gestuurd.`
}

export async function postStatus(bot: User, text: string) {
  if (!text.trim()) return 'Er was geen tekst.'
  if (!mayAct(bot.id)) return 'Te veel gedaan in het afgelopen uur.'
  const body = text.trim().slice(0, 500)
  const statusId = await db.transaction(async (tx) => {
    const [status] = await tx.insert(statuses).values({ userId: bot.id, text: body, visibility: 'iedereen' }).returning({ id: statuses.id })
    await recordActivity({ type: 'status', actorId: bot.id, statusId: status.id, visibility: 'iedereen' }, tx)
    return status.id
  })
  await notifyMentions({ text: body, actorId: bot.id, ref: `status:${statusId}`, message: 'noemde je in een WieWatWaar', link: `/profiel/${bot.username}` })
  return 'WieWatWaar geplaatst.'
}

async function makeFriends(bot: User, member: User) {
  if (member.id === bot.id) return 'Een bot wordt geen vrienden met zichzelf.'
  const refused = await friendRequestRefusal(bot, member)
  if (refused) return refused
  if (!mayAct(bot.id)) return 'Te veel gedaan in het afgelopen uur.'
  const state = await befriend(bot, member)
  return state === 'friends' ? `Vrienden met @${member.username}: geaccepteerd.` : `Vriendschapsverzoek naar @${member.username} gestuurd.`
}

/** What happens by itself when something reaches a bot, before its rules or AI: accepting a request, reading a message. */
async function housekeeping(row: BotRow, bot: User, e: BotEvent) {
  if (!e.member) return
  if (e.trigger === 'vriendschap' && row.options.acceptFriends) {
    const existing = await friendshipBetween(bot.id, e.member.id)
    if (existing?.status === 'pending' && existing.addresseeId === bot.id) await befriend(bot, e.member)
  }
  if (e.trigger === 'bericht' && row.options.readMessages) {
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.recipientId, bot.id), eq(messages.senderId, e.member.id), isNull(messages.readAt)))
  }
}

/** When a bot's settings are saved: accept requests that are waiting, read what's unread, open it up to everyone. */
export async function applyBotOptions(row: BotRow) {
  const o = row.options
  if (o.openToAll) {
    await db
      .update(users)
      .set({ preferences: sql`${users.preferences} || ${JSON.stringify({ knuffelsFrom: 'iedereen', messagesFrom: 'iedereen' })}::jsonb` })
      .where(eq(users.id, row.userId))
  }
  if (o.readMessages)
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.recipientId, row.userId), isNull(messages.readAt), isNotNull(messages.sentAt)))
  if (o.acceptFriends) {
    const [bot] = await db.select().from(users).where(eq(users.id, row.userId))
    const waiting = await db
      .select({ requester: users })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.requesterId))
      .where(and(eq(friendships.addresseeId, row.userId), eq(friendships.status, 'pending')))
    for (const { requester } of waiting) await befriend(bot, requester)
    return waiting.length
  }
  return 0
}

/** The subject of a message a bot sends because of something. */
const subjectFor = (e: BotEvent) =>
  e.trigger === 'bericht'
    ? `Re: ${(e.subject ?? '').replace(/^(re:\s*)+/i, '')}`.slice(0, 120)
    : e.trigger === 'nieuw_lid'
      ? 'Welkom op Kuddes!'
      : e.trigger === 'verjaardag'
        ? 'Gefeliciteerd!'
        : e.trigger === 'knuffel'
          ? 'Bedankt voor je knuffel!'
          : e.trigger === 'vriendschap'
            ? 'Leuk dat we vrienden zijn!'
            : ''

// ---------------------------------------------------------------- task bots

async function runRule(bot: User, rule: BotRule, e: BotEvent) {
  const text = fill(rule.text, e.member)
  if (rule.action === 'wiewatwaar') return postStatus(bot, text)
  if (!e.member) return 'Deze regel heeft een lid nodig, maar er is er geen.'
  if (rule.action === 'vriendschap') return makeFriends(bot, e.member)
  return rule.action === 'knuffel' ? giveKnuffel(bot, e.member, text) : sendMessage(bot, e.member, subjectFor(e), text)
}

// ---------------------------------------------------------------- AI bots

const TOOLS: Record<BotAbility, { description: string; parameters: Record<string, unknown> }> = {
  bericht_sturen: {
    description: 'Stuur een bericht naar een lid van Kuddes.',
    parameters: {
      type: 'object',
      properties: { gebruikersnaam: { type: 'string', description: 'De gebruikersnaam, zonder @' }, onderwerp: { type: 'string' }, tekst: { type: 'string' } },
      required: ['gebruikersnaam', 'tekst'],
    },
  },
  knuffel_geven: {
    description: 'Zet een knuffel (een berichtje op het gastenboek) op het profiel van een lid.',
    parameters: {
      type: 'object',
      properties: { gebruikersnaam: { type: 'string', description: 'De gebruikersnaam, zonder @' }, tekst: { type: 'string' } },
      required: ['gebruikersnaam', 'tekst'],
    },
  },
  wiewatwaar_plaatsen: {
    description: 'Plaats een WieWatWaar (een kort statusbericht) voor iedereen. Noem leden met @gebruikersnaam.',
    parameters: { type: 'object', properties: { tekst: { type: 'string', description: 'Maximaal 500 tekens' } }, required: ['tekst'] },
  },
  lid_bekijken: {
    description: 'Lees het openbare profiel van een lid: naam, woonplaats, “over mij” en sinds wanneer lid.',
    parameters: { type: 'object', properties: { gebruikersnaam: { type: 'string', description: 'De gebruikersnaam, zonder @' } }, required: ['gebruikersnaam'] },
  },
  vriendschap_sturen: {
    description: 'Stuur een lid een vriendschapsverzoek, of accepteer het verzoek dat zij jou stuurden.',
    parameters: { type: 'object', properties: { gebruikersnaam: { type: 'string', description: 'De gebruikersnaam, zonder @' } }, required: ['gebruikersnaam'] },
  },
  nieuws_lezen: { description: 'Lees de vijf nieuwste nieuwsberichten van Kuddes.', parameters: { type: 'object', properties: {} } },
}

/** What a member's profile tells any other member; never their e-mail address or anything private. */
async function lookUp(username: string) {
  const u = await memberNamed(username)
  if (!u) return `Er is geen lid @${username}.`
  return JSON.stringify({
    gebruikersnaam: u.username,
    naam: u.name,
    roepnaam: u.nickname,
    woonplaats: u.city ?? null,
    overMij: (u.about ?? '').slice(0, 600),
    lidSinds: u.createdAt.toISOString().slice(0, 10),
    isBot: u.isBot,
  })
}

async function latestNews() {
  const rows = await db
    .select({ title: news.title, summary: news.summary, publishedAt: news.publishedAt })
    .from(news)
    .where(and(eq(news.published, true), sql`${news.publishedAt} <= now()`))
    .orderBy(desc(news.publishedAt))
    .limit(5)
  return JSON.stringify(rows.map((r) => ({ titel: r.title, samenvatting: r.summary, datum: r.publishedAt.toISOString().slice(0, 10) })))
}

/** What happened, for the model, and what its plain answer becomes. */
function describe(e: BotEvent): string {
  const m = e.member ? `@${e.member.username} (${e.member.nickname})` : ''
  switch (e.trigger) {
    case 'nieuw_lid':
      return `${m} is net lid geworden van Kuddes. Je antwoord wordt als knuffel op hun profiel gezet.`
    case 'verjaardag':
      return `${m} is vandaag jarig. Je antwoord wordt als knuffel op hun profiel gezet.`
    case 'bericht':
      return `${m} stuurde je een bericht.\nOnderwerp: ${e.subject || '(geen)'}\n\n${e.text ?? ''}\n\nJe antwoord wordt als bericht teruggestuurd.`
    case 'knuffel':
      return `${m} zette deze knuffel op jouw profiel:\n\n${e.text ?? ''}\n\nJe antwoord wordt als knuffel op hun profiel gezet.`
    case 'vriendschap':
      return `${m} wil vrienden met je worden${e.accepted ? ' (je hebt het verzoek al geaccepteerd)' : ''}. Je antwoord wordt als knuffel op hun profiel gezet.`
    case 'dagelijks':
      return `Het is ${amsterdam().time} op ${amsterdam().date}: tijd voor je dagelijkse bericht. Je antwoord wordt als WieWatWaar geplaatst.`
  }
}

/**
 * Asks the model what to do and does it: tools it calls are carried out
 * (at most three actions), and its plain answer goes where the event says.
 * `dryRun`: nothing is done, only shown (the admin's test).
 */
export async function runAi(row: BotRow, bot: User, e: BotEvent, dryRun = false): Promise<BotStep[]> {
  const lm = await lmStudio()
  const abilities = row.abilities.filter((a) => a in BOT_ABILITIES)
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        `Je bent ${bot.nickname} (@${bot.username}), een bot op Kuddes: een Nederlandse vriendensite zoals Hyves vroeger.`,
        'Je bent een bot en zegt dat eerlijk als iemand het vraagt. Schrijf in het Nederlands, kort en vriendelijk, zonder kopjes.',
        'Deel nooit e-mailadressen of andere privégegevens, en doe alleen wat je instructies en mogelijkheden toestaan.',
        'Wil je niets doen of zeggen, antwoord dan alleen met een streepje: -',
        '',
        'Instructies van de beheerder:',
        row.instructions || '(geen)',
      ].join('\n'),
    },
    { role: 'user', content: describe(e) },
  ]
  const tools = abilities.map((a) => ({ type: 'function' as const, function: { name: a, ...TOOLS[a] } }))
  const steps: BotStep[] = []
  let actions = 0
  for (let round = 0; round < 4; round++) {
    const data = (await lmFetch(lm, '/chat/completions', {
      model: row.model || lm.model || undefined,
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      temperature: 0.7,
      max_tokens: 800,
      stream: false,
    })) as { choices?: { message: { content: string | null; tool_calls?: ToolCall[] } }[] }
    const reply = data.choices?.[0]?.message
    if (!reply) throw new Error('LM Studio gaf geen antwoord.')
    if (reply.tool_calls?.length) {
      messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: reply.tool_calls })
      for (const call of reply.tool_calls) {
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          // a model that writes broken JSON gets told so below
        }
        const result = await callTool(bot, call.function.name, args, abilities, dryRun, () => ++actions <= 3)
        steps.push({ kind: 'actie', name: call.function.name, args, result })
        messages.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
      continue
    }
    // Reasoning models think out loud first; only the answer counts
    const text = (reply.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
    if (!text || text === '-') return steps
    steps.push({ kind: 'antwoord', text })
    // The plain answer goes where the event says, unless the bot already acted itself
    if (!dryRun && !steps.some((s) => s.kind === 'actie' && s.name !== 'lid_bekijken' && s.name !== 'nieuws_lezen')) {
      if (e.trigger === 'dagelijks') await postStatus(bot, text)
      else if (e.member && e.trigger === 'bericht') await sendMessage(bot, e.member, subjectFor(e), text)
      else if (e.member) await giveKnuffel(bot, e.member, text)
    }
    return steps
  }
  return steps
}

async function callTool(bot: User, name: string, args: Record<string, unknown>, allowed: BotAbility[], dryRun: boolean, count: () => boolean): Promise<string> {
  if (!allowed.includes(name as BotAbility)) return `Dat mag je niet: ${name}.`
  const str = (k: string) => (typeof args[k] === 'string' ? (args[k] as string) : '')
  if (name === 'lid_bekijken') return lookUp(str('gebruikersnaam'))
  if (name === 'nieuws_lezen') return latestNews()
  if (!count()) return 'Je hebt al genoeg gedaan voor nu.'
  if (dryRun) return '(Proef: niet echt gedaan.)'
  if (name === 'wiewatwaar_plaatsen') return postStatus(bot, str('tekst'))
  const member = await memberNamed(str('gebruikersnaam'))
  if (!member) return `Er is geen lid @${str('gebruikersnaam')}.`
  if (member.isBot) return 'Bots praten niet met andere bots.'
  if (name === 'vriendschap_sturen') return makeFriends(bot, member)
  return name === 'knuffel_geven' ? giveKnuffel(bot, member, str('tekst')) : sendMessage(bot, member, str('onderwerp'), str('tekst'))
}

// ---------------------------------------------------------------- running

// One at a time: a local model does one thing at once, and so does the database work here
let chain: Promise<unknown> = Promise.resolve()
const enqueue = (job: () => Promise<void>) => {
  chain = chain.then(job).catch(console.error)
}

async function record(botId: number, error: string | null) {
  await db
    .update(bots)
    .set({ runs: sql`${bots.runs} + 1`, lastRunAt: new Date(), lastError: error })
    .where(eq(bots.userId, botId))
}

async function runFor(row: BotRow, bot: User, e: BotEvent) {
  limits.set(row.userId, row.options.maxPerHour)
  try {
    if (row.kind === 'taken') {
      const results = []
      for (const rule of row.rules.filter((r) => r.enabled && r.trigger === e.trigger)) results.push(await runRule(bot, rule, e))
      // Something that didn't work (a member who only wants knuffels from friends) is shown in Beheer
      const problem = results.find((r) => !/(gezet|gestuurd|geplaatst|geaccepteerd)\.$/.test(r))
      await record(row.userId, problem ?? null)
    } else {
      await runAi(row, bot, e)
      await record(row.userId, null)
    }
  } catch (err) {
    await record(row.userId, (err as Error).message.slice(0, 300))
  }
}

/** Something happened on the site; the bots that want to know react (in the background). */
export function botEvent(e: BotEvent) {
  if (e.member?.isBot) return
  enqueue(async () => {
    const rows = await db
      .select({ bot: bots, user: users })
      .from(bots)
      .innerJoin(users, eq(users.id, bots.userId))
      .where(and(eq(bots.enabled, true), isNull(users.blockedAt), e.botId ? eq(bots.userId, e.botId) : undefined))
    for (const { bot, user } of rows) {
      await housekeeping(bot, user, e)
      const wants = bot.kind === 'taken' ? bot.rules.some((r) => r.enabled && r.trigger === e.trigger) : bot.triggers.includes(e.trigger)
      if (!wants) continue
      const event = e.trigger === 'vriendschap' ? { ...e, accepted: bot.options.acceptFriends } : e
      // Waiting a moment first feels less like a machine; the queue goes on meanwhile
      if (bot.options.delaySeconds > 0) setTimeout(() => enqueue(() => runFor(bot, user, event)), bot.options.delaySeconds * 1000)
      else await runFor(bot, user, event)
    }
  })
}

// ---------------------------------------------------------------- the clock

/** Today and the time now in the Netherlands: "2026-10-08", "09:00". */
export function amsterdam(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

const BIRTHDAY_AT = '09:00'

/** Which daily things of a bot are due now (the state remembers what already ran today). */
export function dueToday(row: Pick<BotRow, 'kind' | 'rules' | 'triggers' | 'dailyAt' | 'state'>, now = amsterdam()) {
  const due: { key: string; trigger: 'dagelijks' | 'verjaardag'; rule?: BotRule }[] = []
  const open = (key: string, at: string) => at <= now.time && row.state[key] !== now.date
  if (row.kind === 'taken') {
    for (const rule of row.rules.filter((r) => r.enabled)) {
      if (rule.trigger === 'dagelijks' && open(rule.id, rule.time)) due.push({ key: rule.id, trigger: 'dagelijks', rule })
      if (rule.trigger === 'verjaardag' && open(rule.id, BIRTHDAY_AT)) due.push({ key: rule.id, trigger: 'verjaardag', rule })
    }
  } else {
    if (row.triggers.includes('dagelijks') && open('dagelijks', row.dailyAt)) due.push({ key: 'dagelijks', trigger: 'dagelijks' })
    if (row.triggers.includes('verjaardag') && open('verjaardag', BIRTHDAY_AT)) due.push({ key: 'verjaardag', trigger: 'verjaardag' })
  }
  return due
}

/**
 * Marks today's daily things whose time has passed as done, when a bot is
 * saved: a rule for 9:00 made in the afternoon starts tomorrow, not right away.
 */
export function skipPast(row: Pick<BotRow, 'kind' | 'rules' | 'triggers' | 'dailyAt' | 'state'>) {
  const now = amsterdam()
  const state = { ...row.state }
  for (const d of dueToday(row, now)) state[d.key] = now.date
  return state
}

async function birthdaysToday(date: string) {
  return db
    .select()
    .from(users)
    .where(
      and(
        sql`to_char(${users.birthdate}, 'MM-DD') = ${date.slice(5)}`,
        isNotNull(users.emailVerifiedAt),
        isNull(users.blockedAt),
        eq(users.isBot, false),
        eq(users.isDummy, false),
      ),
    )
}

async function tick() {
  const now = amsterdam()
  const rows = await db
    .select({ bot: bots, user: users })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.userId))
    .where(and(eq(bots.enabled, true), isNull(users.blockedAt)))
  for (const { bot, user } of rows) {
    const due = dueToday(bot, now)
    if (!due.length) continue
    // Marked first, so a slow model or a restart can't make it happen twice
    const state = { ...bot.state }
    for (const d of due) state[d.key] = now.date
    await db.update(bots).set({ state }).where(eq(bots.userId, bot.userId))
    for (const d of due) {
      const row = d.rule ? { ...bot, kind: 'taken' as const, rules: [d.rule] } : bot
      if (d.trigger === 'dagelijks') enqueue(() => runFor(row, user, { trigger: 'dagelijks' }))
      else for (const member of await birthdaysToday(now.date)) enqueue(() => runFor(row, user, { trigger: 'verjaardag', member }))
    }
  }
}

/** Checks every half minute whether a bot has something to do at this time. */
export function startBotClock() {
  setInterval(() => void tick().catch(console.error), 30_000).unref()
}
