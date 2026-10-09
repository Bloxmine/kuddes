/**
 * The photo editor, in the lightbox: rotate, flip, crop, red eyes, light and
 * colour, a vignette, and the Oldstagram filters and borders. It always works from the original upload
 * plus the list of edits (shared/photoEdits.ts), so undo, "Origineel" and
 * editing again later cost nothing in quality. Saving sends the finished
 * picture and the edits; the original stays on the server.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NO_EDITS, PHOTO_EDIT_LIMITS, isUnedited, type PhotoEditStep, type PhotoEdits } from '../../../shared/photoEdits'
import type { Photo } from '../../../shared/api'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { api, errorMessage } from '../../lib/api'
import { applyColour, applyFinish, applySteps, renderToFile } from './renderEdits'
import { LookPicker } from './LookPicker'
import { useBorders } from './oldsta'
import './PhotoEditor.css'

type Mode = 'crop' | 'redeye' | null
type Rect = { x: number; y: number; w: number; h: number }
type Slider = 'light' | 'contrast' | 'saturation' | 'warmth' | 'vignette'

const SLIDERS: {
  key: Slider
  label: string
  min: number
  icon: FarmIconName
}[] = [
  { key: 'light', label: 'Helderheid', min: -100, icon: 'lightbulb' },
  { key: 'contrast', label: 'Contrast', min: -100, icon: 'contrast' },
  { key: 'saturation', label: 'Verzadiging', min: -100, icon: 'color_wheel' },
  { key: 'warmth', label: 'Warmte', min: -100, icon: 'weather_sun' },
  { key: 'vignette', label: 'Vignet', min: 0, icon: 'eye' },
]

/** The preview is drawn smaller than the saved photo, so sliders stay smooth. */
const PREVIEW_SIDE = 1400

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('De foto kon niet geladen worden.'))
    img.src = url
  })
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v))

export function PhotoEditor({ photo, onDone }: { photo: Photo; onDone: (saved: Photo | null) => void }) {
  const queryClient = useQueryClient()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Undo history: every entry is the full set of edits; `at` is where we are
  const [history, setHistory] = useState<PhotoEdits[]>(() => [photo.edits ?? NO_EDITS])
  const [at, setAt] = useState(0)
  const lastKey = useRef<string | null>(null)
  const edits = history[at]
  const [caption, setCaption] = useState(photo.caption)
  const [mode, setMode] = useState<Mode>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [square, setSquare] = useState(false)
  const [brush, setBrush] = useState(5)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [comparing, setComparing] = useState(false)
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    let live = true
    loadImage(photo.originalUrl ?? photo.url).then(
      (i) => live && setImg(i),
      (e: Error) => live && setLoadError(e.message),
    )
    return () => {
      live = false
    }
  }, [photo.originalUrl, photo.url])

  /**
   * A change becomes an undo step. Changes to the same slider right after each
   * other are one step, so dragging a slider doesn't fill the history.
   */
  const change = useCallback(
    (next: PhotoEdits, key: string | null = null) => {
      const merge = key !== null && key === lastKey.current
      lastKey.current = key
      setHistory((h) => [...h.slice(0, merge ? at : at + 1), next])
      if (!merge) setAt((a) => a + 1)
    },
    [at],
  )
  const addStep = (step: PhotoEditStep) => {
    if (edits.steps.length >= PHOTO_EDIT_LIMITS.steps) return
    change({ ...edits, steps: [...edits.steps, step] })
  }
  const undo = useCallback(() => {
    lastKey.current = null
    setAt((a) => Math.max(0, a - 1))
  }, [])
  const redo = useCallback(() => {
    lastKey.current = null
    setAt((a) => Math.min(history.length - 1, a + 1))
  }, [history.length])

  // The picture after rotating, flipping, cropping and red eyes; light and colour go on top of it
  const base = useMemo(() => (img ? applySteps(img, edits.steps, PREVIEW_SIDE) : null), [img, edits.steps])
  const original = useMemo(() => (img ? applySteps(img, [], PREVIEW_SIDE) : null), [img])
  const borders = useBorders()
  const border = edits.frame ? (borders[edits.frame] ?? null) : null

  useEffect(() => {
    if (!base || !view.current) return
    const frame = requestAnimationFrame(() => {
      if (!view.current) return
      if (comparing && original) applyColour(original, NO_EDITS, view.current)
      else applyFinish(base, edits, border, view.current)
    })
    return () => cancelAnimationFrame(frame)
  }, [base, original, edits, comparing, border])

  // Small previews of each filter, with the photo as it is now
  const small = useMemo(() => (img ? applySteps(img, edits.steps, 120) : null), [img, edits.steps])

  // Ctrl+Z / Ctrl+Y, and Escape leaves a tool
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (e.key === 'Escape' && mode) {
        e.stopPropagation()
        setMode(null)
        setCrop(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [undo, redo, mode])

  /** Where on the picture the pointer is, as fractions. */
  const at01 = (e: React.PointerEvent) => {
    const r = view.current!.getBoundingClientRect()
    return {
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view.current || comparing) return
    const p = at01(e)
    if (mode === 'redeye') {
      addStep({ t: 'redeye', x: p.x, y: p.y, r: brush / 200 })
    } else if (mode === 'crop') {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = p
      setCrop({ x: p.x, y: p.y, w: 0, h: 0 })
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!view.current) return
    const p = at01(e)
    if (mode === 'redeye') setCursor(p)
    if (mode !== 'crop' || !drag.current) return
    const start = drag.current
    let w = p.x - start.x
    let h = p.y - start.y
    if (square) {
      // The same number of pixels both ways
      const { width, height } = view.current
      const side = Math.min(Math.max(Math.abs(w) * width, Math.abs(h) * height), (w < 0 ? start.x : 1 - start.x) * width, (h < 0 ? start.y : 1 - start.y) * height)
      w = (Math.sign(w || 1) * side) / width
      h = (Math.sign(h || 1) * side) / height
    }
    setCrop({
      x: Math.min(start.x, start.x + w),
      y: Math.min(start.y, start.y + h),
      w: Math.abs(w),
      h: Math.abs(h),
    })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const cropOk = !!crop && crop.w > 0.02 && crop.h > 0.02
  const applyCrop = () => {
    if (!crop || !cropOk) return
    addStep({ t: 'crop', ...crop })
    setCrop(null)
    setMode(null)
  }
  const pick = (m: Mode) => {
    setMode((cur) => (cur === m ? null : m))
    setCrop(null)
    setCursor(null)
  }

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('edits', JSON.stringify(edits))
      form.set('caption', caption)
      if (!isUnedited(edits)) form.set('file', await renderToFile(img!, edits))
      return api<Photo>(`/photos/${photo.id}/image`, { method: 'PUT', form })
    },
    onSuccess: async (saved) => {
      // The photo's address changed: everything that shows it fetches it again
      await queryClient.invalidateQueries()
      onDone(saved)
    },
  })

  const dirty = at > 0 || caption !== photo.caption
  const cancel = () => {
    if (!dirty || confirm('Je wijzigingen weggooien?')) onDone(null)
  }

  return (
    <div className="pe" role="group" aria-label="Foto bewerken">
      <div className="pe-stage">
        {loadError ? (
          <p className="form-error">{loadError}</p>
        ) : !img ? (
          <p className="muted">Foto laden…</p>
        ) : (
          <div
            className={`pe-canvas-wrap${mode ? ` pe-mode-${mode}` : ''}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => setCursor(null)}
          >
            <canvas ref={view} className="pe-canvas" aria-label={caption || 'Foto'} role="img" />
            {mode === 'crop' && crop && (
              <div
                className="pe-crop"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                }}
              />
            )}
            {mode === 'redeye' && cursor && (
              <div
                className="pe-brush"
                style={{
                  left: `${cursor.x * 100}%`,
                  top: `${cursor.y * 100}%`,
                  width: `${brush}%`,
                }}
              />
            )}
            {comparing && <span className="pe-badge">Origineel</span>}
          </div>
        )}
        <div className="pe-hint muted">
          {mode === 'crop'
            ? 'Sleep over de foto om het stuk te kiezen dat je wilt houden.'
            : mode === 'redeye'
              ? 'Klik op elk rood oog. Maak de cirkel ongeveer zo groot als de pupil.'
              : 'Kies een gereedschap aan de rechterkant.'}
        </div>
      </div>

      <LookPicker
        small={small}
        look={edits.look ?? null}
        frame={edits.frame ?? null}
        borders={borders}
        disabled={!img}
        onChange={(next) => change({ ...edits, ...next })}
      />

      <div className="pe-tools">
        <section>
          <h3>Draaien &amp; spiegelen</h3>
          <div className="pe-row">
            <Button onClick={() => addStep({ t: 'rotate', turns: 3 })} title="Linksom draaien" disabled={!img}>
              <FarmIcon name="shape_rotate_anticlockwise" /> Links
            </Button>
            <Button onClick={() => addStep({ t: 'rotate', turns: 1 })} title="Rechtsom draaien" disabled={!img}>
              <FarmIcon name="shape_rotate_clockwise" /> Rechts
            </Button>
            <Button onClick={() => addStep({ t: 'flip', axis: 'h' })} title="Spiegelen (links en rechts wisselen)" disabled={!img}>
              <FarmIcon name="shape_flip_horizontal" /> Spiegelen
            </Button>
            <Button onClick={() => addStep({ t: 'flip', axis: 'v' })} title="Op z'n kop" disabled={!img}>
              <FarmIcon name="shape_flip_vertical" /> Omkeren
            </Button>
          </div>
        </section>

        <section>
          <h3>Gereedschap</h3>
          <div className="pe-row">
            <Button onClick={() => pick('crop')} aria-pressed={mode === 'crop'} disabled={!img}>
              <FarmIcon name="cut_red" /> Bijsnijden
            </Button>
            <Button onClick={() => pick('redeye')} aria-pressed={mode === 'redeye'} disabled={!img}>
              <FarmIcon name="eye" /> Rode ogen
            </Button>
          </div>
          {mode === 'crop' && (
            <div className="pe-sub">
              <label className="pe-check">
                <input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> Vierkant
              </label>
              <Button variant="cta" onClick={applyCrop} disabled={!cropOk}>
                <FarmIcon name="accept" /> Bijsnijden
              </Button>
            </div>
          )}
          {mode === 'redeye' && (
            <label className="pe-slider pe-sub">
              <span>Grootte</span>
              <input type="range" min={1} max={15} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
            </label>
          )}
        </section>

        <section>
          <h3>Licht &amp; kleur</h3>
          {SLIDERS.map((s) => (
            <label key={s.key} className="pe-slider">
              <span>
                <FarmIcon name={s.icon} /> {s.label}
              </span>
              <input
                type="range"
                min={s.min}
                max={100}
                value={edits[s.key]}
                disabled={!img}
                onChange={(e) => change({ ...edits, [s.key]: Number(e.target.value) }, s.key)}
                onDoubleClick={() => change({ ...edits, [s.key]: 0 })}
              />
              <output>{edits[s.key] > 0 && s.min < 0 ? `+${edits[s.key]}` : edits[s.key]}</output>
            </label>
          ))}
        </section>

        <section>
          <h3>Onderschrift</h3>
          <input
            className="text-box"
            value={caption}
            maxLength={120}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Onderschrift (optioneel)"
            aria-label="Onderschrift"
          />
        </section>
      </div>

      <div className="pe-bar">
        <span className="pe-row">
          <Button onClick={undo} disabled={at === 0} title="Ongedaan maken (Ctrl+Z)">
            <FarmIcon name="arrow_undo" /> Ongedaan maken
          </Button>
          <Button onClick={redo} disabled={at >= history.length - 1} title="Opnieuw (Ctrl+Y)">
            <FarmIcon name="arrow_redo" /> Opnieuw
          </Button>
          <Button
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onKeyDown={(e) => e.key === ' ' && setComparing(true)}
            onKeyUp={() => setComparing(false)}
            disabled={!img || isUnedited(edits)}
            title="Houd ingedrukt om het origineel te zien"
          >
            <FarmIcon name="eye" /> Vergelijken
          </Button>
          <Button onClick={() => change(NO_EDITS)} disabled={isUnedited(edits)} title="Alle bewerkingen weghalen">
            <FarmIcon name="draw_eraser" /> Origineel
          </Button>
        </span>
        <span className="pe-row">
          {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
          <Button onClick={cancel} disabled={save.isPending}>
            Annuleren
          </Button>
          <Button variant="cta" onClick={() => save.mutate()} disabled={!img || save.isPending || !dirty}>
            <FarmIcon name="accept" /> {save.isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </span>
      </div>
    </div>
  )
}
