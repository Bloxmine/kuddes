/**
 * Draws the Oldstagram filters and borders (shared/photoEdits.ts). They were
 * CSS in the original app: a chain of CSS filter functions, sometimes a colour
 * layer on top with a blend mode, and a PNG border. Here the same thing is done
 * on a canvas, pixel by pixel for the filter functions, so it also works where
 * the canvas has no `filter` (Safari) and what's saved matches the preview.
 */
import { useEffect, useState } from 'react'
import { PHOTO_FRAMES, type PhotoFrame, type PhotoLook } from '../../../shared/photoEdits'

type Op = ['sepia' | 'saturate' | 'hue-rotate' | 'contrast' | 'brightness' | 'grayscale', number]
/** A colour over the whole picture, a circle from the middle (stops from the centre to the corners), or top to bottom. */
type Fill = string | { radial: [number, string][] } | { down: [string, string] }
type Look = { ops: Op[]; layer?: { blend: GlobalCompositeOperation; fill: Fill } }

// From instagram.css (picturepan2, after CSSgram by Una Kravets, MIT)
const LOOKS: Record<PhotoLook, Look> = {
  '1977': { ops: [['sepia', 0.5], ['hue-rotate', -30], ['saturate', 1.4]] },
  aden: { ops: [['sepia', 0.2], ['brightness', 1.15], ['saturate', 1.4]], layer: { blend: 'multiply', fill: 'rgba(125, 105, 24, .1)' } },
  amaro: { ops: [['sepia', 0.35], ['contrast', 1.1], ['brightness', 1.2], ['saturate', 1.3]], layer: { blend: 'overlay', fill: 'rgba(125, 105, 24, .2)' } },
  ashby: { ops: [['sepia', 0.5], ['contrast', 1.2], ['saturate', 1.8]], layer: { blend: 'lighten', fill: 'rgba(125, 105, 24, .35)' } },
  brannan: { ops: [['sepia', 0.4], ['contrast', 1.25], ['brightness', 1.1], ['saturate', 0.9], ['hue-rotate', -2]] },
  brooklyn: { ops: [['sepia', 0.25], ['contrast', 1.25], ['brightness', 1.25], ['hue-rotate', 5]], layer: { blend: 'overlay', fill: 'rgba(127, 187, 227, .2)' } },
  charmes: { ops: [['sepia', 0.25], ['contrast', 1.25], ['brightness', 1.25], ['saturate', 1.35], ['hue-rotate', -5]], layer: { blend: 'darken', fill: 'rgba(125, 105, 24, .25)' } },
  clarendon: { ops: [['sepia', 0.15], ['contrast', 1.25], ['brightness', 1.25], ['hue-rotate', 5]], layer: { blend: 'overlay', fill: 'rgba(127, 187, 227, .4)' } },
  crema: { ops: [['sepia', 0.5], ['contrast', 1.25], ['brightness', 1.15], ['saturate', 0.9], ['hue-rotate', -2]], layer: { blend: 'multiply', fill: 'rgba(125, 105, 24, .2)' } },
  dogpatch: { ops: [['sepia', 0.35], ['saturate', 1.1], ['contrast', 1.5]] },
  earlybird: { ops: [['sepia', 0.25], ['contrast', 1.25], ['brightness', 1.15], ['saturate', 0.9], ['hue-rotate', -5]], layer: { blend: 'multiply', fill: { radial: [[0, 'rgba(125, 105, 24, 0)'], [1, 'rgba(125, 105, 24, .2)']] } } },
  gingham: { ops: [['contrast', 1.1], ['brightness', 1.1]], layer: { blend: 'soft-light', fill: '#e6e6e6' } },
  ginza: { ops: [['sepia', 0.25], ['contrast', 1.15], ['brightness', 1.2], ['saturate', 1.35], ['hue-rotate', -5]], layer: { blend: 'darken', fill: 'rgba(125, 105, 24, .15)' } },
  hefe: { ops: [['sepia', 0.4], ['contrast', 1.5], ['brightness', 1.2], ['saturate', 1.4], ['hue-rotate', -10]], layer: { blend: 'multiply', fill: { radial: [[0, 'rgba(0, 0, 0, 0)'], [1, 'rgba(0, 0, 0, .25)']] } } },
  helena: { ops: [['sepia', 0.5], ['contrast', 1.05], ['brightness', 1.05], ['saturate', 1.35]], layer: { blend: 'overlay', fill: 'rgba(158, 175, 30, .25)' } },
  hudson: { ops: [['sepia', 0.25], ['contrast', 1.2], ['brightness', 1.2], ['saturate', 1.05], ['hue-rotate', -15]], layer: { blend: 'multiply', fill: { radial: [[0.25, 'rgba(25, 62, 167, 0)'], [1, 'rgba(25, 62, 167, .25)']] } } },
  inkwell: { ops: [['brightness', 1.25], ['contrast', 0.85], ['grayscale', 1]] },
  kelvin: { ops: [['sepia', 0.15], ['contrast', 1.5], ['brightness', 1.1], ['hue-rotate', -10]], layer: { blend: 'overlay', fill: { radial: [[0, 'rgba(128, 78, 15, .25)'], [1, 'rgba(128, 78, 15, .5)']] } } },
  juno: { ops: [['sepia', 0.35], ['contrast', 1.15], ['brightness', 1.15], ['saturate', 1.8]], layer: { blend: 'overlay', fill: 'rgba(127, 187, 227, .2)' } },
  lark: { ops: [['sepia', 0.25], ['contrast', 1.2], ['brightness', 1.3], ['saturate', 1.25]] },
  lofi: { ops: [['saturate', 1.1], ['contrast', 1.5]] },
  ludwig: { ops: [['sepia', 0.25], ['contrast', 1.05], ['brightness', 1.05], ['saturate', 2]], layer: { blend: 'overlay', fill: 'rgba(125, 105, 24, .1)' } },
  maven: { ops: [['sepia', 0.35], ['contrast', 1.05], ['brightness', 1.05], ['saturate', 1.75]], layer: { blend: 'darken', fill: 'rgba(158, 175, 30, .25)' } },
  mayfair: { ops: [['contrast', 1.1], ['brightness', 1.15], ['saturate', 1.1]], layer: { blend: 'multiply', fill: { radial: [[0, 'rgba(175, 105, 24, 0)'], [1, 'rgba(175, 105, 24, .4)']] } } },
  moon: { ops: [['brightness', 1.4], ['contrast', 0.95], ['saturate', 0], ['sepia', 0.35]] },
  nashville: { ops: [['sepia', 0.25], ['contrast', 1.5], ['brightness', 0.9], ['hue-rotate', -15]], layer: { blend: 'screen', fill: { radial: [[0, 'rgba(128, 78, 15, .5)'], [1, 'rgba(128, 78, 15, .65)']] } } },
  perpetua: { ops: [['contrast', 1.1], ['brightness', 1.25], ['saturate', 1.1]], layer: { blend: 'multiply', fill: { down: ['rgba(0, 91, 154, .25)', 'rgba(230, 193, 61, .25)'] } } },
  poprocket: { ops: [['sepia', 0.15], ['brightness', 1.2]], layer: { blend: 'screen', fill: { radial: [[0.4, 'rgba(206, 39, 70, .75)'], [0.8, 'rgba(0, 0, 0, 1)']] } } },
  reyes: { ops: [['sepia', 0.75], ['contrast', 0.75], ['brightness', 1.25], ['saturate', 1.4]] },
  rise: { ops: [['sepia', 0.25], ['contrast', 1.25], ['brightness', 1.2], ['saturate', 0.9]], layer: { blend: 'lighten', fill: { radial: [[0, 'rgba(230, 193, 61, 0)'], [1, 'rgba(230, 193, 61, .25)']] } } },
  sierra: { ops: [['sepia', 0.25], ['contrast', 1.5], ['brightness', 0.9], ['hue-rotate', -15]], layer: { blend: 'screen', fill: { radial: [[0, 'rgba(128, 78, 15, .5)'], [1, 'rgba(0, 0, 0, .65)']] } } },
  skyline: { ops: [['sepia', 0.15], ['contrast', 1.25], ['brightness', 1.25], ['saturate', 1.2]] },
  slumber: { ops: [['sepia', 0.35], ['contrast', 1.25], ['saturate', 1.25]], layer: { blend: 'darken', fill: 'rgba(125, 105, 24, .2)' } },
  stinson: { ops: [['sepia', 0.35], ['contrast', 1.25], ['brightness', 1.1], ['saturate', 1.25]], layer: { blend: 'lighten', fill: 'rgba(125, 105, 24, .45)' } },
  sutro: { ops: [['sepia', 0.4], ['contrast', 1.2], ['brightness', 0.9], ['saturate', 1.4], ['hue-rotate', -10]], layer: { blend: 'darken', fill: { radial: [[0.5, 'rgba(0, 0, 0, 0)'], [0.9, 'rgba(0, 0, 0, .5)']] } } },
  toaster: { ops: [['sepia', 0.25], ['contrast', 1.5], ['brightness', 0.95], ['hue-rotate', -15]], layer: { blend: 'screen', fill: { radial: [[0, '#804e0f'], [1, 'rgba(0, 0, 0, .25)']] } } },
  valencia: { ops: [['sepia', 0.25], ['contrast', 1.1], ['brightness', 1.1]], layer: { blend: 'lighten', fill: 'rgba(230, 193, 61, .1)' } },
  vesper: { ops: [['sepia', 0.35], ['contrast', 1.15], ['brightness', 1.2], ['saturate', 1.3]], layer: { blend: 'overlay', fill: 'rgba(125, 105, 24, .25)' } },
  walden: { ops: [['sepia', 0.35], ['contrast', 0.8], ['brightness', 1.25], ['saturate', 1.4]], layer: { blend: 'darken', fill: 'rgba(229, 240, 128, .5)' } },
  willow: { ops: [['brightness', 1.2], ['contrast', 0.85], ['saturate', 0.05], ['sepia', 0.2]] },
  'xpro-ii': { ops: [['sepia', 0.45], ['contrast', 1.25], ['brightness', 1.75], ['saturate', 1.3], ['hue-rotate', -5]], layer: { blend: 'multiply', fill: { radial: [[0, 'rgba(0, 91, 154, .35)'], [1, 'rgba(0, 0, 0, .65)']] } } },
}

type Matrix = number[] // 3x3, row by row

/** The matrices CSS uses for its filter functions (Filter Effects spec). */
function matrixOf([op, v]: Op): { m: Matrix; add: number } {
  switch (op) {
    case 'brightness':
      return { m: [v, 0, 0, 0, v, 0, 0, 0, v], add: 0 }
    case 'contrast':
      return { m: [v, 0, 0, 0, v, 0, 0, 0, v], add: (0.5 - 0.5 * v) * 255 }
    case 'grayscale':
      return matrixOf(['saturate', 1 - Math.min(1, v)])
    case 'saturate':
      return {
        m: [
          0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
          0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
          0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
        ],
        add: 0,
      }
    case 'sepia': {
      const a = 1 - Math.min(1, v)
      return {
        m: [
          0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
          0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
          0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a,
        ],
        add: 0,
      }
    }
    case 'hue-rotate': {
      const r = (v * Math.PI) / 180
      const c = Math.cos(r)
      const s = Math.sin(r)
      return {
        m: [
          0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
          0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
          0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
        ],
        add: 0,
      }
    }
  }
}

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** The filter on `c`, in place: each function in turn (clamped in between, as CSS does), then the colour layer. */
export function applyLook(c: HTMLCanvasElement, key: PhotoLook) {
  const look = LOOKS[key]
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!look || !ctx) return c
  const steps = look.ops.map(matrixOf)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i]
    let g = d[i + 1]
    let b = d[i + 2]
    for (const { m, add } of steps) {
      const nr = clamp(m[0] * r + m[1] * g + m[2] * b + add)
      const ng = clamp(m[3] * r + m[4] * g + m[5] * b + add)
      const nb = clamp(m[6] * r + m[7] * g + m[8] * b + add)
      r = nr
      g = ng
      b = nb
    }
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  ctx.putImageData(img, 0, 0)
  if (look.layer) {
    const { blend, fill } = look.layer
    const w = c.width
    const h = c.height
    let style: string | CanvasGradient
    if (typeof fill === 'string') style = fill
    else if ('down' in fill) {
      style = ctx.createLinearGradient(0, 0, 0, h)
      style.addColorStop(0, fill.down[0])
      style.addColorStop(1, fill.down[1])
    } else {
      // "circle closest-corner" from the middle: as far as the corners
      style = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2)
      for (const [at, colour] of fill.radial) style.addColorStop(at, colour)
    }
    ctx.save()
    ctx.globalCompositeOperation = blend
    ctx.fillStyle = style
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
  return c
}

export const frameUrl = (frame: PhotoFrame) => `/photo-frames/${frame}.png`

const frames = new Map<PhotoFrame, Promise<HTMLImageElement>>()

/** The border picture, loaded once. */
export function loadFrame(frame: PhotoFrame) {
  let p = frames.get(frame)
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Het randje kon niet geladen worden.'))
      img.src = frameUrl(frame)
    })
    p.catch(() => frames.delete(frame))
    frames.set(frame, p)
  }
  return p
}

/**
 * The border over `c`, in place. The borders are square; on a photo that
 * isn't, the corners keep their shape and only the sides stretch.
 */
export function drawFrame(c: HTMLCanvasElement, border: HTMLImageElement) {
  const ctx = c.getContext('2d')
  if (!ctx) return c
  const w = c.width
  const h = c.height
  const sw = border.naturalWidth
  const sh = border.naturalHeight
  // The corner piece: a quarter of the border picture, scaled to the short side
  const s = sw / 4
  const d = Math.min(w, h) / 4
  const xs = [0, s, sw - s, sw]
  const ys = [0, s, sh - s, sh]
  const xd = [0, d, w - d, w]
  const yd = [0, d, h - d, h]
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      if (i === 1 && j === 1) continue
      ctx.drawImage(border, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j], xd[i], yd[j], xd[i + 1] - xd[i], yd[j + 1] - yd[j])
    }
  return c
}

/** All borders, once they're loaded (they're small). */
export function useBorders() {
  const [borders, setBorders] = useState<Partial<Record<PhotoFrame, HTMLImageElement>>>({})
  useEffect(() => {
    let live = true
    for (const f of Object.keys(PHOTO_FRAMES) as PhotoFrame[])
      loadFrame(f).then(
        (img) => live && setBorders((b) => ({ ...b, [f]: img })),
        () => {},
      )
    return () => {
      live = false
    }
  }, [])
  return borders
}
