import { useEffect, useState } from 'react'
import { luminance } from '../../shared/customization'

/** Whether the site is shown dark: the dark theme, Halloween colours or a dark own theme (read from --surface). */
function siteIsDark() {
  const html = document.documentElement
  const surface = getComputedStyle(html).getPropertyValue('--surface').trim()
  if (/^#[0-9a-f]{6}$/i.test(surface)) return luminance(surface) <= 0.3
  return html.dataset.theme === 'donker' || html.dataset.festiveColors === 'halloween'
}

/** Follows the site theme as it changes (switching themes, a preview, the seasons). */
export function useSiteDark() {
  const [dark, setDark] = useState(siteIsDark)
  useEffect(() => {
    const update = () => setDark(siteIsDark())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-festive-colors', 'style'] })
    update()
    return () => observer.disconnect()
  }, [])
  return dark
}
