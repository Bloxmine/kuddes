/**
 * Pick an Oldstagram filter and a border, with small previews of your own
 * photo, in two strips under the photo. Used in the photo editor and when you
 * upload a profile picture.
 */
import { useMemo } from 'react'
import { LOOK_FRAMES, NO_EDITS, PHOTO_FRAMES, PHOTO_LOOKS, type PhotoFrame, type PhotoLook } from '../../../shared/photoEdits'
import { applyFinish } from './renderEdits'
import './PhotoEditor.css'

const LOOK_KEYS = Object.keys(PHOTO_LOOKS) as PhotoLook[]
const FRAME_KEYS = Object.keys(PHOTO_FRAMES) as PhotoFrame[]

const thumb = (c: HTMLCanvasElement) => c.toDataURL('image/jpeg', 0.8)

export function LookPicker({
  small,
  look,
  frame,
  borders,
  disabled,
  onChange,
}: {
  /** The photo as it is now, about 120 pixels, for the previews. */
  small: HTMLCanvasElement | null
  look: PhotoLook | null
  frame: PhotoFrame | null
  borders: Partial<Record<PhotoFrame, HTMLImageElement>>
  disabled?: boolean
  onChange: (next: { look: PhotoLook | null; frame: PhotoFrame | null }) => void
}) {
  const looks = useMemo(
    () => (small ? Object.fromEntries(LOOK_KEYS.map((k) => [k, thumb(applyFinish(small, { ...NO_EDITS, look: k }, null))])) : null) as Record<PhotoLook, string> | null,
    [small],
  )
  // The borders over the photo with the chosen filter
  const frames = useMemo(
    () =>
      small
        ? (Object.fromEntries(FRAME_KEYS.filter((k) => borders[k]).map((k) => [k, thumb(applyFinish(small, { ...NO_EDITS, look, frame: k }, borders[k]!))])) as Partial<Record<PhotoFrame, string>>)
        : null,
    [small, look, borders],
  )
  const plain = useMemo(() => (small ? thumb(small) : null), [small])
  const withLook = useMemo(() => (small && look ? thumb(applyFinish(small, { ...NO_EDITS, look }, null)) : plain), [small, look, plain])

  return (
    <div className="pe-strip">
      <div className="pe-strip-row">
        <h3>Oldstagram</h3>
        <div className="pe-strip-list" role="group" aria-label="Oldstagram-filters">
          <button type="button" className="pe-filter" aria-pressed={!look} disabled={disabled} onClick={() => onChange({ look: null, frame })}>
            {plain ? <img src={plain} alt="" /> : <span />}
            Geen
          </button>
          {LOOK_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className="pe-filter"
              aria-pressed={look === k}
              disabled={disabled}
              // A filter brings its own border along, as in the original app
              onClick={() => onChange({ look: k, frame: LOOK_FRAMES[k] ?? frame })}
            >
              {looks ? <img src={looks[k]} alt="" /> : <span />}
              {PHOTO_LOOKS[k]}
            </button>
          ))}
        </div>
      </div>
      <div className="pe-strip-row">
        <h3>Randje</h3>
        <div className="pe-strip-list" role="group" aria-label="Randje">
          <button type="button" className="pe-filter" aria-pressed={!frame} disabled={disabled} onClick={() => onChange({ look, frame: null })}>
            {withLook ? <img src={withLook} alt="" /> : <span />}
            Geen
          </button>
          {FRAME_KEYS.map((k) => (
            <button key={k} type="button" className="pe-filter" aria-pressed={frame === k} disabled={disabled} onClick={() => onChange({ look, frame: k })}>
              {frames?.[k] ? <img src={frames[k]} alt="" /> : <span />}
              {PHOTO_FRAMES[k]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
