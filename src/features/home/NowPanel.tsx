/**
 * "Nu in Nederland", like on the old Hyves front page: a treemap of what the
 * WieWatWaars of the last day are about, the biggest tiles with a photo. It
 * slides out from under the menu; closed by default, and it remembers.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { NowTerm } from '../../../shared/api'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api } from '../../lib/api'
import './NowPanel.css'

const OPEN_KEY = 'kuddes.nuInNederland'

type Rect = { x: number; y: number; w: number; h: number }

/** Squarified treemap (Bruls et al.): rows of tiles that are as square as they can be. */
function treemap(values: number[], box: Rect): Rect[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (!total) return []
  const scale = (box.w * box.h) / total
  const areas = values.map((v) => v * scale)
  const out: Rect[] = []
  let rest = { ...box }
  let i = 0
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0)
    return Math.max(...row.map((a) => Math.max((side * side * a) / (sum * sum), (sum * sum) / (side * side * a))))
  }
  while (i < areas.length) {
    const side = Math.min(rest.w, rest.h)
    const row = [areas[i++]]
    while (i < areas.length && worst([...row, areas[i]], side) <= worst(row, side)) row.push(areas[i++])
    const sum = row.reduce((a, b) => a + b, 0)
    // Lay the row along the short side, then go on with what's left
    if (rest.w >= rest.h) {
      const w = sum / rest.h
      let y = rest.y
      for (const a of row) {
        out.push({ x: rest.x, y, w, h: a / w })
        y += a / w
      }
      rest = { x: rest.x + w, y: rest.y, w: rest.w - w, h: rest.h }
    } else {
      const h = sum / rest.w
      let x = rest.x
      for (const a of row) {
        out.push({ x, y: rest.y, w: a / h, h })
        x += a / h
      }
      rest = { x: rest.x, y: rest.y + h, w: rest.w, h: rest.h - h }
    }
  }
  return out
}

function readOpen() {
  try {
    return localStorage.getItem(OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/** `onPick`: a tile was clicked (members: show the WieWatWaars about it). */
export function NowPanel({ onPick }: { onPick?: (term: string) => void }) {
  const [open, setOpen] = useState(readOpen)
  const { data: terms, isLoading } = useQuery({ queryKey: ['home', 'nu'], queryFn: () => api<NowTerm[]>('/home/nu'), enabled: open, staleTime: 5 * 60_000 })
  const map = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = map.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? '0' : '1')
      } catch {
        // Only for this visit then
      }
      return !o
    })
  }

  // A tile counts at least a bit, so the small ones still fit their word
  const list = terms ?? []
  const rects = size.w ? treemap(list.map((t) => t.count + 0.6), { x: 0, y: 0, w: size.w, h: size.h }) : []

  return (
    <section className={open ? 'now-nl open' : 'now-nl'} aria-label="Nu in Nederland">
      <div className="now-nl-drawer" aria-hidden={!open} inert={!open}>
        <div className="now-nl-inner">
          <div className="now-nl-panel">
            <header>
              <h2>Nu in Nederland</h2>
              <span className="muted">Waar Kuddes het over heeft: de woorden en plekken uit de WieWatWaars van het laatste etmaal.</span>
            </header>
            <div className="now-nl-map" ref={map}>
              {isLoading && <p className="now-nl-note">Even kijken wat er speelt…</p>}
              {!isLoading && open && !list.length && <p className="now-nl-note">Het is nog stil in Nederland. Zet een WieWatWaar neer!</p>}
              {rects.map((r, i) => {
                const t = list[i]
                const fs = Math.max(11, Math.min(40, Math.sqrt(r.w * r.h) / 4.2, (r.w / Math.max(4, t.term.length)) * 1.7))
                const style = { left: r.x, top: r.y, width: r.w, height: r.h, '--fs': `${fs}px`, '--shade': i % 5 } as CSSProperties
                const label = `${t.term}: ${t.count} ${t.count === 1 ? 'lid schreef' : 'leden schreven'} erover`
                const inner = (
                  <>
                    {t.photoUrl && <img src={t.photoUrl} alt="" loading="lazy" />}
                    <span>{t.term}</span>
                  </>
                )
                return onPick ? (
                  <button key={t.term} type="button" className={t.photoUrl ? 'now-nl-tile photo' : 'now-nl-tile'} style={style} title={label} onClick={() => onPick(t.term)}>
                    {inner}
                  </button>
                ) : (
                  <div key={t.term} className={t.photoUrl ? 'now-nl-tile photo' : 'now-nl-tile'} style={style} title={label}>
                    {inner}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <button type="button" className="now-nl-tab" aria-expanded={open} onClick={toggle}>
        <FarmIcon name="world" /> Nu in Nederland <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
    </section>
  )
}
