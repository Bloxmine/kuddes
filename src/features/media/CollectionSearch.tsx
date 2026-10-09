import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KIND_OF_SHELF, MEDIA_KINDS, mediaHref, shelfItemFrom } from '../../../shared/media'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { MediaCover } from './MediaCover'
import { useMediaList } from './mediaQueries'
import '../gadgets/ShelfGadgets.css'
import '../gadgets/DrinkSeriesGadgets.css'
import './Media.css'

type Shelf = keyof typeof KIND_OF_SHELF
const newId = () => Math.random().toString(36).slice(2, 10)

/**
 * In the editor of a kast: find it in the collection of Recensies and add it
 * with its cover and details filled in (and a link back to its page). Adding
 * by hand, with "… toevoegen", still works for anything that isn't in there.
 */
export function CollectionSearch({ shelf, have, full, onAdd }: { shelf: Shelf; have: { mediaId?: number }[]; full: boolean; onAdd: (item: ReturnType<typeof shelfItemFrom>) => void }) {
  const kind = KIND_OF_SHELF[shelf]
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 250)
    return () => window.clearTimeout(t)
  }, [text])
  const { data, isFetching } = useMediaList({ kind, q, sort: q ? 'meeste' : 'beste', page: 1, limit: 6 }, q.length >= 2)
  const shelved = new Set(have.map((h) => h.mediaId).filter(Boolean))

  return (
    <div className="md-collection-search">
      <label className="field">
        <span>
          <FarmIcon name="magnifier" /> Zoek in de collectie <span className="hint">(met voorkant en al; of voeg hieronder zelf iets toe)</span>
        </span>
        <input className="text-box" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Titel of ${MEDIA_KINDS[kind].creator.toLowerCase()} van een ${MEDIA_KINDS[kind].one}`} aria-label="Zoek in de collectie van Recensies" />
      </label>
      {q.length >= 2 && (
        <ul className="md-collection-results" aria-busy={isFetching}>
          {data?.items.length === 0 && (
            <li className="muted">
              Niet gevonden. <Link to={`/recensies/nieuw?soort=${kind}`}>Zet het in de collectie</Link>, of voeg het hieronder zelf toe.
            </li>
          )}
          {data?.items.map((m) => {
            const on = shelved.has(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={on || full}
                  onClick={() => {
                    onAdd(shelfItemFrom(m, 0, '', newId()))
                    setText('')
                  }}
                  title={on ? 'Staat al in je kast' : full ? 'Je kast is vol' : `${m.title} toevoegen`}
                >
                  <span className="md-collection-cover">
                    <MediaCover item={m} size={0.45} />
                  </span>
                  <span className="md-collection-text">
                    <b>{m.title}</b>
                    <span className="muted">{[m.creator, m.year].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="md-collection-add">{on ? 'Staat erin' : <><FarmIcon name="add" /> Toevoegen</>}</span>
                </button>
                <Link to={mediaHref(m)} className="md-collection-link" target="_blank" title="Recensies lezen (in een nieuw tabblad)">
                  <FarmIcon name="comments" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
