import type { ChartType } from '../../../shared/documents'
import { formatGeneral } from './formula'
import { CHART_COLORS, type ChartData } from './sheet'

const W = 480
const H = 300

/** A rounded scale for the axis: a nice step and the ends it covers. */
function scale(min: number, max: number) {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max) || 1
  const raw = (hi - lo) / 5
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step }
}

/** A chart of a range, drawn as Excel 2007 draws one: gridlines, axis labels and a legend. */
export function ChartView({ type, title, data }: { type: ChartType; title: string; data: ChartData | null }) {
  if (!data || data.series.every((s) => s.values.length === 0)) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="rb-chart-svg" role="img" aria-label={title || 'Grafiek'}>
        <text x={W / 2} y={H / 2} textAnchor="middle" className="rb-chart-empty">
          Geen getallen in dit bereik
        </text>
      </svg>
    )
  }
  const legend = data.series.length > 1 || type === 'taart'
  const top = title ? 34 : 14
  const right = legend ? 120 : 16

  if (type === 'taart') {
    const values = data.series[0].values.map((v) => Math.max(0, v))
    const total = values.reduce((a, b) => a + b, 0) || 1
    const cx = (W - right) / 2
    const cy = top + (H - top - 12) / 2
    const radius = Math.min(cx - 16, (H - top - 20) / 2)
    // Where each slice starts and how far it goes
    const slices = values.map((v, i) => {
      const before = values.slice(0, i).reduce((x, y) => x + y, 0)
      return { v, start: -Math.PI / 2 + (before / total) * Math.PI * 2, a: (v / total) * Math.PI * 2 }
    })
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="rb-chart-svg" role="img" aria-label={title || 'Taartdiagram'}>
        {title && (
          <text x={W / 2} y={22} textAnchor="middle" className="rb-chart-title">
            {title}
          </text>
        )}
        {slices.map(({ v, start, a }, i) => {
          const x1 = cx + radius * Math.cos(start)
          const y1 = cy + radius * Math.sin(start)
          const x2 = cx + radius * Math.cos(start + a)
          const y2 = cy + radius * Math.sin(start + a)
          const mid = start + a / 2
          const color = CHART_COLORS[i % CHART_COLORS.length]
          return (
            <g key={i}>
              {a >= Math.PI * 2 - 1e-9 ? (
                <circle cx={cx} cy={cy} r={radius} fill={color} stroke="#fff" />
              ) : (
                <path d={`M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${a > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`} fill={color} stroke="#fff" strokeWidth={1.5} />
              )}
              {v / total > 0.05 && (
                <text x={cx + radius * 0.65 * Math.cos(mid)} y={cy + radius * 0.65 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" className="rb-chart-pct">
                  {Math.round((v / total) * 100)}%
                </text>
              )}
            </g>
          )
        })}
        {data.labels.map((l, i) => (
          <g key={i} transform={`translate(${W - right + 10}, ${top + 6 + i * 18})`}>
            <rect width={10} height={10} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            <text x={15} y={9} className="rb-chart-legend">
              {l.slice(0, 16)}
            </text>
          </g>
        ))}
      </svg>
    )
  }

  const all = data.series.flatMap((s) => s.values)
  const { lo, hi, step } = scale(Math.min(...all), Math.max(...all))
  const left = 46
  const bottom = 26
  const plotW = W - left - right
  const plotH = H - top - bottom
  const horizontal = type === 'staaf'
  const n = data.labels.length
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step)
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * (horizontal ? plotW : plotH)
  const band = (horizontal ? plotH : plotW) / Math.max(1, n)
  const barW = (band * 0.7) / data.series.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rb-chart-svg" role="img" aria-label={title || 'Grafiek'}>
      {title && (
        <text x={W / 2} y={22} textAnchor="middle" className="rb-chart-title">
          {title}
        </text>
      )}
      <g transform={`translate(${left}, ${top})`}>
        {ticks.map((t) => (
          <g key={t}>
            {horizontal ? (
              <>
                <line x1={pos(t)} x2={pos(t)} y1={0} y2={plotH} className="rb-chart-grid" />
                <text x={pos(t)} y={plotH + 14} textAnchor="middle" className="rb-chart-axis">
                  {formatGeneral(t)}
                </text>
              </>
            ) : (
              <>
                <line x1={0} x2={plotW} y1={plotH - pos(t)} y2={plotH - pos(t)} className="rb-chart-grid" />
                <text x={-6} y={plotH - pos(t) + 4} textAnchor="end" className="rb-chart-axis">
                  {formatGeneral(t)}
                </text>
              </>
            )}
          </g>
        ))}
        {type === 'lijn'
          ? data.series.map((s, j) => {
              const pts = s.values.map((v, i) => `${band * i + band / 2},${plotH - pos(v)}`).join(' ')
              const color = CHART_COLORS[j % CHART_COLORS.length]
              return (
                <g key={j}>
                  <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={band * i + band / 2} cy={plotH - pos(v)} r={3.5} fill={color} stroke="#fff" />
                  ))}
                </g>
              )
            })
          : data.series.map((s, j) =>
              s.values.map((v, i) => {
                const start = band * i + band * 0.15 + barW * j
                const a = pos(Math.min(0, v))
                const b = pos(Math.max(0, v))
                const color = CHART_COLORS[j % CHART_COLORS.length]
                return horizontal ? (
                  <rect key={`${j}-${i}`} x={a} y={start} width={Math.max(1, b - a)} height={barW} fill={`url(#rb-g${j % CHART_COLORS.length})`} stroke={color} />
                ) : (
                  <rect key={`${j}-${i}`} x={start} y={plotH - b} width={barW} height={Math.max(1, b - a)} fill={`url(#rb-g${j % CHART_COLORS.length})`} stroke={color} />
                )
              }),
            )}
        <line x1={0} x2={horizontal ? 0 : plotW} y1={horizontal ? 0 : plotH - pos(0)} y2={horizontal ? plotH : plotH - pos(0)} className="rb-chart-zero" />
        {data.labels.map((l, i) =>
          horizontal ? (
            <text key={i} x={-6} y={band * i + band / 2 + 4} textAnchor="end" className="rb-chart-axis">
              {l.slice(0, 8)}
            </text>
          ) : (
            <text key={i} x={band * i + band / 2} y={plotH + 14} textAnchor="middle" className="rb-chart-axis">
              {l.slice(0, Math.max(3, Math.floor(band / 6)))}
            </text>
          ),
        )}
      </g>
      {legend &&
        data.series.map((s, j) => (
          <g key={j} transform={`translate(${W - right + 10}, ${top + 6 + j * 18})`}>
            <rect width={10} height={10} fill={CHART_COLORS[j % CHART_COLORS.length]} />
            <text x={15} y={9} className="rb-chart-legend">
              {s.name.slice(0, 16)}
            </text>
          </g>
        ))}
      {/* Excel 2007's bars have a soft shine */}
      <defs>
        {CHART_COLORS.map((c, i) => (
          <linearGradient key={c} id={`rb-g${i}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={c} stopOpacity={0.75} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  )
}
