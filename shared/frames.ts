/** Borders around your profile photo (Instellingen → Profielfoto). */
export const AVATAR_FRAMES = {
  goud: 'Goud',
  zilver: 'Zilver',
  hout: 'Hout',
  polaroid: 'Polaroid',
  neon: 'Neon',
  regenboog: 'Regenboog',
  glitter: 'Glitter',
  hartjes: 'Hartjes',
  sterren: 'Sterren',
  bloemen: 'Bloemen',
  doodskopjes: 'Doodskopjes',
  // Animated (src/features/profile/AnimatedFrames.css)
  draaiend: 'Draaiende regenboog',
  disco: 'Disco',
  vuur: 'Vuur',
  bliksem: 'Bliksem',
  sterrenhemel: 'Sterrenhemel',
  lichtjes: 'Lopende lichtjes',
  glans: 'Glanzend goud',
  water: 'Water',
  sneeuwval: 'Sneeuwval',
  hartslag: 'Hartslag',
} as const

/** The frames that move; the picker marks them. */
export const ANIMATED_FRAMES = ['neon', 'draaiend', 'disco', 'vuur', 'bliksem', 'sterrenhemel', 'lichtjes', 'glans', 'water', 'sneeuwval', 'hartslag'] as const satisfies readonly (keyof typeof AVATAR_FRAMES)[]

export type AvatarFrame = keyof typeof AVATAR_FRAMES
export const isAvatarFrame = (v: unknown): v is AvatarFrame => typeof v === 'string' && v in AVATAR_FRAMES
export const isAnimatedFrame = (f: AvatarFrame | null) => !!f && (ANIMATED_FRAMES as readonly string[]).includes(f)
