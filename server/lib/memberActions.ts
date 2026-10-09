/**
 * What the admin can do to a member, for Beheer and for automations
 * (server/lib/automations.ts) alike: block, put on the blacklist, ban their
 * connection, log them out, give or take rights. Logging is up to the caller.
 */
import { and, eq } from 'drizzle-orm'
import { IP_BAN_DURATIONS, type IpBanDuration, type IpBanScope } from '../../shared/ipBans'
import type { AutoRight } from '../../shared/automations'
import { db } from '../db/client'
import { adminLog, blacklist, ipBans, sessions, users, videoUploadRequests, type User } from '../db/schema'
import { cleanValue, forgetBlacklist, stored } from './blacklist'
import { forgetIpBans, formatRange, parseRange } from './ipBans'
import { stop as stopRadio } from './radioLive'

/** Blocked: logged out everywhere, off the air, and kept out until unblocked. */
export async function blockMember(user: User, reason: string) {
  await db
    .update(users)
    .set({ blockedAt: new Date(), blockReason: reason || null })
    .where(eq(users.id, user.id))
  stopRadio(user.id)
  await db.delete(sessions).where(eq(sessions.userId, user.id))
}

/** Blocked, and their address and name on the blacklist, so they can't come back with a new account. */
export async function blacklistMember(user: User, reason: string) {
  if (!user.blockedAt) await blockMember(user, reason)
  await db
    .insert(blacklist)
    .values([
      { kind: 'email' as const, ...(await stored('email', cleanValue('email', user.email))), reason },
      { kind: 'gebruikersnaam' as const, ...(await stored('gebruikersnaam', cleanValue('gebruikersnaam', user.username))), reason },
    ])
    .onConflictDoNothing()
  forgetBlacklist()
}

/** A ban on the address a member last used (an IPv6 address with its /64); the banned range, or null without an address. */
export async function banMemberIp(user: User, duration: IpBanDuration, scope: IpBanScope, reason: string) {
  if (!user.lastIp) return null
  const net = parseRange(user.lastIp)
  if (typeof net === 'string') return null
  const days = IP_BAN_DURATIONS[duration].days
  const [row] = await db
    .insert(ipBans)
    .values({ range: formatRange(net), scope, reason, expiresAt: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null })
    .returning()
  forgetIpBans()
  return row.range
}

export async function logOutEverywhere(user: User) {
  await db.delete(sessions).where(eq(sessions.userId, user.id))
}

const RIGHT_COLUMN = { video: 'videoUploadAllowed', muziek: 'musicUploadAllowed', radio: 'radioAllowed' } as const

/** Upload or radio rights on or off; an open request for them is answered by this too. */
export async function setRight(user: User, right: AutoRight, allowed: boolean, handledById: number | null) {
  await db
    .update(users)
    .set({ [RIGHT_COLUMN[right]]: allowed })
    .where(eq(users.id, user.id))
  await db
    .update(videoUploadRequests)
    .set({ status: allowed ? 'goedgekeurd' : 'afgewezen', handledAt: new Date(), handledById })
    .where(and(eq(videoUploadRequests.userId, user.id), eq(videoUploadRequests.status, 'open'), eq(videoUploadRequests.kind, right)))
  // Rights taken away: off the air too
  if (right === 'radio' && !allowed) stopRadio(user.id)
}

/** A line in the Logboek; `adminId` null for what an automation did. */
export async function logAction(adminId: number | null, action: string, target = '', details = '') {
  await db.insert(adminLog).values({ adminId, action, target, details })
}
