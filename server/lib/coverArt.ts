/**
 * The drawn covers of the kasten (src/features/gadgets/ShelfGadgets.tsx and
 * DrinkSeriesGadgets.tsx) again, as SVG, for share images: sharp can't draw
 * the CSS ones. A book, a dvd, a box set, a cd or lp, a game box and a bottle,
 * in the item's colours and in one of the four cover styles.
 */
import { COVER_COLORS, SERIES_PLATFORMS, type CoverColor, type CoverStyle, type DrinkKind, type GamePlatform, type SeriesPlatform } from '../../shared/gadgets'
import type { MediaDetails, MediaKind } from '../../shared/media'

export type CoverItem = { kind: MediaKind; title: string; creator: string; year: string; color: CoverColor; style: CoverStyle; details: MediaDetails }

const SANS = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"
const SERIF = "'DejaVu Serif', 'Liberation Serif', Georgia, serif"
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

let uid = 0
const nextId = (p: string) => `${p}${++uid}`

/** Wraps a title into at most `max` lines of about `chars` characters. */
function lines(text: string, chars: number, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= chars || !line) line = next
    else {
      out.push(line)
      line = word
    }
  }
  if (line) out.push(line)
  const cut = out.map((l) => (l.length > chars + 2 ? `${l.slice(0, chars)}…` : l))
  if (cut.length <= max) return cut
  const kept = cut.slice(0, max)
  kept[max - 1] = `${kept[max - 1].replace(/[\s,.:;–-]+$/, '')}…`
  return kept
}

/** Title (and maker) on a cover of w×h, in the style's font and layout. */
function coverText(t: { title: string; sub: string; w: number; h: number; x?: number; y?: number; style: CoverStyle; fg: string; bg: string; size?: number }) {
  const { w, h, style, fg, bg } = t
  const x0 = t.x ?? 0
  const y0 = t.y ?? 0
  const serif = style === 'klassiek' || style === 'sierlijk' || style === 'band'
  const size = t.size ?? (style === 'modern' ? w * 0.13 : w * 0.12)
  const chars = Math.max(6, Math.round(w / (size * (style === 'modern' ? 0.7 : 0.58))))
  const title = lines(style === 'modern' ? t.title.toUpperCase() : t.title, chars, 4)
  const lh = size * 1.18
  const family = serif ? SERIF : SANS
  const weight = style === 'sierlijk' ? 400 : 700
  const italic = style === 'sierlijk' ? ' font-style="italic"' : ''
  const sub = t.sub ? esc(t.sub.toUpperCase().slice(0, 28)) : ''
  if (style === 'modern') {
    const tl = title.map((l, i) => `<text x="${x0 + w * 0.1}" y="${y0 + h * 0.14 + size + i * lh}" font-family="${SANS}" font-size="${size}" font-weight="900" fill="${fg}">${esc(l)}</text>`).join('')
    return `${tl}<circle cx="${x0 + w * 0.92}" cy="${y0 + h * 0.7}" r="${w * 0.3}" fill="${fg}" opacity="0.28"/>${sub ? `<text x="${x0 + w * 0.1}" y="${y0 + h * 0.9}" font-family="${SANS}" font-size="${w * 0.065}" letter-spacing="1" fill="${fg}" opacity="0.85">${sub}</text>` : ''}`
  }
  const cx = x0 + w / 2
  const block = title.length * lh
  const top = y0 + h / 2 - block / 2 - (sub ? size * 0.35 : 0)
  const text = title
    .map((l, i) => `<text x="${cx}" y="${top + size + i * lh}" text-anchor="middle" font-family="${family}" font-size="${size}" font-weight="${weight}"${italic} fill="${style === 'band' ? bg : fg}">${esc(l)}</text>`)
    .join('')
  const band = style === 'band' ? `<rect x="${x0}" y="${top - size * 0.3}" width="${w}" height="${block + size * 0.55}" fill="${fg}"/>` : ''
  const frame = style === 'klassiek' ? `<rect x="${x0 + w * 0.08}" y="${y0 + h * 0.05}" width="${w * 0.84}" height="${h * 0.9}" fill="none" stroke="${fg}" stroke-opacity="0.7" stroke-width="${w * 0.018}"/><rect x="${x0 + w * 0.11}" y="${y0 + h * 0.07}" width="${w * 0.78}" height="${h * 0.86}" fill="none" stroke="${fg}" stroke-opacity="0.7" stroke-width="${w * 0.008}"/>` : ''
  const ornament = style === 'sierlijk' ? `<text x="${cx}" y="${top - size * 0.4}" text-anchor="middle" font-family="${SERIF}" font-size="${size * 1.3}" fill="${fg}" opacity="0.8">❦</text>` : ''
  const subText = sub ? `<text x="${cx}" y="${top + block + size * 1.25}" text-anchor="middle" font-family="${SANS}" font-size="${w * 0.07}" letter-spacing="1" fill="${fg}" opacity="0.85">${sub}</text>` : ''
  return frame + band + ornament + text + subText
}

const shadow = (id: string) => `<filter id="${id}" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dx="6" dy="8" stdDeviation="7" flood-opacity="0.45"/></filter>`

function book(it: CoverItem, w: number, h: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const g = nextId('g')
  return `<defs>${shadow(s)}<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="0.04" stop-color="#fff" stop-opacity="0.25"/><stop offset="0.09" stop-color="#000" stop-opacity="0.15"/><stop offset="0.14" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="0.62" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.75" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <g filter="url(#${s})"><rect width="${w}" height="${h}" rx="4" fill="${bg}"/></g>
  <svg width="${w}" height="${h}" overflow="hidden">${coverText({ title: it.title, sub: it.creator, w, h, x: w * 0.06, style: it.style, fg, bg })}</svg>
  <rect width="${w}" height="${h}" rx="4" fill="url(#${g})"/>`
}

function dvd(it: CoverItem, w: number, h: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const l = nextId('l')
  const iw = w - 12
  const ih = h - 38
  return `<defs>${shadow(s)}<radialGradient id="${l}" cx="0.5" cy="0.3" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <g filter="url(#${s})"><rect width="${w}" height="${h}" rx="7" fill="#15151a"/></g>
  <text x="${w / 2}" y="22" text-anchor="middle" font-family="${SANS}" font-size="17" font-weight="900" letter-spacing="3" fill="#e8e8ee">DVD</text>
  <rect x="6" y="32" width="${iw}" height="${ih}" rx="3" fill="${bg}"/>
  <rect x="6" y="32" width="${iw}" height="${ih}" rx="3" fill="url(#${l})"/>
  <svg x="6" y="32" width="${iw}" height="${ih}" overflow="hidden">${coverText({ title: it.title, sub: it.year, w: iw, h: ih, style: it.style, fg, bg })}</svg>`
}

function boxSet(it: CoverItem, w: number, h: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const seasons = it.details.seasons ?? 1
  const spines = Math.min(seasons, 5) - 1
  const fw = w - spines * 10
  const platform = SERIES_PLATFORMS[it.details.seriesPlatform ?? ('anders' as SeriesPlatform)]
  const back = Array.from({ length: spines }, (_, i) => `<rect x="${fw - 8 + (spines - i) * 10}" y="${(spines - i) * 4}" width="16" height="${h - (spines - i) * 8}" rx="3" fill="${bg}" stroke="#000" stroke-opacity="0.35"/>`).join('')
  const label = seasons === 1 ? 'Seizoen 1' : `Seizoen 1–${seasons}`
  return `<defs>${shadow(s)}</defs>
  <g filter="url(#${s})">${back}<rect width="${fw}" height="${h}" rx="4" fill="${bg}"/></g>
  <rect width="${fw}" height="30" rx="4" fill="#000" opacity="0.55"/>
  <text x="${fw / 2}" y="21" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="700" letter-spacing="1" fill="#fff">${esc(platform.toUpperCase())}</text>
  <svg y="30" width="${fw}" height="${h - 80}" overflow="hidden">${coverText({ title: it.title, sub: '', w: fw, h: h - 80, style: it.style, fg, bg })}</svg>
  <rect x="${fw / 2 - 70}" y="${h - 44}" width="140" height="28" rx="14" fill="${fg}"/>
  <text x="${fw / 2}" y="${h - 24}" text-anchor="middle" font-family="${SANS}" font-size="15" font-weight="700" fill="${bg}">${label}</text>`
}

function album(it: CoverItem, w: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const lp = (it.details.format ?? 'cd') === 'lp'
  // An lp: the sleeve with the record sticking out on the right, together as wide as a cd
  const size = lp ? w * 0.7 : w
  const art = `<rect width="${size}" height="${size}" fill="${bg}"/><svg width="${size}" height="${size}" overflow="hidden">${coverText({ title: it.title, sub: it.creator, w: size, h: size, style: it.style, fg, bg })}</svg>`
  if (lp)
    return `<defs>${shadow(s)}</defs>
    <g filter="url(#${s})"><circle cx="${size * 0.95}" cy="${size / 2}" r="${size * 0.47}" fill="#111"/></g>
    <circle cx="${size * 0.95}" cy="${size / 2}" r="${size * 0.4}" fill="none" stroke="#333" stroke-width="2"/>
    <circle cx="${size * 0.95}" cy="${size / 2}" r="${size * 0.3}" fill="none" stroke="#2a2a2a" stroke-width="2"/>
    <circle cx="${size * 0.95}" cy="${size / 2}" r="${size * 0.14}" fill="${bg}"/>
    <g filter="url(#${s})">${art}</g>`
  return `<defs>${shadow(s)}</defs>
  <g filter="url(#${s})">${art}</g>
  <rect x="0" y="0" width="12" height="${size}" fill="#fff" opacity="0.35"/>
  <rect width="${size}" height="${size}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="3"/>`
}

const STRIP: Record<GamePlatform, [string, string]> = {
  pc: ['PC CD-ROM', '#2d3a4a'],
  playstation: ['PlayStation', '#1b3f8f'],
  xbox: ['XBOX', '#2a7a1f'],
  nintendo: ['Nintendo', '#d61f26'],
  handheld: ['DS', '#6d6d72'],
  gameboy: ['GAME BOY', '#5b4b8a'],
  bordspel: ['', ''],
}

function game(it: CoverItem, w: number, h: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const [strip, stripColor] = STRIP[it.details.gamePlatform ?? 'pc']
  const box = it.details.gamePlatform === 'bordspel'
  const top = strip ? 34 : 0
  return `<defs>${shadow(s)}</defs>
  <g filter="url(#${s})"><rect width="${w}" height="${h}" rx="${box ? 2 : 6}" fill="${bg}"/></g>
  ${strip ? `<rect width="${w}" height="${top}" rx="6" fill="${stripColor}"/><rect y="${top - 8}" width="${w}" height="8" fill="${stripColor}"/><text x="${w / 2}" y="23" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="900" letter-spacing="1" fill="#fff">${esc(strip)}</text>` : ''}
  <svg y="${top}" width="${w}" height="${h - top}" overflow="hidden">${coverText({ title: it.title, sub: '', w, h: h - top, style: it.style, fg, bg })}</svg>
  ${box ? `<rect x="6" y="6" width="${w - 12}" height="${h - 12}" fill="none" stroke="${fg}" stroke-opacity="0.5" stroke-width="3"/>` : ''}`
}

/** Glass colour and shape per kind of drink. */
const GLASS: Record<DrinkKind, { glass: string; shape: 'bier' | 'wijn' | 'bubbels' | 'sterk' }> = {
  pils: { glass: '#6b3d12', shape: 'bier' },
  speciaal: { glass: '#5a2f0e', shape: 'bier' },
  witbier: { glass: '#c8b27a', shape: 'bier' },
  donker: { glass: '#1f140c', shape: 'bier' },
  rood: { glass: '#2e0f16', shape: 'wijn' },
  wit: { glass: '#b8c48a', shape: 'wijn' },
  rose: { glass: '#e7a3a8', shape: 'wijn' },
  bubbels: { glass: '#1f3a22', shape: 'bubbels' },
  cider: { glass: '#7a5a1a', shape: 'bier' },
  sterk: { glass: '#c9d7dd', shape: 'sterk' },
}

function bottle(it: CoverItem, w: number, h: number) {
  const [bg, fg] = COVER_COLORS[it.color]
  const s = nextId('s')
  const sh = nextId('sh')
  const { glass, shape } = GLASS[it.details.drinkKind ?? 'speciaal']
  const bw = shape === 'sterk' ? w * 0.9 : w * 0.72
  const bx = (w - bw) / 2
  const neckW = shape === 'sterk' ? w * 0.3 : w * 0.24
  const nx = (w - neckW) / 2
  const shoulder = shape === 'wijn' || shape === 'bubbels' ? h * 0.36 : h * 0.3
  const neckTop = h * 0.06
  const body = `M${nx} ${neckTop} h${neckW} v${shoulder * 0.45} C${nx + neckW} ${shoulder * 0.75}, ${bx + bw} ${shoulder * 0.8}, ${bx + bw} ${shoulder} V${h - 10} a10 10 0 0 1 -10 10 H${bx + 10} a10 10 0 0 1 -10 -10 V${shoulder} C${bx} ${shoulder * 0.8}, ${nx} ${shoulder * 0.75}, ${nx} ${neckTop + shoulder * 0.45} z`
  const cap = shape === 'bubbels' ? `<rect x="${nx - 4}" y="0" width="${neckW + 8}" height="${h * 0.12}" rx="4" fill="#d9b44a"/>` : shape === 'bier' ? `<rect x="${nx - 3}" y="0" width="${neckW + 6}" height="${h * 0.05}" rx="2" fill="#c9c9c9"/>` : `<rect x="${nx}" y="0" width="${neckW}" height="${h * 0.08}" rx="2" fill="${shape === 'sterk' ? '#222' : '#7a1f2a'}"/>`
  const lw = bw * 0.84
  const lh = h * 0.34
  const lx = (w - lw) / 2
  const ly = h * 0.52
  return `<defs>${shadow(s)}<linearGradient id="${sh}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.25" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.4" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <g filter="url(#${s})"><path d="${body}" fill="${glass}"/></g>
  <path d="${body}" fill="url(#${sh})"/>
  ${cap}
  <rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="4" fill="${bg}"/>
  <svg x="${lx}" y="${ly}" width="${lw}" height="${lh}" overflow="hidden">${coverText({ title: it.title, sub: it.creator, w: lw, h: lh, style: it.style === 'klassiek' ? 'sierlijk' : it.style, fg, bg, size: lw * 0.14 })}</svg>`
}

/** Size of the drawing for each kind, at scale 1 (the card scales it into its spot). */
export const COVER_SIZE: Record<MediaKind, [number, number]> = {
  boeken: [200, 300],
  films: [210, 300],
  series: [250, 300],
  muziek: [300, 300],
  spellen: [220, 300],
  drank: [150, 340],
}

/** The drawn cover as an SVG group at (x, y), scaled to `scale`. */
export function coverSvg(it: CoverItem, x: number, y: number, scale = 1): string {
  const [w, h] = COVER_SIZE[it.kind]
  const inner = (() => {
    switch (it.kind) {
      case 'boeken':
        return book(it, w, h)
      case 'films':
        return dvd(it, w, h)
      case 'series':
        return boxSet(it, w, h)
      case 'muziek':
        return album(it, w)
      case 'spellen':
        return game(it, w, h)
      case 'drank':
        return bottle(it, w, h)
    }
  })()
  return `<g transform="translate(${x} ${y}) scale(${scale})">${inner}</g>`
}
