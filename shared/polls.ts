/** Polls, on WieWatWaars and on the Prikbord of a Kudde: 2–6 answers, one vote per member. */
export const POLL_LIMITS = { question: 140, option: 80, options: 6 }

export type PollInput = { question: string; options: string[] }

/** A poll as the viewer sees it. */
export type PollView = {
  question: string
  options: string[]
  closed: boolean
  counts: number[]
  total: number
  /** The viewer's answer, or null. */
  myVote: number | null
}
