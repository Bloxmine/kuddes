import { Link } from 'react-router-dom'
import { Box } from '../../components/ui/Box'
import { useAuth } from '../../lib/auth'
import { useAgenda } from '../../lib/queries'
import { EventRow } from './EventParts'
import { thisHour } from './eventTime'

const DAY = 86_400_000

/** "Agenda" on Home: the next events of your Kuddes, or what's popular for visitors. */
export function AgendaBox() {
  const { user } = useAuth()
  const now = thisHour()
  const { data: events = [], isLoading } = useAgenda({
    view: user ? 'mijn' : 'populair',
    from: new Date(now.getTime() - 6 * 3600_000).toISOString(),
    to: new Date(now.getTime() + 30 * DAY).toISOString(),
    sort: user ? 'datum' : 'drukst',
    limit: 4,
  })
  return (
    <Box title="Agenda" icon="calendar" actions={<Link to="/agenda">Alles</Link>}>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : events.length === 0 ? (
        <p className="empty">
          {user ? 'Er staat niets gepland in je Kuddes.' : 'Nog niets gepland.'} <Link to="/agenda?view=populair">Kijk wat er te doen is</Link>
        </p>
      ) : (
        <ul className="event-list compact">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </Box>
  )
}
