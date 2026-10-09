import { Fragment, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import type { BoxLayout } from '../../../shared/customization'
import { Button } from '../ui/Button'
import { FarmIcon } from '../ui/FarmIcon'
import './BoxLayout.css'

type Drop = { col: number; index: number }

/** Moves `key` to position `index` of column `col` (or out of the hidden list). */
function moveBox<K extends string>(layout: BoxLayout<K>, key: K, col: number, index: number): BoxLayout<K> {
  const columns = layout.columns.map((c) => [...c])
  const from = columns.findIndex((c) => c.includes(key))
  if (from >= 0) {
    const at = columns[from].indexOf(key)
    columns[from].splice(at, 1)
    // Removing it from above the target shifts the target up by one
    if (from === col && at < index) index--
  }
  columns[col].splice(Math.max(0, Math.min(index, columns[col].length)), 0, key)
  return { columns, hidden: layout.hidden.filter((k) => k !== key) }
}

function hideBox<K extends string>(layout: BoxLayout<K>, key: K): BoxLayout<K> {
  return { columns: layout.columns.map((c) => c.filter((k) => k !== key)), hidden: [...layout.hidden, key] }
}

type BoxLayoutGridProps<K extends string> = {
  layout: BoxLayout<K>
  labels: Record<K, string>
  /** Width per column: "1fr" grows, anything else is a fixed width like "300px". */
  widths: string[]
  render: (key: K) => ReactNode
  /** Boxes that can't appear here right now (e.g. member-only boxes for visitors). */
  available?: (key: K) => boolean
  editing?: boolean
  onChange?: (layout: BoxLayout<K>) => void
  /** Column used when a hidden box is put back. */
  defaultColumn?: (key: K) => number
  className?: string
}

const colStyle = (width: string): CSSProperties =>
  width.endsWith('fr') ? { flex: `${parseFloat(width) * 999} 1 0` } : { flex: `0 1 ${width}`, width }

/**
 * Boxes in columns, in the member's own order. In edit mode every box gets a
 * bar to drag it, move it with buttons or hide it, and hidden boxes can be
 * put back.
 */
export function BoxLayoutGrid<K extends string>({
  layout,
  labels,
  widths,
  render,
  available = () => true,
  editing = false,
  onChange,
  defaultColumn = () => 0,
  className,
}: BoxLayoutGridProps<K>) {
  const [dragging, setDragging] = useState<K | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const change = (next: BoxLayout<K>) => onChange?.(next)
  const lastCol = layout.columns.length - 1

  if (!editing) {
    return (
      <div className={['layout-grid', className].filter(Boolean).join(' ')}>
        {layout.columns.map((col, i) => (
          <div key={i} className="layout-col" style={colStyle(widths[i])}>
            {col.filter(available).map((key) => (
              <Fragment key={key}>{render(key)}</Fragment>
            ))}
          </div>
        ))}
      </div>
    )
  }

  const onDragOverSlot = (e: DragEvent, col: number, index: number) => {
    if (!dragging) return
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    setDrop({ col, index: after ? index + 1 : index })
  }

  const finishDrop = (e: DragEvent) => {
    e.preventDefault()
    if (dragging && drop) change(moveBox(layout, dragging, drop.col, drop.index))
    setDragging(null)
    setDrop(null)
  }

  const hiddenHere = layout.hidden.filter(available)

  return (
    <div className="layout-editing">
      <div className="layout-tray" aria-label="Verborgen boxen">
        <b>Verborgen boxen:</b>
        {hiddenHere.length === 0 ? (
          <span className="muted">geen. Klik op het oogje van een box om hem te verbergen.</span>
        ) : (
          hiddenHere.map((key) => (
            <button
              key={key}
              type="button"
              className="layout-chip"
              onClick={() => {
                const col = defaultColumn(key)
                change(moveBox(layout, key, col, layout.columns[col].length))
              }}
            >
              <FarmIcon name="eye" /> {labels[key]}
            </button>
          ))
        )}
      </div>

      <div className={['layout-grid', className].filter(Boolean).join(' ')}>
        {layout.columns.map((col, c) => {
          const keys = col.filter(available)
          return (
            <div
              key={c}
              className="layout-col layout-col-edit"
              style={colStyle(widths[c])}
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                // Over the empty space below the boxes: drop at the end
                if (e.target === e.currentTarget) setDrop({ col: c, index: col.length })
              }}
              onDrop={finishDrop}
            >
              {keys.map((key) => {
                const index = col.indexOf(key)
                return (
                  <div key={key}>
                    {drop?.col === c && drop.index === index && <div className="layout-drop-line" />}
                    <div
                      className={dragging === key ? 'layout-slot dragging' : 'layout-slot'}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', key)
                        setDragging(key)
                      }}
                      onDragEnd={() => {
                        setDragging(null)
                        setDrop(null)
                      }}
                      onDragOver={(e) => onDragOverSlot(e, c, index)}
                    >
                      <div className="layout-slot-bar">
                        <span className="layout-grip" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <b>{labels[key]}</b>
                        <span className="layout-slot-actions">
                          <MoveButton icon="arrow_left" label="Naar links" disabled={c === 0} onClick={() => change(moveBox(layout, key, c - 1, layout.columns[c - 1].length))} />
                          <MoveButton icon="arrow_up" label="Omhoog" disabled={index === 0} onClick={() => change(moveBox(layout, key, c, index - 1))} />
                          <MoveButton icon="arrow_down" label="Omlaag" disabled={index === col.length - 1} onClick={() => change(moveBox(layout, key, c, index + 2))} />
                          <MoveButton icon="arrow_right" label="Naar rechts" disabled={c === lastCol} onClick={() => change(moveBox(layout, key, c + 1, layout.columns[c + 1].length))} />
                          <MoveButton icon="eye_close" label="Verbergen" onClick={() => change(hideBox(layout, key))} />
                        </span>
                      </div>
                      {/* A preview only: the box can't be used while arranging */}
                      <div className="layout-slot-body" inert>
                        {render(key)}
                      </div>
                    </div>
                  </div>
                )
              })}
              {drop?.col === c && drop.index >= col.length && <div className="layout-drop-line" />}
              {keys.length === 0 && <p className="layout-col-empty">Sleep hier een box naartoe</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MoveButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: 'arrow_left' | 'arrow_up' | 'arrow_down' | 'arrow_right' | 'eye_close'
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="icon-button" title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <FarmIcon name={icon} />
    </button>
  )
}

type LayoutEditBarProps = {
  title: string
  dirty: boolean
  saving: boolean
  error?: string | null
  onSave: () => void
  onCancel: () => void
  onReset: () => void
  children?: ReactNode
}

/** The bar above a page while its boxes are being arranged. */
export function LayoutEditBar({ title, dirty, saving, error, onSave, onCancel, onReset, children }: LayoutEditBarProps) {
  return (
    <div className="box layout-edit-bar" role="region" aria-label={title}>
      <div className="layout-edit-bar-text">
        <FarmIcon name="layout_edit" size={32} />
        <div>
          <b>{title}</b>
          <p className="muted">Sleep de boxen naar een andere plek, of gebruik de pijltjes. Met het oogje verberg je een box.</p>
        </div>
      </div>
      <div className="layout-edit-bar-actions">
        {children}
        <button type="button" className="link-button" onClick={onReset}>
          <FarmIcon name="arrow_undo" /> Standaard
        </button>
        <Button onClick={onCancel}>Annuleren</Button>
        <Button variant="cta" disabled={saving || !dirty} onClick={onSave}>
          {saving ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
