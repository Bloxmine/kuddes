/** Stars for the shelf gadgets: 0 to 5 in halves, to show and to pick. */
import { useState } from 'react'
import { starLabel } from './gadgetData'

type Fill = 'full' | 'half' | 'empty'
const fillOf = (rating: number, n: number): Fill => (rating >= n ? 'full' : rating >= n - 0.5 ? 'half' : 'empty')

export function Stars({ rating }: { rating: number }) {
  if (!rating) return null
  return (
    <span className="shelf-stars" aria-label={`${starLabel(rating)} van de 5 sterren`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`star-${fillOf(rating, n)}`} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}

/** Five stars, each with a left half (n − ½) and a right half (n); clicking the current rating again clears it. */
export function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value
  return (
    <span className="shelf-rate" role="radiogroup" aria-label="Sterren" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`rate-star star-${fillOf(shown, n)}`}>
          ★
          {[n - 0.5, n].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={value === r}
              aria-label={`${starLabel(r)} ${r === 1 ? 'ster' : 'sterren'}`}
              className={r === n ? 'rate-right' : 'rate-left'}
              onMouseEnter={() => setHover(r)}
              onFocus={() => setHover(r)}
              onBlur={() => setHover(null)}
              onClick={() => onChange(value === r ? 0 : r)}
            />
          ))}
        </span>
      ))}
      <span className="rate-value">{shown ? starLabel(shown) : ''}</span>
    </span>
  )
}
