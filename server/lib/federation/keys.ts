/**
 * Who signs what: every member's actor has its own RSA key pair (made the
 * first time it's needed), and the server has one for its own actor, which
 * fetches documents and sends reports to other servers.
 */
import { generateKeyPair } from 'node:crypto'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { db } from '../../db/client'
import { actorKeys, siteSettings } from '../../db/schema'
import { baseUrl } from '../siteSettings'
import type { SigningKey } from './http'

const makePair = async () => {
  const { publicKey, privateKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  return { publicKey, privateKey }
}

// ---------------------------------------------------------------- addresses

/** The ids of what this server shares; WEIDE.md, "Ids", lists them. */
export const ids = {
  instance: () => `${baseUrl()}/fed/actor`,
  actor: (username: string) => `${baseUrl()}/fed/users/${username}`,
  profile: (username: string) => `${baseUrl()}/profiel/${username}`,
  status: (id: number) => `${baseUrl()}/fed/statuses/${id}`,
  knuffel: (id: number) => `${baseUrl()}/fed/knuffels/${id}`,
  follow: (friendshipId: number) => `${baseUrl()}/fed/follows/${friendshipId}`,
  /** A member here following an account elsewhere (not a friendship): follower and followed. */
  subscription: (followerId: number, targetId: number) => `${baseUrl()}/fed/subscriptions/${followerId}-${targetId}`,
  sharedInbox: () => `${baseUrl()}/fed/inbox`,
}

/** What a local id points at ("status" 12), or null for an id of another server. */
export function localId(
  uri: string,
): { kind: 'actor'; username: string } | { kind: 'status' | 'knuffel' | 'follow'; id: number } | { kind: 'subscription'; followerId: number; targetId: number } | null {
  const base = `${baseUrl()}/fed/`
  if (!uri.startsWith(base)) {
    const profile = `${baseUrl()}/profiel/`
    return uri.startsWith(profile) ? { kind: 'actor', username: decodeURIComponent(uri.slice(profile.length)).toLowerCase() } : null
  }
  const sub = /^subscriptions\/(\d+)-(\d+)$/.exec(uri.slice(base.length))
  if (sub) return { kind: 'subscription', followerId: Number(sub[1]), targetId: Number(sub[2]) }
  const m = /^(users|statuses|knuffels|follows)\/([^/#?]+)/.exec(uri.slice(base.length))
  if (!m) return null
  if (m[1] === 'users') return { kind: 'actor', username: decodeURIComponent(m[2]).toLowerCase() }
  const id = Number(m[2])
  if (!Number.isInteger(id)) return null
  return { kind: ({ statuses: 'status', knuffels: 'knuffel', follows: 'follow' } as const)[m[1] as 'statuses' | 'knuffels' | 'follows'], id }
}

// ---------------------------------------------------------------- keys

export async function publicKeyOf(userId: number) {
  return (await keysOf(userId)).publicKey
}

async function keysOf(userId: number) {
  const [row] = await db.select().from(actorKeys).where(eq(actorKeys.userId, userId))
  if (row) return row
  const pair = await makePair()
  await db
    .insert(actorKeys)
    .values({ userId, ...pair })
    .onConflictDoNothing()
  return (await db.select().from(actorKeys).where(eq(actorKeys.userId, userId)))[0]
}

export async function signingKeyOf(user: { id: number; username: string }): Promise<SigningKey> {
  return { keyId: `${ids.actor(user.username)}#main-key`, privateKey: (await keysOf(user.id)).privateKey }
}

let instance: { publicKey: string; privateKey: string } | null = null
export async function instanceKeys() {
  if (instance) return instance
  await db
    .insert(siteSettings)
    .values({ key: 'instanceKey', value: await makePair() })
    .onConflictDoNothing()
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'instanceKey'))
  return (instance = row.value as { publicKey: string; privateKey: string })
}

export const instanceSigningKey = async (): Promise<SigningKey> => ({ keyId: `${ids.instance()}#main-key`, privateKey: (await instanceKeys()).privateKey })
