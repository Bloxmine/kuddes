/**
 * What ActivityPub doesn't carry, read from a server's public Mastodon-style
 * API (Mastodon, Pixelfed and most others have one): how many likes, boosts
 * and replies a post has there, and those replies themselves. Only for
 * accounts outside Kuddes; nothing here is stored except the counts.
 */
import { and, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import type { FediverseReply } from '../../../shared/api'
import { db } from '../../db/client'
import { remoteActors, statuses } from '../../db/schema'
import type { Remote } from './actors'
import { cleanName, htmlToText } from './content'
import { safeFetch } from './http'

type Json = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)

async function getJson(url: string) {
  const { res, body } = await safeFetch(url, { headers: { Accept: 'application/json' } })
  return res.ok ? (JSON.parse(body) as unknown) : null
}

/** The account's id in its server's API (looked up once). */
async function apiIdOf(remote: Remote) {
  if (remote.actor.apiId) return remote.actor.apiId
  const origin = new URL(remote.actor.uri).origin
  const account = (await getJson(`${origin}/api/v1/accounts/lookup?acct=${encodeURIComponent(remote.user.username.split('@')[0])}`).catch(() => null)) as Json | null
  const id = str(account?.id)
  if (id) await db.update(remoteActors).set({ apiId: id }).where(eq(remoteActors.userId, remote.user.id))
  return id
}

/** The account's newest public posts as its API gives them (Pixelfed's own route first, then Mastodon's). */
export async function recentFromApi(remote: Remote): Promise<Json[]> {
  const id = await apiIdOf(remote)
  if (!id) return []
  const origin = new URL(remote.actor.uri).origin
  for (const path of [`/api/pixelfed/v1/accounts/${id}/statuses?limit=20`, `/api/v1/accounts/${id}/statuses?limit=20&exclude_replies=true`]) {
    const listed = await getJson(origin + path).catch(() => null)
    if (Array.isArray(listed)) return listed.filter((s): s is Json => !!s && typeof s === 'object')
  }
  return []
}

/** The likes, boosts and replies of the account's newest posts, as they are on its server now. */
export async function refreshCounts(remote: Remote) {
  await db.update(remoteActors).set({ countsAt: new Date() }).where(eq(remoteActors.userId, remote.user.id))
  for (const s of await recentFromApi(remote)) {
    const uri = str(s.uri)
    if (!uri) continue
    await db
      .update(statuses)
      .set({ remoteLikes: num(s.favourites_count), remoteBoosts: num(s.reblogs_count), remoteReplies: num(s.replies_count ?? s.reply_count), remoteApiId: str(s.id) })
      .where(and(eq(statuses.apId, uri), eq(statuses.userId, remote.user.id)))
  }
}

const REFRESH_MS = 15 * 60 * 1000
let running = 0

/** Counts shown for these accounts' posts: fetched again in the background when they're older than a quarter of an hour. */
export async function refreshCountsSoon(userIds: number[]) {
  if (!userIds.length || running > 4) return
  const due = await db
    .select()
    .from(remoteActors)
    .where(and(inArray(remoteActors.userId, [...new Set(userIds)]), eq(remoteActors.weide, false), or(isNull(remoteActors.countsAt), lt(remoteActors.countsAt, new Date(Date.now() - REFRESH_MS)))))
    .limit(4)
  for (const actor of due) {
    // Claimed first, so a second page load doesn't fetch the same account again
    await db.update(remoteActors).set({ countsAt: new Date() }).where(eq(remoteActors.userId, actor.userId))
    running++
    const { remoteOf } = await import('./actors')
    remoteOf(actor.userId)
      .then((r) => (r ? refreshCounts(r) : undefined))
      .catch(() => {})
      .finally(() => running--)
  }
}

// What was fetched lately, so opening the replies twice doesn't ask their server twice
const repliesCache = new Map<string, { at: number; replies: FediverseReply[] }>()

/** The replies to a post on its own server (Mastodon's context, Pixelfed's comments), newest last. */
export async function repliesOf(remote: Remote, status: { remoteApiId: string | null; apId: string | null }): Promise<FediverseReply[]> {
  if (!status.remoteApiId) return []
  const key = `${remote.user.id}:${status.remoteApiId}`
  const cached = repliesCache.get(key)
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.replies
  const origin = new URL(remote.actor.uri).origin
  const host = new URL(origin).host
  let items: Json[] = []
  const accountId = await apiIdOf(remote)
  // Pixelfed: its comments; Mastodon (and most others): the thread under the post
  const pixelfed = accountId ? ((await getJson(`${origin}/api/v2/comments/${accountId}/status/${status.remoteApiId}`).catch(() => null)) as Json | null) : null
  if (Array.isArray(pixelfed?.data)) items = pixelfed.data as Json[]
  else {
    const context = (await getJson(`${origin}/api/v1/statuses/${status.remoteApiId}/context`).catch(() => null)) as Json | null
    if (Array.isArray(context?.descendants)) items = context.descendants as Json[]
  }
  const replies = items
    .filter((r) => r && typeof r === 'object' && (r.visibility ?? 'public') !== 'direct' && r.visibility !== 'private')
    .slice(0, 40)
    .map((r): FediverseReply => {
      const account = (r.account ?? {}) as Json
      const acct = str(account.acct) ?? '?'
      return {
        id: str(r.id) ?? '',
        name: cleanName(str(account.display_name) ?? '') || acct.split('@')[0],
        handle: acct.includes('@') ? acct : `${acct}@${host}`,
        text: htmlToText(str(r.content_text) ?? str(r.content) ?? '').slice(0, 2000),
        url: str(r.url) ?? str(r.uri),
        createdAt: str(r.created_at) ?? new Date().toISOString(),
      }
    })
  repliesCache.set(key, { at: Date.now(), replies })
  if (repliesCache.size > 500) repliesCache.delete(repliesCache.keys().next().value!)
  return replies
}
