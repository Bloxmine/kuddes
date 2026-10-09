import type { Photo } from '../../shared/api'
import type { photos } from '../db/schema'
import { toSummary, uploadUrl, type SummaryRow } from './serialize'

export function toPhoto(photo: typeof photos.$inferSelect, user: SummaryRow, viewerId: number | undefined): Photo {
  return {
    id: photo.id,
    url: uploadUrl(photo.path)!,
    caption: photo.caption,
    description: photo.description,
    width: photo.width,
    height: photo.height,
    createdAt: photo.createdAt.toISOString(),
    user: toSummary(user),
    canDelete: viewerId === photo.userId,
    albumId: photo.albumId,
    // Camera details only when shown, but the owner always gets them (to edit)
    exif: photo.showExif || viewerId === photo.userId ? (photo.exif ?? null) : null,
    showExif: photo.showExif,
    inPhotography: photo.inPhotography,
    ...(viewerId === photo.userId && { originalUrl: uploadUrl(photo.originalPath ?? photo.path)!, edits: photo.edits }),
  }
}
