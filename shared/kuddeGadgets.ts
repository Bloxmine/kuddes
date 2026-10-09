/**
 * Kudde gadgets: boxes the owner of a Kudde adds to its page, from the
 * Gadgetmarkt ("Voor Kuddes") or right on the Kudde. They're separate from
 * profile gadgets (shared/gadgets.ts): they belong to the Kudde, and several
 * show what goes on in it (members, visits, the agenda, the prikbord).
 * A new type needs an entry here, a default config, an icon, a box and an editor.
 */
import type { UserSummary } from './api'
import type { KuddeRight } from './kuddes'

export const KUDDE_GADGET_TYPES = {
  teller: { name: 'Bezoekersteller', description: 'Hoe vaak jullie Kudde bekeken is, op een ouderwetse teller.' },
  leden: { name: 'Ledenteller', description: 'Hoeveel leden jullie zijn, wie er deze week bij kwamen, en hoe ver jullie zijn met je ledendoel.' },
  nieuwkomers: { name: 'Nieuwe leden', description: 'De nieuwste leden van de Kudde, zodat iedereen ze even gedag kan zeggen.' },
  online: { name: 'Nu online', description: 'Welke leden van de Kudde nu online zijn.' },
  actief: { name: 'Actiefste leden', description: 'Wie er de afgelopen week of maand het meest op het prikbord schreef.' },
  agenda: { name: 'Volgende activiteiten', description: 'De eerstvolgende activiteiten uit jullie agenda, met hoe lang het nog duurt.' },
  mededeling: { name: 'Mededeling', description: 'Een belangrijke mededeling op een krijtbord, geel briefje of neonbord.' },
  regels: { name: 'Huisregels', description: 'De afspraken van jullie Kudde, netjes onder elkaar.' },
  aftellen: { name: 'Aftellen', description: 'Tel samen af naar het feest, de wedstrijd of de volgende bijeenkomst.' },
} as const satisfies Record<string, { name: string; description: string }>

export type KuddeGadgetType = keyof typeof KUDDE_GADGET_TYPES

export type KuddeGadgetConfig = {
  teller: { label: string; style: 'kilometer' | 'led' | 'klassiek' }
  /** `goal`: the number of members you're working towards (0 = none). */
  leden: { goal: number }
  nieuwkomers: { count: number }
  online: Record<string, never>
  actief: { count: number; days: 7 | 30 }
  agenda: { count: number }
  mededeling: { text: string; style: 'krijtbord' | 'briefje' | 'neon' }
  regels: { rules: string[] }
  aftellen: { target: string; label: string; doneText: string }
}

export const KUDDE_GADGET_LIMITS = {
  gadgets: 12,
  title: 60,
  counterLabel: 40,
  goal: 100_000,
  people: 12,
  events: 5,
  text: 500,
  rules: 10,
  rule: 140,
  label: 80,
  doneText: 120,
}

export const KUDDE_GADGET_DEFAULTS: KuddeGadgetConfig = {
  teller: { label: 'bezoekers', style: 'kilometer' },
  leden: { goal: 0 },
  nieuwkomers: { count: 8 },
  online: {},
  actief: { count: 5, days: 30 },
  agenda: { count: 3 },
  mededeling: { text: '', style: 'krijtbord' },
  regels: { rules: ['Lief zijn voor elkaar.', 'Geen reclame.'] },
  aftellen: { target: '', label: '', doneText: 'Het is zover!' },
}

/** What a gadget shows besides its settings; filled in by the server. */
export type KuddeGadgetData = {
  teller: { views: number }
  leden: { members: number; thisWeek: number }
  nieuwkomers: { members: UserSummary[] }
  online: { members: UserSummary[] }
  /** Empty for visitors of a besloten Kudde: the prikbord is for members. */
  actief: { members: { user: UserSummary; posts: number }[]; hidden: boolean }
  agenda: { events: { id: number; title: string; startsAt: string; location: string | null }[]; hidden: boolean }
  mededeling: null
  regels: null
  aftellen: null
}

/** A Kudde you run: to add gadgets to, or to post a WieWatWaar as. */
export type OwnedKudde = { slug: string; name: string; imageUrl: string | null; gadgets: number; rights: KuddeRight[] }

export type KuddeGadget = {
  [T in KuddeGadgetType]: { id: number; type: T; title: string; enabled: boolean; config: KuddeGadgetConfig[T]; data: KuddeGadgetData[T] }
}[KuddeGadgetType]
