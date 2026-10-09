/**
 * Mails to the admin (Beheer → Rustige stand): at once for what's urgent, a
 * few an hour at most for posts hidden after reports and members with many
 * warnings, and a summary every Monday morning. Only with mail set up.
 */
import { and, count, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { automations, botWarnings, contentReports, hiddenItems, siteSettings, users } from '../db/schema'
import { amsterdam } from './bots'
import { adminAlertMail, mailEnabled, sendMailSoon } from './mail'
import { absolute } from './seo'
import { safety } from './siteSettings'

export type AlertKind = 'urgent' | 'hidden' | 'warnings'

// Not more than this many non-urgent mails an hour, so a busy day doesn't flood the inbox
const sent: number[] = []

export async function alertAdmin(kind: AlertKind, subject: string, lines: string[], link: string | null) {
  if (!mailEnabled() || !safety().alerts[kind]) return
  if (kind !== 'urgent') {
    const hourAgo = Date.now() - 60 * 60 * 1000
    while (sent.length && sent[0] < hourAgo) sent.shift()
    if (sent.length >= 6) return
    sent.push(Date.now())
  }
  const [admin] = await db.select({ email: users.email, nickname: users.nickname }).from(users).where(eq(users.forumRole, 'admin')).limit(1)
  if (!admin) return
  sendMailSoon(adminAlertMail(admin.email, admin.nickname, subject, lines.filter(Boolean), absolute(link ?? '/beheer?tab=meldingen'), link ? 'Bekijken' : 'Naar Meldingen'))
}

/** The week in numbers, every Monday from 9:00 (once; the day it went is kept in site_settings). */
async function weekly() {
  if (!mailEnabled() || !safety().alerts.weekly) return
  const now = amsterdam()
  const monday = new Date(`${now.date}T12:00:00`).getDay() === 1
  if (!monday || now.time < '09:00') return
  const [last] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'weeklyDigest'))
  if (last?.value === now.date) return
  await db
    .insert(siteSettings)
    .values({ key: 'weeklyDigest', value: now.date })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: now.date, updatedAt: new Date() } })
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  const [members, waiting, openReports, hidden, warnings, blocked, autoErrors] = await Promise.all([
    n(db.select({ n: count() }).from(users).where(and(gt(users.createdAt, week), isNull(users.domain)))),
    n(
      db
        .select({ n: count() })
        .from(users)
        .where(and(isNull(users.emailVerifiedAt), isNull(users.blockedAt))),
    ),
    n(
      db
        .select({ n: sql<number>`count(distinct (${contentReports.kind}, ${contentReports.targetId}))::int` })
        .from(contentReports)
        .where(eq(contentReports.status, 'open')),
    ),
    n(db.select({ n: count() }).from(hiddenItems)),
    n(db.select({ n: count() }).from(botWarnings).where(gt(botWarnings.createdAt, week))),
    n(
      db
        .select({ n: count() })
        .from(users)
        .where(and(isNotNull(users.blockedAt), gt(users.blockedAt, week))),
    ),
    n(db.select({ n: count() }).from(automations).where(isNotNull(automations.lastError))),
  ])
  const quiet = safety().quiet.on
  await alertAdmin(
    'urgent',
    'Je week op Kuddes',
    [
      `Nieuwe leden: ${members}${waiting ? ` (${waiting} wachten nog op goedkeuring of bevestiging)` : ''}.`,
      `Gemelde berichten die op je wachten: ${openReports}, waarvan ${hidden} verborgen.`,
      `Waarschuwingen van bots: ${warnings}. Geblokkeerde accounts: ${blocked}.`,
      autoErrors ? `Automatiseringen met een fout: ${autoErrors}.` : 'Alle automatiseringen liepen zonder fouten.',
      quiet ? 'De rustige stand staat aan.' : 'De rustige stand staat uit.',
    ],
    '/beheer?tab=meldingen',
  )
}

export function startAlertClock() {
  setInterval(() => void weekly().catch(console.error), 10 * 60 * 1000).unref()
}
