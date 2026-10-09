/**
 * The workings behind Kuddes Presentatie: slide layouts, the look of each
 * element (shared by the editor, the slideshow, printing and the exported
 * web page), shapes as SVG, and the presentation as a web page of its own.
 */
import type { CSSProperties } from 'react'
import { SLIDE_H, SLIDE_THEMES, SLIDE_W, type Presentation, type ShapeKind, type Slide, type SlideElement, type SlideThemeKey } from '../../../shared/documents'

export const newId = () => crypto.randomUUID().slice(0, 8)

export const LAYOUTS = {
  titel: 'Titeldia',
  inhoud: 'Titel en inhoud',
  alleenTitel: 'Alleen titel',
  tweeInhoud: 'Twee inhoudsvakken',
  leeg: 'Leeg',
} as const
export type LayoutKey = keyof typeof LAYOUTS

const title = (y: number, h: number, size: number, align: 'left' | 'center' = 'left'): SlideElement => ({ id: newId(), type: 'text', role: 'title', x: 60, y, w: SLIDE_W - 120, h, text: '', style: { size, align } })
const body = (x: number, y: number, w: number, h: number, size: number, bullets: boolean, align: 'left' | 'center' = 'left'): SlideElement => ({
  id: newId(),
  type: 'text',
  role: 'body',
  x,
  y,
  w,
  h,
  text: '',
  style: { size, bullets, align },
})

export function newSlide(layout: LayoutKey): Slide {
  const elements: SlideElement[] =
    layout === 'titel'
      ? [title(170, 120, 54, 'center'), body(120, 300, SLIDE_W - 240, 90, 28, false, 'center')]
      : layout === 'inhoud'
        ? [title(30, 90, 40), body(60, 140, SLIDE_W - 120, 360, 26, true)]
        : layout === 'alleenTitel'
          ? [title(30, 90, 40)]
          : layout === 'tweeInhoud'
            ? [title(30, 90, 40), body(60, 140, 405, 360, 24, true), body(495, 140, 405, 360, 24, true)]
            : []
  return { id: newId(), elements, notes: '', transition: 'geen', background: null }
}

export const EMPTY_PRESENTATION = (): Presentation => ({ theme: 'office', slides: [newSlide('titel')] })

/** What an empty layout box says in the editor (it says nothing in the slideshow or on paper). */
export const placeholder = (el: SlideElement) => (el.role === 'title' ? 'Klik om een titel toe te voegen' : el.role === 'body' ? 'Klik om tekst toe te voegen' : 'Typ hier je tekst')

export function slideBackground(slide: Slide, theme: SlideThemeKey) {
  const t = SLIDE_THEMES[theme]
  return slide.background ? slide.background : `linear-gradient(135deg, ${t.bg} 0%, ${t.bg} 55%, ${t.bg2} 140%)`
}

/** The look of a text box or shape's text: the theme's fonts and colours for a layout's boxes, unless set. */
export function textStyle(el: SlideElement, theme: SlideThemeKey): CSSProperties {
  const t = SLIDE_THEMES[theme]
  const s = el.style ?? {}
  return {
    fontFamily: s.font ?? (el.role === 'title' ? t.titleFont : t.font),
    fontSize: s.size ?? (el.role === 'title' ? 40 : 24),
    fontWeight: s.bold ? 'bold' : 'normal',
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: s.underline ? 'underline' : 'none',
    color: s.color ?? (el.type === 'shape' ? '#ffffff' : el.role === 'title' ? t.title : t.text),
    textAlign: s.align ?? (el.type === 'shape' ? 'center' : 'left'),
    lineHeight: 1.2,
  }
}

/** A shape as SVG, stretched to its box. Only the editor's own shapes and checked colours go in. */
export function shapeSvg(shape: ShapeKind, fill: string, line: string): string {
  const common = `fill="${fill}" stroke="${line}" stroke-width="2" vector-effect="non-scaling-stroke"`
  const body =
    shape === 'rect'
      ? `<rect x="1" y="1" width="98" height="98" ${common}/>`
      : shape === 'round'
        ? `<rect x="1" y="1" width="98" height="98" rx="14" ry="14" ${common}/>`
        : shape === 'ellipse'
          ? `<ellipse cx="50" cy="50" rx="49" ry="49" ${common}/>`
          : shape === 'triangle'
            ? `<polygon points="50,1 99,99 1,99" ${common}/>`
            : shape === 'arrow'
              ? `<polygon points="1,30 62,30 62,4 99,50 62,96 62,70 1,70" ${common}/>`
              : `<polygon points="50,2 61,37 98,37 68,59 79,95 50,73 21,95 32,59 2,37 39,37" ${common}/>`
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">${body}</svg>`
}

const css = (style: CSSProperties) =>
  Object.entries(style)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${typeof v === 'number' && !['lineHeight', 'fontWeight', 'opacity', 'zIndex'].includes(k) ? `${v}px` : v}`)
    .join(';')
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** The text of a box as HTML: lines, or a bulleted list. */
export function textHtml(el: SlideElement) {
  const lines = (el.text ?? '').split('\n')
  if (el.style?.bullets) return `<ul>${lines.map((l) => `<li>${esc(l) || '&nbsp;'}</li>`).join('')}</ul>`
  return lines.map((l) => `<div>${esc(l) || '&nbsp;'}</div>`).join('')
}

/** One slide as HTML (for printing and the exported web page), at 960×540. */
export function slideHtml(slide: Slide, theme: SlideThemeKey) {
  const els = slide.elements
    .map((el) => {
      const box = css({ position: 'absolute', left: el.x, top: el.y, width: el.w, height: el.h })
      if (el.type === 'image') return `<img src="${esc(el.src ?? '')}" alt="" style="${box};object-fit:contain">`
      const text = el.text ? `<div class="t ${el.type === 'shape' ? 'mid' : ''}" style="${css(textStyle(el, theme))}">${textHtml(el)}</div>` : ''
      if (el.type === 'shape') return `<div style="${box}">${shapeSvg(el.shape ?? 'rect', el.fill ?? SLIDE_THEMES[theme].accent, el.line ?? '#385d8a')}${text}</div>`
      return `<div style="${box}">${text}</div>`
    })
    .join('')
  return `<div class="slide" style="background:${slideBackground(slide, theme)}">${els}</div>`
}

const SLIDE_CSS = `
.slide { position: relative; width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; }
.slide .t { position: absolute; inset: 0; padding: 6px 10px; overflow: hidden; overflow-wrap: break-word; }
.slide .t.mid { display: flex; flex-direction: column; justify-content: center; }
.slide ul { margin: 0; padding-left: 1.1em; list-style: disc; }
.slide li { margin: 0 0 0.25em; }
.slide svg { position: absolute; inset: 0; }
`

/** The presentation as one web page: a slide at a time, the arrow keys or a click to go on, F for full screen. */
export function presentationHtml(name: string, p: Presentation) {
  const slides = p.slides.map((s, i) => `<section class="wrap${i === 0 ? ' on' : ''}">${slideHtml(s, p.theme)}</section>`).join('')
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(name)}</title><style>
html, body { margin: 0; height: 100%; background: #111; overflow: hidden; }
.wrap { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; }
.wrap.on { display: flex; }
.wrap .slide { transform-origin: center; box-shadow: 0 0 30px rgba(0,0,0,.6); }
${SLIDE_CSS}
.hint { position: fixed; right: 12px; bottom: 10px; color: #888; font: 12px sans-serif; }
</style></head><body>${slides}<div class="hint">← → om te bladeren · F voor volledig scherm</div><script>
var s = document.querySelectorAll('.wrap'), i = 0;
function fit() { var k = Math.min(innerWidth / ${SLIDE_W}, innerHeight / ${SLIDE_H}); s.forEach(function (w) { w.firstChild.style.transform = 'scale(' + k + ')'; }); }
function go(n) { s[i].classList.remove('on'); i = Math.max(0, Math.min(s.length - 1, n)); s[i].classList.add('on'); }
addEventListener('resize', fit); fit();
addEventListener('keydown', function (e) { if (['ArrowRight', 'PageDown', ' ', 'Enter'].indexOf(e.key) > -1) go(i + 1); else if (['ArrowLeft', 'PageUp', 'Backspace'].indexOf(e.key) > -1) go(i - 1); else if (e.key === 'f') document.documentElement.requestFullscreen(); });
addEventListener('click', function () { go(i + 1); });
</script></body></html>`
}

/** Printing: one slide per page, landscape, as large as the page allows. */
export function printPresentation(name: string, p: Presentation) {
  const win = window.open('', '_blank', 'width=1000,height=700')
  if (!win) return false
  const pages = p.slides.map((s) => `<div class="page">${slideHtml(s, p.theme)}</div>`).join('')
  win.document.write(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(name)}</title><style>
@page { size: A4 landscape; margin: 1cm; }
body { margin: 0; }
.page { page-break-after: always; break-after: page; }
.page .slide { zoom: 1.08; border: 1px solid #ccc; }
${SLIDE_CSS}
</style></head><body>${pages}</body></html>`)
  win.document.close()
  setTimeout(() => {
    win.focus()
    win.print()
  }, 500)
  return true
}
