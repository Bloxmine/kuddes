/**
 * How a photo was edited: the steps (rotate, flip, crop, red eyes) in order,
 * then light and colour on top. The original stays on the server, so the
 * photo is always rendered fresh from it: editing again doesn't cost quality,
 * and "Origineel" goes all the way back. Positions and sizes are fractions of
 * the picture as it was at that step (0..1), so they don't depend on pixels.
 */
export type PhotoEditStep =
  | { t: 'rotate'; turns: 1 | 2 | 3 } // quarter turns clockwise
  | { t: 'flip'; axis: 'h' | 'v' }
  | { t: 'crop'; x: number; y: number; w: number; h: number }
  | { t: 'redeye'; x: number; y: number; r: number } // r: radius as a fraction of the width

/** The first effects. The editor no longer offers them (the Oldstagram filters replaced them), but photos edited with one keep it. */
export const PHOTO_FILTERS = {
  geen: 'Geen',
  zwartwit: 'Zwart-wit',
  sepia: 'Sepia',
  vintage: 'Vintage',
  warm: 'Zomer',
  koel: 'Winter',
  fel: 'Fel',
  lomo: 'Lomo',
} as const
export type PhotoFilter = keyof typeof PHOTO_FILTERS

/**
 * Oldstagram: the photo filters from the early Instagram days (from
 * Bloxmine/oldsta, after CSSgram). How each one is drawn is in
 * src/features/photos/oldsta.ts.
 */
export const PHOTO_LOOKS = {
  '1977': '1977',
  aden: 'Aden',
  amaro: 'Amaro',
  ashby: 'Ashby',
  brannan: 'Brannan',
  brooklyn: 'Brooklyn',
  charmes: 'Charmes',
  clarendon: 'Clarendon',
  crema: 'Crema',
  dogpatch: 'Dogpatch',
  earlybird: 'Earlybird',
  gingham: 'Gingham',
  ginza: 'Ginza',
  hefe: 'Hefe',
  helena: 'Helena',
  hudson: 'Hudson',
  inkwell: 'Inkwell',
  juno: 'Juno',
  kelvin: 'Kelvin',
  lark: 'Lark',
  lofi: 'Lo-Fi',
  ludwig: 'Ludwig',
  maven: 'Maven',
  mayfair: 'Mayfair',
  moon: 'Moon',
  nashville: 'Nashville',
  perpetua: 'Perpetua',
  poprocket: 'Poprocket',
  reyes: 'Reyes',
  rise: 'Rise',
  sierra: 'Sierra',
  skyline: 'Skyline',
  slumber: 'Slumber',
  stinson: 'Stinson',
  sutro: 'Sutro',
  toaster: 'Toaster',
  valencia: 'Valencia',
  vesper: 'Vesper',
  walden: 'Walden',
  willow: 'Willow',
  'xpro-ii': 'X-Pro II',
} as const
export type PhotoLook = keyof typeof PHOTO_LOOKS

/** The borders that came with some of those filters (public/photo-frames/<key>.png). */
export const PHOTO_FRAMES = {
  '1977': '1977',
  brannan: 'Brannan',
  earlybird: 'Earlybird',
  kelvin: 'Kelvin',
  lofi: 'Lo-Fi',
  nashville: 'Nashville',
  poprocket: 'Poprocket',
  rise: 'Rise',
  walden: 'Walden',
  willow: 'Willow',
  xpro: 'X-Pro II',
} as const
export type PhotoFrame = keyof typeof PHOTO_FRAMES

/** The border a filter comes with, as in the original app; you can pick another one after. */
export const LOOK_FRAMES: Partial<Record<PhotoLook, PhotoFrame>> = {
  '1977': '1977',
  toaster: '1977',
  inkwell: '1977',
  kelvin: 'kelvin',
  earlybird: 'earlybird',
  'xpro-ii': 'xpro',
  nashville: 'nashville',
  walden: 'walden',
  hefe: 'walden',
  sutro: 'walden',
  brannan: 'brannan',
  poprocket: 'poprocket',
  lofi: 'lofi',
  willow: 'willow',
  rise: 'rise',
}

export type PhotoEdits = {
  steps: PhotoEditStep[]
  /** Sliders, -100..100 (vignette 0..100); 0 = unchanged. */
  light: number
  contrast: number
  saturation: number
  warmth: number
  vignette: number
  filter: PhotoFilter
  /** An Oldstagram filter and a border; missing on photos edited before they existed. */
  look?: PhotoLook | null
  frame?: PhotoFrame | null
}

export const PHOTO_EDIT_LIMITS = { steps: 200 }

export const NO_EDITS: PhotoEdits = {
  steps: [],
  light: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  filter: 'geen',
  look: null,
  frame: null,
}

export function isUnedited(e: PhotoEdits) {
  return e.steps.length === 0 && e.light === 0 && e.contrast === 0 && e.saturation === 0 && e.warmth === 0 && e.vignette === 0 && e.filter === 'geen' && !e.look && !e.frame
}
