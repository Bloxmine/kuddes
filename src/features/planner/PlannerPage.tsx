import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MAX_TASKS, TASK_COLUMNS, TASK_LABELS, type Planner, type Task, type TaskColumn, type TaskLabel } from '../../../shared/documents'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Big, FileMenu, Group, OfficeLoader, OpenDialog, RibbonTabs, SchemeGroup, Small, TitleBar } from '../office/Office'
import { useOfficeFile, useScheme, type OfficeFile } from '../office/officeFile'
import { addDays, blankPlanner, dayKey, newId, newTask, PRIORITIES, startOfWeek, toCsv } from './planner'
import './Planner.css'

const TABS = [
  ['start', 'Start'],
  ['beeld', 'Beeld'],
] as const
type View = 'bord' | 'week' | 'lijst'
const COLUMNS = Object.keys(TASK_COLUMNS) as TaskColumn[]
const LABELS = Object.keys(TASK_LABELS) as TaskLabel[]
const DAY = new Intl.DateTimeFormat('nl-NL', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const SHORT = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
})
const fmt = (key: string, f = SHORT) => f.format(new Date(`${key}T12:00:00`))

/** Kuddes Planner (/tools/planner): tasks on a board, in a week or as a list. */
export function PlannerPage() {
  return <OfficeLoader<Planner> kind="planner">{(file) => <PlannerEditor file={file} />}</OfficeLoader>
}

function PlannerEditor({ file }: { file: OfficeFile<Planner> | null }) {
  const [plan, setPlan] = useState<Planner>(() => file?.content ?? blankPlanner())
  const planRef = useRef(plan)
  const snapshot = useCallback(() => ({ content: planRef.current, words: planRef.current.tasks.length }), [])
  const doc = useOfficeFile<Planner>('planner', file, snapshot)
  const [tab, setTab] = useState<'start' | 'beeld'>('start')
  const [scheme, setScheme] = useScheme()
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [view, setView] = useState<View>('bord')
  const [open, setOpen] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [label, setLabel] = useState<TaskLabel | null>(null)
  const [hideDone, setHideDone] = useState(false)
  const [week, setWeek] = useState(() => startOfWeek(new Date()))
  const [adding, setAdding] = useState<{
    column: TaskColumn
    due: string | null
    text: string
  } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const history = useRef<{ past: Planner[]; future: Planner[] }>({
    past: [],
    future: [],
  })
  const today = dayKey(new Date())


  const change = (next: Planner) => {
    history.current.past.push(planRef.current)
    if (history.current.past.length > 60) history.current.past.shift()
    history.current.future = []
    planRef.current = next
    setPlan(next)
    doc.changed()
  }
  const undo = (from: 'past' | 'future') => {
    const prev = history.current[from].pop()
    if (!prev) return
    history.current[from === 'past' ? 'future' : 'past'].push(planRef.current)
    planRef.current = prev
    setPlan(prev)
    doc.changed()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      // Inside a text field, Ctrl+Z undoes the typing, not the planner
      const typing = (e.target as HTMLElement).closest('input, textarea, select')
      if (k === 's') doc.save()
      else if (k === 'z' && !typing) undo('past')
      else if (k === 'y' && !typing) undo('future')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const update = (id: string, patch: Partial<Task>) =>
    change({
      tasks: planRef.current.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  const add = (title: string, column: TaskColumn = 'todo', due: string | null = null) => {
    if (planRef.current.tasks.length >= MAX_TASKS) {
      setNotice(`Een planner kan maximaal ${MAX_TASKS} taken hebben.`)
      return null
    }
    const t = newTask(title, column, due)
    change({ tasks: [...planRef.current.tasks, t] })
    return t
  }
  const remove = (id: string) => {
    change({ tasks: planRef.current.tasks.filter((t) => t.id !== id) })
    setOpen(null)
  }
  /** Drops a card in a column, before another card (or at the end). */
  const drop = (id: string, column: TaskColumn, before: string | null) => {
    const tasks = planRef.current.tasks.filter((t) => t.id !== id)
    const moved = planRef.current.tasks.find((t) => t.id === id)
    if (!moved) return
    const i = before ? tasks.findIndex((t) => t.id === before) : -1
    tasks.splice(i < 0 ? tasks.length : i, 0, { ...moved, column })
    change({ tasks })
  }

  const shown = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('nl')
    return plan.tasks.filter((t) => (!q || `${t.title} ${t.notes}`.toLocaleLowerCase('nl').includes(q)) && (!label || t.label === label) && !(hideDone && t.column === 'klaar'))
  }, [plan, search, label, hideDone])
  const task = plan.tasks.find((t) => t.id === open) ?? null

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿', toCsv(plan.tasks)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Planner'}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const print = () => {
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.title = doc.title
    const h = w.document.createElement('h1')
    h.textContent = doc.title
    w.document.body.append(h)
    for (const c of COLUMNS) {
      const list = plan.tasks.filter((t) => t.column === c)
      if (!list.length) continue
      const h2 = w.document.createElement('h2')
      h2.textContent = TASK_COLUMNS[c]
      const ul = w.document.createElement('ul')
      for (const t of list) {
        const li = w.document.createElement('li')
        li.textContent = `${t.title}${t.due ? ` (${fmt(t.due)})` : ''}${t.priority === 'hoog' ? ' !' : ''}`
        ul.append(li)
      }
      w.document.body.append(h2, ul)
    }
    w.document.body.style.fontFamily = 'Calibri, Carlito, sans-serif'
    setTimeout(() => w.print(), 300)
  }

  const card = (t: Task) => {
    const done = t.checklist.filter((c) => c.done).length
    const late = t.due && t.due < today && t.column !== 'klaar'
    return (
      <li
        key={t.id}
        className={`pln-card${t.column === 'klaar' ? ' done' : ''}${dragging === t.id ? ' dragging' : ''}${open === t.id ? ' on' : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', t.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragging(t.id)
        }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => view === 'bord' && e.preventDefault()}
        onDrop={(e) => {
          if (view !== 'bord') return
          e.preventDefault()
          e.stopPropagation()
          const id = e.dataTransfer.getData('text/plain')
          if (id && id !== t.id) drop(id, t.column, t.id)
        }}
      >
        <button type="button" className="pln-card-btn" onClick={() => setOpen(t.id)}>
          {t.label && <i className="pln-label" style={{ background: TASK_LABELS[t.label] }} title={t.label} />}
          <span className="pln-card-title">{t.title || 'Naamloze taak'}</span>
          <span className="pln-card-meta">
            {t.priority === 'hoog' && (
              <span className="pln-prio" title="Hoge prioriteit">
                <FarmIcon name="flag_red" size={16} />
              </span>
            )}
            {t.due && (
              <span className={late ? 'pln-due late' : 'pln-due'}>
                <FarmIcon name="calendar" size={16} /> {fmt(t.due)}
              </span>
            )}
            {t.checklist.length > 0 && (
              <span className={done === t.checklist.length ? 'pln-check all' : 'pln-check'}>
                <FarmIcon name="tick" size={16} /> {done}/{t.checklist.length}
              </span>
            )}
            {t.notes.trim() && <FarmIcon name="note" size={16} label="Heeft notities" />}
          </span>
        </button>
      </li>
    )
  }

  const addBox = (column: TaskColumn, due: string | null) =>
    adding && adding.column === column && adding.due === due ? (
      <form
        className="pln-add-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (adding.text.trim()) add(adding.text.trim().slice(0, 200), column, due)
          setAdding({ ...adding, text: '' })
        }}
      >
        <input
          autoFocus
          value={adding.text}
          maxLength={200}
          placeholder="Wat moet er gebeuren?"
          onChange={(e) => setAdding({ ...adding, text: e.target.value })}
          onKeyDown={(e) => e.key === 'Escape' && setAdding(null)}
          onBlur={() => !adding.text.trim() && setAdding(null)}
          aria-label="Nieuwe taak"
        />
        <button type="submit" className="btn">
          Toevoegen
        </button>
      </form>
    ) : (
      <button type="button" className="pln-add" onClick={() => setAdding({ column, due, text: '' })}>
        <FarmIcon name="add" size={16} /> Taak toevoegen
      </button>
    )

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))

  return (
    <main className="page ofc-page">
      <div className="ofc-app pln-app" data-scheme={scheme}>
        <TitleBar
          kind="planner"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            {
              icon: 'arrow_undo',
              title: 'Ongedaan maken',
              onClick: () => undo('past'),
            },
            {
              icon: 'arrow_redo',
              title: 'Opnieuw',
              onClick: () => undo('future'),
            },
          ]}
        />
        {orb && (
          <FileMenu
            kind="planner"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={[
              {
                key: 'csv',
                icon: 'page_white_excel',
                name: 'CSV-bestand',
                hint: 'Voor Excel of een andere planner.',
                onClick: exportCsv,
              },
            ]}
            onPrint={print}
            onDelete={doc.remove}
          />
        )}
        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' ? (
              <>
                <Group label="Nieuw">
                  <Big
                    icon="note_add"
                    label="Nieuwe taak"
                    onClick={() => {
                      const t = add('Nieuwe taak', 'todo', view === 'week' ? dayKey(week) : null)
                      if (t) setOpen(t.id)
                    }}
                  />
                </Group>
                <Group label="Weergave">
                  <Big icon="application_view_tile" label="Bord" onClick={() => setView('bord')} active={view === 'bord'} />
                  <Big icon="calendar_view_week" label="Week" onClick={() => setView('week')} active={view === 'week'} />
                  <Big icon="text_list_bullets" label="Lijst" onClick={() => setView('lijst')} active={view === 'lijst'} />
                </Group>
                <Group label="Filter">
                  <div className="ofc-stack">
                    <input
                      className="pln-search"
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Zoeken in taken"
                      aria-label="Zoeken in taken"
                    />
                    <div className="pln-label-filter" role="group" aria-label="Alleen dit label">
                      {LABELS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          className={label === l ? 'on' : undefined}
                          style={{ background: TASK_LABELS[l] }}
                          onClick={() => setLabel(label === l ? null : l)}
                          title={`Alleen ${l}`}
                          aria-pressed={label === l}
                        />
                      ))}
                    </div>
                    <Small icon="tick" label="Klaar verbergen" onClick={() => setHideDone((h) => !h)} active={hideDone} />
                  </div>
                </Group>
              </>
            ) : (
              <SchemeGroup scheme={scheme} onScheme={setScheme} />
            )}
          </div>
        </div>
        <div className="pln-main">
          <div className="ofc-workspace pln-workspace">
            {view === 'bord' && (
              <div className="pln-board">
                {COLUMNS.map((c) => {
                  const list = shown.filter((t) => t.column === c)
                  return (
                    <section
                      key={c}
                      className={`pln-col pln-col-${c}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault()
                        const id = e.dataTransfer.getData('text/plain')
                        if (id) drop(id, c, null)
                      }}
                    >
                      <h2>
                        {TASK_COLUMNS[c]} <span>{list.length}</span>
                      </h2>
                      <ul>{list.map(card)}</ul>
                      {addBox(c, null)}
                    </section>
                  )
                })}
              </div>
            )}
            {view === 'week' && (
              <>
                <div className="pln-week-nav">
                  <button type="button" className="btn" onClick={() => setWeek(addDays(week, -7))}>
                    ‹ Vorige
                  </button>
                  <button type="button" className="btn" onClick={() => setWeek(startOfWeek(new Date()))}>
                    Deze week
                  </button>
                  <button type="button" className="btn" onClick={() => setWeek(addDays(week, 7))}>
                    Volgende ›
                  </button>
                  <b>
                    {fmt(dayKey(week))} – {fmt(dayKey(addDays(week, 6)))}
                  </b>
                </div>
                <div className="pln-week">
                  {days.map((d) => {
                    const key = dayKey(d)
                    return (
                      <section
                        key={key}
                        className={key === today ? 'pln-day today' : 'pln-day'}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const id = e.dataTransfer.getData('text/plain')
                          if (id) update(id, { due: key })
                        }}
                      >
                        <h2>{DAY.format(d)}</h2>
                        <ul>{shown.filter((t) => t.due === key).map(card)}</ul>
                        {addBox('todo', key)}
                      </section>
                    )
                  })}
                </div>
                <section
                  className="pln-day pln-nodate"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain')
                    if (id) update(id, { due: null })
                  }}
                >
                  <h2>Zonder datum</h2>
                  <ul>{shown.filter((t) => !t.due && t.column !== 'klaar').map(card)}</ul>
                </section>
              </>
            )}
            {view === 'lijst' && (
              <table className="pln-list">
                <thead>
                  <tr>
                    <th aria-label="Klaar" />
                    <th>Taak</th>
                    <th>Status</th>
                    <th>Datum</th>
                    <th>Prioriteit</th>
                    <th>Label</th>
                  </tr>
                </thead>
                <tbody>
                  {[...shown]
                    .sort((a, b) => (a.column === 'klaar' ? 1 : 0) - (b.column === 'klaar' ? 1 : 0) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
                    .map((t) => (
                      <tr key={t.id} className={t.column === 'klaar' ? 'done' : undefined}>
                        <td>
                          <input
                            type="checkbox"
                            checked={t.column === 'klaar'}
                            onChange={(e) =>
                              update(t.id, {
                                column: e.target.checked ? 'klaar' : 'todo',
                              })
                            }
                            aria-label="Klaar"
                          />
                        </td>
                        <td>
                          <button type="button" className="pln-link" onClick={() => setOpen(t.id)}>
                            {t.title || 'Naamloze taak'}
                          </button>
                        </td>
                        <td>{TASK_COLUMNS[t.column]}</td>
                        <td className={t.due && t.due < today && t.column !== 'klaar' ? 'late' : undefined}>{t.due ? fmt(t.due) : '–'}</td>
                        <td>{PRIORITIES[t.priority]}</td>
                        <td>{t.label && <i className="pln-label" style={{ background: TASK_LABELS[t.label] }} title={t.label} />}</td>
                      </tr>
                    ))}
                  {shown.length === 0 && (
                    <tr>
                      <td colSpan={6} className="pln-empty">
                        Geen taken gevonden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {task && <TaskPanel key={task.id} task={task} onChange={(patch) => update(task.id, patch)} onDelete={() => remove(task.id)} onClose={() => setOpen(null)} />}
        </div>
        <footer className="ofc-status">
          <span>
            {plan.tasks.length} taken, {plan.tasks.filter((t) => t.column === 'klaar').length} klaar
          </span>
          <span>{plan.tasks.filter((t) => t.due && t.due < today && t.column !== 'klaar').length || 'Geen'} te laat</span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.problem ?? notice ?? doc.status}
          </span>
        </footer>
      </div>
      {opening && <OpenDialog kind="planner" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}

/** The side panel with everything about one task. Text fields save when you leave them. */
function TaskPanel({ task, onChange, onDelete, onClose }: { task: Task; onChange: (p: Partial<Task>) => void; onDelete: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [item, setItem] = useState('')
  return (
    <aside className="pln-panel" aria-label="Taak bewerken" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header>
        <input
          className="pln-panel-title"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== task.title && onChange({ title: title.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          aria-label="Titel"
        />
        <button type="button" className="pln-close" onClick={onClose} aria-label="Sluiten">
          ×
        </button>
      </header>
      <div className="pln-fields">
        <label>
          Status
          <select value={task.column} onChange={(e) => onChange({ column: e.target.value as TaskColumn })}>
            {COLUMNS.map((c) => (
              <option key={c} value={c}>
                {TASK_COLUMNS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Datum
          <input type="date" value={task.due ?? ''} onChange={(e) => onChange({ due: e.target.value || null })} />
        </label>
        <label>
          Prioriteit
          <select value={task.priority} onChange={(e) => onChange({ priority: e.target.value as Task['priority'] })}>
            {(Object.keys(PRIORITIES) as Task['priority'][]).map((p) => (
              <option key={p} value={p}>
                {PRIORITIES[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="pln-labels" role="group" aria-label="Label">
        <button type="button" className={task.label ? 'none' : 'none on'} onClick={() => onChange({ label: null })}>
          Geen
        </button>
        {LABELS.map((l) => (
          <button
            key={l}
            type="button"
            className={task.label === l ? 'on' : undefined}
            style={{ background: TASK_LABELS[l] }}
            onClick={() => onChange({ label: l })}
            title={l}
            aria-label={l}
            aria-pressed={task.label === l}
          />
        ))}
      </div>
      <label className="pln-notes">
        Notities
        <textarea value={notes} maxLength={4000} rows={5} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== task.notes && onChange({ notes })} />
      </label>
      <h3>
        Checklist{' '}
        {task.checklist.length > 0 && (
          <span>
            {task.checklist.filter((c) => c.done).length}/{task.checklist.length}
          </span>
        )}
      </h3>
      {task.checklist.length > 0 && <progress max={task.checklist.length} value={task.checklist.filter((c) => c.done).length} />}
      <ul className="pln-checklist">
        {task.checklist.map((c) => (
          <li key={c.id}>
            <label>
              <input
                type="checkbox"
                checked={c.done}
                onChange={(e) =>
                  onChange({
                    checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)),
                  })
                }
              />
              <span className={c.done ? 'done' : undefined}>{c.text}</span>
            </label>
            <button
              type="button"
              onClick={() =>
                onChange({
                  checklist: task.checklist.filter((x) => x.id !== c.id),
                })
              }
              aria-label={`${c.text} verwijderen`}
            >
              <FarmIcon name="cross" size={16} />
            </button>
          </li>
        ))}
      </ul>
      {task.checklist.length < 50 && (
        <form
          className="pln-add-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!item.trim()) return
            onChange({
              checklist: [...task.checklist, { id: newId(), text: item.trim().slice(0, 200), done: false }],
            })
            setItem('')
          }}
        >
          <input value={item} maxLength={200} onChange={(e) => setItem(e.target.value)} placeholder="Stap toevoegen" aria-label="Stap toevoegen" />
          <button type="submit" className="btn">
            +
          </button>
        </form>
      )}
      <button type="button" className="btn pln-delete" onClick={onDelete}>
        <FarmIcon name="cross" size={16} /> Taak verwijderen
      </button>
    </aside>
  )
}
