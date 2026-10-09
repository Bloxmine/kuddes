/**
 * Keeping Kuddes safe while the admin is away (Beheer → Rustige stand):
 * members report posts ("Melden"), and a post is hidden by itself after
 * enough reports, or at once when it's about something urgent; the admin gets
 * a mail for what matters and a weekly summary; and a quiet mode makes the
 * site take less risk (sign-ups, uploads, new accounts posting).
 */
import type { UserSummary } from './api'

/** What can be reported. `hide`: it can be hidden until the admin looks (a profile or a private message can't). */
export const REPORT_KINDS = {
  wiewatwaar: { name: 'WieWatWaar', hide: true },
  knuffel: { name: 'Knuffel', hide: true },
  reactie: { name: 'Reactie', hide: true },
  forum: { name: 'Forumbericht', hide: true },
  kudde: { name: 'Bericht in een Kudde', hide: true },
  foto: { name: 'Reactie op een foto', hide: true },
  video: { name: 'Reactie op een video', hide: true },
  blog: { name: 'Blog', hide: true },
  profiel: { name: 'Profiel', hide: false },
  bericht: { name: 'Privébericht', hide: false },
} as const
export type ReportKind = keyof typeof REPORT_KINDS

/** Why. `urgent`: hidden straight away (where it can be) and a mail to the admin at once. */
export const REPORT_REASONS = {
  spam: { name: 'Spam of reclame', urgent: false },
  misbruik: { name: 'Pesten, schelden of bedreigen', urgent: false },
  ongepast: { name: 'Ongepast (bloot, geweld, haat)', urgent: false },
  illegaal: { name: 'Strafbaar of illegaal', urgent: true },
  minderjarige: { name: 'Gevaar voor een minderjarige', urgent: true },
  anders: { name: 'Iets anders', urgent: false },
} as const
export type ReportReason = keyof typeof REPORT_REASONS

export const REPORT_LIMITS = { note: 500 }

export type QuietMode = {
  on: boolean
  /** Sign-ups while it's on: as usual, on the waitlist (the admin approves), or closed. */
  signups: 'normaal' | 'wachtlijst' | 'dicht'
  /** Accounts younger than this can't post or send anything (0: no limit). */
  minAgeDays: number
  /** No new photos, videos, music or sound uploads. */
  pauseUploads: boolean
  /** No new Kuddes. */
  pauseKuddes: boolean
  /** Hidden after this many reports while it's on (usually lower than normal). */
  hideAfter: number
  /** A line at the top of every page (empty: none). */
  notice: string
}

export type SafetySettings = {
  /** A post is hidden after this many different members reported it. */
  hideAfter: number
  /** Mails to the admin. */
  alerts: { urgent: boolean; hidden: boolean; warnings: boolean; weekly: boolean }
  quiet: QuietMode
}

export const DEFAULT_SAFETY: SafetySettings = {
  hideAfter: 3,
  alerts: { urgent: true, hidden: true, warnings: true, weekly: true },
  quiet: {
    on: false,
    signups: 'wachtlijst',
    minAgeDays: 7,
    pauseUploads: true,
    pauseKuddes: true,
    hideAfter: 2,
    notice: 'De beheerder is even weg. Reacties op meldingen kunnen wat langer duren; gemelde berichten worden zo nodig vanzelf verborgen.',
  },
}

export const SAFETY_LIMITS = { hideAfter: 20, minAgeDays: 365, notice: 300 }

/** A reported post, with all its reports, for Beheer → Meldingen. */
export type ReportedItem = {
  kind: ReportKind
  targetId: number
  link: string | null
  excerpt: string
  author: UserSummary | null
  reasons: Partial<Record<ReportReason, number>>
  notes: string[]
  reporters: number
  hidden: boolean
  firstAt: string
  lastAt: string
}

/** What the page says after reporting. */
export type ReportResult = { hidden: boolean }
