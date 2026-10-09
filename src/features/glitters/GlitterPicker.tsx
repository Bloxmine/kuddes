import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GLITTER_CATEGORIES, type Glitter, type GlitterCategory } from '../../../shared/glitters'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useGlitters, type GlitterFilter } from './glitterQueries'
import '../../components/catalog/Catalog.css'
import './Glitters.css'

/** Choose a glitterplaatje for a knuffel: from your collection or from all of them. */
export function GlitterPicker({ onPick, onClose }: { onPick: (g: Glitter) => void; onClose: () => void }) {
  const [filter, setFilter] = useState<GlitterFilter>('verzameling')
  const [category, setCategory] = useState<GlitterCategory | null>(null)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useGlitters({ category, filter, q, sort: 'populair', page, limit: 24 })

  return (
    <Modal title="Kies een glitterplaatje" icon="rainbow" onClose={onClose} wide>
      <div className="gl-picker-bar">
        <div className="ct-pills" role="group">
          {(
            [
              ['verzameling', 'Mijn verzameling'],
              ['alles', 'Alle plaatjes'],
            ] as [GlitterFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'current' : undefined}
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key)
                setPage(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          className="text-box"
          value={category ?? ''}
          aria-label="Categorie"
          onChange={(e) => {
            setCategory((e.target.value || null) as GlitterCategory | null)
            setPage(1)
          }}
        >
          <option value="">Alle categorieën</option>
          {(Object.keys(GLITTER_CATEGORIES) as GlitterCategory[]).map((k) => (
            <option key={k} value={k}>
              {GLITTER_CATEGORIES[k].name}
            </option>
          ))}
        </select>
        <form
          className="gl-picker-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            // React passes events up through the portal: keep it away from the knuffel form
            e.stopPropagation()
            setQ(search.trim())
            setPage(1)
          }}
        >
          <input className="text-box" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Zoeken" aria-label="Zoek glitterplaatjes" />
        </form>
      </div>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : !data?.items.length ? (
        <p className="empty">
          {filter === 'verzameling' ? (
            <>
              Je verzameling is nog leeg.{' '}
              <button type="button" className="link-button" onClick={() => setFilter('alles')}>
                Bekijk alle plaatjes
              </button>{' '}
              of <Link to="/glitterplaatjes">verzamel er een paar</Link>.
            </>
          ) : (
            'Geen plaatjes gevonden.'
          )}
        </p>
      ) : (
        <ul className="gl-pick-grid">
          {data.items.map((g) => (
            <li key={g.id}>
              <button type="button" title={g.title} onClick={() => onPick(g)}>
                <img src={g.url} alt={g.title} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="account-actions gl-picker-pages">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹ Vorige
          </Button>
          <span className="muted">
            {data.page} / {data.pages}
          </span>
          <Button disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Volgende ›
          </Button>
        </div>
      )}
    </Modal>
  )
}
