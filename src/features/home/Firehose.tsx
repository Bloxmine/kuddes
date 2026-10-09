import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Page, Status } from '../../../shared/api'
import { BuzzItem } from '../../components/social/BuzzItem'
import { StatusComposer } from '../../components/social/StatusComposer'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import './Firehose.css'

const REFRESH_MS = 10_000

type FeedPage = Page<Status> & { freshIds: number[] }

/** "Laatste publieke WieWatWaars": the live stream of status updates. */
export function Firehose({ query, onQuery }: { query: string; onQuery: (q: string) => void }) {
  const { user } = useAuth()
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [draft, setDraft] = useState(query)
  // Cursors of the pages we paged through, so "Vorige" can go back
  const [cursors, setCursors] = useState<(number | null)[]>([null])
  const [lastQuery, setLastQuery] = useState(query)
  if (query !== lastQuery) {
    // A new search (e.g. from the treemap) starts at the first page
    setLastQuery(query)
    setDraft(query)
    setCursors([null])
  }
  const before = cursors[cursors.length - 1]
  const onFirstPage = cursors.length === 1

  const queryClient = useQueryClient()
  const queryKey = keys.statuses(query, before)
  const feed = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      if (before) params.set('before', String(before))
      const page = await api<Page<Status>>(`/statuses?${params}`)
      // Anything newer than what we showed last time just arrived
      const previous = queryClient.getQueryData<FeedPage>(queryKey)
      const newestBefore = previous?.items[0]?.id
      return { ...page, freshIds: newestBefore ? page.items.filter((s) => s.id > newestBefore).map((s) => s.id) : [] }
    },
    placeholderData: keepPreviousData,
    refetchInterval: autoRefresh && onFirstPage ? REFRESH_MS : false,
  })

  const items = feed.data?.items ?? []
  const freshIds = feed.data?.freshIds ?? []

  const pager = (
    <div className="firehose-pager">
      <button
        type="button"
        className="link-button"
        disabled={onFirstPage}
        onClick={() => setCursors((c) => c.slice(0, -1))}
      >
        ‹ Nieuwer
      </button>
      <button
        type="button"
        className="link-button"
        disabled={!feed.data?.nextCursor}
        onClick={() => setCursors((c) => [...c, feed.data!.nextCursor])}
      >
        Ouder ›
      </button>
    </div>
  )

  return (
    <Box title="WieWatWaar" icon="comment" className="firehose">
      <StatusComposer compact />
      <div className="firehose-options">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onQuery(draft.trim())
          }}
          className="firehose-form"
        >
          <input
            className="text-box"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Zoek in WieWatWaars"
            aria-label="Zoek in WieWatWaars"
          />
          {query && (
            <button type="button" className="firehose-reset" title="Wissen" onClick={() => onQuery('')}>
              ×
            </button>
          )}
          <Button type="submit">Zoeken</Button>
        </form>
        <label className="firehose-auto">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Automatisch vernieuwen
        </label>
      </div>

      {items.length > 0 && pager}
      <div className="firehose-list" aria-live="polite" aria-busy={feed.isFetching}>
        {feed.isLoading ? (
          <p className="muted firehose-empty">WieWatWaars laden…</p>
        ) : feed.isError ? (
          <p className="form-error firehose-empty">De WieWatWaars konden niet geladen worden.</p>
        ) : items.length ? (
          items.map((status) => (
            <BuzzItem key={status.id} status={status} fresh={freshIds.includes(status.id)} />
          ))
        ) : query ? (
          <p className="muted firehose-empty">Geen WieWatWaars gevonden voor "{query}".</p>
        ) : (
          <p className="muted firehose-empty">
            Nog geen WieWatWaars.{' '}
            {user ? 'Plaats hierboven de eerste!' : <><Link to="/aanmelden">Meld je aan</Link> en plaats de eerste!</>}
          </p>
        )}
      </div>
      {items.length > 0 && pager}
    </Box>
  )
}
