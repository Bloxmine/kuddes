// Apply the saved colour theme and display settings before the first
// paint, so they don't flash (see src/lib/theme.ts and preferences.ts)
try {
  var html = document.documentElement
  var theme = localStorage.getItem('kuddes.theme')
  if (theme) html.dataset.theme = theme
  var vars = theme === 'eigen' && JSON.parse(localStorage.getItem('kuddes.themeVars') || 'null')
  for (var name in vars || {}) html.style.setProperty(name, vars[name])
  // A photo behind the page (src/lib/theme.ts): labels behind the text on it
  if (vars && /url\("\/uploads\//.test(vars['--page-image'] || '')) html.dataset.pageImage = ''
  // Festive decorations and colours (src/components/effects/FestiveEffects.tsx)
  var festive = JSON.parse(localStorage.getItem('kuddes.festive') || 'null')
  if (festive) {
    html.dataset.festive = festive.festive
    if (festive.colors) html.dataset.festiveColors = festive.festive
  }
  var display = JSON.parse(localStorage.getItem('kuddes.display') || 'null')
  if (display) {
    if (display.zoom && display.zoom !== 1) html.style.setProperty('--zoom', display.zoom)
    if (display.compact) html.setAttribute('data-compact', '')
    if (display.reduceMotion) html.setAttribute('data-reduce-motion', '')
  }
} catch {
  // no saved settings: use the defaults
}
