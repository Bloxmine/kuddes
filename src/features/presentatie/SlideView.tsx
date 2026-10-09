import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { SLIDE_H, SLIDE_THEMES, SLIDE_W, type Slide, type SlideElement, type SlideThemeKey } from '../../../shared/documents'
import { placeholder, shapeSvg, slideBackground, textStyle } from './slides'

export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export type SlideEditing = {
  selected: string | null
  editing: string | null
  onPointerDown: (el: SlideElement, e: React.PointerEvent, handle: Handle) => void
  onEdit: (el: SlideElement) => void
  onText: (el: SlideElement, text: string) => void
  onDone: () => void
  onBackground: () => void
}

function Text({ el, theme, edit }: { el: SlideElement; theme: SlideThemeKey; edit?: SlideEditing }) {
  const style = textStyle(el, theme)
  const area = useRef<HTMLTextAreaElement>(null)
  const editing = edit?.editing === el.id
  useLayoutEffect(() => {
    if (!editing) return
    const t = area.current
    t?.focus()
    t?.setSelectionRange(t.value.length, t.value.length)
  }, [editing])
  if (editing) {
    return (
      <textarea
        ref={area}
        className={el.type === 'shape' ? 'ps-text ps-text-edit mid' : 'ps-text ps-text-edit'}
        style={style}
        value={el.text ?? ''}
        onChange={(e) => edit.onText(el, e.target.value)}
        onBlur={edit.onDone}
        onKeyDown={(e) => e.key === 'Escape' && edit.onDone()}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Tekst"
      />
    )
  }
  const lines = (el.text ?? '').split('\n')
  const empty = !(el.text ?? '').trim()
  // An empty layout box or text box says what it's for (in the editor only); an empty shape just stays a shape
  if (empty && (!edit || el.type === 'shape')) return null
  return (
    <div className={`ps-text${el.type === 'shape' ? ' mid' : ''}${empty ? ' placeholder' : ''}`} style={style}>
      {empty ? (
        <div>{placeholder(el)}</div>
      ) : el.style?.bullets ? (
        <ul>
          {lines.map((l, i) => (
            <li key={i}>{l || ' '}</li>
          ))}
        </ul>
      ) : (
        lines.map((l, i) => <div key={i}>{l || ' '}</div>)
      )}
    </div>
  )
}

/**
 * One slide, drawn at 960×540 and scaled to `width`. For the editor (with
 * `edit`) its elements can be selected, moved, resized and typed in; without
 * it, it's a thumbnail or the slideshow.
 */
export function SlideView({ slide, theme, width, edit, className }: { slide: Slide; theme: SlideThemeKey; width: number; edit?: SlideEditing; className?: string }) {
  const scale = width / SLIDE_W
  const t = SLIDE_THEMES[theme]
  return (
    <div className={`ps-frame${className ? ` ${className}` : ''}`} style={{ width, height: SLIDE_H * scale }}>
      <div
        className="ps-slide"
        style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, background: slideBackground(slide, theme) }}
        onPointerDown={(e) => {
          if (edit && e.target === e.currentTarget) edit.onBackground()
        }}
      >
        {slide.elements.map((el) => {
          const box: CSSProperties = { left: el.x, top: el.y, width: el.w, height: el.h }
          const selected = edit?.selected === el.id
          const cls = `ps-el ps-el-${el.type}${selected ? ' on' : ''}${edit ? ' editable' : ''}`
          return (
            <div
              key={el.id}
              className={cls}
              style={box}
              onPointerDown={edit ? (e) => edit.onPointerDown(el, e, 'move') : undefined}
              onDoubleClick={edit && el.type !== 'image' ? () => edit.onEdit(el) : undefined}
            >
              {el.type === 'image' && el.src && <img src={el.src} alt="" draggable={false} />}
              {el.type === 'shape' && <span className="ps-shape" dangerouslySetInnerHTML={{ __html: shapeSvg(el.shape ?? 'rect', el.fill ?? t.accent, el.line ?? '#385d8a') }} />}
              {el.type !== 'image' && <Text el={el} theme={theme} edit={edit} />}
              {selected &&
                edit?.editing !== el.id &&
                HANDLES.map((h) => <span key={h} className={`ps-handle ${h}`} style={{ '--ps-inv': 1 / scale } as CSSProperties} onPointerDown={(e) => edit.onPointerDown(el, e, h)} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
