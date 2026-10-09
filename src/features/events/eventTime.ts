import type { KuddeEvent } from '../../../shared/api'

export const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
export const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
export const DAYS_SHORT = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "za 4 okt, 21:00 – 03:00", "vandaag, 20:00", "vr 3 – zo 5 okt" */
export function formatEventWhen(startIso: string, endIso: string | null, now = new Date()): string {
  const start = new Date(startIso)
  const end = endIso ? new Date(endIso) : null
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const day = (d: Date) =>
    sameDay(d, now)
      ? 'vandaag'
      : sameDay(d, tomorrow)
        ? 'morgen'
        : `${DAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`
  if (!end) return `${day(start)}, ${hm(start)}`
  // Ending the next morning still counts as one evening out
  const overnight = end.getTime() - start.getTime() < 20 * 3600_000
  if (sameDay(start, end) || overnight) return `${day(start)}, ${hm(start)} – ${hm(end)}`
  return `${day(start)} ${hm(start)} – ${day(end)} ${hm(end)}`
}

export const eventHref = (e: Pick<KuddeEvent, 'id' | 'kudde'>) => `/kuddes/${e.kudde.slug}/evenementen/${e.id}`

/** datetime-local works in local time; the API wants ISO with an offset. */
export const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hm(d)}`
}
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null)

/** Local-day key, e.g. "2026-10-04". */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * "Now", rounded down to the hour. Queries use it in their key: a key with
 * the exact time changes on every render and fetches without end.
 */
export function thisHour(): Date {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  return d
}
