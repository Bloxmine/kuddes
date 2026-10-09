import { useEffect, useRef } from 'react'
import { PATTERN_LENGTHS, STEPS_PER_BAR, type PatternLength, type PatternPart, type StudioChannel, type StudioPattern, type StudioProject } from '../../../shared/studio'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Knob } from './Knob'
import { emptyPart } from './studio'

type Props = {
  project: StudioProject
  pattern: StudioPattern
  selected: string | null
  /** The step of this pattern being played, or null. */
  playing: number | null
  onSelect: (ch: StudioChannel) => void
  onChannel: (id: string, patch: Partial<StudioChannel>) => void
  onPart: (channelId: string, f: (part: PatternPart) => PatternPart) => void
  /** A step was switched on: let it be heard (when not playing). */
  onHit: (ch: StudioChannel) => void
  onRemove: (ch: StudioChannel) => void
  onPattern: (patch: Partial<StudioPattern>) => void
  onOpenRoll: (ch: StudioChannel) => void
}

/** The Channel rack: one row per sound, with its knobs and the steps of the pattern (or its notes, for an instrument). */
export function ChannelRack({ project, pattern, selected, playing, onSelect, onChannel, onPart, onHit, onRemove, onPattern, onOpenRoll }: Props) {
  // Dragging over steps paints them on (or off, if the first one was on)
  const paint = useRef<number | null>(null)
  useEffect(() => {
    const up = () => (paint.current = null)
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])
  const setStep = (ch: StudioChannel, i: number, v: number) =>
    onPart(ch.id, (part) => {
      const steps = Array.from({ length: pattern.length }, (_, k) => part.steps[k] ?? 0)
      steps[i] = v
      return { ...part, steps }
    })

  return (
    <div className="std-rack">
      {project.channels.length === 0 && <p className="std-hint">Nog geen kanalen. Kies links een geluid en klik op + om het toe te voegen.</p>}
      {project.channels.map((ch) => {
        const part = pattern.parts[ch.id] ?? emptyPart()
        return (
          <div key={ch.id} className={ch.id === selected ? 'std-row on' : 'std-row'} style={{ '--ch': ch.color } as React.CSSProperties}>
            <span className="std-row-ctl">
              <button
                type="button"
                className={ch.mute ? 'std-led' : 'std-led lit'}
                onClick={() => onChannel(ch.id, { mute: !ch.mute })}
                title={ch.mute ? 'Aanzetten' : 'Dempen'}
                aria-pressed={!ch.mute}
                aria-label={`${ch.name} aan`}
              />
              <button
                type="button"
                className={ch.solo ? 'std-solo on' : 'std-solo'}
                onClick={() => onChannel(ch.id, { solo: !ch.solo })}
                title="Solo: alleen dit kanaal horen"
                aria-pressed={ch.solo}
              >
                S
              </button>
              <Knob
                value={ch.pan}
                min={-1}
                max={1}
                reset={0}
                label={`Panning ${ch.name}`}
                shown={ch.pan === 0 ? 'midden' : ch.pan < 0 ? `${Math.round(-ch.pan * 100)}% links` : `${Math.round(ch.pan * 100)}% rechts`}
                onChange={(pan) => onChannel(ch.id, { pan: Math.abs(pan) < 0.04 ? 0 : pan })}
              />
              <Knob
                value={ch.volume}
                min={0}
                max={1}
                reset={0.78}
                label={`Volume ${ch.name}`}
                shown={`${Math.round(ch.volume * 100)}%`}
                onChange={(volume) => onChannel(ch.id, { volume })}
              />
              <button
                type="button"
                className="std-name"
                onClick={() => onSelect(ch)}
                onDoubleClick={() => {
                  const name = prompt('Naam van het kanaal:', ch.name)?.trim()
                  if (name) onChannel(ch.id, { name: name.slice(0, 40) })
                }}
                title={`${ch.name}: klik om te horen en te kiezen, dubbelklik om de naam te veranderen`}
              >
                <FarmIcon name={ch.type === 'drum' ? 'drum' : 'piano'} size={16} />
                <span>{ch.name}</span>
              </button>
            </span>
            {ch.type === 'drum' ? (
              <span className="std-steps" role="group" aria-label={`Stappen van ${ch.name}`}>
                {Array.from({ length: pattern.length }, (_, i) => {
                  const v = part.steps[i] ?? 0
                  return (
                    <button
                      key={i}
                      type="button"
                      className={`std-step g${Math.floor(i / 4) % 2}${v ? ' on' : ''}${v && v < 0.6 ? ' soft' : ''}${playing === i ? ' now' : ''}${i % STEPS_PER_BAR === 0 && i ? ' bar' : ''}`}
                      aria-pressed={v > 0}
                      aria-label={`Stap ${i + 1}`}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return
                        paint.current = v ? 0 : 0.8
                        setStep(ch, i, paint.current)
                        if (!v) onHit(ch)
                      }}
                      onPointerEnter={(e) => paint.current !== null && e.buttons === 1 && setStep(ch, i, paint.current)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setStep(ch, i, v ? 0 : 0.8))}
                      onContextMenu={(e) => {
                        // Right-click: a soft hit, or off again
                        e.preventDefault()
                        setStep(ch, i, v && v < 0.6 ? 0 : 0.45)
                      }}
                    />
                  )
                })}
              </span>
            ) : (
              <button type="button" className="std-mini" onClick={() => onOpenRoll(ch)} title="Openen in de pianorol" style={{ width: pattern.length * 24 }}>
                <MiniRoll part={part} length={pattern.length} />
                {part.notes.length === 0 && <span>Klik om noten te schrijven in de pianorol</span>}
              </button>
            )}
            <button type="button" className="std-x" onClick={() => onRemove(ch)} title="Kanaal weghalen" aria-label={`${ch.name} weghalen`}>
              ×
            </button>
          </div>
        )
      })}
      <div className="std-rack-foot">
        <label>
          Lengte
          <select value={pattern.length} onChange={(e) => onPattern({ length: Number(e.target.value) as PatternLength })}>
            {PATTERN_LENGTHS.map((n) => (
              <option key={n} value={n}>
                {n / STEPS_PER_BAR} {n === STEPS_PER_BAR ? 'maat' : 'maten'}
              </option>
            ))}
          </select>
        </label>
        <span className="std-hint">Klik op een stap om hem aan te zetten, sleep om er meer te zetten. Rechtsklik: een zachte slag.</span>
      </div>
    </div>
  )
}

/** The notes of an instrument, small, in its row. */
function MiniRoll({ part, length }: { part: PatternPart; length: number }) {
  if (!part.notes.length) return null
  const lo = Math.min(...part.notes.map((n) => n.key))
  const hi = Math.max(...part.notes.map((n) => n.key))
  const rows = Math.max(12, hi - lo + 1)
  return (
    <svg viewBox={`0 0 ${length} ${rows}`} preserveAspectRatio="none" aria-hidden="true">
      {part.notes.map((n, i) => (
        <rect key={i} x={n.start} y={hi - n.key + (rows - (hi - lo + 1)) / 2} width={n.length - 0.15} height={0.9} />
      ))}
    </svg>
  )
}
