import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { LinkResult } from '../../../shared/api'
import { api } from '../../lib/api'
import { useDebounced } from '../../lib/useDebounced'
import { FarmIcon } from '../ui/FarmIcon'
import type { FarmIconName } from '../ui/farmIcons'
import { Modal } from '../ui/Modal'
import './LinkPicker.css'

/** A link on Kuddes or elsewhere: "/spellen", "https://…" */
const validLink = (url: string) => /^(https?:\/\/\S+|\/(?!\/)\S*)$/i.test(url.trim())

/**
 * "Link toevoegen" in the WieWatWaar box: search what's public on Kuddes and
 * pick it, or paste any link. The selected text (if any) becomes the link text.
 */
export function LinkPicker({ onPick, onClose }: { onPick: (href: string, title: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [url, setUrl] = useState('')
  const query = useDebounced(q.trim(), 250)
  const { data = [], isFetching } = useQuery({
    queryKey: ['link-search', query],
    queryFn: () => api<LinkResult[]>(`/link-search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 60_000,
  })
  const pick = (href: string, title: string) => {
    onPick(href, title)
    onClose()
  }
  // Pasting a link into the search box works too
  const pasted = validLink(q) ? q.trim() : null

  return (
    <Modal title="Link toevoegen" icon="link" onClose={onClose}>
      <div className="lnk">
        <label className="lnk-search">
          <FarmIcon name="magnifier" />
          <input
            autoFocus
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (pasted) pick(pasted, '')
              else if (data[0]) pick(data[0].href, data[0].title)
            }}
            placeholder="Zoek een lid, Kudde, video, recept, onderwerp…"
            aria-label="Zoek op Kuddes"
          />
        </label>

        {pasted ? (
          <button type="button" className="lnk-item" onClick={() => pick(pasted, '')}>
            <span className="lnk-pic">
              <FarmIcon name="world_link" />
            </span>
            <span className="lnk-text">
              <b>Deze link toevoegen</b>
              <small>{pasted}</small>
            </span>
          </button>
        ) : query.length < 2 ? (
          <p className="lnk-hint muted">Typ minstens twee letters. Je ziet alleen wat iedereen op Kuddes mag zien.</p>
        ) : !data.length ? (
          <p className="lnk-hint muted">{isFetching ? 'Zoeken…' : `Niets gevonden voor "${query}".`}</p>
        ) : (
          <ul className="lnk-list">
            {data.map((r) => (
              <li key={r.href}>
                <button type="button" className="lnk-item" onClick={() => pick(r.href, r.title)}>
                  <span className="lnk-pic">{r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" /> : <FarmIcon name={r.icon as FarmIconName} />}</span>
                  <span className="lnk-text">
                    <b>{r.title}</b>
                    {r.subtitle && <small>{r.subtitle}</small>}
                  </span>
                  <span className="lnk-kind">
                    <FarmIcon name={r.icon as FarmIconName} /> {r.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="lnk-paste"
          onSubmit={(e) => {
            e.preventDefault()
            // React passes events up through the portal: keep it away from the WieWatWaar form
            e.stopPropagation()
            if (validLink(url)) pick(url.trim(), '')
          }}
        >
          <span className="muted">of plak een link</span>
          <input className="text-box" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… of /spellen" aria-label="Link" />
          <button type="submit" className="btn" disabled={!validLink(url)}>
            Toevoegen
          </button>
        </form>
      </div>
    </Modal>
  )
}
