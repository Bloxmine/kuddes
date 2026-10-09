/**
 * Federation: Kuddes as a network of servers that talk Weide (WEIDE.md), an
 * extension of ActivityPub. Every server has its own members, its own admin
 * and its own rules; members befriend, knuffel and follow each other across
 * servers as `naam@server`. There's no central Kuddes, only servers.
 */

/** How this server takes part: with every server (except blocked ones), only with servers the admin allowed, or not at all. */
export const FEDERATION_MODES = {
  open: { name: 'Open', hint: 'met alle servers, behalve die je blokkeert' },
  beperkt: { name: 'Beperkt', hint: 'alleen met servers die je toestaat' },
  uit: { name: 'Uit', hint: 'deze server staat op zichzelf' },
} as const
export type FederationMode = keyof typeof FEDERATION_MODES

/** What the admin decided about another server. */
export const SERVER_POLICIES = {
  normaal: { name: 'Normaal', hint: 'zoals elke andere server', icon: 'world' },
  toegestaan: { name: 'Toegestaan', hint: 'ook als federatie beperkt is', icon: 'accept' },
  stil: { name: 'Stil', hint: 'geen nieuwe vriendschapsverzoeken van daar; bestaande vrienden blijven', icon: 'sound_mute' },
  geblokkeerd: { name: 'Geblokkeerd', hint: 'niets van of naar deze server; hun accounts verdwijnen hier', icon: 'status_busy' },
} as const
export type ServerPolicy = keyof typeof SERVER_POLICIES

/** About this server: shown on Over, the privacy statement and the user agreement, and to other servers (NodeInfo). */
export type ServerInfo = {
  /** The server's name, e.g. "Kuddes Utrecht". */
  name: string
  /** Its address, e.g. "kuddes.example" (from PUBLIC_URL; not editable). */
  domain: string
  description: string
  /** Who runs it (also the "verwerkingsverantwoordelijke" in the privacy statement). */
  adminName: string
  /** Where members (and other servers) reach the admin about privacy and reports. */
  contactEmail: string
  country: string
  /** Who hosts the server and who sends its mail, for the privacy statement (e.g. "Strato (Duitsland)"); empty = not named. */
  hosting: string
  mailService: string
  /** Extra rules of this server, on top of the user agreement; one per line. */
  rules: string
  federation: FederationMode
  /** Members may follow accounts on servers that aren't Kuddes (Mastodon and the rest of the fediverse); their posts are in Overzicht → Fediverse. */
  fediverse: boolean
}

export const SERVER_INFO_LIMITS = { name: 60, description: 500, adminName: 80, contactEmail: 254, country: 60, hosting: 120, mailService: 120, rules: 3000, reason: 200 }

export type ServerInfoInput = Omit<ServerInfo, 'domain'>

/** A server this one knows of (Beheer → Servers). */
export type KnownServer = {
  domain: string
  policy: ServerPolicy
  reason: string
  /** Its software and whether it speaks Weide (another Kuddes) or only ActivityPub (Mastodon and the like). */
  software: string | null
  weide: boolean
  accounts: number
  /** Friendships between members here and accounts there. */
  friendships: number
  lastSeenAt: string | null
  /** Deliveries there have failed since then (it may be down). */
  failingSince: string | null
}

export type FederationOverview = {
  info: ServerInfo
  servers: KnownServer[]
  queue: { waiting: number; failing: number }
}

/** A handle like "@naam@server.nl" (or "naam@server.nl"); the server may have a port while testing. */
export const HANDLE_PATTERN = /^@?([a-z0-9][a-z0-9_.-]*)@([a-z0-9.-]+\.[a-z]{2,}|localhost(?::\d+)?|[a-z0-9.-]+:\d+)$/i

/** The server part of a remote member's username ("naam@server.nl"), or null for a member of this server. */
export const serverOf = (username: string) => {
  const at = username.indexOf('@')
  return at < 0 ? null : username.slice(at + 1)
}
