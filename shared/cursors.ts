/**
 * Animated cursors for your profile: whoever visits it gets this one instead
 * of their mouse pointer (src/features/profile/ProfileCursor.tsx). The GIFs
 * come from Bloxmine/GIFCursors and live in public/cursors/<key>.gif. Every
 * one is 32×32 with its point in the top left corner. The keys are stored
 * with the member, so keep them; the names can change.
 */
export const PROFILE_CURSORS = {
  wereld: 'Wereld in handen',
  roos: 'Roos',
  bloem: 'Bloem',
  ijsje: 'IJsje',
  taart: 'Taart',
  'paarse-pijl': 'Paarse pijl',
  schatkist: 'Schatkist',
  kistje: 'Rood kistje',
  rocker: 'Rocker',
  plaat: 'Plaat',
  cd: 'Cd',
  dobbelsteen: 'Dobbelsteen',
  mollen: 'Mollen meppen',
  schroevendraaier: 'Gereedschap',
  planeet: 'Planeet',
  slijm: 'Slijm',
  wandelaar: 'Wandelaar',
  paus: 'Paus',
  'roze-pijl': 'Roze pijl',
  regenboog: 'Regenboog',
  vuurzwaard: 'Vuurzwaard',
  vlinder: 'Vlinder',
  playa: 'Playa',
  hoedje: 'Beatrix',
  clown: 'Clown',
  kat: 'Kat',
  aap: 'Aap',
  bij: 'Bij',
  dollar: 'Dollar',
  'coole-bal': 'Coole bal',
} as const

export type ProfileCursor = keyof typeof PROFILE_CURSORS
export const isProfileCursor = (v: unknown): v is ProfileCursor => typeof v === 'string' && v in PROFILE_CURSORS
export const cursorUrl = (c: ProfileCursor) => `/cursors/${c}.gif`
