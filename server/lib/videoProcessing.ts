import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { and, eq, lt } from 'drizzle-orm'
import sharp from 'sharp'
import { VIDEO_LIMITS } from '../../shared/videos'
import { config } from '../config'
import { db } from '../db/client'
import { videos } from '../db/schema'
import { recordActivity } from './activities'

/** Uploads land here first, as <video id>.upload, until ffmpeg is done with them. */
export const tempDir = () => path.join(config.uploadDir, 'tmp-videos')
export const tempFile = (id: number) => path.join(tempDir(), `${id}.upload`)

// H.265 takes a while on a small server: up to an hour for a long video
const CONVERT_TIMEOUT_MS = 60 * 60 * 1000

class ProcessingError extends Error {}

/** Runs a program without a shell; resolves stdout, rejects with the end of stderr. */
export function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err = (err + d).slice(-4000)))
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(signal ? `${cmd} gestopt (${signal})` : `${cmd} faalde: ${err.trim().split('\n').pop()}`))
    })
  })
}

type Probe = { duration: number; width: number; height: number; hasAudio: boolean }

/** What's in the file, according to ffprobe (only local files are allowed). */
async function probe(file: string): Promise<Probe> {
  const out = await run(
    'ffprobe',
    ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_streams', '-show_format', file],
    60_000,
  ).catch(() => {
    throw new ProcessingError('Dit bestand is geen video die we kunnen lezen.')
  })
  const data = JSON.parse(out) as {
    streams?: { codec_type: string; width?: number; height?: number; duration?: string }[]
    format?: { duration?: string }
  }
  const video = data.streams?.find((s) => s.codec_type === 'video' && s.width && s.height)
  if (!video) throw new ProcessingError('Er zit geen beeld in dit bestand.')
  const duration = Number(data.format?.duration ?? video.duration ?? 0)
  if (!Number.isFinite(duration) || duration < 0.5) throw new ProcessingError('Deze video is te kort.')
  return { duration, width: video.width!, height: video.height!, hasAudio: !!data.streams?.some((s) => s.codec_type === 'audio') }
}

/**
 * Converts to H.265 (HEVC) with AAC in MP4, tuned for small files over
 * quality: at most 1280×720 and 30 fps, CRF 30, stereo audio at 80 kbit/s.
 * That's roughly half the size of H.264 at the same look. Cut at the maximum
 * length, all metadata (GPS, camera, names) removed, and the index at the
 * front so playback starts before the download finishes. The "hvc1" tag is
 * what Safari needs to play it.
 */
async function convert(input: string, output: string, info: Probe) {
  await run(
    'nice',
    [
      '-n', '10',
      'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error',
      '-protocol_whitelist', 'file',
      '-i', input,
      '-map', '0:v:0', ...(info.hasAudio ? ['-map', '0:a:0'] : []),
      '-t', String(VIDEO_LIMITS.seconds),
      '-vf', 'scale=w=min(1280\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2',
      '-fpsmax', '30',
      '-c:v', 'libx265', '-preset', 'medium', '-crf', '30', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1',
      '-x265-params', 'log-level=error:pools=2:aq-mode=3',
      ...(info.hasAudio ? ['-c:a', 'aac', '-b:a', '80k', '-ac', '2', '-ar', '44100'] : []),
      '-map_metadata', '-1', '-map_chapters', '-1',
      '-movflags', '+faststart',
      '-threads', '2',
      '-y', output,
    ],
    CONVERT_TIMEOUT_MS,
  ).catch((e) => {
    console.error('video convert failed', e)
    throw new ProcessingError('Het omzetten van deze video is mislukt.')
  })
}

/** A frame a quarter of the way in, as a WebP thumbnail. */
async function thumbnail(video: string, output: string, duration: number) {
  const frame = `${output}.jpg`
  await run(
    'ffmpeg',
    ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-ss', String(Math.max(0, duration * 0.25)), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', '-y', frame],
    60_000,
  )
  await sharp(frame).resize(480, 270, { fit: 'cover' }).webp({ quality: 80 }).toFile(output)
  await rm(frame, { force: true })
}

async function processVideo(id: number) {
  const [row] = await db.select().from(videos).where(eq(videos.id, id))
  if (!row) return
  const input = tempFile(id)
  const name = `${row.publicId}-${randomBytes(6).toString('hex')}`
  const rel = { video: `videos/${name}.mp4`, thumb: `videos/thumbs/${name}.webp` }
  const abs = { video: path.join(config.uploadDir, rel.video), thumb: path.join(config.uploadDir, rel.thumb) }
  try {
    await mkdir(path.dirname(abs.thumb), { recursive: true })
    const info = await probe(input)
    await convert(input, abs.video, info)
    const out = await probe(abs.video)
    await thumbnail(abs.video, abs.thumb, out.duration)
    await db.transaction(async (tx) => {
      await tx
        .update(videos)
        .set({ status: 'klaar', error: null, codec: 'h265', filePath: rel.video, thumbPath: rel.thumb, duration: Math.round(out.duration), width: out.width, height: out.height })
        .where(eq(videos.id, id))
      // Friends and followers see it on the timeline (not the hidden "link only" ones)
      if (row.visibility !== 'verborgen') {
        await recordActivity({ type: 'video', actorId: row.userId, videoId: id, visibility: row.visibility === 'vrienden' ? 'vrienden' : 'iedereen' }, tx)
      }
    })
  } catch (e) {
    await Promise.all([rm(abs.video, { force: true }), rm(abs.thumb, { force: true })])
    const message = e instanceof ProcessingError ? e.message : 'Er ging iets mis bij het verwerken van je video.'
    if (!(e instanceof ProcessingError)) console.error('video processing failed', e)
    await db.update(videos).set({ status: 'mislukt', error: message }).where(eq(videos.id, id))
  } finally {
    await rm(input, { force: true })
  }
}

// One video at a time, so a few uploads can't swamp the server
const queue: number[] = []
let busy = false

export function enqueueVideo(id: number) {
  if (!queue.includes(id)) queue.push(id)
  void drain()
}

async function drain() {
  if (busy) return
  busy = true
  try {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) await processVideo(id)
  } finally {
    busy = false
  }
}

/** After a restart: pick up videos that were waiting, forget abandoned uploads. */
export async function resumeVideoProcessing() {
  await mkdir(tempDir(), { recursive: true })
  const waiting = await db.select({ id: videos.id }).from(videos).where(eq(videos.status, 'verwerken'))
  for (const { id } of waiting) {
    const exists = await stat(tempFile(id)).then(
      () => true,
      () => false,
    )
    if (exists) enqueueVideo(id)
    else await db.update(videos).set({ status: 'mislukt', error: 'Het uploaden is onderbroken. Probeer het nog eens.' }).where(eq(videos.id, id))
  }
  // Started but never uploaded, more than a day ago
  const stale = await db
    .delete(videos)
    .where(and(eq(videos.status, 'uploaden'), lt(videos.createdAt, new Date(Date.now() - 86_400_000))))
    .returning({ id: videos.id })
  await Promise.all(stale.map(({ id }) => rm(tempFile(id), { force: true })))
}
