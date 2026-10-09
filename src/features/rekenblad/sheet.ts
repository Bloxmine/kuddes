/**
 * Working with a sheet of Kuddes Rekenblad as a whole: the part that's
 * filled in, sorting, exporting (CSV, an Excel 2003 XML workbook), printing,
 * and the numbers behind a chart.
 */
import { SHEET_COLS, SHEET_ROWS, type Sheet, type Workbook } from '../../../shared/documents'
import { addr, cellsIn, colName, computeSheet, formatValue, isError, literal, parseRect, shiftFormula, type Rect, type Value } from './formula'

/** The rectangle from A1 to the last filled cell (null when the sheet is empty). */
export function usedRect(s: Sheet): Rect | null {
  let c2 = -1
  let r2 = -1
  for (const key of Object.keys(s.cells)) {
    if (s.cells[key] === '') continue
    const c = key.charCodeAt(0) - 65
    const r = Number(key.slice(1)) - 1
    c2 = Math.max(c2, c)
    r2 = Math.max(r2, r)
  }
  return c2 < 0 ? null : { c1: 0, r1: 0, c2, r2 }
}

/** Sort the rows of a range by one of its columns; empty cells go last. Contents move as they are. */
export function sortRows(s: Sheet, x: Rect, byCol: number, descending: boolean): Sheet {
  const values = computeSheet(s.cells)
  const rows: { from: number; cells: (string | undefined)[]; formats: (Sheet['formats'][string] | undefined)[]; key: Value }[] = []
  for (let r = x.r1; r <= x.r2; r++) {
    const cells = []
    const formats = []
    for (let c = x.c1; c <= x.c2; c++) {
      cells.push(s.cells[addr(c, r)])
      formats.push(s.formats[addr(c, r)])
    }
    rows.push({ from: r, cells, formats, key: values.get(addr(byCol, r)) ?? null })
  }
  const rank = (v: Value) => (v === null || v === '' ? 3 : typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
  rows.sort((a, b) => {
    const ra = rank(a.key)
    const rb = rank(b.key)
    if (ra === 3 || rb === 3) return ra - rb
    if (ra !== rb) return (ra - rb) * (descending ? -1 : 1)
    const d = typeof a.key === 'number' && typeof b.key === 'number' ? a.key - b.key : String(a.key).localeCompare(String(b.key), 'nl', { numeric: true })
    return descending ? -d : d
  })
  const cells = { ...s.cells }
  const formats = { ...s.formats }
  rows.forEach((row, i) => {
    row.cells.forEach((v, j) => {
      const k = addr(x.c1 + j, x.r1 + i)
      if (v === undefined) delete cells[k]
      // A formula moves with its row, as in Excel (=B2-C2 on the row that ends up 4th becomes =B4-C4)
      else cells[k] = shiftFormula(v, 0, x.r1 + i - row.from)
      if (row.formats[j]) formats[k] = row.formats[j]!
      else delete formats[k]
    })
  })
  return { ...s, cells, formats }
}

const shown = (s: Sheet, values: Map<string, Value>, key: string) => formatValue(values.get(key) ?? null, s.formats[key]?.num, s.formats[key]?.dec)

/** The filled part of the sheet as CSV, the way Dutch Excel writes it (;-separated), with the values as shown. */
export function sheetCsv(s: Sheet): string {
  const x = usedRect(s)
  if (!x) return ''
  const values = computeSheet(s.cells)
  const lines: string[] = []
  for (let r = x.r1; r <= x.r2; r++) {
    const row: string[] = []
    for (let c = x.c1; c <= x.c2; c++) {
      const v = shown(s, values, addr(c, r))
      row.push(/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    }
    lines.push(row.join(';'))
  }
  return lines.join('\r\n')
}

const xml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * The whole workbook as an Excel 2003 XML workbook: every sheet with its
 * values (numbers as numbers), bold and fill. Excel and LibreOffice open it.
 */
export function workbookXml(wb: Workbook): string {
  const styles = new Map<string, string>()
  const styleId = (f: Sheet['formats'][string] | undefined) => {
    if (!f || (!f.b && !f.i && !f.fill && !f.color)) return null
    const key = JSON.stringify([f.b, f.i, f.fill, f.color])
    if (!styles.has(key)) {
      const id = `s${styles.size + 1}`
      const font = `<Font${f.b ? ' ss:Bold="1"' : ''}${f.i ? ' ss:Italic="1"' : ''}${f.color ? ` ss:Color="${f.color}"` : ''}/>`
      const fill = f.fill ? `<Interior ss:Color="${f.fill}" ss:Pattern="Solid"/>` : ''
      styles.set(key, `<Style ss:ID="${id}">${font}${fill}</Style>`)
    }
    return `s${[...styles.keys()].indexOf(key) + 1}`
  }
  const sheets = wb.sheets.map((s) => {
    const x = usedRect(s)
    const values = computeSheet(s.cells)
    const rows: string[] = []
    if (x)
      for (let r = 0; r <= x.r2; r++) {
        const cells: string[] = []
        for (let c = 0; c <= x.c2; c++) {
          const key = addr(c, r)
          const v = values.get(key) ?? null
          const st = styleId(s.formats[key])
          const attr = st ? ` ss:StyleID="${st}"` : ''
          if (v === null) cells.push(`<Cell${attr}/>`)
          else if (typeof v === 'number') cells.push(`<Cell${attr}><Data ss:Type="Number">${v}</Data></Cell>`)
          else if (typeof v === 'boolean') cells.push(`<Cell${attr}><Data ss:Type="Boolean">${v ? 1 : 0}</Data></Cell>`)
          else cells.push(`<Cell${attr}><Data ss:Type="String">${xml(isError(v) ? v.error : v)}</Data></Cell>`)
        }
        rows.push(`<Row>${cells.join('')}</Row>`)
      }
    const cols = Array.from({ length: x ? x.c2 + 1 : 0 }, (_, c) => `<Column ss:Width="${Math.round((s.widths[colName(c)] ?? 80) * 0.75)}"/>`).join('')
    return `<Worksheet ss:Name="${xml(s.name)}"><Table>${cols}${rows.join('')}</Table></Worksheet>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles>${[...styles.values()].join('')}</Styles>${sheets.join('')}</Workbook>`
}

/** The filled part of a sheet as an HTML table, for printing. */
export function sheetTable(s: Sheet, gridlines: boolean): string {
  const x = usedRect(s)
  if (!x) return '<p>Dit werkblad is leeg.</p>'
  const values = computeSheet(s.cells)
  let out = `<table class="${gridlines ? 'grid' : ''}"><tbody>`
  for (let r = 0; r <= x.r2; r++) {
    out += '<tr>'
    for (let c = 0; c <= x.c2; c++) {
      const key = addr(c, r)
      const f = s.formats[key] ?? {}
      const v = values.get(key) ?? null
      const align = f.align ?? (typeof v === 'number' ? 'right' : typeof v === 'boolean' || isError(v) ? 'center' : 'left')
      const css = [
        `text-align:${align}`,
        f.b ? 'font-weight:bold' : '',
        f.i ? 'font-style:italic' : '',
        f.u ? 'text-decoration:underline' : '',
        f.color ? `color:${f.color}` : '',
        f.fill ? `background:${f.fill}` : '',
        f.border ? 'border:1px solid #000' : '',
        `min-width:${s.widths[colName(c)] ?? 80}px`,
      ]
        .filter(Boolean)
        .join(';')
      out += `<td style="${css}">${xml(shown(s, values, key))}</td>`
    }
    out += '</tr>'
  }
  return `${out}</tbody></table>`
}

export type ChartData = { labels: string[]; series: { name: string; values: number[] }[] }

/**
 * The numbers behind a chart: a first column (or row) of text gives the
 * labels, a first row (or column) of text the series' names, the rest the
 * numbers. Series run down the columns, or along the row when there's one.
 */
export function chartData(s: Sheet, range: string): ChartData | null {
  const x = parseRect(range)
  if (!x) return null
  const values = computeSheet(s.cells)
  const at = (c: number, r: number) => values.get(addr(c, r)) ?? null
  const text = (v: Value) => typeof v === 'string' && typeof literal(v) !== 'number'
  const headRow = [...cellsIn({ ...x, r2: x.r1 })].some(({ c, r }) => c > x.c1 && text(at(c, r)))
  const labelCol = [...cellsIn({ ...x, c2: x.c1 })].some(({ c, r }) => r > x.r1 && text(at(c, r))) || (headRow && text(at(x.c1, x.r1 + 1)))
  const r0 = headRow ? x.r1 + 1 : x.r1
  const c0 = labelCol ? x.c1 + 1 : x.c1
  if (r0 > x.r2 || c0 > x.c2) return null
  const num = (v: Value) => (typeof v === 'number' ? v : 0)
  // One row of numbers: one series along it
  if (r0 === x.r2 && c0 < x.c2) {
    return {
      labels: Array.from({ length: x.c2 - c0 + 1 }, (_, i) => (headRow ? String(at(c0 + i, x.r1) ?? '') : colName(c0 + i))),
      series: [{ name: labelCol ? String(at(x.c1, r0) ?? '') : 'Reeks 1', values: Array.from({ length: x.c2 - c0 + 1 }, (_, i) => num(at(c0 + i, r0))) }],
    }
  }
  const labels = Array.from({ length: x.r2 - r0 + 1 }, (_, i) => (labelCol ? String(at(x.c1, r0 + i) ?? '') : String(r0 + i + 1)))
  const series = Array.from({ length: x.c2 - c0 + 1 }, (_, j) => ({
    name: headRow ? String(at(c0 + j, x.r1) ?? '') : `Reeks ${j + 1}`,
    values: Array.from({ length: x.r2 - r0 + 1 }, (_, i) => num(at(c0 + j, r0 + i))),
  }))
  return { labels, series }
}

/** Office 2007's chart colours. */
export const CHART_COLORS = ['#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646', '#2c4d75', '#772c2a']

export const maxCell = () => addr(SHEET_COLS - 1, SHEET_ROWS - 1)
