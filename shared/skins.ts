import { BODY_FONTS, CUSTOM_SKIN_KEY, alpha, boxLookVars, headerVars, mix, profileBackground, type BodyFont, type BoxLook, type HeaderDesign, type ProfileColors, textOn, luminance } from './customization'

/** Profile skins ("je profiel pimpen"). Members pick one in their settings. */
export type Skin = BoxLook & {
  name: string
  background: string
  boxHeaderTop: string
  boxHeaderBottom: string
  boxBorder: string
  title: string
  link?: string
  /** The colour buttons, tabs and highlights are made from; defaults to the box border. */
  accent?: string
  /** The title bar with the name; none = the standard one. */
  header?: HeaderDesign | null
  /** Inside the boxes and the text on it; not set = white with dark text. */
  surface?: string
  text?: string
  /** Fonts for the text and the box titles; not set = the site's. */
  font?: BodyFont | null
  titleFont?: BodyFont | null
}

/**
 * Ready-made designs, written like an "eigen design": members can use one as
 * it is, or start their own design from it.
 */
export const PROFILE_PRESETS: Record<string, { name: string; colors: ProfileColors }> = {
  nacht: {
    name: 'Nachtblauw',
    colors: {
      background: '#0b1020', background2: '#dfe7ff', pattern: 'sterrenstof', box: '#5b6ee8', surface: '#161b2e', text: '#dfe5f3', title: '#ffffff', link: '#9fb4ff',
      header: { pattern: 'sterrenstof', color: '#1c2750', color2: '#ffffff', nameColor: '#ffffff', shadow: 'gloed', backdrop: false, font: 'standaard' },
    },
  },
  emo: {
    name: 'Emo Schaakbord',
    colors: {
      background: '#111111', background2: '#2a2a2a', pattern: 'schaakbord', box: '#e0217a', title: '#1a1a1a', link: '#c3126b',
      header: { pattern: 'schaakbord', color: '#111111', color2: '#ffffff', nameColor: '#ff4fa3', shadow: 'omlijning', backdrop: true, font: 'strak' },
    },
  },
  snoep: {
    name: 'Snoepwinkel',
    colors: {
      background: '#ffd6ea', background2: '#ffffff', pattern: 'strepen', box: '#ff7bb8', title: '#a3155f', link: '#d6247f',
      header: { pattern: 'stippen', color: '#fff0f7', color2: '#ffb3d6', nameColor: '#d6247f', shadow: 'zacht', backdrop: false, font: 'rond' },
    },
  },
  sterrennacht: {
    name: 'Sterrennacht',
    colors: {
      background: '#0c1a3d', background2: '#f5d76e', pattern: 'bp_star', box: '#3f5bb5', title: '#1b2a5c', link: '#2f4ca8', boxOpacity: 0.92,
      header: { pattern: 'verloop', color: '#1b2a5c', color2: '#6b3fa0', nameColor: '#ffffff', shadow: 'gloed', backdrop: false, font: 'sierlijk' },
    },
  },
  verliefd: {
    name: 'Verliefd',
    colors: {
      background: '#ffe3e8', background2: '#f24b6a', pattern: 'bp_heart', box: '#e8466a', title: '#8f1231', link: '#c81e45',
      header: { pattern: 'harten', color: '#ffffff', color2: '#ff9fb2', nameColor: '#c81e45', shadow: 'zacht', backdrop: true, font: 'sierlijk' },
    },
  },
  lavendel: {
    name: 'Lavendelveld',
    colors: {
      background: '#e9dcff', background2: '#a88be0', pattern: 'bloemen', box: '#9a7bd6', title: '#4b2c86', link: '#6a45b8',
      header: { pattern: 'verloop', color: '#f5efff', color2: '#cdb8f5', nameColor: '#4b2c86', shadow: 'geen', backdrop: false, font: 'sierlijk' },
    },
  },
  zonsondergang: {
    name: 'Zonsondergang',
    colors: {
      background: '#ffb35c', background2: '#8d3fa6', pattern: 'verloop', box: '#e07a3f', title: '#6e2a12', link: '#b8471e',
      header: { pattern: 'verloop', color: '#ff9d4d', color2: '#d9487a', nameColor: '#ffffff', shadow: 'sterk', backdrop: false, font: 'standaard' },
    },
  },
  regenboog: {
    name: 'Regenboogfeest',
    colors: {
      background: '#ffffff', background2: '#ffffff', pattern: 'regenboog', box: '#8b72d9', title: '#3c2a78', link: '#5b3fc4', boxOpacity: 0.94,
      header: { pattern: 'regenboog', color: '#ffffff', color2: '#ffffff', nameColor: '#ffffff', shadow: 'omlijning', backdrop: true, font: 'rond' },
    },
  },
  koffie: {
    name: 'Koffie verkeerd',
    colors: {
      background: '#d9bf9f', background2: '#b8946b', pattern: 'diamanten', box: '#8a5a36', title: '#4a2c16', link: '#7a4520',
      header: { pattern: 'tartan', color: '#f3e3cc', color2: '#8a5a36', nameColor: '#4a2c16', shadow: 'geen', backdrop: true, font: 'typemachine' },
    },
  },
  winter: {
    name: 'Winterwonderland',
    colors: {
      background: '#a9d8f5', background2: '#ffffff', pattern: 'sneeuwvlokken', box: '#7fb8dd', title: '#1d4f73', link: '#2a6fa3',
      header: { pattern: 'sneeuwvlokken', color: '#cfeaff', color2: '#ffffff', nameColor: '#1d4f73', shadow: 'zacht', backdrop: true, font: 'sierlijk' },
    },
  },
  arcade: {
    name: 'Retro Arcade',
    colors: {
      background: '#1b1b3a', background2: '#23d5c4', pattern: 'zigzag', box: '#23b5a8', title: '#12324a', link: '#0e8a7f',
      header: { pattern: 'schaakbord', color: '#111111', color2: '#f7d51d', nameColor: '#f7d51d', shadow: 'sterk', backdrop: true, font: 'typemachine' },
    },
  },
  tartan: {
    name: 'Schotse ruit',
    colors: {
      background: '#9e1b24', background2: '#1f2d52', pattern: 'tartan', box: '#8a2530', title: '#3d0d12', link: '#a51f2c',
      header: { pattern: 'tartan', color: '#1f2d52', color2: '#e5c14b', nameColor: '#ffffff', shadow: 'zacht', backdrop: true, font: 'sierlijk' },
    },
  },
  voetbal: {
    name: 'Voetbalveld',
    colors: {
      background: '#3f9b3a', background2: '#4fb048', pattern: 'strepen', box: '#2f8a2c', title: '#173f16', link: '#1f6e1c',
      header: { pattern: 'schaakbord', color: '#ffffff', color2: '#1a1a1a', nameColor: '#ffffff', shadow: 'omlijning', backdrop: true, font: 'strak' },
    },
  },
  zee: {
    name: 'Diepe zee',
    colors: {
      background: '#1a6fa8', background2: '#8fdcf7', pattern: 'zeegolven', box: '#1f8fc2', title: '#0b3e5c', link: '#12699b',
      header: { pattern: 'zeegolven', color: '#0f5a8a', color2: '#bff0ff', nameColor: '#ffffff', shadow: 'sterk', backdrop: true, font: 'rond' },
    },
  },
  // With BuddyPoke's panel backgrounds (the bp_ patterns)
  punk: {
    name: 'Skatepunk',
    colors: {
      background: '#141414', background2: '#e6e6e6', pattern: 'bp_skull', box: '#c8102e', surface: '#1b1b1d', text: '#e8e8e8', title: '#ffffff', link: '#ff6b7d',
      header: { pattern: 'bp_skull', color: '#c8102e', color2: '#1a1a1a', nameColor: '#ffffff', shadow: 'omlijning', backdrop: true, font: 'strak' },
    },
  },
  leger: {
    name: 'Camouflage',
    colors: {
      background: '#4b5a33', background2: '#6f7f46', pattern: 'bp_camo', box: '#5a6e33', title: '#2b3a17', link: '#46631c',
      header: { pattern: 'bp_camo', color: '#3a4726', color2: '#8a9a5b', nameColor: '#f3ebcc', shadow: 'sterk', backdrop: true, font: 'strak' },
    },
  },
  picknick: {
    name: 'Picknick',
    colors: {
      background: '#fff8f2', background2: '#d63a3a', pattern: 'bp_plaid', box: '#d64545', title: '#7a1414', link: '#b51f1f', boxOpacity: 0.95,
      header: { pattern: 'stippen', color: '#ffffff', color2: '#f7b3b3', nameColor: '#b51f1f', shadow: 'zacht', backdrop: false, font: 'rond' },
    },
  },
  zomerjurk: {
    name: 'Zomerjurkje',
    colors: {
      background: '#fff3df', background2: '#f28c5a', pattern: 'bp_flower2', box: '#e8894a', title: '#7a3a12', link: '#c05a1f',
      header: { pattern: 'bp_flower2', color: '#fff8ec', color2: '#f7a877', nameColor: '#a3470f', shadow: 'zacht', backdrop: true, font: 'sierlijk' },
    },
  },
  bloesem: {
    name: 'Kersenbloesem',
    colors: {
      background: '#fde8ef', background2: '#e87fae', pattern: 'bp_flower1', box: '#e07aa6', title: '#8f1e52', link: '#c2306e',
      header: { pattern: 'verloop', color: '#fff4f8', color2: '#f7c2d8', nameColor: '#b0275f', shadow: 'geen', backdrop: false, font: 'sierlijk' },
    },
  },
  munt: {
    name: 'Muntsnoepje',
    colors: {
      background: '#effaf7', background2: '#7fd3c7', pattern: 'bp_diag1', box: '#4fb8a8', title: '#1d5c54', link: '#1f8a7c',
      header: { pattern: 'bp_diag1', color: '#ffffff', color2: '#9fe0d6', nameColor: '#1d5c54', shadow: 'zacht', backdrop: true, font: 'rond' },
    },
  },
  rock: {
    name: 'Rock & roll',
    colors: {
      background: '#1e1e1e', background2: '#f2c230', pattern: 'bp_diag2', box: '#e0a800', title: '#3a2a00', link: '#9a6f00',
      header: { pattern: 'bp_diag2', color: '#1a1a1a', color2: '#f2c230', nameColor: '#f2c230', shadow: 'omlijning', backdrop: true, font: 'strak' },
    },
  },
  cadeau: {
    name: 'Cadeautje',
    colors: {
      background: '#e8f3ff', background2: '#4b8fe0', pattern: 'bp_ribbon', box: '#4b8fe0', title: '#123a6b', link: '#1f5fb3',
      header: { pattern: 'bp_ribbon', color: '#f5faff', color2: '#8fbcf0', nameColor: '#123a6b', shadow: 'zacht', backdrop: true, font: 'rond' },
    },
  },
  kunst: {
    name: 'Verfspetters',
    colors: {
      background: '#ffffff', background2: '#8b72d9', pattern: 'bp_splat', box: '#8b72d9', title: '#3c2a78', link: '#5b3fc4', boxOpacity: 0.95,
      header: { pattern: 'bp_splat', color: '#ffffff', color2: '#f26b9a', nameColor: '#3c2a78', shadow: 'zacht', backdrop: true, font: 'rond' },
    },
  },
  podium: {
    name: 'Op het podium',
    colors: {
      background: '#ffe39a', background2: '#1b1030', pattern: 'bp_spot', box: '#8a5cd6', surface: '#1e1729', text: '#ece6f5', title: '#ffe08a', link: '#ffcf5a',
      header: { pattern: 'verloop', color: '#2a1846', color2: '#120a22', nameColor: '#ffe08a', shadow: 'gloed', backdrop: false, font: 'sierlijk' },
    },
  },
  disco: {
    name: 'Discokoorts',
    colors: {
      background: '#1a0630', background2: '#ff5fd2', pattern: 'discobal', box: '#ff3fbf', surface: '#1f0b33', text: '#f3e6ff', title: '#ffd6f5', link: '#6fe7ff', boxOpacity: 0.9, boxBlur: 4,
      header: { pattern: 'discobal', color: '#2a0a4a', color2: '#6fe7ff', nameColor: '#ffffff', shadow: 'gloed', backdrop: true, font: 'strak' },
    },
  },
  wolken: {
    name: 'Hoofd in de wolken',
    colors: {
      background: '#7cc4f2', background2: '#ffffff', pattern: 'wolken', box: '#6fb6e6', title: '#1d4f73', link: '#2a6fa3', boxOpacity: 0.9, boxBlur: 3,
      header: { pattern: 'wolken', color: '#9ad3f7', color2: '#ffffff', nameColor: '#ffffff', shadow: 'sterk', backdrop: false, font: 'rond' },
    },
  },
  terrazzo: {
    name: 'Terrazzo',
    colors: {
      background: '#f5efe6', background2: '#e07a5f', pattern: 'terrazzo', box: '#c9826b', title: '#5a2d1e', link: '#b0492c',
      header: { pattern: 'terrazzo', color: '#faf6f0', color2: '#3d7a74', nameColor: '#5a2d1e', shadow: 'geen', backdrop: true, font: 'standaard' },
    },
  },
  memphis: {
    name: 'Memphis',
    colors: {
      background: '#fff3cf', background2: '#2b59c3', pattern: 'memphis', box: '#2b59c3', title: '#152d66', link: '#e8467a',
      header: { pattern: 'memphis', color: '#ffd9e8', color2: '#2b59c3', nameColor: '#152d66', shadow: 'omlijning', backdrop: true, font: 'strak' },
    },
  },
  bijenkorf: {
    name: 'Bijenkorf',
    colors: {
      background: '#ffd24a', background2: '#d99500', pattern: 'honingraat', box: '#d99500', title: '#5a3a00', link: '#8a5400',
      header: { pattern: 'honingraat', color: '#2b2118', color2: '#ffd24a', nameColor: '#ffd24a', shadow: 'sterk', backdrop: true, font: 'rond' },
    },
  },
  feestje: {
    name: 'Feestje!',
    colors: {
      background: '#ffffff', background2: '#f26b9a', pattern: 'confetti', box: '#f26b9a', title: '#8f1e52', link: '#c2306e',
      header: { pattern: 'confetti', color: '#fff0f6', color2: '#8b72d9', nameColor: '#8f1e52', shadow: 'zacht', backdrop: true, font: 'rond' },
    },
  },
}

export const SKINS: Record<string, Skin> = {
  roze: {
    name: 'Pink Glitter',
    background:
      'radial-gradient(circle at 20% 20%, #ffd1ec 0 6px, transparent 7px) 0 0 / 60px 60px, radial-gradient(circle at 70% 60%, #ffe8f5 0 4px, transparent 5px) 0 0 / 45px 45px, linear-gradient(#ff8cc6, #f25ea8)',
    boxHeaderTop: '#fff0f8',
    boxHeaderBottom: '#ffc7e3',
    boxBorder: '#f29ac8',
    title: '#9c1c5c',
  },
  oranje: {
    name: 'Oranje Boven',
    background: 'repeating-linear-gradient(45deg, #ff8b00 0 24px, #ff9d26 24px 48px)',
    boxHeaderTop: '#fff7ec',
    boxHeaderBottom: '#ffd9a8',
    boxBorder: '#f0b56a',
    title: '#8a4200',
  },
  metal: {
    name: 'Dark Symphony',
    background: 'radial-gradient(ellipse at top, #4a4a5e 0%, #16161f 70%)',
    boxHeaderTop: '#f3f3f6',
    boxHeaderBottom: '#c9c9d6',
    boxBorder: '#8d8da3',
    title: '#2b2b3d',
  },
  zee: {
    name: 'Zomer aan Zee',
    background: 'linear-gradient(to bottom, #7fd3f7 0%, #4fb3e8 55%, #f3dfa2 55%, #e9cf85 100%)',
    boxHeaderTop: '#f2fbff',
    boxHeaderBottom: '#c6ecfb',
    boxBorder: '#86c9e6',
    title: '#115a7c',
  },
  groen: {
    name: 'Lentegroen',
    background:
      'radial-gradient(circle at 30% 30%, #c8f0a0 0 10px, transparent 11px) 0 0 / 70px 70px, linear-gradient(#8fd14f, #5da826)',
    boxHeaderTop: '#f6fdef',
    boxHeaderBottom: '#d5f0b8',
    boxBorder: '#9fcf72',
    title: '#3b6a14',
  },
}

/** A member's own design as a skin. */
export function customSkin(colors: ProfileColors): Skin {
  // The box headers and borders are the box colour mixed into the inside of the boxes
  const surface = colors.surface ?? '#ffffff'
  return {
    name: 'Eigen design',
    background: profileBackground(colors),
    surface,
    text: colors.text ?? textOn(surface),
    boxHeaderTop: mix(colors.box, surface, 0.12),
    boxHeaderBottom: mix(colors.box, surface, 0.45),
    boxBorder: mix(colors.box, surface, 0.75),
    accent: colors.box,
    title: colors.title,
    link: colors.link,
    boxOpacity: colors.boxOpacity,
    boxBlur: colors.boxBlur,
    boxGlow: colors.boxGlow,
    boxTexture: colors.boxTexture,
    boxTextureFade: colors.boxTextureFade,
    boxHeaderTexture: colors.boxHeaderTexture,
    boxHeaderFade: colors.boxHeaderFade,
    header: colors.header ?? null,
    font: colors.font,
    titleFont: colors.titleFont,
  }
}

// The ready-made designs are skins too
for (const [key, preset] of Object.entries(PROFILE_PRESETS)) SKINS[key] = { ...customSkin(preset.colors), name: preset.name }

const NIGHT = '#14181c'
const isLight = (c: string, above = 0.3) => luminance(c) > above

/**
 * A light design made dark, for viewers on a dark site theme: boxes become a
 * dark tint of the box colour with light text, titles and links get lighter,
 * and the background and title bar are dimmed. The hues stay the owner's.
 * Designs that are already dark (a dark box inside) come back unchanged.
 */
export function darkDesign(colors: ProfileColors): ProfileColors {
  if (!isLight(colors.surface ?? '#ffffff')) return colors
  const dim = (c: string, keep = 0.42) => (isLight(c, 0.12) ? mix(c, NIGHT, keep) : c)
  const brighten = (c: string, keep = 0.45) => (isLight(c, 0.35) ? c : mix(c, '#ffffff', keep))
  const header = colors.header
  return {
    ...colors,
    background: dim(colors.background),
    background2: dim(colors.background2),
    surface: mix(colors.box, NIGHT, 0.14),
    text: mix(colors.box, '#e6ebef', 0.08),
    box: isLight(colors.box, 0.55) ? mix(colors.box, NIGHT, 0.6) : colors.box,
    title: brighten(colors.title, 0.4),
    link: brighten(colors.link),
    header: header && {
      ...header,
      // Dark enough that the (lightened) name stands out on it
      color: dim(header.color, 0.28),
      color2: dim(header.color2, 0.28),
      nameColor: isLight(header.nameColor, 0.5) ? header.nameColor : mix(header.nameColor, '#ffffff', 0.25),
    },
  }
}

/**
 * A profile's or Kudde's own design for this viewer: on a dark site theme a
 * light design is shown dark (with its photo dimmed too); on a light theme
 * it's shown as made, dark designs included.
 */
export function designSkin(design: ProfileColors, siteDark: boolean): Skin {
  const colors = siteDark ? darkDesign(design) : design
  const skin = customSkin(colors)
  if (colors !== design && design.image) skin.background = `linear-gradient(rgba(10, 12, 16, 0.5), rgba(10, 12, 16, 0.5)), ${skin.background}`
  return skin
}

/** One of the older built-in skins (white boxes, a CSS background) made dark. */
function darkBuiltInSkin(skin: Skin): Skin {
  const border = skin.boxBorder
  return {
    ...skin,
    background: `linear-gradient(rgba(10, 12, 16, 0.55), rgba(10, 12, 16, 0.55)), ${skin.background}`,
    surface: mix(border, NIGHT, 0.14),
    text: mix(border, '#e6ebef', 0.08),
    boxHeaderTop: mix(border, NIGHT, 0.34),
    boxHeaderBottom: mix(border, NIGHT, 0.22),
    boxBorder: mix(border, NIGHT, 0.55),
    accent: skin.accent ?? border,
    title: isLight(skin.title, 0.35) ? skin.title : mix(skin.title, '#ffffff', 0.4),
    link: skin.link && !isLight(skin.link, 0.35) ? mix(skin.link, '#ffffff', 0.45) : skin.link,
  }
}

/**
 * The skin to show for a member to this viewer: like resolveSkin, but on a
 * dark site theme light designs (their own, a ready-made one or a built-in
 * skin) are shown dark. Dark ones stay as they are.
 */
export function resolveSkinFor(key: string | null | undefined, colors: ProfileColors | null | undefined, siteDark: boolean): Skin | undefined {
  if (!key) return undefined
  if (key === CUSTOM_SKIN_KEY) return colors ? designSkin(colors, siteDark) : undefined
  const preset = PROFILE_PRESETS[key]
  if (preset) return { ...designSkin(preset.colors, siteDark), name: preset.name }
  const skin = SKINS[key]
  if (!skin || !siteDark || !isLight(skin.surface ?? '#ffffff')) return skin
  return darkBuiltInSkin(skin)
}

/** The skin to show for a member, built-in or their own; undefined = standard. */
export function resolveSkin(key: string | null | undefined, colors: ProfileColors | null | undefined): Skin | undefined {
  if (!key) return undefined
  if (key === CUSTOM_SKIN_KEY) return colors ? customSkin(colors) : undefined
  return SKINS[key]
}

/**
 * The design tokens a skin sets on a profile. A skin brings its own boxes
 * (white, or the member's own colour, light or dark) and text to match, so it
 * stays readable whatever site theme the viewer uses. Derived tokens are
 * repeated because custom properties resolve where they're declared (on
 * :root), not where they're used.
 */
export function skinVars(skin: Skin): Record<string, string> {
  const box = skin.boxBorder
  const surface = skin.surface ?? '#ffffff'
  const text = skin.text ?? textOn(surface)
  const dark = luminance(surface) <= 0.3
  // Buttons, the current tab, pills and focus rings follow the design, not the site theme
  const accent = skin.accent ?? skin.boxBorder
  const brand = mix(accent, '#000000', 0.85)
  const link = skin.link ?? mix(skin.title, accent, 0.85)
  return {
    colorScheme: dark ? 'dark' : 'light',
    '--surface': surface,
    '--text': text,
    '--text-muted': mix(text, surface, 0.55),
    '--text-date': mix(text, surface, 0.55),
    '--title': skin.title,
    '--title-soft': mix(skin.title, surface, 0.75),
    '--tint-1': mix(box, surface, 0.1),
    '--tint-2': mix(box, surface, 0.18),
    '--tint-3': mix(box, surface, 0.28),
    '--alt-bg': mix(box, surface, 0.18),
    '--box-hdr-top': skin.boxHeaderTop,
    '--box-hdr-bottom': skin.boxHeaderBottom,
    '--box-border': skin.boxBorder,
    '--box-hdr-border': skin.boxBorder,
    '--box-sctn-border': mix(box, surface, 0.35),
    '--row-border': mix(box, surface, 0.35),
    '--btn-border': mix(text, surface, 0.3),
    '--btn-border-dark': mix(text, surface, 0.42),
    '--profile-bg': skin.background,
    '--link': link,
    '--accent': link,
    '--brand': brand,
    '--brand-light': mix(accent, '#ffffff', 0.7),
    '--brand-dark': mix(accent, '#000000', 0.62),
    '--brand-darker': mix(accent, '#000000', 0.48),
    '--cta-top': mix(accent, '#ffffff', 0.8),
    '--cta-bottom': mix(accent, '#000000', 0.62),
    '--cta-border': mix(accent, '#000000', 0.48),
    '--cta-shadow': mix(accent, '#000000', 0.35),
    '--focus-ring': alpha(accent, 0.35),
    // The site theme's see-through boxes, glow and textures don't carry over; the skin's own do
    '--box-bg': 'initial',
    '--box-filter': 'initial',
    '--box-glow': 'initial',
    '--box-tex': 'initial',
    '--box-hdr-image': 'initial',
    ...(skin.font && BODY_FONTS[skin.font]?.css ? { '--font-body': BODY_FONTS[skin.font].css! } : {}),
    ...(skin.titleFont && BODY_FONTS[skin.titleFont]?.css ? { '--font-title': BODY_FONTS[skin.titleFont].css! } : {}),
    ...boxLookVars(skin, surface, skin.boxHeaderTop, skin.boxHeaderBottom),
    ...(skin.header ? headerVars(skin.header, surface) : {}),
  }
}
