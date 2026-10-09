import { approveMember } from '../lib/signups'
import { sendConfirmation } from '../lib/emailTokens'
import { mailEnabled, sendMail, testMail } from '../lib/mail'
import { safety, setSafety, setSignupMode, signupMode } from '../lib/siteSettings'
import { usernameSchema } from './auth'
import { recipeHref } from '../../shared/recipes'
import { kuddePhotoHref } from '../../shared/kuddes'
import { randomBytes } from 'node:crypto'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { MUSIC_UPLOAD_REASONS } from '../../shared/music'
import { absolute } from '../lib/seo'
import type { AdminContent, AdminLogEntry, AdminMember, AdminSettings, AdminNews, AdminOverview, AdminReport, AdminUpload, AdminVideoRequest, ContentKind, MemberSort, UploadKind } from '../../shared/admin'
import { CONTENT_KINDS, UPLOAD_KINDS } from '../../shared/admin'
import { SUGGESTION_NOTE_MAX, SUGGESTION_STATUSES, SUGGESTION_STATUS_KEYS, isSettled, type SuggestionStatus } from '../../shared/suggestions'
import { notify } from '../lib/notifications'
import { threadHref } from '../../shared/forum'
import { config } from '../config'
import { db } from '../db/client'
import {
  activityComments,
  adminLog,
  automations,
  blacklist,
  contentReports,
  hiddenItems,
  botWarnings,
  bots,
  ipBans,
  forumBans,
  forumPosts,
  forumProfileComments,
  forumSections,
  forumThreads,
  glitters,
  recipes,
  knuffels,
  kuddeEvents,
  kuddes,
  kuddePhotos,
  kuddePosts,
  news,
  photos,
  sessions,
  statuses,
  suggestions,
  users,
  videoComments,
  videoUploadRequests,
  videos,
  type User,
} from '../db/schema'
import { deleteAccount } from '../lib/accounts'
import { blacklistMember, blockMember, setRight } from '../lib/memberActions'
import { cleanValue, forgetBlacklist, hashable, hashKey, mask, matches, stored } from '../lib/blacklist'
import { applyBotOptions, lmModels, lmStudio, runAi, setLmStudio, skipPast } from '../lib/bots'
import { forgetWatcher } from '../lib/moderation'
import { removeReported, restore } from '../lib/reports'
import { REPORT_KINDS, SAFETY_LIMITS, type ReportKind, type ReportedItem } from '../../shared/safety'
import { forgetAutomations, runAutomation } from '../lib/automations'
import { AUTO_ACTIONS, AUTO_LIMITS, AUTO_RIGHTS, AUTO_TRIGGERS, type AutoActionKind, type AutoRight, type AutoTrigger, type Automation } from '../../shared/automations'
import { BEHAVIOURS, MODERATION_LIMITS, WATCH_PLACES, type Behaviour, type BotWarning, type WatchPlace } from '../../shared/bots'
import { BOT_ABILITIES, BOT_ACTIONS, BOT_DELAYS, BOT_KINDS, BOT_LIMITS, BOT_TRIGGERS, type AdminBot, type BotAbility, type BotAction, type BotKind, type BotTrigger } from '../../shared/bots'
import { clientIp } from '../lib/clientIp'
import { banOn, forgetIpBans, formatRange, inRange, parseRange } from '../lib/ipBans'
import { IP_BAN_DURATIONS, IP_BAN_LIMITS, IP_BAN_SCOPES, type IpBan, type IpBanDuration, type IpBanScope } from '../../shared/ipBans'
import { BLACKLIST_KINDS, BLACKLIST_LIMITS, type BlacklistEntry, type BlacklistKind } from '../../shared/blacklist'
import { HttpError, notFound, parse } from '../lib/errors'
import { hashPassword } from '../lib/password'
import { rateLimit } from '../lib/rateLimit'
import { isOnline, toSummary, uploadUrl } from '../lib/serialize'
import { createSession, destroySession, requireUser, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { bodyLimit } from 'hono/body-limit'
import { findUser, summaryColumns } from '../lib/users'
import { deliverMessage } from '../lib/videoAccess'
import { VIDEO_UPLOAD_REASONS, type VideoUploadReason } from '../../shared/videos'
import { removeFiles } from './videos'

/** Every route here is for the site admin only. */
function requireAdmin(c: Context<AppEnv>): User {
  const me = requireUser(c)
  if (me.forumRole !== 'admin') throw new HttpError(403, 'Alleen de beheerder kan dit doen.')
  return me
}

async function log(admin: User, action: string, target = '', details = '') {
  await db.insert(adminLog).values({ adminId: admin.id, action, target, details })
}

const newPassword = () => randomBytes(9).toString('base64url')

/** Total size of all uploaded files, for the overview. */
async function folderSize(dir: string): Promise<number> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  let total = 0
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) total += await folderSize(full)
    else total += (await stat(full).catch(() => ({ size: 0 }))).size
  }
  return total
}

async function toMembers(rows: User[]): Promise<AdminMember[]> {
  if (!rows.length) return []
  const ids = rows.map((u) => u.id)
  const tally = async (table: typeof statuses | typeof photos | typeof videos) =>
    db.select({ userId: table.userId, n: count() }).from(table).where(inArray(table.userId, ids)).groupBy(table.userId)
  const [s, p, v, f, bans] = await Promise.all([
    tally(statuses),
    tally(photos),
    tally(videos),
    db.select({ userId: forumPosts.userId, n: count() }).from(forumPosts).where(inArray(forumPosts.userId, ids)).groupBy(forumPosts.userId),
    db.select({ userId: forumBans.userId }).from(forumBans).where(inArray(forumBans.userId, ids)),
  ])
  const n = (list: { userId: number | null; n: number }[], id: number) => list.find((r) => r.userId === id)?.n ?? 0
  // The same (cached) check the server makes on every request
  const ipBansOn = await Promise.all(rows.map((u) => (u.lastIp ? banOn(u.lastIp) : null)))
  return rows.map((u, i) => ({
    ...toSummary(u),
    email: u.email,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt?.toISOString() ?? null,
    lastIp: u.lastIp,
    ipBan: (() => {
      const ban = ipBansOn[i]
      return ban ? { id: ban.id, range: formatRange(ban.net), scope: ban.scope, expiresAt: ban.expiresAt?.toISOString() ?? null } : null
    })(),
    blockedAt: u.blockedAt?.toISOString() ?? null,
    blockReason: u.blockReason,
    isDummy: u.isDummy,
    videoUploadAllowed: u.videoUploadAllowed || u.forumRole === 'admin',
    musicUploadAllowed: u.musicUploadAllowed || u.forumRole === 'admin',
    radioAllowed: u.radioAllowed || u.forumRole === 'admin',
    approved: !!u.emailVerifiedAt,
    signupReason: u.signupReason,
    city: u.city,
    isAdmin: u.forumRole === 'admin',
    forumBanned: bans.some((b) => b.userId === u.id),
    counts: { statuses: n(s, u.id), photos: n(p, u.id), videos: n(v, u.id), forumPosts: n(f, u.id) },
  }))
}

/** The admin account can't be blocked, deleted or taken over from the website. */
function notTheAdmin(user: User) {
  if (user.forumRole === 'admin') throw new HttpError(400, 'Dit is het beheerdersaccount.')
}

const blockUser = blockMember

/** Reported posts still waiting for the admin (each post once, however many reports). */
const openReportedItems = async () =>
  (await db.select({ n: sql<number>`count(distinct (${contentReports.kind}, ${contentReports.targetId}))::int` }).from(contentReports).where(eq(contentReports.status, 'open')))[0].n

/** What a blacklist entry may look like: an address with an @, a domain with a dot, a name of name characters (all with * allowed). */
function checkEntry(kind: BlacklistKind, value: string) {
  const bad = (m: string) => new HttpError(400, m, { value: m })
  if (!value.replace(/\*/g, '')) throw bad('Vul meer in dan alleen een sterretje.')
  if (kind === 'email' && !/^[^@\s]+@[^@\s]+$/.test(value)) throw bad('Een e-mailadres heeft een @, bijv. naam@example.org.')
  if (kind === 'domein' && !/^[a-z0-9*.-]+\.[a-z0-9*-]+$/.test(value)) throw bad('Een domein is zoiets als example.org.')
  if (kind === 'gebruikersnaam' && !/^[a-z0-9_.*-]+$/.test(value)) throw bad('Een gebruikersnaam heeft alleen letters, cijfers, _ . en -.')
}

const ipBanSchema = z.object({
  duration: z.enum(Object.keys(IP_BAN_DURATIONS) as [IpBanDuration]),
  scope: z.enum(Object.keys(IP_BAN_SCOPES) as [IpBanScope]),
  reason: z.string().trim().max(IP_BAN_LIMITS.reason).default(''),
})

/** A new IP ban, never on the admin's own connection (that would lock the admin out). */
async function addIpBan(c: Context<AppEnv>, admin: User, range: string, input: z.infer<typeof ipBanSchema>, about: string) {
  const net = parseRange(range)
  if (typeof net === 'string') throw new HttpError(400, net, { range: net })
  if (inRange(net, clientIp(c))) throw new HttpError(400, 'Hiermee zou je jezelf buitensluiten: je bent nu zelf op dit adres.', { range: 'Dit is je eigen verbinding.' })
  const days = IP_BAN_DURATIONS[input.duration].days
  const [row] = await db
    .insert(ipBans)
    .values({ range: formatRange(net), scope: input.scope, reason: input.reason, expiresAt: days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null })
    .returning()
  forgetIpBans()
  await log(admin, 'IP geband', about || row.range, [IP_BAN_DURATIONS[input.duration].name, IP_BAN_SCOPES[input.scope].name.toLowerCase(), input.reason].filter(Boolean).join(' · '))
  return row
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Kies een tijd, bijv. 09:00.')
const botSettingsSchema = z
  .object({
    enabled: z.boolean(),
    options: z.object({
      acceptFriends: z.boolean(),
      readMessages: z.boolean(),
      openToAll: z.boolean(),
      delaySeconds: z.union(BOT_DELAYS.map((d) => z.literal(d)) as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
      maxPerHour: z.number().int().min(1).max(BOT_LIMITS.actionsPerHour),
    }),
    moderation: z.object({
      enabled: z.boolean(),
      words: z
        .array(z.string().trim().min(1).max(MODERATION_LIMITS.word, `Een woord mag maximaal ${MODERATION_LIMITS.word} tekens hebben.`))
        .max(MODERATION_LIMITS.words, `Maximaal ${MODERATION_LIMITS.words} woorden.`)
        // Doubles and empty lines out, and a word that's only an asterisk would match everything
        .transform((ws) => [...new Set(ws.map((w) => w.toLowerCase()))].filter((w) => w.replace(/\*/g, '').length >= 2)),
      places: z.array(z.enum(Object.keys(WATCH_PLACES) as [WatchPlace])).max(Object.keys(WATCH_PLACES).length),
      behaviours: z.object(
        Object.fromEntries(
          (Object.keys(BEHAVIOURS) as Behaviour[]).map((b) => [
            b,
            z.object({ on: z.boolean(), count: z.number().int().min(0).max(MODERATION_LIMITS.count), minutes: z.number().int().min(0).max(MODERATION_LIMITS.minutes) }),
          ]),
        ) as Record<Behaviour, z.ZodObject<{ on: z.ZodBoolean; count: z.ZodNumber; minutes: z.ZodNumber }>>,
      ),
      onWord: z.object({ warn: z.boolean(), remove: z.boolean(), report: z.boolean() }),
      onBehaviour: z.object({ warn: z.boolean(), report: z.boolean() }),
      warning: z.string().trim().min(1, 'Schrijf de waarschuwing.').max(MODERATION_LIMITS.warning),
      reportAfter: z.number().int().min(0).max(50),
    }),
    rules: z
      .array(
        z.object({
          id: z.string().regex(/^[\w-]{1,40}$/),
          trigger: z.enum(Object.keys(BOT_TRIGGERS) as [BotTrigger]),
          action: z.enum(Object.keys(BOT_ACTIONS) as [BotAction]),
          text: z.string().trim().max(BOT_LIMITS.text, `Een tekst mag maximaal ${BOT_LIMITS.text} tekens hebben.`),
          time: hhmm,
          enabled: z.boolean(),
        }),
      )
      .max(BOT_LIMITS.rules, `Maximaal ${BOT_LIMITS.rules} regels.`),
    instructions: z.string().trim().max(BOT_LIMITS.instructions, `Instructies mogen maximaal ${BOT_LIMITS.instructions} tekens hebben.`),
    model: z.string().trim().max(BOT_LIMITS.model),
    triggers: z.array(z.enum(Object.keys(BOT_TRIGGERS) as [BotTrigger])).max(Object.keys(BOT_TRIGGERS).length),
    abilities: z.array(z.enum(Object.keys(BOT_ABILITIES) as [BotAbility])).max(Object.keys(BOT_ABILITIES).length),
    dailyAt: hhmm,
  })
  // A knuffel or message needs someone to go to: "Elke dag" has nobody
  .superRefine((b, ctx) => {
    for (const [i, rule] of b.rules.entries()) {
      if (rule.enabled && !rule.text) ctx.addIssue({ code: 'custom', path: ['rules', i, 'text'], message: 'Schrijf wat de bot moet zeggen.' })
      if (BOT_ACTIONS[rule.action].member && !BOT_TRIGGERS[rule.trigger].member)
        ctx.addIssue({ code: 'custom', path: ['rules', i, 'action'], message: `Bij “${BOT_TRIGGERS[rule.trigger].name}” is er geen lid om een knuffel of bericht naar te sturen; kies WieWatWaar.` })
    }
  })

const automationSchema = z.object({
  name: z.string().trim().min(1, 'Geef de automatisering een naam.').max(AUTO_LIMITS.name),
  enabled: z.boolean(),
  trigger: z.enum(Object.keys(AUTO_TRIGGERS) as [AutoTrigger]),
  time: hhmm,
  // 0: no minimum (every new visit); otherwise at least the 5 minutes that make a new visit
  awayMinutes: z.union([z.literal(0), z.number().int().min(5).max(60 * 24 * 365)]),
  places: z.array(z.enum(Object.keys(WATCH_PLACES) as [WatchPlace])).max(Object.keys(WATCH_PLACES).length),
  conditions: z.object({
    members: z
      .array(z.string().trim().toLowerCase().max(40))
      .max(AUTO_LIMITS.members)
      .transform((l) => [...new Set(l.map((u) => u.replace(/^@/, '')).filter(Boolean))]),
    words: z
      .array(z.string().trim().max(MODERATION_LIMITS.word))
      .max(AUTO_LIMITS.words)
      .transform((l) => [...new Set(l.map((w) => w.toLowerCase()))].filter((w) => w.replace(/\*/g, '').length >= 2)),
    awayDays: z.number().int().min(0).max(3650),
    minAgeDays: z.number().int().min(0).max(3650),
    maxAgeDays: z.number().int().min(0).max(3650),
    once: z.boolean(),
  }),
  actions: z
    .array(
      z.object({
        kind: z.enum(Object.keys(AUTO_ACTIONS) as [AutoActionKind]),
        text: z.string().trim().max(AUTO_LIMITS.text),
        from: z.number().int().positive().nullable(),
        right: z.enum(Object.keys(AUTO_RIGHTS) as [AutoRight]),
        grant: z.boolean(),
        duration: z.enum(Object.keys(IP_BAN_DURATIONS) as [IpBanDuration]),
        scope: z.enum(Object.keys(IP_BAN_SCOPES) as [IpBanScope]),
      }),
    )
    .min(1, 'Kies minstens één actie.')
    .max(AUTO_LIMITS.actions, `Maximaal ${AUTO_LIMITS.actions} acties.`),
})
  // Things that can't work together are said straight away, not found out later
  .superRefine((a, ctx) => {
    for (const [i, x] of a.actions.entries()) {
      const def = AUTO_ACTIONS[x.kind]
      if (x.kind === 'weigeren' && a.trigger !== 'aanmelden') ctx.addIssue({ code: 'custom', path: ['actions', i], message: 'Weigeren kan alleen bij “Iemand wil een account maken”.' })
      if (def.member && a.trigger === 'aanmelden') ctx.addIssue({ code: 'custom', path: ['actions', i], message: `“${def.name}” kan pas als het account bestaat; kies “Nieuw account gemaakt”.` })
      if (def.member && a.trigger === 'dagelijks' && !a.conditions.members.length)
        ctx.addIssue({ code: 'custom', path: ['actions', i], message: `“${def.name}” heeft een lid nodig: zet leden bij de voorwaarden.` })
      if ((x.kind === 'knuffel' || x.kind === 'wiewatwaar') && !x.from) ctx.addIssue({ code: 'custom', path: ['actions', i], message: `Kies bij “${def.name}” een bot.` })
      if (def.text && x.kind !== 'blokkeren' && x.kind !== 'zwarte_lijst' && !x.text) ctx.addIssue({ code: 'custom', path: ['actions', i], message: `Schrijf een tekst bij “${def.name}”.` })
    }
  })

const toAutomation = (r: typeof automations.$inferSelect): Automation => ({ ...r.config, id: r.id, runs: r.runs, lastRunAt: r.lastRunAt?.toISOString() ?? null, lastError: r.lastError })

async function botOf(username: string) {
  const user = await findUser(username)
  const [row] = await db.select().from(bots).where(eq(bots.userId, user.id))
  if (!row || !user.isBot) throw notFound('Deze bot bestaat niet.')
  return { user, row }
}

const toAdminBot = (row: typeof bots.$inferSelect, user: User): AdminBot => ({
  user: toSummary(user),
  kind: row.kind,
  enabled: row.enabled,
  options: row.options,
  moderation: row.moderation,
  rules: row.rules,
  instructions: row.instructions,
  model: row.model,
  triggers: row.triggers,
  abilities: row.abilities,
  dailyAt: row.dailyAt,
  runs: row.runs,
  lastRunAt: row.lastRunAt?.toISOString() ?? null,
  lastError: row.lastError,
})

/** Accounts an entry covers (never the admin's). */
async function accountsOn(entries: { kind: BlacklistKind; value: string }[]) {
  await hashKey()
  const all = await db.select({ id: users.id, username: users.username, nickname: users.nickname, email: users.email, blockedAt: users.blockedAt, forumRole: users.forumRole }).from(users)
  return entries.map((e) => all.filter((u) => u.forumRole !== 'admin' && matches(e, u)))
}

const newsSchema = z.object({
  title: z.string().trim().min(3, 'Geef het bericht een titel.').max(120),
  label: z.string().trim().min(1).max(40).default('Nieuws & updates'),
  summary: z.string().trim().max(300).default(''),
  body: z.string().trim().max(20_000).default(''),
  // An image uploaded for the news (POST /admin/news/images)
  bannerPath: z.string().regex(/^news\/[0-9a-f]{32}\.webp$/, 'Onbekende afbeelding.').nullable().default(null),
  published: z.boolean().default(true),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

const slugify = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'nieuws'

function toAdminNews(row: typeof news.$inferSelect, author: string | null): AdminNews {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    title: row.title,
    summary: row.summary,
    body: row.body,
    bannerPath: row.bannerPath,
    bannerUrl: uploadUrl(row.bannerPath),
    published: row.published,
    publishedAt: row.publishedAt.toISOString(),
    author,
    updatedAt: row.updatedAt.toISOString(),
  }
}

const settings = (): AdminSettings => ({ signupMode: signupMode(), mailEnabled: mailEnabled(), mailFrom: config.mail.from, mailHost: config.mail.host })

export const adminRoutes = new Hono<AppEnv>()
  .get('/admin/overview', async (c) => {
    requireAdmin(c)
    const week = sql`now() - interval '7 days'`
    const [[members], [fresh], [blocked], [dummies], [st], [ph], [vi], [ku], [fp], [reports], [videoRequests], newest, [signups], recentLog, onlineRows, bytes] = await Promise.all([
      db.select({ n: count() }).from(users).where(isNull(users.domain)),
      db.select({ n: count() }).from(users).where(and(sql`${users.createdAt} > ${week}`, isNull(users.domain))),
      db.select({ n: count() }).from(users).where(isNotNull(users.blockedAt)),
      db.select({ n: count() }).from(users).where(eq(users.isDummy, true)),
      db.select({ n: count() }).from(statuses),
      db.select({ n: count() }).from(photos),
      db.select({ n: count() }).from(videos),
      db.select({ n: count() }).from(kuddes),
      db.select({ n: count() }).from(forumPosts).where(isNull(forumPosts.deletedAt)),
      db.select({ n: count() }).from(suggestions).where(and(eq(suggestions.kind, 'probleem'), isNull(suggestions.handledAt))),
      db.select({ n: count() }).from(videoUploadRequests).where(eq(videoUploadRequests.status, 'open')),
      db.select().from(users).where(isNull(users.domain)).orderBy(desc(users.id)).limit(8),
      db.select({ n: count() }).from(users).where(and(isNull(users.emailVerifiedAt), isNull(users.blockedAt))),
      db.select({ entry: adminLog, admin: users.nickname }).from(adminLog).leftJoin(users, eq(users.id, adminLog.adminId)).orderBy(desc(adminLog.id)).limit(15),
      db.select({ lastSeenAt: users.lastSeenAt, onlineStatus: users.onlineStatus }).from(users).where(sql`${users.lastSeenAt} > now() - interval '5 minutes'`),
      folderSize(config.uploadDir),
    ])
    const result: AdminOverview = {
      counts: {
        members: members.n,
        newThisWeek: fresh.n,
        onlineNow: onlineRows.filter(isOnline).length,
        blocked: blocked.n,
        dummies: dummies.n,
        statuses: st.n,
        photos: ph.n,
        videos: vi.n,
        kuddes: ku.n,
        forumPosts: fp.n,
        // Problems people reported, and posts reported with Melden (one per post)
        openReports: reports.n + (await openReportedItems()),
        openVideoRequests: videoRequests.n,
        pendingSignups: signups.n,
        uploadBytes: bytes,
      },
      newest: await toMembers(newest),
      log: recentLog.map(({ entry, admin }): AdminLogEntry => ({ id: entry.id, admin, action: entry.action, target: entry.target, details: entry.details, createdAt: entry.createdAt.toISOString() })),
    }
    return c.json(result)
  })

  .get('/admin/log', async (c) => {
    requireAdmin(c)
    const rows = await db.select({ entry: adminLog, admin: users.nickname }).from(adminLog).leftJoin(users, eq(users.id, adminLog.adminId)).orderBy(desc(adminLog.id)).limit(200)
    return c.json(rows.map(({ entry, admin }): AdminLogEntry => ({ id: entry.id, admin, action: entry.action, target: entry.target, details: entry.details, createdAt: entry.createdAt.toISOString() })))
  })

  // --------------------------------------------------------------- settings
  .get('/admin/settings', (c) => {
    requireAdmin(c)
    return c.json(settings())
  })

  .patch('/admin/settings', async (c) => {
    const me = requireAdmin(c)
    const { signupMode: next } = parse(z.object({ signupMode: z.enum(['mail', 'approval']) }), await c.req.json().catch(() => null))
    if (next !== signupMode()) {
      await setSignupMode(next)
      await log(me, 'aanmelden ingesteld', next === 'mail' ? 'bevestigen per e-mail' : 'goedkeuren door de beheerder')
    }
    return c.json(settings())
  })

  // A test mail to the admin's own address, to see that the relay (Brevo) works
  .post('/admin/settings/test-mail', rateLimit('testmail', 10, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    if (!mailEnabled()) throw new HttpError(400, 'Er is geen mailserver ingesteld (SMTP_HOST in .env). Mails komen nu alleen in het serverlog.')
    try {
      await sendMail(testMail(me.email, me.nickname))
    } catch (e) {
      throw new HttpError(502, `Versturen lukte niet: ${e instanceof Error ? e.message : String(e)}`)
    }
    return c.json({ to: me.email })
  })

  // ---------------------------------------------------------------- members
  .get('/admin/users', async (c) => {
    requireAdmin(c)
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const filter = c.req.query('filter')
    // Counted per member in the database, so "most" is over everyone and not only the first 100
    const most = (table: string) => desc(sql.raw(`(select count(*) from "${table}" t where t."user_id" = "users"."id")`))
    const order = {
      nieuw: [desc(users.id)],
      oud: [asc(users.id)],
      online: [sql`${users.lastSeenAt} desc nulls last`, desc(users.id)],
      naam: [asc(sql`lower(${users.nickname})`)],
      wiewatwaars: [most('statuses'), desc(users.id)],
      fotos: [most('photos'), desc(users.id)],
      videos: [most('videos'), desc(users.id)],
      forum: [most('forum_posts'), desc(users.id)],
    }[c.req.query('sort') as MemberSort] ?? [desc(users.id)]
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const rows = await db
      .select()
      .from(users)
      .where(
        and(
          q ? or(ilike(users.username, pattern), ilike(users.name, pattern), ilike(users.nickname, pattern), ilike(users.email, pattern)) : undefined,
          filter === 'geblokkeerd'
            ? isNotNull(users.blockedAt)
            : filter === 'dummies'
              ? eq(users.isDummy, true)
              : filter === 'wachtend'
                ? and(isNull(users.emailVerifiedAt), isNull(users.blockedAt))
                : undefined,
          // Accounts of other servers are managed there (the server itself in Beheer → Servers)
          isNull(users.domain),
        ),
      )
      .orderBy(...order)
      .limit(100)
    return c.json(await toMembers(rows))
  })

  // The waitlist: let a new member in, or turn them away (their account is deleted)
  .post('/admin/users/:username/approve', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    if (user.emailVerifiedAt) throw new HttpError(409, `${user.nickname} is al goedgekeurd.`)
    await approveMember(user, me)
    await log(me, 'aanmelding goedgekeurd', `lid ${user.username}`)
    return c.body(null, 204)
  })

  // Back onto the waitlist, without deleting anything: until approved again
  // they see what a visitor sees and can only change their own account
  .post('/admin/users/:username/unapprove', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    if (!user.emailVerifiedAt) throw new HttpError(409, `${user.nickname} staat al op de wachtlijst.`)
    await db.update(users).set({ emailVerifiedAt: null }).where(eq(users.id, user.id))
    await log(me, 'goedkeuring ingetrokken', `lid ${user.username}`)
    return c.body(null, 204)
  })

  // A new confirmation mail for someone whose first one got lost
  .post('/admin/users/:username/resend', rateLimit('bevestigingsmail (beheer)', 30, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    if (user.emailVerifiedAt) throw new HttpError(409, `${user.nickname} is al binnen.`)
    if (signupMode() !== 'mail') throw new HttpError(400, 'Nieuwe leden worden nu door jou goedgekeurd; zet "Aanmelden" op bevestigen per e-mail om een bevestigingsmail te sturen.')
    await sendConfirmation(c, user)
    await log(me, 'bevestigingsmail gestuurd', `lid ${user.username}`)
    return c.body(null, 204)
  })

  .post('/admin/users/:username/reject', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    if (user.emailVerifiedAt) throw new HttpError(409, `${user.nickname} is al goedgekeurd; blokkeer of verwijder het account bij Leden.`)
    await deleteAccount(user)
    await log(me, 'aanmelding geweigerd', `lid ${user.username}`, `${user.name} <${user.email}>`)
    return c.body(null, 204)
  })

  .post('/admin/users/:username/block', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    const { reason } = parse(z.object({ reason: z.string().trim().max(200).default('') }), await c.req.json().catch(() => ({})))
    await blockUser(user, reason)
    await log(me, 'lid geblokkeerd', `lid ${user.username}`, reason)
    return c.body(null, 204)
  })

  // Blocked, and the address and name on the blacklist, so they can't come back with a new account
  .post('/admin/users/:username/blacklist', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    const { reason } = parse(z.object({ reason: z.string().trim().max(BLACKLIST_LIMITS.reason).default('') }), await c.req.json().catch(() => ({})))
    await blacklistMember(user, reason)
    // The address only masked: the blacklist keeps it as a hash, the Logboek shouldn't spell it out
    await log(me, 'op de zwarte lijst', `lid ${user.username}`, [mask('email', cleanValue('email', user.email)), reason].filter(Boolean).join(' · '))
    return c.body(null, 204)
  })

  // The address a member last used, banned (an IPv6 address with its whole /64)
  .post('/admin/users/:username/ip-ban', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    if (!user.lastIp) throw new HttpError(400, `Van ${user.nickname} is geen IP-adres bekend (niet ingelogd in de laatste maanden).`)
    const input = parse(ipBanSchema, await c.req.json().catch(() => null))
    const row = await addIpBan(c, me, user.lastIp, input, `lid ${user.username}`)
    return c.json({ id: row.id, range: row.range }, 201)
  })

  // ---------------------------------------------------------- reported posts and the quiet mode
  // What members reported and is still waiting: one entry per post, with all its reports
  .get('/admin/content-reports', async (c) => {
    requireAdmin(c)
    const rows = await db
      .select({ r: contentReports, author: summaryColumns })
      .from(contentReports)
      .leftJoin(users, eq(users.id, contentReports.authorId))
      .where(eq(contentReports.status, 'open'))
      .orderBy(desc(contentReports.id))
    const hidden = new Set((await db.select().from(hiddenItems)).map((h) => `${h.kind}:${h.targetId}`))
    const items = new Map<string, ReportedItem>()
    for (const { r, author } of rows) {
      const key = `${r.kind}:${r.targetId}`
      const item = items.get(key) ?? {
        kind: r.kind,
        targetId: r.targetId,
        link: r.link,
        excerpt: r.excerpt,
        author: author?.id ? toSummary(author) : null,
        reasons: {},
        notes: [],
        reporters: 0,
        hidden: hidden.has(key),
        firstAt: r.createdAt.toISOString(),
        lastAt: r.createdAt.toISOString(),
      }
      item.reasons[r.reason] = (item.reasons[r.reason] ?? 0) + 1
      if (r.note) item.notes.push(r.note)
      item.reporters++
      item.firstAt = r.createdAt.toISOString()
      items.set(key, item)
    }
    // Urgent ones first, then the most reported
    const urgency = (i: ReportedItem) => (i.reasons.illegaal || i.reasons.minderjarige ? 1 : 0)
    return c.json([...items.values()].sort((a, b) => urgency(b) - urgency(a) || b.reporters - a.reporters))
  })

  // The reports weren't right: it comes back
  .post('/admin/content-reports/:kind/:id{[0-9]+}/restore', async (c) => {
    const me = requireAdmin(c)
    const kind = parse(z.enum(Object.keys(REPORT_KINDS) as [ReportKind]), c.req.param('kind'))
    await restore(kind, Number(c.req.param('id')))
    await log(me, 'melding afgewezen, teruggezet', `${REPORT_KINDS[kind].name.toLowerCase()} ${c.req.param('id')}`)
    return c.body(null, 204)
  })

  // The reports were right: it goes for good
  .post('/admin/content-reports/:kind/:id{[0-9]+}/remove', async (c) => {
    const me = requireAdmin(c)
    const kind = parse(z.enum(Object.keys(REPORT_KINDS) as [ReportKind]), c.req.param('kind'))
    await removeReported(kind, Number(c.req.param('id')), me)
    await log(me, 'gemeld bericht weggehaald', `${REPORT_KINDS[kind].name.toLowerCase()} ${c.req.param('id')}`)
    return c.body(null, 204)
  })

  // The reports were about the post, not a problem: closed without restoring or removing anything
  .post('/admin/content-reports/:kind/:id{[0-9]+}/close', async (c) => {
    const me = requireAdmin(c)
    const kind = parse(z.enum(Object.keys(REPORT_KINDS) as [ReportKind]), c.req.param('kind'))
    await db
      .update(contentReports)
      .set({ status: 'teruggezet', handledAt: new Date() })
      .where(and(eq(contentReports.kind, kind), eq(contentReports.targetId, Number(c.req.param('id'))), eq(contentReports.status, 'open')))
    await log(me, 'melding afgesloten', `${REPORT_KINDS[kind].name.toLowerCase()} ${c.req.param('id')}`)
    return c.body(null, 204)
  })

  .get('/admin/safety', (c) => {
    requireAdmin(c)
    return c.json({ settings: safety(), mail: mailEnabled() })
  })

  .put('/admin/safety', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        hideAfter: z.number().int().min(1).max(SAFETY_LIMITS.hideAfter),
        alerts: z.object({ urgent: z.boolean(), hidden: z.boolean(), warnings: z.boolean(), weekly: z.boolean() }),
        quiet: z.object({
          on: z.boolean(),
          signups: z.enum(['normaal', 'wachtlijst', 'dicht']),
          minAgeDays: z.number().int().min(0).max(SAFETY_LIMITS.minAgeDays),
          pauseUploads: z.boolean(),
          pauseKuddes: z.boolean(),
          hideAfter: z.number().int().min(1).max(SAFETY_LIMITS.hideAfter),
          notice: z.string().trim().max(SAFETY_LIMITS.notice),
        }),
      }),
      await c.req.json().catch(() => null),
    )
    const was = safety().quiet.on
    await setSafety(input)
    await log(me, input.quiet.on !== was ? (input.quiet.on ? 'rustige stand aan' : 'rustige stand uit') : 'veiligheid ingesteld')
    return c.json({ settings: safety(), mail: mailEnabled() })
  })

  // ---------------------------------------------------------- automations
  .get('/admin/automations', async (c) => {
    requireAdmin(c)
    const rows = await db.select().from(automations).orderBy(asc(automations.id))
    return c.json(rows.map(toAutomation))
  })

  .post('/admin/automations', async (c) => {
    const me = requireAdmin(c)
    const [{ n }] = await db.select({ n: count() }).from(automations)
    if (n >= AUTO_LIMITS.automations) throw new HttpError(400, `Je kunt maximaal ${AUTO_LIMITS.automations} automatiseringen hebben.`)
    const config = parse(automationSchema, await c.req.json().catch(() => null))
    const [row] = await db.insert(automations).values({ config }).returning()
    forgetAutomations()
    await log(me, 'automatisering gemaakt', config.name)
    return c.json(toAutomation(row), 201)
  })

  .patch('/admin/automations/:id{[0-9]+}', async (c) => {
    const me = requireAdmin(c)
    const config = parse(automationSchema, await c.req.json().catch(() => null))
    const [row] = await db
      .update(automations)
      .set({ config })
      .where(eq(automations.id, Number(c.req.param('id'))))
      .returning()
    if (!row) throw notFound('Deze automatisering bestaat niet (meer).')
    forgetAutomations()
    await log(me, config.enabled ? 'automatisering ingesteld' : 'automatisering ingesteld (uit)', config.name)
    return c.json(toAutomation(row))
  })

  .delete('/admin/automations/:id{[0-9]+}', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db
      .delete(automations)
      .where(eq(automations.id, Number(c.req.param('id'))))
      .returning()
    forgetAutomations()
    if (row) await log(me, 'automatisering verwijderd', row.config.name)
    return c.body(null, 204)
  })

  // Trying it on a member (or a pretend sign-up), without doing anything: does it apply, and what would it do?
  .post('/admin/automations/test', async (c) => {
    requireAdmin(c)
    const input = parse(
      z.object({
        config: automationSchema,
        username: z.string().trim().toLowerCase().max(40).default(''),
        text: z.string().max(2000).default(''),
        email: z.string().max(254).default(''),
        awayDays: z.number().min(0).max(3650).default(0),
      }),
      await c.req.json().catch(() => null),
    )
    const member = input.config.trigger === 'aanmelden' || !input.username ? undefined : await findUser(input.username.replace(/^@/, ''))
    const ctx = {
      member,
      text: input.text,
      place: input.config.places[0] ?? ('wiewatwaar' as const),
      awayMs: input.awayDays * 24 * 60 * 60 * 1000 + input.config.awayMinutes * 60_000,
      signup: input.config.trigger === 'aanmelden' ? { username: input.username, name: input.username, email: input.email } : undefined,
    }
    return c.json(await runAutomation({ id: 0, config: input.config, done: { members: [], day: '' }, runs: 0, lastRunAt: null, lastError: null, createdAt: new Date() }, ctx, true))
  })

  // ---------------------------------------------------------- bots
  .get('/admin/bots', async (c) => {
    requireAdmin(c)
    const rows = await db.select({ bot: bots, user: users }).from(bots).innerJoin(users, eq(users.id, bots.userId)).orderBy(asc(users.username))
    return c.json(rows.map((r) => toAdminBot(r.bot, r.user)))
  })

  // A new bot: an account of its own, switched off until it's set up
  .post('/admin/bots', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_]{3,20}$/, 'Een gebruikersnaam heeft 3 tot 20 letters, cijfers of _.'),
        name: z.string().trim().min(1, 'Geef de bot een naam.').max(60),
        kind: z.enum(Object.keys(BOT_KINDS) as [BotKind]),
      }),
      await c.req.json().catch(() => null),
    )
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username))
    if (taken) throw new HttpError(409, 'Deze gebruikersnaam bestaat al.', { username: 'Deze gebruikersnaam bestaat al.' })
    const user = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          username: input.username,
          email: `${input.username}@bot.invalid`,
          passwordHash: await hashPassword(newPassword()),
          name: input.name,
          nickname: input.name.split(' ')[0],
          isBot: true,
          emailVerifiedAt: new Date(),
        })
        .returning()
      await tx.insert(bots).values({ userId: created.id, kind: input.kind })
      return created
    })
    await log(me, 'bot gemaakt', `lid ${user.username}`, BOT_KINDS[input.kind].name)
    const [row] = await db.select().from(bots).where(eq(bots.userId, user.id))
    await applyBotOptions(row)
    return c.json(toAdminBot(row, user), 201)
  })

  .patch('/admin/bots/:username', async (c) => {
    const me = requireAdmin(c)
    const { user, row } = await botOf(c.req.param('username'))
    const input = parse(botSettingsSchema, await c.req.json().catch(() => null))
    const next = { ...row, ...input }
    const [saved] = await db
      .update(bots)
      .set({ ...input, state: skipPast(next) })
      .where(eq(bots.userId, user.id))
      .returning()
    // Requests that were waiting, unread messages and the bot's privacy settings follow the new settings
    const accepted = await applyBotOptions(saved)
    forgetWatcher()
    await log(me, input.enabled ? 'bot ingesteld' : 'bot ingesteld (uit)', `lid ${user.username}`, accepted ? `${accepted} vriendschapsverzoeken geaccepteerd` : '')
    return c.json(toAdminBot(saved, user))
  })

  // The warnings bots gave lately (Toezicht), newest first
  .get('/admin/bots/warnings', async (c) => {
    requireAdmin(c)
    const bot = alias(users, 'bot')
    const rows = await db
      .select({ w: botWarnings, bot: bot.nickname, username: users.username, nickname: users.nickname })
      .from(botWarnings)
      .innerJoin(users, eq(users.id, botWarnings.userId))
      .innerJoin(bot, eq(bot.id, botWarnings.botId))
      .orderBy(desc(botWarnings.id))
      .limit(100)
    return c.json(
      rows.map(
        (r): BotWarning => ({
          id: r.w.id,
          bot: r.bot,
          user: { username: r.username, nickname: r.nickname },
          reason: r.w.reason === 'woord' ? `Woord: ${r.w.detail}` : `${BEHAVIOURS[r.w.reason as Behaviour]?.name ?? r.w.reason}${r.w.detail ? ` (${r.w.detail})` : ''}`,
          detail: r.w.detail,
          place: r.w.place,
          createdAt: r.w.createdAt.toISOString(),
        }),
      ),
    )
  })

  // A warning that wasn't fair: away, so it doesn't count any more
  .delete('/admin/bots/warnings/:id{[0-9]+}', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db
      .delete(botWarnings)
      .where(eq(botWarnings.id, Number(c.req.param('id'))))
      .returning()
    if (row) await log(me, 'waarschuwing ingetrokken', `lid ${row.userId}`, row.reason)
    return c.body(null, 204)
  })

  .delete('/admin/bots/:username', async (c) => {
    const me = requireAdmin(c)
    const { user } = await botOf(c.req.param('username'))
    await deleteAccount(user)
    await log(me, 'bot verwijderd', `lid ${user.username}`)
    return c.body(null, 204)
  })

  // Trying a bot without it doing anything: what a task bot would say, or what an AI bot would say and do
  .post('/admin/bots/:username/test', rateLimit('bots testen', 60, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    const { user, row } = await botOf(c.req.param('username'))
    const input = parse(
      z.object({ trigger: z.enum(Object.keys(BOT_TRIGGERS) as [BotTrigger]), subject: z.string().max(120).default(''), text: z.string().max(2000).default(''), settings: botSettingsSchema.optional() }),
      await c.req.json().catch(() => null),
    )
    const current = input.settings ? { ...row, ...input.settings } : row
    const event = { trigger: input.trigger, member: BOT_TRIGGERS[input.trigger].member ? me : undefined, subject: input.subject, text: input.text }
    if (current.kind === 'taken') {
      const fill = (t: string) => t.replaceAll('{voornaam}', me.nickname).replaceAll('{naam}', me.name).replaceAll('{gebruikersnaam}', me.username)
      return c.json({ steps: current.rules.filter((r) => r.enabled && r.trigger === input.trigger).map((r) => ({ kind: 'actie', name: BOT_ACTIONS[r.action].name, args: { tekst: fill(r.text) }, result: '(Proef: niet echt gedaan.)' })) })
    }
    try {
      return c.json({ steps: await runAi(current, user, event, true) })
    } catch (err) {
      throw new HttpError(502, (err as Error).message)
    }
  })

  .get('/admin/lmstudio', async (c) => {
    requireAdmin(c)
    return c.json(await lmStudio())
  })

  .put('/admin/lmstudio', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        url: z.union([z.literal(''), z.url('Vul een adres in, bijv. http://192.168.1.20:1234.').max(300)]),
        apiKey: z.string().trim().max(300),
        model: z.string().trim().max(BOT_LIMITS.model),
      }),
      await c.req.json().catch(() => null),
    )
    await setLmStudio(input)
    await log(me, 'LM Studio ingesteld', input.url)
    return c.json(input)
  })

  // Can the server reach LM Studio, and which models does it have?
  .post('/admin/lmstudio/test', async (c) => {
    requireAdmin(c)
    try {
      return c.json({ models: await lmModels(await lmStudio()) })
    } catch (err) {
      throw new HttpError(502, (err as Error).message)
    }
  })

  // ---------------------------------------------------------- IP bans
  .get('/admin/ip-bans', async (c) => {
    requireAdmin(c)
    const [rows, known] = await Promise.all([
      db.select().from(ipBans).orderBy(desc(ipBans.id)),
      db.select({ username: users.username, nickname: users.nickname, lastIp: users.lastIp, forumRole: users.forumRole }).from(users).where(isNotNull(users.lastIp)),
    ])
    const now = new Date()
    return c.json(
      rows.map((r): IpBan => {
        const net = parseRange(r.range)
        return {
          id: r.id,
          range: r.range,
          scope: r.scope,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt?.toISOString() ?? null,
          active: !r.expiresAt || r.expiresAt > now,
          members: typeof net === 'string' ? [] : known.filter((u) => u.forumRole !== 'admin' && inRange(net, u.lastIp!)).map((u) => ({ username: u.username, nickname: u.nickname })),
        }
      }),
    )
  })

  .post('/admin/ip-bans', async (c) => {
    const me = requireAdmin(c)
    const input = parse(ipBanSchema.extend({ range: z.string().trim().min(1, 'Vul een IP-adres in.').max(60) }), await c.req.json().catch(() => null))
    const row = await addIpBan(c, me, input.range, input, '')
    return c.json({ id: row.id, range: row.range }, 201)
  })

  // Ended early, or an old one cleared away
  .delete('/admin/ip-bans/:id{[0-9]+}', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db
      .delete(ipBans)
      .where(eq(ipBans.id, Number(c.req.param('id'))))
      .returning()
    if (row) {
      forgetIpBans()
      await log(me, 'IP-ban opgeheven', row.range)
    }
    return c.body(null, 204)
  })

  // ---------------------------------------------------------- blacklist
  .get('/admin/blacklist', async (c) => {
    requireAdmin(c)
    const rows = await db.select().from(blacklist).orderBy(desc(blacklist.id))
    const found = await accountsOn(rows)
    return c.json(
      rows.map(
        (r, i): BlacklistEntry => ({
          id: r.id,
          kind: r.kind,
          // A hashed entry can't be read back: Beheer shows its masked hint
          value: r.value.startsWith('h:') ? (r.hint ?? 'versleuteld') : r.value,
          hashed: r.value.startsWith('h:'),
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          matches: found[i].map((u) => ({ username: u.username, nickname: u.nickname, blocked: !!u.blockedAt })),
        }),
      ),
    )
  })

  .post('/admin/blacklist', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        kind: z.enum(Object.keys(BLACKLIST_KINDS) as [BlacklistKind]),
        value: z.string().trim().min(1, 'Vul iets in.').max(BLACKLIST_LIMITS.value),
        reason: z.string().trim().max(BLACKLIST_LIMITS.reason).default(''),
        /** Also block the accounts it already covers. */
        block: z.boolean().default(false),
      }),
      await c.req.json().catch(() => null),
    )
    const value = cleanValue(input.kind, input.value)
    checkEntry(input.kind, value)
    const [row] = await db
      .insert(blacklist)
      .values({ kind: input.kind, ...(await stored(input.kind, value)), reason: input.reason })
      .onConflictDoNothing()
      .returning()
    if (!row) throw new HttpError(409, 'Dit staat al op de zwarte lijst.', { value: 'Dit staat al op de zwarte lijst.' })
    forgetBlacklist()
    let blocked = 0
    if (input.block) {
      const [found] = await accountsOn([row])
      for (const u of found.filter((x) => !x.blockedAt)) {
        const [user] = await db.select().from(users).where(eq(users.id, u.id))
        await blockUser(user, input.reason || 'Op de zwarte lijst')
        await log(me, 'lid geblokkeerd', `lid ${u.username}`, `zwarte lijst: ${value}`)
        blocked++
      }
    }
    await log(me, 'op de zwarte lijst', `${BLACKLIST_KINDS[input.kind].name.toLowerCase()} ${hashable(input.kind, value) ? mask(input.kind, value) : value}`, input.reason)
    return c.json({ id: row.id, blocked }, 201)
  })

  .delete('/admin/blacklist/:id{[0-9]+}', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db
      .delete(blacklist)
      .where(eq(blacklist.id, Number(c.req.param('id'))))
      .returning()
    if (row) {
      forgetBlacklist()
      await log(me, 'van de zwarte lijst', `${BLACKLIST_KINDS[row.kind].name.toLowerCase()} ${row.value.startsWith('h:') ? (row.hint ?? 'versleuteld') : row.value}`)
    }
    return c.body(null, 204)
  })

  .delete('/admin/users/:username/block', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    await db.update(users).set({ blockedAt: null, blockReason: null }).where(eq(users.id, user.id))
    await log(me, 'blokkade opgeheven', `lid ${user.username}`)
    return c.body(null, 204)
  })

  // A new random password, shown once, for a member who forgot theirs
  .post('/admin/users/:username/password', rateLimit('wachtwoorden', 30, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    const password = newPassword()
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id))
    await db.delete(sessions).where(eq(sessions.userId, user.id))
    await log(me, 'nieuw wachtwoord ingesteld', `lid ${user.username}`)
    return c.json({ password })
  })

  .delete('/admin/users/:username', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    notTheAdmin(user)
    const { confirm } = parse(z.object({ confirm: z.string() }), await c.req.json().catch(() => null))
    if (confirm !== user.username) throw new HttpError(400, 'Typ de gebruikersnaam om het verwijderen te bevestigen.')
    await deleteAccount(user)
    await log(me, 'lid verwijderd', `lid ${user.username}`, `${user.name} <${user.email}>`)
    return c.body(null, 204)
  })

  // A normal account for someone, made by the admin: no waitlist, captcha or
  // sign-up limits. It's approved straight away and gets the usual welcome
  // message; the password is shown once, to pass on (they can change it).
  .post('/admin/accounts', rateLimit('accounts maken', 200, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        username: usernameSchema,
        name: z.string().trim().min(1, 'Geef een naam.').max(60, 'Die naam is te lang.'),
        email: z.email('Vul een geldig e-mailadres in.').trim().max(254),
        password: z.string().max(200, 'Dat wachtwoord is te lang.').refine((p) => p === '' || p.length >= 8, 'Een wachtwoord heeft minstens 8 tekens (of laat het leeg voor een willekeurig).'),
      }),
      await c.req.json().catch(() => null),
    )
    const [taken] = await db
      .select({ username: users.username })
      .from(users)
      .where(sql`${users.username} = ${input.username} or lower(${users.email}) = lower(${input.email})`)
      .limit(1)
    if (taken?.username === input.username) throw new HttpError(409, 'Deze gebruikersnaam is al bezet.', { username: 'Deze gebruikersnaam is al bezet.' })
    if (taken) throw new HttpError(409, 'Er is al een account met dit e-mailadres.', { email: 'Er is al een account met dit e-mailadres.' })
    const password = input.password || newPassword()
    const [user] = await db
      .insert(users)
      .values({ username: input.username, email: input.email, passwordHash: await hashPassword(password), name: input.name, nickname: input.name.split(/\s+/)[0] })
      .returning()
    // Approved at once, with the welcome message (and mail, when mail is set up)
    await approveMember(user, me)
    await log(me, 'account gemaakt', `lid ${user.username}`)
    return c.json({ username: user.username, password, generated: !input.password }, 201)
  })

  // Dummy accounts, to fill the site; the admin can act as them
  .post('/admin/dummies', rateLimit('dummies', 100, 60 * 60 * 1000), async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        username: z
          .string()
          .trim()
          .toLowerCase()
          .regex(/^[a-z0-9_]{3,20}$/, 'Een gebruikersnaam heeft 3 tot 20 letters, cijfers of _.'),
        name: z.string().trim().min(1, 'Geef een naam.').max(60),
        nickname: z.string().trim().max(40).optional(),
        gender: z.enum(['man', 'vrouw', 'anders']).nullable().optional(),
        birthdate: z.iso.date().nullable().optional(),
        city: z.string().trim().max(60).optional(),
        about: z.string().trim().max(2000).optional(),
      }),
      await c.req.json().catch(() => null),
    )
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username))
    if (taken) throw new HttpError(409, 'Deze gebruikersnaam bestaat al.', { username: 'Deze gebruikersnaam bestaat al.' })
    const password = newPassword()
    const [user] = await db
      .insert(users)
      .values({
        username: input.username,
        email: `${input.username}@dummy.invalid`,
        passwordHash: await hashPassword(password),
        name: input.name,
        nickname: input.nickname || input.name.split(' ')[0],
        gender: input.gender ?? null,
        birthdate: input.birthdate ?? null,
        city: input.city || null,
        about: input.about || null,
        isDummy: true,
        emailVerifiedAt: new Date(),
      })
      .returning()
    await log(me, 'dummy-account gemaakt', `lid ${user.username}`)
    return c.json({ username: user.username, password }, 201)
  })

  // Log in as a dummy (to post as them); you're logged out of your own account
  .post('/admin/users/:username/login-as', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    if (!user.isDummy && !user.isBot) throw new HttpError(400, 'Dit kan alleen met dummy-accounts en bots.')
    await log(me, 'ingelogd als dummy', `lid ${user.username}`)
    await destroySession(c)
    await createSession(c, user.id)
    return c.body(null, 204)
  })

  // ------------------------------------------------------------------- news
  .get('/admin/news', async (c) => {
    requireAdmin(c)
    const rows = await db.select({ item: news, author: users.nickname }).from(news).leftJoin(users, eq(users.id, news.authorId)).orderBy(desc(news.publishedAt))
    return c.json(rows.map((r) => toAdminNews(r.item, r.author)))
  })

  .post('/admin/news', async (c) => {
    const me = requireAdmin(c)
    const input = parse(newsSchema, await c.req.json().catch(() => null))
    const base = slugify(input.title)
    const taken = new Set((await db.select({ slug: news.slug }).from(news)).map((r) => r.slug))
    let slug = base
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`
    const [row] = await db
      .insert(news)
      .values({ ...input, slug, authorId: me.id, publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date() })
      .returning()
    await log(me, input.published ? 'nieuws geplaatst' : 'nieuws als concept opgeslagen', `nieuws ${slug}`, input.title)
    return c.json(toAdminNews(row, me.nickname), 201)
  })

  .patch('/admin/news/:id', async (c) => {
    const me = requireAdmin(c)
    const input = parse(newsSchema.partial(), await c.req.json().catch(() => null))
    const [row] = await db
      .update(news)
      .set({ ...input, publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined, updatedAt: new Date() })
      .where(eq(news.id, Number(c.req.param('id'))))
      .returning()
    if (!row) throw notFound('Dit nieuwsbericht bestaat niet.')
    await log(me, 'nieuws bewerkt', `nieuws ${row.slug}`, row.title)
    return c.json(toAdminNews(row, null))
  })

  .delete('/admin/news/:id', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db.delete(news).where(eq(news.id, Number(c.req.param('id')))).returning()
    if (!row) throw notFound('Dit nieuwsbericht bestaat niet.')
    await log(me, 'nieuws verwijderd', `nieuws ${row.slug}`, row.title)
    return c.body(null, 204)
  })

  // A picture for a news post: the banner, or one in the text
  .post(
    '/admin/news/images',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
      },
    }),
    async (c) => {
      requireAdmin(c)
      const body = await c.req.parseBody()
      const stored = await storeImage(body.file, 'news')
      return c.json({ path: stored.path, url: uploadUrl(stored.path), width: stored.width, height: stored.height }, 201)
    },
  )

  // ---------------------------------------------------------------- uploads
  .get('/admin/uploads/:kind', async (c) => {
    requireAdmin(c)
    const kind = c.req.param('kind') as UploadKind
    if (!(kind in UPLOAD_KINDS)) throw notFound()
    const limit = 60
    let items: AdminUpload[] = []
    if (kind === 'fotos') {
      const rows = await db.select({ photo: photos, user: summaryColumns }).from(photos).innerJoin(users, eq(users.id, photos.userId)).orderBy(desc(photos.id)).limit(limit)
      items = rows.map(({ photo, user }) => ({
        key: String(photo.id),
        kind,
        url: uploadUrl(photo.path)!,
        link: `/profiel/${user.username}?tab=fotos&foto=${photo.id}`,
        title: photo.caption || 'Foto',
        owner: toSummary(user),
        createdAt: photo.createdAt.toISOString(),
        bytes: null,
      }))
    } else if (kind === 'videos') {
      const rows = await db.select({ video: videos, user: summaryColumns }).from(videos).innerJoin(users, eq(users.id, videos.userId)).orderBy(desc(videos.id)).limit(limit)
      items = rows.map(({ video, user }) => ({
        key: video.publicId,
        kind,
        url: uploadUrl(video.thumbPath) ?? '',
        link: `/video/kijk?v=${video.publicId}`,
        title: `${video.title} (${video.visibility})`,
        owner: toSummary(user),
        createdAt: video.createdAt.toISOString(),
        bytes: null,
        status: video.status,
      }))
    } else if (kind === 'profielfotos') {
      const rows = await db.select().from(users).where(isNotNull(users.avatarPath)).orderBy(desc(users.id)).limit(limit)
      items = rows.map((u) => ({ key: u.username, kind, url: uploadUrl(u.avatarPath)!, link: `/profiel/${u.username}`, title: `Profielfoto van ${u.nickname}`, owner: toSummary(u), createdAt: null, bytes: null }))
    } else if (kind === 'kuddes') {
      const rows = await db
        .select({ kudde: kuddes, user: summaryColumns })
        .from(kuddes)
        .leftJoin(users, eq(users.id, kuddes.creatorId))
        .where(isNotNull(kuddes.imagePath))
        .orderBy(desc(kuddes.id))
        .limit(limit)
      items = rows.map(({ kudde, user }) => ({
        key: kudde.slug,
        kind,
        url: uploadUrl(kudde.imagePath)!,
        link: `/kuddes/${kudde.slug}`,
        title: kudde.name,
        owner: user?.id ? toSummary(user) : null,
        createdAt: kudde.createdAt.toISOString(),
        bytes: null,
      }))
    } else if (kind === 'kuddefotos') {
      // The Foto's boxes of all Kuddes, and Prikbord posts that uploaded a photo of their own (older ones), newest first
      const [boxPhotos, posts] = await Promise.all([
        db
          .select({ photo: kuddePhotos, user: summaryColumns, kudde: { slug: kuddes.slug, name: kuddes.name, visibility: kuddes.visibility } })
          .from(kuddePhotos)
          .innerJoin(users, eq(users.id, kuddePhotos.userId))
          .innerJoin(kuddes, eq(kuddes.id, kuddePhotos.kuddeId))
          .orderBy(desc(kuddePhotos.id))
          .limit(limit),
        db
          .select({ post: kuddePosts, user: summaryColumns, kudde: { slug: kuddes.slug, name: kuddes.name, visibility: kuddes.visibility } })
          .from(kuddePosts)
          .leftJoin(users, eq(users.id, kuddePosts.userId))
          .innerJoin(kuddes, eq(kuddes.id, kuddePosts.kuddeId))
          .where(isNotNull(kuddePosts.photoPath))
          .orderBy(desc(kuddePosts.id))
          .limit(limit),
      ])
      const where = (k: { name: string; visibility: string }) => `${k.name}${k.visibility === 'besloten' ? ' (besloten)' : ''}`
      items = [
        ...boxPhotos.map(({ photo, user, kudde }) => ({
          key: `foto-${photo.id}`,
          kind,
          url: uploadUrl(photo.path)!,
          link: kuddePhotoHref(kudde.slug, photo.id),
          title: `${photo.caption || 'Foto'} · ${where(kudde)}`,
          owner: toSummary(user),
          createdAt: photo.createdAt.toISOString(),
          bytes: null,
        })),
        ...posts.map(({ post, user, kudde }) => ({
          key: `prikbord-${post.id}`,
          kind,
          url: uploadUrl(post.photoPath)!,
          link: `/kuddes/${kudde.slug}`,
          title: `Prikbord · ${where(kudde)}`,
          owner: user?.id ? toSummary(user) : null,
          createdAt: post.createdAt.toISOString(),
          bytes: null,
        })),
      ]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
    } else if (kind === 'glitterplaatjes') {
      const rows = await db.select({ glitter: glitters, user: summaryColumns }).from(glitters).innerJoin(users, eq(users.id, glitters.userId)).orderBy(desc(glitters.id)).limit(limit)
      items = rows.map(({ glitter, user }) => ({
        key: String(glitter.id),
        kind,
        url: uploadUrl(glitter.path)!,
        link: `/glitterplaatjes?categorie=${glitter.categories[0] ?? 'overig'}`,
        title: `${glitter.title} (${glitter.uses}× verstuurd)`,
        owner: toSummary(user),
        createdAt: glitter.createdAt.toISOString(),
        bytes: null,
      }))
    } else if (kind === 'recepten') {
      const rows = await db.select({ recipe: recipes, user: summaryColumns }).from(recipes).innerJoin(users, eq(users.id, recipes.userId)).orderBy(desc(recipes.id)).limit(limit)
      items = rows.map(({ recipe, user }) => ({
        key: String(recipe.id),
        kind,
        url: uploadUrl(recipe.photoPath) ?? '/icons/32/cutlery.png',
        link: recipeHref(recipe),
        title: `${recipe.title} (${recipe.likes}× lekker)`,
        owner: toSummary(user),
        createdAt: recipe.createdAt.toISOString(),
        bytes: null,
      }))
    } else {
      const dir = path.join(config.uploadDir, 'backgrounds')
      const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^\d+-[0-9a-f]+\.webp$/.test(f))
      const withStats = await Promise.all(files.map(async (f) => ({ f, s: await stat(path.join(dir, f)) })))
      withStats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)
      const ownerIds = [...new Set(withStats.map((x) => Number(x.f.split('-')[0])))]
      const owners = ownerIds.length ? await db.select(summaryColumns).from(users).where(inArray(users.id, ownerIds)) : []
      items = withStats.slice(0, limit).map(({ f, s }) => {
        const owner = owners.find((o) => o.id === Number(f.split('-')[0]))
        return { key: f, kind, url: `/uploads/backgrounds/${f}`, link: owner ? `/profiel/${owner.username}` : null, title: 'Achtergrond', owner: owner ? toSummary(owner) : null, createdAt: s.mtime.toISOString(), bytes: s.size }
      })
    }
    return c.json(items)
  })

  .delete('/admin/uploads/:kind/:key', async (c) => {
    const me = requireAdmin(c)
    const kind = c.req.param('kind') as UploadKind
    const key = c.req.param('key')
    if (kind === 'fotos') {
      const [photo] = await db.delete(photos).where(eq(photos.id, Number(key))).returning()
      if (!photo) throw notFound()
      await Promise.all([removeUpload(photo.path), removeUpload(photo.originalPath)])
    } else if (kind === 'videos') {
      const [video] = await db.delete(videos).where(eq(videos.publicId, key)).returning()
      if (!video) throw notFound()
      await removeFiles(video)
    } else if (kind === 'profielfotos') {
      const user = await findUser(key)
      await db.update(users).set({ avatarPath: null }).where(eq(users.id, user.id))
      await removeUpload(user.avatarPath)
    } else if (kind === 'kuddes') {
      const [kudde] = await db.select().from(kuddes).where(eq(kuddes.slug, key))
      if (!kudde) throw notFound()
      await db.update(kuddes).set({ imagePath: null }).where(eq(kuddes.id, kudde.id))
      await removeUpload(kudde.imagePath)
    } else if (kind === 'kuddefotos') {
      const [, type, raw] = /^(foto|prikbord)-(\d+)$/.exec(key) ?? []
      if (type === 'foto') {
        const [photo] = await db.delete(kuddePhotos).where(eq(kuddePhotos.id, Number(raw))).returning()
        if (!photo) throw notFound()
        await removeUpload(photo.path)
      } else if (type === 'prikbord') {
        // The post stays, without its photo
        const [post] = await db.select().from(kuddePosts).where(eq(kuddePosts.id, Number(raw)))
        if (!post?.photoPath) throw notFound()
        await db.update(kuddePosts).set({ photoPath: null }).where(eq(kuddePosts.id, post.id))
        await removeUpload(post.photoPath)
      } else throw notFound()
    } else if (kind === 'glitterplaatjes') {
      const [glitter] = await db.delete(glitters).where(eq(glitters.id, Number(key))).returning()
      if (!glitter) throw notFound()
      await removeUpload(glitter.path)
    } else if (kind === 'recepten') {
      // The whole recipe goes: it's the admin's way to take one down
      const [recipe] = await db.delete(recipes).where(eq(recipes.id, Number(key))).returning()
      if (!recipe) throw notFound()
      await Promise.all([recipe.photoPath, ...recipe.steps.map((s) => s.photo)].map((p) => removeUpload(p)))
    } else if (kind === 'achtergronden') {
      if (!/^\d+-[0-9a-f]+\.webp$/.test(key)) throw notFound()
      const url = `/uploads/backgrounds/${key}`
      // Take it out of the themes and profile designs that use it
      await db.execute(sql`update ${users} set custom_theme = custom_theme - 'image' where custom_theme->'image'->>'url' = ${url}`)
      await db.execute(sql`update ${users} set profile_colors = profile_colors - 'image' where profile_colors->'image'->>'url' = ${url}`)
      await db.execute(sql`update ${kuddes} set design = design - 'image' where design->'image'->>'url' = ${url}`)
      await removeUpload(`backgrounds/${key}`)
    } else {
      throw notFound()
    }
    await log(me, 'upload verwijderd', `${UPLOAD_KINDS[kind]} ${key}`)
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- content
  .get('/admin/content/:kind', async (c) => {
    requireAdmin(c)
    const kind = c.req.param('kind') as ContentKind
    if (!(kind in CONTENT_KINDS)) throw notFound()
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const limit = 60
    const item = (id: number | string, author: Parameters<typeof toSummary>[0] | null, text: string, link: string | null, at: Date): AdminContent => ({
      id: String(id),
      kind,
      author: author?.id ? toSummary(author) : null,
      text,
      link,
      createdAt: at.toISOString(),
    })
    let items: AdminContent[] = []
    switch (kind) {
      case 'wiewatwaars': {
        const rows = await db.select({ s: statuses, u: summaryColumns }).from(statuses).innerJoin(users, eq(users.id, statuses.userId)).where(q ? ilike(statuses.text, pattern) : undefined).orderBy(desc(statuses.id)).limit(limit)
        items = rows.map(({ s, u }) => item(s.id, u, s.text, `/profiel/${u.username}`, s.createdAt))
        break
      }
      case 'knuffels': {
        const rows = await db.select({ k: knuffels, u: summaryColumns }).from(knuffels).innerJoin(users, eq(users.id, knuffels.authorId)).where(q ? ilike(knuffels.text, pattern) : undefined).orderBy(desc(knuffels.id)).limit(limit)
        const targets = rows.length ? await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, rows.map((r) => r.k.profileId))) : []
        items = rows.map(({ k, u }) => item(k.id, u, k.text, `/profiel/${targets.find((t) => t.id === k.profileId)?.username ?? ''}?tab=knuffels`, k.createdAt))
        break
      }
      case 'reacties': {
        const rows = await db.select({ r: activityComments, u: summaryColumns }).from(activityComments).innerJoin(users, eq(users.id, activityComments.userId)).where(q ? ilike(activityComments.text, pattern) : undefined).orderBy(desc(activityComments.id)).limit(limit)
        items = rows.map(({ r, u }) => item(r.id, u, r.text, '/tijdlijn', r.createdAt))
        break
      }
      case 'videoreacties': {
        const rows = await db
          .select({ r: videoComments, u: summaryColumns, v: videos.publicId })
          .from(videoComments)
          .innerJoin(users, eq(users.id, videoComments.userId))
          .innerJoin(videos, eq(videos.id, videoComments.videoId))
          .where(q ? ilike(videoComments.text, pattern) : undefined)
          .orderBy(desc(videoComments.id))
          .limit(limit)
        items = rows.map(({ r, u, v }) => item(r.id, u, r.text, `/video/kijk?v=${v}`, r.createdAt))
        break
      }
      case 'forumberichten': {
        const rows = await db
          .select({ p: forumPosts, u: summaryColumns, t: { id: forumThreads.id, title: forumThreads.title }, section: forumSections.slug })
          .from(forumPosts)
          .leftJoin(users, eq(users.id, forumPosts.userId))
          .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
          .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
          .where(and(isNull(forumPosts.deletedAt), q ? ilike(forumPosts.body, pattern) : undefined))
          .orderBy(desc(forumPosts.id))
          .limit(limit)
        items = rows.map(({ p, u, t, section }) => item(p.id, u, `${t.title}: ${p.body}`, `${threadHref(section, t.id, t.title)}?bericht=${p.id}`, p.createdAt))
        break
      }
      case 'forumdiscussie': {
        const rows = await db.select({ r: forumProfileComments, u: summaryColumns }).from(forumProfileComments).innerJoin(users, eq(users.id, forumProfileComments.authorId)).where(q ? ilike(forumProfileComments.text, pattern) : undefined).orderBy(desc(forumProfileComments.id)).limit(limit)
        items = rows.map(({ r, u }) => item(r.id, u, r.text, null, r.createdAt))
        break
      }
      case 'kuddes': {
        const rows = await db.select({ k: kuddes, u: summaryColumns }).from(kuddes).leftJoin(users, eq(users.id, kuddes.creatorId)).where(q ? or(ilike(kuddes.name, pattern), ilike(kuddes.description, pattern)) : undefined).orderBy(desc(kuddes.id)).limit(limit)
        items = rows.map(({ k, u }) => item(k.slug, u, `${k.name}: ${k.description}`, `/kuddes/${k.slug}`, k.createdAt))
        break
      }
      case 'evenementen': {
        const rows = await db
          .select({ e: kuddeEvents, u: summaryColumns, slug: kuddes.slug })
          .from(kuddeEvents)
          .leftJoin(users, eq(users.id, kuddeEvents.creatorId))
          .innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId))
          .where(q ? ilike(kuddeEvents.title, pattern) : undefined)
          .orderBy(desc(kuddeEvents.id))
          .limit(limit)
        items = rows.map(({ e, u, slug }) => item(e.id, u, `${e.title}${e.description ? `: ${e.description}` : ''}`, `/kuddes/${slug}/evenementen/${e.id}`, e.createdAt))
        break
      }
    }
    return c.json(items)
  })

  .delete('/admin/content/:kind/:id', async (c) => {
    const me = requireAdmin(c)
    const kind = c.req.param('kind') as ContentKind
    const id = c.req.param('id')
    const byId = Number(id)
    let removed: unknown[] = []
    switch (kind) {
      case 'wiewatwaars':
        removed = await db.delete(statuses).where(eq(statuses.id, byId)).returning({ id: statuses.id })
        break
      case 'knuffels':
        removed = await db.delete(knuffels).where(eq(knuffels.id, byId)).returning({ id: knuffels.id })
        break
      case 'reacties':
        removed = await db.delete(activityComments).where(eq(activityComments.id, byId)).returning({ id: activityComments.id })
        break
      case 'videoreacties':
        removed = await db.delete(videoComments).where(eq(videoComments.id, byId)).returning({ id: videoComments.id })
        break
      case 'forumberichten':
        // Like a moderator: the post keeps its place as "verwijderd"
        removed = await db.update(forumPosts).set({ deletedAt: new Date(), deletedById: me.id }).where(eq(forumPosts.id, byId)).returning({ id: forumPosts.id })
        break
      case 'forumdiscussie':
        removed = await db.delete(forumProfileComments).where(eq(forumProfileComments.id, byId)).returning({ id: forumProfileComments.id })
        break
      case 'kuddes': {
        const rows = await db.delete(kuddes).where(eq(kuddes.slug, id)).returning()
        await Promise.all(rows.map((k) => removeUpload(k.imagePath)))
        removed = rows
        break
      }
      case 'evenementen':
        removed = await db.delete(kuddeEvents).where(eq(kuddeEvents.id, byId)).returning({ id: kuddeEvents.id })
        break
      default:
        throw notFound()
    }
    if (!removed.length) throw notFound('Dit bestaat niet (meer).')
    await log(me, 'verwijderd', `${CONTENT_KINDS[kind]} ${id}`)
    return c.body(null, 204)
  })

  // ---------------------------------------------------- video upload rights
  .get('/admin/video-requests', async (c) => {
    requireAdmin(c)
    const rows = await db
      .select({ r: videoUploadRequests, u: summaryColumns })
      .from(videoUploadRequests)
      .innerJoin(users, eq(users.id, videoUploadRequests.userId))
      // ?kind=muziek for the requests to upload music
      .where(eq(videoUploadRequests.kind, c.req.query('kind') === 'muziek' ? 'muziek' : c.req.query('kind') === 'radio' ? 'radio' : 'video'))
      .orderBy(sql`${videoUploadRequests.status} <> 'open'`, desc(videoUploadRequests.id))
      .limit(200)
    return c.json(
      rows.map(({ r, u }): AdminVideoRequest => ({
        id: r.id,
        user: toSummary(u),
        reasons: r.reasons.filter((x): x is VideoUploadReason => x in VIDEO_UPLOAD_REASONS || x in MUSIC_UPLOAD_REASONS),
        motivation: r.motivation,
        status: r.status,
        answer: r.answer,
        createdAt: r.createdAt.toISOString(),
        handledAt: r.handledAt?.toISOString() ?? null,
      })),
    )
  })

  // Yes or no, with an optional note; the member gets a message either way
  .post('/admin/video-requests/:id', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({ decision: z.enum(['goedkeuren', 'afwijzen']), answer: z.string().trim().max(1000, 'Maximaal 1000 tekens.').optional() }),
      await c.req.json().catch(() => null),
    )
    const approve = input.decision === 'goedkeuren'
    const [request] = await db
      .update(videoUploadRequests)
      .set({ status: approve ? 'goedgekeurd' : 'afgewezen', answer: input.answer || null, handledAt: new Date(), handledById: me.id })
      .where(and(eq(videoUploadRequests.id, Number(c.req.param('id'))), eq(videoUploadRequests.status, 'open')))
      .returning()
    if (!request) throw notFound('Deze aanvraag staat niet (meer) open.')
    const music = request.kind === 'muziek'
    const radio = request.kind === 'radio'
    const [member] = await db
      .update(users)
      .set(music ? { musicUploadAllowed: approve } : radio ? { radioAllowed: approve } : { videoUploadAllowed: approve })
      .where(eq(users.id, request.userId))
      .returning()
    const note = input.answer ? `\n\n${input.answer}` : ''
    const what = music ? 'muziek uploaden' : radio ? 'radio maken' : 'video’s uploaden'
    await deliverMessage(
      me.id,
      request.userId,
      approve ? `Je mag nu ${what}!` : `Je aanvraag om ${what}`,
      approve
        ? radio
          ? `Goed nieuws: je aanvraag is goedgekeurd. Maak je zender en ga live in je studio op [Kuddes Radio](${absolute('/radio/studio')}). Veel plezier!${note}`
          : music
          ? `Goed nieuws: je aanvraag is goedgekeurd. Maak je muziekpagina en upload je nummers op [Muziek](${absolute('/muziek/uploaden')}). Veel plezier!${note}`
          : `Goed nieuws: je aanvraag is goedgekeurd. Je kunt nu video’s uploaden op Kuddes Video (Vermaak → Video uploaden). Veel plezier!${note}`
        : `Je aanvraag om ${what} is helaas afgewezen.${note}\n\n${music ? 'Muziek luisteren' : radio ? 'Radio luisteren' : 'Video’s kijken'} kan natuurlijk altijd.`,
    )
    await log(me, approve ? 'uploadrechten gegeven' : 'uploadrechten geweigerd', `lid ${member?.username ?? request.userId}`, input.answer ?? '')
    return c.body(null, 204)
  })

  // Give or take away upload rights directly (from the members list)
  .post('/admin/users/:username/video-access', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    const { allowed } = parse(z.object({ allowed: z.boolean() }), await c.req.json().catch(() => null))
    await setRight(user, 'video', allowed, me.id)
    await log(me, allowed ? 'uploadrechten gegeven' : 'uploadrechten ingetrokken', `lid ${user.username}`)
    return c.body(null, 204)
  })

  .post('/admin/users/:username/music-access', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    const { allowed } = parse(z.object({ allowed: z.boolean() }), await c.req.json().catch(() => null))
    await setRight(user, 'muziek', allowed, me.id)
    await log(me, allowed ? 'muziekrechten gegeven' : 'muziekrechten ingetrokken', `lid ${user.username}`)
    return c.body(null, 204)
  })

  .post('/admin/users/:username/radio-access', async (c) => {
    const me = requireAdmin(c)
    const user = await findUser(c.req.param('username'))
    const { allowed } = parse(z.object({ allowed: z.boolean() }), await c.req.json().catch(() => null))
    await setRight(user, 'radio', allowed, me.id)
    await log(me, allowed ? 'radiorechten gegeven' : 'radiorechten ingetrokken', `lid ${user.username}`)
    return c.body(null, 204)
  })

  // ---------------------------------------------------- reports and suggestions
  .get('/admin/reports', async (c) => {
    requireAdmin(c)
    const rows = await db.select({ s: suggestions, u: summaryColumns }).from(suggestions).leftJoin(users, eq(users.id, suggestions.userId)).orderBy(sql`${suggestions.handledAt} is not null`, desc(suggestions.id)).limit(200)
    return c.json(
      rows.map(({ s, u }): AdminReport => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        body: s.body,
        page: s.page,
        user: u?.id ? toSummary(u) : null,
        createdAt: s.createdAt.toISOString(),
        handledAt: s.handledAt?.toISOString() ?? null,
        status: s.status,
        statusNote: s.statusNote,
      })),
    )
  })

  // Where a suggestion or report stands ("Wordt aan gewerkt", "Klaar!"…), with a short note; the sender hears about it
  .patch('/admin/reports/:id', async (c) => {
    const me = requireAdmin(c)
    const input = parse(
      z.object({
        status: z.enum(SUGGESTION_STATUS_KEYS as [SuggestionStatus, ...SuggestionStatus[]]),
        note: z.string().trim().max(SUGGESTION_NOTE_MAX, `Een toelichting mag maximaal ${SUGGESTION_NOTE_MAX} tekens hebben.`).default(''),
      }),
      await c.req.json().catch(() => null),
    )
    const id = Number(c.req.param('id'))
    const [before] = await db.select().from(suggestions).where(eq(suggestions.id, id))
    if (!before) throw notFound()
    const now = new Date()
    const [row] = await db
      .update(suggestions)
      .set({ status: input.status, statusNote: input.note || null, statusAt: now, handledAt: isSettled(input.status) ? (before.handledAt ?? now) : null })
      .where(eq(suggestions.id, id))
      .returning()
    await log(me, 'status melding/suggestie', `${row.kind} ${row.id}`, `${SUGGESTION_STATUSES[input.status].name}: ${row.title}`)
    if (row.userId && (before.status !== row.status || before.statusNote !== row.statusNote) && row.status !== 'nieuw')
      await notify({
        userIds: [row.userId],
        actorId: me.id,
        kind: 'suggestie',
        ref: `suggestie:${row.id}:${now.getTime()}`,
        message: `zette je ${row.kind === 'probleem' ? 'melding' : 'suggestie'} "${row.title}" op: ${SUGGESTION_STATUSES[row.status].name}`,
        text: row.statusNote ?? undefined,
        link: row.kind === 'suggestie' ? `/suggesties#suggestie-${row.id}` : '/suggesties',
      })
    return c.body(null, 204)
  })

  .delete('/admin/reports/:id', async (c) => {
    const me = requireAdmin(c)
    const [row] = await db.delete(suggestions).where(eq(suggestions.id, Number(c.req.param('id')))).returning()
    if (!row) throw notFound()
    await log(me, 'melding/suggestie verwijderd', `${row.kind} ${row.id}`, row.title)
    return c.body(null, 204)
  })

  // ------------------------------------------------------------------ forum
  // Threads to pin, lock or remove (the actions themselves use the forum's own routes)
  .get('/admin/forum/threads', async (c) => {
    requireAdmin(c)
    const filter = c.req.query('filter')
    const rows = await db
      .select({ t: forumThreads, section: { slug: forumSections.slug, name: forumSections.name }, u: summaryColumns })
      .from(forumThreads)
      .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
      .leftJoin(users, eq(users.id, forumThreads.userId))
      .where(filter === 'vastgezet' ? eq(forumThreads.pinned, true) : filter === 'gesloten' ? eq(forumThreads.locked, true) : undefined)
      .orderBy(desc(forumThreads.pinned), desc(forumThreads.lastPostAt))
      .limit(100)
    return c.json(
      rows.map(({ t, section, u }) => ({
        id: t.id,
        title: t.title,
        section,
        pinned: t.pinned,
        locked: t.locked,
        replies: Math.max(0, t.postCount - 1),
        views: t.views,
        starter: u?.id ? toSummary(u) : null,
        lastPostAt: t.lastPostAt.toISOString(),
        href: threadHref(section.slug, t.id, t.title),
      })),
    )
  })
