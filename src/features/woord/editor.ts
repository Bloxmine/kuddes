/**
 * The workings behind Kuddes Woord (WoordPage.tsx): formatting through the
 * browser's own editing commands on a contentEditable page, cleaning what
 * goes in and out with DOMPurify, counting words, find and replace, and
 * turning a document into a Word, web page or text file.
 */
import DOMPurify from 'dompurify'
import type { DocSettings } from '../../../shared/documents'

/** Font families in the Lettertype list; the first fits Calibri's look where Calibri isn't installed. */
export const FONTS = [
  ['Calibri', 'Calibri, Carlito, "Segoe UI", sans-serif'],
  ['Cambria', 'Cambria, Caladea, Georgia, serif'],
  ['Arial', 'Arial, Helvetica, sans-serif'],
  ['Times New Roman', '"Times New Roman", Times, serif'],
  ['Georgia', 'Georgia, serif'],
  ['Verdana', 'Verdana, sans-serif'],
  ['Trebuchet MS', '"Trebuchet MS", sans-serif'],
  ['Tahoma', 'Tahoma, sans-serif'],
  ['Courier New', '"Courier New", Courier, monospace'],
  ['Comic Sans MS', '"Comic Sans MS", "Comic Neue", cursive'],
] as const

export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72]

/** Markeren's colours (Tekstkleur and Paginakleur use Office's palette, officeFile.ts). */
export const HIGHLIGHTS = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#0000ff', '#ff0000', '#000080', '#008080', '#008000', '#800080', '#800000', '#808000', '#808080', '#c0c0c0']

/** The Stijlen gallery: a block element (and a class for the ones that share one). */
export const STYLES = [
  { key: 'standaard', name: 'Standaard', tag: 'p', cls: '' },
  { key: 'geenafstand', name: 'Geen afstand', tag: 'p', cls: 'kw-tight' },
  { key: 'kop1', name: 'Kop 1', tag: 'h2', cls: '' },
  { key: 'kop2', name: 'Kop 2', tag: 'h3', cls: '' },
  { key: 'titel', name: 'Titel', tag: 'h1', cls: '' },
  { key: 'ondertitel', name: 'Ondertitel', tag: 'p', cls: 'kw-subtitle' },
  { key: 'citaat', name: 'Citaat', tag: 'blockquote', cls: '' },
] as const
export type StyleKey = (typeof STYLES)[number]['key']

/** WordArt, as in Office 2007: a few ready-made looks for a big word. */
export const WORDART = [
  { key: 'wa-blauw', name: 'Blauw verloop' },
  { key: 'wa-goud', name: 'Goud' },
  { key: 'wa-regenboog', name: 'Regenboog' },
  { key: 'wa-schaduw', name: 'Schaduw' },
  { key: 'wa-omlijnd', name: 'Omlijnd' },
] as const

export const SYMBOLS = '©®™€£$¥±×÷°§¶•…–—«»‹›„“”‘’¡¿½¼¾¹²³µ∞≈≠≤≥√∑πΩαβ←→↑↓↔✓✗♥♦♣♠★☆☺☻♪♫☼☾✉✈☎✿❀'.split('')

// The page sizes at 96 pixels an inch (A4) and the margins in Word's own centimetres
export const CM = 96 / 2.54
export const PAGE = { width: 21 * CM, height: 29.7 * CM }
export const MARGINS: Record<DocSettings['margins'], { top: number; side: number }> = {
  normaal: { top: 2.5, side: 2.5 },
  smal: { top: 1.27, side: 1.27 },
  breed: { top: 2.54, side: 5.08 },
}

export function pageSize(s: DocSettings) {
  return s.orientation === 'liggend' ? { width: PAGE.height, height: PAGE.width } : PAGE
}

/** What may be in a document: no scripts, frames or forms; pictures (also as data) and the editor's own classes stay. */
export function clean(html: string): string {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed', 'link', 'meta'],
    FORBID_ATTR: ['id'],
  })
}

/** Text pasted from Word or a web page: cleaned, without Office's own markup and classes. */
export function cleanPasted(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?o:p>/gi, '')
    .replace(/\sclass="?Mso[^"\s>]*"?/gi, '')
  return clean(stripped)
}

export function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

/** A font size in points: the browser only knows sizes 1–7, so set 7 and turn what it made into the real size. */
export function setFontSize(root: HTMLElement, pt: number) {
  exec('styleWithCSS', 'true')
  exec('fontSize', '7')
  root.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]').forEach((el) => {
    if (el.tagName === 'FONT') {
      const span = document.createElement('span')
      span.style.fontSize = `${pt}pt`
      span.innerHTML = el.innerHTML
      el.replaceWith(span)
    } else {
      el.style.fontSize = `${pt}pt`
    }
  })
}

/** The block the cursor is in (a paragraph, heading, quote, list item), inside the page. */
export function currentBlock(root: HTMLElement): HTMLElement | null {
  const sel = window.getSelection()
  let node: Node | null = sel?.anchorNode ?? null
  while (node && node !== root) {
    if (node instanceof HTMLElement && /^(P|H1|H2|H3|H4|BLOCKQUOTE|LI|DIV)$/.test(node.tagName)) return node
    node = node.parentNode
  }
  return null
}

/** Apply one of the Stijlen: the block type, and its class for the ones that share a tag. */
export function applyStyle(root: HTMLElement, key: StyleKey) {
  const style = STYLES.find((s) => s.key === key)!
  exec('formatBlock', `<${style.tag}>`)
  const block = currentBlock(root)
  if (block) block.className = style.cls
}

export function styleOf(block: HTMLElement | null): StyleKey {
  if (!block) return 'standaard'
  const tag = block.tagName.toLowerCase()
  return STYLES.find((s) => s.tag === tag && (s.cls === '' ? !block.className.includes('kw-') : block.classList.contains(s.cls)))?.key ?? 'standaard'
}

/** Line spacing on the selected paragraphs. */
export function setLineHeight(root: HTMLElement, value: string) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  const blocks = [...root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, blockquote, li, div')].filter((b) => range.intersectsNode(b))
  const targets = blocks.length ? blocks : [currentBlock(root)].filter((b): b is HTMLElement => !!b)
  targets.forEach((b) => (b.style.lineHeight = value))
}

/** Upper- or lower-case the selected text (Hoofdletters wijzigen). */
export function changeCase(mode: 'upper' | 'lower' | 'title') {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const text = sel.toString()
  const next =
    mode === 'upper' ? text.toLocaleUpperCase('nl') : mode === 'lower' ? text.toLocaleLowerCase('nl') : text.toLocaleLowerCase('nl').replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase('nl'))
  exec('insertText', next)
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export function tableHtml(rows: number, cols: number) {
  const cells = '<td><br></td>'.repeat(cols)
  return `<table class="kw-table"><tbody>${`<tr>${cells}</tr>`.repeat(rows)}</tbody></table><p><br></p>`
}

export function linkHtml(text: string, url: string) {
  const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text || url)}</a>`
}

export function wordArtHtml(text: string, key: string) {
  return `<span class="kw-wordart ${key}">${escapeHtml(text)}</span>&nbsp;`
}

/** Find the next match after the cursor (wrapping round), and select it. False when there's none. */
export function findNext(root: HTMLElement, needle: string, matchCase: boolean): boolean {
  if (!needle) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  const norm = (s: string) => (matchCase ? s : s.toLocaleLowerCase('nl'))
  const sel = window.getSelection()
  const after = sel?.rangeCount ? sel.getRangeAt(0) : null
  const hits: { node: Text; at: number }[] = []
  for (const node of nodes) {
    const hay = norm(node.data)
    let at = hay.indexOf(norm(needle))
    while (at !== -1) {
      hits.push({ node, at })
      at = hay.indexOf(norm(needle), at + 1)
    }
  }
  if (!hits.length) return false
  const isAfter = (h: { node: Text; at: number }) => {
    if (!after) return true
    const r = document.createRange()
    r.setStart(h.node, h.at)
    return r.compareBoundaryPoints(Range.START_TO_END, after) >= 0 && !(h.node === after.startContainer && h.at === after.startOffset)
  }
  const hit = hits.find(isAfter) ?? hits[0]
  const range = document.createRange()
  range.setStart(hit.node, hit.at)
  range.setEnd(hit.node, hit.at + needle.length)
  sel?.removeAllRanges()
  sel?.addRange(range)
  hit.node.parentElement?.scrollIntoView({ block: 'center' })
  return true
}

/** Replace every match in the text (not in tags or attributes); how many were replaced. */
export function replaceAll(root: HTMLElement, needle: string, replacement: string, matchCase: boolean): number {
  if (!needle) return 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi')
  let n = 0
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const next = node.data.replace(pattern, () => {
      n++
      return replacement
    })
    if (next !== node.data) node.data = next
  }
  return n
}

/** The styles a document needs outside the editor (exports and printing), the same as Woord.css draws in it. */
const DOC_CSS = `
body { font-family: Calibri, Carlito, "Segoe UI", sans-serif; font-size: 11pt; line-height: 1.15; color: #000; }
p { margin: 0 0 10pt; }
p.kw-tight { margin: 0; }
p.kw-subtitle { color: #4f81bd; font-style: italic; font-size: 13pt; letter-spacing: 0.5pt; }
h1 { font-family: Cambria, Georgia, serif; font-size: 26pt; font-weight: normal; color: #17365d; border-bottom: 1pt solid #4f81bd; padding-bottom: 4pt; margin: 0 0 15pt; }
h2 { font-family: Cambria, Georgia, serif; font-size: 14pt; color: #365f91; margin: 24pt 0 6pt; }
h3 { font-family: Cambria, Georgia, serif; font-size: 13pt; color: #4f81bd; margin: 10pt 0 4pt; }
blockquote { margin: 10pt 40pt; color: #000; font-style: italic; border-left: 3pt solid #4f81bd; padding-left: 10pt; }
table.kw-table { border-collapse: collapse; width: 100%; margin: 0 0 10pt; }
table.kw-table td { border: 1pt solid #7f7f7f; padding: 3pt 6pt; vertical-align: top; min-width: 20pt; }
hr.kw-pagebreak { border: 0; page-break-after: always; break-after: page; margin: 0; }
img { max-width: 100%; }
img.smiley { vertical-align: middle; }
.kw-wordart { font: bold 32pt Impact, "Arial Black", sans-serif; display: inline-block; }
.wa-blauw { color: #1f497d; background: linear-gradient(#8db3e2, #17365d); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.wa-goud { color: #c9a227; background: linear-gradient(#fff3b0, #d4a017 50%, #8a6d00); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.wa-regenboog { color: #c00000; background: linear-gradient(90deg, #ff0000, #ff9900, #ffee00, #33cc33, #0099ff, #9933ff); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.wa-schaduw { color: #4f81bd; text-shadow: 3px 3px 0 #a6a6a6; }
.wa-omlijnd { color: #fff; -webkit-text-stroke: 1.5px #1f497d; text-shadow: 2px 2px 0 #95b3d7; }
`

function documentHtml(title: string, body: string, s: DocSettings, forWord: boolean) {
  const m = MARGINS[s.margins]
  const page = `@page { size: ${s.orientation === 'liggend' ? '29.7cm 21cm' : '21cm 29.7cm'}; margin: ${m.top}cm ${m.side}cm; }`
  const columns = s.columns > 1 ? `.kw-columns { column-count: ${s.columns}; column-gap: 1.25cm; }` : ''
  const head = `<meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${page}${DOC_CSS}${columns} body { background: ${s.pageColor}; }</style>`
  const content = `<div class="kw-columns">${body}</div>`
  return forWord
    ? `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head>${head}<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]--></head><body>${content}</body></html>`
    : `<!doctype html><html lang="nl"><head>${head}</head><body>${content}</body></html>`
}

/** A file name from the title, without characters file systems don't like. */
const fileName = (title: string, ext: string) => `${title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Document'}.${ext}`

function download(name: string, type: string, data: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Word (.doc, which Word opens as a document), a web page (.html) or plain text (.txt). */
export function exportDocument(kind: 'doc' | 'html' | 'txt', title: string, page: HTMLElement, s: DocSettings) {
  // Smileys and uploaded pictures with a full address, so they still show outside Kuddes
  const body = clean(page.innerHTML).replace(/(src|href)="\/(?!\/)/g, `$1="${location.origin}/`)
  if (kind === 'txt') download(fileName(title, 'txt'), 'text/plain;charset=utf-8', page.innerText)
  else if (kind === 'doc') download(fileName(title, 'doc'), 'application/msword', '﻿' + documentHtml(title, body, s, true))
  else download(fileName(title, 'html'), 'text/html;charset=utf-8', documentHtml(title, body, s, false))
}

/** Print the page alone (as paper, with its margins), from a window of its own. */
export function printDocument(title: string, page: HTMLElement, s: DocSettings) {
  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) return false
  const body = clean(page.innerHTML).replace(/(src|href)="\/(?!\/)/g, `$1="${location.origin}/`)
  win.document.write(documentHtml(title, body, s, false))
  win.document.close()
  // Once the pictures are in; some browsers don't fire load on a written document, so a timer as well (only one prints)
  let printed = false
  const go = () => {
    if (printed || win.closed) return
    printed = true
    win.focus()
    win.print()
  }
  win.onload = go
  setTimeout(go, 800)
  return true
}
