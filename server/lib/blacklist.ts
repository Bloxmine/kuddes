import { createHmac, randomBytes } from 'node:crypto'
import { and, eq, inArray, like, not, sql } from 'drizzle-orm'
import type { BlacklistKind } from '../../shared/blacklist'
import { db } from '../db/client'
import { adminLog, blacklist, siteSettings } from '../db/schema'

type Entry = { kind: BlacklistKind; value: string }

/**
 * An address as it's compared: lower case, without a "+label" (naam+spam@ is
 * the same mailbox as naam@), and for Gmail without dots (they're ignored there).
 */
export function normalizeEmail(email: string) {
  const at = email.trim().toLowerCase().lastIndexOf('@')
  if (at < 0) return email.trim().toLowerCase()
  const raw = email.trim().toLowerCase()
  let local = raw.slice(0, at).split('+')[0]
  let domain = raw.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

/** What's stored for an entry: lower case, an address normalized, a domain without the @. */
export function cleanValue(kind: BlacklistKind, value: string) {
  const v = value.trim().toLowerCase()
  if (kind === 'email') return v.includes('*') ? v : normalizeEmail(v)
  if (kind === 'domein') return v.replace(/^\*?@/, '').replace(/^\*\./, '')
  return v.replace(/^@/, '')
}

/** "spammer*" as a test: * is anything, the rest literally. */
const pattern = (value: string) =>
  new RegExp(
    `^${value
      .split('*')
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  )

// ---------------------------------------------------------------- hashing

/**
 * Exact addresses and usernames are kept as a keyed hash (HMAC-SHA-256), like
 * passwords: the list can still say "this address is on it", but the
 * addresses themselves can't be read from it. The key comes from
 * BLACKLIST_KEY, or is made once and kept in site_settings.
 */
let key: Buffer | null = null
export async function hashKey() {
  if (key) return key
  if (process.env.BLACKLIST_KEY) return (key = Buffer.from(process.env.BLACKLIST_KEY))
  await db
    .insert(siteSettings)
    .values({ key: 'blacklistKey', value: randomBytes(32).toString('hex') })
    .onConflictDoNothing()
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, 'blacklistKey'))
  return (key = Buffer.from(String(row.value), 'hex'))
}

const digest = (k: Buffer, kind: BlacklistKind, value: string) => `h:${createHmac('sha256', k).update(`${kind}:${value}`).digest('hex')}`

/** An exact address or username is hashed; a domain or a pattern with * can't be (and isn't about one person). */
export const hashable = (kind: BlacklistKind, value: string) => kind !== 'domein' && !value.includes('*')

/** What Beheer shows of a hashed entry: "j***@gmail.com", "s***2". */
export function mask(kind: BlacklistKind, value: string) {
  if (kind === 'email') {
    const at = value.lastIndexOf('@')
    return `${value.slice(0, 1)}***${value.slice(at)}`
  }
  return value.length > 2 ? `${value.slice(0, 1)}***${value.slice(-1)}` : '***'
}

/** What goes in the table for an entry (already cleaned): a hash and a hint, or the pattern itself. */
export async function stored(kind: BlacklistKind, value: string) {
  if (!hashable(kind, value)) return { value, hint: null }
  return { value: digest(await hashKey(), kind, value), hint: mask(kind, value) }
}

/** Entries made before hashing (or by hand) are hashed at start-up. */
export async function hashPlainEntries() {
  const rows = await db
    .select()
    .from(blacklist)
    .where(and(inArray(blacklist.kind, ['email', 'gebruikersnaam']), not(like(blacklist.value, 'h:%')), not(like(blacklist.value, '%*%'))))
  for (const r of rows) {
    const next = await stored(r.kind, r.value)
    const [clash] = await db
      .select({ id: blacklist.id })
      .from(blacklist)
      .where(and(eq(blacklist.kind, r.kind), eq(blacklist.value, next.value)))
    if (clash) await db.delete(blacklist).where(eq(blacklist.id, r.id))
    else await db.update(blacklist).set(next).where(eq(blacklist.id, r.id))
  }
  if (rows.length) forgetBlacklist()
  // Older Logboek lines spelled the address out; now only masked (j***@gmail.com)
  const anyAddress = '([^\\s@·])[^\\s@·]*@'
  await db
    .update(adminLog)
    .set({ details: sql`regexp_replace(${adminLog.details}, ${anyAddress}, ${'\\1***@'}, 'g')`, target: sql`regexp_replace(${adminLog.target}, ${anyAddress}, ${'\\1***@'}, 'g')` })
    .where(and(inArray(adminLog.action, ['op de zwarte lijst', 'van de zwarte lijst']), like(adminLog.details, '%@%')))
}

/** Whether an address or a username is on an entry (await hashKey() first, for the hashed ones). */
export function matches(entry: Entry, who: { email?: string; username?: string }) {
  if (entry.value.startsWith('h:')) {
    if (!key) return false
    if (entry.kind === 'gebruikersnaam') return !!who.username && digest(key, 'gebruikersnaam', who.username.trim().toLowerCase()) === entry.value
    return !!who.email && digest(key, 'email', normalizeEmail(who.email)) === entry.value
  }
  if (entry.kind === 'gebruikersnaam') return !!who.username && pattern(entry.value).test(who.username.toLowerCase())
  if (!who.email) return false
  const email = normalizeEmail(who.email)
  if (entry.kind === 'email') return pattern(entry.value).test(email)
  // A domain also covers its subdomains (mail.example.org under example.org)
  const domain = email.slice(email.lastIndexOf('@') + 1)
  return pattern(entry.value).test(domain) || domain.endsWith(`.${entry.value}`)
}

// The list is short and asked on every signup; it's read again after a minute or a change
let cached: { at: number; entries: Entry[] } | null = null
export const forgetBlacklist = () => (cached = null)
async function entries() {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), entries: await db.select({ kind: blacklist.kind, value: blacklist.value }).from(blacklist) }
  return cached.entries
}

/** What's on the blacklist of these: the address, the username, or neither. */
export async function blacklisted(who: { email?: string; username?: string }): Promise<{ email: boolean; username: boolean }> {
  await hashKey()
  const list = await entries()
  return {
    email: list.some((e) => e.kind !== 'gebruikersnaam' && matches(e, who)),
    username: list.some((e) => e.kind === 'gebruikersnaam' && matches(e, who)),
  }
}
