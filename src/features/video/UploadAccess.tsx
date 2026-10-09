import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { VIDEO_REQUEST_LIMITS, VIDEO_TERMS, VIDEO_UPLOAD_REASONS, type VideoUploadAccess, type VideoUploadReason } from '../../../shared/videos'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { formatDate } from '../../lib/time'
import { VideoModule } from './VideoLayout'

const uploadAccessKey = ['videos', 'upload-access'] as const

/** The upload page for members who may upload; the request form for everyone else. */
export function UploadAccessGate({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, error } = useQuery({ queryKey: uploadAccessKey, queryFn: () => api<VideoUploadAccess>('/me/video-access') })
  if (isLoading) return <p className="muted">Laden…</p>
  if (isError) return <p className="form-error">{errorMessage(error)}</p>
  if (data!.allowed) return <>{children}</>
  return <RequestAccess access={data!} />
}

function RequestAccess({ access }: { access: VideoUploadAccess }) {
  const request = access.request
  const [again, setAgain] = useState(false)

  if (request?.status === 'open') {
    return (
      <VideoModule title="Je aanvraag ligt bij de beheerder">
        <div className="vt-access-status">
          <FarmIcon name="hourglass" size={32} />
          <div>
            <p>
              Je vroeg op {formatDate(request.createdAt)} of je video's mag uploaden. Zodra de beheerder ernaar gekeken heeft, krijg je een bericht in je{' '}
              <Link to="/berichten">Postvak IN</Link>.
            </p>
            <p className="muted">
              Waarom: {request.reasons.map((r) => VIDEO_UPLOAD_REASONS[r]).join(', ')}
            </p>
            <p>
              Intussen kun je gewoon <Link to="/video">video's kijken</Link>.
            </p>
          </div>
        </div>
      </VideoModule>
    )
  }

  if (request?.status === 'afgewezen' && !again) {
    return (
      <VideoModule title="Uploaden is (nog) niet gelukt">
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
      </VideoModule>
    )
  }

  return <RequestForm />
}

function RequestForm() {
  const queryClient = useQueryClient()
  const [reasons, setReasons] = useState<VideoUploadReason[]>([])
  const [motivation, setMotivation] = useState('')
  const [agree, setAgree] = useState(false)
  const send = useMutation({
    mutationFn: () => api<VideoUploadAccess>('/me/video-access', { method: 'POST', body: { reasons, motivation, agree } }),
    onSuccess: (data) => queryClient.setQueryData(uploadAccessKey, data),
  })
  const fields = send.error instanceof ApiRequestError ? send.error.fields : {}
  const toggle = (r: VideoUploadReason) => setReasons((list) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]))

  return (
    <VideoModule title="Video's uploaden aanvragen">
      <form
        className="vt-access-form"
        onSubmit={(e) => {
          e.preventDefault()
          send.mutate()
        }}
      >
        <p>
          <FarmIcon name="information" /> Iedereen kan video's kijken. Om Kuddes Video gezellig (en de server heel) te houden, vraag je eerst of je zelf mag
          uploaden. De beheerder krijgt je aanvraag als bericht en laat je weten of het goed is.
        </p>

        <fieldset className="vt-access-reasons">
          <legend>Waarvoor wil je video's uploaden? (kies er minstens één)</legend>
          {(Object.keys(VIDEO_UPLOAD_REASONS) as VideoUploadReason[]).map((r) => (
            <label key={r} className={reasons.includes(r) ? 'picked' : undefined}>
              <input type="checkbox" checked={reasons.includes(r)} onChange={() => toggle(r)} /> {VIDEO_UPLOAD_REASONS[r]}
            </label>
          ))}
          {fields.reasons && <span className="form-error">{fields.reasons}</span>}
        </fieldset>

        <Field label="Toelichting" hint={reasons.includes('anders') ? '(vertel waarvoor)' : '(mag, hoeft niet)'} error={fields.motivation}>
          <textarea
            className="text-box"
            rows={3}
            value={motivation}
            maxLength={VIDEO_REQUEST_LIMITS.motivation}
            onChange={(e) => setMotivation(e.target.value)}
            placeholder="Bijvoorbeeld: ik zit op een dansschool en wil onze optredens delen."
          />
        </Field>

        <div className="vt-access-terms">
          <b>De regels voor video's</b>
          <ul>
            {VIDEO_TERMS.map((t) => (
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
    </VideoModule>
  )
}
