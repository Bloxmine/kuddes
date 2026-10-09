import { count, desc, eq, gt, isNull, lte, min, sql, and, isNotNull } from 'drizzle-orm'
import { Hono } from 'hono'
import type { HomeData, NewsDetail, SiteStats } from '../../shared/api'
import { withDefaults } from '../../shared/customization'
import { publishedNews, toNewsItem } from '../lib/news'
import { nowInNederland, smileysToday } from '../lib/pulse'
import { rateLimit } from '../lib/rateLimit'
import { requireUser } from '../lib/session'
import { db } from '../db/client'
import { knuffels, news, newsRespects, statuses, users, type User } from '../db/schema'
import { notFound } from '../lib/errors'
import { ageFrom, ONLINE_WINDOW_MS, toSummary } from '../lib/serialize'
import type { AppEnv } from '../lib/session'
import { summaryColumns } from '../lib/users'
import { HIDDEN_STATUS } from '../../shared/onlineStatus'

const CACHE_MS = 5 * 1000

// "Today" means since midnight in the Netherlands
const startOfDutchDay = sql`(date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam')`

async function loadHome(): Promise<HomeData> {
  const newest = await db
    .select({ ...summaryColumns, birthdate: users.birthdate, preferences: users.preferences })
    .from(users)
    // Members on the waitlist aren't shown until they're approved
    .where(and(isNull(users.blockedAt), isNotNull(users.emailVerifiedAt), isNull(users.domain)))
    .orderBy(desc(users.id))
    .limit(25)
  return {
    news: await publishedNews(10),
    newest: newest.map((u) => ({ ...toSummary(u), age: withDefaults(u.preferences).showAge ? ageFrom(u.birthdate) : null })),
  }
}

async function loadStats(): Promise<SiteStats> {
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS)
  const [[members], [online], [knuffelsToday], [statusesToday]] = await Promise.all([
    db.select({ n: count(), since: min(users.createdAt) }).from(users).where(isNull(users.domain)),
    db
      .select({ n: count() })
      .from(users)
      .where(sql`${gt(users.lastSeenAt, onlineSince)} and ${users.onlineStatus} <> ${HIDDEN_STATUS}`),
    db.select({ n: count() }).from(knuffels).where(sql`${knuffels.createdAt} >= ${startOfDutchDay}`),
    db.select({ n: count() }).from(statuses).where(sql`${statuses.createdAt} >= ${startOfDutchDay}`),
  ])
  return {
    members: members.n,
    online: online.n,
    since: members.since?.toISOString() ?? null,
    knuffelsToday: knuffelsToday.n,
    statusesToday: statusesToday.n,
  }
}

/** Caches a loader briefly; the homepage doesn't need to be exact to the second. */
function cached<T>(load: () => Promise<T>) {
  let value: { data: T; at: number } | null = null
  let pending: Promise<T> | null = null
  return async () => {
    if (value && Date.now() - value.at < CACHE_MS) return value.data
    pending ??= load()
      .then((data) => {
        value = { data, at: Date.now() }
        return data
      })
      .finally(() => {
        pending = null
      })
    return pending
  }
}

const getHome = cached(loadHome)
const getStats = cached(loadStats)

async function findPublishedNews(slug: string) {
  const [row] = await db
    .select()
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.published, true), lte(news.publishedAt, new Date())))
  if (!row) throw notFound('Dit nieuwsbericht bestaat niet.')
  return row
}

/** A post with its respect: how much, whether the viewer gave it, and the latest who did. */
async function newsDetail(slug: string, viewer: User | null | undefined): Promise<NewsDetail> {
  const row = await findPublishedNews(slug)
  const [[{ n }], mine, respecters, [author]] = await Promise.all([
    db.select({ n: count() }).from(newsRespects).where(eq(newsRespects.newsId, row.id)),
    viewer ? db.select({ id: newsRespects.userId }).from(newsRespects).where(and(eq(newsRespects.newsId, row.id), eq(newsRespects.userId, viewer.id))) : Promise.resolve([]),
    db.select({ user: summaryColumns }).from(newsRespects).innerJoin(users, eq(users.id, newsRespects.userId)).where(eq(newsRespects.newsId, row.id)).orderBy(desc(newsRespects.createdAt)).limit(24),
    row.authorId ? db.select(summaryColumns).from(users).where(eq(users.id, row.authorId)) : Promise.resolve([]),
  ])
  return {
    ...toNewsItem(row, n),
    respected: mine.length > 0,
    respecters: respecters.map((r) => toSummary(r.user)),
    author: author ? toSummary(author) : null,
  }
}

export const homeRoutes = new Hono<AppEnv>()
  // The newest members only for members: without an account you don't see who's on Kuddes
  .get('/home', async (c) => {
    const home = await getHome()
    return c.json(c.get('user') ? home : { ...home, newest: [] })
  })
  .get('/stats', async (c) => c.json(await getStats()))
  .get('/news', async (c) => c.json(await publishedNews(50)))
  // What's going on: the smileys of the last 24 hours, and "Nu in Nederland"
  .get('/home/smileys', async (c) => c.json(await smileysToday()))
  .get('/home/nu', async (c) => c.json(await nowInNederland(!!c.get('user'))))
  .get('/news/:slug', async (c) => c.json(await newsDetail(c.req.param('slug'), c.get('user'))))

  // Respect for a news post (and taking it back)
  .post('/news/:slug/respect', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const row = await findPublishedNews(c.req.param('slug'))
    await db.insert(newsRespects).values({ newsId: row.id, userId: me.id }).onConflictDoNothing()
    return c.json(await newsDetail(row.slug, me))
  })
  .delete('/news/:slug/respect', async (c) => {
    const me = requireUser(c)
    const row = await findPublishedNews(c.req.param('slug'))
    await db.delete(newsRespects).where(and(eq(newsRespects.newsId, row.id), eq(newsRespects.userId, me.id)))
    return c.json(await newsDetail(row.slug, me))
  })
