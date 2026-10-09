import { and, asc, count, desc, eq, inArray, isNotNull, ne, or } from 'drizzle-orm'
import { getCookie } from 'hono/cookie'
import { createHash } from 'node:crypto'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { Birthday, SavedDesign, SavedLayout, SessionInfo } from '../../shared/api'
import type { DocKind, FormAnswers, FormDef, Question } from '../../shared/documents'
import { serverInfo } from '../lib/siteSettings'
import { MAX_SAVED_DESIGNS, MAX_SAVED_LAYOUTS, withDefaults, type LayoutSnapshot } from '../../shared/customization'
import { db } from '../db/client'
import {
  botWarnings,
  contentReports,
  activityComments,
  blogs,
  glitters,
  kuddeEvents,
  kuddeMembers,
  kuddePhotos,
  kuddePostReplies,
  kuddePosts,
  kuddes,
  mediaItems,
  mediaReviews,
  photoComments,
  recipes,
  suggestions,
  knuffels,
  notifications,
  photoAlbums,
  photographyPages,
  tracks,
  musicPages,
  radioStations,
  radioShows,
  radioSounds,
  radioFollows,
  radioDjs,
  chatMessages,
  forumPosts,
  forumProfiles,
  forumThreads,
  gadgets,
  messages,
  videos,
  videoComments,
  photos,
  savedDesigns,
  savedLayouts,
  sharedDesigns,
  documents,
  formResponses,
  sessions,
  statuses,
  users,
  type User,
} from '../db/schema'
import { customThemeSchema, ownsImages, profileColorsSchema, snapshotSchema } from '../lib/customization'
import { HttpError, notFound, parse } from '../lib/errors'
import { rateLimit } from '../lib/rateLimit'
import { MAX_UPLOAD_BYTES, storeImage } from '../lib/uploads'
import { ageFrom, toSummary, uploadUrl } from '../lib/serialize'
import { requireUser, type AppEnv } from '../lib/session'
import { zipStream, type ZipEntry } from '../lib/zipStream'
import { acceptedFriendsOf, summaryColumns, toMe } from '../lib/users'

const nameSchema = z.string().trim().min(1, 'Geef je indeling een naam.').max(40, 'Een naam mag maximaal 40 tekens hebben.')

const snapshotOf = (user: User): LayoutSnapshot => ({
  theme: user.theme,
  customTheme: user.customTheme,
  skin: user.skin,
  profileColors: user.profileColors,
  profileLayout: user.profileLayout,
  homeLayout: user.homeLayout,
})

const toSaved = (row: typeof savedLayouts.$inferSelect): SavedLayout => ({
  id: row.id,
  name: row.name,
  data: row.data,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

async function ownLayout(userId: number, id: number) {
  const [row] = await db
    .select()
    .from(savedLayouts)
    .where(and(eq(savedLayouts.id, id), eq(savedLayouts.userId, userId)))
  if (!row) throw notFound('Deze indeling bestaat niet (meer).')
  return row
}

/** Days from today until the next birthday (29 Feb counts as 28 Feb in other years). */
function daysUntilBirthday(birthdate: string, now: Date): number {
  const [, month, day] = birthdate.split('-').map(Number)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const next = (year: number) => {
    const leap = new Date(year, 1, 29).getMonth() === 1
    return new Date(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day)
  }
  let date = next(today.getFullYear())
  if (date < today) date = next(today.getFullYear() + 1)
  return Math.round((date.getTime() - today.getTime()) / 86_400_000)
}

const sessionId = (token: string | undefined) => (token ? createHash('sha256').update(token).digest('hex') : '')

const toDesign = (row: typeof savedDesigns.$inferSelect) => ({ id: row.id, kind: row.kind, name: row.name, data: row.data, updatedAt: row.updatedAt.toISOString() }) as SavedDesign

export const customizationRoutes = new Hono<AppEnv>()
  // Upload a background image for your own theme or profile design
  .post(
    '/me/backgrounds',
    bodyLimit({
      maxSize: MAX_UPLOAD_BYTES + 64 * 1024,
      onError: () => {
        throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')
      },
    }),
    rateLimit('uploads', 30, 60 * 60 * 1000),
    async (c) => {
      const me = requireUser(c)
      const body = await c.req.parseBody()
      const stored = await storeImage(body.file, 'backgrounds', `${me.id}-`)
      return c.json({ url: uploadUrl(stored.path), width: stored.width, height: stored.height }, 201)
    },
  )

  // Own designs and colour schemes ("Mijn designs", "Mijn thema's")
  .get('/me/designs', async (c) => {
    const me = requireUser(c)
    const rows = await db.select().from(savedDesigns).where(eq(savedDesigns.userId, me.id)).orderBy(asc(savedDesigns.id))
    return c.json(rows.map(toDesign))
  })

  .post('/me/designs', rateLimit('designs', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ kind: z.enum(['design', 'thema']), name: nameSchema, data: z.unknown() }), await c.req.json().catch(() => null))
    const data = input.kind === 'design' ? parse(profileColorsSchema, input.data) : parse(customThemeSchema, input.data)
    if (!ownsImages(me.id, data)) throw new HttpError(400, 'Je kunt alleen je eigen achtergronden gebruiken.')
    const [{ n }] = await db.select({ n: count() }).from(savedDesigns).where(and(eq(savedDesigns.userId, me.id), eq(savedDesigns.kind, input.kind)))
    if (n >= MAX_SAVED_DESIGNS) throw new HttpError(400, `Je kunt maximaal ${MAX_SAVED_DESIGNS} ${input.kind === 'design' ? 'designs' : "thema's"} bewaren. Verwijder er eerst een.`)
    const [row] = await db.insert(savedDesigns).values({ userId: me.id, kind: input.kind, name: input.name, data }).returning()
    return c.json(toDesign(row), 201)
  })

  // Rename, or save new colours over an existing one
  .patch('/me/designs/:id', rateLimit('designs', 120, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const input = parse(z.object({ name: nameSchema.optional(), data: z.unknown().optional() }), await c.req.json().catch(() => null))
    const [existing] = await db
      .select()
      .from(savedDesigns)
      .where(and(eq(savedDesigns.id, Number(c.req.param('id'))), eq(savedDesigns.userId, me.id)))
    if (!existing) throw notFound('Dit design bestaat niet (meer).')
    const data = input.data === undefined ? undefined : existing.kind === 'design' ? parse(profileColorsSchema, input.data) : parse(customThemeSchema, input.data)
    if (data && !ownsImages(me.id, data)) throw new HttpError(400, 'Je kunt alleen je eigen achtergronden gebruiken.')
    const [row] = await db
      .update(savedDesigns)
      .set({ ...(input.name && { name: input.name }), ...(data && { data }), updatedAt: new Date() })
      .where(eq(savedDesigns.id, existing.id))
      .returning()
    return c.json(toDesign(row))
  })

  .delete('/me/designs/:id', async (c) => {
    const me = requireUser(c)
    await db.delete(savedDesigns).where(and(eq(savedDesigns.id, Number(c.req.param('id'))), eq(savedDesigns.userId, me.id)))
    return c.body(null, 204)
  })

  // Saved looks ("Mijn indelingen")
  .get('/me/layouts', async (c) => {
    const me = requireUser(c)
    const rows = await db.select().from(savedLayouts).where(eq(savedLayouts.userId, me.id)).orderBy(asc(savedLayouts.id))
    return c.json(rows.map(toSaved))
  })

  // Save the current look under a name
  .post('/me/layouts', rateLimit('indelingen', 60, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const { name } = parse(z.object({ name: nameSchema }), await c.req.json().catch(() => null))
    const [{ n }] = await db.select({ n: count() }).from(savedLayouts).where(eq(savedLayouts.userId, me.id))
    if (n >= MAX_SAVED_LAYOUTS) {
      throw new HttpError(400, `Je kunt maximaal ${MAX_SAVED_LAYOUTS} indelingen bewaren. Verwijder er eerst een.`)
    }
    const [row] = await db.insert(savedLayouts).values({ userId: me.id, name, data: snapshotOf(me) }).returning()
    return c.json(toSaved(row), 201)
  })

  // Rename, or overwrite with the current look
  .patch('/me/layouts/:id', async (c) => {
    const me = requireUser(c)
    const row = await ownLayout(me.id, Number(c.req.param('id')))
    const input = parse(
      z.object({ name: nameSchema.optional(), overwrite: z.boolean().optional() }),
      await c.req.json().catch(() => null),
    )
    const [updated] = await db
      .update(savedLayouts)
      .set({ name: input.name ?? row.name, ...(input.overwrite && { data: snapshotOf(me) }), updatedAt: new Date() })
      .where(eq(savedLayouts.id, row.id))
      .returning()
    return c.json(toSaved(updated))
  })

  .delete('/me/layouts/:id', async (c) => {
    const me = requireUser(c)
    const row = await ownLayout(me.id, Number(c.req.param('id')))
    await db.delete(savedLayouts).where(eq(savedLayouts.id, row.id))
    return c.body(null, 204)
  })

  // Switch to a saved look
  .post('/me/layouts/:id/apply', async (c) => {
    const me = requireUser(c)
    const row = await ownLayout(me.id, Number(c.req.param('id')))
    // Re-validate: skins, themes or boxes may have changed since it was saved
    const data = parse(snapshotSchema, row.data)
    if (!ownsImages(me.id, data.customTheme, data.profileColors)) throw new HttpError(400, 'Je kunt alleen je eigen achtergronden gebruiken.')
    const [updated] = await db
      .update(users)
      .set({
        ...data,
        theme: data.theme === 'eigen' && !data.customTheme ? null : data.theme,
        skin: data.skin === 'eigen' && !data.profileColors ? null : data.skin,
      })
      .where(eq(users.id, me.id))
      .returning()
    return c.json(await toMe(updated))
  })

  // Friends with a birthday today or in the coming week
  .get('/friends/birthdays', async (c) => {
    const me = requireUser(c)
    const rows = await db
      .select({ ...summaryColumns, birthdate: users.birthdate, preferences: users.preferences })
      .from(users)
      .where(inArray(users.id, acceptedFriendsOf(me.id)))
    const now = new Date()
    const result: Birthday[] = rows
      .filter((r): r is typeof r & { birthdate: string } => !!r.birthdate)
      .map((r) => {
        const inDays = daysUntilBirthday(r.birthdate, now)
        const age = ageFrom(r.birthdate)
        const turns = withDefaults(r.preferences).showAge && age !== null ? age + (inDays === 0 ? 0 : 1) : null
        return { user: toSummary(r), inDays, turns }
      })
      .filter((b) => b.inDays <= 7)
      .sort((a, b) => a.inDays - b.inDays)
    return c.json(result)
  })

  .get('/me/sessions', async (c) => {
    const me = requireUser(c)
    const [{ n }] = await db.select({ n: count() }).from(sessions).where(eq(sessions.userId, me.id))
    return c.json({ count: n } satisfies SessionInfo)
  })

  // "Uitloggen op alle andere apparaten": keep only this browser's session
  .post('/me/sessions/logout-others', async (c) => {
    const me = requireUser(c)
    const current = sessionId(getCookie(c, 'kuddes_session'))
    await db.delete(sessions).where(and(eq(sessions.userId, me.id), ne(sessions.id, current)))
    return c.json({ count: 1 } satisfies SessionInfo)
  })

  // Everything you posted: a zip with the data as JSON, and every photo and file you uploaded
  .get('/me/export', rateLimit('downloads', 10, 60 * 60 * 1000), async (c) => {
    const me = requireUser(c)
    const [profile, ownStatuses, written, received, ownPhotos, comments, memberships, layouts, pms, ownGadgets, ownVideos, videoReactions, forumRows, forumProfile, chatRows, notes, albums, photoPage, songs, artistPage, station, shows, sounds, follows, djAt] = await Promise.all([
      toMe(me),
      db.select().from(statuses).where(eq(statuses.userId, me.id)).orderBy(desc(statuses.id)),
      db.select().from(knuffels).where(eq(knuffels.authorId, me.id)).orderBy(desc(knuffels.id)),
      db
        .select({ knuffel: knuffels, author: summaryColumns })
        .from(knuffels)
        .innerJoin(users, eq(users.id, knuffels.authorId))
        .where(eq(knuffels.profileId, me.id))
        .orderBy(desc(knuffels.id)),
      db.select().from(photos).where(eq(photos.userId, me.id)).orderBy(desc(photos.id)),
      db.select().from(activityComments).where(eq(activityComments.userId, me.id)).orderBy(desc(activityComments.id)),
      db
        .select({ name: kuddes.name, slug: kuddes.slug, role: kuddeMembers.role, joinedAt: kuddeMembers.joinedAt })
        .from(kuddeMembers)
        .innerJoin(kuddes, eq(kuddes.id, kuddeMembers.kuddeId))
        .where(eq(kuddeMembers.userId, me.id)),
      db.select().from(savedLayouts).where(eq(savedLayouts.userId, me.id)),
      db
        .select({ message: messages, from: users.username })
        .from(messages)
        .innerJoin(users, eq(users.id, messages.senderId))
        .where(
          or(
            and(eq(messages.senderId, me.id), eq(messages.deletedBySender, false)),
            and(eq(messages.recipientId, me.id), eq(messages.deletedByRecipient, false), isNotNull(messages.sentAt)),
          ),
        )
        .orderBy(desc(messages.id)),
      db.select().from(gadgets).where(eq(gadgets.userId, me.id)),
      db.select().from(videos).where(eq(videos.userId, me.id)).orderBy(desc(videos.id)),
      db.select().from(videoComments).where(eq(videoComments.userId, me.id)).orderBy(desc(videoComments.id)),
      db
        .select({ post: forumPosts, thread: forumThreads.title })
        .from(forumPosts)
        .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
        .where(eq(forumPosts.userId, me.id))
        .orderBy(desc(forumPosts.id)),
      db.select().from(forumProfiles).where(eq(forumProfiles.userId, me.id)),
      db.select().from(chatMessages).where(eq(chatMessages.userId, me.id)).orderBy(desc(chatMessages.id)).limit(1000),
      db
        .select({ n: notifications, from: users.username })
        .from(notifications)
        .innerJoin(users, eq(users.id, notifications.actorId))
        .where(eq(notifications.userId, me.id))
        .orderBy(desc(notifications.id)),
      db.select().from(photoAlbums).where(eq(photoAlbums.userId, me.id)),
      db.select().from(photographyPages).where(eq(photographyPages.userId, me.id)),
      db.select().from(tracks).where(eq(tracks.userId, me.id)).orderBy(desc(tracks.id)),
      db.select().from(musicPages).where(eq(musicPages.userId, me.id)),
      db.select().from(radioStations).where(eq(radioStations.userId, me.id)),
      db.select().from(radioShows).where(eq(radioShows.stationId, me.id)),
      db.select().from(radioSounds).where(eq(radioSounds.userId, me.id)),
      db.select({ username: users.username }).from(radioFollows).innerJoin(users, eq(users.id, radioFollows.stationId)).where(eq(radioFollows.userId, me.id)),
      db.select({ username: users.username }).from(radioDjs).innerJoin(users, eq(users.id, radioDjs.stationId)).where(eq(radioDjs.userId, me.id)),
    ])
    const [ownKuddes, kuddeRows, kuddeReplies, kuddeUploads, events, ownGlitters, ownRecipes, ownBlogs, reviews, ideas, photoReactions, designs, shared, docs, givenAnswers, receivedAnswers] = await Promise.all([
      db.select().from(kuddes).where(eq(kuddes.creatorId, me.id)),
      db.select({ post: kuddePosts, kudde: kuddes.name }).from(kuddePosts).innerJoin(kuddes, eq(kuddes.id, kuddePosts.kuddeId)).where(eq(kuddePosts.userId, me.id)).orderBy(desc(kuddePosts.id)),
      db.select().from(kuddePostReplies).where(eq(kuddePostReplies.userId, me.id)).orderBy(desc(kuddePostReplies.id)),
      db.select({ photo: kuddePhotos, kudde: kuddes.name }).from(kuddePhotos).innerJoin(kuddes, eq(kuddes.id, kuddePhotos.kuddeId)).where(eq(kuddePhotos.userId, me.id)).orderBy(desc(kuddePhotos.id)),
      db.select({ event: kuddeEvents, kudde: kuddes.name }).from(kuddeEvents).innerJoin(kuddes, eq(kuddes.id, kuddeEvents.kuddeId)).where(eq(kuddeEvents.creatorId, me.id)),
      db.select().from(glitters).where(eq(glitters.userId, me.id)),
      db.select().from(recipes).where(eq(recipes.userId, me.id)),
      db.select().from(blogs).where(eq(blogs.userId, me.id)),
      db.select({ review: mediaReviews, item: mediaItems.title }).from(mediaReviews).innerJoin(mediaItems, eq(mediaItems.id, mediaReviews.itemId)).where(eq(mediaReviews.userId, me.id)),
      db.select().from(suggestions).where(eq(suggestions.userId, me.id)),
      db.select().from(photoComments).where(eq(photoComments.userId, me.id)).orderBy(desc(photoComments.id)),
      db.select().from(savedDesigns).where(eq(savedDesigns.userId, me.id)),
      db.select().from(sharedDesigns).where(eq(sharedDesigns.userId, me.id)),
      db.select().from(documents).where(eq(documents.userId, me.id)).orderBy(desc(documents.updatedAt)),
      // Forms you filled in (someone else's), and the answers to your own forms
      db
        .select({ answers: formResponses.answers, createdAt: formResponses.createdAt, title: documents.title, content: documents.content, owner: users.username })
        .from(formResponses)
        .innerJoin(documents, eq(documents.id, formResponses.documentId))
        .innerJoin(users, eq(users.id, documents.userId))
        .where(eq(formResponses.userId, me.id)),
      db
        .select({ documentId: formResponses.documentId, answers: formResponses.answers, createdAt: formResponses.createdAt, nickname: users.nickname })
        .from(formResponses)
        .innerJoin(documents, eq(documents.id, formResponses.documentId))
        .innerJoin(users, eq(users.id, formResponses.userId))
        .where(eq(documents.userId, me.id))
        .orderBy(asc(formResponses.id)),
    ])
    const file = (p: string | null) => (p ? `/uploads/${p}` : null)
    const data = {
      exportedAt: new Date().toISOString(),
      profile,
      // What the AVG asks to be able to show: when they agreed, and to which version
      account: {
        createdAt: me.createdAt.toISOString(),
        emailConfirmedAt: me.emailVerifiedAt?.toISOString() ?? null,
        privacyAcceptedAt: me.privacyAcceptedAt?.toISOString() ?? null,
        privacyVersion: me.privacyVersion,
        bijzondereGegevensToestemming: me.sensitiveConsentAt?.toISOString() ?? null,
        laatstGezien: me.lastSeenAt?.toISOString() ?? null,
        laatsteIpAdres: me.lastIp,
        // What you reported with "Melden" (what, why and your note; not what others wrote)
        meldingen: (await db.select().from(contentReports).where(eq(contentReports.reporterId, me.id)).orderBy(desc(contentReports.createdAt))).map((r) => ({
          wat: r.kind,
          waarom: r.reason,
          toelichting: r.note,
          status: r.status,
          wanneer: r.createdAt.toISOString(),
        })),
        // Warnings from a bot keeping watch (Toezicht), kept for a year
        waarschuwingen: (await db.select().from(botWarnings).where(eq(botWarnings.userId, me.id)).orderBy(desc(botWarnings.createdAt))).map((w) => ({
          reden: w.reason,
          wat: w.detail,
          waar: w.place,
          wanneer: w.createdAt.toISOString(),
        })),
      },
      profielfoto: file(me.avatarPath),
      kanaalbanner: file(me.channelBannerPath),
      wieWatWaars: ownStatuses.map((s) => ({ text: s.text, where: s.where, mood: s.mood, visibility: s.visibility, createdAt: s.createdAt })),
      messenger: { persoonlijkBericht: me.messengerNote, favorieten: me.messengerFavorites },
      videokanaal: { beschrijving: me.channelDescription, uitgelicht: me.channelFeatured },
      knuffelsGeschreven: written.map((k) => ({ text: k.text, createdAt: k.createdAt })),
      knuffelsOntvangen: received.map(({ knuffel, author }) => ({ from: author.username, text: knuffel.text, createdAt: knuffel.createdAt })),
      fotos: ownPhotos.map((p) => ({ url: `/uploads/${p.path}`, origineel: file(p.originalPath), caption: p.caption, album: albums.find((a) => a.id === p.albumId)?.name ?? null, cameraInfo: p.exif, cameraInfoShown: p.showExif, opFotografiepagina: p.inPhotography, createdAt: p.createdAt })),
      muziek: {
        paginas: artistPage.map((p) => ({ naam: p.name, adres: `/muziek/${p.slug}`, bio: p.bio, genre: p.genre, foto: p.avatarPath ? `/uploads/${p.avatarPath}` : null })),
        nummers: songs.map((t) => ({ title: t.title, genre: t.genre, description: t.description, uitgebracht: t.releasedOn, credits: t.credits, url: t.audioPath ? `/uploads/${t.audioPath}` : null, plays: t.plays, createdAt: t.createdAt })),
      },
      radio: {
        zender: station[0] ? { naam: station[0].name, beschrijving: station[0].description, genre: station[0].genre, banner: file(station[0].bannerPath) } : null,
        uitzendingen: shows.map((s) => ({ title: s.title, description: s.description, startsAt: s.startsAt, endsAt: s.endsAt })),
        geluiden: sounds.map((s) => ({ name: s.name, url: `/uploads/${s.path}` })),
        volgtZenders: follows.map((f) => f.username),
        djBij: djAt.map((d) => d.username),
      },
      fotoalbums: albums.map((a) => ({ name: a.name, description: a.description, icon: a.icon, createdAt: a.createdAt })),
      fotografiepagina: photoPage[0] ? { title: photoPage[0].title, about: photoPage[0].about, gear: photoPage[0].gear, visibility: photoPage[0].visibility, createdAt: photoPage[0].createdAt } : null,
      reacties: comments.map((r) => ({ text: r.text, createdAt: r.createdAt })),
      kuddes: memberships,
      kuddesGemaakt: ownKuddes.map((k) => ({ naam: k.name, adres: `/kuddes/${k.slug}`, beschrijving: k.description, info: k.info, categorie: k.category, soort: k.subcategory, adresregel: k.address, plaats: k.city, telefoon: k.phone, website: k.website, foto: file(k.imagePath), design: k.design, createdAt: k.createdAt })),
      kuddeBerichten: kuddeRows.map(({ post, kudde }) => ({ kudde, text: post.text, foto: file(post.photoPath), alsKudde: post.asKudde, poll: post.poll, createdAt: post.createdAt })),
      kuddeReacties: kuddeReplies.map((r) => ({ text: r.text, createdAt: r.createdAt })),
      kuddeFotos: kuddeUploads.map(({ photo, kudde }) => ({ kudde, url: file(photo.path), caption: photo.caption, createdAt: photo.createdAt })),
      kuddeActiviteiten: events.map(({ event, kudde }) => ({ kudde, title: event.title, description: event.description, location: event.location, startsAt: event.startsAt, endsAt: event.endsAt })),
      glitterplaatjes: ownGlitters.map((g) => ({ title: g.title, categories: g.categories, url: file(g.path), createdAt: g.createdAt })),
      recepten: ownRecipes.map((r) => ({ title: r.title, adres: `/recepten/${r.slug}`, intro: r.intro, category: r.category, level: r.level, minutes: r.minutes, servings: r.servings, foto: file(r.photoPath), ingredients: r.ingredients, steps: r.steps, tips: r.tips, createdAt: r.createdAt })),
      blogs: ownBlogs.map((b) => ({ title: b.title, body: b.body, visibility: b.visibility, createdAt: b.createdAt, updatedAt: b.updatedAt })),
      recensies: reviews.map(({ review, item }) => ({ over: item, rating: review.rating, text: review.text, createdAt: review.createdAt })),
      ideeen: ideas.map((i) => ({ kind: i.kind, title: i.title, body: i.body, status: i.status, createdAt: i.createdAt })),
      fotoReacties: photoReactions.map((r) => ({ text: r.text, createdAt: r.createdAt })),
      designs: designs.map((d) => ({ kind: d.kind, name: d.name, data: d.data, updatedAt: d.updatedAt })),
      // The Tools' files are in documenten/ in the zip: Woord as web pages, Paint as PNG, Kladblok as text, the rest as JSON
      documenten: docs.map((d, i) => ({ soort: d.kind, title: d.title, bestand: docFile(d.title, i, d.kind), grootte: d.words, createdAt: d.createdAt, updatedAt: d.updatedAt })),
      formulierAntwoorden: givenAnswers.map((a) => ({ formulier: a.title, van: a.owner, antwoorden: readableAnswers(a.content, a.answers), createdAt: a.createdAt })),
      designgalerij: shared.map((d) => ({ kind: d.kind, name: d.name, description: d.description, data: d.data, gebruikt: d.uses, createdAt: d.createdAt })),
      indelingen: layouts.map(toSaved),
      videos: ownVideos.map((v) => ({
        title: v.title,
        description: v.description,
        tags: v.tags,
        visibility: v.visibility,
        views: v.views,
        url: v.filePath ? `/uploads/${v.filePath}` : null,
        thumbnail: file(v.thumbPath),
        createdAt: v.createdAt,
      })),
      videoReacties: videoReactions.map((r) => ({ text: r.text, createdAt: r.createdAt })),
      forum: {
        titel: forumProfile[0]?.title ?? '',
        handtekening: forumProfile[0]?.signature ?? '',
        berichten: forumRows.map(({ post, thread }) => ({ onderwerp: thread, text: post.body, createdAt: post.createdAt, verwijderd: !!post.deletedAt })),
      },
      chat: chatRows.map((m) => ({ kind: m.kind, text: m.text, createdAt: m.createdAt })),
      meldingen: notes.map(({ n, from }) => ({ from, what: n.message, text: n.snippet, read: !!n.readAt, createdAt: n.createdAt })),
      gadgets: ownGadgets.map((g) => ({ type: g.type, title: g.title, enabled: g.enabled, config: g.config })),
      berichten: pms.map(({ message: m, from }) => ({
        map: !m.sentAt ? 'concepten' : m.senderId === me.id ? 'verzonden' : 'inbox',
        from,
        subject: m.subject,
        body: m.body,
        sentAt: m.sentAt,
      })),
    }
    // Every upload the data points to ("/uploads/…", also inside designs and gadgets), next to it in the zip
    const uploads = new Set<string>()
    const collect = (v: unknown): void => {
      if (typeof v === 'string') {
        const m = v.match(/^\/uploads\/([\w./-]+)$/)
        if (m && !m[1].includes('..')) uploads.add(m[1])
      } else if (Array.isArray(v)) v.forEach(collect)
      else if (v && typeof v === 'object') Object.values(v).forEach(collect)
    }
    collect(data)
    // Photos from your Foto's used in a presentation (those files are outside gegevens.json)
    docs.forEach((d) => collect(d.content))
    const folder = `kuddes-${me.username}`
    const entries: ZipEntry[] = [
      { name: `${folder}/LEESMIJ.txt`, text: README },
      { name: `${folder}/gegevens.json`, text: JSON.stringify(data, null, 2) },
      ...docs.map((d, i): ZipEntry => {
        const name = `${folder}/documenten/${docFile(d.title, i, d.kind)}`
        const content = (d.content ?? {}) as Record<string, unknown>
        if (d.kind === 'woord') return { name, text: docPage(d.title, d.html) }
        if (d.kind === 'kladblok') return { name, text: String(content.text ?? '') }
        if (d.kind === 'paint') return { name, data: Buffer.from(String(content.image ?? '').replace(/^data:image\/png;base64,/, ''), 'base64') }
        if (d.kind === 'formulier') {
          // The answers come along, with names unless the form is anonymous (as the maker sees them on the site)
          const anonymous = content.anonymous === true
          const antwoorden = receivedAnswers
            .filter((a) => a.documentId === d.id)
            .map((a) => ({ ...(anonymous ? {} : { van: a.nickname }), antwoorden: readableAnswers(d.content, a.answers), createdAt: a.createdAt }))
          return { name, text: JSON.stringify({ soort: d.kind, title: d.title, ...content, antwoorden }, null, 2) }
        }
        return { name, text: JSON.stringify({ soort: d.kind, title: d.title, ...content }, null, 2) }
      }),
      ...[...uploads].map((u) => ({ name: `${folder}/uploads/${u}`, upload: u })),
    ]
    c.header('Content-Type', 'application/zip')
    c.header('Content-Disposition', `attachment; filename="${folder}.zip"`)
    c.header('Cache-Control', 'no-store')
    return c.body(zipStream(entries))
  })

const README = `Je gegevens van Kuddes

gegevens.json  alles wat je op Kuddes hebt gezet: je profiel, WieWatWaars, knuffels,
               berichten, Kuddes, recepten, blogs en meer (te openen in een teksteditor
               of een ander programma).
uploads/       je foto's, video's, muziek en andere bestanden. In gegevens.json staan
               ze als "/uploads/...": dat is het bestand met dezelfde naam in deze map.
documenten/    je bestanden uit Tools: Woord als webpagina, Paint als PNG, Kladblok als
               tekst, de rest als JSON (bij een formulier met de antwoorden erbij).

Vragen? Mail naar ${serverInfo().contactEmail}.
`

const DOC_EXT: Record<DocKind, string> = {
  woord: '.html',
  rekenblad: ' (rekenblad).json',
  presentatie: ' (presentatie).json',
  paint: '.png',
  mindmap: ' (mindmap).json',
  planner: ' (planner).json',
  formulier: ' (formulier).json',
  kladblok: '.txt',
  studio: ' (studio).json',
}
/** A Tools file in the zip: its title, made safe for a file name (numbered, as titles can repeat). */
const docFile = (title: string, i: number, kind: DocKind) =>
  `${String(i + 1).padStart(3, '0')} ${title.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'Document'}${DOC_EXT[kind]}`

/** Form answers by question title instead of the question's id. */
function readableAnswers(form: unknown, answers: FormAnswers) {
  const questions = ((form as FormDef | null)?.questions ?? []) as Question[]
  return Object.fromEntries(Object.entries(answers).map(([id, v]) => [questions.find((q) => q.id === id)?.title || id, v]))
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The document as a web page that opens in any browser (and in Word). */
const docPage = (title: string, html: string) =>
  `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body { max-width: 21cm; margin: 2cm auto; font: 11pt/1.15 Calibri, Carlito, sans-serif; } img { max-width: 100%; } table { border-collapse: collapse; } td { border: 1px solid #7f7f7f; padding: 3pt 6pt; }</style></head><body>${html}</body></html>`

