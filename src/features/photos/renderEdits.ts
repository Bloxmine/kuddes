/**
 * Draws a photo with its edits (shared/photoEdits.ts): first the steps, which
 * change the shape or the pixels (rotate, flip, crop, red eyes), then light and
 * colour as one colour matrix, then the vignette. The same code makes the
 * preview in the editor and the file that's saved, so what you see is what you get.
 */
import type { PhotoEditStep, PhotoEdits, PhotoFilter } from '../../../shared/photoEdits'
import { applyLook, drawFrame, loadFrame } from './oldsta'

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(width))
  c.height = Math.max(1, Math.round(height))
  return c
}

function context(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Je browser kan deze foto niet bewerken.')
  return ctx
}

/** Red pupils from a flash: the red is brought down to the level of green and blue, softly towards the edge. */
function removeRedEye(c: HTMLCanvasElement, step: Extract<PhotoEditStep, { t: 'redeye' }>) {
  const r = Math.max(1, step.r * c.width)
  const cx = step.x * c.width
  const cy = step.y * c.height
  const x0 = Math.max(0, Math.floor(cx - r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const x1 = Math.min(c.width, Math.ceil(cx + r))
  const y1 = Math.min(c.height, Math.ceil(cy + r))
  if (x1 <= x0 || y1 <= y0) return
  const ctx = context(c)
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)
  const d = img.data
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (dist > 1) continue
      const i = ((y - y0) * (x1 - x0) + (x - x0)) * 4
      const red = d[i]
      const other = (d[i + 1] + d[i + 2]) / 2
      // Only clearly red pixels: skin around the eye stays as it is
      if (red < 60 || red < other * 1.5) continue
      const strength = dist < 0.7 ? 1 : (1 - dist) / 0.3
      // A dark pupil, like it should have been
      const target = other * 0.85
      d[i] = red + (target - red) * strength
      d[i + 1] = d[i + 1] * (1 - 0.15 * strength)
      d[i + 2] = d[i + 2] * (1 - 0.15 * strength)
    }
  }
  ctx.putImageData(img, x0, y0)
}

/** One step on the picture so far; returns the (possibly new) canvas. */
function applyStep(c: HTMLCanvasElement, step: PhotoEditStep) {
  switch (step.t) {
    case 'rotate': {
      const sideways = step.turns % 2 === 1
      const out = canvas(sideways ? c.height : c.width, sideways ? c.width : c.height)
      const ctx = context(out)
      ctx.translate(out.width / 2, out.height / 2)
      ctx.rotate((step.turns * Math.PI) / 2)
      ctx.drawImage(c, -c.width / 2, -c.height / 2)
      return out
    }
    case 'flip': {
      const out = canvas(c.width, c.height)
      const ctx = context(out)
      if (step.axis === 'h') ctx.setTransform(-1, 0, 0, 1, out.width, 0)
      else ctx.setTransform(1, 0, 0, -1, 0, out.height)
      ctx.drawImage(c, 0, 0)
      return out
    }
    case 'crop': {
      const sx = Math.round(step.x * c.width)
      const sy = Math.round(step.y * c.height)
      const sw = Math.max(1, Math.min(c.width - sx, Math.round(step.w * c.width)))
      const sh = Math.max(1, Math.min(c.height - sy, Math.round(step.h * c.height)))
      const out = canvas(sw, sh)
      context(out).drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh)
      return out
    }
    case 'redeye':
      removeRedEye(c, step)
      return c
  }
}

/** The picture after the steps, before light and colour. */
export function applySteps(source: CanvasImageSource & { width: number; height: number }, steps: PhotoEditStep[], maxSide = Infinity) {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
  let c = canvas(source.width * scale, source.height * scale)
  const ctx = context(c)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, c.width, c.height)
  for (const step of steps) c = applyStep(c, step)
  return c
}

// A colour matrix: 3 rows of [r, g, b, offset], offsets on the 0..1 scale
type Matrix = number[][]
const IDENTITY: Matrix = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
]

/** a after b: first b, then a */
function multiply(a: Matrix, b: Matrix): Matrix {
  return a.map((row) => [0, 1, 2, 3].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j] + (j === 3 ? row[3] : 0)))
}

const brightness = (k: number): Matrix => IDENTITY.map((row, i) => row.map((v, j) => (j === i ? k : v)))
const contrast = (k: number): Matrix => IDENTITY.map((row, i) => row.map((v, j) => (j === i ? k : j === 3 ? 0.5 * (1 - k) : v)))
const channels = (r: number, g: number, b: number, lift = 0): Matrix => [
  [r, 0, 0, lift],
  [0, g, 0, lift],
  [0, 0, b, lift],
]
// Like CSS's saturate(): the grey it moves towards weighs green heaviest, as the eye does
function saturate(s: number): Matrix {
  return [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s, 0],
  ]
}
const SEPIA: Matrix = [
  [0.393, 0.769, 0.189, 0],
  [0.349, 0.686, 0.168, 0],
  [0.272, 0.534, 0.131, 0],
]

const FILTERS: Record<PhotoFilter, Matrix> = {
  geen: IDENTITY,
  zwartwit: multiply(contrast(1.1), saturate(0)),
  sepia: SEPIA,
  // Faded, warm and a bit washed out, like a photo from a shoebox
  vintage: multiply(
    channels(0.9, 0.88, 0.8, 0.08),
    multiply(
      contrast(0.85),
      multiply(
        saturate(0.6),
        SEPIA.map((row, i) => row.map((v, j) => v * 0.35 + (i === j ? 0.65 : 0))),
      ),
    ),
  ),
  warm: multiply(channels(1.1, 1.02, 0.86), saturate(1.15)),
  koel: multiply(channels(0.9, 1, 1.12), saturate(0.9)),
  fel: multiply(contrast(1.2), saturate(1.45)),
  lomo: multiply(contrast(1.35), multiply(channels(1.05, 1.02, 0.9), saturate(1.3))),
}

export function colourMatrix(e: Pick<PhotoEdits, 'light' | 'contrast' | 'saturation' | 'warmth' | 'filter'>): Matrix {
  let m = FILTERS[e.filter] ?? IDENTITY
  m = multiply(brightness(1 + e.light / 100), m)
  m = multiply(contrast(1 + e.contrast / 100), m)
  m = multiply(saturate(1 + e.saturation / 100), m)
  m = multiply(channels(1 + e.warmth / 250, 1, 1 - e.warmth / 250), m)
  return m
}

/** Light, colour and vignette, into `out` (same size as `from`). */
export function applyColour(from: HTMLCanvasElement, e: PhotoEdits, out: HTMLCanvasElement = canvas(from.width, from.height)) {
  out.width = from.width
  out.height = from.height
  const ctx = context(out)
  ctx.drawImage(from, 0, 0)
  const lomo = e.filter === 'lomo' ? 45 : 0
  const vignette = Math.min(100, e.vignette + lomo) / 100
  const m = colourMatrix(e)
  const plain = vignette === 0 && m.every((row, i) => row.every((v, j) => v === IDENTITY[i][j]))
  if (plain) return out
  const img = ctx.getImageData(0, 0, out.width, out.height)
  const d = img.data
  const [r0, g0, b0] = m
  const w = out.width
  const h = out.height
  const cx = w / 2
  const cy = h / 2
  const reach = Math.hypot(cx, cy)
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      let nr = r0[0] * r + r0[1] * g + r0[2] * b + r0[3] * 255
      let ng = g0[0] * r + g0[1] * g + g0[2] * b + g0[3] * 255
      let nb = b0[0] * r + b0[1] * g + b0[2] * b + b0[3] * 255
      if (vignette) {
        // Darker towards the corners, starting halfway out
        const t = Math.max(0, Math.hypot(x - cx, y - cy) / reach - 0.45) / 0.55
        const k = 1 - vignette * 0.75 * t * t
        nr *= k
        ng *= k
        nb *= k
      }
      d[i] = nr
      d[i + 1] = ng
      d[i + 2] = nb
    }
  }
  ctx.putImageData(img, 0, 0)
  return out
}

/**
 * Everything after the steps, into `out`: the Oldstagram filter, light and
 * colour, and the border on top. `border` is the loaded border picture
 * (loadFrame), or null to leave it off for now.
 */
export function applyFinish(from: HTMLCanvasElement, e: PhotoEdits, border: HTMLImageElement | null, out: HTMLCanvasElement = canvas(from.width, from.height)) {
  let src = from
  if (e.look) {
    // The filter works in place, and `from` is reused for every redraw
    src = canvas(from.width, from.height)
    context(src).drawImage(from, 0, 0)
    applyLook(src, e.look)
  }
  applyColour(src, e, out)
  if (e.frame && border) drawFrame(out, border)
  return out
}

/** A canvas as a file to upload: WebP, or JPEG where the browser can't make WebP (Safari). */
export async function canvasToFile(out: HTMLCanvasElement): Promise<File> {
  const encode = (type: string) => new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, 0.92))
  let blob = await encode('image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg')
  if (!blob) throw new Error('De foto kon niet worden gemaakt.')
  return new File([blob], blob.type === 'image/webp' ? 'foto.webp' : 'foto.jpg', { type: blob.type })
}

/** The finished photo as a file to upload. */
export async function renderToFile(source: HTMLImageElement, e: PhotoEdits): Promise<File> {
  const border = e.frame ? await loadFrame(e.frame) : null
  return canvasToFile(applyFinish(applySteps(source, e.steps, 2048), e, border))
}
