import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { COLS, ROWS, dropRow, isLegal, type VierState } from '../../../shared/games/vieropeenrij'
import type { TurnBoardProps } from './turnBoard'
import { playDisc } from './sounds'

/**
 * Vier op een rij: a glossy blue board. Hover (or tap) a column to see where
 * your disc will land; the newest disc drops in from the top.
 */
export function VierBoard({ state, my, myTurn, onMove, finished }: TurnBoardProps<VierState, number>) {
  const [hover, setHover] = useState<number | null>(null)
  const last = state.moves.length ? state.moves[state.moves.length - 1] : null
  const lastCell = last === null ? null : state.grid.findIndex((_, i) => i % COLS === last && state.grid[i] !== null)
  const canPlay = myTurn && !finished && !state.over
  const ghostRow = canPlay && hover !== null && isLegal(state, hover) ? dropRow(state, hover) : -1

  // The sound comes when the disc lands: its fall takes longer the further it drops (see .vr-disc.dropped)
  const moves = useRef(state.moves.length)
  useEffect(() => {
    const isNew = state.moves.length === moves.current + 1
    moves.current = state.moves.length
    if (!isNew || lastCell === null || lastCell < 0) return
    const fall = Math.floor(lastCell / COLS) + 1
    const t = window.setTimeout(playDisc, (0.12 + fall * 0.06) * 1000)
    return () => window.clearTimeout(t)
  }, [state.moves.length, lastCell])

  return (
    <div className={['vr-board', state.over && 'over'].filter(Boolean).join(' ')} onMouseLeave={() => setHover(null)}>
      <div className="vr-grid" style={{ '--cols': COLS } as CSSProperties}>
        {Array.from({ length: COLS }, (_, c) => (
          <button
            key={c}
            type="button"
            className={['vr-col', canPlay && isLegal(state, c) && 'playable', hover === c && 'hover'].filter(Boolean).join(' ')}
            disabled={!canPlay || !isLegal(state, c)}
            onMouseEnter={() => setHover(c)}
            onFocus={() => setHover(c)}
            onClick={() => onMove(c)}
            aria-label={`Kolom ${c + 1}`}
          >
            {Array.from({ length: ROWS }, (_, r) => {
              const i = r * COLS + c
              const owner = state.grid[i]
              const isGhost = ghostRow === r && hover === c
              return (
                <span key={r} className="vr-hole">
                  {owner !== null && (
                    <span
                      className={['vr-disc', owner === my ? 'mine' : 'theirs', state.line.includes(i) && 'win', i === lastCell && 'dropped'].filter(Boolean).join(' ')}
                      style={i === lastCell ? ({ '--fall': r + 1 } as CSSProperties) : undefined}
                    />
                  )}
                  {isGhost && <span className="vr-disc mine ghost" />}
                </span>
              )
            })}
          </button>
        ))}
      </div>
    </div>
  )
}
