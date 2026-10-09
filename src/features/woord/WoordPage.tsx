import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DEFAULT_DOC_SETTINGS, DOC_TITLE_MAX, docSettings, type DocSettings, type DocumentFull, type DocumentItem } from '../../../shared/documents'
import { SMILEYS, smileyName } from '../../../shared/smileys'
import { SmileyPicker } from '../../components/social/SmileyPicker'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/compressImage'
import { usePhotos } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { useUnsavedChanges } from '../../lib/unsavedChanges'
import { usePageTitle } from '../../lib/usePageTitle'
import {
  CM,
  FONTS,
  MARGINS,
  WORDART,
  applyStyle,
  changeCase,
  clean,
  cleanPasted,
  countWords,
  currentBlock,
  exec,
  exportDocument,
  findNext,
  linkHtml,
  pageSize,
  printDocument,
  replaceAll,
  setFontSize,
  setLineHeight,
  styleOf,
  tableHtml,
  wordArtHtml,
} from './editor'
import { FileMenu, OpenDialog, TitleBar, ZoomBar } from '../office/Office'
import { DOCS_KEY, remember, remembered, useScheme } from '../office/officeFile'
import { Ribbon, type Dialog, type EditorApi, type FormatState, type RibbonTab } from './Ribbon'
import '../../components/social/SmileyPicker.css'
import './Woord.css'

const NEW_TITLE = 'Document1'

const EMPTY: FormatState = { bold: false, italic: false, underline: false, strike: false, sub: false, sup: false, ul: false, ol: false, align: 'left', font: 'Calibri', size: 11, style: 'standaard' }

/** /tools/woord (a new document) and /tools/woord/:id: loads the document, then the editor. */
export function WoordPage() {
  const { id } = useParams()
  const location = useLocation()
  const docId = id ? Number(id) : null
  const { data, isLoading, error } = useQuery({
    queryKey: [...DOCS_KEY, docId],
    queryFn: () => api<DocumentFull>(`/me/documents/${docId}`),
    enabled: docId !== null,
    // What's open is what you're editing; don't swap it underneath you
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  usePageTitle(`${data?.title ?? NEW_TITLE} - Kuddes Woord`)

  if (docId !== null && isLoading) return <main className="page page-con ofc-page muted">Document openen…</main>
  if (docId !== null && error)
    return (
      <main className="page page-con ofc-page">
        <p className="form-error">{errorMessage(error)}</p>
        <Link to="/tools/woord">Een nieuw document beginnen</Link>
      </main>
    )
  // A new mount for every document opened (also "Nieuw" while a new one is open)
  return <WoordApp key={location.key} doc={data ?? null} />
}

function WoordApp({ doc }: { doc: DocumentFull | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const app = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)

  const [docId, setDocId] = useState<number | null>(doc?.id ?? null)
  const [title, setTitle] = useState(doc?.title ?? NEW_TITLE)
  const [settings, setSettingsState] = useState<DocSettings>(doc ? docSettings(doc.settings) : DEFAULT_DOC_SETTINGS)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(doc?.updatedAt ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const [words, setWords] = useState(doc?.words ?? 0)
  const [pages, setPages] = useState({ at: 1, of: 1 })
  const [fmt, setFmt] = useState<FormatState>(EMPTY)
  const [tab, setTab] = useState<RibbonTab>('start')
  const [scheme, setScheme] = useScheme()
  const [zoom, setZoomState] = useState(() => Number(remembered('kuddes.woord.zoom', '100', ['50', '60', '70', '80', '90', '100', '110', '120', '130', '140', '150', '160', '170', '180', '190', '200'] as const)))
  const [ruler, setRulerState] = useState(() => remembered('kuddes.woord.liniaal', 'aan', ['aan', 'uit'] as const) === 'aan')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const painter = useRef<null | { bold: boolean; italic: boolean; underline: boolean; color: string; font: string; size: number }>(null)
  const [painterArmed, setPainterArmed] = useState(false)

  const docs = useQuery({ queryKey: DOCS_KEY, queryFn: () => api<DocumentItem[]>('/me/documents') })

  // The page's contents once, when it opens (afterwards the page itself holds them)
  useLayoutEffect(() => {
    const el = body.current!
    el.innerHTML = clean(doc?.html || '') || '<p><br></p>'
    exec('defaultParagraphSeparator', 'p')
    exec('styleWithCSS', 'true')
    el.focus()
  }, [doc])

  // On a phone the A4 page starts as wide as the screen (just for now, not remembered)
  useLayoutEffect(() => {
    const ws = workspace.current
    if (!ws || window.innerWidth > 760) return
    const fit = Math.floor(((ws.clientWidth - 20) / pageSize(settings).width) * 100)
    if (fit < zoom) setZoomState(Math.max(30, fit))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the document opens
  }, [])

  // ---------------------------------------------------------------- state of the page
  const measure = useCallback(() => {
    const el = body.current
    if (!el) return
    setWords(countWords(el.innerText))
    const sheet = el.parentElement!
    const height = pageSize(settings).height
    const of = Math.max(1, Math.ceil((sheet.offsetHeight - 2) / height))
    const sel = window.getSelection()
    let at = 1
    if (sel?.rangeCount && el.contains(sel.anchorNode)) {
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const top = sheet.getBoundingClientRect().top
      const scale = sheet.getBoundingClientRect().height / sheet.offsetHeight || 1
      if (rect.height || rect.top) at = Math.min(of, Math.max(1, Math.floor((rect.top - top) / scale / height) + 1))
    }
    setPages({ at, of })
  }, [settings])

  const readFormat = useCallback(() => {
    const el = body.current
    const sel = window.getSelection()
    if (!el || !sel?.rangeCount || !el.contains(sel.anchorNode)) return
    range.current = sel.getRangeAt(0).cloneRange()
    const q = (c: string) => {
      try {
        return document.queryCommandState(c)
      } catch {
        return false
      }
    }
    const node = sel.anchorNode instanceof HTMLElement ? sel.anchorNode : sel.anchorNode?.parentElement
    const cs = node ? getComputedStyle(node) : null
    const family = cs?.fontFamily.split(',')[0].replace(/["']/g, '').trim() ?? 'Calibri'
    const font = FONTS.find(([name, stack]) => name === family || stack.split(',')[0].replace(/["']/g, '').trim() === family)?.[0] ?? family
    setFmt({
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      strike: q('strikeThrough'),
      sub: q('subscript'),
      sup: q('superscript'),
      ul: q('insertUnorderedList'),
      ol: q('insertOrderedList'),
      align: q('justifyCenter') ? 'center' : q('justifyRight') ? 'right' : q('justifyFull') ? 'justify' : 'left',
      font,
      size: cs ? Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 : 11,
      style: styleOf(currentBlock(el)),
    })
    measure()
  }, [measure])

  useEffect(() => {
    document.addEventListener('selectionchange', readFormat)
    return () => document.removeEventListener('selectionchange', readFormat)
  }, [readFormat])
  useEffect(measure, [measure, settings, zoom])

  const changed = useCallback(() => {
    setDirty(true)
    setProblem(null)
    measure()
  }, [measure])

  /** Puts the selection back on the page (a list or a dialog may have taken it), then the change. */
  const run = useCallback(
    (change: () => void) => {
      const el = body.current!
      const sel = window.getSelection()
      if (range.current && (!sel?.rangeCount || !el.contains(sel.anchorNode))) {
        sel?.removeAllRanges()
        sel?.addRange(range.current)
      }
      el.focus({ preventScroll: true })
      change()
      changed()
      readFormat()
    },
    [changed, readFormat],
  )
  const insertHtml = useCallback((html: string) => run(() => exec('insertHTML', html)), [run])

  // ---------------------------------------------------------------- saving
  const saving = useRef(false)
  const save = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (saving.current) return
      saving.current = true
      const el = body.current!
      const payload = { title: title.trim() || NEW_TITLE, html: clean(el.innerHTML), settings, words: countWords(el.innerText) }
      try {
        const saved = docId
          ? await api<DocumentFull>(`/me/documents/${docId}`, { method: 'PATCH', body: payload })
          : await api<DocumentFull>('/me/documents', { method: 'POST', body: payload })
        if (!docId) {
          setDocId(saved.id)
          // The address of the document from now on, without opening it anew (that would lose the cursor and undo)
          window.history.replaceState(window.history.state, '', `/tools/woord/${saved.id}`)
        }
        queryClient.setQueryData([...DOCS_KEY, saved.id], saved)
        void queryClient.invalidateQueries({ queryKey: DOCS_KEY, exact: true })
        setSavedAt(saved.updatedAt)
        setDirty(false)
        setProblem(null)
      } catch (e) {
        setProblem(errorMessage(e))
        if (!opts.silent) throw e
      } finally {
        saving.current = false
      }
    },
    [docId, queryClient, settings, title],
  )
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  // Every 20 seconds while there's something new (a brand-new document only once something is typed)
  useEffect(() => {
    const t = setInterval(() => {
      if (dirty && (docId || countWords(body.current?.innerText ?? ''))) void saveRef.current({ silent: true })
    }, 20_000)
    return () => clearInterval(t)
  }, [dirty, docId])

  useUnsavedChanges(dirty, { what: `“${title}”`, save: () => save() })

  const setSettings = (s: Partial<DocSettings>) => {
    setSettingsState((cur) => ({ ...cur, ...s }))
    setDirty(true)
  }

  // ---------------------------------------------------------------- the ribbon's commands
  const insertImage = async (file: File) => {
    try {
      const small = await compressImage(file, 1400)
      if (small.size > 2.5 * 1024 * 1024) throw new Error('Deze afbeelding is te groot (max 2,5 MB). Kies een kleinere.')
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('De afbeelding kon niet worden gelezen.'))
        reader.readAsDataURL(small)
      })
      insertHtml(`<img src="${url}" alt="" style="max-width: 100%">`)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  const paste = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        if (item.types.includes('text/html')) return insertHtml(cleanPasted(await (await item.getType('text/html')).text()))
        const image = item.types.find((t) => t.startsWith('image/'))
        if (image) return insertImage(new File([await item.getType(image)], 'plakken', { type: image }))
      }
      const text = await navigator.clipboard.readText()
      run(() => exec('insertText', text))
    } catch {
      setProblem('Je browser laat de knop Plakken niet toe. Gebruik Ctrl+V (op een Mac: Cmd+V).')
    }
  }

  const armPainter = () => {
    if (painterArmed) {
      painter.current = null
      setPainterArmed(false)
      return
    }
    const sel = window.getSelection()
    const node = sel?.anchorNode instanceof HTMLElement ? sel.anchorNode : sel?.anchorNode?.parentElement
    if (!node || !body.current?.contains(node)) return
    const cs = getComputedStyle(node)
    painter.current = {
      bold: Number(cs.fontWeight) >= 600,
      italic: cs.fontStyle === 'italic',
      underline: cs.textDecorationLine.includes('underline'),
      color: cs.color,
      font: cs.fontFamily,
      size: Math.round(parseFloat(cs.fontSize) * 0.75),
    }
    setPainterArmed(true)
  }
  const applyPainter = () => {
    const p = painter.current
    const sel = window.getSelection()
    if (!p || !sel || sel.isCollapsed) return
    run(() => {
      if (document.queryCommandState('bold') !== p.bold) exec('bold')
      if (document.queryCommandState('italic') !== p.italic) exec('italic')
      if (document.queryCommandState('underline') !== p.underline) exec('underline')
      exec('foreColor', p.color)
      exec('fontName', p.font)
      setFontSize(body.current!, p.size)
    })
    painter.current = null
    setPainterArmed(false)
  }


  const setZoom = (z: number) => {
    const next = Math.min(200, Math.max(30, Math.round(z / 10) * 10))
    setZoomState(next)
    remember('kuddes.woord.zoom', String(next))
  }
  const setRuler = (on: boolean) => {
    setRulerState(on)
    remember('kuddes.woord.liniaal', on ? 'aan' : 'uit')
  }

  const ed: EditorApi = {
    state: fmt,
    run,
    command: (name, value) => run(() => exec(name, value)),
    insertHtml,
    setFont: (name) => run(() => exec('fontName', FONTS.find(([n]) => n === name)?.[1] ?? name)),
    setSize: (pt) => run(() => setFontSize(body.current!, pt)),
    setStyle: (key) => run(() => applyStyle(body.current!, key)),
    setLineHeight: (v) => run(() => setLineHeight(body.current!, v)),
    changeCase: (mode) => run(() => changeCase(mode)),
    formatPainter: { armed: painterArmed, arm: armPainter },
    insertTable: (r, c) => insertHtml(tableHtml(r, c)),
    insertImage: (f) => void insertImage(f),
    insertPageBreak: () => insertHtml('<hr class="kw-pagebreak"><p><br></p>'),
    insertDate: (format) =>
      run(() =>
        exec(
          'insertText',
          format === 'lang'
            ? new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
            : format === 'kort'
              ? new Date().toLocaleDateString('nl-NL')
              : new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        ),
      ),
    paste: () => void paste(),
    open: setDialog,
    settings,
    setSettings,
    zoom,
    setZoom,
    fitWidth: () => {
      const width = (workspace.current?.clientWidth ?? 900) - 60
      setZoom((width / pageSize(settings).width) * 100)
    },
    ruler,
    setRuler,
    scheme,
    setScheme,
    fullscreen: () => void (document.fullscreenElement ? document.exitFullscreen() : app.current?.requestFullscreen()),
  }

  // ---------------------------------------------------------------- keys
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return
    const k = e.key.toLowerCase()
    const take = (f: () => void) => {
      e.preventDefault()
      f()
    }
    if (k === 's') take(() => void save().catch(() => undefined))
    else if (k === 'p') take(() => printDocument(title, body.current!, settings))
    else if (k === 'f') take(() => setDialog('zoeken'))
    else if (k === 'h') take(() => setDialog('vervangen'))
    else if (k === 'k') take(() => setDialog('link'))
    else if (k === 'e') take(() => ed.command('justifyCenter'))
    else if (k === 'l') take(() => ed.command('justifyLeft'))
    else if (k === 'r') take(() => ed.command('justifyRight'))
    else if (k === 'j') take(() => ed.command('justifyFull'))
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const image = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (image) {
      e.preventDefault()
      void insertImage(image)
      return
    }
    const html = e.clipboardData.getData('text/html')
    if (html) {
      e.preventDefault()
      insertHtml(cleanPasted(html))
    }
  }

  // ---------------------------------------------------------------- the file menu (Office button)
  const remove = useMutation({
    mutationFn: () => api<void>(`/me/documents/${docId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDirty(false)
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY })
      navigate('/tools/woord', { replace: true })
    },
  })
  const saveAs = async () => {
    const name = prompt('Opslaan als:', `${title} (kopie)`.slice(0, DOC_TITLE_MAX))
    if (!name?.trim()) return
    const el = body.current!
    try {
      const copy = await api<DocumentFull>('/me/documents', { method: 'POST', body: { title: name.trim(), html: clean(el.innerHTML), settings, words: countWords(el.innerText) } })
      void queryClient.invalidateQueries({ queryKey: DOCS_KEY })
      setDirty(false)
      navigate(`/tools/woord/${copy.id}`)
    } catch (e) {
      setProblem(errorMessage(e))
    }
  }

  const size = pageSize(settings)
  const margin = MARGINS[settings.margins]
  const sheetStyle = {
    '--ofc-page-w': `${size.width}px`,
    '--ofc-page-h': `${size.height}px`,
    '--ofc-pad-y': `${margin.top * CM}px`,
    '--ofc-pad-x': `${margin.side * CM}px`,
    '--ofc-page-color': settings.pageColor,
  } as CSSProperties

  return (
    <main className="page ofc-page">
      <div ref={app} className="ofc-app" data-scheme={scheme}>
        <TitleBar
          kind="woord"
          title={title}
          onRename={(t) => {
            setTitle(t)
            setDirty(true)
          }}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: () => void save().catch(() => undefined) },
            { icon: 'arrow_undo', title: 'Ongedaan maken (Ctrl+Z)', onClick: () => ed.command('undo') },
            { icon: 'arrow_redo', title: 'Opnieuw (Ctrl+Y)', onClick: () => ed.command('redo') },
            { icon: 'printer', title: 'Afdrukken (Ctrl+P)', onClick: () => printDocument(title, body.current!, settings) },
          ]}
        />

        {orb && (
          <FileMenu
            kind="woord"
            docs={docs.data ?? []}
            currentId={docId}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={() => void save().catch(() => undefined)}
            onSaveAs={() => void saveAs()}
            exports={[
              { key: 'doc', icon: 'file_extension_doc', name: 'Word-document', hint: 'Opent in Microsoft Word, LibreOffice en Pages.', onClick: () => exportDocument('doc', title, body.current!, settings) },
              { key: 'html', icon: 'file_extension_html', name: 'Webpagina', hint: 'Een HTML-bestand voor in je browser of op een website.', onClick: () => exportDocument('html', title, body.current!, settings) },
              { key: 'txt', icon: 'file_extension_txt', name: 'Platte tekst', hint: 'Alleen de tekst, zonder opmaak.', onClick: () => exportDocument('txt', title, body.current!, settings) },
            ]}
            onPrint={() => printDocument(title, body.current!, settings)}
            onDelete={docId ? () => confirm(`“${title}” verwijderen? Dit kan niet ongedaan worden gemaakt.`) && remove.mutate() : null}
          />
        )}

        <Ribbon tab={tab} onTab={setTab} ed={ed} />

        <div className="ofc-workspace" ref={workspace}>
          <div className="ofc-zoom" style={{ zoom: zoom / 100, ...sheetStyle }}>
            {ruler && (
              <div className="ofc-ruler" aria-hidden="true">
                <span className="ofc-ruler-scale" />
              </div>
            )}
            <div className={painterArmed ? 'ofc-sheet painting' : 'ofc-sheet'}>
              <div
                ref={body}
                className={settings.columns > 1 ? `ofc-body cols-${settings.columns}` : 'ofc-body'}
                contentEditable
                suppressContentEditableWarning
                spellCheck
                lang="nl"
                role="textbox"
                aria-multiline="true"
                aria-label="Documenttekst"
                onInput={changed}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onMouseUp={applyPainter}
              />
            </div>
          </div>
          {(dialog === 'zoeken' || dialog === 'vervangen') && (
            <FindPanel replace={dialog === 'vervangen'} root={() => body.current!} onChanged={changed} onClose={() => setDialog(null)} onMode={(m) => setDialog(m)} />
          )}
        </div>

        <footer className="ofc-status">
          <span>
            Pagina: {pages.at} van {pages.of}
          </span>
          <span>Woorden: {words.toLocaleString('nl-NL')}</span>
          <span>Nederlands</span>
          <span className={problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {problem ?? (dirty ? 'Niet opgeslagen' : savedAt ? `Opgeslagen ${formatTime(savedAt)}` : 'Nieuw document')}
          </span>
          <ZoomBar zoom={zoom} onZoom={setZoom} />
        </footer>
      </div>

      {opening && <OpenDialog kind="woord" docs={docs.data ?? []} loading={docs.isLoading} onClose={() => setOpening(false)} />}
      {dialog === 'link' && (
        <LinkDialog
          initial={window.getSelection()?.toString() ?? ''}
          onClose={() => setDialog(null)}
          onInsert={(text, url) => {
            setDialog(null)
            insertHtml(linkHtml(text, url))
          }}
        />
      )}
      {dialog === 'wordart' && (
        <WordArtDialog
          onClose={() => setDialog(null)}
          onInsert={(text, key) => {
            setDialog(null)
            insertHtml(wordArtHtml(text, key))
          }}
        />
      )}
      {dialog === 'fotos' && (
        <PhotosDialog
          onClose={() => setDialog(null)}
          onPick={(url) => {
            setDialog(null)
            insertHtml(`<img src="${url}" alt="" style="max-width: 100%">`)
          }}
        />
      )}
      {dialog === 'smiley' && (
        <Modal title="Smiley invoegen" icon="emotion_happy" onClose={() => setDialog(null)} wide>
          <SmileyPicker
            onPick={(code) => {
              const name = smileyName(code)
              if (!name) return
              const [w, h] = SMILEYS[name]
              setDialog(null)
              insertHtml(`<img class="smiley" src="/smileys/${name}.gif" width="${w}" height="${h}" alt=":${name}:">&nbsp;`)
            }}
          />
        </Modal>
      )}
    </main>
  )
}

/** Zoeken en vervangen: a small panel in the corner, as in Word, so you can keep typing. */
function FindPanel({ replace, root, onChanged, onClose, onMode }: { replace: boolean; root: () => HTMLElement; onChanged: () => void; onClose: () => void; onMode: (m: 'zoeken' | 'vervangen') => void }) {
  const [needle, setNeedle] = useState(() => window.getSelection()?.toString().slice(0, 100) ?? '')
  const [by, setBy] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const next = () => setNote(findNext(root(), needle, matchCase) ? null : `“${needle}” is niet gevonden.`)
  const sel = () => window.getSelection()?.toString() ?? ''
  const same = (a: string, b: string) => (matchCase ? a === b : a.toLocaleLowerCase('nl') === b.toLocaleLowerCase('nl'))
  return (
    <div className="ofc-find" role="dialog" aria-label={replace ? 'Zoeken en vervangen' : 'Zoeken'} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="ofc-find-tabs">
        <button type="button" className={!replace ? 'on' : undefined} onClick={() => onMode('zoeken')}>
          Zoeken
        </button>
        <button type="button" className={replace ? 'on' : undefined} onClick={() => onMode('vervangen')}>
          Vervangen
        </button>
        <button type="button" className="ofc-find-x" onClick={onClose} aria-label="Sluiten">
          ×
        </button>
      </div>
      <label>
        Zoeken naar
        <input
          className="text-box"
          value={needle}
          autoFocus
          onChange={(e) => setNeedle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              next()
            }
          }}
        />
      </label>
      {replace && (
        <label>
          Vervangen door
          <input className="text-box" value={by} onChange={(e) => setBy(e.target.value)} />
        </label>
      )}
      <label className="ofc-check">
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Identieke hoofdletters/kleine letters
      </label>
      <div className="ofc-find-btns">
        {replace && (
          <>
            <Button
              onClick={() => {
                if (needle && same(sel(), needle)) {
                  document.execCommand('insertText', false, by)
                  onChanged()
                }
                next()
              }}
            >
              Vervangen
            </Button>
            <Button
              onClick={() => {
                const n = replaceAll(root(), needle, by, matchCase)
                if (n) onChanged()
                setNote(n ? `${n} ${n === 1 ? 'vervanging' : 'vervangingen'} uitgevoerd.` : `“${needle}” is niet gevonden.`)
              }}
            >
              Alles vervangen
            </Button>
          </>
        )}
        <Button variant="cta" onClick={next} disabled={!needle}>
          Volgende zoeken
        </Button>
      </div>
      {note && <p className="ofc-find-note">{note}</p>}
    </div>
  )
}

function LinkDialog({ initial, onClose, onInsert }: { initial: string; onClose: () => void; onInsert: (text: string, url: string) => void }) {
  const [text, setText] = useState(initial)
  const [url, setUrl] = useState('')
  return (
    <Modal title="Hyperlink invoegen" icon="link" onClose={onClose}>
      <form
        className="ofc-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (url.trim()) onInsert(text.trim(), url.trim())
        }}
      >
        <label>
          Weer te geven tekst
          <input className="text-box" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          Adres
          <input className="text-box" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoFocus inputMode="url" />
        </label>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!url.trim()}>
            Invoegen
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
        </div>
      </form>
    </Modal>
  )
}

function WordArtDialog({ onClose, onInsert }: { onClose: () => void; onInsert: (text: string, key: string) => void }) {
  const [text, setText] = useState('Uw tekst hier')
  const [key, setKey] = useState<string>(WORDART[0].key)
  return (
    <Modal title="WordArt" icon="text_dropcaps" onClose={onClose} wide>
      <div className="ofc-wordart-pick" role="radiogroup" aria-label="WordArt-stijl">
        {WORDART.map((w) => (
          <button key={w.key} type="button" role="radio" aria-checked={key === w.key} className={key === w.key ? 'on' : undefined} onClick={() => setKey(w.key)} title={w.name}>
            <span className={`kw-wordart ${w.key}`}>WordArt</span>
          </button>
        ))}
      </div>
      <form
        className="ofc-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) onInsert(text.trim(), key)
        }}
      >
        <label>
          Tekst
          <input className="text-box" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} autoFocus />
        </label>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!text.trim()}>
            Invoegen
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
        </div>
      </form>
    </Modal>
  )
}

function PhotosDialog({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const { user } = useAuth()
  const { data: photos = [], isLoading } = usePhotos(user!.username)
  return (
    <Modal title="Een foto uit je Foto's" icon="photos" onClose={onClose} wide>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : photos.length === 0 ? (
        <p className="empty">Je hebt nog geen foto's op Kuddes. Gebruik Afbeelding om er een van je computer in te voegen.</p>
      ) : (
        <ul className="ofc-photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p.url)} title={p.caption || 'Foto'}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
