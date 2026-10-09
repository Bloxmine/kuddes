import { useEffect, useRef, useState } from 'react'
import { STEPS_PER_BAR, STUDIO_LIMITS, type PatternPart, type StudioChannel, type StudioNote, type StudioPattern } from '../../../shared/studio'
import { pointIn } from '../../lib/pointer'
import { isBlack, noteName } from './studio'

const ROW = 14
const COL = 24
const TOP = STUDIO_LIMITS.highKey
const KEYS = Array.from({ length: STUDIO_LIMITS.highKey - STUDIO_LIMITS.lowKey + 1 }, (_, i) => TOP - i)
const LENGTHS: [number, string][] = [
  [1, '1/16'],
  [2, '1/8'],
  [4, '1/4'],
  [8, '1/2'],
  [16, '1 maat'],
]

type Drag = { i: number; mode: 'move' | 'size'; grab: number }

/**
 * The Piano roll: the notes of one instrument in this pattern. Click to put
 * a note, drag it to move, drag its right edge to make it longer,
 * right-click to remove it.
 */
export function PianoRoll({
  channel,
  pattern,
  part,
  playing,
  onPart,
  onPreview,
}: {
  channel: StudioChannel
  pattern: StudioPattern
  part: PatternPart
  playing: number | null
  onPart: (f: (part: PatternPart) => PatternPart) => void
  onPreview: (key: number) => void
}) {
  const [noteLen, setNoteLen] = useState(2)
  const drag = useRef<Drag | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Start around middle C
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = (TOP - 72) * ROW
  }, [])

  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = pointIn(e, e.currentTarget, pattern.length * COL, KEYS.length * ROW)
    return { x, step: Math.max(0, Math.min(pattern.length - 1, Math.floor(x / COL))), key: Math.max(STUDIO_LIMITS.lowKey, Math.min(TOP, TOP - Math.floor(y / ROW))) }
  }
  const setNote = (i: number, n: StudioNote) => onPart((p) => ({ ...p, notes: p.notes.map((x, j) => (j === i ? n : x)) }))
  const hitAt = (key: number, step: number) => part.notes.findIndex((n) => n.key === key && step >= n.start && step < n.start + n.length)

  return (
    <div className="std-roll">
      <div className="std-roll-tools">
        <span className="std-roll-name" style={{ '--ch': channel.color } as React.CSSProperties}>
          {channel.name}
        </span>
        <label>
          Nieuwe noten
          <select value={noteLen} onChange={(e) => setNoteLen(Number(e.target.value))}>
            {LENGTHS.map(([n, name]) => (
              <option key={n} value={n}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => part.notes.length && confirm('Alle noten van dit instrument in dit patroon weghalen?') && onPart((p) => ({ ...p, notes: [] }))}>
          Alles wissen
        </button>
        <span className="std-hint">Klik: noot · slepen: verplaatsen · rechterrand: langer · rechtsklik: weg · typ A W S E D… om te spelen</span>
      </div>
      <div className="std-roll-body" ref={scroller}>
        <div className="std-keys" aria-label="Pianotoetsen">
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={isBlack(k) ? 'black' : k % 12 === 0 ? 'c' : undefined}
              style={{ height: ROW }}
              onPointerDown={() => onPreview(k)}
              tabIndex={-1}
              aria-label={noteName(k)}
            >
              {k % 12 === 0 ? noteName(k) : ''}
            </button>
          ))}
        </div>
        <div
          className="std-grid"
          style={
            { width: pattern.length * COL, height: KEYS.length * ROW, '--col': `${COL}px`, '--bar': `${COL * STEPS_PER_BAR}px`, '--beat': `${COL * 4}px` } as React.CSSProperties
          }
          role="application"
          aria-label={`Pianorol van ${channel.name}: ${part.notes.length} noten`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const { x, step, key } = at(e)
            const hit = hitAt(key, step)
            if (e.button === 2) {
              if (hit >= 0) onPart((p) => ({ ...p, notes: p.notes.filter((_, j) => j !== hit) }))
              return
            }
            if (e.button !== 0) return
            e.currentTarget.setPointerCapture(e.pointerId)
            if (hit >= 0) {
              const n = part.notes[hit]
              drag.current = { i: hit, mode: x > (n.start + n.length) * COL - 7 ? 'size' : 'move', grab: step - n.start }
              onPreview(n.key)
            } else if (part.notes.length < STUDIO_LIMITS.notes) {
              const length = Math.min(noteLen, pattern.length - step)
              onPart((p) => ({ ...p, notes: [...p.notes, { key, start: step, length, velocity: 0.8 }] }))
              drag.current = { i: part.notes.length, mode: 'move', grab: 0 }
              onPreview(key)
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            const n = d && part.notes[d.i]
            if (!d || !n) return
            const { step, key } = at(e)
            if (d.mode === 'size') {
              const length = Math.max(1, Math.min(pattern.length - n.start, step - n.start + 1))
              if (length !== n.length) setNote(d.i, { ...n, length })
            } else {
              const start = Math.max(0, Math.min(pattern.length - n.length, step - d.grab))
              if (start !== n.start || key !== n.key) {
                if (key !== n.key) onPreview(key)
                setNote(d.i, { ...n, start, key })
              }
            }
          }}
          onPointerUp={() => {
            const d = drag.current
            // New notes get the length of the one you touched last, as in FL Studio
            if (d && part.notes[d.i]) setNoteLen(part.notes[d.i].length)
            drag.current = null
          }}
        >
          {KEYS.map((k, i) => (
            <div key={k} className={isBlack(k) ? 'std-lane black' : 'std-lane'} style={{ top: i * ROW, height: ROW }} />
          ))}
          {part.notes.map((n, i) => (
            <div
              key={i}
              className="std-note"
              style={{ left: n.start * COL, top: (TOP - n.key) * ROW, width: n.length * COL - 1, height: ROW - 1, '--ch': channel.color } as React.CSSProperties}
              title={`${noteName(n.key)}, ${n.length} ${n.length === 1 ? 'stap' : 'stappen'}`}
            >
              {n.length > 1 && noteName(n.key)}
            </div>
          ))}
          {playing !== null && <div className="std-playline" style={{ left: playing * COL }} />}
        </div>
      </div>
    </div>
  )
}
