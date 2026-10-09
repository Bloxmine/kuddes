import { useRef, type KeyboardEvent } from 'react'

/**
 * Toolbar helpers for a textarea with light formatting: wrap the selection
 * in **…** / *…* / ~~…~~, add a link, or insert a smiley code at the cursor.
 * Put the returned `ref` on the textarea.
 */
export function useTextEditing(text: string, setText: (next: string) => void, max: number) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const focusAt = (start: number, end = start) =>
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(start, end)
    })

  /** Wraps the selected text, e.g. **vet**; selects the placeholder when nothing was selected. */
  const wrap = (before: string, after = before, placeholder = 'tekst') => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? text.length
    const end = el.selectionEnd ?? start
    const selected = text.slice(start, end) || placeholder
    const next = text.slice(0, start) + before + selected + after + text.slice(end)
    if (next.length > max) return
    setText(next)
    focusAt(start + before.length, start + before.length + selected.length)
  }

  const addLink = () => {
    const url = prompt('Plak de link (https://... of een pagina op Kuddes, zoals /spellen)')
    if (!url) return
    if (!/^(https?:\/\/|\/(?!\/))/i.test(url)) return alert('Een link moet beginnen met http:// of https://, of met / voor een pagina op Kuddes')
    wrap('[', `](${url})`, 'linktekst')
  }

  /** A link from the link picker: around the selected text, or with `title` as its text. */
  const linkTo = (href: string, title: string) => wrap('[', `](${href})`, title.replace(/[[\]]/g, '').slice(0, 100) || 'linktekst')

  /** Inserts a snippet (a smiley code) at the cursor, with spaces around it. */
  const insert = (snippet: string) => {
    const at = ref.current?.selectionStart ?? text.length
    const before = text.slice(0, at)
    const pad = before && !/\s$/.test(before) ? ' ' : ''
    const next = before + pad + snippet + ' ' + text.slice(at)
    if (next.length > max) return
    setText(next)
    focusAt(at + pad.length + snippet.length + 1)
  }

  /**
   * Bullet lists while typing (put it on the textarea's onKeyDown): "- " at
   * the start of a line becomes "• ", Enter on a bullet starts the next one,
   * and Enter on an empty bullet ends the list. Shift+Enter is a plain new line.
   */
  const listKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing) return
    const el = e.currentTarget
    const value = el.value
    const start = el.selectionStart
    if (start !== el.selectionEnd) return
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    // Changed in the textarea itself, so the cursor is right at once, even when typing fast
    const replace = (insert: string, from: number, to: number, caret: 'start' | 'end') => {
      if (value.length - (to - from) + insert.length > max) return
      e.preventDefault()
      el.setRangeText(insert, from, to, caret)
      setText(el.value)
    }
    if (e.key === ' ' && value.slice(lineStart, start) === '-') {
      replace('• ', lineStart, start, 'end')
    } else if (e.key === 'Enter' && !e.shiftKey) {
      const lineEnd = value.indexOf('\n', start)
      const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd)
      if (!line.startsWith('• ')) return
      // An empty bullet: the list is done, the line becomes normal again
      if (!line.slice(2).trim()) replace('', lineStart, lineStart + line.length, 'start')
      else replace('\n• ', start, start, 'end')
    }
  }

  return { ref, wrap, addLink, linkTo, insert, listKeys }
}

/** Whether a text uses smileys or formatting, i.e. whether a preview adds anything. */
export const hasMarkup = (text: string) => /:[A-Za-z0-9_]+:|\*\*|~~|\*[^*\s]|\[[^\]]+\]\(|[:;]-?[)(dpsDPS$]|\((l|h)\)/.test(text)
