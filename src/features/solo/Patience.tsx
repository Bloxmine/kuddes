/**
 * Patience (Klondike), in the browser: seven columns on the table, the stock
 * and the waste, and four foundations to build from ace to king by suit.
 * Drag cards (or click one: it goes where it fits), undo, draw one or three,
 * and Windows-style scoring. Winning sets off the bouncing cards.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { CardSpot, PlayingCard } from '../games/PlayingCard'
import { SUIT_SYMBOLS, isRed, rankText } from '../games/cards'
import { playCardDraw, playCardFlip, playCardPlace, playGood, playWrong } from '../games/sounds'
import './Patience.css'

type Card = { id: number; suit: number; rank: number; up: boolean }
type Pile = { kind: 'tableau' | 'foundation'; i: number } | { kind: 'waste' } | { kind: 'stock' }
type State = { tableau: Card[][]; foundations: Card[][]; stock: Card[]; waste: Card[]; score: number; moves: number; passes: number }

const SCORE = { wasteToTableau: 5, toFoundation: 10, flip: 5, fromFoundation: -15 }

function newDeal(): State {
  const deck: Card[] = []
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) deck.push({ id: suit * 13 + rank, suit, rank, up: false })
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const tableau: Card[][] = []
  for (let col = 0; col < 7; col++) {
    const pile = deck.splice(0, col + 1)
    pile[pile.length - 1].up = true
    tableau.push(pile)
  }
  return { tableau, foundations: [[], [], [], []], stock: deck, waste: [], score: 0, moves: 0, passes: 0 }
}

const top = <T,>(a: T[]) => a[a.length - 1]
const clone = (s: State): State => structuredClone(s)

const fitsTableau = (card: Card, pile: Card[]) => {
  const t = top(pile)
  return t ? t.up && isRed(t.suit) !== isRed(card.suit) && t.rank === card.rank + 1 : card.rank === 13
}
const fitsFoundation = (card: Card, pile: Card[]) => {
  const t = top(pile)
  return t ? t.suit === card.suit && t.rank === card.rank - 1 : card.rank === 1
}

/** The cards picked up from a pile (from index `at` on), or null when they can't be. */
function pickUp(s: State, from: Pile, at: number): Card[] | null {
  if (from.kind === 'waste') return s.waste.length && at === s.waste.length - 1 ? [top(s.waste)] : null
  if (from.kind === 'foundation') {
    const f = s.foundations[from.i]
    return f.length && at === f.length - 1 ? [top(f)] : null
  }
  if (from.kind === 'tableau') {
    const col = s.tableau[from.i]
    return col[at]?.up ? col.slice(at) : null
  }
  return null
}

/** Moves the cards; returns the new state, or null when it isn't allowed. */
function move(s: State, from: Pile, at: number, to: Pile): State | null {
  const cards = pickUp(s, from, at)
  if (!cards || (to.kind === from.kind && 'i' in to && 'i' in from && to.i === from.i)) return null
  if (to.kind === 'foundation') {
    if (cards.length !== 1 || !fitsFoundation(cards[0], s.foundations[to.i])) return null
  } else if (to.kind === 'tableau') {
    if (!fitsTableau(cards[0], s.tableau[to.i])) return null
  } else return null
  const n = clone(s)
  if (from.kind === 'waste') n.waste.pop()
  else if (from.kind === 'foundation') n.foundations[from.i].pop()
  else if (from.kind === 'tableau') n.tableau[from.i].splice(at)
  if (to.kind === 'foundation') n.foundations[to.i].push(...cards)
  else n.tableau[to.i].push(...cards)
  // Points like Windows had them
  if (to.kind === 'foundation' && from.kind !== 'foundation') n.score += SCORE.toFoundation
  if (from.kind === 'waste' && to.kind === 'tableau') n.score += SCORE.wasteToTableau
  if (from.kind === 'foundation' && to.kind === 'tableau') n.score += SCORE.fromFoundation
  if (from.kind === 'tableau') {
    const t = top(n.tableau[from.i])
    if (t && !t.up) {
      t.up = true
      n.score += SCORE.flip
    }
  }
  n.score = Math.max(0, n.score)
  n.moves++
  return n
}

/** Where a card goes when you click it: a foundation first, then a column. */
function autoTarget(s: State, from: Pile, at: number): Pile | null {
  const cards = pickUp(s, from, at)
  if (!cards) return null
  if (cards.length === 1 && from.kind !== 'foundation') {
    const f = s.foundations.findIndex((p) => fitsFoundation(cards[0], p))
    if (f >= 0) return { kind: 'foundation', i: f }
  }
  // A column with cards before an empty one (a king to an empty column only if it isn't there already)
  const order = s.tableau.map((col, i) => ({ col, i })).sort((a, b) => Number(a.col.length === 0) - Number(b.col.length === 0))
  for (const { i } of order) {
    if (from.kind === 'tableau' && from.i === i) continue
    if (cards[0].rank === 13 && from.kind === 'tableau' && at === 0) continue
    if (fitsTableau(cards[0], s.tableau[i])) return { kind: 'tableau', i }
  }
  return null
}

const won = (s: State) => s.foundations.every((f) => f.length === 13)
const allOpen = (s: State) => s.stock.length === 0 && s.waste.length === 0 && s.tableau.every((col) => col.every((c) => c.up))

// ------------------------------------------------------------------ the win: bouncing cards

/** Cards jump off the foundations and bounce across the screen, leaving a trail, like on Windows. */
function Bounce({ foundations, onDone }: { foundations: Card[][]; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const rect = c.parentElement!.getBoundingClientRect()
    c.width = rect.width
    c.height = rect.height
    const w = Math.min(72, rect.width / 9)
    const h = w * 1.4
    // Kings first, then down to the aces, one card at a time from each foundation
    const queue: { card: Card; x: number }[] = []
    for (let rank = 13; rank >= 1; rank--)
      foundations.forEach((f, i) => {
        const card = f.find((x) => x.rank === rank)
        if (card) queue.push({ card, x: rect.width - (4 - i) * (w + 8) - 8 })
      })
    let current: { card: Card; x: number; y: number; vx: number; vy: number } | null = null
    let frame = 0
    const draw = (card: Card, x: number, y: number) => {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#999'
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 6)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = isRed(card.suit) ? '#c8161d' : '#1d1d1d'
      ctx.font = `bold ${w * 0.22}px Georgia, serif`
      ctx.fillText(rankText(card.rank), x + w * 0.08, y + w * 0.26)
      ctx.font = `${w * 0.5}px Georgia, serif`
      ctx.fillText(SUIT_SYMBOLS[card.suit], x + w * 0.3, y + h * 0.62)
    }
    const step = () => {
      frame = requestAnimationFrame(step)
      if (!current) {
        const next = queue.shift()
        if (!next) {
          cancelAnimationFrame(frame)
          window.setTimeout(onDone, 1200)
          return
        }
        current = { card: next.card, x: next.x, y: 8, vx: -(2 + Math.random() * 5) * (Math.random() < 0.2 ? -1 : 1), vy: -Math.random() * 6 }
      }
      current.vy += 0.5
      current.x += current.vx
      current.y += current.vy
      if (current.y + h > c.height) {
        current.y = c.height - h
        current.vy *= -0.75
      }
      draw(current.card, current.x, current.y)
      if (current.x < -w || current.x > c.width + w) current = null
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [foundations, onDone])
  return <canvas ref={canvas} className="pt-bounce" onClick={onDone} aria-hidden="true" />
}

// ------------------------------------------------------------------ the table

type Drag = { from: Pile; at: number; cards: Card[]; x: number; y: number; dx: number; dy: number; moved: boolean }

export function Patience({ onFinish }: { onFinish: (result: { score: number; won: boolean; details: Record<string, number> }) => void }) {
  const [draw, setDraw] = useState<1 | 3>(() => (localStorage.getItem('kuddes.patience.draw') === '3' ? 3 : 1))
  const [state, setState] = useState<State>(newDeal)
  const [history, setHistory] = useState<State[]>([])
  const [started, setStarted] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [drag, setDrag] = useState<Drag | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [finished, setFinished] = useState(false)
  const seconds = started ? Math.floor(((finished ? now : Date.now()) - started) / 1000) : 0

  useEffect(() => {
    if (!started || finished) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [started, finished])

  const apply = useCallback(
    (next: State | null, sound: 'place' | 'flip' | 'draw' = 'place') => {
      if (!next) {
        playWrong()
        return false
      }
      setHistory((h) => [...h.slice(-199), state])
      setState(next)
      if (!started) setStarted(Date.now())
      if (sound === 'draw') playCardDraw()
      else if (next.foundations.flat().length > state.foundations.flat().length) playCardFlip()
      else playCardPlace()
      if (won(next) && !finished) {
        const secs = Math.max(1, Math.floor((Date.now() - (started ?? Date.now())) / 1000))
        // Time bonus like Windows: quicker is better
        const bonus = secs >= 30 ? Math.round(700_000 / secs) : 0
        const score = Math.min(20_000, next.score + bonus)
        setState({ ...next, score })
        setFinished(true)
        setNow(Date.now())
        setCelebrate(true)
        playGood()
        onFinish({ score, won: true, details: { moves: next.moves, seconds: secs, draw } })
      }
      return true
    },
    [state, started, finished, draw, onFinish],
  )

  const deal = () => {
    // A game that was going counts as played (not won)
    if (state.moves > 0 && !finished) onFinish({ score: state.score, won: false, details: { moves: state.moves, seconds, draw } })
    setState(newDeal())
    setHistory([])
    setStarted(null)
    setFinished(false)
    setCelebrate(false)
  }

  const turnStock = () => {
    if (finished) return
    const n = clone(state)
    if (!n.stock.length) {
      if (!n.waste.length) return
      n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }))
      n.waste = []
      n.passes++
      n.score = Math.max(0, n.score - (draw === 1 ? 100 : 20))
    } else {
      const drawn = n.stock.splice(-draw).reverse()
      n.waste.push(...drawn.map((c) => ({ ...c, up: true })))
    }
    n.moves++
    apply(n, 'draw')
  }

  const click = (from: Pile, at: number) => {
    const to = autoTarget(state, from, at)
    if (to) apply(move(state, from, at, to))
    else playWrong()
  }

  /** Everything that can go to the foundations, goes (once every card is open). */
  const finishUp = () => {
    let s = state
    for (let guard = 0; guard < 60 && !won(s); guard++) {
      let moved = false
      for (let i = 0; i < 7 && !moved; i++) {
        const col = s.tableau[i]
        if (!col.length) continue
        const f = s.foundations.findIndex((p) => fitsFoundation(top(col), p))
        if (f >= 0) {
          s = move(s, { kind: 'tableau', i }, col.length - 1, { kind: 'foundation', i: f })!
          moved = true
        }
      }
      if (!moved) break
    }
    apply(s)
  }

  // Dragging: a copy of the cards follows the pointer; where it's let go decides
  const startDrag = (e: ReactPointerEvent, from: Pile, at: number) => {
    if (finished || e.button !== 0) return
    const cards = pickUp(state, from, at)
    if (!cards) return
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDrag({ from, at, cards, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false })
  }
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => setDrag((d) => d && { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4 })
    const onUp = (e: PointerEvent) => {
      const d = drag
      setDrag(null)
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4) return click(d.from, d.at)
      const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => (x as HTMLElement).dataset?.pile) as HTMLElement | undefined
      const target = el?.dataset.pile
      if (!target) return
      const [kind, i] = target.split(':')
      apply(move(state, d.from, d.at, { kind: kind as 'tableau' | 'foundation', i: Number(i) }))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follows the drag that started
  }, [drag?.from, drag?.at, drag !== null])

  const dragging = (pile: Pile, at: number) => !!drag?.moved && JSON.stringify(drag.from) === JSON.stringify(pile) && at >= drag.at
  const wasteShown = draw === 3 ? state.waste.slice(-3) : state.waste.slice(-1)
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="pt">
      <div className="pt-bar">
        <span>
          <b>{state.score}</b> punten
        </span>
        <span>{state.moves} zetten</span>
        <span>
          <FarmIcon name="clock" /> {mm}:{ss}
        </span>
        <span className="pt-bar-buttons">
          <label className="pt-draw">
            <select
              className="text-box"
              value={draw}
              onChange={(e) => {
                const d = Number(e.target.value) as 1 | 3
                setDraw(d)
                try {
                  localStorage.setItem('kuddes.patience.draw', String(d))
                } catch {
                  // only for now then
                }
              }}
              aria-label="Kaarten per keer van de stapel"
            >
              <option value={1}>1 kaart omdraaien</option>
              <option value={3}>3 kaarten omdraaien</option>
            </select>
          </label>
          <Button onClick={() => history.length && (setState(top(history)), setHistory((h) => h.slice(0, -1)))} disabled={!history.length || finished}>
            <FarmIcon name="arrow_undo" /> Ongedaan maken
          </Button>
          <Button onClick={deal}>
            <FarmIcon name="arrow_refresh" /> Nieuw spel
          </Button>
        </span>
      </div>

      <div className="pt-table" style={{ touchAction: drag ? 'none' : undefined }}>
        <div className="pt-top">
          <button type="button" className="pt-stock" onClick={turnStock} aria-label={state.stock.length ? `Stapel (${state.stock.length} kaarten): omdraaien` : 'Stapel is leeg: afleggers terugleggen'} disabled={finished}>
            {state.stock.length ? <PlayingCard rank={1} suit={0} faceUp={false} /> : <CardSpot className="pt-recycle">↻</CardSpot>}
          </button>
          <div className={`pt-waste n${wasteShown.length}`}>
            {wasteShown.length === 0 && <CardSpot />}
            {wasteShown.map((c, i) => {
              const isTop = i === wasteShown.length - 1
              return (
                <span key={c.id} className="pt-waste-card" style={{ '--i': i } as React.CSSProperties}>
                  {isTop ? (
                    <span className={dragging({ kind: 'waste' }, state.waste.length - 1) ? 'pt-grab lifted' : 'pt-grab'} onPointerDown={(e) => startDrag(e, { kind: 'waste' }, state.waste.length - 1)}>
                      <PlayingCard rank={c.rank} suit={c.suit} />
                    </span>
                  ) : (
                    <PlayingCard rank={c.rank} suit={c.suit} />
                  )}
                </span>
              )
            })}
          </div>
          <span className="pt-gap" />
          {state.foundations.map((f, i) => (
            <div key={i} className="pt-foundation" data-pile={`foundation:${i}`}>
              {f.length ? (
                <span className={dragging({ kind: 'foundation', i }, f.length - 1) ? 'pt-grab lifted' : 'pt-grab'} onPointerDown={(e) => startDrag(e, { kind: 'foundation', i }, f.length - 1)}>
                  <PlayingCard rank={top(f).rank} suit={top(f).suit} />
                </span>
              ) : (
                <CardSpot className="pt-ace">A</CardSpot>
              )}
            </div>
          ))}
        </div>

        <div className="pt-columns">
          {state.tableau.map((col, i) => (
            <div key={i} className="pt-column" data-pile={`tableau:${i}`}>
              {col.length === 0 && <CardSpot />}
              {col.map((c, k) => (
                <span
                  key={c.id}
                  className={['pt-stack-card', c.up ? 'up' : 'down', dragging({ kind: 'tableau', i }, k) && 'lifted'].filter(Boolean).join(' ')}
                  style={{ '--k': k, '--down': col.slice(0, k).filter((x) => !x.up).length } as React.CSSProperties}
                  onPointerDown={c.up ? (e) => startDrag(e, { kind: 'tableau', i }, k) : undefined}
                >
                  <PlayingCard rank={c.rank} suit={c.suit} faceUp={c.up} />
                </span>
              ))}
            </div>
          ))}
        </div>

        {drag?.moved && (
          <div className="pt-drag" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy }} aria-hidden="true">
            {drag.cards.map((c, k) => (
              <span key={c.id} className="pt-stack-card up" style={{ '--k': k, '--down': 0 } as React.CSSProperties}>
                <PlayingCard rank={c.rank} suit={c.suit} />
              </span>
            ))}
          </div>
        )}
        {celebrate && <Bounce foundations={state.foundations} onDone={() => setCelebrate(false)} />}
      </div>

      {allOpen(state) && !finished && (
        <p className="pt-finish">
          <Button variant="cta" onClick={finishUp}>
            <FarmIcon name="lightning" /> Alles open: automatisch afmaken
          </Button>
        </p>
      )}
      {finished && (
        <p className="pt-won">
          <FarmIcon name="cup_gold" size={24} /> Uitgespeeld in {state.moves} zetten en {mm}:{ss}, met {state.score} punten!{' '}
          <Button variant="cta" onClick={deal}>
            Nog een keer
          </Button>
        </p>
      )}
    </div>
  )
}
