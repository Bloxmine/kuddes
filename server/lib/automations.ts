/**
 * The admin's automations (shared/automations.ts): something happens (a
 * member comes online, someone signs up, posts…), the conditions are checked
 * and the actions are carried out, one automation at a time. Signing up is
 * checked before the account exists, so it can still be refused. Every action
 * goes in the Logboek; the admin is never punished, and bots don't set
 * automations off.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { AUTO_ACTIONS, AUTO_RIGHTS, type AutoAction, type AutoTrigger, type AutomationConfig } from '../../shared/automations'
import type { WatchPlace } from '../../shared/bots'
import { wordsIn } from '../../shared/moderationWords'
import { db } from '../db/client'
import { automations, suggestions, users, type User } from '../db/schema'
import { amsterdam, postStatus } from './bots'
import { createKnuffel, knuffelRefusal } from './knuffels'
import { banMemberIp, blacklistMember, blockMember, logAction, logOutEverywhere, setRight } from './memberActions'
import { absolute } from './seo'
import { approveMember } from './signups'
import { deliverMessage } from './videoAccess'

type Row = typeof automations.$inferSelect
export type AutoContext = {
  member?: User
  /** What they posted, for Lid plaatst iets. */
  text?: string
  place?: WatchPlace
  /** How long they were away, for Lid komt online / logt in. */
  awayMs?: number
  /** The connection, when the member has no stored address yet (just signed up). */
  ip?: string
  /** Before the account exists. */
  signup?: { username: string; name: string; email: string }
}

const DAY = 24 * 60 * 60 * 1000

// Asked on every page view (Lid komt online): kept for half a minute, or until one changes
let cached: { at: number; rows: Row[] } | null = null
export const forgetAutomations = () => (cached = null)
async function enabledFor(trigger: AutoTrigger) {
  if (!cached || Date.now() - cached.at > 30_000) cached = { at: Date.now(), rows: await db.select().from(automations) }
  return cached.rows.filter((r) => r.config.enabled && r.config.trigger === trigger)
}

const fill = (text: string, ctx: AutoContext) => {
  const m = ctx.member
  return text
    .replaceAll('{voornaam}', m?.nickname ?? ctx.signup?.name.split(' ')[0] ?? '')
    .replaceAll('{naam}', m?.name ?? ctx.signup?.name ?? '')
    .replaceAll('{gebruikersnaam}', m?.username ?? ctx.signup?.username ?? '')
    .replaceAll('{tekst}', ctx.text ?? '')
}

/** Why it doesn't apply (empty: it does), in words for the admin's test. */
export function whyNot(row: Pick<Row, 'config' | 'done'>, ctx: AutoContext): string[] {
  const c = row.config.conditions
  const m = ctx.member
  const why: string[] = []
  const username = m?.username ?? ctx.signup?.username
  if (c.members.length && !(username && c.members.includes(username))) why.push('Dit lid staat niet bij “alleen deze leden”.')
  if (c.words.length) {
    const haystack = ctx.signup
      ? `${ctx.signup.username} ${ctx.signup.name} ${ctx.signup.email}`
      : row.config.trigger === 'geplaatst'
        ? (ctx.text ?? '')
        : m
          ? `${m.username} ${m.name} ${m.nickname}`
          : ''
    if (!wordsIn(haystack, c.words).length) why.push('Geen van de woorden komt erin voor.')
  }
  if ((row.config.trigger === 'online' || row.config.trigger === 'inloggen') && c.awayDays > 0 && (ctx.awayMs ?? 0) < c.awayDays * DAY)
    why.push(`Niet ${c.awayDays} dagen of langer weg geweest.`)
  if (row.config.trigger === 'online' && row.config.awayMinutes > 0 && (ctx.awayMs ?? 0) < row.config.awayMinutes * 60_000) why.push(`Niet ${row.config.awayMinutes} minuten of langer weg geweest.`)
  if (m) {
    const age = (Date.now() - m.createdAt.getTime()) / DAY
    if (c.minAgeDays > 0 && age < c.minAgeDays) why.push(`Account jonger dan ${c.minAgeDays} dagen.`)
    if (c.maxAgeDays > 0 && age > c.maxAgeDays) why.push(`Account ouder dan ${c.maxAgeDays} dagen.`)
    if (c.once && row.done.members.includes(m.id)) why.push('Al eens gedaan voor dit lid.')
  }
  if (row.config.trigger === 'geplaatst' && row.config.places.length && !(ctx.place && row.config.places.includes(ctx.place)))
    why.push('Niet geplaatst op een van de gekozen plekken.')
  return why
}

let adminUser: User | null = null
async function theAdmin() {
  adminUser ??= (await db.select().from(users).where(eq(users.forumRole, 'admin')).limit(1))[0] ?? null
  return adminUser
}

async function botNamed(id: number | null) {
  if (!id) return null
  const [bot] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), eq(users.isBot, true), isNull(users.blockedAt)))
  return bot ?? null
}

/** One action, done (or, with `dryRun`, only described). What happened, in words. */
async function doAction(a: AutomationConfig, action: AutoAction, ctx: AutoContext, dryRun: boolean): Promise<string> {
  const def = AUTO_ACTIONS[action.kind]
  const m = ctx.member
  const text = fill(action.text, ctx).trim()
  if (action.kind === 'weigeren') return ctx.signup ? 'Aanmelding geweigerd.' : 'Overgeslagen: er is geen aanmelding om te weigeren.'
  if (def.member && !m) return `Overgeslagen (${def.name}): er is geen lid.`
  if (m && def.punish && m.forumRole === 'admin') return `Overgeslagen (${def.name}): dat doen we de beheerder niet aan.`
  if (dryRun) return `${def.name}${text ? `: “${text}”` : ''}${action.kind === 'rechten' ? `: ${AUTO_RIGHTS[action.right]} ${action.grant ? 'aan' : 'uit'}` : ''}`
  switch (action.kind) {
    case 'bericht': {
      const from = (await botNamed(action.from)) ?? (await theAdmin())
      if (!from || from.id === m!.id) return 'Overgeslagen: geen afzender.'
      await deliverMessage(from.id, m!.id, 'Een bericht van Kuddes', text || '…')
      return `Bericht van ${from.nickname} gestuurd.`
    }
    case 'knuffel': {
      const bot = await botNamed(action.from)
      if (!bot) return 'Overgeslagen: een knuffel komt van een bot; kies er een.'
      const refused = await knuffelRefusal(bot, m!)
      if (refused) return `Overgeslagen: ${refused}`
      await createKnuffel(bot, m!, text.slice(0, 1000))
      return `Knuffel van ${bot.nickname} gezet.`
    }
    case 'wiewatwaar': {
      const bot = await botNamed(action.from)
      if (!bot) return 'Overgeslagen: een WieWatWaar komt van een bot; kies er een.'
      return postStatus(bot, text)
    }
    case 'melding': {
      const who = m ? `@${m.username}` : ctx.signup ? `aanmelding van @${ctx.signup.username} (${ctx.signup.email})` : ''
      await db.insert(suggestions).values({
        userId: null,
        kind: 'probleem',
        title: `Automatisering: ${a.name}${who ? ` (${who})` : ''}`.slice(0, 120),
        body: [text || '(geen tekst)', ...(m ? ['', `Profiel: ${absolute(`/profiel/${m.username}`)}`] : [])].join('\n'),
        page: m ? `/profiel/${m.username}` : null,
      })
      return 'Melding gemaakt.'
    }
    case 'blokkeren':
      await blockMember(m!, text || `Automatisering: ${a.name}`)
      return 'Account geblokkeerd.'
    case 'uitloggen':
      await logOutEverywhere(m!)
      return 'Overal uitgelogd.'
    case 'ip_ban': {
      const range = await banMemberIp(ctx.ip && !m!.lastIp ? { ...m!, lastIp: ctx.ip } : m!, action.duration, action.scope, `Automatisering: ${a.name}`)
      return range ? `IP ${range} geband.` : 'Overgeslagen: van dit lid is geen IP-adres bekend.'
    }
    case 'zwarte_lijst':
      await blacklistMember(m!, text || `Automatisering: ${a.name}`)
      return 'Op de zwarte lijst gezet.'
    case 'rechten':
      await setRight(m!, action.right, action.grant, null)
      return `${AUTO_RIGHTS[action.right]}: ${action.grant ? 'gegeven' : 'afgepakt'}.`
    case 'goedkeuren': {
      if (m!.emailVerifiedAt) return 'Overgeslagen: al toegelaten.'
      const admin = await theAdmin()
      if (!admin) return 'Overgeslagen: geen beheerder.'
      await approveMember(m!, admin)
      return 'Aanmelding goedgekeurd.'
    }
  }
  return ''
}

/** Runs one automation for one event (conditions first); whether it refused a signup, and what it did. */
export async function runAutomation(row: Row, ctx: AutoContext, dryRun = false): Promise<{ applies: boolean; why: string[]; steps: string[]; refused: boolean }> {
  const why = whyNot(row, ctx)
  if (why.length) return { applies: false, why, steps: [], refused: false }
  const steps: string[] = []
  let error: string | null = null
  for (const action of row.config.actions) {
    try {
      const step = await doAction(row.config, action, ctx, dryRun)
      steps.push(step)
      if (!dryRun && !step.startsWith('Overgeslagen'))
        await logAction(null, `automatisering: ${row.config.name}`, ctx.member ? `lid ${ctx.member.username}` : ctx.signup ? `aanmelding ${ctx.signup.username}` : '', step)
    } catch (err) {
      error = (err as Error).message.slice(0, 300)
      steps.push(`Fout: ${error}`)
    }
  }
  const refused = !!ctx.signup && row.config.actions.some((x) => x.kind === 'weigeren')
  if (!dryRun) {
    await db
      .update(automations)
      .set({
        runs: sql`${automations.runs} + 1`,
        lastRunAt: new Date(),
        lastError: error,
        ...(row.config.conditions.once && ctx.member ? { done: { ...row.done, members: [...row.done.members, ctx.member.id] } } : {}),
      })
      .where(eq(automations.id, row.id))
    if (row.config.conditions.once && ctx.member) forgetAutomations()
  }
  return { applies: true, why: [], steps, refused }
}

// One at a time, in the background: an automation never holds up a page
let chain: Promise<unknown> = Promise.resolve()

/** Something happened; the automations for it run (in the background). */
export function automationEvent(trigger: AutoTrigger, ctx: AutoContext) {
  if (ctx.member?.isBot) return
  chain = chain
    .then(async () => {
      for (const row of await enabledFor(trigger)) await runAutomation(row, ctx)
    })
    .catch(console.error)
}

/**
 * Someone wants to make an account: the "Iemand wil een account maken"
 * automations run now (the account doesn't exist yet). True when one refuses it.
 */
export async function checkSignup(signup: { username: string; name: string; email: string }, ip: string) {
  let refused = false
  for (const row of await enabledFor('aanmelden')) {
    const result = await runAutomation(row, { signup, ip })
    refused ||= result.refused
  }
  return refused
}

/** Elke dag: at its time, once a day, for each member it names (or once, without). */
async function tick() {
  const now = amsterdam()
  for (const row of await enabledFor('dagelijks')) {
    if (row.config.time > now.time || row.done.day === now.date) continue
    await db
      .update(automations)
      .set({ done: { ...row.done, day: now.date } })
      .where(eq(automations.id, row.id))
    forgetAutomations()
    const fresh = { ...row, done: { ...row.done, day: now.date } }
    const named = row.config.conditions.members
    if (!named.length) {
      await runAutomation(fresh, {})
      continue
    }
    const members = await db
      .select()
      .from(users)
      .where(and(isNotNull(users.emailVerifiedAt), inArray(users.username, named)))
    for (const m of members) await runAutomation(fresh, { member: m })
  }
}

export function startAutomationClock() {
  setInterval(() => {
    chain = chain.then(tick).catch(console.error)
  }, 30_000).unref()
}
