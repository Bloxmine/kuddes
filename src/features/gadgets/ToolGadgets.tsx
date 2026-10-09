import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { DOC_KINDS } from '../../../shared/documents'
import type { DocGadget } from '../../../shared/gadgets'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { errorMessage } from '../../lib/api'
import { screenScale } from '../../lib/pointer'
import { formatDate } from '../../lib/time'
import { compile, fmt } from '../rekenmachine/graph'
import { drawGraph, GRAPH_COLORS, standardView, type View } from '../rekenmachine/graphDraw'
import { DocView } from './DocView'
import { sharedDocPath, useSharedDoc } from './sharedDoc'
import '../rekenmachine/Rekenmachine.css'
import './ToolGadgets.css'

type Props<T extends Gadget['type']> = { gadget: Extract<Gadget, { type: T }>; username: string; isOwner: boolean }

/** One file from Tools, drawn right in the box (a drawing, a mindmap, a planner…). */
export function DocGadget({ gadget, username, isOwner }: Props<DocGadget>) {
  const item = gadget.docs[0]
  const doc = useSharedDoc(gadget.id, item)
  const kind = DOC_KINDS[gadget.type]
  if (!item) return <p className="muted tg-empty">{isOwner ? `Kies met het potlood welke ${kind.one} je hier wilt laten zien.` : `Hier staat nog geen ${kind.one}.`}</p>
  return (
    <div className="tg-gadget">
      {doc.isLoading ? <p className="muted">Laden…</p> : doc.error || !doc.data ? <p className="muted">{errorMessage(doc.error)}</p> : <DocView doc={doc.data} compact />}
      <footer className="tg-foot">
        <span className="tg-title">
          <FarmIcon name={kind.icon} /> {item.title}
        </span>
        {gadget.type !== 'formulier' && <Link to={sharedDocPath(username, gadget.id, item.id)}>Groot bekijken</Link>}
        {isOwner && <Link to={`${kind.path}/${item.id}`}>Bewerken</Link>}
      </footer>
    </div>
  )
}

/** A list of shared files, each opening large and read-only. */
export function FilesGadget({ gadget, username, isOwner }: Props<'bestanden'>) {
  if (!gadget.docs.length) return <p className="muted tg-empty">{isOwner ? 'Kies met het potlood welke bestanden je wilt delen.' : 'Er worden nog geen bestanden gedeeld.'}</p>
  return (
    <ul className="tg-files">
      {gadget.docs.map((d) => (
        <li key={d.id}>
          <Link to={sharedDocPath(username, gadget.id, d.id)}>
            <FarmIcon name={DOC_KINDS[d.kind].icon} size={32} />
            <span>
              <b>{d.title}</b>
              <small>
                {DOC_KINDS[d.kind].name} · {formatDate(d.updatedAt)}
              </small>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function CalculatorGadget({ gadget }: Props<'rekenmachine'>) {
  return gadget.config.mode === 'grafiek' ? <MiniGraph functions={gadget.config.functions} /> : <MiniCalculator />
}

const sub = (n: number) => [...String(n)].map((d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]).join('')

/** A pocket calculator: you type the whole sum, = works it out (with the graph mode's parser). */
function MiniCalculator() {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const type = (t: string) => {
    // After =, a digit starts again and an operator goes on with the answer
    if (result !== null) {
      setExpr(/^[+−×÷^²]/.test(t) && result !== 'Fout' ? result + t : t)
      setResult(null)
    } else setExpr((e) => e + t)
  }
  const clear = () => {
    setExpr('')
    setResult(null)
  }
  const equals = () => {
    if (!expr) return
    const c = compile(expr, true)
    const v = 'fn' in c ? c.fn(0, {}) : NaN
    setResult(Number.isFinite(v) ? fmt(v, 10) : 'Fout')
  }
  const keys: [string, () => void, string?][] = [
    ['C', clear, 'fn'],
    ['←', () => (result !== null ? setResult(null) : setExpr((e) => e.slice(0, -1))), 'fn'],
    ['(', () => type('(')],
    [')', () => type(')')],
    ['√', () => type('√(')],
    ['7', () => type('7')],
    ['8', () => type('8')],
    ['9', () => type('9')],
    ['÷', () => type('÷'), 'op'],
    ['x²', () => type('²')],
    ['4', () => type('4')],
    ['5', () => type('5')],
    ['6', () => type('6')],
    ['×', () => type('×'), 'op'],
    ['xʸ', () => type('^')],
    ['1', () => type('1')],
    ['2', () => type('2')],
    ['3', () => type('3')],
    ['−', () => type('−'), 'op'],
    ['π', () => type('π')],
    ['0', () => type('0')],
    [',', () => type(',')],
    ['=', equals, 'eq'],
    ['+', () => type('+'), 'op'],
    ['%', () => type('÷100')],
  ]
  return (
    <div
      className="rmc-tokens tg-calc"
      tabIndex={0}
      aria-label="Rekenmachine: typ een som en druk op Enter"
      onKeyDown={(e) => {
        const k = e.key
        const map: Record<string, string> = { '*': '×', '/': '÷', '-': '−', '.': ',' }
        if (/^[\d+()^,]$/.test(k) || map[k]) type(map[k] ?? k)
        else if (k === 'Enter' || k === '=') equals()
        else if (k === 'Backspace') setExpr((x) => x.slice(0, -1))
        else if (k === 'Escape') clear()
        else return
        e.preventDefault()
      }}
    >
      <div className="rmc-display" aria-live="polite">
        <div className="rmc-expr">{result !== null ? `${expr} =` : ' '}</div>
        <div className="rmc-shown">{result ?? (expr || '0')}</div>
      </div>
      <div className="tg-calc-keys">
        {keys.map(([label, run, cls]) => (
          <button key={label} type="button" className={`rmc-key ${cls ?? ''}`} onClick={run}>
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The owner's functions on graph paper; visitors can move it around and zoom. */
function MiniGraph({ functions }: { functions: string[] }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const lines = functions.map((src, i) => ({ src, color: GRAPH_COLORS[i % GRAPH_COLORS.length], c: compile(src, false) }))

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth)
      setSize({ w, h: Math.round(el.clientHeight) })
      setView((v) => v ?? (w ? standardView(w) : null))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const v = view ?? standardView(size.w || 300)
  useEffect(() => {
    if (!canvas.current || !size.w) return
    drawGraph(
      canvas.current,
      size.w,
      size.h,
      v,
      false,
      lines.flatMap((l) => ('fn' in l.c ? [{ f: (x: number) => (l.c as { fn: (x: number, p: Record<string, number>) => number }).fn(x, {}), color: l.color, width: 2.5 }] : [])),
    )
  })
  const zoom = (k: number) => setView({ ...v, ux: v.ux * k, uy: v.uy * k })
  const open = `/tools/rekenmachine?${functions.map((f) => `f=${encodeURIComponent(f)}`).join('&')}`

  return (
    <div className="rmc-tokens tg-graph">
      <div className="tg-graph-canvas" ref={wrap}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Grafiek van ${functions.join(', ')}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            last.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerMove={(e) => {
            if (!last.current) return
            // Screen pixels to the graph's own (the page may be zoomed)
            const k = screenScale(e.currentTarget, size.w)
            const dx = (e.clientX - last.current.x) / k
            const dy = (e.clientY - last.current.y) / k
            last.current = { x: e.clientX, y: e.clientY }
            setView((o) => {
              const c = o ?? v
              return { ...c, cx: c.cx - dx * c.ux, cy: c.cy + dy * c.uy }
            })
          }}
          onPointerUp={() => (last.current = null)}
          onPointerCancel={() => (last.current = null)}
        />
        <div className="tg-graph-zoom">
          <button type="button" className="icon-button" onClick={() => zoom(0.8)} aria-label="Inzoomen">
            <FarmIcon name="zoom_in" />
          </button>
          <button type="button" className="icon-button" onClick={() => zoom(1.25)} aria-label="Uitzoomen">
            <FarmIcon name="zoom_out" />
          </button>
          <button type="button" className="icon-button" onClick={() => setView(standardView(size.w))} aria-label="Terugzetten" title="Terugzetten">
            <FarmIcon name="arrow_refresh" />
          </button>
        </div>
      </div>
      <ul className="tg-graph-legend">
        {lines.map((l, i) => (
          <li key={i} style={{ '--c': l.color } as React.CSSProperties}>
            y{sub(i + 1)} = {l.src}
            {'error' in l.c && l.c.error && <small> ({l.c.error})</small>}
          </li>
        ))}
      </ul>
      <Link to={open} className="tg-graph-open">
        <FarmIcon name="calculator" /> Zelf proberen in de Rekenmachine
      </Link>
    </div>
  )
}
