/** Drank Hall of Fame and Series: bottles behind the bar, and box sets in the cabinet. */
import { useState, type CSSProperties } from 'react'
import type { Gadget } from '../../../shared/api'
import { COVER_COLORS, DRINK_KINDS, SERIES_PLATFORMS, SERIES_STATUS, SHELF_LOOKS_FOR, type CoverColor, type Drink, type DrinkKind, type Series } from '../../../shared/gadgets'
import { RespectButton } from './ItemRespect'
import { starTag } from './gadgetData'
import { CoverIcon, Detail, RespectTag, ShelfCase, type ShelfProps } from './ShelfGadgets'
import './DrinkSeriesGadgets.css'

type DrinksData = Extract<Gadget, { type: 'drank' }>
type SeriesData = Extract<Gadget, { type: 'series' }>

const coverVars = (color: CoverColor) => ({ '--cv-bg': COVER_COLORS[color][0], '--cv-fg': COVER_COLORS[color][1] }) as CSSProperties

/** Which bottle each kind of drink comes in. */
const BOTTLE: Record<DrinkKind, 'bier' | 'wijn' | 'bubbels' | 'sterk'> = {
  pils: 'bier',
  speciaal: 'bier',
  witbier: 'bier',
  donker: 'bier',
  cider: 'bier',
  rood: 'wijn',
  wit: 'wijn',
  rose: 'wijn',
  bubbels: 'bubbels',
  sterk: 'sterk',
}

/** A drawn bottle: the glass for its kind, with the label in the owner's colours. */
export function Bottle({ drink }: { drink: Pick<Drink, 'title' | 'maker' | 'kind' | 'color' | 'style' | 'icon'> }) {
  return (
    <span className={`bt bt-${BOTTLE[drink.kind]} dk-${drink.kind}`} style={coverVars(drink.color)} title={DRINK_KINDS[drink.kind]}>
      <span className="bt-cap" />
      <span className="bt-neck" />
      <span className="bt-body">
        <span className={`bt-label cv-${drink.style}`}>
          <CoverIcon icon={drink.icon} />
          <span className="cv-title">{drink.title || 'Naam'}</span>
          {drink.maker && <span className="cv-author">{drink.maker}</span>}
        </span>
      </span>
    </span>
  )
}

/** The favourite drinks, behind the bar; number one gets the crown. */
export function DrinksGadget({ gadget, username, isOwner }: { gadget: DrinksData } & ShelfProps) {
  const drinks = gadget.config.drinks
  const [open, setOpen] = useState<string | null>(null)
  const picked = drinks.find((d) => d.id === open)
  if (drinks.length === 0) return <p className="empty">Nog geen flessen achter de bar.</p>
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.drank[0]} kind="drinks" title="Hall of Fame">
      <ul className="shelf-rows">
        {drinks.map((d, i) => (
          <li key={d.id}>
            <button type="button" className={open === d.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === d.id ? null : d.id)} title={`${d.title}${d.maker ? ` – ${d.maker}` : ''}`}>
              <Bottle drink={d} />
            </button>
            <span className="bt-plaque">
              {i === 0 && drinks.length > 1 && (
                <span className="bt-crown" title="Nummer 1" aria-label="Nummer 1">
                  👑
                </span>
              )}
              <span aria-hidden="true">{d.rating >= 4 ? starTag(d.rating) : `#${i + 1}`}</span>
            </span>
            <RespectTag gadget={gadget} item={d.id} username={username} />
          </li>
        ))}
      </ul>
      {picked && (
        <Detail
          title={picked.title}
          mediaId={picked.mediaId}
          sub={[DRINK_KINDS[picked.kind], picked.maker, picked.year].filter(Boolean).join(' · ')}
          rating={picked.rating}
          note={picked.note}
          onClose={() => setOpen(null)}
          respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />}
        />
      )}
    </ShelfCase>
  )
}

const seasonText = (s: Pick<Series, 'seasons'>) => (s.seasons === 1 ? '1 seizoen' : `${s.seasons} seizoenen`)

/** A box set: the front with the title, and a spine behind it for every extra season. */
export function BoxSet({ series }: { series: Pick<Series, 'title' | 'seasons' | 'platform' | 'color' | 'style' | 'icon'> }) {
  const spines = Math.min(series.seasons, 5) - 1
  return (
    <span className="bx" style={{ ...coverVars(series.color), '--spines': spines } as CSSProperties}>
      {Array.from({ length: spines }, (_, i) => (
        <span key={i} className="bx-spine" style={{ '--i': spines - i } as CSSProperties} />
      ))}
      <span className={`bx-front cv-${series.style}`}>
        <span className="bx-platform">{SERIES_PLATFORMS[series.platform]}</span>
        <CoverIcon icon={series.icon} />
        <span className="cv-title">{series.title || 'Titel'}</span>
        <span className="bx-seasons">{series.seasons === 1 ? 'Seizoen 1' : `Seizoen 1–${series.seasons}`}</span>
      </span>
    </span>
  )
}

/** The series in the cabinet, with a sticker for what's on now and what's still to watch. */
export function SeriesGadget({ gadget, username, isOwner }: { gadget: SeriesData } & ShelfProps) {
  const series = gadget.config.series
  const [open, setOpen] = useState<string | null>(null)
  const picked = series.find((s) => s.id === open)
  if (series.length === 0) return <p className="empty">Nog geen series in de kast.</p>
  const watching = series.filter((s) => s.status === 'kijken')
  return (
    <ShelfCase look={gadget.config.look ?? SHELF_LOOKS_FOR.series[0]} kind="series" title="Mijn series">
      {watching.length > 0 && (
        <p className="bx-now">
          <b>Nu aan het kijken:</b> {watching.map((s) => `${s.title} (seizoen ${s.season})`).join(', ')}
        </p>
      )}
      <ul className="shelf-rows">
        {series.map((s) => (
          <li key={s.id} className={s.status === 'wil' ? 'bx-wish' : undefined}>
            <button type="button" className={open === s.id ? 'shelf-item open' : 'shelf-item'} onClick={() => setOpen(open === s.id ? null : s.id)} title={`${s.title} · ${seasonText(s)} · ${SERIES_STATUS[s.status]}`}>
              <BoxSet series={s} />
            </button>
            {s.status !== 'gezien' ? (
              <span className={`shelf-tag bx-status st-${s.status}`} aria-hidden="true">
                {s.status === 'kijken' ? `S${s.season}` : 'Nog zien'}
              </span>
            ) : (
              s.rating >= 4 && (
                <span className="shelf-tag dvd-sticker" aria-hidden="true">
                  {s.rating === 5 ? 'Top!' : starTag(s.rating)}
                </span>
              )
            )}
            <RespectTag gadget={gadget} item={s.id} username={username} />
          </li>
        ))}
      </ul>
      {picked && (
        <Detail
          title={picked.title}
          mediaId={picked.mediaId}
          sub={[SERIES_STATUS[picked.status] + (picked.status === 'kijken' ? ` (seizoen ${picked.season})` : ''), seasonText(picked), SERIES_PLATFORMS[picked.platform]].join(' · ')}
          rating={picked.rating}
          note={picked.note}
          onClose={() => setOpen(null)}
          respect={<RespectButton gadget={gadget} item={picked.id} username={username} isOwner={isOwner} />}
        />
      )}
    </ShelfCase>
  )
}
