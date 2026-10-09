/** Shared by photos and the photography section: the camera details a member may send (shared/photography.ts). */
import { z } from 'zod'
import { EXIF_LIMITS, type PhotoExif } from '../../shared/photography'

/** Only these fields: anything else (like a location) is dropped. */
export const exifSchema = z
  .object({
    camera: z.string().trim().max(EXIF_LIMITS.camera).optional(),
    lens: z.string().trim().max(EXIF_LIMITS.lens).optional(),
    focalLength: z.number().positive().max(5000).optional(),
    aperture: z.number().positive().max(128).optional(),
    exposure: z.number().positive().max(3600).optional(),
    iso: z.number().int().positive().max(1_000_000).optional(),
    takenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/).optional(),
  })
  .strip()

/** Empty details become null; empty strings are left out. */
export function cleanExif(e: z.infer<typeof exifSchema> | null | undefined): PhotoExif | null {
  if (!e) return null
  const out = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== '')) as PhotoExif
  return Object.keys(out).length ? out : null
}

/** A form field holding JSON (uploads come as multipart). */
export function jsonField(value: unknown): unknown {
  if (typeof value !== 'string' || !value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
