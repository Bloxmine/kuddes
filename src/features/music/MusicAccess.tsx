/**
 * Uploading music (and hosting radio) needs the admin's OK, like Kuddes
 * Video: the request form, or where your request stands. `RightsRequest` is
 * the general one; RequestMusicAccess fills it in for music.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MUSIC_TERMS, MUSIC_UPLOAD_REASONS, type MusicUploadAccess } from '../../../shared/music'
import { VIDEO_REQUEST_LIMITS } from '../../../shared/videos'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { formatDate } from '../../lib/time'
import { musicKeys } from './musicQueries'
import '../video/Video.css'

type Access = { allowed: boolean; request: { status: 'open' | 'goedgekeurd' | 'afgewezen'; reasons: string[]; motivation: string; answer: string | null; createdAt: string } | null }

/** What the form asks and says, per kind of rights. */
export type RightsKind = {
  /** POST endpoint for the request. */
  endpoint: string
  /** Invalidated after sending. */
  queryKey: readonly unknown[]
  icon: FarmIconName
  title: string
  /** "muziek uploaden", "radio maken" */
  what: string
  /** Where you can go meanwhile ("muziek luisteren"). */
  meanwhile: { to: string; label: string }
  intro: ReactNode
  reasonsLabel: string
  reasons: Record<string, string>
  terms: string[]
  termsTitle: string
  placeholder: string
}

const MUSIC_RIGHTS: RightsKind = {
  endpoint: '/me/music-access',
  queryKey: musicKeys.me,
  icon: 'music',
  title: 'Muziek uploaden aanvragen',
  what: 'muziek uploaden',
  meanwhile: { to: '/muziek', label: 'muziek luisteren' },
  intro: (
    <>
      Iedereen kan muziek luisteren. Wil je zelf nummers laten horen? Vraag dan eerst of je mag uploaden: de beheerder krijgt je aanvraag als bericht en laat je
      weten of het goed is. Daarna maak je je eigen muziekpagina.
    </>
  ),
  reasonsLabel: 'Wat voor muziek wil je uploaden? (kies er minstens één)',
  reasons: MUSIC_UPLOAD_REASONS,
  terms: MUSIC_TERMS,
  termsTitle: 'De regels voor muziek',
  placeholder: "Bijvoorbeeld: ik speel gitaar in een band en wil onze demo's delen.",
}

export function RequestMusicAccess({ access }: { access: MusicUploadAccess }) {
  return <RightsRequest access={access} kind={MUSIC_RIGHTS} />
}

export function RightsRequest({ access, kind }: { access: Access; kind: RightsKind }) {
  const request = access.request
  const [again, setAgain] = useState(false)

  if (request?.status === 'open') {
    return (
      <Box title="Je aanvraag ligt bij de beheerder" icon="hourglass">
        <div className="vt-access-status">
          <FarmIcon name="hourglass" size={32} />
          <div>
            <p>
              Je vroeg op {formatDate(request.createdAt)} of je {kind.what} mag. Zodra de beheerder ernaar gekeken heeft, krijg je een bericht in je{' '}
              <Link to="/berichten">Postvak IN</Link>.
            </p>
            <p className="muted">Waarom: {request.reasons.map((r) => kind.reasons[r] ?? r).join(', ')}</p>
            <p>
              Intussen kun je gewoon <Link to={kind.meanwhile.to}>{kind.meanwhile.label}</Link>.
            </p>
          </div>
        </div>
      </Box>
    )
  }

  if (request?.status === 'afgewezen' && !again) {
    return (
      <Box title="Dat is (nog) niet gelukt" icon="lock">
        <div className="vt-access-status">
          <FarmIcon name="lock" size={32} />
          <div>
            <p>De beheerder heeft je aanvraag van {formatDate(request.createdAt)} afgewezen.</p>
            {request.answer && (
              <blockquote className="vt-access-answer">
                <FarmIcon name="comment" /> {request.answer}
              </blockquote>
            )}
            <Button onClick={() => setAgain(true)}>
              <FarmIcon name="arrow_redo" /> Opnieuw aanvragen
            </Button>
          </div>
        </div>
      </Box>
    )
  }

  return <RequestForm kind={kind} />
}

function RequestForm({ kind }: { kind: RightsKind }) {
  const queryClient = useQueryClient()
  const [reasons, setReasons] = useState<string[]>([])
  const [motivation, setMotivation] = useState('')
  const [agree, setAgree] = useState(false)
  const send = useMutation({
    mutationFn: () => api<Access>(kind.endpoint, { method: 'POST', body: { reasons, motivation, agree } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: kind.queryKey }),
  })
  const fields = send.error instanceof ApiRequestError ? send.error.fields : {}
  const toggle = (r: string) => setReasons((list) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]))

  return (
    <Box title={kind.title} icon={kind.icon}>
      <form
        className="vt-access-form"
        onSubmit={(e) => {
          e.preventDefault()
          send.mutate()
        }}
      >
        <p>
          <FarmIcon name="information" /> {kind.intro}
        </p>

        <fieldset className="vt-access-reasons">
          <legend>{kind.reasonsLabel}</legend>
          {Object.entries(kind.reasons).map(([r, label]) => (
            <label key={r} className={reasons.includes(r) ? 'picked' : undefined}>
              <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggle(r)} /> {label}
            </label>
          ))}
          {fields.reasons && <span className="form-error">{fields.reasons}</span>}
        </fieldset>

        <Field label="Toelichting" hint={reasons.includes('anders') ? '(vertel waarvoor)' : '(mag, hoeft niet)'} error={fields.motivation}>
          <textarea className="text-box" rows={3} value={motivation} maxLength={VIDEO_REQUEST_LIMITS.motivation} onChange={(e) => setMotivation(e.target.value)} placeholder={kind.placeholder} />
        </Field>

        <div className="vt-access-terms">
          <b>{kind.termsTitle}</b>
          <ul>
            {kind.terms.map((t) => (
              <li key={t}>
                <FarmIcon name="tick" /> {t}
              </li>
            ))}
          </ul>
          <label className="gadget-toggle">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Ik ga akkoord met deze regels
          </label>
          {fields.agree && <span className="form-error">{fields.agree}</span>}
        </div>

        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!agree || reasons.length === 0 || send.isPending}>
            <FarmIcon name="email_go" /> Aanvraag versturen
          </Button>
          {send.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(send.error)}</span>}
        </div>
      </form>
    </Box>
  )
}
