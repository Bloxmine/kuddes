/**
 * Communities on other servers (Lemmy, PieFed and the like, ActivityPub
 * Groups) as Kuddes here. The Group gets an account here like any actor, and
 * a Kudde that points at it. Joining the Kudde follows the community; what the
 * community announces comes in as posts on the Prikbord (its posts, Pages)
 * and replies under them (comments, Notes). These Kuddes are read-only here.
 */
import { and, count, eq } from 'drizzle-orm'
import { KUDDE_POST_LIMITS } from '../../../shared/kuddePosts'
import { db } from '../../db/client'
import { kuddeMembers, kuddePostReplies, kuddePosts, kuddes, remoteFollows, users, type User } from '../../db/schema'
import { removeUpload, storeImage } from '../uploads'
import { CONTEXT, PUBLIC, remoteOf, resolveActor, type Remote } from './actors'
import { enqueue } from './deliver'
import { cleanLine, cleanName, htmlToText, textToHtml } from './content'
import { fetchImage, fetchJson, safeFetch } from './http'
import { ids, instanceSigningKey, localId } from './keys'
import { followChanged } from './outbox'
import { mayFederateWith } from './servers'

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)
const idOf = (v: unknown) => str(v) ?? (v && typeof v === 'object' ? str((v as Json).id) : null)
const link = (v: unknown): string | null => {
  if (Array.isArray(v)) return link(v[0])
  if (v && typeof v === 'object') return str((v as Json).url) ?? str((v as Json).href)
  return str(v)
}

/** The Kudde of a Group account here, or null when it isn't one. */
export async function kuddeOfGroup(groupUserId: number) {
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.remoteActorId, groupUserId))
  return kudde ?? null
}

/** A name for the Kudde that no other Kudde has yet ("Technology", else "Technology (lemmy.world)"). */
async function freeName(title: string, domain: string, ownId: number | null) {
  for (const candidate of [title, `${title} (${domain})`, `${title} (${domain}, ${Date.now().toString(36)})`]) {
    const [taken] = await db.select({ id: kuddes.id }).from(kuddes).where(eq(kuddes.name, candidate))
    if (!taken || taken.id === ownId) return candidate.slice(0, 80)
  }
  return title
}

/** The Kudde for a community (made the first time, its name, text and picture brought up to date after that). */
export async function kuddeForGroup(remote: Remote, json: Json, iconChanged = false) {
  const domain = remote.user.domain!
  const handle = remote.user.username.split('@')[0]
  const existing = await kuddeOfGroup(remote.user.id)
  const title = (typeof json.name === 'string' ? cleanName(json.name) : '') || handle
  const description = htmlToText(str(json.summary) ?? '').slice(0, 1000)
  const values = {
    name: await freeName(title, domain, existing?.id ?? null),
    description,
    remoteDomain: domain,
    remoteName: handle,
    remoteUrl: str(json.url) ?? remote.actor.uri,
  }
  // The community's icon is the Kudde's picture: fetched when it's new or changed (or failed before)
  let picture: string | null = existing?.imagePath ?? null
  const icon = link(json.icon)
  if (icon && (!existing?.imagePath || iconChanged)) {
    try {
      picture = (await storeImage(new File([new Uint8Array(await fetchImage(icon))], 'kudde'), 'kuddes', 'fed-')).path
      if (existing?.imagePath) await removeUpload(existing.imagePath)
    } catch {
      // Without a (new) picture then; tried again with the next update
    }
  }
  if (existing) {
    await db
      .update(kuddes)
      .set({ ...values, imagePath: picture })
      .where(eq(kuddes.id, existing.id))
    return existing.slug
  }
  // The slug: the community's name and server, like the address it has there
  const slug = `${handle}-${domain}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  await db
    .insert(kuddes)
    .values({ ...values, slug, imagePath: picture, category: 'groepen', subcategory: 'Overig', visibility: 'openbaar', remoteActorId: remote.user.id })
    .onConflictDoNothing()
  return slug
}

/** Whether anyone here is in this community's Kudde (only then is what it sends kept). */
async function hasMembers(kuddeId: number) {
  const [{ n }] = await db.select({ n: count() }).from(kuddeMembers).where(eq(kuddeMembers.kuddeId, kuddeId))
  return n > 0
}

/**
 * The object of something the community announces: as it came along when it's
 * from the community's own server, else fetched from where it lives (the
 * community only passes on what others wrote).
 */
async function trusted(object: unknown, group: Remote): Promise<Json | null> {
  const id = idOf(object)
  if (!id) return null
  const groupHost = new URL(group.actor.uri).host
  const host = new URL(id).host
  if (!(await mayFederateWith(host))) return null
  if (object && typeof object === 'object' && host === groupHost) return object as Json
  try {
    const { json, url } = await fetchJson(id, await instanceSigningKey())
    return idOf(json.id) === id && new URL(url).host === host ? json : null
  } catch {
    return null
  }
}

/** Who wrote it: an account here for its author (on their own server). */
async function authorOf(object: Json) {
  const uri = idOf(object.attributedTo)
  if (!uri || new URL(uri).host !== new URL(idOf(object.id)!).host) return null
  return resolveActor(uri).catch(() => null)
}

/** A post's text: its title in bold, the text, and the link it's about. */
function postText(page: Json) {
  const title = cleanLine(page.name, 200)
  const body = htmlToText(str(page.content) ?? '')
  const url = (Array.isArray(page.attachment) ? page.attachment : [page.attachment])
    .map((a) => (a && typeof a === 'object' && (a as Json).type === 'Link' ? str((a as Json).href) : null))
    .find((u) => u && /^https?:\/\//.test(u))
  return [title && `**${title}**`, body, url].filter(Boolean).join('\n\n').slice(0, KUDDE_POST_LIMITS.text)
}

async function storePost(page: Json, kuddeId: number, update: boolean) {
  const id = idOf(page.id)!
  const [known] = await db.select().from(kuddePosts).where(eq(kuddePosts.apId, id))
  if (known && !update) return
  const author = await authorOf(page)
  if (!author) return
  const text = postText(page)
  if (known) {
    if (known.userId === author.user.id) await db.update(kuddePosts).set({ text }).where(eq(kuddePosts.id, known.id))
    return
  }
  // Its picture, stored here (a link post's preview, or the picture itself)
  let photoPath: string | null = null
  const image = link(page.image) ?? (Array.isArray(page.attachment) ? link((page.attachment as Json[]).find((a) => a?.type === 'Image')) : null)
  if (image && page.sensitive !== true) {
    try {
      photoPath = (await storeImage(new File([new Uint8Array(await fetchImage(image))], 'post'), 'posts', 'fed-')).path
    } catch {
      // The post without its picture
    }
  }
  const published = new Date(str(page.published) ?? '')
  await db
    .insert(kuddePosts)
    .values({ kuddeId, userId: author.user.id, text, photoPath, apId: id, createdAt: Number.isNaN(published.getTime()) || published > new Date() ? new Date() : published })
    .onConflictDoNothing()
}

/** A comment: under the post it belongs to (a reply to a comment goes under the same post). */
async function storeReply(note: Json, kuddeId: number) {
  const id = idOf(note.id)!
  const [known] = await db.select({ id: kuddePostReplies.id }).from(kuddePostReplies).where(eq(kuddePostReplies.apId, id))
  if (known) return
  const parent = idOf(note.inReplyTo)
  if (!parent) return
  const [post] = await db
    .select({ id: kuddePosts.id })
    .from(kuddePosts)
    .where(and(eq(kuddePosts.apId, parent), eq(kuddePosts.kuddeId, kuddeId)))
  const [parentReply] = post ? [] : await db.select({ postId: kuddePostReplies.postId }).from(kuddePostReplies).where(eq(kuddePostReplies.apId, parent))
  const postId = post?.id ?? parentReply?.postId
  if (!postId) return
  const author = await authorOf(note)
  const text = htmlToText(str(note.content) ?? '')
  if (!author || !text) return
  const short = text.length > KUDDE_POST_LIMITS.reply ? `${text.slice(0, KUDDE_POST_LIMITS.reply - 1)}…` : text
  await db.insert(kuddePostReplies).values({ postId, userId: author.user.id, text: short, apId: id }).onConflictDoNothing()
}

/** Something the community announces: a new or edited post or comment, or one that's gone. */
export async function onGroupAnnounce(object: unknown, group: Remote) {
  const kudde = await kuddeOfGroup(group.user.id)
  if (!kudde || !(await hasMembers(kudde.id))) return
  // The announced activity, as it came or from the community
  let act = object && typeof object === 'object' ? (object as Json) : null
  if (!act && idOf(object)) act = await fetchJson(idOf(object)!, await instanceSigningKey()).then((r) => r.json).catch(() => null)
  if (!act) return
  await handleGroupActivity(act, group, kudde.id)
}

async function handleGroupActivity(act: Json, group: Remote, kuddeId: number) {
  const type = str(act.type)
  if (type === 'Create' || type === 'Update') {
    const object = await trusted(act.object, group)
    if (!object) return
    if (object.type === 'Page' || (object.type === 'Note' && !object.inReplyTo) || object.type === 'Article') return storePost(object, kuddeId, type === 'Update')
    if (object.type === 'Note' && type === 'Create') return storeReply(object, kuddeId)
    return
  }
  if (type === 'Delete' || type === 'Remove') {
    const id = idOf(act.object)
    if (!id) return
    // Gone there (by its writer, or a moderator of the community): gone here
    const [post] = await db
      .delete(kuddePosts)
      .where(and(eq(kuddePosts.apId, id), eq(kuddePosts.kuddeId, kuddeId)))
      .returning({ photoPath: kuddePosts.photoPath })
    if (post) return removeUpload(post.photoPath)
    await db.delete(kuddePostReplies).where(eq(kuddePostReplies.apId, id))
  }
}

/** The community's newest posts, for its Kudde when the first member joins (its outbox has the announcements). */
export async function fetchGroupPosts(group: Remote) {
  const kudde = await kuddeOfGroup(group.user.id)
  if (!kudde) return
  const [any] = await db.select({ id: kuddePosts.id }).from(kuddePosts).where(eq(kuddePosts.kuddeId, kudde.id)).limit(1)
  if (any) return
  const key = await instanceSigningKey()
  const outbox = str((await fetchJson(group.actor.uri, key)).json.outbox)
  if (!outbox || new URL(outbox).host !== new URL(group.actor.uri).host) return
  let page = (await fetchJson(outbox, key)).json
  if (!Array.isArray(page.orderedItems) && page.first) page = typeof page.first === 'string' ? (await fetchJson(page.first, key)).json : (page.first as Json)
  const items = (Array.isArray(page.orderedItems) ? page.orderedItems : [])
    .map((a) => (a && typeof a === 'object' && (a as Json).type === 'Announce' ? (a as Json).object : a))
    .filter((a): a is Json => !!a && typeof a === 'object' && (a as Json).type === 'Create')
    .slice(0, 15)
    .reverse()
  for (const act of items) await handleGroupActivity(act, group, kudde.id).catch(() => {})
}

/** Joining or leaving a community's Kudde follows or unfollows the community (the Follow goes out as the member). */
export async function groupMembershipChanged(member: User, kudde: typeof kuddes.$inferSelect, joined: boolean) {
  if (!kudde.remoteActorId) return
  const [group] = await db.select().from(users).where(eq(users.id, kudde.remoteActorId))
  if (!group) return
  if (joined) {
    const [row] = await db.insert(remoteFollows).values({ followerId: member.id, targetId: group.id }).onConflictDoNothing().returning()
    if (!row) return
    followChanged(member, group)
    const remote = await remoteOf(group.id)
    if (remote)
      void fetchGroupPosts(remote)
        .then(() => syncCommunity(kudde.id))
        .catch((e) => console.error('[federatie] community:', e))
  } else {
    const [row] = await db
      .delete(remoteFollows)
      .where(and(eq(remoteFollows.followerId, member.id), eq(remoteFollows.targetId, group.id)))
      .returning()
    if (row) followChanged(member, group, true)
  }
}

// ---------------------------------------------------------------- replying from here

/** A member's reply in a community's Kudde as a comment there: a Note in reply to the post, for the community. */
export async function replyNote(replyId: number) {
  const [row] = await db
    .select({ reply: kuddePostReplies, post: kuddePosts, kudde: kuddes, member: users })
    .from(kuddePostReplies)
    .innerJoin(kuddePosts, eq(kuddePosts.id, kuddePostReplies.postId))
    .innerJoin(kuddes, eq(kuddes.id, kuddePosts.kuddeId))
    .innerJoin(users, eq(users.id, kuddePostReplies.userId))
    .where(eq(kuddePostReplies.id, replyId))
  if (!row?.kudde.remoteActorId || !row.post.apId || row.member.domain) return null
  const group = await remoteOf(row.kudde.remoteActorId)
  const author = row.post.userId ? await remoteOf(row.post.userId) : null
  if (!group) return null
  const actor = ids.actor(row.member.username)
  return {
    note: {
      id: ids.kuddeReply(row.reply.id),
      type: 'Note',
      attributedTo: actor,
      content: textToHtml(row.reply.text),
      mediaType: 'text/html',
      source: { content: row.reply.text, mediaType: 'text/markdown' },
      inReplyTo: row.post.apId,
      published: row.reply.createdAt.toISOString(),
      to: [PUBLIC],
      cc: [group.actor.uri, ...(author ? [author.actor.uri] : [])],
      audience: group.actor.uri,
    },
    member: row.member,
    // The community passes it on to everyone there; the post's writer hears it straight away too
    inboxes: [group.actor.sharedInbox ?? group.actor.inbox, ...(author ? [author.actor.sharedInbox ?? author.actor.inbox] : [])],
  }
}

/** A reply written here in a community's Kudde goes to the community. */
export async function sendGroupReply(replyId: number) {
  const found = await replyNote(replyId)
  if (!found) return
  const { note, member, inboxes } = found
  await enqueue(inboxes, { '@context': CONTEXT, id: `${note.id}/create`, type: 'Create', actor: note.attributedTo, object: note, to: note.to, cc: note.cc, audience: note.audience }, member.id)
}

/** A reply written here is deleted: the community hears it (call before the row goes). */
export async function removeGroupReply(replyId: number) {
  const found = await replyNote(replyId)
  if (!found) return
  const { note, member, inboxes } = found
  await enqueue(inboxes, { '@context': CONTEXT, id: `${note.id}#delete`, type: 'Delete', actor: note.attributedTo, object: { id: note.id, type: 'Tombstone' }, to: note.to, cc: note.cc, audience: note.audience }, member.id)
}

// ---------------------------------------------------------------- keeping up through the API

const synced = new Map<number, number>()

/**
 * What the community has that didn't come in by itself: the comments that were
 * there before anyone here joined, and posts that were missed. Read from
 * Lemmy's public API (also on PieFed), at most every ten minutes per Kudde.
 */
export async function syncCommunity(kuddeId: number) {
  if (Date.now() - (synced.get(kuddeId) ?? 0) < 10 * 60 * 1000) return
  synced.set(kuddeId, Date.now())
  const [kudde] = await db.select().from(kuddes).where(eq(kuddes.id, kuddeId))
  if (!kudde?.remoteActorId || !kudde.remoteName || !(await hasMembers(kudde.id))) return
  const group = await remoteOf(kudde.remoteActorId)
  if (!group) return
  const origin = new URL(group.actor.uri).origin
  const getJson = async (path: string) => {
    const { res, body } = await safeFetch(origin + path, { headers: { Accept: 'application/json' } })
    return res.ok ? (JSON.parse(body) as Json) : null
  }
  const listed = await getJson(`/api/v3/post/list?community_name=${encodeURIComponent(kudde.remoteName)}&sort=New&limit=20`).catch(() => null)
  const posts = (Array.isArray(listed?.posts) ? listed.posts : []) as Json[]
  for (const item of posts.slice(0, 20).reverse()) {
    const post = item.post as Json | undefined
    const apId = str(post?.ap_id)
    const apiId = post?.id
    if (!apId || post?.deleted || post?.removed) continue
    let [mine] = await db.select({ id: kuddePosts.id }).from(kuddePosts).where(eq(kuddePosts.apId, apId))
    // A post that never came in: fetched from its own server
    if (!mine) {
      const object = await trusted(apId, group)
      if (object && (object.type === 'Page' || object.type === 'Note' || object.type === 'Article')) await storePost(object, kudde.id, false).catch(() => {})
      ;[mine] = await db.select({ id: kuddePosts.id }).from(kuddePosts).where(eq(kuddePosts.apId, apId))
      if (!mine) continue
    }
    const comments = Number((item.counts as Json | undefined)?.comments ?? 0)
    const [{ n }] = await db.select({ n: count() }).from(kuddePostReplies).where(eq(kuddePostReplies.postId, mine.id))
    if (!comments || n >= comments) continue
    const thread = await getJson(`/api/v3/comment/list?post_id=${apiId}&sort=Old&limit=50&max_depth=8&type_=All`).catch(() => null)
    for (const entry of ((Array.isArray(thread?.comments) ? thread.comments : []) as Json[]).slice(0, 40)) {
      const comment = entry.comment as Json | undefined
      const creator = entry.creator as Json | undefined
      const id = str(comment?.ap_id)
      const authorUri = str(creator?.actor_id)
      if (!id || !authorUri || comment?.deleted || comment?.removed || localId(id)) continue
      const [known] = await db.select({ id: kuddePostReplies.id }).from(kuddePostReplies).where(eq(kuddePostReplies.apId, id))
      if (known || !(await mayFederateWith(new URL(authorUri).host))) continue
      const author = await resolveActor(authorUri).catch(() => null)
      // The API gives Markdown, which reads fine as it is, apart from pictures: those become their link
      const text = htmlToText(str(comment?.content) ?? '').replace(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g, '$1')
      if (!author || !text) continue
      const short = text.length > KUDDE_POST_LIMITS.reply ? `${text.slice(0, KUDDE_POST_LIMITS.reply - 1)}…` : text
      const published = new Date(str(comment?.published) ?? '')
      await db
        .insert(kuddePostReplies)
        .values({ postId: mine.id, userId: author.user.id, text: short, apId: id, createdAt: Number.isNaN(published.getTime()) ? new Date() : published })
        .onConflictDoNothing()
    }
  }
}
