import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Attendance, KuddeEvent, KuddeEventDetail } from '../../../shared/api'
import { KUDDE_CATEGORIES, mapHref } from '../../../shared/kuddes'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { eventHref, formatEventWhen, MONTHS_SHORT } from './eventTime'
import './Events.css'

/** The calendar-page tile: month on a red band, the day big below it. */
export function EventDate({ iso }: { iso: string }) {
  const d = new Date(iso)
  return (
    <span className="event-date" aria-hidden="true">
      <span className="event-date-month">{MONTHS_SHORT[d.getMonth()]}</span>
      <span className="event-date-day">{d.getDate()}</span>
    </span>
  )
}

/** "Ik ga" / "Misschien" buttons; clicking your current answer takes it back. */
export function AttendButtons({ event, compact }: { event: KuddeEvent; compact?: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const attend = useMutation({
    mutationFn: (status: Attendance | null) => api<KuddeEventDetail>(`/events/${event.id}/attend`, { method: 'POST', body: { status } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.event(event.id), updated)
      queryClient.invalidateQueries({ queryKey: keys.allEvents, predicate: (q) => q.queryKey[1] !== 'detail' })
      queryClient.invalidateQueries({ queryKey: keys.kudde(event.kudde.slug) })
    },
  })

  if (!user) {
    return compact ? null : (
      <p className="muted">
        <Link to={`/inloggen?next=${encodeURIComponent(eventHref(event))}`}>Log in</Link> om te laten weten of je komt.
      </p>
    )
  }

  const choice = (status: Attendance, label: string, icon: 'tick' | 'help') => (
    <Button
      variant={event.myStatus === status ? 'cta' : 'default'}
      className={compact ? 'attend-btn compact' : 'attend-btn'}
      aria-pressed={event.myStatus === status}
      disabled={attend.isPending}
      onClick={() => attend.mutate(event.myStatus === status ? null : status)}
      title={event.myStatus === status ? 'Klik nog eens om je af te melden' : undefined}
    >
      <FarmIcon name={icon === 'help' ? 'information' : 'tick'} /> {label}
    </Button>
  )

  return (
    <span className="attend-buttons">
      {choice('ja', 'Ik ga', 'tick')}
      {choice('misschien', 'Misschien', 'help')}
      {attend.isError && <span className="form-error">{errorMessage(attend.error)}</span>}
    </span>
  )
}

/** One event in a list: date tile, title, when and where, the Kudde and who's going. */
export function EventRow({ event, showKudde = true }: { event: KuddeEvent; showKudde?: boolean }) {
  return (
    <li className="event-row">
      <EventDate iso={event.startsAt} />
      <div className="event-row-info">
        <Link to={eventHref(event)} className="event-title">
          {event.title}
        </Link>
        <span className="event-meta">
          <FarmIcon name="time" /> {formatEventWhen(event.startsAt, event.endsAt)}
          {event.location && (
            <>
              {' · '}
              <a href={mapHref(event.location)} target="_blank" rel="noopener noreferrer" title="Bekijk op OpenStreetMap" className="event-place">
                <FarmIcon name="location_pin" />
                {'\u00a0'}
                {event.location}
              </a>
            </>
          )}
        </span>
        {showKudde && (
          <span className="event-meta">
            <FarmIcon name={KUDDE_CATEGORIES[event.kudde.category].icon} />{' '}
            <Link to={`/kuddes/${event.kudde.slug}`}>{event.kudde.name}</Link>
            {event.kudde.visibility === 'besloten' && <FarmIcon name="lock" label="Besloten Kudde" />}
          </span>
        )}
      </div>
      <div className="event-row-side">
        <span className="event-going">
          <b>{event.going}</b> {event.going === 1 ? 'gaat' : 'gaan'}
          {event.maybe > 0 && <span className="muted"> · {event.maybe} misschien</span>}
        </span>
        <AttendButtons event={event} compact />
      </div>
    </li>
  )
}
