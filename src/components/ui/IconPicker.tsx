import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ICON_GROUPS } from '../../../shared/icons'
import { FarmIcon } from './FarmIcon'
import type { FarmIconName } from './farmIcons'
import './IconPicker.css'

/**
 * A small button with the chosen icon; clicking it pops out the picker with
 * all the pickable Farm-Fresh icons in groups and a search box, and closes
 * again once you pick one. `allowNone` adds "Geen" (for posts and topics).
 */
export function IconPicker({
  value,
  onChange,
  allowNone,
  label = 'Pictogram',
  align = 'left',
  compact,
}: {
  value: string | null
  onChange: (icon: string | null) => void
  allowNone?: boolean
  label?: string
  align?: 'left' | 'right'
  /** Just the icon, for a toolbar (the composers' buttons). */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // The panel lives at the end of <body>: toolbars scroll sideways and fade at their edges, which would cut it off
  const [place, setPlace] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open) return
    const put = () => {
      const r = box.current?.getBoundingClientRect()
      if (!r) return
      if (window.innerWidth <= 700) return setPlace({})
      const width = Math.min(380, window.innerWidth - 32)
      const left = Math.max(16, Math.min(align === 'right' ? r.right - width : r.left, window.innerWidth - width - 16))
      const below = window.innerHeight - r.bottom
      // Opens upwards when there's no room below
      setPlace(below < 360 && r.top > below ? { left, width, bottom: window.innerHeight - r.top + 4 } : { left, width, top: r.bottom + 4 })
    }
    put()
    window.addEventListener('resize', put)
    window.addEventListener('scroll', put, true)
    return () => {
      window.removeEventListener('resize', put)
      window.removeEventListener('scroll', put, true)
    }
  }, [open, align])

  // Closes on a click outside or Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => search.current?.focus(), 20)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open])

  const query = q.trim().toLowerCase()
  const groups = Object.entries(ICON_GROUPS)
    .map(([name, icons]) => [name, (icons as readonly string[]).filter((i) => !query || i.replace(/_/g, ' ').includes(query) || name.toLowerCase().includes(query))] as const)
    .filter(([, icons]) => icons.length)
  const pick = (icon: string | null) => {
    onChange(icon)
    setOpen(false)
    setQ('')
  }

  return (
    <span className="icon-pick" ref={box}>
      {compact ? (
        <button type="button" className={value ? 'composer-icon current' : 'composer-icon'} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={value ? `${label}: ${value.replace(/_/g, ' ')}` : `${label} kiezen`}>
          <FarmIcon name={(value ?? 'tag_blue') as FarmIconName} />
        </button>
      ) : (
        <button type="button" className="btn icon-pick-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={`${label} kiezen`}>
          {value ? <FarmIcon name={value as FarmIconName} size={20} /> : <span className="icon-pick-none" aria-hidden="true" />}
          <span className="icon-pick-label">{label}</span>
          <span aria-hidden="true">▾</span>
        </button>
      )}
      {open &&
        createPortal(
        <div ref={panel} className="icon-pick-panel" style={place} role="dialog" aria-label={`${label} kiezen`}>
          <div className="icon-pick-bar">
            <input ref={search} className="text-box" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek (Engels: guitar, cat, car…)" aria-label="Zoek een pictogram" />
            {allowNone && (
              <button type="button" className={value ? 'icon-pick-clear' : 'icon-pick-clear current'} onClick={() => pick(null)}>
                Geen
              </button>
            )}
          </div>
          <div className="icon-pick-groups">
            {groups.map(([name, icons]) => (
              <section key={name}>
                <h4>{name}</h4>
                <div className="icon-pick-grid" role="radiogroup" aria-label={name}>
                  {icons.map((icon) => (
                    <button key={icon} type="button" role="radio" aria-checked={value === icon} className={value === icon ? 'current' : undefined} onClick={() => pick(icon)} title={icon.replace(/_/g, ' ')}>
                      <FarmIcon name={icon as FarmIconName} size={24} />
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!groups.length && <p className="muted">Geen pictogrammen gevonden.</p>}
          </div>
        </div>,
          document.body,
        )}
    </span>
  )
}
