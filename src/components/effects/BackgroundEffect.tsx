import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { BACKGROUND_EFFECTS, type BackgroundEffect as Effect, type BackgroundEffectKind } from '../../../shared/backgroundEffects'
import './BackgroundEffect.css'

/** How many pieces a kind starts with, per 900 pixels of height, at "normaal". */
const COUNT: Record<BackgroundEffectKind, number> = {
  sterren: 55,
  sneeuw: 45,
  regen: 70,
  vuurvliegjes: 22,
  bubbels: 26,
  hartjes: 20,
  confetti: 40,
  bladeren: 22,
  bloesem: 30,
  vallendesterren: 5,
  glitter: 40,
}
const AMOUNT = { weinig: 0.5, normaal: 1, veel: 1.7 } as const
/** px per second a piece falls or rises, [slowest, fastest] */
const SPEED: Partial<Record<BackgroundEffectKind, [number, number]>> = {
  sneeuw: [30, 75],
  regen: [520, 800],
  bubbels: [22, 55],
  hartjes: [25, 55],
  confetti: [45, 95],
  bladeren: [28, 60],
  bloesem: [22, 42],
}
/** Size multiplier, [smallest, biggest] */
const SIZE: Record<BackgroundEffectKind, [number, number]> = {
  sterren: [0.6, 1.5],
  sneeuw: [0.6, 1.8],
  regen: [0.7, 1.4],
  vuurvliegjes: [0.7, 1.4],
  bubbels: [0.5, 1.8],
  hartjes: [0.6, 1.4],
  confetti: [0.8, 1.3],
  bladeren: [0.7, 1.4],
  bloesem: [0.7, 1.4],
  vallendesterren: [0.8, 1.2],
  glitter: [0.6, 1.5],
}

/** The same "random" every time, so a design looks the same at every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Piece = CSSProperties & Record<`--${string}`, string | number>

function makePieces(kind: BackgroundEffectKind, count: number): Piece[] {
  const rnd = seeded([...kind].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7))
  const between = (a: number, b: number) => a + rnd() * (b - a)
  const speed = SPEED[kind]
  return Array.from({ length: count }, () => {
    const piece: Piece = {
      '--x': `${between(0, 100).toFixed(2)}%`,
      '--y': `${between(0, 100).toFixed(2)}%`,
      '--s': between(...SIZE[kind]).toFixed(2),
      '--o': between(0.45, 1).toFixed(2),
      // Seconds for one swing, blink or wander
      '--d': between(2, 5).toFixed(2),
      '--g': between(1.4, 3.6).toFixed(2),
      '--t': `-${between(0, 60).toFixed(1)}s`,
      '--h': Math.round(between(0, 360)),
      '--dx': `${Math.round(between(-50, 50))}px`,
      '--ax': `${Math.round(between(-70, 70))}px`,
      '--ay': `${Math.round(between(-60, 60))}px`,
      '--bx': `${Math.round(between(-70, 70))}px`,
      '--by': `${Math.round(between(-60, 60))}px`,
    }
    if (speed) piece['--v'] = Math.round(between(...speed))
    // Leaves are orange to yellow-brown, confetti any colour
    if (kind === 'bladeren') piece['--h'] = Math.round(between(8, 48))
    // Shooting stars and wandering lights take their time
    if (kind === 'vallendesterren') piece['--d'] = between(7, 15).toFixed(1)
    if (kind === 'vuurvliegjes') piece['--d'] = between(12, 26).toFixed(1)
    if (kind === 'glitter') piece['--d'] = between(1.4, 3.4).toFixed(2)
    return piece
  })
}

/**
 * A moving background (shared/backgroundEffects.ts): little pieces that fall,
 * rise, blink or wander, drawn by CSS animations. It fills its parent (which
 * needs `position: relative` and, to stay behind the content, its own stacking
 * context) or the whole window with `fixed`. `mini` is the small version for
 * the picker. Hidden by "Minder beweging".
 */
export function BackgroundEffect({ effect, fixed, mini }: { effect: Effect; fixed?: boolean; mini?: boolean }) {
  const [height, setHeight] = useState(mini ? 80 : 900)
  // Callback ref (with cleanup) that follows the height, so a tall page gets more pieces and fall speeds stay the same
  const watch = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const update = () => setHeight(Math.max(60, Math.round(el.clientHeight)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const kind = effect.kind in BACKGROUND_EFFECTS ? effect.kind : 'sterren'
  const per900 = COUNT[kind] * AMOUNT[effect.amount ?? 'normaal']
  const count = mini ? Math.max(8, Math.round(COUNT[kind] / 5)) : Math.min(110, Math.round(per900 * Math.min(3, Math.max(1, height / 900))))
  const pieces = useMemo(() => makePieces(kind, count), [kind, count])
  const style = { '--hn': height, ...(effect.color ? { '--c': effect.color } : null) } as CSSProperties
  return (
    <div ref={watch} className={`bgfx bgfx-${kind}${fixed ? ' bgfx-fixed' : ''}${mini ? ' bgfx-mini' : ''}`} style={style} aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={p} />
      ))}
    </div>
  )
}
