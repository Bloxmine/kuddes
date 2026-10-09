/**
 * Relaties op een profiel: je relatiestatus (met je partner, die het moet
 * bevestigen), je beste vrienden (die kies je zelf) en je familie (die het
 * moet bevestigen). Only between friends.
 */
import type { Profile, UserSummary } from './api'

export const RELATIONSHIP_STATUSES = {
  single: 'Single',
  relatie: 'In een relatie',
  verloofd: 'Verloofd',
  getrouwd: 'Getrouwd',
  ingewikkeld: 'Het is ingewikkeld',
  open: 'In een open relatie',
} as const

export type RelationshipStatus = keyof typeof RELATIONSHIP_STATUSES

/** Statuses that can have a partner. */
export const WITH_PARTNER: RelationshipStatus[] = ['relatie', 'verloofd', 'getrouwd', 'ingewikkeld', 'open']

/** "… met Sanne" */
export const PARTNER_WORD: Record<RelationshipStatus, string> = {
  single: '',
  relatie: 'met',
  verloofd: 'met',
  getrouwd: 'met',
  ingewikkeld: 'met',
  open: 'met',
}

/** What the other person is to you. */
export const FAMILY_LABELS = {
  broer: 'Broer',
  zus: 'Zus',
  vader: 'Vader',
  moeder: 'Moeder',
  zoon: 'Zoon',
  dochter: 'Dochter',
  opa: 'Opa',
  oma: 'Oma',
  kleinzoon: 'Kleinzoon',
  kleindochter: 'Kleindochter',
  oom: 'Oom',
  tante: 'Tante',
  neef: 'Neef',
  nicht: 'Nicht',
  familie: 'Familie',
} as const

export type FamilyLabel = keyof typeof FAMILY_LABELS

export const RELATION_LIMITS = { bestFriends: 5, family: 30 }

/** The relations on a profile, as everyone sees them (pending ones only for the two involved). */
export type ProfileRelations = {
  status: RelationshipStatus | null
  partner: { user: UserSummary; confirmed: boolean } | null
  bestFriends: UserSummary[]
  family: { id: number; user: UserSummary; label: FamilyLabel; confirmed: boolean }[]
}

/** A partner or family request waiting for you. */
export type RelationRequest = {
  id: number
  kind: 'partner' | 'familie'
  from: UserSummary
  /** For partners: their status; for family: what you are to them. */
  label: string
  createdAt: string
}

/** Your own relations, for the settings page. */
export type MyRelations = ProfileRelations & {
  /** Your partner request (confirmed or not), for editing. */
  partnerId: number | null
  incoming: RelationRequest[]
}

/** How someone in a profile's friend list relates to its owner (for the little icon). */
export function relationOf(profile: Profile, userId: number): { kind: 'partner' | 'beste_vriend' | 'familie'; title: string } | null {
  const r = profile.relations
  if (r.partner?.confirmed && r.partner.user.id === userId) return { kind: 'partner', title: `Partner van ${profile.nickname}` }
  if (r.bestFriends.some((f) => f.id === userId)) return { kind: 'beste_vriend', title: `Beste vriend(in) van ${profile.nickname}` }
  const fam = r.family.find((f) => f.confirmed && f.user.id === userId)
  if (fam) return { kind: 'familie', title: `${FAMILY_LABELS[fam.label]} van ${profile.nickname}` }
  return null
}
