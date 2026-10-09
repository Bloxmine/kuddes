/**
 * Blogs (/blogs): longer stories by members, in the forum's markup. Each blog
 * is also a timeline item, which carries its respect and reactions (Social).
 * Members only; "vrienden" blogs only for the writer's friends.
 */
import type { Social, UserSummary, Visibility } from './api'

export const BLOG_LIMITS = {
  title: 120,
  body: 20_000,
  /** Characters of the text shown in lists. */
  snippet: 220,
} as const

export type BlogInput = { title: string; body: string; visibility: Visibility }

export type BlogSummary = {
  id: number
  title: string
  /** The start of the text, without markup. */
  snippet: string
  /** The first picture in the blog, if there is one. */
  imageUrl: string | null
  visibility: Visibility
  author: UserSummary
  createdAt: string
  views: number
  respectCount: number
  commentCount: number
}

export type Blog = BlogSummary & {
  body: string
  updatedAt: string
  mine: boolean
  /** Respect and reactions (the blog's timeline item). */
  social: Social
}

export const blogHref = (id: number) => `/blogs/${id}`

/**
 * Plain text of forum markup, for snippets: tags, quotes' authors, links and
 * smiley codes stay readable, the rest of the markup goes.
 */
export function blogSnippet(body: string, max: number = BLOG_LIMITS.snippet): string {
  const text = body
    .replace(/\[(img|youtube|video)[^\]]*\][^[]*\[\/\1\]/gi, ' ')
    .replace(/\[\/?[a-z*]+(=[^\]]*)?\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/** The first [img] in the markup. */
export function blogImage(body: string): string | null {
  const m = /\[img(?:=[^\]]*)?\]([^[\s]+)\[\/img\]/i.exec(body)
  return m && /^(\/uploads\/|https:\/\/)/.test(m[1]) ? m[1] : null
}
