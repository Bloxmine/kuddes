const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const pad = (n: number) => String(n).padStart(2, '0')

let exact = false

/** "exact" shows the full date and time everywhere (a member preference). */
export function setTimeFormat(format: 'relatief' | 'exact') {
  exact = format === 'exact'
}

/** Timestamps like "vandaag, 22:11", "gisteren, 23:40", "24 mrt, 16:03". */
export function formatTime(iso: string, now = new Date()): string {
  const date = new Date(iso)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (exact) return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`
  const diff = now.getTime() - date.getTime()
  if (diff < 60 * 1000) return 'zojuist'

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= startOfToday) return `vandaag, ${time}`
  if (date.getTime() >= startOfToday - 24 * 60 * 60 * 1000) return `gisteren, ${time}`

  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() === now.getFullYear() ? `${day}, ${time}` : `${day} ${date.getFullYear()}`
}

const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** "16 maart 2010", for news and recipes. */
export function formatLongDate(iso: string): string {
  const date = new Date(iso)
  return `${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

/** "16-03-2010" */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`
}
