import { eq } from 'drizzle-orm'
import { withDefaults } from '../../shared/customization'
import type { FriendshipState } from '../../shared/api'
import { db } from '../db/client'
import { friendships, type User } from '../db/schema'
import { recordActivity } from './activities'
import { friendAccepted, friendRequested } from './federation/outbox'
import { acceptedFriendIds, friendshipBetween, friendshipState } from './users'

/** A friend request from `me`, or accepting the one `other` already sent: for members and bots alike. */
export async function befriend(me: User, other: User): Promise<FriendshipState> {
  const existing = await friendshipBetween(me.id, other.id)
  if (!existing) {
    await db.insert(friendships).values({ requesterId: me.id, addresseeId: other.id }).onConflictDoNothing()
    friendRequested(me, other)
  } else if (existing.status === 'pending' && existing.addresseeId === me.id) {
    await db.transaction(async (tx) => {
      await tx.update(friendships).set({ status: 'accepted', respondedAt: new Date() }).where(eq(friendships.id, existing.id))
      await recordActivity({ type: 'friendship', actorId: me.id, targetUserId: other.id, friendshipId: existing.id }, tx)
    })
    friendAccepted(me, other)
  }
  return friendshipState(me.id, other.id)
}

/**
 * Why `sender` may not send `recipient` a friend request (their privacy
 * setting), or null. Accepting a request they sent is always fine.
 */
export async function friendRequestRefusal(sender: User, recipient: User): Promise<string | null> {
  if (sender.forumRole === 'admin') return null
  const existing = await friendshipBetween(sender.id, recipient.id)
  if (existing) return null
  const setting = withDefaults(recipient.preferences).friendRequestsFrom
  if (setting === 'niemand') return `${recipient.nickname} ontvangt geen vriendschapsverzoeken.`
  if (setting === 'vriendenvanvrienden') {
    const [mine, theirs] = await Promise.all([acceptedFriendIds(sender.id), acceptedFriendIds(recipient.id)])
    const set = new Set(theirs)
    if (!mine.some((id) => set.has(id))) return `${recipient.nickname} ontvangt alleen vriendschapsverzoeken van vrienden van vrienden.`
  }
  return null
}
