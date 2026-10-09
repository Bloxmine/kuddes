import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { PROMOTIONS, colOf, legalMoves, rowOf, squareName, type ChessMove, type ChessState, type Piece, type PieceType } from '../../../shared/games/schaken'
import type { TurnBoardProps } from './turnBoard'
import './NewGames.css'
import { playCheck, playJump, playPiece, playResult } from './sounds'

/** The Farm-Fresh chess icons (the white rook and pawn are made from the black ones). */
const ICON: Record<PieceType, string> = { k: 'chess_king', q: 'chess_queen', r: 'chess_tower', b: 'chess_bishop', n: 'chess_horse', p: 'chess_pawn' }
const NAME: Record<PieceType, string> = { k: 'koning', q: 'dame', r: 'toren', b: 'loper', n: 'paard', p: 'pion' }

function PieceGlyph({ piece, white, style }: { piece: Piece; white: boolean; style?: CSSProperties }) {
  return (
    <span className={`ch-piece ${white ? 'white' : 'black'}`} style={style} aria-hidden="true">
      <img src={`/icons/32/${ICON[piece.type]}${white ? '_white' : ''}.png`} alt="" draggable={false} />
    </span>
  )
}

/**
 * Schaken on a wooden board, your pieces at the bottom. Click one of your
 * pieces to see where it can go, then the square; a pawn reaching the end
 * asks what it becomes. The last move slides in.
 */
export function ChessBoard({ state, my, myTurn, onMove, finished }: TurnBoardProps<ChessState, ChessMove>) {
  const [selected, setSelected] = useState<number | null>(null)
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null)
  const canPlay = myTurn && !finished && !state.over
  const moves = useMemo(() => (canPlay ? legalMoves(state) : []), [state, canPlay])
  const fromSelected = selected === null ? [] : moves.filter((m) => m[0] === selected)
  const targets = new Set(fromSelected.map((m) => m[1]))
  const movable = new Set(moves.map((m) => m[0]))
  const last = state.moves[state.moves.length - 1]
  const flip = state.white !== my
  const whiteOf = (p: Piece) => p.owner === state.white
  const kingInCheck = state.check ? state.board.findIndex((p) => p?.type === 'k' && p.owner === state.turn) : -1

  // Sounds for every new move (yours and theirs)
  const seen = useRef(state.moves.length)
  const prev = useRef(state)
  useEffect(() => {
    const before = prev.current
    prev.current = state
    if (state.moves.length !== seen.current + 1) {
      seen.current = state.moves.length
      return
    }
    seen.current = state.moves.length
    const m = state.moves[state.moves.length - 1]
    const took = before.board[m[1]] || (before.board[m[0]]?.type === 'p' && colOf(m[0]) !== colOf(m[1]))
    if (took) playJump(1)
    else playPiece()
    if (state.reason === 'schaakmat') window.setTimeout(() => playCheck(true), 150)
    else if (state.check) window.setTimeout(() => playCheck(false), 150)
    else if (state.over) window.setTimeout(() => playResult('gelijk'), 150)
  }, [state])

  const click = (sq: number) => {
    if (!canPlay) return
    if (targets.has(sq) && selected !== null) {
      const options = fromSelected.filter((m) => m[1] === sq)
      if (options.length > 1) setPromo({ from: selected, to: sq })
      else onMove(options[0])
      setSelected(null)
      return
    }
    setSelected(movable.has(sq) && sq !== selected ? sq : null)
  }

  const cells = []
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const r = flip ? 7 - vr : vr
      const c = flip ? 7 - vc : vc
      const sq = r * 8 + c
      const piece = state.board[sq]
      const isLastTo = last && last[1] === sq
      // The piece that just moved slides in from where it was
      const slide =
        isLastTo && piece
          ? ({
              '--dx': (flip ? -1 : 1) * (colOf(last[0]) - colOf(last[1])),
              '--dy': (flip ? -1 : 1) * (rowOf(last[0]) - rowOf(last[1])),
            } as CSSProperties)
          : undefined
      const classes = [
        'ch-cell',
        (r + c) % 2 ? 'dark' : 'light',
        selected === sq && 'selected',
        last && (last[0] === sq || last[1] === sq) && 'last',
        targets.has(sq) && (piece ? 'capture' : 'target'),
        movable.has(sq) && 'movable',
        kingInCheck === sq && 'check',
      ]
      cells.push(
        <button
          key={sq}
          type="button"
          className={classes.filter(Boolean).join(' ')}
          disabled={!canPlay || (!movable.has(sq) && !targets.has(sq))}
          onClick={() => click(sq)}
          aria-label={`${squareName(sq)}${piece ? `, ${whiteOf(piece) ? 'witte' : 'zwarte'} ${NAME[piece.type]}` : ''}`}
        >
          {piece && <PieceGlyph key={state.moves.length} piece={piece} white={whiteOf(piece)} style={slide} />}
          {vc === 0 && <span className="ch-rank">{8 - r}</span>}
          {vr === 7 && <span className="ch-file">{'abcdefgh'[c]}</span>}
        </button>,
      )
    }
  }

  // Taken pieces, under each side
  const taken = (p: 0 | 1) => {
    const start: Record<PieceType, number> = { k: 1, q: 1, r: 2, b: 2, n: 2, p: 8 }
    for (const x of state.board) if (x && x.owner !== p) start[x.type]--
    return (['q', 'r', 'b', 'n', 'p'] as PieceType[]).flatMap((t) => Array.from({ length: Math.max(0, start[t]) }, () => t))
  }
  const takenRow = (p: 0 | 1) => (
    <div className="ch-taken" aria-label={p === my ? 'Door jou geslagen' : 'Door je tegenstander geslagen'}>
      {taken(p).map((t, i) => (
        <PieceGlyph key={i} piece={{ owner: p === 0 ? 1 : 0, type: t }} white={(p === 0 ? 1 : 0) === state.white} />
      ))}
    </div>
  )

  return (
    <div className="ch-wrap">
      {takenRow(my === 0 ? 1 : 0)}
      <div className={['ch-board', state.over && 'over'].filter(Boolean).join(' ')}>
        {cells}
        {promo && (
          <div className="ch-promo" role="dialog" aria-label="Promotie: waar wordt je pion?">
            <p>Je pion wordt een…</p>
            <div>
              {PROMOTIONS.map((t, k) => (
                <button
                  key={t}
                  type="button"
                  title={NAME[t]}
                  onClick={() => {
                    onMove([promo.from, promo.to, k])
                    setPromo(null)
                  }}
                >
                  <PieceGlyph piece={{ owner: my, type: t }} white={my === state.white} />
                </button>
              ))}
            </div>
            <button type="button" className="link-button" onClick={() => setPromo(null)}>
              Toch niet
            </button>
          </div>
        )}
      </div>
      {takenRow(my)}
    </div>
  )
}
