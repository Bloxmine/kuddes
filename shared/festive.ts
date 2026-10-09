/**
 * Feestelijke effecten: snow, falling leaves, bats and Christmas lights,
 * with matching colours if you like. Members switch them on in Instellingen;
 * "automatisch" follows the calendar.
 */

export const FESTIVE_MODES = {
  uit: 'Uit',
  automatisch: 'Automatisch (per seizoen)',
  winter: 'Winter',
  valentijn: 'Valentijnsdag',
  lente: 'Lente',
  pasen: 'Pasen',
  zomer: 'Zomer',
  herfst: 'Herfst',
  halloween: 'Halloween',
  sinterklaas: 'Sinterklaas',
  kerst: 'Kerst',
} as const

export type FestiveMode = keyof typeof FESTIVE_MODES
export type Festivity = Exclude<FestiveMode, 'uit' | 'automatisch'>

export const FESTIVE_AMOUNTS = { weinig: 'Weinig', normaal: 'Normaal', veel: 'Veel' } as const
export type FestiveAmount = keyof typeof FESTIVE_AMOUNTS

/** Easter Sunday in a year (the Gregorian computus), as [month, day]. */
export function easterOf(year: number): [number, number] {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  return [month, ((h + l - 7 * m + 114) % 31) + 1]
}

/**
 * What "automatisch" shows on a date: winter, Valentijnsdag in the week up to
 * 14 February, spring, Easter (Palm Sunday to Easter Monday), summer, autumn,
 * Halloween at the end of October, Sinterklaas from mid-November to pakjesavond
 * on 5 December, then Christmas.
 */
export function seasonOn(date: Date): Festivity | null {
  const m = date.getMonth() + 1
  const d = date.getDate()
  const [em, ed] = easterOf(date.getFullYear())
  const fromEaster = Math.round((Date.UTC(date.getFullYear(), m - 1, d) - Date.UTC(date.getFullYear(), em - 1, ed)) / 86_400_000)
  if (fromEaster >= -7 && fromEaster <= 1) return 'pasen'
  if (m === 12) return d <= 5 ? 'sinterklaas' : 'kerst'
  if (m === 11 && d >= 12) return 'sinterklaas'
  if ((m === 10 && d >= 24) || (m === 11 && d === 1)) return 'halloween'
  if (m === 2 && d >= 7 && d <= 15) return 'valentijn'
  if (m === 1 || m === 2) return 'winter'
  if ((m === 9 && d >= 22) || m === 10 || m === 11) return 'herfst'
  if ((m === 3 && d >= 20) || m === 4 || m === 5) return 'lente'
  if (m >= 6 && m <= 9) return 'zomer'
  return null
}

export function activeFestivity(mode: FestiveMode, date = new Date()): Festivity | null {
  if (mode === 'uit') return null
  if (mode === 'automatisch') return seasonOn(date)
  return mode
}
