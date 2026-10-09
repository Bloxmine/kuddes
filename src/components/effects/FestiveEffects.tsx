import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { activeFestivity, type Festivity } from '../../../shared/festive'
import { usePreferences } from '../../lib/preferences'
import { startParticles, type ParticleConfig } from './particles'
import './FestiveEffects.css'
import './FestiveSky.css'

const AMOUNT = { weinig: 0.45, normaal: 1, veel: 2 } as const

const EFFECTS: Record<Festivity, ParticleConfig> = {
  kerst: { snow: 90, leaves: 0, batsPerMinute: 0, leafColors: [] },
  winter: { snow: 150, leaves: 0, batsPerMinute: 0, leafColors: [] },
  herfst: { snow: 0, leaves: 28, batsPerMinute: 0, leafColors: ['#d9531e', '#e8891c', '#c43c1c', '#f2b134', '#9c4a1a', '#b87333'] },
  halloween: { snow: 0, leaves: 16, batsPerMinute: 5, leafColors: ['#e8741c', '#b8560d', '#6d3f8f', '#8a2b0f'] },
  lente: { snow: 0, leaves: 40, batsPerMinute: 0, leafColors: ['#ffc4dc', '#ffb0cf', '#ffd6e6', '#fce3ee', '#f7a1c4'], leafShape: 'petal' },
  valentijn: { snow: 0, leaves: 30, batsPerMinute: 0, leafColors: ['#e8384f', '#ff6f91', '#c81d3a', '#ff9ec0', '#f5507a'], leafShape: 'heart' },
  pasen: { snow: 0, leaves: 34, batsPerMinute: 0, leafColors: ['#ffe27a', '#c9b6f2', '#b9e4a3', '#ffc4dc', '#a8dcff', '#ffffff'], leafShape: 'petal' },
  sinterklaas: { snow: 0, leaves: 26, batsPerMinute: 0, leafColors: ['#a8642c', '#b5713a', '#94541f', '#c07c43'], leafShape: 'pepernoot' },
  zomer: { snow: 0, leaves: 9, batsPerMinute: 0, leafColors: ['#f7a33b', '#4ba3e0', '#f26b9a', '#ffd23f', '#8b72d9', '#5fc39a'], leafShape: 'butterfly' },
}

/** The same "random" every time, so the trees don't change shape on every visit. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Twig = { d: string; w: number }

/** A bare, crooked tree: every branch splits into two or three thinner, bent ones. */
function spookyTree(seed: number): Twig[] {
  const rnd = seeded(seed)
  const twigs: Twig[] = []
  const grow = (x: number, y: number, angle: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(angle) * len
    const y2 = y + Math.sin(angle) * len
    // A bend halfway, so no branch is straight
    const bend = (rnd() - 0.5) * len * 0.5
    const cx = (x + x2) / 2 + Math.cos(angle + Math.PI / 2) * bend
    const cy = (y + y2) / 2 + Math.sin(angle + Math.PI / 2) * bend
    twigs.push({ d: `M${x.toFixed(1)} ${y.toFixed(1)}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, w })
    if (depth === 0) return
    const n = rnd() < 0.3 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const spread = (i / (n - 1) - 0.5) * (0.9 + rnd() * 0.6)
      grow(x2, y2, angle + spread + (rnd() - 0.5) * 0.3, len * (0.62 + rnd() * 0.18), Math.max(1, w * 0.62), depth - 1)
    }
  }
  // The trunk leans a little, then the crown spreads out
  grow(200, 600, -Math.PI / 2 + (rnd() - 0.5) * 0.15, 170, 34, 7)
  return twigs
}

function SpookyTree({ seed, side }: { seed: number; side: 'left' | 'right' }) {
  const [twigs] = useState(() => spookyTree(seed))
  return (
    <svg className={`festive-tree ${side}`} viewBox="0 0 400 600" preserveAspectRatio="xMidYMax meet">
      {/* Roots */}
      <path d="M200 600 C185 585 150 590 120 600 M200 600 C215 580 255 588 290 600 M200 600 C196 590 178 596 165 600" strokeWidth={10} />
      {twigs.map((t, i) => (
        <path key={i} d={t.d} strokeWidth={t.w} />
      ))}
    </svg>
  )
}

/** The jack-o'-lantern grin on the Halloween moon: eyes, a nose and a jagged mouth, carved out. */
function MoonGrin() {
  return (
    <svg className="festive-grin" viewBox="0 0 100 100">
      <path d="M22 40 L38 26 L42 44 Z" />
      <path d="M78 40 L62 26 L58 44 Z" />
      <path d="M50 46 L45 56 L55 56 Z" />
      <path d="M18 60 Q50 92 82 60 L74 63 L70 70 L63 66 L58 74 L50 69 L42 74 L37 66 L30 70 L26 63 Z" />
    </svg>
  )
}

type SkySeason = Festivity

/**
 * Behind the page on dark seasons: a night sky with a big moon and twinkling
 * stars (every season on the dark theme, each in its own colours), and at
 * Halloween a grinning moon over spooky trees. It's in the page for these seasons, and the CSS
 * only shows it with the matching colours.
 */
function NightSky({ season }: { season: SkySeason }) {
  // Scattered once; the upper part of the sky gets the most stars
  const [stars] = useState(() =>
    Array.from({ length: season === 'halloween' ? 60 : 140 }, () => {
      const big = Math.random() < 0.08
      return {
        left: Math.random() * 100,
        top: Math.random() ** 1.6 * (season === 'halloween' ? 70 : 100),
        size: big ? 3 : Math.random() < 0.35 ? 2 : 1,
        big,
        delay: Math.random() * 6,
        speed: 2.5 + Math.random() * 4,
      }
    }),
  )
  return (
    <div className={`festive-sky ${season}`} aria-hidden="true">
      {stars.map((st, i) => (
        <span
          key={i}
          className={st.big ? 'festive-star big' : 'festive-star'}
          style={{ left: `${st.left}%`, top: `${st.top}%`, width: st.size, height: st.size, animationDelay: `${st.delay}s`, animationDuration: `${st.speed}s` }}
        />
      ))}
      <div className="festive-moon">{season === 'halloween' && <MoonGrin />}</div>
      {season === 'halloween' && (
        <>
          <SpookyTree seed={31} side="left" />
          <SpookyTree seed={77} side="right" />
        </>
      )}
    </div>
  )
}

/**
 * The Farm-Fresh icons on the ground at the bottom of the page, repeated
 * along it ("big": a tree; "up": flying or hanging higher, like a butterfly).
 */
const GROUND: Record<Festivity, { icon: string; big?: boolean; up?: boolean }[]> = {
  kerst: [{ icon: 'christmas_tree', big: true }, { icon: 'card_gift' }, { icon: 'snowman' }, { icon: 'candy_cane' }],
  winter: [{ icon: 'tree_white', big: true }, { icon: 'snowman' }, { icon: 'tree_white' }, { icon: 'snowman_head' }],
  halloween: [{ icon: 'emotion_pumpkin' }, { icon: 'skull_old' }, { icon: 'emotion_ghost', up: true }, { icon: 'emotion_pumpkin', big: true }],
  herfst: [{ icon: 'tree_red', big: true }, { icon: 'mushroom' }, { icon: 'tree_yellow', big: true }, { icon: 'acorn' }],
  lente: [{ icon: 'flower' }, { icon: 'tree', big: true }, { icon: 'butterfly', up: true }, { icon: 'flower' }],
  valentijn: [{ icon: 'heart' }, { icon: 'emotion_hand_flower' }, { icon: 'flower' }, { icon: 'heart', up: true }],
  pasen: [{ icon: 'rabbit', big: true }, { icon: 'faberge_egg' }, { icon: 'flower' }, { icon: 'faberge_egg' }],
  sinterklaas: [{ icon: 'gingerbread_man_chocolate' }, { icon: 'chocolate' }, { icon: 'card_gift' }, { icon: 'candy_cane' }],
  zomer: [{ icon: 'umbrella', big: true }, { icon: 'icecream' }, { icon: 'weather_sun', up: true }, { icon: 'umbrella' }],
}
const GROUND_COUNT = 18

function GroundIcons({ season }: { season: Festivity }) {
  const set = GROUND[season]
  return (
    <div className="festive-ground-icons">
      {Array.from({ length: GROUND_COUNT }, (_, i) => {
        const g = set[i % set.length]
        return <img key={i} src={`/icons/32/${g.icon}.png`} alt="" className={[g.big && 'big', g.up && 'up'].filter(Boolean).join(' ') || undefined} />
      })}
    </div>
  )
}

const reducedMotion = () => document.documentElement.hasAttribute('data-reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Snow, leaves, bats and Christmas lights, when the member switched them on
 * (Instellingen → Feestelijk). Sets data-festive on <html> for the
 * decorations in the CSS, data-festive-colors for the matching theme, and
 * data-festive-frames for the seasonal borders around profile photos.
 */
export function FestiveEffects() {
  const { prefs } = usePreferences()
  const canvas = useRef<HTMLCanvasElement>(null)
  // "Automatisch" changes with the date; checking once an hour is plenty
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 3600_000)
    return () => window.clearInterval(timer)
  }, [])
  const festivity = activeFestivity(prefs.festive, now)

  useEffect(() => {
    const html = document.documentElement
    if (festivity) html.dataset.festive = festivity
    else delete html.dataset.festive
    if (festivity && prefs.festiveColors) html.dataset.festiveColors = festivity
    else delete html.dataset.festiveColors
    if (festivity && prefs.festiveFrames) html.dataset.festiveFrames = festivity
    else delete html.dataset.festiveFrames
    try {
      localStorage.setItem('kuddes.festive', JSON.stringify(festivity ? { festive: festivity, colors: prefs.festiveColors } : null))
    } catch {
      // only the pre-paint restore is lost
    }
  }, [festivity, prefs.festiveColors, prefs.festiveFrames])

  useEffect(() => {
    if (!festivity || !prefs.festiveParticles || !canvas.current || reducedMotion()) return
    const base = EFFECTS[festivity]
    const k = AMOUNT[prefs.festiveAmount]
    return startParticles(canvas.current, { ...base, snow: base.snow * k, leaves: base.leaves * k, batsPerMinute: base.batsPerMinute * k })
  }, [festivity, prefs.festiveAmount, prefs.reduceMotion, prefs.festiveParticles])

  if (!festivity) return null
  return (
    <>
      {prefs.festiveParticles && <canvas ref={canvas} className="festive-canvas" aria-hidden="true" />}
      {createPortal(<NightSky key={festivity} season={festivity} />, document.body)}
      {/* Trees, snow, pumpkins, leaves or tulips at the very bottom of the page */}
      {createPortal(
        <div className={`festive-ground ${festivity}`} aria-hidden="true">
          <GroundIcons season={festivity} />
        </div>,
        document.body,
      )}
    </>
  )
}
