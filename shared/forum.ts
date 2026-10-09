/** Kuddes Forum: sections, threads with tags, posts with smiley reactions, and the chat. */

/** Reactions on posts, as Hyves smileys. */
export const FORUM_REACTIONS = {
  happy_thumbup: 'Top!',
  lollol: 'Haha',
  love_heart: 'Mooi',
  geschokt: 'Wow',
  verdrietig: 'Jammer',
  boos: 'Boos',
  worship: 'Respect',
} as const

export type ForumReaction = keyof typeof FORUM_REACTIONS

export const isForumReaction = (v: unknown): v is ForumReaction => typeof v === 'string' && v in FORUM_REACTIONS

/** Icons a section can have: all the pickable ones (shared/icons.ts). */
export { ICON_GROUPS as SECTION_ICON_GROUPS, PICKABLE_ICONS as SECTION_ICONS } from './icons'

export type SectionIcon = string

/** "admin": everything, in all sections. "moderator": pinning, locking, moving and removing in their sections. */
export type ForumRole = 'admin' | 'moderator' | null

export const FORUM_LIMITS = {
  title: 120,
  body: 10_000,
  tags: 5,
  tag: 24,
  signature: 600,
  /** Pictures in a signature (userbars and banners). */
  signatureImages: 3,
  forumTitle: 40,
  comment: 1000,
  chat: 500,
  chatTopic: 200,
  sectionName: 60,
  sectionDescription: 200,
}

export const THREADS_PER_PAGE = 25
export const POSTS_PER_PAGE = 20

/** "Hoe maak ik een Kudde?" -> "hoe-maak-ik-een-kudde" (for readable thread URLs) */
export function slugify(text: string) {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'onderwerp'
  )
}

/** Tags as typed ("games, #pc  retro") to a clean list. */
export function parseForumTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= FORUM_LIMITS.tag),
    ),
  ].slice(0, FORUM_LIMITS.tags)
}

export const threadHref = (section: string, id: number, title: string, page?: number) =>
  `/forum/${section}/${id}-${slugify(title)}${page && page > 1 ? `?pagina=${page}` : ''}`

/** Kinds of chat lines, like IRC. */
export type ChatKind = 'msg' | 'me' | 'join' | 'part' | 'topic' | 'kick' | 'system'

/**
 * Pictures in a forum signature, each on a line of its own: a picture you
 * uploaded for it, optionally over the whole width ("breed", for banners and
 * userbars) and optionally as a link:
 *   ![](/uploads/signatures/12-….gif)
 *   [![breed](/uploads/signatures/12-….webp)](https://…)
 */
export const SIGNATURE_IMAGE_SRC = /^\/uploads\/signatures\/(\d+)-[0-9a-f]{32}\.(?:webp|gif)$/
const SIG_IMAGE = /^!\[(breed)?\]\((\/uploads\/signatures\/\d+-[0-9a-f]{32}\.(?:webp|gif))\)$/
const SIG_LINKED = /^\[!\[(breed)?\]\((\/uploads\/signatures\/\d+-[0-9a-f]{32}\.(?:webp|gif))\)\]\((https?:\/\/[^\s)]+|\/(?!\/)[^\s)]*)\)$/

export type SignatureImage = { src: string; wide: boolean; href: string | null }

export function parseSignatureImage(line: string): SignatureImage | null {
  const t = line.trim()
  const linked = SIG_LINKED.exec(t)
  if (linked) return { src: linked[2], wide: !!linked[1], href: linked[3] }
  const plain = SIG_IMAGE.exec(t)
  return plain ? { src: plain[2], wide: !!plain[1], href: null } : null
}

/** The line for a picture, as the editor writes it. */
export const signatureImageLine = (src: string, wide: boolean, href: string | null) => {
  const img = `![${wide ? 'breed' : ''}](${src})`
  return href ? `[${img}](${href})` : img
}
