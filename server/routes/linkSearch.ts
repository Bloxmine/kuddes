/**
 * The link picker in the WieWatWaar box: search what's public on Kuddes
 * (members, open Kuddes and their events, videos, songs and bands, radio
 * stations, photography, recipes, Recensies, blogs, forum topics, news,
 * glitterplaatjes, photos) to link to it. Only what everyone may see,
 * since a WieWatWaar can be read by anyone.
 */
import { and, desc, eq, gte, ilike, isNotNull, isNull, lte, or } from 'drizzle-orm'
import { Hono } from 'hono'
import type { LinkResult } from '../../shared/api'
import { threadHref } from '../../shared/forum'
import { mediaHref } from '../../shared/media'
import { recipeHref } from '../../shared/recipes'
import { db } from '../db/client'
import { blogs, forumSections, forumThreads, glitters, kuddeEvents, kuddes, mediaItems, musicPages, news, photographyPages, photos, radioStations, recipes, tracks, users, videos } from '../db/schema'
import { tracksByIds } from './music'
import { glitterImage } from '../lib/glitters'
import { toMediaSummary } from '../lib/mediaShelf'
import { rateLimit } from '../lib/rateLimit'
import { avatarFor, uploadUrl } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { selectVideos, toVideoSummary, videoVisibleTo } from '../lib/videos'

/** Per kind; the picker shows them grouped. */
const PER_KIND = 4
const notBlocked = isNull(users.blockedAt)

export const linkSearchRoutes = new Hono<AppEnv>().get('/link-search', rateLimit('zoeken', 300, 60 * 60 * 1000), async (c) => {
  requireUser(c)
  const q = (c.req.query('q') ?? '').trim().slice(0, 60)
  if (q.length < 2) return c.json([] satisfies LinkResult[])
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`

  const [people, groups, vids, dishes, items, posts, threads, articles, sparkles, pics, songs, bands, stations, shots, photographers, events] = await Promise.all([
    db
      .select()
      .from(users)
      .where(and(or(ilike(users.username, like), ilike(users.nickname, like), ilike(users.name, like)), isNotNull(users.emailVerifiedAt), notBlocked))
      .orderBy(users.nickname)
      .limit(PER_KIND),
    db
      .select()
      .from(kuddes)
      .where(and(ilike(kuddes.name, like), eq(kuddes.visibility, 'openbaar')))
      .limit(PER_KIND),
    selectVideos()
      .where(and(ilike(videos.title, like), videoVisibleTo(null, 'lijst')))
      .orderBy(desc(videos.id))
      .limit(PER_KIND),
    db
      .select({ recipe: recipes, nickname: users.nickname })
      .from(recipes)
      .innerJoin(users, eq(users.id, recipes.userId))
      .where(and(ilike(recipes.title, like), notBlocked))
      .orderBy(desc(recipes.id))
      .limit(PER_KIND),
    db
      .select()
      .from(mediaItems)
      .where(or(ilike(mediaItems.title, like), ilike(mediaItems.creator, like)))
      .orderBy(desc(mediaItems.id))
      .limit(PER_KIND),
    db
      .select({ blog: blogs, nickname: users.nickname })
      .from(blogs)
      .innerJoin(users, eq(users.id, blogs.userId))
      .where(and(ilike(blogs.title, like), eq(blogs.visibility, 'iedereen'), notBlocked))
      .orderBy(desc(blogs.id))
      .limit(PER_KIND),
    db
      .select({ thread: forumThreads, section: { slug: forumSections.slug, name: forumSections.name } })
      .from(forumThreads)
      .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
      .where(and(ilike(forumThreads.title, like), eq(forumSections.staffOnly, false)))
      .orderBy(desc(forumThreads.lastPostAt))
      .limit(PER_KIND),
    db
      .select()
      .from(news)
      .where(and(ilike(news.title, like), eq(news.published, true), lte(news.publishedAt, new Date())))
      .orderBy(desc(news.publishedAt))
      .limit(PER_KIND),
    db.select().from(glitters).where(ilike(glitters.title, like)).orderBy(desc(glitters.uses)).limit(PER_KIND),
    db
      .select({ photo: photos, username: users.username, nickname: users.nickname })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .where(and(ilike(photos.caption, like), notBlocked))
      .orderBy(desc(photos.id))
      .limit(PER_KIND),
    // Songs and bands on Kuddes Muziek
    db
      .select({ id: tracks.id })
      .from(tracks)
      .innerJoin(users, eq(users.id, tracks.userId))
      .innerJoin(musicPages, eq(musicPages.id, tracks.artistId))
      .where(and(or(ilike(tracks.title, like), ilike(musicPages.name, like)), eq(tracks.status, 'klaar'), notBlocked))
      .orderBy(desc(tracks.plays), desc(tracks.id))
      .limit(PER_KIND),
    db
      .select({ page: musicPages, nickname: users.nickname })
      .from(musicPages)
      .innerJoin(users, eq(users.id, musicPages.userId))
      .where(and(ilike(musicPages.name, like), notBlocked))
      .limit(PER_KIND),
    db
      .select({ station: radioStations, username: users.username, nickname: users.nickname })
      .from(radioStations)
      .innerJoin(users, eq(users.id, radioStations.userId))
      .where(and(or(ilike(radioStations.name, like), ilike(users.nickname, like)), notBlocked))
      .limit(PER_KIND),
    // Photography: only from pages open to everyone
    db
      .select({ photo: photos, username: users.username, nickname: users.nickname })
      .from(photos)
      .innerJoin(users, eq(users.id, photos.userId))
      .innerJoin(photographyPages, eq(photographyPages.userId, photos.userId))
      .where(and(eq(photos.inPhotography, true), eq(photographyPages.visibility, 'iedereen'), or(ilike(photos.caption, like), ilike(users.nickname, like)), notBlocked))
      .orderBy(desc(photos.id))
      .limit(PER_KIND),
    db
      .select({ page: photographyPages, username: users.username, nickname: users.nickname })
      .from(photographyPages)
      .innerJoin(users, eq(users.id, photographyPages.userId))
      .where(and(eq(photographyPages.visibility, 'iedereen'), or(ilike(photographyPages.title, like), ilike(users.nickname, like)), notBlocked))
      .limit(PER_KIND),
    // Coming events of open Kuddes
    db
      .select({ event: kuddeEvents, kudde: { slug: kuddes.slug, name: kuddes.name, imagePath: kuddes.imagePath } })
      .from(kuddeEvents)
      .innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId))
      .where(and(ilike(kuddeEvents.title, like), eq(kuddes.visibility, 'openbaar'), gte(kuddeEvents.startsAt, new Date())))
      .orderBy(kuddeEvents.startsAt)
      .limit(PER_KIND),
  ])
  const songList = await tracksByIds(
    songs.map((s) => s.id),
    null,
  )

  const result: LinkResult[] = [
    ...people.map((u): LinkResult => ({ kind: 'profiel', label: 'Profiel', icon: 'user', title: u.nickname, subtitle: `@${u.username}`, imageUrl: avatarFor(u), href: `/profiel/${u.username}` })),
    ...groups.map((k): LinkResult => ({ kind: 'kudde', label: 'Kudde', icon: 'group', title: k.name, subtitle: k.city ?? '', imageUrl: uploadUrl(k.imagePath), href: `/kuddes/${k.slug}` })),
    ...vids.map((row): LinkResult => {
      const v = toVideoSummary({ ...row, rating: Number(row.rating), ratingCount: Number(row.ratingCount) })
      return { kind: 'video', label: 'Video', icon: 'television', title: v.title, subtitle: v.user.nickname, imageUrl: v.thumbUrl, href: `/video/kijk?v=${v.id}` }
    }),
    ...dishes.map(({ recipe, nickname }): LinkResult => ({ kind: 'recept', label: 'Recept', icon: 'cutlery', title: recipe.title, subtitle: `van ${nickname}`, imageUrl: uploadUrl(recipe.photoPath), href: recipeHref(recipe) })),
    ...items.map((item): LinkResult => {
      const m = toMediaSummary(item)
      return { kind: 'media', label: 'Recensies', icon: 'star', title: m.title, subtitle: [m.creator, m.year].filter(Boolean).join(' · '), imageUrl: m.photoUrl, href: mediaHref(m) }
    }),
    ...posts.map(({ blog, nickname }): LinkResult => ({ kind: 'blog', label: 'Blog', icon: 'book_open', title: blog.title, subtitle: `door ${nickname}`, imageUrl: null, href: `/blogs/${blog.id}` })),
    ...threads.map(({ thread, section }): LinkResult => ({ kind: 'onderwerp', label: 'Forum', icon: 'comments', title: thread.title, subtitle: section.name, imageUrl: null, href: threadHref(section.slug, thread.id, thread.title) })),
    ...articles.map((n): LinkResult => ({ kind: 'nieuws', label: 'Nieuws', icon: 'newspaper', title: n.title, subtitle: 'Kuddes nieuws', imageUrl: uploadUrl(n.bannerPath), href: `/nieuws/${n.slug}` })),
    ...sparkles.map((g): LinkResult => ({ kind: 'glitter', label: 'Glitterplaatje', icon: 'rainbow', title: g.title || 'Glitterplaatje', subtitle: `${g.uses}× gebruikt`, imageUrl: glitterImage(g)?.url ?? null, href: `/glitterplaatjes?plaatje=${g.id}` })),
    ...songList.map((t): LinkResult => ({ kind: 'muziek', label: 'Nummer', icon: 'music', title: t.title, subtitle: t.artist.name, imageUrl: t.coverUrl, href: `/muziek/${t.artist.slug}?nummer=${t.id}` })),
    ...bands.map(({ page, nickname }): LinkResult => ({ kind: 'artiest', label: 'Artiest', icon: 'microphone', title: page.name, subtitle: `door ${nickname}`, imageUrl: uploadUrl(page.avatarPath ?? page.bannerPath), href: `/muziek/${page.slug}` })),
    ...stations.map(({ station, username, nickname }): LinkResult => ({ kind: 'radio', label: 'Radio', icon: 'transmit', title: station.name, subtitle: `zender van ${nickname}`, imageUrl: uploadUrl(station.bannerPath), href: `/radio/${username}` })),
    ...photographers.map(({ page, username, nickname }): LinkResult => ({ kind: 'fotografie', label: 'Fotografie', icon: 'camera', title: page.title, subtitle: `door ${nickname}`, imageUrl: null, href: `/fotografie/${username}` })),
    ...shots.map(({ photo, username, nickname }): LinkResult => ({ kind: 'fotografie', label: 'Fotografie', icon: 'camera', title: photo.caption || `Foto van ${nickname}`, subtitle: `door ${nickname}`, imageUrl: uploadUrl(photo.path), href: `/fotografie/${username}/foto/${photo.id}` })),
    ...events.map(({ event, kudde }): LinkResult => ({ kind: 'evenement', label: 'Evenement', icon: 'calendar', title: event.title, subtitle: `${event.startsAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })} · ${kudde.name}`, imageUrl: uploadUrl(kudde.imagePath), href: `/kuddes/${kudde.slug}/evenementen/${event.id}` })),
    ...pics.map(({ photo, username, nickname }): LinkResult => ({ kind: 'foto', label: 'Foto', icon: 'photo', title: photo.caption || `Foto van ${nickname}`, subtitle: `van ${nickname}`, imageUrl: uploadUrl(photo.path), href: `/profiel/${username}?tab=fotos&foto=${photo.id}` })),
  ]
  return c.json(result)
})
