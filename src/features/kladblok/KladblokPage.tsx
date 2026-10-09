import { useCallback, useRef, useState } from 'react'
import { NOTE_FONTS, type Note, type NoteFont } from '../../../shared/documents'
import { Big, FileMenu, Group, Menu, OfficeLoader, OpenDialog, RibbonTabs, SchemeGroup, Small, TitleBar, ZoomBar, Choices } from '../office/Office'
import { useOfficeFile, useScheme, type OfficeFile } from '../office/officeFile'
import './Kladblok.css'

const FONT_STACK: Record<NoteFont, string> = {
  consolas: 'Consolas, "DejaVu Sans Mono", monospace',
  lucida: '"Lucida Console", "Lucida Sans Typewriter", monospace',
  courier: '"Courier New", Courier, monospace',
  calibri: 'Calibri, Carlito, sans-serif',
  comic: '"Comic Sans MS", "Comic Neue", cursive',
}
const TABS = [
  ['start', 'Start'],
  ['beeld', 'Beeld'],
] as const

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Naamloos'}.txt`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const countWords = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

/** Kladblok (/tools/kladblok): plain text, as Notepad, with the Office window around it. */
export function KladblokPage() {
  return <OfficeLoader<Note> kind="kladblok">{(file) => <Kladblok file={file} />}</OfficeLoader>
}

function Kladblok({ file }: { file: OfficeFile<Note> | null }) {
  const [note, setNote] = useState<Note>(() => file?.content ?? { text: '', wrap: true, font: 'consolas', size: 11 })
  const noteRef = useRef(note)
  const snapshot = useCallback(
    () => ({
      content: noteRef.current,
      words: countWords(noteRef.current.text),
    }),
    [],
  )
  const doc = useOfficeFile<Note>('kladblok', file, snapshot)
  const [tab, setTab] = useState<'start' | 'beeld'>('start')
  const [scheme, setScheme] = useScheme()
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [status, setStatus] = useState(true)
  const [finding, setFinding] = useState<null | 'zoeken' | 'vervangen'>(null)
  const [needle, setNeedle] = useState('')
  const [by, setBy] = useState('')
  const [pos, setPos] = useState({ ln: 1, col: 1 })
  const [found, setFound] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const change = (next: Partial<Note>) => {
    noteRef.current = { ...noteRef.current, ...next }
    setNote(noteRef.current)
    doc.changed()
  }
  const where = () => {
    const t = area.current
    if (!t) return
    const before = t.value.slice(0, t.selectionStart)
    const lines = before.split('\n')
    setPos({ ln: lines.length, col: lines[lines.length - 1].length + 1 })
  }
  /** Put text where the cursor is (through the browser, so Ctrl+Z still undoes it). */
  const insert = (text: string) => {
    const t = area.current
    if (!t) return
    t.focus()
    if (!document.execCommand('insertText', false, text)) t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end')
    change({ text: t.value })
  }
  const stamp = () =>
    insert(
      new Date()
        .toLocaleString('nl-NL', {
          hour: '2-digit',
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
        .replace(',', ''),
    )
  const findNext = () => {
    const t = area.current
    if (!t || !needle) return
    const hay = t.value.toLocaleLowerCase('nl')
    const n = needle.toLocaleLowerCase('nl')
    let at = hay.indexOf(n, t.selectionEnd)
    if (at < 0) at = hay.indexOf(n)
    if (at < 0) return setFound(`“${needle}” is niet gevonden.`)
    setFound(null)
    t.focus()
    t.setSelectionRange(at, at + needle.length)
    // Scroll it into view: roughly, by line
    const line = t.value.slice(0, at).split('\n').length
    t.scrollTop = Math.max(0, (line - 5) * parseFloat(getComputedStyle(t).lineHeight || '16'))
    where()
  }
  const replaceAll = () => {
    if (!needle) return
    const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const n = (note.text.match(re) ?? []).length
    change({ text: note.text.replace(re, () => by) })
    setFound(n ? `${n} keer vervangen.` : `“${needle}” is niet gevonden.`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'F5') {
      e.preventDefault()
      stamp()
    } else if (ctrl && e.key.toLowerCase() === 's') {
      e.preventDefault()
      doc.save()
    } else if (ctrl && e.key.toLowerCase() === 'f') {
      e.preventDefault()
      setFinding('zoeken')
    } else if (ctrl && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      setFinding('vervangen')
    } else if (e.key === 'F3') {
      e.preventDefault()
      findNext()
    }
  }

  return (
    <main className="page ofc-page">
      <div className="ofc-app kbl-app" data-scheme={scheme} onKeyDown={onKeyDown}>
        <TitleBar
          kind="kladblok"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            { icon: 'date', title: 'Tijd en datum (F5)', onClick: stamp },
          ]}
        />
        {orb && (
          <FileMenu
            kind="kladblok"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={[
              {
                key: 'txt',
                icon: 'file_extension_txt',
                name: 'Tekstbestand (.txt)',
                hint: 'Voor elk programma.',
                onClick: () => download(doc.title, note.text),
              },
            ]}
            onPrint={() => {
              const w = window.open('', '_blank', 'width=800,height=700')
              if (!w) return
              const pre = w.document.createElement('pre')
              pre.textContent = note.text
              pre.style.cssText = `white-space:pre-wrap;font:${note.size}pt ${FONT_STACK[note.font]}`
              w.document.title = doc.title
              w.document.body.append(pre)
              setTimeout(() => w.print(), 300)
            }}
            onDelete={doc.remove}
          />
        )}
        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' ? (
              <>
                <Group label="Bewerken">
                  <div className="ofc-stack">
                    <Small icon="find" label="Zoeken" onClick={() => setFinding('zoeken')} title="Zoeken (Ctrl+F)" />
                    <Small icon="text_replace" label="Vervangen" onClick={() => setFinding('vervangen')} title="Vervangen (Ctrl+H)" />
                    <Small icon="table_select_all" label="Alles selecteren" onClick={() => area.current?.select()} />
                  </div>
                  <Big icon="date" label="Tijd/datum" onClick={stamp} title="Tijd en datum invoegen (F5)" />
                </Group>
                <Group label="Opmaak">
                  <div className="ofc-rows">
                    <div className="ofc-row">
                      <select className="ofc-select ofc-font" value={note.font} onChange={(e) => change({ font: e.target.value as NoteFont })} aria-label="Lettertype">
                        {(Object.keys(NOTE_FONTS) as NoteFont[]).map((k) => (
                          <option key={k} value={k} style={{ fontFamily: FONT_STACK[k] }}>
                            {NOTE_FONTS[k]}
                          </option>
                        ))}
                      </select>
                      <select className="ofc-select ofc-size" value={note.size} onChange={(e) => change({ size: Number(e.target.value) })} aria-label="Tekengrootte">
                        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="ofc-check">
                      <input type="checkbox" checked={note.wrap} onChange={(e) => change({ wrap: e.target.checked })} /> Automatische terugloop
                    </label>
                  </div>
                </Group>
              </>
            ) : (
              <>
                <Group label="Zoomen">
                  <Menu big icon="zoom" label="Zoomen" title="Zoomen">
                    {(close) => (
                      <Choices
                        items={[50, 75, 100, 125, 150, 200].map((z) => [z, `${z}%`] as const)}
                        value={zoom}
                        onPick={(z) => {
                          setZoom(z)
                          close()
                        }}
                      />
                    )}
                  </Menu>
                </Group>
                <Group label="Weergeven/verbergen">
                  <label className="ofc-check">
                    <input type="checkbox" checked={status} onChange={(e) => setStatus(e.target.checked)} /> Statusbalk
                  </label>
                </Group>
                <SchemeGroup scheme={scheme} onScheme={setScheme} />
              </>
            )}
          </div>
        </div>
        <div className="ofc-workspace kbl-workspace">
          <textarea
            ref={area}
            className="kbl-text"
            value={note.text}
            spellCheck={false}
            wrap={note.wrap ? 'soft' : 'off'}
            style={{
              fontFamily: FONT_STACK[note.font],
              fontSize: `${(note.size * zoom) / 100}pt`,
              whiteSpace: note.wrap ? 'pre-wrap' : 'pre',
            }}
            onChange={(e) => {
              change({ text: e.target.value })
              where()
            }}
            onSelect={where}
            onClick={where}
            onKeyUp={where}
            aria-label="Tekst"
            autoFocus
          />
          {finding && (
            <div className="kbl-find" role="dialog" aria-label={finding === 'zoeken' ? 'Zoeken' : 'Vervangen'} onKeyDown={(e) => e.key === 'Escape' && setFinding(null)}>
              <label>
                Zoeken naar
                <input
                  className="text-box"
                  autoFocus
                  value={needle}
                  onChange={(e) => setNeedle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      findNext()
                    }
                  }}
                />
              </label>
              {finding === 'vervangen' && (
                <label>
                  Vervangen door
                  <input className="text-box" value={by} onChange={(e) => setBy(e.target.value)} />
                </label>
              )}
              <div className="kbl-find-btns">
                <button type="button" className="btn" onClick={findNext} disabled={!needle}>
                  Volgende zoeken
                </button>
                {finding === 'vervangen' && (
                  <button type="button" className="btn" onClick={replaceAll} disabled={!needle}>
                    Alles vervangen
                  </button>
                )}
                <button type="button" className="btn" onClick={() => setFinding(null)}>
                  Sluiten
                </button>
              </div>
              {found && <p className="muted">{found}</p>}
            </div>
          )}
        </div>
        {status && (
          <footer className="ofc-status">
            <span>
              Ln {pos.ln}, Col {pos.col}
            </span>
            <span>{countWords(note.text).toLocaleString('nl-NL')} woorden</span>
            <span>UTF-8</span>
            <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
              {doc.status}
            </span>
            <ZoomBar zoom={zoom} onZoom={setZoom} min={50} max={200} />
          </footer>
        )}
      </div>
      {opening && <OpenDialog kind="kladblok" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}
