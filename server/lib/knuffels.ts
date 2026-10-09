import { eq, sql } from 'drizzle-orm'
import { withDefaults } from '../../shared/customization'
import { db } from '../db/client'
import { glitters, knuffels, type User } from '../db/schema'
import { recordActivity } from './activities'
import { notify } from './notifications'
import { knuffelCreated } from './federation/outbox'
import { friendshipState } from './users'

/** Why `author` can't put a knuffel on `profile` (only friends, when the member wants that), or null. */
export async function knuffelRefusal(author: User, profile: User): Promise<string | null> {
  if (profile.id === author.id || withDefaults(profile.preferences).knuffelsFrom !== 'vrienden') return null
  return (await friendshipState(author.id, profile.id)) === 'friends' ? null : `Alleen vrienden van ${profile.nickname} kunnen knuffelen.`
}

/** A knuffel on a profile, in the timeline and as a notification: for members and bots alike. */
export async function createKnuffel(author: User, profile: User, text: string, glitter: typeof glitters.$inferSelect | null = null) {
  const knuffel = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(knuffels)
      .values({ profileId: profile.id, authorId: author.id, text, glitterId: glitter?.id ?? null })
      .returning()
    if (glitter)
      await tx
        .update(glitters)
        .set({ uses: sql`${glitters.uses} + 1` })
        .where(eq(glitters.id, glitter.id))
    await recordActivity({ type: 'knuffel', actorId: author.id, targetUserId: profile.id, knuffelId: created.id }, tx)
    return created
  })
  knuffelCreated(knuffel, author, profile)
  await notify({
    userIds: [profile.id],
    actorId: author.id,
    kind: 'knuffel',
    ref: `knuffel:${knuffel.id}`,
    message: glitter && !text ? 'heeft je een glitterplaatje gestuurd' : 'heeft een knuffel op je profiel gezet',
    text,
    link: `/profiel/${profile.username}?tab=knuffels`,
  })
  return knuffel
}
