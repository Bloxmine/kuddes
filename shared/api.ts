import type { MediaSummary } from './media'
/**
 * Shapes of the JSON the API returns. Shared by the server and the React app
 * so both sides agree on them. Dates are ISO strings.
 */

import type { MusicTrack } from './music'
import type { PhotoAlbum, PhotoExif } from './photography'
import type { PhotoEdits } from './photoEdits'
import type { GamerTags, Interests } from './profileExtras'
import type { PollView } from './polls'
import type { RecipeSummary } from './recipes'
import type { BlogSummary } from './blogs'
import type { AvatarFrame } from './frames'
import type { ProfileCursor } from './cursors'
import type { KuddeCategory, KuddeInfo, KuddeRight, KuddeVisibility } from './kuddes'
import type { SuggestionStatus } from './suggestions'
import type { DocKind, DocSettings } from './documents'
import type { DocGadget, GadgetConfig, GadgetType, PetAction, RespectGadget } from './gadgets'
import type { VideoCategory, VideoStatus, VideoVisibility } from './videos'
import type { ChatKind, ForumReaction, ForumRole } from './forum'
import type { BoxLayout, CustomTheme, HomeBox, LayoutSnapshot, Preferences, ProfileBox, ProfileColors } from './customization'
import type { AchievementOverview } from './achievements'
import type { Glitter, GlitterImage } from './glitters'
import type { GameKind } from './games'
import type { ProfileRelations } from './relations'

export type Gender = 'man' | 'vrouw' | 'anders'

export type Device = 'iphone' | 'android' | 'blackberry' | 'mobiel'

/** The small version of a member used next to posts, in grids, etc. */
export type UserSummary = {
  id: number
  username: string
  name: string
  nickname: string
  avatarUrl: string | null
  online: boolean
  /** A bot account (Beheer → Bots): shown with a "Bot" label. */
  bot?: true
}

export type FriendshipState = 'none' | 'friends' | 'outgoing' | 'incoming'

export type Profile = UserSummary & {
  gender: Gender | null
  age: number | null
  city: string | null
  website: string | null
  about: string | null
  brands: string[]
  spots: string[]
  music: string[]
  /** Favourites and a motto, and gamertags (shared/profileExtras.ts). */
  interests: Interests
  gamerTags: GamerTags
  skin: string | null
  /** Border around the profile photo (shared/frames.ts). */
  avatarFrame: AvatarFrame | null
  /** The animated cursor visitors get on this profile (shared/cursors.ts). */
  cursor: ProfileCursor | null
  /** The member's own design, when skin is "eigen". */
  profileColors: ProfileColors | null
  /** How the boxes on the "Over" tab are arranged; null = default. */
  layout: BoxLayout<ProfileBox> | null
  /** It's their birthday today. */
  birthdayToday: boolean
  /** "Wie ben ik?" at the top of the Profiel box (their choice), else at the bottom. */
  aboutFirst: boolean
  /** Whether the viewer may leave a knuffel (members can limit it to friends). */
  canKnuffel: boolean
  /** Whether the viewer may send a friend request (members can limit it); null: no need (already friends or asked). */
  befriendRefusal: string | null
  /** The profile is for friends only and the viewer isn't one: only the name and photo are filled in. */
  locked: boolean
  /** Someone on another server (federation): which, and their profile there. */
  remote: {
    domain: string
    url: string | null
    /** Another Kuddes (Weide) server: friends. Otherwise (Mastodon and the like) you follow them. */
    weide: boolean
    /** Whether the viewer follows them (only for accounts that aren't on a Kuddes server). */
    following: 'none' | 'pending' | 'following'
    /** A community (Lemmy): it's a Kudde here, this one. */
    kudde: string | null
  } | null
  /** Whether the viewer may send a personal message (members can limit it). */
  canMessage: boolean
  /** The BuddyPoke gadget, when the member put it on their profile. */
  buddy: { code: string | null; mood: string | null } | null
  views: number
  respect: number
  friendCount: number
  photoCount: number
  onlineStatus: string
  createdAt: string
  /** How the viewer relates to this member; null when logged out. */
  relation: {
    isSelf: boolean
    friendship: FriendshipState
    respected: boolean
  } | null
  /** Relatiestatus, beste vrienden en familie. */
  relations: ProfileRelations
}

/** The logged-in member, including private fields for the settings page. */
export type Me = UserSummary & {
  email: string
  gender: Gender | null
  birthdate: string | null
  city: string | null
  website: string | null
  about: string | null
  brands: string[]
  spots: string[]
  music: string[]
  /** Favourites and a motto, and gamertags (shared/profileExtras.ts). */
  interests: Interests
  gamerTags: GamerTags
  skin: string | null
  avatarFrame: AvatarFrame | null
  profileCursor: ProfileCursor | null
  onlineStatus: string
  theme: string | null
  customTheme: CustomTheme | null
  profileColors: ProfileColors | null
  profileLayout: BoxLayout<ProfileBox> | null
  homeLayout: BoxLayout<HomeBox> | null
  /** Always complete: missing keys are filled with the defaults. */
  preferences: Preferences
  buddyEnabled: boolean
  buddyCode: string | null
  buddyMood: string | null
  pendingFriendRequests: number
  /** Unread notifications behind the bell (knuffels, mentions, reactions); requests are counted apart. */
  unreadNotifications: number
  /** Partner and family requests to confirm. */
  pendingRelationRequests: number
  /** This server's admin. */
  isAdmin: boolean
  /** Approved by the admin (or confirmed by mail, without the waitlist); until then they can't post. */
  emailVerified: boolean
  /** On the waitlist: waiting for the admin, not for a mail. */
  awaitingApproval: boolean
  /** A new address waiting for its confirmation link to be clicked. */
  pendingEmail: string | null
  /** Hasn't agreed to the current privacy statement and user agreement yet: asked to before going on. */
  privacyOutdated: boolean
  /** Explicitly agreed to showing special personal data (AVG art. 9) on their profile. */
  sensitiveConsent: boolean
}

/** One of the member's own designs ("Mijn designs") or colour schemes ("Mijn thema's"). */
export type SavedDesign =
  | { id: number; kind: 'design'; name: string; data: ProfileColors; updatedAt: string }
  | { id: number; kind: 'thema'; name: string; data: CustomTheme; updatedAt: string }

/** A theme or design in the Designgalerij (/designs), shared by `user`. */
export type SharedDesign = ({ kind: 'design'; data: ProfileColors } | { kind: 'thema'; data: CustomTheme }) & {
  id: number
  name: string
  description: string
  user: UserSummary
  uses: number
  respects: number
  /** The viewer gave respect. */
  respected: boolean
  createdAt: string
}

export type SharedDesignList = {
  items: SharedDesign[]
  total: number
  page: number
  pages: number
  counts: { alles: number; thema: number; design: number }
}

/** One of the member's saved looks ("Mijn indelingen"). */
export type SavedLayout = {
  id: number
  name: string
  data: LayoutSnapshot
  createdAt: string
  updatedAt: string
}

/** A profile gadget. Polls include the results and the viewer's vote. */
export type Gadget = {
  [T in GadgetType]: {
    id: number
    type: T
    title: string
    enabled: boolean
    config: GadgetConfig[T]
    createdAt: string
    poll: T extends 'poll' ? { counts: number[]; total: number; myVote: number | null } : null
    /** The videos to show, for the Kuddes Video gadget. */
    videos: T extends 'kuddesvideo' ? VideoSummary[] : null
    /** The owner's achievements and stats, for the Prestaties gadget. */
    achievements: T extends 'prestaties' ? AchievementOverview : null
    /** The recipes to show, for the Recepten gadget. */
    recipes: T extends 'recepten' ? RecipeSummary[] : null
    /** The owner's channel, for the Videokanaal gadget. */
    channel: T extends 'kanaal' ? GadgetChannel : null
    /** The picked photo, for the Uitgelichte foto gadget (null when it's gone). */
    photo: T extends 'foto' ? Photo | null : null
    /** How often the owner's profile was viewed, for the Bezoekersteller. */
    views: T extends 'teller' ? number : null
    /** Respect per item (book, film, line…), by the item's id. */
    respect: T extends RespectGadget ? Record<string, ItemRespect> : null
    pet: T extends 'huisdier' ? GadgetPet : null
    forum: T extends 'forum' ? GadgetForum : null
    glitters: T extends 'plakboek' ? GadgetGlitters : null
    scores: T extends 'spelscores' ? GadgetScores : null
    blogs: T extends 'blog' ? GadgetBlog : null
    /** The picked files from Tools that still exist, for the file gadgets (contents come from /gadgets/:id/documents/:docId). */
    docs: T extends DocGadget | 'bestanden' ? SharedDocItem[] : null
  }
}[GadgetType]

export type SharedDocItem = { id: number; kind: DocKind; title: string; words: number; updatedAt: string }
/** A file shown in a gadget, read-only, with what's needed to draw it. */
export type SharedDoc = SharedDocItem & { html: string; content: unknown; settings: DocSettings; owner: UserSummary }

/** How the Virtueel huisdier is doing right now: every need from 0 (empty) to 100 (full). */
export type GadgetPet = {
  needs: Record<PetAction, number>
  /** At night (Dutch time) it sleeps, and you can't wake it. */
  sleeping: boolean
  /** It grows with every bit of care. */
  stage: 'baby' | 'jong' | 'volwassen'
  care: number
  ageDays: number
  /** Who did something for it last. */
  carers: { user: UserSummary; action: PetAction; at: string }[]
  /** When the viewer may do each thing again (null: now). */
  nextAt: Record<PetAction, string | null>
  /** Coins earned with care, to spend in the pet shop, and what was bought. */
  coins: number
  unlocked: string[]
}

export type GadgetForum = {
  /** The title under your name on the forum. */
  title: string
  posts: number
  threads: number
  /** Smiley reactions others gave your posts. */
  reactions: number
  items: { threadId: number; title: string; section: string; sectionName: string; postId: number | null; excerpt: string; at: string; replies: number }[]
}

/** The Blog gadget: the owner's blogs as this viewer may read them, and totals. */
export type GadgetBlog = {
  total: number
  views: number
  respect: number
  featured: BlogSummary | null
  items: BlogSummary[]
}

export type GadgetGlitters = { total: number; items: Glitter[] }

export type GameTally = { played: number; won: number; lost: number; drawn: number }

export type GadgetScores = {
  total: GameTally & { streak: number; bestStreak: number }
  kinds: (GameTally & { kind: GameKind })[]
  recent: { id: number; kind: GameKind; result: 'winst' | 'verlies' | 'gelijk'; opponents: UserSummary[]; at: string }[]
  /** Who you played most (at least 3 games), and how it went. */
  rival: (GameTally & { user: UserSummary }) | null
}

export type ItemRespect = { count: number; mine: boolean }

export type GadgetChannel = {
  /** Videos the viewer may see, and their views together. */
  videoCount: number
  views: number
  featured: VideoSummary | null
  highlights: VideoSummary[]
}

/** A SomaFM station for the Radio gadget (from SomaFM's own list, cached by the server). */
export type RadioStation = {
  id: string
  title: string
  description: string
  genre: string
  image: string
  listeners: number
  nowPlaying: string
}

/** A Kuddes Video in a list. `id` is the public id from /video/kijk?v=… */
export type VideoSummary = {
  id: string
  title: string
  /** "h265" (new uploads) or "h264". */
  codec: string
  thumbUrl: string | null
  duration: number
  views: number
  /** Average stars, 0 when nobody rated it yet. */
  rating: number
  ratingCount: number
  category: VideoCategory
  tags: string[]
  visibility: VideoVisibility
  status: VideoStatus
  createdAt: string
  user: UserSummary
  /** The start of the description, without formatting. */
  snippet: string
}

export type VideoDetail = VideoSummary & {
  description: string
  /** Where the player streams from; null until it's processed. */
  fileUrl: string | null
  width: number | null
  height: number | null
  myRating: number | null
  favorited: boolean
  favoriteCount: number
  commentCount: number
  canEdit: boolean
  /** Why processing failed (only for the uploader). */
  error: string | null
}

export type VideoComment = {
  id: number
  user: UserSummary
  text: string
  createdAt: string
  canDelete: boolean
  likes: number
  dislikes: number
  /** Your thumb: 1 up, -1 down, 0 none. */
  myVote: -1 | 0 | 1
  /** Not for your own comment, and only when logged in. */
  canVote: boolean
  /** Too many thumbs down: folded away until you open it. */
  hidden: boolean
}

/** A page of comments; the first page also has the best two ("Beste reacties"). */
export type VideoCommentPage = Page<VideoComment> & { top: VideoComment[] }

/** What the viewer may do in the forum. */
export type ForumViewer = {
  role: ForumRole
  /** Sections they moderate (all of them for admins). */
  moderates: number[]
  banned: { reason: string; until: string | null } | null
} | null

export type ForumSection = {
  id: number
  slug: string
  category: string
  name: string
  description: string
  icon: string
  position: number
  staffOnly: boolean
  /** A subforum: the section it's in. */
  parent: { id: number; slug: string; name: string } | null
  /** Its subforums (for the links on the front page). */
  subforums: { id: number; slug: string; name: string; icon: string }[]
  /** Counted together with its subforums. */
  threadCount: number
  postCount: number
  /** The latest post here or in a subforum (sectionSlug says where). */
  lastPost: { threadId: number; threadTitle: string; sectionSlug: string; at: string; user: UserSummary | null } | null
  moderators: UserSummary[]
}

export type ForumIndex = {
  sections: ForumSection[]
  stats: { threads: number; posts: number; members: number; newest: UserSummary | null }
  online: UserSummary[]
  chatting: number
  tags: { tag: string; count: number }[]
  viewer: ForumViewer
}

export type ForumThreadSummary = {
  id: number
  section: { slug: string; name: string }
  title: string
  /** Picked by who started it; null = the standard icon. */
  icon: string | null
  tags: string[]
  pinned: boolean
  locked: boolean
  views: number
  replies: number
  createdAt: string
  starter: UserSummary | null
  lastPostAt: string
  lastPostUser: UserSummary | null
  /** The thread has a poll at the top. */
  hasPoll: boolean
}

/** A member as shown next to their forum posts. */
export type ForumAuthor = UserSummary & {
  forumRole: ForumRole
  /** Moderator of the section this is shown in. */
  moderatorHere: boolean
  title: string
  signature: string
  postCount: number
  joinedAt: string
}

export type ForumPost = {
  id: number
  number: number
  author: ForumAuthor | null
  body: string
  createdAt: string
  editedAt: string | null
  editedBy: string | null
  deleted: boolean
  reactions: { reaction: ForumReaction; count: number; mine: boolean }[]
  canEdit: boolean
  canDelete: boolean
}

export type ForumThreadPage = {
  thread: ForumThreadSummary & { sectionId: number }
  /** The poll at the top of the thread, with the results and the viewer's vote. */
  poll: PollView | null
  /** The viewer may vote (logged in, not banned, thread open). */
  canVote: boolean
  /** Whoever started the thread (or a moderator) can close the poll. */
  canClosePoll: boolean
  posts: ForumPost[]
  page: number
  pages: number
  canReply: boolean
  /** The viewer moderates this section. */
  canModerate: boolean
}

export type ForumSectionPage = {
  section: ForumSection
  /** Its subforums, shown above the topics. */
  subforums: ForumSection[]
  threads: ForumThreadSummary[]
  page: number
  pages: number
  canPost: boolean
  canModerate: boolean
}

export type ForumProfile = {
  user: UserSummary
  forumRole: ForumRole
  moderates: { slug: string; name: string }[]
  title: string
  signature: string
  postCount: number
  threadCount: number
  reactionsReceived: number
  firstPostAt: string | null
  lastPostAt: string | null
  banned: boolean
  recentPosts: { id: number; threadId: number; threadTitle: string; section: string; excerpt: string; createdAt: string }[]
  recentThreads: ForumThreadSummary[]
  isSelf: boolean
}

export type ForumProfileComment = { id: number; author: UserSummary; text: string; createdAt: string; canDelete: boolean }

export type ChatChannel = { name: string; topic: string; online: number }

export type ChatUser = UserSummary & { forumRole: ForumRole; moderator: boolean }

export type ChatLine = { id: number; kind: ChatKind; user: ChatUser | null; text: string; createdAt: string }

export type MessageBox = 'inbox' | 'verzonden' | 'concepten'

/** A personal message in a list. */
export type MessageSummary = {
  id: number
  box: MessageBox
  from: UserSummary
  /** null for a draft without a recipient yet. */
  to: UserSummary | null
  subject: string
  /** The start of the text, without formatting. */
  preview: string
  /** null for drafts. */
  sentAt: string | null
  updatedAt: string
  /** Always true for messages you sent. */
  read: boolean
}

export type Message = MessageSummary & {
  body: string
  replyToId: number | null
  /** You can answer (the sender still exists and it's not your own message). */
  canReply: boolean
}

/** A member in the recipient search, and whether they accept your message. */
export type Recipient = UserSummary & { allowed: boolean; reason: string | null }

/** A friend's birthday, for "Jarige vrienden" on Home. */
export type Birthday = {
  user: UserSummary
  /** Days until the birthday: 0 is today. */
  inDays: number
  /** The age they turn, when they show it. */
  turns: number | null
}

/** Active logins on the member's account. */
export type SessionInfo = { count: number }

export type Visibility = 'iedereen' | 'vrienden'

/** A "reactie" on a timeline item (WieWatWaars included). */
export type Comment = {
  id: number
  user: UserSummary
  text: string
  createdAt: string
  canDelete: boolean
}

/** Respect and reactions, shared by everything that appears on the timeline. */
export type Social = {
  activityId: number
  respect: {
    count: number
    respected: boolean
    /** A few of the members who gave respect, newest first. */
    recent: UserSummary[]
  }
  comments: Comment[]
  commentCount: number
  /** A post from Mastodon, Pixelfed and the like: its likes (counted in respect), boosts and replies there. */
  fediverse?: { likes: number; boosts: number; replies: number; domain: string; url: string | null }
  /** It's here because this account (that someone follows) boosted it. */
  boostedBy?: UserSummary
}

/** Who you follow outside Kuddes (Mastodon, Pixelfed…), and who follows you from there; communities are Kuddes instead. */
export type FediverseFollows = {
  following: (UserSummary & { accepted: boolean })[]
  followers: UserSummary[]
}

/** A reply on another server to a post from there (read from that server, not stored here). */
export type FediverseReply = { id: string; name: string; handle: string; text: string; url: string | null; createdAt: string }

/** A WieWatWaar without its respect and reactions. */
export type StatusCore = {
  id: number
  user: UserSummary
  text: string
  where: string | null
  device: Device | null
  /** An icon picked for it (null = none). */
  icon: string | null
  /** Key from shared/moods.ts. */
  mood: string | null
  visibility: Visibility
  /** The photos with it, in order (up to STATUS_MAX_PHOTOS): from their own Foto's box or an open Kudde (`href` is where it opens). */
  photos: StatusPhoto[]
  /** A poll under it (results and the viewer's vote). */
  poll: PollView | null
  /** A glitterplaatje with it. */
  glitter: GlitterImage | null
  /** Posted by `user` as the owner of this Kudde, and shown as the Kudde's. */
  kudde: { slug: string; name: string; imageUrl: string | null } | null
  createdAt: string
  canDelete: boolean
}

export type StatusPhoto = {
  id: number
  url: string
  width: number
  height: number
  href: string
  kudde: { slug: string; name: string } | null
  /** A picture of a post from another server (Mastodon, Pixelfed…): its description, and `href` is the post there. */
  alt?: string
  external?: boolean
}

/** Photos with one WieWatWaar. */
export const STATUS_MAX_PHOTOS = 8
/** Characters in one WieWatWaar. */
export const STATUS_MAX_LENGTH = 2000

/** A WieWatWaar. */
export type Status = StatusCore & Social

export type ActivityType = 'status' | 'photo' | 'knuffel' | 'friendship' | 'avatar' | 'kudde_join' | 'video' | 'recipe' | 'review' | 'blog' | 'track' | 'radio' | 'photography'

/** One item on the timeline ("Overzicht"). */
export type TimelineItem = Social & {
  id: number
  type: ActivityType
  createdAt: string
  actor: UserSummary & { skin: string | null; profileColors: ProfileColors | null }
  /** The other member, for knuffels and friendships. */
  target: UserSummary | null
  status: StatusCore | null
  photo: Photo | null
  knuffel: { id: number; text: string; glitter: GlitterImage | null } | null
  kudde: Kudde | null
  video: VideoSummary | null
  recipe: { id: number; slug: string; title: string; intro: string; photoUrl: string | null; minutes: number; servings: number } | null
  /** A review in Recensies, with what it's about. */
  review: { id: number; rating: number; text: string; item: MediaSummary } | null
  /** A blog: its title, the start of the text and its first picture. */
  blog: { id: number; title: string; snippet: string; imageUrl: string | null } | null
  /** A song on Kuddes Muziek. */
  track: MusicTrack | null
  /** What a radio show that went live was called. */
  title: string | null
  canDelete: boolean
}

export type Knuffel = {
  id: number
  author: UserSummary
  text: string
  glitter: GlitterImage | null
  createdAt: string
  canDelete: boolean
}

export type Photo = {
  id: number
  url: string
  caption: string
  /** A longer text, on the photo's own page in Fotografie. */
  description: string
  width: number
  height: number
  createdAt: string
  user: UserSummary
  canDelete: boolean
  /** For the owner only: the upload before editing, and how it was edited (null = never edited). */
  originalUrl?: string
  edits?: PhotoEdits | null
  /** The album it's in (shared/photography.ts). */
  albumId: number | null
  /** Camera details, when the owner shows them (or always for the owner, to edit). */
  exif: PhotoExif | null
  showExif: boolean
  /** On the owner's photography page. */
  inPhotography: boolean
}

/** A Kudde: a group members can join. */
export type Kudde = {
  slug: string
  name: string
  description: string
  imageUrl: string | null
  memberCount: number
  createdAt: string
  category: KuddeCategory
  subcategory: string | null
  address: string | null
  city: string | null
  phone: string | null
  website: string | null
  visibility: KuddeVisibility
  /** Members may use its photos in posts elsewhere on Kuddes (only for an open Kudde). */
  photosShareable: boolean
  /** A photography Kudde (photos with camera details, on /fotografie). */
  photography: boolean
  /** A community on another server (Lemmy and the like): joining follows it, its posts come in, and it's read-only here. */
  remote: { domain: string; handle: string; url: string | null } | null
}

export type KuddeMembership = 'owner' | 'member' | 'pending' | 'none'

export type KuddeDetail = Kudde & {
  creator: UserSummary | null
  members: UserSummary[]
  /** The viewer's membership; null when logged out. */
  membership: KuddeMembership | null
  /** Members may post events. */
  canPost: boolean
  /** Upcoming events; empty when the Kudde is closed and you're not a member. */
  events: KuddeEvent[]
  /** A closed Kudde hides its events from non-members. */
  eventsHidden: boolean
  /** Requests to join a closed Kudde; only for who may let people in. */
  requests: UserSummary[]
  /** What the viewer may do in running the Kudde (owners: everything). */
  rights: KuddeRight[]
  /** Who runs the Kudde: the owners and the beheerders with what they may do. `creator`: who started it (can't be changed by others). */
  managers: { user: UserSummary; role: 'owner' | 'beheerder'; rights: KuddeRight[]; creator: boolean }[]
  /** The owner's design for the page (colours, patterns, title bar and fonts); null = standard. */
  design: ProfileColors | null
  /** What they do, when, and opening hours (places); '' = not filled in. */
  info: KuddeInfo
}

/** A photo in a Kudde's own Foto's box. */
export type KuddePhoto = {
  id: number
  url: string
  caption: string
  width: number
  height: number
  createdAt: string
  user: UserSummary
  /** The uploader, the Kudde's owner and the admin can remove it. */
  canDelete: boolean
  albumId: number | null
  /** Camera details, when shown (or always for who may change the photo). */
  exif: PhotoExif | null
  showExif: boolean
  /** Put in from the uploader's photography page: that photo's id. */
  sourcePhotoId: number | null
}

export type KuddePhotoList = {
  items: KuddePhoto[]
  total: number
  canUpload: boolean
  /** The Kudde's albums; `mine`: you may change or remove it (you made it, or you own the Kudde). */
  albums: (PhotoAlbum & { mine: boolean })[]
}

/** A Kudde photo somewhere else on the site (a forum post, a WieWatWaar), with the Kudde it's from. */
export type SharedKuddePhoto = KuddePhoto & { kudde: { slug: string; name: string } }

/**
 * The photos you can use in your own posts: those of the open Kuddes you're
 * in that allow it (a besloten Kudde's photos stay in the Kudde, and so do
 * those of a Kudde that switched sharing off), newest Kudde activity first.
 * `closed`: how many of your Kuddes keep their photos to themselves.
 */
export type MyKuddePhotos = { kuddes: { slug: string; name: string; imageUrl: string | null; photos: KuddePhoto[] }[]; closed: number }

/** Number of Kuddes per category, for the menu and the overview. */
export type KuddeCategoryCounts = Record<KuddeCategory, number>

export type Attendance = 'ja' | 'misschien'

/** An event on a Kudde ("evenement"), as it appears in the Agenda. */
export type KuddeEvent = {
  id: number
  title: string
  description: string
  location: string | null
  startsAt: string
  endsAt: string | null
  kudde: { slug: string; name: string; imageUrl: string | null; category: KuddeCategory; visibility: KuddeVisibility }
  creator: UserSummary | null
  going: number
  maybe: number
  myStatus: Attendance | null
  canEdit: boolean
}

export type KuddeEventDetail = KuddeEvent & { attendees: (UserSummary & { status: Attendance })[] }

export type Suggestion = {
  id: number
  kind: 'suggestie' | 'probleem'
  title: string
  body: string
  createdAt: string
  user: UserSummary | null
  /** Where it stands, and a short word from the admin about it. */
  status: SuggestionStatus
  statusNote: string | null
}

export type NewsItem = {
  slug: string
  /** Small label above the title, e.g. "Nieuws & updates". */
  label: string
  title: string
  summary: string
  /** The forum's markup plus images, YouTube and buttons (NewsBody on the page). */
  body: string
  date: string
  /** The wide picture above the post, if it has one. */
  bannerUrl: string | null
  respectCount: number
}

/** One news post on its own page: also whether you gave respect, and who did. */
export type NewsDetail = NewsItem & { respected: boolean; respecters: UserSummary[]; author: UserSummary | null }

/**
 * Something from the site shared in a Messenger line (a review, recipe, blog,
 * video…): a small preview that links to it. Made for whoever looks at it,
 * so what they may not see isn't shown.
 */
export type SharePreview = {
  kind: 'recensie' | 'media' | 'recept' | 'blog' | 'video' | 'foto' | 'profiel' | 'kudde' | 'evenement' | 'onderwerp' | 'nieuws' | 'glitter' | 'muziek' | 'radio'
  /** "Recensie", "Recept"… */
  label: string
  /** A Farm-Fresh icon for the kind. */
  icon: string
  title: string
  subtitle: string
  /** A bit of the text. */
  text: string
  imageUrl: string | null
  href: string
  /** Stars, for reviews and items in Recensies. */
  rating: number | null
  /** An item in Recensies without a photo: its drawn cover. */
  media: MediaSummary | null
  /** A shared song: it can be played right from the chat. */
  track: MusicTrack | null
}

/** "Smileys in de laatste 24 uur" on Home. */
export type SmileyCount = { name: string; count: number }

/** A tile of "Nu in Nederland": a word or place in the WieWatWaars of the last day. */
export type NowTerm = {
  term: string
  /** How many members wrote about it. */
  count: number
  /** A photo from a WieWatWaar about it (members only). */
  photoUrl: string | null
}

/** A member on the Nieuwe mensen page (/leden). */
export type MemberCard = UserSummary & { age: number | null }
export const MEMBER_PAGE_SIZE = 48

export type HomeData = {
  news: NewsItem[]
  newest: (UserSummary & { age: number | null })[]
}

export type SiteStats = {
  members: number
  online: number
  /** When the first member joined. */
  since: string | null
  knuffelsToday: number
  statusesToday: number
}

export type Page<T> = {
  items: T[]
  /** Pass as `before` to get the next page; null when there are no more. */
  nextCursor: number | null
}

export type ApiError = {
  error: string
  /** Per-field messages for form validation errors. */
  fields?: Record<string, string>
  /** e.g. "unverified": confirm your e-mail address first. */
  code?: string
}

/** A notification behind the bell (server/lib/notifications.ts). */
export type Notification = {
  id: number
  kind: 'knuffel' | 'mention' | 'reactie' | 'radio' | 'forum' | 'kudde' | 'suggestie' | 'volger'
  actor: UserSummary
  /** After the actor's name: "heeft een knuffel op je profiel gezet". */
  message: string
  snippet: string
  link: string
  read: boolean
  createdAt: string
}

export type NotificationList = { items: Notification[]; unread: number }

/** A result in the link picker of the WieWatWaar box (GET /link-search). */
export type LinkResult = {
  kind: 'profiel' | 'kudde' | 'video' | 'recept' | 'media' | 'blog' | 'onderwerp' | 'nieuws' | 'glitter' | 'foto' | 'muziek' | 'artiest' | 'radio' | 'fotografie' | 'evenement'
  /** "Profiel", "Kudde"… */
  label: string
  /** A Farm-Fresh icon for the kind. */
  icon: string
  title: string
  subtitle: string
  imageUrl: string | null
  href: string
}
