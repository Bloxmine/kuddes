import { gt, isNull, or } from 'drizzle-orm'
import type { IpBanScope } from '../../shared/ipBans'
import { db } from '../db/client'
import { ipBans } from '../db/schema'

/** A network: an address with the first `bits` bits that count. */
export type Net = { v6: boolean; base: bigint; bits: number }

/** The smallest network a ban may cover, so one typo can't lock out half the country. */
const MIN_BITS = { v4: 16, v6: 32 }

function parseV4(s: string): bigint | null {
  const parts = s.split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null
  return parts.reduce((a, p) => (a << 8n) | BigInt(Number(p)), 0n)
}

function parseV6(s: string): bigint | null {
  let text = s
  // An IPv4 address at the end ("::ffff:1.2.3.4") is two groups
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  if (v4) {
    const n = parseV4(v4[1])
    if (n === null) return null
    text = `${text.slice(0, -v4[1].length)}${(n >> 16n).toString(16)}:${(n & 0xffffn).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null
  return groups.reduce((a, g) => (a << 16n) | BigInt(parseInt(g, 16)), 0n)
}

/** An address as a number; an IPv4 address inside IPv6 ("::ffff:1.2.3.4") counts as IPv4. */
export function parseIp(raw: string): { v6: boolean; value: bigint } | null {
  const s = raw
    .trim()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '')
  if (!s) return null
  const v4 = parseV4(s)
  if (v4 !== null) return { v6: false, value: v4 }
  const v6 = parseV6(s)
  if (v6 === null) return null
  if (v6 >> 32n === 0xffffn) return { v6: false, value: v6 & 0xffffffffn }
  return { v6: true, value: v6 }
}

const mask = (v6: boolean, bits: number) => {
  const size = v6 ? 128 : 32
  return ((1n << BigInt(size)) - 1n) ^ ((1n << BigInt(size - bits)) - 1n)
}

/**
 * "203.0.113.7", "203.0.113.0/24", "2001:db8::1" (its /64) or "2001:db8::/48"
 * as a network, or an error message.
 */
export function parseRange(input: string): Net | string {
  const [addr, len, more] = input.trim().split('/')
  if (more !== undefined) return 'Dat is geen IP-adres.'
  const ip = parseIp(addr)
  if (!ip) return 'Dat is geen IP-adres, bijv. 203.0.113.7 of 2001:db8::1.'
  const max = ip.v6 ? 128 : 32
  // One IPv6 address on its own is easy to change: a ban covers the household's /64
  const bits = len === undefined ? (ip.v6 ? 64 : 32) : /^\d{1,3}$/.test(len) ? Number(len) : NaN
  const min = ip.v6 ? MIN_BITS.v6 : MIN_BITS.v4
  if (!(bits >= min && bits <= max)) return `Kies een reeks van /${min} tot /${max}; groter kan per ongeluk heel veel mensen buitensluiten.`
  return { v6: ip.v6, bits, base: ip.value & mask(ip.v6, bits) }
}

export function formatRange(net: Net): string {
  if (!net.v6) {
    const addr = [24n, 16n, 8n, 0n].map((s) => String((net.base >> s) & 0xffn)).join('.')
    return net.bits === 32 ? addr : `${addr}/${net.bits}`
  }
  const groups = Array.from({ length: 8 }, (_, i) => ((net.base >> BigInt((7 - i) * 16)) & 0xffffn).toString(16))
  // The longest run of zero groups becomes ::
  let best = [-1, 0]
  for (let i = 0; i < 8;) {
    if (groups[i] !== '0') {
      i++
      continue
    }
    let j = i
    while (j < 8 && groups[j] === '0') j++
    if (j - i > best[1] && j - i > 1) best = [i, j - i]
    i = j
  }
  const addr = best[0] < 0 ? groups.join(':') : `${groups.slice(0, best[0]).join(':')}::${groups.slice(best[0] + best[1]).join(':')}`
  return net.bits === 128 ? addr : `${addr}/${net.bits}`
}

export function inRange(net: Net, ip: string) {
  const p = parseIp(ip)
  return !!p && p.v6 === net.v6 && (p.value & mask(net.v6, net.bits)) === net.base
}

// Asked on every request: the active bans are kept for half a minute, or until one changes
type Active = { id: number; net: Net; scope: IpBanScope; expiresAt: Date | null }
let cached: { at: number; bans: Active[] } | null = null
export const forgetIpBans = () => (cached = null)

async function active(): Promise<Active[]> {
  if (cached && Date.now() - cached.at < 30_000) return cached.bans
  const rows = await db
    .select()
    .from(ipBans)
    .where(or(isNull(ipBans.expiresAt), gt(ipBans.expiresAt, new Date())))
  const bans = rows.flatMap((r) => {
    const net = parseRange(r.range)
    return typeof net === 'string' ? [] : [{ id: r.id, net, scope: r.scope, expiresAt: r.expiresAt }]
  })
  cached = { at: Date.now(), bans }
  return bans
}

/** The ban on this address, if any: one for the whole site first. */
export async function banOn(ip: string, scope?: IpBanScope) {
  const hits = (await active()).filter((b) => (!b.expiresAt || b.expiresAt > new Date()) && inRange(b.net, ip) && (!scope || b.scope === 'alles' || b.scope === scope))
  return hits.find((b) => b.scope === 'alles') ?? hits[0] ?? null
}
