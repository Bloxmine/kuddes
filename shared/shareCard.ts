/**
 * The profielkaartje: a small card about you that you can put on other sites
 * (an embed), download as a picture (like a business card) or share as a
 * link. Profiles are for members only; the card is public, so it only shows
 * what you switched on, and it's off until you turn it on.
 */
import type { BackgroundImage, HeaderDesign, ProfilePattern } from './customization'
import type { InterestKey } from './profileExtras'

export type ShareCardSettings = {
  enabled: boolean
  photo: boolean
  city: boolean
  age: boolean
  /** A bit of your "Wie ben ik?". */
  about: boolean
  /** Which of your favourites to show, in this order. */
  interests: InterestKey[]
  music: boolean
  gamerTags: boolean
  /** In the colours of your profile design (otherwise the standard Kuddes look). */
  design: boolean
  /** A line of your own, like "Kom je ook?". */
  message: string
}

export const SHARE_CARD_LIMITS = { interests: 5, message: 120 }

export const DEFAULT_SHARE_CARD: ShareCardSettings = {
  enabled: false,
  photo: true,
  city: true,
  age: false,
  about: false,
  interests: [],
  music: false,
  gamerTags: false,
  design: true,
  message: '',
}

export const withCardDefaults = (s: Partial<ShareCardSettings> | null | undefined): ShareCardSettings => ({ ...DEFAULT_SHARE_CARD, ...(s ?? {}) })

/** The colours of the card: from the profile design, or the Kuddes blue. */
export type ShareCardLook = {
  /** A CSS background for around the card. */
  background: string
  /** Two colours for the picture version (it can't draw every pattern). */
  background1: string
  background2: string
  surface: string
  text: string
  title: string
  link: string
  box: string
  accent: string
  /** The design's pattern and photo (the page shows `background`; the picture draws these). */
  pattern: ProfilePattern | null
  image: BackgroundImage | null
  /** The title bar: its background, the design behind it, and the name's font, colour and shadow. */
  headerBackground: string
  header: HeaderDesign | null
  nameFont: string
  nameColor: string
  nameShadow: string
  /** A see-through plate behind the name, when the design has one. */
  namePlate: string | null
}

/** What the card shows: only what the member switched on. */
export type ShareCard = {
  username: string
  name: string
  nickname: string
  avatarUrl: string | null
  city: string | null
  age: number | null
  about: string | null
  interests: { key: InterestKey; label: string; value: string }[]
  music: string[]
  gamerTags: { label: string; value: string }[]
  message: string
  look: ShareCardLook
  memberSince: string
  /** Changes when the card changes, so shared pictures refresh. */
  version: string
}

/** Where the card lives, its picture, and the invite to join. */
export const cardPath = (username: string) => `/kaartje/${username}`
export const cardImagePath = (username: string, version = '') => `/og/kaartje/${username}.jpg${version ? `?v=${version}` : ''}`
export const joinPath = (username: string) => `/aanmelden?via=${encodeURIComponent(username)}`
