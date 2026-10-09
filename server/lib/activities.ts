import { and, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import { tracksByIds } from '../routes/music'
import type { Device, Page, Social, StatusCore, TimelineItem, UserSummary } from '../../shared/api'
import { blogImage, blogSnippet } from '../../shared/blogs'
import type { GlitterImage } from '../../shared/glitters'
import { db } from '../db/client'
import { toMediaSummary } from './mediaShelf'
import {
  glitters,
  activities,
  activityComments,
  activityRespects,
  kuddes,
  kuddePhotos,
  knuffels,
  statusPhotos,
  photos,
  recipes,
  blogs,
  mediaItems,
  mediaReviews,
  statuses,
  statusPollVotes,
  users,
  videos,
  type User,
} from '../db/schema'
import { kuddeColumns, toKudde } from './kuddes'
import { selectVideos, toVideoSummary, videoVisibleTo } from './videos'
import { toPhoto } from './photos'
import { glitterImage, glittersFor } from './glitters'
import { toSummary, uploadUrl, type SummaryRow } from './serialize'
import { kuddePhotoHref } from '../../shared/kuddes'
import { acceptedFriendsOf, summaryColumns } from './users'
import { notHidden } from './reports'

type Executor = Pick<typeof db, 'insert'>

/** How many respecters and reactions to send with each item. */
const RECENT_RESPECTERS = 6
const COMMENTS_PER_ITEM = 50

/** Records something a member did, so it shows up on the timeline. */
export async function recordActivity(values: typeof activities.$inferInsert, executor: Executor = db) {
  const [row] = await executor.insert(activities).values(values).returning({ id: activities.id })
  return row.id
}

/**
 * Which timeline items a viewer may see: everything shared with "iedereen",
 * plus friends-only items from themselves and their friends.
 */
export function visibleTo(viewer: User | null): SQL {
  const everyone = eq(activities.visibility, 'iedereen')
  if (!viewer) return everyone
  return or(everyone, eq(activities.actorId, viewer.id), inArray(activities.actorId, acceptedFriendsOf(viewer.id)))!
}

/** Respect and reactions for a batch of timeline items. */
export async function loadSocial(activityIds: number[], viewer: User | null): Promise<Map<number, Social>> {
  const result = new Map<number, Social>()
  if (!activityIds.length) return result

  const [respectRows, commentRows] = await Promise.all([
    db
      .select({ activityId: activityRespects.activityId, createdAt: activityRespects.createdAt, user: summaryColumns })
      .from(activityRespects)
      .innerJoin(users, eq(users.id, activityRespects.userId))
      .where(inArray(activityRespects.activityId, activityIds))
      .orderBy(desc(activityRespects.createdAt)),
    db
      .select({ comment: activityComments, user: summaryColumns })
      .from(activityComments)
      .innerJoin(users, eq(users.id, activityComments.userId))
      .where(and(inArray(activityComments.activityId, activityIds), notHidden('reactie', activityComments.id)))
      .orderBy(activityComments.id),
  ])
  const ownerOf = new Map(
    (await db.select({ id: activities.id, actorId: activities.actorId }).from(activities).where(inArray(activities.id, activityIds))).map(
      (r) => [r.id, r.actorId],
    ),
  )

  for (const id of activityIds) {
    const respecters = respectRows.filter((r) => r.activityId === id)
    const comments = commentRows.filter((r) => r.comment.activityId === id)
    result.set(id, {
      activityId: id,
      respect: {
        count: respecters.length,
        respected: !!viewer && respecters.some((r) => r.user.id === viewer.id),
        recent: respecters.slice(0, RECENT_RESPECTERS).map((r) => toSummary(r.user)),
      },
      comments: comments.slice(-COMMENTS_PER_ITEM).map(({ comment, user }) => ({
        id: comment.id,
        user: toSummary(user),
        text: comment.text,
        createdAt: comment.createdAt.toISOString(),
        // The commenter, or the owner of the item, can remove a reaction
        canDelete: !!viewer && (viewer.id === comment.userId || viewer.id === ownerOf.get(id)),
      })),
      commentCount: comments.length,
    })
  }
  return result
}

type StatusRow = typeof statuses.$inferSelect
type PhotoRow = typeof photos.$inferSelect

type KuddePhotoRow = { photo: typeof kuddePhotos.$inferSelect; kudde: { slug: string; name: string } }

type StatusPhotoRow = { photo: PhotoRow | null; kudde: KuddePhotoRow | null }

/**
 * The photos of a page of WieWatWaars, in order, per status. A Kudde photo
 * comes with its Kudde; a Kudde that went besloten, or stopped sharing its
 * photos, takes them back.
 */
export async function statusPhotosFor(statusIds: number[]): Promise<Map<number, StatusPhotoRow[]>> {
  const out = new Map<number, StatusPhotoRow[]>()
  if (!statusIds.length) return out
  const rows = await db
    .select({ statusId: statusPhotos.statusId, photo: photos, kuddePhoto: kuddePhotos, kudde: { slug: kuddes.slug, name: kuddes.name, visibility: kuddes.visibility, shareable: kuddes.photosShareable } })
    .from(statusPhotos)
    .leftJoin(photos, eq(photos.id, statusPhotos.photoId))
    .leftJoin(kuddePhotos, eq(kuddePhotos.id, statusPhotos.kuddePhotoId))
    .leftJoin(kuddes, eq(kuddes.id, kuddePhotos.kuddeId))
    .where(inArray(statusPhotos.statusId, [...new Set(statusIds)]))
    .orderBy(statusPhotos.statusId, statusPhotos.position)
  for (const r of rows) {
    const shared = r.kuddePhoto && r.kudde && r.kudde.visibility === 'openbaar' && r.kudde.shareable
    if (!r.photo && !shared) continue
    const list = out.get(r.statusId) ?? []
    list.push({ photo: r.photo, kudde: shared ? { photo: r.kuddePhoto!, kudde: { slug: r.kudde!.slug, name: r.kudde!.name } } : null })
    out.set(r.statusId, list)
  }
  return out
}

export function toStatusCore(
  status: StatusRow,
  user: SummaryRow,
  photoRows: StatusPhotoRow[],
  viewer: User | null,
  glitter: GlitterImage | null = null,
  kudde: { slug: string; name: string; imagePath: string | null } | null = null,
): StatusCore {
  return {
    id: status.id,
    user: toSummary(user),
    text: status.text,
    where: status.where,
    device: status.device as Device | null,
    mood: status.mood,
    icon: status.icon,
    visibility: status.visibility,
    photos: photoRows.map(({ photo, kudde: k }) =>
      photo
        ? { id: photo.id, url: uploadUrl(photo.path)!, width: photo.width, height: photo.height, href: `/profiel/${user.username}?tab=fotos&foto=${photo.id}`, kudde: null }
        : { id: k!.photo.id, url: uploadUrl(k!.photo.path)!, width: k!.photo.width, height: k!.photo.height, href: kuddePhotoHref(k!.kudde.slug, k!.photo.id), kudde: k!.kudde },
    ).concat(
      // A post from another server: its pictures were stored here when it came in
      (status.media ?? []).map((m, i) => ({ id: -(i + 1), url: uploadUrl(m.path)!, width: m.width, height: m.height, href: status.apUrl ?? '', kudde: null, alt: m.alt, external: true })),
    ),
    // The counts are filled in by fillStatusPolls, for a whole page at once
    poll: status.poll ? { ...status.poll, counts: status.poll.options.map(() => 0), total: 0, myVote: null } : null,
    glitter,
    kudde: kudde && status.kuddeId ? { slug: kudde.slug, name: kudde.name, imageUrl: uploadUrl(kudde.imagePath) } : null,
    createdAt: status.createdAt.toISOString(),
    canDelete: viewer?.id === status.userId,
  }
}

/** Adds the results and the viewer's vote to the WieWatWaars with a poll. */
export async function fillStatusPolls(cores: StatusCore[], viewer: User | null) {
  const withPoll = cores.filter((s) => s.poll)
  if (!withPoll.length) return
  const ids = withPoll.map((s) => s.id)
  const [tallies, mine] = await Promise.all([
    db.select({ statusId: statusPollVotes.statusId, option: statusPollVotes.option, n: count() }).from(statusPollVotes).where(inArray(statusPollVotes.statusId, ids)).groupBy(statusPollVotes.statusId, statusPollVotes.option),
    viewer ? db.select({ statusId: statusPollVotes.statusId, option: statusPollVotes.option }).from(statusPollVotes).where(and(inArray(statusPollVotes.statusId, ids), eq(statusPollVotes.userId, viewer.id))) : Promise.resolve([]),
  ])
  for (const s of withPoll) {
    const poll = s.poll!
    poll.counts = poll.options.map((_, i) => tallies.find((t) => t.statusId === s.id && t.option === i)?.n ?? 0)
    poll.total = poll.counts.reduce((a, b) => a + b, 0)
    poll.myVote = mine.find((m) => m.statusId === s.id)?.option ?? null
  }
}

/** Loads one page of timeline items, newest first, with everything needed to render them. */
export async function loadTimeline(where: SQL | undefined, viewer: User | null, limit: number): Promise<Page<TimelineItem>> {
  const rows = await db
    .select()
    .from(activities)
    // Hidden after reports (WieWatWaars, knuffels, blogs): not on anyone's timeline until the admin looked
    .where(
      and(
        visibleTo(viewer),
        where,
        sql`(${activities.statusId} is null or ${notHidden('wiewatwaar', activities.statusId)})`,
        sql`(${activities.knuffelId} is null or ${notHidden('knuffel', activities.knuffelId)})`,
        sql`(${activities.blogId} is null or ${notHidden('blog', activities.blogId)})`,
      ),
    )
    .orderBy(desc(activities.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  if (!page.length) return { items: [], nextCursor: null }

  const ids = (pick: (a: (typeof page)[number]) => number | null) => [...new Set(page.map(pick).filter((x): x is number => x !== null))]
  const userIds = ids((a) => a.actorId).concat(ids((a) => a.targetUserId))
  const statusIds = ids((a) => a.statusId)
  const knuffelIds = ids((a) => a.knuffelId)
  const kuddeIds = ids((a) => a.kuddeId)
  const videoIds = ids((a) => a.videoId)
  const recipeIds = ids((a) => a.recipeId)
  const reviewIds = ids((a) => a.mediaReviewId)
  const blogIds = ids((a) => a.blogId)
  const trackIds = ids((a) => a.trackId)

  const [userRows, statusRows, knuffelRows, kuddeRows, videoRows, recipeRows, reviewRows, blogRows, trackList, social] = await Promise.all([
    db.select({ ...summaryColumns, skin: users.skin, profileColors: users.profileColors }).from(users).where(inArray(users.id, userIds)),
    statusIds.length ? db.select().from(statuses).where(inArray(statuses.id, statusIds)) : Promise.resolve([]),
    knuffelIds.length
      ? db.select({ knuffel: knuffels, glitter: glitters }).from(knuffels).leftJoin(glitters, eq(glitters.id, knuffels.glitterId)).where(inArray(knuffels.id, knuffelIds))
      : Promise.resolve([]),
    kuddeIds.length ? db.select(kuddeColumns).from(kuddes).where(inArray(kuddes.id, kuddeIds)) : Promise.resolve([]),
    // A video that became hidden or friends-only since is left out for those who can't see it now
    videoIds.length ? selectVideos().where(and(inArray(videos.id, videoIds), videoVisibleTo(viewer, 'lijst'))) : Promise.resolve([]),
    recipeIds.length ? db.select().from(recipes).where(inArray(recipes.id, recipeIds)) : Promise.resolve([]),
    reviewIds.length ? db.select({ review: mediaReviews, item: mediaItems }).from(mediaReviews).innerJoin(mediaItems, eq(mediaItems.id, mediaReviews.itemId)).where(inArray(mediaReviews.id, reviewIds)) : Promise.resolve([]),
    blogIds.length ? db.select().from(blogs).where(inArray(blogs.id, blogIds)) : Promise.resolve([]),
    // Only songs that are (still) ready to play
    tracksByIds(trackIds, viewer),
    loadSocial(page.map((a) => a.id), viewer),
  ])
  // Photos of photo items, and the photos and glitterplaatjes with statuses
  const photoIds = [...new Set(ids((a) => a.photoId))]
  const [photoRows, statusPhotoRows, statusGlitters] = await Promise.all([
    photoIds.length ? db.select().from(photos).where(inArray(photos.id, photoIds)) : Promise.resolve([]),
    statusPhotosFor(statusRows.map((s) => s.id)),
    glittersFor(statusRows.map((s) => s.glitterId)),
  ])

  const usersById = new Map(userRows.map((u) => [u.id, u]))
  const summary = (id: number | null): UserSummary | null => {
    const u = id !== null ? usersById.get(id) : undefined
    return u ? toSummary(u) : null
  }

  const items: TimelineItem[] = []
  for (const a of page) {
    const actor = usersById.get(a.actorId)
    if (!actor) continue
    const status = a.statusId !== null ? statusRows.find((s) => s.id === a.statusId) : undefined
    const photo = a.photoId !== null ? photoRows.find((p) => p.id === a.photoId) : undefined
    const knuffelRow = a.knuffelId !== null ? knuffelRows.find((k) => k.knuffel.id === a.knuffelId) : undefined
    const knuffel = knuffelRow?.knuffel
    const kudde = a.kuddeId !== null ? kuddeRows.find((b) => b.id === a.kuddeId) : undefined
    const video = a.videoId !== null ? videoRows.find((v) => v.video.id === a.videoId) : undefined
    if (a.type === 'video' && !video) continue
    const recipe = a.recipeId !== null ? recipeRows.find((r) => r.id === a.recipeId) : undefined
    if (a.type === 'recipe' && !recipe) continue
    const review = a.mediaReviewId !== null ? reviewRows.find((r) => r.review.id === a.mediaReviewId) : undefined
    if (a.type === 'review' && !review) continue
    const blog = a.blogId !== null ? blogRows.find((b) => b.id === a.blogId) : undefined
    if (a.type === 'blog' && !blog) continue
    const track = a.trackId !== null ? trackList.find((t) => t.id === a.trackId) : undefined
    if (a.type === 'track' && !track) continue
    // A photo taken off the photography page is off the timeline as well
    if (a.type === 'photography' && !photo?.inPhotography) continue

    items.push({
      ...social.get(a.id)!,
      id: a.id,
      type: a.type,
      createdAt: a.createdAt.toISOString(),
      actor: { ...toSummary(actor), skin: actor.skin, profileColors: actor.profileColors },
      target: summary(a.targetUserId),
      status: status
        ? toStatusCore(status, actor, statusPhotoRows.get(status.id) ?? [], viewer, (status.glitterId && statusGlitters.get(status.glitterId)) || null, kudde ?? null)
        : null,
      photo: photo ? toPhoto(photo, actor, viewer?.id) : null,
      knuffel: knuffel ? { id: knuffel.id, text: knuffel.text, glitter: glitterImage(knuffelRow?.glitter ?? null) } : null,
      kudde: kudde ? toKudde(kudde) : null,
      video: video ? toVideoSummary(video) : null,
      recipe: recipe
        ? { id: recipe.id, slug: recipe.slug, title: recipe.title, intro: recipe.intro, photoUrl: uploadUrl(recipe.photoPath), minutes: recipe.minutes, servings: recipe.servings }
        : null,
      review: review ? { id: review.review.id, rating: review.review.rating, text: review.review.text, item: toMediaSummary(review.item) } : null,
      blog: blog ? { id: blog.id, title: blog.title, snippet: blogSnippet(blog.body, 280), imageUrl: blogImage(blog.body) } : null,
      track: track ?? null,
      title: a.title,
      canDelete: viewer?.id === a.actorId && (a.type === 'status' || a.type === 'photo'),
    })
  }
  await fillStatusPolls(items.flatMap((i) => (i.status ? [i.status] : [])), viewer)
  return { items, nextCursor: rows.length > limit ? page[page.length - 1].id : null }
}
