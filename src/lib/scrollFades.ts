/**
 * Rows that swipe sideways on a phone (tab bars, button rows; see mobile.css)
 * fade out at an edge where there's more to see. This keeps data-fade on each
 * such row up to date: "left", "right", both or nothing.
 */
export const HSCROLL_ROWS = [
  '.hscroll',
  '.timeline-tabs',
  '.agenda-tabs',
  '.vt-tabs',
  '.box-tabs',
  '.profile-menu',
  '.smiley-picker-tabs',
  '.profile-hdr-optns',
  '.composer-tools',
  '.kudde-hero-actions',
  '.rc-actions',
  '.fe-toolbar',
  '.ct-pills',
  '.ct-filters',
  '.ct-sort',
  '.ct-cats-list',
  '.catnav-items',
  '.wlm-favs',
  '.newcomers',
].join(',')

function update(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  const fade = max <= 1 ? '' : [el.scrollLeft > 1 && 'left', el.scrollLeft < max - 1 && 'right'].filter(Boolean).join(' ')
  if (el.dataset.fade !== fade) el.dataset.fade = fade
}

export function startScrollFades() {
  const seen = new WeakSet<Element>()
  const resize = new ResizeObserver((entries) => entries.forEach((e) => update(e.target as HTMLElement)))
  let queued = false
  // New rows, and rows whose contents changed (a tab added, a button hidden)
  const scan = () => {
    queued = false
    document.querySelectorAll<HTMLElement>(HSCROLL_ROWS).forEach((el) => {
      if (!seen.has(el)) {
        seen.add(el)
        resize.observe(el)
      }
      update(el)
    })
  }
  new MutationObserver(() => {
    if (queued) return
    queued = true
    requestAnimationFrame(scan)
  }).observe(document.body, { childList: true, subtree: true })
  // Scrolling doesn't bubble, but it can be caught on the way down
  document.addEventListener(
    'scroll',
    (e) => {
      const el = e.target
      if (el instanceof HTMLElement && el.matches(HSCROLL_ROWS)) update(el)
    },
    { capture: true, passive: true },
  )
  scan()
}
