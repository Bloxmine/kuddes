/** Small deterministic hash so the same seed always gets the same colours. */
export function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A two-stop gradient picked from the seed, used when there's no real image. */
export function seededGradient(seed: string): string {
  const h = hash(seed)
  const hue = h % 360
  const hue2 = (hue + 30 + (h % 40)) % 360
  return `linear-gradient(135deg, hsl(${hue} 55% 62%) 0%, hsl(${hue2} 60% 45%) 100%)`
}

export function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)
  if (parts.length === 0 || !parts[0]) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + last).toUpperCase()
}
