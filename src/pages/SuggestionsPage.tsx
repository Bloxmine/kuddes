import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { FarmIcon } from '../components/ui/FarmIcon'
import { SUGGESTION_STATUSES } from '../../shared/suggestions'
import { SuggestionForm } from '../features/suggestions/SuggestionForm'
import { useSuggestions } from '../lib/queries'
import { formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'

export function SuggestionsPage() {
  const [params] = useSearchParams()
  const kind = params.get('soort') === 'probleem' ? 'probleem' : 'suggestie'
  const { data: suggestions = [], isLoading } = useSuggestions(100)
  usePageTitle('Suggesties - Kuddes')

  return (
    <main className="page page-con">
      <h1>Suggesties</h1>
      <p className="page-intro">Altijd lief voor elkaar! Wat kan er beter?</p>
      <div className="cols">
        <Box title={`Recente suggesties (${suggestions.length})`} icon="lightbulb">
          {isLoading ? (
            <p className="muted">Laden…</p>
          ) : suggestions.length === 0 ? (
            <p className="empty">Nog geen suggesties. Jij bent de eerste!</p>
          ) : (
            <ul className="member-list">
              {suggestions.map((s) => (
                <li key={s.id} id={`suggestie-${s.id}`}>
                  {s.user ? <Avatar user={s.user} size="small" /> : <span className="avatar" />}
                  <div className="member-list-info">
                    <b className="suggestion-title">{s.title}</b>
                    {s.status !== 'nieuw' && (
                      <span className={`suggestion-status status-${s.status}`}>
                        <FarmIcon name={SUGGESTION_STATUSES[s.status].icon} /> {SUGGESTION_STATUSES[s.status].name}
                      </span>
                    )}
                    <p className="suggestion-body">{s.body}</p>
                    {s.statusNote && (
                      <p className="suggestion-note">
                        <b>Kuddes:</b> {s.statusNote}
                      </p>
                    )}
                    <div className="date">
                      {s.user ? <Link to={`/profiel/${s.user.username}`}>{s.user.nickname}</Link> : 'Oud lid'} ·{' '}
                      {formatTime(s.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <aside className="sticky-side">
          {/* Keyed so switching between suggestion and problem resets the form */}
          <SuggestionForm key={kind} initialKind={kind} />
        </aside>
      </div>
    </main>
  )
}
