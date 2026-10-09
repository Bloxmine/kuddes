/**
 * Everything a member can customise beyond the built-in themes and skins:
 * their own site theme, their own profile colours, how the boxes on their
 * profile and Home are arranged, and small preferences. Shared by the server
 * (validation) and the app (rendering).
 */
import type { BackgroundEffect } from './backgroundEffects'
import { TEXTURE_PATTERNS, isTexturePattern, textureOf, textureUrl, type TexturePattern } from './textures'
import type { FestiveAmount, FestiveMode } from './festive'

export const HEX = /^#[0-9a-f]{6}$/i

// ---------------------------------------------------------------- colours

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`

/** `amount` of `a` mixed into `b` (like CSS color-mix). */
export function mix(a: string, b: string, amount: number): string {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)))
}

/** Readable text on a background: dark on light, light on dark. */
export function textOn(background: string): string {
  return luminance(background) > 0.3 ? '#1b2733' : '#e6ebef'
}

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** `hex` with an alpha channel, as rgba(). */
export function alpha(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 100) / 100})`
}

// ------------------------------------------------------ background images

/** How a background image covers the page, like Hyves' "achtergrond" options. */
export const BACKGROUND_MODES = {
  tegels: 'Tegels',
  vullen: 'Vullen',
  passend: 'Passend',
  uitrekken: 'Uitrekken',
  midden: 'In het midden',
} as const

export type BackgroundMode = keyof typeof BACKGROUND_MODES

export type BackgroundImage = {
  /** An upload of the member's own, under /uploads/backgrounds/. */
  url: string
  mode: BackgroundMode
  /** Stays in place while the page scrolls. */
  fixed: boolean
}

/** Only images uploaded as backgrounds (their file name starts with the member's id). */
export const BACKGROUND_URL = /^\/uploads\/backgrounds\/(\d+)-[0-9a-f]{32}\.webp$/

/** One CSS background layer for an image. */
export function imageLayer({ url, mode, fixed }: BackgroundImage): string {
  const place = {
    tegels: 'left top / auto repeat',
    vullen: 'center / cover no-repeat',
    passend: 'center / contain no-repeat',
    uitrekken: 'center / 100% 100% no-repeat',
    midden: 'center top / auto no-repeat',
  }[mode]
  return `url("${url}") ${place}${fixed ? ' fixed' : ''}`
}

/** See-through and blurred boxes, for when there's a background behind them. */
export type BoxLook = {
  /** 0.2 (very see-through) to 1 (solid). */
  boxOpacity?: number
  /** Blur of what's behind a box, in px (0 to 20). */
  boxBlur?: number
  /** A glow around the boxes (and the title bar). */
  boxGlow?: BoxGlow | null
  /** A texture inside the boxes, with the box colour over it (`boxTextureFade`: 0 = only texture, 0.95 = hardly any) so text stays readable. */
  boxTexture?: TexturePattern | null
  boxTextureFade?: number
  /** A texture in the box headers, with their colours over it. */
  boxHeaderTexture?: TexturePattern | null
  boxHeaderFade?: number
}

/** A glow in a colour; `size` in px (2 to 30). */
export type BoxGlow = { color: string; size: number }
export const BOX_GLOW_LIMITS = { min: 2, max: 30 }

/** Over a texture: the design's own colours as a see-through layer. */
export const TEXTURE_OVERLAYS = {
  geen: 'Geen',
  kleur: 'Kleur',
  verloop: 'Verloop',
  glans: 'Glans (zoals de gewone balk)',
} as const
export type TextureOverlayStyle = keyof typeof TEXTURE_OVERLAYS
/** `opacity` 0.05 (hardly) to 0.95 (almost covering the texture). */
export type TextureOverlay = { style: TextureOverlayStyle; opacity: number }

/** The overlay as a CSS layer in colours a and b, or null. */
export function overlayLayer(overlay: TextureOverlay | null | undefined, a: string, b: string): string | null {
  if (!overlay || overlay.style === 'geen') return null
  const o = Math.min(0.95, Math.max(0.05, overlay.opacity))
  if (overlay.style === 'kleur') return `linear-gradient(${alpha(a, o)}, ${alpha(a, o)})`
  if (overlay.style === 'verloop') return `linear-gradient(${alpha(a, o)}, ${alpha(b, o)})`
  // The glossy shine of the standard bars, over the colour
  return `linear-gradient(to bottom, rgba(255, 255, 255, ${(0.75 * o).toFixed(3)}) 0%, rgba(255, 255, 255, ${(0.3 * o).toFixed(3)}) 49%, rgba(0, 0, 0, ${(0.06 * o).toFixed(3)}) 51%, ${alpha(b, o * 0.5)} 100%)`
}

/** A texture as one CSS layer (its own size, smaller with `scale`). */
export function textureLayer(pattern: TexturePattern, scale = 1): string | null {
  const tx = textureOf(pattern)
  return tx ? `url("${textureUrl(tx.category, tx.key)}") 0 0 / ${Math.round(256 * scale)}px ${Math.round(256 * scale)}px repeat` : null
}

/** The box tokens for a surface and header colours with opacity and blur. */
export function boxLookVars(look: BoxLook, surface: string, hdrTop: string, hdrBottom: string): Record<string, string> {
  const opacity = look.boxOpacity ?? 1
  const blur = look.boxBlur ?? 0
  const vars: Record<string, string> = {}
  if (opacity < 1) {
    vars['--box-bg'] = alpha(surface, opacity)
    vars['--box-hdr-top'] = alpha(hdrTop, Math.min(1, opacity + 0.1))
    vars['--box-hdr-bottom'] = alpha(hdrBottom, Math.min(1, opacity + 0.1))
  }
  if (blur > 0) vars['--box-filter'] = `blur(${blur}px)`
  if (look.boxGlow) {
    const size = Math.min(BOX_GLOW_LIMITS.max, Math.max(BOX_GLOW_LIMITS.min, look.boxGlow.size))
    vars['--box-glow'] = `0 0 ${size}px ${alpha(look.boxGlow.color, 0.85)}, 0 0 ${size * 2}px ${alpha(look.boxGlow.color, 0.35)}`
  }
  // Textures: the box's own colour over them, so the text on it stays readable
  const boxTex = look.boxTexture && textureLayer(look.boxTexture)
  if (boxTex) {
    const fade = alpha(surface, Math.min(0.95, Math.max(0, look.boxTextureFade ?? 0.7)) * opacity)
    vars['--box-tex'] = `linear-gradient(${fade}, ${fade}), ${boxTex}`
  }
  const hdrTex = look.boxHeaderTexture && textureLayer(look.boxHeaderTexture, 0.6)
  if (hdrTex) {
    const f = Math.min(0.95, Math.max(0, look.boxHeaderFade ?? 0.4))
    vars['--box-hdr-image'] = `linear-gradient(to bottom, ${alpha(hdrTop, f)}, ${alpha(hdrBottom, f)}), ${hdrTex}`
  }
  return vars
}

// ------------------------------------------------------------ custom theme

/** "Eigen thema": the member's own colours for the whole site. */
export type CustomTheme = BoxLook & {
  /** Header and box colour. */
  brand: string
  link: string
  /** The big glossy buttons. */
  button: string
  /** Page background. */
  background: string
  dark: boolean
  /** Optional image over the background colour. */
  image?: BackgroundImage | null
  /** A pattern on the page background, in `patternColor` over the background colour. */
  pattern?: ProfilePattern
  patternColor?: string
  /** A pattern in the top bar, in `barPatternColor` over the main colour. */
  barPattern?: ProfilePattern
  barPatternColor?: string
  /** Over a texture as page background or in the top bar: the colours, see-through. */
  overlay?: TextureOverlay | null
  barOverlay?: TextureOverlay | null
  /** Something that moves in the background: stars, snow… (shared/backgroundEffects.ts) */
  effect?: BackgroundEffect | null
}

export const CUSTOM_THEME_KEY = 'eigen'

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  brand: '#e0679a',
  link: '#b23a6f',
  button: '#d9508a',
  background: '#fff7fb',
  dark: false,
}

/**
 * The CSS custom properties for a custom theme. The same tokens as
 * src/styles/themes.css; index.html applies the stored result before paint.
 */
export function customThemeVars(t: CustomTheme): Record<string, string> {
  const vars: Record<string, string> = {
    '--brand': t.brand,
    '--brand-light': mix(t.brand, '#ffffff', 0.6),
    '--brand-dark': mix(t.button, '#000000', 0.78),
    '--brand-darker': mix(t.button, '#000000', 0.62),
    '--link': t.link,
    '--cta-top': mix(t.button, '#ffffff', 0.85),
    '--cta-bottom': t.button,
    '--page-bg': t.background,
  }
  if (t.dark) {
    const surface = mix('#ffffff', t.background, 0.06)
    Object.assign(vars, {
      '--text': '#d8e0dd',
      '--title': '#eef3f1',
      '--surface': surface,
      '--tint-1': mix(t.brand, surface, 0.06),
      '--tint-2': mix(t.brand, surface, 0.1),
      '--tint-3': mix(t.brand, surface, 0.16),
      '--box-hdr-top': mix(t.brand, surface, 0.14),
      '--box-hdr-bottom': mix(t.brand, surface, 0.06),
      '--box-border': mix(t.brand, surface, 0.25),
      '--box-hdr-border': mix(t.brand, surface, 0.3),
      '--box-sctn-border': mix(t.brand, surface, 0.18),
      'color-scheme': 'dark',
    })
  } else {
    Object.assign(vars, {
      '--text': mix(t.brand, '#1e1e1e', 0.12),
      '--title': mix(t.brand, '#000000', 0.35),
    })
  }
  // The page background: the image over the pattern (each optional)
  const layers = [t.image ? imageLayer(t.image) : null, t.pattern && t.pattern !== 'effen' ? asLayers(patternCss(t.pattern, t.background, t.patternColor ?? mix(t.brand, t.background, 0.3), 1, t.overlay)) : null].filter(Boolean)
  if (layers.length) vars['--page-image'] = layers.join(', ')
  // The top bar: the pattern (smaller, like a title bar) under the glossy shine (Header.css)
  if (t.barPattern && t.barPattern !== 'effen') vars['--bar-image'] = asLayers(patternCss(t.barPattern, t.brand, t.barPatternColor ?? mix(t.brand, '#ffffff', 0.55), 0.6, t.barOverlay))
  const surface = vars['--surface'] ?? '#ffffff'
  Object.assign(
    vars,
    boxLookVars(t, surface, vars['--box-hdr-top'] ?? mix(t.brand, surface, 0.06), vars['--box-hdr-bottom'] ?? mix(t.brand, surface, 0.24)),
  )
  return vars
}

// ---------------------------------------------------------------- patterns

export const PROFILE_PATTERNS = {
  effen: 'Effen',
  verloop: 'Verloop',
  stippen: 'Stippen',
  strepen: 'Strepen',
  ruiten: 'Grote ruiten',
  schaakbord: 'Schaakbord',
  diamanten: 'Diamanten',
  zigzag: 'Zigzag',
  golven: 'Golven',
  tartan: 'Schotse ruit',
  harten: 'Hartjes',
  sterretjes: 'Sterretjes',
  bloemen: 'Bloemen',
  sterren: 'Glitter',
  regenboog: 'Regenboog',
  sneeuwvlokken: 'Sneeuwvlokken',
  sterrenstof: 'Sterrenstof',
  wolken: 'Wolken',
  zeegolven: 'Zeegolfjes',
  discobal: 'Discobal',
  terrazzo: 'Terrazzo',
  memphis: 'Memphis',
  honingraat: 'Honingraat',
  confetti: 'Confetti',
  // From BuddyPoke's panel backgrounds (tinted tiles, server/routes/patterns.ts)
  bp_skull: 'Doodskopjes',
  bp_flower2: 'Bloemetjes',
  bp_flower1: 'Bloesem',
  bp_heart: 'Hartenregen',
  bp_star: 'Sterrenregen',
  bp_camo: 'Camouflage',
  bp_plaid: 'Picknickruit',
  bp_diag1: 'Brede strepen',
  bp_diag2: 'Smalle strepen',
  bp_ribbon: 'Linten',
  bp_splat: 'Spetters',
  bp_spot: 'Spotlight',
} as const

/** A pattern, or one of the photo textures (shared/textures.ts). */
export type ProfilePattern = keyof typeof PROFILE_PATTERNS | TexturePattern

/** Every pattern there is, textures included: for validation. */
export const ALL_PATTERNS = [...(Object.keys(PROFILE_PATTERNS) as (keyof typeof PROFILE_PATTERNS)[]), ...TEXTURE_PATTERNS] as [ProfilePattern, ...ProfilePattern[]]
const PATTERN_SET = new Set<string>(ALL_PATTERNS)
export const isProfilePattern = (v: unknown): v is ProfilePattern => typeof v === 'string' && PATTERN_SET.has(v)

/** The BuddyPoke tiles: file name and size (in px at full scale). */
export const BP_PATTERNS = {
  skull: [413, 312],
  flower2: [386, 320],
  flower1: [409, 289],
  heart: [358, 280],
  star: [334, 237],
  camo: [539, 270],
  plaid: [531, 425],
  diag1: [584, 292],
  diag2: [482, 287],
  ribbon: [530, 356],
  splat: [650, 688],
  spot: [346, 260],
} as const

export type BpPattern = keyof typeof BP_PATTERNS

/** A small SVG as a repeating background tile (the CSP allows data: images). */
const svgTile = (body: string, size: number, a: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'>${body}</svg>`)}") 0 0 / ${size}px ${size}px, ${a}`

const HEART = "<path d='M12 20s-6.5-4.2-8.7-8.2A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.7 4.6C18.5 15.8 12 20 12 20z'"
const STAR = "<path d='M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z'"
const RAINBOW = '#f26b6b, #f7a33b, #f5e04f, #5fc39a, #4ba3e0, #8b72d9'

/** A tile of any size from an SVG body with its own viewBox, over `base`. */
const svgPattern = (body: string, w: number, h: number, sw: number, sh: number, base: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}") 0 0 / ${sw}px ${sh}px, ${base}`

/** A snowflake: three bars through the middle with little branches. */
function flake(x: number, y: number, r: number, color: string) {
  const w = Math.max(0.8, r * 0.16)
  let d = ''
  for (const a of [0, 60, 120]) {
    const rad = (a * Math.PI) / 180
    const [c, sn] = [Math.cos(rad), Math.sin(rad)]
    d += `M${x - c * r} ${y - sn * r}L${x + c * r} ${y + sn * r}`
    // Two small branches near both ends
    for (const end of [1, -1]) {
      const bx = x + end * c * r * 0.55
      const by = y + end * sn * r * 0.55
      for (const turn of [0.7, -0.7]) {
        const t = rad + (end === 1 ? 0 : Math.PI) + turn
        d += `M${bx} ${by}L${bx + Math.cos(t) * r * 0.35} ${by + Math.sin(t) * r * 0.35}`
      }
    }
  }
  return `<path d='${d}' stroke='${color}' stroke-width='${w}' stroke-linecap='round' fill='none'/>`
}

/** A small four-pointed twinkle. */
const twinkle = (x: number, y: number, s: number, color: string, opacity = 1) =>
  `<path d='M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z' fill='${color}' opacity='${opacity}'/>`

/** A soft cloud: puffs on a flat bottom. */
const cloud = (x: number, y: number, s: number, color: string) =>
  `<g fill='${color}'><circle cx='${x}' cy='${y}' r='${14 * s}'/><circle cx='${x + 18 * s}' cy='${y - 9 * s}' r='${19 * s}'/><circle cx='${x + 42 * s}' cy='${y - 3 * s}' r='${16 * s}'/><circle cx='${x + 58 * s}' cy='${y + 4 * s}' r='${11 * s}'/><rect x='${x - 12 * s}' y='${y}' width='${80 * s}' height='${15 * s}' rx='${7.5 * s}'/></g>`

/** Seigaiha, the Japanese wave pattern: overlapping fans of rings. */
function seigaiha(a: string, b: string, w: number) {
  const small = `${a} 24%, ${b} 24% 28%, ${a} 28% 36%, ${b} 36% 40%, transparent 40%`
  const big = `${b} 10%, ${a} 10% 23%, ${b} 23% 30%, ${a} 30% 43%, ${b} 43% 50%, ${a} 50% 63%, ${b} 63% 71%, transparent 71%`
  const size = `${w}px ${w / 2}px`
  return [
    `radial-gradient(circle at 100% 150%, ${small}) 0 0 / ${size}`,
    `radial-gradient(circle at 0 150%, ${small}) 0 0 / ${size}`,
    `radial-gradient(circle at 50% 100%, ${big}) 0 0 / ${size}`,
    `radial-gradient(circle at 100% 50%, ${big}) 0 0 / ${size}`,
    `radial-gradient(circle at 0 50%, ${big}) 0 0 / ${size}`,
    a,
  ].join(', ')
}

/**
 * A pattern as layers that can go in front of other backgrounds. patternCss
 * ends most patterns with a plain colour, which CSS only allows as the very
 * last layer; as a flat gradient it's allowed anywhere.
 */
export function asLayers(css: string): string {
  let depth = 0
  let cut = -1
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) cut = i
  }
  const last = css.slice(cut + 1).trim()
  if (!/^(#[0-9a-f]{3,8}|transparent|rgba?\([^)]*\))$/i.test(last)) return css
  return `${cut >= 0 ? `${css.slice(0, cut)}, ` : ''}linear-gradient(${last}, ${last})`
}

/**
 * The CSS background for a pattern in two colours. `scale` makes the tiles
 * smaller (the title bar uses 0.6) or bigger.
 */
export function patternCss(pattern: ProfilePattern, a: string, b: string, scale = 1, overlay?: TextureOverlay | null): string {
  const px = (n: number) => Math.max(4, Math.round(n * scale))
  // A photo texture: repeated at its own size (smaller in a title bar), optionally with the colours over it
  if (isTexturePattern(pattern)) {
    const tex = textureLayer(pattern, scale)
    if (!tex) return a
    const over = overlayLayer(overlay, a, b)
    return `${over ? `${over}, ` : ''}${tex}, ${a}`
  }
  if (pattern.startsWith('bp_')) {
    const name = pattern.slice(3) as BpPattern
    const [w, h] = BP_PATTERNS[name]
    // The spotlight is one glow in the middle; the rest repeat
    const place = name === 'spot' ? 'center / cover no-repeat' : `0 0 / ${px(w * 0.7)}px ${px(h * 0.7)}px repeat`
    return `url("/patterns/${name}.png?c=${b.slice(1).toLowerCase()}") ${place}, ${a}`
  }
  switch (pattern) {
    case 'effen':
      return a
    case 'verloop':
      return `linear-gradient(${a}, ${b})`
    case 'stippen':
      return `radial-gradient(circle, ${b} 0 ${px(5)}px, transparent ${px(5) + 1}px) 0 0 / ${px(36)}px ${px(36)}px, ${a}`
    case 'strepen':
      return `repeating-linear-gradient(45deg, ${a} 0 ${px(22)}px, ${b} ${px(22)}px ${px(44)}px)`
    case 'ruiten':
      return `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / ${px(48)}px ${px(48)}px`
    case 'schaakbord':
      return `conic-gradient(${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / ${px(20)}px ${px(20)}px`
    case 'diamanten':
      return `conic-gradient(from 45deg, ${a} 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0) 0 0 / ${px(34)}px ${px(34)}px`
    case 'zigzag': {
      const z = px(32)
      return `linear-gradient(135deg, ${b} 25%, transparent 25%) -${z / 2}px 0 / ${z}px ${z}px, linear-gradient(225deg, ${b} 25%, transparent 25%) -${z / 2}px 0 / ${z}px ${z}px, linear-gradient(315deg, ${b} 25%, transparent 25%) 0 0 / ${z}px ${z}px, linear-gradient(45deg, ${b} 25%, ${a} 25%) 0 0 / ${z}px ${z}px`
    }
    case 'golven': {
      const w = px(56)
      return `radial-gradient(circle at 50% 100%, transparent ${px(14)}px, ${b} ${px(15)}px ${px(20)}px, transparent ${px(21)}px) 0 0 / ${w}px ${px(28)}px, radial-gradient(circle at 50% 0, transparent ${px(14)}px, ${b} ${px(15)}px ${px(20)}px, transparent ${px(21)}px) ${w / 2}px ${px(28)}px / ${w}px ${px(28)}px, ${a}`
    }
    case 'tartan':
      return `repeating-linear-gradient(0deg, ${alpha(b, 0.45)} 0 ${px(8)}px, transparent ${px(8)}px ${px(26)}px), repeating-linear-gradient(90deg, ${alpha(b, 0.45)} 0 ${px(8)}px, transparent ${px(8)}px ${px(26)}px), repeating-linear-gradient(45deg, ${alpha(mix(b, '#ffffff', 0.5), 0.25)} 0 1px, transparent 1px 4px), ${a}`
    case 'harten':
      return svgTile(`${HEART} fill='${b}' transform='rotate(-12 12 12) scale(.62) translate(7 7)'/>`, px(38), a)
    case 'sterretjes':
      return svgTile(`${STAR} fill='${b}' transform='scale(.55) translate(10 10)'/>`, px(34), a)
    case 'bloemen':
      return svgTile(
        `<g transform='translate(12 12) scale(.5)' fill='${b}'>${[0, 72, 144, 216, 288].map((r) => `<ellipse rx='4' ry='7' cy='-7' transform='rotate(${r})'/>`).join('')}</g><circle cx='12' cy='12' r='2.2' fill='${mix(b, '#ffffff', 0.55)}'/>`,
        px(40),
        a,
      )
    case 'sterren':
      return `radial-gradient(circle at 20% 20%, ${mix(b, '#ffffff', 0.4)} 0 ${px(3)}px, transparent ${px(3) + 1}px) 0 0 / ${px(40)}px ${px(40)}px, radial-gradient(circle at 70% 60%, ${mix(b, '#ffffff', 0.7)} 0 ${px(2)}px, transparent ${px(2) + 1}px) 0 0 / ${px(28)}px ${px(28)}px, linear-gradient(${a}, ${b})`
    case 'regenboog':
      return `linear-gradient(90deg, ${RAINBOW})`
    case 'sneeuwvlokken':
      return svgPattern(
        flake(20, 20, 10, b) + flake(62, 50, 7, b) + flake(34, 68, 4.5, alpha(b, 0.75)) + flake(70, 14, 4, alpha(b, 0.8)) + flake(8, 54, 3.5, alpha(b, 0.7)) + `<circle cx='48' cy='30' r='1.3' fill='${b}'/><circle cx='14' cy='78' r='1' fill='${b}'/>`,
        80, 80, px(80), px(80), `linear-gradient(${a}, ${mix(a, '#ffffff', 0.75)})`,
      )
    case 'sterrenstof': {
      // Tiny dots, a few brighter, and little twinkles in between
      const dots = [[6, 9, 0.9], [22, 30, 0.7], [41, 12, 1.2], [63, 25, 0.8], [80, 6, 0.7], [14, 52, 1], [35, 44, 0.6], [55, 58, 0.9], [74, 47, 1.1], [8, 79, 0.7], [29, 70, 1], [48, 84, 0.8], [67, 76, 0.6], [86, 66, 0.9], [50, 34, 0.5], [84, 88, 0.6]]
      return svgPattern(
        dots.map(([x, y, r], i) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${b}' opacity='${i % 3 ? 0.65 : 1}'/>`).join('') + twinkle(28, 18, 3.2, b) + twinkle(70, 62, 2.6, b, 0.85) + twinkle(18, 88, 2, b, 0.7),
        90, 90, px(90), px(90), a,
      )
    }
    case 'wolken':
      return svgPattern(
        cloud(18, 40, 1, alpha(b, 0.95)) + cloud(130, 92, 0.75, alpha(b, 0.8)) + cloud(150, 22, 0.45, alpha(b, 0.6)),
        230, 130, px(230), px(130), `linear-gradient(${a}, ${mix(a, '#ffffff', 0.55)})`,
      )
    case 'zeegolven':
      return seigaiha(a, b, px(64))
    case 'discobal': {
      // Mirror tiles catching the light in different amounts, and a sparkle here and there
      const shades = [0.95, 0.55, 0.8, 0.35, 0.6, 0.9, 0.4, 0.75, 0.3, 0.7, 0.5, 0.95, 0.85, 0.45, 0.65, 0.25]
      const tiles = shades.map((o, i) => `<rect x='${(i % 4) * 9 + 0.5}' y='${Math.floor(i / 4) * 9 + 0.5}' width='8' height='8' rx='1' fill='${i % 5 ? b : mix(b, '#ffffff', 0.4)}' opacity='${o}'/>`).join('')
      // Bigger, calmer tiles, lit from above like the light off a mirror ball
      return svgPattern(`<g opacity='0.55'>${tiles}</g>` + twinkle(9, 9, 4, '#ffffff', 0.9) + twinkle(27, 27, 3, '#ffffff', 0.7), 36, 36, px(54), px(54), `radial-gradient(ellipse 80% 60% at 50% 0%, ${mix(b, a, 0.45)}, ${a} 70%)`)
    }
    case 'terrazzo': {
      const chips = [
        [10, 12, 7, 20], [44, 8, 5, 70], [78, 18, 8, 130], [100, 44, 5, 200], [24, 46, 6, 250], [60, 40, 9, 300], [90, 82, 7, 40],
        [14, 90, 5, 160], [40, 76, 4, 90], [70, 104, 6, 220], [108, 108, 4, 10], [30, 110, 6, 280], [56, 64, 3, 330], [112, 8, 4, 110],
      ]
      const colours = [b, mix(b, '#ffffff', 0.55), mix(b, a, 0.5), mix(b, '#000000', 0.7)]
      return svgPattern(
        chips.map(([x, y, r, rot], i) => `<path d='M${-r} ${-r * 0.3}L${r * 0.2} ${-r}L${r} ${-r * 0.1}L${r * 0.4} ${r * 0.9}L${-r * 0.8} ${r * 0.6}Z' transform='translate(${x} ${y}) rotate(${rot})' fill='${colours[i % colours.length]}'/>`).join(''),
        120, 120, px(120), px(120), a,
      )
    }
    case 'memphis':
      return svgPattern(
        `<path d='M8 20q6-8 12 0t12 0t12 0' stroke='${b}' stroke-width='3' fill='none' stroke-linecap='round'/>` +
          `<path d='M62 10l12 20h-24z' fill='none' stroke='${b}' stroke-width='3' stroke-linejoin='round'/>` +
          `<circle cx='22' cy='62' r='9' fill='${mix(b, '#ffffff', 0.45)}'/>` +
          `<rect x='60' y='54' width='14' height='14' rx='2' fill='${b}' transform='rotate(20 67 61)'/>` +
          `<path d='M40 88l6-6 6 6 6-6 6 6' stroke='${b}' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/>` +
          [[46, 44], [52, 50], [58, 44], [86, 86], [92, 92], [10, 92]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='2' fill='${b}'/>`).join(''),
        100, 100, px(100), px(100), a,
      )
    case 'honingraat': {
      const r = 12
      const h = Math.sqrt(3) * r
      const hex = (cx: number, cy: number) => `M${cx - r} ${cy}L${cx - r / 2} ${cy - h / 2}L${cx + r / 2} ${cy - h / 2}L${cx + r} ${cy}L${cx + r / 2} ${cy + h / 2}L${cx - r / 2} ${cy + h / 2}Z`
      const d = [[0, 0], [36, 0], [0, h], [36, h], [18, h / 2]].map(([x, y]) => hex(x, y)).join('')
      return svgPattern(`<path d='${d}' fill='${alpha(b, 0.18)}' stroke='${b}' stroke-width='1.6'/>`, 36, +h.toFixed(2), px(36), px(h), a)
    }
    case 'confetti': {
      const bits = [[8, 10, 30], [30, 6, 110], [52, 18, 60], [70, 8, 150], [14, 34, 80], [40, 30, 10], [62, 40, 130], [80, 30, 40], [6, 58, 170], [28, 52, 50], [50, 62, 100], [74, 56, 20], [18, 76, 140], [42, 80, 70], [64, 76, 160]]
      const colours = [b, mix(b, '#ffffff', 0.5), mix(b, '#000000', 0.75), mix(b, a, 0.4)]
      return svgPattern(
        bits.map(([x, y, rot], i) => (i % 3 === 2 ? `<circle cx='${x}' cy='${y}' r='2.4' fill='${colours[i % 4]}'/>` : `<rect x='${x - 4}' y='${y - 1.6}' width='8' height='3.2' rx='1' fill='${colours[i % 4]}' transform='rotate(${rot} ${x} ${y})'/>`)).join(''),
        88, 88, px(88), px(88), a,
      )
    }
    default:
      return a
  }
}

// ---------------------------------------------------------- the title bar

/** The standard header look, or a pattern of your own. */
export type HeaderPattern = ProfilePattern | 'standaard'

export const NAME_SHADOWS = {
  geen: 'Geen',
  zacht: 'Zachte schaduw',
  sterk: 'Harde schaduw',
  gloed: 'Gloed',
  omlijning: 'Omlijning',
  neon: 'Neon (knippert zacht)',
} as const

export type NameShadow = keyof typeof NAME_SHADOWS

export const NAME_FONTS = {
  standaard: { name: 'Standaard', css: "var(--font-title)" },
  rond: { name: 'Speels', css: "'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', cursive" },
  sierlijk: { name: 'Sierlijk', css: "Georgia, 'Palatino Linotype', 'Book Antiqua', serif" },
  typemachine: { name: 'Typemachine', css: "'Courier New', Courier, monospace" },
  strak: { name: 'Stoer', css: "Impact, 'Arial Black', 'Franklin Gothic Bold', sans-serif" },
  // Webfonts from public/fonts/names (src/styles/nameFonts.css)
  handschrift: { name: 'Handschrift', css: "'Pacifico', cursive" },
  retro: { name: 'Retro', css: "'Lobster', cursive" },
  strip: { name: 'Stripboek', css: "'Bangers', 'Comic Sans MS', cursive" },
  pixel: { name: 'Pixel', css: "'Press Start 2P', monospace" },
  griezel: { name: 'Griezelig', css: "'Creepster', fantasy" },
  druipend: { name: 'Druipend', css: "'Nosifer', fantasy" },
  natteverf: { name: 'Natte verf', css: "'Rubik Wet Paint', fantasy" },
  neon: { name: 'Neon', css: "'Monoton', fantasy" },
  blokletters: { name: '3D', css: "'Bungee Shade', fantasy" },
  glitch: { name: 'Glitch', css: "'Rubik Glitch', fantasy" },
  gotisch: { name: 'Gotisch', css: "'UnifrakturMaguntia', serif" },
  western: { name: 'Wilde Westen', css: "'Rye', serif" },
  circus: { name: 'Circus', css: "'Ewert', fantasy" },
  disco: { name: 'Disco', css: "'Fascinate Inline', fantasy" },
  racer: { name: 'Racer', css: "'Faster One', fantasy" },
  sprookje: { name: 'Sprookje', css: "'Henny Penny', fantasy" },
  kaboem: { name: 'Kaboem!', css: "'Kablammo', fantasy" },
  plassen: { name: 'Plassen', css: "'Rubik Puddles', fantasy" },
  mexicaans: { name: 'Fiesta', css: "'Frijole', fantasy" },
  slager: { name: 'Horrorfilm', css: "'Butcherman', fantasy" },
  seventies: { name: 'Seventies', css: "'Shrikhand', cursive" },
  ruimte: { name: 'Ruimteschip', css: "'Audiowide', sans-serif" },
  robot: { name: 'Robot', css: "'Orbitron', sans-serif" },
  vurig: { name: 'Vurig', css: "'Bungee Spice', fantasy" },
  snoepkleur: { name: 'Snoepkleuren', css: "'Nabla', fantasy" },
  graffiti: { name: 'Graffiti', css: "'Sedgwick Ave Display', cursive" },
  kawaii: { name: 'Kawaii', css: "'Cherry Bomb One', cursive" },
  gameboy: { name: 'Gameboy', css: "'Silkscreen', monospace" },
} as const

/**
 * Fonts for the rest of the text on a profile or Kudde (and its box titles):
 * calmer than the name fonts, for reading. Webfonts in public/fonts/body
 * (src/styles/bodyFonts.css).
 */
export const BODY_FONTS = {
  standaard: { name: 'Standaard', css: null },
  krant: { name: 'Krant', css: "Georgia, 'Times New Roman', serif" },
  trebuchet: { name: 'Trebuchet', css: "'Trebuchet MS', 'Fira Sans', sans-serif" },
  rond: { name: 'Rond', css: "'Nunito', Verdana, sans-serif" },
  licht: { name: 'Licht', css: "'Quicksand', Verdana, sans-serif" },
  vrolijk: { name: 'Vrolijk', css: "'Fredoka', Verdana, sans-serif" },
  zacht: { name: 'Zacht', css: "'Varela Round', Verdana, sans-serif" },
  boek: { name: 'Boek', css: "'Lora', Georgia, serif" },
  klassiek: { name: 'Klassiek', css: "'Merriweather', Georgia, serif" },
  strip: { name: 'Stripverhaal', css: "'Comic Neue', 'Comic Sans MS', cursive" },
  handschrift: { name: 'Handgeschreven', css: "'Patrick Hand', 'Comic Sans MS', cursive" },
  duidelijk: { name: 'Extra duidelijk', css: "'Atkinson Hyperlegible', Verdana, sans-serif" },
  typemachine: { name: 'Typemachine', css: "'Courier Prime', 'Courier New', monospace" },
} as const satisfies Record<string, { name: string; css: string | null }>
export type BodyFont = keyof typeof BODY_FONTS

export type NameFont = keyof typeof NAME_FONTS

/** The bar at the top of a profile, with the name and the tabs. */
export type HeaderDesign = {
  pattern: HeaderPattern
  color: string
  color2: string
  /** The name's colour. */
  nameColor: string
  shadow: NameShadow
  /** A see-through plate behind the name, so it's readable on any pattern. */
  backdrop: boolean
  font: NameFont
  /** Over a texture in the bar: its colours, see-through. */
  overlay?: TextureOverlay | null
}

export const DEFAULT_HEADER: HeaderDesign = {
  pattern: 'standaard',
  color: '#ffffff',
  color2: '#dcefff',
  nameColor: '#13324f',
  shadow: 'geen',
  backdrop: false,
  font: 'standaard',
}

/** The CSS custom properties that style the title bar (see ProfilePage.css). */
export function headerVars(h: HeaderDesign, surface = '#ffffff'): Record<string, string> {
  // Light or dark by contrast: whichever of black and white stands out more against the name
  const light = luminance(h.nameColor) > 0.18
  const outline = light ? '#000000' : '#ffffff'
  const shadow = {
    geen: 'none',
    zacht: `0 1px 3px ${light ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.8)'}`,
    sterk: light ? '0 2px 0 rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.45)' : '0 2px 0 rgba(255, 255, 255, 0.9), 0 3px 8px rgba(255, 255, 255, 0.6)',
    gloed: `0 0 6px ${alpha(h.color2, 0.95)}, 0 0 14px ${alpha(h.color2, 0.8)}`,
    omlijning: `-1px -1px 0 ${outline}, 1px -1px 0 ${outline}, -1px 1px 0 ${outline}, 1px 1px 0 ${outline}, 0 2px 4px rgba(0, 0, 0, 0.35)`,
    // A tube of light: a white core and layers of glow in the name's colour
    neon: `0 0 1px #ffffff, 0 0 4px ${alpha(h.nameColor, 0.95)}, 0 0 10px ${alpha(h.nameColor, 0.85)}, 0 0 20px ${alpha(h.nameColor, 0.6)}, 0 0 34px ${alpha(h.nameColor, 0.35)}`,
  }[h.shadow]
  const vars: Record<string, string> = {
    '--profile-name-color': h.nameColor,
    '--profile-name-soft': alpha(h.nameColor, 0.75),
    '--profile-name-shadow': shadow,
    '--profile-name-font': NAME_FONTS[h.font].css,
  }
  // The neon name flickers now and then (ProfilePage.css)
  if (h.shadow === 'neon') vars['--profile-name-anim'] = 'name-neon 7s linear infinite'
  if (h.pattern !== 'standaard') {
    vars['--profile-hdr-bg'] = patternCss(h.pattern, h.color, h.color2, 0.6, h.overlay)
    // Tabs and links get a chip in the box colour, so they stay readable on the pattern
    vars['--profile-tab-bg'] = alpha(surface, 0.82)
  }
  if (h.backdrop) {
    vars['--profile-name-plate'] = light ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.78)'
    vars['--profile-name-pad'] = '2px 12px 3px'
  }
  return vars
}

// --------------------------------------------------------- profile colours

/** The member's own profile design, used when their skin is "eigen". */
export type ProfileColors = BoxLook & {
  background: string
  background2: string
  pattern: ProfilePattern
  /** Box headers and borders. */
  box: string
  title: string
  link: string
  /** Inside the boxes, and the text on it; not set = white boxes with dark text. */
  surface?: string
  text?: string
  /** Optional image over the colours and pattern. */
  image?: BackgroundImage | null
  /** The title bar with your name; none = the standard one. */
  header?: HeaderDesign | null
  /** Something that moves in the background: stars, snow… (shared/backgroundEffects.ts) */
  effect?: BackgroundEffect | null
  /** Over a texture as background: the two colours, see-through. */
  overlay?: TextureOverlay | null
  /** Fonts for the text and the box titles (BODY_FONTS); not set = the site's. */
  font?: BodyFont | null
  titleFont?: BodyFont | null
}

export const CUSTOM_SKIN_KEY = 'eigen'

export const DEFAULT_PROFILE_COLORS: ProfileColors = {
  background: '#8ccbf5',
  background2: '#4ba3e0',
  pattern: 'stippen',
  box: '#4ba3e0',
  title: '#13324f',
  link: '#1d74bd',
}

export function profileBackground(colors: ProfileColors): string {
  const base = patternCss(colors.pattern, colors.background, colors.background2, 1, colors.overlay)
  return colors.image ? `${imageLayer(colors.image)}, ${base}` : base
}

// ------------------------------------------------------------------ layouts

/** Boxes on the "Over" tab of a profile, and their default columns. */
export const PROFILE_BOXES = {
  acties: 'Profielfoto',
  wiewatwaar: 'WieWatWaar',
  profiel: 'Profiel',
  knuffels: 'Knuffels',
  vrienden: 'Vrienden',
  buddypoke: 'BuddyPoke',
  fotos: "Foto's",
  kuddes: 'Kuddes',
  bezoekers: 'Laatste bezoekers',
} as const

/** Boxes on Home (the banners stay on top). "welkom", "jarig" and "online" only show when logged in. */
export const HOME_BOXES = {
  welkom: 'Welkom',
  nieuws: 'De Kuddes Courant',
  leden: 'Nieuw op Kuddes',
  fotos: "Foto's, video's en blogs",
  wiewatwaar: 'WieWatWaar',
  suggesties: 'Ideeënbus',
  online: 'Wie is er nu?',
  jarig: 'Jarige vrienden',
  agenda: 'Agenda',
  weer: 'Het weer bij jou',
  kuddes: 'Kuddes',
  smileys: 'Smileys in de laatste 24 uur',
} as const

export type ProfileBox = keyof typeof PROFILE_BOXES
export type HomeBox = keyof typeof HOME_BOXES

/** Columns of box keys, left to right, and the boxes that are switched off. */
export type BoxLayout<K extends string = string> = { columns: K[][]; hidden: K[] }

export const DEFAULT_PROFILE_LAYOUT: BoxLayout<ProfileBox> = {
  columns: [['acties'], ['wiewatwaar', 'profiel', 'knuffels'], ['vrienden', 'buddypoke', 'fotos', 'kuddes', 'bezoekers']],
  hidden: [],
}

/**
 * Home like the old Hyves start page: you and your friends on the left,
 * WieWatWaar in the middle, the news and what's going on on the right.
 */
export const DEFAULT_HOME_LAYOUT: BoxLayout<HomeBox> = {
  columns: [
    ['welkom', 'online', 'jarig'],
    ['wiewatwaar', 'fotos', 'leden'],
    ['nieuws', 'smileys', 'agenda', 'kuddes', 'suggesties', 'weer'],
  ],
  hidden: [],
}

export const LAYOUT_COLUMNS = { profile: 3, home: 3 } as const

/**
 * Make any stored layout safe to render: drop unknown and duplicate keys, add
 * boxes that are new since it was saved (in their default column), and keep
 * the column count.
 */
export function normalizeLayout<K extends string>(
  layout: BoxLayout<string> | null | undefined,
  defaults: BoxLayout<K>,
  known: readonly K[] | ((key: string) => boolean),
): BoxLayout<K> {
  if (!layout) return defaults
  // Saved with another number of columns (Home used to have two): the default order, but what was hidden stays hidden
  if (layout.columns?.length !== defaults.columns.length) layout = { columns: [], hidden: layout.hidden ?? [] }
  const isKnown = typeof known === 'function' ? known : (k: string) => known.includes(k as K)
  const seen = new Set<string>()
  const keep = (list: string[] | undefined) =>
    (list ?? []).filter((k): k is K => isKnown(k) && !seen.has(k) && !!seen.add(k))
  const columns = defaults.columns.map((_, i) => keep(layout.columns?.[i]))
  const hidden = keep(layout.hidden)
  defaults.columns.forEach((col, i) => col.forEach((k) => !seen.has(k) && (seen.add(k), columns[i].push(k))))
  return { columns, hidden }
}

// -------------------------------------------------------------- preferences

export type Preferences = {
  /** Text size of the whole site. */
  textSize: 'klein' | 'normaal' | 'groot' | 'extra'
  /** Less space around boxes. */
  compact: boolean
  /** No smooth scrolling, fades or highlight animations. */
  reduceMotion: boolean
  /** "vandaag, 22:11" or the exact date and time everywhere. */
  timeFormat: 'relatief' | 'exact'
  /** Where you land after logging in. */
  startPage: 'home' | 'tijdlijn' | 'profiel'
  /** Who can see a new WieWatWaar unless you pick otherwise. */
  defaultVisibility: 'iedereen' | 'vrienden'
  /** Ctrl+Enter (Cmd+Enter) posts WieWatWaars, knuffels and reacties. */
  sendShortcut: boolean
  /** Privacy: who may see your profile (and what's on it); the others see only your name and photo. */
  profileFor: 'iedereen' | 'vrienden'
  /** Privacy: who may send you a friend request (one they already sent you can always be accepted). */
  friendRequestsFrom: 'iedereen' | 'vriendenvanvrienden' | 'niemand'
  /** Privacy: who may leave you a knuffel. */
  knuffelsFrom: 'iedereen' | 'vrienden'
  /** Privacy: who may send you a personal message. */
  messagesFrom: 'iedereen' | 'vrienden' | 'niemand'
  /** Privacy: show your age on your profile. */
  showAge: boolean
  /** People on Mastodon, Pixelfed and other servers outside Kuddes may follow you (and get your WieWatWaars for everyone); off = they send a friend request instead. */
  fediverseFollowers: boolean
  /** Overzicht → Fediverse: posts of accounts you follow on Mastodon and other servers (when this server allows it). */
  showFediverse: boolean
  /** Privacy: visit profiles without appearing in their "Laatste bezoekers". */
  anonymousVisits: boolean
  /** Privacy: search engines may list your profile (share cards always work). */
  searchEngines: boolean
  /** Friends may call you (voice) in Kuddes Messenger; off by default (src/features/messenger/calls.ts). */
  allowCalls: boolean
  /** Pop-ups from the browser while Kuddes is in the background (src/lib/browserNotify.ts), once the browser allows them. */
  notifyBrowser: boolean
  /** …per kind (see BROWSER_NOTIFY_KINDS). */
  notifyMessages: boolean
  notifyMessenger: boolean
  notifyRequests: boolean
  notifyKnuffels: boolean
  notifyMentions: boolean
  notifyReactions: boolean
  notifyGames: boolean
  notifyAchievements: boolean
  notifyCalls: boolean
  notifyRadio: boolean
  notifyForum: boolean
  /** A notification behind the bell when someone replies to a forum topic you started. */
  forumReplies: boolean
  /** The number of new things in the tab's title: "(3) Kuddes". */
  tabCount: boolean
  /** A red dot with the number on the tab's icon. */
  tabIcon: boolean
  /** Privacy: visitors without an account see your profile photo (forum, Kuddes Video…); off, they see your initials. */
  avatarPublic: boolean
  /** Snow, leaves and the like (shared/festive.ts). */
  festive: FestiveMode
  /** Also switch to the matching colours while an effect is on. */
  festiveColors: boolean
  /** Falling snow, leaves, petals and bats (the decorations stay). */
  festiveParticles: boolean
  /** A seasonal border (a wreath at Christmas…) around profile photos. */
  festiveFrames: boolean
  festiveAmount: FestiveAmount
  /** Start the music on a profile by itself, when its owner set that up. */
  musicAutoplay: boolean
  /** Show the animated cursor someone picked for their profile. */
  profileCursors: boolean
  /** A sound for new messages, requests, invites and achievements (src/lib/siteSounds.ts). */
  notificationSounds: boolean
  /** A soft blip for new lines in the chat, and a louder one when your name is mentioned. */
  chatSounds: boolean
  /** "Wie ben ik?" at the top of the Profiel box instead of at the bottom. */
  aboutFirst: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  textSize: 'normaal',
  compact: false,
  reduceMotion: false,
  timeFormat: 'relatief',
  startPage: 'home',
  defaultVisibility: 'iedereen',
  sendShortcut: true,
  profileFor: 'iedereen',
  friendRequestsFrom: 'iedereen',
  knuffelsFrom: 'iedereen',
  messagesFrom: 'iedereen',
  showAge: true,
  anonymousVisits: false,
  showFediverse: true,
  fediverseFollowers: true,
  searchEngines: true,
  avatarPublic: true,
  allowCalls: false,
  notifyBrowser: true,
  notifyMessages: true,
  notifyMessenger: true,
  notifyRequests: true,
  notifyKnuffels: true,
  notifyMentions: true,
  notifyReactions: true,
  notifyGames: true,
  notifyAchievements: true,
  notifyCalls: true,
  notifyRadio: true,
  notifyForum: true,
  forumReplies: true,
  tabCount: true,
  tabIcon: true,
  festive: 'uit',
  festiveColors: true,
  festiveParticles: true,
  festiveFrames: true,
  festiveAmount: 'normaal',
  musicAutoplay: true,
  profileCursors: true,
  notificationSounds: true,
  aboutFirst: false,
  chatSounds: true,
}

export const TEXT_SIZES = { klein: 0.92, normaal: 1, groot: 1.1, extra: 1.22 } as const

export const withDefaults = (prefs: Partial<Preferences> | null | undefined): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...prefs,
})

// ------------------------------------------------------------ saved layouts

/** A saved look: theme, profile design and both box layouts together. */
export type LayoutSnapshot = {
  theme: string | null
  customTheme: CustomTheme | null
  skin: string | null
  profileColors: ProfileColors | null
  profileLayout: BoxLayout<ProfileBox> | null
  homeLayout: BoxLayout<HomeBox> | null
}

export const MAX_SAVED_LAYOUTS = 12

/** Your own designs to switch between: profile/Kudde designs, and site colour schemes. */
export type SavedDesignKind = 'design' | 'thema'
export const MAX_SAVED_DESIGNS = 20

/** The Designgalerij: how many one member can share, per page, and how long a description may be. */
export const MAX_SHARED_DESIGNS = 20
export const SHARED_DESIGNS_PAGE = 24
export const SHARED_DESIGN_TEXT_MAX = 200

/** The kinds of browser notifications, each with its own switch in Instellingen (src/lib/browserNotify.ts). */
export const BROWSER_NOTIFY_KINDS = {
  notifyMessages: { label: 'Persoonlijke berichten', hint: 'Een nieuw bericht in je Postvak IN.', icon: 'email' },
  notifyMessenger: { label: 'Kuddes Messenger', hint: 'Een chatbericht of nudge van een vriend, ook in een groep.', icon: 'msn_messenger' },
  notifyCalls: { label: 'Bellen', hint: 'Een vriend belt je via Messenger.', icon: 'telephone' },
  notifyRequests: { label: 'Verzoeken', hint: 'Iemand wil je vriend worden, of een relatie op je profiel zetten.', icon: 'user_add' },
  notifyKnuffels: { label: 'Knuffels', hint: 'Een knuffel of glitterplaatje op je profiel.', icon: 'teddy_bear' },
  notifyMentions: { label: 'Genoemd worden', hint: 'Iemand noemt je met @gebruikersnaam.', icon: 'user_comment' },
  notifyReactions: { label: 'Reacties', hint: 'Een reactie op je WieWatWaar of prikbordbericht.', icon: 'comments' },
  notifyGames: { label: 'Spellen', hint: 'Een uitnodiging om te spelen, of het is jouw beurt.', icon: 'controller' },
  notifyAchievements: { label: 'Prestaties', hint: 'Je hebt een nieuwe prestatie verdiend.', icon: 'award_star_gold_1' },
  notifyForum: { label: 'Forum', hint: 'Iemand reageert op een onderwerp dat jij begon.', icon: 'comment_box' },
  notifyRadio: { label: 'Kuddes Radio', hint: 'Een zender die je volgt gaat live, of je wordt gevraagd als DJ.', icon: 'transmit' },
} as const satisfies Record<string, { label: string; hint: string; icon: string }>

export type BrowserNotifyKind = keyof typeof BROWSER_NOTIFY_KINDS
