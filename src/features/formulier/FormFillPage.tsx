import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FormAnswers, PublicForm } from '../../../shared/documents'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { usePageTitle } from '../../lib/usePageTitle'
import { AnswerField } from './AnswerField'
import './Formulier.css'

/** Filling in someone's form (/formulieren/:publicId). One go per member. */
export function FormFillPage() {
  const { publicId = '' } = useParams()
  const form = useQuery({
    queryKey: ['forms', publicId],
    queryFn: () => api<PublicForm>(`/forms/${publicId}`),
  })
  usePageTitle(form.data ? form.data.title : 'Formulier')
  const [answers, setAnswers] = useState<FormAnswers>({})
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const send = useMutation({
    mutationFn: () =>
      api(`/forms/${publicId}/responses`, {
        method: 'POST',
        body: { answers },
      }),
  })

  if (form.isLoading)
    return (
      <main className="page page-con frm-fill">
        <p className="empty">Formulier laden…</p>
      </main>
    )
  if (form.error || !form.data)
    return (
      <main className="page page-con frm-fill">
        <Box title="Formulier" icon="application_form">
          <p>{errorMessage(form.error)}</p>
        </Box>
      </main>
    )
  const f = form.data
  const owner = <Link to={`/profiel/${f.owner.username}`}>{f.owner.nickname}</Link>

  const done = send.isSuccess || f.answered
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const empty = new Set(
      f.questions
        .filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === '' || (Array.isArray(answers[q.id]) && !(answers[q.id] as string[]).length)))
        .map((q) => q.id),
    )
    setMissing(empty)
    if (empty.size) {
      document.getElementById(`frm-q-${[...empty][0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    send.mutate()
  }

  return (
    <main className="page page-con frm-fill">
      <div className="frm-fill-head">
        <FarmIcon name="application_form" size={32} />
        <div>
          <h1>{f.title}</h1>
          <p className="frm-fill-by">
            Een formulier van {owner}
            {f.anonymous ? ' · anoniem: je naam wordt niet meegestuurd' : ` · ${f.owner.nickname} ziet je naam bij je antwoorden`}
          </p>
        </div>
      </div>
      {f.description && <p className="frm-fill-desc">{f.description}</p>}
      {done ? (
        <Box title="Bedankt!" icon="accept">
          <p>{send.isSuccess ? 'Je antwoorden zijn verstuurd.' : 'Je hebt dit formulier al ingevuld.'}</p>
          <p>
            <Link to={`/profiel/${f.owner.username}`}>Naar het profiel van {f.owner.nickname}</Link>
          </p>
        </Box>
      ) : !f.open ? (
        <Box title="Gesloten" icon="lock">
          <p>Dit formulier neemt geen antwoorden meer aan.</p>
        </Box>
      ) : (
        <form className="frm-fill-form" onSubmit={submit} noValidate>
          {f.questions.map((q) => (
            <fieldset key={q.id} id={`frm-q-${q.id}`} className={missing.has(q.id) ? 'frm-fill-q missing' : 'frm-fill-q'}>
              <legend>
                {q.title || 'Vraag'}
                {q.required && (
                  <b className="frm-req" aria-label="verplicht">
                    {' '}
                    *
                  </b>
                )}
              </legend>
              {q.help && <p className="frm-help">{q.help}</p>}
              <AnswerField
                q={q}
                value={answers[q.id]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [q.id]: v }))
                  if (missing.has(q.id)) setMissing((m) => new Set([...m].filter((x) => x !== q.id)))
                }}
              />
              {missing.has(q.id) && <p className="form-error">Deze vraag is verplicht.</p>}
            </fieldset>
          ))}
          {send.error && <p className="form-error">{errorMessage(send.error)}</p>}
          <div className="frm-fill-send">
            <button type="submit" className="btn btn-cta" disabled={send.isPending}>
              {send.isPending ? 'Versturen…' : 'Versturen'}
            </button>
            {f.questions.some((q) => q.required) && (
              <span className="frm-help">
                <b className="frm-req">*</b> verplicht
              </span>
            )}
          </div>
        </form>
      )}
    </main>
  )
}
