import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOC_KINDS, MAX_OPTIONS, MAX_QUESTIONS, QUESTION_TYPES, type FormDef, type FormResponse, type Question, type QuestionType } from '../../../shared/documents'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { Big, Choices, FileMenu, Group, Menu, OfficeLoader, OpenDialog, RibbonTabs, SchemeGroup, Small, TitleBar } from '../office/Office'
import { DOCS_KEY, useOfficeFile, useOfficeLoad, useScheme, type OfficeFile } from '../office/officeFile'
import { answerRows, answerText, blankForm, newId, newQuestion, toCsv, toWorkbook, withOptions } from './form'
import { AnswerField } from './AnswerField'
import './Formulier.css'

const TABS = [
  ['start', 'Start'],
  ['beeld', 'Beeld'],
] as const
const TYPES = Object.entries(QUESTION_TYPES) as [QuestionType, string][]

/** Kuddes Formulieren (/tools/formulier): make a form, share the link, see the answers. */
export function FormulierPage() {
  return <OfficeLoader<FormDef> kind="formulier">{(file) => <FormBuilder file={file} />}</OfficeLoader>
}

function FormBuilder({ file }: { file: OfficeFile<FormDef> | null }) {
  const [form, setForm] = useState<FormDef>(() => file?.content ?? blankForm())
  const formRef = useRef(form)
  const snapshot = useCallback(
    () => ({
      content: formRef.current,
      words: formRef.current.questions.length,
    }),
    [],
  )
  const doc = useOfficeFile<FormDef>('formulier', file, snapshot)
  // The saved copy has the address the server gave it
  const saved = useOfficeLoad<FormDef>('formulier', doc.id ? String(doc.id) : undefined)
  const publicId = saved.data?.content?.publicId ?? file?.content?.publicId ?? null
  const link = publicId ? `${location.origin}/formulieren/${publicId}` : null
  const [tab, setTab] = useState<'start' | 'beeld'>('start')
  const [scheme, setScheme] = useScheme()
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [panel, setPanel] = useState<'vragen' | 'antwoorden'>('vragen')
  const [selected, setSelected] = useState<string | null>(form.questions[0]?.id ?? null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        doc.save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const change = (patch: Partial<FormDef>) => {
    formRef.current = { ...formRef.current, ...patch }
    setForm(formRef.current)
    doc.changed()
  }
  const setQuestion = (id: string, patch: Partial<Question>) =>
    change({
      questions: formRef.current.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })
  const addQuestion = (type: QuestionType) => {
    if (formRef.current.questions.length >= MAX_QUESTIONS) return setNotice(`Een formulier kan maximaal ${MAX_QUESTIONS} vragen hebben.`)
    const q = newQuestion(type)
    const qs = [...formRef.current.questions]
    const at = qs.findIndex((x) => x.id === selected)
    qs.splice(at < 0 ? qs.length : at + 1, 0, q)
    change({ questions: qs })
    setSelected(q.id)
    setPanel('vragen')
  }
  const moveQuestion = (id: string, by: -1 | 1) => {
    const qs = [...formRef.current.questions]
    const i = qs.findIndex((q) => q.id === id)
    const j = i + by
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    change({ questions: qs })
  }
  const copyQuestion = (id: string) => {
    if (formRef.current.questions.length >= MAX_QUESTIONS) return
    const qs = [...formRef.current.questions]
    const i = qs.findIndex((q) => q.id === id)
    const copy = { ...qs[i], id: newId(), options: [...qs[i].options] }
    qs.splice(i + 1, 0, copy)
    change({ questions: qs })
    setSelected(copy.id)
  }
  const removeQuestion = (id: string) => {
    const qs = formRef.current.questions
    const i = qs.findIndex((q) => q.id === id)
    change({ questions: qs.filter((q) => q.id !== id) })
    setSelected(qs[i + 1]?.id ?? qs[i - 1]?.id ?? null)
  }
  const changeType = (q: Question, type: QuestionType) =>
    setQuestion(q.id, {
      type,
      options: withOptions(type) ? (q.options.length ? q.options : ['Optie 1']) : [],
      scaleMax: type === 'schaal' ? (q.scaleMax ?? 5) : undefined,
    })

  /** Shares the link: saves first, since only a saved form has one. */
  const share = async () => {
    try {
      const id = !doc.id || doc.dirty ? (await doc.saveNow())?.content?.publicId : publicId
      if (!id) return setNotice('Sla het formulier eerst op.')
      await navigator.clipboard.writeText(`${location.origin}/formulieren/${id}`)
      setNotice('De link staat op je klembord. Deel hem met wie het formulier moet invullen.')
    } catch {
      setNotice('Kopiëren lukte niet; kopieer de link hieronder zelf.')
    }
  }

  return (
    <main className="page ofc-page">
      <div className="ofc-app frm-app" data-scheme={scheme}>
        <TitleBar
          kind="formulier"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[{ icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save }]}
        />
        {orb && (
          <FileMenu
            kind="formulier"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={[]}
            onPrint={() => window.print()}
            onDelete={doc.remove}
          />
        )}
        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' ? (
              <>
                <Group label="Invoegen">
                  <Menu icon="add" label="Vraag" title="Een vraag toevoegen" big>
                    {(close) => <Choices items={TYPES} onPick={(t) => (addQuestion(t), close())} />}
                  </Menu>
                </Group>
                <Group label="Instellingen">
                  <div className="ofc-stack">
                    <Small
                      icon={form.open ? 'lock_open' : 'lock'}
                      label={form.open ? 'Open voor antwoorden' : 'Gesloten'}
                      onClick={() => change({ open: !form.open })}
                      active={form.open}
                    />
                    <Small
                      icon="eye_close"
                      label="Anoniem"
                      onClick={() => change({ anonymous: !form.anonymous })}
                      active={form.anonymous}
                      title="Je ziet de antwoorden, maar niet wie ze gaf"
                    />
                  </div>
                </Group>
                <Group label="Delen">
                  <Big icon="link" label="Link kopiëren" onClick={() => void share()} />
                  <Big
                    icon="eye"
                    label="Bekijken"
                    onClick={() => link && window.open(link, '_blank')}
                    disabled={!link}
                    title={link ? 'Zo ziet het eruit voor wie het invult' : 'Sla het formulier eerst op'}
                  />
                </Group>
                <Group label="Weergave">
                  <Big icon="application_form" label="Vragen" onClick={() => setPanel('vragen')} active={panel === 'vragen'} />
                  <Big icon="table" label="Antwoorden" onClick={() => setPanel('antwoorden')} active={panel === 'antwoorden'} />
                </Group>
              </>
            ) : (
              <SchemeGroup scheme={scheme} onScheme={setScheme} />
            )}
          </div>
        </div>
        <div className="ofc-workspace frm-workspace">
          <div className="frm-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={panel === 'vragen'} className={panel === 'vragen' ? 'on' : undefined} onClick={() => setPanel('vragen')}>
              Vragen
            </button>
            <button type="button" role="tab" aria-selected={panel === 'antwoorden'} className={panel === 'antwoorden' ? 'on' : undefined} onClick={() => setPanel('antwoorden')}>
              Antwoorden
            </button>
          </div>
          {link ? (
            <p className={form.open ? 'frm-share' : 'frm-share closed'}>
              <FarmIcon name={form.open ? 'link' : 'lock'} size={16} />
              {form.open ? 'Invullen via' : 'Gesloten. De link was'}{' '}
              <a href={link} target="_blank" rel="noreferrer">
                {link}
              </a>
            </p>
          ) : (
            <p className="frm-share">
              <FarmIcon name="information" size={16} /> Sla het formulier op om een link te krijgen die je kunt delen.
            </p>
          )}
          {panel === 'vragen' ? (
            <div className="frm-sheet">
              <section className="frm-card frm-head">
                <input className="frm-title" value={doc.title} maxLength={120} onChange={(e) => doc.setTitle(e.target.value)} aria-label="Titel van het formulier" />
                <textarea
                  className="frm-desc"
                  value={form.description}
                  maxLength={2000}
                  rows={2}
                  placeholder="Beschrijving (wat wil je weten, en waarom?)"
                  onChange={(e) => change({ description: e.target.value })}
                  aria-label="Beschrijving"
                />
              </section>
              {form.questions.map((q, i) =>
                q.id === selected ? (
                  <QuestionEditor
                    key={q.id}
                    q={q}
                    first={i === 0}
                    last={i === form.questions.length - 1}
                    onChange={(p) => setQuestion(q.id, p)}
                    onType={(t) => changeType(q, t)}
                    onMove={(by) => moveQuestion(q.id, by)}
                    onCopy={() => copyQuestion(q.id)}
                    onRemove={() => removeQuestion(q.id)}
                  />
                ) : (
                  <button key={q.id} type="button" className="frm-card frm-preview" onClick={() => setSelected(q.id)}>
                    <span className="frm-q-title">
                      {q.title || <i>Vraag zonder titel</i>}
                      {q.required && <b className="frm-req"> *</b>}
                    </span>
                    {q.help && <span className="frm-help">{q.help}</span>}
                    <span className="frm-preview-field" aria-hidden="true">
                      <AnswerField q={q} value={undefined} onChange={() => undefined} disabled />
                    </span>
                  </button>
                ),
              )}
              <div className="frm-add">
                {TYPES.slice(0, 4).map(([t, name]) => (
                  <button key={t} type="button" className="btn" onClick={() => addQuestion(t)}>
                    <FarmIcon name="add" size={16} /> {name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <Answers docId={doc.id} form={form} title={doc.title} />
          )}
        </div>
        <footer className="ofc-status">
          <span>{form.questions.length} vragen</span>
          <span>{form.open ? 'Open voor antwoorden' : 'Gesloten'}</span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.problem ?? notice ?? doc.status}
          </span>
        </footer>
      </div>
      {opening && <OpenDialog kind="formulier" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}

function QuestionEditor(p: {
  q: Question
  first: boolean
  last: boolean
  onChange: (p: Partial<Question>) => void
  onType: (t: QuestionType) => void
  onMove: (by: -1 | 1) => void
  onCopy: () => void
  onRemove: () => void
}) {
  const { q, onChange } = p
  const setOption = (i: number, v: string) => onChange({ options: q.options.map((o, j) => (j === i ? v : o)) })
  return (
    <section className="frm-card frm-editing">
      <div className="frm-q-row">
        <input
          className="frm-q-input"
          value={q.title}
          maxLength={300}
          placeholder="Vraag"
          autoFocus={!q.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Vraag"
        />
        <select value={q.type} onChange={(e) => p.onType(e.target.value as QuestionType)} aria-label="Soort vraag">
          {TYPES.map(([t, name]) => (
            <option key={t} value={t}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <input
        className="frm-help-input"
        value={q.help}
        maxLength={500}
        placeholder="Uitleg bij de vraag (mag leeg)"
        onChange={(e) => onChange({ help: e.target.value })}
        aria-label="Uitleg"
      />
      {withOptions(q.type) && (
        <ol className={`frm-options frm-options-${q.type}`}>
          {q.options.map((o, i) => (
            <li key={i}>
              <input
                value={o}
                maxLength={200}
                onChange={(e) => setOption(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && q.options.length < MAX_OPTIONS) {
                    e.preventDefault()
                    onChange({
                      options: [...q.options.slice(0, i + 1), `Optie ${q.options.length + 1}`, ...q.options.slice(i + 1)],
                    })
                  }
                }}
                aria-label={`Optie ${i + 1}`}
              />
              {q.options.length > 1 && (
                <button type="button" onClick={() => onChange({ options: q.options.filter((_, j) => j !== i) })} aria-label={`Optie ${i + 1} verwijderen`}>
                  <FarmIcon name="cross" size={16} />
                </button>
              )}
            </li>
          ))}
          {q.options.length < MAX_OPTIONS && (
            <li>
              <button
                type="button"
                className="frm-add-option"
                onClick={() =>
                  onChange({
                    options: [...q.options, `Optie ${q.options.length + 1}`],
                  })
                }
              >
                Optie toevoegen
              </button>
            </li>
          )}
        </ol>
      )}
      {q.type === 'schaal' && (
        <label className="frm-scale-set">
          Van 1 tot{' '}
          <select value={q.scaleMax ?? 5} onChange={(e) => onChange({ scaleMax: Number(e.target.value) })}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
      )}
      {!withOptions(q.type) && q.type !== 'schaal' && (
        <div className="frm-preview-field" aria-hidden="true">
          <AnswerField q={q} value={undefined} onChange={() => undefined} disabled />
        </div>
      )}
      <div className="frm-q-tools">
        <button type="button" onClick={() => p.onMove(-1)} disabled={p.first} title="Omhoog" aria-label="Omhoog">
          <FarmIcon name="arrow_up" size={16} />
        </button>
        <button type="button" onClick={() => p.onMove(1)} disabled={p.last} title="Omlaag" aria-label="Omlaag">
          <FarmIcon name="arrow_down" size={16} />
        </button>
        <button type="button" onClick={p.onCopy} title="Kopiëren" aria-label="Kopiëren">
          <FarmIcon name="page_copy" size={16} />
        </button>
        <button type="button" onClick={p.onRemove} title="Verwijderen" aria-label="Verwijderen">
          <FarmIcon name="bin" size={16} />
        </button>
        <label className="frm-required">
          <input type="checkbox" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} /> Verplicht
        </label>
      </div>
    </section>
  )
}

function Answers({ docId, form, title }: { docId: number | null; form: FormDef; title: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const key = [...DOCS_KEY, docId, 'responses']
  const responses = useQuery({
    queryKey: key,
    queryFn: () => api<FormResponse[]>(`/me/documents/${docId}/responses`),
    enabled: docId !== null,
  })
  const [problem, setProblem] = useState<string | null>(null)
  const [view, setView] = useState<'samenvatting' | 'tabel'>('samenvatting')
  if (!docId) return <p className="frm-empty">Sla het formulier op en deel de link; de antwoorden komen dan hier.</p>
  if (responses.isLoading) return <p className="frm-empty">Antwoorden laden…</p>
  if (responses.error) return <p className="frm-empty error">{errorMessage(responses.error)}</p>
  const list = responses.data ?? []
  const rows = answerRows(form, list)

  const remove = async (id: number) => {
    if (!confirm('Dit antwoord verwijderen?')) return
    try {
      await api(`/me/documents/${docId}/responses/${id}`, { method: 'DELETE' })
      void queryClient.invalidateQueries({ queryKey: key })
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }
  const csv = () => {
    const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Antwoorden'} - antwoorden.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const toRekenblad = async () => {
    try {
      const content = toWorkbook(rows)
      const created = await api<{ id: number }>('/me/documents', {
        method: 'POST',
        body: {
          kind: 'rekenblad',
          title: `${title} - antwoorden`.slice(0, 120),
          content,
          words: Object.keys(content.sheets[0].cells).length,
        },
      })
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY })
      navigate(`${DOC_KINDS.rekenblad.path}/${created.id}`)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  return (
    <div className="frm-sheet frm-answers">
      <section className="frm-card frm-answers-head">
        <h2>
          {list.length} {list.length === 1 ? 'antwoord' : 'antwoorden'}
        </h2>
        <div className="frm-answers-tools">
          <button type="button" className={view === 'samenvatting' ? 'btn on' : 'btn'} onClick={() => setView('samenvatting')}>
            Samenvatting
          </button>
          <button type="button" className={view === 'tabel' ? 'btn on' : 'btn'} onClick={() => setView('tabel')}>
            Per persoon
          </button>
          <button type="button" className="btn" onClick={csv} disabled={!list.length}>
            <FarmIcon name="page_white_excel" size={16} /> CSV
          </button>
          <button type="button" className="btn" onClick={() => void toRekenblad()} disabled={!list.length}>
            <FarmIcon name="table" size={16} /> Openen in Rekenblad
          </button>
        </div>
        {form.anonymous && <p className="frm-help">Dit formulier is anoniem: je ziet niet wie wat antwoordde.</p>}
        {problem && <p className="form-error">{problem}</p>}
      </section>
      {list.length === 0 ? (
        <p className="frm-empty">Nog niemand heeft het formulier ingevuld.</p>
      ) : view === 'samenvatting' ? (
        form.questions.map((q) => <Summary key={q.id} q={q} answers={list.map((r) => r.answers[q.id]).filter((v) => v !== undefined)} />)
      ) : (
        <section className="frm-card frm-table-wrap">
          <table className="frm-table">
            <thead>
              <tr>
                {rows[0].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
                <th aria-label="Verwijderen" />
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row, i) => (
                <tr key={list[i].id}>
                  {row.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                  <td>
                    <button type="button" className="frm-del" onClick={() => void remove(list[i].id)} aria-label="Antwoord verwijderen" title="Verwijderen">
                      <FarmIcon name="bin" size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

/** One question's answers together: bars for choices, numbers for numbers, a list for text. */
function Summary({ q, answers }: { q: Question; answers: FormResponse['answers'][string][] }) {
  const counted = withOptions(q.type) || q.type === 'schaal'
  let body
  if (!answers.length) body = <p className="frm-help">Geen antwoorden.</p>
  else if (counted) {
    const labels = q.type === 'schaal' ? Array.from({ length: q.scaleMax ?? 5 }, (_, i) => String(i + 1)) : q.options
    const counts = labels.map((l) => answers.filter((a) => (Array.isArray(a) ? a.includes(l) : String(a) === l)).length)
    const max = Math.max(1, ...counts)
    body = (
      <ul className="frm-bars">
        {labels.map((l, i) => (
          <li key={l}>
            <span className="frm-bar-label">{l}</span>
            <span className="frm-bar">
              <i style={{ width: `${(counts[i] / max) * 100}%` }} />
            </span>
            <span className="frm-bar-count">
              {counts[i]} ({Math.round((counts[i] / answers.length) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    )
  } else if (q.type === 'getal') {
    const ns = answers.map(Number)
    const avg = ns.reduce((a, b) => a + b, 0) / ns.length
    const nl = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
    body = (
      <p className="frm-numbers">
        Gemiddeld <b>{nl(avg)}</b> · laagste <b>{nl(Math.min(...ns))}</b> · hoogste <b>{nl(Math.max(...ns))}</b>
      </p>
    )
  } else {
    body = (
      <ul className="frm-texts">
        {answers.slice(0, 50).map((a, i) => (
          <li key={i}>{q.type === 'datum' ? new Date(`${a}T12:00:00`).toLocaleDateString('nl-NL') : answerText(a)}</li>
        ))}
        {answers.length > 50 && <li className="frm-help">en nog {answers.length - 50}; zie Per persoon.</li>}
      </ul>
    )
  }
  return (
    <section className="frm-card">
      <h3 className="frm-q-title">{q.title || 'Vraag zonder titel'}</h3>
      <p className="frm-help">
        {answers.length} {answers.length === 1 ? 'antwoord' : 'antwoorden'}
      </p>
      {body}
    </section>
  )
}
