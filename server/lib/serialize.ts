import type { Device, UserSummary } from '../../shared/api'
import type { User } from '../db/schema'
import { HIDDEN_STATUS } from '../../shared/onlineStatus'
import { viewerLoggedIn } from './viewer'

export const ONLINE_WINDOW_MS = 5 * 60 * 1000

/** The columns needed to build a UserSummary, for joins. */
export type SummaryRow = Pick<User, 'id' | 'username' | 'name' | 'nickname' | 'avatarPath' | 'lastSeenAt' | 'onlineStatus'> & { avatarPublic?: boolean; isBot?: boolean }

export const uploadUrl = (path: string | null) => (path ? `/uploads/${path}` : null)

export function isOnline(user: Pick<User, 'lastSeenAt' | 'onlineStatus'>): boolean {
  return (
    user.onlineStatus !== HIDDEN_STATUS &&
    !!user.lastSeenAt &&
    Date.now() - user.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  )
}

/** The profile photo, unless the member hides it from visitors without an account (and this is one). */
export function avatarFor(user: { avatarPath: string | null; avatarPublic?: boolean }): string | null {
  if (user.avatarPublic === false && !viewerLoggedIn()) return null
  return uploadUrl(user.avatarPath)
}

export function toSummary(user: SummaryRow): UserSummary {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    nickname: user.nickname,
    avatarUrl: avatarFor(user),
    online: isOnline(user),
    ...(user.isBot ? { bot: true as const } : {}),
  }
}

export function ageFrom(birthdate: string | null): number | null {
  if (!birthdate) return null
  const born = new Date(birthdate)
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const beforeBirthday =
    now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
  if (beforeBirthday) age--
  return age
}

/** Guesses the "geplaatst via ..." device from the User-Agent, like Hyves did. */
export function deviceFrom(userAgent: string | undefined): Device | null {
  if (!userAgent) return null
  if (/iPhone|iPod/i.test(userAgent)) return 'iphone'
  if (/BlackBerry|BB10/i.test(userAgent)) return 'blackberry'
  if (/Android/i.test(userAgent) && /Mobile/i.test(userAgent)) return 'android'
  if (/Mobile|Opera Mini|IEMobile/i.test(userAgent)) return 'mobiel'
  return null
}
