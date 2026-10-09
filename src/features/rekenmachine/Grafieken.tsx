import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { remember } from '../office/officeFile'
import { compile, derivative, fmt, integral, intersections, solve, specials, type Special } from './graph'
import { pointIn } from '../../lib/pointer'
import { drawGraph, GRAPH_COLORS, standardView, type View } from './graphDraw'

type Line = { id: string; src: string; color: string; on: boolean }
type Probe = { px: number; py: number }
type Tab = 'punten' | 'tabel' | 'berekenen' | 'venster'

const KEY = 'kuddes.rekenmachine.grafieken'
const MAX_LINES = 8
const COLORS = GRAPH_COLORS
const KINDS: Record<Special['kind'], string> = {
  nulpunt: 'Nulpunt',
  maximum: 'Maximum',
  minimum: 'Minimum',
  snijpunt: 'Snijpunt',
  'y-as': 'Snijpunt met de y-as',
}
const KEYPAD = ['x', '²', '^', '√(', 'π', '(', ')', 'sin(', 'cos(', 'tan(', 'ln(', 'log(', 'abs(', 'a']

const newId = () => crypto.randomUUID().slice(0, 8)
const sub = (n: number) => [...String(n)].map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('')
const point = (x: number, y: number) => `(${fmt(x)}; ${fmt(y)})`

function load(initial?: string[]): { lines: Line[]; params: Record<string, number>; degrees: boolean } {
  // Opened from a link (a profile's graph): those functions, without touching the saved ones
  if (initial?.length)
    return { lines: initial.slice(0, MAX_LINES).map((src, i) => ({ id: newId(), src: src.slice(0, 200), color: COLORS[i % COLORS.length], on: true })), params: {}, degrees: false }
  const fallback = {
    lines: [
      { id: newId(), src: 'x^2 - 2', color: COLORS[0], on: true },
      { id: newId(), src: '2sin(x)', color: COLORS[1], on: true },
    ],
    params: {},
    degrees: false,
  }
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!s || !Array.isArray(s.lines) || !s.lines.length) return fallback
    return {
      lines: s.lines
        .filter((l: Partial<Line>) => l && typeof l.src === 'string')
        .slice(0, MAX_LINES)
        .map((l: Line, i: number) => ({ id: newId(), src: l.src.slice(0, 200), color: COLORS.includes(l.color) ? l.color : COLORS[i % COLORS.length], on: l.on !== false })),
      params: Object.fromEntries(Object.entries(s.params ?? {}).filter(([k, v]) => /^[a-z]$/.test(k) && typeof v === 'number' && Number.isFinite(v))) as Record<string, number>,
      degrees: s.degrees === true,
    }
  } catch {
    return fallback
  }
}

/** Grafieken: the graphing mode of the calculator, a bit like a TI-84 or Desmos. `initial`: functions from a link. */
export function Grafieken({ initial }: { initial?: string[] }) {
  const [saved] = useState(() => load(initial))
  const [lines, setLines] = useState<Line[]>(saved.lines)
  const [params, setParams] = useState<Record<string, number>>(saved.params)
  const [degrees, setDegrees] = useState(saved.degrees)
  const [selId, setSelId] = useState(saved.lines[0].id)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View | null>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  const [showPoints, setShowPoints] = useState(true)
  const [tab, setTab] = useState<Tab>('punten')
  const [focused, setFocused] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(false)

  useEffect(() => {
    // Functions from a link only replace the saved ones once they're changed
    if (initial?.length && lines.map((l) => l.src).join('\n') === initial.join('\n')) return
    remember(KEY, JSON.stringify({ lines: lines.map(({ src, color, on }) => ({ src, color, on })), params, degrees }))
  }, [lines, params, degrees, initial])

  // ---------------------------------------------------------------- functions
  const compiled = useMemo(() => lines.map((l) => ({ ...l, c: compile(l.src, degrees) })), [lines, degrees])
  const fnOf = (id: string) => {
    const c = compiled.find((l) => l.id === id)?.c
    return c && 'fn' in c ? (x: number) => c.fn(x, params) : null
  }
  const paramNames = [...new Set(compiled.flatMap((l) => ('params' in l.c ? l.c.params : [])))].sort()
  const visible = compiled.filter((l) => l.on && 'fn' in l.c)
  const selected = compiled.find((l) => l.id === selId) ?? compiled[0]
  const indexOf = (id: string) => lines.findIndex((l) => l.id === id) + 1
  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const addLine = () => {
    if (lines.length >= MAX_LINES) return
    const color = COLORS.find((c) => !lines.some((l) => l.color === c)) ?? COLORS[0]
    const l = { id: newId(), src: '', color, on: true }
    setLines((ls) => [...ls, l])
    setSelId(l.id)
    requestAnimationFrame(() => document.getElementById(`rmc-f-${l.id}`)?.focus())
  }
  const removeLine = (id: string) => {
    const rest = lines.filter((l) => l.id !== id)
    const next = rest.length ? rest : [{ id: newId(), src: '', color: COLORS[0], on: true }]
    setLines(next)
    if (selId === id) setSelId(next[0].id)
  }
  /** The keypad types into the box that had the focus last. */
  const insert = (text: string) => {
    const id = focused ?? selected.id
    const el = document.getElementById(`rmc-f-${id}`) as HTMLInputElement | null
    if (!el) return
    const s = el.selectionStart ?? el.value.length
    const e = el.selectionEnd ?? s
    update(id, { src: el.value.slice(0, s) + text + el.value.slice(e) })
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + text.length, s + text.length)
    })
  }
  /** A number in a box: "2,5", but "π/2" or "a+1" work too. */
  const numberOf = (s: string) => {
    const c = compile(s, degrees)
    return 'fn' in c ? c.fn(0, params) : NaN
  }

  // ---------------------------------------------------------------- view
  const standard = (w = size.w): View => standardView(w)
  const trig = (deg = degrees): View => ({ cx: 0, cy: 0, ux: (deg ? 720 : 4 * Math.PI) / size.w, uy: 8 / size.h, angle: true })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth)
      const h = Math.round(el.clientHeight)
      setSize({ w, h })
      setView((v) => v ?? (w ? standard(w) : null))
    })
    ro.observe(el)
    return () => ro.disconnect()
    // standard() only needs the width it's given
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const v = view ?? standard(size.w || 600)
  const { w, h } = size
  const toPx = (x: number) => (x - v.cx) / v.ux + w / 2
  const toPy = (y: number) => h / 2 - (y - v.cy) / v.uy
  const toX = (px: number) => v.cx + (px - w / 2) * v.ux
  const toY = (py: number) => v.cy - (py - h / 2) * v.uy
  const range = { x0: toX(0), x1: toX(w), y0: toY(h), y1: toY(0) }

  const zoomAt = (px: number, py: number, k: number) =>
    setView((old) => {
      const o = old ?? v
      const ux = Math.min(1e9, Math.max(1e-9, o.ux * k))
      const uy = Math.min(1e9, Math.max(1e-9, o.uy * k))
      const x = o.cx + (px - w / 2) * o.ux
      const y = o.cy - (py - h / 2) * o.uy
      return { ...o, ux, uy, cx: x - (px - w / 2) * ux, cy: y + (py - h / 2) * uy }
    })
  /** Fits the y-axis to what the graphs do on the x-range (ignoring the far ends of asymptotes). */
  const fit = () => {
    const ys: number[] = []
    for (const l of visible) {
      const f = fnOf(l.id)!
      for (let k = 0; k <= 400; k++) {
        const y = f(range.x0 + ((range.x1 - range.x0) * k) / 400)
        if (Number.isFinite(y)) ys.push(y)
      }
    }
    if (!ys.length) return
    ys.sort((a, b) => a - b)
    let lo = ys[Math.floor(ys.length * 0.02)]
    let hi = ys[Math.ceil(ys.length * 0.98) - 1]
    if (hi - lo < 1e-9) {
      lo -= 1
      hi += 1
    }
    const pad = (hi - lo) * 0.1
    setView({ ...v, cy: (lo + hi) / 2, uy: (hi - lo + 2 * pad) / h })
  }

  // ---------------------------------------------------------------- special points
  const settled = useDeferredValue(v)
  const points = useMemo(() => {
    const f = fnOf(selected.id)
    if (!f || !selected.on || !w) return []
    const a = settled.cx - (w / 2) * settled.ux
    const b = settled.cx + (w / 2) * settled.ux
    const out: Special[] = specials(f, a, b)
    for (const o of visible) if (o.id !== selected.id) for (const p of intersections(f, fnOf(o.id)!, a, b)) out.push({ kind: 'snijpunt', x: p.x, y: p.y, with: indexOf(o.id) })
    return out.sort((p, q) => p.x - q.x)
    // fnOf/visible/indexOf are derived from compiled and params
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, params, selected.id, selected.on, settled, w])

  /** What's under the mouse or finger: a special point, else the nearest graph at that x. */
  const pick = (p: Probe, reach: number) => {
    if (showPoints)
      for (const s of points)
        if (Math.hypot(toPx(s.x) - p.px, toPy(s.y) - p.py) < 9)
          return { x: s.x, y: s.y, color: selected.color, label: s.kind === 'snijpunt' ? `Snijpunt met y${sub(s.with!)}` : KINDS[s.kind] }
    const x = toX(p.px)
    let best: { x: number; y: number; color: string; label: string; d: number } | null = null
    for (const l of visible) {
      const y = fnOf(l.id)!(x)
      const d = Math.abs(toPy(y) - p.py)
      if (Number.isFinite(y) && d < reach && (!best || d < best.d)) best = { x, y, color: l.color, label: `y${sub(indexOf(l.id))}`, d }
    }
    return best
  }
  const traced = probe ? pick(probe, 28) : null

  // ---------------------------------------------------------------- calculating
  const [calc, setCalc] = useState({ x: '1', c: '0', a: '0', b: '1', shade: false })
  const [table, setTable] = useState({ start: '-3', step: '1' })
  const [win, setWin] = useState<{ x0: string; x1: string; y0: string; y1: string } | null>(null)
  const area = calc.shade && fnOf(selected.id) ? { a: numberOf(calc.a), b: numberOf(calc.b) } : null

  // ---------------------------------------------------------------- drawing
  useEffect(() => {
    const cv = canvas.current
    if (!cv || !w || !h) return
    const sf = fnOf(selected.id)
    const { ctx, col } = drawGraph(
      cv,
      w,
      h,
      v,
      degrees,
      visible.map((l) => ({ f: fnOf(l.id)!, color: l.color, width: l.id === selected.id ? 3 : 2.25 })),
      (ctx) => {
        // The area under the selected graph
        if (!area || !sf || !Number.isFinite(area.a) || !Number.isFinite(area.b)) return
        const ax = toPy(0)
        const [a, b] = area.a < area.b ? [area.a, area.b] : [area.b, area.a]
        const pa = Math.max(-10, toPx(a))
        const pb = Math.min(w + 10, toPx(b))
        ctx.beginPath()
        ctx.moveTo(pa, ax)
        for (let px = pa; px <= pb; px += 1) {
          const y = sf(toX(px))
          ctx.lineTo(px, Number.isFinite(y) ? Math.max(-1e4, Math.min(1e4, toPy(y))) : ax)
        }
        ctx.lineTo(pb, Math.max(-1e4, Math.min(1e4, toPy(sf(toX(pb))))))
        ctx.lineTo(pb, ax)
        ctx.closePath()
        ctx.globalAlpha = 0.25
        ctx.fillStyle = selected.color
        ctx.fill()
        ctx.globalAlpha = 1
      },
    )

    // Grey dots on the zeros, extremes and crossings of the selected graph
    if (showPoints) {
      ctx.strokeStyle = col('--rmc-point')
      ctx.fillStyle = col('--rmc-paper')
      ctx.lineWidth = 2
      for (const s of points) {
        ctx.beginPath()
        ctx.arc(toPx(s.x), toPy(s.y), 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    if (traced) {
      const px = toPx(traced.x)
      const py = toPy(traced.y)
      ctx.beginPath()
      ctx.arc(px, py, 5.5, 0, Math.PI * 2)
      ctx.fillStyle = traced.color
      ctx.fill()
      ctx.strokeStyle = col('--rmc-paper')
      ctx.lineWidth = 2
      ctx.stroke()
      const text = [traced.label, point(traced.x, traced.y)]
      ctx.font = '12px "Segoe UI", Tahoma, sans-serif'
      const tw = Math.max(...text.map((t) => ctx.measureText(t).width)) + 12
      const bx = px + 10 + tw > w ? px - 10 - tw : px + 10
      const by = Math.min(h - 40, Math.max(2, py - 44))
      ctx.fillStyle = col('--rmc-paper')
      ctx.strokeStyle = col('--rmc-grid-major')
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(bx, by, tw, 38, 4)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = col('--rmc-label')
      ctx.textAlign = 'left'
      ctx.fillText(text[0], bx + 6, by + 15)
      ctx.fillStyle = traced.color
      ctx.font = 'bold 12px "Segoe UI", Tahoma, sans-serif'
      ctx.fillText(text[1], bx + 6, by + 31)
    }
  })

  // Zooming with the wheel needs a listener that can preventDefault
  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { x, y } = pointIn(e, cv, w, h)
      zoomAt(x, y, Math.exp(e.deltaY * 0.0015))
    }
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  })

  const at = (e: React.PointerEvent) => pointIn(e, e.currentTarget, w, h)
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, at(e))
    moved.current = false
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = at(e)
    const ps = pointers.current
    const last = ps.get(e.pointerId)
    if (!last) {
      if (e.pointerType === 'mouse') setProbe({ px: p.x, py: p.y })
      return
    }
    if (ps.size === 2) {
      // Pinching: zoom around the middle of the two fingers and move with it
      const [a, b] = [...ps.values()]
      const other = a === last ? b : a
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(p.x - other.x, p.y - other.y)
      if (before > 10 && after > 10) zoomAt((p.x + other.x) / 2, (p.y + other.y) / 2, before / after)
      moved.current = true
    } else {
      const dx = p.x - last.x
      const dy = p.y - last.y
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        if (!moved.current && Math.hypot(dx, dy) < 3) return
        moved.current = true
        setProbe(null)
        setView((o) => {
          const c = o ?? v
          return { ...c, cx: c.cx - dx * c.ux, cy: c.cy + dy * c.uy }
        })
      }
    }
    ps.set(e.pointerId, p)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    // A tap without moving shows the point there (on a phone there's no hover)
    if (!moved.current) {
      const p = at(e)
      setProbe({ px: p.x, py: p.y })
    }
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 40
    const pan: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    if (pan[e.key]) {
      e.preventDefault()
      const [dx, dy] = pan[e.key]
      setView({ ...v, cx: v.cx + dx * v.ux, cy: v.cy - dy * v.uy })
    } else if (e.key === '+' || e.key === '=') zoomAt(w / 2, h / 2, 0.8)
    else if (e.key === '-') zoomAt(w / 2, h / 2, 1.25)
  }
  const centreOn = (x: number, y: number) => {
    setView({ ...v, cx: x, cy: y })
    setProbe({ px: w / 2, py: h / 2 })
  }
  const savePng = () =>
    canvas.current?.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = 'Grafiek.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  const setAngles = (deg: boolean) => {
    setDegrees(deg)
    if (v.angle) setView(trig(deg))
  }

  // ---------------------------------------------------------------- panels
  const sf = fnOf(selected.id)
  const tabs: [Tab, string][] = [
    ['punten', 'Punten'],
    ['tabel', 'Tabel'],
    ['berekenen', 'Berekenen'],
    ['venster', 'Venster'],
  ]
  const tStart = numberOf(table.start)
  const tStep = numberOf(table.step)
  const cx = numberOf(calc.x)
  const cc = numberOf(calc.c)
  const ca = numberOf(calc.a)
  const cb = numberOf(calc.b)
  const ok = Number.isFinite

  return (
    <div className="rmc-graph">
      <div className="rmc-g-side">
        <ol className="rmc-g-lines">
          {compiled.map((l, i) => (
            <li key={l.id} className={l.id === selected.id ? 'sel' : undefined} onClick={() => setSelId(l.id)}>
              <button
                type="button"
                className={l.on ? 'rmc-g-swatch' : 'rmc-g-swatch off'}
                style={{ '--c': l.color } as React.CSSProperties}
                onClick={(e) => {
                  e.stopPropagation()
                  update(l.id, { on: !l.on })
                }}
                title={l.on ? 'Verbergen' : 'Tonen'}
                aria-label={l.on ? `y${sub(i + 1)} verbergen` : `y${sub(i + 1)} tonen`}
                aria-pressed={l.on}
              />
              <label htmlFor={`rmc-f-${l.id}`}>y{sub(i + 1)} =</label>
              <input
                id={`rmc-f-${l.id}`}
                value={l.src}
                maxLength={200}
                spellCheck={false}
                autoComplete="off"
                placeholder={i === 0 ? 'bijv. x^2 - 2' : 'bijv. 2sin(x)'}
                onFocus={() => {
                  setFocused(l.id)
                  setSelId(l.id)
                }}
                onChange={(e) => update(l.id, { src: e.target.value })}
              />
              <button type="button" className="rmc-g-del" onClick={() => removeLine(l.id)} title="Weghalen" aria-label={`y${sub(i + 1)} weghalen`}>
                <FarmIcon name="cross" size={16} />
              </button>
              {'error' in l.c && l.c.error && <p className="rmc-g-err">{l.c.error}</p>}
              {l.id === selected.id && (
                <span className="rmc-g-colors" role="radiogroup" aria-label="Kleur">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={l.color === c}
                      aria-label={`Kleur ${c}`}
                      style={{ background: c }}
                      className={l.color === c ? 'on' : undefined}
                      onClick={() => update(l.id, { color: c })}
                    />
                  ))}
                </span>
              )}
            </li>
          ))}
        </ol>
        {lines.length < MAX_LINES && (
          <button type="button" className="rmc-g-add" onClick={addLine}>
            <FarmIcon name="add" size={16} /> Functie toevoegen
          </button>
        )}
        <div className="rmc-g-pad" aria-label="Invoegen">
          {KEYPAD.map((k) => (
            <button key={k} type="button" className="rmc-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}>
              {k.replace('(', '').replace('√', '√') || k}
            </button>
          ))}
        </div>
        {paramNames.length > 0 && (
          <div className="rmc-g-params">
            {paramNames.map((n) => {
              const val = params[n] ?? 1
              return (
                <label key={n}>
                  <span>
                    {n} = <b>{fmt(val, 4)}</b>
                  </span>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={Math.max(-10, Math.min(10, val))}
                    onChange={(e) => setParams((p) => ({ ...p, [n]: Number(e.target.value) }))}
                  />
                </label>
              )
            })}
          </div>
        )}
        <p className="rmc-g-hint">
          Typ bijvoorbeeld <code>x^2</code>, <code>3x+1</code>, <code>sin(x)</code>, <code>√(x)</code> of <code>1/x</code>. Een letter als <code>a</code> krijgt een schuifje.
          Komma’s in getallen mogen (2,5); tussen twee getallen in een functie zet je <code>;</code>.
        </p>
      </div>

      <div className="rmc-g-main">
        <div className="rmc-g-tools">
          <button type="button" onClick={() => zoomAt(w / 2, h / 2, 0.8)} title="Inzoomen" aria-label="Inzoomen">
            <FarmIcon name="zoom_in" size={16} />
          </button>
          <button type="button" onClick={() => zoomAt(w / 2, h / 2, 1.25)} title="Uitzoomen" aria-label="Uitzoomen">
            <FarmIcon name="zoom_out" size={16} />
          </button>
          <button type="button" onClick={() => setView(standard())}>
            Standaard
          </button>
          <button type="button" onClick={() => setView(trig())}>
            Goniometrie
          </button>
          <button type="button" onClick={fit} title="De y-as passend maken bij de grafieken">
            Passend
          </button>
          <span className="rmc-angle" role="radiogroup" aria-label="Hoeken">
            <label>
              <input type="radio" checked={!degrees} onChange={() => setAngles(false)} /> Rad
            </label>
            <label>
              <input type="radio" checked={degrees} onChange={() => setAngles(true)} /> Gr
            </label>
          </span>
          <label className="rmc-g-check">
            <input type="checkbox" checked={showPoints} onChange={(e) => setShowPoints(e.target.checked)} /> Punten
          </label>
          <button type="button" className="rmc-g-png" onClick={savePng} title="Opslaan als afbeelding">
            <FarmIcon name="picture" size={16} /> PNG
          </button>
        </div>
        <div className="rmc-g-canvas" ref={wrap}>
          <canvas
            ref={canvas}
            tabIndex={0}
            role="img"
            aria-label={`Grafiek van ${visible.map((l) => `y${sub(indexOf(l.id))} = ${l.src}`).join(', ') || 'niets'}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && !pointers.current.size && setProbe(null)}
            onKeyDown={onKeyDown}
          />
        </div>

        <nav className="rmc-g-tabs" role="tablist">
          {tabs.map(([t, name]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
              {name}
            </button>
          ))}
          <span className="rmc-g-of" style={{ '--c': selected.color } as React.CSSProperties}>
            y{sub(indexOf(selected.id))} = {selected.src || '…'}
          </span>
        </nav>
        <div className="rmc-g-panel" role="tabpanel">
          {tab === 'punten' &&
            (!sf ? (
              <p className="muted">Kies een functie die klopt.</p>
            ) : points.length === 0 ? (
              <p className="muted">Geen nulpunten, toppen of snijpunten in dit stuk van de grafiek. Schuif of zoom uit om verder te kijken.</p>
            ) : (
              <ul className="rmc-g-points">
                {points.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => centreOn(s.x, s.y)} title="Laten zien">
                      <span>{s.kind === 'snijpunt' ? `Snijpunt met y${sub(s.with!)}` : KINDS[s.kind]}</span>
                      <b>{point(s.x, s.y)}</b>
                    </button>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'tabel' && (
            <>
              <div className="rmc-g-form">
                <label>
                  Begin bij x =
                  <input value={table.start} onChange={(e) => setTable({ ...table, start: e.target.value })} />
                </label>
                <label>
                  Stap
                  <input value={table.step} onChange={(e) => setTable({ ...table, step: e.target.value })} />
                </label>
              </div>
              {ok(tStart) && ok(tStep) && tStep !== 0 && visible.length > 0 ? (
                <div className="rmc-g-table">
                  <table>
                    <thead>
                      <tr>
                        <th>x</th>
                        {visible.map((l) => (
                          <th key={l.id} style={{ color: l.color }}>
                            y{sub(indexOf(l.id))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 21 }, (_, k) => tStart + k * tStep).map((x) => (
                        <tr key={x}>
                          <td>{fmt(x)}</td>
                          {visible.map((l) => (
                            <td key={l.id}>{fmt(fnOf(l.id)!(x))}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Vul een begin en een stap in (de stap mag geen 0 zijn).</p>
              )}
            </>
          )}

          {tab === 'berekenen' &&
            (!sf ? (
              <p className="muted">Kies een functie die klopt.</p>
            ) : (
              <div className="rmc-g-calc">
                <div className="rmc-g-form">
                  <label>
                    x =
                    <input value={calc.x} onChange={(e) => setCalc({ ...calc, x: e.target.value })} />
                  </label>
                  <p>
                    y = <b>{ok(cx) ? fmt(sf(cx), 8) : '…'}</b>
                    <br />
                    helling (dy/dx) = <b>{ok(cx) ? fmt(derivative(sf, cx), 6) : '…'}</b>
                  </p>
                </div>
                <div className="rmc-g-form">
                  <label>
                    Oplossen: y =
                    <input value={calc.c} onChange={(e) => setCalc({ ...calc, c: e.target.value })} />
                  </label>
                  <p>
                    {ok(cc)
                      ? (() => {
                          const xs = solve(sf, cc, range.x0, range.x1)
                          return xs.length ? `x = ${xs.map((x) => fmt(x)).join(' of x = ')}` : 'Geen oplossing in dit stuk van de grafiek.'
                        })()
                      : '…'}
                  </p>
                </div>
                <div className="rmc-g-form">
                  <label>
                    Oppervlakte van x =
                    <input value={calc.a} onChange={(e) => setCalc({ ...calc, a: e.target.value })} />
                  </label>
                  <label>
                    tot x =
                    <input value={calc.b} onChange={(e) => setCalc({ ...calc, b: e.target.value })} />
                  </label>
                  <p>
                    ∫ = <b>{ok(ca) && ok(cb) ? fmt(integral(sf, ca, cb), 8) : '…'}</b>
                  </p>
                  <label className="rmc-g-check">
                    <input type="checkbox" checked={calc.shade} onChange={(e) => setCalc({ ...calc, shade: e.target.checked })} /> Inkleuren
                  </label>
                </div>
              </div>
            ))}

          {tab === 'venster' &&
            (() => {
              const cur = win ?? { x0: fmt(range.x0, 4), x1: fmt(range.x1, 4), y0: fmt(range.y0, 4), y1: fmt(range.y1, 4) }
              const vals = [cur.x0, cur.x1, cur.y0, cur.y1].map((s) => numberOf(s.replace('−', '-')))
              const valid = vals.every(ok) && vals[0] < vals[1] && vals[2] < vals[3]
              return (
                <form
                  className="rmc-g-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!valid) return
                    const [x0, x1, y0, y1] = vals
                    setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, ux: (x1 - x0) / w, uy: (y1 - y0) / h, angle: false })
                    setWin(null)
                  }}
                >
                  {(
                    [
                      ['x0', 'x van'],
                      ['x1', 'tot'],
                      ['y0', 'y van'],
                      ['y1', 'tot'],
                    ] as const
                  ).map(([k, name]) => (
                    <label key={k}>
                      {name}
                      <input value={cur[k]} onChange={(e) => setWin({ ...cur, [k]: e.target.value })} />
                    </label>
                  ))}
                  <button type="submit" className="btn" disabled={!valid}>
                    Toepassen
                  </button>
                  {win && (
                    <button type="button" className="link-button" onClick={() => setWin(null)}>
                      terugzetten
                    </button>
                  )}
                </form>
              )
            })()}
        </div>
      </div>
    </div>
  )
}
