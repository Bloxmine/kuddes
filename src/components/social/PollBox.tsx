import { useState, type ReactNode } from 'react'
import type { PollView } from '../../../shared/polls'
import { withSmileys } from '../../lib/smileys'
import { FarmIcon } from '../ui/FarmIcon'
import '../../features/gadgets/Gadgets.css'

/**
 * A poll with its answers or results: on WieWatWaars and on the Prikbord.
 * You see the answers until you've voted, then the results (and can change
 * your vote until the poll is closed).
 */
export function PollBox({
  poll,
  canVote,
  canClose,
  pending,
  onVote,
  onClose,
  cantVoteNote,
  className,
}: {
  poll: PollView
  canVote: boolean
  canClose: boolean
  pending: boolean
  onVote: (option: number) => void
  onClose: () => void
  /** Shown to those who can't vote (not logged in, not a member…). */
  cantVoteNote?: ReactNode
  className?: string
}) {
  const [changing, setChanging] = useState(false)
  const voting = canVote && !poll.closed && (poll.myVote === null || changing)
  return (
    <div className={className ? `poll ${className}` : 'poll'}>
      <p className="poll-question">{withSmileys(poll.question)}</p>
      {voting ? (
        <ul className="poll-options">
          {poll.options.map((o, i) => (
            <li key={i}>
              <button
                type="button"
                className={i === poll.myVote ? 'current' : undefined}
                disabled={pending}
                onClick={() => {
                  onVote(i)
                  setChanging(false)
                }}
              >
                <span className="poll-radio" aria-hidden="true" />
                {withSmileys(o)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="poll-results">
          {poll.options.map((o, i) => {
            const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0
            return (
              <li key={i} className={i === poll.myVote ? 'mine' : undefined}>
                <span className="poll-label">
                  {withSmileys(o)}
                  {i === poll.myVote && <FarmIcon name="tick" label="Jouw stem" />}
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
        <FarmIcon name="chart_bar" /> {poll.total} {poll.total === 1 ? 'stem' : 'stemmen'}
        {poll.closed && ' · gesloten'}
        {!canVote && !poll.closed && cantVoteNote && <> · {cantVoteNote}</>}
        {canVote && !poll.closed && poll.myVote !== null && !changing && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => setChanging(true)}>
              Stem veranderen
            </button>
          </>
        )}
        {canClose && !poll.closed && (
          <>
            {' · '}
            <button type="button" className="link-button" disabled={pending} onClick={() => confirm('De poll sluiten? Daarna kan niemand meer stemmen.') && onClose()}>
              Poll sluiten
            </button>
          </>
        )}
      </p>
    </div>
  )
}

/** The question and answers of a new poll, in a composer. */
export function PollEditor({ value, onChange, limits }: { value: { question: string; options: string[] }; onChange: (next: { question: string; options: string[] } | null) => void; limits: { question: number; option: number; options: number } }) {
  return (
    <div className="kb-poll-edit">
      <input className="text-box" value={value.question} maxLength={limits.question} onChange={(e) => onChange({ ...value, question: e.target.value })} placeholder="Je vraag, bijv. Waar gaan we zaterdag heen?" aria-label="Vraag" />
      {value.options.map((o, i) => (
        <div key={i} className="kb-poll-option">
          <span className="poll-radio" aria-hidden="true" />
          <input
            className="text-box"
            value={o}
            maxLength={limits.option}
            onChange={(e) => onChange({ ...value, options: value.options.map((x, j) => (j === i ? e.target.value : x)) })}
            placeholder={`Antwoord ${i + 1}`}
            aria-label={`Antwoord ${i + 1}`}
          />
          <button type="button" className="icon-button" title="Weghalen" disabled={value.options.length <= 2} onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })}>
            <FarmIcon name="bin" />
          </button>
        </div>
      ))}
      <div className="kb-poll-tools">
        {value.options.length < limits.options && (
          <button type="button" className="link-button" onClick={() => onChange({ ...value, options: [...value.options, ''] })}>
            <FarmIcon name="add" /> Antwoord toevoegen
          </button>
        )}
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          Poll weghalen
        </button>
      </div>
    </div>
  )
}
