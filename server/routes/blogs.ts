/**
 * Blogs (shared/blogs.ts): write, change and remove your own; read everyone's
 * (members only), "vrienden" blogs only as the writer's friend. A blog is also
 * a timeline item, which holds its respect and reactions.
 */
import { and, count, desc, eq, inArray, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { GadgetBlog, Page } from '../../shared/api'
import type { GadgetConfig } from '../../shared/gadgets'
import { BLOG_LIMITS, blogImage, blogSnippet, type Blog, type BlogSummary } from '../../shared/blogs'
import { db } from '../db/client'
import { activities, activityComments, activityRespects, blogs, users, type User } from '../db/schema'
import { checkSoon } from '../lib/achievements'
import { loadSocial, recordActivity } from '../lib/activities'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { toSummary } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, storeImage } from '../lib/uploads'
import { acceptedFriendsOf, findUser, summaryColumns } from '../lib/users'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'

const PAGE_SIZE = 12

/** Pictures in a blog: uploaded for blogs, by the writer themselves. */
const BLOG_PICTURE = /\/uploads\/blogs\/(\d+)-[0-9a-f]{32}\.webp/g

const blogSchema = z.object({
  title: z.string().trim().min(3, 'Geef je blog een titel.').max(BLOG_LIMITS.title, `De titel mag maximaal ${BLOG_LIMITS.title} tekens hebben.`),
  body: z.string().trim().min(20, 'Schrijf iets meer: minstens 20 tekens.').max(BLOG_LIMITS.body, `Een blog mag maximaal ${BLOG_LIMITS.body.toLocaleString('nl-NL')} tekens hebben.`),
  visibility: z.enum(['iedereen', 'vrienden']),
})

/** The blogs a member may read: everyone's open ones, their own, and their friends'. */
export function readableBy(viewer: User | null): SQL {
  // Hidden after reports: only the writer still sees it, until the admin looked
  if (!viewer) return and(eq(blogs.visibility, 'iedereen'), notHidden('blog', blogs.id))!
  return or(
    eq(blogs.userId, viewer.id),
    and(or(eq(blogs.visibility, 'iedereen'), inArray(blogs.userId, acceptedFriendsOf(viewer.id))), notHidden('blog', blogs.id)),
  )!
}

const selectBlogs = () =>
  db
    .select({
      blog: blogs,
      user: summaryColumns,
      activityId: activities.id,
      respectCount: sql<number>`(select count(*)::int from ${activityRespects} r where r.activity_id = ${activities.id})`,
      commentCount: sql<number>`(select count(*)::int from ${activityComments} c where c.activity_id = ${activities.id})`,
    })
    .from(blogs)
    .innerJoin(users, eq(users.id, blogs.userId))
    .leftJoin(activities, eq(activities.blogId, blogs.id))

type Row = Awaited<ReturnType<ReturnType<typeof selectBlogs>['where']>>[number]

const toBlogSummary = (r: Row): BlogSummary => ({
  id: r.blog.id,
  title: r.blog.title,
  snippet: blogSnippet(r.blog.body),
  imageUrl: blogImage(r.blog.body),
  visibility: r.blog.visibility,
  author: toSummary(r.user),
  createdAt: r.blog.createdAt.toISOString(),
  views: r.blog.views,
  respectCount: Number(r.respectCount ?? 0),
  commentCount: Number(r.commentCount ?? 0),
})

/** The Blog gadget: the owner's newest blogs (and the one they put on top) as this viewer may read them. */
export async function gadgetBlogs(userId: number, cfg: GadgetConfig['blog'], viewer: User | null): Promise<GadgetBlog> {
  const mine = and(eq(blogs.userId, userId), readableBy(viewer))
  const [[totals], rows, featured] = await Promise.all([
    db
      .select({
        n: count(),
        views: sql<number>`coalesce(sum(${blogs.views}), 0)::int`,
        respect: sql<number>`(select count(*)::int from ${activityRespects} r join ${activities} a on a.id = r.activity_id where a.blog_id in (select id from ${blogs} where ${blogs.userId} = ${userId}))`,
      })
      .from(blogs)
      .where(mine),
    selectBlogs()
      .where(and(mine, cfg.featured ? ne(blogs.id, cfg.featured) : undefined))
      .orderBy(desc(blogs.id))
      .limit(Math.min(10, cfg.count)),
    cfg.featured ? selectBlogs().where(and(mine, eq(blogs.id, cfg.featured))) : Promise.resolve([]),
  ])
  return {
    total: totals?.n ?? 0,
    views: Number(totals?.views ?? 0),
    respect: Number(totals?.respect ?? 0),
    featured: featured[0] ? toBlogSummary(featured[0]) : null,
    items: rows.map(toBlogSummary),
  }
}

async function blogFor(id: number, viewer: User): Promise<Blog> {
  const [row] = await selectBlogs().where(and(eq(blogs.id, id), readableBy(viewer), sql`${users.blockedAt} is null`))
  if (!row) throw notFound('Deze blog bestaat niet (meer), of is alleen voor vrienden.')
  // Every blog has its timeline item; one from before that is made now
  const activityId = row.activityId ?? (await recordActivity({ type: 'blog', actorId: row.blog.userId, blogId: row.blog.id, visibility: row.blog.visibility, createdAt: row.blog.createdAt }))
  const social = (await loadSocial([activityId], viewer)).get(activityId)!
  return { ...toBlogSummary(row), body: row.blog.body, updatedAt: row.blog.updatedAt.toISOString(), mine: row.blog.userId === viewer.id, social }
}

/** Only your own blog pictures. */
function checkPictures(body: string, userId: number) {
  for (const m of body.matchAll(BLOG_PICTURE)) if (m[1] !== String(userId)) throw new HttpError(400, 'Je kunt alleen je eigen afbeeldingen gebruiken.')
}

async function ownBlog(id: number, me: User) {
  const [blog] = await db.select().from(blogs).where(eq(blogs.id, id))
  if (!blog) throw notFound('Deze blog bestaat niet (meer).')
  // The beheerder can take any blog down
  if (blog.userId !== me.id && me.forumRole !== 'admin') throw new HttpError(403, 'Dit is niet jouw blog.')
  return blog
}

export const blogRoutes = new Hono<AppEnv>()
  // The newest blogs, or a member's (?van=username)
  .get('/blogs', async (c) => {
    const me = requireUser(c)
    const before = Number(c.req.query('before')) || null
    const limit = Math.min(30, Number(c.req.query('limit')) || PAGE_SIZE)
    const author = c.req.query('van')
    const writer = author ? await findUser(author) : null
    if (author && !writer) throw notFound('Dit lid bestaat niet.')
    const rows = await selectBlogs()
      .where(and(readableBy(me), sql`${users.blockedAt} is null`, writer ? eq(blogs.userId, writer.id) : undefined, before ? lt(blogs.id, before) : undefined))
      .orderBy(desc(blogs.id))
      .limit(limit + 1)
    const page = rows.slice(0, limit)
    return c.json({ items: page.map(toBlogSummary), nextCursor: rows.length > limit ? page[page.length - 1].blog.id : null } satisfies Page<BlogSummary>)
  })

  .get('/blogs/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const id = Number(c.req.param('id'))
    const blog = await blogFor(id, me)
    // Read by someone else: one more view
    if (!blog.mine) {
      await db.update(blogs).set({ views: sql`${blogs.views} + 1` }).where(eq(blogs.id, id))
      blog.views++
    }
    return c.json(blog)
  })

  .post('/blogs', rateLimit('blogs', 20, 24 * 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const input = parse(blogSchema, await c.req.json().catch(() => null))
    checkPictures(input.body, me.id)
    const blog = await db.transaction(async (tx) => {
      const [row] = await tx.insert(blogs).values({ userId: me.id, ...input }).returning()
      await recordActivity({ type: 'blog', actorId: me.id, blogId: row.id, visibility: input.visibility }, tx)
      return row
    })
    checkSoon(me.id)
    checkPost({ author: me, place: 'blog', text: `${input.title}\n${input.body}`, link: `/blogs/${blog.id}` })
    return c.json(await blogFor(blog.id, me), 201)
  })

  .patch('/blogs/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const blog = await ownBlog(Number(c.req.param('id')), me)
    const input = parse(blogSchema, await c.req.json().catch(() => null))
    checkPictures(input.body, blog.userId)
    await db.update(blogs).set({ ...input, updatedAt: new Date() }).where(eq(blogs.id, blog.id))
    // Who sees it on the timeline changes along
    await db.update(activities).set({ visibility: input.visibility }).where(eq(activities.blogId, blog.id))
    return c.json(await blogFor(blog.id, me))
  })

  .delete('/blogs/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const blog = await ownBlog(Number(c.req.param('id')), me)
    await db.delete(blogs).where(eq(blogs.id, blog.id))
    return c.json({ ok: true })
  })

  // A picture for in a blog
  .post(
    '/blogs/images',
    rateLimit('blogfotos', 60, 60 * 60 * 1000),
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
      },
    }),
    async (c) => {
      const me = requireVerified(c)
      const body = await c.req.parseBody()
      const stored = await storeImage(body.file, 'blogs', `${me.id}-`)
      return c.json({ url: `/uploads/${stored.path}` }, 201)
    },
  )
