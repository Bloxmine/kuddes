import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { useSearch } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [lastQ, setLastQ] = useState(q)
  if (q !== lastQ) {
    // The header search can change ?q= while we're on this page
    setLastQ(q)
    setDraft(q)
  }
  const results = useSearch(q)
  usePageTitle(q ? `${q} - Zoeken - Kuddes` : 'Leden zoeken - Kuddes')

  return (
    <main className="page page-con">
      <h1>Leden zoeken</h1>
      <br />
      <Box title="Zoek op naam of gebruikersnaam" icon="magnifier">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            setParams(draft.trim() ? { q: draft.trim() } : {})
          }}
        >
          <input
            className="text-box"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="bijv. Sanne of sannexoxo"
            aria-label="Zoekterm"
            autoFocus
          />
          <Button type="submit">Zoeken</Button>
        </form>
        <br />
        {q.trim().length < 2 ? (
          <p className="muted">Typ minstens 2 tekens.</p>
        ) : results.isLoading ? (
          <p className="muted">Zoeken…</p>
        ) : !results.data?.length ? (
          <p className="empty">Geen leden gevonden voor "{q}".</p>
        ) : (
          <ul className="member-list">
            {results.data.map((user) => (
              <li key={user.id}>
                <Avatar user={user} size="small" />
                <div className="member-list-info">
                  <Link to={`/profiel/${user.username}`} className="buzz-name">
                    {user.nickname}
                  </Link>{' '}
                  <span className="muted">
                    ({user.name}) · @{user.username}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Box>
    </main>
  )
}
