/**
 * The profielkaartje (shared/shareCard.ts): the card as data, as a page for
 * embedding on other sites (/kaartje/:username), and its settings.
 */
import { eq } from 'drizzle-orm'
import { NAME_FONTS, headerVars, luminance, mix, textOn } from '../../shared/customization'
import { INTERESTS, GAMER_PLATFORMS, type GamerPlatform, type InterestKey } from '../../shared/profileExtras'
import { cardImagePath, cardPath, joinPath, withCardDefaults, type ShareCard, type ShareCardLook } from '../../shared/shareCard'
import { PROFILE_PRESETS, resolveSkin } from '../../shared/skins'
import { db } from '../db/client'
import { users, type User } from '../db/schema'
import { absolute, plainText, version } from './seo'
import { ageFrom, uploadUrl } from './serialize'

const KUDDES_LOOK: ShareCardLook = {
  background: 'linear-gradient(to bottom, #9fd6f8, #e8f5ff)',
  background1: '#8fd0f7',
  background2: '#eaf6ff',
  surface: '#ffffff',
  text: '#1b2733',
  title: '#13324f',
  link: '#1d74bd',
  box: '#a9d2ef',
  accent: '#3a8fd0',
  pattern: null,
  image: null,
  headerBackground: 'linear-gradient(to bottom, #78c1f0, #3a8fd0)',
  header: null,
  nameFont: NAME_FONTS.standaard.css,
  nameColor: '#ffffff',
  nameShadow: '0 1px 2px rgba(0, 0, 0, 0.35)',
  namePlate: null,
}

/** Contrast between two colours (1 to 21, like WCAG). */
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
/** `fg` if it stands out enough on `bg`, otherwise a lighter or darker version (or the text colour). */
function readable(fg: string, bg: string, text: string): string {
  if (contrast(fg, bg) >= 3) return fg
  const tinted = mix(fg, luminance(bg) > 0.4 ? '#000000' : '#ffffff', 0.45)
  return contrast(tinted, bg) >= 3 ? tinted : text
}

/** The card's colours: the member's profile design, or the Kuddes blue. */
function lookOf(u: User, useDesign: boolean): ShareCardLook {
  const skin = useDesign ? resolveSkin(u.skin, u.profileColors) : undefined
  if (!skin) return KUDDES_LOOK
  const colors = u.skin === 'eigen' ? u.profileColors : u.skin ? PROFILE_PRESETS[u.skin]?.colors : null
  const surface = skin.surface ?? '#ffffff'
  const accent = skin.accent ?? skin.boxBorder
  // The title bar as on the profile; the older built-in skins have none of their own
  const header = colors?.header ?? null
  const hv = header ? headerVars(header, surface) : null
  const text = skin.text ?? textOn(surface)
  return {
    pattern: colors?.pattern ?? null,
    image: colors?.image ?? null,
    headerBackground: hv?.['--profile-hdr-bg'] ?? `linear-gradient(to bottom, ${skin.boxHeaderTop}, ${skin.boxHeaderBottom})`,
    header,
    nameFont: hv?.['--profile-name-font'] ?? NAME_FONTS.standaard.css,
    nameColor: hv?.['--profile-name-color'] ?? skin.title,
    nameShadow: hv?.['--profile-name-shadow'] ?? 'none',
    namePlate: hv?.['--profile-name-plate'] ?? null,
    background: skin.background,
    background1: colors?.background ?? skin.boxHeaderBottom,
    background2: colors?.background2 ?? skin.boxBorder,
    surface,
    text,
    // Titles and links have to stand out on the inside of the card (a dark design with dark titles…)
    title: readable(skin.title, surface, text),
    link: readable(skin.link ?? mix(skin.title, accent, 0.85), surface, text),
    box: skin.boxBorder,
    accent,
  }
}

/** A member's card, or null when it's off (or they're blocked). `force`: the owner's own preview. */
export async function shareCardOf(username: string, force = false): Promise<ShareCard | null> {
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1)
  if (!u || u.blockedAt || !u.emailVerifiedAt) return null
  const s = withCardDefaults(u.shareCard)
  if (!s.enabled && !force) return null
  const interests = s.interests
    .filter((k): k is InterestKey => k in INTERESTS && !!u.interests?.[k]?.trim())
    .map((key) => ({ key, label: INTERESTS[key].label, value: u.interests![key]!.trim().slice(0, 120) }))
  const gamerTags = s.gamerTags
    ? Object.entries(u.gamerTags ?? {})
        .filter(([k, v]) => k in GAMER_PLATFORMS && v?.trim())
        .slice(0, 4)
        .map(([k, v]) => ({ label: GAMER_PLATFORMS[k as GamerPlatform].short, value: v!.trim() }))
    : []
  const card: Omit<ShareCard, 'version'> = {
    username: u.username,
    name: u.name,
    nickname: u.nickname,
    avatarUrl: s.photo ? uploadUrl(u.avatarPath) : null,
    city: s.city ? u.city || null : null,
    age: s.age ? ageFrom(u.birthdate) : null,
    about: s.about && u.about ? plainText(u.about, 180) : null,
    interests,
    music: s.music ? u.music.slice(0, 6) : [],
    gamerTags,
    message: s.message.trim(),
    look: lookOf(u, s.design),
    memberSince: u.createdAt.toISOString(),
  }
  return { ...card, version: version(card) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** For inside the <style> block: nothing that could end it (the values are our own CSS). */
const cssValue = (s: string) => s.replace(/[<>]/g, '')

const initials = (name: string) => {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
  return parts[0] ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?'
}

/**
 * The card as a small page of its own: for an iframe on another site, and as
 * the link you share (with a preview picture for sites without embeds).
 */
export function shareCardPage(card: ShareCard, embedded: boolean): string {
  const l = card.look
  const url = absolute(cardPath(card.username))
  const join = absolute(joinPath(card.username))
  const title = `${card.name} op Kuddes`
  const bits = [card.city, card.age ? `${card.age} jaar` : null].filter(Boolean).join(' · ')
  const description = card.message || card.about || `Bekijk het kaartje van ${card.name} en word ook lid van Kuddes, het gezellige vriendennetwerk.`
  const facts = [
    ...card.interests.map((i) => `<li><b>${esc(i.label)}</b> ${esc(i.value)}</li>`),
    ...(card.music.length ? [`<li><b>Muziek</b> ${esc(card.music.join(', '))}</li>`] : []),
    ...card.gamerTags.map((g) => `<li><b>${esc(g.label)}</b> ${esc(g.value)}</li>`),
  ].join('')
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="Kuddes">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(absolute(cardImagePath(card.username, card.version)))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%}
  body{display:grid;place-items:center;padding:${embedded ? '6px' : '24px 12px'};background:${embedded ? 'transparent' : cssValue(l.background)};font:13px/1.5 Verdana,Tahoma,sans-serif;color:${l.text}}
  .frame{width:100%;max-width:460px;padding:10px;border-radius:18px;background:${cssValue(l.background)};box-shadow:0 6px 22px rgba(0,0,0,.2)}
  .card{overflow:hidden;border:1px solid ${l.box};border-radius:12px;background:${l.surface}}
  .top{display:flex;align-items:flex-end;gap:14px;min-height:96px;padding:12px 16px 10px 124px;position:relative;background:${cssValue(l.headerBackground)}}
  .name{display:inline-block;padding:${l.namePlate ? '2px 12px 3px' : '0'};border-radius:8px;background:${l.namePlate ?? 'none'}}
  h1{margin:0;color:${l.nameColor};font:bold 23px/1.15 ${cssValue(l.nameFont)};text-shadow:${cssValue(l.nameShadow)};overflow-wrap:anywhere}
  .nick{color:${l.nameColor};opacity:.85;font:bold 13px ${cssValue(l.nameFont)};text-shadow:${cssValue(l.nameShadow)}}
  .pic{position:absolute;left:16px;top:18px;width:96px;height:96px;border:4px solid ${l.surface};border-radius:12px;background:linear-gradient(135deg,${l.accent},${l.title});box-shadow:0 2px 6px rgba(0,0,0,.25);object-fit:cover;color:#fff;font:bold 34px/88px Verdana,sans-serif;text-align:center}
  .bits{min-height:22px;padding:4px 16px 0 124px;color:${mix(l.text, l.surface, 0.6)};font-size:12px}
  .body{padding:14px 16px 4px}
  .msg{margin:0 0 10px;padding:8px 12px;border-left:3px solid ${l.accent};border-radius:0 8px 8px 0;background:${mix(l.box, l.surface, 0.14)};font-style:italic}
  .about{margin:0 0 10px}
  ul{display:grid;gap:4px;margin:0 0 10px;padding:0;list-style:none;font-size:12px}
  li b{display:inline-block;min-width:110px;color:${l.title}}
  .foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 16px 14px;border-top:1px solid ${mix(l.box, l.surface, 0.4)}}
  .brand{display:flex;gap:6px;align-items:center;color:${l.title};font-weight:bold;text-decoration:none}
  .brand img{width:22px;height:22px}
  .join{display:inline-block;padding:7px 16px;border:1px solid ${mix(l.accent, '#000000', 0.55)};border-radius:999px;background:linear-gradient(${mix(l.accent, '#ffffff', 0.75)},${mix(l.accent, '#000000', 0.8)});color:#fff;font:bold 13px 'Trebuchet MS',Verdana,sans-serif;text-decoration:none;text-shadow:0 1px 0 rgba(0,0,0,.25)}
  .join:hover{filter:brightness(1.08)}
</style>
</head>
<body>
<div class="frame">
<article class="card">
  <div class="top">
    ${card.avatarUrl ? `<img class="pic" src="${esc(card.avatarUrl)}" alt="">` : `<div class="pic" aria-hidden="true">${esc(initials(card.name))}</div>`}
    <div class="name">
      <h1>${esc(card.name)}</h1>
      ${card.nickname && card.nickname !== card.name ? `<div class="nick">${esc(card.nickname)}</div>` : ''}
    </div>
  </div>
  <div class="bits">${esc(bits)}</div>
  <div class="body">
    ${card.message ? `<p class="msg">“${esc(card.message)}”</p>` : ''}
    ${card.about ? `<p class="about">${esc(card.about)}</p>` : ''}
    ${facts ? `<ul>${facts}</ul>` : ''}
  </div>
  <div class="foot">
    <a class="brand" href="${esc(absolute('/'))}" target="_top"><img src="/favicon.svg" alt=""> Kuddes</a>
    <a class="join" href="${esc(join)}" target="_top">Word ook lid van Kuddes »</a>
  </div>
</article>
</div>
</body>
</html>`
}
