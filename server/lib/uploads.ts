import { randomBytes } from 'node:crypto'
import { copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp, { type OutputInfo } from 'sharp'
import { config } from '../config'
import { HttpError } from './errors'

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

type Kind = 'avatars' | 'photos' | 'kuddes' | 'backgrounds' | 'recipes' | 'posts' | 'news' | 'media' | 'blogs' | 'banners' | 'covers'

/**
 * Sizes and WebP quality per kind, tuned to save space and bandwidth: big
 * enough for how the site shows them (photos open in a lightbox, backgrounds
 * fill the screen), no bigger.
 */
const SIZES: Record<Kind, { width: number; height: number; fit: 'cover' | 'inside'; quality: number }> = {
  avatars: { width: 320, height: 320, fit: 'cover', quality: 74 },
  photos: { width: 1440, height: 1440, fit: 'inside', quality: 72 },
  kuddes: { width: 600, height: 400, fit: 'cover', quality: 74 },
  backgrounds: { width: 1920, height: 1920, fit: 'inside', quality: 70 },
  recipes: { width: 1280, height: 1280, fit: 'inside', quality: 72 },
  posts: { width: 1280, height: 1280, fit: 'inside', quality: 72 },
  blogs: { width: 1400, height: 1400, fit: 'inside', quality: 74 },
  // Banners go full width over the post, so a bit bigger and sharper
  news: { width: 1800, height: 1800, fit: 'inside', quality: 78 },
  // Recensies: a cover or bottle, shown up to about 400 px tall
  media: { width: 900, height: 900, fit: 'inside', quality: 76 },
  // Wide banners at the top of a channel or music page
  banners: { width: 2000, height: 1200, fit: 'inside', quality: 76 },
  // Album art of a song: square
  covers: { width: 600, height: 600, fit: 'cover', quality: 78 },
}

/**
 * Validates an uploaded image, re-encodes it as WebP and stores it.
 * Re-encoding strips all metadata (EXIF, GPS) and anything that isn't
 * pixel data. Returns the path relative to the upload dir.
 */
const ANIMATED_KINDS = new Set<Kind>(['backgrounds', 'avatars', 'kuddes'])

export async function storeImage(file: unknown, kind: Kind, prefix = '') {
  if (!(file instanceof File)) throw new HttpError(400, 'Kies een afbeelding om te uploaden.')
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Die afbeelding is te groot (max 8 MB).')

  const input = Buffer.from(await file.arrayBuffer())
  const { width, height, fit, quality } = SIZES[kind]
  let output: { data: Buffer; info: OutputInfo }
  try {
    // Backgrounds, profile pictures and Kudde pictures keep their animation (glitter GIFs!); other images use the first frame
    const animated = ANIMATED_KINDS.has(kind) && ((await sharp(input, { animated: true }).metadata()).pages ?? 1) > 1
    output = await sharp(input, { limitInputPixels: 50_000_000, animated })
      .rotate() // apply EXIF orientation before it's stripped
      .resize({ width, height, fit, withoutEnlargement: fit === 'inside' })
      // Animations: smaller frames in a lossy WebP; stills: "smart" colour subsampling for sharper edges
      .webp(animated ? { quality: 60, effort: 4, minSize: true } : { quality, effort: 5, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })
  } catch {
    throw new HttpError(400, 'Dit bestand is geen geldige afbeelding (JPG, PNG, GIF of WebP).')
  }

  const name = `${kind}/${prefix}${randomBytes(16).toString('hex')}.webp`
  const dir = path.join(config.uploadDir, kind)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(config.uploadDir, name), output.data)
  return { path: name, width: output.info.width, height: output.info.height }
}

/** The pixel size of a stored image. */
export async function imageSize(relative: string) {
  const meta = await sharp(path.join(config.uploadDir, relative)).metadata()
  return { width: meta.width ?? 1, height: meta.height ?? 1 }
}

/** A copy of an upload under a new name, for a second owner (a photo put in a Kudde): removing one leaves the other. */
export async function copyUpload(relative: string): Promise<string> {
  const from = path.resolve(config.uploadDir, relative)
  if (!from.startsWith(config.uploadDir + path.sep)) throw new HttpError(400, 'Deze foto bestaat niet (meer).')
  const kind = relative.split('/')[0]
  const name = `${kind}/${randomBytes(16).toString('hex')}${path.extname(relative)}`
  await mkdir(path.join(config.uploadDir, kind), { recursive: true })
  await copyFile(from, path.join(config.uploadDir, name))
  return name
}

export async function removeUpload(relative: string | null) {
  if (!relative) return
  const full = path.resolve(config.uploadDir, relative)
  if (!full.startsWith(config.uploadDir + path.sep)) return
  await unlink(full).catch(() => {})
}

/** Removes all background images a member uploaded (named `<userId>-….webp`). */
export async function removeBackgroundsOf(userId: number) {
  await removeUploadsOf('backgrounds', userId)
}

/** Removes the files of `kind` a member uploaded (named `<userId>-….webp`). */
export async function removeUploadsOf(kind: 'backgrounds' | 'recipes' | 'blogs', userId: number) {
  const files = await readdir(path.join(config.uploadDir, kind)).catch(() => [] as string[])
  await Promise.all(files.filter((f) => f.startsWith(`${userId}-`)).map((f) => removeUpload(`${kind}/${f}`)))
}

/**
 * A glitterplaatje: keeps its animation, shrunk to at most 400 px. It's
 * encoded as lossy WebP, lossless WebP and (for GIFs) a fresh GIF, and the
 * smallest wins: photos compress best as lossy WebP, flat glitter pixels
 * often as lossless or GIF. Re-encoding also drops anything that isn't
 * pixels (comments, metadata).
 */
export const storeGlitter = (file: unknown, maxBytes: number, side: number) => storeAnimated(file, maxBytes, side, side, 'glitters')

/**
 * An image that may move (a GIF or animated WebP), kept moving: glitterplaatjes
 * and forum signatures (userbars). Fitted inside maxWidth×maxHeight, never
 * made bigger. `prefix` starts the file name (the member's id, for signatures).
 */
export async function storeAnimated(file: unknown, maxBytes: number, maxWidth: number, maxHeight: number, dir: 'glitters' | 'signatures', prefix = '') {
  if (!(file instanceof File)) throw new HttpError(400, 'Kies een plaatje om te uploaden.')
  if (file.size > maxBytes) throw new HttpError(413, `Dit plaatje is te groot (max ${Math.round(maxBytes / 1024 / 1024)} MB).`)
  const input = Buffer.from(await file.arrayBuffer())
  let best: { data: Buffer; ext: 'webp' | 'gif' }
  let width: number
  let height: number
  try {
    const meta = await sharp(input, { animated: true }).metadata()
    const animated = (meta.pages ?? 1) > 1
    const base = () =>
      sharp(input, { animated, limitInputPixels: 150_000_000 }).resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    const candidates = await Promise.all([
      base()
        .webp(animated ? { quality: 72, effort: 4, minSize: true, loop: 0 } : { quality: 78, effort: 5 })
        .toBuffer()
        .then((data) => ({ data, ext: 'webp' as const })),
      base()
        .webp({ lossless: true, effort: 4, ...(animated && { minSize: true, loop: 0 }) })
        .toBuffer()
        .then((data) => ({ data, ext: 'webp' as const })),
      ...(meta.format === 'gif' ? [base().gif({ effort: 7, loop: 0 }).toBuffer().then((data) => ({ data, ext: 'gif' as const }))] : []),
    ])
    best = candidates.reduce((a, b) => (b.data.length < a.data.length ? b : a))
    const out = await sharp(best.data, { animated: true }).metadata()
    width = out.width ?? maxWidth
    height = out.pageHeight ?? out.height ?? maxHeight
  } catch {
    throw new HttpError(400, 'Dit bestand is geen geldig plaatje (GIF, PNG, WebP of JPG).')
  }
  const name = `${dir}/${prefix}${randomBytes(16).toString('hex')}.${best.ext}`
  await mkdir(path.join(config.uploadDir, dir), { recursive: true })
  await writeFile(path.join(config.uploadDir, name), best.data)
  return { path: name, width, height, bytes: best.data.length }
}
