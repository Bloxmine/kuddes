import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SharedDoc } from '../../../shared/api'
import {
  TASK_COLUMNS,
  TASK_LABELS,
  type Drawing,
  type FormDef,
  type Mindmap,
  type Note,
  type NoteFont,
  type Planner,
  type Presentation,
  type TaskColumn,
  type Workbook,
} from '../../../shared/documents'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { MindmapView } from '../mindmap/MindmapView'
import { StudioPreview } from '../studio/StudioPreview'
import type { StudioProject } from '../../../shared/studio'
import { SlideView } from '../presentatie/SlideView'
import { ChartView } from '../rekenblad/Chart'
import { chartData, sheetTable } from '../rekenblad/sheet'
import { clean } from '../woord/editor'
import { useWidth } from './sharedDoc'
import '../presentatie/Presentatie.css'
import '../rekenblad/Rekenblad.css'
import './ToolGadgets.css'

const NOTE_FONT: Record<NoteFont, string> = {
  consolas: 'Consolas, "DejaVu Sans Mono", monospace',
  lucida: '"Lucida Console", "Lucida Sans Typewriter", monospace',
  courier: '"Courier New", Courier, monospace',
  calibri: 'Calibri, Carlito, sans-serif',
  comic: '"Comic Sans MS", "Comic Neue", cursive',
}

/**
 * A file from Tools to look at, not to change: in a profile gadget (`compact`,
 * a bit smaller and cut short) or large on its own page.
 */
export function DocView({ doc, compact = false }: { doc: SharedDoc; compact?: boolean }) {
  const cls = `tg-view tg-${doc.kind}${compact ? ' compact' : ''}`
  switch (doc.kind) {
    case 'woord':
      return (
        <div className={cls}>
          <div className="tg-page" style={{ background: doc.settings.pageColor }} dangerouslySetInnerHTML={{ __html: clean(doc.html) }} />
        </div>
      )
    case 'rekenblad':
      return <SheetView book={doc.content as Workbook} className={cls} />
    case 'presentatie':
      return <SlidesView show={doc.content as Presentation} className={cls} />
    case 'paint': {
      const d = doc.content as Drawing
      return (
        <div className={cls}>
          <img src={d.image} width={d.width} height={d.height} alt={doc.title} />
        </div>
      )
    }
    case 'mindmap':
      return (
        <div className={cls}>
          <MindmapView map={doc.content as Mindmap} idPrefix={`tg-mm-${doc.id}`} />
        </div>
      )
    case 'planner':
      return <PlannerView planner={doc.content as Planner} compact={compact} className={cls} />
    case 'formulier': {
      const f = doc.content as FormDef
      return (
        <div className={cls}>
          <h3>{doc.title}</h3>
          {f.description && <p className="tg-desc">{f.description}</p>}
          <p className="muted">
            {f.questions.length} {f.questions.length === 1 ? 'vraag' : 'vragen'}
            {f.anonymous ? ' · anoniem' : ''}
          </p>
          {!f.open ? (
            <p className="tg-closed">
              <FarmIcon name="lock" /> Dit formulier neemt geen antwoorden meer aan.
            </p>
          ) : f.publicId ? (
            <Link to={`/formulieren/${f.publicId}`} className="btn btn-cta">
              <FarmIcon name="application_form" /> Invullen
            </Link>
          ) : (
            <p className="muted">Dit formulier is nog niet opgeslagen met een link.</p>
          )}
        </div>
      )
    }
    case 'studio':
      return (
        <div className={cls}>
          <StudioPreview project={doc.content as StudioProject} />
        </div>
      )
    case 'kladblok': {
      const n = doc.content as Note
      return (
        <div className={cls}>
          <pre style={{ font: `${n.size}pt ${NOTE_FONT[n.font] ?? NOTE_FONT.consolas}`, whiteSpace: n.wrap ? 'pre-wrap' : 'pre' }}>{n.text || ' '}</pre>
        </div>
      )
    }
  }
}

function SheetView({ book, className }: { book: Workbook; className: string }) {
  const [active, setActive] = useState(Math.min(book.active, book.sheets.length - 1))
  const sheet = book.sheets[active]
  return (
    <div className={className}>
      <div className="tg-sheet" dangerouslySetInnerHTML={{ __html: sheetTable(sheet, true) }} />
      {sheet.charts.length > 0 && (
        <div className="tg-charts">
          {sheet.charts.map((ch) => (
            <div key={ch.id} className="tg-chart">
              <ChartView type={ch.type} title={ch.title} data={chartData(sheet, ch.range)} />
            </div>
          ))}
        </div>
      )}
      {book.sheets.length > 1 && (
        <nav className="tg-sheet-tabs" aria-label="Werkbladen">
          {book.sheets.map((s, i) => (
            <button key={i} type="button" className={i === active ? 'on' : undefined} onClick={() => setActive(i)} aria-pressed={i === active}>
              {s.name}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

function SlidesView({ show, className }: { show: Presentation; className: string }) {
  const [i, setI] = useState(0)
  const [ref, width] = useWidth()
  const n = show.slides.length
  const slide = show.slides[Math.min(i, n - 1)]
  const go = (d: number) => setI((x) => Math.max(0, Math.min(n - 1, x + d)))
  return (
    <div
      className={className}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1)
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1)
      }}
    >
      <div ref={ref} className="tg-slide">
        {slide && width > 0 && <SlideView slide={slide} theme={show.theme} width={width} />}
      </div>
      <div className="tg-slide-nav">
        <button type="button" className="icon-button" onClick={() => go(-1)} disabled={i === 0} aria-label="Vorige dia">
          <FarmIcon name="arrow_left" />
        </button>
        <span>
          Dia {Math.min(i, n - 1) + 1} van {n}
        </span>
        <button type="button" className="icon-button" onClick={() => go(1)} disabled={i >= n - 1} aria-label="Volgende dia">
          <FarmIcon name="arrow_right" />
        </button>
      </div>
    </div>
  )
}

function PlannerView({ planner, compact, className }: { planner: Planner; compact: boolean; className: string }) {
  const max = compact ? 5 : Infinity
  return (
    <div className={className}>
      {(Object.keys(TASK_COLUMNS) as TaskColumn[]).map((col) => {
        const tasks = planner.tasks.filter((t) => t.column === col)
        return (
          <section key={col} className={`tg-col tg-col-${col}`}>
            <h3>
              {TASK_COLUMNS[col]} <span>{tasks.length}</span>
            </h3>
            <ul>
              {tasks.slice(0, max).map((t) => {
                const done = t.checklist.filter((c) => c.done).length
                return (
                  <li key={t.id} style={t.label ? { borderLeftColor: TASK_LABELS[t.label] } : undefined}>
                    <b>{t.title}</b>
                    <small>
                      {t.priority === 'hoog' && <span className="tg-prio">Belangrijk</span>}
                      {t.due && <span>{new Date(`${t.due}T12:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>}
                      {t.checklist.length > 0 && (
                        <span>
                          ✓ {done}/{t.checklist.length}
                        </span>
                      )}
                    </small>
                  </li>
                )
              })}
              {tasks.length > max && <li className="tg-more">en nog {tasks.length - max}</li>}
              {tasks.length === 0 && <li className="tg-none">Niets</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
