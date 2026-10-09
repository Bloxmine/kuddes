import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Message, Recipient } from '../../../shared/api'
import { SmileyPicker, TextPreview } from '../../components/social/SmileyPicker'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Smiley } from '../../lib/smileys'
import { api, ApiRequestError, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useMessage } from '../../lib/queries'
import { hasMarkup, useTextEditing } from '../../lib/textEditing'
import { formatTime } from '../../lib/time'
import { useRefreshMessages } from './messageLinks'
import '../../components/social/StatusComposer.css'

const MAX_SUBJECT = 120
const MAX_BODY = 5000
const AUTOSAVE_MS = 2500

type Draft = { id: number | null; to: string; subject: string; body: string; replyToId: number | null }

const withPrefix = (prefix: string, subject: string) =>
  subject.toLowerCase().startsWith(prefix.toLowerCase()) ? subject : `${prefix} ${subject}`

/** The original as "> " lines under the answer, like e-mail. */
const quote = (m: Message) =>
  `\n\n----- ${m.sentAt ? formatTime(m.sentAt) : ''} schreef ${m.from.nickname}: -----\n` +
  m.body
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')

/**
 * "Nieuw bericht": works out what to start with (?concept=, ?antwoord=,
 * ?doorsturen= or ?aan=) and then shows the form.
 */
export function MessageComposer() {
  const [params] = useSearchParams()
  const conceptId = Number(params.get('concept')) || null
  const replyId = Number(params.get('antwoord')) || null
  const forwardId = Number(params.get('doorsturen')) || null
  const sourceId = conceptId ?? replyId ?? forwardId
  const source = useMessage(sourceId)

  if (sourceId && source.isLoading) return <p className="muted">Laden…</p>
  if (sourceId && !source.data) {
    return (
      <Box title="Bericht niet gevonden" icon="warning">
        <p>{source.error instanceof ApiRequestError ? source.error.message : 'Dit bericht kon niet geladen worden.'}</p>
      </Box>
    )
  }

  const m = source.data
  const initial: Draft =
    conceptId && m
      ? { id: m.id, to: m.to?.username ?? '', subject: m.subject, body: m.body, replyToId: m.replyToId }
      : replyId && m
        ? { id: null, to: m.from.username, subject: withPrefix('Re:', m.subject), body: quote(m), replyToId: m.id }
        : forwardId && m
          ? { id: null, to: '', subject: withPrefix('Fwd:', m.subject), body: quote(m), replyToId: m.id }
          : { id: null, to: params.get('aan') ?? '', subject: '', body: '', replyToId: null }

  // Keyed so switching between concepts or answers starts a fresh form
  return <ComposerForm key={params.toString()} initial={initial} title={replyId ? 'Beantwoorden' : forwardId ? 'Doorsturen' : conceptId ? 'Concept' : 'Nieuw bericht'} />
}

function RecipientField({ value, onChange, error }: { value: string; onChange: (username: string) => void; error?: string }) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 200)
    return () => clearTimeout(t)
  }, [text])
  const { data: results = [] } = useQuery({
    queryKey: ['messages', 'recipients', debounced],
    queryFn: () => api<Recipient[]>(`/messages/recipients?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length >= 1,
    staleTime: 30_000,
  })
  const picked = results.find((r) => r.username === value)

  return (
    <Field label="Aan" error={error}>
      <div className="recipient-field">
        <input
          className="text-box"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            onChange(e.target.value.trim().replace(/^@/, '').toLowerCase())
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Naam of gebruikersnaam"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && results.length > 0}
        />
        {picked && !open && (
          <span className={picked.allowed ? 'recipient-state ok' : 'recipient-state no'}>
            <FarmIcon name={picked.allowed ? 'accept' : 'lock'} /> {picked.allowed ? picked.nickname : picked.reason}
          </span>
        )}
        {open && results.length > 0 && (
          <ul className="recipient-results" role="listbox">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.username === value}
                  disabled={!r.allowed}
                  title={r.reason ?? undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setText(r.nickname === r.username ? r.username : `${r.nickname} (@${r.username})`)
                    onChange(r.username)
                    setOpen(false)
                  }}
                >
                  <Avatar user={r} size="tiny" static />
                  <span>
                    <b>{r.nickname}</b> <span className="muted">@{r.username}</span>
                    {!r.allowed && (
                      <small className="recipient-reason">
                        <FarmIcon name="lock" /> {r.reason}
                      </small>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  )
}

function ComposerForm({ initial, title }: { initial: Draft; title: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const refresh = useRefreshMessages()
  const [draft, setDraft] = useState(initial)
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(initial))
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<ApiRequestError | Error | null>(null)
  const [smileysOpen, setSmileysOpen] = useState(false)
  const [previewClosed, setPreviewClosed] = useState(false)
  const setBody = (body: string) => setDraft((d) => ({ ...d, body }))
  const { ref: textRef, wrap, addLink, insert } = useTextEditing(draft.body, setBody, MAX_BODY)
  const inFlight = useRef<Promise<number | null> | null>(null)
  const idRef = useRef(initial.id)

  const dirty = JSON.stringify(draft) !== savedJson
  // Only a recipient isn't worth keeping as a concept yet
  const hasContent = !!(draft.subject.trim() || draft.body.trim())
  const fields = error instanceof ApiRequestError ? error.fields : {}

  /** Save (or send) through one queue, so autosave and "Versturen" can't create two rows. */
  const persist = async (send: boolean): Promise<Message> => {
    await inFlight.current?.catch(() => null)
    const body = { to: draft.to || null, subject: draft.subject, body: draft.body, replyToId: draft.replyToId, send }
    const request = idRef.current
      ? api<Message>(`/messages/${idRef.current}`, { method: 'PATCH', body })
      : api<Message>('/messages', { method: 'POST', body })
    inFlight.current = request.then((m) => m.id)
    const saved = await request
    idRef.current = saved.id
    return saved
  }

  const saveDraft = async () => {
    const saving = draft
    try {
      const saved = await persist(false)
      // Anything typed while saving stays "niet opgeslagen" for the next autosave
      setDraft((d) => ({ ...d, id: saved.id }))
      setSavedJson(JSON.stringify({ ...saving, id: saved.id }))
      setSavedAt(new Date())
      setError(null)
      refresh()
    } catch (e) {
      setError(e as Error)
    }
  }

  // Autosave as a concept a moment after you stop typing
  useEffect(() => {
    if (!dirty || !hasContent || sending) return
    const t = setTimeout(saveDraft, AUTOSAVE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on every change of the draft
  }, [draft, sending])

  // Don't lose an unsaved message by closing the tab
  useEffect(() => {
    if (!dirty || !hasContent) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, hasContent])

  const send = async () => {
    setSending(true)
    try {
      const sent = await persist(true)
      setSavedJson(JSON.stringify(draft))
      await refresh()
      navigate(`/berichten/${sent.id}`, { state: { sent: true } })
    } catch (e) {
      setError(e as Error)
      setSending(false)
    }
  }

  const discard = async () => {
    if (!confirm(idRef.current ? 'Dit concept verwijderen?' : 'Dit bericht weggooien?')) return
    await inFlight.current?.catch(() => null)
    if (idRef.current) await api<void>(`/messages/${idRef.current}`, { method: 'DELETE' }).catch(() => null)
    setSavedJson(JSON.stringify(draft))
    await refresh()
    navigate(idRef.current ? '/berichten?map=concepten' : '/berichten')
  }

  const showPreview = hasMarkup(draft.body) && !previewClosed

  return (
    <Box title={title} icon={title === 'Beantwoorden' ? 'arrow_turn_left' : title === 'Doorsturen' ? 'arrow_redo' : 'email_edit'} className="message-compose">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <RecipientField value={draft.to} onChange={(to) => setDraft((d) => ({ ...d, to }))} error={fields.to} />
        <Field label="Onderwerp" error={fields.subject}>
          <input
            className="text-box"
            value={draft.subject}
            maxLength={MAX_SUBJECT}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            placeholder="Waar gaat je bericht over?"
          />
        </Field>

        <div className={showPreview ? 'message-editor with-preview' : 'message-editor'}>
          <div className="composer-editor">
            <div className="composer-toolbar" role="toolbar" aria-label="Opmaak">
              <button type="button" title="Vet" aria-label="Vet" onClick={() => wrap('**')}>
                <FarmIcon name="text_bold" />
              </button>
              <button type="button" title="Schuin" aria-label="Schuin" onClick={() => wrap('*')}>
                <FarmIcon name="text_italic" />
              </button>
              <button type="button" title="Link" aria-label="Link" onClick={addLink}>
                <FarmIcon name="link" />
              </button>
              <button type="button" title="Doorgestreept" aria-label="Doorgestreept" onClick={() => wrap('~~')}>
                <FarmIcon name="text_strikethrough" />
              </button>
              <button
                type="button"
                title="Smileys"
                aria-label="Smileys"
                aria-expanded={smileysOpen}
                className={smileysOpen ? 'current' : undefined}
                onClick={() => setSmileysOpen((o) => !o)}
              >
                <Smiley name="lach" />
              </button>
            </div>
            <textarea
              ref={textRef}
              className="composer-text"
              rows={10}
              value={draft.body}
              maxLength={MAX_BODY}
              aria-label="Bericht"
              placeholder="Schrijf je bericht…"
              onChange={(e) => {
                setBody(e.target.value)
                setPreviewClosed(false)
              }}
            />
          </div>
          {showPreview && <TextPreview text={draft.body} onClose={() => setPreviewClosed(true)} />}
        </div>
        {fields.body && <p className="form-error">{fields.body}</p>}
        {smileysOpen && <SmileyPicker onPick={insert} />}

        <div className="message-compose-bar">
          <Button variant="cta" type="submit" disabled={sending} title={user?.preferences.sendShortcut ? 'Of druk op Ctrl+Enter' : undefined}>
            <FarmIcon name="email_go" /> {sending ? 'Versturen…' : 'Versturen'}
          </Button>
          <Button disabled={sending || !dirty || !hasContent} onClick={saveDraft}>
            <FarmIcon name="diskette" /> Opslaan als concept
          </Button>
          <Button disabled={sending} onClick={discard}>
            <FarmIcon name="bin" /> {idRef.current ? 'Concept verwijderen' : 'Weggooien'}
          </Button>
          <span className="muted message-compose-status">
            {[
              dirty && hasContent ? 'Niet opgeslagen' : savedAt ? `Concept opgeslagen om ${formatTime(savedAt.toISOString()).replace(/^vandaag, /, '')}` : '',
              `${MAX_BODY - draft.body.length} tekens over`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {error && Object.keys(fields).length === 0 && <p className="form-error">{errorMessage(error)}</p>}
        <p className="muted message-compose-hint">
          <FarmIcon name="information" /> Berichten zijn alleen zichtbaar voor jou en de ontvanger. Wat je nog niet hebt
          verstuurd, wordt vanzelf bewaard in <Link to="/berichten?map=concepten">Concepten</Link>.
        </p>
      </form>
    </Box>
  )
}
