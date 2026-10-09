import { useRef } from 'react'

/**
 * A round knob as on FL Studio's channels: drag up or down (or use the
 * arrow keys), double-click for the starting value.
 */
export function Knob({
  value,
  min,
  max,
  reset,
  label,
  shown,
  onChange,
  size = 24,
}: {
  value: number
  min: number
  max: number
  reset: number
  label: string
  shown: string
  onChange: (v: number) => void
  size?: number
}) {
  const drag = useRef<{ y: number; v: number } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const frac = (value - min) / (max - min)
  // From 7 o'clock to 5 o'clock
  const angle = -135 + frac * 270
  const r = size / 2
  const rad = ((angle - 90) * Math.PI) / 180
  // Pan knobs light up from the middle, volume from the left
  const from = min < 0 ? 0 : -135
  const arc = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180
    return `${r + (r - 2) * Math.cos(t)},${r + (r - 2) * Math.sin(t)}`
  }
  const lo = Math.min(from, angle)
  const hi = Math.max(from, angle)
  return (
    <span
      className="std-knob"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={shown}
      title={`${label}: ${shown}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { y: e.clientY, v: value }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        onChange(clamp(drag.current.v + ((drag.current.y - e.clientY) / 140) * (max - min)))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onChange(reset)}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0
        if (!d) return
        e.preventDefault()
        onChange(clamp(value + d * (max - min) * 0.05))
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={r} cy={r} r={r - 2} className="std-knob-ring" />
        {hi - lo > 1 && <path d={`M${arc(lo)} A${r - 2},${r - 2} 0 ${hi - lo > 180 ? 1 : 0} 1 ${arc(hi)}`} className="std-knob-arc" />}
        <circle cx={r} cy={r} r={r - 5} className="std-knob-cap" />
        <line x1={r} y1={r} x2={r + (r - 6) * Math.cos(rad)} y2={r + (r - 6) * Math.sin(rad)} className="std-knob-line" />
      </svg>
    </span>
  )
}
