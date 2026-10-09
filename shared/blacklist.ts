/**
 * The admin's blacklist (Beheer → Zwarte lijst): e-mail addresses, whole
 * e-mail domains and usernames that can't be used to sign up or switch to.
 * A * stands for anything ("spammer*", "*@example.org").
 */

export const BLACKLIST_KINDS = {
  email: { name: 'E-mailadres', hint: 'bijv. naam@example.org', icon: 'email' },
  domein: { name: 'E-maildomein', hint: 'bijv. wegwerpmail.nl (ook subdomeinen)', icon: 'world' },
  gebruikersnaam: { name: 'Gebruikersnaam', hint: 'bijv. spammer of spammer*', icon: 'user' },
} as const
export type BlacklistKind = keyof typeof BLACKLIST_KINDS

export const BLACKLIST_LIMITS = { value: 254, reason: 200 }

export type BlacklistEntry = {
  id: number
  kind: BlacklistKind
  value: string
  reason: string
  /** Kept as a hash (an exact address or username): `value` is then only a masked hint. */
  hashed: boolean
  createdAt: string
  /** Accounts that match it now, and how many of those aren't blocked yet. */
  matches: { username: string; nickname: string; blocked: boolean }[]
}
