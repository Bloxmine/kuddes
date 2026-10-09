import type { Mindmap } from '../../../shared/documents'
import { bounds, layout, linkPath, outline } from './mindmap'

const FONT = 'Calibri, Carlito, sans-serif'
const CHALK_FONT = '"Comic Sans MS", "Comic Neue", cursive'

/** A mindmap to look at (a profile gadget, a shared file): drawn as in the editor, without the editing. */
export function MindmapView({ map, idPrefix }: { map: Mindmap; idPrefix: string }) {
  const placed = layout(map)
  const box = bounds(placed)
  const chalk = map.style === 'krijt'
  const root = `${idPrefix}-root`
  const shadow = `${idPrefix}-shadow`
  return (
    <svg className="mmv-svg" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label={outline(map.root)}>
      <defs>
        <linearGradient id={root} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f7fc" />
          <stop offset="1" stopColor="#b8cce4" />
        </linearGradient>
        <filter id={shadow} x="-10%" y="-10%" width="130%" height="140%">
          <feDropShadow dx="1.5" dy="2" stdDeviation="1.5" floodOpacity="0.25" />
        </filter>
      </defs>
      {chalk && <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#2f4a3a" />}
      {placed
        .filter((p) => p.parent)
        .map((p) => (
          <path
            key={`l${p.node.id}`}
            d={linkPath(p)}
            fill="none"
            stroke={p.color}
            strokeOpacity={chalk ? 0.85 : 1}
            strokeWidth={map.style === 'modern' ? (p.depth === 1 ? 5 : 2.5) : p.depth === 1 ? 3 : 1.6}
            strokeLinecap="round"
          />
        ))}
      {placed.map((p) => {
        const r = p.depth === 0 ? 14 : p.depth === 1 ? 9 : 5
        const modernLeaf = map.style === 'modern' && p.depth > 1
        const filled = map.style === 'modern' && p.depth <= 1
        const text = chalk ? '#f6f4e8' : filled ? '#ffffff' : p.depth === 0 ? '#1f2d3d' : '#222222'
        const firstY = p.y + p.h / 2 - ((p.lines.length - 1) * 17) / 2
        return (
          <g key={p.node.id}>
            {modernLeaf ? (
              <line x1={p.x} x2={p.x + p.w} y1={p.y + p.h} y2={p.y + p.h} stroke={p.color} strokeWidth={2.5} strokeLinecap="round" />
            ) : (
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={map.style === 'modern' ? p.h / 2 : r}
                fill={chalk ? 'rgba(255,255,255,0.06)' : filled ? p.color : p.depth === 0 ? `url(#${root})` : '#ffffff'}
                stroke={chalk ? p.color : p.depth === 0 && !filled ? '#1f497d' : p.color}
                strokeWidth={p.depth === 0 ? 2.5 : p.depth === 1 ? 2 : 1.3}
                strokeDasharray={chalk && p.depth > 1 ? '5 3' : undefined}
                filter={chalk || map.style === 'modern' ? undefined : `url(#${shadow})`}
              />
            )}
            {p.lines.map((l, i) => (
              <text
                key={i}
                x={p.x + p.w / 2}
                y={firstY + i * 17}
                textAnchor="middle"
                dominantBaseline="central"
                fill={text}
                fontSize={p.depth === 0 ? 17 : p.depth === 1 ? 14 : 13}
                fontWeight={p.depth <= 1 ? 'bold' : 'normal'}
                fontFamily={chalk ? CHALK_FONT : FONT}
              >
                {l}
              </text>
            ))}
            {p.node.collapsed && p.node.children.length > 0 && (
              <text
                x={p.side === -1 ? p.x - 9 : p.x + p.w + 9}
                y={p.y + p.h / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12}
                fontWeight="bold"
                fill={p.color}
                fontFamily={FONT}
              >
                +{p.node.children.length}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
