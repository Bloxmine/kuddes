/**
 * The doors other servers use (WEIDE.md): WebFinger and NodeInfo to find
 * this server and its members, the actors with their inboxes and outboxes,
 * and the WieWatWaars and knuffels by their ids. Outside /api: no session,
 * no CSRF; everything posted to an inbox must be signed by its actor.
 */
import { and, count, desc, eq, gt, isNotNull, isNull, or } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { withDefaults } from '../../shared/customization'
import { db } from '../db/client'
import { friendships, knuffels, remoteFollows, statuses, users } from '../db/schema'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../config'
import { notFound, HttpError } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { notHidden } from '../lib/reports'
import { serverInfo, signupsClosed } from '../lib/siteSettings'
import { CONTEXT, WEIDE_VERSION, actorDocument, actorForKey, instanceDocument, remoteOf } from '../lib/federation/actors'
import { AP_TYPE, parseSignature, verifySignature } from '../lib/federation/http'
import { handleActivity } from '../lib/federation/inbox'
import { ids, localId } from '../lib/federation/keys'
import { knuffelNote, picturesOf, statusNote } from '../lib/federation/outbox'
import { federationOn, mayFederateWith } from '../lib/federation/servers'

/** What a Weide server can do beyond plain ActivityPub (in NodeInfo, so other servers know). */
export const WEIDE_FEATURES = ['vriendschap', 'knuffels', 'respect', 'wiewatwaar', 'profielontwerp', 'meldingen']

const ap = (c: Context, body: unknown, status: 200 | 404 = 200) => {
  c.header('Content-Type', `${AP_TYPE}; charset=utf-8`)
  c.header('Cache-Control', 'max-age=60')
  return c.body(JSON.stringify(body), status)
}

/** A member of this server who can be seen from elsewhere: not blocked, a dummy or waiting. */
async function sharedMember(username: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, username.toLowerCase()), isNull(users.domain), isNull(users.blockedAt), eq(users.isDummy, false), isNotNull(users.emailVerifiedAt)))
  if (!user) throw notFound('Dit lid bestaat niet.')
  return user
}

const wantsActivity = (c: Context) => /application\/(activity\+json|ld\+json)/.test(c.req.header('accept') ?? '')

/** A signed activity for an inbox: whose key signed it, and does it fit. */
async function receive(c: Context) {
  const body = await c.req.text()
  const sig = parseSignature(c.req.header('signature'))
  if (!sig) throw new HttpError(401, 'Unsigned.')
  let act: Record<string, unknown>
  try {
    act = JSON.parse(body)
  } catch {
    throw new HttpError(400, 'Not JSON.')
  }
  const host = new URL(sig.keyId).host
  if (!(await mayFederateWith(host))) throw new HttpError(403, 'Not federating with this server.')
  const url = new URL(c.req.url)
  const req = { method: c.req.method, path: url.pathname + url.search, header: (n: string) => c.req.header(n) }
  let from
  try {
    from = await actorForKey(sig.keyId)
  } catch {
    // An account we never knew that's being deleted there: nothing to do (and no reason to try again)
    if (act.type === 'Delete') return c.body(null, 202)
    throw new HttpError(401, 'Unknown key.')
  }
  if (!verifySignature(sig, req, body, from.actor.publicKey)) {
    // Perhaps a new key: fetch the actor once more
    from = await actorForKey(sig.keyId, true).catch(() => from!)
    if (!verifySignature(sig, req, body, from.actor.publicKey)) throw new HttpError(401, 'Bad signature.')
  }
  // Only for itself: an activity's actor is the one who signed it
  const actor = typeof act.actor === 'string' ? act.actor : (act.actor as { id?: string } | undefined)?.id
  if (actor !== from.actor.uri) throw new HttpError(403, 'Actor and signature differ.')
  await handleActivity(act, from)
  return c.body(null, 202)
}

const inboxLimit = bodyLimit({
  maxSize: 256 * 1024,
  onError: () => {
    throw new HttpError(413, 'Too large.')
  },
})

async function offWhenOff(_c: Context, next: () => Promise<void>) {
  if (!federationOn()) throw notFound()
  await next()
}

export const federationRoutes = new Hono()
  // Off when the admin turned federation off (NodeInfo still says so)
  .use('/fed/*', offWhenOff)
  .use('/.well-known/webfinger', offWhenOff)

  .get('/.well-known/webfinger', rateLimit('webfinger', 300, 60 * 1000), async (c) => {
    const resource = c.req.query('resource') ?? ''
    const m = /^(?:acct:)?@?([^@]+)@(.+)$/.exec(resource)
    const domain = serverInfo().domain
    // The server's own actor (acct:kuddes.nl@kuddes.nl): Mastodon looks it up before trusting its signature
    const instanceName = new URL(ids.instance()).hostname
    if (m && m[2].toLowerCase() === domain && m[1].toLowerCase() === instanceName) {
      c.header('Access-Control-Allow-Origin', '*')
      c.header('Content-Type', 'application/jrd+json; charset=utf-8')
      return c.body(
        JSON.stringify({ subject: `acct:${instanceName}@${domain}`, aliases: [ids.instance()], links: [{ rel: 'self', type: AP_TYPE, href: ids.instance() }] }),
      )
    }
    let username: string | null = null
    if (m && m[2].toLowerCase() === domain) username = m[1]
    else {
      const local = resource.startsWith('http') ? localId(resource) : null
      if (local?.kind === 'actor') username = local.username
    }
    if (!username) throw notFound()
    const user = await sharedMember(username)
    c.header('Access-Control-Allow-Origin', '*')
    c.header('Content-Type', 'application/jrd+json; charset=utf-8')
    return c.body(
      JSON.stringify({
        subject: `acct:${user.username}@${domain}`,
        aliases: [ids.actor(user.username), ids.profile(user.username)],
        links: [
          { rel: 'self', type: AP_TYPE, href: ids.actor(user.username) },
          { rel: 'http://webfinger.net/rel/profile-page', type: 'text/html', href: ids.profile(user.username) },
        ],
      }),
    )
  })

  .get('/.well-known/nodeinfo', (c) => {
    c.header('Access-Control-Allow-Origin', '*')
    return c.json({ links: [{ rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1', href: `${new URL(ids.instance()).origin}/nodeinfo/2.1` }] })
  })

  .get('/nodeinfo/2.1', async (c) => {
    const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const local = and(isNull(users.domain), eq(users.isDummy, false), isNotNull(users.emailVerifiedAt))
    const [[total], [active], [posts]] = await Promise.all([
      db.select({ n: count() }).from(users).where(local),
      db.select({ n: count() }).from(users).where(and(local, gt(users.lastSeenAt, month))),
      db.select({ n: count() }).from(statuses).where(isNull(statuses.apId)),
    ])
    const info = serverInfo()
    c.header('Access-Control-Allow-Origin', '*')
    return c.json({
      version: '2.1',
      software: { name: 'kuddes', version: '1.0.0', homepage: `${new URL(ids.instance()).origin}/over-kuddes` },
      protocols: ['activitypub'],
      services: { inbound: [], outbound: [] },
      openRegistrations: !signupsClosed(),
      usage: { users: { total: total.n, activeMonth: active.n }, localPosts: posts.n },
      metadata: {
        nodeName: info.name,
        nodeDescription: info.description,
        federation: info.federation,
        weide: { version: WEIDE_VERSION, features: WEIDE_FEATURES },
      },
    })
  })

  // The server's own actor
  .get('/fed/actor', async (c) => ap(c, await instanceDocument()))
  .get('/fed/actor/outbox', (c) => ap(c, { '@context': CONTEXT, id: `${ids.instance()}/outbox`, type: 'OrderedCollection', totalItems: 0, orderedItems: [] }))

  .get('/fed/users/:username', async (c) => ap(c, await actorDocument(await sharedMember(c.req.param('username')))))

  // A friends-only profile doesn't show how many friends it has
  .get('/fed/users/:username/:collection{followers|following}', async (c) => {
    const user = await sharedMember(c.req.param('username'))
    const open = withDefaults(user.preferences).profileFor !== 'vrienden'
    const [[{ n: friends }], [{ n: followers }]] = await Promise.all([
      db
        .select({ n: count() })
        .from(friendships)
        .where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)))),
      db
        .select({ n: count() })
        .from(remoteFollows)
        .where(and(eq(c.req.param('collection') === 'followers' ? remoteFollows.targetId : remoteFollows.followerId, user.id), eq(remoteFollows.accepted, true))),
    ])
    const n = friends + followers
    return ap(c, { '@context': CONTEXT, id: `${ids.actor(user.username)}/${c.req.param('collection')}`, type: 'OrderedCollection', totalItems: open ? n : 0 })
  })

  // The newest public WieWatWaars, so another server can show something right away
  .get('/fed/users/:username/outbox', async (c) => {
    const user = await sharedMember(c.req.param('username'))
    const open = withDefaults(user.preferences).profileFor !== 'vrienden'
    const rows = open
      ? await db
          .select()
          .from(statuses)
          .where(and(eq(statuses.userId, user.id), eq(statuses.visibility, 'iedereen'), isNull(statuses.kuddeId), notHidden('wiewatwaar', statuses.id)))
          .orderBy(desc(statuses.id))
          .limit(20)
      : []
    const pictures = await picturesOf(rows.map((s) => s.id))
    const items = rows.map((s) => {
      const note = statusNote(s, user, pictures.get(s.id))
      return { id: `${note.id}/activity`, type: 'Create', actor: note.attributedTo, published: note.published, to: note.to, cc: note.cc, object: note }
    })
    return ap(c, { '@context': CONTEXT, id: `${ids.actor(user.username)}/outbox`, type: 'OrderedCollection', totalItems: items.length, orderedItems: items })
  })

  // A photo as JPEG, for servers that don't take WebP (Pixelfed, older Mastodon); only what's already public under /uploads/photos
  .get('/fed/media/photos/:name{[\\w-]+\\.jpg}', rateLimit('federatie-media', 600, 60 * 1000), async (c) => {
    const file = path.join(config.uploadDir, 'photos', c.req.param('name').replace(/\.jpg$/, '.webp'))
    const data = await readFile(file).catch(() => null)
    if (!data) throw notFound()
    c.header('Content-Type', 'image/jpeg')
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
    c.header('X-Robots-Tag', 'noindex')
    return c.body(new Uint8Array(await sharp(data).jpeg({ quality: 85, mozjpeg: true }).toBuffer()))
  })

  .post('/fed/inbox', rateLimit('federatie', 1200, 60 * 1000), inboxLimit, receive)
  .post('/fed/actor/inbox', rateLimit('federatie', 1200, 60 * 1000), inboxLimit, receive)
  .post('/fed/users/:username/inbox', rateLimit('federatie', 1200, 60 * 1000), inboxLimit, async (c) => {
    await sharedMember(c.req.param('username'))
    return receive(c)
  })

  // A public WieWatWaar by its id
  .get('/fed/statuses/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [row] = Number.isInteger(id)
      ? await db
          .select({ status: statuses, user: users })
          .from(statuses)
          .innerJoin(users, eq(users.id, statuses.userId))
          .where(and(eq(statuses.id, id), isNull(statuses.apId), isNull(statuses.kuddeId), eq(statuses.visibility, 'iedereen'), notHidden('wiewatwaar', statuses.id)))
      : []
    if (!row || withDefaults(row.user.preferences).profileFor === 'vrienden') throw notFound()
    return ap(c, { '@context': CONTEXT, ...statusNote(row.status, row.user, (await picturesOf([row.status.id])).get(row.status.id)) })
  })

  // A knuffel written here, by its id
  .get('/fed/knuffels/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [row] = Number.isInteger(id)
      ? await db
          .select({ knuffel: knuffels, author: users })
          .from(knuffels)
          .innerJoin(users, eq(users.id, knuffels.authorId))
          .where(and(eq(knuffels.id, id), isNull(knuffels.apId), isNull(users.domain), notHidden('knuffel', knuffels.id)))
      : []
    if (!row) throw notFound()
    const [profile] = await db.select().from(users).where(eq(users.id, row.knuffel.profileId))
    const remote = profile?.domain ? await remoteOf(profile.id) : null
    if (!profile || withDefaults(profile.preferences).profileFor === 'vrienden') throw notFound()
    return ap(c, { '@context': CONTEXT, ...knuffelNote(row.knuffel, row.author, { uri: remote?.actor.uri ?? ids.actor(profile.username), username: profile.username }) })
  })

  // A profile page asked for as ActivityPub (pasting a profile link in Mastodon's search): its actor
  .get('/profiel/:username', async (c, next) => {
    if (!wantsActivity(c) || !federationOn()) return next()
    return c.redirect(ids.actor((await sharedMember(c.req.param('username'))).username), 302)
  })
