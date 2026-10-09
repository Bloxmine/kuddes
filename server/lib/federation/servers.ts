/**
 * Other servers and what this server's admin decided about them
 * (Beheer → Servers): blocked servers get nothing and send nothing, "stil"
 * ones can't send new friend requests, and with federation "beperkt" only
 * allowed servers take part.
 */
import { eq, sql } from 'drizzle-orm'
import type { ServerPolicy } from '../../../shared/federation'
import { db } from '../../db/client'
import { federationServers, remoteActors, users } from '../../db/schema'
import { serverDomain, serverInfo } from '../siteSettings'
import { safeFetch } from './http'

// Asked on every request from another server; read again after a minute or a change
let cached: { at: number; policies: Map<string, ServerPolicy> } | null = null
export const forgetServerPolicies = () => (cached = null)

export async function policyOf(domain: string): Promise<ServerPolicy> {
  if (!cached || Date.now() - cached.at > 60_000) {
    const rows = await db.select({ domain: federationServers.domain, policy: federationServers.policy }).from(federationServers)
    cached = { at: Date.now(), policies: new Map(rows.map((r) => [r.domain, r.policy])) }
  }
  // A block on a domain covers its subdomains too
  const host = domain.toLowerCase()
  for (const [d, p] of cached.policies) if (p === 'geblokkeerd' && (host === d || host.endsWith(`.${d}`))) return 'geblokkeerd'
  return cached.policies.get(host) ?? 'normaal'
}

/** Whether this server talks with that one at all. */
export async function mayFederateWith(domain: string) {
  const mode = serverInfo().federation
  if (mode === 'uit' || domain.toLowerCase() === serverDomain()) return false
  const policy = await policyOf(domain)
  if (policy === 'geblokkeerd') return false
  return mode === 'open' || policy === 'toegestaan'
}

export const federationOn = () => serverInfo().federation !== 'uit'

/** Accounts on servers that aren't Kuddes (Mastodon and the like): their posts only show in Overzicht → Fediverse. */
export const fediverseAccounts = sql`(select ${remoteActors.userId} from ${remoteActors} where ${remoteActors.weide} = false)`

/** What software a server runs (from its NodeInfo), for Beheer → Servers; looked up once. */
export async function describeServer(domain: string, origin: string) {
  const [row] = await db.select({ software: federationServers.software }).from(federationServers).where(eq(federationServers.domain, domain))
  if (row?.software) return
  try {
    const index = JSON.parse((await safeFetch(`${origin}/.well-known/nodeinfo`, { headers: { Accept: 'application/json' } })).body) as { links?: { href?: string }[] }
    const href = index.links?.map((l) => l.href).find((h) => h && new URL(h).host === domain)
    if (!href) return
    const info = JSON.parse((await safeFetch(href, { headers: { Accept: 'application/json' } })).body) as { software?: { name?: string; version?: string }; metadata?: { weide?: unknown } }
    const name = [info.software?.name, info.software?.version].filter(Boolean).join(' ').slice(0, 60)
    if (name) await db.update(federationServers).set({ software: name, ...(info.metadata?.weide ? { weide: true } : {}) }).where(eq(federationServers.domain, domain))
  } catch {
    // Not every server has NodeInfo
  }
}

/** Accounts here from that server (and what they left here) go when it's blocked. */
export async function accountsFrom(domain: string) {
  return db.select({ id: users.id, avatarPath: users.avatarPath }).from(users).where(eq(users.domain, domain))
}
