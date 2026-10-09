import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Kudde } from '../../shared/api'
import { KUDDE_CATEGORIES, isKuddeCategory, type KuddeCategory } from '../../shared/kuddes'
import { CatalogHero, CatalogMain, CategoryBar, SortTabs } from '../components/catalog/Catalog'
import { Box } from '../components/ui/Box'
import type { FarmIconName } from '../components/ui/farmIcons'
import { FarmIcon } from '../components/ui/FarmIcon'
import { EventRow } from '../features/events/EventParts'
import { useAgenda, useKuddeCategories, useKuddes } from '../lib/queries'
import { seededGradient } from '../lib/placeholder'
import { usePageTitle } from '../lib/usePageTitle'
import './KuddesPage.css'
import { thisHour } from '../features/events/eventTime'

const CATEGORY_KEYS = Object.keys(KUDDE_CATEGORIES) as KuddeCategory[]

/** One Kudde in the directory: picture, name (members), subcategory and address. */
function KuddeListItem({ kudde }: { kudde: Kudde }) {
  const category = KUDDE_CATEGORIES[kudde.category]
  const place = [kudde.address, kudde.city].filter(Boolean).join(', ')
  return (
    <li className="kudde-item">
      <Link to={`/kuddes/${kudde.slug}`} className="kudde-item-img" tabIndex={-1} aria-hidden="true">
        {kudde.imageUrl ? <img src={kudde.imageUrl} alt="" loading="lazy" /> : <span style={{ background: seededGradient(kudde.name) }}>{kudde.name.slice(0, 1)}</span>}
      </Link>
      <div className="kudde-item-info">
        <p>
          <Link to={`/kuddes/${kudde.slug}`} className="kudde-item-name">
            {kudde.name}
          </Link>{' '}
          <b>({kudde.memberCount})</b>
          {kudde.visibility === 'besloten' && <FarmIcon name="lock" label="Besloten" className="kudde-item-lock" />}
        </p>
        <p className="muted">
          <FarmIcon name={category.icon} /> {kudde.subcategory ?? category.name}
        </p>
        {(place || kudde.phone) && (
          <p className="kudde-item-address">
            {place}
            {place && kudde.phone && ' / '}
            {kudde.phone && `Telefoon: ${kudde.phone}`}
          </p>
        )}
        {!place && kudde.description && <p className="kudde-item-desc">{kudde.description}</p>}
      </div>
    </li>
  )
}

/** A Kudde as a card in the grid: its picture big, then the name, members and where. */
function KuddeCard({ kudde }: { kudde: Kudde }) {
  const category = KUDDE_CATEGORIES[kudde.category]
  return (
    <li className="kudde-card">
      <Link to={`/kuddes/${kudde.slug}`}>
        <span className="kudde-card-img">
          {kudde.imageUrl ? <img src={kudde.imageUrl} alt="" loading="lazy" /> : <span style={{ background: seededGradient(kudde.name) }}>{kudde.name.slice(0, 1)}</span>}
          {kudde.photography && (
            <span className="kudde-card-badge" title="Fotografie-Kudde">
              <FarmIcon name="camera" />
            </span>
          )}
        </span>
        <span className="kudde-card-text">
          <b>
            {kudde.name}
            {kudde.visibility === 'besloten' && <FarmIcon name="lock" label="Besloten" />}
          </b>
          <small>
            <FarmIcon name={category.icon} /> {kudde.subcategory ?? category.name}
          </small>
          <small className="muted">
            {kudde.memberCount} {kudde.memberCount === 1 ? 'lid' : 'leden'}
            {kudde.city && ` · ${kudde.city}`}
          </small>
        </span>
      </Link>
    </li>
  )
}

type View = 'lijst' | 'raster'
const VIEW_KEY = 'kuddes.weergave'
const SORTS: ['populair' | 'nieuwste' | 'az', string, FarmIconName][] = [
  ['populair', 'Populair', 'fire'],
  ['nieuwste', 'Nieuwste', 'flag_new'],
  ['az', 'A tot Z', 'text_list_bullets'],
]
const SORT_TITLES = { populair: 'Populairste', nieuwste: 'Nieuwste', az: 'Alle' }

/** /kuddes and /kuddes?categorie=spots: the directory of Kuddes, per category. */
export function KuddesPage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('categorie')
  const category = isKuddeCategory(raw) ? raw : null
  const sub = params.get('sub') ?? ''
  const q = params.get('q') ?? ''
  const rawSort = params.get('sort')
  const sort = rawSort === 'nieuwste' || rawSort === 'az' ? rawSort : 'populair'
  // A list or a grid of cards; remembered in this browser
  const [view, setView] = useState<View>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'raster' ? 'raster' : 'lijst'
    } catch {
      return 'lijst'
    }
  })
  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // remembered for now only
    }
  }
  const info = category ? KUDDE_CATEGORIES[category] : null
  const { data: kuddes = [], isLoading } = useKuddes(sort, 100, { category: category ?? undefined, sub, q })
  const { data: counts } = useKuddeCategories()
  const now = thisHour()
  const { data: events = [] } = useAgenda({
    view: 'populair',
    from: now.toISOString(),
    to: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    category: category ?? undefined,
    sort: 'drukst',
    limit: 4,
  })
  usePageTitle(info ? `${info.name} - Kuddes` : 'Alle Kuddes - Kuddes')

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  const plural = (info?.name ?? 'Kuddes').toLowerCase()

  return (
    <main className="page page-con kuddes-page">
      <CatalogHero
        title={info?.name ?? 'Kuddes'}
        intro={info ? info.about : 'Groepen, spots, scholen, bedrijven, verenigingen en stichtingen: word lid, praat mee en kijk wat er te doen is.'}
        q={q}
        placeholder={info?.place ? 'Zoek op naam of plaats' : 'Zoek op naam of onderwerp'}
        label={`${info?.name ?? 'Kuddes'} zoeken`}
        onSearch={(v) => go({ q: v || null })}
      />

      <CategoryBar
        label="Categorieën"
        current={category}
        onPick={(c) => go({ categorie: c, sub: null })}
        items={[
          { key: null, name: 'Alles', hint: 'alle Kuddes', icon: 'tag_blue', count: total ?? undefined },
          ...CATEGORY_KEYS.map((k) => ({ key: k, ...KUDDE_CATEGORIES[k].bar, icon: KUDDE_CATEGORIES[k].icon as FarmIconName, count: counts?.[k] })),
        ]}
      />

      <div className="cols">
        <div>
          <CatalogMain
            icon={info?.icon as FarmIconName | undefined}
            title={q ? `Zoekresultaten voor "${q}"` : `${SORT_TITLES[sort]} ${plural}`}
            sub={isLoading ? ' ' : `${kuddes.length} ${kuddes.length === 1 ? (info?.singular ?? 'Kudde') : plural}`}
            sort={
              <div className="kudde-bar-tools">
                <SortTabs value={sort} onChange={(s) => go({ sort: s === 'populair' ? null : s })} options={SORTS} />
                <span className="kudde-view" role="group" aria-label="Weergave">
                  <button type="button" className={view === 'lijst' ? 'current' : undefined} aria-pressed={view === 'lijst'} onClick={() => pickView('lijst')} title="Als lijst">
                    <FarmIcon name="text_list_bullets" />
                  </button>
                  <button type="button" className={view === 'raster' ? 'current' : undefined} aria-pressed={view === 'raster'} onClick={() => pickView('raster')} title="Als raster">
                    <FarmIcon name="application_view_tile" />
                  </button>
                </span>
              </div>
            }
          >
            {info && (
              <div className="kudde-subcategories">
                <button type="button" className={!sub ? 'layout-chip current' : 'layout-chip'} onClick={() => go({ sub: null })}>
                  Alle
                </button>
                {info.subcategories.map((s) => (
                  <button key={s} type="button" className={s === sub ? 'layout-chip current' : 'layout-chip'} onClick={() => go({ sub: s === sub ? null : s })}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {isLoading ? (
              <p className="muted kudde-list-empty">Laden…</p>
            ) : kuddes.length === 0 ? (
              <p className="empty kudde-list-empty">
                {q ? 'Niets gevonden.' : `Er zijn hier nog geen ${plural}.`} <Link to={`/kuddes/nieuw${category ? `?categorie=${category}` : ''}`}>Start er zelf een!</Link>
              </p>
            ) : view === 'raster' ? (
              <ul className="kudde-cards">
                {kuddes.map((b) => (
                  <KuddeCard key={b.slug} kudde={b} />
                ))}
              </ul>
            ) : (
              <ul className="kudde-list">
                {kuddes.map((b) => (
                  <KuddeListItem key={b.slug} kudde={b} />
                ))}
              </ul>
            )}
          </CatalogMain>
        </div>

        <aside className="sticky-side">
          <Box title={`Wat zijn ${plural}?`}>
            <p className="kudde-about">
              {info
                ? `Iedereen kan een ${info.singular} starten. Jij bepaalt of hij open is, of dat je zelf kiest wie erbij mag.`
                : 'Kuddes zijn de groepen van de site: gewone groepen, spots, scholen, opleidingen, bedrijven, verenigingen en stichtingen. Word lid, praat mee en kijk in de agenda wat er te doen is.'}
            </p>
            <Link to={`/kuddes/nieuw${category ? `?categorie=${category}` : ''}`} className="btn btn-cta kudde-new">
              <FarmIcon name="add" /> Nieuwe {info ? info.singular : 'Kudde'} aanmaken
            </Link>
          </Box>
          <Box title="Binnenkort" icon="calendar" actions={<Link to="/agenda">Agenda</Link>}>
            {events.length === 0 ? (
              <p className="empty">Nog geen evenementen gepland.</p>
            ) : (
              <ul className="event-list compact">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Box>
        </aside>
      </div>
    </main>
  )
}
