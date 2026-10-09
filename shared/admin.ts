import type { IpBanScope } from './ipBans'
import type { SuggestionStatus } from './suggestions'
/** Types for the admin page (/beheer). Only the admin gets these. */
import type { UserSummary } from './api'

export type AdminOverview = {
  counts: {
    members: number
    newThisWeek: number
    onlineNow: number
    blocked: number
    dummies: number
    statuses: number
    photos: number
    videos: number
    kuddes: number
    forumPosts: number
    openReports: number
    openVideoRequests: number
    /** Sign-ups waiting for approval. */
    pendingSignups: number
    uploadBytes: number
  }
  newest: AdminMember[]
  log: AdminLogEntry[]
}

/** Beheer → Overzicht: how new members get in, and whether mail works. */
export type AdminSettings = {
  /** 'mail': they confirm their address by mail; 'approval': the waitlist, you approve each one. */
  signupMode: 'mail' | 'approval'
  /** An SMTP relay (Brevo) is set up; without one, mails only go to the server log. */
  mailEnabled: boolean
  /** The sender, e.g. "Kuddes <noreply@kuddes.example>". */
  mailFrom: string
  /** The relay, e.g. smtp-relay.brevo.com. */
  mailHost: string
}

export type AdminMember = UserSummary & {
  email: string
  createdAt: string
  lastSeenAt: string | null
  /** The address they last used the site from (kept LAST_IP_DAYS after their last visit). */
  lastIp: string | null
  /** The active IP ban that covers their last address, if any. */
  ipBan: { id: number; range: string; scope: IpBanScope; expiresAt: string | null } | null
  blockedAt: string | null
  blockReason: string | null
  isDummy: boolean
  isAdmin: boolean
  forumBanned: boolean
  videoUploadAllowed: boolean
  musicUploadAllowed: boolean
  radioAllowed: boolean
  /** Approved (or confirmed by mail); false = on the waitlist. */
  approved: boolean
  /** What they wrote when signing up (while on the waitlist). */
  signupReason: string | null
  city: string | null
  counts: { statuses: number; photos: number; videos: number; forumPosts: number }
}

export type AdminLogEntry = { id: number; admin: string | null; action: string; target: string; details: string; createdAt: string }

export type AdminNews = {
  id: number
  slug: string
  label: string
  title: string
  summary: string
  body: string
  /** An upload under news/, and where it's served. */
  bannerPath: string | null
  bannerUrl: string | null
  published: boolean
  publishedAt: string
  author: string | null
  updatedAt: string
}

export const UPLOAD_KINDS = {
  fotos: "Foto's",
  videos: "Video's",
  profielfotos: "Profielfoto's",
  kuddes: 'Kudde-afbeeldingen',
  kuddefotos: "Foto's in Kuddes",
  achtergronden: 'Achtergronden',
  glitterplaatjes: 'Glitterplaatjes',
  recepten: 'Recepten',
} as const

export type UploadKind = keyof typeof UPLOAD_KINDS

export type AdminUpload = {
  /** What to pass back when deleting: a photo id, video id, username, kudde slug or file name (Kudde photos: `foto-<id>`, or `prikbord-<post id>` for a Prikbord post's own photo). */
  key: string
  kind: UploadKind
  url: string
  /** Where it's shown on the site, if anywhere. */
  link: string | null
  title: string
  owner: UserSummary | null
  createdAt: string | null
  bytes: number | null
  status?: string
}

/** How the member list on /beheer can be sorted (the server sorts, the list shows 100). */
export const MEMBER_SORTS = {
  nieuw: 'Nieuwste eerst',
  oud: 'Oudste eerst',
  online: 'Laatst online',
  naam: 'Naam',
  wiewatwaars: 'Meeste WieWatWaars',
  fotos: "Meeste foto's",
  videos: "Meeste video's",
  forum: 'Meeste forumberichten',
} as const
export type MemberSort = keyof typeof MEMBER_SORTS

export const CONTENT_KINDS = {
  wiewatwaars: 'WieWatWaars',
  knuffels: 'Knuffels',
  reacties: 'Reacties (tijdlijn)',
  videoreacties: "Reacties op video's",
  forumberichten: 'Forumberichten',
  forumdiscussie: 'Forumprofiel-discussie',
  kuddes: 'Kuddes',
  evenementen: 'Evenementen',
} as const

export type ContentKind = keyof typeof CONTENT_KINDS

export type AdminContent = {
  id: string
  kind: ContentKind
  author: UserSummary | null
  text: string
  link: string | null
  createdAt: string
}

export type AdminReport = {
  id: number
  kind: 'suggestie' | 'probleem'
  title: string
  body: string
  page: string | null
  user: UserSummary | null
  createdAt: string
  handledAt: string | null
  status: SuggestionStatus
  statusNote: string | null
}

export type AdminVideoRequest = {
  id: number
  user: UserSummary
  /** Keys of VIDEO_UPLOAD_REASONS or MUSIC_UPLOAD_REASONS. */
  reasons: string[]
  motivation: string
  status: 'open' | 'goedgekeurd' | 'afgewezen'
  answer: string | null
  createdAt: string
  handledAt: string | null
}
