import { and, count, desc, eq, inArray, lte } from 'drizzle-orm'
import type { NewsItem } from '../../shared/api'
import { db } from '../db/client'
import { news, newsRespects } from '../db/schema'
import { uploadUrl } from './serialize'

/** A stored news row as the API sends it. */
export const toNewsItem = (row: typeof news.$inferSelect, respectCount = 0): NewsItem => ({
  slug: row.slug,
  label: row.label,
  title: row.title,
  summary: row.summary,
  body: row.body,
  date: row.publishedAt.toISOString().slice(0, 10),
  bannerUrl: uploadUrl(row.bannerPath),
  respectCount,
})

/** How much respect each post got. */
export async function respectCounts(ids: number[]) {
  if (!ids.length) return new Map<number, number>()
  const rows = await db.select({ id: newsRespects.newsId, n: count() }).from(newsRespects).where(inArray(newsRespects.newsId, ids)).groupBy(newsRespects.newsId)
  return new Map(rows.map((r) => [r.id, r.n]))
}

/** Published news, newest first (scheduled items appear once their time comes). */
export async function publishedNews(limit = 20) {
  const rows = await db
    .select()
    .from(news)
    .where(and(eq(news.published, true), lte(news.publishedAt, new Date())))
    .orderBy(desc(news.publishedAt))
    .limit(limit)
  const counts = await respectCounts(rows.map((r) => r.id))
  return rows.map((r) => toNewsItem(r, counts.get(r.id) ?? 0))
}
