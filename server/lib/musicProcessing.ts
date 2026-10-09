/**
 * Songs for /muziek: an upload lands in tmp-music, then ffmpeg makes it an
 * MP3 (plays in every browser) of at most MUSIC_LIMITS.seconds, without any
 * metadata from the file. One at a time, like the videos.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { MUSIC_LIMITS } from '../../shared/music'
import { config } from '../config'
import { db } from '../db/client'
import { tracks } from '../db/schema'
import { recordActivity } from './activities'
import { run } from './videoProcessing'

export const musicTempDir = () => path.join(config.uploadDir, 'tmp-music')
export const musicTempFile = (id: number) => path.join(musicTempDir(), `${id}.upload`)

class ProcessingError extends Error {}

/** How long the audio is, according to ffprobe (only local files). */
async function audioLength(file: string): Promise<number> {
  const out = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_streams', '-show_format', file], 60_000).catch(() => {
    throw new ProcessingError('Dit bestand is geen muziek die we kunnen lezen.')
  })
  const data = JSON.parse(out) as { streams?: { codec_type: string; duration?: string }[]; format?: { duration?: string } }
  const audio = data.streams?.find((s) => s.codec_type === 'audio')
  if (!audio) throw new ProcessingError('Er zit geen geluid in dit bestand.')
  const duration = Number(data.format?.duration ?? audio.duration ?? 0)
  if (!Number.isFinite(duration) || duration < 1) throw new ProcessingError('Dit nummer is te kort.')
  return duration
}

async function processTrack(id: number) {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id))
  if (!row) return
  const input = musicTempFile(id)
  const rel = `music/${row.userId}-${randomBytes(12).toString('hex')}.mp3`
  const out = path.join(config.uploadDir, rel)
  try {
    await mkdir(path.dirname(out), { recursive: true })
    await audioLength(input)
    // MP3 (VBR, about 190 kbit/s), stereo, no cover art or tags from the file
    await run(
      'nice',
      ['-n', '10', 'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-i', input, '-map', '0:a:0', '-vn', '-t', String(MUSIC_LIMITS.seconds), '-c:a', 'libmp3lame', '-q:a', '2', '-ac', '2', '-ar', '44100', '-map_metadata', '-1', '-y', out],
      15 * 60 * 1000,
    ).catch((e) => {
      console.error('music convert failed', e)
      throw new ProcessingError('Het omzetten van dit nummer is mislukt.')
    })
    const duration = await audioLength(out)
    await db.update(tracks).set({ status: 'klaar', audioPath: rel, duration: Math.round(duration) }).where(eq(tracks.id, id))
    // Ready to play: now it's news on the timeline
    await recordActivity({ type: 'track', actorId: row.userId, trackId: id })
  } catch (e) {
    await rm(out, { force: true })
    if (!(e instanceof ProcessingError)) console.error('music processing failed', e)
    await db.update(tracks).set({ status: 'mislukt' }).where(eq(tracks.id, id))
  } finally {
    await rm(input, { force: true })
  }
}

const queue: number[] = []
let busy = false

export function enqueueTrack(id: number) {
  if (!queue.includes(id)) queue.push(id)
  void drain()
}

async function drain() {
  if (busy) return
  busy = true
  try {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await processTrack(id)
  } finally {
    busy = false
  }
}

/** After a restart: pick up songs that were waiting. */
export async function resumeMusicProcessing() {
  await mkdir(musicTempDir(), { recursive: true })
  const waiting = await db.select({ id: tracks.id }).from(tracks).where(eq(tracks.status, 'verwerken'))
  for (const { id } of waiting) {
    const exists = await stat(musicTempFile(id)).then(
      () => true,
      () => false,
    )
    if (exists) enqueueTrack(id)
    else await db.update(tracks).set({ status: 'mislukt' }).where(eq(tracks.id, id))
  }
}
