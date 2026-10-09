/** The Prikbord on a Kudde: posts from members or from the Kudde, with polls and replies. */
import type { UserSummary } from './api'
import type { GlitterImage } from './glitters'

import { POLL_LIMITS, type PollInput, type PollView } from './polls'

export const KUDDE_POST_LIMITS = {
  text: 2000,
  reply: 500,
  ...POLL_LIMITS,
  perPage: 10,
}

export type KuddePollInput = PollInput
export type KuddePoll = PollView

export type KuddeReply = {
  id: number
  user: UserSummary
  text: string
  createdAt: string
  canDelete: boolean
}

/** How many who gave respect are shown with a post. */
export const KUDDE_RESPECTERS_SHOWN = 12

export type KuddePost = {
  id: number
  /** Who wrote it; for a post as the Kudde only shown to the owner (null once their account is gone). */
  author: UserSummary | null
  /** Posted as the Kudde itself, by its owner. */
  asKudde: boolean
  /** An icon picked for the post, shown with it (null = none). */
  icon: string | null
  text: string
  photoUrl: string | null
  glitter: GlitterImage | null
  poll: KuddePoll | null
  replies: KuddeReply[]
  canDelete: boolean
  /** The author (or the owner, for posts as the Kudde) can close a poll. */
  canClose: boolean
  /** Pinned by the owner: shown above the rest. */
  pinned: boolean
  /** The owner can pin and unpin posts. */
  canPin: boolean
  /** Respect from members and visitors, and whether you gave some. */
  respect: number
  /** The latest few who gave respect (up to KUDDE_RESPECTERS_SHOWN). */
  respecters: UserSummary[]
  respected: boolean
  canRespect: boolean
  createdAt: string
}

/** `pinned` comes with the first page only, and isn't repeated in `items`. */
export type KuddePostPage = { items: KuddePost[]; nextCursor: number | null; pinned: KuddePost | null }
