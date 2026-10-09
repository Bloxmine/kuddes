import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, ne, or, sql, isNotNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { announcePresence } from '../lib/messenger'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { HIDDEN_STATUS, ONLINE_STATUSES } from '../../shared/onlineStatus'
import { GAMER_PLATFORMS, GAMER_TAG_MAX, INTERESTS, INTEREST_MAX, type GamerPlatform, type InterestKey } from '../../shared/profileExtras'
import { MEMBER_PAGE_SIZE, type MemberCard, type Profile } from '../../shared/api'
import { CONSENT_VERSION } from '../../shared/privacy'
import { withDefaults } from '../../shared/customization'
import { AVATAR_FRAMES, isAvatarFrame, type AvatarFrame } from '../../shared/frames'
import { PROFILE_CURSORS, isProfileCursor, type ProfileCursor } from '../../shared/cursors'
import { db } from '../db/client'
import { activities, friendships, photos, profileVisits, remoteFollows, respects, users, type User } from '../db/schema'
import { recordActivity } from '../lib/activities'
import { HttpError, parse } from '../lib/errors'
import { hashPassword, verifyPassword } from '../lib/password'
import { rateLimit } from '../lib/rateLimit'
import {
  customThemeSchema,
  ownsImages,
  homeLayoutSchema,
  preferencesSchema,
  profileColorsSchema,
  profileLayoutSchema,
  skinSchema,
  themeSchema,
} from '../lib/customization'
import { ONLINE_WINDOW_MS, ageFrom, toSummary } from '../lib/serialize'
import { destroySession, requireUser, requireVerified, type AppEnv } from '../lib/session'
import { MAX_UPLOAD_BYTES, removeUpload, storeImage } from '../lib/uploads'
import { messagePermission } from './messages'
import { deleteAccount } from '../lib/accounts'
import { profileRelations, removeRelationsBetween } from '../lib/relations'
import { acceptedFriendsOf, canSeeProfile, findUser, friendshipBetween, friendshipState, requireProfileAccess, summaryColumns, toMe } from '../lib/users'
import { befriend, friendRequestRefusal } from '../lib/friends'
import { botEvent } from '../lib/bots'
import { checkFriendRequest } from '../lib/moderation'
import { automationEvent } from '../lib/automations'
import { followChanged, friendshipEnded, profileChanged, respected } from '../lib/federation/outbox'
import { serverInfo } from '../lib/siteSettings'
import { remoteOf, resolveHandle } from '../lib/federation/actors'
import { fetchEarlierPosts } from '../lib/federation/inbox'
import { HANDLE_PATTERN } from '../../shared/federation'


const VIEW_DEDUPE_MS = 30 * 60 * 1000

/** Accounts whose earlier posts were already asked for since the server started (once each is enough). */
const fetchedEarlier = new Set<number>()

/** Where someone from another server is, and whether the viewer follows them (Mastodon and the like). */
async function remoteInfo(user: User, viewer: User | null): Promise<NonNullable<Profile['remote']>> {
  const remote = await remoteOf(user.id)
  // Followed before their earlier posts were fetched (or that failed): try once more when the profile is opened
  if (remote && !remote.actor.weide && !fetchedEarlier.has(user.id)) {
    const [followed] = await db.select({ id: remoteFollows.followerId }).from(remoteFollows).where(eq(remoteFollows.targetId, user.id)).limit(1)
    if (followed) {
      fetchedEarlier.add(user.id)
      void fetchEarlierPosts(remote).catch((e) => console.error('[federatie] eerdere berichten:', e))
    }
  }
  const [follow] = viewer
    ? await db
        .select({ accepted: remoteFollows.accepted })
        .from(remoteFollows)
        .where(and(eq(remoteFollows.followerId, viewer.id), eq(remoteFollows.targetId, user.id)))
    : []
  return {
    domain: user.domain!,
    url: remote?.actor.url ?? null,
    weide: remote?.actor.weide ?? false,
    following: follow ? (follow.accepted ? 'following' : 'pending') : 'none',
  }
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} mag maximaal ${max} tekens hebben.`)
    .transform((s) => s || null)
    .nullable()
    .optional()

const tagList = z
  .array(z.string().trim().min(1).max(40, 'Een item mag maximaal 40 tekens hebben.'))
  .max(25, 'Maximaal 25 items.')
  .transform((list) => [...new Set(list)])
  .optional()

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Vul je naam in.').max(60).optional(),
  nickname: z.string().trim().min(1, 'Vul een roepnaam in.').max(40).optional(),
  gender: z.enum(['man', 'vrouw', 'anders']).nullable().optional(),
  birthdate: z.iso
    .date('Ongeldige geboortedatum.')
    .refine((d) => {
      const age = ageFrom(d)
      return age !== null && age >= 0 && age < 120
    }, 'Ongeldige geboortedatum.')
    .nullable()
    .optional(),
  city: optionalText(60, 'Woonplaats'),
  // "mijnsite.nl" is fine too: https:// is put in front
  website: z
    .string()
    .trim()
    .max(200, 'Je website mag maximaal 200 tekens hebben.')
    .transform((s) => (s && !/^https?:\/\//i.test(s) ? `https://${s}` : s) || null)
    .refine((w) => !w || /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(w), 'Dit is geen geldig webadres.')
    .nullable()
    .optional(),
  about: optionalText(2000, 'Over jezelf'),
  // Explicit consent for special personal data on the profile (AVG art. 9), kept as when it was given
  sensitiveConsent: z.boolean().optional(),
  brands: tagList,
  spots: tagList,
  music: tagList,
  // Empty ones are left out, so the profile only shows what's filled in
  interests: z
    .object(Object.fromEntries((Object.keys(INTERESTS) as InterestKey[]).map((k) => [k, z.string().trim().max(INTEREST_MAX, `${INTERESTS[k].label} mag maximaal ${INTEREST_MAX} tekens hebben.`).optional()])) as Record<InterestKey, z.ZodOptional<z.ZodString>>)
    .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)))
    .optional(),
  gamerTags: z
    .object(Object.fromEntries((Object.keys(GAMER_PLATFORMS) as GamerPlatform[]).map((k) => [k, z.string().trim().max(GAMER_TAG_MAX, `Een gamertag mag maximaal ${GAMER_TAG_MAX} tekens hebben.`).optional()])) as Record<GamerPlatform, z.ZodOptional<z.ZodString>>)
    .transform((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)))
    .optional(),
  skin: skinSchema.nullable().optional(),
  avatarFrame: z.enum(Object.keys(AVATAR_FRAMES) as [AvatarFrame]).nullable().optional(),
  profileCursor: z.enum(Object.keys(PROFILE_CURSORS) as [ProfileCursor], { message: 'Kies een cursor uit de lijst.' }).nullable().optional(),
  profileColors: profileColorsSchema.nullable().optional(),
  profileLayout: profileLayoutSchema.nullable().optional(),
  homeLayout: homeLayoutSchema.nullable().optional(),
  customTheme: customThemeSchema.nullable().optional(),
  /** Merged into the stored preferences, so a form can send only what it shows. */
  preferences: preferencesSchema.optional(),
  onlineStatus: z.enum(ONLINE_STATUSES).optional(),
  theme: themeSchema.nullable().optional(),
  buddyEnabled: z.boolean().optional(),
  // Appearance codes use BuddyPoke's own base64 alphabet (see web/js/buddy.js)
  buddyCode: z
    .string()
    .max(8000, 'Deze BuddyPoke-code is te lang.')
    .regex(/^[A-Za-z0-9_/=]+$/, 'Ongeldige BuddyPoke-code.')
    .nullable()
    .optional(),
  buddyMood: z
    .string()
    .max(40)
    .regex(/^[A-Za-z0-9_]+$/, 'Ongeldige mood.')
    .nullable()
    .optional(),
})

const passwordSchema = z.object({
  current: z.string().min(1, 'Vul je huidige wachtwoord in.'),
  next: z.string().min(8, 'Je nieuwe wachtwoord moet minstens 8 tekens hebben.').max(200),
})

export const userRoutes = new Hono<AppEnv>()
  // Nieuwe mensen (/leden): every member, newest first, who's online now, or A to Z
  .get('/members', async (c) => {
    requireUser(c)
    const sort = c.req.query('sort')
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    const page = Math.max(0, Math.min(500, Number(c.req.query('page')) || 0))
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const where = and(
      // Members on the waitlist aren't shown until they're approved; accounts of other servers aren't members here
      isNull(users.blockedAt),
      isNotNull(users.emailVerifiedAt),
      isNull(users.domain),
      q ? or(ilike(users.username, pattern), ilike(users.name, pattern), ilike(users.nickname, pattern)) : undefined,
      // Only who's really online: "Toon offline" stays hidden
      sort === 'online' ? and(gt(users.lastSeenAt, new Date(Date.now() - ONLINE_WINDOW_MS)), ne(users.onlineStatus, HIDDEN_STATUS)) : undefined,
    )
    const rows = await db
      .select({ ...summaryColumns, birthdate: users.birthdate, preferences: users.preferences })
      .from(users)
      .where(where)
      .orderBy(...(sort === 'naam' ? [asc(sql`lower(${users.nickname})`), asc(users.id)] : [desc(users.id)]))
      .limit(MEMBER_PAGE_SIZE + 1)
      .offset(page * MEMBER_PAGE_SIZE)
    const [{ n }] = await db.select({ n: count() }).from(users).where(where)
    return c.json({
      items: rows.slice(0, MEMBER_PAGE_SIZE).map((u) => ({ ...toSummary(u), age: withDefaults(u.preferences).showAge ? ageFrom(u.birthdate) : null })) satisfies MemberCard[],
      total: n,
      hasMore: rows.length > MEMBER_PAGE_SIZE,
    })
  })

  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim().slice(0, 60)
    if (q.length < 2) return c.json([])
    // "@naam@server.nl": someone on another server, looked up there
    const remote = HANDLE_PATTERN.test(q) ? await resolveHandle(q).catch(() => null) : null
    const pattern = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const rows = await db
      .select(summaryColumns)
      .from(users)
      .where(and(or(ilike(users.username, pattern), ilike(users.name, pattern), ilike(users.nickname, pattern)), isNotNull(users.emailVerifiedAt)))
      .orderBy(sql`${users.username} = ${q.toLowerCase()} desc`, users.name)
      .limit(30)
    if (remote) return c.json([toSummary(remote.user), ...rows.filter((r) => r.id !== remote.user.id).map(toSummary)])
    return c.json(rows.map(toSummary))
  })

  .get('/users/:username', async (c) => {
    const viewer = c.get('user')
    const user = await findUser(c.req.param('username'))
    const isSelf = viewer?.id === user.id

    const prefs = withDefaults(user.preferences)
    // For friends only (Instellingen → Privacy): the others get the name, the photo and a way to become friends
    const locked = !(await canSeeProfile(viewer ?? null, user))

    // Count a view once per visitor per half hour, and remember who visited
    // (unless the visitor browses anonymously: then only the view counts)
    if (viewer && !isSelf && !locked) {
      const anonymous = withDefaults(viewer.preferences).anonymousVisits
      const [previous] = await db
        .select({ visitedAt: profileVisits.visitedAt })
        .from(profileVisits)
        .where(and(eq(profileVisits.visitorId, viewer.id), eq(profileVisits.profileId, user.id)))
      if (anonymous) {
        await db.delete(profileVisits).where(and(eq(profileVisits.visitorId, viewer.id), eq(profileVisits.profileId, user.id)))
      } else {
        await db
          .insert(profileVisits)
          .values({ visitorId: viewer.id, profileId: user.id })
          .onConflictDoUpdate({ target: [profileVisits.visitorId, profileVisits.profileId], set: { visitedAt: new Date() } })
      }
      if (!previous || Date.now() - previous.visitedAt.getTime() > VIEW_DEDUPE_MS) {
        await db.update(users).set({ views: sql`${users.views} + 1` }).where(eq(users.id, user.id))
        user.views++
      }
    }

    const [[respect], [friendCount], [photoCount], friendship, respected] = await Promise.all([
      db.select({ n: count() }).from(respects).where(eq(respects.receiverId, user.id)),
      db
        .select({ n: count() })
        .from(friendships)
        .where(
          and(
            eq(friendships.status, 'accepted'),
            or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)),
          ),
        ),
      db.select({ n: count() }).from(photos).where(eq(photos.userId, user.id)),
      viewer && !isSelf ? friendshipState(viewer.id, user.id) : Promise.resolve('none' as const),
      viewer && !isSelf
        ? db
            .select({ n: count() })
            .from(respects)
            .where(and(eq(respects.giverId, viewer.id), eq(respects.receiverId, user.id)))
            .then(([r]) => r.n > 0)
        : Promise.resolve(false),
    ])

    const canMessage = !!viewer && !isSelf && !(await messagePermission(viewer, user))
    const befriendRefusal = viewer && !isSelf && friendship === 'none' ? await friendRequestRefusal(viewer, user) : null

    const profile: Profile = {
      ...toSummary(user),
      gender: user.gender,
      age: prefs.showAge ? ageFrom(user.birthdate) : null,
      city: user.city,
      website: user.website,
      about: user.about,
      brands: user.brands,
      spots: user.spots,
      music: user.music,
      interests: user.interests ?? {},
      gamerTags: user.gamerTags ?? {},
      skin: user.skin,
      avatarFrame: isAvatarFrame(user.avatarFrame) ? user.avatarFrame : null,
      cursor: isProfileCursor(user.profileCursor) ? user.profileCursor : null,
      profileColors: user.profileColors,
      layout: user.profileLayout,
      birthdayToday: isBirthdayToday(user.birthdate),
      aboutFirst: prefs.aboutFirst,
      canMessage,
      canKnuffel: !!viewer && (isSelf || prefs.knuffelsFrom === 'iedereen' || friendship === 'friends'),
      buddy: user.buddyEnabled ? { code: user.buddyCode, mood: user.buddyMood } : null,
      views: user.views,
      respect: respect.n,
      friendCount: friendCount.n,
      photoCount: photoCount.n,
      onlineStatus: user.onlineStatus === HIDDEN_STATUS ? 'Offline' : user.onlineStatus,
      createdAt: user.createdAt.toISOString(),
      relation: viewer ? { isSelf, friendship, respected } : null,
      relations: await profileRelations(user, viewer ?? null),
      befriendRefusal,
      locked,
      remote: user.domain ? await remoteInfo(user, viewer ?? null) : null,
    }
    if (locked)
      return c.json({
        ...profile,
        gender: null,
        age: null,
        city: null,
        website: null,
        about: null,
        brands: [],
        spots: [],
        music: [],
        interests: {},
        gamerTags: {},
        layout: null,
        buddy: null,
        canKnuffel: false,
        friendCount: 0,
        photoCount: 0,
        respect: 0,
        views: 0,
        relations: { status: null, partner: null, family: [], bestFriends: [] },
      } as Profile)
    return c.json(profile)
  })

  .get('/users/:username/friends', async (c) => {
    const user = await findUser(c.req.param('username'))
    await requireProfileAccess(c.get('user'), user)
    const limit = Math.min(Number(c.req.query('limit')) || 500, 500)
    const rows = await db
      .select(summaryColumns)
      .from(users)
      .where(inArray(users.id, acceptedFriendsOf(user.id)))
      .orderBy(desc(users.lastSeenAt))
      .limit(limit)
    return c.json(rows.map(toSummary))
  })

  // Only you can see who visited your profile
  .get('/users/:username/visitors', async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    if (user.id !== me.id) throw new HttpError(403, 'Alleen jij kunt zien wie jouw profiel bekeek.')
    const rows = await db
      .select({ ...summaryColumns, visitedAt: profileVisits.visitedAt })
      .from(profileVisits)
      .innerJoin(users, eq(users.id, profileVisits.visitorId))
      .where(eq(profileVisits.profileId, me.id))
      .orderBy(desc(profileVisits.visitedAt))
      .limit(12)
    return c.json(rows.map((r) => ({ ...toSummary(r), visitedAt: r.visitedAt.toISOString() })))
  })

  .post('/users/:username/respect', rateLimit('respect', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    if (user.id === me.id) throw new HttpError(400, 'Je kunt jezelf geen respect geven.')
    const [given] = await db.insert(respects).values({ giverId: me.id, receiverId: user.id }).onConflictDoNothing().returning()
    if (given) respected(me, { userId: user.id })
    const [{ n }] = await db.select({ n: count() }).from(respects).where(eq(respects.receiverId, user.id))
    return c.json({ respect: n })
  })

  // Send a friend request, or accept one they sent you
  .post('/users/:username/friend', rateLimit('vriendschapsverzoeken', 50, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    if (user.id === me.id) throw new HttpError(400, 'Je kunt geen vrienden worden met jezelf.')
    const refused = await friendRequestRefusal(me, user)
    if (refused) throw new HttpError(403, refused)
    // Mastodon and the like have no friendships: you follow them instead
    const remote = user.domain ? await remoteOf(user.id) : null
    if (remote && !remote.actor.weide && (await friendshipBetween(me.id, user.id))?.requesterId !== user.id)
      throw new HttpError(400, `${user.nickname} zit niet op een Kuddes-server. Volg ${user.nickname} in plaats daarvan.`)
    const friendship = await befriend(me, user)
    // Toezicht: lots of requests in a short time is a behaviour the watching bot notices
    if (friendship === 'outgoing') {
      checkFriendRequest(me)
      automationEvent('vriendschap', { member: me })
    }
    // A request to a bot: it may accept and answer (never one bot to another)
    if (user.isBot && !me.isBot && friendship === 'outgoing') botEvent({ trigger: 'vriendschap', botId: user.id, member: me })
    return c.json({ friendship })
  })

  // Follow an account on a server that isn't Kuddes (Mastodon and the like); its public posts come to Overzicht → Fediverse
  .post('/users/:username/follow', rateLimit('volgen', 60, 60 * 60 * 1000), async (c) => {
    const me = requireVerified(c)
    const user = await findUser(c.req.param('username'))
    const remote = user.domain ? await remoteOf(user.id) : null
    if (!remote || remote.actor.weide) throw new HttpError(400, 'Alleen accounts buiten Kuddes kun je volgen; hier word je vrienden.')
    if (!serverInfo().fediverse) throw new HttpError(403, 'Volgen buiten Kuddes staat uit op deze server.')
    const [row] = await db.insert(remoteFollows).values({ followerId: me.id, targetId: user.id }).onConflictDoNothing().returning()
    if (row) {
      followChanged(me, user)
      // The first to follow them: their newest posts and photos come here too
      fetchedEarlier.add(user.id)
      void fetchEarlierPosts(remote).catch((e) => console.error('[federatie] eerdere berichten:', e))
    }
    return c.json(await remoteInfo(user, me))
  })

  .delete('/users/:username/follow', async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    const [row] = await db
      .delete(remoteFollows)
      .where(and(eq(remoteFollows.followerId, me.id), eq(remoteFollows.targetId, user.id)))
      .returning()
    if (row) followChanged(me, user, true)
    return c.json(user.domain ? await remoteInfo(user, me) : null)
  })

  // Cancel a request, decline one, or end a friendship
  .delete('/users/:username/friend', async (c) => {
    const me = requireUser(c)
    const user = await findUser(c.req.param('username'))
    const existing = await friendshipBetween(me.id, user.id)
    if (existing) {
      friendshipEnded(me, user, existing)
      await db.delete(friendships).where(eq(friendships.id, existing.id))
    }
    await removeRelationsBetween(me.id, user.id)
    return c.json({ friendship: 'none' })
  })

  .get('/friends/requests', async (c) => {
    const me = requireUser(c)
    const incoming = await db
      .select({ ...summaryColumns, createdAt: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.requesterId))
      .where(and(eq(friendships.addresseeId, me.id), eq(friendships.status, 'pending')))
      .orderBy(desc(friendships.createdAt))
    const outgoing = await db
      .select({ ...summaryColumns, createdAt: friendships.createdAt })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.addresseeId))
      .where(and(eq(friendships.requesterId, me.id), eq(friendships.status, 'pending')))
      .orderBy(desc(friendships.createdAt))
    const map = (r: (typeof incoming)[number]) => ({ user: toSummary(r), createdAt: r.createdAt.toISOString() })
    return c.json({ incoming: incoming.map(map), outgoing: outgoing.map(map) })
  })

  .patch('/me', async (c) => {
    const me = requireUser(c)
    const { preferences, sensitiveConsent, ...input } = parse(profileSchema, await c.req.json().catch(() => null))
    if (!ownsImages(me.id, input.customTheme, input.profileColors)) {
      throw new HttpError(400, 'Je kunt alleen je eigen achtergronden gebruiken.')
    }
    // "eigen" only makes sense once there are colours to use
    if (input.theme === 'eigen' && !(input.customTheme ?? me.customTheme)) {
      throw new HttpError(400, 'Maak eerst je eigen thema.', { theme: 'Maak eerst je eigen thema.' })
    }
    if (input.skin === 'eigen' && !(input.profileColors ?? me.profileColors)) {
      throw new HttpError(400, 'Kies eerst je eigen kleuren.', { skin: 'Kies eerst je eigen kleuren.' })
    }
    const [updated] = await db
      .update(users)
      .set({
        ...input,
        ...(sensitiveConsent !== undefined && { sensitiveConsentAt: sensitiveConsent ? (me.sensitiveConsentAt ?? new Date()) : null }),
        // Merged in the database, so two quick changes can't undo each other
        ...(preferences && { preferences: sql`${users.preferences} || ${JSON.stringify(preferences)}::jsonb` }),
        // Kept as a column too, so every list of members can check it cheaply
        ...(preferences?.avatarPublic !== undefined && { avatarPublic: preferences.avatarPublic }),
      })
      .where(eq(users.id, me.id))
      .returning()
    // Friends in Messenger see the new status, name or photo right away
    if (input.onlineStatus !== undefined || input.nickname !== undefined || input.name !== undefined || preferences?.allowCalls !== undefined) void announcePresence(me.id)
    profileChanged(me.id)
    return c.json(await toMe(updated))
  })

  .post('/me/avatar', bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 64 * 1024, onError: tooLarge }), rateLimit('uploads', 30, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const body = await c.req.parseBody()
    const stored = await storeImage(body.file, 'avatars')
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(users).set({ avatarPath: stored.path }).where(eq(users.id, me.id)).returning()
      // Only the latest profile photo appears on the timeline; older ones are deleted
      await tx.delete(activities).where(and(eq(activities.type, 'avatar'), eq(activities.actorId, me.id)))
      await recordActivity({ type: 'avatar', actorId: me.id }, tx)
      return row
    })
    await removeUpload(me.avatarPath)
    void announcePresence(me.id)
    profileChanged(me.id)
    return c.json(await toMe(updated))
  })

  .delete('/me/avatar', async (c) => {
    const me = requireUser(c)
    const [updated] = await db.update(users).set({ avatarPath: null }).where(eq(users.id, me.id)).returning()
    await db.delete(activities).where(and(eq(activities.type, 'avatar'), eq(activities.actorId, me.id)))
    await removeUpload(me.avatarPath)
    void announcePresence(me.id)
    profileChanged(me.id)
    return c.json(await toMe(updated))
  })

  .post('/me/password', rateLimit('wachtwoord', 10, 15 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(passwordSchema, await c.req.json().catch(() => null))
    if (!(await verifyPassword(input.current, me.passwordHash))) {
      throw new HttpError(400, 'Je huidige wachtwoord klopt niet.', { current: 'Je huidige wachtwoord klopt niet.' })
    }
    await db.update(users).set({ passwordHash: await hashPassword(input.next) }).where(eq(users.id, me.id))
    return c.body(null, 204)
  })

  // Agreeing to a new privacy statement and user agreement (asked for when they changed)
  .post('/me/consent', async (c) => {
    const me = requireUser(c)
    parse(
      z.object({
        privacy: z.literal(true, { error: 'Ga akkoord met de privacyverklaring en de gebruikersovereenkomst om verder te gaan.' }),
      }),
      await c.req.json().catch(() => null),
    )
    const [updated] = await db.update(users).set({ privacyAcceptedAt: new Date(), privacyVersion: CONSENT_VERSION }).where(eq(users.id, me.id)).returning()
    return c.json(await toMe(updated))
  })

  // Deletes the account and, through cascades, everything the member posted
  .delete('/me', rateLimit('account verwijderen', 5, 15 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { password } = parse(z.object({ password: z.string().min(1, 'Vul je wachtwoord in.') }), await c.req.json().catch(() => null))
    if (!(await verifyPassword(password, me.passwordHash))) {
      throw new HttpError(400, 'Je wachtwoord klopt niet.', { password: 'Je wachtwoord klopt niet.' })
    }
    // The admin account can't delete itself from the website (that would leave the site without one)
    if (me.forumRole === 'admin') throw new HttpError(400, 'Het beheerdersaccount kan niet worden verwijderd.')
    await destroySession(c)
    await deleteAccount(me)
    return c.body(null, 204)
  })

/** Birthdays on 29 February are celebrated on 28 February in other years. */
function isBirthdayToday(birthdate: string | null, now = new Date()): boolean {
  if (!birthdate) return false
  const [, month, day] = birthdate.split('-').map(Number)
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1
  const d = month === 2 && day === 29 && !leap ? 28 : day
  return now.getMonth() + 1 === month && now.getDate() === d
}

function tooLarge(): never {
  throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
}
