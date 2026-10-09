import { useEffect } from 'react'

/** Space between the window's top (or bottom) and a column that stays in place. */
const GAP = 14

/**
 * Right-hand columns (class `sticky-side`) stay in view while the page
 * scrolls, as "Mijn bestanden" on Tools does. Only when the column really is
 * beside the main one (not under it, on a phone). A column taller than the
 * window scrolls along until its bottom shows, then stays, so nothing in it
 * gets out of reach.
 */
function place(el: HTMLElement) {
  const parent = el.parentElement
  const beside = !!parent && el.getBoundingClientRect().left > parent.getBoundingClientRect().left + 40
  if (!beside) {
    el.removeAttribute('data-side-sticky')
    return
  }
  // In the column's own CSS pixels: the text size setting zooms the page
  const k = el.getBoundingClientRect().height / (el.offsetHeight || 1) || 1
  const room = window.innerHeight / k
  const h = el.offsetHeight
  el.style.setProperty('--side-top', `${h + GAP * 2 <= room ? GAP : Math.round(room - h - GAP)}px`)
  el.setAttribute('data-side-sticky', '')
}

/** Keeps every `sticky-side` column placed, also ones that appear or change size later. */
export function useStickySides() {
  useEffect(() => {
    const sized = new ResizeObserver((entries) => entries.forEach((e) => place(e.target as HTMLElement)))
    const seen = new Set<HTMLElement>()
    const scan = () => {
      for (const el of document.querySelectorAll<HTMLElement>('.sticky-side')) {
        if (seen.has(el)) continue
        seen.add(el)
        sized.observe(el)
      }
      for (const el of seen)
        if (!el.isConnected) {
          sized.unobserve(el)
          seen.delete(el)
        }
    }
    let queued = 0
    const changed = new MutationObserver(() => {
      cancelAnimationFrame(queued)
      queued = requestAnimationFrame(scan)
    })
    changed.observe(document.body, { childList: true, subtree: true })
    const resized = () => seen.forEach(place)
    window.addEventListener('resize', resized)
    scan()
    return () => {
      cancelAnimationFrame(queued)
      changed.disconnect()
      sized.disconnect()
      window.removeEventListener('resize', resized)
    }
  }, [])
}
