import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { answerLeave, confirmLeave, hasUnsaved, useLeaveQuestion } from '../../lib/unsavedChanges'
import { errorMessage } from '../../lib/api'
import { Button } from '../ui/Button'
import { FarmIcon } from '../ui/FarmIcon'
import { Modal } from '../ui/Modal'

/**
 * Asks before you leave unsaved changes behind (src/lib/unsavedChanges.ts):
 * on closing or reloading the tab (the browser's question), and on links
 * within Kuddes (this pop-up: save and go, go without saving, or stay).
 */
export function UnsavedGuard() {
  const navigate = useNavigate()
  const { open, entries } = useLeaveQuestion()
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsaved()) e.preventDefault()
    }
    // Links: caught before React Router follows them
    const click = (e: MouseEvent) => {
      if (!hasUnsaved() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin) return
      // Only a different place on the same page: nothing is lost
      if (url.pathname === location.pathname && url.search === location.search) return
      e.preventDefault()
      e.stopPropagation()
      void confirmLeave().then((leave) => leave && navigate(url.pathname + url.search + url.hash))
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', click, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', click, true)
    }
  }, [navigate])

  if (!open) return null
  const canSave = entries.length > 0 && entries.every((e) => e.save)
  const saveAndGo = async () => {
    setSaving(true)
    setProblem(null)
    try {
      for (const e of entries) await e.save!()
      answerLeave(true)
    } catch (err) {
      setProblem(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title="Niet opgeslagen" icon="warning" onClose={() => answerLeave(false)}>
      <div className="unsaved-question">
        <p>
          Je hebt nog niet opgeslagen: <b>{entries.map((e) => e.what).join(', ')}</b>. Als je nu weggaat, ben je die wijzigingen kwijt.
        </p>
        <div className="account-actions">
          {canSave && (
            <Button variant="cta" onClick={() => void saveAndGo()} disabled={saving}>
              <FarmIcon name="diskette" /> {saving ? 'Opslaan…' : 'Opslaan en verdergaan'}
            </Button>
          )}
          <Button onClick={() => answerLeave(true)} disabled={saving}>
            Niet opslaan
          </Button>
          <Button onClick={() => answerLeave(false)} disabled={saving}>
            Blijven
          </Button>
        </div>
        {problem && <p className="form-error">{problem}</p>}
      </div>
    </Modal>
  )
}
