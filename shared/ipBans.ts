/**
 * IP bans (Beheer → Zwarte lijst): an internet connection that can't sign up
 * and log in for a while, or can't use the site at all. An IPv6 address
 * always covers its /64, the block one household gets.
 */

export const IP_BAN_DURATIONS = {
  '1d': { name: '1 dag', days: 1 },
  '7d': { name: '7 dagen', days: 7 },
  '30d': { name: '30 dagen', days: 30 },
  altijd: { name: 'Voor altijd', days: null },
} as const
export type IpBanDuration = keyof typeof IP_BAN_DURATIONS

export const IP_BAN_SCOPES = {
  aanmelden: { name: 'Aanmelden en inloggen', hint: 'Wie al ingelogd is, merkt niets. Veiliger bij gedeelde verbindingen (school, mobiel).' },
  alles: { name: 'De hele site', hint: 'Ook bekijken en ingelogd blijven lukt niet meer.' },
} as const
export type IpBanScope = keyof typeof IP_BAN_SCOPES

/** How long a member's last IP address is kept after their last visit. */
export const LAST_IP_DAYS = 90

export const IP_BAN_LIMITS = { reason: 200 }

export type IpBan = {
  id: number
  /** "203.0.113.7", "203.0.113.0/24" or "2001:db8:1:2::/64" */
  range: string
  scope: IpBanScope
  reason: string
  createdAt: string
  /** null: for always */
  expiresAt: string | null
  active: boolean
  /** Members whose last address is in the range. */
  members: { username: string; nickname: string }[]
}
