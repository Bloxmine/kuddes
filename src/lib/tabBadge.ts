/**
 * The tab shows how much is new: "(3) Overzicht - Kuddes" in the title, and
 * a red dot with the number on the icon. Pages set their own title
 * (usePageTitle); the number goes in front of it.
 */
let base = typeof document !== 'undefined' ? document.title : ''
let count = 0
let showCount = true
let showIcon = true
let plainIcon: string | null = null
let drawn = ''

function applyTitle() {
  document.title = showCount && count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base
}

/** From usePageTitle. */
export function setBaseTitle(title: string) {
  base = title
  applyTitle()
}

export function setTabCount(next: number, options: { title: boolean; icon: boolean }) {
  count = next
  showCount = options.title
  showIcon = options.icon
  applyTitle()
  void applyIcon()
}

function iconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]')
}

async function applyIcon() {
  const link = iconLink()
  if (!link) return
  plainIcon ??= link.href
  const want = showIcon && count > 0 ? String(count > 99 ? '99+' : count) : ''
  if (want === drawn) return
  drawn = want
  if (!want) {
    link.href = plainIcon
    return
  }
  try {
    const img = new Image()
    img.src = plainIcon
    await img.decode()
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0, size, size)
    // The dot in the bottom right corner
    const r = want.length > 1 ? 22 : 18
    ctx.beginPath()
    ctx.arc(size - r, size - r, r, 0, Math.PI * 2)
    ctx.fillStyle = '#e0362c'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = '#fff'
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.font = `bold ${want.length > 2 ? 18 : want.length > 1 ? 24 : 28}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(want, size - r, size - r + 1)
    if (drawn === want) link.href = canvas.toDataURL('image/png')
  } catch {
    // an icon that can't be drawn: leave it
  }
}
