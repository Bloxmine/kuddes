import { clientIp } from './clientIp'
import { createMiddleware } from 'hono/factory'
import { HttpError } from './errors'
import type { AppEnv } from './session'

type Bucket = { count: number; resetAt: number }

/**
 * Fixed-window rate limit per user (or per IP when logged out). In-memory,
 * so it resets on restart and is per process; fine for a single server.
 * With `successOnly`, only requests that worked count (e.g. accounts actually
 * created, not a typo in the form).
 */
export function rateLimit(name: string, max: number, windowMs: number, { successOnly = false, message }: { successOnly?: boolean; message?: string } = {}) {
  const buckets = new Map<string, Bucket>()

  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
  }, windowMs).unref()

  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user')
    const key = user ? `u:${user.id}` : `ip:${clientIp(c)}`
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs }
      buckets.set(key, bucket)
    }
    if (bucket.count >= max) {
      c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
      throw new HttpError(429, message ?? `Rustig aan! Je doet dit te vaak (${name}). Probeer het straks opnieuw.`)
    }
    if (!successOnly) bucket.count++
    await next()
    // An error is turned into a response before we get here, so its status tells
    if (successOnly && c.res.status < 400) bucket.count++
  })
}
