import { and, desc, eq } from 'drizzle-orm'
import { VIDEO_UPLOAD_REASONS, type VideoUploadAccess, type VideoUploadReason } from '../../shared/videos'
import { db } from '../db/client'
import { messages, users, videoUploadRequests, type User } from '../db/schema'
import { absolute } from './seo'

/** Only members the admin allowed may upload videos; watching is for everyone. */
export const mayUploadVideos = (user: User) => user.videoUploadAllowed || user.forumRole === 'admin'

export async function uploadAccess(user: User): Promise<VideoUploadAccess> {
  const [request] = await db
    .select()
    .from(videoUploadRequests)
    .where(and(eq(videoUploadRequests.userId, user.id), eq(videoUploadRequests.kind, 'video')))
    .orderBy(desc(videoUploadRequests.id))
    .limit(1)
  return {
    allowed: mayUploadVideos(user),
    request: request
      ? {
          status: request.status,
          reasons: request.reasons.filter((r): r is VideoUploadReason => r in VIDEO_UPLOAD_REASONS),
          motivation: request.motivation,
          answer: request.answer,
          createdAt: request.createdAt.toISOString(),
          handledAt: request.handledAt?.toISOString() ?? null,
        }
      : null,
  }
}

/** A personal message that lands straight in someone's inbox (it skips their "who may message me" setting). */
export async function deliverMessage(fromId: number, toId: number, subject: string, body: string) {
  const now = new Date()
  await db.insert(messages).values({ senderId: fromId, recipientId: toId, subject, body, sentAt: now, updatedAt: now })
}

export async function admins() {
  return db.select({ id: users.id }).from(users).where(eq(users.forumRole, 'admin'))
}

/** The message the admin gets when someone asks for upload rights. */
export function requestMessage(user: User, reasons: VideoUploadReason[], motivation: string) {
  return [
    `${user.name} (@${user.username}) wil graag video's uploaden op Kuddes Video.`,
    '',
    '**Waarom:**',
    ...reasons.map((r) => `- ${VIDEO_UPLOAD_REASONS[r]}`),
    ...(motivation ? ['', '**Toelichting:**', motivation] : []),
    '',
    'Akkoord met de regels voor video’s: ja',
    '',
    `Goedkeuren of afwijzen: [Beheer → Video-rechten](${absolute('/beheer?tab=video')})`,
    `Profiel: [${user.name}](${absolute(`/profiel/${user.username}`)})`,
  ].join('\n')
}
