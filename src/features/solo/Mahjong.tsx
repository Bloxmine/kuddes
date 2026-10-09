/**
 * Mahjong solitaire: the classic turtle of 144 stones. Take away two of the
 * same that are free (nothing on top, and nothing on their left or right).
 * Any flower goes with any flower, any season with any season. Every deal
 * can be finished: it's made by taking pairs off the full turtle backwards.
 * Hints, undo and (when you're stuck) shuffling the ones that are left.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { playCardPlace, playGood, playWrong } from '../games/sounds'
import './Mahjong.css'

// ------------------------------------------------------------------ the turtle

type Pos = { x: number; y: number; z: number }

function turtle(): Pos[] {
  const out: Pos[] = []
  const row = (y: number, from: number, to: number, z = 0) => {
    for (let x = from; x <= to; x++) out.push({ x, y, z })
  }
  // The bottom layer: 87
  row(0, 1, 12)
  row(1, 3, 10)
  row(2, 2, 11)
  row(3, 1, 12)
  row(4, 1, 12)
  row(5, 2, 11)
  row(6, 3, 10)
  row(7, 1, 12)
  out.push({ x: 0, y: 3.5, z: 0 }, { x: 13, y: 3.5, z: 0 }, { x: 14, y: 3.5, z: 0 })
  // Then 36, 16, 4 and the one on top
  for (let y = 1; y <= 6; y++) row(y, 4, 9, 1)
  for (let y = 2; y <= 5; y++) row(y, 5, 8, 2)
  for (let y = 3; y <= 4; y++) row(y, 6, 7, 3)
  out.push({ x: 6.5, y: 3.5, z: 4 })
  return out
}
const POSITIONS = turtle()

/** Free: nothing lying on it, and its left or its right side open. */
function isFree(i: number, present: Set<number>): boolean {
  const p = POSITIONS[i]
  for (const j of present) {
    if (j === i) continue
    const q = POSITIONS[j]
    if (q.z === p.z + 1 && Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1) return false
  }
  let left = false
  let right = false
  for (const j of present) {
    if (j === i) continue
    const q = POSITIONS[j]
    if (q.z !== p.z || Math.abs(q.y - p.y) >= 1) continue
    if (q.x === p.x - 1) left = true
    if (q.x === p.x + 1) right = true
  }
  return !left || !right
}

// ------------------------------------------------------------------ the stones

/** s: dots, b: bamboo, t: characters (1–9, four of each); w: winds, d: dragons (four of each); f: flowers, j: seasons (one each). */
type Face = string
const FACES: Face[] = [
  ...['s', 'b', 't'].flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  ...['w0', 'w1', 'w2', 'w3', 'd0', 'd1', 'd2'],
]
/** Flowers match any flower, seasons any season. */
const keyOf = (f: Face) => (f[0] === 'f' || f[0] === 'j' ? f[0] : f)

/** The pairs to lay out: two pairs of every face, and two pairs of flowers and of seasons. */
function allPairs(): [Face, Face][] {
  return [...FACES.flatMap((f) => [[f, f], [f, f]] as [Face, Face][]), ['f0', 'f1'], ['f2', 'f3'], ['j0', 'j1'], ['j2', 'j3']]
}

function shuffled<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Lays the pairs on the places so it can be finished: take two free places off, put a pair there, repeat. */
function solvable(places: number[], pairs: [Face, Face][]): Map<number, Face> | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const left = new Set(places)
    const faces = new Map<number, Face>()
    const todo = shuffled(pairs)
    let ok = true
    while (left.size) {
      const free = [...left].filter((i) => isFree(i, left))
      if (free.length < 2) {
        ok = false
        break
      }
      // Prefer high places first now and then, so the top doesn't always end up easy
      const pick = shuffled(free).slice(0, 2)
      const [a, b] = todo.pop()!
      faces.set(pick[0], a)
      faces.set(pick[1], b)
      pick.forEach((i) => left.delete(i))
    }
    if (ok) return faces
  }
  return null
}

type Stone = { pos: number; face: Face; gone: boolean }

function newGame(): Stone[] {
  const faces = solvable(
    POSITIONS.map((_, i) => i),
    allPairs(),
  )!
  return POSITIONS.map((_, i) => ({ pos: i, face: faces.get(i)!, gone: false }))
}

// ------------------------------------------------------------------ drawing a stone

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
const WINDS = [
  ['東', 'O'],
  ['南', 'Z'],
  ['西', 'W'],
  ['北', 'N'],
]
const FLOWERS: [FarmIconName, string][] = [
  ['flower', 'Bloem'],
  ['cactus', 'Cactus'],
  ['acorn', 'Eikel'],
  ['butterfly', 'Vlinder'],
]
const SEASONS: [FarmIconName, string][] = [
  ['leaf_plant', 'Lente'],
  ['weather_sun', 'Zomer'],
  ['tree_red', 'Herfst'],
  ['weather_snow', 'Winter'],
]

/** Where the dots or sticks go for 1 to 9 (in a 40×52 stone). */
const SPOTS: Record<number, [number, number][]> = {
  1: [[20, 26]],
  2: [
    [20, 14],
    [20, 38],
  ],
  3: [
    [10, 12],
    [20, 26],
    [30, 40],
  ],
  4: [
    [12, 15],
    [28, 15],
    [12, 37],
    [28, 37],
  ],
  5: [
    [11, 13],
    [29, 13],
    [20, 26],
    [11, 39],
    [29, 39],
  ],
  6: [
    [13, 11],
    [27, 11],
    [13, 26],
    [27, 26],
    [13, 41],
    [27, 41],
  ],
  7: [
    [9, 9],
    [20, 13],
    [31, 17],
    [13, 31],
    [27, 31],
    [13, 43],
    [27, 43],
  ],
  8: [
    [12, 8],
    [28, 8],
    [12, 20],
    [28, 20],
    [12, 32],
    [28, 32],
    [12, 44],
    [28, 44],
  ],
  9: [
    [9, 10],
    [20, 10],
    [31, 10],
    [9, 26],
    [20, 26],
    [31, 26],
    [9, 42],
    [20, 42],
    [31, 42],
  ],
}
const DOT_COLOURS = ['#2b6cb0', '#2f855a', '#c53030']

function StoneFace({ face }: { face: Face }) {
  const kind = face[0]
  const n = Number(face.slice(1))
  if (kind === 's') {
    const r = n === 1 ? 11 : n <= 4 ? 7 : n <= 6 ? 6 : 5
    return (
      <svg viewBox="0 0 40 52" aria-hidden="true">
        {SPOTS[n].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill="none" stroke={DOT_COLOURS[(i + n) % 3]} strokeWidth={r * 0.45} />
            <circle cx={x} cy={y} r={r * 0.35} fill={DOT_COLOURS[(i + n + 1) % 3]} />
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 'b') {
    if (n === 1)
      return (
        <svg viewBox="0 0 40 52" aria-hidden="true">
          {/* One bamboo: traditionally a bird */}
          <ellipse cx="20" cy="30" rx="9" ry="12" fill="#2f855a" />
          <circle cx="22" cy="15" r="6" fill="#c53030" />
          <path d="M27 15 l6 -2 l-5 5 z" fill="#d69e2e" />
          <path d="M12 38 q-6 6 -2 10 q4 -4 8 -8 z" fill="#2b6cb0" />
        </svg>
      )
    return (
      <svg viewBox="0 0 40 52" aria-hidden="true">
        {SPOTS[n].map(([x, y], i) => (
          <g key={i}>
            <rect x={x - 2.4} y={y - 7} width="4.8" height="14" rx="2" fill={i % 3 === 0 && n > 3 ? '#c53030' : '#2f855a'} />
            <rect x={x - 3} y={y - 1} width="6" height="2" fill="#1c4532" />
          </g>
        ))}
      </svg>
    )
  }
  if (kind === 't')
    return (
      <span className="mj-chars">
        <b>{NUMERALS[n - 1]}</b>
        <i>萬</i>
        <small>{n}</small>
      </span>
    )
  if (kind === 'w')
    return (
      <span className="mj-chars wind">
        <b>{WINDS[n][0]}</b>
        <small>{WINDS[n][1]}</small>
      </span>
    )
  if (kind === 'd')
    return n === 2 ? (
      <span className="mj-white" aria-hidden="true" />
    ) : (
      <span className={n === 0 ? 'mj-chars dragon red' : 'mj-chars dragon green'}>
        <b>{n === 0 ? '中' : '發'}</b>
      </span>
    )
  const [icon, label] = (kind === 'f' ? FLOWERS : SEASONS)[n]
  return (
    <span className={`mj-picture ${kind === 'f' ? 'flower' : 'season'}`}>
      <FarmIcon name={icon} size={32} />
      <small>{label}</small>
    </span>
  )
}

const faceName = (f: Face) => {
  const n = Number(f.slice(1))
  switch (f[0]) {
    case 's':
      return `${n} stippen`
    case 'b':
      return `${n} bamboe`
    case 't':
      return `${n} tekens`
    case 'w':
      return ['Oostenwind', 'Zuidenwind', 'Westenwind', 'Noordenwind'][n]
    case 'd':
      return ['Rode draak', 'Groene draak', 'Witte draak'][n]
    case 'f':
      return FLOWERS[n][1]
    default:
      return SEASONS[n][1]
  }
}

// ------------------------------------------------------------------ the game

/** The time, for the event handlers (the clock on screen ticks with `now`). */
const clock = () => Date.now()

export function Mahjong({ onFinish }: { onFinish: (result: { score: number; won: boolean; details: Record<string, number> }) => void }) {
  const [stones, setStones] = useState<Stone[]>(newGame)
  const [picked, setPicked] = useState<number | null>(null)
  const [history, setHistory] = useState<[number, number][]>([])
  const [hint, setHint] = useState<[number, number] | null>(null)
  const [score, setScore] = useState(0)
  const [started, setStarted] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [used, setUsed] = useState({ hints: 0, shuffles: 0 })
  const [done, setDone] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const hintTimer = useRef<number | undefined>(undefined)
  const [tw, setTw] = useState(44)

  // Stones as big as fit
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setTw(Math.max(20, Math.min(48, (el.clientWidth - 24) / 15.4))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!started || done) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [started, done])

  const present = useMemo(() => new Set(stones.filter((s) => !s.gone).map((s) => s.pos)), [stones])
  const free = useMemo(() => new Set([...present].filter((i) => isFree(i, present))), [present])
  // All pairs that can be taken now
  const moves = useMemo(() => {
    const byKey = new Map<string, number[]>()
    for (const i of free) {
      const k = keyOf(stones[i].face)
      byKey.set(k, [...(byKey.get(k) ?? []), i])
    }
    return [...byKey.values()].filter((l) => l.length >= 2)
  }, [free, stones])
  const left = present.size
  const stuck = left > 0 && moves.length === 0
  const seconds = started ? Math.max(0, Math.floor((now - started) / 1000)) : 0

  const take = (a: number, b: number) => {
    const next = stones.map((s) => (s.pos === a || s.pos === b ? { ...s, gone: true } : s))
    setStones(next)
    setHistory((h) => [...h, [a, b]])
    setPicked(null)
    setHint(null)
    const gained = 10 + (keyOf(stones[a].face).length === 1 ? 10 : 0)
    const nextScore = score + gained
    setScore(nextScore)
    playCardPlace()
    const at = clock()
    if (!started) {
      setStarted(at)
      setNow(at)
    }
    if (next.every((s) => s.gone)) {
      const secs = Math.max(1, Math.floor((at - (started ?? at)) / 1000))
      const bonus = Math.max(0, 3000 - secs * 3) - used.hints * 50 - used.shuffles * 200
      const final = Math.max(0, nextScore + bonus)
      setScore(final)
      setDone(true)
      setNow(at)
      playGood()
      onFinish({ score: final, won: true, details: { seconds: secs, hints: used.hints, shuffles: used.shuffles } })
    }
  }

  const click = (i: number) => {
    if (done || !free.has(i)) {
      playWrong()
      return
    }
    if (picked === null || picked === i) return setPicked(picked === i ? null : i)
    if (keyOf(stones[picked].face) === keyOf(stones[i].face)) take(picked, i)
    else setPicked(i)
  }

  const undo = () => {
    const last = history[history.length - 1]
    if (!last || done) return
    setStones((all) => all.map((s) => (last.includes(s.pos) ? { ...s, gone: false } : s)))
    setHistory((h) => h.slice(0, -1))
    setScore((s) => Math.max(0, s - 20))
    setPicked(null)
  }

  const showHint = () => {
    if (!moves.length) return
    setHint([moves[0][0], moves[0][1]])
    setUsed((u) => ({ ...u, hints: u.hints + 1 }))
    // A new hint gets its own 2.5 seconds
    window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 2500)
  }

  /** Stuck: the stones that are left get shuffled over the same places (so that it can be finished again). */
  const shuffle = () => {
    const places = [...present]
    const faces = stones.filter((s) => !s.gone).map((s) => s.face)
    // Make pairs of what's left: same faces together (flowers with flowers, seasons with seasons)
    const byKey = new Map<string, Face[]>()
    for (const f of faces) byKey.set(keyOf(f), [...(byKey.get(keyOf(f)) ?? []), f])
    const pairs: [Face, Face][] = []
    for (const list of byKey.values()) for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]])
    const laid = solvable(places, pairs)
    if (!laid) return
    setStones((all) => all.map((s) => (s.gone ? s : { ...s, face: laid.get(s.pos)! })))
    setUsed((u) => ({ ...u, shuffles: u.shuffles + 1 }))
    setHistory([])
    setPicked(null)
  }

  const restart = () => {
    if (history.length && !done) onFinish({ score, won: false, details: { seconds, hints: used.hints, shuffles: used.shuffles, left } })
    setStones(newGame())
    setPicked(null)
    setHistory([])
    setScore(0)
    setStarted(null)
    setUsed({ hints: 0, shuffles: 0 })
    setDone(false)
  }

  const th = tw * 1.3
  const depth = tw * 0.13
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="mj">
      <div className="pt-bar">
        <span>
          <b>{score}</b> punten
        </span>
        <span>{left} stenen over</span>
        <span>{moves.length} paren mogelijk</span>
        <span>
          <FarmIcon name="clock" /> {mm}:{ss}
        </span>
        <span className="pt-bar-buttons">
          <Button onClick={showHint} disabled={!moves.length || done}>
            <FarmIcon name="lightbulb" /> Hint
          </Button>
          <Button onClick={undo} disabled={!history.length || done}>
            <FarmIcon name="arrow_undo" /> Ongedaan maken
          </Button>
          <Button onClick={restart}>
            <FarmIcon name="arrow_refresh" /> Nieuw spel
          </Button>
        </span>
      </div>
      <div className="mj-table" ref={box}>
        <div className="mj-board" style={{ width: tw * 15 + depth * 5, height: th * 8 + depth * 5, '--tw': `${tw}px`, '--th': `${th}px` } as CSSProperties}>
          {stones.map((s) => {
            if (s.gone) return null
            const p = POSITIONS[s.pos]
            const isFreeNow = free.has(s.pos)
            return (
              <button
                key={s.pos}
                type="button"
                className={['mj-stone', isFreeNow && 'free', picked === s.pos && 'picked', hint?.includes(s.pos) && 'hint'].filter(Boolean).join(' ')}
                style={{ left: p.x * tw + depth * (5 - p.z), top: p.y * th + depth * (5 - p.z), zIndex: p.z * 10000 + Math.round(p.y * 100) + Math.round(p.x * 2) } as CSSProperties}
                onClick={() => click(s.pos)}
                aria-label={`${faceName(s.face)}${isFreeNow ? '' : ' (ligt vast)'}`}
              >
                <StoneFace face={s.face} />
              </button>
            )
          })}
        </div>
        {stuck && !done && (
          <div className="bs-overlay mj-overlay">
            <b>Geen paren meer</b>
            <span>Schud de stenen die over zijn, of maak een zet ongedaan.</span>
            <span className="account-actions">
              <Button variant="cta" onClick={shuffle}>
                <FarmIcon name="arrow_refresh" /> Schudden
              </Button>
              <Button onClick={undo} disabled={!history.length}>
                Ongedaan maken
              </Button>
            </span>
          </div>
        )}
        {done && (
          <div className="bs-overlay mj-overlay">
            <b>Opgeruimd!</b>
            <span>
              {score} punten in {mm}:{ss}
            </span>
            <Button variant="cta" onClick={restart}>
              Nog een keer
            </Button>
          </div>
        )}
      </div>
      <p className="muted bs-help">Klik twee gelijke stenen die vrij liggen: er ligt niets op, en links of rechts ligt niets naast. Vrije stenen zijn lichter.</p>
    </div>
  )
}
