/** Where a suggestion (or problem report) stands; the admin sets it on /beheer. */
export const SUGGESTION_STATUSES = {
  nieuw: { name: 'Nieuw', icon: 'flag_new' },
  bekeken: { name: 'Bekeken', icon: 'eye' },
  bezig: { name: 'Wordt aan gewerkt', icon: 'cog' },
  gepland: { name: 'Staat gepland', icon: 'calendar' },
  klaar: { name: 'Klaar!', icon: 'accept' },
  afgewezen: { name: 'Komt er niet', icon: 'cross' },
} as const
export type SuggestionStatus = keyof typeof SUGGESTION_STATUSES
export const SUGGESTION_STATUS_KEYS = Object.keys(SUGGESTION_STATUSES) as SuggestionStatus[]

/** Done with: off the admin's to-do list. */
export const isSettled = (s: SuggestionStatus) => s === 'klaar' || s === 'afgewezen'

export const SUGGESTION_NOTE_MAX = 300
