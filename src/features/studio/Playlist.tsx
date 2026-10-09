import { useRef } from 'react'
import { STEPS_PER_BAR, STUDIO_LIMITS, type StudioClip, type StudioProject } from '../../../shared/studio'
import { pointIn } from '../../lib/pointer'
import { patternBars, songSteps } from './engine'

const CELL = 30
const TRACK = 34

/**
 * The Playlist: patterns placed in time, which make the song. Click to put
 * the chosen pattern there, drag a block to move it, right-click to remove it.
 */
export function Playlist({
  project,
  current,
  playing,
  onAdd,
  onMove,
  onRemove,
  onPick,
}: {
  project: StudioProject
  current: string
  /** The song step being played, or null. */
  playing: number | null
  onAdd: (track: number, bar: number) => void
  onMove: (clip: StudioClip, track: number, bar: number) => void
  onRemove: (clip: StudioClip) => void
  onPick: (patternId: string) => void
}) {
  const drag = useRef<{ clip: StudioClip; grab: number } | null>(null)
  const bars = Math.min(STUDIO_LIMITS.bars, Math.max(32, songSteps(project) / STEPS_PER_BAR + 8))
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const { x, y } = pointIn(e, e.currentTarget, bars * CELL, STUDIO_LIMITS.tracks * TRACK)
    return {
      bar: Math.max(0, Math.min(bars - 1, Math.floor(x / CELL))),
      track: Math.max(0, Math.min(STUDIO_LIMITS.tracks - 1, Math.floor(y / TRACK))),
    }
  }
  const lengthOf = (c: StudioClip) => {
    const p = project.patterns.find((x) => x.id === c.pattern)
    return p ? patternBars(p) : 1
  }
  const hitAt = (track: number, bar: number) => project.playlist.find((c) => c.track === track && bar >= c.bar && bar < c.bar + lengthOf(c))

  return (
    <div className="std-playlist">
      <div className="std-tracks" aria-hidden="true">
        <div className="std-ruler-pad" />
        {Array.from({ length: STUDIO_LIMITS.tracks }, (_, t) => (
          <div key={t} className="std-track-name" style={{ height: TRACK }}>
            Spoor {t + 1}
          </div>
        ))}
      </div>
      <div className="std-pl-scroll">
        <div className="std-ruler" style={{ width: bars * CELL }}>
          {Array.from({ length: bars }, (_, b) => (
            <span key={b} style={{ width: CELL }}>
              {b + 1}
            </span>
          ))}
        </div>
        <div
          className="std-pl-grid"
          style={{ width: bars * CELL, height: STUDIO_LIMITS.tracks * TRACK, '--cell': `${CELL}px`, '--track': `${TRACK}px` } as React.CSSProperties}
          role="application"
          aria-label={`Playlist: ${project.playlist.length} blokken`}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            const { bar, track } = at(e)
            const hit = hitAt(track, bar)
            if (e.button === 2) {
              if (hit) onRemove(hit)
              return
            }
            if (e.button !== 0) return
            if (hit) {
              onPick(hit.pattern)
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { clip: hit, grab: bar - hit.bar }
            } else if (project.playlist.length < STUDIO_LIMITS.clips) onAdd(track, bar)
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d) return
            const { bar, track } = at(e)
            const to = Math.max(0, Math.min(bars - lengthOf(d.clip), bar - d.grab))
            if (to !== d.clip.bar || track !== d.clip.track) {
              onMove(d.clip, track, to)
              d.clip = { ...d.clip, track, bar: to }
            }
          }}
          onPointerUp={() => (drag.current = null)}
        >
          {project.playlist.map((c) => {
            const p = project.patterns.find((x) => x.id === c.pattern)
            if (!p) return null
            return (
              <div
                key={c.id}
                className={c.pattern === current ? 'std-clip on' : 'std-clip'}
                style={{ left: c.bar * CELL, top: c.track * TRACK, width: patternBars(p) * CELL - 2, height: TRACK - 4, '--ch': p.color } as React.CSSProperties}
                title={p.name}
              >
                {p.name}
              </div>
            )
          })}
          {playing !== null && <div className="std-playline" style={{ left: (playing / STEPS_PER_BAR) * CELL }} />}
        </div>
      </div>
    </div>
  )
}
