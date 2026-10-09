import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { H, HEAD_LINE, POCKETS, R, W, aim, applyShot, canPlace, groupOf, targets, type Ball, type PoolState, type Shot } from '../../../shared/games/pool'
import type { TurnBoardProps } from './turnBoard'
import './NewGames.css'
import { ballColour } from './poolColours'
import { playBallClick, playCushion, playPocket } from './sounds'

/** The rails around the cloth, in table units. */
const RAIL = 5
const TOTAL_W = W + 2 * RAIL
const TOTAL_H = H + 2 * RAIL


function drawBall(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, s: number) {
  const r = R * s
  ctx.save()
  ctx.translate(x * s, y * s)
  // Shadow on the cloth
  ctx.fillStyle = 'rgba(0,0,0,0.3)'
  ctx.beginPath()
  ctx.ellipse(r * 0.25, r * 0.35, r, r * 0.9, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.clip()
  if (id > 8) {
    ctx.fillStyle = '#fbfbf5'
    ctx.fillRect(-r, -r, 2 * r, 2 * r)
    ctx.fillStyle = ballColour(id)
    ctx.fillRect(-r, -r * 0.55, 2 * r, r * 1.1)
  } else {
    ctx.fillStyle = ballColour(id)
    ctx.fillRect(-r, -r, 2 * r, 2 * r)
  }
  if (id > 0) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.font = `bold ${r * 0.62}px Verdana, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(id), 0, r * 0.04)
  }
  // Shine
  const shine = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, -r * 0.2, -r * 0.2, r * 1.2)
  shine.addColorStop(0, 'rgba(255,255,255,0.75)')
  shine.addColorStop(0.25, 'rgba(255,255,255,0.12)')
  shine.addColorStop(1, 'rgba(0,0,0,0.35)')
  ctx.fillStyle = shine
  ctx.fillRect(-r, -r, 2 * r, 2 * r)
  ctx.restore()
}

function drawTable(ctx: CanvasRenderingContext2D, s: number, kitchen: boolean) {
  const w = TOTAL_W * s
  const h = TOTAL_H * s
  // Wooden rails
  const wood = ctx.createLinearGradient(0, 0, 0, h)
  wood.addColorStop(0, '#6b3b17')
  wood.addColorStop(0.5, '#4a2710')
  wood.addColorStop(1, '#6b3b17')
  ctx.fillStyle = wood
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, RAIL * s * 0.8)
  ctx.fill()
  // Diamonds on the rails
  ctx.fillStyle = '#f2e3b5'
  for (let k = 1; k < 8; k++) {
    if (k === 4) continue
    for (const y of [RAIL * 0.45, TOTAL_H - RAIL * 0.45]) {
      ctx.beginPath()
      ctx.arc((RAIL + (W * k) / 8) * s, y * s, 0.35 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  for (let k = 1; k < 4; k++) {
    for (const x of [RAIL * 0.45, TOTAL_W - RAIL * 0.45]) {
      ctx.beginPath()
      ctx.arc(x * s, (RAIL + (H * k) / 4) * s, 0.35 * s, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.save()
  ctx.translate(RAIL * s, RAIL * s)
  // Cushions, a bit darker than the cloth
  ctx.fillStyle = '#0f6b3a'
  ctx.fillRect(-1.3 * s, -1.3 * s, (W + 2.6) * s, (H + 2.6) * s)
  const cloth = ctx.createRadialGradient((W / 2) * s, (H / 2) * s, 5 * s, (W / 2) * s, (H / 2) * s, W * 0.7 * s)
  cloth.addColorStop(0, '#1fa15a')
  cloth.addColorStop(1, '#137a42')
  ctx.fillStyle = cloth
  ctx.fillRect(0, 0, W * s, H * s)
  // Pockets
  for (const p of POCKETS) {
    ctx.fillStyle = '#0b0b0b'
    ctx.beginPath()
    ctx.arc(p.x * s, p.y * s, (p.r + 0.35) * s, 0, Math.PI * 2)
    ctx.fill()
  }
  // The kitchen line and the foot spot
  ctx.strokeStyle = kitchen ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'
  ctx.setLineDash([0.8 * s, 0.8 * s])
  ctx.lineWidth = 0.15 * s
  ctx.beginPath()
  ctx.moveTo(HEAD_LINE * s, 0)
  ctx.lineTo(HEAD_LINE * s, H * s)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** Less than this is letting go without shooting. */
const MIN_POWER = 0.03

type Anim = { balls: Ball[]; frames: number[][]; frame: number; events: { t: number; kind: string; strength: number }[] }

/**
 * Pool on a canvas: move the pointer to aim, then press on the table, drag
 * away to pull the cue back (further is harder) and let go to shoot; let go
 * where you started, or press Escape, to cancel. With the cue ball in hand you
 * first click where it goes. Every shot (yours and theirs) plays out, with sounds.
 */
export function PoolTable({ state, my, myTurn, onMove, finished }: TurnBoardProps<PoolState, Shot>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(6)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  /** Pulling the cue back: where you pressed (on screen), and the aim from then. */
  const [drag, setDrag] = useState<{ sx: number; sy: number; aim: { x: number; y: number } } | null>(null)
  const [placed, setPlaced] = useState<[number, number] | null>(null)
  const [power, setPower] = useState(0)
  const [spin, setSpin] = useState(0)
  const [anim, setAnim] = useState<Anim | null>(null)
  const prev = useRef(state)

  const canShoot = myTurn && !finished && !state.over && !anim
  const needsPlace = canShoot && state.inHand && !placed
  const cueBall = state.balls.find((b) => b.id === 0)!
  const cuePos = placed ? { x: placed[0], y: placed[1] } : cueBall.potted ? null : { x: cueBall.x, y: cueBall.y }
  const cueX = cuePos?.x
  const cueY = cuePos?.y
  const aimAt = drag?.aim ?? pointer

  // Fit the canvas to the box
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const fit = () => setScale(Math.max(2.4, el.clientWidth / TOTAL_W))
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // A new shot: play it out from the table before it
  useEffect(() => {
    const before = prev.current
    prev.current = state
    setPlaced(null)
    setDrag(null)
    setPower(0)
    if (state.moves.length !== before.moves.length + 1 || document.documentElement.hasAttribute('data-reduce-motion')) {
      setAnim(null)
      return
    }
    const shot = state.moves[state.moves.length - 1]
    const r = applyShot(before, shot, true)
    const start = before.balls.map((b) => (b.id === 0 && shot.at ? { ...b, x: shot.at[0], y: shot.at[1], potted: false } : b))
    setAnim({ balls: start, frames: r.sim.frames, frame: 0, events: r.sim.events })
  }, [state])

  // Run the animation at 60 frames a second, with the sounds
  useEffect(() => {
    if (!anim) return
    let raf = 0
    const t0 = performance.now()
    let played = 0
    const tick = (now: number) => {
      // The frame's timestamp can be a little before t0
      const frame = Math.max(0, Math.min(anim.frames.length - 1, Math.floor(((now - t0) / 1000) * 60)))
      while (played < anim.events.length && anim.events[played].t <= frame) {
        const e = anim.events[played++]
        if (e.kind === 'bal') playBallClick(e.strength)
        else if (e.kind === 'band') playCushion(e.strength)
        else playPocket(e.strength)
      }
      setAnim((a) => (a ? { ...a, frame } : a))
      if (frame < anim.frames.length - 1) raf = requestAnimationFrame(tick)
      else window.setTimeout(() => setAnim(null), 250)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shot
  }, [anim?.frames])

  const draw = useCallback(() => {
    const c = canvas.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const s = scale
    c.width = Math.round(TOTAL_W * s * dpr)
    c.height = Math.round(TOTAL_H * s * dpr)
    c.style.width = `${TOTAL_W * s}px`
    c.style.height = `${TOTAL_H * s}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawTable(ctx, s, state.breakShot && state.inHand)
    ctx.translate(RAIL * s, RAIL * s)

    // The balls: from the animation, or where they lie
    if (anim) {
      const f = anim.frames[anim.frame]
      anim.balls.forEach((b, i) => {
        const x = f[2 * i]
        const y = f[2 * i + 1]
        if (!Number.isNaN(x)) drawBall(ctx, b.id, x, y, s)
      })
      return
    }
    for (const b of state.balls) {
      if (b.potted || (b.id === 0 && (placed || cueBall.potted))) continue
      drawBall(ctx, b.id, b.x, b.y, s)
    }
    if (!canShoot) return

    // Placing the cue ball: a see-through one where it would go
    if (needsPlace) {
      if (pointer) {
        const ok = canPlace(state, pointer.x, pointer.y)
        ctx.globalAlpha = ok ? 0.75 : 0.35
        drawBall(ctx, 0, pointer.x, pointer.y, s)
        ctx.globalAlpha = 1
        if (!ok) {
          ctx.strokeStyle = '#ff5a5a'
          ctx.lineWidth = 0.25 * s
          ctx.beginPath()
          ctx.arc(pointer.x * s, pointer.y * s, R * s, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      return
    }
    if (placed) drawBall(ctx, 0, placed[0], placed[1], s)
    if (cueX === undefined || cueY === undefined || !aimAt) return
    const cuePos = { x: cueX, y: cueY }
    let dx = aimAt.x - cuePos.x
    let dy = aimAt.y - cuePos.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.01) return
    dx /= len
    dy /= len
    // The line to where the cue ball touches, the ghost ball and where the object ball goes
    const hit = aim(state, cuePos, dx, dy)
    const legal = !hit.ball || targets(state).includes(hit.ball.id)
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 0.15 * s
    ctx.setLineDash([0.6 * s, 0.5 * s])
    ctx.beginPath()
    ctx.moveTo(cuePos.x * s, cuePos.y * s)
    ctx.lineTo(hit.x * s, hit.y * s)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.strokeStyle = legal ? 'rgba(255,255,255,0.9)' : 'rgba(255,90,90,0.95)'
    ctx.lineWidth = 0.18 * s
    ctx.beginPath()
    ctx.arc(hit.x * s, hit.y * s, R * s, 0, Math.PI * 2)
    ctx.stroke()
    if (hit.ball && hit.bx !== undefined && hit.by !== undefined) {
      const ox = hit.bx - hit.x
      const oy = hit.by - hit.y
      const ol = Math.sqrt(ox * ox + oy * oy)
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      ctx.moveTo(hit.bx * s, hit.by * s)
      ctx.lineTo((hit.bx + (ox / ol) * 12) * s, (hit.by + (oy / ol) * 12) * s)
      ctx.stroke()
    }
    // The cue, pulled back with the power
    const pull = R + 0.5 + power * 10
    const tipX = cuePos.x - dx * pull
    const tipY = cuePos.y - dy * pull
    const buttX = tipX - dx * 42
    const buttY = tipY - dy * 42
    const cue = ctx.createLinearGradient(tipX * s, tipY * s, buttX * s, buttY * s)
    cue.addColorStop(0, '#dfe8f2')
    cue.addColorStop(0.03, '#f3dfb0')
    cue.addColorStop(0.7, '#c28a4c')
    cue.addColorStop(1, '#3a200c')
    ctx.strokeStyle = cue
    ctx.lineCap = 'round'
    ctx.lineWidth = 0.8 * s
    ctx.beginPath()
    ctx.moveTo(tipX * s, tipY * s)
    ctx.lineTo(buttX * s, buttY * s)
    ctx.stroke()
  }, [scale, state, anim, placed, pointer, aimAt, power, canShoot, needsPlace, cueX, cueY, cueBall.potted])

  useEffect(draw, [draw])

  const toTable = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale - RAIL, y: (e.clientY - rect.top) / scale - RAIL }
  }

  const shoot = (at: { x: number; y: number }, p: number) => {
    if (!canShoot || !cuePos) return
    const dx = at.x - cuePos.x
    const dy = at.y - cuePos.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 0.01) return
    onMove({ d: [dx / len, dy / len], p: Math.min(1, p), s: spin, ...(placed && { at: placed }) })
  }

  /** How far to drag (in screen pixels) for full power. */
  const fullPull = () => Math.max(120, Math.min(260, (canvas.current?.clientWidth ?? 600) * 0.32))
  const cancelDrag = () => {
    setDrag(null)
    setPower(0)
  }

  // Escape lets go of the cue without shooting
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelDrag()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  const hint = !canShoot
    ? null
    : needsPlace
      ? state.breakShot
        ? 'Leg de witte bal neer achter de streep (links) en stoot af.'
        : 'Je hebt de witte bal in de hand: klik waar je hem neerlegt.'
      : drag
        ? power < MIN_POWER
          ? 'Sleep weg van waar je drukte om kracht op te bouwen. Loslaten hier (of Esc) is niet stoten.'
          : 'Laat los om te stoten!'
        : 'Mik, druk dan op de tafel, sleep weg om kracht op te bouwen en laat los om te stoten.'

  return (
    <div className="pl-wrap">
      <div className="pl-table" ref={wrap}>
        <canvas
          ref={canvas}
          className={canShoot ? 'aiming' : undefined}
          onPointerMove={(e) => {
            if (!canShoot) return
            if (drag) setPower(Math.min(1, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) / fullPull()))
            else setPointer(toTable(e))
          }}
          onPointerLeave={() => !drag && setPointer(null)}
          onPointerDown={(e) => {
            if (!canShoot || e.button !== 0) return
            const p = toTable(e)
            if (needsPlace) {
              if (canPlace(state, p.x, p.y)) setPlaced([p.x, p.y])
              return
            }
            // Where you press is where you aim (on a phone, that's the only way to aim)
            e.currentTarget.setPointerCapture(e.pointerId)
            setPointer(p)
            setDrag({ sx: e.clientX, sy: e.clientY, aim: p })
            setPower(0)
          }}
          onPointerUp={() => {
            if (!drag) return
            const p = power
            cancelDrag()
            if (p >= MIN_POWER) shoot(drag.aim, p)
          }}
          onPointerCancel={cancelDrag}
          aria-label="Pooltafel"
        />
      </div>
      {canShoot && (
        <div className="pl-controls">
          <p className="pl-hint">{hint}</p>
          {!needsPlace && (
            <>
              <div className="pl-slider">
                <span>Kracht</span>
                <span className={power > 0.8 ? 'pl-power hard' : 'pl-power'} role="meter" aria-valuenow={Math.round(power * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Kracht">
                  <span style={{ width: `${Math.round(power * 100)}%` }} />
                </span>
                <b>{Math.round(power * 100)}%</b>
              </div>
              <label className="pl-slider">
                <span>Effect</span>
                <input type="range" min={-100} max={100} step={10} value={Math.round(spin * 100)} onChange={(e) => setSpin(Number(e.target.value) / 100)} />
                <b>{spin > 0 ? 'Doorstoot' : spin < 0 ? 'Trekstoot' : 'Geen'}</b>
              </label>
              {placed && (
                <button type="button" className="link-button" onClick={() => setPlaced(null)}>
                  Witte bal verleggen
                </button>
              )}
            </>
          )}
        </div>
      )}
      <PoolRack state={state} my={my} />
    </div>
  )
}

/** Under the table: each player's group and the balls they potted. */
function PoolRack({ state, my }: { state: PoolState; my: 0 | 1 }) {
  const row = (p: 0 | 1) => {
    const g = state.groups[p]
    return (
      <div className="pl-rack-row">
        <span className="pl-rack-who">
          {p === my ? 'Jij' : 'Tegenstander'}
          {state.variant === 8 && <em>{g ? (g === 'vol' ? ' · volle (1–7)' : ' · halve (9–15)') : state.breakShot ? '' : ' · tafel nog open'}</em>}
        </span>
        <span className="pl-rack-balls">
          {state.pottedBy[p].map((id) => (
            <span key={id} className={`pl-mini ${id > 8 ? 'stripe' : ''}`} style={{ '--b': ballColour(id) } as CSSProperties} title={`Bal ${id}`}>
              {id}
            </span>
          ))}
        </span>
      </div>
    )
  }
  const left = state.balls.filter((b) => !b.potted && b.id !== 0).map((b) => b.id)
  return (
    <div className="pl-rack">
      {row(my)}
      {row(my === 0 ? 1 : 0)}
      {state.variant === 9 && <p className="muted">Nog op tafel: {left.join(', ')} · raak eerst de {Math.min(...left)}</p>}
      {state.variant === 8 && state.groups[my] && <p className="muted">{left.some((id) => groupOf(id) === state.groups[my]) ? 'Pot je eigen ballen, en daarna de 8.' : 'Al je ballen zijn weg: pot nu de 8!'}</p>}
    </div>
  )
}
