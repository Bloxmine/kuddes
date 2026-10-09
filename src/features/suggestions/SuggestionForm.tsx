import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { FarmIcon } from '../../components/ui/FarmIcon'
import './SuggestionForm.css'

type Kind = 'suggestie' | 'probleem'

type SuggestionFormProps = {
  initialKind?: Kind
  /** Page the problem happened on; defaults to the current page. */
  page?: string
  onDone?: () => void
  /** Render without the surrounding box (inside a dialog). */
  bare?: boolean
}

/** Send a suggestion (public) or report a problem (only the team sees it). */
export function SuggestionForm({ initialKind = 'suggestie', page, onDone, bare }: SuggestionFormProps) {
  const { user } = useAuth()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<Kind>(initialKind)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const send = useMutation({
    mutationFn: () =>
      api<void>('/suggestions', {
        method: 'POST',
        body: { kind, title, body, page: page ?? location.pathname + location.search },
      }),
    onSuccess: async () => {
      setTitle('')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: keys.suggestions })
    },
  })
  const fields = send.error instanceof ApiRequestError ? send.error.fields : {}

  const content = !user ? (
    <p>
      <Link to={`/inloggen?next=${encodeURIComponent(location.pathname)}`}>Log in</Link> om een suggestie te doen of een
      probleem te melden.
    </p>
  ) : send.isSuccess ? (
    <div>
      <p className="form-success">
        {kind === 'probleem' ? 'Bedankt! We gaan ernaar kijken.' : 'Bedankt voor je suggestie!'}
      </p>
      <br />
      <Button onClick={() => (onDone ? onDone() : send.reset())}>{onDone ? 'Sluiten' : 'Nog een sturen'}</Button>
    </div>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        send.mutate()
      }}
    >
      <div className="kind-switch" role="radiogroup" aria-label="Soort bericht">
        {(['suggestie', 'probleem'] as const).map((k) => (
          <label key={k} className={k === kind ? 'current' : undefined}>
            <input type="radio" name="kind" checked={k === kind} onChange={() => setKind(k)} />
            <FarmIcon name={k === 'suggestie' ? 'lightbulb' : 'warning'} /> {k === 'suggestie' ? 'Suggestie' : 'Probleem'}
          </label>
        ))}
      </div>
      <Field label="Titel" error={fields.title}>
        <input
          className="text-box"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          placeholder={kind === 'probleem' ? 'Wat gaat er mis?' : 'Je idee in een paar woorden'}
          required
        />
      </Field>
      <Field label={kind === 'probleem' ? 'Wat gebeurde er?' : 'Vertel meer'} error={fields.body}>
        <textarea className="text-box" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={3000} required />
      </Field>
      <p className="muted kind-note">
        {kind === 'probleem'
          ? 'Alleen het Kuddes-team ziet je melding, samen met de pagina waar je was.'
          : 'Suggesties zijn voor iedereen zichtbaar.'}
      </p>
      <Button variant="cta" type="submit" disabled={send.isPending}>
        Versturen
      </Button>
      {send.isError && Object.keys(fields).length === 0 && <p className="form-error">{errorMessage(send.error)}</p>}
    </form>
  )

  if (bare) return content
  return (
    <Box title={kind === 'probleem' ? 'Probleem melden' : 'Doe een suggestie'} icon={kind === 'probleem' ? 'warning' : 'lightbulb'}>
      {content}
    </Box>
  )
}
