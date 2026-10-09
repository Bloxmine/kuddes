/**
 * Bots keeping watch (Toezicht, shared/bots.ts): what members post where others
 * can see it is checked against the admin's word list and a few behaviours
 * (flooding, copy-paste, links, shouting, many friend requests). On a hit the
 * bot warns the member, can take the post away and can make a melding for the
 * admin. Private messages are never read. The admin and other bots are left
 * alone.
 */
import { and, asc, count, eq, gt, isNull, lt } from 'drizzle-orm'
import { BEHAVIOURS, REMOVABLE_PLACES, WATCH_PLACES, type Behaviour, type BotModeration, type WatchPlace } from '../../shared/bots'
import { db } from '../db/client'
import { botWarnings, bots, suggestions, users, type User } from '../db/schema'
import { fold, wordsIn } from '../../shared/moderationWords'
import { absolute } from './seo'
import { automationEvent } from './automations'
import { alertAdmin } from './alerts'
import { deliverMessage } from './videoAccess'

export type Posted = {
  author: User
  place: WatchPlace
  text: string
  /** Where it can be seen, for the melding (a path on the site). */
  link: string
  /** Takes the post away again, where that's possible. */
  remove?: () => Promise<void>
}

// ---------------------------------------------------------------- behaviour

// What each member posted lately (in memory: a restart forgets, which is fine for minutes)
const recent = new Map<number, { at: number; text: string }[]>()
const requests = new Map<number, number[]>()
// One warning per member and reason per 10 minutes, so nobody gets a pile of them
const lastWarned = new Map<string, number>()

const norm = (s: string) => fold(s).replace(/\s+/g, ' ').trim()
const linkCount = (s: string) => (s.match(/https?:\/\/|www\./gi) ?? []).length

function behavioursIn(p: Posted, rules: BotModeration['behaviours']): Behaviour[] {
  const now = Date.now()
  const longest = Math.max(rules.flood.minutes, rules.herhaling.minutes, 1) * 60_000
  const list = [...(recent.get(p.author.id) ?? []).filter((r) => r.at > now - longest), { at: now, text: norm(p.text) }]
  recent.set(p.author.id, list.slice(-200))
  const found: Behaviour[] = []
  const within = (minutes: number) => list.filter((r) => r.at > now - minutes * 60_000)
  if (rules.flood.on && within(rules.flood.minutes).length > rules.flood.count) found.push('flood')
  const mine = norm(p.text)
  if (rules.herhaling.on && mine.length >= 3 && within(rules.herhaling.minutes).filter((r) => r.text === mine).length >= rules.herhaling.count) found.push('herhaling')
  if (rules.links.on && linkCount(p.text) >= rules.links.count) found.push('links')
  const letters = p.text.replace(/[^a-zA-ZÀ-ÿ]/g, '')
  if (rules.hoofdletters.on && letters.length >= 20 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length >= 0.8) found.push('hoofdletters')
  return found
}

// ---------------------------------------------------------------- the watching bot

type Watcher = { bot: User; moderation: BotModeration }
let cached: { at: number; watcher: Watcher | null } | null = null
export const forgetWatcher = () => (cached = null)

/** The bot that keeps watch: the first one switched on with Toezicht on (one is enough, so nobody gets two warnings). */
async function watcher(): Promise<Watcher | null> {
  if (cached && Date.now() - cached.at < 30_000) return cached.watcher
  const rows = await db
    .select({ bot: users, moderation: bots.moderation })
    .from(bots)
    .innerJoin(users, eq(users.id, bots.userId))
    .where(and(eq(bots.enabled, true), isNull(users.blockedAt)))
    .orderBy(asc(bots.userId))
  const row = rows.find((r) => r.moderation.enabled) ?? null
  cached = { at: Date.now(), watcher: row && { bot: row.bot, moderation: row.moderation } }
  return cached.watcher
}

const exempt = (u: User) => u.isBot || u.forumRole === 'admin'

/** Why, in words for the member ("je …") and for the admin's melding. */
function reasonText(reason: string, detail: string) {
  if (reason === 'woord') return { told: `je gebruikte een woord dat hier niet mag (${detail})`, title: `woord “${detail}”` }
  const b = BEHAVIOURS[reason as Behaviour]
  return b ? { told: b.told, title: b.name.toLowerCase() } : { told: reason, title: reason }
}

async function act(w: Watcher, member: User, reason: string, detail: string, place: string, opts: { warn: boolean; report: boolean }, link: string, excerpt: string) {
  const key = `${member.id}:${reason}`
  const now = Date.now()
  if ((lastWarned.get(key) ?? 0) > now - 10 * 60_000) return
  lastWarned.set(key, now)
  await db.insert(botWarnings).values({ botId: w.bot.id, userId: member.id, reason, detail, place })
  const why = reasonText(reason, detail)
  if (opts.warn) {
    const text = w.moderation.warning.replaceAll('{voornaam}', member.nickname).replaceAll('{reden}', why.told).replaceAll('{waar}', place)
    // A warning has to arrive, whatever the member set for who may message them
    await deliverMessage(w.bot.id, member.id, 'Een seintje van Kuddes', text)
  }
  const melding = async (title: string, body: string) => {
    await db.insert(suggestions).values({ userId: w.bot.id, kind: 'probleem', title: title.slice(0, 120), body, page: link || null })
  }
  if (opts.report) {
    await melding(
      `Toezicht: @${member.username}, ${why.title}`,
      [
        `${w.bot.nickname} zag iets bij @${member.username} (${member.name}).`,
        '',
        `**Waarom:** ${why.title}`,
        `**Waar:** ${place}`,
        ...(link ? [`**Link:** ${absolute(link)}`] : []),
        ...(excerpt ? ['', '**Wat er stond:**', excerpt] : []),
      ].join('\n'),
    )
  }
  // A member who keeps getting warnings goes to the admin once they reach the number
  if (w.moderation.reportAfter > 0) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(botWarnings)
      .where(and(eq(botWarnings.userId, member.id), gt(botWarnings.createdAt, new Date(now - 30 * 24 * 60 * 60 * 1000))))
    if (n === w.moderation.reportAfter) {
      await melding(
        `Toezicht: @${member.username} kreeg ${n} waarschuwingen`,
        `@${member.username} (${member.name}) kreeg ${n} waarschuwingen in 30 dagen. Bekijk het profiel en de waarschuwingen in Beheer → Bots.`,
      )
      await alertAdmin('warnings', `@${member.username} kreeg ${n} waarschuwingen`, [`${member.name} (@${member.username}) kreeg ${n} waarschuwingen van ${w.bot.nickname} in 30 dagen.`], `/profiel/${member.username}`)
    }
  }
}

async function check(p: Posted) {
  if (exempt(p.author)) return
  const w = await watcher()
  if (!w || !w.moderation.places.includes(p.place)) return
  const m = w.moderation
  const place = WATCH_PLACES[p.place]
  const excerpt = p.text.slice(0, 300)
  const hits = wordsIn(p.text, m.words)
  if (hits.length) {
    if (m.onWord.remove && p.remove && REMOVABLE_PLACES.includes(p.place)) await p.remove()
    await act(w, p.author, 'woord', hits.join(', '), place, { warn: m.onWord.warn, report: m.onWord.report }, p.link, excerpt)
  }
  for (const b of behavioursIn(p, m.behaviours)) await act(w, p.author, b, '', place, m.onBehaviour, p.link, excerpt)
}

/** Something was posted where others can see it: checked in the background, never holding up the post. */
export function checkPost(p: Posted) {
  void check(p).catch(console.error)
  automationEvent('geplaatst', { member: p.author, text: p.text, place: p.place })
}

/** A friend request was sent: too many in a short time is a behaviour too. */
export function checkFriendRequest(author: User) {
  void (async () => {
    if (exempt(author)) return
    const w = await watcher()
    const rule = w?.moderation.behaviours.vriendverzoeken
    if (!w || !rule?.on) return
    const now = Date.now()
    const list = [...(requests.get(author.id) ?? []).filter((t) => t > now - rule.minutes * 60_000), now]
    requests.set(author.id, list)
    if (list.length >= rule.count)
      await act(w, author, 'vriendverzoeken', `${list.length} in ${rule.minutes} minuten`, 'vriendschapsverzoeken', w.moderation.onBehaviour, `/profiel/${author.username}`, '')
  })().catch(console.error)
}

/** Warnings are kept for a year, then they're gone. */
export async function purgeOldWarnings() {
  await db.delete(botWarnings).where(lt(botWarnings.createdAt, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)))
}
