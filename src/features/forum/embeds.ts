/** Kuddes pages that can be embedded in a forum post. */
export type KuddesLink =
  | { type: 'video'; id: string }
  | { type: 'profiel'; username: string }
  | { type: 'kudde'; slug: string }
  | { type: 'evenement'; slug: string; id: number }
  | { type: 'onderwerp'; id: number }
  | { type: 'forumprofiel'; username: string }
  | { type: 'foto'; id: number }
  | { type: 'kuddefoto'; slug: string; id: number }
  | { type: 'glitter'; id: number }

/** How a photo from someone's Foto's box and a glitterplaatje are written in a post (a line of their own). */
export const photoLink = (username: string, id: number) => `/profiel/${username}?foto=${id}`
export const glitterLink = (id: number) => `/glitterplaatjes?plaatje=${id}`

const FORUM_PAGES = new Set(['nieuw', 'zoeken', 'chat', 'lid', 'beheer', 'tag'])

/**
 * A link to a Kuddes page ("/video/kijk?v=…" or the full address on this
 * site), or null for anything else, including other websites.
 */
export function parseKuddesLink(text: string): KuddesLink | null {
  if (!text || /\s/.test(text) || !(text.startsWith('/') || /^https?:\/\//.test(text))) return null
  let url: URL
  try {
    url = new URL(text, location.origin)
  } catch {
    return null
  }
  if (url.origin !== location.origin) return null
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c, d] = parts
  const fotoId = Number(url.searchParams.get('foto'))
  if (a === 'profiel' && b && parts.length === 2 && Number.isInteger(fotoId) && fotoId > 0) return { type: 'foto', id: fotoId }
  // A photo from a Kudde's Foto's box (shared/kuddes.ts kuddePhotoHref)
  if (a === 'kuddes' && b && b !== 'nieuw' && parts.length === 2 && Number.isInteger(fotoId) && fotoId > 0) return { type: 'kuddefoto', slug: b, id: fotoId }
  const plaatje = Number(url.searchParams.get('plaatje'))
  if (a === 'glitterplaatjes' && parts.length === 1 && Number.isInteger(plaatje) && plaatje > 0) return { type: 'glitter', id: plaatje }
  if (a === 'video' && b === 'kijk' && url.searchParams.get('v')) return { type: 'video', id: url.searchParams.get('v')! }
  if (a === 'profiel' && b && parts.length === 2 && b !== '@me') return { type: 'profiel', username: b.toLowerCase() }
  if (a === 'kuddes' && b && c === 'evenementen' && Number(d)) return { type: 'evenement', slug: b, id: Number(d) }
  if (a === 'kuddes' && b && b !== 'nieuw' && parts.length === 2) return { type: 'kudde', slug: b }
  if (a === 'forum' && b === 'lid' && c) return { type: 'forumprofiel', username: c.toLowerCase() }
  if (a === 'forum' && b && !FORUM_PAGES.has(b) && c && parseInt(c)) return { type: 'onderwerp', id: parseInt(c) }
  return null
}
