/**
 * Kuddes Radio (/radio): members host their own live shows. The host's
 * browser mixes Kuddes Muziek songs, sound buttons and microphones (theirs and
 * their co-DJs') and sends that to the server, which passes it on to the
 * listeners as one MP3 stream. Hosting needs the admin's OK, like Kuddes Video.
 */
import type { UserSummary } from './api'
import type { MusicTrack } from './music'

/** Kinds of station, in the order of the bar on /radio. */
export const RADIO_GENRES = {
  muziekmix: { name: 'Muziekmix', hint: 'van alles wat', icon: 'radio_modern' },
  pop: { name: 'Pop', hint: 'hits & meezingers', icon: 'star' },
  rock: { name: 'Rock & metal', hint: 'gitaren & drums', icon: 'electric_guitar' },
  hiphop: { name: 'Hiphop & R&B', hint: 'rap & beats', icon: 'headphone' },
  dance: { name: 'Dance & EDM', hint: 'house, techno, dnb', icon: 'sound' },
  chill: { name: 'Chill & lo-fi', hint: 'rustig aan', icon: 'ipod' },
  nederlandstalig: { name: 'Nederlandstalig', hint: 'in het Nederlands', icon: 'flag_red' },
  talkshow: { name: 'Talkshow', hint: 'praten & gasten', icon: 'microphone' },
  comedy: { name: 'Comedy', hint: 'om te lachen', icon: 'emotion_happy' },
  podcast: { name: 'Podcast', hint: 'verhalen & gesprekken', icon: 'comments' },
  nieuws: { name: 'Nieuws & actualiteit', hint: 'wat er speelt', icon: 'newspaper' },
  sport: { name: 'Sport', hint: 'wedstrijden & praat', icon: 'sport_soccer' },
  gaming: { name: 'Gaming', hint: 'games & e-sports', icon: 'controller' },
  verhalen: { name: 'Verhalen & hoorspel', hint: 'luisterboeken', icon: 'book_open' },
  school: { name: 'School & leren', hint: 'uitleg & lessen', icon: 'education' },
  anders: { name: 'Anders', hint: 'van alles', icon: 'transmit' },
} as const satisfies Record<string, { name: string; hint: string; icon: string }>

export type RadioGenre = keyof typeof RADIO_GENRES
export const isRadioGenre = (v: unknown): v is RadioGenre => typeof v === 'string' && v in RADIO_GENRES

export const RADIO_LIMITS = {
  /** The stream to listeners, in kbit/s (about 43 MB per listener per hour). */
  bitrate: 96,
  /** Shows that can be live at the same time (one ffmpeg each). */
  liveShows: 5,
  /** Listeners of one show, and streams from one address. */
  listeners: 500,
  listenersPerIp: 3,
  /** Co-DJs invited to a station, and connected at once. */
  djs: 6,
  djsLive: 3,
  name: 60,
  description: 1000,
  title: 80,
  /** Planned shows ahead per station. */
  shows: 30,
  /** Hours a planned show can last. */
  showHours: 12,
  /** Songs in a show's playlist. */
  playlist: 100,
  /** Sound buttons: how many, how long, how big. */
  sounds: 24,
  soundSeconds: 15,
  soundBytes: 2 * 1024 * 1024,
  soundName: 24,
  chat: 300,
}

export const RADIO_UPLOAD_REASONS = {
  muziek: 'Een muziekprogramma met nummers van Kuddes Muziek',
  talkshow: 'Een talkshow of praatprogramma',
  podcast: 'Een podcast of verhalen',
  comedy: 'Comedy',
  school: 'Voor school, een club of vereniging',
  anders: 'Iets anders (vertel het hieronder)',
} as const
export type RadioUploadReason = keyof typeof RADIO_UPLOAD_REASONS

/** The rules you agree to when asking to host. */
export const RADIO_TERMS = [
  'Ik draai alleen muziek van Kuddes Muziek, of muziek waarvan ik zelf de rechten heb. Geen nummers van de radio, Spotify of YouTube.',
  'Geld, haat, geweld, pesten en ongepaste praat horen niet in mijn uitzending, ook niet van mijn gasten of DJ’s.',
  'Ik zet niemand zonder toestemming in de uitzending, en ik deel geen gegevens van anderen.',
  'De beheerder mag een uitzending stoppen en mijn rechten intrekken als ik me niet aan de regels houd.',
]

export type RadioAccess = {
  allowed: boolean
  request: { status: 'open' | 'goedgekeurd' | 'afgewezen'; reasons: RadioUploadReason[]; motivation: string; answer: string | null; createdAt: string; handledAt: string | null } | null
}

/** What's on now, while live. */
export type RadioLive = {
  title: string
  since: string
  listeners: number
  /** The Kuddes Muziek song playing now (or null: talking, a jingle). */
  track: MusicTrack | null
  /** Co-DJs in the studio now. */
  djs: UserSummary[]
}

export type RadioStation = {
  user: UserSummary
  name: string
  description: string
  genre: RadioGenre
  bannerUrl: string | null
  bannerY: number
  followers: number
  following: boolean
  mine: boolean
  /** You're one of the station's co-DJs. */
  dj: boolean
  live: RadioLive | null
  /** The next planned show, if any. */
  next: RadioShow | null
}

/** A planned show (programmering). */
export type RadioShow = {
  id: number
  title: string
  description: string
  startsAt: string
  endsAt: string
  /** Kuddes Muziek songs to play, in order (only for the station's own studio). */
  playlist: number[]
  station?: { name: string; user: UserSummary; genre: RadioGenre }
}

/** A sound button in the studio (a jingle, an effect). */
export type RadioSound = { id: number; name: string; url: string; color: string }

export type RadioChatLine = { id: number; user: UserSummary; text: string; at: string }

/** What a station's event stream (SSE) sends to listeners and the studio. */
export type RadioEvents = {
  live: RadioLive | null
  chat: RadioChatLine
  /** For the studio and the DJs: setting up a DJ's microphone. */
  dj: { from: number; kind: 'offer' | 'answer' | 'ice' | 'join' | 'leave' | 'relay' | 'kick'; payload?: unknown }
}

/** Colours for the sound buttons. */
export const SOUND_COLORS = ['#e2559b', '#e3702a', '#e0b02a', '#3d9a6b', '#1fa3c4', '#4b6fd8', '#8a4fd0', '#5a6b7d']
