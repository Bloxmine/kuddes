/**
 * The links in our mails. A token is 32 random bytes in the link; only its
 * SHA-256 is stored, it works once and it expires. Asking for a new one
 * replaces the old one.
 */
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import type { Context } from 'hono'
import { config } from '../config'
import { db } from '../db/client'
import { emailTokens, type User } from '../db/schema'
import { addressChangedMail, confirmMail, newAddressMail, resetMail, sendMailSoon } from './mail'
import type { AppEnv } from './session'

export type TokenPurpose = (typeof emailTokens.$inferSelect)['purpose']

const HOUR = 60 * 60 * 1000
const LIFETIME: Record<TokenPurpose, number> = { bevestigen: 72 * HOUR, wachtwoord: HOUR, 'nieuw-adres': 72 * HOUR }
/** The page in the app that handles each link. */
const PAGE: Record<TokenPurpose, string> = { bevestigen: '/bevestigen', wachtwoord: '/wachtwoord-herstellen', 'nieuw-adres': '/nieuw-adres' }

const hash = (token: string) => createHash('sha256').update(token).digest('hex')

/** PUBLIC_URL (https://kuddes.example), or in development the address the app runs on. */
function siteUrl(c: Context<AppEnv>) {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '')
  const origin = c.req.header('origin') ?? c.req.header('referer')
  return origin ? new URL(origin).origin : 'http://localhost:5173'
}

async function newLink(c: Context<AppEnv>, user: User, purpose: TokenPurpose, email: string) {
  const token = randomBytes(32).toString('base64url')
  await db.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, purpose)))
  await db.insert(emailTokens).values({ id: hash(token), userId: user.id, purpose, email, expiresAt: new Date(Date.now() + LIFETIME[purpose]) })
  return `${siteUrl(c)}${PAGE[purpose]}?token=${token}`
}

export async function sendConfirmation(c: Context<AppEnv>, user: User) {
  sendMailSoon(confirmMail(user.email, user.nickname, await newLink(c, user, 'bevestigen', user.email)))
}

export async function sendReset(c: Context<AppEnv>, user: User) {
  sendMailSoon(resetMail(user.email, user.nickname, await newLink(c, user, 'wachtwoord', user.email)))
}

export async function sendNewAddress(c: Context<AppEnv>, user: User, email: string) {
  sendMailSoon(newAddressMail(email, user.nickname, await newLink(c, user, 'nieuw-adres', email)))
}

/** After the change: a heads-up to the old address, with a way to take the account back. */
export async function sendAddressChanged(c: Context<AppEnv>, user: User, oldEmail: string) {
  const link = await newLink(c, { ...user, email: oldEmail }, 'wachtwoord', oldEmail)
  sendMailSoon(addressChangedMail(oldEmail, user.nickname, user.email, link))
}

/** Uses up a token: its row if it was valid (and not expired), otherwise null. */
export async function redeemToken(token: string, purpose: TokenPurpose) {
  if (!token || token.length > 100) return null
  const [row] = await db
    .delete(emailTokens)
    .where(and(eq(emailTokens.id, hash(token)), eq(emailTokens.purpose, purpose), gt(emailTokens.expiresAt, new Date())))
    .returning()
  return row ?? null
}

/** The new address a member is waiting to confirm, if any. */
export async function pendingAddress(userId: number) {
  const [row] = await db
    .select({ email: emailTokens.email })
    .from(emailTokens)
    .where(and(eq(emailTokens.userId, userId), eq(emailTokens.purpose, 'nieuw-adres'), gt(emailTokens.expiresAt, new Date())))
  return row?.email ?? null
}

export async function purgeExpiredTokens() {
  await db.delete(emailTokens).where(lt(emailTokens.expiresAt, new Date()))
}
