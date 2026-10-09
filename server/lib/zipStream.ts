import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate'
import { config } from '../config'

export type ZipEntry = { name: string; text: string } | { name: string; data: Uint8Array } | { name: string; upload: string }

/** The file in the uploads folder for "/uploads/…" or a bare relative path, or null if it isn't one (or isn't there). */
export async function uploadFile(relative: string): Promise<string | null> {
  const full = path.resolve(config.uploadDir, relative.replace(/^\/uploads\//, ''))
  if (!full.startsWith(config.uploadDir + path.sep)) return null
  const s = await stat(full).catch(() => null)
  return s?.isFile() ? full : null
}

/**
 * A zip, written while it downloads: text squeezed, uploads (photos, video,
 * music: already compressed) and data (drawings) stored as they are. Missing uploads are left out.
 */
export function zipStream(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) return controller.error(err)
        controller.enqueue(chunk)
        if (final) controller.close()
      })
      try {
        for (const entry of entries) {
          if ('text' in entry) {
            const file = new ZipDeflate(entry.name, { level: 6 })
            zip.add(file)
            file.push(new TextEncoder().encode(entry.text), true)
            continue
          }
          if ('data' in entry) {
            // Already compressed (a PNG)
            const file = new ZipPassThrough(entry.name)
            zip.add(file)
            file.push(entry.data, true)
            continue
          }
          const full = await uploadFile(entry.upload)
          if (!full) continue
          const file = new ZipPassThrough(entry.name)
          zip.add(file)
          for await (const chunk of createReadStream(full)) {
            file.push(chunk as Uint8Array)
            // Let the download catch up before reading more (a video can be big)
            while ((controller.desiredSize ?? 1) <= 0) await new Promise((r) => setTimeout(r, 20))
          }
          file.push(new Uint8Array(0), true)
        }
        zip.end()
      } catch (err) {
        controller.error(err)
      }
    },
  }, new ByteLengthQueuingStrategy({ highWaterMark: 4 * 1024 * 1024 }))
}
