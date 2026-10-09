/**
 * Bellen schieten, like the classic flash Bubble Shooter: aim with the mouse
 * (or a finger), shoot, and three or more of the same colour pop. Whatever
 * then hangs loose falls down for extra points. Every few misses a new row
 * comes in at the top; once the bubbles reach the line at the bottom, it's
 * over. Clear the board for the next level. Drawn on a canvas.
 */
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { soundOn } from '../games/sounds'
import './BubbleShooter.css'

const COLS = 12
const R = 17
const ROW_H = R * Math.sqrt(3)
const W = COLS * R * 2 + R
const ROWS = 13
const LINE_Y = R + (ROWS - 1) * ROW_H + R
const H = LINE_Y + 90
const SHOOTER = { x: W / 2, y: H - 42 }
const SPEED = 14
const COLOURS = ['#e8413e', '#f6c522', '#3cb44b', '#3a78e6', '#a052d8', '#1ec8c8', '#f08a24']
const MISSES = [6, 6, 5, 5, 4]

type Cell = number | null
type Pop = { x: number; y: number; c: number; t: number }
type Fall = { x: number; y: number; c: number; vy: number; vx: number }

// ------------------------------------------------------------------ sound

let ac: AudioContext | null = null
function tone(freq: number, len = 0.08, type: OscillatorType = 'sine', vol = 0.08, slide = 0) {
  if (!soundOn()) return
  try {
    ac ??= new AudioContext()
    const t = ac.currentTime
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + len)
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(g).connect(ac.destination)
    o.start(t)
    o.stop(t + len + 0.02)
  } catch {
    // no sound then
  }
}
const sfx = {
  shoot: () => tone(520, 0.07, 'triangle', 0.06, 300),
  bounce: () => tone(260, 0.04, 'square', 0.03),
  stick: () => tone(180, 0.06, 'sine', 0.06),
  pop: (n: number) => [0, 1, 2].forEach((i) => window.setTimeout(() => tone(700 + i * 180 + n * 10, 0.08, 'sine', 0.07, 400), i * 45)),
  drop: () => tone(400, 0.25, 'sine', 0.06, -250),
  row: () => tone(120, 0.25, 'sawtooth', 0.05, -40),
  over: () => [440, 330, 220].forEach((f, i) => window.setTimeout(() => tone(f, 0.25, 'triangle', 0.07), i * 180)),
  level: () => [523, 659, 784, 1046].forEach((f, i) => window.setTimeout(() => tone(f, 0.15, 'triangle', 0.07), i * 110)),
}

// ------------------------------------------------------------------ the grid

/**
 * Rows alternate: every other row is shifted half a bubble to the right.
 * `shift` says whether row 0 is the shifted kind (it flips when a new row
 * comes in at the top, so the rows below keep their place).
 */
const rowShifted = (row: number, shift: boolean) => (row % 2 === 1) !== shift
const cellX = (row: number, col: number, shift: boolean) => R + col * R * 2 + (rowShifted(row, shift) ? R : 0)
const cellY = (row: number) => R + row * ROW_H
const colsIn = (row: number, shift: boolean) => (rowShifted(row, shift) ? COLS - 1 : COLS)

function neighbours(row: number, col: number, shift: boolean): [number, number][] {
  const s = rowShifted(row, shift) ? 0 : -1
  return [
    [row, col - 1],
    [row, col + 1],
    [row - 1, col + s],
    [row - 1, col + s + 1],
    [row + 1, col + s],
    [row + 1, col + s + 1],
  ]
}

function randomRow(colours: number, row: number, shift: boolean): Cell[] {
  return Array.from({ length: COLS }, (_, c) => (c < colsIn(row, shift) ? Math.floor(Math.random() * colours) : null))
}

type Game = {
  grid: Cell[][]
  shift: boolean
  level: number
  colours: number
  score: number
  misses: number
  current: number
  next: number
  shot: { x: number; y: number; vx: number; vy: number; c: number } | null
  pops: Pop[]
  falls: Fall[]
  over: boolean
  cleared: boolean
  popped: number
  shots: number
}

function colourOnBoard(g: Game): number {
  const on = [...new Set(g.grid.flat().filter((c): c is number => c !== null))]
  return on.length ? on[Math.floor(Math.random() * on.length)] : Math.floor(Math.random() * g.colours)
}

function newLevel(level: number, score = 0): Game {
  const colours = Math.min(COLOURS.length, 4 + level)
  const rows = Math.min(9, 4 + level)
  const grid: Cell[][] = Array.from({ length: ROWS + 1 }, (_, r) => (r < rows ? randomRow(colours, r, false) : Array(COLS).fill(null)))
  const g: Game = { grid, shift: false, level, colours, score, misses: 0, current: 0, next: 0, shot: null, pops: [], falls: [], over: false, cleared: false, popped: 0, shots: 0 }
  g.current = colourOnBoard(g)
  g.next = colourOnBoard(g)
  return g
}

/** The nearest empty cell to (x, y) that's next to a bubble or at the top. */
function snap(g: Game, x: number, y: number): [number, number] {
  let best: [number, number] = [0, 0]
  let bestD = Infinity
  for (let r = 0; r <= ROWS; r++)
    for (let c = 0; c < colsIn(r, g.shift); c++) {
      if (g.grid[r][c] !== null) continue
      const touching = r === 0 || neighbours(r, c, g.shift).some(([nr, nc]) => g.grid[nr]?.[nc] != null)
      if (!touching) continue
      const d = Math.hypot(cellX(r, c, g.shift) - x, cellY(r) - y)
      if (d < bestD) {
        bestD = d
        best = [r, c]
      }
    }
  return best
}

function flood(g: Game, row: number, col: number, same: (c: Cell) => boolean): [number, number][] {
  const seen = new Set<string>()
  const out: [number, number][] = []
  const stack: [number, number][] = [[row, col]]
  while (stack.length) {
    const [r, c] = stack.pop()!
    const key = `${r},${c}`
    if (seen.has(key) || r < 0 || r > ROWS || c < 0 || c >= colsIn(r, g.shift)) continue
    seen.add(key)
    if (!same(g.grid[r][c])) continue
    out.push([r, c])
    for (const n of neighbours(r, c, g.shift)) stack.push(n)
  }
  return out
}

/** After a bubble sticks: pop its cluster, drop what hangs loose, and count misses. */
function settle(g: Game, row: number, col: number) {
  const colour = g.grid[row][col]!
  const cluster = flood(g, row, col, (c) => c === colour)
  if (cluster.length >= 3) {
    for (const [r, c] of cluster) {
      g.pops.push({ x: cellX(r, c, g.shift), y: cellY(r), c: colour, t: 0 })
      g.grid[r][c] = null
    }
    g.score += cluster.length * 10
    g.popped += cluster.length
    sfx.pop(cluster.length)
    // Everything no longer connected to the top falls
    const held = new Set<string>()
    for (let c = 0; c < colsIn(0, g.shift); c++) if (g.grid[0][c] !== null) for (const [r2, c2] of flood(g, 0, c, (x) => x !== null)) held.add(`${r2},${c2}`)
    let dropped = 0
    for (let r = 0; r <= ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        if (g.grid[r][c] === null || held.has(`${r},${c}`)) continue
        g.falls.push({ x: cellX(r, c, g.shift), y: cellY(r), c: g.grid[r][c]!, vy: -2 - Math.random() * 3, vx: (Math.random() - 0.5) * 3 })
        g.grid[r][c] = null
        dropped++
      }
    if (dropped) {
      // Dropping is worth more, and more the more fall at once
      g.score += Math.round(dropped * 20 * (1 + dropped / 4))
      g.popped += dropped
      window.setTimeout(sfx.drop, 120)
    }
  } else {
    sfx.stick()
    g.misses++
    const allowed = MISSES[Math.min(MISSES.length - 1, g.level - 1)]
    if (g.misses >= allowed) {
      // The ceiling comes down: a new row at the top
      g.misses = 0
      g.shift = !g.shift
      g.grid.pop()
      g.grid.unshift(randomRow(g.colours, 0, g.shift))
      sfx.row()
    }
  }
  if (g.grid.flat().every((c) => c === null)) {
    g.cleared = true
    g.score += 1000 * g.level
    sfx.level()
  } else if (g.grid.some((row, r) => r >= ROWS - 1 && row.some((c) => c !== null)) || g.grid[ROWS].some((c) => c !== null)) {
    g.over = true
    sfx.over()
  }
}

// ------------------------------------------------------------------ drawing

function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, r = R - 1, alpha = 1) {
  ctx.globalAlpha = alpha
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.25, COLOURS[c])
  grad.addColorStop(1, shade(COLOURS[c], -0.45))
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.globalAlpha = 1
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount < 0 ? v * amount : (255 - v) * amount))))
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`
}

/** The aiming line: dots up to (and once off) a wall. */
function aimPath(angle: number) {
  const pts: [number, number][] = []
  let x = SHOOTER.x
  let y = SHOOTER.y
  let vx = Math.cos(angle) * 12
  const vy = -Math.sin(angle) * 12
  let bounced = 0
  for (let i = 0; i < 70 && y > R; i++) {
    x += vx
    y += vy
    if (x < R || x > W - R) {
      vx = -vx
      x = Math.max(R, Math.min(W - R, x))
      if (++bounced > 1) break
    }
    if (i % 3 === 0) pts.push([x, y])
  }
  return pts
}

export function BubbleShooter({ onFinish }: { onFinish: (result: { score: number; won: boolean; details: Record<string, number> }) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const game = useRef<Game>(newLevel(1))
  const angle = useRef(Math.PI / 2)
  const [hud, setHud] = useState({ score: 0, level: 1, misses: 0, over: false, cleared: false })
  const reported = useRef(false)

  // The loop: move the shot, animate pops and falls, draw
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = W * dpr
    c.height = H * dpr
    ctx.scale(dpr, dpr)
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(2.5, (now - last) / 16.7)
      last = now
      const g = game.current
      // The shot flies, bounces off the walls and sticks to the ceiling or a bubble
      if (g.shot) {
        const steps = 3
        for (let i = 0; i < steps && g.shot; i++) {
          const s = g.shot
          s.x += (s.vx * dt) / steps
          s.y += (s.vy * dt) / steps
          if (s.x < R || s.x > W - R) {
            s.vx = -s.vx
            s.x = Math.max(R, Math.min(W - R, s.x))
            sfx.bounce()
          }
          let hit = s.y <= R
          if (!hit)
            outer: for (let r = 0; r <= ROWS; r++)
              for (let col = 0; col < colsIn(r, g.shift); col++)
                if (g.grid[r][col] !== null && Math.hypot(cellX(r, col, g.shift) - s.x, cellY(r) - s.y) < R * 1.8) {
                  hit = true
                  break outer
                }
          if (hit) {
            const [row, col] = snap(g, s.x, s.y)
            g.grid[row][col] = s.c
            g.shot = null
            settle(g, row, col)
            setHud({ score: g.score, level: g.level, misses: g.misses, over: g.over, cleared: g.cleared })
          }
        }
      }
      for (const p of g.pops) p.t += 0.08 * dt
      g.pops = g.pops.filter((p) => p.t < 1)
      for (const f of g.falls) {
        f.vy += 0.6 * dt
        f.y += f.vy * dt
        f.x += f.vx * dt
      }
      g.falls = g.falls.filter((f) => f.y < H + R)

      // Draw
      const bg = ctx.createLinearGradient(0, 0, 0, H)
      bg.addColorStop(0, '#1b2a4a')
      bg.addColorStop(1, '#2d4b7c')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
      // The line they mustn't cross
      ctx.strokeStyle = 'rgba(255, 90, 90, 0.55)'
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      ctx.moveTo(0, LINE_Y)
      ctx.lineTo(W, LINE_Y)
      ctx.stroke()
      ctx.setLineDash([])
      for (let r = 0; r <= ROWS; r++) for (let col = 0; col < COLS; col++) if (g.grid[r][col] !== null) bubble(ctx, cellX(r, col, g.shift), cellY(r), g.grid[r][col]!)
      for (const p of g.pops) bubble(ctx, p.x, p.y, p.c, (R - 1) * (1 + p.t * 0.6), 1 - p.t)
      for (const f of g.falls) bubble(ctx, f.x, f.y, f.c)
      // The shooter: aim dots, the loaded bubble and the next one
      if (!g.over && !g.cleared) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
        for (const [x, y] of aimPath(angle.current)) {
          ctx.beginPath()
          ctx.arc(x, y, 2.2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.save()
      ctx.translate(SHOOTER.x, SHOOTER.y)
      ctx.rotate(-angle.current + Math.PI / 2)
      ctx.fillStyle = '#c9d4e6'
      ctx.fillRect(-7, -R * 2.3, 14, R * 1.6)
      ctx.restore()
      ctx.fillStyle = '#51627f'
      ctx.beginPath()
      ctx.arc(SHOOTER.x, SHOOTER.y, R + 8, 0, Math.PI * 2)
      ctx.fill()
      if (g.shot) bubble(ctx, g.shot.x, g.shot.y, g.shot.c)
      else if (!g.over) bubble(ctx, SHOOTER.x, SHOOTER.y, g.current)
      bubble(ctx, SHOOTER.x - 70, SHOOTER.y + 8, g.next, R * 0.7)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '11px Verdana, sans-serif'
      ctx.fillText('volgende', SHOOTER.x - 96, SHOOTER.y + 34)
      // Misses left before the ceiling drops
      const allowed = MISSES[Math.min(MISSES.length - 1, g.level - 1)]
      for (let i = 0; i < allowed; i++) {
        ctx.fillStyle = i < allowed - g.misses ? '#ffd76a' : 'rgba(255,255,255,0.18)'
        ctx.beginPath()
        ctx.arc(SHOOTER.x + 50 + i * 12, SHOOTER.y + 12, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Report the game once it's over
  useEffect(() => {
    if (!hud.over || reported.current) return
    reported.current = true
    const g = game.current
    onFinish({ score: g.score, won: false, details: { level: g.level, bubbles: g.popped, shots: g.shots } })
  }, [hud.over, onFinish])

  const aimAt = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * W
    const y = ((clientY - rect.top) / rect.height) * H
    const a = Math.atan2(SHOOTER.y - y, x - SHOOTER.x)
    angle.current = Math.max(0.12, Math.min(Math.PI - 0.12, a))
  }
  const shoot = () => {
    const g = game.current
    if (g.shot || g.over || g.cleared) return
    g.shot = { x: SHOOTER.x, y: SHOOTER.y, vx: Math.cos(angle.current) * SPEED, vy: -Math.sin(angle.current) * SPEED, c: g.current }
    g.current = g.next
    g.next = colourOnBoard(g)
    g.shots++
    sfx.shoot()
  }
  const swap = () => {
    const g = game.current
    if (g.shot) return
    ;[g.current, g.next] = [g.next, g.current]
  }
  const nextLevel = () => {
    const g = game.current
    game.current = newLevel(g.level + 1, g.score)
    setHud({ score: g.score, level: g.level + 1, misses: 0, over: false, cleared: false })
  }
  const restart = () => {
    game.current = newLevel(1)
    reported.current = false
    setHud({ score: 0, level: 1, misses: 0, over: false, cleared: false })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return
      if (e.key === ' ') {
        e.preventDefault()
        swap()
      } else if (e.key === 'ArrowLeft') angle.current = Math.min(Math.PI - 0.12, angle.current + 0.05)
      else if (e.key === 'ArrowRight') angle.current = Math.max(0.12, angle.current - 0.05)
      else if (e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault()
        shoot()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="bs">
      <div className="bs-bar">
        <span>
          <b>{hud.score.toLocaleString('nl-NL')}</b> punten
        </span>
        <span>Level {hud.level}</span>
        <Button onClick={restart}>
          <FarmIcon name="arrow_refresh" /> Opnieuw
        </Button>
      </div>
      <div className="bs-stage">
        <canvas
          ref={canvas}
          className="bs-canvas"
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerMove={(e) => aimAt(e.clientX, e.clientY)}
          onPointerDown={(e) => {
            aimAt(e.clientX, e.clientY)
            // A finger: aim while down, shoot on lifting it
            if (e.pointerType === 'mouse') {
              if (e.button === 2) swap()
              else shoot()
            }
          }}
          onPointerUp={(e) => e.pointerType !== 'mouse' && shoot()}
          onContextMenu={(e) => e.preventDefault()}
          aria-label="Bellen schieten: richt met de muis en klik om te schieten"
        />
        {hud.cleared && (
          <div className="bs-overlay">
            <b>Level {hud.level} gehaald!</b>
            <span>+{(1000 * hud.level).toLocaleString('nl-NL')} bonus</span>
            <Button variant="cta" onClick={nextLevel}>
              Volgend level
            </Button>
          </div>
        )}
        {hud.over && (
          <div className="bs-overlay">
            <b>Game over</b>
            <span>{hud.score.toLocaleString('nl-NL')} punten, level {hud.level}</span>
            <Button variant="cta" onClick={restart}>
              Nog een keer
            </Button>
          </div>
        )}
      </div>
      <p className="muted bs-help">Richt met de muis en klik om te schieten (of pijltjes en Enter). Rechtsklik of spatie wisselt met de volgende bel. De gele puntjes: zoveel missers nog voordat het plafond zakt.</p>
    </div>
  )
}
