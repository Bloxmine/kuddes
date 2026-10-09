/**
 * Pool: 8-ball (and 9-ball), with our own physics. Players send each other
 * only the shot (direction, power, spin, and where they put the cue ball when
 * they have it in hand); both browsers and the server run the same
 * simulation, and the server replays the whole game before a result counts.
 *
 * For that to give the same table everywhere, the simulation uses only
 * +, −, ×, ÷ and √ (exact in IEEE doubles on every engine; no sin, cos or
 * Math.hypot), a fixed time step and a fixed order of collisions.
 *
 * The table is 100 × 50 units; x runs along the length, y across. The cue
 * ball starts in the left quarter ("the kitchen"), the rack on the right.
 */

export type Player = 0 | 1
export type Variant = 8 | 9
export type Group = 'vol' | 'half'

/** A ball: 0 is the cue ball, 1–15 the numbered balls (1–7 solid, 8 black, 9–15 striped). */
export type Ball = { id: number; x: number; y: number; potted: boolean }

/** A shot: direction (about unit length), power 0–1, spin −1 (draw) to 1 (follow), and where the cue ball goes when it's in hand. */
export type Shot = { d: [number, number]; p: number; s: number; at?: [number, number] }

export type PoolState = {
  variant: Variant
  balls: Ball[]
  turn: Player
  /** The next shot is the break. */
  breakShot: boolean
  /** The player to shoot may place the cue ball (after a foul: anywhere; on the break: in the kitchen). */
  inHand: boolean
  /** 8-ball: who has the solids and who the stripes (null while the table is open). */
  groups: [Group | null, Group | null]
  /** Balls each player potted legally, for the score. */
  pottedBy: [number[], number[]]
  over: boolean
  winner: Player | null
  /** What happened on the last shot, for the message. */
  last: ShotSummary | null
  moves: Shot[]
}

export type ShotSummary = {
  by: Player
  potted: number[]
  foul: Foul | null
  /** The shooter may go again. */
  again: boolean
  /** 8-ball: the groups were decided on this shot. */
  assigned: boolean
  /** A ball was put back on the spot (the 8 on the break, the 9 on a foul). */
  respotted: number | null
}

export type Foul = 'wit' | 'mis' | 'verkeerd' | 'buiten'

// ------------------------------------------------------------ the table

export const W = 100
export const H = 50
export const R = 1.15
/** The cushions stop this far from a corner (the corner pocket's mouth)… */
const CORNER_MOUTH = 3.5
/** …and this far either side of the middle of a long side. */
const SIDE_MOUTH = 2.3
/** The pockets: a ball whose centre comes this close to one drops. */
export const POCKETS: { x: number; y: number; r: number }[] = [
  { x: 0.4, y: 0.4, r: 2.5 },
  { x: W / 2, y: -0.9, r: 1.95 },
  { x: W - 0.4, y: 0.4, r: 2.5 },
  { x: 0.4, y: H - 0.4, r: 2.5 },
  { x: W / 2, y: H + 0.9, r: 1.95 },
  { x: W - 0.4, y: H - 0.4, r: 2.5 },
]
/** The ends of the cushions at the pockets (the "knuckles"), which balls bounce off. */
const KNUCKLES: [number, number][] = [
  [CORNER_MOUTH, 0],
  [W / 2 - SIDE_MOUTH, 0],
  [W / 2 + SIDE_MOUTH, 0],
  [W - CORNER_MOUTH, 0],
  [CORNER_MOUTH, H],
  [W / 2 - SIDE_MOUTH, H],
  [W / 2 + SIDE_MOUTH, H],
  [W - CORNER_MOUTH, H],
  [0, CORNER_MOUTH],
  [0, H - CORNER_MOUTH],
  [W, CORNER_MOUTH],
  [W, H - CORNER_MOUTH],
]
/** Where the rack's apex (and a ball put back) goes, and the kitchen line. */
export const FOOT_SPOT = { x: W * 0.72, y: H / 2 }
export const HEAD_LINE = W * 0.25

/** Top speed (units per second) at full power; the break gets a bit more. */
export const MAX_SPEED = 230
const BREAK_BOOST = 1.4
const FRICTION = 24
const BALL_RESTITUTION = 0.95
const CUSHION_RESTITUTION = 0.78
const DT = 1 / 500
/** Positions are recorded every this many steps for the animation (60 per second). */
const FRAME_EVERY = 8
const MAX_STEPS = 500 * 40

const SQRT3 = 1.7320508075688772

// ---------------------------------------------------------------- racks

function rack(variant: Variant): Ball[] {
  const rows = variant === 8 ? [[1], [10, 2], [3, 8, 11], [12, 4, 13, 5], [6, 9, 7, 15, 14]] : [[1], [2, 3], [4, 9, 5], [6, 7], [8]]
  const gap = 2 * R * 1.002
  const balls: Ball[] = [{ id: 0, x: HEAD_LINE, y: H / 2, potted: false }]
  rows.forEach((row, k) => {
    // The 9-ball diamond narrows again after the middle row
    const width = row.length
    row.forEach((id, j) => {
      balls.push({ id, x: FOOT_SPOT.x + (k * gap * SQRT3) / 2, y: H / 2 + (j - (width - 1) / 2) * gap, potted: false })
    })
  })
  return balls.sort((a, b) => a.id - b.id)
}

export function initialState(first: Player, variant: Variant): PoolState {
  return { variant, balls: rack(variant), turn: first, breakShot: true, inHand: true, groups: [null, null], pottedBy: [[], []], over: false, winner: null, last: null, moves: [] }
}

export const groupOf = (id: number): Group | null => (id >= 1 && id <= 7 ? 'vol' : id >= 9 && id <= 15 ? 'half' : null)
const other = (p: Player): Player => (p === 0 ? 1 : 0)
const onTable = (s: PoolState) => s.balls.filter((b) => !b.potted && b.id !== 0)

/** Whether the cue ball may be put at (x, y): on the cloth, not on a ball, and in the kitchen for the break. */
export function canPlace(s: PoolState, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  if (x < R || x > W - R || y < R || y > H - R) return false
  if (s.breakShot && x > HEAD_LINE) return false
  return s.balls.every((b) => b.id === 0 || b.potted || (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) > 4 * R * R * 1.0001)
}

/** The balls the shooter must hit first, for the aiming help and the rules. */
export function targets(s: PoolState, p: Player = s.turn): number[] {
  const left = onTable(s)
  if (s.variant === 9) {
    const lowest = Math.min(...left.map((b) => b.id))
    return left.filter((b) => b.id === lowest).map((b) => b.id)
  }
  const g = s.groups[p]
  if (s.breakShot) return left.map((b) => b.id)
  // Open table: anything but the 8 (unless the others all went down on fouls)
  if (!g) return (left.some((b) => b.id !== 8) ? left.filter((b) => b.id !== 8) : left).map((b) => b.id)
  const mine = left.filter((b) => groupOf(b.id) === g)
  return mine.length ? mine.map((b) => b.id) : left.filter((b) => b.id === 8).map((b) => b.id)
}

// ------------------------------------------------------------- physics

/** Something that happened during a shot: for the sounds. `t` is the frame. */
export type SimEvent = { t: number; kind: 'bal' | 'band' | 'pot'; strength: number; ball?: number }

export type SimResult = {
  balls: Ball[]
  /** The first ball the cue ball touched. */
  firstHit: number | null
  /** Pocketed balls, in order (0 = the cue ball). */
  potted: number[]
  /** Positions per frame: [x, y] per ball in `balls` order, NaN once potted. */
  frames: number[][]
  events: SimEvent[]
}

/**
 * Plays a shot from these balls. With `record`, also the positions for the
 * animation. Everything that could differ between engines is left out.
 */
export function simulate(start: Ball[], shot: { dx: number; dy: number; speed: number; spin: number }, record = false): SimResult {
  const n = start.length
  const x = start.map((b) => b.x)
  const y = start.map((b) => b.y)
  const vx = new Array<number>(n).fill(0)
  const vy = new Array<number>(n).fill(0)
  const gone = start.map((b) => b.potted)
  const cue = start.findIndex((b) => b.id === 0)
  vx[cue] = shot.dx * shot.speed
  vy[cue] = shot.dy * shot.speed
  let firstHit: number | null = null
  let spinPending = shot.spin !== 0
  const potted: number[] = []
  const frames: number[][] = []
  const events: SimEvent[] = []
  const frameNo = (step: number) => Math.floor(step / FRAME_EVERY)
  const snap = () => {
    const f: number[] = []
    for (let i = 0; i < n; i++) f.push(gone[i] ? NaN : x[i], gone[i] ? NaN : y[i])
    frames.push(f)
  }
  if (record) snap()

  let step = 0
  for (; step < MAX_STEPS; step++) {
    let moving = false
    // Move and slow down
    for (let i = 0; i < n; i++) {
      if (gone[i] || (vx[i] === 0 && vy[i] === 0)) continue
      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
      const slowed = speed - FRICTION * DT
      if (slowed <= 0.4) {
        vx[i] = 0
        vy[i] = 0
        continue
      }
      moving = true
      const k = slowed / speed
      vx[i] *= k
      vy[i] *= k
      x[i] += vx[i] * DT
      y[i] += vy[i] * DT
    }
    if (!moving) break

    // Balls against balls, in a fixed order; a few passes, so a hit travels through a tight rack at once
    for (let pass = 0, again = true; again && pass < 8; pass++) {
      again = false
      for (let i = 0; i < n; i++) {
        if (gone[i]) continue
        for (let j = i + 1; j < n; j++) {
          if (gone[j]) continue
          const dx = x[j] - x[i]
          const dy = y[j] - y[i]
          const d2 = dx * dx + dy * dy
          if (d2 >= 4 * R * R || d2 === 0) continue
          const d = Math.sqrt(d2)
          const nx = dx / d
          const ny = dy / d
          const approach = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny
          // Pull them apart
          const push = (2 * R - d) / 2
          x[i] -= nx * push
          y[i] -= ny * push
          x[j] += nx * push
          y[j] += ny * push
          if (approach <= 0) continue
          const isCue = i === cue || j === cue
          const cueSpeed = isCue ? Math.sqrt(vx[cue] * vx[cue] + vy[cue] * vy[cue]) : 0
          const cueDirX = isCue && cueSpeed > 0 ? vx[cue] / cueSpeed : 0
          const cueDirY = isCue && cueSpeed > 0 ? vy[cue] / cueSpeed : 0
          const impulse = (approach * (1 + BALL_RESTITUTION)) / 2
          vx[i] -= impulse * nx
          vy[i] -= impulse * ny
          vx[j] += impulse * nx
          vy[j] += impulse * ny
          if (isCue && firstHit === null) firstHit = start[i === cue ? j : i].id
          // Follow or draw: after its first hit the cue ball runs on or comes back
          if (isCue && spinPending) {
            spinPending = false
            const extra = shot.spin * 0.6 * cueSpeed
            vx[cue] += cueDirX * extra
            vy[cue] += cueDirY * extra
          }
          events.push({ t: frameNo(step), kind: 'bal', strength: Math.min(1, approach / MAX_SPEED) })
          again = true
        }
      }
    }

    // Cushions and pockets
    for (let i = 0; i < n; i++) {
      if (gone[i]) continue
      let bounced = 0
      // Along the long sides the cushion is there except at the three mouths
      const onLong = x[i] > CORNER_MOUTH && x[i] < W - CORNER_MOUTH && (x[i] < W / 2 - SIDE_MOUTH || x[i] > W / 2 + SIDE_MOUTH)
      const onShort = y[i] > CORNER_MOUTH && y[i] < H - CORNER_MOUTH
      if (onLong && y[i] < R && vy[i] < 0) {
        y[i] = 2 * R - y[i]
        bounced = -vy[i]
        vy[i] = -vy[i] * CUSHION_RESTITUTION
        vx[i] *= 0.97
      } else if (onLong && y[i] > H - R && vy[i] > 0) {
        y[i] = 2 * (H - R) - y[i]
        bounced = vy[i]
        vy[i] = -vy[i] * CUSHION_RESTITUTION
        vx[i] *= 0.97
      }
      if (onShort && x[i] < R && vx[i] < 0) {
        x[i] = 2 * R - x[i]
        bounced = -vx[i]
        vx[i] = -vx[i] * CUSHION_RESTITUTION
        vy[i] *= 0.97
      } else if (onShort && x[i] > W - R && vx[i] > 0) {
        x[i] = 2 * (W - R) - x[i]
        bounced = vx[i]
        vx[i] = -vx[i] * CUSHION_RESTITUTION
        vy[i] *= 0.97
      }
      // The knuckles at the pockets
      for (const [kx, ky] of KNUCKLES) {
        const dx = x[i] - kx
        const dy = y[i] - ky
        const d2 = dx * dx + dy * dy
        if (d2 >= R * R || d2 === 0) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        const vn = vx[i] * nx + vy[i] * ny
        x[i] = kx + nx * R
        y[i] = ky + ny * R
        if (vn < 0) {
          vx[i] -= (1 + CUSHION_RESTITUTION) * vn * nx
          vy[i] -= (1 + CUSHION_RESTITUTION) * vn * ny
          bounced = -vn
        }
      }
      if (bounced > 0) events.push({ t: frameNo(step), kind: 'band', strength: Math.min(1, bounced / MAX_SPEED) })
      // In a pocket, or (through a mouth) off the table altogether
      const out = x[i] < -R || x[i] > W + R || y[i] < -R || y[i] > H + R
      if (out || POCKETS.some((p) => (x[i] - p.x) * (x[i] - p.x) + (y[i] - p.y) * (y[i] - p.y) < p.r * p.r)) {
        const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
        gone[i] = true
        vx[i] = 0
        vy[i] = 0
        potted.push(start[i].id)
        events.push({ t: frameNo(step), kind: 'pot', strength: Math.min(1, speed / MAX_SPEED + 0.3), ball: start[i].id })
      }
    }
    if (record && step % FRAME_EVERY === FRAME_EVERY - 1) snap()
  }
  if (record) snap()
  return { balls: start.map((b, i) => ({ id: b.id, x: x[i], y: y[i], potted: gone[i] })), firstHit, potted, frames, events }
}

// --------------------------------------------------------------- rules

/** The direction as a unit vector, or null when it isn't a real direction. */
function unit(d: unknown): [number, number] | null {
  if (!Array.isArray(d) || d.length !== 2 || !d.every((v) => typeof v === 'number' && Number.isFinite(v))) return null
  const len = Math.sqrt(d[0] * d[0] + d[1] * d[1])
  if (len < 0.5 || len > 1.5) return null
  return [d[0] / len, d[1] / len]
}

export function isValidShot(s: PoolState, shot: unknown): shot is Shot {
  if (s.over || !shot || typeof shot !== 'object') return false
  const t = shot as Partial<Shot>
  if (!unit(t.d) || typeof t.p !== 'number' || !(t.p >= 0.03 && t.p <= 1) || typeof t.s !== 'number' || !(t.s >= -1 && t.s <= 1)) return false
  const cue = s.balls.find((b) => b.id === 0)!
  if (t.at !== undefined) {
    if (!s.inHand || !Array.isArray(t.at) || t.at.length !== 2 || !canPlace(s, t.at[0], t.at[1])) return false
  } else if (cue.potted || (s.breakShot && cue.x > HEAD_LINE)) return false
  return true
}

/** Puts a ball back on the foot spot, or behind it along the middle line when that's taken. */
function respot(balls: Ball[], id: number) {
  const ball = balls.find((b) => b.id === id)!
  let x = FOOT_SPOT.x
  const free = (px: number) => balls.every((b) => b.id === id || b.potted || (b.x - px) * (b.x - px) + (b.y - FOOT_SPOT.y) * (b.y - FOOT_SPOT.y) > 4 * R * R)
  while (!free(x) && x < W - R) x += 2 * R * 1.01
  ball.x = x
  ball.y = FOOT_SPOT.y
  ball.potted = false
}

export type ShotResult = { state: PoolState; sim: SimResult; summary: ShotSummary }

export function applyShot(s: PoolState, shot: Shot, record = false): ShotResult {
  if (!isValidShot(s, shot)) throw new Error('Ongeldige stoot')
  const [dx, dy] = unit(shot.d)!
  const balls = s.balls.map((b) => ({ ...b }))
  const cue = balls.find((b) => b.id === 0)!
  if (shot.at) {
    cue.x = shot.at[0]
    cue.y = shot.at[1]
    cue.potted = false
  }
  const before = onTable(s)
  const sim = simulate(balls, { dx, dy, speed: shot.p * MAX_SPEED * (s.breakShot ? BREAK_BOOST : 1), spin: shot.s }, record)
  const next: PoolState = { ...s, balls: sim.balls, groups: [...s.groups], pottedBy: [[...s.pottedBy[0]], [...s.pottedBy[1]]], moves: [...s.moves, shot], breakShot: false, inHand: false }
  const me = s.turn
  const potted = sim.potted.filter((id) => id !== 0)
  const cueIn = sim.potted.includes(0)
  const must = targets(s)

  let foul: Foul | null = null
  if (cueIn) foul = 'wit'
  else if (sim.firstHit === null) foul = 'mis'
  else if (!s.breakShot && !must.includes(sim.firstHit)) foul = 'verkeerd'
  else if (s.variant === 9 && s.breakShot && sim.firstHit !== must[0]) foul = 'verkeerd'

  let again = false
  let assigned = false
  let respotted: number | null = null

  if (s.variant === 9) {
    if (potted.includes(9) && !foul) {
      next.over = true
      next.winner = me
    } else if (potted.includes(9)) {
      respot(next.balls, 9)
      respotted = 9
    }
    if (!foul) next.pottedBy[me].push(...potted.filter((id) => id !== respotted))
    again = !foul && potted.length > 0
  } else {
    const myGroup = s.groups[me]
    // Only the 8 left to play: your group is gone, or everything else went down while the table was open
    const clearedBefore = myGroup ? !before.some((b) => groupOf(b.id) === myGroup) : !s.breakShot && before.every((b) => b.id === 8)
    if (potted.includes(8)) {
      if (s.breakShot) {
        respot(next.balls, 8)
        respotted = 8
      } else {
        next.over = true
        next.winner = !foul && clearedBefore ? me : other(me)
      }
    }
    // The first ball potted after the break decides who has which group
    if (!next.over && !s.breakShot && !myGroup && !foul) {
      const firstGroup = potted.map(groupOf).find((g) => g)
      if (firstGroup) {
        next.groups[me] = firstGroup
        next.groups[other(me)] = firstGroup === 'vol' ? 'half' : 'vol'
        assigned = true
      }
    }
    // Everyone gets the balls of their own group
    for (const id of potted) {
      const g = groupOf(id)
      const owner = next.groups[0] === g ? 0 : next.groups[1] === g ? 1 : null
      if (owner !== null) next.pottedBy[owner].push(id)
      else if (g && !foul) next.pottedBy[me].push(id)
    }
    const mine = next.groups[me]
    again = !foul && !next.over && (s.breakShot ? potted.some((id) => id !== 8) : mine ? potted.some((id) => groupOf(id) === mine) : false)
  }

  if (foul && !next.over) next.inHand = true
  // A potted cue ball comes back in the next player's hand
  if (cueIn) {
    const c = next.balls.find((b) => b.id === 0)!
    c.potted = true
  }
  next.turn = next.over || again ? me : other(me)
  const summary: ShotSummary = { by: me, potted, foul, again, assigned, respotted }
  next.last = summary
  return { state: next, sim, summary }
}

export type GameHighlights = { potted: number; bestRun: number; breakAndRun: number }

/** Plays a list of shots from the start. Throws on the first shot that can't be. */
export function replay(shots: Shot[], first: Player, variant: Variant): { state: PoolState; highlights: Record<Player, GameHighlights> } {
  let state = initialState(first, variant)
  const highlights: Record<Player, GameHighlights> = { 0: { potted: 0, bestRun: 0, breakAndRun: 0 }, 1: { potted: 0, bestRun: 0, breakAndRun: 0 } }
  let run = 0
  let runner: Player | null = null
  // Who broke, and whether they never gave the table away
  let breaker: Player | null = null
  let breakerOnly = true
  for (const shot of shots) {
    const me = state.turn
    if (breaker === null) breaker = me
    else if (me !== breaker) breakerOnly = false
    const r = applyShot(state, shot)
    const legal = r.summary.foul ? 0 : r.summary.potted.length
    highlights[me].potted += legal
    run = runner === me ? run + legal : legal
    runner = me
    highlights[me].bestRun = Math.max(highlights[me].bestRun, run)
    if (!r.summary.again) run = 0
    state = r.state
  }
  if (state.over && state.winner !== null && state.winner === breaker && breakerOnly) highlights[breaker].breakAndRun = 1
  return { state, highlights }
}

/** Where the cue ball would first touch a ball going this way (for the aiming line). */
export function aim(s: PoolState, from: { x: number; y: number }, dx: number, dy: number): { x: number; y: number; ball: Ball | null; bx?: number; by?: number } {
  let best = Infinity
  let hit: Ball | null = null
  for (const b of s.balls) {
    if (b.potted || b.id === 0) continue
    // Distance along the line where the two balls touch
    const fx = b.x - from.x
    const fy = b.y - from.y
    const along = fx * dx + fy * dy
    if (along <= 0) continue
    const side2 = fx * fx + fy * fy - along * along
    if (side2 >= 4 * R * R) continue
    const t = along - Math.sqrt(4 * R * R - side2)
    if (t < best) {
      best = t
      hit = b
    }
  }
  // Otherwise the cushion
  const wall = Math.min(dx > 0 ? (W - R - from.x) / dx : dx < 0 ? (R - from.x) / dx : Infinity, dy > 0 ? (H - R - from.y) / dy : dy < 0 ? (R - from.y) / dy : Infinity)
  const t = Math.min(best, wall)
  return { x: from.x + dx * t, y: from.y + dy * t, ball: t === best ? hit : null, bx: hit?.x, by: hit?.y }
}
