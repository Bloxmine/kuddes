import { randomBytes } from 'node:crypto'
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm'
import type { VideoSummary } from '../../shared/api'
import type { VideoCategory } from '../../shared/videos'
import { db } from '../db/client'
import { users, videoRatings, videos, type User } from '../db/schema'
import { toSummary, uploadUrl, type SummaryRow } from './serialize'
import { acceptedFriendsOf, summaryColumns } from './users'

type VideoRow = typeof videos.$inferSelect

/** 11 characters like a YouTube id: 64^11 is plenty to be unguessable. */
export const newPublicId = () => randomBytes(9).toString('base64url').slice(0, 11)

export const ratingAvg = sql<number>`(select coalesce(avg(${videoRatings.stars}), 0)::float from ${videoRatings} where ${videoRatings.videoId} = ${videos.id})`
export const ratingCount = sql<number>`(select count(*)::int from ${videoRatings} where ${videoRatings.videoId} = ${videos.id})`

/**
 * Which videos a viewer may see. In lists and search only public ones (and
 * friends-only ones of friends); with the link also "verborgen" ones. The
 * uploader always sees their own, even while it's processing.
 */
export function videoVisibleTo(viewer: User | null, where: 'lijst' | 'link'): SQL {
  const ready = eq(videos.status, 'klaar')
  const open = where === 'link' ? inArray(videos.visibility, ['openbaar', 'verborgen']) : eq(videos.visibility, 'openbaar')
  if (!viewer) return and(ready, open)!
  return or(
    eq(videos.userId, viewer.id),
    and(ready, or(open, and(eq(videos.visibility, 'vrienden'), inArray(videos.userId, acceptedFriendsOf(viewer.id))))),
  )!
}

export const videoSelection = { video: videos, user: summaryColumns, rating: ratingAvg, ratingCount }

/** A select of videos with their uploader and rating, for lists. */
export const selectVideos = () => db.select(videoSelection).from(videos).innerJoin(users, eq(users.id, videos.userId))

const plain = (text: string) =>
  text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*|~~|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)

export function toVideoSummary(row: { video: VideoRow; user: SummaryRow; rating: number; ratingCount: number }): VideoSummary {
  const v = row.video
  return {
    id: v.publicId,
    title: v.title,
    codec: v.codec,
    thumbUrl: uploadUrl(v.thumbPath),
    duration: v.duration,
    views: v.views,
    rating: Math.round(Number(row.rating) * 10) / 10,
    ratingCount: Number(row.ratingCount),
    category: v.category as VideoCategory,
    tags: v.tags,
    visibility: v.visibility,
    status: v.status,
    createdAt: v.createdAt.toISOString(),
    user: toSummary(row.user),
    snippet: plain(v.description),
  }
}

/**
 * "Gerelateerde video's": shared tags count most, then the same category and
 * the same uploader, with a little help from views and stars.
 */
export function relatedScore(video: Pick<VideoRow, 'tags' | 'category' | 'userId'>) {
  const tags = video.tags.length ? video.tags : ['']
  const tagArray = sql`array[${sql.join(
    tags.map((t) => sql`${t}`),
    sql`, `,
  )}]::text[]`
  return sql<number>`(
    3 * cardinality(array(select unnest(${videos.tags}) intersect select unnest(${tagArray})))
    + case when ${videos.category} = ${video.category} then 2 else 0 end
    + case when ${videos.userId} = ${video.userId} then 1 else 0 end
    + ln(${videos.views} + 1) * 0.3
    + ${ratingAvg} * 0.2
  )`
}
