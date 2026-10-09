import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MINDMAP_MAX_NODES, type MindNode, type Mindmap } from '../../../shared/documents'
import { Big, Choices, ColorGrid, FileMenu, Group, Menu, OfficeLoader, OpenDialog, RibbonTabs, SchemeGroup, Small, TitleBar, ZoomBar } from '../office/Office'
import { useOfficeFile, useScheme, type OfficeFile } from '../office/officeFile'
import { blankMindmap, bounds, countNodes, findNode, layout, linkPath, mapNode, newId, outline, parentOf, type Placed } from './mindmap'
import './Mindmap.css'

const TABS = [
  ['start', 'Start'],
  ['beeld', 'Beeld'],
] as const
const STYLES = [
  ['klassiek', 'Klassiek'],
  ['modern', 'Modern'],
  ['krijt', 'Krijtbord'],
] as const
const BRANCH_COLORS = [
  ['#4f81bd', '#c0504d', '#9bbb59', '#8064a2', '#4bacc6', '#f79646'],
  ['#2c4d75', '#d4598f', '#7f7f7f', '#1f497d', '#77933c', '#e36c09'],
]
const FONT = 'Calibri, Carlito, sans-serif'
const CHALK_FONT = '"Comic Sans MS", "Comic Neue", cursive'

const save = (name: string, blob: Blob, ext: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Mindmap'}.${ext}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Kuddes Mindmap (/tools/mindmap): an idea in the middle, branches around it. */
export function MindmapPage() {
  return <OfficeLoader<Mindmap> kind="mindmap">{(file) => <MindmapEditor file={file} />}</OfficeLoader>
}

function MindmapEditor({ file }: { file: OfficeFile<Mindmap> | null }) {
  const [map, setMap] = useState<Mindmap>(() => file?.content ?? blankMindmap())
  const mapRef = useRef(map)
  const snapshot = useCallback(() => ({ content: mapRef.current, words: countNodes(mapRef.current.root) }), [])
  const doc = useOfficeFile<Mindmap>('mindmap', file, snapshot)
  const [tab, setTab] = useState<'start' | 'beeld'>('start')
  const [scheme, setScheme] = useScheme()
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [selected, setSelected] = useState(map.root.id)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [zoom, setZoom] = useState(100)
  const [drag, setDrag] = useState<{
    id: string
    over: string | null
    x: number
    y: number
    moved: boolean
  } | null>(null)
  const history = useRef<{ past: Mindmap[]; future: Mindmap[] }>({
    past: [],
    future: [],
  })
  const svg = useRef<SVGSVGElement>(null)
  const work = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const placed = useMemo(() => layout(map), [map])
  const box = useMemo(() => bounds(placed), [placed])
  const chalk = map.style === 'krijt'

  const change = (next: Mindmap, undoable = true) => {
    if (undoable) {
      history.current.past.push(mapRef.current)
      if (history.current.past.length > 60) history.current.past.shift()
      history.current.future = []
    }
    mapRef.current = next
    setMap(next)
    doc.changed()
  }
  const changeNode = (id: string, f: (n: MindNode) => MindNode | null) => change({ ...mapRef.current, root: mapNode(mapRef.current.root, id, f)! })
  const undo = (from: 'past' | 'future') => {
    const prev = history.current[from].pop()
    if (!prev) return
    history.current[from === 'past' ? 'future' : 'past'].push(mapRef.current)
    mapRef.current = prev
    setMap(prev)
    if (!findNode(prev.root, selected)) setSelected(prev.root.id)
    doc.changed()
  }

  const full = () => {
    if (countNodes(mapRef.current.root) < MINDMAP_MAX_NODES) return false
    setNotice(`Een mindmap kan maximaal ${MINDMAP_MAX_NODES} onderwerpen hebben.`)
    return true
  }
  const addChild = (id = selected) => {
    if (full()) return
    const node: MindNode = {
      id: newId(),
      text: id === mapRef.current.root.id ? 'Nieuw onderwerp' : 'Subonderwerp',
      children: [],
    }
    changeNode(id, (n) => ({
      ...n,
      collapsed: false,
      children: [...n.children, node],
    }))
    setSelected(node.id)
    setEditing({ id: node.id, text: node.text })
  }
  const addSibling = () => {
    const parent = parentOf(mapRef.current.root, selected)
    if (!parent) return addChild()
    if (full()) return
    const node: MindNode = {
      id: newId(),
      text: parent.id === mapRef.current.root.id ? 'Nieuw onderwerp' : 'Subonderwerp',
      children: [],
    }
    changeNode(parent.id, (n) => {
      const kids = [...n.children]
      kids.splice(kids.findIndex((k) => k.id === selected) + 1, 0, node)
      return { ...n, children: kids }
    })
    setSelected(node.id)
    setEditing({ id: node.id, text: node.text })
  }
  const remove = () => {
    const parent = parentOf(mapRef.current.root, selected)
    if (!parent) return
    const i = parent.children.findIndex((k) => k.id === selected)
    changeNode(selected, () => null)
    setSelected(parent.children[i + 1]?.id ?? parent.children[i - 1]?.id ?? parent.id)
  }
  const toggle = (id = selected) => {
    const n = findNode(mapRef.current.root, id)
    if (n?.children.length) changeNode(id, (m) => ({ ...m, collapsed: !m.collapsed }))
  }
  const expandAll = (open: boolean) => {
    const walk = (n: MindNode, depth: number): MindNode => ({
      ...n,
      collapsed: open || depth === 0 ? false : n.children.length > 0,
      children: n.children.map((c) => walk(c, depth + 1)),
    })
    change({ ...mapRef.current, root: walk(mapRef.current.root, 0) })
  }
  const commitEdit = () => {
    if (!editing) return
    const text = editing.text.trim().slice(0, 300)
    const n = findNode(mapRef.current.root, editing.id)
    if (n && text && text !== n.text) changeNode(editing.id, (m) => ({ ...m, text }))
    setEditing(null)
    work.current?.focus()
  }
  /** Moves a node (and what hangs under it) to another one, unless that's inside itself. */
  const move = (id: string, to: string) => {
    const n = findNode(mapRef.current.root, id)
    if (!n || id === to || findNode(n, to)) return
    const without = mapNode(mapRef.current.root, id, () => null)!
    change({
      ...mapRef.current,
      root: mapNode(without, to, (t) => ({
        ...t,
        collapsed: false,
        children: [...t.children, n],
      }))!,
    })
  }

  /** Arrow keys walk the map the way it looks: sideways along the branch, up and down between siblings. */
  const walk = (key: string) => {
    const at = placed.find((p) => p.node.id === selected)
    if (!at) return
    const outward = (side: -1 | 1) => {
      if (at.side === 0) return placed.find((p) => p.parent === at && p.side === side)
      if (at.side === side) return placed.find((p) => p.parent === at)
      return at.parent
    }
    let next: Placed | null | undefined = null
    if (key === 'ArrowRight') next = outward(1)
    else if (key === 'ArrowLeft') next = outward(-1)
    else if (at.parent) {
      // The nearest node above or below on the same side
      const down = key === 'ArrowDown'
      next = placed.filter((p) => p.side === at.side && p.depth === at.depth && (down ? p.y > at.y : p.y < at.y)).sort((a, b) => Math.abs(a.y - at.y) - Math.abs(b.y - at.y))[0]
    }
    if (next) setSelected(next.node.id)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (editing || (e.target as HTMLElement).closest('input, textarea, select')) return
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    if (ctrl && k.toLowerCase() === 'z') undo('past')
    else if (ctrl && k.toLowerCase() === 'y') undo('future')
    else if (ctrl && k.toLowerCase() === 's') doc.save()
    else if (k === 'Tab' || k === 'Insert') addChild()
    else if (k === 'Enter') addSibling()
    else if (k === 'Delete' || k === 'Backspace') remove()
    else if (k === 'F2') {
      const n = findNode(mapRef.current.root, selected)
      if (n) setEditing({ id: n.id, text: n.text })
    } else if (k === ' ') toggle()
    else if (k.startsWith('Arrow')) walk(k)
    else if (k.length === 1 && !ctrl && !e.altKey) {
      // Typing starts editing, as in MindManager
      setEditing({ id: selected, text: k })
    } else return
    e.preventDefault()
  }

  // The root in view when the map opens
  const centre = useCallback(() => {
    const w = work.current
    if (!w) return
    w.scrollLeft = (w.scrollWidth - w.clientWidth) / 2
    w.scrollTop = (w.scrollHeight - w.clientHeight) / 2
  }, [])
  useLayoutEffect(() => {
    centre()
    work.current?.focus({ preventScroll: true })
  }, [centre])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  // ---------------------------------------------------------------- drag a node onto another
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || editing) return
    e.stopPropagation()
    setSelected(id)
    if (id === map.root.id) return
    setDrag({ id, over: null, x: e.clientX, y: e.clientY, moved: false })
  }
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6
      const over = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('[data-node]')?.getAttribute('data-node') ?? null
      if (moved !== drag.moved || over !== drag.over) setDrag({ ...drag, moved, over })
    }
    const onUp = () => {
      if (drag.moved && drag.over) move(drag.id, drag.over)
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  // Dragging the empty paper moves the view
  const onPaperDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const w = work.current!
    const start = {
      x: e.clientX,
      y: e.clientY,
      l: w.scrollLeft,
      t: w.scrollTop,
    }
    const onMove = (m: PointerEvent) => {
      w.scrollLeft = start.l - (m.clientX - start.x)
      w.scrollTop = start.t - (m.clientY - start.y)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // ---------------------------------------------------------------- export
  /** The drawing on its own, without selection or the edit box. */
  const svgText = () => {
    const s = svg.current!.cloneNode(true) as SVGSVGElement
    s.querySelectorAll('[data-ui]').forEach((n) => n.remove())
    s.setAttribute('width', String(box.w))
    s.setAttribute('height', String(box.h))
    s.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return new XMLSerializer().serializeToString(s)
  }
  const exportPng = () => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = box.w * 2
      c.height = box.h * 2
      const x = c.getContext('2d')!
      x.scale(2, 2)
      x.drawImage(img, 0, 0)
      c.toBlob((b) => b && save(doc.title, b, 'png'), 'image/png')
    }
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText())}`
  }
  const print = () => {
    const w = window.open('', '_blank', 'width=1000,height=700')
    if (!w) return
    w.document.title = doc.title
    w.document.body.innerHTML = svgText()
    const s = w.document.body.querySelector('svg')!
    s.style.width = '100%'
    s.style.height = 'auto'
    setTimeout(() => w.print(), 300)
  }

  const sel = findNode(map.root, selected)

  // ---------------------------------------------------------------- drawing
  const nodeShape = (p: Placed) => {
    const on = p.node.id === selected
    const target = drag?.moved && drag.over === p.node.id && drag.id !== p.node.id
    const r = p.depth === 0 ? 14 : p.depth === 1 ? 9 : 5
    const modernLeaf = map.style === 'modern' && p.depth > 1
    const filled = map.style === 'modern' && p.depth <= 1
    const text = chalk ? '#f6f4e8' : filled ? '#ffffff' : p.depth === 0 ? '#1f2d3d' : '#222222'
    const fontSize = p.depth === 0 ? 17 : p.depth === 1 ? 14 : 13
    const weight = p.depth <= 1 ? 'bold' : 'normal'
    const textX = p.x + p.w / 2
    const firstY = p.y + p.h / 2 - ((p.lines.length - 1) * 17) / 2
    return (
      <g
        key={p.node.id}
        data-node={p.node.id}
        className="mmp-node"
        onPointerDown={(e) => onNodeDown(e, p.node.id)}
        onDoubleClick={() => setEditing({ id: p.node.id, text: p.node.text })}
      >
        {modernLeaf ? (
          <>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" />
            <line x1={p.x} x2={p.x + p.w} y1={p.y + p.h} y2={p.y + p.h} stroke={p.color} strokeWidth={2.5} strokeLinecap="round" />
          </>
        ) : (
          <rect
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            rx={map.style === 'modern' ? p.h / 2 : r}
            fill={chalk ? 'rgba(255,255,255,0.06)' : filled ? p.color : p.depth === 0 ? 'url(#mmp-root)' : '#ffffff'}
            stroke={chalk ? p.color : p.depth === 0 && !filled ? '#1f497d' : p.color}
            strokeWidth={p.depth === 0 ? 2.5 : p.depth === 1 ? 2 : 1.3}
            strokeDasharray={chalk && p.depth > 1 ? '5 3' : undefined}
            filter={chalk || map.style === 'modern' ? undefined : 'url(#mmp-shadow)'}
          />
        )}
        {p.lines.map((l, i) => (
          <text
            key={i}
            x={textX}
            y={firstY + i * 17}
            textAnchor="middle"
            dominantBaseline="central"
            fill={text}
            fontSize={fontSize}
            fontWeight={weight}
            fontFamily={chalk ? CHALK_FONT : FONT}
          >
            {l}
          </text>
        ))}
        {p.node.children.length > 0 && p.depth > 0 && (
          <g data-ui="" className="mmp-toggle" onPointerDown={(e) => (e.stopPropagation(), toggle(p.node.id))}>
            <circle cx={p.side === 1 ? p.x + p.w + 8 : p.x - 8} cy={p.y + p.h / 2} r={6.5} fill="#ffffff" stroke={p.color} />
            <text
              x={p.side === 1 ? p.x + p.w + 8 : p.x - 8}
              y={p.y + p.h / 2 + 0.5}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight="bold"
              fill={p.color}
              fontFamily={FONT}
            >
              {p.node.collapsed ? '+' : '−'}
            </text>
          </g>
        )}
        {(on || target) && (
          <rect
            data-ui=""
            x={p.x - 4}
            y={p.y - 4}
            width={p.w + 8}
            height={p.h + 8}
            rx={r + 3}
            fill="none"
            stroke={target ? '#e8a000' : '#3c7fb1'}
            strokeWidth={2}
            strokeDasharray={target ? '4 3' : undefined}
          />
        )}
      </g>
    )
  }

  const edited = editing && placed.find((p) => p.node.id === editing.id)

  return (
    <main className="page ofc-page">
      <div className="ofc-app mmp-app" data-scheme={scheme}>
        <TitleBar
          kind="mindmap"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            {
              icon: 'arrow_undo',
              title: 'Ongedaan maken (Ctrl+Z)',
              onClick: () => undo('past'),
            },
            {
              icon: 'arrow_redo',
              title: 'Opnieuw (Ctrl+Y)',
              onClick: () => undo('future'),
            },
          ]}
        />
        {orb && (
          <FileMenu
            kind="mindmap"
            docs={doc.docs}
            currentId={doc.id}
            onClose={closeOrb}
            onOpen={() => setOpening(true)}
            onSave={doc.save}
            onSaveAs={doc.saveAs}
            exports={[
              {
                key: 'png',
                icon: 'picture',
                name: 'PNG-afbeelding',
                hint: 'Een plaatje van de hele mindmap.',
                onClick: exportPng,
              },
              {
                key: 'svg',
                icon: 'draw_line',
                name: 'SVG-tekening',
                hint: 'Blijft scherp, hoe groot je hem ook maakt.',
                onClick: () => save(doc.title, new Blob([svgText()], { type: 'image/svg+xml' }), 'svg'),
              },
              {
                key: 'txt',
                icon: 'page_white_edit',
                name: 'Overzicht als tekst',
                hint: 'De onderwerpen ingesprongen onder elkaar.',
                onClick: () =>
                  save(
                    doc.title,
                    new Blob([outline(map.root)], {
                      type: 'text/plain;charset=utf-8',
                    }),
                    'txt',
                  ),
              },
            ]}
            onPrint={print}
            onDelete={doc.remove}
          />
        )}
        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' ? (
              <>
                <Group label="Invoegen">
                  <Big icon="shape_square_add" label="Subonderwerp" onClick={() => addChild()} title="Subonderwerp (Tab)" />
                  <div className="ofc-stack">
                    <Small icon="add" label="Onderwerp ernaast" onClick={addSibling} title="Onderwerp ernaast (Enter)" />
                    <Small icon="cross" label="Verwijderen" onClick={remove} disabled={selected === map.root.id} title="Verwijderen (Delete)" />
                  </div>
                </Group>
                <Group label="Bewerken">
                  <div className="ofc-stack">
                    <Small icon="page_white_edit" label="Naam wijzigen" onClick={() => sel && setEditing({ id: sel.id, text: sel.text })} title="Naam wijzigen (F2)" />
                    <Small
                      icon={sel?.collapsed ? 'arrow_out' : 'arrow_in'}
                      label={sel?.collapsed ? 'Uitklappen' : 'Inklappen'}
                      onClick={() => toggle()}
                      disabled={!sel?.children.length}
                      title="In- of uitklappen (spatie)"
                    />
                  </div>
                  <div className="ofc-stack">
                    <Small icon="arrow_out" label="Alles uitklappen" onClick={() => expandAll(true)} />
                    <Small icon="arrow_in" label="Alles inklappen" onClick={() => expandAll(false)} />
                  </div>
                </Group>
                <Group label="Opmaak">
                  <Menu icon="color_wheel" label="Kleur" title="Kleur van dit onderwerp en wat eronder hangt" big>
                    {(close) => (
                      <ColorGrid
                        colors={BRANCH_COLORS}
                        standard={[]}
                        none="Automatisch"
                        onPick={(c) => {
                          changeNode(selected, (n) => {
                            const { color: _old, ...rest } = n
                            return c ? { ...rest, color: c } : rest
                          })
                          close()
                        }}
                      />
                    )}
                  </Menu>
                  <Menu icon="style" label="Stijl" title="Stijl van de mindmap" big>
                    {(close) => <Choices items={STYLES} value={map.style} onPick={(s) => (change({ ...mapRef.current, style: s }), close())} />}
                  </Menu>
                </Group>
              </>
            ) : (
              <>
                <Group label="Zoomen">
                  <Big icon="zoom_in" label="Inzoomen" onClick={() => setZoom((z) => Math.min(200, z + 20))} />
                  <Big icon="zoom_out" label="Uitzoomen" onClick={() => setZoom((z) => Math.max(30, z - 20))} />
                  <Big icon="zoom" label="Centreren" onClick={() => (setZoom(100), requestAnimationFrame(centre))} />
                </Group>
                <SchemeGroup scheme={scheme} onScheme={setScheme} />
              </>
            )}
          </div>
        </div>
        <div
          ref={work}
          className={`ofc-workspace mmp-workspace mmp-${map.style}`}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={onPaperDown}
          aria-label="Mindmap. Tab: subonderwerp, Enter: onderwerp ernaast, F2: naam wijzigen, pijltjes: verplaatsen"
        >
          <svg
            ref={svg}
            className={drag?.moved ? 'mmp-svg dragging' : 'mmp-svg'}
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            width={(box.w * zoom) / 100}
            height={(box.h * zoom) / 100}
            role="img"
            aria-label={outline(map.root)}
          >
            <defs>
              <linearGradient id="mmp-root" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#f3f7fc" />
                <stop offset="1" stopColor="#b8cce4" />
              </linearGradient>
              <filter id="mmp-shadow" x="-10%" y="-10%" width="130%" height="140%">
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
            {placed.map(nodeShape)}
            {edited && editing && (
              <foreignObject data-ui="" x={edited.x - 4} y={edited.y - 4} width={Math.max(edited.w, 160) + 8} height={Math.max(edited.h, 40) + 8}>
                <textarea
                  className="mmp-edit"
                  autoFocus
                  value={editing.text}
                  maxLength={300}
                  onFocus={(e) => (editing.text.length > 1 ? e.target.select() : e.target.setSelectionRange(1, 1))}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Escape') {
                      setEditing(null)
                      work.current?.focus()
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      commitEdit()
                    } else if (e.key === 'Tab') {
                      e.preventDefault()
                      commitEdit()
                      addChild(editing.id)
                    }
                  }}
                  onBlur={commitEdit}
                  aria-label="Naam van het onderwerp"
                />
              </foreignObject>
            )}
          </svg>
        </div>
        <footer className="ofc-status">
          <span>{countNodes(map.root)} onderwerpen</span>
          <span>Tab: subonderwerp · Enter: ernaast · F2: naam · spatie: inklappen</span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.problem ?? notice ?? doc.status}
          </span>
          <ZoomBar zoom={zoom} onZoom={setZoom} min={30} max={200} />
        </footer>
      </div>
      {opening && <OpenDialog kind="mindmap" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}
