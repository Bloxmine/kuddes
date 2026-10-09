/**
 * Things from the site shared in Kuddes Messenger: a page address becomes a
 * small preview (title, a bit of text, a picture). Made for whoever looks at
 * it: what they may not see (a friends-only blog, a hidden video, a besloten
 * Kudde's event, a staff-only forum section) gives null.
 */
import { and, asc, count, desc, eq, isNull, lte } from 'drizzle-orm'
import type { SharePreview } from '../../shared/api'
import { blogImage, blogSnippet } from '../../shared/blogs'
import { threadHref } from '../../shared/forum'
import { MEDIA_KINDS, mediaHref } from '../../shared/media'
import { recipeHref } from '../../shared/recipes'
import { formatDuration } from '../../shared/videos'
import { db } from '../db/client'
import { blogs, forumPosts, forumSections, forumThreads, glitters, kuddeEvents, kuddes, mediaItems, mediaReviews, musicPages, news, photographyPages, photos, radioStations, recipes, tracks, users, videos, type User } from '../db/schema'
import { MUSIC_GENRES, type MusicGenre } from '../../shared/music'
import { musicTrackById } from '../routes/music'
import { liveState } from './radioLive'
import { readableBy } from '../routes/blogs'
import { glitterImage } from './glitters'
import { memberCount, membershipOf } from './kuddes'
import { friendshipState } from './users'
import { toMediaSummary } from './mediaShelf'
import { plainText } from './seo'
import { uploadUrl } from './serialize'
import { selectVideos, toVideoSummary, videoVisibleTo } from './videos'

const notBlocked = isNull(users.blockedAt)
const idOf = (part: string | undefined) => {
  const n = Number.parseInt(part ?? '', 10)
  return Number.isInteger(n) && n > 0 ? n : null
}

const base = (p: Pick<SharePreview, 'kind' | 'label' | 'icon' | 'title' | 'href'> & Partial<SharePreview>): SharePreview => ({
  subtitle: '',
  text: '',
  imageUrl: null,
  rating: null,
  media: null,
  track: null,
  ...p,
})

/** "/recepten/12-hutspot" (or the full address on this site) to its preview for this member, or null. */
export async function sharePreview(path: string, viewer: User): Promise<SharePreview | null> {
  let url: URL
  try {
    url = new URL(path, 'https://kuddes.local')
  } catch {
    return null
  }
  const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p))
  const [a, b, c, d] = parts
  const q = (k: string) => url.searchParams.get(k)

  // A review, or an item in Recensies
  if (a === 'recensies' && b && parts.length === 2) {
    const itemId = idOf(b)
    if (!itemId) return null
    const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, itemId))
    if (!item) return null
    const media = toMediaSummary(item)
    const kind = MEDIA_KINDS[media.kind]
    const reviewId = idOf(q('recensie') ?? undefined)
    if (reviewId) {
      const [r] = await db
        .select({ review: mediaReviews, user: { nickname: users.nickname } })
        .from(mediaReviews)
        .innerJoin(users, eq(users.id, mediaReviews.userId))
        .where(and(eq(mediaReviews.id, reviewId), eq(mediaReviews.itemId, itemId), notBlocked))
      if (r)
        return base({
          kind: 'recensie',
          label: 'Recensie',
          icon: 'star',
          title: media.title,
          subtitle: `${r.user.nickname} over ${kind.one.toLowerCase()}${media.creator ? ` van ${media.creator}` : ''}`,
          text: plainText(r.review.text, 160),
          imageUrl: media.photoUrl,
          href: `${mediaHref(media)}?recensie=${r.review.id}`,
          rating: r.review.rating,
          media,
        })
    }
    return base({
      kind: 'media',
      label: kind.one,
      icon: 'star',
      title: media.title,
      subtitle: [media.creator, media.year, `${media.reviews} ${media.reviews === 1 ? 'recensie' : 'recensies'}`].filter(Boolean).join(' · '),
      text: plainText(media.description ?? '', 140),
      imageUrl: media.photoUrl,
      href: mediaHref(media),
      rating: media.reviews ? media.rating : null,
      media,
    })
  }

  if (a === 'recepten' && b && parts.length === 2) {
    const id = idOf(b)
    if (!id) return null
    const [r] = await db.select({ recipe: recipes, nickname: users.nickname }).from(recipes).innerJoin(users, eq(users.id, recipes.userId)).where(and(eq(recipes.id, id), notBlocked))
    if (!r) return null
    return base({
      kind: 'recept',
      label: 'Recept',
      icon: 'cutlery',
      title: r.recipe.title,
      subtitle: `van ${r.nickname} · ${r.recipe.minutes} min · ${r.recipe.servings} ${r.recipe.servings === 1 ? 'persoon' : 'personen'}`,
      text: plainText(r.recipe.intro, 140),
      imageUrl: uploadUrl(r.recipe.photoPath),
      href: recipeHref(r.recipe),
    })
  }

  if (a === 'blogs' && b && parts.length === 2) {
    const id = idOf(b)
    if (!id) return null
    const [r] = await db.select({ blog: blogs, nickname: users.nickname }).from(blogs).innerJoin(users, eq(users.id, blogs.userId)).where(and(eq(blogs.id, id), readableBy(viewer), notBlocked))
    if (!r) return null
    return base({ kind: 'blog', label: 'Blog', icon: 'book_open', title: r.blog.title, subtitle: `door ${r.nickname}`, text: blogSnippet(r.blog.body, 140), imageUrl: blogImage(r.blog.body), href: `/blogs/${r.blog.id}` })
  }

  if (a === 'video' && b === 'kijk' && q('v')) {
    const [row] = await selectVideos().where(and(eq(videos.publicId, q('v')!), videoVisibleTo(viewer, 'link'), eq(videos.status, 'klaar')))
    if (!row) return null
    const v = toVideoSummary({ ...row, rating: Number(row.rating), ratingCount: Number(row.ratingCount) })
    return base({ kind: 'video', label: 'Kuddes Video', icon: 'television', title: v.title, subtitle: `${v.user.nickname} · ${formatDuration(v.duration)} · ${v.views} keer bekeken`, text: v.snippet, imageUrl: v.thumbUrl, href: `/video/kijk?v=${v.id}` })
  }

  if (a === 'profiel' && b && parts.length === 2 && b !== '@me') {
    const fotoId = idOf(q('foto') ?? undefined)
    if (fotoId) {
      const [r] = await db.select({ photo: photos, user: { username: users.username, nickname: users.nickname } }).from(photos).innerJoin(users, eq(users.id, photos.userId)).where(and(eq(photos.id, fotoId), notBlocked))
      if (!r) return null
      return base({ kind: 'foto', label: 'Foto', icon: 'photo', title: r.photo.caption || `Foto van ${r.user.nickname}`, subtitle: `van ${r.user.nickname}`, imageUrl: uploadUrl(r.photo.path), href: `/profiel/${r.user.username}?tab=fotos&foto=${r.photo.id}` })
    }
    const [u] = await db.select().from(users).where(and(eq(users.username, b.toLowerCase()), notBlocked))
    if (!u) return null
    return base({ kind: 'profiel', label: 'Profiel', icon: 'user', title: u.nickname, subtitle: [u.city, `@${u.username}`].filter(Boolean).join(' · '), text: plainText(u.about ?? '', 120), imageUrl: uploadUrl(u.avatarPath), href: `/profiel/${u.username}` })
  }

  if (a === 'kuddes' && b && b !== 'nieuw') {
    const [k] = await db.select({ kudde: kuddes, members: memberCount }).from(kuddes).where(eq(kuddes.slug, b))
    if (!k) return null
    if (c === 'evenementen') {
      const id = idOf(d)
      if (!id) return null
      // A besloten Kudde's events are for its members
      if (k.kudde.visibility === 'besloten' && !['owner', 'member'].includes(await membershipOf(k.kudde.id, viewer.id))) return null
      const [e] = await db.select().from(kuddeEvents).where(and(eq(kuddeEvents.id, id), eq(kuddeEvents.kuddeId, k.kudde.id)))
      if (!e) return null
      const when = e.startsAt.toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
      return base({ kind: 'evenement', label: 'Evenement', icon: 'calendar', title: e.title, subtitle: [when, e.location, k.kudde.name].filter(Boolean).join(' · '), text: plainText(e.description ?? '', 120), imageUrl: uploadUrl(k.kudde.imagePath), href: `/kuddes/${k.kudde.slug}/evenementen/${e.id}` })
    }
    if (parts.length !== 2) return null
    const n = Number(k.members)
    return base({ kind: 'kudde', label: 'Kudde', icon: 'group', title: k.kudde.name, subtitle: `${n} ${n === 1 ? 'lid' : 'leden'}${k.kudde.city ? ` · ${k.kudde.city}` : ''}`, text: plainText(k.kudde.description ?? '', 140), imageUrl: uploadUrl(k.kudde.imagePath), href: `/kuddes/${k.kudde.slug}` })
  }

  if (a === 'forum' && b && c && parts.length === 3) {
    const id = idOf(c)
    if (!id) return null
    const [t] = await db
      .select({ thread: forumThreads, section: { slug: forumSections.slug, name: forumSections.name, staffOnly: forumSections.staffOnly }, nickname: users.nickname })
      .from(forumThreads)
      .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
      .innerJoin(users, eq(users.id, forumThreads.userId))
      .where(eq(forumThreads.id, id))
    if (!t || (t.section.staffOnly && !viewer.forumRole)) return null
    const [first] = await db.select({ body: forumPosts.body }).from(forumPosts).where(and(eq(forumPosts.threadId, id), isNull(forumPosts.deletedAt))).orderBy(asc(forumPosts.id)).limit(1)
    const replies = Math.max(0, t.thread.postCount - 1)
    return base({
      kind: 'onderwerp',
      label: 'Forum',
      icon: 'comments',
      title: t.thread.title,
      subtitle: `${t.section.name} · ${t.nickname} · ${replies} ${replies === 1 ? 'reactie' : 'reacties'}`,
      text: blogSnippet(first?.body ?? '', 140),
      href: threadHref(t.section.slug, t.thread.id, t.thread.title),
    })
  }

  if (a === 'nieuws' && b && parts.length === 2) {
    const [n] = await db.select().from(news).where(and(eq(news.slug, b), eq(news.published, true), lte(news.publishedAt, new Date())))
    if (!n) return null
    return base({ kind: 'nieuws', label: n.label || 'Nieuws', icon: 'newspaper', title: n.title, subtitle: 'Kuddes nieuws', text: plainText(n.summary, 140), imageUrl: uploadUrl(n.bannerPath), href: `/nieuws/${n.slug}` })
  }

  // A photographer's page, or one photo on it: /fotografie/sanne/foto/12 (or the older ?foto=12); only what this member may see
  if (a === 'fotografie' && b && (parts.length === 2 || (parts.length === 4 && c === 'foto'))) {
    const [r] = await db.select({ page: photographyPages, user: users }).from(photographyPages).innerJoin(users, eq(users.id, photographyPages.userId)).where(and(eq(users.username, b.toLowerCase()), notBlocked))
    if (!r) return null
    const friends = r.page.visibility !== 'vrienden' || r.user.id === viewer.id || (await friendshipState(viewer.id, r.user.id)) === 'friends'
    if (!friends) return null
    const fotoId = c === 'foto' ? idOf(d) : idOf(q('foto') ?? undefined)
    if (fotoId) {
      const [photo] = await db.select().from(photos).where(and(eq(photos.id, fotoId), eq(photos.userId, r.user.id), eq(photos.inPhotography, true)))
      if (!photo) return null
      const camera = photo.showExif && photo.exif?.camera ? ` · ${photo.exif.camera}` : ''
      return base({ kind: 'foto', label: 'Fotografie', icon: 'camera', title: photo.caption || `Foto van ${r.user.nickname}`, subtitle: `door ${r.user.nickname}${camera}`, imageUrl: uploadUrl(photo.path), href: `/fotografie/${r.user.username}/foto/${photo.id}` })
    }
    const [cover] = await db.select({ path: photos.path }).from(photos).where(and(eq(photos.userId, r.user.id), eq(photos.inPhotography, true))).orderBy(desc(photos.id)).limit(1)
    return base({ kind: 'foto', label: 'Fotografie', icon: 'camera', title: r.page.title, subtitle: `door ${r.user.nickname}`, text: plainText(r.page.about, 140), imageUrl: uploadUrl(cover?.path ?? null), href: `/fotografie/${r.user.username}` })
  }

  // A band's page on Kuddes Muziek, or one song on it (?nummer=)
  if (a === 'muziek' && b && parts.length === 2 && b !== 'hitlijst' && b !== 'uploaden') {
    const trackId = idOf(q('nummer') ?? undefined)
    if (trackId) {
      const track = await musicTrackById(trackId, viewer)
      if (!track) return null
      const sub = [track.artist.name, MUSIC_GENRES[track.genre].name, track.released?.date.slice(0, 4)].filter(Boolean).join(' · ')
      return base({ kind: 'muziek', label: 'Nummer', icon: 'music', title: track.title, subtitle: sub, text: plainText(track.description, 120), imageUrl: track.coverUrl, href: `/muziek/${track.artist.slug}?nummer=${track.id}`, track })
    }
    const [r] = await db.select({ page: musicPages, user: users }).from(musicPages).innerJoin(users, eq(users.id, musicPages.userId)).where(and(eq(musicPages.slug, b.toLowerCase()), notBlocked))
    if (!r) return null
    const [{ n }] = await db.select({ n: count() }).from(tracks).where(and(eq(tracks.artistId, r.page.id), eq(tracks.status, 'klaar')))
    return base({ kind: 'muziek', label: 'Muziek', icon: 'music', title: r.page.name, subtitle: `${MUSIC_GENRES[r.page.genre as MusicGenre]?.name ?? 'Muziek'} · ${n} ${n === 1 ? 'nummer' : 'nummers'}`, text: plainText(r.page.bio, 140), imageUrl: uploadUrl(r.page.avatarPath ?? r.page.bannerPath), href: `/muziek/${r.page.slug}` })
  }

  // A radio station: whether it's live now, or what it is
  if (a === 'radio' && b && parts.length === 2 && b !== 'studio') {
    const [r] = await db.select({ station: radioStations, user: users }).from(radioStations).innerJoin(users, eq(users.id, radioStations.userId)).where(and(eq(users.username, b.toLowerCase()), notBlocked))
    if (!r) return null
    const live = liveState(r.user.id)
    return base({
      kind: 'radio',
      label: live ? 'Nu live' : 'Radio',
      icon: 'transmit',
      title: r.station.name,
      subtitle: live ? `${live.title} · ${live.listeners} ${live.listeners === 1 ? 'luisteraar' : 'luisteraars'}` : `Zender van ${r.user.nickname}`,
      text: plainText(r.station.description, 140),
      imageUrl: uploadUrl(r.station.bannerPath),
      href: `/radio/${r.user.username}`,
    })
  }

  if (a === 'glitterplaatjes' && parts.length === 1) {
    const id = idOf(q('plaatje') ?? undefined)
    if (!id) return null
    const [g] = await db.select().from(glitters).where(eq(glitters.id, id))
    if (!g) return null
    return base({ kind: 'glitter', label: 'Glitterplaatje', icon: 'rainbow', title: g.title || 'Glitterplaatje', subtitle: `${g.uses}× gebruikt`, imageUrl: glitterImage(g)?.url ?? null, href: `/glitterplaatjes?plaatje=${g.id}` })
  }

  return null
}
