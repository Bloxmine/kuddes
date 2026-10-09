/**
 * "Deel met": send this page (a review, recipe, blog, video…) to friends in
 * Kuddes Messenger, with a message if you like. They get it as a small
 * preview in the chat (ShareCard), and you can open the conversation.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { MessengerLine } from '../../../shared/messenger'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Buddy } from '../messenger/MessengerParts'
import { toneOf } from '../messenger/messengerFormat'
import { messengerKeys, useContacts } from '../messenger/messengerQueries'
import { openChat } from '../messenger/messengerStore'
import { SharePreviewCard } from './ShareCard'
import { useSharePreview } from './shareLinks'
import './Share.css'

/** The button; `path` is the page to share (default: this page). */
export function ShareWithFriends({ path, label = 'Deel met', className }: { path?: string; label?: string; className?: string }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user) return null
  const target = path ?? `${location.pathname}${location.search}`
  return (
    <>
      <button type="button" className={className ?? 'btn'} onClick={() => setOpen(true)} title="Stuur dit naar vrienden in Kuddes Messenger">
        <FarmIcon name="msn_messenger" /> {label}
      </button>
      {open && <ShareDialog path={target} onClose={() => setOpen(false)} />}
    </>
  )
}

function ShareDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: preview, isError } = useSharePreview(path)
  const { data } = useContacts()
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string[] | null>(null)

  const friends = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Online first, then by name
    return [...(data?.contacts ?? [])]
      .filter((c) => !q || c.nickname.toLowerCase().includes(q) || c.username.includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname, 'nl'))
  }, [data, query])

  const toggle = (u: string) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]))

  const send = async () => {
    setSending(true)
    setError(null)
    const sent: string[] = []
    try {
      for (const username of picked) {
        const line = await api<MessengerLine>(`/messenger/with/${encodeURIComponent(username)}`, { method: 'POST', body: { text: text.trim(), share: path } })
        sent.push(username)
        queryClient.setQueryData(messengerKeys.chat(username), (c: { lines: MessengerLine[] } | undefined) => (c && !c.lines.some((l) => l.id === line.id) ? { ...c, lines: [...c.lines, line] } : c))
      }
      setDone(sent)
    } catch (e) {
      setError(errorMessage(e))
      if (sent.length) setDone(sent)
    } finally {
      setSending(false)
    }
  }

  const nameOf = (u: string) => data?.contacts.find((c) => c.username === u)?.nickname ?? u

  return (
    <Modal title="Deel met vrienden" icon="msn_messenger" onClose={onClose}>
      {isError ? (
        <p className="form-error">Deze pagina kun je niet delen.</p>
      ) : (
        preview && <SharePreviewCard preview={preview} onOpen={onClose} />
      )}
      {done ? (
        <div className="share-done">
          <p>
            <FarmIcon name="accept" /> Gedeeld met {done.map(nameOf).join(', ')} in Kuddes Messenger.
          </p>
          {error && <p className="form-error">{error}</p>}
          <div className="share-actions">
            <Button
              variant="cta"
              onClick={() => {
                openChat(done[0])
                onClose()
              }}
            >
              <FarmIcon name="msn_messenger" /> Open het gesprek{done.length > 1 ? ` met ${nameOf(done[0])}` : ''}
            </Button>
            <Button onClick={onClose}>Klaar</Button>
          </div>
        </div>
      ) : !data ? (
        <p className="muted">Vrienden laden…</p>
      ) : !data.contacts.length ? (
        <p className="empty">Je hebt nog geen vrienden om iets mee te delen.</p>
      ) : (
        <>
          <input className="text-box share-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek een vriend" aria-label="Zoek een vriend" />
          <ul className="share-friends">
            {friends.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={picked.includes(c.username)} onChange={() => toggle(c.username)} />
                  <Buddy tone={toneOf(c.status)} /> {c.nickname}
                  <span className="muted">{c.status}</span>
                </label>
              </li>
            ))}
          </ul>
          <input className="text-box share-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Een berichtje erbij (mag leeg blijven)" aria-label="Bericht" />
          {error && <p className="form-error">{error}</p>}
          <div className="share-actions send">
            <Button variant="cta" disabled={!picked.length || sending || isError} onClick={() => void send()}>
              <FarmIcon name="email_go" /> {sending ? 'Versturen…' : picked.length > 1 ? `Stuur naar ${picked.length} vrienden` : 'Versturen'}
            </Button>
            <Button onClick={onClose}>Annuleren</Button>
          </div>
        </>
      )}
    </Modal>
  )
}
