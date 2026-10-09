import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { STORE, applyMove, legalMoves, opposite, ownerOf, pitsOf, type MancalaState, type Player } from '../../../shared/mancala'
import type { TurnBoardProps } from './turnBoard'
import { playCapture, playDrop, playPickUp } from './sounds'

/** Marble colours: glass in the logo's colours and a few more. */
const MARBLES = ['#4ba3e0', '#f26b6b', '#5fc39a', '#8b7fd6', '#f5b942', '#e0679a', '#3fc1c9', '#ff8a3d']

/** A fixed, random-looking spot for marble i in a pit, so marbles don't jump around. */
function spot(pit: number, i: number, store: boolean) {
  const seed = Math.sin(pit * 97.13 + i * 13.37) * 10000
  const r = seed - Math.floor(seed)
  const seed2 = Math.sin(pit * 31.7 + i * 71.9) * 10000
  const r2 = seed2 - Math.floor(seed2)
  // Rings from the middle outwards; stores are tall, so spread them up and down
  const ring = Math.floor(Math.sqrt(i))
  const angle = (i * 2.399 + r * 0.8) % (Math.PI * 2)
  // In marble units (--mc-u), so bigger marbles lie further apart
  const dist = Math.min(ring * 8 + r2 * 3, 21)
  return {
    left: `calc(50% + ${(Math.cos(angle) * dist * (store ? 0.75 : 1)).toFixed(2)}px * var(--mc-spread, var(--mc-u)))`,
    top: `calc(50% + ${(Math.sin(angle) * dist * (store ? 2.6 : 1)).toFixed(2)}px * var(--mc-spread, var(--mc-u)))`,
    background: MARBLES[(pit * 3 + i) % MARBLES.length],
  }
}

function Marbles({ pit, n, store }: { pit: number; n: number; store: boolean }) {
  const shown = Math.min(n, store ? 36 : 18)
  return (
    <>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="mc-marble" style={spot(pit, i, store) as CSSProperties} />
      ))}
    </>
  )
}

/** A marble on its way from one pit (or store) to another. */
export type Flight = { id: number; from: number; to: number; color: string; ms: number; delay: number }

/**
 * One flying marble: from the middle of one pit to the middle of the other,
 * in an arc, a little bigger at the top as if it's lifted.
 */
function FlyingMarble({ flight, board, slots }: { flight: Flight; board: RefObject<HTMLDivElement | null>; slots: RefObject<Record<number, HTMLElement | null>> }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = board.current?.getBoundingClientRect()
    const from = slots.current[flight.from]?.getBoundingClientRect()
    const to = slots.current[flight.to]?.getBoundingClientRect()
    if (!el || !box || !from || !to) return
    const a = { x: from.left + from.width / 2 - box.left, y: from.top + from.height / 2 - box.top }
    const z = { x: to.left + to.width / 2 - box.left, y: to.top + to.height / 2 - box.top }
    const lift = Math.min(46, 18 + Math.hypot(z.x - a.x, z.y - a.y) / 5)
    const at = (x: number, y: number, scale: number) => `translate(${x}px, ${y}px) scale(${scale})`
    const animation = el.animate(
      [
        { transform: at(a.x, a.y, 1), opacity: 1 },
        { transform: at((a.x + z.x) / 2, (a.y + z.y) / 2 - lift, 1.4), offset: 0.5 },
        { transform: at(z.x, z.y, 1), opacity: 1 },
      ],
      { duration: flight.ms, delay: flight.delay, easing: 'cubic-bezier(0.45, 0, 0.55, 1)', fill: 'both' },
    )
    return () => animation.cancel()
  }, [flight, board, slots])
  return <span ref={ref} className="mc-marble mc-flying" style={{ background: flight.color }} aria-hidden="true" />
}

type BoardProps = {
  pits: number[]
  /** Your side is at the bottom. */
  me: Player
  turn: Player
  /** Pits you may pick now (empty when it's not your turn). */
  playable: number[]
  /** Where the last seeds landed, and the pit being sown from. */
  trail: number[]
  from: number | null
  over: boolean
  onPick: (pit: number) => void
  /** Marbles in the air right now. */
  flights?: Flight[]
}

export function MancalaBoard({ pits, me, turn, playable, trail, from, over, onPick, flights = [] }: BoardProps) {
  const them: Player = me === 0 ? 1 : 0
  const board = useRef<HTMLDivElement>(null)
  // Every pit and store, so a flying marble knows where to go
  const slots = useRef<Record<number, HTMLElement | null>>({})
  const slot = (i: number) => (el: HTMLElement | null) => {
    slots.current[i] = el
  }
  const bottom = pitsOf(me)
  // Counter-clockwise: the opponent's pits run right to left along the top
  const top = [...pitsOf(them)].reverse()
  const pit = (i: number, side: 'top' | 'bottom') => {
    const canPick = playable.includes(i)
    const className = ['mc-pit', side, canPick && 'playable', trail.includes(i) && 'trail', from === i && 'from'].filter(Boolean).join(' ')
    return (
      <button
        key={i}
        ref={slot(i)}
        type="button"
        className={className}
        disabled={!canPick}
        onClick={() => onPick(i)}
        aria-label={`${side === 'bottom' ? 'Jouw' : 'Tegenstander'} kuiltje met ${pits[i]} knikkers${canPick ? ', kies dit kuiltje' : ''}`}
      >
        <Marbles pit={i} n={pits[i]} store={false} />
        <span className="mc-count">{pits[i]}</span>
      </button>
    )
  }
  const store = (p: Player, side: 'left' | 'right') => (
    <div ref={slot(STORE[p])} className={['mc-store', side, p === me ? 'mine' : 'theirs', trail.includes(STORE[p]) && 'trail'].filter(Boolean).join(' ')} aria-label={`${p === me ? 'Jouw' : 'Hun'} pot: ${pits[STORE[p]]}`}>
      <Marbles pit={STORE[p]} n={pits[STORE[p]]} store />
      <span className="mc-count big">{pits[STORE[p]]}</span>
    </div>
  )
  return (
    <div ref={board} className={['mc-board', over ? 'over' : turn === me ? 'my-turn' : 'their-turn'].join(' ')}>
      {store(them, 'left')}
      <div className="mc-rows">
        <div className="mc-row">{top.map((i) => pit(i, 'top'))}</div>
        <div className="mc-row">{bottom.map((i) => pit(i, 'bottom'))}</div>
      </div>
      {store(me, 'right')}
      {flights.map((f) => (
        <FlyingMarble key={f.id} flight={f} board={board} slots={slots} />
      ))}
    </div>
  )
}

/** How long a marble is in the air; long sowings go a bit quicker. */
const flyMs = (seeds: number) => Math.round(Math.max(170, Math.min(300, 3600 / seeds)))
/** At most this many marbles fly at once when a pit is emptied into a store. */
const MAX_SWEEP = 8

type Anim = { pits: number[]; trail: number[]; from: number | null; flights: Flight[] }

/**
 * The board in a game: shows each new move marble by marble (the shell only
 * hands over the new state): they fly from pit to pit as they're sown, and
 * into the store when they're captured or when the game ends. Takes your
 * picks when it's your turn.
 */
export function MancalaPlay({ state, my, myTurn, onMove, finished }: TurnBoardProps<MancalaState, number>) {
  const [anim, setAnim] = useState<Anim | null>(null)
  const [trail, setTrail] = useState<number[]>([])
  const prev = useRef(state)
  const flightId = useRef(0)

  useEffect(() => {
    const before = prev.current
    prev.current = state
    const timers: number[] = []
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
    if (state.moves.length === before.moves.length + 1 && !document.documentElement.hasAttribute('data-reduce-motion')) {
      const pit = state.moves[state.moves.length - 1]
      const mover = before.turn
      const result = applyMove(before, pit)
      const pits = [...before.pits]
      const colorOf = (n: number) => MARBLES[(pit * 3 + n) % MARBLES.length]
      const fly = (from: number, to: number, n: number, ms: number, delay = 0): Flight => ({ id: ++flightId.current, from, to, color: colorOf(n), ms, delay })
      const ms = flyMs(result.path.length)
      const isStore = (i: number) => i === STORE[0] || i === STORE[1]
      playPickUp(pits[pit])
      pits[pit] = 0

      // Sowing: the hand goes round, dropping one marble in each pit
      let t = 0
      result.path.forEach((at, i) => {
        const from = i === 0 ? pit : result.path[i - 1]
        later(t, () => setAnim({ pits: [...pits], trail: result.path.slice(0, i), from: pit, flights: [fly(from, at, i, ms)] }))
        t += ms
        later(t, () => {
          pits[at]++
          playDrop(isStore(at))
          setAnim({ pits: [...pits], trail: result.path.slice(0, i + 1), from: pit, flights: [] })
        })
      })

      // Then whatever ends up in a store: a capture, or the rest at the end of the game
      const last = result.path[result.path.length - 1]
      const afterSow = [...before.pits]
      afterSow[pit] = 0
      for (const at of result.path) afterSow[at]++
      const sweeps: Flight[] = []
      const moved = new Map<number, number>()
      afterSow.forEach((n, i) => {
        if (i === STORE[0] || i === STORE[1] || n <= result.state.pits[i]) return
        const count = n - result.state.pits[i]
        // A capture goes to the mover's store; at the end, each side's marbles go to their owner
        const to = result.captured > 0 && (i === last || i === opposite(last)) ? STORE[mover] : STORE[ownerOf(i)]
        moved.set(i, count)
        for (let k = 0; k < Math.min(count, MAX_SWEEP); k++) sweeps.push(fly(i, to, i + k, 420, k * 60))
      })
      if (sweeps.length) {
        t += 150
        later(t, () => {
          const lifted = [...pits]
          for (const [i] of moved) lifted[i] = 0
          if (result.captured > 0) playCapture()
          setAnim({ pits: lifted, trail: result.path, from: null, flights: sweeps })
        })
        for (const f of sweeps) later(t + f.delay + f.ms, () => playDrop(true))
        t += 420 + 60 * Math.min(MAX_SWEEP - 1, Math.max(...[...moved.values()].map((n) => n - 1)))
      }
      later(t + 80, () => {
        setAnim(null)
        setTrail(result.path)
      })
    } else {
      // Without animations: just the sound of the move
      if (state.moves.length === before.moves.length + 1) playDrop()
      later(0, () => {
        setAnim(null)
        setTrail([])
      })
    }
    return () => timers.forEach(window.clearTimeout)
  }, [state])

  return (
    <MancalaBoard
      pits={anim?.pits ?? state.pits}
      me={my}
      turn={state.turn}
      playable={myTurn && !anim ? legalMoves(state) : []}
      trail={anim?.trail ?? trail}
      from={anim?.from ?? null}
      over={state.over || finished}
      onPick={(pit) => !anim && onMove(pit)}
      flights={anim?.flights}
    />
  )
}
