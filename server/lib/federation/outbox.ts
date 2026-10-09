/**
 * What members here do, sent to the servers it concerns (WEIDE.md lists each
 * activity). Every function is safe to call for anything: when federation
 * is off or nobody elsewhere is involved it does nothing, and it never
 * throws into the request that called it.
 */
import { createHash } from 'node:crypto'
import { and, eq, or } from 'drizzle-orm'
import { db } from '../../db/client'
import { friendships, knuffels, remoteActors, remoteFollows, statuses, users, type User } from '../../db/schema'
import { withDefaults } from '../../../shared/customization'
import { CONTEXT, PUBLIC, actorDocument, remoteOf, type Remote } from './actors'
import { textToHtml } from './content'
import { statusPhotosFor } from '../activities'
import { baseUrl, serverInfo } from '../siteSettings'
import { enqueue, sendNow } from './deliver'
import { ids, signingKeyOf } from './keys'
import { federationOn } from './servers'

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)
const inboxOf = (r: Remote['actor']) => r.sharedInbox ?? r.inbox
/** Fire and forget: federation never breaks what the member did here. */
const quietly = (what: string, work: () => Promise<unknown>) => {
  if (!federationOn()) return
  work().catch((e) => console.error(`[federatie] ${what}:`, e))
}

/** Where a member's friends on other servers get their posts (each server once). */
async function friendInboxes(userId: number) {
  const rows = await db
    .select({ inbox: remoteActors.inbox, sharedInbox: remoteActors.sharedInbox })
    .from(friendships)
    .innerJoin(remoteActors, or(eq(remoteActors.userId, friendships.requesterId), eq(remoteActors.userId, friendships.addresseeId)))
    .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
  return rows.map((r) => r.sharedInbox ?? r.inbox)
}

const isLocal = (u: { domain: string | null }) => !u.domain

/** Whether people on Mastodon, Pixelfed and the like may follow this member (their setting, a profile for everyone, and the server allows it). */
export function mayBeFollowed(user: User) {
  const prefs = withDefaults(user.preferences)
  return !user.domain && serverInfo().fediverse && prefs.fediverseFollowers && prefs.profileFor !== 'vrienden'
}

/** Where a member's followers outside Kuddes get their public posts (each server once). */
async function followerInboxes(user: User) {
  if (!mayBeFollowed(user)) return []
  const rows = await db
    .select({ inbox: remoteActors.inbox, sharedInbox: remoteActors.sharedInbox })
    .from(remoteFollows)
    .innerJoin(remoteActors, eq(remoteActors.userId, remoteFollows.followerId))
    .where(and(eq(remoteFollows.targetId, user.id), eq(remoteFollows.accepted, true)))
  return rows.map((r) => r.sharedInbox ?? r.inbox)
}

/** Everyone elsewhere who gets this member's posts: friends always, followers only what's for everyone. */
async function audienceOf(user: User, forEveryone: boolean) {
  return [...(await friendInboxes(user.id)), ...(forEveryone ? await followerInboxes(user) : [])]
}

// ---------------------------------------------------------------- documents

type StatusRow = typeof statuses.$inferSelect

type Picture = { path: string; width: number; height: number }

/** A stored photo (photos/abc.webp) as a JPEG for other servers (server/routes/federation.ts makes it). */
const jpegUrl = (path: string) => `${baseUrl()}/fed/media/${path.replace(/\.webp$/, '.jpg')}`

/** The photos with WieWatWaars (their own and open Kudde photos), for sending along. */
export async function picturesOf(statusIds: number[]) {
  const rows = await statusPhotosFor(statusIds)
  return new Map([...rows].map(([id, list]) => [id, list.map((r) => r.photo ?? r.kudde!.photo).map((p): Picture => ({ path: p.path, width: p.width, height: p.height }))]))
}

/** A WieWatWaar as a Note; for everyone it's public, else for friends (the followers collection) only. Its photos go along as attachments. */
export function statusNote(status: StatusRow, author: { username: string }, pictures: Picture[] = []) {
  const actor = ids.actor(author.username)
  const followers = `${actor}/followers`
  const open = status.visibility === 'iedereen'
  return {
    id: ids.status(status.id),
    type: 'Note',
    attributedTo: actor,
    content: textToHtml(status.text),
    plainText: status.text,
    published: status.createdAt.toISOString(),
    url: ids.profile(author.username),
    to: open ? [PUBLIC] : [followers],
    cc: open ? [followers] : [],
    ...(pictures.length && {
      // As JPEG: Pixelfed and older Mastodon servers don't take WebP
      attachment: pictures.map((p) => ({ type: 'Document', mediaType: 'image/jpeg', url: jpegUrl(p.path), width: p.width, height: p.height, name: '' })),
    }),
    ...(status.mood && { mood: status.mood }),
    ...(status.where && { where: status.where }),
    ...(status.icon && { icon: status.icon }),
  }
}

/** A knuffel as a Note on someone's profile: a mention for servers that don't know knuffels. */
export function knuffelNote(knuffel: typeof knuffels.$inferSelect, author: { username: string }, profile: { uri: string; username: string }) {
  const handle = `@${profile.username}`
  return {
    id: ids.knuffel(knuffel.id),
    type: 'Note',
    attributedTo: ids.actor(author.username),
    knuffelOn: profile.uri,
    content: `<p><span class="h-card"><a href="${profile.uri}" class="u-url mention">@${profile.username.split('@')[0]}</a></span> </p>${textToHtml(knuffel.text)}`,
    plainText: knuffel.text,
    published: knuffel.createdAt.toISOString(),
    to: [profile.uri],
    cc: [PUBLIC],
    tag: [{ type: 'Mention', href: profile.uri, name: handle }],
  }
}

const activity = (type: string, actor: string, object: unknown, extra: Record<string, unknown> = {}) => ({ '@context': CONTEXT, type, actor, object, ...extra })

// ---------------------------------------------------------------- friendships

/** A friend request to someone elsewhere: a Follow that asks for a friendship. */
export function friendRequested(me: User, other: User) {
  if (!isLocal(me) || isLocal(other)) return
  quietly('vriendschapsverzoek', async () => {
    const remote = await remoteOf(other.id)
    const [f] = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.requesterId, me.id), eq(friendships.addresseeId, other.id)))
    if (!remote || !f) return
    const follow = ids.follow(f.id)
    await enqueue([remote.actor.inbox], activity('Follow', ids.actor(me.username), remote.actor.uri, { id: follow, friendship: true, to: [remote.actor.uri] }), me.id)
  })
}

/** Their request accepted here: an Accept of their Follow (and, to a server without friendships, a Follow back so their posts come here too). */
export function friendAccepted(me: User, other: User) {
  if (!isLocal(me) || isLocal(other)) return
  quietly('vriendschap', async () => {
    const remote = await remoteOf(other.id)
    const [f] = await db
      .select()
      .from(friendships)
      .where(and(eq(friendships.requesterId, other.id), eq(friendships.addresseeId, me.id)))
    if (!remote || !f?.apId) return
    const actor = ids.actor(me.username)
    const follow = { id: f.apId, type: 'Follow', actor: remote.actor.uri, object: actor }
    await enqueue([remote.actor.inbox], activity('Accept', actor, follow, { id: `${actor}#accepts/${hash(f.apId)}`, to: [remote.actor.uri] }), me.id)
    if (!remote.actor.weide) await enqueue([remote.actor.inbox], activity('Follow', actor, remote.actor.uri, { id: `${ids.follow(f.id)}/terug`, to: [remote.actor.uri] }), me.id)
  })
}

/** A request cancelled or declined, or a friendship ended: Undo of our Follow, or Reject of theirs. Call before the row goes. */
export function friendshipEnded(me: User, other: User, f: typeof friendships.$inferSelect) {
  if (!isLocal(me) || isLocal(other)) return
  quietly('vriendschap beëindigd', async () => {
    const remote = await remoteOf(other.id)
    if (!remote) return
    const actor = ids.actor(me.username)
    const send = (type: string, follow: object, id: string) => enqueue([remote.actor.inbox], activity(type, actor, follow, { id, to: [remote.actor.uri] }), me.id)
    if (f.requesterId === me.id) {
      const follow = ids.follow(f.id)
      await send('Undo', { id: follow, type: 'Follow', actor, object: remote.actor.uri }, `${follow}/undo`)
    } else if (f.apId) {
      await send('Reject', { id: f.apId, type: 'Follow', actor: remote.actor.uri, object: actor }, `${actor}#rejects/${hash(f.apId)}`)
      if (!remote.actor.weide && f.status === 'accepted') {
        const back = `${ids.follow(f.id)}/terug`
        await send('Undo', { id: back, type: 'Follow', actor, object: remote.actor.uri }, `${back}/undo`)
      }
    }
  })
}

// ---------------------------------------------------------------- following (Mastodon and the like)

/** Following an account on a server that isn't Kuddes: a plain Follow (or the Undo of it). */
export function followChanged(me: User, target: User, undo = false) {
  if (!isLocal(me) || isLocal(target)) return
  quietly('volgen', async () => {
    const remote = await remoteOf(target.id)
    if (!remote) return
    const actor = ids.actor(me.username)
    const follow = { id: ids.subscription(me.id, target.id), type: 'Follow', actor, object: remote.actor.uri }
    await enqueue(
      [remote.actor.inbox],
      undo ? activity('Undo', actor, follow, { id: `${follow.id}/undo`, to: [remote.actor.uri] }) : activity('Follow', actor, remote.actor.uri, { id: follow.id, to: [remote.actor.uri] }),
      me.id,
    )
  })
}

// ---------------------------------------------------------------- WieWatWaars

/** A new WieWatWaar to the servers of the member's friends (not one posted as a Kudde). */
export function statusCreated(statusId: number) {
  quietly('WieWatWaar', async () => {
    const [row] = await db.select({ status: statuses, user: users }).from(statuses).innerJoin(users, eq(users.id, statuses.userId)).where(eq(statuses.id, statusId))
    if (!row || !isLocal(row.user) || row.status.kuddeId) return
    const note = statusNote(row.status, row.user, (await picturesOf([statusId])).get(statusId))
    await enqueue(await audienceOf(row.user, row.status.visibility === 'iedereen'), activity('Create', note.attributedTo, note, { id: `${note.id}/activity`, to: note.to, cc: note.cc, published: note.published }), row.user.id)
  })
}

export function statusDeleted(me: User, statusId: number) {
  if (!isLocal(me)) return
  quietly('WieWatWaar weg', async () => {
    const id = ids.status(statusId)
    await enqueue(await audienceOf(me, true), activity('Delete', ids.actor(me.username), { id, type: 'Tombstone' }, { id: `${id}#delete`, to: [PUBLIC] }), me.id)
  })
}

// ---------------------------------------------------------------- knuffels

/** A knuffel from here on a profile elsewhere. */
export function knuffelCreated(knuffel: typeof knuffels.$inferSelect, author: User, profile: User) {
  if (!isLocal(author) || isLocal(profile)) return
  quietly('knuffel', async () => {
    const remote = await remoteOf(profile.id)
    if (!remote) return
    const note = knuffelNote(knuffel, author, { uri: remote.actor.uri, username: profile.username })
    await enqueue([remote.actor.inbox], activity('Create', note.attributedTo, note, { id: `${note.id}/activity`, to: note.to, cc: note.cc }), author.id)
  })
}

/**
 * A knuffel removed here, where one side is elsewhere: the author takes it
 * back (Delete), or the member whose profile it's on takes it off (Remove).
 */
export function knuffelRemoved(knuffel: typeof knuffels.$inferSelect, by: User) {
  if (!isLocal(by)) return
  quietly('knuffel weg', async () => {
    const otherId = by.id === knuffel.authorId ? knuffel.profileId : knuffel.authorId
    const remote = await remoteOf(otherId)
    if (!remote) return
    const actor = ids.actor(by.username)
    if (by.id === knuffel.authorId) {
      const id = ids.knuffel(knuffel.id)
      await enqueue([remote.actor.inbox], activity('Delete', actor, { id, type: 'Tombstone' }, { id: `${id}#delete`, to: [remote.actor.uri] }), by.id)
    } else if (knuffel.apId) {
      await enqueue([remote.actor.inbox], activity('Remove', actor, knuffel.apId, { id: `${actor}#removes/${hash(knuffel.apId)}`, target: actor, to: [remote.actor.uri] }), by.id)
    }
  })
}

// ---------------------------------------------------------------- respect

/** Respect for someone elsewhere (their profile, or a WieWatWaar of theirs): a Like, or the Undo of it. */
export function respected(me: User, target: { userId: number; objectUri?: string | null }, undo = false) {
  if (!isLocal(me)) return
  quietly('respect', async () => {
    const remote = await remoteOf(target.userId)
    if (!remote) return
    const object = target.objectUri ?? remote.actor.uri
    const actor = ids.actor(me.username)
    const likeId = `${actor}/likes/${hash(object)}`
    const like = activity('Like', actor, object, { id: likeId, to: [remote.actor.uri] })
    await enqueue([remote.actor.inbox], undo ? activity('Undo', actor, { ...like, '@context': undefined }, { id: `${likeId}/undo`, to: [remote.actor.uri] }) : like, me.id)
  })
}

// ---------------------------------------------------------------- profile and account

const pendingUpdates = new Map<number, ReturnType<typeof setTimeout>>()

/** The profile changed: an Update to the friends' servers, once things settle (a few changes in a row send one). */
export function profileChanged(userId: number) {
  if (!federationOn()) return
  clearTimeout(pendingUpdates.get(userId))
  pendingUpdates.set(
    userId,
    setTimeout(() => {
      pendingUpdates.delete(userId)
      quietly('profiel', async () => {
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (!user || !isLocal(user)) return
        const doc = await actorDocument(user)
        await enqueue(await audienceOf(user, true), activity('Update', doc.id, { ...doc, '@context': undefined }, { id: `${doc.id}#updates/${Date.now()}`, to: [PUBLIC] }), user.id)
      })
    }, 20_000),
  )
}

/**
 * An account here is deleted: its friends' servers hear it straight away,
 * signed while the key still exists. Call before deleting.
 */
export async function accountDeleted(user: User) {
  if (!federationOn() || !isLocal(user)) return
  try {
    const inboxes = await audienceOf(user, true)
    if (!inboxes.length) return
    const actor = ids.actor(user.username)
    sendNow(inboxes, activity('Delete', actor, actor, { id: `${actor}#delete`, to: [PUBLIC] }), await signingKeyOf(user))
  } catch (e) {
    console.error('[federatie] account weg:', e)
  }
}

/** A member here reported something of an account elsewhere: their server hears it from this server (without who reported it). */
export function reportedElsewhere(authorId: number, objectUri: string | null, reason: string) {
  quietly('melding', async () => {
    const remote = await remoteOf(authorId)
    if (!remote) return
    const actor = ids.instance()
    const objects = [remote.actor.uri, ...(objectUri ? [objectUri] : [])]
    await enqueue([inboxOf(remote.actor)], activity('Flag', actor, objects, { id: `${actor}#flags/${hash(objects.join(' ') + Date.now())}`, content: reason, to: [remote.actor.uri] }), null)
  })
}

/** The ActivityPub id of a status or knuffel here: our own, or the one it came with. */
export async function objectUriOf(kind: 'wiewatwaar' | 'knuffel', id: number) {
  if (kind === 'wiewatwaar') {
    const [s] = await db.select({ apId: statuses.apId }).from(statuses).where(eq(statuses.id, id))
    return s ? (s.apId ?? ids.status(id)) : null
  }
  const [k] = await db.select({ apId: knuffels.apId }).from(knuffels).where(eq(knuffels.id, id))
  return k ? (k.apId ?? ids.knuffel(id)) : null
}
