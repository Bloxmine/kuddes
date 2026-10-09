/**
 * Photo albums and the photography section (/fotografie): camera details
 * from a photo (EXIF), read in the browser from the original file before
 * it's made smaller. Only these fields are ever kept: never where the photo
 * was taken (GPS), and only shown when the member wants that.
 */
import type { Photo, UserSummary } from './api'

export type PhotoExif = {
  /** "Canon EOS 600D" (make and model); can be typed in by hand. */
  camera?: string
  lens?: string
  /** In mm. */
  focalLength?: number
  /** The f-number: 2.8 */
  aperture?: number
  /** In seconds: 0.004 is 1/250 */
  exposure?: number
  iso?: number
  /** When the photo was taken, as the camera says ("2026-09-30T14:02:11"). */
  takenAt?: string
}

export const EXIF_LIMITS = { camera: 60, lens: 80 }

export const PHOTO_ALBUM_LIMITS = { name: 40, description: 300, perMember: 50 }

export const PHOTOGRAPHY_VISIBILITY = {
  iedereen: { label: 'Iedereen', hint: 'Ook bezoekers zonder account.', icon: 'world' },
  leden: { label: 'Leden van Kuddes', hint: 'Iedereen die is ingelogd.', icon: 'group' },
  vrienden: { label: 'Alleen vrienden', hint: 'Alleen jij en je vrienden.', icon: 'lock' },
} as const

export type PhotographyVisibility = keyof typeof PHOTOGRAPHY_VISIBILITY
export const isPhotographyVisibility = (v: unknown): v is PhotographyVisibility => typeof v === 'string' && v in PHOTOGRAPHY_VISIBILITY

export const PHOTOGRAPHY_LIMITS = { title: 60, about: 600, gear: 200 }

/** 0.004 → "1/250 s", 2 → "2 s" */
export function formatExposure(seconds: number): string {
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10} s`
  return `1/${Math.round(1 / seconds)} s`
}

/** "f/2.8 · 1/250 s · ISO 200 · 35 mm" */
export function exifLine(e: PhotoExif): string {
  return [e.aperture && `f/${e.aperture}`, e.exposure && formatExposure(e.exposure), e.iso && `ISO ${e.iso}`, e.focalLength && `${e.focalLength} mm`].filter(Boolean).join(' · ')
}

export type PhotoAlbum = {
  id: number
  name: string
  description: string
  icon: string | null
  coverUrl: string | null
  count: number
}

/** A member's photography page, as the viewer sees it. */
export type PhotographyPage = {
  user: UserSummary
  title: string
  about: string
  gear: string
  visibility: PhotographyVisibility
  showExif: boolean
  /** The wide photo across the top, and where it's cropped (0 top … 100 bottom). */
  bannerUrl: string | null
  bannerPhotoId: number | null
  bannerY: number
  photoCount: number
  faveCount: number
  /** A few photos for the cover and the overview. */
  cover: Photo[]
  mine: boolean
}

/** A photo on a photography page: the normal photo plus favourites and views. */
export type PhotographyPhoto = Photo & { faves: number; faved: boolean; views: number; respects: number; respected: boolean }

/** A photography Kudde on /fotografie: a group about photography, with a few of its photos. */
export type PhotographyKudde = {
  slug: string
  name: string
  imageUrl: string | null
  memberCount: number
  photoCount: number
  cover: string[]
}

export const PHOTO_PAGE_LIMITS = { description: 1000, comment: 1000 }

export type PhotoComment = { id: number; user: UserSummary; text: string; createdAt: string; canDelete: boolean }

/** A photo on its own page (/fotografie/:username/foto/:id), like on Flickr. */
export type PhotoPageData = {
  photo: PhotographyPhoto
  /** The photographer's page it's on. */
  pageTitle: string
  /** The album it's in, if any. */
  album: PhotoAlbum | null
  /** The photos around it, for the arrows and the strip: the album's (with ?album=) or the whole photostream. */
  context: { album: { id: number; name: string } | null; photos: { id: number; url: string; width: number; height: number }[] }
  comments: PhotoComment[]
  /** Who gave respect, newest first. */
  respecters: UserSummary[]
  mine: boolean
}
