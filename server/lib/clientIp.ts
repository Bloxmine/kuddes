import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'
import { config } from '../config'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * The visitor's IP address. Behind the reverse proxy (Caddy on the same
 * server) every connection comes from 127.0.0.1, so then the proxy's
 * X-Forwarded-For header is used, but only when the request really came from
 * the local proxy; otherwise anyone could fake their address.
 */
export function clientIp(c: Context): string {
  const remote = getConnInfo(c).remote.address ?? 'unknown'
  if (config.trustProxy && LOOPBACK.has(remote)) {
    // Caddy appends the real client as the last entry
    const forwarded = c.req.header('x-forwarded-for')?.split(',').map((s) => s.trim()).filter(Boolean)
    if (forwarded?.length) return forwarded[forwarded.length - 1]
  }
  return remote
}
