import { OFFLINE } from '../../../shared/messenger'

/** The colour of a status: green online, red busy, orange away, grey offline (as in WLM). */
export type Tone = 'online' | 'busy' | 'away' | 'offline'
export function toneOf(status: string): Tone {
  if (status === 'Online') return 'online'
  if (status === 'Bezig') return 'busy'
  if (status === OFFLINE || status === 'Toon offline') return 'offline'
  return 'away'
}

/** The time of a line: "14:02". */
export function clock(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export function dayOf(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Vandaag'
  if (d.toDateString() === yesterday.toDateString()) return 'Gisteren'
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() && { year: 'numeric' }) })
}
