/**
 * Muziek (/muziek): members' own music. Like Kuddes Video, uploading needs
 * the admin's OK (asked on the upload page); listening is for everyone.
 */
import type { UserSummary } from './api'

/** The genres, in the order of the bar on /muziek. */
export const MUSIC_GENRES = {
  pop: { name: 'Pop', hint: 'meezingers', icon: 'star' },
  rock: { name: 'Rock', hint: 'gitaren & drums', icon: 'electric_guitar' },
  hiphop: { name: 'Hiphop', hint: 'rap & beats', icon: 'headphone' },
  dance: { name: 'Dance', hint: 'house & techno', icon: 'sound' },
  edm: { name: 'EDM', hint: 'drops & festivals', icon: 'transmit' },
  dnb: { name: 'Drum & Bass', hint: 'snel & zwaar', icon: 'rocket' },
  rnb: { name: 'R&B', hint: 'soul & funk', icon: 'microphone' },
  indie: { name: 'Indie', hint: 'alternatief', icon: 'cd' },
  akoestisch: { name: 'Akoestisch', hint: 'singer-songwriter', icon: 'acoustic_guitar' },
  metal: { name: 'Metal', hint: 'hard & luid', icon: 'lightning' },
  nederlandstalig: { name: 'Nederlandstalig', hint: 'in het Nederlands', icon: 'flag_red' },
  klassiek: { name: 'Klassiek', hint: 'piano & orkest', icon: 'piano' },
  jazz: { name: 'Jazz', hint: 'swing & blues', icon: 'drum' },
  lofi: { name: 'Lo-fi', hint: 'chill & studeren', icon: 'ipod' },
  ambient: { name: 'Ambient', hint: 'sfeer & rust', icon: 'weather_sun_fog' },
  anders: { name: 'Anders', hint: 'van alles', icon: 'note' },
} as const satisfies Record<string, { name: string; hint: string; icon: string }>

export type MusicGenre = keyof typeof MUSIC_GENRES
export const isMusicGenre = (v: unknown): v is MusicGenre => typeof v === 'string' && v in MUSIC_GENRES

export const MUSIC_LIMITS = {
  /** The file as uploaded; it's converted to an MP3. */
  bytes: 40 * 1024 * 1024,
  /** Longest song, in seconds. */
  seconds: 15 * 60,
  title: 80,
  description: 1000,
  credits: 12,
  creditRole: 40,
  creditName: 60,
  name: 60,
  bio: 1000,
  /** Songs per member. */
  perMember: 100,
  /** Artist or band pages per member. */
  bands: 5,
}

/** What can be uploaded (the browser's MIME types). */
export const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'audio/webm']

export const MUSIC_UPLOAD_REASONS = {
  eigen: 'Ik maak zelf muziek (alleen of in een band)',
  band: 'Voor mijn band of koor',
  covers: 'Covers en eigen versies van liedjes',
  beats: 'Beats en elektronische muziek',
  school: 'Muziek van school of muziekles',
  anders: 'Iets anders (vertel het hieronder)',
} as const
export type MusicUploadReason = keyof typeof MUSIC_UPLOAD_REASONS

/** The rules you agree to when asking for upload rights. */
export const MUSIC_TERMS = [
  'Ik upload alleen muziek die ik zelf heb gemaakt, of waar ik toestemming voor heb van iedereen die eraan meewerkte.',
  'Geen muziek van anderen (zoals nummers van de radio of Spotify): dat mag niet zomaar.',
  'Geen teksten met haat, geweld of pesten.',
  'De beheerder mag nummers verwijderen en mijn uploadrechten intrekken als ik me niet aan de regels houd.',
]

export type MusicUploadAccess = {
  allowed: boolean
  request: { status: 'open' | 'goedgekeurd' | 'afgewezen'; reasons: MusicUploadReason[]; motivation: string; answer: string | null; createdAt: string; handledAt: string | null } | null
}

/** Someone else who worked on a song; `username` links to their profile when they're a member. */
export type TrackCredit = { role: string; name: string; username?: string | null }

export type MusicTrack = {
  id: number
  title: string
  genre: MusicGenre
  description: string
  /** Null while it's being converted (or when that failed). */
  audioUrl: string | null
  coverUrl: string | null
  /** Seconds. */
  duration: number
  /** "2026-10-05", or with yearOnly just the year counts. */
  released: { date: string; yearOnly: boolean } | null
  credits: TrackCredit[]
  status: 'verwerken' | 'klaar' | 'mislukt'
  plays: number
  likes: number
  liked: boolean
  /** Who made it: the artist or band page it's on, and the member behind it. */
  artist: { id: number; slug: string; name: string; user: UserSummary }
  createdAt: string
  mine: boolean
}

export type MusicArtist = {
  id: number
  /** In the address: /muziek/<slug>. */
  slug: string
  user: UserSummary
  name: string
  bio: string
  genre: MusicGenre
  bannerUrl: string | null
  bannerY: number
  /** The band's own picture, or null (then the member's photo is shown). */
  avatarUrl: string | null
  trackCount: number
  plays: number
  mine: boolean
}

/** A place in the charts (this week's plays), and where it was the week before. */
export type ChartEntry = { rank: number; lastRank: number | null; weekPlays: number; track: MusicTrack }

/** "3:07" */
export const formatTrackTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
