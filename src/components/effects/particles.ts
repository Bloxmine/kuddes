/**
 * The falling things of the festive effects, drawn on one canvas over the
 * page: snowflakes, tumbling leaves, petals, hearts, pepernoten and
 * butterflies, and now and then a bat. Cheap on
 * purpose: a few hundred shapes at most, paused when the tab is hidden.
 */

export type ParticleConfig = {
  /** Flakes per million screen pixels (a 1280×800 screen is about one million). */
  snow: number
  leaves: number
  /** Bats flying past, per minute. */
  batsPerMinute: number
  leafColors: string[]
  /** Autumn leaves, cherry blossom petals (smaller, rounder, floatier), hearts, pepernoten or butterflies. */
  leafShape?: 'leaf' | 'petal' | 'heart' | 'pepernoot' | 'butterfly'
}

type Flake = { x: number; y: number; r: number; vy: number; phase: number; sway: number; alpha: number }
type Leaf = { x: number; y: number; size: number; vy: number; phase: number; sway: number; rot: number; spin: number; color: string; flip: number }
type Bat = { x: number; y: number; vx: number; size: number; phase: number; baseY: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)

function drawPetal(ctx: CanvasRenderingContext2D, l: Leaf) {
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(l.rot)
  ctx.scale(Math.cos(l.flip) * 0.7 + 0.3, 1)
  const s = l.size * 0.7
  // A rounded petal with the little notch of a cherry blossom
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(s * 1.1, s * 0.5, s * 0.9, -s * 0.9, s * 0.2, -s)
  ctx.lineTo(0, -s * 0.7)
  ctx.lineTo(-s * 0.2, -s)
  ctx.bezierCurveTo(-s * 0.9, -s * 0.9, -s * 1.1, s * 0.5, 0, s)
  ctx.fillStyle = l.color
  ctx.fill()
  ctx.restore()
}

function drawHeart(ctx: CanvasRenderingContext2D, l: Leaf) {
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(Math.sin(l.rot) * 0.5)
  // Turning round as it falls
  ctx.scale(Math.cos(l.flip) * 0.6 + 0.4, 1)
  const s = l.size * 0.75
  ctx.beginPath()
  ctx.moveTo(0, s)
  ctx.bezierCurveTo(-s * 1.6, -s * 0.1, -s * 0.8, -s * 1.5, 0, -s * 0.6)
  ctx.bezierCurveTo(s * 0.8, -s * 1.5, s * 1.6, -s * 0.1, 0, s)
  ctx.fillStyle = l.color
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.45, -s * 0.55, s * 0.18, s * 0.28, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** A pepernoot: a little round biscuit, lighter on top, tumbling. */
function drawPepernoot(ctx: CanvasRenderingContext2D, l: Leaf) {
  const r = l.size * 0.45
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(l.rot)
  ctx.scale(1, Math.cos(l.flip) * 0.25 + 0.75)
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r)
  g.addColorStop(0, '#d9a066')
  g.addColorStop(1, l.color)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(70, 35, 10, 0.35)'
  for (const [dx, dy] of [[-0.3, 0.1], [0.25, -0.2], [0.1, 0.4], [-0.1, -0.45]]) {
    ctx.beginPath()
    ctx.arc(dx * r, dy * r, r * 0.09, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** A butterfly, flapping as it drifts. */
function drawButterfly(ctx: CanvasRenderingContext2D, l: Leaf) {
  const s = l.size * 0.8
  const flap = Math.abs(Math.cos(l.flip * 3)) * 0.8 + 0.2
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(Math.sin(l.rot) * 0.4)
  ctx.fillStyle = l.color
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.scale(side * flap, 1)
    ctx.beginPath()
    ctx.ellipse(s * 0.55, -s * 0.35, s * 0.6, s * 0.45, -0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(s * 0.45, s * 0.35, s * 0.4, s * 0.32, 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = 'rgba(40, 25, 15, 0.85)'
  ctx.beginPath()
  ctx.ellipse(0, 0, s * 0.1, s * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawLeaf(ctx: CanvasRenderingContext2D, l: Leaf) {
  ctx.save()
  ctx.translate(l.x, l.y)
  ctx.rotate(l.rot)
  // Tumbling: squash one way as it turns
  ctx.scale(Math.cos(l.flip) * 0.8 + 0.2, 1)
  const s = l.size
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.quadraticCurveTo(s * 0.9, -s * 0.3, 0, s)
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.3, 0, -s)
  ctx.fillStyle = l.color
  ctx.fill()
  ctx.strokeStyle = 'rgba(80, 40, 10, 0.45)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -s * 0.85)
  ctx.lineTo(0, s * 1.25)
  ctx.stroke()
  ctx.restore()
}

function drawBat(ctx: CanvasRenderingContext2D, b: Bat) {
  const s = b.size
  const flap = Math.sin(b.phase) * 0.6
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.fillStyle = 'rgba(25, 12, 30, 0.9)'
  for (const side of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(side * s * 0.6, -s * (0.6 + flap), side * s * 1.4, -s * flap * 0.8)
    ctx.quadraticCurveTo(side * s * 1.1, s * 0.15, side * s * 0.8, s * 0.1)
    ctx.quadraticCurveTo(side * s * 0.55, s * 0.35, side * s * 0.3, s * 0.1)
    ctx.quadraticCurveTo(side * s * 0.15, s * 0.3, 0, s * 0.15)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.ellipse(0, s * 0.05, s * 0.18, s * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Starts the animation on `canvas`; returns a function that stops it. */
export function startParticles(canvas: HTMLCanvasElement, config: ParticleConfig): () => void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return () => undefined
  let w = 0
  let h = 0
  let flakes: Flake[] = []
  let leaves: Leaf[] = []
  const bats: Bat[] = []
  let raf = 0
  let last = performance.now()
  let nextBat = last + rand(3000, 8000)

  const newFlake = (top: boolean): Flake => ({
    x: rand(0, w),
    y: top ? rand(-40, -5) : rand(0, h),
    r: rand(1, 3.4),
    vy: rand(18, 55),
    phase: rand(0, Math.PI * 2),
    sway: rand(8, 26),
    alpha: rand(0.55, 0.95),
  })
  const newLeaf = (top: boolean): Leaf => ({
    x: rand(0, w),
    y: top ? rand(-60, -10) : rand(0, h),
    size: rand(6, 12),
    vy: config.leafShape === 'butterfly' ? rand(8, 22) : config.leafShape === 'petal' || config.leafShape === 'heart' ? rand(18, 40) : rand(30, 70),
    phase: rand(0, Math.PI * 2),
    sway: config.leafShape === 'butterfly' ? rand(60, 140) : config.leafShape === 'petal' || config.leafShape === 'heart' ? rand(30, 80) : rand(20, 60),
    rot: rand(0, Math.PI * 2),
    spin: rand(-1.5, 1.5),
    color: config.leafColors[Math.floor(Math.random() * config.leafColors.length)],
    flip: rand(0, Math.PI * 2),
  })

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    w = window.innerWidth
    h = window.innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const area = (w * h) / 1_000_000
    const want = (n: number) => Math.min(300, Math.round(n * area))
    flakes = Array.from({ length: want(config.snow) }, () => newFlake(false))
    leaves = Array.from({ length: want(config.leaves) }, () => newLeaf(false))
  }

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, w, h)
    const t = now / 1000

    for (const f of flakes) {
      f.y += f.vy * dt
      const x = f.x + Math.sin(t * 0.8 + f.phase) * f.sway
      if (f.y > h + 5) Object.assign(f, newFlake(true))
      ctx.globalAlpha = f.alpha
      // A faint blue-grey edge, so flakes also show up against white boxes
      ctx.fillStyle = 'rgba(95, 130, 165, 0.45)'
      ctx.beginPath()
      ctx.arc(x, f.y, f.r + 0.9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x, f.y, f.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    for (const l of leaves) {
      l.y += l.vy * dt
      l.rot += l.spin * dt
      l.flip += dt * 2.2
      const drawn = { ...l, x: l.x + Math.sin(t * 0.9 + l.phase) * l.sway }
      if (l.y > h + 20) Object.assign(l, newLeaf(true))
      if (config.leafShape === 'petal') drawPetal(ctx, drawn)
      else if (config.leafShape === 'heart') drawHeart(ctx, drawn)
      else if (config.leafShape === 'pepernoot') drawPepernoot(ctx, drawn)
      else if (config.leafShape === 'butterfly') drawButterfly(ctx, drawn)
      else drawLeaf(ctx, drawn)
    }

    if (config.batsPerMinute > 0 && now > nextBat) {
      const fromLeft = Math.random() < 0.5
      const baseY = rand(h * 0.08, h * 0.45)
      bats.push({ x: fromLeft ? -40 : w + 40, y: baseY, baseY, vx: (fromLeft ? 1 : -1) * rand(140, 230), size: rand(12, 20), phase: 0 })
      nextBat = now + (60_000 / config.batsPerMinute) * rand(0.5, 1.5)
    }
    for (let i = bats.length - 1; i >= 0; i--) {
      const b = bats[i]
      b.x += b.vx * dt
      b.phase += dt * 16
      b.y = b.baseY + Math.sin(b.x / 60) * 18
      if (b.x < -60 || b.x > w + 60) bats.splice(i, 1)
      else drawBat(ctx, b)
    }
  }

  const onVisibility = () => {
    cancelAnimationFrame(raf)
    if (!document.hidden) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  resize()
  raf = requestAnimationFrame(frame)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)
    ctx.clearRect(0, 0, w, h)
  }
}
