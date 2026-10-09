/**
 * Talking to other servers: fetching their JSON safely, and HTTP Signatures
 * (draft-cavage-http-signatures, rsa-sha256, as Mastodon and every Weide
 * server use) on what goes out and what comes in. See WEIDE.md, "Signatures".
 */
import { createHash, createSign, createVerify } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { config } from '../../config'

export const AP_TYPE = 'application/activity+json'
export const AP_ACCEPT = 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
const USER_AGENT = 'Kuddes (Weide/1.0)'
const MAX_BYTES = 1024 * 1024
const TIMEOUT_MS = 10_000

/** While testing, servers on this machine (http://localhost:8799) may talk to each other; a live server only goes out over HTTPS to the internet. */
const allowPrivate = () => !config.isProduction || process.env.FEDERATION_ALLOW_PRIVATE === '1'

function privateAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || a >= 224
  }
  const v6 = ip.toLowerCase()
  if (v6.startsWith('::ffff:')) return privateAddress(v6.slice(7))
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('ff')
}

/** Only addresses on the internet: a member can't make this server fetch something on its own network. */
async function checkUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && !(allowPrivate() && url.protocol === 'http:')) throw new Error(`not https: ${raw}`)
  if (allowPrivate()) return url
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addresses.length || addresses.some(privateAddress)) throw new Error(`not a public address: ${url.host}`)
  return url
}

/** A request to another server: only to public addresses, redirects checked too, with a time and size limit. */
export async function safeFetch(raw: string, init: RequestInit = {}, maxBytes = MAX_BYTES, redirects = 3): Promise<{ res: Response; body: string; data: Buffer; url: string }> {
  const url = await checkUrl(raw)
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': USER_AGENT, ...init.headers },
  })
  if (res.status >= 300 && res.status < 400 && res.headers.get('location') && redirects > 0 && (init.method ?? 'GET') === 'GET') {
    return safeFetch(new URL(res.headers.get('location')!, url).toString(), init, maxBytes, redirects - 1)
  }
  if (Number(res.headers.get('content-length') ?? 0) > maxBytes) throw new Error('response too large')
  const reader = res.body?.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (reader) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > maxBytes) {
      await reader.cancel()
      throw new Error('response too large')
    }
    chunks.push(value)
  }
  const data = Buffer.concat(chunks)
  return { res, body: data.toString('utf8'), data, url: url.toString() }
}

/** The bytes of an image (a profile photo), up to 8 MB. */
export async function fetchImage(raw: string) {
  const { res, data } = await safeFetch(raw, {}, 8 * 1024 * 1024)
  if (!res.ok) throw new Error(`image ${res.status}`)
  return data
}

// ---------------------------------------------------------------- signatures

export type SigningKey = { keyId: string; privateKey: string }

export const digestOf = (body: string) => `SHA-256=${createHash('sha256').update(body).digest('base64')}`

/** The headers for a signed request: Date, Digest (with a body) and Signature over them. */
export function signedHeaders(method: string, raw: string, key: SigningKey, body?: string): Record<string, string> {
  const url = new URL(raw)
  const headers: Record<string, string> = { host: url.host, date: new Date().toUTCString() }
  if (body !== undefined) headers.digest = digestOf(body)
  const names = ['(request-target)', ...Object.keys(headers)]
  const lines = names.map((n) => (n === '(request-target)' ? `(request-target): ${method.toLowerCase()} ${url.pathname}${url.search}` : `${n}: ${headers[n]}`))
  const signature = createSign('sha256').update(lines.join('\n')).sign(key.privateKey, 'base64')
  headers.signature = `keyId="${key.keyId}",algorithm="rsa-sha256",headers="${names.join(' ')}",signature="${signature}"`
  return headers
}

/** A signed GET of an ActivityPub document (servers with "authorized fetch" want one). */
export async function fetchJson(raw: string, key: SigningKey | null) {
  const headers = { Accept: AP_ACCEPT, ...(key ? signedHeaders('GET', raw, key) : {}) }
  delete (headers as Record<string, string>).host
  const { res, body, url } = await safeFetch(raw, { headers })
  if (!res.ok) throw new Error(`${raw}: ${res.status}`)
  return { json: JSON.parse(body) as Record<string, unknown>, url }
}

/** A signed POST of an activity to an inbox; the status, or an error with it. */
export async function postSigned(inbox: string, body: string, key: SigningKey) {
  const headers = signedHeaders('POST', inbox, key, body)
  delete headers.host
  const { res } = await safeFetch(inbox, { method: 'POST', body, headers: { ...headers, 'Content-Type': AP_TYPE, Accept: AP_ACCEPT } })
  return res.status
}

export type IncomingSignature = { keyId: string; headers: string[]; signature: string }

export function parseSignature(header: string | undefined): IncomingSignature | null {
  if (!header) return null
  const parts = Object.fromEntries([...header.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
  if (!parts.keyId || !parts.signature) return null
  if (parts.algorithm && !['rsa-sha256', 'hs2019'].includes(parts.algorithm)) return null
  return { keyId: parts.keyId, headers: (parts.headers ?? 'date').toLowerCase().split(/\s+/), signature: parts.signature }
}

/** Whether a request was signed with this public key: the signed headers, a recent Date, and a Digest that fits the body. */
export function verifySignature(sig: IncomingSignature, req: { method: string; path: string; header: (n: string) => string | undefined }, body: string, publicKey: string) {
  // A signed POST must sign its body (through the digest) and when it was sent
  if (req.method === 'POST' && !sig.headers.includes('digest')) return false
  if (!sig.headers.includes('date') && !sig.headers.includes('(created)')) return false
  const date = req.header('date')
  if (date && Math.abs(Date.now() - new Date(date).getTime()) > 60 * 60 * 1000) return false
  if (sig.headers.includes('digest') && req.header('digest') !== digestOf(body)) {
    const sent = req.header('digest') ?? ''
    // Some servers send more than one digest; ours must be among them
    if (!sent.split(',').some((d) => d.trim() === digestOf(body))) return false
  }
  const lines = sig.headers.map((n) => (n === '(request-target)' ? `(request-target): ${req.method.toLowerCase()} ${req.path}` : `${n}: ${req.header(n) ?? ''}`))
  try {
    return createVerify('sha256').update(lines.join('\n')).verify(publicKey, sig.signature, 'base64')
  } catch {
    return false
  }
}
