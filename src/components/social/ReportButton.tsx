import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { REPORT_LIMITS, REPORT_REASONS, type ReportKind, type ReportReason, type ReportResult } from '../../../shared/safety'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button } from '../ui/Button'
import { FarmIcon } from '../ui/FarmIcon'
import { Modal } from '../ui/Modal'
import './ReportButton.css'

/**
 * "Melden": tell the admin something isn't right. Not shown on your own
 * things. After enough reports (or one about something urgent) it's hidden
 * until the admin looked (server/lib/reports.ts).
 */
export function ReportButton({
  kind,
  targetId,
  authorId,
  look = 'icon',
}: {
  kind: ReportKind
  targetId: number
  authorId: number | null | undefined
  look?: 'icon' | 'link' | 'button'
}) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  if (!user || user.id === authorId) return null
  const trigger =
    look === 'button' ? (
      <Button onClick={() => setOpen(true)}>
        <FarmIcon name="flag_red" /> Melden
      </Button>
    ) : look === 'link' ? (
      <button type="button" className="link-button report-link" onClick={() => setOpen(true)}>
        Melden
      </button>
    ) : (
      <button type="button" className="icon-button report-icon" title="Melden" aria-label="Melden" onClick={() => setOpen(true)}>
        <FarmIcon name="flag_red" />
      </button>
    )
  return (
    <>
      {trigger}
      {open && <ReportDialog kind={kind} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  )
}

function ReportDialog({ kind, targetId, onClose }: { kind: ReportKind; targetId: number; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const send = useMutation({
    mutationFn: () => api<ReportResult>('/reports', { method: 'POST', body: { kind, targetId, reason, note } }),
    // Hidden at once: the lists show it without it
    onSuccess: (r) => r.hidden && void queryClient.invalidateQueries(),
  })
  return (
    <Modal title="Melden" icon="flag_red" onClose={onClose}>
      {send.isSuccess ? (
        <div className="report-done">
          <p>
            <FarmIcon name="accept" /> Bedankt voor je melding.{' '}
            {send.data.hidden ? 'Het is meteen verborgen, tot de beheerder ernaar kijkt.' : 'De beheerder kijkt ernaar; melden meer leden het, dan wordt het vanzelf verborgen.'}
          </p>
          <Button onClick={onClose}>Sluiten</Button>
        </div>
      ) : (
        <form
          className="report-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (reason) send.mutate()
          }}
        >
          <p>Wat is er aan de hand?</p>
          <div className="report-reasons" role="radiogroup">
            {(Object.keys(REPORT_REASONS) as ReportReason[]).map((r) => (
              <label key={r} className={reason === r ? 'on' : undefined}>
                <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} /> {REPORT_REASONS[r].name}
              </label>
            ))}
          </div>
          <textarea
            className="text-box"
            rows={3}
            maxLength={REPORT_LIMITS.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wil je er iets bij vertellen? (mag leeg)"
          />
          <p className="muted">Alleen de beheerder ziet wie meldde. Is iemand in direct gevaar, bel dan 112; voor strafbare dingen kun je ook naar de politie (0900-8844).</p>
          {send.isError && <p className="form-error">{errorMessage(send.error)}</p>}
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={!reason || send.isPending}>
              <FarmIcon name="flag_red" /> Melden
            </Button>
            <Button onClick={onClose}>Annuleren</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
