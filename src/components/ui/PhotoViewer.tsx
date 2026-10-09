/**
 * A photo big over the page (profile and Kudde photos, a picture on the
 * Prikbord or with a recipe): a frame that stays the same size whatever the
 * photo's shape, a dark stage with arrows, a strip of all of them underneath,
 * and a bar for what's said about it and what you can do with it.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FarmIcon } from './FarmIcon'
import './PhotoViewer.css'

export type ViewerPhoto = { id: number | string; url: string; width?: number; height?: number; caption?: string }

type Props = {
  photos: ViewerPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  /** Under the photo, on the left: the caption, who and when. */
  info?: ReactNode
  /** Under the photo, on the right: share, delete… */
  actions?: ReactNode
  /** A row below everything (e.g. the owner's settings). */
  below?: ReactNode
  /** Instead of the photo (e.g. the photo editor); the keys and the backdrop then leave it alone. */
  editing?: ReactNode
}

export function PhotoViewer({ photos, index, onIndex, onClose, info, actions, below, editing }: Props) {
  const photo = photos[index]
  const many = photos.length > 1
  const strip = useRef<HTMLDivElement>(null)
  const go = (i: number) => i >= 0 && i < photos.length && onIndex(i)

  // The keyboard: Escape, and the arrows (not while typing or editing)
  useEffect(() => {
    if (editing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') go(index - 1)
      if (e.key === 'ArrowRight') go(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // The next and previous one are already loading, so going there is instant
  useEffect(() => {
    for (const p of [photos[index + 1], photos[index - 1]]) if (p) new Image().src = p.url
  }, [photos, index])

  // The strip keeps the current one in view (only the strip scrolls)
  useEffect(() => {
    const row = strip.current
    const thumb = row?.children[index] as HTMLElement | undefined
    if (row && thumb) row.scrollTo({ left: thumb.offsetLeft - row.offsetLeft - (row.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' })
  }, [index])

  // Swiping on a phone
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (!start || !t) return
    const dx = t.clientX - start.x
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(t.clientY - start.y)) go(index + (dx < 0 ? 1 : -1))
  }

  if (!photo) return null
  // On top of the page, not inside the box it was opened from (a see-through, blurred box would trap it)
  return createPortal(
    <div className="lbx" role="dialog" aria-modal="true" aria-label={photo.caption || 'Foto'} onClick={() => !editing && onClose()}>
      <div className={editing ? 'lbx-frame editing' : 'lbx-frame'} onClick={(e) => e.stopPropagation()}>
        {editing ?? (
          <>
            <div className="lbx-stage" onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })} onTouchEnd={onTouchEnd}>
              <img key={photo.id} src={photo.url} width={photo.width} height={photo.height} alt={photo.caption || 'Foto'} />
              {many && (
                <span className="lbx-count">
                  {index + 1} / {photos.length}
                </span>
              )}
              <button type="button" className="lbx-close" onClick={onClose} aria-label="Sluiten" title="Sluiten (Esc)">
                ×
              </button>
              {many && index > 0 && (
                <button type="button" className="lbx-arrow prev" onClick={() => go(index - 1)} aria-label="Vorige foto">
                  <FarmIcon name="arrow_left" size={24} />
                </button>
              )}
              {many && index < photos.length - 1 && (
                <button type="button" className="lbx-arrow next" onClick={() => go(index + 1)} aria-label="Volgende foto">
                  <FarmIcon name="arrow_right" size={24} />
                </button>
              )}
            </div>
            {many && (
              <div className="lbx-strip" ref={strip}>
                {photos.map((p, i) => (
                  <button key={p.id} type="button" className={i === index ? 'current' : undefined} onClick={() => go(i)} aria-label={`Foto ${i + 1}`} aria-current={i === index}>
                    <img src={p.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            {(info || actions) && (
              <div className="lbx-bar">
                <div className="lbx-info">{info}</div>
                {actions && <div className="lbx-actions">{actions}</div>}
              </div>
            )}
            {below}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
