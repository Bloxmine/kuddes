/**
 * Members reporting what goes wrong (shared/safety.ts): a post is hidden by
 * itself after enough different members reported it, or at once for
 * something urgent, until the admin restores or removes it. Hidden posts are
 * left out of every list with `notHidden`.
 */
import { and, count, eq, isNotNull, lt, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { threadHref } from '../../shared/forum'
import { REPORT_KINDS, REPORT_REASONS, type ReportKind, type ReportReason } from '../../shared/safety'
import { db } from '../db/client'
import {
  activities,
  activityComments,
  blogs,
  contentReports,
  forumPosts,
  forumSections,
  forumThreads,
  hiddenItems,
  knuffels,
  kuddePosts,
  kuddes,
  messages,
  photoComments,
  photos,
  statuses,
  users,
  videoComments,
  videos,
  type User,
} from '../db/schema'
import { alertAdmin } from './alerts'
import { HttpError, notFound } from './errors'
import { unnotify } from './notifications'
import { hideAfter } from './siteSettings'
import { deliverMessage } from './videoAccess'
import { objectUriOf, reportedElsewhere, statusDeleted } from './federation/outbox'
import { removeMedia } from './federation/actors'

/** Left out of lists: `kind` posts whose id (this column) is hidden after reports. */
export const notHidden = (kind: ReportKind, id: AnyPgColumn): SQL =>
  sql`not exists (select 1 from ${hiddenItems} where ${hiddenItems.kind} = ${kind} and ${hiddenItems.targetId} = ${id})`

const usernameOf = async (id: number) => (await db.select({ u: users.username }).from(users).where(eq(users.id, id)))[0]?.u ?? ''

/** Who wrote it, a bit of what it says and where it is; null when it's gone (or a message that isn't yours). */
async function target(kind: ReportKind, id: number, reporter: User): Promise<{ authorId: number | null; excerpt: string; link: string | null } | null> {
  const one = <T>(rows: T[]) => rows[0] ?? null
  switch (kind) {
    case 'wiewatwaar': {
      const r = one(await db.select({ a: statuses.userId, t: statuses.text }).from(statuses).where(eq(statuses.id, id)))
      return r && { authorId: r.a, excerpt: r.t, link: `/profiel/${await usernameOf(r.a)}` }
    }
    case 'knuffel': {
      const r = one(await db.select({ a: knuffels.authorId, p: knuffels.profileId, t: knuffels.text }).from(knuffels).where(eq(knuffels.id, id)))
      return r && { authorId: r.a, excerpt: r.t, link: `/profiel/${await usernameOf(r.p)}?tab=knuffels` }
    }
    case 'reactie': {
      const r = one(await db.select({ a: activityComments.userId, t: activityComments.text }).from(activityComments).where(eq(activityComments.id, id)))
      return r && { authorId: r.a, excerpt: r.t, link: '/tijdlijn' }
    }
    case 'forum': {
      const r = one(
        await db
          .select({ a: forumPosts.userId, t: forumPosts.body, thread: forumThreads.id, title: forumThreads.title, section: forumSections.slug })
          .from(forumPosts)
          .innerJoin(forumThreads, eq(forumThreads.id, forumPosts.threadId))
          .innerJoin(forumSections, eq(forumSections.id, forumThreads.sectionId))
          .where(eq(forumPosts.id, id)),
      )
      return r && { authorId: r.a, excerpt: r.t, link: `${threadHref(r.section, r.thread, r.title)}#bericht-${id}` }
    }
    case 'kudde': {
      const r = one(
        await db
          .select({ a: kuddePosts.userId, t: kuddePosts.text, slug: kuddes.slug })
          .from(kuddePosts)
          .innerJoin(kuddes, eq(kuddes.id, kuddePosts.kuddeId))
          .where(eq(kuddePosts.id, id)),
      )
      return r && { authorId: r.a, excerpt: r.t ?? '', link: `/kuddes/${r.slug}` }
    }
    case 'foto': {
      const r = one(
        await db
          .select({ a: photoComments.userId, t: photoComments.text, photo: photos.id, owner: photos.userId })
          .from(photoComments)
          .innerJoin(photos, eq(photos.id, photoComments.photoId))
          .where(eq(photoComments.id, id)),
      )
      return r && { authorId: r.a, excerpt: r.t, link: `/fotografie/${await usernameOf(r.owner)}/foto/${r.photo}` }
    }
    case 'video': {
      const r = one(
        await db
          .select({ a: videoComments.userId, t: videoComments.text, v: videos.publicId })
          .from(videoComments)
          .innerJoin(videos, eq(videos.id, videoComments.videoId))
          .where(eq(videoComments.id, id)),
      )
      return r && { authorId: r.a, excerpt: r.t, link: `/video/kijk?v=${r.v}` }
    }
    case 'blog': {
      const r = one(await db.select({ a: blogs.userId, t: blogs.title, b: blogs.body }).from(blogs).where(eq(blogs.id, id)))
      return r && { authorId: r.a, excerpt: `${r.t}\n${r.b}`, link: `/blogs/${id}` }
    }
    case 'profiel': {
      const r = one(await db.select({ u: users.username, about: users.about, name: users.name }).from(users).where(eq(users.id, id)))
      return r && { authorId: id, excerpt: `${r.name}${r.about ? `: ${r.about}` : ''}`, link: `/profiel/${r.u}` }
    }
    case 'bericht': {
      // Only the one who received it can report a message (and so chooses to show it to the admin)
      const r = one(await db.select({ a: messages.senderId, to: messages.recipientId, s: messages.subject, b: messages.body }).from(messages).where(eq(messages.id, id)))
      return r && r.to === reporter.id ? { authorId: r.a, excerpt: `${r.s}\n${r.b}`, link: null } : null
    }
  }
}

let adminId: number | null = null
const theAdmin = async () => (adminId ??= (await db.select({ id: users.id }).from(users).where(eq(users.forumRole, 'admin')).limit(1))[0]?.id ?? null)

async function hide(kind: ReportKind, id: number, authorId: number | null, why: string) {
  const [row] = await db.insert(hiddenItems).values({ kind, targetId: id }).onConflictDoNothing().returning()
  if (!row) return false
  // The author hears it from Kuddes, so it doesn't look like the site broke
  const admin = await theAdmin()
  if (authorId && admin && authorId !== admin)
    await deliverMessage(
      admin,
      authorId,
      'Je bericht is even verborgen',
      `Hoi! Je ${REPORT_KINDS[kind].name.toLowerCase()} is na meldingen van andere leden (${why}) even verborgen, tot de beheerder ernaar kijkt. Klopt de melding niet, dan komt hij gewoon terug.`,
    )
  return true
}

/** A member reports something; it may be hidden straight away. */
export async function report(reporter: User, input: { kind: ReportKind; targetId: number; reason: ReportReason; note: string }) {
  const t = await target(input.kind, input.targetId, reporter)
  if (!t) throw notFound('Dit bestaat niet (meer).')
  if (t.authorId === reporter.id) throw new HttpError(400, 'Je kunt je eigen bericht niet melden.')
  const [row] = await db
    .insert(contentReports)
    .values({
      reporterId: reporter.id,
      kind: input.kind,
      targetId: input.targetId,
      authorId: t.authorId,
      reason: input.reason,
      note: input.note,
      link: t.link,
      excerpt: t.excerpt.slice(0, 600),
    })
    .onConflictDoNothing()
    .returning()
  if (!row) throw new HttpError(409, 'Je had dit al gemeld. De beheerder kijkt ernaar.')
  const urgent = REPORT_REASONS[input.reason].urgent
  const canHide = REPORT_KINDS[input.kind].hide
  const [{ n }] = await db
    .select({ n: count() })
    .from(contentReports)
    .where(and(eq(contentReports.kind, input.kind), eq(contentReports.targetId, input.targetId), eq(contentReports.status, 'open')))
  const hidden = canHide && (urgent || n >= hideAfter()) ? await hide(input.kind, input.targetId, t.authorId, REPORT_REASONS[input.reason].name.toLowerCase()) : false
  const what = `${REPORT_KINDS[input.kind].name}: “${t.excerpt.slice(0, 160)}”`
  if (urgent)
    await alertAdmin(
      'urgent',
      `Dringende melding: ${REPORT_REASONS[input.reason].name}`,
      [what, input.note ? `Toelichting: ${input.note}` : '', hidden ? 'Het is al verborgen.' : ''],
      t.link,
    )
  else if (hidden) await alertAdmin('hidden', `Verborgen na ${n} meldingen`, [what, `Meest genoemd: ${REPORT_REASONS[input.reason].name}`], t.link)
  // Something of an account elsewhere: their server hears it too (not who reported it)
  if (t.authorId && !reporter.domain && (input.kind === 'wiewatwaar' || input.kind === 'knuffel' || input.kind === 'profiel'))
    reportedElsewhere(
      t.authorId,
      input.kind === 'profiel' ? null : await objectUriOf(input.kind, input.targetId),
      `${REPORT_REASONS[input.reason].name}${input.note ? `: ${input.note}` : ''}`,
    )
  return { hidden }
}

/** The admin looked: the report wasn't right, it comes back. */
export async function restore(kind: ReportKind, id: number) {
  await db.delete(hiddenItems).where(and(eq(hiddenItems.kind, kind), eq(hiddenItems.targetId, id)))
  await db
    .update(contentReports)
    .set({ status: 'teruggezet', handledAt: new Date() })
    .where(and(eq(contentReports.kind, kind), eq(contentReports.targetId, id), eq(contentReports.status, 'open')))
}

/** The admin looked: it goes for good (a profile or message can't be removed this way). */
export async function removeReported(kind: ReportKind, id: number, adminUser: User) {
  switch (kind) {
    case 'wiewatwaar': {
      const [activity] = await db.select({ id: activities.id }).from(activities).where(eq(activities.statusId, id))
      const [gone] = await db.delete(statuses).where(eq(statuses.id, id)).returning({ userId: statuses.userId, media: statuses.media })
      if (gone) await removeMedia(gone.media)
      // Gone from the author's friends on other servers too
      const [author] = gone ? await db.select().from(users).where(eq(users.id, gone.userId)) : []
      if (author) statusDeleted(author, id)
      await unnotify(`status:${id}`)
      if (activity) await unnotify(`activity:${activity.id}`)
      break
    }
    case 'knuffel':
      await db.delete(knuffels).where(eq(knuffels.id, id))
      await unnotify(`knuffel:${id}`)
      break
    case 'reactie': {
      const [c] = await db.select({ a: activityComments.activityId }).from(activityComments).where(eq(activityComments.id, id))
      await db.delete(activityComments).where(eq(activityComments.id, id))
      if (c) await unnotify(`activity:${c.a}/comment:${id}`)
      break
    }
    case 'forum':
      // As a moderator removes it: the post stays as "verwijderd" so the thread still reads
      await db.update(forumPosts).set({ deletedAt: new Date(), deletedById: adminUser.id }).where(eq(forumPosts.id, id))
      break
    case 'kudde':
      await db.delete(kuddePosts).where(eq(kuddePosts.id, id))
      break
    case 'foto':
      await db.delete(photoComments).where(eq(photoComments.id, id))
      break
    case 'video':
      await db.delete(videoComments).where(eq(videoComments.id, id))
      break
    case 'blog':
      await db.delete(blogs).where(eq(blogs.id, id))
      break
    default:
      throw new HttpError(400, 'Een profiel of privébericht kun je zo niet weghalen; blokkeer het account bij Leden.')
  }
  await db.delete(hiddenItems).where(and(eq(hiddenItems.kind, kind), eq(hiddenItems.targetId, id)))
  await db
    .update(contentReports)
    .set({ status: 'weggehaald', handledAt: new Date() })
    .where(and(eq(contentReports.kind, kind), eq(contentReports.targetId, id), eq(contentReports.status, 'open')))
}

/** Handled reports are kept a year (for when it comes up again), then they're gone. */
export async function purgeOldReports() {
  await db.delete(contentReports).where(and(isNotNull(contentReports.handledAt), lt(contentReports.handledAt, new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))))
}
