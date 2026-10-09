import { MINDMAP_COLORS, type MindNode, type Mindmap } from '../../../shared/documents'

export const newId = () => crypto.randomUUID().slice(0, 8)

export const blankMindmap = (): Mindmap => ({
  style: 'klassiek',
  root: {
    id: newId(),
    text: 'Hoofdonderwerp',
    children: ['Onderwerp 1', 'Onderwerp 2', 'Onderwerp 3', 'Onderwerp 4'].map((text) => ({ id: newId(), text, children: [] })),
  },
})

export const countNodes = (n: MindNode): number => 1 + n.children.reduce((a, c) => a + countNodes(c), 0)

export function findNode(n: MindNode, id: string): MindNode | null {
  if (n.id === id) return n
  for (const c of n.children) {
    const f = findNode(c, id)
    if (f) return f
  }
  return null
}
export function parentOf(n: MindNode, id: string): MindNode | null {
  for (const c of n.children) {
    if (c.id === id) return n
    const f = parentOf(c, id)
    if (f) return f
  }
  return null
}
/** A copy of the tree with one node changed (or removed, when f returns null). */
export function mapNode(n: MindNode, id: string, f: (n: MindNode) => MindNode | null): MindNode | null {
  if (n.id === id) return f(n)
  let changed = false
  const children: MindNode[] = []
  for (const c of n.children) {
    const m = mapNode(c, id, f)
    if (m !== c) changed = true
    if (m) children.push(m)
  }
  return changed ? { ...n, children } : n
}

// ------------------------------------------------------------ layout

export type Placed = {
  node: MindNode
  depth: number
  /** -1 left of the centre, 1 right of it, 0 the centre itself */
  side: -1 | 0 | 1
  x: number
  y: number
  w: number
  h: number
  lines: string[]
  color: string
  parent: Placed | null
}

const GAP_X = 46
const GAP_Y = 10
const LINE = 17
let measurer: CanvasRenderingContext2D | null = null

const fontFor = (depth: number) => (depth === 0 ? 'bold 17px' : depth === 1 ? 'bold 14px' : '13px')

/** Wraps the text to at most 200px wide (the root a bit wider). */
function wrap(text: string, depth: number): { lines: string[]; width: number } {
  measurer ??= document.createElement('canvas').getContext('2d')!
  measurer.font = `${fontFor(depth)} Calibri, Carlito, sans-serif`
  const max = depth === 0 ? 240 : 200
  const lines: string[] = []
  for (const para of (text || ' ').split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && measurer.measureText(next).width > max) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return {
    lines,
    width: Math.min(max, Math.max(...lines.map((l) => measurer!.measureText(l).width))),
  }
}

/** Places every visible node: the root in the middle, its branches split over both sides. */
export function layout(map: Mindmap): Placed[] {
  const out: Placed[] = []
  const sized = new Map<string, { w: number; h: number; lines: string[]; total: number }>()
  const pad = (depth: number) => (depth === 0 ? [22, 14] : depth === 1 ? [14, 8] : [10, 5])
  const measure = (n: MindNode, depth: number): number => {
    const { lines, width } = wrap(n.text, depth)
    const [px, py] = pad(depth)
    const w = Math.max(depth === 0 ? 120 : 50, width + px * 2)
    const h = lines.length * LINE + py * 2
    const kids = n.collapsed ? 0 : n.children.reduce((a, c) => a + measure(c, depth + 1), 0) + Math.max(0, n.children.length - 1) * GAP_Y
    const total = Math.max(h, n.collapsed ? h : kids)
    sized.set(n.id, { w, h, lines, total })
    return total
  }
  measure(map.root, 0)

  const place = (n: MindNode, depth: number, side: -1 | 1, edge: number, top: number, color: string, parent: Placed) => {
    const s = sized.get(n.id)!
    const x = side === 1 ? edge : edge - s.w
    const p: Placed = {
      node: n,
      depth,
      side,
      x,
      y: top + s.total / 2 - s.h / 2,
      w: s.w,
      h: s.h,
      lines: s.lines,
      color: n.color ?? color,
      parent,
    }
    out.push(p)
    if (n.collapsed) return
    const kidsH = n.children.reduce((a, c) => a + sized.get(c.id)!.total, 0) + Math.max(0, n.children.length - 1) * GAP_Y
    let y = top + s.total / 2 - kidsH / 2
    for (const c of n.children) {
      place(c, depth + 1, side, side === 1 ? x + s.w + GAP_X : x - GAP_X, y, p.color, p)
      y += sized.get(c.id)!.total + GAP_Y
    }
  }

  const r = sized.get(map.root.id)!
  const root: Placed = {
    node: map.root,
    depth: 0,
    side: 0,
    x: -r.w / 2,
    y: -r.h / 2,
    w: r.w,
    h: r.h,
    lines: r.lines,
    color: map.root.color ?? '#1f497d',
    parent: null,
  }
  out.push(root)
  if (map.root.collapsed) return out
  // The first half of the branches go right, the rest left (as in MindManager)
  const kids = map.root.children
  const half = Math.ceil(kids.length / 2)
  for (const [list, side] of [
    [kids.slice(0, half), 1],
    [kids.slice(half), -1],
  ] as const) {
    const total = list.reduce((a, c) => a + sized.get(c.id)!.total, 0) + Math.max(0, list.length - 1) * GAP_Y
    let y = -total / 2
    // The left side counts from the bottom so the branches go round clockwise
    const ordered = side === -1 ? [...list].reverse() : list
    for (const c of ordered) {
      const i = kids.indexOf(c)
      place(c, 1, side, side === 1 ? root.x + root.w + GAP_X * 1.4 : root.x - GAP_X * 1.4, y, MINDMAP_COLORS[i % MINDMAP_COLORS.length], root)
      y += sized.get(c.id)!.total + GAP_Y
    }
  }
  return out
}

/** The curve from a node's parent to the node. */
export function linkPath(p: Placed): string {
  const a = p.parent!
  const sx = p.side === 1 ? a.x + a.w : a.x
  const sy = a.y + a.h / 2
  const ex = p.side === 1 ? p.x : p.x + p.w
  const ey = p.y + p.h / 2
  const mx = (sx + ex) / 2
  return `M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex},${ey}`
}

export function bounds(placed: Placed[]) {
  const minX = Math.min(...placed.map((p) => p.x)) - 30
  const minY = Math.min(...placed.map((p) => p.y)) - 30
  const maxX = Math.max(...placed.map((p) => p.x + p.w)) + 30
  const maxY = Math.max(...placed.map((p) => p.y + p.h)) + 30
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** The mindmap as plain text with indents, for the clipboard and the export. */
export function outline(n: MindNode, depth = 0): string {
  return [`${'  '.repeat(depth)}${depth ? '- ' : ''}${n.text}`, ...n.children.map((c) => outline(c, depth + 1))].join('\n')
}
