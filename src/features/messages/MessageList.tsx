import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { MessageBox, MessageSummary } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useMessages } from '../../lib/queries'
import { withSmileys } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { BOXES, messageHref, useRefreshMessages } from './messageLinks'
import { BotBadge } from '../../components/ui/BotBadge'

const EMPTY: Record<MessageBox, string> = {
  inbox: 'Je Postvak IN is leeg. Tijd om zelf eens iemand een bericht te sturen!',
  verzonden: 'Je hebt nog geen berichten verstuurd.',
  concepten: 'Geen concepten. Berichten die je nog niet hebt verstuurd, komen hier te staan.',
}

/** One folder: a searchable list with checkboxes to delete or mark several at once. */
export function MessageList({ box }: { box: MessageBox }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const list = useMessages(box, search)
  const refresh = useRefreshMessages()
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const info = BOXES.find((b) => b.key === box)!

  const bulk = useMutation({
    mutationFn: (action: 'delete' | 'read' | 'unread') =>
      api<{ count: number }>('/messages/bulk', { method: 'POST', body: { ids: [...selected], action } }),
    onSuccess: async (_, action) => {
      if (action === 'delete') setSelected(new Set())
      await refresh()
    },
  })

  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allSelected = items.length > 0 && items.every((m) => selected.has(m.id))
  const who = (m: MessageSummary) => (box === 'inbox' ? m.from : m.to)

  return (
    <Box title={info.label} icon={info.icon} className="message-list-box" noPadding>
      <div className="message-toolbar">
        <label className="message-check" title="Alles selecteren">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((m) => m.id)))}
            aria-label="Alles selecteren"
          />
        </label>
        <Button
          disabled={!selected.size || bulk.isPending}
          onClick={() => {
            if (confirm(`${selected.size === 1 ? 'Dit bericht' : `Deze ${selected.size} berichten`} verwijderen?`)) bulk.mutate('delete')
          }}
        >
          <FarmIcon name="email_delete" /> Verwijderen
        </Button>
        {box === 'inbox' && (
          <>
            <Button disabled={!selected.size || bulk.isPending} onClick={() => bulk.mutate('read')}>
              <FarmIcon name="email_open" /> Gelezen
            </Button>
            <Button disabled={!selected.size || bulk.isPending} onClick={() => bulk.mutate('unread')}>
              <FarmIcon name="email" /> Ongelezen
            </Button>
          </>
        )}
        <button type="button" className="icon-button" title="Vernieuwen" aria-label="Vernieuwen" onClick={() => list.refetch()}>
          <FarmIcon name="arrow_refresh" />
        </button>
        <form
          className="message-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(query.trim())
            setSelected(new Set())
          }}
        >
          <input
            type="search"
            className="text-box"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (!e.target.value) setSearch('')
            }}
            placeholder={`Zoek in ${info.label}`}
            aria-label={`Zoek in ${info.label}`}
          />
          <button type="submit" className="icon-button" title="Zoeken" aria-label="Zoeken">
            <FarmIcon name="magnifier" />
          </button>
        </form>
      </div>
      {bulk.isError && <p className="form-error message-error">{errorMessage(bulk.error)}</p>}

      {list.isLoading ? (
        <p className="muted message-empty">Laden…</p>
      ) : list.isError ? (
        <p className="form-error message-empty">{errorMessage(list.error)}</p>
      ) : items.length === 0 ? (
        <p className="empty message-empty">{search ? `Niets gevonden voor "${search}".` : EMPTY[box]}</p>
      ) : (
        <ul className="message-rows">
          {items.map((m) => {
            const person = who(m)
            return (
              <li
                key={m.id}
                className={[m.read ? '' : 'unread', selected.has(m.id) ? 'selected' : ''].join(' ').trim() || undefined}
                onClick={(e) => {
                  // The whole row opens the message, except the checkbox and links in it
                  if (!(e.target as HTMLElement).closest('a, input, label')) navigate(messageHref(m))
                }}
              >
                <label className="message-check">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Selecteer "${m.subject}"`} />
                </label>
                <FarmIcon
                  name={m.box === 'concepten' ? 'email_edit' : m.read ? 'email_open' : 'email'}
                  label={m.box === 'concepten' ? 'Concept' : m.read ? 'Gelezen' : 'Ongelezen'}
                />
                {person ? <Avatar user={person} size="tiny" /> : <span className="message-no-avatar" />}
                <span className="message-who">
                  {box !== 'inbox' && <span className="muted">Aan: </span>}
                  {person ? person.nickname : <i className="muted">nog niemand</i>} <BotBadge user={person} />
                </span>
                <Link to={messageHref(m)} className="message-subject">
                  <b>{m.subject || '(geen onderwerp)'}</b>
                  <span className="muted"> — {m.preview ? withSmileys(m.preview) : 'leeg bericht'}</span>
                </Link>
                <time className="date" dateTime={m.sentAt ?? m.updatedAt}>
                  {formatTime(m.sentAt ?? m.updatedAt)}
                </time>
              </li>
            )
          })}
        </ul>
      )}
      {list.hasNextPage && (
        <div className="message-more">
          <Button disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
            {list.isFetchingNextPage ? 'Laden…' : 'Oudere berichten'}
          </Button>
        </div>
      )}
    </Box>
  )
}
