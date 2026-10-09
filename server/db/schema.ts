import { sql } from 'drizzle-orm'
import type { AutomationConfig } from '../../shared/automations'
import type { BlacklistKind } from '../../shared/blacklist'
import type { ReportKind, ReportReason } from '../../shared/safety'
import { DEFAULT_BOT_OPTIONS, DEFAULT_MODERATION, type BotAbility, type BotKind, type BotModeration, type BotOptions, type BotRule, type BotTrigger } from '../../shared/bots'
import type { IpBanScope } from '../../shared/ipBans'
import type { ServerPolicy } from '../../shared/federation'
import type { DocKind } from '../../shared/documents'
import type { TrackCredit } from '../../shared/music'
import type { CoverColor, CoverStyle, GadgetConfig, GadgetType } from '../../shared/gadgets'
import type { KuddeGadgetConfig, KuddeGadgetType } from '../../shared/kuddeGadgets'
import type { KuddeRight } from '../../shared/kuddes'
import type { SuggestionStatus } from '../../shared/suggestions'
import type { BejeweledBadge, BejeweledBadgeState } from '../../shared/bejeweled'
import type { PhotoEdits } from '../../shared/photoEdits'
import type { PhotoExif } from '../../shared/photography'
import type { KuddeInfo } from '../../shared/kuddes'
import type { GamerTags, Interests } from '../../shared/profileExtras'
import type { ShareCardSettings } from '../../shared/shareCard'
import type { MediaDetails } from '../../shared/media'
import type { BoxLayout, CustomTheme, HomeBox, LayoutSnapshot, Preferences, ProfileBox, ProfileColors } from '../../shared/customization'
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const genderEnum = pgEnum('gender', ['man', 'vrouw', 'anders'])
export const friendshipStatusEnum = pgEnum('friendship_status', ['pending', 'accepted'])
/** "pending": asked to join a closed (besloten) Kudde, not yet a member. */
export const kuddeRoleEnum = pgEnum('kudde_role', ['owner', 'member', 'pending'])
export const kuddeVisibilityEnum = pgEnum('kudde_visibility', ['openbaar', 'besloten'])
export const attendanceEnum = pgEnum('attendance', ['ja', 'misschien'])
export const suggestionKindEnum = pgEnum('suggestion_kind', ['suggestie', 'probleem'])
export const visibilityEnum = pgEnum('visibility', ['iedereen', 'vrienden'])
export const buddyEventTypeEnum = pgEnum('buddy_event_type', ['poke', 'mood'])
export const activityTypeEnum = pgEnum('activity_type', ['status', 'photo', 'knuffel', 'friendship', 'avatar', 'kudde_join', 'video', 'recipe', 'review', 'blog', 'track', 'radio', 'photography'])
export const videoVisibilityEnum = pgEnum('video_visibility', ['openbaar', 'verborgen', 'vrienden'])
export const forumRoleEnum = pgEnum('forum_role', ['admin', 'moderator'])
export const chatKindEnum = pgEnum('chat_kind', ['msg', 'me', 'join', 'part', 'topic', 'kick', 'system'])
export const videoStatusEnum = pgEnum('video_status', ['uploaden', 'verwerken', 'klaar', 'mislukt'])
export const requestStatusEnum = pgEnum('request_status', ['open', 'goedgekeurd', 'afgewezen'])
export const gameStatusEnum = pgEnum('game_status', ['uitgenodigd', 'bezig', 'klaar', 'geweigerd', 'geannuleerd', 'afgebroken'])
export const gameEndEnum = pgEnum('game_end', ['uitgespeeld', 'opgegeven', 'verlaten'])
/** A player's place in a game: invited, playing along, said no, or left a game with more players. */
export const gamePlayerStatusEnum = pgEnum('game_player_status', ['uitgenodigd', 'meedoen', 'geweigerd', 'weg'])
export const relationKindEnum = pgEnum('relation_kind', ['beste_vriend', 'partner', 'familie'])
export const relationStatusEnum = pgEnum('relation_status', ['pending', 'accepted'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    /** Lowercase, used in profile URLs. */
    username: text('username').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    name: text('name').notNull(),
    /** Display name as the member types it, often decorated. */
    nickname: text('nickname').notNull(),
    gender: genderEnum('gender'),
    birthdate: date('birthdate'),
    city: text('city'),
    /** Their own website, as a link on their profile. */
    website: text('website'),
    about: text('about'),
    brands: text('brands').array().notNull().default(sql`'{}'::text[]`),
    spots: text('spots').array().notNull().default(sql`'{}'::text[]`),
    music: text('music').array().notNull().default(sql`'{}'::text[]`),
    /** Favourites and a motto for the Profiel box (shared/profileExtras.ts). */
    interests: jsonb('interests').$type<Interests>(),
    gamerTags: jsonb('gamer_tags').$type<GamerTags>(),
    /** Key of one of the built-in profile skins, or null for the standard design. */
    skin: text('skin'),
    avatarPath: text('avatar_path'),
    /** Visitors without an account may see the photo (a copy of preferences.avatarPublic, for the summaries). */
    avatarPublic: boolean('avatar_public').notNull().default(true),
    /** Border around the profile photo (shared/frames.ts); null = none. */
    avatarFrame: text('avatar_frame'),
    /** An animated cursor on their profile (shared/cursors.ts). */
    profileCursor: text('profile_cursor'),
    /** Site colour theme, a key from shared/themes.ts; null = default. */
    theme: text('theme'),
    /** The member's own site colours, used when theme is "eigen". */
    customTheme: jsonb('custom_theme').$type<CustomTheme>(),
    /** The member's own profile design, used when skin is "eigen". */
    profileColors: jsonb('profile_colors').$type<ProfileColors>(),
    /** Arrangement of the boxes on their profile and on Home; null = default. */
    profileLayout: jsonb('profile_layout').$type<BoxLayout<ProfileBox>>(),
    homeLayout: jsonb('home_layout').$type<BoxLayout<HomeBox>>(),
    /** The public profielkaartje: on or off, and what it shows (shared/shareCard.ts). */
    shareCard: jsonb('share_card').$type<Partial<ShareCardSettings>>(),
    /** The personal message in Kuddes Messenger, under your name in your friends' contact lists. */
    messengerNote: text('messenger_note').notNull().default(''),
    /** Friends pinned in your Messenger list, in your order (ids; ex-friends are skipped when read). */
    messengerFavorites: integer('messenger_favorites').array().notNull().default(sql`'{}'::int[]`),
    /** Display, posting and privacy preferences (shared/customization.ts). */
    preferences: jsonb('preferences').$type<Partial<Preferences>>().notNull().default({}),
    /** BuddyPoke gadget on the profile: appearance code and mood from the gadget. */
    buddyEnabled: boolean('buddy_enabled').notNull().default(false),
    buddyCode: text('buddy_code'),
    buddyMood: text('buddy_mood'),
    buddyMoodComment: text('buddy_mood_comment'),
    /** BuddyPoke gold, shop purchases and daily counters (JSON, written by the app). */
    buddyState: text('buddy_state'),
    views: integer('views').notNull().default(0),
    onlineStatus: text('online_status').notNull().default('Online'),
    /**
     * "admin" is this server's admin (granted on the server with `npm run admin`),
     * who also runs the forum. Forum section moderators are in forum_moderators.
     */
    forumRole: forumRoleEnum('forum_role'),
    /** Blocked by the admin: can't log in. */
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    blockReason: text('block_reason'),
    /** Made by the admin on /beheer, to fill the site. */
    isDummy: boolean('is_dummy').notNull().default(false),
    /** A bot account (Beheer → Bots, `bots`): shown with a "Bot" label everywhere. */
    isBot: boolean('is_bot').notNull().default(false),
    /** Relatiestatus (shared/relations.ts); null = not shown. */
    relationshipStatus: text('relationship_status'),
    /** May upload to Kuddes Video: asked for on the upload page, given by the admin. */
    videoUploadAllowed: boolean('video_upload_allowed').notNull().default(false),
    /** May upload music (/muziek), after asking: like videos. */
    musicUploadAllowed: boolean('music_upload_allowed').notNull().default(false),
    /** May host live shows on Kuddes Radio (after asking, like video). */
    radioAllowed: boolean('radio_allowed').notNull().default(false),
    /** The wide image at the top of their Kuddes Video channel, and where it's cropped (0 top … 100 bottom). */
    channelBannerPath: text('channel_banner_path'),
    channelBannerY: integer('channel_banner_y').notNull().default(50),
    /** About the channel, under the featured video. */
    channelDescription: text('channel_description').notNull().default(''),
    /** The video big at the top of the channel (its public id); none = the newest. */
    channelFeatured: text('channel_featured'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    /**
     * The server of an account from elsewhere ("naam@server.nl" as username, see
     * remote_actors); null for members of this server. Such an account can't log in.
     */
    domain: text('domain'),
    /** The address they last used the site from, for IP bans; erased LAST_IP_DAYS after their last visit (shared/ipBans.ts). */
    lastIp: text('last_ip'),
    /** When the admin approved them (or they clicked the link in the confirmation mail); null = waiting, can't post yet. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Why they want to join, from the sign-up form; for the admin, cleared once they're approved. */
    signupReason: text('signup_reason'),
    /** When they agreed to the privacy statement and user agreement, and which version (CONSENT_VERSION in shared/privacy.ts); null for accounts made before it or by the admin. */
    privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }),
    privacyVersion: text('privacy_version'),
    /** When they explicitly agreed to showing special personal data (AVG art. 9) on their profile; null = not given. */
    sensitiveConsentAt: timestamp('sensitive_consent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('users_username_idx').on(t.username),
    uniqueIndex('users_email_idx').on(sql`lower(${t.email})`),
    index('users_domain_idx').on(t.domain),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

/**
 * Links in e-mails: confirm your address, reset your password, or confirm a
 * new address. Like sessions, only the SHA-256 of the token is stored; a
 * token works once and expires.
 */
export const emailTokens = pgTable(
  'email_tokens',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose').$type<'bevestigen' | 'wachtwoord' | 'nieuw-adres'>().notNull(),
    /** The address the mail went to (for a new address: the new one). */
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('email_tokens_user_idx').on(t.userId, t.purpose)],
)

/** WieWatWaar: a status update. */
export const statuses = pgTable(
  'statuses',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    where: text('where'),
    device: text('device'),
    /** Key from shared/moods.ts ("Gevoel"). */
    /** An icon picked for the WieWatWaar (shared/icons.ts). */
    icon: text('icon'),
    mood: text('mood'),
    visibility: visibilityEnum('visibility').notNull().default('iedereen'),
    /** A poll under the WieWatWaar (shared/polls.ts). */
    poll: jsonb('poll').$type<{ question: string; options: string[]; closed: boolean }>(),
    /** A glitterplaatje with it (it stays if the photo is also set). */
    glitterId: integer('glitter_id').references((): AnyPgColumn => glitters.id, { onDelete: 'set null' }),
    /** Posted by the owner as their Kudde: it shows with the Kudde's name and picture, always for everyone. */
    kuddeId: integer('kudde_id').references((): AnyPgColumn => kuddes.id, { onDelete: 'cascade' }),
    /** For a WieWatWaar from another server: its ActivityPub id. */
    apId: text('ap_id'),
    /** Its pictures, stored here like profile photos (other servers' images can't be shown directly), and where the post is on its server. */
    media: jsonb('media').$type<{ path: string; width: number; height: number; alt: string }[]>(),
    apUrl: text('ap_url'),
    createdAt: createdAt(),
  },
  (t) => [index('statuses_created_idx').on(t.createdAt), index('statuses_user_idx').on(t.userId, t.createdAt), uniqueIndex('statuses_ap_idx').on(t.apId)],
)

/**
 * The photos with a WieWatWaar, in order (up to STATUS_MAX_PHOTOS): each one
 * of the member's own (from their Foto's) or from an open Kudde they're in.
 * Deleting the photo takes it out of the WieWatWaar too.
 */
export const statusPhotos = pgTable(
  'status_photos',
  {
    statusId: integer('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    photoId: integer('photo_id').references(() => photos.id, { onDelete: 'cascade' }),
    kuddePhotoId: integer('kudde_photo_id').references((): AnyPgColumn => kuddePhotos.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.statusId, t.position] }),
    index('status_photos_photo_idx').on(t.photoId),
    index('status_photos_kudde_photo_idx').on(t.kuddePhotoId),
    check('status_photos_one_source', sql`(${t.photoId} is null) <> (${t.kuddePhotoId} is null)`),
  ],
)

export const statusPollVotes = pgTable(
  'status_poll_votes',
  {
    statusId: integer('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    option: integer('option').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.statusId, t.userId] })],
)

/** Knuffels: guestbook messages left on someone's profile. */
export const knuffels = pgTable(
  'knuffels',
  {
    id: serial('id').primaryKey(),
    profileId: integer('profile_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** A glitterplaatje sent with (or instead of) the text. */
    glitterId: integer('glitter_id').references((): AnyPgColumn => glitters.id, { onDelete: 'set null' }),
    /** For a knuffel written on another server: its ActivityPub id. */
    apId: text('ap_id'),
    createdAt: createdAt(),
  },
  (t) => [index('knuffels_profile_idx').on(t.profileId, t.createdAt), index('knuffels_created_idx').on(t.createdAt), uniqueIndex('knuffels_ap_idx').on(t.apId)],
)

export const friendships = pgTable(
  'friendships',
  {
    id: serial('id').primaryKey(),
    requesterId: integer('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: integer('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull().default('pending'),
    /** With an account on another server: the id of the Follow that asked for it (Accept, Reject and Undo point at it). */
    apId: text('ap_id'),
    createdAt: createdAt(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    // One friendship per pair, whichever direction it was requested in
    uniqueIndex('friendships_pair_idx').on(
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index('friendships_addressee_idx').on(t.addresseeId),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
)

export const respects = pgTable(
  'respects',
  {
    giverId: integer('giver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiverId: integer('receiver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.giverId, t.receiverId] }),
    index('respects_receiver_idx').on(t.receiverId),
    check('respects_not_self', sql`${t.giverId} <> ${t.receiverId}`),
  ],
)

/** Latest visit per visitor per profile, for "Laatste bezoekers". */
export const profileVisits = pgTable(
  'profile_visits',
  {
    visitorId: integer('visitor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    profileId: integer('profile_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.visitorId, t.profileId] }),
    index('profile_visits_profile_idx').on(t.profileId, t.visitedAt),
  ],
)

export const photos = pgTable(
  'photos',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    caption: text('caption').notNull().default(''),
    /** A longer text under the photo, on its own page (/fotografie/:username/foto/:id). */
    description: text('description').notNull().default(''),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Once edited: the upload as it came in (path is then the edited version), and the edit steps. */
    originalPath: text('original_path'),
    edits: jsonb('edits').$type<PhotoEdits>(),
    /** The album it's in (photo_albums), or none. */
    albumId: integer('album_id').references((): AnyPgColumn => photoAlbums.id, { onDelete: 'set null' }),
    /** Camera details from the photo (shared/photography.ts), never its location; shown only with showExif. */
    exif: jsonb('exif').$type<PhotoExif>(),
    showExif: boolean('show_exif').notNull().default(false),
    /** Also on the member's photography page (/fotografie). */
    inPhotography: boolean('in_photography').notNull().default(false),
    views: integer('views').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('photos_user_idx').on(t.userId, t.createdAt), index('photos_created_idx').on(t.createdAt), index('photos_album_idx').on(t.albumId), index('photos_photography_idx').on(t.inPhotography, t.id)],
)

/** Albums in a member's Foto's: a name, a Farm-Fresh icon (shared/icons.ts) and a bit of text. */
export const photoAlbums = pgTable(
  'photo_albums',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon'),
    /** The photo on the album's cover; the newest one when not chosen. */
    coverPhotoId: integer('cover_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('photo_albums_user_idx').on(t.userId, t.position)],
)

/**
 * A member's photography page (/fotografie/:username), like on Flickr: their
 * best photos, with the camera they used. Who may see it is up to them.
 */
export const photographyPages = pgTable('photography_pages', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  about: text('about').notNull().default(''),
  /** "Canon EOS 600D, Fujifilm X100V": what they shoot with. */
  gear: text('gear').notNull().default(''),
  /** iedereen (also without an account), leden, vrienden (shared/photography.ts). */
  visibility: text('visibility').notNull().default('leden'),
  /** New photos show their camera details unless turned off per photo. */
  showExif: boolean('show_exif').notNull().default(true),
  /** One of their photos, wide across the top of the page (like Flickr's cover photo). */
  bannerPhotoId: integer('banner_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
  /** Where the banner is cropped, from the top (0) to the bottom (100). */
  bannerY: integer('banner_y').notNull().default(50),
  createdAt: createdAt(),
})

/** Reactions under a photo on its own photography page. */
export const photoComments = pgTable(
  'photo_comments',
  {
    id: serial('id').primaryKey(),
    photoId: integer('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('photo_comments_photo_idx').on(t.photoId, t.id)],
)

/** Respect for a photo on a photography page, like respect everywhere on Kuddes. */
export const photoRespects = pgTable(
  'photo_respects',
  {
    photoId: integer('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.userId] })],
)

/** "Favoriet": a star for a photo on a photography page. */
export const photoFaves = pgTable(
  'photo_faves',
  {
    photoId: integer('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.photoId, t.userId] }), index('photo_faves_user_idx').on(t.userId)],
)

/** Kuddes: groups members can create and join. */
export const kuddes = pgTable(
  'kuddes',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    imagePath: text('image_path'),
    /** A key from shared/kuddes.ts, and one of its subcategories. */
    category: text('category').notNull().default('groepen'),
    subcategory: text('subcategory'),
    /** For places (spots, schools, companies, clubs). */
    address: text('address'),
    city: text('city'),
    phone: text('phone'),
    website: text('website'),
    visibility: kuddeVisibilityEnum('visibility').notNull().default('openbaar'),
    /** Members may use the Kudde's photos in their own posts elsewhere (an open Kudde only; the owner can switch it off). */
    photosShareable: boolean('photos_shareable').notNull().default(true),
    /** A photography Kudde: its photos look like the photography section, with camera details, and it shows up on /fotografie. */
    photography: boolean('photography').notNull().default(false),
    creatorId: integer('creator_id').references(() => users.id, { onDelete: 'set null' }),
    /** The owner's own design for the Kudde page (like a profile's "eigen design"); null = standard. */
    design: jsonb('design').$type<ProfileColors>(),
    /** "Wat doen we?", "Wanneer?" and opening hours (for places), shown under Over deze Kudde. */
    info: jsonb('info').$type<KuddeInfo>(),
    /** How often the page was opened (for the Bezoekersteller gadget). */
    views: integer('views').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('kuddes_slug_idx').on(t.slug),
    uniqueIndex('kuddes_name_idx').on(sql`lower(${t.name})`),
    index('kuddes_category_idx').on(t.category),
  ],
)

export const kuddeMembers = pgTable(
  'kudde_members',
  {
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: kuddeRoleEnum('role').notNull().default('member'),
    /** A member who helps run the Kudde: what they may do (shared/kuddes.ts). Owners may do everything. */
    rights: text('rights').array().$type<KuddeRight[]>().notNull().default(sql`'{}'::text[]`),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kuddeId, t.userId] }), index('kudde_members_user_idx').on(t.userId)],
)

/**
 * The Prikbord of a Kudde: messages from members, or from the Kudde itself
 * (posted by its owner, `asKudde`). A post can have a photo and a poll.
 */
export const kuddePosts = pgTable(
  'kudde_posts',
  {
    id: serial('id').primaryKey(),
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    /** Who wrote it; kept (as null) when a post as the Kudde outlives its writer's account. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    asKudde: boolean('as_kudde').notNull().default(false),
    /** An icon picked for the post (shared/icons.ts). */
    icon: text('icon'),
    text: text('text').notNull().default(''),
    photoPath: text('photo_path'),
    /** A photo from the Kudde's Foto's box (photoPath is for older posts that uploaded their own). */
    kuddePhotoId: integer('kudde_photo_id').references((): AnyPgColumn => kuddePhotos.id, { onDelete: 'set null' }),
    glitterId: integer('glitter_id').references((): AnyPgColumn => glitters.id, { onDelete: 'set null' }),
    poll: jsonb('poll').$type<{ question: string; options: string[]; closed: boolean }>(),
    /** Pinned by the owner: shown above the other posts (one at a time). */
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_posts_kudde_idx').on(t.kuddeId, t.id), index('kudde_posts_user_idx').on(t.userId)],
)

/** Photos members add to a Kudde's own Foto's box. */
export const kuddePhotos = pgTable(
  'kudde_photos',
  {
    id: serial('id').primaryKey(),
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    caption: text('caption').notNull().default(''),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** The Kudde's album it's in (kudde_photo_albums), or none. */
    albumId: integer('album_id').references((): AnyPgColumn => kuddePhotoAlbums.id, { onDelete: 'set null' }),
    /** Put in from the member's photography page: which photo (the file is a copy, so each can go on its own). */
    sourcePhotoId: integer('source_photo_id').references((): AnyPgColumn => photos.id, { onDelete: 'set null' }),
    /** Camera details (shared/photography.ts), never a location; shown only with showExif. */
    exif: jsonb('exif').$type<PhotoExif>(),
    showExif: boolean('show_exif').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_photos_kudde_idx').on(t.kuddeId, t.id), index('kudde_photos_user_idx').on(t.userId), index('kudde_photos_album_idx').on(t.albumId)],
)

/** Albums in a Kudde's Foto's: members make them, the maker and the owner can change them. */
export const kuddePhotoAlbums = pgTable(
  'kudde_photo_albums',
  {
    id: serial('id').primaryKey(),
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon'),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_photo_albums_kudde_idx').on(t.kuddeId)],
)

export const kuddePollVotes = pgTable(
  'kudde_poll_votes',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => kuddePosts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    option: integer('option').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
)

/** Respect for a post on a Kudde's Prikbord. */
export const kuddePostRespects = pgTable(
  'kudde_post_respects',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => kuddePosts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
)

export const kuddePostReplies = pgTable(
  'kudde_post_replies',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => kuddePosts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_post_replies_post_idx').on(t.postId, t.id)],
)

/** Events ("evenementen") posted on a Kudde by its members; they fill the Agenda. */
/** Gadgets on a Kudde's page (shared/kuddeGadgets.ts), in the order of `position`. */
export const kuddeGadgets = pgTable(
  'kudde_gadgets',
  {
    id: serial('id').primaryKey(),
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    type: text('type').$type<KuddeGadgetType>().notNull(),
    title: text('title').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').$type<KuddeGadgetConfig[KuddeGadgetType]>().notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_gadgets_kudde_idx').on(t.kuddeId, t.position)],
)

export const kuddeEvents = pgTable(
  'kudde_events',
  {
    id: serial('id').primaryKey(),
    kuddeId: integer('kudde_id')
      .notNull()
      .references(() => kuddes.id, { onDelete: 'cascade' }),
    creatorId: integer('creator_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    location: text('location'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('kudde_events_starts_idx').on(t.startsAt), index('kudde_events_kudde_idx').on(t.kuddeId, t.startsAt)],
)

/** "Ik ga" / "Misschien" for an event. */
export const eventAttendees = pgTable(
  'event_attendees',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => kuddeEvents.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: attendanceEnum('status').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('event_attendees_user_idx').on(t.userId)],
)

/** Suggestions and problem reports from members ("Probleem melden!"). */
export const suggestions = pgTable(
  'suggestions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: suggestionKindEnum('kind').notNull().default('suggestie'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Page the member was on when reporting a problem. */
    page: text('page'),
    /** The admin dealt with it (status klaar or afgewezen). */
    handledAt: timestamp('handled_at', { withTimezone: true }),
    /** Where it stands (shared/suggestions.ts), with a short word from the admin. */
    status: text('status').$type<SuggestionStatus>().notNull().default('nieuw'),
    statusNote: text('status_note'),
    statusAt: timestamp('status_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('suggestions_created_idx').on(t.kind, t.createdAt)],
)

/**
 * The timeline: one row per thing a member did. Each row points at the
 * object it's about, so deleting the object removes it from the timeline.
 */
export const activities = pgTable(
  'activities',
  {
    id: serial('id').primaryKey(),
    type: activityTypeEnum('type').notNull(),
    actorId: integer('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The other member, for knuffels and friendships. */
    targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'cascade' }),
    statusId: integer('status_id').references(() => statuses.id, { onDelete: 'cascade' }),
    photoId: integer('photo_id').references(() => photos.id, { onDelete: 'cascade' }),
    knuffelId: integer('knuffel_id').references(() => knuffels.id, { onDelete: 'cascade' }),
    friendshipId: integer('friendship_id').references(() => friendships.id, { onDelete: 'cascade' }),
    kuddeId: integer('kudde_id').references(() => kuddes.id, { onDelete: 'cascade' }),
    videoId: integer('video_id').references(() => videos.id, { onDelete: 'cascade' }),
    recipeId: integer('recipe_id').references((): AnyPgColumn => recipes.id, { onDelete: 'cascade' }),
    /** A review in Recensies (goes when the review goes). */
    mediaReviewId: integer('media_review_id').references((): AnyPgColumn => mediaReviews.id, { onDelete: 'cascade' }),
    /** A blog post (goes when the blog goes). */
    blogId: integer('blog_id').references((): AnyPgColumn => blogs.id, { onDelete: 'cascade' }),
    /** A song on Kuddes Muziek (goes when the song goes). */
    trackId: integer('track_id').references((): AnyPgColumn => tracks.id, { onDelete: 'cascade' }),
    /** What it was called, for things that don't last (a radio show that went live). */
    title: text('title'),
    visibility: visibilityEnum('visibility').notNull().default('iedereen'),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_actor_idx').on(t.actorId, t.id),
    index('activities_type_idx').on(t.type, t.id),
    uniqueIndex('activities_status_idx').on(t.statusId),
    uniqueIndex('activities_blog_idx').on(t.blogId),
  ],
)

export const activityRespects = pgTable(
  'activity_respects',
  {
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.userId] })],
)

/** "Reacties" on any timeline item, including WieWatWaars. */
export const activityComments = pgTable(
  'activity_comments',
  {
    id: serial('id').primaryKey(),
    activityId: integer('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('activity_comments_activity_idx').on(t.activityId, t.id)],
)

/**
 * BuddyPoke history: pokes between members and mood changes. Each side can
 * remove an event from their own history without removing it for the other.
 */
export const buddyEvents = pgTable(
  'buddy_events',
  {
    id: serial('id').primaryKey(),
    type: buddyEventTypeEnum('type').notNull(),
    fromId: integer('from_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Who was poked; null for mood changes. */
    toId: integer('to_id').references(() => users.id, { onDelete: 'cascade' }),
    /** A poke or mood id from the BuddyPoke data (web/js/data/moods.js). */
    action: text('action').notNull(),
    comment: text('comment').notNull().default(''),
    private: boolean('private').notNull().default(false),
    hiddenByFrom: boolean('hidden_by_from').notNull().default(false),
    hiddenByTo: boolean('hidden_by_to').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('buddy_events_to_idx').on(t.toId, t.id), index('buddy_events_from_idx').on(t.fromId, t.id)],
)

/**
 * Personal messages ("berichten"). A draft ("concept") has no sentAt and
 * may not have a recipient yet. Sender and recipient each delete their own
 * copy; the row goes once both have.
 */
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: integer('recipient_id').references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull().default(''),
    /** The message this one answers or forwards, for "Re:" threads. */
    replyToId: integer('reply_to_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    deletedBySender: boolean('deleted_by_sender').notNull().default(false),
    deletedByRecipient: boolean('deleted_by_recipient').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('messages_inbox_idx').on(t.recipientId, t.sentAt),
    index('messages_sender_idx').on(t.senderId, t.id),
  ],
)

/** Kuddes Video: uploaded videos, converted to MP4 by ffmpeg (server/lib/videoProcessing.ts). */
export const videos = pgTable(
  'videos',
  {
    id: serial('id').primaryKey(),
    /** The 11-character id in /video/kijk?v=… */
    publicId: text('public_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** A key from shared/videos.ts. */
    category: text('category').notNull().default('overig'),
    visibility: videoVisibilityEnum('visibility').notNull().default('openbaar'),
    status: videoStatusEnum('status').notNull().default('uploaden'),
    /** Why processing failed, shown to the uploader. */
    error: text('error'),
    filePath: text('file_path'),
    /** "h265" since uploads are compressed harder; older videos are "h264". */
    codec: text('codec').notNull().default('h264'),
    thumbPath: text('thumb_path'),
    duration: integer('duration').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    views: integer('views').notNull().default(0),
    lastViewedAt: timestamp('last_viewed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('videos_public_idx').on(t.publicId),
    index('videos_user_idx').on(t.userId, t.id),
    index('videos_list_idx').on(t.status, t.visibility, t.id),
  ],
)

/** 1 to 5 stars, one rating per member. */
export const videoRatings = pgTable(
  'video_ratings',
  {
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] }), check('video_ratings_stars', sql`${t.stars} between 1 and 5`)],
)

export const videoComments = pgTable(
  'video_comments',
  {
    id: serial('id').primaryKey(),
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    /** Thumbs up and down (video_comment_votes), counted here for sorting. */
    likes: integer('likes').notNull().default(0),
    dislikes: integer('dislikes').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('video_comments_video_idx').on(t.videoId, t.id)],
)

/** One thumb per member per comment: 1 up, -1 down. */
export const videoCommentVotes = pgTable(
  'video_comment_votes',
  {
    commentId: integer('comment_id')
      .notNull()
      .references(() => videoComments.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    vote: integer('vote').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] }), check('video_comment_votes_vote', sql`${t.vote} in (-1, 1)`)],
)

export const videoFavorites = pgTable(
  'video_favorites',
  {
    videoId: integer('video_id')
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.userId] }), index('video_favorites_user_idx').on(t.userId, t.createdAt)],
)

/** Forum sections ("Algemene discussie"), grouped under a category heading. */
export const forumSections = pgTable(
  'forum_sections',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('comment'),
    position: integer('position').notNull().default(0),
    /** Only admins and moderators can start threads (announcements). */
    staffOnly: boolean('staff_only').notNull().default(false),
    /** A subforum: shown inside this section instead of on the forum's front page. */
    parentId: integer('parent_id').references((): AnyPgColumn => forumSections.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('forum_sections_slug_idx').on(t.slug), index('forum_sections_parent_idx').on(t.parentId)],
)

/** Members who moderate one section. */
export const forumModerators = pgTable(
  'forum_moderators',
  {
    sectionId: integer('section_id')
      .notNull()
      .references(() => forumSections.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.userId] })],
)

export const forumThreads = pgTable(
  'forum_threads',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => forumSections.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The topic's icon in the lists, picked by who started it (shared/icons.ts). */
    icon: text('icon'),
    title: text('title').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    pinned: boolean('pinned').notNull().default(false),
    locked: boolean('locked').notNull().default(false),
    views: integer('views').notNull().default(0),
    /** Kept up to date when posting, so lists don't have to count. */
    postCount: integer('post_count').notNull().default(0),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }).notNull().defaultNow(),
    lastPostUserId: integer('last_post_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** A poll at the top of the thread, from whoever started it. */
    poll: jsonb('poll').$type<{ question: string; options: string[]; closed: boolean }>(),
    createdAt: createdAt(),
  },
  (t) => [index('forum_threads_section_idx').on(t.sectionId, t.pinned, t.lastPostAt), index('forum_threads_user_idx').on(t.userId)],
)

export const forumPollVotes = pgTable(
  'forum_poll_votes',
  {
    threadId: integer('thread_id')
      .notNull()
      .references(() => forumThreads.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    option: integer('option').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
)

export const forumPosts = pgTable(
  'forum_posts',
  {
    id: serial('id').primaryKey(),
    threadId: integer('thread_id')
      .notNull()
      .references(() => forumThreads.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedById: integer('edited_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Removed posts keep their place ("verwijderd door een moderator"). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedById: integer('deleted_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('forum_posts_thread_idx').on(t.threadId, t.id), index('forum_posts_user_idx').on(t.userId, t.id)],
)

/** Smiley reactions on posts (shared/forum.ts); one of each per member. */
export const forumReactions = pgTable(
  'forum_reactions',
  {
    postId: integer('post_id')
      .notNull()
      .references(() => forumPosts.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reaction: text('reaction').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId, t.reaction] })],
)

/** The forum side of an account: a title under your name and a signature. */
export const forumProfiles = pgTable('forum_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  signature: text('signature').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** "Discussie" on a forum profile. */
export const forumProfileComments = pgTable(
  'forum_profile_comments',
  {
    id: serial('id').primaryKey(),
    profileUserId: integer('profile_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('forum_profile_comments_idx').on(t.profileUserId, t.id)],
)

/** Members who may not post in the forum or chat, until a date or for good. */
export const forumBans = pgTable('forum_bans', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull().default(''),
  bannedById: integer('banned_by_id').references(() => users.id, { onDelete: 'set null' }),
  until: timestamp('until', { withTimezone: true }),
  createdAt: createdAt(),
})

export const chatChannels = pgTable(
  'chat_channels',
  {
    id: serial('id').primaryKey(),
    /** Without the #: "algemeen" */
    name: text('name').notNull(),
    topic: text('topic').notNull().default(''),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('chat_channels_name_idx').on(t.name)],
)

/** Chat history (joins and parts aren't kept). */
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial('id').primaryKey(),
    channelId: integer('channel_id')
      .notNull()
      .references(() => chatChannels.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: chatKindEnum('kind').notNull().default('msg'),
    text: text('text').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('chat_messages_channel_idx').on(t.channelId, t.id)],
)

/** Site news ("Nieuws & updates"), written by the admin on /beheer. */
export const news = pgTable(
  'news',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull(),
    /** Small label above the title, e.g. "Nieuws & updates". */
    label: text('label').notNull().default('Nieuws & updates'),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    /** The forum's markup (headings, lists, links, embeds) plus images, YouTube and buttons (NewsBody). */
    body: text('body').notNull().default(''),
    /** A wide picture above the post (an upload under news/). */
    bannerPath: text('banner_path'),
    published: boolean('published').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('news_slug_idx').on(t.slug), index('news_published_idx').on(t.published, t.publishedAt)],
)

/** Respect for a news post, one per member. */
export const newsRespects = pgTable(
  'news_respects',
  {
    newsId: integer('news_id')
      .notNull()
      .references(() => news.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.newsId, t.userId] })],
)

/** Everything the admin does on /beheer, for looking back. */
export const adminLog = pgTable(
  'admin_log',
  {
    id: serial('id').primaryKey(),
    adminId: integer('admin_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    /** What it was about, e.g. "lid sanne" or "foto 12". */
    target: text('target').notNull().default(''),
    details: text('details').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('admin_log_created_idx').on(t.createdAt)],
)

/**
 * The admin's blacklist (shared/blacklist.ts): e-mail addresses, e-mail
 * domains and usernames that can't sign up or be switched to. `value` is
 * kept lower case; a * stands for anything.
 */
export const blacklist = pgTable(
  'blacklist',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').$type<BlacklistKind>().notNull(),
    value: text('value').notNull(),
    /** For an exact address or username, `value` is a keyed hash ("h:…", server/lib/blacklist.ts) and this a masked hint for Beheer ("j***@gmail.com"). */
    hint: text('hint'),
    reason: text('reason').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('blacklist_kind_value_idx').on(t.kind, t.value)],
)

/**
 * What a bot account does (shared/bots.ts): rules for a task bot, or
 * instructions and abilities for an AI bot. `state` remembers what already
 * ran today ("rule:2026-10-08"), so nothing happens twice.
 */
export const bots = pgTable('bots', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<BotKind>().notNull(),
  enabled: boolean('enabled').notNull().default(false),
  rules: jsonb('rules').$type<BotRule[]>().notNull().default([]),
  instructions: text('instructions').notNull().default(''),
  model: text('model').notNull().default(''),
  triggers: jsonb('triggers').$type<BotTrigger[]>().notNull().default([]),
  abilities: jsonb('abilities').$type<BotAbility[]>().notNull().default([]),
  dailyAt: text('daily_at').notNull().default('12:00'),
  options: jsonb('options').$type<BotOptions>().notNull().default(DEFAULT_BOT_OPTIONS),
  moderation: jsonb('moderation').$type<BotModeration>().notNull().default(DEFAULT_MODERATION),
  state: jsonb('state').$type<Record<string, string>>().notNull().default({}),
  runs: integer('runs').notNull().default(0),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
})

/**
 * Warnings a bot gave a member while keeping watch (shared/bots.ts, Toezicht):
 * why (a word on the list, or a behaviour), what, and where. Counted for
 * reportAfter, shown in Beheer, and in the member's data download.
 */
export const botWarnings = pgTable(
  'bot_warnings',
  {
    id: serial('id').primaryKey(),
    botId: integer('bot_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    detail: text('detail').notNull().default(''),
    place: text('place').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('bot_warnings_user_idx').on(t.userId, t.createdAt), index('bot_warnings_created_idx').on(t.createdAt)],
)

/**
 * The admin's automations (shared/automations.ts): `config` holds the trigger,
 * conditions and actions; `done` the members an "once per member" one already
 * ran for, and the day an "Elke dag" one last ran.
 */
export const automations = pgTable('automations', {
  id: serial('id').primaryKey(),
  config: jsonb('config').$type<AutomationConfig>().notNull(),
  done: jsonb('done').$type<{ members: number[]; day: string }>().notNull().default({ members: [], day: '' }),
  runs: integer('runs').notNull().default(0),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: createdAt(),
})

/**
 * Members reporting a post, profile or message (shared/safety.ts). One report
 * per member per thing; `status` open until the admin restores or removes it.
 */
export const contentReports = pgTable(
  'content_reports',
  {
    id: serial('id').primaryKey(),
    reporterId: integer('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ReportKind>().notNull(),
    targetId: integer('target_id').notNull(),
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').$type<ReportReason>().notNull(),
    note: text('note').notNull().default(''),
    link: text('link'),
    excerpt: text('excerpt').notNull().default(''),
    status: text('status').$type<'open' | 'teruggezet' | 'weggehaald'>().notNull().default('open'),
    createdAt: createdAt(),
    handledAt: timestamp('handled_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('content_reports_once_idx').on(t.reporterId, t.kind, t.targetId), index('content_reports_target_idx').on(t.kind, t.targetId, t.status)],
)

/** Posts hidden after reports, until the admin restores or removes them: left out of every list. */
export const hiddenItems = pgTable(
  'hidden_items',
  {
    kind: text('kind').$type<ReportKind>().notNull(),
    targetId: integer('target_id').notNull(),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.targetId] })],
)

/** IP bans (shared/ipBans.ts): `range` is a network in CIDR form; `expiresAt` null is for always. */
export const ipBans = pgTable(
  'ip_bans',
  {
    id: serial('id').primaryKey(),
    range: text('range').notNull(),
    scope: text('scope').$type<IpBanScope>().notNull(),
    reason: text('reason').notNull().default(''),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('ip_bans_expires_idx').on(t.expiresAt)],
)

/** Profile gadgets (shared/gadgets.ts): notes, music, video, countdown and polls. */
export const gadgets = pgTable(
  'gadgets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<GadgetType>().notNull(),
    title: text('title').notNull().default(''),
    /** Switched off gadgets stay in settings but don't show on the profile. */
    enabled: boolean('enabled').notNull().default(true),
    config: jsonb('config').$type<GadgetConfig[GadgetType]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('gadgets_user_idx').on(t.userId, t.id)],
)

/** One vote per member per poll; voting again changes it. */
export const pollVotes = pgTable(
  'poll_votes',
  {
    gadgetId: integer('gadget_id')
      .notNull()
      .references(() => gadgets.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    option: integer('option').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.gadgetId, t.userId] })],
)

/** Respect for one item in a gadget: a book on the shelf, a line in a list. */
export const gadgetRespect = pgTable(
  'gadget_respect',
  {
    gadgetId: integer('gadget_id')
      .notNull()
      .references(() => gadgets.id, { onDelete: 'cascade' }),
    /** The item's own id in the gadget's config. */
    itemId: text('item_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.gadgetId, t.itemId, t.userId] })],
)

/** The Virtueel huisdier: when each need was last filled, and how much care it had. */
export const gadgetPets = pgTable('gadget_pets', {
  gadgetId: integer('gadget_id')
    .primaryKey()
    .references(() => gadgets.id, { onDelete: 'cascade' }),
  fedAt: timestamp('fed_at', { withTimezone: true }).notNull().defaultNow(),
  pettedAt: timestamp('petted_at', { withTimezone: true }).notNull().defaultNow(),
  playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  care: integer('care').notNull().default(0),
  /** Earned with care, spent in the pet shop on backgrounds and hats. */
  coins: integer('coins').notNull().default(0),
  unlocked: text('unlocked').array().notNull().default(sql`'{}'::text[]`),
})

/** Who last did what for a pet (one row per member and action, for the wait and the list). */
export const petCare = pgTable(
  'pet_care',
  {
    gadgetId: integer('gadget_id')
      .notNull()
      .references(() => gadgets.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gadgetId, t.userId, t.action] }), index('pet_care_recent_idx').on(t.gadgetId, t.at)],
)

/** Saved looks ("Mijn indelingen") a member can switch between. */
/** Own designs to switch between: profile/Kudde designs and site colour schemes. */
export const savedDesigns = pgTable(
  'saved_designs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'design' | 'thema'>().notNull(),
    name: text('name').notNull(),
    data: jsonb('data').$type<ProfileColors | CustomTheme>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_designs_user_idx').on(t.userId, t.kind, t.id)],
)

/**
 * The Designgalerij (/designs): site themes and profile designs members share
 * with everyone. A copy of one of their saved_designs at the moment they
 * shared it (without a background photo, which stays theirs), so editing their
 * own doesn't change what others took.
 */
export const sharedDesigns = pgTable(
  'shared_designs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'design' | 'thema'>().notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    data: jsonb('data').$type<ProfileColors | CustomTheme>().notNull(),
    /** How often someone used or kept it. */
    uses: integer('uses').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('shared_designs_kind_idx').on(t.kind, t.id), index('shared_designs_user_idx').on(t.userId)],
)

export const sharedDesignRespects = pgTable(
  'shared_design_respects',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    designId: integer('design_id')
      .notNull()
      .references(() => sharedDesigns.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.designId] }), index('shared_design_respects_design_idx').on(t.designId)],
)

/**
 * Documents from the Tools (Kuddes Woord, Rekenblad, Presentatie): private,
 * only the owner opens them. For Woord `html` is the page as the editor holds
 * it (cleaned in the browser with DOMPurify before it's shown or saved) and
 * `settings` the page layout; the others keep their contents in `content`.
 * `words` is a size to show in lists: words, filled cells or slides.
 */
export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Which program it belongs to (DOC_KINDS in shared/documents.ts). */
    kind: text('kind').$type<DocKind>().notNull().default('woord'),
    title: text('title').notNull(),
    html: text('html').notNull().default(''),
    /** A Rekenblad's workbook or a Presentatie's slides; null for Woord (which uses `html`). */
    content: jsonb('content').$type<Record<string, unknown>>(),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    words: integer('words').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('documents_user_idx').on(t.userId, t.kind, t.updatedAt)],
)

/**
 * Answers to a Kuddes Formulieren form (a `documents` row of kind formulier),
 * one per member. They go along when the form or the member is deleted.
 */
export const formResponses = pgTable(
  'form_responses',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    answers: jsonb('answers').$type<Record<string, string | number | string[]>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('form_responses_once_idx').on(t.documentId, t.userId), index('form_responses_user_idx').on(t.userId)],
)

export const savedLayouts = pgTable(
  'saved_layouts',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    data: jsonb('data').$type<LayoutSnapshot>().notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saved_layouts_user_idx').on(t.userId, t.id)],
)

/** "May I upload videos?": the form on the upload page, answered on /beheer. */
export const videoUploadRequests = pgTable(
  'video_upload_requests',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** What it's for: uploading videos (Kuddes Video) or music (/muziek). */
    kind: text('kind').notNull().default('video'),
    reasons: text('reasons').array().notNull().default(sql`'{}'::text[]`),
    motivation: text('motivation').notNull().default(''),
    status: requestStatusEnum('status').notNull().default('open'),
    /** The admin's note back to the member, if any. */
    answer: text('answer'),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    handledById: integer('handled_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('video_upload_requests_status_idx').on(t.status, t.createdAt),
    // One open request per member, per kind
    uniqueIndex('video_upload_requests_open_idx').on(t.userId, t.kind).where(sql`${t.status} = 'open'`),
  ],
)

/**
 * Kuddes Spellen: one game between two friends. It starts as an invite; the
 * game itself runs peer to peer, and the server only keeps the result, after
 * replaying the moves (shared/mancala.ts).
 */
export const games = pgTable(
  'games',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').notNull().default('mancala'),
    /** Who invited (player 0) and who was invited (player 1). */
    hostId: integer('host_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guestId: integer('guest_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: gameStatusEnum('status').notNull().default('uitgenodigd'),
    winnerId: integer('winner_id').references(() => users.id, { onDelete: 'set null' }),
    hostScore: integer('host_score').notNull().default(0),
    guestScore: integer('guest_score').notNull().default(0),
    moves: jsonb('moves').$type<unknown[]>().notNull().default([]),
    /** Numbers per player for achievements (shared/games/rules.ts). */
    highlights: jsonb('highlights').$type<{ host: Record<string, number>; guest: Record<string, number> }>(),
    /** Server-refereed games (Zeeslag, Quiz): the fleets or the answers. Never sent to players as is. */
    secret: jsonb('secret').$type<Record<string, unknown>>(),
    endReason: gameEndEnum('end_reason'),
    createdAt: createdAt(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('games_host_idx').on(t.hostId, t.status),
    index('games_guest_idx').on(t.guestId, t.status),
    index('games_finished_idx').on(t.status, t.finishedAt),
    check('games_not_self', sql`${t.hostId} <> ${t.guestId}`),
  ],
)

/**
 * Everyone in a game, with their seat (0 is who invited, the host). Games of
 * two also keep host_id and guest_id on the game itself; Kleurwissel,
 * Stapelgek and the Graffitimuur can have up to four players.
 */
export const gamePlayers = pgTable(
  'game_players',
  {
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seat: integer('seat').notNull(),
    status: gamePlayerStatusEnum('status').notNull().default('uitgenodigd'),
    score: integer('score').notNull().default(0),
    /** Numbers for achievements, like games.highlights but per player. */
    highlights: jsonb('highlights').$type<Record<string, number>>(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.userId] }),
    uniqueIndex('game_players_seat_idx').on(t.gameId, t.seat),
    index('game_players_user_idx').on(t.userId, t.status),
  ],
)

/** Achievements a member has earned (the list is in shared/achievements.ts). */
export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }).notNull().defaultNow(),
    /** When the member saw the "new achievement" pop-up. */
    seenAt: timestamp('seen_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
)

/**
 * Glitterplaatjes: animated pictures members upload (stored as animated
 * WebP), for everyone to send with a knuffel.
 */
export const glitters = pgTable(
  'glitters',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Keys from shared/glitters.ts (one to GLITTER_LIMITS.tags), the first is the main one. */
    categories: text('categories').array().notNull().default(sql`'{overig}'::text[]`),
    path: text('path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** How often it was sent with a knuffel. */
    uses: integer('uses').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('glitters_categories_idx').using('gin', t.categories), index('glitters_user_idx').on(t.userId, t.id), index('glitters_uses_idx').on(t.uses)],
)

/** A member's own album ("verzameling") of glitterplaatjes. */
export const glitterCollection = pgTable(
  'glitter_collection',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    glitterId: integer('glitter_id')
      .notNull()
      .references(() => glitters.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.glitterId] }), index('glitter_collection_glitter_idx').on(t.glitterId)],
)

/**
 * Relations between two members: a best friend (one-sided, no confirmation),
 * a partner or a family member (the other has to confirm). `label` is what
 * `otherId` is to `userId` (a relationship status or a family word).
 */
export const relations = pgTable(
  'relations',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    otherId: integer('other_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: relationKindEnum('kind').notNull(),
    label: text('label').notNull().default(''),
    status: relationStatusEnum('status').notNull().default('pending'),
    createdAt: createdAt(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('relations_pair_idx').on(t.userId, t.otherId, t.kind),
    index('relations_other_idx').on(t.otherId, t.status),
    // One partner at a time
    uniqueIndex('relations_one_partner_idx').on(t.userId).where(sql`${t.kind} = 'partner'`),
    check('relations_not_self', sql`${t.userId} <> ${t.otherId}`),
  ],
)

export type User = typeof users.$inferSelect

/**
 * Recepten: a member's own recipe, with a photo, ingredients and steps (each
 * step can have a photo too). Photos are under uploads/recipes/.
 */
export const recipes = pgTable(
  'recipes',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    intro: text('intro').notNull().default(''),
    /** A key from shared/recipes.ts. */
    category: text('category').notNull().default('overig'),
    level: text('level').notNull().default('makkelijk'),
    minutes: integer('minutes').notNull(),
    servings: integer('servings').notNull(),
    photoPath: text('photo_path'),
    ingredients: jsonb('ingredients').$type<string[]>().notNull(),
    steps: jsonb('steps').$type<{ text: string; photo: string | null }[]>().notNull(),
    tips: text('tips').notNull().default(''),
    likes: integer('likes').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recipes_category_idx').on(t.category, t.id), index('recipes_user_idx').on(t.userId, t.id), index('recipes_likes_idx').on(t.likes)],
)

/** "Lekker!": a member likes a recipe (and finds it back under "Mijn favorieten"). */
export const recipeLikes = pgTable(
  'recipe_likes',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] }), index('recipe_likes_recipe_idx').on(t.recipeId)],
)

/** Graffitimuur: which cans a member has tried and how many photos they saved (for achievements). */
export const sprayProgress = pgTable('spray_progress', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  cans: text('cans').array().notNull().default(sql`'{}'::text[]`),
  photos: integer('photos').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Kuddes Messenger: live chat between friends (the pop-up in the corner and
 * /messenger). A line is a message, a nudge, a game invite (game_id) or what
 * happened to an invite ("game", text is meedoen / geweigerd / ingetrokken).
 * Personal messages ("berichten") are separate, in `messages`.
 */
export const messengerKindEnum = pgEnum('messenger_kind', ['msg', 'nudge', 'invite', 'game'])

export const messengerLines = pgTable(
  'messenger_lines',
  {
    id: serial('id').primaryKey(),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: integer('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: messengerKindEnum('kind').notNull().default('msg'),
    text: text('text').notNull().default(''),
    gameId: integer('game_id').references(() => games.id, { onDelete: 'set null' }),
    /** A glitterplaatje sent with the message (or on its own). */
    glitterId: integer('glitter_id').references((): AnyPgColumn => glitters.id, { onDelete: 'set null' }),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** Something from the site shared with the line (a page address like /recepten/12-hutspot; shared/api.ts SharePreview). */
    share: text('share'),
    createdAt: createdAt(),
  },
  (t) => [
    index('messenger_lines_pair_idx').on(sql`least(${t.senderId}, ${t.recipientId})`, sql`greatest(${t.senderId}, ${t.recipientId})`, t.id),
    index('messenger_lines_unread_idx').on(t.recipientId, t.readAt),
  ],
)

/**
 * Recensies (shared/media.ts): the collection of books, films, series,
 * music, games and drinks. `added_by` is null for the ones Kuddes started
 * with. `reviews` and `rating` are kept up to date from media_reviews.
 */
export const mediaItems = pgTable(
  'media_items',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    creator: text('creator').notNull().default(''),
    year: text('year').notNull().default(''),
    genre: text('genre').notNull().default(''),
    description: text('description').notNull().default(''),
    color: text('color').$type<CoverColor>().notNull(),
    style: text('style').$type<CoverStyle>().notNull(),
    details: jsonb('details').$type<MediaDetails>().notNull().default({}),
    /** A real photo (media/<uploader id>-….webp); the drawn cover is always there too, for the kasten. */
    photoPath: text('photo_path'),
    addedBy: integer('added_by').references(() => users.id, { onDelete: 'set null' }),
    reviews: integer('reviews').notNull().default(0),
    rating: real('rating').notNull().default(0),
    lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // The same title by the same maker only once per kind
    uniqueIndex('media_items_unique_idx').on(t.kind, sql`lower(${t.title})`, sql`lower(${t.creator})`),
    index('media_items_kind_idx').on(t.kind, t.lastReviewAt),
  ],
)

/** One review per member per item: stars (by halves) and what they thought. */
export const mediaReviews = pgTable(
  'media_reviews',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: real('rating').notNull(),
    text: text('text').notNull().default(''),
    respect: integer('respect').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('media_reviews_one_idx').on(t.itemId, t.userId), index('media_reviews_recent_idx').on(t.createdAt), index('media_reviews_user_idx').on(t.userId, t.id)],
)

export const mediaReviewRespects = pgTable(
  'media_review_respects',
  {
    reviewId: integer('review_id')
      .notNull()
      .references(() => mediaReviews.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId] })],
)

/**
 * Games you play on your own (Patience, Bellen schieten; shared/soloGames.ts):
 * one row per finished game, for your best score, the high-score list and
 * the achievements.
 */
export const soloScores = pgTable(
  'solo_scores',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    score: integer('score').notNull(),
    won: boolean('won').notNull().default(false),
    /** How it went: moves and seconds (Patience), level and bubbles (Bellen schieten). */
    details: jsonb('details').$type<Record<string, number>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('solo_scores_kind_idx').on(t.kind, t.score), index('solo_scores_user_idx').on(t.userId, t.kind)],
)

/**
 * Bejeweled 3 (shared/bejeweled.ts): how far a member is with each badge of
 * the game ({ inferno: { value, level } }). The game sends its counts, the
 * server works out the levels; the badges are also achievements.
 */
export const bejeweledProgress = pgTable('bejeweled_progress', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  badges: jsonb('badges').$type<Partial<Record<BejeweledBadge, BejeweledBadgeState>>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Blogs: longer stories members write, in the forum's markup (images, links,
 * YouTube). Each one is also a timeline item (activities.blog_id), which
 * carries its respect and reactions. "vrienden": only friends can read it.
 */
export const blogs = pgTable(
  'blogs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    visibility: visibilityEnum('visibility').notNull().default('iedereen'),
    views: integer('views').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('blogs_user_idx').on(t.userId, t.id), index('blogs_created_idx').on(t.createdAt)],
)

/**
 * Settings the admin changes in Beheer (server/lib/siteSettings.ts), one row
 * each, e.g. signupMode: how new members get in.
 */
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Group chats in Kuddes Messenger (shared/messenger.ts): a few friends in one
 * conversation. Anyone in it can add their own friends and rename it; the one
 * who started it can also remove people. It goes when the last one leaves.
 */
export const messengerGroups = pgTable('messenger_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export const messengerGroupMembers = pgTable(
  'messenger_group_members',
  {
    groupId: integer('group_id')
      .notNull()
      .references(() => messengerGroups.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The last line they've seen; the ones after it are unread. */
    lastReadId: integer('last_read_id').notNull().default(0),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId] }), index('messenger_group_members_user_idx').on(t.userId)],
)

/** A line in a group: a message, a nudge, or what happened (created, joined, left, renamed; the text says who or what). */
export const messengerGroupKindEnum = pgEnum('messenger_group_kind', ['msg', 'nudge', 'created', 'joined', 'left', 'removed', 'renamed'])

export const messengerGroupLines = pgTable(
  'messenger_group_lines',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .notNull()
      .references(() => messengerGroups.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id').references(() => users.id, { onDelete: 'set null' }),
    kind: messengerGroupKindEnum('kind').notNull().default('msg'),
    text: text('text').notNull().default(''),
    glitterId: integer('glitter_id').references((): AnyPgColumn => glitters.id, { onDelete: 'set null' }),
    share: text('share'),
    createdAt: createdAt(),
  },
  (t) => [index('messenger_group_lines_group_idx').on(t.groupId, t.id)],
)

/**
 * Notifications behind the bell (server/lib/notifications.ts): a knuffel on
 * your profile, someone mentioning you (@gebruikersnaam), a reaction on what
 * you posted. `ref` is what it's about (e.g. "knuffel:12"), so the same thing
 * notifies you once and goes away with it. Friend requests have their own count.
 */
export const notificationKindEnum = pgEnum('notification_kind', ['knuffel', 'mention', 'reactie', 'radio', 'forum', 'kudde', 'suggestie'])

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actorId: integer('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: notificationKindEnum('kind').notNull(),
    ref: text('ref').notNull(),
    /** What happened, after the actor's name: "heeft een knuffel op je profiel gezet". */
    message: text('message').notNull(),
    /** A bit of the text, if there is any. */
    snippet: text('snippet').notNull().default(''),
    link: text('link').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('notifications_once_idx').on(t.userId, t.kind, t.ref), index('notifications_user_idx').on(t.userId, t.id), index('notifications_ref_idx').on(t.ref)],
)

/**
 * Muziek (/muziek): members who may upload music (musicUploadAllowed) make
 * pages as an artist or band (a few each: solo, a band, a side project), and
 * every song belongs to one of them. Like Kuddes Video, uploading needs the
 * admin's OK; listening is for everyone.
 */
export const musicPages = pgTable(
  'music_pages',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** In the address (/muziek/<slug>); a member's first page has their username, so old links keep working. */
    slug: text('slug').notNull(),
    /** The artist or band name. */
    name: text('name').notNull(),
    bio: text('bio').notNull().default(''),
    /** Their main genre (shared/music.ts). */
    genre: text('genre').notNull().default('pop'),
    bannerPath: text('banner_path'),
    bannerY: integer('banner_y').notNull().default(50),
    /** The band's own picture (otherwise the member's profile photo). */
    avatarPath: text('avatar_path'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('music_pages_slug_idx').on(t.slug), index('music_pages_user_idx').on(t.userId)],
)

/** A song: converted to MP3 after uploading (server/lib/musicProcessing.ts), so it plays everywhere. */
export const tracks = pgTable(
  'tracks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The artist or band page it's on. */
    artistId: integer('artist_id')
      .notNull()
      .references(() => musicPages.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    genre: text('genre').notNull(),
    description: text('description').notNull().default(''),
    /** The MP3, once it's converted. */
    audioPath: text('audio_path'),
    coverPath: text('cover_path'),
    /** In seconds. */
    duration: integer('duration').notNull().default(0),
    /** verwerken, klaar or mislukt. */
    status: text('status').notNull().default('verwerken'),
    plays: integer('plays').notNull().default(0),
    /** When it came out (just the year is fine: then it's 1 January of it, with releaseYearOnly). */
    releasedOn: date('released_on'),
    releaseYearOnly: boolean('release_year_only').notNull().default(false),
    /** Who else worked on it: "Gitaar: Sanne", "Productie: @bas". */
    credits: jsonb('credits').$type<TrackCredit[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index('tracks_user_idx').on(t.userId, t.id), index('tracks_artist_idx').on(t.artistId, t.id), index('tracks_genre_idx').on(t.genre, t.id), index('tracks_status_idx').on(t.status)],
)

export const trackLikes = pgTable(
  'track_likes',
  {
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.trackId, t.userId] }), index('track_likes_user_idx').on(t.userId)],
)

/** One row per time a song was played, for the charts: no who, only when. */
export const trackPlays = pgTable(
  'track_plays',
  {
    id: serial('id').primaryKey(),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('track_plays_time_idx').on(t.playedAt, t.trackId)],
)

/**
 * Kuddes Radio (/radio): a member's station, its planned shows, followers,
 * co-DJs and sound buttons. Whether a station is live lives in memory
 * (server/lib/radioLive.ts): it ends when the host's browser stops sending.
 */
export const radioStations = pgTable('radio_stations', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  genre: text('genre').notNull().default('muziekmix'),
  bannerPath: text('banner_path'),
  bannerY: integer('banner_y').notNull().default(50),
  /** When it last went live (followers hear about it at most once an hour). */
  lastLiveAt: timestamp('last_live_at', { withTimezone: true }),
  createdAt: createdAt(),
})

export const radioShows = pgTable(
  'radio_shows',
  {
    id: serial('id').primaryKey(),
    stationId: integer('station_id')
      .notNull()
      .references(() => radioStations.userId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Kuddes Muziek song ids, in order. */
    playlist: integer('playlist').array().notNull().default(sql`'{}'::int[]`),
    createdAt: createdAt(),
  },
  (t) => [index('radio_shows_station_idx').on(t.stationId, t.startsAt), index('radio_shows_time_idx').on(t.startsAt)],
)

export const radioFollows = pgTable(
  'radio_follows',
  {
    stationId: integer('station_id')
      .notNull()
      .references(() => radioStations.userId, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.stationId, t.userId] }), index('radio_follows_user_idx').on(t.userId)],
)

/** Co-DJs: members the host invited to talk in their shows. */
export const radioDjs = pgTable(
  'radio_djs',
  {
    stationId: integer('station_id')
      .notNull()
      .references(() => radioStations.userId, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.stationId, t.userId] }), index('radio_djs_user_idx').on(t.userId)],
)

/** The host's own sound buttons (short clips, converted to MP3). */
export const radioSounds = pgTable(
  'radio_sounds',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    path: text('path').notNull(),
    color: text('color').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('radio_sounds_user_idx').on(t.userId, t.id)],
)

/**
 * Accounts on other servers (users.domain is set for them): where their
 * ActivityPub actor lives, where to deliver to them, and the key their
 * server signs with. See server/lib/federation/.
 */
export const remoteActors = pgTable(
  'remote_actors',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
    inbox: text('inbox').notNull(),
    sharedInbox: text('shared_inbox'),
    /** Their profile page on their own server. */
    url: text('url'),
    keyId: text('key_id').notNull(),
    publicKey: text('public_key').notNull(),
    /** Their server speaks Weide (another Kuddes), not only ActivityPub. */
    weide: boolean('weide').notNull().default(false),
    /** Where their photo came from, so it's only fetched again when it changes. */
    avatarSource: text('avatar_source'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('remote_actors_uri_idx').on(t.uri), index('remote_actors_key_idx').on(t.keyId)],
)

/**
 * Members here following accounts on servers that aren't Kuddes (Mastodon and
 * the like): one way, unlike a friendship. Their public posts come in and show
 * in Overzicht → Fediverse.
 */
export const remoteFollows = pgTable(
  'remote_follows',
  {
    followerId: integer('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetId: integer('target_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** "pending" until their server sends Accept. */
    accepted: boolean('accepted').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.targetId] }), index('remote_follows_target_idx').on(t.targetId)],
)

/** The key pair each member's actor signs with (made the first time it's needed). */
export const actorKeys = pgTable('actor_keys', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: createdAt(),
})

/**
 * Activities on their way to other servers: tried again with growing pauses
 * when a server is down, and given up after a few days.
 */
export const federationDeliveries = pgTable(
  'federation_deliveries',
  {
    id: serial('id').primaryKey(),
    inbox: text('inbox').notNull(),
    /** The activity, as JSON-LD. */
    body: jsonb('body').notNull(),
    /** Whose key signs it; null for the server's own actor. */
    senderId: integer('sender_id').references(() => users.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    createdAt: createdAt(),
  },
  (t) => [index('federation_deliveries_next_idx').on(t.nextAttemptAt)],
)

/** Other servers this one knows of, and what the admin decided about them (shared/federation.ts). */
export const federationServers = pgTable('federation_servers', {
  domain: text('domain').primaryKey(),
  policy: text('policy').$type<ServerPolicy>().notNull().default('normaal'),
  reason: text('reason').notNull().default(''),
  software: text('software'),
  weide: boolean('weide').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  failingSince: timestamp('failing_since', { withTimezone: true }),
  createdAt: createdAt(),
})
