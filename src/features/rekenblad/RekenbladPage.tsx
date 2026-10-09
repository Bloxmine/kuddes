import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import {
  EMPTY_WORKBOOK,
  MAX_CHARTS,
  MAX_SHEETS,
  NUMBER_FORMATS,
  SHEET_COLS,
  SHEET_ROWS,
  emptySheet,
  type CellFormat,
  type ChartType,
  type NumberFormat,
  type Sheet,
  type SheetChart,
  type Workbook,
} from '../../../shared/documents'
import { errorMessage } from '../../lib/api'
import { usePageTitle } from '../../lib/usePageTitle'
import { Big, Choices, ColorGrid, FileMenu, Group, Menu, OpenDialog, RibbonTabs, Small, TitleBar, ZoomBar } from '../office/Office'
import { keep, remember, remembered, useOfficeFile, useOfficeLoad, useScheme, type OfficeFile } from '../office/officeFile'
import { ChartView } from './Chart'
import {
  FUNCTION_LIST,
  addr,
  cellsIn,
  colName,
  computeSheet,
  formatValue,
  formulaOk,
  isError,
  literal,
  parseAddr,
  rectName,
  rectOf,
  shiftFormula,
  suggestedFormat,
  type Pos,
  type Rect,
  type Value,
} from './formula'
import { chartData, sheetCsv, sheetTable, sortRows, usedRect, workbookXml } from './sheet'
import './Rekenblad.css'

const COLS = Array.from({ length: SHEET_COLS }, (_, c) => c)
const ROWS = Array.from({ length: SHEET_ROWS }, (_, r) => r)
const DEFAULT_WIDTH = 80
const ROW_HEIGHT = 20

type Tab = 'start' | 'invoegen' | 'formules' | 'beeld'
const TABS = [
  ['start', 'Start'],
  ['invoegen', 'Invoegen'],
  ['formules', 'Formules'],
  ['beeld', 'Beeld'],
] as const

type Editing = { text: string; mode: 'enter' | 'edit' }
type Clip = { rect: Rect; cells: (string | undefined)[][]; formats: (CellFormat | undefined)[][]; text: string; cut: boolean }

const clone = (wb: Workbook): Workbook => JSON.parse(JSON.stringify(wb))
const download = (name: string, type: string, data: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Map'}.${ext}`

/** /tools/rekenblad (a new workbook) and /tools/rekenblad/:id. */
export function RekenbladPage() {
  const { id } = useParams()
  const location = useLocation()
  const { data, isLoading, error } = useOfficeLoad<Workbook>('rekenblad', id)
  usePageTitle(`${data?.title ?? 'Map1'} - Kuddes Rekenblad`)
  if (id && isLoading) return <main className="page page-con ofc-page muted">Werkmap openen…</main>
  if (id && error)
    return (
      <main className="page page-con ofc-page">
        <p className="form-error">{errorMessage(error)}</p>
        <Link to="/tools/rekenblad">Een nieuwe werkmap beginnen</Link>
      </main>
    )
  return <RekenbladApp key={location.key} file={data ?? null} />
}

function RekenbladApp({ file }: { file: OfficeFile<Workbook> | null }) {
  const [wb, setWb] = useState<Workbook>(() => (file?.content?.sheets?.length ? file.content : clone(EMPTY_WORKBOOK)))
  // The workbook right now, for handlers and saving (every change sets it along with the state)
  const wbRef = useRef(wb)
  const snapshot = useCallback(() => {
    const w = wbRef.current
    return { content: w, words: w.sheets.reduce((n, s) => n + Object.values(s.cells).filter((v) => v !== '').length, 0) }
  }, [])
  const doc = useOfficeFile<Workbook>('rekenblad', file, snapshot)

  const [tab, setTab] = useState<Tab>('start')
  const [scheme, setScheme] = useScheme()
  const [zoom, setZoomState] = useState(() => Number(remembered('kuddes.rekenblad.zoom', '100', ['50', '60', '70', '80', '90', '100', '110', '120', '130', '140', '150', '160', '170', '180', '190', '200'])))
  const [gridlines, setGridlines] = useState(true)
  const [headings, setHeadings] = useState(true)
  const [showFormulas, setShowFormulas] = useState(false)
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [sel, setSel] = useState<{ a: Pos; f: Pos }>({ a: { c: 0, r: 0 }, f: { c: 0, r: 0 } })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [chartSel, setChartSel] = useState<string | null>(null)
  const [fillTo, setFillTo] = useState<Pos | null>(null)
  const history = useRef<{ past: Workbook[]; future: Workbook[] }>({ past: [], future: [] })
  const clip = useRef<Clip | null>(null)
  const dragging = useRef<'select' | 'fill' | null>(null)
  // Where the fill handle is dragged to (also in a ref: the last cell entered may not have rendered yet when the button goes up)
  const fillTarget = useRef<Pos | null>(null)
  const app = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const zoomBox = useRef<HTMLDivElement>(null)
  const barInput = useRef<HTMLInputElement>(null)

  const sheet = wb.sheets[wb.active] ?? wb.sheets[0]
  const values = useMemo(() => computeSheet(sheet.cells), [sheet.cells])
  const rect = rectOf(sel.a, sel.f)
  const active = sel.a
  const activeKey = addr(active.c, active.r)
  const width = (c: number) => sheet.widths[colName(c)] ?? DEFAULT_WIDTH

  // ---------------------------------------------------------------- changing the workbook (with undo)
  const commit = useCallback(
    (next: Workbook) => {
      history.current.past.push(clone(wbRef.current))
      if (history.current.past.length > 60) history.current.past.shift()
      history.current.future = []
      wbRef.current = next
      setWb(next)
      doc.changed()
    },
    [doc],
  )
  const updateSheet = useCallback(
    (fn: (s: Sheet) => Sheet) => {
      const w = wbRef.current
      const sheets = w.sheets.map((s, i) => (i === w.active ? fn(s) : s))
      commit({ ...w, sheets })
    },
    [commit],
  )
  const undo = () => {
    const prev = history.current.past.pop()
    if (!prev) return
    history.current.future.push(clone(wbRef.current))
    wbRef.current = prev
    setWb(prev)
    doc.changed()
  }
  const redo = () => {
    const next = history.current.future.pop()
    if (!next) return
    history.current.past.push(clone(wbRef.current))
    wbRef.current = next
    setWb(next)
    doc.changed()
  }

  const setCells = (changes: Record<string, string | undefined>, formatChanges?: Record<string, CellFormat | undefined>) =>
    updateSheet((s) => {
      const cells = { ...s.cells }
      const formats = { ...s.formats }
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined || v === '') delete cells[k]
        else cells[k] = v
      }
      for (const [k, f] of Object.entries(formatChanges ?? {})) {
        if (!f || Object.keys(f).length === 0) delete formats[k]
        else formats[k] = f
      }
      return { ...s, cells, formats }
    })

  const formatSel = (fn: (f: CellFormat) => CellFormat) => {
    const changes: Record<string, CellFormat | undefined> = {}
    for (const { c, r } of cellsIn(rect)) {
      const k = addr(c, r)
      const next = fn({ ...(sheet.formats[k] ?? {}) })
      for (const key of Object.keys(next) as (keyof CellFormat)[]) if (next[key] === undefined || next[key] === false) delete next[key]
      changes[k] = next
    }
    setCells({}, changes)
  }
  const fmt = sheet.formats[activeKey] ?? {}
  const toggle = (key: 'b' | 'i' | 'u' | 'border') => {
    const on = !fmt[key]
    formatSel((f) => ({ ...f, [key]: on }))
  }

  // ---------------------------------------------------------------- moving around
  const focusGrid = () => grid.current?.focus({ preventScroll: true })
  const select = (a: Pos, f: Pos = a) => {
    setSel({ a, f })
    setChartSel(null)
  }
  const clamp = (p: Pos): Pos => ({ c: Math.max(0, Math.min(SHEET_COLS - 1, p.c)), r: Math.max(0, Math.min(SHEET_ROWS - 1, p.r)) })
  const move = (dc: number, dr: number, extend = false) => {
    if (extend) setSel((s) => ({ a: s.a, f: clamp({ c: s.f.c + dc, r: s.f.r + dr }) }))
    else {
      const p = clamp({ c: active.c + dc, r: active.r + dr })
      select(p)
    }
  }
  // Keep the moving end in view
  useEffect(() => {
    const el = grid.current?.querySelector<HTMLElement>(`[data-cell="${addr(sel.f.c, sel.f.r)}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [sel.f])

  // ---------------------------------------------------------------- editing a cell
  const startEdit = (text: string, mode: Editing['mode']) => setEditing({ text, mode })
  const finishEdit = (dc: number, dr: number) => {
    if (!editing) return
    let text = editing.text
    // A formula with its last brackets left off, as Excel forgives
    if (text.startsWith('=')) {
      const open = (text.match(/\(/g) ?? []).length - (text.match(/\)/g) ?? []).length
      if (open > 0) text += ')'.repeat(open)
      if (!formulaOk(text)) {
        doc.setProblem(`Er staat een fout in deze formule: ${text}`)
        return
      }
    }
    const cur = sheet.cells[activeKey] ?? ''
    if (text !== cur) {
      const suggest = suggestedFormat(text)
      setCells({ [activeKey]: text }, suggest && !fmt.num ? { [activeKey]: { ...fmt, num: suggest } } : undefined)
    }
    setEditing(null)
    move(dc, dr)
    focusGrid()
  }
  const cancelEdit = () => {
    setEditing(null)
    focusGrid()
  }

  const clearSel = (what: 'inhoud' | 'opmaak' | 'alles') => {
    const cells: Record<string, undefined> = {}
    const formats: Record<string, undefined> = {}
    for (const { c, r } of cellsIn(rect)) {
      if (what !== 'opmaak') cells[addr(c, r)] = undefined
      if (what !== 'inhoud') formats[addr(c, r)] = undefined
    }
    setCells(cells, formats)
  }

  // ---------------------------------------------------------------- clipboard
  const shownText = (k: string) => formatValue(values.get(k) ?? null, sheet.formats[k]?.num, sheet.formats[k]?.dec)
  const copy = (cut: boolean) => {
    const cells: (string | undefined)[][] = []
    const formats: (CellFormat | undefined)[][] = []
    const lines: string[] = []
    for (let r = rect.r1; r <= rect.r2; r++) {
      const row: (string | undefined)[] = []
      const frow: (CellFormat | undefined)[] = []
      const text: string[] = []
      for (let c = rect.c1; c <= rect.c2; c++) {
        const k = addr(c, r)
        row.push(sheet.cells[k])
        frow.push(sheet.formats[k])
        text.push(shownText(k))
      }
      cells.push(row)
      formats.push(frow)
      lines.push(text.join('\t'))
    }
    clip.current = { rect, cells, formats, text: lines.join('\n'), cut }
    return clip.current.text
  }
  /** Paste at the active cell: what was copied here (formulas move along), or text from elsewhere (tabs and lines, as Excel copies). */
  const paste = (text: string) => {
    const own = clip.current && clip.current.text.replace(/\r/g, '') === text.replace(/\r/g, '').replace(/\n$/, '') ? clip.current : null
    const cells: Record<string, string | undefined> = {}
    const formats: Record<string, CellFormat | undefined> = {}
    if (own) {
      const dc = active.c - own.rect.c1
      const dr = active.r - own.rect.r1
      if (own.cut) for (const { c, r } of cellsIn(own.rect)) {
        cells[addr(c, r)] = undefined
        formats[addr(c, r)] = undefined
      }
      own.cells.forEach((row, i) =>
        row.forEach((v, j) => {
          const c = active.c + j
          const r = active.r + i
          if (c >= SHEET_COLS || r >= SHEET_ROWS) return
          cells[addr(c, r)] = v === undefined ? undefined : own.cut ? v : shiftFormula(v, dc, dr)
          formats[addr(c, r)] = own.formats[i][j]
        }),
      )
      if (own.cut) clip.current = null
      setSel({ a: active, f: clamp({ c: active.c + own.rect.c2 - own.rect.c1, r: active.r + own.rect.r2 - own.rect.r1 }) })
    } else {
      const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
      rows.forEach((row, i) =>
        row.forEach((v, j) => {
          const c = active.c + j
          const r = active.r + i
          if (c < SHEET_COLS && r < SHEET_ROWS) cells[addr(c, r)] = v.trim() === '' ? undefined : v
        }),
      )
      setSel({ a: active, f: clamp({ c: active.c + Math.max(...rows.map((r) => r.length)) - 1, r: active.r + rows.length - 1 }) })
    }
    setCells(cells, own ? formats : undefined)
  }

  useEffect(() => {
    const inGrid = () => !!grid.current && grid.current.contains(document.activeElement) && !editing
    const onCopy = (e: ClipboardEvent) => {
      if (!inGrid()) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', copy(false))
    }
    const onCut = (e: ClipboardEvent) => {
      if (!inGrid()) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', copy(true))
    }
    const onPaste = (e: ClipboardEvent) => {
      if (!inGrid()) return
      e.preventDefault()
      paste(e.clipboardData?.getData('text/plain') ?? '')
    }
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
    }
  })

  // The ribbon's own buttons (the browser only allows reading the clipboard after asking)
  const ribbonCopy = (cut: boolean) => {
    void navigator.clipboard?.writeText(copy(cut)).catch(() => undefined)
    focusGrid()
  }
  const ribbonPaste = async () => {
    try {
      paste(await navigator.clipboard.readText())
    } catch {
      if (clip.current) paste(clip.current.text)
      else doc.setProblem('Je browser laat de knop Plakken niet toe. Gebruik Ctrl+V (op een Mac: Cmd+V).')
    }
    focusGrid()
  }

  // ---------------------------------------------------------------- filling (the handle, Doorvoeren)
  const fill = (target: Pos) => {
    const down = target.r > rect.r2
    const up = target.r < rect.r1
    const right = target.c > rect.c2
    const left = target.c < rect.c1
    const vertical = (down || up) && Math.abs(down ? target.r - rect.r2 : rect.r1 - target.r) >= Math.abs(right ? target.c - rect.c2 : left ? rect.c1 - target.c : 0)
    const cells: Record<string, string | undefined> = {}
    const formats: Record<string, CellFormat | undefined> = {}
    if (vertical) {
      const len = rect.r2 - rect.r1 + 1
      const rows = down ? ROWS.slice(rect.r2 + 1, target.r + 1) : ROWS.slice(target.r, rect.r1).reverse()
      for (let c = rect.c1; c <= rect.c2; c++) {
        // Two or more numbers going up or down by the same step: the series goes on
        const src = ROWS.slice(rect.r1, rect.r2 + 1).map((r) => sheet.cells[addr(c, r)] ?? '')
        const nums = src.map((s) => (s.startsWith('=') ? null : literal(s)))
        const series = len >= 2 && nums.every((n) => typeof n === 'number')
        const step = series ? (nums[len - 1] as number) - (nums[len - 2] as number) : 0
        rows.forEach((r, i) => {
          const from = down ? rect.r1 + (i % len) : rect.r2 - (i % len)
          const k = addr(c, r)
          formats[k] = sheet.formats[addr(c, from)]
          if (series) {
            const base = down ? (nums[len - 1] as number) : (nums[0] as number)
            const v = base + step * (down ? i + 1 : -(i + 1))
            cells[k] = String(Math.round(v * 1e9) / 1e9).replace('.', ',')
          } else cells[k] = shiftFormula(sheet.cells[addr(c, from)] ?? '', 0, r - from) || undefined
        })
      }
      setCells(cells, formats)
      setSel({ a: sel.a, f: { c: rect.c2, r: down ? target.r : rect.r2 } })
      if (up) setSel({ a: { c: rect.c1, r: target.r }, f: { c: rect.c2, r: rect.r2 } })
    } else if (right || left) {
      const len = rect.c2 - rect.c1 + 1
      const cols = right ? COLS.slice(rect.c2 + 1, target.c + 1) : COLS.slice(target.c, rect.c1).reverse()
      for (let r = rect.r1; r <= rect.r2; r++)
        cols.forEach((c, i) => {
          const from = right ? rect.c1 + (i % len) : rect.c2 - (i % len)
          const k = addr(c, r)
          formats[k] = sheet.formats[addr(from, r)]
          cells[k] = shiftFormula(sheet.cells[addr(from, r)] ?? '', c - from, 0) || undefined
        })
      setCells(cells, formats)
      setSel(right ? { a: sel.a, f: { c: target.c, r: rect.r2 } } : { a: { c: target.c, r: rect.r1 }, f: { c: rect.c2, r: rect.r2 } })
    }
  }
  const fillDown = () => {
    if (rect.r2 === rect.r1) return
    const cells: Record<string, string | undefined> = {}
    for (let c = rect.c1; c <= rect.c2; c++) for (let r = rect.r1 + 1; r <= rect.r2; r++) cells[addr(c, r)] = shiftFormula(sheet.cells[addr(c, rect.r1)] ?? '', 0, r - rect.r1) || undefined
    setCells(cells)
  }

  useEffect(() => {
    const up = () => {
      if (dragging.current === 'fill' && fillTarget.current) fill(fillTarget.current)
      dragging.current = null
      fillTarget.current = null
      setFillTo(null)
    }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  })

  // ---------------------------------------------------------------- AutoSom, sorting
  const autoSum = () => {
    if (rect.r1 !== rect.r2 || rect.c1 !== rect.c2) {
      // A range: the sum under each column
      const r = Math.min(SHEET_ROWS - 1, rect.r2 + 1)
      const cells: Record<string, string> = {}
      for (let c = rect.c1; c <= rect.c2; c++) cells[addr(c, r)] = `=SOM(${addr(c, rect.r1)}:${addr(c, rect.r2)})`
      setCells(cells)
      return
    }
    // One cell: the numbers right above it (or else to the left)
    let r = active.r - 1
    while (r >= 0 && typeof values.get(addr(active.c, r)) === 'number') r--
    if (r < active.r - 1) return startEdit(`=SOM(${addr(active.c, r + 1)}:${addr(active.c, active.r - 1)})`, 'edit')
    let c = active.c - 1
    while (c >= 0 && typeof values.get(addr(c, active.r)) === 'number') c--
    startEdit(c < active.c - 1 ? `=SOM(${addr(c + 1, active.r)}:${addr(active.c - 1, active.r)})` : '=SOM()', 'edit')
  }
  const sort = (descending: boolean) => {
    const x = rect.r1 === rect.r2 && rect.c1 === rect.c2 ? usedRect(sheet) : rect
    if (!x) return
    // A heading row stays on top, and a totals row (sums of the column above) at the bottom
    const head = typeof values.get(addr(active.c, x.r1)) === 'string' && typeof values.get(addr(active.c, x.r1 + 1)) === 'number'
    const totals = COLS.slice(x.c1, x.c2 + 1).some((c) => /^=.*[A-Z]\$?\d+:\$?[A-Z]\$?\d+/i.test(sheet.cells[addr(c, x.r2)] ?? ''))
    const r1 = head ? x.r1 + 1 : x.r1
    const r2 = totals ? x.r2 - 1 : x.r2
    if (r2 > r1) updateSheet((s) => sortRows(s, { ...x, r1, r2 }, active.c, descending))
  }

  // ---------------------------------------------------------------- functions from the ribbon
  const insertFunction = (name: string) => {
    if (editing?.text.startsWith('=')) setEditing({ ...editing, text: `${editing.text}${name}(` })
    else startEdit(`=${name}(`, 'edit')
    setTimeout(() => barInput.current?.focus(), 0)
  }

  // ---------------------------------------------------------------- charts
  const addChart = (type: ChartType) => {
    if (sheet.charts.length >= MAX_CHARTS) return doc.setProblem(`Er passen maximaal ${MAX_CHARTS} grafieken op een werkblad.`)
    const x = rect.r1 === rect.r2 && rect.c1 === rect.c2 ? usedRect(sheet) : rect
    if (!x) return doc.setProblem('Selecteer eerst de cellen met de getallen voor de grafiek.')
    // Right of everything that's filled in (and of the row headings), so it covers nothing
    const lastCol = Math.max(x.c2, usedRect(sheet)?.c2 ?? 0)
    const left = COLS.slice(0, lastCol + 1).reduce((n, c) => n + width(c), 0) + 40 + 24
    const chart: SheetChart = { id: crypto.randomUUID().slice(0, 8), type, range: rectName(x), title: '', x: left, y: x.r1 * ROW_HEIGHT + 30, w: 480, h: 300 }
    updateSheet((s) => ({ ...s, charts: [...s.charts, chart] }))
    setChartSel(chart.id)
  }
  const setChart = (id: string, change: Partial<SheetChart>, history = true) => {
    const w = wbRef.current
    const sheets = w.sheets.map((s, i) => (i === w.active ? { ...s, charts: s.charts.map((c) => (c.id === id ? { ...c, ...change } : c)) } : s))
    if (history) commit({ ...w, sheets })
    else {
      wbRef.current = { ...w, sheets }
      setWb(wbRef.current)
      doc.changed()
    }
  }
  const removeChart = (id: string) => {
    updateSheet((s) => ({ ...s, charts: s.charts.filter((c) => c.id !== id) }))
    setChartSel(null)
  }

  // ---------------------------------------------------------------- sheets
  const addSheet = () => {
    const w = wbRef.current
    if (w.sheets.length >= MAX_SHEETS) return doc.setProblem(`Een werkmap kan maximaal ${MAX_SHEETS} werkbladen hebben.`)
    let n = w.sheets.length + 1
    while (w.sheets.some((s) => s.name === `Blad${n}`)) n++
    commit({ sheets: [...w.sheets, emptySheet(`Blad${n}`)], active: w.sheets.length })
    select({ c: 0, r: 0 })
  }
  const renameSheet = (i: number) => {
    const name = prompt('Naam van het werkblad:', wb.sheets[i].name)?.trim().slice(0, 31)
    if (!name) return
    commit({ ...wbRef.current, sheets: wbRef.current.sheets.map((s, j) => (j === i ? { ...s, name } : s)) })
  }
  const removeSheet = (i: number) => {
    if (wb.sheets.length < 2 || !confirm(`Werkblad “${wb.sheets[i].name}” verwijderen?`)) return
    const sheets = wbRef.current.sheets.filter((_, j) => j !== i)
    commit({ sheets, active: Math.min(wbRef.current.active, sheets.length - 1) })
  }
  const showSheet = (i: number) => {
    setEditing(null)
    const w = { ...wbRef.current, active: i }
    wbRef.current = w
    setWb(w)
    select({ c: 0, r: 0 })
  }

  // ---------------------------------------------------------------- keys
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    if (chartSel && (k === 'Delete' || k === 'Backspace')) {
      e.preventDefault()
      return removeChart(chartSel)
    }
    if (ctrl) {
      const l = k.toLowerCase()
      const take = (f: () => void) => {
        e.preventDefault()
        f()
      }
      if (l === 'z') take(undo)
      else if (l === 'y') take(redo)
      else if (l === 'b') take(() => toggle('b'))
      else if (l === 'i') take(() => toggle('i'))
      else if (l === 'u') take(() => toggle('u'))
      else if (l === 's') take(doc.save)
      else if (l === 'p') take(print)
      else if (l === 'a') take(() => setSel({ a: { c: 0, r: 0 }, f: { c: SHEET_COLS - 1, r: SHEET_ROWS - 1 } }))
      else if (l === 'd') take(fillDown)
      else if (k === 'Home') take(() => select({ c: 0, r: 0 }))
      return
    }
    const nav: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], PageDown: [0, 20], PageUp: [0, -20] }
    if (nav[k]) {
      e.preventDefault()
      return move(nav[k][0], nav[k][1], e.shiftKey)
    }
    if (k === 'Enter') {
      e.preventDefault()
      return move(0, e.shiftKey ? -1 : 1)
    }
    if (k === 'Tab') {
      e.preventDefault()
      return move(e.shiftKey ? -1 : 1, 0)
    }
    if (k === 'Home') {
      e.preventDefault()
      return select({ c: 0, r: active.r })
    }
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      return clearSel('inhoud')
    }
    if (k === 'F2') {
      e.preventDefault()
      return startEdit(sheet.cells[activeKey] ?? '', 'edit')
    }
    if (k.length === 1 && !e.altKey) {
      e.preventDefault()
      startEdit(k, 'enter')
    }
  }

  const onEditKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const k = e.key
    if (k === 'Enter') {
      e.preventDefault()
      finishEdit(0, e.shiftKey ? -1 : 1)
    } else if (k === 'Tab') {
      e.preventDefault()
      finishEdit(e.shiftKey ? -1 : 1, 0)
    } else if (k === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (editing?.mode === 'enter' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
      // Typed straight into the cell: the arrows put it in and move on, as in Excel
      e.preventDefault()
      finishEdit(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0)
    }
  }

  // ---------------------------------------------------------------- mouse
  const onCellDown = (e: React.MouseEvent, p: Pos) => {
    if (e.button !== 0) return
    if (editing) {
      // Clicking a cell while typing a formula puts its address in, as in Excel
      if (editing.text.startsWith('=') && /[(=;+\-*/^&<>:,]$/.test(editing.text)) {
        e.preventDefault()
        setEditing({ ...editing, text: editing.text + addr(p.c, p.r) })
        return
      }
      finishEdit(0, 0)
    }
    e.preventDefault()
    focusGrid()
    if (e.shiftKey) setSel((s) => ({ a: s.a, f: p }))
    else select(p)
    dragging.current = 'select'
  }
  const onCellEnter = (p: Pos) => {
    if (dragging.current === 'select') setSel((s) => ({ a: s.a, f: p }))
    else if (dragging.current === 'fill') {
      fillTarget.current = p
      setFillTo(p)
    }
  }
  const resizeCol = (e: React.MouseEvent, c: number) => {
    e.preventDefault()
    e.stopPropagation()
    const start = e.clientX
    const w0 = width(c)
    const scale = zoom / 100
    let last = w0
    const onMove = (ev: MouseEvent) => {
      last = Math.max(24, Math.min(600, Math.round(w0 + (ev.clientX - start) / scale)))
      const el = zoomBox.current?.querySelector<HTMLElement>(`col[data-col="${c}"]`)
      if (el) el.style.width = `${last}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (last !== w0) updateSheet((s) => ({ ...s, widths: { ...s.widths, [colName(c)]: last } }))
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ---------------------------------------------------------------- export, print
  const print = () => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) return
    win.document.write(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${doc.title}</title><style>body{font:11pt Calibri,Carlito,sans-serif}table{border-collapse:collapse}td{padding:2px 5px;white-space:nowrap}table.grid td{border:1px solid #c0c0c0}h1{font-size:13pt}</style></head><body><h1>${sheet.name}</h1>${sheetTable(sheet, gridlines)}</body></html>`,
    )
    win.document.close()
    setTimeout(() => {
      win.focus()
      win.print()
    }, 400)
  }
  const exports = [
    { key: 'xml', icon: 'page_white_excel' as const, name: 'Excel-werkmap (XML)', hint: 'Alle werkbladen; opent in Excel en LibreOffice.', onClick: () => download(fileName(doc.title, 'xml'), 'application/xml', workbookXml(wbRef.current)) },
    { key: 'csv', icon: 'file_extension_txt' as const, name: 'CSV (puntkomma)', hint: 'Dit werkblad als tekst, voor elk programma.', onClick: () => download(fileName(`${doc.title} - ${sheet.name}`, 'csv'), 'text/csv;charset=utf-8', '﻿' + sheetCsv(sheet)) },
  ]

  const setZoom = (z: number) => {
    const next = Math.min(200, Math.max(50, Math.round(z / 10) * 10))
    setZoomState(next)
    remember('kuddes.rekenblad.zoom', String(next))
  }

  // ---------------------------------------------------------------- the status bar: sum, average and count of the selection
  const stats = useMemo(() => {
    let n = 0
    let sum = 0
    let filled = 0
    for (const { c, r } of cellsIn(rect)) {
      const v = values.get(addr(c, r))
      if (v === undefined || v === null || v === '') continue
      filled++
      if (typeof v === 'number') {
        n++
        sum += v
      }
    }
    return { n, sum, filled }
  }, [rect, values])

  const cellStyle = (k: string, v: Value): CSSProperties => {
    const f = sheet.formats[k]
    const align = f?.align ?? (typeof v === 'number' ? 'right' : typeof v === 'boolean' || isError(v) ? 'center' : 'left')
    return {
      textAlign: align,
      fontWeight: f?.b ? 'bold' : undefined,
      fontStyle: f?.i ? 'italic' : undefined,
      textDecoration: f?.u ? 'underline' : undefined,
      color: f?.color,
      background: f?.fill,
    }
  }

  const barValue = editing ? editing.text : (sheet.cells[activeKey] ?? '')
  const inRect = (c: number, r: number) => c >= rect.c1 && c <= rect.c2 && r >= rect.r1 && r <= rect.r2
  const fillRect = fillTo ? rectOf({ c: Math.min(rect.c1, fillTo.c), r: Math.min(rect.r1, fillTo.r) }, { c: Math.max(rect.c2, fillTo.c), r: Math.max(rect.r2, fillTo.r) }) : null

  return (
    <main className="page ofc-page">
      <div ref={app} className="ofc-app rb-app" data-scheme={scheme}>
        <TitleBar
          kind="rekenblad"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            { icon: 'arrow_undo', title: 'Ongedaan maken (Ctrl+Z)', onClick: undo },
            { icon: 'arrow_redo', title: 'Opnieuw (Ctrl+Y)', onClick: redo },
            { icon: 'printer', title: 'Afdrukken (Ctrl+P)', onClick: print },
          ]}
        />
        {orb && (
          <FileMenu
            kind="rekenblad"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={exports}
            onPrint={print}
            onDelete={doc.remove}
          />
        )}

        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' && (
              <>
                <Group label="Klembord">
                  <Big icon="paste_plain" label="Plakken" onClick={() => void ribbonPaste()} title="Plakken (Ctrl+V)" />
                  <div className="ofc-stack">
                    <Small icon="cut" label="Knippen" onClick={() => ribbonCopy(true)} title="Knippen (Ctrl+X)" />
                    <Small icon="page_copy" label="Kopiëren" onClick={() => ribbonCopy(false)} title="Kopiëren (Ctrl+C)" />
                  </div>
                </Group>
                <Group label="Lettertype">
                  <div className="ofc-rows">
                    <div className="ofc-row">
                      <Small icon="text_bold" onClick={() => toggle('b')} active={!!fmt.b} title="Vet (Ctrl+B)" />
                      <Small icon="text_italic" onClick={() => toggle('i')} active={!!fmt.i} title="Cursief (Ctrl+I)" />
                      <Small icon="text_underline" onClick={() => toggle('u')} active={!!fmt.u} title="Onderstrepen (Ctrl+U)" />
                      <Small icon="border_1_outer" onClick={() => toggle('border')} active={!!fmt.border} title="Randen" />
                    </div>
                    <div className="ofc-row">
                      <Menu icon="fill_color" title="Opvulkleur">
                        {(close) => <ColorGrid none="Geen opvulling" onPick={(c) => (formatSel((f) => ({ ...f, fill: c ?? undefined })), close())} />}
                      </Menu>
                      <Menu icon="font_colors" title="Tekstkleur">
                        {(close) => <ColorGrid none="Automatisch" onPick={(c) => (formatSel((f) => ({ ...f, color: c ?? undefined })), close())} />}
                      </Menu>
                    </div>
                  </div>
                </Group>
                <Group label="Uitlijning">
                  <div className="ofc-row">
                    <Small icon="text_align_left" onClick={() => formatSel((f) => ({ ...f, align: f.align === 'left' ? undefined : 'left' }))} active={fmt.align === 'left'} title="Links uitlijnen" />
                    <Small icon="text_align_center" onClick={() => formatSel((f) => ({ ...f, align: f.align === 'center' ? undefined : 'center' }))} active={fmt.align === 'center'} title="Centreren" />
                    <Small icon="text_align_right" onClick={() => formatSel((f) => ({ ...f, align: f.align === 'right' ? undefined : 'right' }))} active={fmt.align === 'right'} title="Rechts uitlijnen" />
                  </div>
                </Group>
                <Group label="Getal">
                  <div className="ofc-rows">
                    <select className="ofc-select rb-numfmt" value={fmt.num ?? 'standaard'} onChange={(e) => formatSel((f) => ({ ...f, num: e.target.value as NumberFormat, dec: undefined }))} aria-label="Getalnotatie">
                      {(Object.keys(NUMBER_FORMATS) as NumberFormat[]).map((k) => (
                        <option key={k} value={k}>
                          {NUMBER_FORMATS[k]}
                        </option>
                      ))}
                    </select>
                    <div className="ofc-row">
                      <Small icon="money_euro" onClick={() => formatSel((f) => ({ ...f, num: 'valuta' }))} active={fmt.num === 'valuta'} title="Valuta (€)" />
                      {/* The set has no percent icon: the sign itself, as Excel's button shows it */}
                      <button type="button" className={fmt.num === 'procent' ? 'ofc-small rb-pct on' : 'ofc-small rb-pct'} onMouseDown={keep} onClick={() => formatSel((f) => ({ ...f, num: 'procent' }))} title="Procent" aria-label="Procent" aria-pressed={fmt.num === 'procent'}>
                        %
                      </button>
                      <Small icon="decimal_more" onClick={() => formatSel((f) => ({ ...f, dec: Math.min(6, (f.dec ?? (f.num === 'procent' ? 0 : f.num === 'valuta' || f.num === 'getal' ? 2 : 0)) + 1) }))} title="Meer decimalen" />
                      <Small icon="decimal_less" onClick={() => formatSel((f) => ({ ...f, dec: Math.max(0, (f.dec ?? (f.num === 'procent' ? 0 : 2)) - 1) }))} title="Minder decimalen" />
                    </div>
                  </div>
                </Group>
                <Group label="Bewerken">
                  <Big icon="sum" label="AutoSom" onClick={autoSum} title="De som van de getallen erboven (of ernaast)" />
                  <div className="ofc-stack">
                    <Small icon="arrow_down" label="Doorvoeren" onClick={fillDown} title="De bovenste rij van de selectie omlaag doorvoeren (Ctrl+D)" />
                    <Menu icon="cell_clear" label="Wissen" title="Wissen">
                      {(close) => (
                        <Choices
                          items={[
                            ['alles', 'Alles wissen'],
                            ['inhoud', 'Inhoud wissen'],
                            ['opmaak', 'Opmaak wissen'],
                          ]}
                          onPick={(w) => (clearSel(w), close())}
                        />
                      )}
                    </Menu>
                    <Menu icon="sort_asc_az" label="Sorteren" title="Sorteren">
                      {(close) => (
                        <Choices
                          items={[
                            ['op', 'Sorteren van A naar Z (klein naar groot)'],
                            ['af', 'Sorteren van Z naar A (groot naar klein)'],
                          ]}
                          onPick={(d) => (sort(d === 'af'), close())}
                        />
                      )}
                    </Menu>
                  </div>
                </Group>
              </>
            )}
            {tab === 'invoegen' && (
              <>
                <Group label="Grafieken">
                  <Big icon="chart_bar" label="Kolom" onClick={() => addChart('kolom')} title="Kolomgrafiek van de selectie" />
                  <Big icon="chart_column_horizont" label="Staaf" onClick={() => addChart('staaf')} title="Staafgrafiek van de selectie" />
                  <Big icon="chart_line" label="Lijn" onClick={() => addChart('lijn')} title="Lijngrafiek van de selectie" />
                  <Big icon="chart_pie" label="Cirkel" onClick={() => addChart('taart')} title="Cirkeldiagram van de selectie" />
                </Group>
                <Group label="Werkbladen">
                  <Big icon="table_add" label="Nieuw werkblad" onClick={addSheet} />
                </Group>
              </>
            )}
            {tab === 'formules' && (
              <>
                <Group label="Functiebibliotheek">
                  <Big icon="sum" label="AutoSom" onClick={autoSum} />
                  {FUNCTION_LIST.map((g) => (
                    <Menu key={g.group} big icon={g.group === 'Wiskunde' ? 'calculator' : g.group === 'Statistisch' ? 'chart_bar' : g.group === 'Logisch' ? 'function' : g.group === 'Tekst' ? 'font' : 'date'} label={g.group} title={g.group}>
                      {(close) => (
                        <div className="ofc-popup-list rb-fn-list">
                          {g.items.map(([name, hint]) => (
                            <button key={name} type="button" className="ofc-popup-item" onClick={() => (insertFunction(name), close())}>
                              <b>{name}</b>
                              <small>{hint}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </Menu>
                  ))}
                </Group>
                <Group label="Controle">
                  <Big icon="function" label="Formules weergeven" onClick={() => setShowFormulas((x) => !x)} active={showFormulas} />
                </Group>
              </>
            )}
            {tab === 'beeld' && (
              <>
                <Group label="Weergeven/verbergen">
                  <div className="ofc-stack">
                    <label className="ofc-check">
                      <input type="checkbox" checked={gridlines} onChange={(e) => setGridlines(e.target.checked)} /> Rasterlijnen
                    </label>
                    <label className="ofc-check">
                      <input type="checkbox" checked={headings} onChange={(e) => setHeadings(e.target.checked)} /> Kolom- en rijkoppen
                    </label>
                  </div>
                </Group>
                <Group label="Zoomen">
                  <Big icon="zoom" label="100%" onClick={() => setZoom(100)} />
                  <div className="ofc-stack">
                    <Small icon="zoom_in" label="Inzoomen" onClick={() => setZoom(zoom + 10)} />
                    <Small icon="zoom_out" label="Uitzoomen" onClick={() => setZoom(zoom - 10)} />
                  </div>
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
                <Group label="Venster">
                  <Big icon="slideshow_full_screen" label="Volledig scherm" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : app.current?.requestFullscreen())} />
                </Group>
              </>
            )}
          </div>
        </div>

        {/* The name box and the formula bar */}
        <div className="rb-bar">
          <input
            className="rb-namebox"
            defaultValue={rectName(rect)}
            key={rectName(rect)}
            aria-label="Naamvak"
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const [a, b] = e.currentTarget.value.toUpperCase().split(':')
              const p = parseAddr(a)
              const q = b ? parseAddr(b) : p
              if (p && q) {
                setSel({ a: p, f: q })
                focusGrid()
              }
            }}
          />
          <span className="rb-fx" aria-hidden="true">
            <i>fx</i>
          </span>
          <input
            ref={barInput}
            className="rb-formula"
            value={barValue}
            aria-label="Formulebalk"
            onFocus={() => !editing && startEdit(sheet.cells[activeKey] ?? '', 'edit')}
            onChange={(e) => setEditing({ text: e.target.value, mode: 'edit' })}
            onKeyDown={onEditKey}
          />
        </div>

        <div className="ofc-workspace rb-workspace" ref={grid} tabIndex={0} onKeyDown={onKeyDown} aria-label="Werkblad">
          <div className={`rb-zoom${gridlines ? '' : ' no-grid'}${headings ? '' : ' no-heads'}`} ref={zoomBox} style={{ zoom: zoom / 100 }}>
            <table className="rb-grid" role="grid" aria-rowcount={SHEET_ROWS} aria-colcount={SHEET_COLS}>
              <colgroup>
                <col className="rb-head-col" />
                {COLS.map((c) => (
                  <col key={c} data-col={c} style={{ width: width(c) }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="rb-corner" onMouseDown={(e) => (e.preventDefault(), setSel({ a: { c: 0, r: 0 }, f: { c: SHEET_COLS - 1, r: SHEET_ROWS - 1 } }))} />
                  {COLS.map((c) => (
                    <th
                      key={c}
                      className={c >= rect.c1 && c <= rect.c2 ? 'on' : undefined}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        focusGrid()
                        setSel(e.shiftKey ? (s) => ({ a: { c: s.a.c, r: 0 }, f: { c, r: SHEET_ROWS - 1 } }) : { a: { c, r: 0 }, f: { c, r: SHEET_ROWS - 1 } })
                      }}
                    >
                      {colName(c)}
                      <span className="rb-resize" onMouseDown={(e) => resizeCol(e, c)} aria-hidden="true" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r}>
                    <th
                      className={r >= rect.r1 && r <= rect.r2 ? 'on' : undefined}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        focusGrid()
                        setSel({ a: { c: 0, r }, f: { c: SHEET_COLS - 1, r } })
                      }}
                    >
                      {r + 1}
                    </th>
                    {COLS.map((c) => {
                      const k = addr(c, r)
                      const v = values.get(k) ?? null
                      const isActive = c === active.c && r === active.r
                      const isSel = inRect(c, r)
                      const f = sheet.formats[k]
                      const cls = [
                        isSel && !isActive ? 'sel' : '',
                        isActive ? 'act' : '',
                        isSel && r === rect.r1 ? 'st' : '',
                        isSel && r === rect.r2 ? 'sb' : '',
                        isSel && c === rect.c1 ? 'sl' : '',
                        isSel && c === rect.c2 ? 'sr' : '',
                        fillRect && c >= fillRect.c1 && c <= fillRect.c2 && r >= fillRect.r1 && r <= fillRect.r2 && !isSel ? 'filling' : '',
                        f?.border ? 'bd' : '',
                        isError(v) ? 'err' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')
                      return (
                        <td key={c} data-cell={k} className={cls || undefined} style={cellStyle(k, v)} onMouseDown={(e) => onCellDown(e, { c, r })} onMouseEnter={() => onCellEnter({ c, r })} onDoubleClick={() => startEdit(sheet.cells[k] ?? '', 'edit')}>
                          {isActive && editing ? (
                            <input className="rb-cell-input" autoFocus value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} onKeyDown={onEditKey} aria-label={`Cel ${k}`} />
                          ) : showFormulas && sheet.cells[k]?.startsWith('=') ? (
                            sheet.cells[k]
                          ) : (
                            formatValue(v, f?.num, f?.dec)
                          )}
                          {c === rect.c2 && r === rect.r2 && !editing && (
                            <span
                              className="rb-fill"
                              title="Sleep om door te voeren"
                              onMouseDown={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                dragging.current = 'fill'
                                fillTarget.current = { c, r }
                                setFillTo({ c, r })
                              }}
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {sheet.charts.map((ch) => (
              <ChartBox
                key={ch.id}
                chart={ch}
                selected={chartSel === ch.id}
                zoom={zoom / 100}
                data={chartData(sheet, ch.range)}
                onSelect={() => setChartSel(ch.id)}
                onChange={(change, final) => setChart(ch.id, change, final)}
                onRemove={() => removeChart(ch.id)}
              />
            ))}
          </div>
        </div>

        <div className="rb-tabs" role="tablist" aria-label="Werkbladen">
          {wb.sheets.map((s, i) => (
            <span key={i} className={i === wb.active ? 'rb-sheet on' : 'rb-sheet'}>
              <button type="button" role="tab" aria-selected={i === wb.active} onClick={() => showSheet(i)} onDoubleClick={() => renameSheet(i)} title="Dubbelklik om de naam te wijzigen">
                {s.name}
              </button>
              {i === wb.active && wb.sheets.length > 1 && (
                <button type="button" className="rb-sheet-x" onClick={() => removeSheet(i)} title="Werkblad verwijderen" aria-label={`${s.name} verwijderen`}>
                  ×
                </button>
              )}
            </span>
          ))}
          <button type="button" className="rb-sheet-add" onClick={addSheet} title="Werkblad invoegen" aria-label="Werkblad invoegen">
            +
          </button>
        </div>

        <footer className="ofc-status">
          <span>{editing ? (editing.mode === 'enter' ? 'Invoeren' : 'Bewerken') : 'Gereed'}</span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.status}
          </span>
          {stats.filled > 1 && (
            <span className="rb-stats">
              {stats.n > 0 && (
                <>
                  Gemiddelde: {formatValue(stats.sum / stats.n, undefined, undefined)} &nbsp; Som: {formatValue(stats.sum, undefined, undefined)} &nbsp;{' '}
                </>
              )}
              Aantal: {stats.filled}
            </span>
          )}
          <ZoomBar zoom={zoom} onZoom={setZoom} min={50} />
        </footer>
      </div>
      {opening && <OpenDialog kind="rekenblad" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}

/** A chart floating over the sheet: drag it by its frame, resize it from its corner, change its kind or title. */
function ChartBox({
  chart,
  selected,
  zoom,
  data,
  onSelect,
  onChange,
  onRemove,
}: {
  chart: SheetChart
  selected: boolean
  zoom: number
  data: ReturnType<typeof chartData>
  onSelect: () => void
  onChange: (change: Partial<SheetChart>, final: boolean) => void
  onRemove: () => void
}) {
  const drag = (e: React.MouseEvent, mode: 'move' | 'size') => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, select')) return
    e.preventDefault()
    e.stopPropagation()
    onSelect()
    const sx = e.clientX
    const sy = e.clientY
    const start = { ...chart }
    let last: Partial<SheetChart> = {}
    const onMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - sx) / zoom
      const dy = (ev.clientY - sy) / zoom
      last = mode === 'move' ? { x: Math.max(0, Math.round(start.x + dx)), y: Math.max(0, Math.round(start.y + dy)) } : { w: Math.max(200, Math.round(start.w + dx)), h: Math.max(150, Math.round(start.h + dy)) }
      onChange(last, false)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (Object.keys(last).length) onChange(last, true)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return (
    <div
      className={selected ? 'rb-chart on' : 'rb-chart'}
      style={{ left: chart.x, top: chart.y, width: chart.w, height: chart.h }}
      onMouseDown={(e) => drag(e, 'move')}
      onDoubleClick={() => {
        const t = prompt('Titel van de grafiek:', chart.title)
        if (t !== null) onChange({ title: t.slice(0, 80) }, true)
      }}
      role="figure"
      aria-label={chart.title || 'Grafiek'}
    >
      {selected && (
        <div className="rb-chart-tools">
          <select value={chart.type} onChange={(e) => onChange({ type: e.target.value as ChartType }, true)} aria-label="Soort grafiek">
            <option value="kolom">Kolom</option>
            <option value="staaf">Staaf</option>
            <option value="lijn">Lijn</option>
            <option value="taart">Cirkel</option>
          </select>
          <span className="rb-chart-range">{chart.range}</span>
          <button type="button" onClick={onRemove} title="Grafiek verwijderen" aria-label="Grafiek verwijderen">
            ×
          </button>
        </div>
      )}
      <ChartView type={chart.type} title={chart.title} data={data} />
      {selected && <span className="rb-chart-size" onMouseDown={(e) => drag(e, 'size')} aria-hidden="true" />}
    </div>
  )
}
