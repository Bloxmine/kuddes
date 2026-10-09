import { Link, useSearchParams } from 'react-router-dom'
import type { KuddeEvent } from '../../shared/api'
import { KUDDE_CATEGORIES, isKuddeCategory, type KuddeCategory } from '../../shared/kuddes'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { EventRow } from '../features/events/EventParts'
import { dayKey, eventHref, MONTHS, thisHour } from '../features/events/eventTime'
import { useAuth } from '../lib/auth'
import { useAgenda, useMyEvents } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/events/Events.css'

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const DAY = 86_400_000

/** The 6 weeks shown for a month, starting on the Monday on or before the 1st. */
function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7))
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

/** Each event under every day it runs (a week at most). */
function byDay(events: KuddeEvent[]) {
  const map = new Map<string, KuddeEvent[]>()
  for (const e of events) {
    const start = new Date(e.startsAt)
    const end = e.endsAt ? new Date(e.endsAt) : start
    // An evening that runs past midnight stays on its first day
    const lastDay = end.getTime() - start.getTime() < 20 * 3600_000 ? start : end
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()), n = 0; d <= lastDay && n < 7; d = new Date(d.getTime() + DAY), n++) {
      const key = dayKey(d)
      map.set(key, [...(map.get(key) ?? []), e])
    }
  }
  return map
}

const monthParam = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

export function AgendaPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const today = new Date()
  const view = params.get('view') === 'populair' || !user ? 'populair' : 'mijn'
  const [y, m] = (params.get('maand') ?? monthParam(today)).split('-').map(Number)
  const year = Number.isFinite(y) ? y : today.getFullYear()
  const month = Number.isFinite(m) && m >= 1 && m <= 12 ? m - 1 : today.getMonth()
  const rawCategory = params.get('categorie')
  const category: KuddeCategory | undefined = isKuddeCategory(rawCategory) ? rawCategory : undefined
  const selected = params.get('dag')
  usePageTitle('Agenda - Kuddes')

  const cells = monthGrid(year, month)
  const from = cells[0].toISOString()
  const to = new Date(cells[41].getTime() + DAY).toISOString()
  const agenda = useAgenda({ view, from, to, category })
  const events = agenda.data ?? []
  const days = byDay(events)
  const hour = thisHour()
  const popular = useAgenda({ view: 'populair', from: hour.toISOString(), to: new Date(hour.getTime() + 30 * DAY).toISOString(), sort: 'drukst', limit: 5, category })
  const { data: mine = [] } = useMyEvents(!!user)

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }
  const shiftMonth = (delta: number) => go({ maand: monthParam(new Date(year, month + delta, 1)), dag: null })

  // Below the calendar: the chosen day, or the rest of this month
  const inMonth = events.filter((e) => new Date(e.startsAt).getMonth() === month && new Date(e.startsAt).getFullYear() === year)
  const listed = selected
    ? (days.get(selected) ?? [])
    : year === today.getFullYear() && month === today.getMonth()
      ? inMonth.filter((e) => new Date(e.endsAt ?? e.startsAt).getTime() >= today.getTime() - 6 * 3600_000)
      : inMonth
  const selectedDate = selected ? new Date(`${selected}T12:00:00`) : null

  return (
    <main className="page page-con agenda-page">
      <h1>Agenda</h1>
      <div className="agenda-tabs">
        <nav className="timeline-tabs" aria-label="Welke evenementen">
          {user && (
            <button type="button" className={view === 'mijn' ? 'current' : undefined} aria-current={view === 'mijn'} onClick={() => go({ view: null })}>
              <FarmIcon name="group" /> Mijn Kuddes
            </button>
          )}
          <button type="button" className={view === 'populair' ? 'current' : undefined} aria-current={view === 'populair'} onClick={() => go({ view: 'populair' })}>
            <FarmIcon name="star" /> Populair
          </button>
        </nav>
        <label className="agenda-filter">
          <FarmIcon name="tag_blue" />
          <select className="text-box" value={category ?? ''} onChange={(e) => go({ categorie: e.target.value || null })} aria-label="Categorie">
            <option value="">Alle categorieën</option>
            {(Object.keys(KUDDE_CATEGORIES) as KuddeCategory[]).map((k) => (
              <option key={k} value={k}>
                {KUDDE_CATEGORIES[k].name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted agenda-intro">
        {view === 'mijn'
          ? 'Evenementen van de Kuddes waar je lid van bent, en waar je je voor hebt aangemeld.'
          : 'Evenementen van alle openbare Kuddes.'}
      </p>

      <div className="cols">
        <div>
          <Box
            className="calendar-box"
            title={`${MONTHS[month].replace(/^./, (c) => c.toUpperCase())} ${year}`}
            icon="calendar_view_month"
            actions={
              <span className="calendar-nav">
                <button type="button" className="icon-button" title="Vorige maand" aria-label="Vorige maand" onClick={() => shiftMonth(-1)}>
                  <FarmIcon name="arrow_left" />
                </button>
                <Button onClick={() => go({ maand: null, dag: null })}>Vandaag</Button>
                <button type="button" className="icon-button" title="Volgende maand" aria-label="Volgende maand" onClick={() => shiftMonth(1)}>
                  <FarmIcon name="arrow_right" />
                </button>
              </span>
            }
            noPadding
          >
            <div className={agenda.isFetching ? 'calendar loading' : 'calendar'} role="grid" aria-label="Kalender">
              {WEEKDAYS.map((d) => (
                <div key={d} className="calendar-weekday" role="columnheader">
                  {d}
                </div>
              ))}
              {cells.map((d) => {
                const key = dayKey(d)
                const list = days.get(key) ?? []
                const classes = [
                  'calendar-day',
                  d.getMonth() !== month && 'other',
                  key === dayKey(today) && 'today',
                  key === selected && 'selected',
                  list.length > 0 && 'has-events',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <div
                    key={key}
                    role="gridcell"
                    className={classes}
                    aria-selected={key === selected}
                    tabIndex={0}
                    onClick={() => go({ dag: key === selected ? null : key })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        go({ dag: key === selected ? null : key })
                      }
                    }}
                    aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}: ${list.length} ${list.length === 1 ? 'evenement' : 'evenementen'}`}
                  >
                    <span className="calendar-num">{d.getDate()}</span>
                    <ul>
                      {list.slice(0, 3).map((e) => (
                        <li key={e.id} className={e.myStatus ? `mine ${e.myStatus}` : undefined}>
                          <Link to={eventHref(e)} onClick={(ev) => ev.stopPropagation()} title={`${e.title} · ${e.kudde.name}`}>
                            {e.title}
                          </Link>
                        </li>
                      ))}
                      {list.length > 3 && <li className="more">+{list.length - 3} meer</li>}
                    </ul>
                  </div>
                )
              })}
            </div>
            <p className="calendar-legend muted">
              <span className="legend mine ja" /> Ik ga <span className="legend mine misschien" /> Misschien
            </p>
          </Box>

          <Box
            title={
              selectedDate
                ? `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}`
                : `Evenementen in ${MONTHS[month]}`
            }
            icon="date"
            actions={selected ? <button type="button" className="link-button" onClick={() => go({ dag: null })}>Hele maand</button> : undefined}
          >
            {agenda.isLoading ? (
              <p className="muted">Laden…</p>
            ) : listed.length === 0 ? (
              <p className="empty">
                {view === 'mijn' ? 'Niets gepland in je Kuddes.' : 'Niets gepland.'}{' '}
                {view === 'mijn' ? (
                  <button type="button" className="link-button" onClick={() => go({ view: 'populair' })}>
                    Bekijk wat er populair is
                  </button>
                ) : (
                  <Link to="/kuddes">Zoek een Kudde</Link>
                )}
              </p>
            ) : (
              <ul className="event-list">
                {listed.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Box>
        </div>

        <aside className="sticky-side">
          <Box title="Populairste evenementen" icon="star">
            {(popular.data ?? []).length === 0 ? (
              <p className="empty">Nog niets deze maand.</p>
            ) : (
              <ul className="event-list compact">
                {(popular.data ?? []).map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Box>
          {user && (
            <Box title="Waar jij heen gaat" icon="tick">
              {mine.length === 0 ? (
                <p className="empty">Je hebt je nog nergens voor aangemeld.</p>
              ) : (
                <ul className="event-list compact">
                  {mine.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              )}
            </Box>
          )}
          <Box title="Zelf iets organiseren?" icon="calendar_add">
            <p className="kudde-about">Plaats een evenement op een Kudde waar je lid van bent: een feest, een training of een reünie.</p>
            <Link to="/kuddes" className="btn">
              <FarmIcon name="tag_blue" /> Naar de Kuddes
            </Link>
          </Box>
        </aside>
      </div>
    </main>
  )
}
