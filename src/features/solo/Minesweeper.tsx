/**
 * Mijnenveger, like the one on every Windows computer: open the squares
 * without hitting a mine. A number tells how many mines touch that square.
 * Right-click (or hold on a phone, or the flag mode) puts a flag; clicking a
 * number whose flags are all there opens the rest around it. The first click
 * is always safe. All pictures are Farm-Fresh icons.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { playCapture, playGood, playPiece, playWrong } from '../games/sounds'
import './Minesweeper.css'

const MINE_LEVELS = [
  { name: 'Beginner', cols: 9, rows: 9, mines: 10, base: 1000 },
  { name: 'Gemiddeld', cols: 16, rows: 16, mines: 40, base: 4000 },
  { name: 'Expert', cols: 30, rows: 16, mines: 99, base: 10_000 },
] as const

type Cell = { mine: boolean; open: boolean; flag: boolean; around: number }
type Phase = 'ready' | 'playing' | 'won' | 'lost'

/** The time it took, as points: faster is more, and a harder level is worth more. */
const mineScore = (level: number, seconds: number) => Math.round((MINE_LEVELS[level].base * 60) / (60 + seconds))

/** The time, for the event handlers. */
const clock = () => Date.now()

const empty = (n: number): Cell[] => Array.from({ length: n }, () => ({ mine: false, open: false, flag: false, around: 0 }))

function neighbours(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols)
  const c = i % cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue
      const rr = r + dr
      const cc = c + dc
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc)
    }
  return out
}

/** Mines go in after the first click, never on or next to it. */
function layMines(cells: Cell[], first: number, cols: number, rows: number, mines: number): Cell[] {
  const safe = new Set([first, ...neighbours(first, cols, rows)])
  const spots = cells.map((_, i) => i).filter((i) => !safe.has(i))
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[spots[i], spots[j]] = [spots[j], spots[i]]
  }
  const next = cells.map((c) => ({ ...c, mine: false }))
  for (const i of spots.slice(0, mines)) next[i].mine = true
  for (let i = 0; i < next.length; i++) next[i].around = neighbours(i, cols, rows).filter((n) => next[n].mine).length
  return next
}

/** Opens a square; an empty one (0) opens everything around it too. */
function flood(cells: Cell[], start: number, cols: number, rows: number) {
  const stack = [start]
  while (stack.length) {
    const i = stack.pop()!
    const c = cells[i]
    if (c.open || c.flag) continue
    c.open = true
    if (!c.mine && c.around === 0) for (const n of neighbours(i, cols, rows)) if (!cells[n].open) stack.push(n)
  }
}

const FACES: Record<Phase | 'pressing', FarmIconName> = {
  ready: 'emotion_smile',
  playing: 'emotion_smile',
  pressing: 'emotion_shocked',
  lost: 'emotion_dead',
  won: 'emotion_cool',
}

/** The red LED counters of the original. */
const Led = ({ value, label }: { value: number; label: string }) => (
  <span className="ms-led" aria-label={label}>
    {String(Math.max(-99, Math.min(999, value))).padStart(3, '0')}
  </span>
)

export function Minesweeper({ onFinish }: { onFinish: (result: { score: number; won: boolean; details: Record<string, number> }) => void }) {
  const [level, setLevel] = useState(0)
  const [width, setWidth] = useState(0)
  const narrow = width > 0 && width < 520
  const box = useRef<HTMLDivElement>(null)
  // Expert stands upright on a phone (16 wide, 30 high)
  const def = MINE_LEVELS[level]
  const cols = narrow && def.cols > def.rows ? def.rows : def.cols
  const rows = narrow && def.cols > def.rows ? def.cols : def.rows
  const [cells, setCells] = useState<Cell[]>(() => empty(cols * rows))
  const [phase, setPhase] = useState<Phase>('ready')
  const [pressing, setPressing] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [started, setStarted] = useState(0)
  const [now, setNow] = useState(0)
  const [boom, setBoom] = useState<number | null>(null)
  const hold = useRef<{ timer: number; done: boolean } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return
    const t = window.setInterval(() => setNow(clock()), 250)
    return () => window.clearInterval(t)
  }, [phase])

  const reset = (nextLevel = level) => {
    const d = MINE_LEVELS[nextLevel]
    setLevel(nextLevel)
    setCells(empty(d.cols * d.rows))
    setPhase('ready')
    setBoom(null)
    setStarted(0)
    setNow(0)
  }

  // Another shape (a phone turned upright, or another level): a new board
  const shape = `${cols}x${rows}`
  const [shapeSeen, setShapeSeen] = useState(shape)
  if (shapeSeen !== shape) {
    setShapeSeen(shape)
    setCells(empty(cols * rows))
    setPhase('ready')
    setBoom(null)
    setStarted(0)
  }

  const seconds = started ? Math.min(999, Math.floor((now - started) / 1000)) : 0
  const flags = cells.filter((c) => c.flag).length
  const minesLeft = def.mines - flags

  const finish = (next: Cell[], won: boolean, at: number) => {
    const secs = Math.max(1, Math.round((at - (started || at)) / 1000))
    setNow(at)
    if (won) {
      // Every mine gets its flag
      for (const c of next) if (c.mine) c.flag = true
      setPhase('won')
      playGood()
      onFinish({ score: mineScore(level, secs), won: true, details: { level, seconds: secs } })
    } else {
      setPhase('lost')
      playWrong()
      onFinish({ score: 0, won: false, details: { level, seconds: secs } })
    }
  }

  const open = (i: number) => {
    if (phase === 'won' || phase === 'lost') return
    let next = cells.map((c) => ({ ...c }))
    const at = clock()
    if (phase === 'ready') {
      next = layMines(next, i, cols, rows, def.mines)
      setStarted(at)
      setNow(at)
      setPhase('playing')
    }
    const c = next[i]
    if (c.flag) return
    let hit: number | null = null
    if (c.open) {
      // A number with all its flags: open the rest around it
      const around = neighbours(i, cols, rows)
      if (c.around === 0 || around.filter((n) => next[n].flag).length !== c.around) return
      for (const n of around) {
        if (next[n].flag || next[n].open) continue
        if (next[n].mine) hit = n
        flood(next, n, cols, rows)
      }
    } else if (c.mine) {
      hit = i
      c.open = true
    } else flood(next, i, cols, rows)

    if (hit !== null) {
      setBoom(hit)
      for (const x of next) if (x.mine && !x.flag) x.open = true
      setCells(next)
      finish(next, false, at)
      return
    }
    playPiece()
    setCells(next)
    if (next.every((x) => x.mine || x.open)) finish(next, true, at)
  }

  const flag = (i: number) => {
    if (phase === 'won' || phase === 'lost' || cells[i].open) return
    playCapture()
    setCells(cells.map((c, j) => (j === i ? { ...c, flag: !c.flag } : c)))
  }

  // A phone: hold a square for a flag
  const down = (e: ReactPointerEvent, i: number) => {
    if (e.button === 2) return
    setPressing(true)
    if (e.pointerType !== 'mouse') {
      const h = { timer: 0, done: false }
      h.timer = window.setTimeout(() => {
        h.done = true
        navigator.vibrate?.(25)
        flag(i)
      }, 380)
      hold.current = h
    }
  }
  const up = (i: number) => {
    setPressing(false)
    const h = hold.current
    hold.current = null
    if (h) window.clearTimeout(h.timer)
    if (h?.done) return
    if (flagMode && !cells[i].open) flag(i)
    else open(i)
  }

  const face = pressing && (phase === 'ready' || phase === 'playing') ? FACES.pressing : FACES[phase]
  // Squares as big as fit (between 18 and 28 pixels), measured on the space there is
  const cell = width ? Math.max(18, Math.min(28, Math.floor((width - 34) / cols))) : 24
  const style = useMemo(() => ({ '--cols': cols, '--cell': `${cell}px` }) as CSSProperties, [cols, cell])

  return (
    <div className="ms" ref={box}>
      <div className="ms-levels" role="radiogroup" aria-label="Moeilijkheid">
        {MINE_LEVELS.map((l, i) => (
          <button key={l.name} type="button" role="radio" aria-checked={i === level} className={i === level ? 'current' : undefined} onClick={() => reset(i)}>
            {l.name} <span className="muted">{l.cols}×{l.rows}, {l.mines}</span>
          </button>
        ))}
        <button type="button" className={flagMode ? 'ms-flagmode on' : 'ms-flagmode'} aria-pressed={flagMode} onClick={() => setFlagMode((f) => !f)} title="Vlaggen zetten in plaats van openen (handig op een telefoon)">
          <FarmIcon name="flag_red" /> Vlagmodus
        </button>
      </div>

      <div className={`ms-window ms-${phase}`}>
        <div className="ms-top">
          <Led value={minesLeft} label={`${minesLeft} mijnen over`} />
          <button type="button" className="ms-face" onClick={() => reset()} title="Nieuw spel" aria-label="Nieuw spel">
            <FarmIcon name={face} size={32} />
          </button>
          <Led value={seconds} label={`${seconds} seconden`} />
        </div>
        <div className="ms-field-wrap">
          <div className="ms-field" style={style} onContextMenu={(e) => e.preventDefault()} role="grid" aria-label="Mijnenveld">
            {cells.map((c, i) => {
              const wrong = phase === 'lost' && c.flag && !c.mine
              return (
                <button
                  key={i}
                  type="button"
                  className={['ms-cell', c.open && 'open', c.open && !c.mine && c.around && `n${c.around}`, boom === i && 'boom', wrong && 'wrong'].filter(Boolean).join(' ')}
                  onPointerDown={(e) => down(e, i)}
                  onPointerUp={(e) => e.button !== 2 && up(i)}
                  onPointerLeave={() => setPressing(false)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    flag(i)
                  }}
                  aria-label={c.open ? (c.mine ? 'mijn' : c.around ? `${c.around}` : 'leeg') : c.flag ? 'vlag' : 'dicht'}
                >
                  {c.open && c.mine ? (
                    <FarmIcon name="bomb" />
                  ) : wrong ? (
                    <span className="ms-cross">
                      <FarmIcon name="bomb" />
                    </span>
                  ) : c.flag ? (
                    <FarmIcon name="flag_red" />
                  ) : c.open && c.around ? (
                    c.around
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <p className="ms-result" aria-live="polite">
        {phase === 'won' ? (
          <>
            <FarmIcon name="award_star_gold_1" /> Opgeruimd in {seconds} seconden: <b>{mineScore(level, seconds).toLocaleString('nl-NL')} punten</b>
          </>
        ) : phase === 'lost' ? (
          <>
            <FarmIcon name="bomb" /> Boem! Klik op het gezicht voor een nieuw spel.
          </>
        ) : (
          <span className="muted">Klik om een vakje te openen, rechtsklik (of houd vast) voor een vlag. De eerste klik is altijd veilig.</span>
        )}
      </p>
    </div>
  )
}
