import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { withSmileys } from '../../lib/smileys'

type CountdownData = Extract<Gadget, { type: 'aftellen' }>
type PollData = Extract<Gadget, { type: 'poll' }>

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']
const pad = (n: number) => String(n).padStart(2, '0')

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** Days, hours, minutes and seconds on glossy flip cards. */
export function CountdownGadget({ gadget }: { gadget: CountdownData }) {
  return <Countdown {...gadget.config} />
}

/** The flip cards themselves; the Kudde gadgets use them too. */
export function Countdown({ target, doneText }: { target: string; doneText: string }) {
  const when = target ? new Date(target).getTime() : NaN
  const now = useNow(!Number.isNaN(when))
  if (Number.isNaN(when)) return <p className="empty">Nog geen datum gekozen.</p>

  const ms = Math.max(0, when - now)
  const date = new Date(when)
  const label = `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`

  if (ms === 0) {
    return (
      <div className="countdown done">
        <p className="countdown-done">{withSmileys(doneText || 'Het is zover!')}</p>
        <p className="muted">{label}</p>
      </div>
    )
  }

  const parts = [
    [Math.floor(ms / 86_400_000), 'dagen'],
    [Math.floor(ms / 3_600_000) % 24, 'uur'],
    [Math.floor(ms / 60_000) % 60, 'min'],
    [Math.floor(ms / 1000) % 60, 'sec'],
  ] as const

  return (
    <div className="countdown">
      <div className="countdown-cards" role="timer" aria-label={`Nog ${parts[0][0]} dagen en ${parts[1][0]} uur`}>
        {parts.map(([n, unit]) => (
          <div key={unit} className="countdown-card">
            <span className="countdown-num">{unit === 'dagen' ? n : pad(n)}</span>
            <span className="countdown-unit">{unit}</span>
          </div>
        ))}
      </div>
      <p className="countdown-when">
        <FarmIcon name="calendar" /> {label}
      </p>
    </div>
  )
}

/** A question with answers; members vote once (and can change their mind). */
export function PollGadget({ gadget, username, isOwner }: { gadget: PollData; username: string; isOwner: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [changing, setChanging] = useState(false)
  const { question, options, closed } = gadget.config
  const { counts, total, myVote } = gadget.poll

  const vote = useMutation({
    mutationFn: (option: number) => api<Gadget>(`/gadgets/${gadget.id}/vote`, { method: 'POST', body: { option } }),
    onSuccess: (updated) => {
      setChanging(false)
      queryClient.setQueryData<Gadget[]>(keys.gadgets(username), (list = []) => list.map((g) => (g.id === updated.id ? updated : g)))
    },
  })

  if (!question.trim() || options.filter((o) => o.trim()).length < 2) return <p className="empty">Deze poll is nog niet af.</p>
  // The owner sees the results first, and can vote with "Zelf stemmen"
  const canVote = !!user && !closed && (changing || (myVote === null && !isOwner))
  const showResults = !canVote

  return (
    <div className="poll">
      <p className="poll-question">{withSmileys(question)}</p>
      {canVote ? (
        <ul className="poll-options">
          {options.map((o, i) => (
            <li key={i}>
              <button type="button" className={i === myVote ? 'current' : undefined} disabled={vote.isPending} onClick={() => vote.mutate(i)}>
                <span className="poll-radio" aria-hidden="true" />
                {withSmileys(o)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showResults && (
        <ul className="poll-results">
          {options.map((o, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0
            return (
              <li key={i} className={i === myVote ? 'mine' : undefined}>
                <span className="poll-label">
                  {withSmileys(o)}
                  {i === myVote && <FarmIcon name="tick" label="Jouw stem" />}
                </span>
                <span className="poll-bar">
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span className="poll-pct">{pct}%</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="poll-foot muted">
        <FarmIcon name="chart_bar" /> {total} {total === 1 ? 'stem' : 'stemmen'}
        {closed && ' · gesloten'}
        {!user && (
          <>
            {' · '}
            <Link to="/inloggen">Log in</Link> om te stemmen
          </>
        )}
        {user && !closed && myVote !== null && !changing && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setChanging(true)}>
              Stem wijzigen
            </button>
          </>
        )}
        {changing && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setChanging(false)}>
              Uitslag bekijken
            </button>
          </>
        )}
        {isOwner && !canVote && myVote === null && !closed && (
          <>
            {' · '}
            <Button onClick={() => setChanging(true)}>Zelf stemmen</Button>
          </>
        )}
      </p>
      {vote.isError && <p className="form-error">{errorMessage(vote.error)}</p>}
    </div>
  )
}
