import { Hono } from 'hono'
import { BP_PATTERNS, type BpPattern } from '../../shared/customization'
import { bpTile } from '../lib/patternTiles'
import type { AppEnv } from '../lib/session'

/** The BuddyPoke patterns as tiles in any colour: /patterns/skull.png?c=ff4fa3. Tiles never change, so browsers keep them. */
export const patternRoutes = new Hono<AppEnv>().get('/patterns/:file{[a-z0-9]+\\.png}', async (c) => {
  const name = c.req.param('file').replace(/\.png$/, '')
  const color = (c.req.query('c') ?? '').toLowerCase()
  if (!(name in BP_PATTERNS) || !/^[0-9a-f]{6}$/.test(color)) return c.notFound()
  const png = await bpTile(name as BpPattern, color)
  c.header('Content-Type', 'image/png')
  c.header('Cache-Control', 'public, max-age=31536000, immutable')
  return c.body(new Uint8Array(png))
})
