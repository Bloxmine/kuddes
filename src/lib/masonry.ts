import { useCallback, useRef } from 'react'

/**
 * Cards of different heights side by side without gaps, still in reading
 * order from left to right. The grid has thin rows (`grid-auto-rows` in CSS,
 * `row-gap: 0`); every card spans as many rows as it is tall, and is measured
 * again when it changes (a photo loading, reactions opening).
 * Returns a callback ref for the grid; pass `on = false` to leave it alone.
 */
export function useMasonry(on: boolean, gap = 10) {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback(
    (grid: HTMLElement | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!grid || !on) return
      const fit = (card: HTMLElement) => {
        const style = getComputedStyle(grid)
        const row = parseFloat(style.gridAutoRows) || 4
        // Measured heights are on screen, rows are in CSS pixels: they differ when
        // the page is zoomed (Weergave → tekstgrootte zooms the body)
        const zoom = grid.getBoundingClientRect().width / (parseFloat(style.width) || grid.getBoundingClientRect().width) || 1
        const height = card.getBoundingClientRect().height / zoom
        card.style.gridRowEnd = `span ${Math.max(1, Math.ceil((height + gap) / row))}`
      }
      const sizes = new ResizeObserver((entries) => entries.forEach((e) => fit(e.target as HTMLElement)))
      const watch = () => [...grid.children].forEach((c) => sizes.observe(c))
      const added = new MutationObserver(watch)
      watch()
      added.observe(grid, { childList: true })
      cleanup.current = () => {
        sizes.disconnect()
        added.disconnect()
        ;[...grid.children].forEach((c) => (c as HTMLElement).style.removeProperty('grid-row-end'))
      }
    },
    [on, gap],
  )
}
