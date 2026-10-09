import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'
import { Button } from './Button'
import { FarmIcon } from './FarmIcon'
import { Modal } from './Modal'
import './BannerUploadDialog.css'

/**
 * Choosing the wide image at the top of a page (a Kuddes Video channel, a
 * music page): upload one, then slide where it's cropped. `endpoint` takes a
 * PUT with the file and `y`, and a DELETE to take it away.
 */
export function BannerUploadDialog({ endpoint, currentUrl, currentY, onDone, onClose }: { endpoint: string; currentUrl: string | null; currentY: number; onDone: () => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [y, setY] = useState(currentY)
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  const shown = preview ?? currentUrl
  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      if (file) form.set('file', await compressImage(file, 2400))
      form.set('y', String(y))
      return api<void>(endpoint, { method: 'PUT', form })
    },
    onSuccess: () => {
      onDone()
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(endpoint, { method: 'DELETE' }),
    onSuccess: () => {
      onDone()
      onClose()
    },
  })
  return (
    <Modal title="Bannerafbeelding" icon="picture_sunset" onClose={onClose} wide>
      <div className="bnr">
        <label className="bnr-preview" style={shown ? { backgroundImage: `url(${shown})`, backgroundPositionY: `${y}%` } : undefined}>
          {!shown && (
            <span>
              <FarmIcon name="picture_add" size={32} /> Kies een brede afbeelding
            </span>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              setPreview(f ? URL.createObjectURL(f) : null)
            }}
            aria-label="Kies een afbeelding"
          />
        </label>
        {shown && (
          <label className="bnr-slider">
            <FarmIcon name="arrow_up" /> Uitsnede
            <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} />
            <FarmIcon name="arrow_down" />
          </label>
        )}
        <p className="muted bnr-note">Klik op het voorbeeld om een andere afbeelding te kiezen. Een brede foto (bijvoorbeeld 2000 × 500) staat het mooist.</p>
        <div className="account-actions">
          <Button variant="cta" disabled={!shown || save.isPending} onClick={() => save.mutate()}>
            <FarmIcon name="accept" /> {save.isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
          {currentUrl && (
            <Button disabled={remove.isPending} onClick={() => remove.mutate()}>
              <FarmIcon name="bin" /> Weghalen
            </Button>
          )}
          {(save.isError || remove.isError) && <span className="form-error">{errorMessage(save.error ?? remove.error)}</span>}
        </div>
      </div>
    </Modal>
  )
}
