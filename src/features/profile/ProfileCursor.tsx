import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cursorUrl, type ProfileCursor as CursorKey } from '../../../shared/cursors'
import { usePreferences } from '../../lib/preferences'
import './ProfileCursor.css'

/** Where you need your own pointer: typing, choosing, and embedded players (which don't pass the mouse on). */
const NATIVE = 'input, textarea, select, [contenteditable="true"], iframe'

const hasMouse = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches
const reducedMotion = () => document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The animated cursor someone picked for their profile: a GIF that follows
 * the mouse while the real pointer is hidden (CSS cursors don't animate).
 * Visitors can switch these off under Weergave, and "Minder beweging" or a
 * touch screen leaves the normal pointer alone. With `area` it only shows
 * inside that element (the preview in the settings), and always.
 */
export function ProfileCursor({ cursor, area }: { cursor: CursorKey | null; area?: HTMLElement | null }) {
  const { prefs } = usePreferences()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const wanted = !!cursor && (area !== undefined || (prefs.profileCursors && !prefs.reduceMotion))
  const on = wanted && hasMouse() && !reducedMotion()

  useEffect(() => {
    if (!img || (area !== undefined && !area)) return
    const html = document.documentElement
    const show = (yes: boolean) => {
      img.hidden = !yes
      html.toggleAttribute('data-gif-cursor', yes)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return show(false)
      const target = e.target instanceof Element ? e.target : null
      // The text size is a zoom on <body> (global.css), which also scales this image and where it goes;
      // the mouse position isn't zoomed, so undo it to stay on the pointer at the real size
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1
      img.style.transform = `translate(${e.clientX / zoom}px, ${e.clientY / zoom}px) scale(${1 / zoom})`
      show(!!target && !target.closest(NATIVE) && (!area || area.contains(target)))
    }
    // Out of the window (or into a video player): the GIF would stay behind
    const leave = (e: PointerEvent) => {
      if (!e.relatedTarget || e.relatedTarget instanceof HTMLIFrameElement) show(false)
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerout', leave)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      html.removeAttribute('data-gif-cursor')
    }
  }, [img, area])

  if (!on) return null
  return createPortal(<img ref={setImg} className="gif-cursor" src={cursorUrl(cursor!)} width={32} height={32} alt="" aria-hidden="true" hidden />, document.body)
}
