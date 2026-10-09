/**
 * What other servers send: each activity was signed by its actor (checked in
 * server/routes/federation.ts) and is handled here, as the same thing a
 * member here would do. Anything this server doesn't do (yet) is ignored.
 */
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { STATUS_MAX_LENGTH } from '../../../shared/api'
import { MOODS } from '../../../shared/moods'
import { PICKABLE_ICONS } from '../../../shared/icons'
import { REPORT_KINDS, type ReportKind } from '../../../shared/safety'
import { db } from '../../db/client'
import { activities, activityRespects, friendships, knuffels, photos, remoteFollows, respects, statuses, statusPhotos, users, type User } from '../../db/schema'
import { serverInfo } from '../siteSettings'
import { recordActivity } from '../activities'
import { botEvent } from '../bots'
import { befriend, friendRequestRefusal } from '../friends'
import { createKnuffel, knuffelRefusal } from '../knuffels'
import { checkPost } from '../moderation'
import { notify, unnotify } from '../notifications'
import { mayBeFollowed } from './outbox'
import { removeRelationsBetween } from '../relations'
import { report } from '../reports'
import { friendshipBetween } from '../users'
import { CONTEXT, PUBLIC, forgetAccount, resolveActor, type Remote } from './actors'
import { cleanLine, htmlToText } from './content'
import { fetchImage, fetchJson } from './http'
import { recentFromApi, refreshCounts } from './api'
import { kuddeOfGroup, onGroupAnnounce } from './groups'
import { storeImage } from '../uploads'
import { removeMedia } from './actors'
import { enqueue } from './deliver'
import { ids, instanceSigningKey, localId } from './keys'
import { mayFederateWith, policyOf } from './servers'

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : null)
/** An object may come as its id or as the whole thing. */
const idOf = (v: unknown) => str(v) ?? (v && typeof v === 'object' ? str((v as Json).id) : null)
const list = (v: unknown) => (Array.isArray(v) ? v : v == null ? [] : [v])
const isPublic = (o: Json) => [...list(o.to), ...list(o.cc)].some((a) => a === PUBLIC || a === 'as:Public' || a === 'Public')

/** A member of this server by an id of theirs (actor or profile page); not dummies, the blocked or those still waiting. */
async function localMember(uri: string | null) {
  const local = uri ? localId(uri) : null
  if (local?.kind !== 'actor') return null
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, local.username), isNull(users.domain)))
  return user && !user.blockedAt && !user.isDummy && user.emailVerifiedAt ? user : null
}

/** Handle one activity from `from` (its signature already checked). */
export async function handleActivity(act: Json, from: Remote) {
  const type = str(act.type)
  const object = act.object
  switch (type) {
    case 'Follow':
      return onFollow(idOf(act.id), idOf(object), from, act.friendship === true || act['weide:friendship'] === true)
    case 'Accept':
      return onAccept(object, from)
    case 'Reject':
      return onEndFollow(object, from)
    case 'Undo': {
      const inner = object && typeof object === 'object' ? (object as Json) : null
      if (inner?.type === 'Like') return onLike(idOf(inner.object), from, true)
      if (inner?.type === 'Announce') return onUnboost(idOf(inner.object), from)
      return onEndFollow(object, from)
    }
    case 'Create':
      if (object && typeof object === 'object') return onCreate(object as Json, from)
      return
    case 'Update':
      return onUpdate(object, from)
    case 'Delete':
      return onDelete(idOf(object), from)
    case 'Remove':
      return onRemove(idOf(object), from)
    case 'Like':
      return onLike(idOf(object), from, false)
    case 'Announce':
      // A community passes on what's posted in it; anyone else boosts
      if (await kuddeOfGroup(from.user.id)) return onGroupAnnounce(object, from)
      return onBoost(idOf(object), from, false)
    case 'Flag':
      return onFlag(act, from)
  }
}

// ---------------------------------------------------------------- friendships

async function answer(type: 'Accept' | 'Reject', local: User, from: Remote, followId: string) {
  const actor = ids.actor(local.username)
  await enqueue(
    [from.actor.inbox],
    { '@context': CONTEXT, id: `${actor}#${type === 'Accept' ? 'accepts' : 'rejects'}/${encodeURIComponent(followId)}`, type, actor, object: { id: followId, type: 'Follow', actor: from.actor.uri, object: actor }, to: [from.actor.uri] },
    local.id,
  )
}

/** A Follow is a friend request (on a Weide server it asks for a friendship; from elsewhere it's the closest thing). */
async function onFollow(followId: string | null, target: string | null, from: Remote, friendship: boolean) {
  const local = await localMember(target)
  if (!followId) return
  if (!local) return
  const existing = await friendshipBetween(local.id, from.user.id)
  if (existing?.status === 'accepted') return answer('Accept', local, from, followId)
  // Mastodon, Pixelfed and the like follow one way: accepted straight away, unless the member wants friend requests only
  if (!friendship && !from.actor.weide && mayBeFollowed(local) && (await policyOf(from.user.domain!)) !== 'stil') {
    const [added] = await db.insert(remoteFollows).values({ followerId: from.user.id, targetId: local.id, accepted: true }).onConflictDoNothing().returning()
    if (added)
      await notify({ userIds: [local.id], actorId: from.user.id, kind: 'volger', ref: `volger:${from.user.id}:${local.id}`, message: `volgt je nu vanaf ${from.user.domain}`, link: `/profiel/${from.user.username}` })
    return answer('Accept', local, from, followId)
  }
  // A server that's set to "stil" can't start new friendships
  const refused = (!existing && (await policyOf(from.user.domain!)) === 'stil') || (await friendRequestRefusal(from.user, local))
  if (refused) return answer('Reject', local, from, followId)
  const state = await befriend(from.user, local)
  await db
    .update(friendships)
    .set({ apId: followId })
    .where(and(eq(friendships.requesterId, from.user.id), eq(friendships.addresseeId, local.id)))
  // Both asked at once: it's a friendship now, and they hear so
  if (state === 'friends') return answer('Accept', local, from, followId)
  if (local.isBot) botEvent({ trigger: 'vriendschap', botId: local.id, member: from.user })
}

/** Our friend request accepted there. */
async function onAccept(object: unknown, from: Remote) {
  const followId = idOf(object)
  const local = followId ? localId(followId) : null
  // A member here following them: they're in
  if (local?.kind === 'subscription') {
    if (local.targetId === from.user.id)
      await db
        .update(remoteFollows)
        .set({ accepted: true })
        .where(and(eq(remoteFollows.followerId, local.followerId), eq(remoteFollows.targetId, local.targetId)))
    return
  }
  // The Follow back to a server without friendships (".../terug") needs nothing more
  if (local?.kind !== 'follow' || followId!.endsWith('/terug')) return
  const [f] = await db.select().from(friendships).where(eq(friendships.id, local.id))
  if (!f || f.addresseeId !== from.user.id || f.status === 'accepted') return
  const [me] = await db.select().from(users).where(eq(users.id, f.requesterId))
  if (me) await befriend(from.user, me)
}

/** A Reject of our request (or of a friendship), or an Undo of their Follow: the friendship ends. */
async function onEndFollow(object: unknown, from: Remote) {
  const followId = idOf(object)
  if (!followId) return
  const inner = object && typeof object === 'object' ? (object as Json) : null
  // A follower elsewhere stops following
  if (inner && idOf(inner.actor) === from.actor.uri) {
    const member = await localMember(idOf(inner.object))
    const [gone] = member
      ? await db
          .delete(remoteFollows)
          .where(and(eq(remoteFollows.followerId, from.user.id), eq(remoteFollows.targetId, member.id)))
          .returning()
      : []
    if (gone) {
      await unnotify(`volger:${from.user.id}:${member!.id}`)
      return
    }
  }
  const local = localId(followId)
  // They don't want to be followed (any more)
  if (local?.kind === 'subscription') {
    if (local.targetId === from.user.id) await db.delete(remoteFollows).where(and(eq(remoteFollows.followerId, local.followerId), eq(remoteFollows.targetId, local.targetId)))
    return
  }
  let f: typeof friendships.$inferSelect | undefined
  if (local?.kind === 'follow') [f] = await db.select().from(friendships).where(eq(friendships.id, local.id))
  else [f] = await db.select().from(friendships).where(eq(friendships.apId, followId))
  // An embedded Follow says who it was between; but an old request (cancelled before) mustn't end a newer one
  if (!f && inner) {
    const member = (await localMember(idOf(inner.object))) ?? (await localMember(idOf(inner.actor)))
    const between = member ? await friendshipBetween(member.id, from.user.id) : undefined
    if (between && between.requesterId === from.user.id && !between.apId) f = between
  }
  if (!f || (f.requesterId !== from.user.id && f.addresseeId !== from.user.id)) return
  await db.delete(friendships).where(eq(friendships.id, f.id))
  await removeRelationsBetween(f.requesterId, f.addresseeId)
}

// ---------------------------------------------------------------- posts

const published = (v: unknown) => {
  const d = new Date(str(v) ?? '')
  return Number.isNaN(d.getTime()) || d.getTime() > Date.now() ? new Date() : d
}
const textOf = (o: Json) => (str(o.plainText) ?? str(o['weide:plainText']) ?? htmlToText(str(o.content) ?? '')).trim()

/** Posts: Mastodon sends Notes, Pixelfed Notes with pictures, others sometimes Images, Articles or Pages. */
const POST_TYPES = new Set(['Note', 'Image', 'Article', 'Page', 'Video'])

async function onCreate(note: Json, from: Remote) {
  const id = idOf(note.id)
  if (!id || !POST_TYPES.has(String(note.type)) || idOf(note.attributedTo) !== from.actor.uri) return
  // Ids are the author's server's: nothing can pose as something of another server
  if (new URL(id).host !== new URL(from.actor.uri).host) return
  const knuffelOn = idOf(note.knuffelOn ?? note['weide:knuffelOn'])
  if (knuffelOn) return onKnuffel(id, note, knuffelOn, from)
  // Replies to others aren't WieWatWaars
  if (note.inReplyTo) return
  return onStatus(id, note, from)
}

/** A WieWatWaar from a friend elsewhere, or a public post of someone a member here follows (Mastodon and the like). */
async function onStatus(id: string, note: Json, from: Remote, earlier = false, boostedBy: Remote | null = null) {
  const [friend] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.status, 'accepted'), eq(friendships.requesterId, from.user.id)))
    .union(db.select({ id: friendships.id }).from(friendships).where(and(eq(friendships.status, 'accepted'), eq(friendships.addresseeId, from.user.id))))
    .limit(1)
  const followed =
    !friend && !from.actor.weide && serverInfo().fediverse && isPublic(note)
      ? (await db.select({ id: remoteFollows.followerId }).from(remoteFollows).where(eq(remoteFollows.targetId, from.user.id)).limit(1)).length > 0
      : false
  // Nobody here is their friend or follows them (or follows who boosted it): no reason to keep it
  if (!friend && !followed && !(boostedBy && isPublic(note))) return
  const [known] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.apId, id))
  if (known) {
    // Already here: now it's also boosted by someone followed
    if (boostedBy) await db.update(activities).set({ boostedById: boostedBy.user.id, createdAt: earlier ? undefined : new Date() }).where(eq(activities.statusId, known.id))
    return
  }
  const { images, links } = attachmentsOf(note)
  // Sensitive pictures aren't shown here unasked: they stay a link to the post
  const sensitive = note.sensitive === true
  const media = sensitive ? [] : await storeMedia(images)
  const text = fediverseText(note, textOf(note), [...links, ...(sensitive ? images.map((i) => i.url) : [])]).slice(0, STATUS_MAX_LENGTH)
  if (!text && !media.length) return
  const mood = str(note.mood ?? note['weide:mood'])
  const icon = str(note.icon ?? note['weide:icon'])
  const visibility = isPublic(note) ? 'iedereen' : 'vrienden'
  const statusId = await db.transaction(async (tx) => {
    const [status] = await tx
      .insert(statuses)
      .values({
        userId: from.user.id,
        text,
        where: cleanLine(note.where ?? note['weide:where'], 60) || null,
        mood: mood && mood in MOODS ? mood : null,
        icon: icon && PICKABLE_ICONS.includes(icon) ? icon : null,
        visibility,
        apId: id,
        apUrl: link(note.url) ?? id,
        createdAt: published(note.published),
      })
      .returning({ id: statuses.id })
    // Its pictures become their photos here: in the post, and in the Foto's of their profile
    if (media.length) {
      const added = await tx
        .insert(photos)
        .values(media.map((m) => ({ userId: from.user.id, path: m.path, caption: m.alt.slice(0, 120), description: m.alt, width: m.width, height: m.height, createdAt: published(note.published) })))
        .returning({ id: photos.id })
      await tx.insert(statusPhotos).values(added.map((p, position) => ({ statusId: status.id, position, photoId: p.id })))
    }
    await recordActivity({ type: 'status', actorId: from.user.id, statusId: status.id, visibility, createdAt: boostedBy && !earlier ? new Date() : published(note.published), boostedById: boostedBy?.user.id ?? null }, tx)
    return status.id
  })
  // Older posts fetched when someone starts following aren't new: no moderation round for those
  if (earlier) return
  checkPost({
    author: from.user,
    place: 'wiewatwaar',
    text,
    link: `/profiel/${from.user.username}`,
    remove: async () => {
      await db.delete(statuses).where(eq(statuses.id, statusId))
    },
  })
}

/** A knuffel on the profile of a member here. */
async function onKnuffel(id: string, note: Json, on: string, from: Remote) {
  const profile = await localMember(on)
  if (!profile) return
  const [known] = await db.select({ id: knuffels.id }).from(knuffels).where(eq(knuffels.apId, id))
  if (known || (await knuffelRefusal(from.user, profile))) return
  const text = textOf(note)
    // Servers without knuffels put a mention of the member in front
    .replace(new RegExp(`^@${profile.username}(@\\S+)?\\s*`, 'i'), '')
    .slice(0, 1000)
  if (!text) return
  const knuffel = await createKnuffel(from.user, profile, text)
  await db.update(knuffels).set({ apId: id }).where(eq(knuffels.id, knuffel.id))
  checkPost({
    author: from.user,
    place: 'knuffel',
    text,
    link: `/profiel/${profile.username}?tab=knuffels`,
    remove: async () => {
      await db.delete(knuffels).where(eq(knuffels.id, knuffel.id))
      await unnotify(`knuffel:${knuffel.id}`)
    },
  })
  if (profile.isBot) botEvent({ trigger: 'knuffel', botId: profile.id, member: from.user, text })
}

/** A URL from a link that may be a string, an object with href or url, or a list of those (the first image one). */
function link(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return link(v.find((l) => !l || typeof l !== 'object' || /^image\//.test(String((l as Json).mediaType ?? 'image/'))) ?? v[0])
  if (v && typeof v === 'object') return str((v as Json).href) ?? link((v as Json).url)
  return null
}

/** A post's pictures (at most four) and its other attachments (video, audio) as links. */
function attachmentsOf(note: Json) {
  const images: { url: string; alt: string }[] = []
  const links: string[] = []
  // An Image post (some servers) is the picture itself
  const items = note.type === 'Image' ? [note, ...list(note.attachment)] : list(note.attachment)
  for (const a of items) {
    if (!a || typeof a !== 'object') continue
    const item = a as Json
    const url = link(item.url)
    if (!url || !/^https?:\/\//.test(url)) continue
    const type = String(item.mediaType ?? '')
    if ((item.type === 'Image' || type.startsWith('image/') || (item.type === 'Document' && !type)) && images.length < 4) images.push({ url, alt: cleanLine(item.name, 400) })
    else links.push(url)
  }
  return { images, links: links.slice(0, 4) }
}

/** Pictures fetched and stored as photos here; one that fails is left out. */
async function storeMedia(images: { url: string; alt: string }[]) {
  const stored: { path: string; width: number; height: number; alt: string }[] = []
  for (const img of images) {
    try {
      const data = await fetchImage(img.url)
      const file = await storeImage(new File([new Uint8Array(data)], 'foto'), 'photos', 'fed-')
      stored.push({ path: file.path, width: file.width, height: file.height, alt: img.alt })
    } catch {
      // Gone, too big or not a picture
    }
  }
  return stored
}

/** A post from Mastodon and the like as a WieWatWaar: a content warning (or "sensitive") in front, other attachments as links. */
function fediverseText(note: Json, text: string, links: string[]) {
  const warning = cleanLine(note.summary, 200) || (note.sensitive === true ? 'gevoelige inhoud' : '')
  return [warning && `Let op: ${warning}`, text, ...links.map((u) => `Bijlage: ${u}`)].filter(Boolean).join('\n\n')
}

/**
 * The first member here follows an account outside Kuddes: its newest posts
 * (from its outbox) come here too, so its profile and Foto's aren't empty until
 * it posts again. Oldest first, so they're in order.
 */
export async function fetchEarlierPosts(from: Remote) {
  const [any] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.userId, from.user.id)).limit(1)
  if (any) return
  const key = await instanceSigningKey()
  const host = new URL(from.actor.uri).host
  const outboxUrl = str((await fetchJson(from.actor.uri, key)).json.outbox)
  let items: Json[] = []
  if (outboxUrl && new URL(outboxUrl).host === host) {
    let page = (await fetchJson(outboxUrl, key)).json
    // Mastodon puts the posts on the first page
    const first = page.first
    if (!Array.isArray(page.orderedItems) && first) page = typeof first === 'string' ? (await fetchJson(first, key)).json : (first as Json)
    const activitiesFound = list(page.orderedItems ?? page.items).filter((a): a is Json => !!a && typeof a === 'object')
    items = activitiesFound
      .filter((a) => a.type === 'Create')
      .map((a) => a.object)
      .filter((o): o is Json => !!o && typeof o === 'object')
      .slice(0, 20)
    // Their boosts too (oldest first, so the newest ends up on top)
    for (const a of activitiesFound.filter((a) => a.type === 'Announce').slice(0, 10).reverse())
      await onBoost(idOf(a.object), from, true).catch(() => {})
  }
  // Pixelfed's outbox only says how many there are: its public API lists them, and each is fetched from there as ActivityPub
  if (!items.length) items = await postsFromApi(from, key)
  for (const note of items.reverse()) {
    await handleEarlierPost(note, from)
  }
  // And how many likes, boosts and replies they have there
  await refreshCounts(from).catch(() => {})
}

/** One of an account's earlier posts: only its own, and not a reply. */
async function handleEarlierPost(note: Json, from: Remote) {
  const id = idOf(note.id)
  if (!id || !POST_TYPES.has(String(note.type)) || idOf(note.attributedTo) !== from.actor.uri || note.inReplyTo) return
  if (new URL(id).host !== new URL(from.actor.uri).host) return
  await onStatus(id, note, from, true)
}

/** The newest public posts through the server's Mastodon-style API (Pixelfed, and Mastodon when its outbox is closed), as ActivityPub objects. */
async function postsFromApi(from: Remote, key: Awaited<ReturnType<typeof instanceSigningKey>>) {
  const origin = new URL(from.actor.uri).origin
  const uris = (await recentFromApi(from))
    .filter((s) => !s.reblog && (s.visibility ?? 'public') === 'public')
    .map((s) => str(s.uri))
    .filter((u): u is string => !!u && new URL(u).origin === origin)
    .slice(0, 20)
  const notes: Json[] = []
  for (const uri of uris) {
    // The post itself from its own server, not the API's copy of it
    const note = await fetchJson(uri, key)
      .then((r) => r.json)
      .catch(() => null)
    if (note) notes.push(note)
  }
  return notes
}

async function onUpdate(object: unknown, from: Remote) {
  const id = idOf(object)
  if (id === from.actor.uri) return void (await resolveActor(from.actor.uri, true))
  // An edited WieWatWaar
  if (id && object && typeof object === 'object' && (object as Json).type === 'Note') {
    const text = textOf(object as Json).slice(0, STATUS_MAX_LENGTH)
    if (text)
      await db
        .update(statuses)
        .set({ text })
        .where(and(eq(statuses.apId, id), eq(statuses.userId, from.user.id)))
  }
}

async function onDelete(id: string | null, from: Remote) {
  if (!id) return
  // The account itself is gone there
  if (id === from.actor.uri) return forgetAccount(from.user)
  const [status] = await db
    .delete(statuses)
    .where(and(eq(statuses.apId, id), eq(statuses.userId, from.user.id)))
    .returning({ id: statuses.id, media: statuses.media })
  if (status) {
    await removeMedia(status.media)
    return removePostPhotos(from.user.id)
  }
  const [knuffel] = await db
    .delete(knuffels)
    .where(and(eq(knuffels.apId, id), eq(knuffels.authorId, from.user.id)))
    .returning({ id: knuffels.id })
  if (knuffel) await unnotify(`knuffel:${knuffel.id}`)
}

/** Photos of an account from elsewhere that no longer belong to a post (it was deleted there) go too. */
async function removePostPhotos(userId: number) {
  const orphans = await db
    .delete(photos)
    .where(and(eq(photos.userId, userId), sql`not exists (select 1 from ${statusPhotos} where ${statusPhotos.photoId} = ${photos.id})`))
    .returning({ path: photos.path })
  await removeMedia(orphans)
}

/** Whether someone here follows (or is friends with) this account: only then do its boosts matter here. */
async function followedHere(userId: number) {
  const [follow] = await db.select({ id: remoteFollows.followerId }).from(remoteFollows).where(eq(remoteFollows.targetId, userId)).limit(1)
  if (follow) return true
  const [friend] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
    .limit(1)
  return !!friend
}

/**
 * An account someone here follows boosted a post (Announce): the post comes
 * here, fetched from its own server, with who boosted it.
 */
async function onBoost(objectId: string | null, from: Remote, earlier: boolean) {
  if (!objectId || localId(objectId) || !serverInfo().fediverse || !(await followedHere(from.user.id))) return
  if (!(await mayFederateWith(new URL(objectId).host))) return
  const { json: note, url } = await fetchJson(objectId, await instanceSigningKey())
  const id = idOf(note.id)
  // Only from the post's own server, and only a post (not a reply)
  if (!id || new URL(id).host !== new URL(url).host || !POST_TYPES.has(String(note.type)) || note.inReplyTo) return
  const authorUri = idOf(note.attributedTo)
  if (!authorUri || new URL(authorUri).host !== new URL(id).host) return
  const author = await resolveActor(authorUri)
  await onStatus(id, note, author, earlier, from)
}

/** A boost taken back. */
async function onUnboost(objectId: string | null, from: Remote) {
  if (!objectId) return
  const [status] = await db.select({ id: statuses.id }).from(statuses).where(eq(statuses.apId, objectId))
  if (status)
    await db
      .update(activities)
      .set({ boostedById: null })
      .where(and(eq(activities.statusId, status.id), eq(activities.boostedById, from.user.id)))
}

/** A member elsewhere took a knuffel from here off their profile. */
async function onRemove(id: string | null, from: Remote) {
  const local = id ? localId(id) : null
  if (local?.kind !== 'knuffel') return
  await db.delete(knuffels).where(and(eq(knuffels.id, local.id), eq(knuffels.profileId, from.user.id)))
}

/** A Like is respect: for a WieWatWaar here, or for a member's profile. */
async function onLike(objectId: string | null, from: Remote, undo: boolean) {
  const local = objectId ? localId(objectId) : null
  if (!local) return
  if (local.kind === 'actor') {
    const member = await localMember(objectId)
    if (!member) return
    if (undo) await db.delete(respects).where(and(eq(respects.giverId, from.user.id), eq(respects.receiverId, member.id)))
    else await db.insert(respects).values({ giverId: from.user.id, receiverId: member.id }).onConflictDoNothing()
    return
  }
  if (local.kind !== 'status') return
  const [row] = await db
    .select({ activity: activities.id, visibility: statuses.visibility, owner: statuses.userId })
    .from(statuses)
    .innerJoin(activities, eq(activities.statusId, statuses.id))
    .where(eq(statuses.id, local.id))
  if (!row) return
  // A friends-only WieWatWaar only for friends
  if (row.visibility === 'vrienden' && (await friendshipBetween(row.owner, from.user.id))?.status !== 'accepted') return
  if (undo) await db.delete(activityRespects).where(and(eq(activityRespects.activityId, row.activity), eq(activityRespects.userId, from.user.id)))
  else await db.insert(activityRespects).values({ activityId: row.activity, userId: from.user.id }).onConflictDoNothing()
}

/** Another server reports something of here: it lands with the admin's other reports. */
async function onFlag(act: Json, from: Remote) {
  const note = `Via ${from.user.domain}: ${cleanLine(act.content, 400) || 'geen toelichting'}`
  const seen = new Set<string>()
  for (const uri of list(act.object).map(idOf)) {
    const local = uri ? localId(uri) : null
    if (!local) continue
    let target: { kind: ReportKind; id: number } | null = null
    if (local.kind === 'actor') {
      const member = await localMember(uri)
      if (member) target = { kind: 'profiel', id: member.id }
    } else if (local.kind === 'status') target = { kind: 'wiewatwaar', id: local.id }
    else if (local.kind === 'knuffel') target = { kind: 'knuffel', id: local.id }
    if (!target || seen.has(`${target.kind}:${target.id}`) || !(target.kind in REPORT_KINDS)) continue
    seen.add(`${target.kind}:${target.id}`)
    // A profile is only reported on its own when nothing more specific is
    if (target.kind === 'profiel' && list(act.object).length > 1) continue
    await report(from.user, { kind: target.kind, targetId: target.id, reason: 'anders', note }).catch(() => {})
  }
}
