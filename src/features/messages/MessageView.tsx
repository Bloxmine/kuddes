import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, ApiRequestError, errorMessage } from '../../lib/api'
import { useMessage } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { formatTime } from '../../lib/time'
import { boxHref, useRefreshMessages } from './messageLinks'
import { BotBadge } from '../../components/ui/BotBadge'
import { ReportButton } from '../../components/social/ReportButton'

/** One message, with Beantwoorden, Doorsturen, Ongelezen and Verwijderen. */
export function MessageView({ id }: { id: number }) {
  const navigate = useNavigate()
  const justSent = (useLocation().state as { sent?: boolean } | null)?.sent
  const { data: m, error, isLoading } = useMessage(id)
  const refresh = useRefreshMessages()
  const queryClient = useQueryClient()

  // Opening it marked it read: update the unread badge and the list
  const loadedId = m?.id
  useEffect(() => {
    if (!loadedId) return
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'messages' && q.queryKey[1] !== 'detail' })
  }, [loadedId, queryClient])

  const remove = useMutation({
    mutationFn: () => api<void>(`/messages/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh()
      navigate(boxHref(m?.box ?? 'inbox'))
    },
  })
  const markUnread = useMutation({
    mutationFn: () => api('/messages/bulk', { method: 'POST', body: { ids: [id], action: 'unread' } }),
    onSuccess: async () => {
      await refresh()
      navigate('/berichten')
    },
  })

  if (isLoading) return <p className="muted">Bericht laden…</p>
  if (!m) {
    return (
      <Box title="Bericht niet gevonden" icon="warning">
        <p>{error instanceof ApiRequestError ? error.message : 'Dit bericht kon niet geladen worden.'}</p>
        <br />
        <Link to="/berichten">« Terug naar Postvak IN</Link>
      </Box>
    )
  }

  const other = m.box === 'inbox' ? m.from : m.to

  return (
    <Box title={m.subject || '(geen onderwerp)'} icon={m.box === 'inbox' ? 'email_open' : 'email_go'} className="message-view">
      {justSent && (
        <p className="form-success message-sent">
          <FarmIcon name="accept" /> Je bericht is verstuurd!
        </p>
      )}
      <div className="message-actions">
        <Link to={boxHref(m.box)} className="btn">
          <FarmIcon name="arrow_left" /> Terug
        </Link>
        {m.canReply && (
          <Link to={`/berichten/nieuw?antwoord=${m.id}`} className="btn btn-cta">
            <FarmIcon name="arrow_turn_left" /> Beantwoorden
          </Link>
        )}
        <Link to={`/berichten/nieuw?doorsturen=${m.id}`} className="btn">
          <FarmIcon name="arrow_redo" /> Doorsturen
        </Link>
        {m.box === 'inbox' && (
          <Button disabled={markUnread.isPending} onClick={() => markUnread.mutate()}>
            <FarmIcon name="email" /> Markeer als ongelezen
          </Button>
        )}
        <Button
          disabled={remove.isPending}
          onClick={() => {
            if (confirm('Dit bericht verwijderen?')) remove.mutate()
          }}
        >
          <FarmIcon name="email_delete" /> Verwijderen
        </Button>
        {m.box === 'inbox' && <ReportButton kind="bericht" targetId={m.id} authorId={m.from.id} look="button" />}
      </div>

      <div className="message-head">
        {other && <Avatar user={other} size="small" />}
        <dl>
          <dt>Van:</dt>
          <dd>
            <Link to={`/profiel/${m.from.username}`}>{m.from.nickname}</Link> <BotBadge user={m.from} />
          </dd>
          <dt>Aan:</dt>
          <dd>{m.to ? <Link to={`/profiel/${m.to.username}`}>{m.to.nickname}</Link> : '—'}</dd>
          <dt>Verstuurd:</dt>
          <dd>{m.sentAt ? formatTime(m.sentAt) : 'nog niet'}</dd>
        </dl>
      </div>

      <div className="message-body">
        <RichText text={m.body} />
      </div>

      {m.replyToId && (
        <p className="message-thread muted">
          <FarmIcon name="comment" /> Dit is een antwoord op{' '}
          <Link to={`/berichten/${m.replyToId}`}>een eerder bericht</Link>.
        </p>
      )}
      {(remove.isError || markUnread.isError) && <p className="form-error">{errorMessage(remove.error ?? markUnread.error)}</p>}
    </Box>
  )
}
