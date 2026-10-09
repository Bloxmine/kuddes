import { z } from 'zod'
import { TEXTURE_PATTERNS, type TexturePattern } from '../../shared/textures'
import { BACKGROUND_EFFECTS, EFFECT_AMOUNTS, type BackgroundEffectKind, type EffectAmount } from '../../shared/backgroundEffects'
import {
  DEFAULT_HOME_LAYOUT,
  DEFAULT_PROFILE_LAYOUT,
  BACKGROUND_MODES,
  BACKGROUND_URL,
  HEX,
  HOME_BOXES,
  LAYOUT_COLUMNS,
  PROFILE_BOXES,
  NAME_FONTS,
  NAME_SHADOWS,
  ALL_PATTERNS,
  BODY_FONTS,
  BOX_GLOW_LIMITS,
  TEXTURE_OVERLAYS,
  type BodyFont,
  type TextureOverlayStyle,
  type HeaderPattern,
  type NameFont,
  type NameShadow,
  normalizeLayout,
  type HomeBox,
  type ProfileBox,
} from '../../shared/customization'
import { FESTIVE_AMOUNTS, FESTIVE_MODES, type FestiveAmount, type FestiveMode } from '../../shared/festive'
import { GADGET_SLOT, LIMITS } from '../../shared/gadgets'
import { SKINS } from '../../shared/skins'
import { isThemeChoice } from '../../shared/themes'

const hex = z.string().regex(HEX, 'Kies een geldige kleur.').transform((s) => s.toLowerCase())

const imageSchema = z.object({
  url: z.string().regex(BACKGROUND_URL, 'Upload eerst een achtergrond.'),
  mode: z.enum(Object.keys(BACKGROUND_MODES) as [keyof typeof BACKGROUND_MODES]),
  fixed: z.boolean(),
})

const effectSchema = z.object({
  kind: z.enum(Object.keys(BACKGROUND_EFFECTS) as [BackgroundEffectKind, ...BackgroundEffectKind[]]),
  color: hex.optional(),
  amount: z.enum(Object.keys(EFFECT_AMOUNTS) as [EffectAmount, ...EffectAmount[]]).optional(),
})

const textureSchema = z.enum(TEXTURE_PATTERNS as [TexturePattern, ...TexturePattern[]])
const fadeSchema = z.number().min(0).max(0.95)
const overlaySchema = z.object({
  style: z.enum(Object.keys(TEXTURE_OVERLAYS) as [TextureOverlayStyle, ...TextureOverlayStyle[]]),
  opacity: z.number().min(0.05).max(0.95),
})

const boxLook = {
  boxOpacity: z.number().min(0.2).max(1).optional(),
  boxBlur: z.number().min(0).max(20).optional(),
  boxGlow: z.object({ color: hex, size: z.number().int().min(BOX_GLOW_LIMITS.min).max(BOX_GLOW_LIMITS.max) }).nullable().optional(),
  boxTexture: textureSchema.nullable().optional(),
  boxTextureFade: fadeSchema.optional(),
  boxHeaderTexture: textureSchema.nullable().optional(),
  boxHeaderFade: fadeSchema.optional(),
  image: imageSchema.nullable().optional(),
  effect: effectSchema.nullable().optional(),
}


/** Background images are uploaded per member; you can only use your own. */
export function ownsImages(userId: number, ...looks: ({ image?: { url: string } | null } | null | undefined)[]) {
  return looks.every((l) => !l?.image || BACKGROUND_URL.exec(l.image.url)?.[1] === String(userId))
}

export const customThemeSchema = z.object({
  ...boxLook,
  brand: hex,
  link: hex,
  button: hex,
  background: hex,
  dark: z.boolean(),
  pattern: z.enum(ALL_PATTERNS).optional(),
  patternColor: hex.optional(),
  barPattern: z.enum(ALL_PATTERNS).optional(),
  barPatternColor: hex.optional(),
  overlay: overlaySchema.nullable().optional(),
  barOverlay: overlaySchema.nullable().optional(),
})

const headerSchema = z.object({
  pattern: z.enum(['standaard', ...ALL_PATTERNS] as [HeaderPattern, ...HeaderPattern[]]),
  color: hex,
  color2: hex,
  nameColor: hex,
  shadow: z.enum(Object.keys(NAME_SHADOWS) as [NameShadow]),
  backdrop: z.boolean(),
  font: z.enum(Object.keys(NAME_FONTS) as [NameFont]),
  overlay: overlaySchema.nullable().optional(),
})

export const profileColorsSchema = z.object({
  ...boxLook,
  background: hex,
  background2: hex,
  pattern: z.enum(ALL_PATTERNS),
  box: hex,
  title: hex,
  link: hex,
  surface: hex.optional(),
  text: hex.optional(),
  header: headerSchema.nullable().optional(),
  overlay: overlaySchema.nullable().optional(),
  font: z.enum(Object.keys(BODY_FONTS) as [BodyFont, ...BodyFont[]]).nullable().optional(),
  titleFont: z.enum(Object.keys(BODY_FONTS) as [BodyFont, ...BodyFont[]]).nullable().optional(),
})

/** A box layout for one page; unknown boxes are dropped and missing ones added back. */
function layoutSchema<K extends string>(
  boxes: Record<K, string>,
  columns: number,
  defaults: { columns: K[][]; hidden: K[] },
  extra: (key: string) => boolean = () => false,
) {
  const known = (key: string) => key in boxes || extra(key)
  const key = z.string().max(30)
  // Room for every standard box plus the maximum of gadgets in one column
  const max = Object.keys(boxes).length + LIMITS.gadgets
  return z
    .object({ columns: z.array(z.array(key).max(max)).length(columns, 'Ongeldige indeling.'), hidden: z.array(key).max(max) })
    .transform((layout) => normalizeLayout(layout, defaults, known))
}

// Gadgets are boxes too, under "gadget:<id>"
export const profileLayoutSchema = layoutSchema<ProfileBox>(PROFILE_BOXES, LAYOUT_COLUMNS.profile, DEFAULT_PROFILE_LAYOUT, (k) =>
  GADGET_SLOT.test(k),
)
export const homeLayoutSchema = layoutSchema<HomeBox>(HOME_BOXES, LAYOUT_COLUMNS.home, DEFAULT_HOME_LAYOUT)

export const preferencesSchema = z
  .object({
    textSize: z.enum(['klein', 'normaal', 'groot', 'extra']),
    compact: z.boolean(),
    reduceMotion: z.boolean(),
    timeFormat: z.enum(['relatief', 'exact']),
    startPage: z.enum(['home', 'tijdlijn', 'profiel']),
    defaultVisibility: z.enum(['iedereen', 'vrienden']),
    sendShortcut: z.boolean(),
    profileFor: z.enum(['iedereen', 'vrienden']),
    friendRequestsFrom: z.enum(['iedereen', 'vriendenvanvrienden', 'niemand']),
    knuffelsFrom: z.enum(['iedereen', 'vrienden']),
    messagesFrom: z.enum(['iedereen', 'vrienden', 'niemand']),
    showAge: z.boolean(),
    anonymousVisits: z.boolean(),
    showFediverse: z.boolean(),
    fediverseInOverzicht: z.boolean(),
    fediverseFollowers: z.boolean(),
    searchEngines: z.boolean(),
    avatarPublic: z.boolean(),
    allowCalls: z.boolean(),
    notifyBrowser: z.boolean(),
    notifyMessages: z.boolean(),
    notifyMessenger: z.boolean(),
    notifyRequests: z.boolean(),
    notifyKnuffels: z.boolean(),
    notifyMentions: z.boolean(),
    notifyReactions: z.boolean(),
    notifyGames: z.boolean(),
    notifyAchievements: z.boolean(),
    notifyCalls: z.boolean(),
    notifyRadio: z.boolean(),
    notifyForum: z.boolean(),
    forumReplies: z.boolean(),
    tabCount: z.boolean(),
    tabIcon: z.boolean(),
    festive: z.enum(Object.keys(FESTIVE_MODES) as [FestiveMode]),
    festiveColors: z.boolean(),
    festiveParticles: z.boolean(),
    festiveFrames: z.boolean(),
    musicAutoplay: z.boolean(),
    profileCursors: z.boolean(),
    notificationSounds: z.boolean(),
    chatSounds: z.boolean(),
    festiveAmount: z.enum(Object.keys(FESTIVE_AMOUNTS) as [FestiveAmount]),
    aboutFirst: z.boolean(),
  })
  .partial()

export const themeSchema = z.string().refine(isThemeChoice, 'Onbekend kleurthema.')
export const skinSchema = z.string().refine((s) => s === 'eigen' || s in SKINS, 'Onbekend design.')

/** Everything a saved layout holds; each part is optional so old saves keep working. */
export const snapshotSchema = z.object({
  theme: themeSchema.nullable(),
  customTheme: customThemeSchema.nullable(),
  skin: skinSchema.nullable(),
  profileColors: profileColorsSchema.nullable(),
  profileLayout: profileLayoutSchema.nullable(),
  homeLayout: homeLayoutSchema.nullable(),
})
