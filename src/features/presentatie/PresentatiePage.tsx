import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  IMAGE_SRC,
  MAX_ELEMENTS,
  MAX_SLIDES,
  SHAPES,
  SLIDE_H,
  SLIDE_THEMES,
  SLIDE_W,
  TRANSITIONS,
  type Presentation,
  type ShapeKind,
  type Slide,
  type SlideElement,
  type SlideThemeKey,
  type TextStyle,
  type Transition,
} from '../../../shared/documents'
import { SMILEYS, smileyName } from '../../../shared/smileys'
import { SmileyPicker } from '../../components/social/SmileyPicker'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/compressImage'
import { errorMessage } from '../../lib/api'
import { usePhotos } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'
import { Big, Choices, ColorGrid, FileMenu, Group, Menu, OpenDialog, RibbonTabs, Small, TitleBar, ZoomBar } from '../office/Office'
import { keep, useOfficeFile, useOfficeLoad, useScheme, type OfficeFile } from '../office/officeFile'
import { FONTS, SIZES } from '../woord/editor'
import { SlideView, type Handle, type SlideEditing } from './SlideView'
import { EMPTY_PRESENTATION, LAYOUTS, newId, newSlide, presentationHtml, printPresentation, type LayoutKey } from './slides'
import '../../components/social/SmileyPicker.css'
import './Presentatie.css'

type Tab = 'start' | 'invoegen' | 'ontwerp' | 'animaties' | 'voorstelling' | 'beeld'
const TABS = [
  ['start', 'Start'],
  ['invoegen', 'Invoegen'],
  ['ontwerp', 'Ontwerpen'],
  ['animaties', 'Animaties'],
  ['voorstelling', 'Diavoorstelling'],
  ['beeld', 'Beeld'],
] as const

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** /tools/presentatie (a new presentation) and /tools/presentatie/:id. */
export function PresentatiePage() {
  const { id } = useParams()
  const location = useLocation()
  const { data, isLoading, error } = useOfficeLoad<Presentation>('presentatie', id)
  usePageTitle(`${data?.title ?? 'Presentatie1'} - Kuddes Presentatie`)
  if (id && isLoading) return <main className="page page-con ofc-page muted">Presentatie openen…</main>
  if (id && error)
    return (
      <main className="page page-con ofc-page">
        <p className="form-error">{errorMessage(error)}</p>
        <Link to="/tools/presentatie">Een nieuwe presentatie beginnen</Link>
      </main>
    )
  return <PresentatieApp key={location.key} file={data ?? null} />
}

function PresentatieApp({ file }: { file: OfficeFile<Presentation> | null }) {
  const [pres, setPres] = useState<Presentation>(() => (file?.content?.slides?.length ? file.content : EMPTY_PRESENTATION()))
  // The presentation right now, for handlers and saving (every change sets it along with the state)
  const presRef = useRef(pres)
  const snapshot = useCallback(() => ({ content: presRef.current, words: presRef.current.slides.length }), [])
  const doc = useOfficeFile<Presentation>('presentatie', file, snapshot)

  const [tab, setTab] = useState<Tab>('start')
  const [scheme, setScheme] = useScheme()
  const [view, setView] = useState<'normaal' | 'sorteren'>('normaal')
  const [notes, setNotes] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [current, setCurrent] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [showing, setShowing] = useState<number | null>(null)
  // Full screen has to be asked for in the click or key itself (browsers refuse it later), so here and not in the slideshow
  const startShow = (from: number) => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined)
    setShowing(from)
  }
  const stopShow = useCallback(() => setShowing(null), [])
  const [dialog, setDialog] = useState<'fotos' | 'smiley' | null>(null)
  const [canvasW, setCanvasW] = useState(720)
  const history = useRef<{ past: Presentation[]; future: Presentation[] }>({ past: [], future: [] })
  const clipboard = useRef<SlideElement | null>(null)
  const app = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const slide = pres.slides[Math.min(current, pres.slides.length - 1)]
  const sel = slide.elements.find((e) => e.id === selected) ?? null
  const theme = SLIDE_THEMES[pres.theme]

  // The slide as wide as the space allows (times the zoom)
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const fit = () => {
      const w = el.clientWidth - 48
      const h = el.clientHeight - 40
      setCanvasW(Math.max(240, Math.min(w, (h * SLIDE_W) / SLIDE_H)))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, notes])
  const width = Math.round((canvasW * zoom) / 100)

  // ---------------------------------------------------------------- changes (with undo)
  const set = useCallback(
    (next: Presentation, record = true) => {
      if (record) {
        history.current.past.push(clone(presRef.current))
        if (history.current.past.length > 60) history.current.past.shift()
        history.current.future = []
      }
      presRef.current = next
      setPres(next)
      doc.changed()
    },
    [doc],
  )
  const updateSlide = (fn: (s: Slide) => Slide, record = true) => {
    const p = presRef.current
    const i = Math.min(current, p.slides.length - 1)
    set({ ...p, slides: p.slides.map((s, j) => (j === i ? fn(s) : s)) }, record)
  }
  const updateEl = (id: string, change: Partial<SlideElement>, record = true) => updateSlide((s) => ({ ...s, elements: s.elements.map((e) => (e.id === id ? { ...e, ...change } : e)) }), record)
  const styleSel = (change: Partial<TextStyle>) => sel && updateEl(sel.id, { style: { ...(sel.style ?? {}), ...change } })
  const undo = () => {
    const prev = history.current.past.pop()
    if (!prev) return
    history.current.future.push(clone(presRef.current))
    presRef.current = prev
    setPres(prev)
    doc.changed()
  }
  const redo = () => {
    const next = history.current.future.pop()
    if (!next) return
    history.current.past.push(clone(presRef.current))
    presRef.current = next
    setPres(next)
    doc.changed()
  }

  // ---------------------------------------------------------------- slides
  const goTo = (i: number) => {
    setCurrent(Math.max(0, Math.min(presRef.current.slides.length - 1, i)))
    setSelected(null)
    setEditing(null)
  }
  const addSlide = (layout: LayoutKey) => {
    const p = presRef.current
    if (p.slides.length >= MAX_SLIDES) return doc.setProblem(`Een presentatie kan maximaal ${MAX_SLIDES} dia’s hebben.`)
    const at = Math.min(current, p.slides.length - 1) + 1
    const slides = [...p.slides]
    slides.splice(at, 0, newSlide(layout))
    set({ ...p, slides })
    goTo(at)
  }
  const duplicateSlide = () => {
    const p = presRef.current
    if (p.slides.length >= MAX_SLIDES) return
    const copy = { ...clone(slide), id: newId(), elements: slide.elements.map((e) => ({ ...clone(e), id: newId() })) }
    const slides = [...p.slides]
    slides.splice(current + 1, 0, copy)
    set({ ...p, slides })
    goTo(current + 1)
  }
  const removeSlide = () => {
    const p = presRef.current
    if (p.slides.length < 2) return
    set({ ...p, slides: p.slides.filter((_, i) => i !== current) })
    goTo(Math.min(current, p.slides.length - 2))
  }
  const moveSlide = (from: number, to: number) => {
    const p = presRef.current
    if (from === to || to < 0 || to >= p.slides.length) return
    const slides = [...p.slides]
    const [s] = slides.splice(from, 1)
    slides.splice(to, 0, s)
    set({ ...p, slides })
    setCurrent(to)
  }

  // ---------------------------------------------------------------- elements
  const addElement = (el: Omit<SlideElement, 'id'>) => {
    if (slide.elements.length >= MAX_ELEMENTS) return doc.setProblem(`Er passen maximaal ${MAX_ELEMENTS} onderdelen op een dia.`)
    const full = { ...el, id: newId() }
    updateSlide((s) => ({ ...s, elements: [...s.elements, full] }))
    setSelected(full.id)
    return full
  }
  const addTextBox = () => {
    const el = addElement({ type: 'text', x: SLIDE_W / 2 - 220, y: SLIDE_H / 2 - 40, w: 440, h: 80, text: '', style: { size: 28 } })
    if (el) setEditing(el.id)
  }
  const addShape = (shape: ShapeKind) => addElement({ type: 'shape', shape, x: SLIDE_W / 2 - 110, y: SLIDE_H / 2 - 80, w: 220, h: 160, text: '', fill: theme.accent, line: '#385d8a', style: { size: 24 } })
  const addImage = (src: string, w: number, h: number) => {
    if (!IMAGE_SRC.test(src)) return doc.setProblem('Deze afbeelding kan hier niet in.')
    const k = Math.min(1, 600 / w, 400 / h)
    addElement({ type: 'image', src, x: Math.round((SLIDE_W - w * k) / 2), y: Math.round((SLIDE_H - h * k) / 2), w: Math.round(w * k), h: Math.round(h * k) })
  }
  const imageFile = async (f: File) => {
    try {
      const small = await compressImage(f, 1600)
      if (small.size > 2.5 * 1024 * 1024) throw new Error('Deze afbeelding is te groot (max 2,5 MB). Kies een kleinere.')
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = () => reject(new Error('De afbeelding kon niet worden gelezen.'))
        r.readAsDataURL(small)
      })
      const img = new Image()
      img.onload = () => addImage(url, img.naturalWidth, img.naturalHeight)
      img.src = url
    } catch (e) {
      doc.setProblem(errorMessage(e))
    }
  }
  const removeSelected = () => {
    if (!sel) return
    updateSlide((s) => ({ ...s, elements: s.elements.filter((e) => e.id !== sel.id) }))
    setSelected(null)
  }
  const reorder = (to: 'front' | 'back' | 'forward' | 'backward') => {
    if (!sel) return
    updateSlide((s) => {
      const els = s.elements.filter((e) => e.id !== sel.id)
      const i = s.elements.findIndex((e) => e.id === sel.id)
      const at = to === 'front' ? els.length : to === 'back' ? 0 : to === 'forward' ? Math.min(els.length, i + 1) : Math.max(0, i - 1)
      els.splice(at, 0, sel)
      return { ...s, elements: els }
    })
  }

  // ---------------------------------------------------------------- dragging and resizing
  const drag = useRef<{ id: string; handle: Handle; sx: number; sy: number; start: SlideElement; moved: boolean } | null>(null)
  const scale = width / SLIDE_W
  const editor: SlideEditing = {
    selected,
    editing,
    onPointerDown: (el, e, handle) => {
      if (e.button !== 0) return
      e.stopPropagation()
      if (editing === el.id) return
      setSelected(el.id)
      setEditing(null)
      drag.current = { id: el.id, handle, sx: e.clientX, sy: e.clientY, start: { ...el }, moved: false }
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    onEdit: (el) => {
      history.current.past.push(clone(presRef.current))
      setSelected(el.id)
      setEditing(el.id)
    },
    onText: (el, text) => updateEl(el.id, { text }, false),
    onDone: () => setEditing(null),
    onBackground: () => {
      setSelected(null)
      setEditing(null)
    },
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = (e.clientX - d.sx) / scale
      const dy = (e.clientY - d.sy) / scale
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return
      if (!d.moved) {
        history.current.past.push(clone(presRef.current))
        history.current.future = []
        d.moved = true
      }
      const s = d.start
      let { x, y, w, h } = s
      if (d.handle === 'move') {
        x = Math.round(s.x + dx)
        y = Math.round(s.y + dy)
      } else {
        if (d.handle.includes('e')) w = Math.max(20, Math.round(s.w + dx))
        if (d.handle.includes('s')) h = Math.max(20, Math.round(s.h + dy))
        if (d.handle.includes('w')) {
          w = Math.max(20, Math.round(s.w - dx))
          x = Math.round(s.x + s.w - w)
        }
        if (d.handle.includes('n')) {
          h = Math.max(20, Math.round(s.h - dy))
          y = Math.round(s.y + s.h - h)
        }
        // Pictures keep their shape from a corner
        if (s.type === 'image' && d.handle.length === 2) {
          const k = Math.max(w / s.w, h / s.h)
          w = Math.round(s.w * k)
          h = Math.round(s.h * k)
          if (d.handle.includes('w')) x = Math.round(s.x + s.w - w)
          if (d.handle.includes('n')) y = Math.round(s.y + s.h - h)
        }
      }
      updateEl(d.id, { x, y, w, h }, false)
    }
    const up = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })

  // ---------------------------------------------------------------- keys
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || (e.target as HTMLElement).closest('textarea, input, select')) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    const take = (f: () => void) => {
      e.preventDefault()
      f()
    }
    if (ctrl) {
      const l = k.toLowerCase()
      if (l === 'z') take(undo)
      else if (l === 'y') take(redo)
      else if (l === 's') take(doc.save)
      else if (l === 'p') take(() => printPresentation(doc.title, presRef.current))
      else if (l === 'm') take(() => addSlide('inhoud'))
      else if (l === 'c' && sel) take(() => (clipboard.current = clone(sel)))
      else if (l === 'v' && clipboard.current) take(() => addElement({ ...clone(clipboard.current!), x: clipboard.current!.x + 20, y: clipboard.current!.y + 20 }))
      else if (l === 'd' && sel) take(() => addElement({ ...clone(sel), x: sel.x + 20, y: sel.y + 20 }))
      return
    }
    if (k === 'F5') take(() => startShow(e.shiftKey ? current : 0))
    else if (sel && (k === 'Delete' || k === 'Backspace')) take(removeSelected)
    else if (sel && k === 'Enter' && sel.type !== 'image') take(() => editor.onEdit(sel))
    else if (sel && k.startsWith('Arrow')) {
      const step = e.shiftKey ? 20 : 4
      take(() => updateEl(sel.id, { x: sel.x + (k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0), y: sel.y + (k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0) }))
    } else if (!sel && (k === 'PageDown' || k === 'ArrowDown')) take(() => goTo(current + 1))
    else if (!sel && (k === 'PageUp' || k === 'ArrowUp')) take(() => goTo(current - 1))
    else if (k === 'Escape') take(() => setSelected(null))
  }

  const st = sel?.style ?? {}
  const exportHtml = () => {
    const html = presentationHtml(doc.title, presRef.current).replace(/src="\//g, `src="${location.origin}/`)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Presentatie'}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <main className="page ofc-page">
      <div ref={app} className="ofc-app ps-app" data-scheme={scheme} onKeyDown={onKeyDown}>
        <TitleBar
          kind="presentatie"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            { icon: 'arrow_undo', title: 'Ongedaan maken (Ctrl+Z)', onClick: undo },
            { icon: 'arrow_redo', title: 'Opnieuw (Ctrl+Y)', onClick: redo },
            { icon: 'control_play_blue', title: 'Diavoorstelling vanaf het begin (F5)', onClick: () => startShow(0) },
          ]}
        />
        {orb && (
          <FileMenu
            kind="presentatie"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={[{ key: 'html', icon: 'file_extension_html', name: 'Webpagina', hint: 'Speelt af in elke browser, ook zonder Kuddes: pijltjes om te bladeren.', onClick: exportHtml }]}
            onPrint={() => printPresentation(doc.title, presRef.current)}
            onDelete={doc.remove}
          />
        )}

        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' && (
              <>
                <Group label="Dia's">
                  <Menu big icon="slide_layout" label="Nieuwe dia" title="Nieuwe dia (Ctrl+M)">
                    {(close) => <Choices items={Object.entries(LAYOUTS) as [LayoutKey, string][]} onPick={(l) => (addSlide(l), close())} />}
                  </Menu>
                  <div className="ofc-stack">
                    <Small icon="page_white_copy" label="Dupliceren" onClick={duplicateSlide} />
                    <Small icon="slide_cut" label="Verwijderen" onClick={removeSlide} disabled={pres.slides.length < 2} />
                  </div>
                </Group>
                <Group label="Lettertype">
                  <div className="ofc-rows">
                    <div className="ofc-row">
                      <select
                        className="ofc-select ofc-font"
                        value={FONTS.find(([, stack]) => stack === st.font)?.[0] ?? ''}
                        onChange={(e) => styleSel({ font: FONTS.find(([n]) => n === e.target.value)?.[1] })}
                        disabled={!sel || sel.type === 'image'}
                        aria-label="Lettertype"
                      >
                        <option value="">Thema</option>
                        {FONTS.map(([name, stack]) => (
                          <option key={name} value={name} style={{ fontFamily: stack }}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <select className="ofc-select ofc-size" value={st.size ?? ''} onChange={(e) => styleSel({ size: Number(e.target.value) })} disabled={!sel || sel.type === 'image'} aria-label="Tekengrootte">
                        {!st.size && <option value="">–</option>}
                        {[...SIZES, 80, 96].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="ofc-row">
                      <Small icon="text_bold" onClick={() => styleSel({ bold: !st.bold })} active={!!st.bold} title="Vet" disabled={!sel} />
                      <Small icon="text_italic" onClick={() => styleSel({ italic: !st.italic })} active={!!st.italic} title="Cursief" disabled={!sel} />
                      <Small icon="text_underline" onClick={() => styleSel({ underline: !st.underline })} active={!!st.underline} title="Onderstrepen" disabled={!sel} />
                      <Menu icon="font_colors" title="Tekstkleur">
                        {(close) => <ColorGrid none="Themakleur" onPick={(c) => (styleSel({ color: c ?? undefined }), close())} />}
                      </Menu>
                    </div>
                  </div>
                </Group>
                <Group label="Alinea">
                  <div className="ofc-rows">
                    <div className="ofc-row">
                      <Small icon="text_list_bullets" onClick={() => styleSel({ bullets: !st.bullets })} active={!!st.bullets} title="Opsommingstekens" disabled={!sel || sel.type === 'image'} />
                    </div>
                    <div className="ofc-row">
                      <Small icon="text_align_left" onClick={() => styleSel({ align: 'left' })} active={st.align === 'left'} title="Links uitlijnen" disabled={!sel} />
                      <Small icon="text_align_center" onClick={() => styleSel({ align: 'center' })} active={st.align === 'center'} title="Centreren" disabled={!sel} />
                      <Small icon="text_align_right" onClick={() => styleSel({ align: 'right' })} active={st.align === 'right'} title="Rechts uitlijnen" disabled={!sel} />
                    </div>
                  </div>
                </Group>
                <Group label="Tekenen">
                  <Menu big icon="shape_square_add" label="Vormen" title="Vorm invoegen">
                    {(close) => <Choices items={Object.entries(SHAPES) as [ShapeKind, string][]} onPick={(s) => (addShape(s), close())} />}
                  </Menu>
                  <div className="ofc-stack">
                    <Menu icon="paintcan" label="Opvulling" title="Opvulkleur van de vorm">
                      {(close) => <ColorGrid onPick={(c) => (sel && c && updateEl(sel.id, { fill: c }), close())} />}
                    </Menu>
                    <Menu icon="draw_line" label="Omtrek" title="Lijnkleur van de vorm">
                      {(close) => <ColorGrid onPick={(c) => (sel && c && updateEl(sel.id, { line: c }), close())} />}
                    </Menu>
                  </div>
                </Group>
                <Group label="Schikken">
                  <div className="ofc-stack">
                    <Small icon="shape_move_front" label="Naar voorgrond" onClick={() => reorder('front')} disabled={!sel} />
                    <Small icon="shape_move_back" label="Naar achtergrond" onClick={() => reorder('back')} disabled={!sel} />
                    <Small icon="slide_cut" label="Verwijderen" onClick={removeSelected} disabled={!sel} title="Wat geselecteerd is verwijderen (Delete)" />
                  </div>
                </Group>
              </>
            )}
            {tab === 'invoegen' && (
              <>
                <Group label="Tekst">
                  <Big icon="textfield_add" label="Tekstvak" onClick={addTextBox} />
                </Group>
                <Group label="Illustraties">
                  <Big icon="picture" label="Afbeelding" onClick={() => fileInput.current?.click()} title="Een afbeelding van je computer" />
                  <Big icon="photos" label="Mijn foto's" onClick={() => setDialog('fotos')} />
                  <Big icon="emotion_happy" label="Smiley" onClick={() => setDialog('smiley')} />
                  <Menu big icon="shape_square_add" label="Vormen" title="Vorm invoegen">
                    {(close) => <Choices items={Object.entries(SHAPES) as [ShapeKind, string][]} onPick={(s) => (addShape(s), close())} />}
                  </Menu>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void imageFile(f)
                    }}
                  />
                </Group>
                <Group label="Dia's">
                  <Menu big icon="slide_layout" label="Nieuwe dia" title="Nieuwe dia">
                    {(close) => <Choices items={Object.entries(LAYOUTS) as [LayoutKey, string][]} onPick={(l) => (addSlide(l), close())} />}
                  </Menu>
                </Group>
              </>
            )}
            {tab === 'ontwerp' && (
              <>
                <Group label="Thema's" wide>
                  <div className="ps-themes">
                    {(Object.keys(SLIDE_THEMES) as SlideThemeKey[]).map((k) => {
                      const t = SLIDE_THEMES[k]
                      return (
                        <button key={k} type="button" className={pres.theme === k ? 'on' : undefined} onMouseDown={keep} onClick={() => set({ ...presRef.current, theme: k })} title={t.name}>
                          <span className="ps-theme-sample" style={{ background: `linear-gradient(135deg, ${t.bg} 55%, ${t.bg2})`, color: t.title, fontFamily: t.titleFont }}>
                            Aa
                            <i style={{ background: t.accent }} />
                          </span>
                          <small>{t.name}</small>
                        </button>
                      )
                    })}
                  </div>
                </Group>
                <Group label="Achtergrond">
                  <Menu big icon="color_swatches" label="Achtergrondkleur" title="Achtergrond van deze dia">
                    {(close) => <ColorGrid none="Van het thema" onPick={(c) => (updateSlide((s) => ({ ...s, background: c })), close())} />}
                  </Menu>
                </Group>
              </>
            )}
            {tab === 'animaties' && (
              <>
                <Group label="Overgang naar deze dia" wide>
                  <div className="ps-transitions">
                    {(Object.keys(TRANSITIONS) as Transition[]).map((k) => (
                      <button key={k} type="button" className={slide.transition === k ? 'on' : undefined} onMouseDown={keep} onClick={() => updateSlide((s) => ({ ...s, transition: k }))}>
                        <span className={`ps-tr-sample ${k}`} aria-hidden="true" />
                        <small>{TRANSITIONS[k]}</small>
                      </button>
                    ))}
                  </div>
                </Group>
                <Group label="Toepassen">
                  <Big icon="animation_transition_gallery" label="Op alle dia's" onClick={() => set({ ...presRef.current, slides: presRef.current.slides.map((s) => ({ ...s, transition: slide.transition })) })} title="Deze overgang op alle dia's" />
                </Group>
              </>
            )}
            {tab === 'voorstelling' && (
              <Group label="Diavoorstelling starten">
                <Big icon="control_play_blue" label="Vanaf het begin" onClick={() => startShow(0)} title="Vanaf het begin (F5)" />
                <Big icon="slideshow" label="Vanaf huidige dia" onClick={() => startShow(current)} title="Vanaf deze dia (Shift+F5)" />
              </Group>
            )}
            {tab === 'beeld' && (
              <>
                <Group label="Presentatieweergaven">
                  <Big icon="slide_normal_view" label="Normaal" onClick={() => setView('normaal')} active={view === 'normaal'} />
                  <Big icon="slide_sorter" label="Diasorteerder" onClick={() => setView('sorteren')} active={view === 'sorteren'} />
                </Group>
                <Group label="Weergeven/verbergen">
                  <label className="ofc-check">
                    <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> Notities
                  </label>
                </Group>
                <Group label="Zoomen">
                  <Big icon="zoom" label="Passend" onClick={() => setZoom(100)} title="Zo groot als het venster" />
                </Group>
                <Group label="Kleurenschema">
                  {(
                    [
                      ['blauw', 'Blauw'],
                      ['zilver', 'Zilver'],
                      ['zwart', 'Zwart'],
                    ] as const
                  ).map(([key, name]) => (
                    <button key={key} type="button" className={scheme === key ? 'ofc-scheme on' : 'ofc-scheme'} onMouseDown={keep} onClick={() => setScheme(key)}>
                      <span className={`ofc-scheme-swatch ${key}`} aria-hidden="true" />
                      {name}
                    </button>
                  ))}
                </Group>
              </>
            )}
          </div>
        </div>

        {view === 'normaal' ? (
          <div className="ps-main">
            <SlideList slides={pres.slides} theme={pres.theme} current={current} onPick={goTo} onMove={moveSlide} />
            <div className="ps-center">
              <div className="ofc-workspace ps-stage" ref={stage} tabIndex={-1} onPointerDown={(e) => e.target === e.currentTarget && editor.onBackground()}>
                <SlideView slide={slide} theme={pres.theme} width={width} edit={editor} className="ps-editing" />
              </div>
              {notes && (
                <textarea
                  className="ps-notes"
                  value={slide.notes}
                  placeholder="Klik om notities toe te voegen"
                  onFocus={() => history.current.past.push(clone(presRef.current))}
                  onChange={(e) => updateSlide((s) => ({ ...s, notes: e.target.value.slice(0, 5000) }), false)}
                  aria-label="Notities bij deze dia"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="ofc-workspace ps-sorter">
            {pres.slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={i === current ? 'ps-sort-item on' : 'ps-sort-item'}
                onClick={() => setCurrent(i)}
                onDoubleClick={() => {
                  setCurrent(i)
                  setView('normaal')
                }}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => moveSlide(Number(e.dataTransfer.getData('text/plain')), i)}
              >
                <SlideView slide={s} theme={pres.theme} width={220} />
                <span>{i + 1}</span>
              </button>
            ))}
          </div>
        )}

        <footer className="ofc-status">
          <span>
            Dia {Math.min(current, pres.slides.length - 1) + 1} van {pres.slides.length}
          </span>
          <span>“{theme.name}”</span>
          <span>Nederlands</span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.status}
          </span>
          <ZoomBar zoom={zoom} onZoom={setZoom} min={30} max={200} />
        </footer>
      </div>

      {showing !== null && <Slideshow pres={pres} start={showing} onClose={stopShow} />}
      {opening && <OpenDialog kind="presentatie" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
      {dialog === 'fotos' && (
        <PhotosDialog
          onClose={() => setDialog(null)}
          onPick={(url, w, h) => {
            setDialog(null)
            addImage(url, w, h)
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
              addImage(`/smileys/${name}.gif`, w * 3, h * 3)
            }}
          />
        </Modal>
      )}
    </main>
  )
}

/** The slides down the left, as in PowerPoint: click to open one, drag to move it. */
function SlideList({ slides, theme, current, onPick, onMove }: { slides: Slide[]; theme: SlideThemeKey; current: number; onPick: (i: number) => void; onMove: (from: number, to: number) => void }) {
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => {
    list.current?.children[current]?.scrollIntoView({ block: 'nearest' })
  }, [current])
  return (
    <ol className="ps-list" ref={list} aria-label="Dia's">
      {slides.map((s, i) => (
        <li key={s.id}>
          <span className="ps-num">{i + 1}</span>
          <button
            type="button"
            className={i === current ? 'on' : undefined}
            onClick={() => onPick(i)}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onMove(Number(e.dataTransfer.getData('text/plain')), i)}
            aria-label={`Dia ${i + 1}`}
            aria-current={i === current}
          >
            <SlideView slide={s} theme={theme} width={150} />
          </button>
        </li>
      ))}
    </ol>
  )
}

/** The slideshow: full screen, a slide at a time with its transition; a click, the arrows or space to go on, Esc to stop. */
function Slideshow({ pres, start, onClose }: { pres: Presentation; start: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [i, setI] = useState(start)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const end = i >= pres.slides.length
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  // Once, for as long as it runs: it fills the screen (full screen was asked for when it started); leaving full screen (Esc) ends it
  useEffect(() => {
    box.current?.focus()
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    const changed = () => {
      resize()
      if (!document.fullscreenElement) close.current()
    }
    window.addEventListener('resize', resize)
    document.addEventListener('fullscreenchange', changed)
    return () => {
      window.removeEventListener('resize', resize)
      document.removeEventListener('fullscreenchange', changed)
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    }
  }, [])
  const next = () => (end ? onClose() : setI((x) => x + 1))
  const prev = () => setI((x) => Math.max(0, x - 1))
  const width = Math.min(size.w, (size.h * SLIDE_W) / SLIDE_H)
  return (
    <div
      ref={box}
      className="ps-show"
      tabIndex={-1}
      role="dialog"
      aria-label="Diavoorstelling"
      onClick={next}
      onContextMenu={(e) => {
        e.preventDefault()
        prev()
      }}
      onKeyDown={(e) => {
        if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(e.key)) next()
        else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p'].includes(e.key)) prev()
        else if (e.key === 'Escape') onClose()
        else if (e.key === 'Home') setI(0)
        else if (e.key === 'End') setI(pres.slides.length - 1)
        else return
        e.preventDefault()
      }}
    >
      {end ? (
        <p className="ps-show-end">Einde van de diavoorstelling. Klik om af te sluiten.</p>
      ) : (
        <div key={i} className={`ps-show-slide tr-${pres.slides[i].transition}`}>
          <SlideView slide={pres.slides[i]} theme={pres.theme} width={width} />
        </div>
      )}
    </div>
  )
}

function PhotosDialog({ onClose, onPick }: { onClose: () => void; onPick: (url: string, w: number, h: number) => void }) {
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
              <button type="button" onClick={() => onPick(p.url, p.width, p.height)} title={p.caption || 'Foto'}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
