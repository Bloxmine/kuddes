/**
 * "Mijn designs" for your profile and your Kuddes: the same way of working as
 * Mijn thema's for the site (ThemeStudio.tsx). Your designs as cards with a
 * small preview, to use, edit, copy, share as a code or remove; a new one
 * starts blank and is saved as a new one. The editor has undo, a copy in this
 * browser until it's saved, and asks before you leave unsaved changes.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MAX_SAVED_DESIGNS, patternCss, type ProfileColors } from '../../../shared/customization'
import { PROFILE_PRESETS } from '../../../shared/skins'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import { useUnsavedChanges } from '../../lib/unsavedChanges'
import { DesignEditor } from './Customization'
import {
  BLANK_DESIGN,
  designCode,
  readDesignCode,
  readDesignDraft,
  sameLook,
  useDesignLibrary,
  useSavedDesigns,
  writeDesignDraft,
  type DesignDraft,
  type SavedLook,
} from './savedDesigns'
import './ThemeStudio.css'
import { ShareDesignDialog } from '../designs/ShareDesignDialog'
import { DesignMini } from './LookMinis'

type Editing = { id: number | null; name: string; data: ProfileColors; base: { name: string; data: ProfileColors } | null }

/**
 * `target` keeps the browser backup apart ("profiel", "kudde-<slug>").
 * `applied`: the design in use now (null: none); `apply` puts a design in use.
 */
export function DesignStudio({
  subject,
  target,
  applied,
  apply,
  reset,
  preview,
}: {
  subject: 'profiel' | 'kudde'
  target: string
  applied: ProfileColors | null
  apply: (d: ProfileColors) => Promise<unknown>
  /** Back to the standard look. */
  reset?: () => Promise<unknown>
  preview: (d: ProfileColors) => ReactNode
}) {
  const { data: saved = [], isLoading } = useSavedDesigns()
  const { create, update, remove } = useDesignLibrary()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [backup, setBackup] = useState<DesignDraft | null>(() => readDesignDraft(target))
  const [sharing, setSharing] = useState<SavedLook | null>(null)
  const [publishing, setPublishing] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inUse = (d: ProfileColors) => sameLook(applied, d)
  const loose = applied && !saved.some((s) => sameLook(s.data, applied)) ? applied : null
  const full = saved.length >= MAX_SAVED_DESIGNS
  const word = subject === 'kudde' ? 'deze Kudde' : 'je profiel'

  const open = (e: Editing) => {
    setProblem(null)
    setEditing(e)
  }
  const use = (d: ProfileColors) => apply(d).catch((e) => setProblem(errorMessage(e)))

  return (
    <section className="ts-library ds-library" id={subject === 'profiel' ? 'eigen-design' : undefined}>
      <header className="ts-library-hdr">
        <h3>
          <FarmIcon name="color_wheel" /> Mijn designs <small className="muted">({saved.length}/{MAX_SAVED_DESIGNS})</small>
        </h3>
        <span className="ts-library-tools">
          <Button onClick={() => setImporting(true)} disabled={!!editing || full} title="Een design van iemand anders, als code">
            <FarmIcon name="page_white_code" /> Code invoeren
          </Button>
          {reset && applied && (
            <Button onClick={() => confirm(`Het standaard design gebruiken voor ${word}?`) && void reset().catch((e) => setProblem(errorMessage(e)))}>
              Standaard design
            </Button>
          )}
        </span>
      </header>
      <p className="muted ds-intro">Je designs zijn voor {subject === 'kudde' ? 'je profiel en al je Kuddes' : 'je profiel en je Kuddes'}: maak ze één keer, gebruik ze overal.</p>

      {backup && !editing && (
        <div className="form-notice ts-backup">
          <FarmIcon name="information" />
          <span>
            Je was op {formatTime(new Date(backup.at).toISOString())} bezig met <b>{backup.name || 'een design'}</b> en dat is nog niet opgeslagen.
          </span>
          <Button
            variant="cta"
            onClick={() => {
              const base = backup.id ? saved.find((s) => s.id === backup.id) : null
              open({ id: base ? backup.id : null, name: backup.name, data: backup.data, base: base ? { name: base.name, data: base.data } : null })
            }}
          >
            Verder bewerken
          </Button>
          <Button
            onClick={() => {
              writeDesignDraft(target, null)
              setBackup(null)
            }}
          >
            Weggooien
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : (
        <ul className="ts-cards">
          {loose && (
            <li className="ts-card current">
              <DesignMini design={loose} />
              <span className="ts-card-name">
                <b>Huidig design</b>
                <small className="muted">nog niet bewaard</small>
              </span>
              <span className="ts-card-actions">
                <Button variant="cta" onClick={() => create.mutate({ name: subject === 'kudde' ? 'Kudde-design' : 'Mijn design', data: loose })} disabled={create.isPending || full}>
                  <FarmIcon name="diskette" /> Bewaren
                </Button>
                <Button onClick={() => open({ id: null, name: 'Mijn design', data: loose, base: null })} disabled={!!editing} title="Bewerken">
                  <FarmIcon name="pencil" />
                </Button>
              </span>
            </li>
          )}
          {saved.map((s) => (
            <li key={s.id} className={`ts-card${inUse(s.data) ? ' current' : ''}${editing?.id === s.id ? ' editing' : ''}`}>
              <button type="button" className="ts-card-pick" onClick={() => !inUse(s.data) && void use(s.data)} title={inUse(s.data) ? 'In gebruik' : `${s.name} gebruiken`}>
                <DesignMini design={s.data} />
              </button>
              <span className="ts-card-name">
                <b>{s.name}</b>
                <small className="muted">{inUse(s.data) ? `in gebruik op ${word}` : `bewaard ${formatTime(s.updatedAt)}`}</small>
              </span>
              <span className="ts-card-actions">
                {inUse(s.data) ? (
                  <span className="ts-badge">
                    <FarmIcon name="tick" /> In gebruik
                  </span>
                ) : (
                  <Button variant="cta" onClick={() => void use(s.data)}>
                    Gebruiken
                  </Button>
                )}
                <Button onClick={() => open({ id: s.id, name: s.name, data: s.data, base: { name: s.name, data: s.data } })} disabled={!!editing} title="Bewerken">
                  <FarmIcon name="pencil" />
                </Button>
                <Button onClick={() => create.mutate({ name: `${s.name} (kopie)`.slice(0, 40), data: s.data })} disabled={create.isPending || full} title="Kopie maken">
                  <FarmIcon name="page_white_put" />
                </Button>
                <Button onClick={() => setSharing(s)} title="Delen als code">
                  <FarmIcon name="link" />
                </Button>
                <Button onClick={() => setPublishing(s.id)} title="Delen in de Designgalerij">
                  <FarmIcon name="palette" />
                </Button>
                <Button onClick={() => confirm(`"${s.name}" verwijderen? Waar het in gebruik is, blijft het staan.`) && remove.mutate(s.id)} disabled={editing?.id === s.id} title="Verwijderen">
                  <FarmIcon name="bin" />
                </Button>
              </span>
            </li>
          ))}
          {!editing && !full && (
            <li className="ts-card ts-new">
              <button type="button" onClick={() => open({ id: null, name: `Mijn design ${saved.length + 1}`, data: BLANK_DESIGN, base: null })}>
                <FarmIcon name="add" size={32} />
                <b>Nieuw design</b>
                <small className="muted">Begint blanco; je bestaande designs blijven zoals ze zijn</small>
              </button>
            </li>
          )}
        </ul>
      )}
      {(problem || create.isError || remove.isError) && <p className="form-error">{problem ?? errorMessage(create.error ?? remove.error)}</p>}

      {editing && (
        <DesignEditorPanel
          key={editing.id ?? 'nieuw'}
          subject={subject}
          target={target}
          editing={editing}
          wasInUse={!!editing.base && inUse(editing.base.data)}
          full={full}
          preview={preview}
          onSave={async (name, data, mode) => {
            const row = editing.id && mode !== 'nieuw' ? await update.mutateAsync({ id: editing.id, name, data }) : await create.mutateAsync({ name, data })
            if (mode === 'gebruiken' || (editing.base && inUse(editing.base.data))) await apply(data)
            writeDesignDraft(target, null)
            setBackup(null)
            setEditing({ id: row.id, name: row.name, data: row.data, base: { name: row.name, data: row.data } })
          }}
          onClose={() => {
            writeDesignDraft(target, null)
            setBackup(null)
            setEditing(null)
          }}
        />
      )}

      {sharing && <ShareDesign design={sharing} onClose={() => setSharing(null)} />}
      {publishing !== null && <ShareDesignDialog initial={publishing} onClose={() => setPublishing(null)} />}
      {importing && (
        <ImportDesign
          onClose={() => setImporting(false)}
          onImport={(data) => {
            setImporting(false)
            open({ id: null, name: 'Geïmporteerd design', data, base: null })
          }}
        />
      )}
    </section>
  )
}

/** For timing steps in the undo history (only called from event handlers). */
const clock = () => Date.now()

function DesignEditorPanel({
  subject,
  target,
  editing,
  wasInUse,
  full,
  preview,
  onSave,
  onClose,
}: {
  subject: 'profiel' | 'kudde'
  target: string
  editing: Editing
  wasInUse: boolean
  full: boolean
  preview: (d: ProfileColors) => ReactNode
  onSave: (name: string, data: ProfileColors, mode: 'opslaan' | 'gebruiken' | 'nieuw') => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(editing.name)
  const [history, setHistory] = useState<{ list: ProfileColors[]; at: number }>({ list: [editing.data], at: 0 })
  const draft = history.list[history.at]
  const [saving, setSaving] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const dirty = !editing.base || editing.base.name !== name.trim() || !sameLook(editing.base.data, draft)
  const lastAt = useRef(0)
  const change = (next: ProfileColors) => {
    const now = clock()
    const merge = now - lastAt.current < 600
    lastAt.current = now
    setHistory((h) => {
      const list = [...h.list.slice(0, merge && h.at > 0 ? h.at : h.at + 1), next].slice(-60)
      return { list, at: list.length - 1 }
    })
  }
  const undo = () => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))
  const redo = () => setHistory((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }))

  useEffect(() => {
    if (dirty) writeDesignDraft(target, { id: editing.id, name: name.trim(), data: draft, at: Date.now() })
  }, [dirty, draft, name, editing.id, target])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const save = async (mode: 'opslaan' | 'gebruiken' | 'nieuw') => {
    if (!name.trim()) return setProblem('Geef je design een naam.')
    setSaving(mode)
    setProblem(null)
    try {
      await onSave(name.trim(), draft, mode)
    } catch (e) {
      setProblem(errorMessage(e))
      throw e
    } finally {
      setSaving(null)
    }
  }
  useUnsavedChanges(dirty, { what: `je design “${name.trim() || 'zonder naam'}”`, save: () => save('opslaan') })

  return (
    <section className="ts-editor" aria-label="Design bewerken">
      <header className="ts-editor-hdr">
        <label className="ts-name">
          <small className="muted">Naam</small>
          <input className="text-box" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <span className="ts-undo">
          <Button onClick={undo} disabled={history.at === 0} title="Ongedaan maken (Ctrl+Z)">
            <FarmIcon name="arrow_undo" />
          </Button>
          <Button onClick={redo} disabled={history.at >= history.list.length - 1} title="Opnieuw (Ctrl+Y)">
            <FarmIcon name="arrow_redo" />
          </Button>
        </span>
        <span className={dirty ? 'ts-state dirty' : 'ts-state'}>{dirty ? 'Niet opgeslagen' : 'Opgeslagen'}</span>
      </header>

      <div className="custom-starters">
        <span className="muted">Begin met:</span>
        <button type="button" className="layout-chip" onClick={() => change({ ...BLANK_DESIGN, image: draft.image })}>
          <span className="mini-swatch" style={{ background: BLANK_DESIGN.background }} />
          Blanco
        </button>
        {Object.entries(PROFILE_PRESETS).map(([key, p]) => (
          <button key={key} type="button" className="layout-chip" onClick={() => change({ ...p.colors, image: draft.image })}>
            <span className="mini-swatch" style={{ background: patternCss(p.colors.pattern, p.colors.background, p.colors.background2, 0.3) }} />
            {p.name}
          </button>
        ))}
      </div>

      <DesignEditor value={draft} onChange={change} preview={preview} subject={subject} />

      <footer className="account-actions ts-editor-actions">
        {editing.id ? (
          <>
            {/* Nothing new to save: the button says so and can't be pressed (it can still be put to use) */}
            <Button
              variant="cta"
              onClick={() => void save(wasInUse ? 'opslaan' : 'gebruiken').catch(() => undefined)}
              disabled={!!saving || (wasInUse && !dirty)}
            >
              <FarmIcon name={!dirty && wasInUse ? 'accept' : 'diskette'} />{' '}
              {saving ? 'Opslaan…' : wasInUse ? (dirty ? 'Opslaan' : 'Opgeslagen') : dirty ? 'Opslaan en gebruiken' : 'Gebruiken'}
            </Button>
            {!wasInUse && (
              <Button onClick={() => void save('opslaan').catch(() => undefined)} disabled={!!saving || !dirty}>
                {dirty ? 'Alleen opslaan' : 'Opgeslagen'}
              </Button>
            )}
            <Button onClick={() => void save('nieuw').catch(() => undefined)} disabled={!!saving || full}>
              <FarmIcon name="page_white_put" /> Opslaan als nieuw
            </Button>
          </>
        ) : (
          <>
            <Button variant="cta" onClick={() => void save('gebruiken').catch(() => undefined)} disabled={!!saving || full}>
              <FarmIcon name="diskette" /> {saving ? 'Opslaan…' : 'Opslaan en gebruiken'}
            </Button>
            <Button onClick={() => void save('nieuw').catch(() => undefined)} disabled={!!saving || full}>
              Alleen opslaan
            </Button>
          </>
        )}
        <Button onClick={() => (!dirty || confirm('Stoppen zonder op te slaan? Je wijzigingen gaan verloren.')) && onClose()} disabled={!!saving}>
          {dirty ? 'Annuleren' : 'Sluiten'}
        </Button>
        {problem && <span className="form-error">{problem}</span>}
      </footer>
    </section>
  )
}

function ShareDesign({ design, onClose }: { design: SavedLook; onClose: () => void }) {
  const code = designCode(design.data)
  const [copied, setCopied] = useState(false)
  return (
    <Modal title={`"${design.name}" delen`} icon="link" onClose={onClose}>
      <p className="muted">Geef deze code aan iemand: die kan hem invoeren bij Mijn designs. Een achtergrondfoto gaat niet mee, die blijft van jou.</p>
      <textarea className="text-box ts-code" readOnly rows={4} value={code} onFocus={(e) => e.target.select()} />
      <div className="account-actions">
        <Button variant="cta" onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true))}>
          <FarmIcon name={copied ? 'tick' : 'page_white_put'} /> {copied ? 'Gekopieerd' : 'Kopieer de code'}
        </Button>
        <Button onClick={onClose}>Sluiten</Button>
      </div>
    </Modal>
  )
}

function ImportDesign({ onClose, onImport }: { onClose: () => void; onImport: (d: ProfileColors) => void }) {
  const [code, setCode] = useState('')
  const design = code.trim() ? readDesignCode(code) : null
  return (
    <Modal title="Een design invoeren" icon="page_white_code" onClose={onClose}>
      <p className="muted">Plak de code die je kreeg (hij begint met KUDDES-DESIGN:). Je kunt het design daarna nog aanpassen voor je het bewaart.</p>
      <textarea className="text-box ts-code" rows={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KUDDES-DESIGN:…" autoFocus />
      {code.trim() && !design && <p className="form-error">Dit is geen design-code.</p>}
      {design && (
        <div className="ts-import-preview">
          <DesignMini design={design} />
          <span className="muted">Zo ziet het eruit.</span>
        </div>
      )}
      <div className="account-actions">
        <Button variant="cta" disabled={!design} onClick={() => design && onImport(design)}>
          <FarmIcon name="pencil" /> Openen in de editor
        </Button>
        <Button onClick={onClose}>Annuleren</Button>
      </div>
    </Modal>
  )
}

