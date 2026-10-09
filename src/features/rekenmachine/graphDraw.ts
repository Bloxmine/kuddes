import { fmt, niceStep } from './graph'

/** The middle of the graph and how many units one pixel is; `angle`: x in steps of π (or 90°). */
export type View = { cx: number; cy: number; ux: number; uy: number; angle: boolean }
export type Curve = { f: (x: number) => number; color: string; width: number }

/** The graphs' own colours, like Desmos's: they're the drawing, not the theme. */
export const GRAPH_COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000', '#b8457a', '#1a8f8f']

/** -10 to 10 on the x-axis, with square grid cells. */
export const standardView = (w: number): View => ({ cx: 0, cy: 0, ux: 20 / w, uy: 20 / w, angle: false })

/** Grid steps along an angle axis: parts of π (or of 180°). */
function gridStep(units: number, angle: boolean, degrees: boolean) {
  if (!angle) return niceStep(units)
  const base = degrees ? 180 : Math.PI
  for (const m of [1 / 12, 1 / 6, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32, 64]) if (m * base >= units * 80) return m * base
  return niceStep(units)
}

/** 3π/2 rather than 4,712389. */
function angleLabel(v: number, degrees: boolean) {
  if (degrees) return `${fmt(v, 5)}°`
  const r = v / Math.PI
  for (const q of [1, 2, 3, 4, 6, 12]) {
    const p = Math.round(r * q)
    if (Math.abs(r * q - p) < 1e-6) {
      if (p === 0) return '0'
      const n = p === 1 ? '' : p === -1 ? '−' : String(p).replace('-', '−')
      return `${n}π${q > 1 ? `/${q}` : ''}`
    }
  }
  return fmt(v, 4)
}

/**
 * Graph paper with numbered axes and the curves on it, sized to the canvas
 * (w × h CSS pixels). The colours are the --rmc-* tokens on the canvas.
 * `under` draws between the grid and the curves (the shaded area).
 */
export function drawGraph(cv: HTMLCanvasElement, w: number, h: number, v: View, degrees: boolean, curves: Curve[], under?: (ctx: CanvasRenderingContext2D) => void) {
  const dpr = window.devicePixelRatio || 1
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
  }
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const css = getComputedStyle(cv)
  const col = (name: string) => css.getPropertyValue(name).trim()
  const toPx = (x: number) => (x - v.cx) / v.ux + w / 2
  const toPy = (y: number) => h / 2 - (y - v.cy) / v.uy
  const toX = (px: number) => v.cx + (px - w / 2) * v.ux
  const range = { x0: toX(0), x1: toX(w), y0: v.cy - (h / 2) * v.uy, y1: v.cy + (h / 2) * v.uy }
  ctx.fillStyle = col('--rmc-paper')
  ctx.fillRect(0, 0, w, h)

  // Grid: fine lines, then the numbered ones, then the axes
  const sx = gridStep(v.ux, v.angle, degrees)
  const sy = niceStep(v.uy)
  const lead = (s: number) => Math.round(s / 10 ** Math.floor(Math.log10(s)))
  const minor = (s: number, angle: boolean) => (angle ? s / 2 : s / (lead(s) === 2 ? 4 : 5))
  const lines = (step: number, from: number, to: number, draw: (u: number) => void) => {
    for (let k = Math.ceil(from / step); k <= Math.floor(to / step); k++) draw(k * step)
  }
  ctx.lineWidth = 1
  for (const [step, color] of [
    [0, col('--rmc-grid')],
    [1, col('--rmc-grid-major')],
  ] as const) {
    ctx.strokeStyle = color
    ctx.beginPath()
    lines(step ? sx : minor(sx, v.angle), range.x0, range.x1, (x) => {
      const px = Math.round(toPx(x)) + 0.5
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
    })
    lines(step ? sy : minor(sy, false), range.y0, range.y1, (y) => {
      const py = Math.round(toPy(y)) + 0.5
      ctx.moveTo(0, py)
      ctx.lineTo(w, py)
    })
    ctx.stroke()
  }
  const ax = Math.round(toPy(0)) + 0.5
  const ay = Math.round(toPx(0)) + 0.5
  ctx.strokeStyle = col('--rmc-axis')
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(0, ax)
  ctx.lineTo(w, ax)
  ctx.moveTo(ay, 0)
  ctx.lineTo(ay, h)
  ctx.stroke()

  // Numbers along the axes, kept on screen when an axis is off the edge
  ctx.font = '11px "Segoe UI", Tahoma, sans-serif'
  ctx.fillStyle = col('--rmc-label')
  const ly = Math.min(h - 4, Math.max(14, ax + 14))
  ctx.textAlign = 'center'
  lines(sx, range.x0, range.x1, (x) => {
    if (Math.abs(x) < sx / 2) return
    ctx.fillText(v.angle ? angleLabel(x, degrees) : fmt(x, 4), toPx(x), ly)
  })
  const left = ay - 5 < 30
  ctx.textAlign = left ? 'left' : 'right'
  const lx = left ? Math.max(4, ay + 5) : Math.min(w - 4, ay - 5)
  lines(sy, range.y0, range.y1, (y) => {
    if (Math.abs(y) < sy / 2) return
    ctx.fillText(fmt(y, 4), lx, toPy(y) + 4)
  })
  if (range.x0 < 0 && range.x1 > 0 && range.y0 < 0 && range.y1 > 0) {
    ctx.textAlign = 'right'
    ctx.fillText('0', ay - 4, ax + 13)
  }

  under?.(ctx)

  // The graphs; a jump (tan at 90°, 1/x at 0) breaks the line instead of drawing a wall
  ctx.lineJoin = 'round'
  for (const c of curves) {
    ctx.strokeStyle = c.color
    ctx.lineWidth = c.width
    ctx.beginPath()
    let pen = false
    let prev = 0
    for (let px = -1; px <= w + 1; px += 0.5) {
      const y = c.f(toX(px))
      if (!Number.isFinite(y)) {
        pen = false
        continue
      }
      const py = toPy(y)
      if (pen && Math.abs(py - prev) > h) {
        const mid = toPy(c.f(toX(px - 0.25)))
        if (!(mid >= Math.min(py, prev) - 1 && mid <= Math.max(py, prev) + 1)) pen = false
      }
      const cy = Math.max(-1e4, Math.min(1e4, py))
      if (pen) ctx.lineTo(px, cy)
      else ctx.moveTo(px, cy)
      pen = true
      prev = py
    }
    ctx.stroke()
  }
  return { ctx, col, toPx, toPy, toX, axisY: ax }
}
