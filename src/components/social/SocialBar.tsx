import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FediverseReply, Social } from '../../../shared/api'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { patchSocial } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { Smiley } from '../../lib/smileys'
import { MiniSmileyPicker } from './SmileyPicker'
import { formatTime } from '../../lib/time'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import './SocialBar.css'
import { FarmIcon } from '../ui/FarmIcon'
import { ReportButton } from './ReportButton'

/** How many reactions to show before "Bekijk alle reacties". */
const COLLAPSED = 3

/**
 * Respect button, who gave respect, and the reactions under a timeline item.
 * `folded` keeps who gave respect and the reactions out of sight until
 * "reacties" is clicked, for the smaller views of the Overzicht.
 */
export function SocialBar({ social, folded }: { social: Social; folded?: boolean }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [text, setText] = useState('')
  const [smileys, setSmileys] = useState(false)
  const closeSmileys = useCallback(() => setSmileys(false), [])
  const input = useRef<HTMLInputElement>(null)
  // A smiley goes in where the cursor is; the picker stays open for more
  const insert = (code: string) => {
    const el = input.current
    const at = el?.selectionStart ?? text.length
    const next = `${text.slice(0, at)}${code}${text.slice(el?.selectionEnd ?? at)}`.slice(0, 500)
    setText(next)
    window.setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(at + code.length, at + code.length)
    }, 0)
  }
  const { activityId, respect, comments, commentCount } = social

  const update = (next: Social) => patchSocial(queryClient, next)
  const toggleRespect = useMutation({
    mutationFn: () => api<Social>(`/activities/${activityId}/respect`, { method: respect.respected ? 'DELETE' : 'POST' }),
    onSuccess: update,
  })
  const comment = useMutation({
    mutationFn: () => api<Social>(`/activities/${activityId}/comments`, { method: 'POST', body: { text } }),
    onSuccess: (next) => {
      update(next)
      setText('')
      setSmileys(false)
    },
  })
  const removeComment = useMutation({
    mutationFn: (id: number) => api<Social>(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: update,
  })

  const shown = showAll ? comments : comments.slice(-COLLAPSED)
  const hidden = commentCount - shown.length
  const details = !folded || open
  const fedi = social.fediverse
  // Respect from members here; the rest of the count are likes on its own server
  const members = respect.count - (fedi?.likes ?? 0)

  return (
    <div className="social">
      {social.boostedBy && (
        <p className="social-boosted">
          <FarmIcon name="arrow_refresh" /> Gedeeld door{' '}
          <Link to={`/profiel/${social.boostedBy.username}`} className="buzz-name">
            {social.boostedBy.nickname}
          </Link>
        </p>
      )}
      <div className="social-bar">
        <button
          type="button"
          className={respect.respected ? 'social-respect respected' : 'social-respect'}
          disabled={!user || toggleRespect.isPending}
          title={user ? (respect.respected ? 'Respect intrekken' : 'Geef respect') : 'Log in om respect te geven'}
          onClick={() => toggleRespect.mutate()}
        >
          <FarmIcon name="star" /> Respect
        </button>
        {(user || (folded && commentCount > 0)) && (
          <button type="button" className="social-comment-toggle" aria-expanded={folded ? open : undefined} onClick={() => setOpen((o) => !o)}>
            {commentCount > 0 ? `${commentCount} ${commentCount === 1 ? 'reactie' : 'reacties'}` : 'Reageren'}
          </button>
        )}
        {folded && respect.count > 0 && !open && (
          <span className="social-tally">
            <FarmIcon name="star" /> {respect.count}
          </span>
        )}
        {!user && !folded && commentCount > 0 && (
          <span className="social-tally">
            {commentCount} {commentCount === 1 ? 'reactie' : 'reacties'}
          </span>
        )}
      </div>

      {details && respect.count > 0 && (
        <div className="social-respecters">
          <span className="social-respecters-avatars">
            {respect.recent.map((u) => (
              <Avatar key={u.id} user={u} size="tiny" />
            ))}
          </span>
          <span>
            {members > 0 && `${members} ${members === 1 ? 'lid respecteert' : 'leden respecteren'} dit`}
            {members > 0 && !!fedi?.likes && ' · '}
            {!!fedi?.likes && `${fedi.likes} ${fedi.likes === 1 ? 'like' : 'likes'} op ${fedi.domain}`}
          </span>
        </div>
      )}

      {details && fedi && (fedi.boosts > 0 || fedi.replies > 0) && <FediverseActivity activityId={activityId} fediverse={fedi} />}

      {details && commentCount > 0 && (
        <ul className="social-comments">
          {hidden > 0 && (
            <li>
              <button type="button" className="link-button" onClick={() => setShowAll(true)}>
                Bekijk alle {commentCount} reacties
              </button>
            </li>
          )}
          {shown.map((c) => (
            <li key={c.id} className="social-comment">
              <Avatar user={c.user} size="tiny" />
              <div>
                <Link to={`/profiel/${c.user.username}`} className="buzz-name">
                  {c.user.nickname}
                </Link>{' '}
                <RichText text={c.text} /> <span className="date">{formatTime(c.createdAt)}</span>
                <ReportButton kind="reactie" targetId={c.id} authorId={c.user.id} />
                {c.canDelete && (
                  <button
                    type="button"
                    className="icon-button social-comment-remove"
                    title="Reactie verwijderen"
                    disabled={removeComment.isPending}
                    onClick={() => confirm('Deze reactie verwijderen?') && removeComment.mutate(c.id)}
                  >
                    <FarmIcon name="bin" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {user && (open || (!folded && commentCount > 0)) && (
        <form
          className="social-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) comment.mutate()
          }}
        >
          <Avatar user={user} size="tiny" static />
          {/* One line, with the smiley button inside it and the small picker above */}
          <span className="social-input">
            <input
              ref={input}
              className="text-box"
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="Schrijf een reactie…"
              aria-label="Reactie"
              autoFocus={open && commentCount === 0}
            />
            <button type="button" className="social-smiley-btn" data-mini-smileys title="Smileys" aria-label="Smileys" aria-expanded={smileys} onClick={() => setSmileys((o) => !o)}>
              <Smiley name="lach" />
            </button>
            {smileys && <MiniSmileyPicker onPick={insert} onClose={closeSmileys} />}
          </span>
          <Button type="submit" disabled={!text.trim() || comment.isPending}>
            Reageer
          </Button>
        </form>
      )}
      {(toggleRespect.isError || comment.isError) && (
        <p className="form-error">{errorMessage(toggleRespect.error ?? comment.error)}</p>
      )}
    </div>
  )
}

/** A post from Mastodon, Pixelfed and the like: how often it was boosted there, and its replies there (read from that server on request). */
function FediverseActivity({ activityId, fediverse }: { activityId: number; fediverse: NonNullable<Social['fediverse']> }) {
  const [open, setOpen] = useState(false)
  const replies = useQuery({
    queryKey: ['fediverse-replies', activityId],
    queryFn: () => api<FediverseReply[]>(`/activities/${activityId}/fediverse-replies`),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  })
  return (
    <div className="social-fedi">
      <p className="social-fedi-counts">
        {fediverse.boosts > 0 && (
          <span>
            <FarmIcon name="arrow_refresh" /> {fediverse.boosts}× gedeeld
          </span>
        )}
        {fediverse.replies > 0 && (
          <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <FarmIcon name="comments" /> {fediverse.replies} {fediverse.replies === 1 ? 'reactie' : 'reacties'} op {fediverse.domain}
          </button>
        )}
      </p>
      {open &&
        (replies.isLoading ? (
          <p className="muted">Laden…</p>
        ) : !replies.data?.length ? (
          <p className="muted">
            De reacties konden niet worden opgehaald.{' '}
            {fediverse.url && (
              <a href={fediverse.url} target="_blank" rel="noopener noreferrer nofollow">
                Bekijk ze op {fediverse.domain}
              </a>
            )}
          </p>
        ) : (
          <ul className="social-comments">
            {replies.data.map((r) => (
              <li key={r.id} className="social-comment">
                <Avatar user={{ username: r.handle, name: r.name, avatarUrl: null }} size="tiny" static />
                <div>
                  <b className="buzz-name">{r.name}</b> <span className="social-fedi-handle">@{r.handle}</span> <RichText text={r.text} />{' '}
                  {r.url ? (
                    <a className="date" href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                      {formatTime(r.createdAt)}
                    </a>
                  ) : (
                    <span className="date">{formatTime(r.createdAt)}</span>
                  )}
                </div>
              </li>
            ))}
            {fediverse.url && (
              <li>
                <a href={fediverse.url} target="_blank" rel="noopener noreferrer nofollow">
                  Reageer op {fediverse.domain}
                </a>
              </li>
            )}
          </ul>
        ))}
    </div>
  )
}
