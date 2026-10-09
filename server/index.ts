import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { config } from './config'
import { sql } from './db/client'
import { CONSENT_VERSION } from '../shared/privacy'
import { HttpError, handleError, notFound, GENERIC_ERROR } from './lib/errors'
import { BLOCKED_BOT_PATTERN, pageMeta, renderBody, renderHead } from './lib/seo'
import { rateLimit } from './lib/rateLimit'
import { isAdminSession, unverifiedMessage, purgeExpiredSessions, sessionMiddleware, type AppEnv } from './lib/session'
import { banOn } from './lib/ipBans'
import { startBotClock } from './lib/bots'
import { hashPlainEntries } from './lib/blacklist'
import { startAutomationClock } from './lib/automations'
import { startAlertClock } from './lib/alerts'
import { purgeOldWarnings } from './lib/moderation'
import { purgeOldReports } from './lib/reports'
import { clientIp } from './lib/clientIp'
import { shareCardOf, shareCardPage } from './lib/shareCard'
import { shareCardRoutes } from './routes/shareCard'
import { designGalleryRoutes } from './routes/designGallery'
import { documentRoutes } from './routes/documents'
import { purgeExpiredTokens } from './lib/emailTokens'
import { adminRoutes } from './routes/admin'
import { authRoutes } from './routes/auth'
import { kuddeRoutes } from './routes/kuddes'
import { kuddeGadgetRoutes } from './routes/kuddeGadgets'
import { buddypokeRoutes } from './routes/buddypoke'
import { TURNSTILE_ORIGIN, turnstileEnabled } from './lib/turnstile'
import { customizationRoutes } from './routes/customization'
import { chatRoutes } from './routes/chat'
import { messengerRoutes } from './routes/messenger'
import { messengerGroupRoutes } from './routes/messengerGroups'
import { mediaRoutes } from './routes/media'
import { soloRoutes } from './routes/solo'
import { bejeweledRoutes } from './routes/bejeweled'
import { blogRoutes } from './routes/blogs'
import { seedMedia } from './db/mediaSeed'
import { eventRoutes } from './routes/events'
import { forumRoutes } from './routes/forum'
import { forumAdminRoutes } from './routes/forumAdmin'
import { gadgetRoutes } from './routes/gadgets'
import { gameRoutes } from './routes/games'
import { glitterRoutes } from './routes/glitters'
import { recipeRoutes } from './routes/recipes'
import { kuddePostRoutes } from './routes/kuddePosts'
import { kuddePhotoRoutes } from './routes/kuddePhotos'
import { sprayRoutes } from './routes/spray'
import { relationRoutes } from './routes/relations'
import { homeRoutes } from './routes/home'
import { knuffelRoutes } from './routes/knuffels'
import { notificationRoutes } from './routes/notifications'
import { linkSearchRoutes } from './routes/linkSearch'
import { photographyRoutes } from './routes/photography'
import { musicRoutes } from './routes/music'
import { radioRoutes } from './routes/radio'
import { resumeMusicProcessing } from './lib/musicProcessing'
import { viewerMiddleware } from './lib/viewer'
import { messageRoutes } from './routes/messages'
import { photoRoutes } from './routes/photos'
import { statusRoutes } from './routes/statuses'
import { seoRoutes } from './routes/seo'
import { patternRoutes } from './routes/patterns'
import { suggestionRoutes } from './routes/suggestions'
import { reportRoutes } from './routes/reports'
import { timelineRoutes } from './routes/timeline'
import { userRoutes } from './routes/users'
import { videoRoutes } from './routes/videos'
import { federationRoutes } from './routes/federation'
import { federationAdminRoutes } from './routes/federationAdmin'
import { startDeliveryClock } from './lib/federation/deliver'
import { resumeVideoProcessing } from './lib/videoProcessing'
import { loadSiteSettings, signupApproval, quiet } from './lib/siteSettings'

const app = new Hono<AppEnv>()

app.use(logger())

// SEO scrapers that say who they are get nothing but robots.txt (which tells
// them the same). Search engines and AI crawlers are welcome. See server/lib/seo.ts.
app.use(async (c, next) => {
  if (c.req.path !== '/robots.txt' && BLOCKED_BOT_PATTERN.test(c.req.header('User-Agent') ?? '')) {
    return c.text('Deze crawler is hier niet welkom. Zie /robots.txt.', 403)
  }
  await next()
})
// A connection the admin banned from the whole site (Beheer → Zwarte lijst) only gets an
// ordinary-looking error, so it doesn't learn it's banned; the admin's own session gets through.
// See server/lib/ipBans.ts.
app.use(async (c, next) => {
  const ban = await banOn(clientIp(c), 'alles')
  if (ban && !(await isAdminSession(c))) {
    if (c.req.path.startsWith('/api/')) return c.json({ error: GENERIC_ERROR }, 500)
    return c.html(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Kuddes</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eaf5fd;color:#1b2733;font:15px/1.6 Verdana,sans-serif}main{max-width:460px;margin:16px;padding:24px;border:1px solid #9fcdf0;border-radius:10px;background:#fff}h1{margin:0 0 8px;color:#13324f;font:bold 22px 'Trebuchet MS',sans-serif}</style></head><body><main><h1>Er ging iets mis</h1><p>${GENERIC_ERROR}</p></main></body></html>`,
      500,
    )
  }
  await next()
})
// Federation (WEIDE.md): WebFinger, NodeInfo and the ActivityPub actors and inboxes other servers use
app.route('/', federationRoutes)
// The profielkaartje as a page of its own (/kaartje/:username): other sites may put it in an
// iframe, so it gets its own, narrower headers instead of the site's (which forbid framing)
app.get('/kaartje/:username', rateLimit('kaartjes', 120, 60 * 1000), sessionMiddleware, async (c) => {
  const username = c.req.param('username').toLowerCase()
  // Your own preview (from the settings) also works while the card is still off
  const own = c.get('user')?.username === username && c.req.query('voorbeeld') !== undefined
  const card = await shareCardOf(username, own)
  c.header('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'")
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  // Short: turning the card on or changing it should show soon; "off" isn't kept at all
  c.header('Cache-Control', own || !card ? 'no-store' : 'public, max-age=60')
  c.header('X-Robots-Tag', 'noindex')
  if (!card) return c.html('<!doctype html><meta charset="utf-8"><title>Kuddes</title><p style="font:13px Verdana,sans-serif;color:#555">Dit kaartje bestaat niet, of staat uit.</p>', 404)
  return c.html(shareCardPage(card, c.req.query('embed') !== undefined))
})

app.use(
  secureHeaders({
    crossOriginResourcePolicy: 'same-origin',
    // HTTPS only, for a year, once the site is live (Caddy serves the certificate)
    strictTransportSecurity: config.https ? 'max-age=31536000; includeSubDomains' : false,
    referrerPolicy: 'strict-origin-when-cross-origin',
    // The microphone only for ourselves: voice calls in Messenger
    permissionsPolicy: { camera: [], microphone: ['self'], geolocation: [], payment: [], usb: [] },
    // Only our own scripts; the outside world is limited to what the site uses:
    // YouTube thumbnails and embeds (gadgets), Open-Meteo (the weather box) and,
    // when it's switched on, Cloudflare's captcha on the sign-up form
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...(turnstileEnabled() ? [TURNSTILE_ORIGIN] : [])],
      // React sets inline style attributes (skins, progress bars)
      styleSrc: ["'self'", "'unsafe-inline'"],
      // SomaFM for the Radio gadget: its station logos and streams
      imgSrc: ["'self'", 'data:', 'blob:', 'https://i.ytimg.com', 'https://api.somafm.com'],
      mediaSrc: ["'self'", 'blob:', 'https://ice1.somafm.com', 'https://ice2.somafm.com', 'https://ice4.somafm.com', 'https://ice6.somafm.com'],
      connectSrc: ["'self'", 'https://api.open-meteo.com', 'https://geocoding-api.open-meteo.com', ...(turnstileEnabled() ? [TURNSTILE_ORIGIN] : [])],
      frameSrc: ["'self'", 'https://www.youtube-nocookie.com', ...(turnstileEnabled() ? [TURNSTILE_ORIGIN] : [])],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      ...(config.https && { upgradeInsecureRequests: [] }),
    },
  }),
)

// Only these upload folders are public, and only the WebP files the server
// wrote itself (and re-encoded GIFs for glitterplaatjes, and the MP3s of
// /muziek and the radio sound buttons, which anyone may hear). Videos stream
// through /api/videos/:id/file (which checks who may see them), and
// unprocessed uploads are never served.
const PUBLIC_UPLOAD = /^\/uploads\/((avatars|photos|kuddes|backgrounds|glitters|recipes|posts|news|media|signatures|blogs|videos\/thumbs|banners|covers)\/[\w-]+\.webp|(glitters|signatures)\/[\w-]+\.gif|(music|radio)\/[\w-]+\.mp3)$/
app.use('/uploads/*', async (c, next) => {
  if (!PUBLIC_UPLOAD.test(c.req.path)) throw notFound()
  await next()
  // Members' photos belong on their profiles, not in image search
  c.header('X-Robots-Tag', 'noindex')
})
app.use(
  '/uploads/*',
  serveStatic({
    root: config.uploadDir,
    rewriteRequestPath: (p) => p.replace(/^\/uploads/, ''),
    onFound: (_path, c) => {
      c.header('Cache-Control', 'public, max-age=31536000, immutable')
    },
  }),
)

if (!existsSync(path.join(config.buddypokeDir, 'gadget.html'))) {
  console.warn(`BuddyPoke not found in ${config.buddypokeDir}: copy web/ there (DEPLOY.md 5.3), or the BuddyPoke boxes stay empty`)
}

// BuddyPoke gadget: only the files the gadget needs, never the rest of web/
// (its .git, decompiled SWFs in extract/, tools/).
const BUDDYPOKE_FILES = /^\/buddypoke\/(gadget\.html|index\.html|css\/[\w.-]+\.css|js\/[\w/.-]+\.js|assets\/[\w.-]+)$/
app.use('/buddypoke/*', async (c, next) => {
  if (!BUDDYPOKE_FILES.test(c.req.path) || c.req.path.includes('..')) throw notFound()
  await next()
})
app.use(
  '/buddypoke/*',
  serveStatic({
    root: config.buddypokeDir,
    rewriteRequestPath: (p) => p.replace(/^\/buddypoke/, ''),
    onFound: (_path, c) => {
      c.header('Cache-Control', 'public, max-age=3600')
    },
  }),
)

if (!existsSync(path.join(config.bejeweledDir, 'assets/manifest.json'))) {
  console.warn(`Bejeweled 3 not found in ${config.bejeweledDir}: build or copy its assets (DEPLOY.md 5.3), or the game won't load`)
}

// Bejeweled 3: the page, its scripts and the assets, nothing else of games/bejeweled
const BEJEWELED_FILES = /^\/bejeweled\/(index\.html|js\/[\w.-]+\.js|assets\/[\w/ .%-]+)$/
app.use('/bejeweled/*', async (c, next) => {
  if (!BEJEWELED_FILES.test(c.req.path) || c.req.path.includes('..')) throw notFound()
  await next()
})
app.get('/bejeweled', (c) => c.redirect('/bejeweled/index.html'))
app.use(
  '/bejeweled/*',
  serveStatic({
    root: config.bejeweledDir,
    rewriteRequestPath: (p) => p.replace(/^\/bejeweled/, ''),
    onFound: (p, c) => {
      // The art and sounds don't change; the code and the asset list (manifest.json, which grows when
      // the assets are rebuilt, e.g. for a new mode) do, so those are checked every time
      c.header('Cache-Control', /\/assets\//.test(p) && !p.endsWith('manifest.json') ? 'public, max-age=604800' : 'no-cache')
    },
  }),
)

const api = new Hono<AppEnv>()
// Rejects cross-site form posts: mutations must come from our own origin
api.use(csrf())
// Ordinary requests are small; uploads (multipart forms, the video file, documents) have their own limits
const smallBody = bodyLimit({
  maxSize: 1024 * 1024,
  onError: () => {
    throw new HttpError(413, 'Dit verzoek is te groot.')
  },
})
api.use('*', async (c, next) => {
  const type = c.req.header('content-type') ?? ''
  const isUpload =
    type.startsWith('multipart/form-data') ||
    (c.req.method === 'PUT' && /^\/api\/videos\/[\w-]+\/file$/.test(c.req.path)) ||
    // Kuddes Woord documents can hold pictures; their routes set a limit of their own
    /^\/api\/me\/documents(\/\d+)?$/.test(c.req.path)
  return isUpload ? next() : smallBody(c, next)
})
// For uptime checks: is the API up and can it reach the database?
api.get('/health', async (c) => {
  await sql`select 1`
  return c.json({ ok: true })
})
api.use(sessionMiddleware)
// The quiet mode (Beheer → Rustige stand): no uploads (every upload is a multipart form) and no new Kuddes
api.use(async (c, next) => {
  const q = quiet()
  const user = c.get('user')
  if (q && c.req.method !== 'GET' && user?.forumRole !== 'admin') {
    if (q.pauseUploads && (c.req.header('content-type') ?? '').startsWith('multipart/form-data'))
      throw new HttpError(503, 'Uploaden staat even uit: Kuddes staat in de rustige stand. Probeer het later nog eens.')
    if (q.pauseKuddes && c.req.method === 'POST' && c.req.path === '/api/kuddes') throw new HttpError(503, 'Nieuwe Kuddes maken kan even niet: Kuddes staat in de rustige stand.')
  }
  await next()
})
// API answers aren't pages for search engines
api.use(async (c, next) => {
  await next()
  c.header('X-Robots-Tag', 'noindex')
})
// Normal use is a handful of requests per page; this stops bulk scraping
api.use(rateLimit('verzoeken', 600, 60 * 1000))
// Members only: profiles and everything on them, member search, the photos,
// WieWatWaars, the timeline, Kuddes and the agenda. Without an account you
// can still read the forum, watch videos (and channels), and read the news
// and recipes. Uploaded files keep their unguessable names, so avatars and
// photos in forum posts and videos still show.
const MEMBERS_ONLY = [
  /^\/api\/users\/[^/]+$/,
  /^\/api\/users\/[^/]+\/(friends|visitors|gadgets|knuffels|photos|statuses|kuddes|achievements|games)$/,
  /^\/api\/search$/,
  /^\/api\/photos(\/|$)/,
  /^\/api\/statuses$/,
  /^\/api\/timeline$/,
  /^\/api\/buddypoke\/users\//,
  /^\/api\/forum\/users\//,
  /^\/api\/kuddes(\/|$)/,
  /^\/api\/kudde-photos\//,
  /^\/api\/events\//,
  /^\/api\/agenda$/,
  /^\/api\/blogs(\/|$)/,
]
// On the waitlist (not approved by the admin yet): you see what a visitor sees,
// and you can only do things to your own account: your settings, design,
// layout and gadgets, and upload a profile photo and background. Nothing
// you could post, send or upload for others, and no one else's profile.
const WAITING_READS = [/^\/api\/auth\//, /^\/api\/me(\/|$)/, /^\/api\/buddypoke\/me$/]
const WAITING_WRITES = [
  /^\/api\/auth\//,
  // Settings (PATCH) and deleting your account (DELETE)
  /^\/api\/me$/,
  /^\/api\/me\/(avatar|backgrounds|designs|layouts|gadgets|password|sessions|share-card)(\/|$)/,
  /^\/api\/buddypoke\/me$/,
]
// With a confirmation mail instead (the normal way), even less until they
// click the link: the site is as for a visitor, and they can only see to
// their account itself (a new mail, another address, logging out, deleting it).
const UNCONFIRMED_WRITES = [/^\/api\/auth\//]
api.use(async (c, next) => {
  const user = c.get('user')
  if (user && !user.emailVerifiedAt) {
    const path = c.req.path
    const reading = c.req.method === 'GET' || c.req.method === 'HEAD'
    if (signupApproval()) {
      const own = path.toLowerCase() === `/api/users/${user.username}` || path.toLowerCase().startsWith(`/api/users/${user.username}/`)
      // Anything else is answered as for a visitor
      if (reading) {
        if (!own && !WAITING_READS.some((r) => r.test(path))) c.set('user', null)
      } else if (!WAITING_WRITES.some((r) => r.test(path))) {
        throw new HttpError(403, unverifiedMessage(), undefined, 'unverified')
      }
    } else if (reading) {
      if (!/^\/api\/auth\//.test(path)) c.set('user', null)
    } else if (!UNCONFIRMED_WRITES.some((r) => r.test(path)) && !(c.req.method === 'DELETE' && path === '/api/me')) {
      throw new HttpError(403, unverifiedMessage(), undefined, 'unverified')
    }
  }
  await next()
})
// After a new privacy statement, members can look around but not do anything
// until they agree to it (the site asks them first), apart from their account
// itself: agreeing, logging out, or deleting it.
const BEFORE_CONSENT_WRITES = [/^\/api\/auth\//, /^\/api\/me\/consent$/]
api.use(async (c, next) => {
  const user = c.get('user')
  const reading = c.req.method === 'GET' || c.req.method === 'HEAD'
  if (user && !reading && user.privacyVersion !== CONSENT_VERSION) {
    const path = c.req.path
    if (!BEFORE_CONSENT_WRITES.some((r) => r.test(path)) && !(c.req.method === 'DELETE' && path === '/api/me')) {
      throw new HttpError(403, 'Ga eerst akkoord met de nieuwe privacyverklaring en gebruikersovereenkomst.', undefined, 'privacy')
    }
  }
  await next()
})
api.use(async (c, next) => {
  if (!c.get('user') && MEMBERS_ONLY.some((r) => r.test(c.req.path))) throw new HttpError(401, 'Log in om dit te bekijken.')
  await next()
})
// From here on, toSummary knows whether a visitor without an account is looking (hidden profile photos)
api.use(viewerMiddleware)
api.route('/auth', authRoutes)
api.route('/', adminRoutes)
api.route('/', userRoutes)
api.route('/', customizationRoutes)
api.route('/', statusRoutes)
api.route('/', knuffelRoutes)
api.route('/', notificationRoutes)
api.route('/', linkSearchRoutes)
api.route('/', photographyRoutes)
api.route('/', musicRoutes)
api.route('/', radioRoutes)
api.route('/', messageRoutes)
api.route('/', gadgetRoutes)
api.route('/', photoRoutes)
api.route('/', kuddeRoutes)
api.route('/', kuddeGadgetRoutes)
api.route('/', eventRoutes)
api.route('/', videoRoutes)
api.route('/', forumRoutes)
api.route('/', forumAdminRoutes)
api.route('/', chatRoutes)
api.route('/', messengerRoutes)
api.route('/', messengerGroupRoutes)
api.route('/', mediaRoutes)
api.route('/', soloRoutes)
api.route('/', bejeweledRoutes)
api.route('/', blogRoutes)
api.route('/', suggestionRoutes)
api.route('/', reportRoutes)
api.route('/', timelineRoutes)
api.route('/', buddypokeRoutes)
api.route('/', gameRoutes)
api.route('/', glitterRoutes)
api.route('/', recipeRoutes)
api.route('/', kuddePostRoutes)
api.route('/', kuddePhotoRoutes)
api.route('/', sprayRoutes)
api.route('/', relationRoutes)
api.route('/', homeRoutes)
api.route('/', shareCardRoutes)
api.route('/', designGalleryRoutes)
api.route('/', documentRoutes)
api.route('/', federationAdminRoutes)
api.all('*', () => {
  throw notFound('Onbekende API-route.')
})
api.onError(handleError)
app.route('/api', api)

// robots.txt, sitemap.xml and share images (/og/…)
app.use('/og/*', rateLimit('deelafbeeldingen', 120, 60 * 1000))
app.route('/', seoRoutes)
app.route('/', patternRoutes)

// In production the same server also serves the built React app
if (config.isProduction && existsSync('./dist')) {
  const template = readFileSync('./dist/index.html', 'utf8')
  const pageLimit = rateLimit('paginas', 300, 60 * 1000)
  // App pages (no file extension): index.html with the page's title,
  // description, share card and structured data already in it
  app.get('*', async (c, next) => {
    if (/\.\w+$/.test(c.req.path) || /^\/(api|uploads|buddypoke|og|patterns|kaartje|fed|nodeinfo|\.well-known)\//.test(c.req.path)) return next()
    await pageLimit(c, async () => {})
    const url = new URL(c.req.url)
    const meta = await pageMeta(url.pathname, url.searchParams)
    c.header('Cache-Control', 'no-cache')
    if (meta.noindex) c.header('X-Robots-Tag', 'noindex')
    return c.html(renderBody(renderHead(template, meta), meta, url.pathname), meta.status)
  })
  app.use(
    '/*',
    serveStatic({
      root: './dist',
      onFound: (path, c) => {
        // Built files have a hash in their name, so they can be cached for good
        c.header('Cache-Control', /\/assets\//.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache')
      },
    }),
  )
}

app.onError(handleError)

// Pick up videos that were being processed when the server stopped
resumeVideoProcessing().catch((e) => console.error('could not resume video processing', e))
resumeMusicProcessing().catch((e) => console.error('could not resume music processing', e))
// The first titles for Recensies, once
seedMedia().catch((e) => console.error('could not fill the Recensies collection', e))

// The admin's settings (how new members get in), before the first request, and
// again now and then in case another process (a second instance) changed them
await loadSiteSettings()
setInterval(() => loadSiteSettings().catch(console.error), 15_000).unref()

// Only reachable through the reverse proxy in production
serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Kuddes listening on http://${config.host}:${info.port}${config.isProduction ? ' (production)' : ''}`)
})

await Promise.all([purgeExpiredSessions(), purgeExpiredTokens(), purgeOldWarnings(), purgeOldReports()])
startBotClock()
// Blacklist entries from before hashing are hashed now
await hashPlainEntries()
startAutomationClock()
startAlertClock()
startDeliveryClock()
setInterval(() => Promise.all([purgeExpiredSessions(), purgeExpiredTokens(), purgeOldWarnings(), purgeOldReports()]).catch(console.error), 6 * 60 * 60 * 1000).unref()
