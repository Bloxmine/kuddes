/**
 * Sending activities to other servers: each goes in federation_deliveries
 * and a clock delivers them, signed by the member (or the server's actor).
 * When a server is down it's tried again with growing pauses, for about
 * three days; a server that answers "never" (4xx) isn't asked again.
 */
import { asc, count, eq, gt, lte, sql } from 'drizzle-orm'
import { db } from '../../db/client'
import { federationDeliveries, federationServers, users } from '../../db/schema'
import { postSigned, type SigningKey } from './http'
import { instanceSigningKey, signingKeyOf } from './keys'
import { mayFederateWith } from './servers'

const MAX_ATTEMPTS = 12
const BATCH = 20

/** Put an activity on its way to these inboxes (each once), signed by `senderId` (null: the server). */
export async function enqueue(inboxes: Iterable<string>, activity: object, senderId: number | null) {
  const unique = [...new Set(inboxes)]
  const allowed: string[] = []
  for (const inbox of unique) if (await mayFederateWith(new URL(inbox).host)) allowed.push(inbox)
  if (!allowed.length) return
  await db.insert(federationDeliveries).values(allowed.map((inbox) => ({ inbox, body: activity, senderId })))
  kick()
}

/** Right away, without the queue: for an account that's being deleted (its key goes with it). */
export function sendNow(inboxes: Iterable<string>, activity: object, key: SigningKey) {
  const body = JSON.stringify(activity)
  for (const inbox of new Set(inboxes)) postSigned(inbox, body, key).catch(() => {})
}

// Half a minute, then doubling up to six hours between tries
const pause = (attempts: number) => Math.min(30_000 * 2 ** attempts, 6 * 60 * 60 * 1000)

async function deliver(row: typeof federationDeliveries.$inferSelect) {
  const host = new URL(row.inbox).host
  let key: SigningKey
  if (row.senderId) {
    const [sender] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, row.senderId))
    if (!sender) return db.delete(federationDeliveries).where(eq(federationDeliveries.id, row.id))
    key = await signingKeyOf(sender)
  } else key = await instanceSigningKey()
  let status = 0
  let error = ''
  try {
    status = await postSigned(row.inbox, JSON.stringify(row.body), key)
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  if (status >= 200 && status < 300) {
    await db.delete(federationDeliveries).where(eq(federationDeliveries.id, row.id))
    await db.update(federationServers).set({ lastSeenAt: new Date(), failingSince: null }).where(eq(federationServers.domain, host))
    return
  }
  // A clear "no" (gone, not allowed, not understood) isn't asked again; busy or down is
  const final = (status >= 400 && status < 500 && status !== 408 && status !== 429) || row.attempts + 1 >= MAX_ATTEMPTS
  if (final) await db.delete(federationDeliveries).where(eq(federationDeliveries.id, row.id))
  else
    await db
      .update(federationDeliveries)
      .set({ attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + pause(row.attempts)), lastError: error || `HTTP ${status}` })
      .where(eq(federationDeliveries.id, row.id))
  if (!status || status >= 500)
    await db
      .update(federationServers)
      .set({ failingSince: sql`coalesce(${federationServers.failingSince}, now())` })
      .where(eq(federationServers.domain, host))
}

let running = false
let again = false
async function run() {
  if (running) return void (again = true)
  running = true
  try {
    do {
      again = false
      const due = await db.select().from(federationDeliveries).where(lte(federationDeliveries.nextAttemptAt, new Date())).orderBy(asc(federationDeliveries.id)).limit(BATCH)
      await Promise.all(due.map((row) => deliver(row).catch((e) => console.error('[federatie] delivery failed', row.inbox, e))))
      if (due.length === BATCH) again = true
    } while (again)
  } finally {
    running = false
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
/** Deliver soon (what was just queued goes out together). */
function kick() {
  timer ??= setTimeout(() => {
    timer = null
    run().catch(console.error)
  }, 500)
}

export function startDeliveryClock() {
  setInterval(() => run().catch(console.error), 15_000).unref()
  kick()
}

/** For Beheer: how many are waiting, and how many of those failed before. */
export async function queueState() {
  const [[waiting], [failing]] = await Promise.all([
    db.select({ n: count() }).from(federationDeliveries),
    db.select({ n: count() }).from(federationDeliveries).where(gt(federationDeliveries.attempts, 0)),
  ])
  return { waiting: waiting.n, failing: failing.n }
}

/** Nothing more to a server that's blocked. */
export async function dropDeliveriesTo(domain: string) {
  await db.delete(federationDeliveries).where(sql`split_part(split_part(${federationDeliveries.inbox}, '://', 2), '/', 1) = ${domain}`)
}
