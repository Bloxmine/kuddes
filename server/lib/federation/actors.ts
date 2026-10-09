/**
 * Actors: a member of this server as other servers see them (an ActivityPub
 * Person with Weide extras), and accounts of other servers as they live here:
 * a row in users (with `domain` set, so they can't log in) and one in
 * remote_actors with where to deliver to them and their key.
 */
import { and, eq, isNotNull } from 'drizzle-orm'
import { withDefaults, type Preferences } from '../../../shared/customization'
import { SKINS } from '../../../shared/skins'
import { HANDLE_PATTERN } from '../../../shared/federation'
import { db } from '../../db/client'
import { federationServers, photos, remoteActors, statuses, users, type User } from '../../db/schema'
import { profileColorsSchema } from '../customization'
import { uploadUrl } from '../serialize'
import { baseUrl } from '../siteSettings'
import { removeUpload, storeImage } from '../uploads'
import { cleanLine, cleanName, htmlToText, textToHtml } from './content'
import { mayBeFollowed } from './outbox'
import { fetchImage, fetchJson, safeFetch } from './http'
import { ids, instanceKeys, instanceSigningKey, publicKeyOf } from './keys'
import { describeServer, mayFederateWith } from './servers'

/** Weide's own terms, next to ActivityStreams and the security vocabulary (WEIDE.md, "Context"). */
export const WEIDE_NS = 'https://w3id.org/weide#'
export const WEIDE_VERSION = '1.0'
export const CONTEXT = [
  'https://www.w3.org/ns/activitystreams',
  'https://w3id.org/security/v1',
  {
    weide: WEIDE_NS,
    manuallyApprovesFollowers: 'as:manuallyApprovesFollowers',
    discoverable: 'http://joinmastodon.org/ns#discoverable',
    plainText: 'weide:plainText',
    friendship: 'weide:friendship',
    knuffelOn: { '@id': 'weide:knuffelOn', '@type': '@id' },
    mood: 'weide:mood',
    where: 'weide:where',
    icon: 'weide:icon',
    realName: 'weide:realName',
    skin: 'weide:skin',
    profileColors: { '@id': 'weide:profileColors', '@type': '@json' },
    knuffelsFrom: 'weide:knuffelsFrom',
    friendRequestsFrom: 'weide:friendRequestsFrom',
    weideVersion: 'weide:version',
  },
]

const PUBLIC = 'https://www.w3.org/ns/activitystreams#Public'
export { PUBLIC }

/** A member of this server as an ActivityPub actor; a profile for friends only shows only the name and photo. */
export async function actorDocument(user: User) {
  const prefs = withDefaults(user.preferences)
  const open = prefs.profileFor !== 'vrienden'
  const actor = ids.actor(user.username)
  const avatar = user.avatarPath && user.avatarPublic ? uploadUrl(user.avatarPath) : null
  return {
    '@context': CONTEXT,
    id: actor,
    type: user.isBot ? 'Service' : 'Person',
    preferredUsername: user.username,
    name: user.nickname,
    summary: open && user.about ? textToHtml(user.about) : '',
    url: ids.profile(user.username),
    inbox: `${actor}/inbox`,
    outbox: `${actor}/outbox`,
    followers: `${actor}/followers`,
    following: `${actor}/following`,
    endpoints: { sharedInbox: ids.sharedInbox() },
    // Kuddes servers ask for a friendship; Mastodon and the like may just follow, if the member allows it
    manuallyApprovesFollowers: !mayBeFollowed(user),
    discoverable: open,
    published: user.createdAt.toISOString(),
    ...(avatar && { icon: { type: 'Image', mediaType: 'image/webp', url: `${baseUrl()}${avatar}` } }),
    publicKey: { id: `${actor}#main-key`, owner: actor, publicKeyPem: await publicKeyOf(user.id) },
    weideVersion: WEIDE_VERSION,
    knuffelsFrom: prefs.knuffelsFrom,
    friendRequestsFrom: prefs.friendRequestsFrom,
    ...(open && {
      realName: user.name,
      skin: user.skin && user.skin !== 'eigen' ? user.skin : user.skin === 'eigen' && user.profileColors ? 'eigen' : null,
      // Colours and fonts travel; pictures stay on this server
      profileColors: user.skin === 'eigen' && user.profileColors ? { ...user.profileColors, image: null, header: null } : null,
    }),
  }
}

/** The server's own actor: it fetches documents and sends reports to other servers. */
export async function instanceDocument() {
  const actor = ids.instance()
  return {
    '@context': CONTEXT,
    id: actor,
    type: 'Application',
    preferredUsername: new URL(baseUrl()).hostname,
    name: 'Kuddes',
    inbox: `${actor}/inbox`,
    outbox: `${actor}/outbox`,
    endpoints: { sharedInbox: ids.sharedInbox() },
    manuallyApprovesFollowers: true,
    publicKey: { id: `${actor}#main-key`, owner: actor, publicKeyPem: (await instanceKeys()).publicKey },
    weideVersion: WEIDE_VERSION,
  }
}

// ---------------------------------------------------------------- accounts elsewhere

export type Remote = { user: User; actor: typeof remoteActors.$inferSelect }

const ACTOR_TYPES = new Set(['Person', 'Service', 'Application', 'Organization'])
const REFRESH_MS = 24 * 60 * 60 * 1000
const str = (v: unknown) => (typeof v === 'string' ? v : null)
/** A link may be a string or an object with an id or href (and icons an array of them). */
const link = (v: unknown): string | null => {
  if (Array.isArray(v)) return link(v[0])
  if (v && typeof v === 'object') return str((v as Record<string, unknown>).url) ? link((v as Record<string, unknown>).url) : str((v as Record<string, unknown>).id) ?? str((v as Record<string, unknown>).href)
  return str(v)
}

async function remoteBy(where: ReturnType<typeof eq>) {
  const [row] = await db.select({ user: users, actor: remoteActors }).from(remoteActors).innerJoin(users, eq(users.id, remoteActors.userId)).where(where)
  return row ?? null
}
export const remoteByUri = (uri: string) => remoteBy(eq(remoteActors.uri, uri))
export const remoteOf = (userId: number) => remoteBy(eq(remoteActors.userId, userId))

/** Their photo, fetched and stored as ours are (other servers' images can't be shown here directly). */
async function avatarFrom(source: string | null, previous: { path: string | null; source: string | null }) {
  if (source === previous.source) return { avatarPath: previous.path, avatarSource: previous.source }
  let path: string | null = null
  if (source) {
    try {
      const data = await fetchImage(source)
      path = (await storeImage(new File([new Uint8Array(data)], 'avatar'), 'avatars', 'fed-')).path
    } catch {
      // No photo is better than none at all; it's tried again with the next update
      return { avatarPath: previous.path, avatarSource: previous.source }
    }
  }
  await removeUpload(previous.path)
  return { avatarPath: path, avatarSource: source }
}

/** An actor document from `fetchedFrom` as an account here: made, or brought up to date. */
async function storeActor(json: Record<string, unknown>, fetchedFrom: string): Promise<Remote> {
  const uri = str(json.id)
  const type = str(json.type)
  if (!uri || !type || !ACTOR_TYPES.has(type)) throw new Error('not an actor')
  const host = new URL(uri).host
  // A server only speaks for its own accounts
  if (new URL(fetchedFrom).host !== host) throw new Error('actor from another host')
  if (!(await mayFederateWith(host))) throw new Error(`server ${host} is not allowed`)
  const inbox = str(json.inbox)
  const key = json.publicKey as Record<string, unknown> | undefined
  const keyId = str(key?.id)
  const publicKey = str(key?.publicKeyPem)
  if (!inbox || !keyId || !publicKey || (str(key?.owner) ?? uri) !== uri) throw new Error('actor without inbox or key')
  const handle = str(json.preferredUsername)?.toLowerCase()
  if (!handle || !/^[a-z0-9_.-]{1,64}$/.test(handle)) throw new Error('unusable username')
  const username = `${handle}@${host}`

  const nickname = (typeof json.name === 'string' ? cleanName(json.name).slice(0, 60) : '') || handle
  const realName = cleanLine(json.realName ?? json['weide:realName'], 60)
  const about = typeof json.summary === 'string' ? htmlToText(json.summary).slice(0, 2000) || null : null
  const skinValue = str(json.skin ?? json['weide:skin'])
  const colors = profileColorsSchema.safeParse(json.profileColors ?? json['weide:profileColors'])
  const skin = skinValue && skinValue in SKINS ? skinValue : skinValue === 'eigen' && colors.success ? 'eigen' : null
  const prefs: Partial<Preferences> = {}
  const knuffelsFrom = str(json.knuffelsFrom ?? json['weide:knuffelsFrom'])
  const requestsFrom = str(json.friendRequestsFrom ?? json['weide:friendRequestsFrom'])
  if (knuffelsFrom === 'iedereen' || knuffelsFrom === 'vrienden') prefs.knuffelsFrom = knuffelsFrom
  if (requestsFrom === 'iedereen' || requestsFrom === 'vriendenvanvrienden' || requestsFrom === 'niemand') prefs.friendRequestsFrom = requestsFrom
  const weide = typeof (json.weideVersion ?? json['weide:version']) === 'string'
  const endpoints = json.endpoints as Record<string, unknown> | undefined

  const profile = {
    name: realName || nickname,
    nickname,
    about,
    skin,
    profileColors: skin === 'eigen' && colors.success ? { ...colors.data, image: null, header: null } : null,
    preferences: prefs,
    isBot: type !== 'Person',
  }
  const remote = {
    uri,
    inbox,
    sharedInbox: str(endpoints?.sharedInbox),
    url: link(json.url),
    keyId,
    publicKey,
    weide,
    fetchedAt: new Date(),
  }

  let existing = await remoteByUri(uri)
  if (!existing) {
    // The same name for a new account there (it was deleted and made again): the old one goes
    const [taken] = await db.select({ id: users.id, avatarPath: users.avatarPath }).from(users).where(eq(users.username, username))
    if (taken) await forgetAccount(taken)
    const [user] = await db
      .insert(users)
      .values({ ...profile, username, email: `fed:${uri}`, passwordHash: '!', domain: host, emailVerifiedAt: new Date() })
      .returning()
    await db.insert(remoteActors).values({ userId: user.id, ...remote })
    existing = { user, actor: (await db.select().from(remoteActors).where(eq(remoteActors.userId, user.id)))[0] }
  }
  const avatar = await avatarFrom(link(json.icon), { path: existing.user.avatarPath, source: existing.actor.avatarSource })
  const [user] = await db
    .update(users)
    .set({ ...profile, avatarPath: avatar.avatarPath })
    .where(eq(users.id, existing.user.id))
    .returning()
  const [actor] = await db
    .update(remoteActors)
    .set({ ...remote, avatarSource: avatar.avatarSource })
    .where(eq(remoteActors.userId, user.id))
    .returning()
  await db
    .insert(federationServers)
    .values({ domain: host, weide, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: federationServers.domain, set: { weide, lastSeenAt: new Date() } })
  void describeServer(host, new URL(uri).origin)
  return { user, actor }
}

/** The pictures of a post from elsewhere, when it goes. */
export async function removeMedia(media: { path: string }[] | null) {
  for (const m of media ?? []) await removeUpload(m.path)
}

/** An account here that came from elsewhere goes, with all it left here (its photo and the pictures of its posts). */
export async function forgetAccount(user: { id: number; avatarPath: string | null }) {
  const posts = await db.select({ media: statuses.media }).from(statuses).where(and(eq(statuses.userId, user.id), isNotNull(statuses.media)))
  const pictures = await db.select({ path: photos.path }).from(photos).where(eq(photos.userId, user.id))
  await db.delete(users).where(eq(users.id, user.id))
  await removeUpload(user.avatarPath)
  for (const p of posts) await removeMedia(p.media)
  await removeMedia(pictures)
}

/** The account of the actor with this id: from here when it's fresh, else fetched (again). */
export async function resolveActor(uri: string, refresh = false): Promise<Remote> {
  const known = await remoteByUri(uri)
  if (known && !refresh && Date.now() - known.actor.fetchedAt.getTime() < REFRESH_MS) return known
  try {
    const { json, url } = await fetchJson(uri, await instanceSigningKey())
    return await storeActor(json, url)
  } catch (e) {
    // Their server is down: what's known still works
    if (known) return known
    throw e
  }
}

/** Whose key this is: the actor that owns it (a key id is the actor's id with #main-key, or a document of its own). */
export async function actorForKey(keyId: string, refresh = false): Promise<Remote> {
  if (!refresh) {
    const known = await remoteBy(eq(remoteActors.keyId, keyId))
    if (known) return known
  }
  const uri = keyId.split('#')[0]
  const byUri = await remoteByUri(uri)
  if (byUri && byUri.actor.keyId === keyId && !refresh) return byUri
  const { json, url } = await fetchJson(uri, await instanceSigningKey())
  // A key document points at its owner
  if (!ACTOR_TYPES.has(String(json.type)) && str(json.owner)) return resolveActor(str(json.owner)!, true)
  return storeActor(json, url)
}

/** "naam@server.nl" through WebFinger, as an account here; null when there's no such account. */
export async function resolveHandle(handle: string): Promise<Remote | null> {
  const m = HANDLE_PATTERN.exec(handle.trim())
  if (!m) return null
  const [, name, domain] = m
  const known = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, `${name.toLowerCase()}@${domain.toLowerCase()}`))
  if (known.length) {
    const r = await remoteOf(known[0].id)
    if (r) return resolveActor(r.actor.uri)
  }
  if (!(await mayFederateWith(domain.toLowerCase()))) return null
  const scheme = /^localhost(:\d+)?$|:\d+$/.test(domain) && !domain.endsWith(':443') ? 'http' : 'https'
  try {
    const { res, body } = await safeFetch(`${scheme}://${domain}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${name}@${domain}`)}`, {
      headers: { Accept: 'application/jrd+json, application/json' },
    })
    if (!res.ok) return null
    const links = (JSON.parse(body) as { links?: { rel?: string; type?: string; href?: string }[] }).links ?? []
    const self = links.find((l) => l.rel === 'self' && /activity\+json|ld\+json/.test(l.type ?? ''))?.href
    return self ? await resolveActor(self, true) : null
  } catch {
    return null
  }
}
