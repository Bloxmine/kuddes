/**
 * Beheer → Servers: what this server is called, who runs it and its rules,
 * how it federates, and what the admin decided about other servers. And
 * /server, the same information for everyone (Over, privacy statement).
 */
import { count, eq, isNotNull, or, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { FEDERATION_MODES, SERVER_INFO_LIMITS, SERVER_POLICIES, type FederationOverview, type KnownServer, type ServerPolicy } from '../../shared/federation'
import { db } from '../db/client'
import { federationServers, friendships, users } from '../db/schema'
import { HttpError, parse } from '../lib/errors'
import { forgetAccount } from '../lib/federation/actors'
import { dropDeliveriesTo, queueState } from '../lib/federation/deliver'
import { accountsFrom, forgetServerPolicies } from '../lib/federation/servers'
import { logAction } from '../lib/memberActions'
import { requireUser, type AppEnv } from '../lib/session'
import { serverInfo, setServerInfo } from '../lib/siteSettings'

function requireAdmin(c: Context<AppEnv>) {
  const me = requireUser(c)
  if (me.forumRole !== 'admin') throw new HttpError(404, 'Niet gevonden.')
  return me
}

const L = SERVER_INFO_LIMITS
const infoSchema = z.object({
  name: z.string().trim().min(1, 'Geef de server een naam.').max(L.name),
  description: z.string().trim().max(L.description),
  adminName: z.string().trim().max(L.adminName),
  contactEmail: z.email('Vul een geldig e-mailadres in.').max(L.contactEmail),
  country: z.string().trim().min(1, 'Vul een land in.').max(L.country),
  hosting: z.string().trim().max(L.hosting),
  mailService: z.string().trim().max(L.mailService),
  rules: z.string().trim().max(L.rules),
  federation: z.enum(Object.keys(FEDERATION_MODES) as [keyof typeof FEDERATION_MODES]),
  fediverse: z.boolean(),
})

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^@?[^@]*@/, ''))
  .pipe(z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$|^localhost:\d+$/, 'Vul een serveradres in, zoals kuddes.example.'))

const policySchema = z.object({
  policy: z.enum(Object.keys(SERVER_POLICIES) as [ServerPolicy]),
  reason: z.string().trim().max(L.reason).default(''),
})

async function overview(): Promise<FederationOverview> {
  const rows = await db.select().from(federationServers).orderBy(federationServers.domain)
  const accounts = await db.select({ domain: users.domain, n: count() }).from(users).where(isNotNull(users.domain)).groupBy(users.domain)
  const friends = await db
    .select({ domain: users.domain, n: count() })
    .from(friendships)
    .innerJoin(users, or(eq(users.id, friendships.requesterId), eq(users.id, friendships.addresseeId)))
    .where(sql`${friendships.status} = 'accepted' and ${users.domain} is not null`)
    .groupBy(users.domain)
  const servers: KnownServer[] = rows.map((r) => ({
    domain: r.domain,
    policy: r.policy,
    reason: r.reason,
    software: r.software,
    weide: r.weide,
    accounts: accounts.find((a) => a.domain === r.domain)?.n ?? 0,
    friendships: friends.find((a) => a.domain === r.domain)?.n ?? 0,
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    failingSince: r.failingSince?.toISOString() ?? null,
  }))
  return { info: serverInfo(), servers, queue: await queueState() }
}

/** A blocked server's accounts (and what they left here) go, and nothing more is sent there. */
async function cutOff(domain: string) {
  for (const account of await accountsFrom(domain)) await forgetAccount(account)
  await dropDeliveriesTo(domain)
}

export const federationAdminRoutes = new Hono<AppEnv>()
  .get('/server', (c) => c.json(serverInfo()))

  .get('/admin/federation', async (c) => {
    requireAdmin(c)
    return c.json(await overview())
  })

  .put('/admin/federation/info', async (c) => {
    const me = requireAdmin(c)
    const input = parse(infoSchema, await c.req.json().catch(() => null))
    const was = serverInfo().federation
    await setServerInfo(input)
    await logAction(me.id, 'servergegevens aangepast', '', was !== input.federation ? `federatie: ${FEDERATION_MODES[input.federation].name.toLowerCase()}` : '')
    return c.json(await overview())
  })

  // A policy for a server: one already known, or a new one (to block or allow it beforehand)
  .put('/admin/federation/servers/:domain', async (c) => {
    const me = requireAdmin(c)
    const domain = parse(domainSchema, c.req.param('domain'))
    const input = parse(policySchema, await c.req.json().catch(() => null))
    if (domain === serverInfo().domain) throw new HttpError(400, 'Dit is je eigen server.')
    await db
      .insert(federationServers)
      .values({ domain, policy: input.policy, reason: input.reason })
      .onConflictDoUpdate({ target: federationServers.domain, set: { policy: input.policy, reason: input.reason } })
    forgetServerPolicies()
    if (input.policy === 'geblokkeerd') await cutOff(domain)
    await logAction(me.id, `server ${SERVER_POLICIES[input.policy].name.toLowerCase()}`, domain, input.reason)
    return c.json(await overview())
  })

  // Forgotten: only a server without accounts here (block it instead to remove those)
  .delete('/admin/federation/servers/:domain', async (c) => {
    const me = requireAdmin(c)
    const domain = parse(domainSchema, c.req.param('domain'))
    if ((await accountsFrom(domain)).length) throw new HttpError(400, 'Er zijn nog accounts van deze server. Blokkeer hem om ze weg te halen.')
    await db.delete(federationServers).where(eq(federationServers.domain, domain))
    forgetServerPolicies()
    await logAction(me.id, 'server vergeten', domain)
    return c.json(await overview())
  })
