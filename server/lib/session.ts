import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNotNull, lt } from 'drizzle-orm'
import { LAST_IP_DAYS } from '../../shared/ipBans'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { config } from '../config'
import { db } from '../db/client'
import { sessions, users, type User } from '../db/schema'
import { HttpError } from './errors'
import { clientIp } from './clientIp'
import { quiet, signupApproval } from './siteSettings'

export type AppEnv = { Variables: { user: User | null } }

const COOKIE = 'kuddes_session'
const DAY = 24 * 60 * 60 * 1000
const SEEN_THROTTLE_MS = 60 * 1000

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(c: Context, userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + config.sessionDays * DAY)
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt })
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.isProduction,
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(c: Context) {
  const token = getCookie(c, COOKIE)
  if (token) await db.delete(sessions).where(eq(sessions.id, hashToken(token)))
  deleteCookie(c, COOKIE, { path: '/' })
}

/** Loads the logged-in user (or null) into `c.var.user` for every request. */
export const sessionMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('user', null)
  const token = getCookie(c, COOKIE)
  if (token) {
    const now = new Date()
    const [row] = await db
      .select({ user: users, expiresAt: sessions.expiresAt, id: sessions.id })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, now)))
      .limit(1)

    if (row && row.user.blockedAt) {
      // Blocked by the admin: the session no longer counts
      await db.delete(sessions).where(eq(sessions.id, row.id))
      deleteCookie(c, COOKIE, { path: '/' })
    } else if (row) {
      c.set('user', row.user)
      // Sliding expiry: extend sessions that are past halfway
      if (row.expiresAt.getTime() - now.getTime() < (config.sessionDays / 2) * DAY) {
        const expiresAt = new Date(now.getTime() + config.sessionDays * DAY)
        await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.id))
        setCookie(c, COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: config.isProduction, path: '/', expires: expiresAt })
      }
      // When they were last here, and from which address (for IP bans; erased after LAST_IP_DAYS)
      const ip = clientIp(c)
      if (ip !== row.user.lastIp || !row.user.lastSeenAt || now.getTime() - row.user.lastSeenAt.getTime() > SEEN_THROTTLE_MS) {
        await db.update(users).set({ lastSeenAt: now, lastIp: ip }).where(eq(users.id, row.user.id))
        // Back after a while: automations for "Lid komt online" (loaded here, not at the top, as this file is imported almost everywhere)
        const away = row.user.lastSeenAt ? now.getTime() - row.user.lastSeenAt.getTime() : Infinity
        if (away >= 5 * 60_000) void import('./automations').then((a) => a.automationEvent('online', { member: row.user, awayMs: away }))
      }
    } else {
      deleteCookie(c, COOKIE, { path: '/' })
    }
  }
  await next()
})

export function requireUser(c: Context<AppEnv>): User {
  const user = c.get('user')
  if (!user) throw new HttpError(401, 'Je moet ingelogd zijn.')
  return user
}

/** The message when a member who isn't approved (or hasn't confirmed their address) tries to post. */
export const unverifiedMessage = () =>
  signupApproval()
    ? 'Je aanmelding wacht nog op goedkeuring door de beheerder. Zodra je bent goedgekeurd, kun je dit ook.'
    : 'Bevestig eerst je e-mailadres. Klik op de link in de mail die we je stuurden, of vraag een nieuwe aan bovenaan de pagina.'

/**
 * Logged in and approved by the admin (or, without the waitlist, with a
 * confirmed e-mail address). Everything other members get to
 * see (posts, messages, uploads) needs this; browsing, your own profile,
 * friends and games don't.
 */
export function requireVerified(c: Context<AppEnv>): User {
  const user = requireUser(c)
  if (!user.emailVerifiedAt) throw new HttpError(403, unverifiedMessage(), undefined, 'unverified')
  // The quiet mode (Beheer → Rustige stand): new accounts wait a few days before posting or sending
  // anything; telling the admin something (Probleem melden, Melden) always works
  const q = quiet()
  if (q && q.minAgeDays > 0 && user.forumRole !== 'admin' && !user.isBot && !/^\/api\/(suggestions|reports)/.test(c.req.path)) {
    const days = (Date.now() - user.createdAt.getTime()) / DAY
    if (days < q.minAgeDays)
      throw new HttpError(403, `Kuddes staat even in de rustige stand: nieuwe accounts kunnen de eerste ${q.minAgeDays} dagen nog niets plaatsen of sturen. Nog even geduld!`)
  }
  return user
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  // Last addresses are only kept for a while after the last visit
  await db
    .update(users)
    .set({ lastIp: null })
    .where(and(isNotNull(users.lastIp), lt(users.lastSeenAt, new Date(Date.now() - LAST_IP_DAYS * DAY))))
}

/** Whether this request comes from the admin's session (the admin is never locked out by an IP ban). */
export async function isAdminSession(c: Context) {
  const token = getCookie(c, COOKIE)
  if (!token) return false
  const [row] = await db
    .select({ role: users.forumRole })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return row?.role === 'admin'
}
