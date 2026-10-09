/** The state of typing in a Messenger conversation (Compose.tsx shows it). */
import { useCallback, useRef, useState } from 'react'
import type { Glitter } from '../../../shared/glitters'
import { MESSENGER_LIMITS } from '../../../shared/messenger'

export type ComposeBody = { text: string; glitterId: number | null; share: string | null }
export type ComposePanel = 'smileys' | 'glitters' | 'share' | null

export function useCompose({ onSend, onTyping }: { onSend: (body: ComposeBody, sent: () => void) => void; onTyping: () => void }) {
  const [text, setText] = useState('')
  const [panel, setPanel] = useState<ComposePanel>(null)
  // Something from the site that goes with the message (a page address)
  const [share, setShare] = useState<string | null>(null)
  const [glitter, setGlitter] = useState<Glitter | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  // A callback ref for the box (the hook's own ref stays inside it)
  const setInput = useCallback((el: HTMLTextAreaElement | null) => {
    input.current = el
  }, [])
  const lastTyping = useRef(0)

  const focus = useCallback(() => void window.setTimeout(() => input.current?.focus(), 30), [])
  const say = () => {
    const value = text.trim()
    if (!value && !glitter && !share) return
    onSend({ text: value, glitterId: glitter?.id ?? null, share }, () => {
      setText('')
      setGlitter(null)
      setShare(null)
    })
  }
  const type = (value: string) => {
    setText(value)
    if (value.trim() && Date.now() - lastTyping.current > 3000) {
      lastTyping.current = Date.now()
      onTyping()
    }
  }
  const insert = (code: string) => {
    const el = input.current
    const at = el?.selectionStart ?? text.length
    const next = `${text.slice(0, at)}${code}${text.slice(el?.selectionEnd ?? at)}`
    setText(next.slice(0, MESSENGER_LIMITS.text))
    // The picker stays open, so you can add a few in a row
    window.setTimeout(() => {
      el?.focus()
      el?.setSelectionRange(at + code.length, at + code.length)
    }, 0)
  }
  return { text, panel, setPanel, share, setShare, glitter, setGlitter, setInput, focus, say, type, insert, ready: !!(text.trim() || glitter || share) }
}

export type Compose = ReturnType<typeof useCompose>
