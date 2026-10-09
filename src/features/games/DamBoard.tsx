import { useEffect, useMemo, useRef, useState } from 'react'
import { SIZE, legalMoves, rcToSquare, type DamMove, type DamState } from '../../../shared/games/dammen'
import type { TurnBoardProps } from './turnBoard'
import { playCrown, playJump, playPiece } from './sounds'
import { FarmIcon } from '../../components/ui/FarmIcon'

/**
 * Dammen on a wooden 10×10 board, your pieces at the bottom. Click one of
 * your pieces, then where it should go; for a multiple capture you click
 * where it ends up (the route is filled in).
 */
export function DamBoard({ state, my, myTurn, onMove, finished }: TurnBoardProps<DamState, DamMove>) {
  const [selected, setSelected] = useState<number | null>(null)
  const canPlay = myTurn && !finished && !state.over
  const moves = useMemo(() => (canPlay ? legalMoves(state) : []), [state, canPlay])
  const mustCapture = moves.some((m) => m.captured.length > 0)
  const movable = new Set(moves.map((m) => m.path[0]))
  const fromSelected = selected === null ? [] : moves.filter((m) => m.path[0] === selected)
  const targets = new Map(fromSelected.map((m) => [m.path[m.path.length - 1], m]))
  const last = state.moves.length ? state.moves[state.moves.length - 1] : null
  // Black sits at the top from White's side; turn the board so yours is at the bottom
  const flip = state.white !== my

  // What the last move did, from the board before and after it
  const before = useRef(state)
  useEffect(() => {
    const prev = before.current
    before.current = state
    if (state.moves.length !== prev.moves.length + 1) return
    const pieces = (s: DamState) => s.board.filter(Boolean).length
    const kings = (s: DamState) => s.board.filter((p) => p?.king).length
    const taken = pieces(prev) - pieces(state)
    if (taken > 0) playJump(taken)
    else playPiece()
    if (kings(state) > kings(prev)) window.setTimeout(playCrown, taken > 0 ? taken * 110 + 80 : 120)
  }, [state])

  const click = (sq: number) => {
    if (!canPlay) return
    const move = targets.get(sq)
    if (move) {
      setSelected(null)
      onMove(move.path)
    } else setSelected(movable.has(sq) && sq !== selected ? sq : null)
  }

  const rows = []
  for (let vr = 0; vr < SIZE; vr++) {
    const cells = []
    for (let vc = 0; vc < SIZE; vc++) {
      const r = flip ? SIZE - 1 - vr : vr
      const c = flip ? SIZE - 1 - vc : vc
      const sq = rcToSquare(r, c)
      if (sq === null) {
        cells.push(<span key={vc} className="dm-cell light" />)
        continue
      }
      const piece = state.board[sq]
      const classes = [
        'dm-cell',
        'dark',
        selected === sq && 'selected',
        movable.has(sq) && 'movable',
        targets.has(sq) && 'target',
        last?.includes(sq) && 'last',
        fromSelected.some((m) => m.captured.includes(sq)) && 'capturable',
      ]
      cells.push(
        <button
          key={vc}
          type="button"
          className={classes.filter(Boolean).join(' ')}
          disabled={!canPlay || (!movable.has(sq) && !targets.has(sq))}
          onClick={() => click(sq)}
          aria-label={`Veld ${sq + 1}${piece ? `, ${piece.owner === state.white ? 'wit' : 'zwart'}${piece.king ? ' dam' : ''}` : ''}`}
        >
          {piece && (
            <span className={['dm-piece', piece.owner === state.white ? 'white' : 'black', piece.king && 'king'].filter(Boolean).join(' ')}>
              {/* A dam wears the Farm-Fresh crown */}
              {piece.king && <FarmIcon name="crown_gold" size={32} className="dm-crown" />}
            </span>
          )}
        </button>,
      )
    }
    rows.push(
      <div key={vr} className="dm-row">
        {cells}
      </div>,
    )
  }

  return (
    <div className="dm-wrap">
      {canPlay && mustCapture && <p className="dm-hint">Slaan is verplicht, en zoveel mogelijk!</p>}
      <div className={['dm-board', state.over && 'over'].filter(Boolean).join(' ')}>{rows}</div>
    </div>
  )
}
