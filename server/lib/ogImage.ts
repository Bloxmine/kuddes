/**
 * Share images ("cards") for link previews: 1200×630 JPEGs in the Kuddes
 * style, drawn with sharp from an SVG plus the member's photo, the Kudde's
 * image or the video's thumbnail. Only public things get a card.
 */
import { RECIPE_CATEGORIES, formatMinutes, recipeHref, type RecipeCategory } from '../../shared/recipes'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { and, count, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { threadHref } from '../../shared/forum'
import { KUDDE_CATEGORIES, isKuddeCategory } from '../../shared/kuddes'
import { config } from '../config'
import { serverDomain } from './siteSettings'
import { db } from '../db/client'
import { forumPosts, forumSections, forumThreads, friendships, games, glitters, kuddeEvents, kuddeMembers, kuddes, mediaItems, mediaReviews, news, recipes, users, videoRatings, videos } from '../db/schema'
import { GAMES, isGameKind, type GameKind } from '../../shared/games'
import { isMediaKind, mediaHref, type MediaKind } from '../../shared/media'
import { COVER_SIZE, coverSvg } from './coverArt'
import { plainText, TAGLINE } from './seo'
import { shareCardOf } from './shareCard'
import { patternPicture } from './patternRaster'
import { luminance as luminanceOf } from '../../shared/customization'

const W = 1200
const H = 630
const FONT = "'DejaVu Sans', 'Liberation Sans', Arial, sans-serif"
const NAVY = '#13324f'
const MUTED = '#4a6378'
const LINK = '#1d74bd'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Rough width of a line in DejaVu Sans, to wrap text without measuring. */
const textWidth = (s: string, size: number, bold: boolean) => [...s].length * size * (bold ? 0.63 : 0.56)

function wrap(text: string, width: number, size: number, maxLines: number, bold = false): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (textWidth(next, size, bold) <= width || !line) {
      line = next
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  // Words longer than the line: cut them
  const fitted = lines.map((l) => {
    let out = l
    while (textWidth(out, size, bold) > width && out.length > 1) out = out.slice(0, -1)
    return out === l ? l : `${out.slice(0, -1)}…`
  })
  if (fitted.length <= maxLines) return fitted
  const kept = fitted.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (textWidth(`${last}…`, size, bold) > width && last.includes(' ')) last = last.slice(0, last.lastIndexOf(' '))
  kept[maxLines - 1] = `${last.replace(/[\s,.;:–-]+$/, '')}…`
  return kept
}

type Line = { text: string; size: number; bold?: boolean; color?: string; gap?: number; maxLines?: number }

/** Lines of text from (x, y) down; returns the SVG and where it ended. */
function textBlock(x: number, y: number, width: number, lines: Line[]): { svg: string; bottom: number } {
  let cursor = y
  let svg = ''
  for (const l of lines) {
    cursor += l.gap ?? 0
    for (const part of wrap(l.text, width, l.size, l.maxLines ?? 1, l.bold)) {
      cursor += l.size * 1.22
      svg += `<text x="${x}" y="${cursor.toFixed(0)}" font-family="${FONT}" font-size="${l.size}" font-weight="${l.bold ? 700 : 400}" fill="${l.color ?? MUTED}">${esc(part)}</text>`
    }
  }
  return { svg, bottom: cursor }
}

const SKY = `
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#bfe4fc"/><stop offset="0.55" stop-color="#8ccbf5"/><stop offset="1" stop-color="#4ba3e0"/>
  </linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#78c1f0"/><stop offset="0.5" stop-color="#4ba3e0"/><stop offset="1" stop-color="#3a8fd0"/>
  </linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="12"/></filter>`

const CLOUDS = `
  <g fill="#ffffff" opacity="0.55">
    <ellipse cx="140" cy="600" rx="220" ry="70"/><ellipse cx="330" cy="625" rx="200" ry="60"/>
    <ellipse cx="1040" cy="40" rx="230" ry="60"/><ellipse cx="880" cy="10" rx="170" ry="45"/>
    <ellipse cx="1120" cy="610" rx="180" ry="55"/>
  </g>`

/** The white box with a glossy title bar that every card is drawn in. */
function frame(label: string, body: string, footer: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${SKY}</defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${CLOUDS}
  <rect x="58" y="70" width="1084" height="510" rx="20" fill="#0b3a66" opacity="0.35" filter="url(#shadow)"/>
  <rect x="50" y="50" width="1100" height="520" rx="20" fill="#ffffff" stroke="#a9d2ef" stroke-width="2"/>
  <path d="M50 70 a20 20 0 0 1 20 -20 h1060 a20 20 0 0 1 20 20 v54 h-1100 z" fill="url(#bar)"/>
  <path d="M50 70 a20 20 0 0 1 20 -20 h1060 a20 20 0 0 1 20 20 v20 h-1100 z" fill="url(#gloss)"/>
  <text x="84" y="100" font-family="${FONT}" font-size="30" font-weight="700" fill="#ffffff">${esc(label)}</text>
  ${body}
  <line x1="80" y1="512" x2="1120" y2="512" stroke="#e1edf6" stroke-width="2"/>
  <text x="84" y="550" font-family="${FONT}" font-size="24" fill="${LINK}">${esc(footer)}</text>
</svg>`
}

/** The picture spot on the left, with a white passe-partout like avatars on the site. */
const photoFrame = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x - 8}" y="${y - 8}" width="${w + 16}" height="${h + 16}" rx="14" fill="#ffffff" stroke="#c6dcec" stroke-width="2"/>`

async function logo(height: number) {
  return sharp(path.resolve('public/kuddes-logo.png')).resize({ height }).png().toBuffer()
}

/** An image from uploads/, cropped to w×h with rounded corners; null if it's gone. */
async function uploadImage(relative: string | null, w: number, h: number, radius = 8): Promise<Buffer | null> {
  if (!relative) return null
  const file = path.join(config.uploadDir, relative)
  if (!file.startsWith(config.uploadDir + path.sep)) return null
  const input = await readFile(file).catch(() => null)
  if (!input) return null
  const mask = Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" fill="#fff"/></svg>`)
  return sharp(input).resize(w, h, { fit: 'cover', position: 'attention' }).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

/** Same colours as the placeholder avatars on the site (src/lib/placeholder.ts). */
function seededHues(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h >>>= 0
  const hue = h % 360
  return [hue, (hue + 30 + (h % 40)) % 360]
}

function initials(name: string) {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
  if (!parts[0]) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/** Initials on a gradient, for members and Kuddes without a picture. */
function placeholder(x: number, y: number, size: number, seed: string, text: string) {
  const [a, b] = seededHues(seed)
  return `<defs><linearGradient id="ph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${a}, 55%, 62%)"/><stop offset="1" stop-color="hsl(${b}, 60%, 45%)"/></linearGradient></defs>
  <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="8" fill="url(#ph)"/>
  <text x="${x + size / 2}" y="${y + size / 2 + size * 0.14}" text-anchor="middle" font-family="${FONT}" font-size="${size * 0.38}" font-weight="700" fill="#ffffff">${esc(text)}</text>`
}

type Layer = { input: Buffer; left: number; top: number }

async function render(svg: string, layers: Layer[] = []): Promise<Buffer> {
  const mark = await logo(46)
  const { width = 0 } = await sharp(mark).metadata()
  return sharp(Buffer.from(svg))
    .composite([...layers, { input: mark, left: 1150 - 24 - width, top: 64 }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}

const host = () => serverDomain()
const nl = (n: number) => n.toLocaleString('nl-NL')
const plural = (n: number, one: string, many: string) => `${nl(n)} ${n === 1 ? one : many}`

// ------------------------------------------------------------------ cards

/** The general card: the logo on the sky, for pages without their own. */
async function siteCard(): Promise<Buffer> {
  const pills = ['Knuffels', 'WieWatWaar', 'Kuddes', 'Video', 'Forum']
  let x = 600 - (pills.reduce((sum, p) => sum + textWidth(p, 26, true) + 56, 0) - 16) / 2
  const pillSvg = pills
    .map((p) => {
      const w = textWidth(p, 26, true) + 40
      const svg = `<rect x="${x}" y="468" width="${w}" height="50" rx="25" fill="#ffffff" opacity="0.92"/><text x="${x + w / 2}" y="502" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="${LINK}">${esc(p)}</text>`
      x += w + 16
      return svg
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${SKY}</defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${CLOUDS}
  <text x="600" y="412" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#0f4f86" opacity="0.25" transform="translate(2 3)">${esc(TAGLINE)}</text>
  <text x="600" y="412" text-anchor="middle" font-family="${FONT}" font-size="40" font-weight="700" fill="#ffffff">${esc(TAGLINE)}</text>
  ${pillSvg}
</svg>`
  const big = await logo(200)
  const { width = 0 } = await sharp(big).metadata()
  return sharp(Buffer.from(svg))
    // The word "kuddes" sits right of the logo's middle (the blips are on the left): centre the word
    .composite([{ input: big, left: Math.round(600 - width * 0.573), top: 120 }])
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer()
}

async function profileCard(username: string): Promise<Buffer | null> {
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1)
  if (!u || u.blockedAt) return null
  const [[{ friends }], [{ memberships }]] = await Promise.all([
    db
      .select({ friends: count() })
      .from(friendships)
      .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, u.id), eq(friendships.addresseeId, u.id)))),
    db.select({ memberships: count() }).from(kuddeMembers).where(eq(kuddeMembers.userId, u.id)),
  ])
  // A link preview is seen without an account: only with the photo if the member allows that
  const photo = u.avatarPublic ? await uploadImage(u.avatarPath, 330, 330) : null
  const text = textBlock(470, 150, 640, [
    { text: u.name, size: 56, bold: true, color: NAVY, maxLines: 2 },
    ...(u.nickname && u.nickname !== u.name ? [{ text: u.nickname, size: 30, color: LINK, gap: 6 }] : []),
    { text: `@${u.username}${u.city ? ` · ${u.city}` : ''}`, size: 30, gap: 8 },
    { text: `${plural(friends, 'vriend', 'vrienden')} · ${plural(memberships, 'Kudde', 'Kuddes')}`, size: 28, gap: 26 },
    { text: `Lid sinds ${u.createdAt.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' })}`, size: 28, gap: 6 },
  ])
  const body = `${photoFrame(100, 160, 330, 330)}${photo ? '' : placeholder(100, 160, 330, u.username, initials(u.name))}${text.svg}`
  return render(frame('Profiel', body, `${host()}/profiel/${u.username}`), photo ? [{ input: photo, left: 100, top: 160 }] : [])
}

async function kuddeCard(slug: string): Promise<Buffer | null> {
  const [k] = await db.select().from(kuddes).where(eq(kuddes.slug, slug.toLowerCase())).limit(1)
  if (!k) return null
  const [{ n }] = await db.select({ n: count() }).from(kuddeMembers).where(eq(kuddeMembers.kuddeId, k.id))
  const category = isKuddeCategory(k.category) ? KUDDE_CATEGORIES[k.category].name : 'Kuddes'
  const image = await uploadImage(k.imagePath, 330, 330)
  const text = textBlock(470, 150, 640, [
    { text: k.name, size: 54, bold: true, color: NAVY, maxLines: 2 },
    { text: [k.subcategory ?? category, k.city].filter(Boolean).join(' · '), size: 30, color: LINK, gap: 6 },
    ...(k.description ? [{ text: plainText(k.description, 200), size: 26, gap: 16, maxLines: 3 }] : []),
    { text: `${plural(n, 'lid', 'leden')}${k.visibility === 'besloten' ? ' · besloten' : ''}`, size: 28, bold: true, gap: 18 },
  ])
  const body = `${photoFrame(100, 160, 330, 330)}${image ? '' : placeholder(100, 160, 330, k.slug, initials(k.name))}${text.svg}`
  return render(frame(`Kudde · ${category}`, body, `${host()}/kuddes/${k.slug}`), image ? [{ input: image, left: 100, top: 160 }] : [])
}

async function videoCard(publicId: string): Promise<Buffer | null> {
  const [row] = await db
    .select({ v: videos, name: users.name, blockedAt: users.blockedAt })
    .from(videos)
    .innerJoin(users, eq(users.id, videos.userId))
    .where(and(eq(videos.publicId, publicId), eq(videos.status, 'klaar'), inArray(videos.visibility, ['openbaar', 'verborgen'])))
  if (!row || row.blockedAt) return null
  const { v } = row
  const [{ avg, n }] = await db
    .select({ avg: sql<number | null>`avg(${videoRatings.stars})::float`, n: count() })
    .from(videoRatings)
    .where(eq(videoRatings.videoId, v.id))
  const thumb = await uploadImage(v.thumbPath, 560, 315, 6)
  const minutes = `${Math.floor(v.duration / 60)}:${String(v.duration % 60).padStart(2, '0')}`
  const stars = avg ? `${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}` : ''
  const text = textBlock(700, 150, 410, [
    { text: v.title, size: 42, bold: true, color: NAVY, maxLines: 3 },
    { text: `door ${row.name}`, size: 28, color: LINK, gap: 10 },
    { text: `${plural(v.views, 'keer', 'keer')} bekeken`, size: 26, gap: 18 },
    ...(stars ? [{ text: `${stars}  (${nl(n)})`, size: 30, color: '#e8a100', gap: 8 }] : []),
  ])
  const body = `${photoFrame(100, 175, 560, 315)}
    ${thumb ? '' : `<rect x="100" y="175" width="560" height="315" rx="6" fill="#1f2f3d"/>`}
    ${text.svg}`
  const overlay = Buffer.from(`<svg width="560" height="315" xmlns="http://www.w3.org/2000/svg">
    <circle cx="280" cy="157" r="54" fill="#000000" opacity="0.45"/>
    <circle cx="280" cy="157" r="54" fill="none" stroke="#ffffff" stroke-width="5"/>
    <path d="M262 127 L308 157 L262 187 Z" fill="#ffffff"/>
    <rect x="${548 - textWidth(minutes, 24, true) - 20}" y="268" width="${textWidth(minutes, 24, true) + 20}" height="36" rx="6" fill="#000000" opacity="0.75"/>
    <text x="${538}" y="294" text-anchor="end" font-family="${FONT}" font-size="24" font-weight="700" fill="#ffffff">${minutes}</text>
  </svg>`)
  return render(frame('Kuddes Video', body, `${host()}/video/kijk?v=${v.publicId}`), [
    ...(thumb ? [{ input: thumb, left: 100, top: 175 }] : []),
    { input: overlay, left: 100, top: 175 },
  ])
}

async function recipeCard(key: string): Promise<Buffer | null> {
  const id = Number(key)
  if (!Number.isInteger(id)) return null
  const [row] = await db.select({ r: recipes, name: users.name, blockedAt: users.blockedAt }).from(recipes).innerJoin(users, eq(users.id, recipes.userId)).where(eq(recipes.id, id))
  if (!row || row.blockedAt) return null
  const { r } = row
  const photo = await uploadImage(r.photoPath, 440, 330, 6)
  const category = RECIPE_CATEGORIES[r.category as RecipeCategory]?.name ?? 'Recept'
  const text = textBlock(600, 150, 510, [
    { text: r.title, size: 44, bold: true, color: NAVY, maxLines: 3 },
    { text: `door ${row.name}`, size: 28, color: LINK, gap: 10 },
    { text: `${formatMinutes(r.minutes)} · ${plural(r.servings, 'persoon', 'personen')}`, size: 28, gap: 20 },
    { text: category, size: 26, gap: 8 },
    ...(r.likes ? [{ text: `${nl(r.likes)}× lekker!`, size: 28, color: '#e8466a', bold: true, gap: 14 }] : []),
  ])
  const body = `${photoFrame(100, 165, 440, 330)}
    ${photo ? '' : `<rect x="100" y="165" width="440" height="330" rx="6" fill="#f3e3c8"/>`}
    ${text.svg}`
  return render(frame('Kuddes Recepten', body, `${host()}${recipeHref(r)}`), photo ? [{ input: photo, left: 100, top: 165 }] : [])
}

async function threadCard(id: number): Promise<Buffer | null> {
  if (!Number.isInteger(id)) return null
  const [row] = await db
    .select({ t: forumThreads, section: forumSections.name, sectionSlug: forumSections.slug, author: users.name })
    .from(forumThreads)
    .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
    .leftJoin(users, eq(users.id, forumThreads.userId))
    .where(eq(forumThreads.id, id))
  if (!row) return null
  const { t } = row
  const replies = Math.max(0, t.postCount - 1)
  // A speech bubble with the number of reactions
  const bubble = `
    <defs><linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0f7"/><stop offset="1" stop-color="#3a8fd0"/></linearGradient></defs>
    <path d="M120 170 h250 a30 30 0 0 1 30 30 v170 a30 30 0 0 1 -30 30 h-150 l-60 55 v-55 h-40 a30 30 0 0 1 -30 -30 v-170 a30 30 0 0 1 30 -30 z" fill="url(#bubble)" stroke="#2f7fbf" stroke-width="3"/>
    <text x="245" y="300" text-anchor="middle" font-family="${FONT}" font-size="${replies > 999 ? 64 : 84}" font-weight="700" fill="#ffffff">${nl(replies)}</text>
    <text x="245" y="350" text-anchor="middle" font-family="${FONT}" font-size="26" font-weight="700" fill="#ffffff">${replies === 1 ? 'reactie' : 'reacties'}</text>`
  const text = textBlock(470, 150, 640, [
    { text: t.title, size: 48, bold: true, color: NAVY, maxLines: 3 },
    { text: row.section, size: 30, color: LINK, gap: 10 },
    { text: `door ${row.author ?? 'oud lid'} · ${plural(t.views, 'keer', 'keer')} bekeken`, size: 26, gap: 12 },
    ...(t.tags.length ? [{ text: t.tags.map((x) => `#${x}`).join('  '), size: 26, color: LINK, gap: 12 }] : []),
  ])
  return render(frame('Forum', bubble + text.svg, `${host()}${threadHref(row.sectionSlug, t.id, t.title)}`))
}

async function newsCard(slug: string): Promise<Buffer | null> {
  const [n] = await db
    .select()
    .from(news)
    .where(and(eq(news.slug, slug), eq(news.published, true), lte(news.publishedAt, new Date())))
  if (!n) return null
  const label = n.label && n.label !== 'Nieuws & updates' ? n.label : ''
  // With a banner: the picture on the left, the text next to it (like a recipe)
  const banner = await uploadImage(n.bannerPath, 440, 330, 6)
  const x = banner ? 600 : 100
  const text = textBlock(x, label ? 150 : 140, banner ? 510 : 1000, [
    ...(label ? [{ text: label.toUpperCase(), size: 24, bold: true, color: LINK }] : []),
    { text: n.title, size: banner ? 46 : 56, bold: true, color: NAVY, maxLines: banner ? 3 : 2, gap: label ? 8 : 0 },
    { text: plainText(n.summary || n.body, banner ? 160 : 260), size: banner ? 26 : 30, gap: 18, maxLines: 3 },
    { text: n.publishedAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' }), size: 24, gap: 14 },
  ])
  const body = banner ? `${photoFrame(100, 165, 440, 330)}${text.svg}` : text.svg
  return render(frame('Nieuws & updates', body, `${host()}/nieuws/${n.slug}`), banner ? [{ input: banner, left: 100, top: 165 }] : [])
}

async function eventCard(id: number): Promise<Buffer | null> {
  if (!Number.isInteger(id)) return null
  const [row] = await db.select({ e: kuddeEvents, k: kuddes }).from(kuddeEvents).innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId)).where(eq(kuddeEvents.id, id))
  // Events of closed Kuddes are for members only
  if (!row || row.k.visibility === 'besloten') return null
  const { e, k } = row
  const part = (o: Intl.DateTimeFormatOptions) => e.startsAt.toLocaleString('nl-NL', { ...o, timeZone: 'Europe/Amsterdam' })
  // A tear-off calendar sheet with the date
  const sheet = `
    <rect x="110" y="170" width="300" height="310" rx="18" fill="#ffffff" stroke="#c6dcec" stroke-width="3"/>
    <path d="M110 188 a18 18 0 0 1 18 -18 h264 a18 18 0 0 1 18 18 v62 h-300 z" fill="#e2474b"/>
    <text x="260" y="228" text-anchor="middle" font-family="${FONT}" font-size="34" font-weight="700" fill="#ffffff">${esc(part({ month: 'long' }).toUpperCase())}</text>
    <text x="260" y="385" text-anchor="middle" font-family="${FONT}" font-size="130" font-weight="700" fill="${NAVY}">${esc(part({ day: 'numeric' }))}</text>
    <text x="260" y="448" text-anchor="middle" font-family="${FONT}" font-size="30" fill="${MUTED}">${esc(part({ weekday: 'long' }))}</text>`
  const text = textBlock(470, 150, 640, [
    { text: e.title, size: 50, bold: true, color: NAVY, maxLines: 2 },
    { text: `${part({ hour: '2-digit', minute: '2-digit' })} uur${e.location ? ` · ${e.location}` : ''}`, size: 30, color: LINK, gap: 10 },
    ...(e.description ? [{ text: plainText(e.description, 200), size: 26, gap: 14, maxLines: 3 }] : []),
    { text: `Een evenement van ${k.name}`, size: 26, bold: true, gap: 14 },
  ])
  return render(frame('Evenement', sheet + text.svg, `${host()}/kuddes/${k.slug}/evenementen/${e.id}`))
}

/**
 * The profielkaartje as a picture, like a business card: in the colours of
 * the profile design (only the member's choice of what's on it), with an
 * invitation to join. Only when the card is switched on.
 */
async function shareCardImage(username: string): Promise<Buffer | null> {
  const card = await shareCardOf(username)
  if (!card) return null
  const l = card.look
  const [u] = await db.select({ avatarPath: users.avatarPath }).from(users).where(eq(users.username, card.username))
  const photo = card.avatarUrl ? await uploadImage(u?.avatarPath ?? null, 270, 270, 14) : null

  // The design's background: its pattern (or its two colours), with its photo over it
  const layers: Layer[] = []
  const bg = await patternPicture(l.pattern ?? 'verloop', l.background1, l.background2, W, H)
  const bgPhoto = l.image && /^\/uploads\/backgrounds\//.test(l.image.url) ? await uploadImage(l.image.url.replace(/^\/uploads\//, ''), W, H, 0) : null
  // The title bar, rounded at the top like the card
  const BAR_H = 150
  const barMask = Buffer.from(`<svg width="1100" height="${BAR_H}"><path d="M0 26 a26 26 0 0 1 26 -26 h1048 a26 26 0 0 1 26 26 v${BAR_H - 26} h-1100 z" fill="#fff"/></svg>`)
  const h = l.header
  const barArt = h && h.pattern !== 'standaard' ? await patternPicture(h.pattern, h.color, h.color2, 1100, BAR_H, 0.6) : await patternPicture('verloop', h?.color ?? l.accent, h?.color2 ?? l.box, 1100, BAR_H)
  const bar = await sharp(barArt).composite([{ input: barMask, blend: 'dest-in' }]).png().toBuffer()
  if (bgPhoto) layers.push({ input: bgPhoto, left: 0, top: 0 })

  // The name in the design's font, colour and shadow (an outline, or a soft shadow)
  const font = esc(l.nameFont.replace(/var\([^)]*\)/g, "'DejaVu Sans'"))
  const nameLines = wrap(card.name, 620, 52, 1, true)
  const nameSize = nameLines[0] && nameLines[0].length < card.name.length ? 42 : 52
  const nameX = 400
  const outline = h?.shadow === 'omlijning'
  const nameText = (extra: string) => `<text x="${nameX}" y="${50 + (card.nickname !== card.name ? 84 : 98)}" font-family="${font}, ${FONT}" font-size="${nameSize}" font-weight="700" ${extra}>${esc(card.name)}</text>`
  const name = [
    l.namePlate ? `<rect x="${nameX - 16}" y="${50 + 34}" width="${Math.min(720, textWidth(card.name, nameSize, true) + 32)}" height="${card.nickname !== card.name ? 92 : 76}" rx="12" fill="${l.namePlate.startsWith('rgba(0') ? '#000000' : '#ffffff'}" opacity="${l.namePlate.startsWith('rgba(0') ? 0.5 : 0.78}"/>` : '',
    !outline && l.nameShadow !== 'none' ? nameText(`fill="#000000" opacity="0.35" transform="translate(2 3)"`) : '',
    nameText(`fill="${l.nameColor}"${outline ? ` stroke="${luminanceOf(l.nameColor) > 0.18 ? '#000000' : '#ffffff'}" stroke-width="3" paint-order="stroke"` : ''}`),
    card.nickname && card.nickname !== card.name ? `<text x="${nameX}" y="${50 + 124}" font-family="${font}, ${FONT}" font-size="28" font-weight="700" fill="${l.nameColor}" opacity="0.9">${esc(card.nickname)}</text>` : '',
  ].join('')

  const bits = [card.city, card.age ? `${card.age} jaar` : null].filter(Boolean).join(' · ')
  const facts = [...card.interests.map((i) => `${i.label}: ${i.value}`), ...(card.music.length ? [`Muziek: ${card.music.join(', ')}`] : []), ...card.gamerTags.map((g) => `${g.label}: ${g.value}`)]
  const text = textBlock(nameX, 250, 710, [
    ...(bits ? [{ text: bits, size: 26, color: l.text }] : []),
    ...(card.message ? [{ text: `“${card.message}”`, size: 28, color: l.text, gap: bits ? 14 : 0, maxLines: 2 }] : []),
    ...facts.slice(0, card.message ? 3 : 5).map((f, i) => ({ text: f, size: 23, color: l.text, gap: i === 0 && (bits || card.message) ? 16 : 4, maxLines: 1 })),
  ])
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><filter id="cardshadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-opacity="0.3"/></filter></defs>
  <rect x="50" y="50" width="1100" height="530" rx="26" fill="${l.surface}" stroke="${l.box}" stroke-width="3" filter="url(#cardshadow)"/>
</svg>`
  const over = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${photo ? '' : placeholder(90, 110, 270, card.username, initials(card.name))}
  ${name}
  ${text.svg}
  <line x1="90" y1="505" x2="1110" y2="505" stroke="${l.box}" stroke-width="2" opacity="0.6"/>
  <text x="96" y="548" font-family="${FONT}" font-size="26" font-weight="700" fill="${l.title}">Word ook lid van Kuddes!</text>
  <text x="1104" y="548" text-anchor="end" font-family="${FONT}" font-size="24" fill="${l.link}">${esc(`${host()}/kaartje/${card.username}`)}</text>
</svg>`
  const mark = await logo(40)
  const { width = 0 } = await sharp(mark).metadata()
  return sharp(bg)
    .composite([
      ...layers,
      { input: Buffer.from(svg), left: 0, top: 0 },
      { input: bar, left: 50, top: 50 },
      // The white frame round the photo, under the photo (drawn over it, it hid the photo)
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="82" y="102" width="286" height="286" rx="20" fill="${l.surface}" stroke="${l.box}" stroke-width="3"/></svg>`), left: 0, top: 0 },
      ...(photo ? [{ input: photo, left: 90, top: 110 }] : []),
      { input: Buffer.from(over), left: 0, top: 0 },
      { input: mark, left: 1150 - 30 - width, top: 64 },
    ])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
}


// ------------------------------------------------------------------ stars

/** Five stars, gold up to `rating` (halves too), grey after. */
function starsSvg(x: number, y: number, size: number, rating: number): string {
  const star = (cx: number) => {
    const pts = Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 === 0 ? size / 2 : size / 4.6
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(y + size / 2 + r * Math.sin(a)).toFixed(1)}`
    })
    return pts.join(' ')
  }
  const gap = size * 1.12
  let out = ''
  for (let i = 0; i < 5; i++) {
    const cx = x + size / 2 + i * gap
    const fill = rating >= i + 1 ? 1 : rating >= i + 0.5 ? 0.5 : 0
    out += `<polygon points="${star(cx)}" fill="#d9dde1"/>`
    if (fill === 1) out += `<polygon points="${star(cx)}" fill="#f0a818" stroke="#d98c00" stroke-width="1.5"/>`
    if (fill === 0.5) out += `<clipPath id="half${i}"><rect x="${cx - size / 2}" y="${y}" width="${size / 2}" height="${size}"/></clipPath><polygon points="${star(cx)}" fill="#f0a818" clip-path="url(#half${i})"/>`
  }
  return out
}
const starsWidth = (size: number) => size * 1.12 * 4 + size

/** A picture from uploads/ or public/ fitted inside w×h on white (glitterplaatjes, icons). */
async function containImage(file: string, w: number, h: number, background = '#ffffff'): Promise<Buffer | null> {
  const input = await readFile(file).catch(() => null)
  if (!input) return null
  return sharp(input, { animated: false }).resize(w, h, { fit: 'contain', background, kernel: w > 64 && file.includes('/icons/') ? 'nearest' : 'lanczos3' }).png().toBuffer().catch(() => null)
}

/** Up to most×most pictures in a grid inside (x, y, w, h), as layers. */
async function collage(all: (string | null)[], x: number, y: number, w: number, h: number, most: number, gap = 10, fit: 'cover' | 'contain' = 'cover') {
  // As many spots as there are pictures (up to `most` columns): no empty tiles on a quiet day
  const paths = all.filter(Boolean)
  const n = Math.max(1, Math.min(paths.length, most * most))
  const cols = n === 1 ? 1 : n <= 4 ? 2 : Math.min(most, 3)
  const rows = Math.ceil(n / cols)
  const cw = Math.floor((w - gap * (cols - 1)) / cols)
  const ch = Math.floor((h - gap * (rows - 1)) / rows)
  const layers: Layer[] = []
  let svg = ''
  for (let i = 0; i < n; i++) {
    const cx = x + (i % cols) * (cw + gap)
    const cy = y + Math.floor(i / cols) * (ch + gap)
    const rel = paths[i] ?? null
    const img = rel ? (fit === 'cover' ? await uploadImage(rel, cw, ch, 6) : await containImage(path.join(config.uploadDir, rel), cw, ch)) : null
    if (img) layers.push({ input: img, left: cx, top: cy })
    svg += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="6" fill="${img ? '#ffffff' : '#e6f1fa'}" stroke="#c6dcec" stroke-width="2"/>`
  }
  return { svg, layers }
}

// ------------------------------------------------------------------ recensies

const MEDIA_LABEL: Record<MediaKind, string> = { boeken: 'Boek', films: 'Film', series: 'Serie', muziek: 'Album', spellen: 'Spel', drank: 'Drankje' }

/**
 * A title in Recensies: the photo (or else the drawn cover on a plank), the
 * stars, what it is and the description. "12-r34": one member's review of it,
 * with their stars and the start of what they wrote.
 */
async function mediaCard(key: string): Promise<Buffer | null> {
  const [, idPart, reviewPart] = /^(\d+)(?:-r(\d+))?$/.exec(key) ?? []
  if (!idPart) return null
  const [m] = await db.select().from(mediaItems).where(eq(mediaItems.id, Number(idPart)))
  if (!m || !isMediaKind(m.kind)) return null
  const kind = m.kind
  let review: { rating: number; text: string; name: string } | null = null
  if (reviewPart) {
    const [r] = await db
      .select({ rating: mediaReviews.rating, text: mediaReviews.text, name: users.nickname, blockedAt: users.blockedAt })
      .from(mediaReviews)
      .innerJoin(users, eq(users.id, mediaReviews.userId))
      .where(and(eq(mediaReviews.id, Number(reviewPart)), eq(mediaReviews.itemId, m.id)))
    if (r && !r.blockedAt) review = r
  }

  // The picture spot: a shop shelf with a plank
  const spot = { x: 90, y: 150, w: 380, h: 350 }
  const layers: Layer[] = []
  let picture = `
    <defs><linearGradient id="spot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef6fc"/><stop offset="1" stop-color="#cfe4f3"/></linearGradient>
    <linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79866"/><stop offset="1" stop-color="#7d552f"/></linearGradient></defs>
    <rect x="${spot.x}" y="${spot.y}" width="${spot.w}" height="${spot.h}" rx="14" fill="url(#spot)"/>
    <path d="M${spot.x} ${spot.y + spot.h - 26} h${spot.w} v12 a14 14 0 0 1 -14 14 h-${spot.w - 28} a14 14 0 0 1 -14 -14 z" fill="url(#plank)"/>`
  // Below the label in the corner, standing on the plank
  const photo = m.photoPath ? await containImage(path.join(config.uploadDir, m.photoPath), 300, 264, '#00000000') : null
  if (photo) {
    const meta = await sharp(photo).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }).catch(() => null)
    const img = meta?.data ?? photo
    const iw = meta?.info.width ?? 300
    const ih = meta?.info.height ?? 264
    const left = Math.round(spot.x + (spot.w - iw) / 2)
    const top = Math.round(spot.y + spot.h - 26 - ih)
    picture += `<rect x="${left + 6}" y="${top + 8}" width="${iw}" height="${ih}" rx="4" fill="#000" opacity="0.25"/>`
    layers.push({ input: img, left, top })
  } else {
    const [cw, ch] = COVER_SIZE[kind]
    const scale = Math.min(270 / cw, 290 / ch)
    picture += coverSvg({ ...m, kind }, spot.x + (spot.w - cw * scale) / 2, spot.y + spot.h - 26 - ch * scale, scale)
  }

  const x = 510
  const width = 600
  const meta = [m.creator, m.year, m.genre].filter(Boolean).join(' · ')
  const head = textBlock(x, 138, width, [
    { text: m.title, size: m.title.length > 34 ? 42 : 50, bold: true, color: NAVY, maxLines: 2 },
    ...(meta ? [{ text: meta, size: 27, color: LINK, gap: 6 }] : []),
  ])
  let y = head.bottom + 22
  // What it is, as a label in the corner of the picture spot
  const tag = MEDIA_LABEL[kind].toUpperCase()
  picture += `<rect x="${spot.x + 14}" y="${spot.y + 14}" width="${[...tag].length * 18 * 0.74 + 28}" height="32" rx="16" fill="#ffffff" stroke="#a9d2ef" stroke-width="2"/>
    <text x="${spot.x + 27}" y="${spot.y + 36}" font-family="${FONT}" font-size="18" font-weight="700" fill="${LINK}">${esc(tag)}</text>`
  let body = head.svg
  if (review) {
    body += starsSvg(x, y, 40, review.rating)
    body += `<text x="${x + starsWidth(40) + 16}" y="${y + 31}" font-family="${FONT}" font-size="28" font-weight="700" fill="${NAVY}">volgens ${esc(review.name)}</text>`
    y += 58
    if (review.text) {
      const quote = textBlock(x + 22, y - 8, width - 22, [{ text: `“${plainText(review.text, 220)}”`, size: 27, color: '#2b3f50', maxLines: 4 }])
      body += `<rect x="${x}" y="${y}" width="6" height="${quote.bottom - y + 8}" rx="3" fill="#a9d2ef"/>${quote.svg}`
    }
  } else if (m.reviews > 0) {
    body += starsSvg(x, y, 44, Math.round(m.rating * 2) / 2)
    body += `<text x="${x + starsWidth(44) + 18}" y="${y + 36}" font-family="${FONT}" font-size="38" font-weight="700" fill="${NAVY}">${m.rating.toFixed(1).replace('.', ',')}</text>`
    body += `<text x="${x + starsWidth(44) + 18 + textWidth(m.rating.toFixed(1), 38, true) + 14}" y="${y + 34}" font-family="${FONT}" font-size="24" fill="${MUTED}">${esc(plural(m.reviews, 'recensie', 'recensies'))}</text>`
    y += 64
    if (m.description) body += textBlock(x, y - 30, width, [{ text: plainText(m.description, 240), size: 25, maxLines: 4 }]).svg
  } else {
    body += `<text x="${x}" y="${y + 26}" font-family="${FONT}" font-size="26" font-weight="700" fill="${MUTED}">Nog geen recensies: schrijf jij de eerste?</text>`
    y += 40
    if (m.description) body += textBlock(x, y - 8, width, [{ text: plainText(m.description, 240), size: 25, maxLines: 4 }]).svg
  }
  return render(frame('Kuddes Recensies', picture + body, `${host()}${mediaHref(m)}`), layers)
}

// ------------------------------------------------------------------ sections

/** Big numbers under the description: "152 titels · 40 recensies". */
const statsLine = (parts: string[]) => parts.filter(Boolean).join(' · ')

type Section = { title: string; description: string; picture: () => Promise<{ svg: string; layers: Layer[] }>; stats: () => Promise<string>; path: string }

const SECTIONS: Record<string, Section> = {
  recensies: {
    title: 'Recensies',
    description: 'Boeken, films, series, muziek, spellen en drankjes, beoordeeld door de leden. Geef sterren en zet het in de kast op je profiel.',
    path: '/recensies',
    picture: async () => {
      // The best-rated covers (or photos), standing on a plank
      const rows = await db.select().from(mediaItems).orderBy(desc(mediaItems.reviews), desc(mediaItems.rating), mediaItems.id).limit(3)
      let svg = `<defs><linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c79866"/><stop offset="1" stop-color="#7d552f"/></linearGradient></defs>
        <rect x="90" y="150" width="420" height="350" rx="14" fill="#e6f1fa"/><rect x="90" y="462" width="420" height="24" rx="6" fill="url(#plank)"/>`
      rows.forEach((m, i) => {
        if (!isMediaKind(m.kind)) return
        const [cw, ch] = COVER_SIZE[m.kind]
        const scale = Math.min(124 / cw, 280 / ch)
        svg += coverSvg({ ...m, kind: m.kind }, 104 + i * 136 + (124 - cw * scale) / 2, 462 - ch * scale, scale)
      })
      return { svg, layers: [] }
    },
    stats: async () => {
      const [[{ items }], [{ reviews }]] = await Promise.all([db.select({ items: count() }).from(mediaItems), db.select({ reviews: count() }).from(mediaReviews)])
      return statsLine([plural(items, 'titel', 'titels'), reviews ? plural(reviews, 'recensie', 'recensies') : ''])
    },
  },
  recepten: {
    title: 'Recepten',
    description: 'Van hutspot tot tompoucen: recepten van de leden, met foto’s en stap voor stap uitgelegd.',
    path: '/recepten',
    picture: async () => {
      const rows = await db.select({ p: recipes.photoPath }).from(recipes).innerJoin(users, eq(users.id, recipes.userId)).where(and(sql`${recipes.photoPath} is not null`, isNull(users.blockedAt))).orderBy(desc(recipes.likes), desc(recipes.id)).limit(4)
      return collage(rows.map((r) => r.p), 90, 150, 420, 350, 2)
    },
    stats: async () => plural((await db.select({ n: count() }).from(recipes))[0].n, 'recept', 'recepten'),
  },
  video: {
    title: 'Kuddes Video',
    description: 'Video’s van de leden: bekijk, beoordeel en reageer, of upload je eigen video.',
    path: '/video',
    picture: async () => {
      const rows = await db
        .select({ p: videos.thumbPath })
        .from(videos)
        .innerJoin(users, eq(users.id, videos.userId))
        .where(and(eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar'), isNull(users.blockedAt)))
        .orderBy(desc(videos.views))
        .limit(4)
      return collage(rows.map((r) => r.p), 90, 170, 440, 250, 2)
    },
    stats: async () => plural((await db.select({ n: count() }).from(videos).where(and(eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar'))))[0].n, 'video', 'video’s'),
  },
  glitterplaatjes: {
    title: 'Glitterplaatjes',
    description: 'Goedemorgen, fijn weekend, beterschap of gefeliciteerd: glitterplaatjes voor elke gelegenheid, om te verzamelen en te versturen.',
    path: '/glitterplaatjes',
    picture: async () => {
      const rows = await db.select({ p: glitters.path }).from(glitters).innerJoin(users, eq(users.id, glitters.userId)).where(isNull(users.blockedAt)).orderBy(desc(glitters.uses), desc(glitters.id)).limit(9)
      return collage(rows.map((r) => r.p), 90, 150, 420, 350, 3, 10, 'contain')
    },
    stats: async () => plural((await db.select({ n: count() }).from(glitters))[0].n, 'glitterplaatje', 'glitterplaatjes'),
  },
  spellen: {
    title: 'Spellen',
    description: 'Mancala, Vier op een rij, Zeeslag, Schaken, Pool en meer: speel tegen je vrienden en verdien prestaties.',
    path: '/spellen',
    picture: async () => {
      const kinds = (Object.keys(GAMES) as GameKind[]).filter((k) => !('variantOf' in GAMES[k])).slice(0, 9)
      const layers: Layer[] = []
      let svg = ''
      for (const [i, k] of kinds.entries()) {
        const cx = 90 + (i % 3) * 145
        const cy = 150 + Math.floor(i / 3) * 120
        svg += `<rect x="${cx}" y="${cy}" width="130" height="108" rx="12" fill="#ffffff" stroke="#c6dcec" stroke-width="2"/>
          <text x="${cx + 65}" y="${cy + 96}" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${NAVY}">${esc(GAMES[k].name.length > 15 ? `${GAMES[k].name.slice(0, 14)}…` : GAMES[k].name)}</text>`
        const icon = await containImage(path.resolve(`public/icons/32/${GAMES[k].icon}.png`), 64, 64, '#00000000')
        if (icon) layers.push({ input: icon, left: cx + 33, top: cy + 10 })
      }
      return { svg, layers }
    },
    stats: async () => {
      const [{ n }] = await db.select({ n: count() }).from(games).where(eq(games.status, 'klaar'))
      return n ? `${plural(n, 'potje', 'potjes')} gespeeld` : ''
    },
  },
  graffiti: {
    title: 'Graffitimuur',
    description: 'Spuit een muur vol met druipende verf, goud, chroom, glitter en geheime bussen. Alleen, of samen met je vrienden op dezelfde muur.',
    path: '/graffiti',
    picture: async () => {
      const wall = await sharp(path.resolve('public/spray/preview.webp'))
        .resize(440, 350, { fit: 'cover' })
        .composite([{ input: Buffer.from('<svg width="440" height="350"><rect width="440" height="350" rx="10" fill="#fff"/></svg>'), blend: 'dest-in' }])
        .png()
        .toBuffer()
        .catch(() => null)
      return { svg: photoFrame(90, 150, 440, 350), layers: wall ? [{ input: wall, left: 90, top: 150 }] : [] }
    },
    stats: async () => '',
  },
  forum: {
    title: 'Kuddes Forum',
    description: 'Praat mee over alles, van games tot muziek, en chat live met andere leden.',
    path: '/forum',
    picture: async () => {
      const [{ n }] = await db.select({ n: count() }).from(forumThreads)
      return { svg: bubbleSvg(n, n === 1 ? 'onderwerp' : 'onderwerpen'), layers: [] }
    },
    stats: async () => {
      const [{ posts }] = await db.select({ posts: count() }).from(forumPosts).where(isNull(forumPosts.deletedAt))
      return plural(posts, 'bericht', 'berichten')
    },
  },
  nieuws: {
    title: 'Nieuws & updates',
    description: 'Het laatste nieuws over Kuddes: nieuwe functies, tips en updates.',
    path: '/nieuws',
    picture: async () => {
      const [latest] = await db.select({ b: news.bannerPath, title: news.title }).from(news).where(and(eq(news.published, true), lte(news.publishedAt, new Date()))).orderBy(desc(news.publishedAt)).limit(1)
      const banner = latest?.b ? await uploadImage(latest.b, 440, 330, 6) : null
      if (banner) return { svg: photoFrame(90, 160, 440, 330), layers: [{ input: banner, left: 90, top: 160 }] }
      // A folded newspaper
      return {
        svg: `<rect x="120" y="170" width="380" height="310" rx="8" fill="#ffffff" stroke="#c6dcec" stroke-width="3"/>
          <text x="310" y="228" text-anchor="middle" font-family="'DejaVu Serif', serif" font-size="40" font-weight="700" fill="${NAVY}">KUDDES KRANT</text>
          <line x1="145" y1="246" x2="475" y2="246" stroke="${NAVY}" stroke-width="3"/>
          ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="145" y="${268 + i * 30}" width="${i % 3 === 2 ? 220 : 330}" height="12" rx="6" fill="#d7e6f1"/>`).join('')}`,
        layers: [],
      }
    },
    stats: async () => {
      const [latest] = await db.select({ title: news.title }).from(news).where(and(eq(news.published, true), lte(news.publishedAt, new Date()))).orderBy(desc(news.publishedAt)).limit(1)
      return latest ? `Nieuw: ${latest.title}` : ''
    },
  },
}

/** The speech bubble with a number, for the forum. */
function bubbleSvg(n: number, label: string) {
  return `
    <defs><linearGradient id="bubble" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd0f7"/><stop offset="1" stop-color="#3a8fd0"/></linearGradient></defs>
    <path d="M120 170 h300 a30 30 0 0 1 30 30 v190 a30 30 0 0 1 -30 30 h-180 l-70 60 v-60 h-50 a30 30 0 0 1 -30 -30 v-190 a30 30 0 0 1 30 -30 z" fill="url(#bubble)" stroke="#2f7fbf" stroke-width="3"/>
    <text x="270" y="310" text-anchor="middle" font-family="${FONT}" font-size="${n > 9999 ? 64 : 88}" font-weight="700" fill="#ffffff">${nl(n)}</text>
    <text x="270" y="364" text-anchor="middle" font-family="${FONT}" font-size="28" font-weight="700" fill="#ffffff">${esc(label)}</text>`
}

/** A card with a picture on the left and a title, description and numbers on the right. */
async function pictureCard(label: string, picture: { svg: string; layers: Layer[] }, title: string, description: string, stats: string, footer: string, x = 580) {
  const text = textBlock(x, 150, 1110 - x, [
    { text: title, size: title.length > 22 ? 44 : 54, bold: true, color: NAVY, maxLines: 2 },
    { text: description, size: 27, gap: 16, maxLines: 5 },
    ...(stats ? [{ text: stats, size: 27, bold: true, color: LINK, gap: 18, maxLines: 2 }] : []),
  ])
  return render(frame(label, picture.svg + text.svg, footer), picture.layers)
}

async function sectionCard(key: string): Promise<Buffer | null> {
  const section = SECTIONS[key]
  if (!section) return null
  const [picture, stats] = await Promise.all([section.picture(), section.stats()])
  return pictureCard('Kuddes', picture, section.title, section.description, stats, `${host()}${section.path}`)
}

/** A part of the forum: its name, what it's about and how busy it is. */
async function forumSectionCard(slug: string): Promise<Buffer | null> {
  const [s] = await db.select().from(forumSections).where(eq(forumSections.slug, slug)).limit(1)
  if (!s) return null
  const [[{ threads }], [{ posts }]] = await Promise.all([
    db.select({ threads: count() }).from(forumThreads).where(eq(forumThreads.sectionId, s.id)),
    db.select({ posts: count() }).from(forumPosts).innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId)).where(and(eq(forumThreads.sectionId, s.id), isNull(forumPosts.deletedAt))),
  ])
  const [latest] = await db.select({ title: forumThreads.title }).from(forumThreads).where(eq(forumThreads.sectionId, s.id)).orderBy(desc(forumThreads.lastPostAt)).limit(1)
  return pictureCard(
    'Forum',
    { svg: bubbleSvg(threads, threads === 1 ? 'onderwerp' : 'onderwerpen'), layers: [] },
    s.name,
    s.description || `Onderwerpen in ${s.name} op het Kuddes Forum.`,
    statsLine([plural(posts, 'bericht', 'berichten'), latest ? `Nu: ${latest.title}` : '']),
    `${host()}/forum/${s.slug}`,
  )
}

/** A video channel: only its name and its public videos (the profile behind it is for members). */
async function channelCard(username: string): Promise<Buffer | null> {
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1)
  if (!u || u.blockedAt || !u.emailVerifiedAt) return null
  const where = and(eq(videos.userId, u.id), eq(videos.status, 'klaar'), eq(videos.visibility, 'openbaar'))
  const [rows, [{ n, views }]] = await Promise.all([
    db.select({ p: videos.thumbPath }).from(videos).where(where).orderBy(desc(videos.views)).limit(4),
    db.select({ n: count(), views: sql<number>`coalesce(sum(${videos.views}), 0)::int` }).from(videos).where(where),
  ])
  return pictureCard(
    'Kuddes Video',
    await collage(rows.map((r) => r.p), 90, 170, 440, 250, 2),
    `Kanaal van ${u.nickname}`,
    `De video’s van ${u.nickname} op Kuddes Video.`,
    statsLine([plural(n, 'video', 'video’s'), views ? `${plural(views, 'keer', 'keer')} bekeken` : '']),
    `${host()}/video/kanaal/${u.username}`,
  )
}

/** A game (for links to a game or an invite): its icon, name and what it's about. */
async function gameCard(kind: string): Promise<Buffer | null> {
  if (!isGameKind(kind)) return null
  const info = GAMES[kind]
  const icon = await containImage(path.resolve(`public/icons/32/${info.icon}.png`), 192, 192, '#00000000')
  const svg = `<rect x="110" y="165" width="320" height="320" rx="36" fill="#e6f1fa" stroke="#a9d2ef" stroke-width="3"/>`
  return pictureCard(
    'Kuddes Spellen',
    { svg, layers: icon ? [{ input: icon, left: 174, top: 229 }] : [] },
    info.name,
    info.description,
    `${info.tagline} · ${info.players > 2 ? `tot ${info.players} spelers` : 'voor 2'}`,
    `${host()}/spellen`,
    490,
  )
}

// ------------------------------------------------------------------ cache

const CARDS = {
  profiel: profileCard,
  kudde: kuddeCard,
  video: videoCard,
  forum: (key: string) => threadCard(Number(key)),
  nieuws: newsCard,
  evenement: (key: string) => eventCard(Number(key)),
  recept: recipeCard,
  kaartje: shareCardImage,
  recensie: mediaCard,
  pagina: sectionCard,
  forumdeel: forumSectionCard,
  kanaal: channelCard,
  spel: gameCard,
} satisfies Record<string, (key: string) => Promise<Buffer | null>>

export type CardKind = keyof typeof CARDS
export const isCardKind = (v: string): v is CardKind => v in CARDS

/** Recently made cards; previews are fetched in bursts when a link is shared. */
const cache = new Map<string, { at: number; image: Buffer | null }>()
const TTL = 10 * 60 * 1000
const MAX = 150

/** Forget a cached card (after its owner changed it). */
export function forgetCard(kind: CardKind, key: string) {
  cache.delete(`${kind}/${key}`)
}

/** A card image, or null when there's nothing public to show (then the site card is used). */
export async function cardImage(kind: CardKind | 'kuddes', key: string): Promise<Buffer> {
  const id = `${kind}/${key}`
  const hit = cache.get(id)
  let image = hit && Date.now() - hit.at < TTL ? hit.image : undefined
  if (image === undefined) {
    image = kind === 'kuddes' ? await siteCard() : await CARDS[kind](key)
    cache.delete(id)
    cache.set(id, { at: Date.now(), image })
    if (cache.size > MAX) cache.delete(cache.keys().next().value!)
  }
  return image ?? cardImage('kuddes', '')
}
