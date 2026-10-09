/**
 * Before a new profile picture goes up: an Oldstagram filter and a border if
 * you like. With either one the picture is cut square (as in the original
 * app, and as profile pictures are shown); without them it goes up as it is.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { NO_EDITS, type PhotoFrame, type PhotoLook } from '../../../shared/photoEdits'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { compressImage } from '../../lib/compressImage'
import { LookPicker } from './LookPicker'
import { useBorders } from './oldsta'
import { applyFinish, canvasToFile } from './renderEdits'

/** As big as profile pictures are uploaded anyway. */
const SIDE = 800

/** The middle square of the picture, at most `max` pixels. */
function square(bitmap: ImageBitmap, max: number) {
  const side = Math.min(bitmap.width, bitmap.height)
  const c = document.createElement('canvas')
  c.width = c.height = Math.min(side, max)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, c.width, c.height)
  return c
}

export function AvatarStyler({ file, busy, onUpload, onCancel }: { file: File; busy: boolean; onUpload: (file: File) => void; onCancel: () => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [failed, setFailed] = useState(false)
  const [look, setLook] = useState<PhotoLook | null>(null)
  const [frame, setFrame] = useState<PhotoFrame | null>(null)
  const [making, setMaking] = useState(false)
  const borders = useBorders()
  const view = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let live = true
    let made: ImageBitmap | null = null
    createImageBitmap(file, { imageOrientation: 'from-image' }).then(
      (b) => {
        made = b
        if (live) setBitmap(b)
        else b.close()
      },
      () => live && setFailed(true),
    )
    return () => {
      live = false
      made?.close()
    }
  }, [file])

  const base = useMemo(() => (bitmap ? square(bitmap, SIDE) : null), [bitmap])
  const small = useMemo(() => (bitmap ? square(bitmap, 120) : null), [bitmap])
  const edits = { ...NO_EDITS, look, frame }
  const border = frame ? (borders[frame] ?? null) : null
  const styled = !!look || !!frame

  useEffect(() => {
    const c = view.current
    if (!base || !bitmap || !c) return
    if (look || frame) applyFinish(base, { ...NO_EDITS, look, frame }, border, c)
    else {
      // Without a filter or border it goes up whole, so show it whole
      const scale = Math.min(1, SIDE / Math.max(bitmap.width, bitmap.height))
      c.width = Math.round(bitmap.width * scale)
      c.height = Math.round(bitmap.height * scale)
      c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height)
    }
  }, [base, bitmap, look, frame, border])

  const save = async () => {
    setMaking(true)
    try {
      onUpload(styled && base ? await canvasToFile(applyFinish(base, edits, border)) : await compressImage(file, SIDE))
    } finally {
      setMaking(false)
    }
  }

  return (
    <div className="pe pe-avatar" role="group" aria-label="Profielfoto opmaken">
      <div className="pe-stage">
        {failed ? (
          <p className="form-error">Deze foto kan je browser niet openen.</p>
        ) : !base ? (
          <p className="muted">Foto laden…</p>
        ) : (
          <div className="pe-canvas-wrap">
            <canvas ref={view} className="pe-canvas" role="img" aria-label="Voorbeeld" />
          </div>
        )}
        <div className="pe-hint muted">
          {styled ? 'Met een filter of randje wordt je foto vierkant gemaakt.' : 'Kies een filter of randje, of sla je foto op zoals hij is.'}
          {styled && file.type === 'image/gif' && ' Een bewegende GIF staat daarna stil.'}
        </div>
      </div>
      <LookPicker
        small={small}
        look={look}
        frame={frame}
        borders={borders}
        disabled={!base}
        onChange={(next) => {
          setLook(next.look)
          setFrame(next.frame)
        }}
      />
      <div className="pe-bar">
        <span />
        <span className="pe-row">
          <Button onClick={onCancel} disabled={busy || making}>
            Annuleren
          </Button>
          <Button variant="cta" onClick={save} disabled={failed || !base || busy || making}>
            <FarmIcon name="accept" /> {busy || making ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </span>
      </div>
    </div>
  )
}
