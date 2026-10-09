import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { PICKABLE_ICONS } from '../../shared/icons'
import { KUDDE_POST_LIMITS, KUDDE_RESPECTERS_SHOWN, type KuddePost, type KuddePostPage } from '../../shared/kuddePosts'
import { db } from '../db/client'
import { glitters, kuddeMembers, kuddePhotos, kuddePollVotes, kuddePostReplies, kuddePostRespects, kuddePosts, kuddes, users, type User } from '../db/schema'
import { notify, notifyMentions, unnotify } from '../lib/notifications'
import { glitterImage } from '../lib/glitters'
import { HttpError, notFound, parse } from '../lib/errors'
import { rightsOf } from '../lib/kuddes'
import { rateLimit } from '../lib/rateLimit'
import { toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { summaryColumns } from '../lib/users'
import { checkSoon } from '../lib/achievements'
import { checkPost } from '../lib/moderation'
import { notHidden } from '../lib/reports'

type KuddeRow = typeof kuddes.$inferSelect
type PostRow = typeof kuddePosts.$inferSelect
/** The viewer's role in the Kudde and what they may do in running it. */
type Role = Awaited<ReturnType<typeof rightsOf>>

const isAdmin = (u: User | null) => u?.forumRole === 'admin'
const isMember = (role: Role | null) => role?.role === 'owner' || role?.role === 'member'
const may = (role: Role | null, right: 'prikbord' | 'namens') => !!role?.rights.includes(right)

async function findKudde(slug: string) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, slug)).limit(1)
  if (!kudde) throw notFound('Deze Kudde bestaat niet.')
  return kudde
}

/** A post with its Kudde and the viewer's role there. */
async function findPost(id: number, viewer: User) {
  const [row] = Number.isInteger(id) ? await db.select({ post: kuddePosts, kudde: kuddes }).from(kuddePosts).innerJoin(kuddes, eq(kuddes.id, kuddePosts.kuddeId)).where(eq(kuddePosts.id, id)) : []
  if (!row) throw notFound('Dit bericht bestaat niet (meer).')
  return { ...row, role: await rightsOf(row.kudde.id, viewer.id) }
}

/** A closed Kudde's Prikbord is for its members only. */
function mayRead(kudde: KuddeRow, role: Role | null, viewer: User | null) {
  return kudde.visibility === 'openbaar' || isMember(role) || isAdmin(viewer)
}

/** Who of `ids` may read the Prikbord: everyone for an open Kudde, the members of a closed one. */
async function readersOf(kudde: KuddeRow, ids: number[]) {
  if (kudde.visibility === 'openbaar' || !ids.length) return ids
  const rows = await db
    .select({ id: kuddeMembers.userId })
    .from(kuddeMembers)
    .where(and(eq(kuddeMembers.kuddeId, kudde.id), inArray(kuddeMembers.userId, ids), inArray(kuddeMembers.role, ['owner', 'member'])))
  return rows.map((r) => r.id)
}

function mustBeMember(role: Role) {
  if (!isMember(role)) throw new HttpError(403, 'Word eerst lid van deze Kudde.')
}

async function toPosts(rows: PostRow[], viewer: User | null, role: Role | null): Promise<KuddePost[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const authorIds = [...new Set(rows.map((r) => r.userId).filter((x): x is number => x !== null))]
  const pollIds = rows.filter((r) => r.poll).map((r) => r.id)
  const glitterIds = [...new Set(rows.map((r) => r.glitterId).filter((x): x is number => x !== null))]
  const photoIds = [...new Set(rows.map((r) => r.kuddePhotoId).filter((x): x is number => x !== null))]
  // The latest few who gave respect, per post
  const ranked = db
    .select({
      postId: kuddePostRespects.postId,
      userId: kuddePostRespects.userId,
      place: sql<number>`row_number() over (partition by ${kuddePostRespects.postId} order by ${kuddePostRespects.createdAt} desc)`.as('place'),
    })
    .from(kuddePostRespects)
    .where(inArray(kuddePostRespects.postId, ids))
    .as('ranked')
  const [authors, replies, tallies, mine, glitterRows, photoRows, respectRows, myRespect, respecterRows] = await Promise.all([
    authorIds.length ? db.select(summaryColumns).from(users).where(inArray(users.id, authorIds)) : Promise.resolve([]),
    db.select({ reply: kuddePostReplies, user: summaryColumns }).from(kuddePostReplies).innerJoin(users, eq(users.id, kuddePostReplies.userId)).where(inArray(kuddePostReplies.postId, ids)).orderBy(kuddePostReplies.id),
    pollIds.length
      ? db.select({ postId: kuddePollVotes.postId, option: kuddePollVotes.option, n: count() }).from(kuddePollVotes).where(inArray(kuddePollVotes.postId, pollIds)).groupBy(kuddePollVotes.postId, kuddePollVotes.option)
      : Promise.resolve([]),
    pollIds.length && viewer
      ? db.select({ postId: kuddePollVotes.postId, option: kuddePollVotes.option }).from(kuddePollVotes).where(and(inArray(kuddePollVotes.postId, pollIds), eq(kuddePollVotes.userId, viewer.id)))
      : Promise.resolve([]),
    glitterIds.length ? db.select().from(glitters).where(inArray(glitters.id, glitterIds)) : Promise.resolve([]),
    photoIds.length ? db.select({ id: kuddePhotos.id, path: kuddePhotos.path }).from(kuddePhotos).where(inArray(kuddePhotos.id, photoIds)) : Promise.resolve([]),
    db.select({ postId: kuddePostRespects.postId, n: count() }).from(kuddePostRespects).where(inArray(kuddePostRespects.postId, ids)).groupBy(kuddePostRespects.postId),
    viewer ? db.select({ postId: kuddePostRespects.postId }).from(kuddePostRespects).where(and(inArray(kuddePostRespects.postId, ids), eq(kuddePostRespects.userId, viewer.id))) : Promise.resolve([]),
    db
      .select({ postId: ranked.postId, user: summaryColumns })
      .from(ranked)
      .innerJoin(users, eq(users.id, ranked.userId))
      .where(and(lte(ranked.place, KUDDE_RESPECTERS_SHOWN), isNull(users.blockedAt)))
      .orderBy(asc(ranked.place)),
  ])
  const owner = may(role, 'prikbord')
  const speaks = may(role, 'namens')
  return rows.map((p) => {
    const author = authors.find((a) => a.id === p.userId)
    const counts = p.poll ? p.poll.options.map((_, i) => tallies.find((t) => t.postId === p.id && t.option === i)?.n ?? 0) : []
    const own = !!viewer && viewer.id === p.userId
    return {
      id: p.id,
      // A post as the Kudde speaks for the Kudde: only who may speak for it sees who wrote it
      author: author && (!p.asKudde || speaks || isAdmin(viewer)) ? toSummary(author) : null,
      asKudde: p.asKudde,
      icon: p.icon,
      text: p.text,
      photoUrl: uploadUrl(photoRows.find((r) => r.id === p.kuddePhotoId)?.path ?? p.photoPath),
      glitter: glitterImage(glitterRows.find((g) => g.id === p.glitterId) ?? null),
      poll: p.poll ? { ...p.poll, counts, total: counts.reduce((a, b) => a + b, 0), myVote: mine.find((m) => m.postId === p.id)?.option ?? null } : null,
      replies: replies
        .filter((r) => r.reply.postId === p.id)
        .map((r) => ({ id: r.reply.id, user: toSummary(r.user), text: r.reply.text, createdAt: r.reply.createdAt.toISOString(), canDelete: !!viewer && (viewer.id === r.reply.userId || owner || isAdmin(viewer)) })),
      canDelete: own || owner || isAdmin(viewer),
      canClose: !!p.poll && ((own && !p.asKudde) || (p.asKudde && speaks) || isAdmin(viewer)),
      pinned: !!p.pinnedAt,
      canPin: owner || isAdmin(viewer),
      respect: respectRows.find((r) => r.postId === p.id)?.n ?? 0,
      respecters: respecterRows.filter((r) => r.postId === p.id).map((r) => toSummary(r.user)),
      respected: myRespect.some((r) => r.postId === p.id),
      // Not for your own post (a post as the Kudde is the Kudde's, so its owner can't either)
      canRespect: !!viewer && !own,
      createdAt: p.createdAt.toISOString(),
    }
  })
}

async function onePost(id: number, viewer: User) {
  const { post, role } = await findPost(id, viewer)
  const [p] = await toPosts([post], viewer, role)
  return p
}

const text = (max: number, label: string) => z.string().trim().max(max, `${label} mag maximaal ${max} tekens hebben.`)
const pollSchema = z.object({
  question: text(KUDDE_POST_LIMITS.question, 'De vraag').min(1, 'Stel een vraag voor je poll.'),
  options: z
    .array(text(KUDDE_POST_LIMITS.option, 'Een antwoord'))
    .transform((o) => o.filter(Boolean))
    .pipe(z.array(z.string()).min(2, 'Een poll heeft minstens 2 antwoorden.').max(KUDDE_POST_LIMITS.options, `Maximaal ${KUDDE_POST_LIMITS.options} antwoorden.`)),
})
const postSchema = z.object({
  text: text(KUDDE_POST_LIMITS.text, 'Je bericht'),
  asKudde: z.boolean(),
  poll: pollSchema.nullable(),
  glitterId: z.number().int().positive().nullable(),
  kuddePhotoId: z.number().int().positive().nullable(),
  icon: z.enum(PICKABLE_ICONS).nullable(),
})

/** The poll arrives as JSON in the form; anything else fails validation. */
function jsonOrInvalid(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return 'ongeldig'
  }
}

export const kuddePostRoutes = new Hono<AppEnv>()
  .get('/kuddes/:slug/posts', async (c) => {
    const viewer = c.get('user')
    const kudde = await findKudde(c.req.param('slug'))
    const role = viewer ? await rightsOf(kudde.id, viewer.id) : null
    if (!mayRead(kudde, role, viewer)) throw new HttpError(403, 'Alleen leden kunnen het prikbord van deze besloten Kudde lezen.')
    const before = Number(c.req.query('voor')) || null
    // The pinned post comes on top of the first page, and isn't in the list itself
    const [rows, pinnedRows] = await Promise.all([
      db
        .select()
        .from(kuddePosts)
        .where(and(eq(kuddePosts.kuddeId, kudde.id), isNull(kuddePosts.pinnedAt), before ? lt(kuddePosts.id, before) : undefined, notHidden('kudde', kuddePosts.id)))
        .orderBy(desc(kuddePosts.id))
        .limit(KUDDE_POST_LIMITS.perPage + 1),
      before ? Promise.resolve([]) : db.select().from(kuddePosts).where(and(eq(kuddePosts.kuddeId, kudde.id), isNotNull(kuddePosts.pinnedAt), notHidden('kudde', kuddePosts.id))).orderBy(desc(kuddePosts.pinnedAt)).limit(1),
    ])
    const page = rows.slice(0, KUDDE_POST_LIMITS.perPage)
    const [pinned = null] = await toPosts(pinnedRows, viewer, role)
    const result: KuddePostPage = { items: await toPosts(page, viewer, role), nextCursor: rows.length > page.length ? page[page.length - 1].id : null, pinned }
    return c.json(result)
  })

  // Text and/or a photo and/or a poll; the owner may post as the Kudde
  .post(
    '/kuddes/:slug/posts',
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: () => { throw new HttpError(413, 'Die foto is te groot (max 8 MB).') } }),
    rateLimit('prikbord', 40, 60 * 60 * 1000),
    async (c) => {
      const me = requireVerified(c)
      const kudde = await findKudde(c.req.param('slug'))
      const role = await rightsOf(kudde.id, me.id)
      mustBeMember(role)
      const body = await c.req.parseBody()
      const input = parse(postSchema, {
        text: typeof body.text === 'string' ? body.text : '',
        asKudde: body.asKudde === 'true',
        glitterId: typeof body.glitterId === 'string' && body.glitterId ? Number(body.glitterId) : null,
        kuddePhotoId: typeof body.kuddePhotoId === 'string' && body.kuddePhotoId ? Number(body.kuddePhotoId) : null,
        poll: typeof body.poll === 'string' && body.poll ? jsonOrInvalid(body.poll) : null,
        icon: typeof body.icon === 'string' && body.icon ? body.icon : null,
      })
      if (input.asKudde && !may(role, 'namens')) throw new HttpError(403, 'Alleen de beheerders kunnen namens de Kudde posten.')
      const file = body.file instanceof File && body.file.size > 0 ? body.file : null
      // A photo from the Kudde's own Foto's box
      const [albumPhoto] = input.kuddePhotoId ? await db.select().from(kuddePhotos).where(and(eq(kuddePhotos.id, input.kuddePhotoId), eq(kuddePhotos.kuddeId, kudde.id))) : []
      if (input.kuddePhotoId && !albumPhoto) throw new HttpError(400, "Deze foto staat niet (meer) bij de foto's van deze Kudde.")
      if (!input.text && !file && !albumPhoto && !input.poll && !input.glitterId) throw new HttpError(400, 'Schrijf iets, kies een foto of glitterplaatje, of maak een poll.')
      const [glitter] = input.glitterId ? await db.select().from(glitters).where(eq(glitters.id, input.glitterId)) : []
      if (input.glitterId && !glitter) throw new HttpError(400, 'Dit glitterplaatje bestaat niet (meer).')
      const photo = file && !albumPhoto ? await storeImage(file, 'posts') : null
      const [row] = await db
        .insert(kuddePosts)
        .values({ kuddeId: kudde.id, userId: me.id, asKudde: input.asKudde, icon: input.icon, text: input.text, photoPath: photo?.path ?? null, kuddePhotoId: albumPhoto?.id ?? null, glitterId: glitter?.id ?? null, poll: input.poll ? { ...input.poll, closed: false } : null })
        .returning()
      if (glitter) await db.update(glitters).set({ uses: sql`${glitters.uses} + 1` }).where(eq(glitters.id, glitter.id))
      const [post] = await toPosts([row], me, role)
      checkSoon(me.id)
      if (input.text) checkPost({ author: me, place: 'kudde', text: input.text, link: `/kuddes/${kudde.slug}` })
      await notifyMentions({
        text: input.text,
        actorId: me.id,
        ref: `kudde-post:${row.id}`,
        message: `noemde je op het prikbord van ${kudde.name}`,
        link: `/kuddes/${kudde.slug}`,
        canSee: (ids) => readersOf(kudde, ids),
      })
      return c.json(post, 201)
    },
  )

  .delete('/kudde-posts/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const { post, role } = await findPost(Number(c.req.param('id')), me)
    if (post.userId !== me.id && !may(role, 'prikbord') && !isAdmin(me)) throw new HttpError(403, 'Dit is niet jouw bericht.')
    await db.delete(kuddePosts).where(eq(kuddePosts.id, post.id))
    await removeUpload(post.photoPath)
    await unnotify(`kudde-post:${post.id}`)
    return c.body(null, 204)
  })

  // The owner pins one post above the rest (pinning another replaces it)
  .post('/kudde-posts/:id{[0-9]+}/pin', async (c) => {
    const me = requireUser(c)
    const { post, role } = await findPost(Number(c.req.param('id')), me)
    if (!may(role, 'prikbord') && !isAdmin(me)) throw new HttpError(403, 'Alleen de beheerders van de Kudde kunnen berichten vastpinnen.')
    const { pinned } = parse(z.object({ pinned: z.boolean() }), await c.req.json().catch(() => null))
    await db.transaction(async (tx) => {
      if (pinned) await tx.update(kuddePosts).set({ pinnedAt: null }).where(and(eq(kuddePosts.kuddeId, post.kuddeId), ne(kuddePosts.id, post.id)))
      await tx.update(kuddePosts).set({ pinnedAt: pinned ? new Date() : null }).where(eq(kuddePosts.id, post.id))
    })
    return c.json(await onePost(post.id, me))
  })

  // One vote per member; voting again changes it
  .post('/kudde-posts/:id{[0-9]+}/vote', rateLimit('stemmen', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { post, role } = await findPost(Number(c.req.param('id')), me)
    mustBeMember(role)
    if (!post.poll) throw new HttpError(400, 'Dit bericht heeft geen poll.')
    if (post.poll.closed) throw new HttpError(400, 'Deze poll is gesloten.')
    const { option } = parse(z.object({ option: z.number().int().min(0).max(post.poll.options.length - 1) }), await c.req.json().catch(() => null))
    await db.insert(kuddePollVotes).values({ postId: post.id, userId: me.id, option }).onConflictDoUpdate({ target: [kuddePollVotes.postId, kuddePollVotes.userId], set: { option } })
    checkSoon(me.id)
    return c.json(await onePost(post.id, me))
  })

  .post('/kudde-posts/:id{[0-9]+}/close', async (c) => {
    const me = requireUser(c)
    const { post, role } = await findPost(Number(c.req.param('id')), me)
    const [p] = await toPosts([post], me, role)
    if (!p.canClose || !post.poll) throw new HttpError(403, 'Je kunt deze poll niet sluiten.')
    await db.update(kuddePosts).set({ poll: { ...post.poll, closed: true } }).where(eq(kuddePosts.id, post.id))
    return c.json(await onePost(post.id, me))
  })

  // Respect for a post: anyone who can read the Prikbord, not for your own
  .post('/kudde-posts/:id{[0-9]+}/respect', rateLimit('respect', 300, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const { post, kudde, role } = await findPost(Number(c.req.param('id')), me)
    if (!mayRead(kudde, role, me)) throw new HttpError(403, 'Alleen leden kunnen het prikbord van deze besloten Kudde lezen.')
    if (post.userId === me.id) throw new HttpError(400, 'Je kunt je eigen bericht geen respect geven.')
    await db.insert(kuddePostRespects).values({ postId: post.id, userId: me.id }).onConflictDoNothing()
    return c.json(await onePost(post.id, me))
  })

  .delete('/kudde-posts/:id{[0-9]+}/respect', async (c) => {
    const me = requireUser(c)
    const { post } = await findPost(Number(c.req.param('id')), me)
    await db.delete(kuddePostRespects).where(and(eq(kuddePostRespects.postId, post.id), eq(kuddePostRespects.userId, me.id)))
    return c.json(await onePost(post.id, me))
  })

  .post('/kudde-posts/:id{[0-9]+}/replies', rateLimit('reacties', 120, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const { post, kudde, role } = await findPost(Number(c.req.param('id')), me)
    mustBeMember(role)
    const input = parse(z.object({ text: text(KUDDE_POST_LIMITS.reply, 'Je reactie').min(1, 'Schrijf een reactie.') }), await c.req.json().catch(() => null))
    const [reply] = await db.insert(kuddePostReplies).values({ postId: post.id, userId: me.id, text: input.text }).returning({ id: kuddePostReplies.id })
    checkSoon(me.id)
    // Whoever wrote the post hears about it, and who's mentioned in the reaction
    const ref = `kudde-post:${post.id}/reply:${reply.id}`
    const link = `/kuddes/${kudde.slug}`
    if (post.userId) await notify({ userIds: [post.userId], actorId: me.id, kind: 'reactie', ref, message: `reageerde op je bericht op het prikbord van ${kudde.name}`, text: input.text, link })
    await notifyMentions({
      text: input.text,
      actorId: me.id,
      ref,
      message: `noemde je in een reactie op het prikbord van ${kudde.name}`,
      link,
      canSee: async (ids) => (await readersOf(kudde, ids)).filter((id) => id !== post.userId),
    })
    return c.json(await onePost(post.id, me), 201)
  })

  .delete('/kudde-replies/:id{[0-9]+}', async (c) => {
    const me = requireUser(c)
    const [reply] = await db.select().from(kuddePostReplies).where(eq(kuddePostReplies.id, Number(c.req.param('id'))))
    if (!reply) throw notFound('Deze reactie bestaat niet (meer).')
    const { role } = await findPost(reply.postId, me)
    if (reply.userId !== me.id && !may(role, 'prikbord') && !isAdmin(me)) throw new HttpError(403, 'Dit is niet jouw reactie.')
    await db.delete(kuddePostReplies).where(eq(kuddePostReplies.id, reply.id))
    await unnotify(`kudde-post:${reply.postId}/reply:${reply.id}`)
    return c.json(await onePost(reply.postId, me))
  })
