/**
 * Text across servers: WieWatWaars and knuffels are plain text here, but
 * ActivityPub carries HTML. Weide servers also send the plain text
 * (weide:plainText), so nothing is lost between two Kuddes servers.
 */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** HTML from another server as plain text: line breaks kept, tags and scripts gone. */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Plain text as the HTML ActivityPub expects: paragraphs, line breaks and links. */
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\bhttps?:\/\/[^\s<]+/g, (url) => `<a href="${url}" rel="nofollow noopener" target="_blank">${url}</a>`).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** A display name from another server: without its custom emoji codes (":pixelfed:"), which only show as images there. */
export const cleanName = (value: string) => htmlToText(value).replace(/:[\w+-]+:/g, '').replace(/\s+/g, ' ').trim()

/** A short single-line string from another server (a name), at most `max` characters. */
export const cleanLine = (value: unknown, max: number) => (typeof value === 'string' ? htmlToText(value).replace(/\s+/g, ' ').trim().slice(0, max) : '')
