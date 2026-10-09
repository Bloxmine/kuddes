/**
 * The profile patterns as pictures, for share images (the profielkaartje).
 * On the site they're CSS (patternCss in shared/customization.ts); sharp
 * can't draw CSS, so: the BuddyPoke tiles and the SVG tiles are tiled as
 * they are, the simple CSS ones are drawn again as SVG, and the rest become
 * a gradient in the same two colours.
 */
import sharp from 'sharp'
import { BP_PATTERNS, patternCss, type BpPattern, type ProfilePattern } from '../../shared/customization'
import { bpTile } from './patternTiles'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { isTexturePattern, textureOf, textureUrl } from '../../shared/textures'

const solid = (w: number, h: number, color: string) => sharp({ create: { width: w, height: h, channels: 4, background: color } })

const svgOf = (w: number, h: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)

/** A full-size SVG with a repeating <pattern> tile over a base colour. */
const tiled = (w: number, h: number, a: string, tw: number, th: number, tile: string) =>
  svgOf(w, h, `<defs><pattern id="p" width="${tw}" height="${th}" patternUnits="userSpaceOnUse">${tile}</pattern></defs><rect width="${w}" height="${h}" fill="${a}"/><rect width="${w}" height="${h}" fill="url(#p)"/>`)

const gradient = (w: number, h: number, a: string, b: string, horizontal = false) =>
  svgOf(w, h, `<defs><linearGradient id="g" x1="0" y1="0" x2="${horizontal ? 1 : 0}" y2="${horizontal ? 0 : 1}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`)

/** The last layer of a CSS background: a colour or a two-colour gradient, as an SVG base. */
function baseOf(css: string, w: number, h: number, fallback: string): Buffer {
  const lastComma = (() => {
    let depth = 0
    let cut = -1
    for (let i = 0; i < css.length; i++) {
      if (css[i] === '(') depth++
      else if (css[i] === ')') depth--
      else if (css[i] === ',' && depth === 0) cut = i
    }
    return cut
  })()
  const last = css.slice(lastComma + 1).trim()
  const g = /^linear-gradient\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)$/i.exec(last)
  if (g) return gradient(w, h, g[1], g[2])
  return svgOf(w, h, `<rect width="${w}" height="${h}" fill="${/^#[0-9a-f]{6}$/i.test(last) ? last : fallback}"/>`)
}

/** The pattern at w×h as a PNG, in colours a (background) and b (pattern), `scale` like patternCss. */
export async function patternPicture(pattern: ProfilePattern | null, a: string, b: string, w: number, h: number, scale = 1): Promise<Buffer> {
  const px = (n: number) => Math.max(4, Math.round(n * scale))
  if (!pattern || pattern === 'effen') return solid(w, h, a).png().toBuffer()

  // A photo texture: the file itself, repeated at the size the site shows it
  if (isTexturePattern(pattern)) {
    const tx = textureOf(pattern)
    const file = tx && [path.resolve('dist', textureUrl(tx.category, tx.key).slice(1)), path.resolve('public', textureUrl(tx.category, tx.key).slice(1))].find((f) => existsSync(f))
    if (!file) return solid(w, h, a).png().toBuffer()
    const tile = await sharp(file).resize(px(256), px(256)).png().toBuffer()
    return solid(w, h, a).composite([{ input: tile, tile: true }]).png().toBuffer()
  }

  // The BuddyPoke tiles, in b over a (the site shows them at 70%)
  if (pattern.startsWith('bp_')) {
    const name = pattern.slice(3) as BpPattern
    const [tw, th] = BP_PATTERNS[name]
    const tile = await sharp(await bpTile(name, b.slice(1).toLowerCase()))
      .resize(name === 'spot' ? w : px(tw * 0.7), name === 'spot' ? h : px(th * 0.7), { fit: 'fill' })
      .png()
      .toBuffer()
    return solid(w, h, a)
      .composite([{ input: tile, tile: name !== 'spot', gravity: 'centre' }])
      .png()
      .toBuffer()
  }

  const css = patternCss(pattern, a, b, scale)
  // The SVG tiles (hartjes, sterretjes, sneeuwvlokken, terrazzo…): the same tile, repeated
  const svgTile = /url\("data:image\/svg\+xml,([^"]+)"\) 0 0 \/ (\d+)px (\d+)px/.exec(css)
  if (svgTile) {
    const [, encoded, tw, th] = svgTile
    const tile = await sharp(Buffer.from(decodeURIComponent(encoded))).resize(Number(tw), Number(th), { fit: 'fill' }).png().toBuffer()
    return sharp(baseOf(css, w, h, a)).composite([{ input: tile, tile: true }]).png().toBuffer()
  }

  // The CSS ones that are easy to draw again
  switch (pattern) {
    case 'verloop':
      return sharp(gradient(w, h, a, b)).png().toBuffer()
    case 'stippen':
      return sharp(tiled(w, h, a, px(36), px(36), `<circle cx="${px(18)}" cy="${px(18)}" r="${px(5)}" fill="${b}"/>`)).png().toBuffer()
    case 'strepen': {
      const s = px(44)
      return sharp(tiled(w, h, a, s, s, `<path d="M0 ${s / 2} L${s / 2} 0 H${s} L0 ${s} Z M${s / 2} ${s} L${s} ${s / 2} V${s} Z" fill="${b}"/>`)).png().toBuffer()
    }
    case 'ruiten':
    case 'schaakbord': {
      const s = px(pattern === 'ruiten' ? 48 : 20)
      return sharp(tiled(w, h, a, s, s, `<rect x="${s / 2}" width="${s / 2}" height="${s / 2}" fill="${b}"/><rect y="${s / 2}" width="${s / 2}" height="${s / 2}" fill="${b}"/>`)).png().toBuffer()
    }
    case 'diamanten': {
      const s = px(34)
      return sharp(tiled(w, h, a, s, s, `<path d="M${s / 2} 0 L${s} ${s / 2} L${s / 2} ${s} L0 ${s / 2} Z" fill="${b}"/>`)).png().toBuffer()
    }
    case 'regenboog':
      return sharp(
        svgOf(w, h, `<defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="0">${['#f26b6b', '#f7a33b', '#f5e04f', '#5fc39a', '#4ba3e0', '#8b72d9'].map((c, i) => `<stop offset="${i / 5}" stop-color="${c}"/>`).join('')}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#r)"/>`),
      )
        .png()
        .toBuffer()
    case 'sterren': {
      // Glitter: sparkles over a gradient
      const dots = Array.from({ length: Math.round((w * h) / 2600) }, (_, i) => {
        const x = (i * 97.13) % w
        const y = (i * 57.77 + (i % 7) * 13) % h
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(1 + (i % 3)) * scale}" fill="#ffffff" opacity="${0.35 + (i % 4) * 0.15}"/>`
      }).join('')
      return sharp(svgOf(w, h, `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${dots}`)).png().toBuffer()
    }
    case 'zeegolven':
    case 'golven': {
      const s = px(pattern === 'zeegolven' ? 64 : 56)
      const r = s / 2
      const arcs = [0.9, 0.62, 0.34].map((k) => `<circle cx="${r}" cy="${r}" r="${r * k}" fill="none" stroke="${b}" stroke-width="${Math.max(1.5, r * 0.12)}"/>`).join('')
      return sharp(tiled(w, h, a, s, r, `<g>${arcs}</g><g transform="translate(${-r} ${-r / 2})">${arcs}</g><g transform="translate(${r} ${-r / 2})">${arcs}</g>`)).png().toBuffer()
    }
    default:
      // Zigzag, Schotse ruit, Discobal and the like: their two colours
      return sharp(gradient(w, h, a, b, true)).png().toBuffer()
  }
}
