import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { KUDDE_CATEGORIES, mapHref } from '../../shared/kuddes'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { EventForm } from '../features/events/EventForm'
import { AttendButtons, EventDate } from '../features/events/EventParts'
import { formatEventWhen } from '../features/events/eventTime'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { keys, useKuddeEvent } from '../lib/queries'
import { RichText } from '../lib/richText'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/events/Events.css'
import { ShareWithFriends } from '../features/share/ShareWithFriends'

/** /kuddes/:slug/evenementen/:id */
export function EventPage() {
  const { slug = '', id } = useParams()
  const eventId = Number(id) || 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: event, error, isLoading } = useKuddeEvent(eventId)
  const [editing, setEditing] = useState(false)
  const [now] = useState(() => Date.now())
  usePageTitle(event ? `${event.title} - Agenda - Kuddes` : 'Evenement - Agenda - Kuddes')

  const remove = useMutation({
    mutationFn: () => api<void>(`/events/${eventId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.kudde(slug) }),
        queryClient.invalidateQueries({ queryKey: keys.allEvents, predicate: (q) => q.queryKey[1] !== 'detail' }),
      ])
      navigate(`/kuddes/${slug}`)
    },
  })

  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!event) {
    return (
      <main className="page page-con">
        <Box title="Evenement niet gevonden" icon="warning">
          <p>
            {error instanceof ApiRequestError ? error.message : 'Dit evenement kon niet geladen worden.'}{' '}
            <Link to={`/kuddes/${slug}`}>« Terug naar de Kudde</Link>
          </p>
        </Box>
      </main>
    )
  }

  const going = event.attendees.filter((a) => a.status === 'ja')
  const maybe = event.attendees.filter((a) => a.status === 'misschien')
  const past = new Date(event.endsAt ?? event.startsAt).getTime() < now

  return (
    <main className="page page-con event-page">
      <div className="cols">
        <div>
          {editing ? (
            <Box title="Evenement bewerken" icon="pencil">
              <EventForm kuddeSlug={slug} event={event} onDone={() => setEditing(false)} />
            </Box>
          ) : (
            <Box title="Evenement" icon="calendar" className="event-detail">
              <div className="event-detail-head">
                <EventDate iso={event.startsAt} />
                <div>
                  <h1>{event.title}</h1>
                  <p className="event-meta">
                    <FarmIcon name="time" /> {formatEventWhen(event.startsAt, event.endsAt)}
                    {past && <span className="muted"> (geweest)</span>}
                  </p>
                  {event.location && (
                    <p className="event-meta">
                      <FarmIcon name="location_pin" />{' '}
                      <a href={mapHref(event.location)} target="_blank" rel="noopener noreferrer" title="Bekijk op OpenStreetMap">
                        {event.location}
                      </a>
                    </p>
                  )}
                  <p className="event-meta">
                    <FarmIcon name={KUDDE_CATEGORIES[event.kudde.category].icon} /> <Link to={`/kuddes/${event.kudde.slug}`}>{event.kudde.name}</Link>
                    {event.creator && (
                      <span className="muted">
                        {' '}
                        · geplaatst door <Link to={`/profiel/${event.creator.username}`}>{event.creator.nickname}</Link>
                      </span>
                    )}
                  </p>
                  <p className="event-meta">
                    <ShareWithFriends path={`/kuddes/${event.kudde.slug}/evenementen/${event.id}`} className="link-button share-link" />
                  </p>
                </div>
              </div>
              {event.description && (
                <div className="event-description">
                  <RichText text={event.description} />
                </div>
              )}
              <div className="event-actions">
                {!past && <AttendButtons event={event} />}
                <a className="btn" href={`/api/events/${event.id}/ics`} download>
                  <FarmIcon name="calendar_add" /> Zet in je agenda
                </a>
                {event.canEdit && (
                  <>
                    <Button onClick={() => setEditing(true)}>
                      <FarmIcon name="pencil" /> Bewerken
                    </Button>
                    <Button
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`"${event.title}" verwijderen?`)) remove.mutate()
                      }}
                    >
                      <FarmIcon name="bin" /> Verwijderen
                    </Button>
                  </>
                )}
              </div>
              {remove.isError && <p className="form-error">{errorMessage(remove.error)}</p>}
            </Box>
          )}
        </div>
        <aside className="sticky-side">
          <Box title={`${past ? 'Gingen' : 'Gaan'} (${going.length})`} icon="group">
            {going.length === 0 ? (
              <p className="empty">Nog niemand. Wees de eerste!</p>
            ) : (
              <ul className="kudde-members">
                {going.map((m) => (
                  <li key={m.id}>
                    <Avatar user={m} size="small" showName label={m.nickname} />
                  </li>
                ))}
              </ul>
            )}
          </Box>
          {maybe.length > 0 && (
            <Box title={`Misschien (${maybe.length})`} icon="information">
              <ul className="kudde-members">
                {maybe.map((m) => (
                  <li key={m.id}>
                    <Avatar user={m} size="small" showName label={m.nickname} />
                  </li>
                ))}
              </ul>
            </Box>
          )}
          <Link to="/agenda" className="btn event-back">
            <FarmIcon name="calendar_view_month" /> Naar de agenda
          </Link>
        </aside>
      </div>
    </main>
  )
}
