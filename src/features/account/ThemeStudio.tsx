/**
 * "Kleuren van Kuddes" in Instellingen: the built-in themes, and "Mijn
 * thema's", your own, as cards with a small preview. Each can be used,
 * edited, copied, shared as a code or removed. The editor shows the theme on
 * the whole site while you work, has undo, checks readability, and keeps a
 * copy in this browser until it's saved (src/features/account/savedThemes.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { CUSTOM_THEME_KEY, MAX_SAVED_DESIGNS, mix, type CustomTheme } from '../../../shared/customization'
import { ThemeSettingsList } from '../../components/layout/ThemePicker'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import { applyCustomVars, applyTheme, useTheme } from '../../lib/theme'
import { useUnsavedChanges } from '../../lib/unsavedChanges'
import { BackgroundControls, ColorField, PatternPicker } from './Customization'
import { EffectPicker } from './EffectPicker'
import {
  BLANK_THEME,
  THEME_STARTERS,
  readDraft,
  readThemeCode,
  readability,
  sameTheme,
  themeCode,
  useSavedThemes,
  useThemeLibrary,
  writeDraft,
  type SavedTheme,
  type ThemeDraft,
} from './savedThemes'
import './ThemeStudio.css'
import { ShareDesignDialog } from '../designs/ShareDesignDialog'
import { ThemeMini } from './LookMinis'

/** For timing steps in the editor's undo history (only called from event handlers). */
const clock = () => Date.now()

type Editing = { id: number | null; name: string; data: CustomTheme; base: { name: string; data: CustomTheme } | null }

export function ThemeSettings() {
  const { theme, custom, saveCustom } = useTheme()
  const { data: saved = [], isLoading } = useSavedThemes()
  const { create, update, remove } = useThemeLibrary()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [backup, setBackup] = useState<ThemeDraft | null>(() => readDraft())
  const [sharing, setSharing] = useState<SavedTheme | null>(null)
  const [publishing, setPublishing] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inUse = (t: CustomTheme) => theme === CUSTOM_THEME_KEY && sameTheme(custom, t)
  // Your custom theme from before "Mijn thema's", not saved as one yet
  const loose = custom && !saved.some((s) => sameTheme(s.data, custom)) ? custom : null
  const full = saved.length >= MAX_SAVED_DESIGNS

  const open = (e: Editing) => {
    setProblem(null)
    setEditing(e)
  }
  const use = (t: CustomTheme) => saveCustom(t).catch((e) => setProblem(errorMessage(e)))

  return (
    <Box title="Kleuren van Kuddes" icon="palette">
      <p id="kleuren" className="settings-intro">
        Kies de kleuren van de hele site. Alleen jij ziet dit.
      </p>
      <ThemeSettingsList />

      <section id="eigen-thema" className="ts-library">
        <header className="ts-library-hdr">
          <h3>
            <FarmIcon name="color_wheel" /> Mijn thema’s <small className="muted">({saved.length}/{MAX_SAVED_DESIGNS})</small>
          </h3>
          <span className="ts-library-tools">
            <Button onClick={() => setImporting(true)} disabled={!!editing || full} title="Een thema van iemand anders, als code">
              <FarmIcon name="page_white_code" /> Code invoeren
            </Button>
          </span>
        </header>

        {backup && !editing && (
          <div className="form-notice ts-backup">
            <FarmIcon name="information" />
            <span>
              Je was op {formatTime(new Date(backup.at).toISOString())} bezig met <b>{backup.name || 'een thema'}</b> en dat is nog niet opgeslagen.
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
                writeDraft(null)
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
              <li className={`ts-card${inUse(loose) ? ' current' : ''}`}>
                <ThemeMini theme={loose} />
                <span className="ts-card-name">
                  <b>Eigen thema</b>
                  <small className="muted">nog niet bewaard</small>
                </span>
                <span className="ts-card-actions">
                  <Button variant="cta" onClick={() => create.mutate({ name: 'Mijn thema', data: loose })} disabled={create.isPending || full}>
                    <FarmIcon name="diskette" /> Bewaren
                  </Button>
                  <Button onClick={() => open({ id: null, name: 'Mijn thema', data: loose, base: null })} disabled={!!editing}>
                    <FarmIcon name="pencil" />
                  </Button>
                </span>
              </li>
            )}
            {saved.map((s) => (
              <li key={s.id} className={`ts-card${inUse(s.data) ? ' current' : ''}${editing?.id === s.id ? ' editing' : ''}`}>
                <button type="button" className="ts-card-pick" onClick={() => !inUse(s.data) && void use(s.data)} title={inUse(s.data) ? 'In gebruik' : `${s.name} gebruiken`}>
                  <ThemeMini theme={s.data} />
                </button>
                <span className="ts-card-name">
                  <b>{s.name}</b>
                  <small className="muted">{inUse(s.data) ? 'in gebruik' : `bewaard ${formatTime(s.updatedAt)}`}</small>
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
                  <Button onClick={() => confirm(`"${s.name}" verwijderen?`) && remove.mutate(s.id)} disabled={editing?.id === s.id} title="Verwijderen">
                    <FarmIcon name="bin" />
                  </Button>
                </span>
              </li>
            ))}
            {!editing && !full && (
              <li className="ts-card ts-new">
                <button type="button" onClick={() => open({ id: null, name: `Mijn thema ${saved.length + 1}`, data: BLANK_THEME, base: null })}>
                  <FarmIcon name="add" size={32} />
                  <b>Nieuw thema</b>
                  <small className="muted">Begint blanco; je bestaande thema’s blijven zoals ze zijn</small>
                </button>
              </li>
            )}
          </ul>
        )}
        {(problem || create.isError || remove.isError) && <p className="form-error">{problem ?? errorMessage(create.error ?? remove.error)}</p>}
      </section>

      {editing && (
        <ThemeEditor
          key={editing.id ?? 'nieuw'}
          editing={editing}
          wasInUse={!!editing.base && inUse(editing.base.data)}
          full={full}
          onSave={async (name, data, mode) => {
            // Save over the one you're editing, or as a new one; then perhaps use it
            const row = editing.id && mode !== 'nieuw' ? await update.mutateAsync({ id: editing.id, name, data }) : await create.mutateAsync({ name, data })
            if (mode === 'gebruiken' || (editing.base && inUse(editing.base.data))) await saveCustom(data)
            writeDraft(null)
            setBackup(null)
            setEditing({ id: row.id, name: row.name, data: row.data, base: { name: row.name, data: row.data } })
          }}
          onClose={() => {
            writeDraft(null)
            setBackup(null)
            setEditing(null)
            // The preview goes; the theme that's really in use comes back
            applyTheme(theme, custom)
          }}
        />
      )}

      {sharing && <ShareDialog theme={sharing} onClose={() => setSharing(null)} />}
      {publishing !== null && <ShareDesignDialog initial={publishing} onClose={() => setPublishing(null)} />}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImport={(data) => {
            setImporting(false)
            open({ id: null, name: 'Geïmporteerd thema', data, base: null })
          }}
        />
      )}
    </Box>
  )
}

type Section = 'kleuren' | 'patronen' | 'achtergrond' | 'animatie' | 'voorbeelden'
const SECTIONS: [Section, string][] = [
  ['kleuren', 'Kleuren'],
  ['patronen', 'Patronen'],
  ['achtergrond', 'Achtergrond & boxen'],
  ['animatie', 'Animatie'],
  ['voorbeelden', 'Begin met…'],
]

function ThemeEditor({
  editing,
  wasInUse,
  full,
  onSave,
  onClose,
}: {
  editing: Editing
  wasInUse: boolean
  full: boolean
  onSave: (name: string, data: CustomTheme, mode: 'opslaan' | 'gebruiken' | 'nieuw') => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState(editing.name)
  const [history, setHistory] = useState<{ list: CustomTheme[]; at: number }>({ list: [editing.data], at: 0 })
  const draft = history.list[history.at]
  const [section, setSection] = useState<Section>('kleuren')
  const [sitePreview, setSitePreview] = useState(true)
  const [saving, setSaving] = useState<'opslaan' | 'gebruiken' | 'nieuw' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const dirty = !editing.base || editing.base.name !== name.trim() || !sameTheme(editing.base.data, draft)

  // Every change is a step you can undo; quick steps in a row (dragging a colour) count as one
  const lastAt = useRef(0)
  const change = (next: CustomTheme) => {
    const now = clock()
    const merge = now - lastAt.current < 600
    lastAt.current = now
    setHistory((h) => {
      const list = [...h.list.slice(0, merge && h.at > 0 ? h.at : h.at + 1), next].slice(-60)
      return { list, at: list.length - 1 }
    })
  }
  const set = <K extends keyof CustomTheme>(key: K) => (value: CustomTheme[K]) => change({ ...draft, [key]: value })
  const undo = () => setHistory((h) => ({ ...h, at: Math.max(0, h.at - 1) }))
  const redo = () => setHistory((h) => ({ ...h, at: Math.min(h.list.length - 1, h.at + 1) }))

  // The whole site in the draft while editing (or not, to compare)
  const { theme, custom } = useTheme()
  useEffect(() => {
    if (sitePreview) {
      document.documentElement.dataset.theme = CUSTOM_THEME_KEY
      applyCustomVars(draft)
    } else applyTheme(theme, custom)
  }, [draft, sitePreview, theme, custom])
  useEffect(() => () => applyTheme(theme, custom), [theme, custom])

  // A copy in this browser until it's saved
  useEffect(() => {
    if (dirty) writeDraft({ id: editing.id, name: name.trim(), data: draft, at: Date.now() })
  }, [dirty, draft, name, editing.id])

  // Ctrl+Z / Ctrl+Y (not while typing the name)
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
    if (!name.trim()) return setProblem('Geef je thema een naam.')
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
  useUnsavedChanges(dirty, { what: `je thema “${name.trim() || 'zonder naam'}”`, save: () => save('opslaan') })

  const checks = readability(draft)
  return (
    <section className="ts-editor" aria-label="Thema bewerken">
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
        <label className="gadget-toggle ts-sitepreview">
          <input type="checkbox" checked={sitePreview} onChange={(e) => setSitePreview(e.target.checked)} /> Laat zien op de hele site
        </label>
        <span className={dirty ? 'ts-state dirty' : 'ts-state'}>{dirty ? 'Niet opgeslagen' : 'Opgeslagen'}</span>
      </header>

      <div className="ts-editor-body">
        <div className="ts-controls">
          <nav className="ts-tabs" aria-label="Onderdelen">
            {SECTIONS.map(([key, label]) => (
              <button key={key} type="button" className={section === key ? 'current' : undefined} aria-pressed={section === key} onClick={() => setSection(key)}>
                {label}
              </button>
            ))}
          </nav>

          {section === 'kleuren' && (
            <div className="ts-section">
              <div className="color-grid">
                <ColorField label="Hoofdkleur (bovenbalk, boxen)" value={draft.brand} onChange={set('brand')} />
                <ColorField label="Links" value={draft.link} onChange={set('link')} />
                <ColorField label="Knoppen" value={draft.button} onChange={set('button')} />
                <ColorField label="Achtergrond" value={draft.background} onChange={set('background')} />
              </div>
              <label className="gadget-toggle">
                <input type="checkbox" checked={draft.dark} onChange={(e) => set('dark')(e.target.checked)} /> Donkere boxen en lichte tekst
              </label>
            </div>
          )}
          {section === 'patronen' && (
            <div className="ts-section">
              <div className="pref-row theme-pattern">
                <span className="pref-label">Patroon op de achtergrond</span>
                <ColorField label="Patroonkleur" value={draft.patternColor ?? draft.brand} onChange={set('patternColor')} />
              </div>
              <PatternPicker value={draft.pattern ?? 'effen'} onChange={(p) => set('pattern')(p === 'standaard' ? undefined : p)} a={draft.background} b={draft.patternColor ?? draft.brand} overlay={draft.overlay} onOverlay={(o) => set('overlay')(o)} />
              <div className="pref-row theme-pattern">
                <span className="pref-label">Patroon in de bovenbalk</span>
                <ColorField label="Patroonkleur" value={draft.barPatternColor ?? mix(draft.brand, '#ffffff', 0.55)} onChange={set('barPatternColor')} />
              </div>
              <PatternPicker value={draft.barPattern ?? 'effen'} onChange={(p) => set('barPattern')(p === 'standaard' ? undefined : p)} a={draft.brand} b={draft.barPatternColor ?? mix(draft.brand, '#ffffff', 0.55)} overlay={draft.barOverlay} onOverlay={(o) => set('barOverlay')(o)} />
            </div>
          )}
          {section === 'achtergrond' && (
            <div className="ts-section">
              <BackgroundControls value={draft} onChange={change} />
            </div>
          )}
          {section === 'animatie' && (
            <div className="ts-section">
              <p className="muted">Iets dat beweegt op de achtergrond van de hele site, achter de boxen. Je ziet het meteen op de pagina.</p>
              <EffectPicker value={draft.effect} onChange={(effect) => set('effect')(effect ?? undefined)} />
            </div>
          )}
          {section === 'voorbeelden' && (
            <div className="ts-section">
              <p className="muted">Begin opnieuw met een van deze (je achtergrondfoto en boxen blijven). Met ongedaan maken ga je terug.</p>
              <ul className="ts-starters">
                {THEME_STARTERS.map((s) => (
                  <li key={s.name}>
                    <button type="button" onClick={() => change({ ...s.theme, image: draft.image, boxOpacity: draft.boxOpacity, boxBlur: draft.boxBlur })}>
                      <ThemeMini theme={s.theme} />
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="ts-side">
          <ThemeMini theme={draft} big />
          <ul className="ts-checks" aria-label="Leesbaarheid">
            {checks.map((c) => (
              <li key={c.label} className={c.ratio >= c.min ? 'ok' : 'bad'}>
                <FarmIcon name={c.ratio >= c.min ? 'tick' : 'cross'} /> {c.label}
                <small>{c.ratio.toFixed(1)}:1</small>
              </li>
            ))}
          </ul>
          {checks.some((c) => c.ratio < c.min) && <p className="muted ts-checks-hint">Met een rood kruisje is iets voor sommige mensen slecht te lezen. Kies dan een donkerdere of lichtere kleur.</p>}
        </aside>
      </div>

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
            <Button onClick={() => void save('nieuw').catch(() => undefined)} disabled={!!saving || full} title={full ? `Je hebt al ${MAX_SAVED_DESIGNS} thema's` : 'Bewaar dit als een nieuw thema; het oude blijft'}>
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

function ShareDialog({ theme, onClose }: { theme: SavedTheme; onClose: () => void }) {
  const code = themeCode(theme.data)
  const [copied, setCopied] = useState(false)
  return (
    <Modal title={`"${theme.name}" delen`} icon="link" onClose={onClose}>
      <p className="muted">Geef deze code aan iemand: die kan hem invoeren bij Mijn thema’s. Een achtergrondfoto gaat niet mee, die blijft van jou.</p>
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

function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (t: CustomTheme) => void }) {
  const [code, setCode] = useState('')
  const theme = code.trim() ? readThemeCode(code) : null
  return (
    <Modal title="Een thema invoeren" icon="page_white_code" onClose={onClose}>
      <p className="muted">Plak de code die je kreeg (hij begint met KUDDES-THEMA:). Je kunt het thema daarna nog aanpassen voor je het bewaart.</p>
      <textarea className="text-box ts-code" rows={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="KUDDES-THEMA:…" autoFocus />
      {code.trim() && !theme && <p className="form-error">Dit is geen thema-code.</p>}
      {theme && (
        <div className="ts-import-preview">
          <ThemeMini theme={theme} />
          <span className="muted">Zo ziet het eruit.</span>
        </div>
      )}
      <div className="account-actions">
        <Button variant="cta" disabled={!theme} onClick={() => theme && onImport(theme)}>
          <FarmIcon name="pencil" /> Openen in de editor
        </Button>
        <Button onClick={onClose}>Annuleren</Button>
      </div>
    </Modal>
  )
}
