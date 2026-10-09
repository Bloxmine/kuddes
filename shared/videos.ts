/** Kuddes Video: members' own uploaded videos, rated with stars. */

export const VIDEO_CATEGORIES = {
  muziek: 'Muziek',
  humor: 'Humor',
  games: 'Games',
  sport: 'Sport',
  film: 'Film & animatie',
  mensen: 'Mensen & blogs',
  dieren: 'Huisdieren & dieren',
  auto: "Auto's & voertuigen",
  reizen: 'Reizen & evenementen',
  howto: 'Tips & tutorials',
  nieuws: 'Nieuws & politiek',
  overig: 'Overig',
} as const

export type VideoCategory = keyof typeof VIDEO_CATEGORIES

export const isVideoCategory = (v: unknown): v is VideoCategory => typeof v === 'string' && v in VIDEO_CATEGORIES

/**
 * openbaar: everywhere. verborgen: only with the link (not in lists or
 * search). vrienden: only the uploader's friends.
 */
export type VideoVisibility = 'openbaar' | 'verborgen' | 'vrienden'

export const VIDEO_VISIBILITY: Record<VideoVisibility, { label: string; hint: string }> = {
  openbaar: { label: 'Openbaar', hint: 'Iedereen kan hem vinden en bekijken' },
  verborgen: { label: 'Verborgen', hint: 'Alleen wie de link heeft' },
  vrienden: { label: 'Alleen vrienden', hint: 'Alleen jouw Kuddes-vrienden' },
}

export type VideoStatus = 'uploaden' | 'verwerken' | 'klaar' | 'mislukt'

/**
 * Thumbs on comments, like YouTube used to: the two best comments get their
 * own spot at the top, and a comment with this many more thumbs down than up
 * is folded away ("tonen" opens it).
 */
export const COMMENT_VOTES = { hideAt: 5, top: 2, topMinLikes: 1 }

export const VIDEO_LIMITS = {
  /** About a channel. */
  channelDescription: 1500,
  /** Largest file accepted, before conversion. */
  bytes: 100 * 1024 * 1024,
  /** Longest video in seconds; longer ones are cut. */
  seconds: 15 * 60,
  title: 100,
  description: 5000,
  tags: 15,
  tag: 30,
  comment: 1000,
}

/** Accepted upload types; everything is converted to H.265 (HEVC) MP4. */
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/x-msvideo', 'video/3gpp', 'video/mpeg']

/** "3:07", "1:02:45" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor(s / 60) % 60
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Tags as typed ("funny, kat  #lol") to a clean list. */
export function parseTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= VIDEO_LIMITS.tag),
    ),
  ].slice(0, VIDEO_LIMITS.tags)
}

/** Why you want to upload: you tick at least one when asking for upload rights. */
export const VIDEO_UPLOAD_REASONS = {
  vlog: "Vlogs of video's over mezelf",
  vrienden: 'Filmpjes voor mijn vrienden',
  kudde: "Video's voor een Kudde (club, school, bedrijf…)",
  muziek: 'Eigen muziek of optredens',
  creatief: 'Animaties, films of andere creatieve dingen',
  games: "Gamevideo's",
  sport: "Sport en hobby's",
  anders: 'Iets anders (vertel het hieronder)',
} as const

export type VideoUploadReason = keyof typeof VIDEO_UPLOAD_REASONS

/** The rules you agree to when asking for upload rights. */
export const VIDEO_TERMS = [
  "Ik upload alleen video's die ik zelf heb gemaakt of mag delen.",
  'Geen naakt, geweld, haat, pesten of iets anders wat niet door de beugel kan.',
  'Wie herkenbaar in beeld is, vindt het goed dat de video online staat.',
  'Geen reclame of spam.',
  "De beheerder mag video's verwijderen en mijn uploadrechten intrekken als ik me niet aan de regels houd.",
]

export const VIDEO_REQUEST_LIMITS = { motivation: 1000 }

export type VideoUploadAccess = {
  allowed: boolean
  request: { status: 'open' | 'goedgekeurd' | 'afgewezen'; reasons: VideoUploadReason[]; motivation: string; answer: string | null; createdAt: string; handledAt: string | null } | null
}
