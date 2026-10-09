import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { glitters, kuddePhotos, kuddePosts, kuddes, musicPages, photos, radioSounds, radioStations, tracks, users, type User } from '../db/schema'
import { stop as stopRadio } from './radioLive'
import { accountDeleted } from './federation/outbox'
import { removeVideosOf } from '../routes/videos'
import { removeBackgroundsOf, removeUpload, removeUploadsOf } from './uploads'

/**
 * Deletes a member with everything they posted (the database cascades) and
 * their files: avatar, photos, videos, backgrounds, recipe photos and glitterplaatjes. Kuddes they started
 * stay, without a creator.
 */
export async function deleteAccount(user: User) {
  // Their friends' servers hear it while the account (and its key) still exists
  await accountDeleted(user)
  const ownPhotos = (await db.select({ path: photos.path, original: photos.originalPath }).from(photos).where(eq(photos.userId, user.id))).flatMap((p) => [{ path: p.path }, { path: p.original }])
  const ownGlitters = await db.select({ path: glitters.path }).from(glitters).where(eq(glitters.userId, user.id))
  const ownKuddePhotos = await db.select({ path: kuddePhotos.path }).from(kuddePhotos).where(eq(kuddePhotos.userId, user.id))
  await removeVideosOf(user.id)
  // Their songs, covers, music banner and channel banner
  const ownTracks = (await db.select({ audio: tracks.audioPath, cover: tracks.coverPath }).from(tracks).where(eq(tracks.userId, user.id))).flatMap((t) => [{ path: t.audio }, { path: t.cover }])
  const musicPictures = await db.select({ banner: musicPages.bannerPath, avatar: musicPages.avatarPath }).from(musicPages).where(eq(musicPages.userId, user.id))
  const musicBanners = musicPictures.flatMap((p) => [{ path: p.banner }, { path: p.avatar }])
  // Off the air, and their radio banner and sound buttons
  stopRadio(user.id)
  const [station] = await db.select({ path: radioStations.bannerPath }).from(radioStations).where(eq(radioStations.userId, user.id))
  const ownSounds = await db.select({ path: radioSounds.path }).from(radioSounds).where(eq(radioSounds.userId, user.id))
  // Their Prikbord posts go; posts they wrote as a Kudde stay with the Kudde
  const ownPosts = await db.delete(kuddePosts).where(and(eq(kuddePosts.userId, user.id), eq(kuddePosts.asKudde, false))).returning({ path: kuddePosts.photoPath })
  await Promise.all(ownPosts.map((p) => removeUpload(p.path)))
  // Kuddes they designed keep their colours, but not the member's background images
  await db.execute(sql`update ${kuddes} set design = design - 'image' where design->'image'->>'url' like ${`/uploads/backgrounds/${user.id}-%`}`)
  await db.delete(users).where(eq(users.id, user.id))
  // Group chats nobody is left in go too
  await db.execute(sql`delete from messenger_groups g where not exists (select 1 from messenger_group_members m where m.group_id = g.id)`)
  await Promise.all([removeUpload(user.avatarPath), removeUpload(user.channelBannerPath), ...musicBanners.map((b) => removeUpload(b.path)), removeUpload(station?.path ?? null), ...[...ownPhotos, ...ownGlitters, ...ownKuddePhotos, ...ownTracks, ...ownSounds].map((p) => removeUpload(p.path)), removeBackgroundsOf(user.id), removeUploadsOf('recipes', user.id), removeUploadsOf('blogs', user.id)])
}
