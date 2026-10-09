import type { CSSProperties } from 'react'
import { SUIT_SYMBOLS, cardName, isRed, rankText } from './cards'
import './PlayingCard.css'

/**
 * A playing card, drawn with CSS: the rank and suit in two corners and big
 * in the middle, or the back (in the site's colours). `rank` 1 or 14 is the
 * ace; `suit` 0–3 is ♠ ♥ ♦ ♣. Its size follows --card-w of the table.
 */
export function PlayingCard({ rank, suit, faceUp = true, className = '', style, label }: { rank: number; suit: number; faceUp?: boolean; className?: string; style?: CSSProperties; label?: string }) {
  if (!faceUp) return <span className={`pc-card back ${className}`} style={style} aria-label={label ?? 'Omgekeerde kaart'} role="img" />
  const r = rankText(rank)
  const s = SUIT_SYMBOLS[suit]
  const face = rank >= 11 && rank <= 13
  return (
    <span className={`pc-card ${isRed(suit) ? 'red' : 'black'} ${className}`} style={style} aria-label={label ?? cardName(rank, suit)} role="img">
      <span className="pc-corner tl">
        <b>{r}</b>
        <i>{s}</i>
      </span>
      <span className={face ? 'pc-mid face' : 'pc-mid'} aria-hidden="true">
        {face ? (
          <>
            <b>{r}</b>
            <i>{s}</i>
          </>
        ) : (
          s
        )}
      </span>
      <span className="pc-corner br">
        <b>{r}</b>
        <i>{s}</i>
      </span>
    </span>
  )
}

/** An empty place for a card: a stack's spot on the table. */
export function CardSpot({ label, className = '', children }: { label?: string; className?: string; children?: React.ReactNode }) {
  return (
    <span className={`pc-card spot ${className}`} aria-label={label}>
      {children}
    </span>
  )
}
