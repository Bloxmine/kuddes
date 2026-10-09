import { blacklisted } from '../lib/blacklist'
import { automationEvent, checkSignup } from '../lib/automations'
import { banOn } from '../lib/ipBans'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { SIGNUP_REASON_MAX, SIGNUP_REASON_MIN } from '../../shared/signup'
import { MIN_AGE, CONSENT_VERSION } from '../../shared/privacy'
import { turnstileEnabled, verifyTurnstile } from '../lib/turnstile'
import { clientIp } from '../lib/clientIp'
import { db } from '../db/client'
import { sessions, users } from '../db/schema'
import { HttpError, parse, GENERIC_ERROR } from '../lib/errors'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password'
import { rateLimit } from '../lib/rateLimit'
import { createSession, destroySession, requireUser, type AppEnv } from '../lib/session'
import { redeemToken, sendAddressChanged, sendConfirmation, sendNewAddress, sendReset } from '../lib/emailTokens'
import { config } from '../config'
import { signupApproval, signupsClosed } from '../lib/siteSettings'
import { mailEnabled } from '../lib/mail'
import { notifyAdminsOfSignup, welcomeMember } from '../lib/signups'
import { toMe } from '../lib/users'

// Usernames that would clash with routes or pretend to be staff
const RESERVED = new Set([
  'admin', 'api', 'kuddes', 'hyves', 'uploads', 'kuddes', 'nieuws', 'suggesties', 'moderator', 'support', 'help', 'root', 'system',
  'aanmelden', 'inloggen', 'instellingen', 'vrienden', 'zoeken', 'profiel',
])

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Je gebruikersnaam moet minstens 3 tekens hebben.')
  .max(20, 'Je gebruikersnaam mag maximaal 20 tekens hebben.')
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Gebruik alleen letters, cijfers, punt, streepje en underscore.')
  .refine((u) => !RESERVED.has(u), 'Deze gebruikersnaam is niet beschikbaar.')

const registerSchema = z.object({
  username: usernameSchema,
  email: z.email('Vul een geldig e-mailadres in.').trim().max(254),
  password: z
    .string()
    .min(8, 'Je wachtwoord moet minstens 8 tekens hebben.')
    .max(200, 'Dat wachtwoord is te lang.'),
  name: z.string().trim().min(1, 'Vul je naam in.').max(60, 'Je naam is te lang.'),
  captcha: z.string().max(2048).optional(),
  reason: z.string().trim().max(SIGNUP_REASON_MAX, `Houd het kort: maximaal ${SIGNUP_REASON_MAX} tekens.`).optional(),
  // The AVG: they agree to the privacy statement, and are old enough to do so themselves
  privacy: z.literal(true, { error: 'Je moet akkoord gaan met de privacyverklaring om lid te worden.' }),
  oldEnough: z.literal(true, { error: `Je moet ${MIN_AGE} jaar of ouder zijn, of toestemming hebben van je ouders.` }),
})

const passwordSchema = z.string().min(8, 'Je wachtwoord moet minstens 8 tekens hebben.').max(200, 'Dat wachtwoord is te lang.')
const tokenSchema = z.object({ token: z.string().min(10).max(100) })
const expired = () => new HttpError(400, 'Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.')

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Vul je gebruikersnaam in.').max(254),
  password: z.string().min(1, 'Vul je wachtwoord in.').max(200),
})

export const authRoutes = new Hono<AppEnv>()
  .get('/me', async (c) => {
    const user = c.get('user')
    return c.json(user ? await toMe(user) : null)
  })

  .post(
    '/register',
    // Trying (typos, a name that's taken) is fine; making lots of accounts isn't
    rateLimit('aanmeldpogingen', 30, 60 * 60 * 1000, { message: 'Je hebt het heel vaak geprobeerd. Wacht even en probeer het over een kwartiertje opnieuw.' }),
    rateLimit('nieuwe accounts', 10, 24 * 60 * 60 * 1000, { successOnly: true, message: 'Vanaf dit adres zijn vandaag al veel accounts gemaakt. Probeer het morgen opnieuw.' }),
    async (c) => {
      const input = parse(registerSchema, await c.req.json().catch(() => null))
      // On the waitlist the admin wants to know who's knocking
      if (signupApproval() && (input.reason ?? '').length < SIGNUP_REASON_MIN) {
        const message = 'Vertel in een paar woorden waarom je lid wilt worden.'
        throw new HttpError(400, message, { reason: message })
      }

      // The quiet mode can close sign-ups for a while
      if (signupsClosed()) throw new HttpError(503, 'Aanmelden kan op dit moment even niet. Probeer het over een tijdje nog eens.')
      // A banned connection can't make accounts; it gets an ordinary error, not why
      if (await banOn(clientIp(c), 'aanmelden')) throw new HttpError(500, GENERIC_ERROR)
      // Automations for "Iemand wil een account maken" can still refuse it (the same plain answer as the blacklist)
      if (await checkSignup({ username: input.username, name: input.name, email: input.email }, clientIp(c)))
        throw new HttpError(403, 'Met deze gegevens kun je geen account maken.')
      // On the admin's blacklist: no new account with that address or name
      const banned = await blacklisted({ email: input.email, username: input.username })
      if (banned.email) throw new HttpError(403, 'Met dit e-mailadres kun je geen account maken.', { email: 'Met dit e-mailadres kun je geen account maken.' })
      if (banned.username) throw new HttpError(403, 'Deze gebruikersnaam kun je niet gebruiken.', { username: 'Deze gebruikersnaam kun je niet gebruiken.' })

      const [taken] = await db
        .select({ username: users.username, email: users.email })
        .from(users)
        .where(sql`${users.username} = ${input.username} or lower(${users.email}) = lower(${input.email})`)
        .limit(1)
      if (taken?.username === input.username) {
        throw new HttpError(409, 'Deze gebruikersnaam is al bezet.', { username: 'Deze gebruikersnaam is al bezet.' })
      }
      if (taken) {
        throw new HttpError(409, 'Er is al een account met dit e-mailadres.', {
          email: 'Er is al een account met dit e-mailadres.',
        })
      }
      // Last: a captcha token works only once, so it's only used up when everything else is right
      if (turnstileEnabled() && !(await verifyTurnstile(input.captcha ?? '', clientIp(c)))) {
        const message = 'De controle of je een mens bent is niet gelukt. Probeer het nog eens.'
        throw new HttpError(400, message, { captcha: message })
      }

      const [user] = await db
        .insert(users)
        .values({
          username: input.username,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          name: input.name,
          nickname: input.name.split(/\s+/)[0],
          signupReason: signupApproval() ? input.reason : null,
          privacyAcceptedAt: new Date(),
          privacyVersion: CONSENT_VERSION,
          lastSeenAt: new Date(),
        })
        .returning()

      await createSession(c, user.id)
      automationEvent('aanmelding', { member: user, ip: clientIp(c) })
      // On the waitlist the admin approves new members; otherwise they confirm their address by mail
      if (signupApproval()) await notifyAdminsOfSignup(user)
      else await sendConfirmation(c, user)
      return c.json(await toMe(user), 201)
    },
  )

  // What the sign-up and "wachtwoord vergeten" pages should explain
  .get('/options', (c) => c.json({ approval: signupApproval(), closed: signupsClosed(), mail: mailEnabled(), captcha: turnstileEnabled() ? config.turnstile.siteKey : null }))

  // The link in the confirmation mail (the page posts the token, so link scanners can't use it up)
  .post('/verify', rateLimit('bevestigen', 30, 60 * 60 * 1000), async (c) => {
    const { token } = parse(tokenSchema, await c.req.json().catch(() => null))
    // On the waitlist a confirmed address doesn't let you in; the admin does
    if (signupApproval()) throw new HttpError(400, 'Nieuwe leden worden nu door de beheerder goedgekeurd; je hoeft je adres niet meer te bevestigen. Je krijgt bericht zodra je bent goedgekeurd.')
    const row = await redeemToken(token, 'bevestigen')
    if (!row) throw expired()
    const [user] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date(), signupReason: null })
      .where(and(eq(users.id, row.userId), eq(users.email, row.email), isNull(users.emailVerifiedAt)))
      .returning()
    if (!user) throw expired()
    await welcomeMember(user)
    const viewer = c.get('user')
    return c.json(viewer?.id === user.id ? await toMe(user) : null)
  })

  .post('/verify/resend', rateLimit('bevestigingsmail', 3, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    if (me.emailVerifiedAt) throw new HttpError(400, 'Je e-mailadres is al bevestigd.')
    if (signupApproval()) throw new HttpError(400, 'Je aanmelding wacht op goedkeuring door de beheerder; je hoeft niets te bevestigen.')
    await sendConfirmation(c, me)
    return c.body(null, 204)
  })

  // "Wachtwoord vergeten": always the same answer, so nobody can find out who has an account
  .post('/forgot', rateLimit('wachtwoord vergeten', 5, 60 * 60 * 1000), async (c) => {
    const { email } = parse(z.object({ email: z.string().trim().toLowerCase().min(3, 'Vul je e-mailadres of gebruikersnaam in.').max(254) }), await c.req.json().catch(() => null))
    const [user] = await db
      .select()
      .from(users)
      .where(email.includes('@') ? sql`lower(${users.email}) = ${email}` : eq(users.username, email))
      .limit(1)
    if (user && !user.blockedAt && !user.isDummy && !user.domain) await sendReset(c, user)
    return c.body(null, 204)
  })

  // A new password from the link: logs out everywhere else, and in here
  .post('/reset', rateLimit('wachtwoord herstellen', 10, 60 * 60 * 1000), async (c) => {
    const input = parse(tokenSchema.extend({ password: passwordSchema }), await c.req.json().catch(() => null))
    const row = await redeemToken(input.token, 'wachtwoord')
    if (!row) throw expired()
    const [user] = await db
      .update(users)
      // The mail reached them, so the address works too (but on the waitlist only the admin lets you in)
      .set({ passwordHash: await hashPassword(input.password), ...(signupApproval() ? {} : { emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` }) })
      .where(and(eq(users.id, row.userId), eq(users.email, row.email)))
      .returning()
    if (!user) throw expired()
    if (user.blockedAt) throw new HttpError(403, 'Dit account is geblokkeerd.')
    await db.delete(sessions).where(eq(sessions.userId, user.id))
    await createSession(c, user.id)
    return c.json(await toMe(user))
  })

  // A new address: confirmed from a mail to that address first; the old one keeps working until then
  .post('/email', rateLimit('e-mailadres wijzigen', 5, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ email: z.email('Vul een geldig e-mailadres in.').trim().max(254), password: z.string().min(1, 'Vul je wachtwoord in.').max(200) }), await c.req.json().catch(() => null))
    if (!(await verifyPassword(input.password, me.passwordHash))) throw new HttpError(400, 'Je wachtwoord klopt niet.', { password: 'Je wachtwoord klopt niet.' })
    if (input.email.toLowerCase() === me.email.toLowerCase()) throw new HttpError(400, 'Dit is al je e-mailadres.', { email: 'Dit is al je e-mailadres.' })
    if ((await blacklisted({ email: input.email })).email) throw new HttpError(403, 'Dit e-mailadres kun je niet gebruiken.', { email: 'Dit e-mailadres kun je niet gebruiken.' })
    const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${input.email})`).limit(1)
    if (taken) throw new HttpError(409, 'Er is al een account met dit e-mailadres.', { email: 'Er is al een account met dit e-mailadres.' })
    // Without mail there's nothing to confirm it with, and a member who never confirmed their first address just gets it replaced
    if (!mailEnabled() || !me.emailVerifiedAt) {
      const [user] = await db.update(users).set({ email: input.email }).where(eq(users.id, me.id)).returning()
      if (!me.emailVerifiedAt && !signupApproval()) await sendConfirmation(c, user)
      return c.json(await toMe(user))
    }
    await sendNewAddress(c, me, input.email)
    return c.json(await toMe(me))
  })

  .post('/email/confirm', rateLimit('bevestigen', 30, 60 * 60 * 1000), async (c) => {
    const { token } = parse(tokenSchema, await c.req.json().catch(() => null))
    const row = await redeemToken(token, 'nieuw-adres')
    if (!row) throw expired()
    const [old] = await db.select().from(users).where(eq(users.id, row.userId))
    if (!old) throw expired()
    const [taken] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = lower(${row.email}) and ${users.id} <> ${old.id}`).limit(1)
    if (taken) throw new HttpError(409, 'Er is intussen al een account met dit e-mailadres.')
    // Put on the blacklist between asking and confirming
    if ((await blacklisted({ email: row.email })).email) throw new HttpError(403, 'Dit e-mailadres kun je niet gebruiken.')
    const [user] = await db.update(users).set({ email: row.email, emailVerifiedAt: new Date() }).where(eq(users.id, old.id)).returning()
    await sendAddressChanged(c, user, old.email)
    const viewer = c.get('user')
    return c.json(viewer?.id === user.id ? await toMe(user) : null)
  })

  .post('/login', rateLimit('inloggen', 10, 15 * 60 * 1000), async (c) => {
    const input = parse(loginSchema, await c.req.json().catch(() => null))
    // Log in with username or e-mail address
    const [user] = await db
      .select()
      .from(users)
      .where(input.username.includes('@') ? sql`lower(${users.email}) = ${input.username}` : eq(users.username, input.username))
      .limit(1)

    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !ok) throw new HttpError(401, 'Onbekende gebruikersnaam of verkeerd wachtwoord.')
    if (user.blockedAt) throw new HttpError(403, `Dit account is geblokkeerd.${user.blockReason ? ` Reden: ${user.blockReason}` : ''}`)
    // Not from a banned connection (the admin can always log in); it gets an ordinary error, not why
    if (user.forumRole !== 'admin' && (await banOn(clientIp(c), 'aanmelden'))) throw new HttpError(500, GENERIC_ERROR)

    await createSession(c, user.id)
    automationEvent('inloggen', { member: user, awayMs: user.lastSeenAt ? Date.now() - user.lastSeenAt.getTime() : Infinity })
    return c.json(await toMe(user))
  })

  .post('/logout', async (c) => {
    await destroySession(c)
    return c.body(null, 204)
  })
