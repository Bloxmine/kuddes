import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { initials, seededGradient } from '../../lib/placeholder'
import { FarmIcon } from './FarmIcon'
import './TileGrid.css'

type TileProps = {
  to: string
  imageUrl: string | null
  /** Seed and text for the coloured placeholder when there's no image. */
  fallback: string
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  /** Wide instead of square, for video stills. */
  wide?: boolean
}

/** A large square picture with a title under it, as in Kuddes' grids. */
export function Tile({ to, imageUrl, fallback, title, subtitle, badge, wide }: TileProps) {
  return (
    <Link to={to} className={wide ? 'tile wide' : 'tile'}>
      <span className="tile-img">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="tile-fallback" style={{ background: seededGradient(fallback) }}>
            {initials(fallback).slice(0, 1)}
          </span>
        )}
        {badge}
      </span>
      <span className="tile-title">{title}</span>
      {subtitle && <span className="tile-subtitle">{subtitle}</span>}
    </Link>
  )
}

type TileGridProps<T> = {
  items: T[]
  perPage?: number
  columns?: number
  render: (item: T) => ReactNode
  keyOf: (item: T) => string | number
}

/** A row of tiles with the "‹ 1 / 5 ›" pager underneath. */
export function TileGrid<T>({ items, perPage = 5, columns = perPage, render, keyOf }: TileGridProps<T>) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const current = Math.min(page, pages - 1)
  const shown = items.slice(current * perPage, current * perPage + perPage)

  return (
    <div className="tile-grid-wrap">
      <ul className="tile-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {shown.map((item) => (
          <li key={keyOf(item)}>{render(item)}</li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="tile-pager">
          <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)} aria-label="Vorige">
            <FarmIcon name="arrow_left" />
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Volgende">
            <FarmIcon name="arrow_right" />
          </button>
        </div>
      )}
    </div>
  )
}
