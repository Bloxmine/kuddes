import { Hono, type Context } from 'hono'
import { cardImage, isCardKind } from '../lib/ogImage'
import { robotsTxt, sitemap } from '../lib/seo'
import type { AppEnv } from '../lib/session'

/** robots.txt, the sitemap, the text-and-data-mining statement and share images. */
export const seoRoutes = new Hono<AppEnv>()
  .get('/robots.txt', (c) => {
    c.header('Cache-Control', 'public, max-age=3600')
    return c.text(robotsTxt())
  })

  .get('/sitemap.xml', async (c) => {
    c.header('Content-Type', 'application/xml; charset=utf-8')
    c.header('Cache-Control', 'public, max-age=3600')
    return c.body(await sitemap())
  })

  // TDM Reservation Protocol (w3.org/community/tdmrep): text and data mining, AI training included, is allowed
  .get('/.well-known/tdmrep.json', (c) => {
    c.header('Cache-Control', 'public, max-age=86400')
    return c.json([{ location: '/', 'tdm-reservation': 0 }])
  })

  // /og/kuddes.jpg, /og/profiel/hein.jpg, /og/video/<id>.jpg…
  .get('/og/:file{[\\w-]+\\.jpg}', (c) => (c.req.param('file') === 'kuddes.jpg' ? sendCard(c, 'kuddes', '') : c.notFound()))
  .get('/og/:kind/:file{[\\w.-]+\\.jpg}', async (c) => {
    const kind = c.req.param('kind')
    // Profiles, Kuddes and their events are for members only: no previews of them
    // (the profielkaartje is the exception: public because the member switched it on)
    if (!isCardKind(kind) || kind === 'profiel' || kind === 'kudde' || kind === 'evenement') return c.notFound()
    return sendCard(c, kind, c.req.param('file').replace(/\.jpg$/, ''))
  })

async function sendCard(c: Context<AppEnv>, kind: Parameters<typeof cardImage>[0], key: string) {
  const image = await cardImage(kind, key)
  c.header('Content-Type', 'image/jpeg')
  // The URL carries a version (?v=), so previews can cache it; link preview
  // services fetch it from their own servers
  c.header('Cache-Control', 'public, max-age=86400')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  // The profielkaartje can be switched off: not kept for long
  if (kind === 'kaartje') c.header('Cache-Control', 'public, max-age=300')
  c.header('X-Robots-Tag', 'noindex')
  return c.body(new Uint8Array(image))
}
