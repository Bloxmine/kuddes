import { signupApproval } from './siteSettings'
import { pendingAddress } from './emailTokens'
import { isAvatarFrame } from '../../shared/frames'
import { isProfileCursor } from '../../shared/cursors'
import { and, count, eq, or, sql } from 'drizzle-orm'
import type { FriendshipState, Me } from '../../shared/api'
import { withDefaults } from '../../shared/customization'
import { CONSENT_VERSION } from '../../shared/privacy'
import { db } from '../db/client'
import { friendships, relations, users, type User } from '../db/schema'
import { HttpError, notFound } from './errors'
import { unreadCount } from './notifications'
import { toSummary } from './serialize'
import { resolveHandle } from './federation/actors'

/** Columns for joins that only need a UserSummary. */
export const summaryColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  nickname: users.nickname,
  avatarPath: users.avatarPath,
  avatarPublic: users.avatarPublic,
  lastSeenAt: users.lastSeenAt,
  onlineStatus: users.onlineStatus,
  isBot: users.isBot,
}

export async function findUser(username: string): Promise<User> {
  const [user] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1)
  if (user) return user
  // Someone on another server (naam@server.nl) the first time: looked up there
  const remote = username.includes('@') ? await resolveHandle(username) : null
  if (!remote) throw notFound('Dit lid bestaat niet.')
  return remote.user
}

export async function friendshipBetween(a: number, b: number) {
  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
        and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
      ),
    )
    .limit(1)
  return row
}

/**
 * Whether `viewer` may see `user`'s profile and what's on it: everyone, unless
 * the member chose "alleen vrienden" (Instellingen → Privacy). The member and
 * the admin always may.
 */
export async function canSeeProfile(viewer: User | null, user: User) {
  if (withDefaults(user.preferences).profileFor !== 'vrienden') return true
  if (!viewer) return false
  if (viewer.id === user.id || viewer.forumRole === 'admin') return true
  return (await friendshipState(viewer.id, user.id)) === 'friends'
}

/** For the parts of a profile (knuffels, photos, friends…): refused when the profile is for friends only. */
export async function requireProfileAccess(viewer: User | null, user: User) {
  if (!(await canSeeProfile(viewer, user))) throw new HttpError(403, `Het profiel van ${user.nickname} is alleen zichtbaar voor vrienden.`)
}

export async function friendshipState(viewerId: number, otherId: number): Promise<FriendshipState> {
  const row = await friendshipBetween(viewerId, otherId)
  if (!row) return 'none'
  if (row.status === 'accepted') return 'friends'
  return row.requesterId === viewerId ? 'outgoing' : 'incoming'
}

/** Subquery-friendly condition: user `id` is an accepted friend of `userId`. */
export const acceptedFriendsOf = (userId: number) => sql`(
  select case when ${friendships.requesterId} = ${userId} then ${friendships.addresseeId} else ${friendships.requesterId} end
  from ${friendships}
  where ${friendships.status} = 'accepted' and (${friendships.requesterId} = ${userId} or ${friendships.addresseeId} = ${userId})
)`

/** The ids of a member's friends. */
export async function acceptedFriendIds(userId: number) {
  const rows = await db
    .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId })
    .from(friendships)
    .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
  return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId))
}

export async function toMe(user: User): Promise<Me> {
  const [[{ pending }], [{ relationRequests }], unreadNotifications] = await Promise.all([
    db
      .select({ pending: count() })
      .from(friendships)
      .where(and(eq(friendships.addresseeId, user.id), eq(friendships.status, 'pending'))),
    db
      .select({ relationRequests: count() })
      .from(relations)
      .where(and(eq(relations.otherId, user.id), eq(relations.status, 'pending'))),
    unreadCount(user.id),
  ])
  return {
    ...toSummary(user),
    email: user.email,
    gender: user.gender,
    birthdate: user.birthdate,
    city: user.city,
    website: user.website,
    about: user.about,
    brands: user.brands,
    interests: user.interests ?? {},
    gamerTags: user.gamerTags ?? {},
    spots: user.spots,
    music: user.music,
    skin: user.skin,
    avatarFrame: isAvatarFrame(user.avatarFrame) ? user.avatarFrame : null,
    profileCursor: isProfileCursor(user.profileCursor) ? user.profileCursor : null,
    onlineStatus: user.onlineStatus,
    theme: user.theme,
    customTheme: user.customTheme,
    profileColors: user.profileColors,
    profileLayout: user.profileLayout,
    homeLayout: user.homeLayout,
    preferences: withDefaults(user.preferences),
    buddyEnabled: user.buddyEnabled,
    buddyCode: user.buddyCode,
    buddyMood: user.buddyMood,
    pendingFriendRequests: pending,
    pendingRelationRequests: relationRequests,
    unreadNotifications,
    isAdmin: user.forumRole === 'admin',
    emailVerified: !!user.emailVerifiedAt,
    awaitingApproval: !user.emailVerifiedAt && signupApproval(),
    pendingEmail: user.emailVerifiedAt ? await pendingAddress(user.id) : null,
    privacyOutdated: user.privacyVersion !== CONSENT_VERSION,
    sensitiveConsent: !!user.sensitiveConsentAt,
  }
}
