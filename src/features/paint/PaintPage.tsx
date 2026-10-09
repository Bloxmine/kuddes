import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PAINT_MAX_SIDE, type Drawing } from '../../../shared/documents'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { Big, FileMenu, Group, Menu, OfficeLoader, OpenDialog, RibbonTabs, SchemeGroup, Small, TitleBar, ZoomBar, Choices } from '../office/Office'
import { useOfficeFile, useScheme, type OfficeFile } from '../office/officeFile'
import { shapeSvg } from '../presentatie/slides'
import './Paint.css'

type Tool = 'potlood' | 'kwast' | 'spuitbus' | 'gum' | 'emmer' | 'pipet' | 'tekst' | 'lijn' | 'rect' | 'round' | 'ellipse' | 'triangle' | 'arrow' | 'star' | 'heart'
const SHAPES: [Tool, string][] = [
  ['lijn', 'Lijn'],
  ['rect', 'Rechthoek'],
  ['round', 'Afgeronde rechthoek'],
  ['ellipse', 'Ovaal'],
  ['triangle', 'Driehoek'],
  ['arrow', 'Pijl'],
  ['star', 'Ster'],
  ['heart', 'Hart'],
]
const isShape = (t: Tool) => SHAPES.some(([k]) => k === t)
/** The palette of Windows 7 Paint: two rows of ten. */
const PALETTE = [
  '#000000',
  '#7f7f7f',
  '#880015',
  '#ed1c24',
  '#ff7f27',
  '#fff200',
  '#22b14c',
  '#00a2e8',
  '#3f48cc',
  '#a349a4',
  '#ffffff',
  '#c3c3c3',
  '#b97a57',
  '#ffaec9',
  '#ffc90e',
  '#efe4b0',
  '#b5e61d',
  '#99d9ea',
  '#7092be',
  '#c8bfe7',
]
const SIZES = [1, 3, 5, 8, 14]
const TABS = [
  ['start', 'Start'],
  ['beeld', 'Beeld'],
] as const

const blank = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = '#ffffff'
  x.fillRect(0, 0, w, h)
  return c.toDataURL('image/png')
}
const hexOf = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))

/** Kuddes Paint (/tools/paint): drawing as in Windows 7 Paint, with the ribbon around it. */
export function PaintPage() {
  return <OfficeLoader<Drawing> kind="paint">{(file) => <Paint file={file} />}</OfficeLoader>
}

function Paint({ file }: { file: OfficeFile<Drawing> | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const [size, setSizeState] = useState({
    w: file?.content?.width ?? 800,
    h: file?.content?.height ?? 500,
  })
  const snapshot = useCallback(() => {
    const c = canvas.current!
    return {
      content: {
        width: c.width,
        height: c.height,
        image: c.toDataURL('image/png'),
      },
      words: c.width,
    }
  }, [])
  const doc = useOfficeFile<Drawing>('paint', file, snapshot)
  const { user, setUser } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'start' | 'beeld'>('start')
  const [scheme, setScheme] = useScheme()
  const [orb, setOrb] = useState(false)
  const closeOrb = useCallback(() => setOrb(false), [])
  const [opening, setOpening] = useState(false)
  const [tool, setTool] = useState<Tool>('potlood')
  const [width, setWidth] = useState(3)
  const [color1, setColor1] = useState('#000000')
  const [color2, setColor2] = useState('#ffffff')
  const [active, setActive] = useState<1 | 2>(1)
  const [fill, setFill] = useState<'geen' | 'kleur2'>('geen')
  const [outline, setOutline] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const [text, setText] = useState<{
    x: number
    y: number
    value: string
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const history = useRef<{ past: ImageData[]; future: ImageData[] }>({
    past: [],
    future: [],
  })
  const fileInput = useRef<HTMLInputElement>(null)

  const ctx = () => canvas.current!.getContext('2d', { willReadFrequently: true })!

  // The drawing once, when it opens
  useLayoutEffect(() => {
    const c = canvas.current!
    const img = new Image()
    img.onload = () => {
      c.getContext('2d')!.drawImage(img, 0, 0)
    }
    c.width = size.w
    c.height = size.h
    img.src = file?.content?.image ?? blank(size.w, size.h)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the drawing opens
  }, [])

  // ---------------------------------------------------------------- undo
  const record = () => {
    const c = canvas.current!
    history.current.past.push(ctx().getImageData(0, 0, c.width, c.height))
    if (history.current.past.length > 25) history.current.past.shift()
    history.current.future = []
  }
  const restore = (from: 'past' | 'future') => {
    const c = canvas.current!
    const img = history.current[from].pop()
    if (!img) return
    history.current[from === 'past' ? 'future' : 'past'].push(ctx().getImageData(0, 0, c.width, c.height))
    c.width = img.width
    c.height = img.height
    ctx().putImageData(img, 0, 0)
    setSizeState({ w: img.width, h: img.height })
    doc.changed()
  }

  // ---------------------------------------------------------------- drawing
  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * canvas.current!.width),
      y: Math.round(((e.clientY - r.top) / r.height) * canvas.current!.height),
    }
  }
  const stroke = useRef<{
    x: number
    y: number
    sx: number
    sy: number
    color: string
    other: string
    spray?: number
  } | null>(null)

  const floodFill = (x: number, y: number, hex: string) => {
    const c = canvas.current!
    const img = ctx().getImageData(0, 0, c.width, c.height)
    const d = img.data
    const at = (px: number, py: number) => (py * c.width + px) * 4
    const i0 = at(x, y)
    const [tr, tg, tb, ta] = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]]
    const [nr, ng, nb] = rgbOf(hex)
    if (tr === nr && tg === ng && tb === nb && ta === 255) return
    const same = (i: number) => Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) + Math.abs(d[i + 3] - ta) <= 48
    const stack: [number, number][] = [[x, y]]
    while (stack.length) {
      const [px, py] = stack.pop()!
      let lx = px
      while (lx >= 0 && same(at(lx, py))) lx--
      lx++
      let up = false
      let down = false
      for (let cx = lx; cx < c.width && same(at(cx, py)); cx++) {
        const i = at(cx, py)
        d[i] = nr
        d[i + 1] = ng
        d[i + 2] = nb
        d[i + 3] = 255
        if (py > 0) {
          const u = same(at(cx, py - 1))
          if (u && !up) stack.push([cx, py - 1])
          up = u
        }
        if (py < c.height - 1) {
          const dn = same(at(cx, py + 1))
          if (dn && !down) stack.push([cx, py + 1])
          down = dn
        }
      }
    }
    ctx().putImageData(img, 0, 0)
  }

  /** A shape from one corner to the other (Shift: square, or a straight line in steps of 45°). */
  const drawShape = (x: CanvasRenderingContext2D, t: Tool, a: { x: number; y: number }, b: { x: number; y: number }, line: string, fillColor: string | null, shift: boolean) => {
    let { x: bx, y: by } = b
    if (shift && t !== 'lijn') {
      const s = Math.max(Math.abs(bx - a.x), Math.abs(by - a.y))
      bx = a.x + Math.sign(bx - a.x || 1) * s
      by = a.y + Math.sign(by - a.y || 1) * s
    } else if (shift) {
      const ang = Math.round(Math.atan2(by - a.y, bx - a.x) / (Math.PI / 4)) * (Math.PI / 4)
      const len = Math.hypot(bx - a.x, by - a.y)
      bx = a.x + Math.cos(ang) * len
      by = a.y + Math.sin(ang) * len
    }
    x.lineWidth = width
    x.lineCap = 'round'
    x.lineJoin = 'round'
    x.strokeStyle = line
    if (t === 'lijn') {
      x.beginPath()
      x.moveTo(a.x, a.y)
      x.lineTo(bx, by)
      x.stroke()
      return
    }
    const left = Math.min(a.x, bx)
    const top = Math.min(a.y, by)
    const w = Math.abs(bx - a.x)
    const h = Math.abs(by - a.y)
    if (w < 1 || h < 1) return
    // Paint's shapes are the same as the Presentatie's: the SVG drawn on the canvas
    const shape = t === 'heart' ? null : (t as 'rect' | 'round' | 'ellipse' | 'triangle' | 'arrow' | 'star')
    const path = new Path2D()
    if (shape === 'rect') path.rect(left, top, w, h)
    else if (shape === 'round') path.roundRect(left, top, w, h, Math.min(w, h) * 0.15)
    else if (shape === 'ellipse') path.ellipse(left + w / 2, top + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    else {
      const pts: [number, number][] =
        shape === 'triangle'
          ? [
              [50, 1],
              [99, 99],
              [1, 99],
            ]
          : shape === 'arrow'
            ? [
                [1, 30],
                [62, 30],
                [62, 4],
                [99, 50],
                [62, 96],
                [62, 70],
                [1, 70],
              ]
            : shape === 'star'
              ? [
                  [50, 2],
                  [61, 37],
                  [98, 37],
                  [68, 59],
                  [79, 95],
                  [50, 73],
                  [21, 95],
                  [32, 59],
                  [2, 37],
                  [39, 37],
                ]
              : []
      if (pts.length) {
        pts.forEach(([px, py], i) => (i ? path.lineTo(left + (px / 100) * w, top + (py / 100) * h) : path.moveTo(left + (px / 100) * w, top + (py / 100) * h)))
        path.closePath()
      } else {
        // A heart
        path.moveTo(left + w / 2, top + h * 0.95)
        path.bezierCurveTo(left - w * 0.1, top + h * 0.55, left + w * 0.05, top - h * 0.05, left + w / 2, top + h * 0.28)
        path.bezierCurveTo(left + w * 0.95, top - h * 0.05, left + w * 1.1, top + h * 0.55, left + w / 2, top + h * 0.95)
      }
    }
    if (fillColor) {
      x.fillStyle = fillColor
      x.fill(path)
    }
    if (outline || !fillColor) x.stroke(path)
  }

  const spray = (x: number, y: number, color: string) => {
    const c = ctx()
    c.fillStyle = color
    const r = width * 3 + 4
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2
      const d = Math.random() * r
      c.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1)
    }
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 2) return
    e.preventDefault()
    if (text) commitText()
    const p = pos(e)
    const main = e.button === 2 ? color2 : color1
    const other = e.button === 2 ? color1 : color2
    if (tool === 'pipet') {
      const [r, g, b] = ctx().getImageData(p.x, p.y, 1, 1).data
      if (e.button === 2) setColor2(hexOf(r, g, b))
      else setColor1(hexOf(r, g, b))
      setTool('potlood')
      return
    }
    if (tool === 'tekst') {
      setText({ x: p.x, y: p.y, value: '' })
      return
    }
    record()
    doc.changed()
    if (tool === 'emmer') {
      floodFill(p.x, p.y, main)
      return
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    stroke.current = { x: p.x, y: p.y, sx: p.x, sy: p.y, color: main, other }
    const c = ctx()
    if (tool === 'spuitbus') {
      spray(p.x, p.y, main)
      stroke.current.spray = window.setInterval(() => stroke.current && spray(stroke.current.x, stroke.current.y, main), 30)
    } else if (!isShape(tool)) {
      // A dot where you click
      c.fillStyle = tool === 'gum' ? color2 : main
      const s = tool === 'potlood' ? 1 : tool === 'gum' ? width * 3 : width
      c.beginPath()
      c.arc(p.x, p.y, s / 2, 0, Math.PI * 2)
      c.fill()
    }
  }
  const onMove = (e: React.PointerEvent) => {
    const p = pos(e)
    setCursor(p)
    const s = stroke.current
    if (!s) return
    if (isShape(tool)) {
      const o = overlay.current!
      const x = o.getContext('2d')!
      x.clearRect(0, 0, o.width, o.height)
      drawShape(x, tool, { x: s.sx, y: s.sy }, p, s.color, fill === 'kleur2' ? s.other : null, e.shiftKey)
    } else if (tool !== 'spuitbus') {
      const c = ctx()
      c.strokeStyle = tool === 'gum' ? color2 : s.color
      c.lineWidth = tool === 'potlood' ? 1 : tool === 'gum' ? width * 3 : width
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      c.moveTo(s.x, s.y)
      c.lineTo(p.x, p.y)
      c.stroke()
    }
    s.x = p.x
    s.y = p.y
  }
  const onUp = (e: React.PointerEvent) => {
    const s = stroke.current
    if (!s) return
    if (s.spray) clearInterval(s.spray)
    if (isShape(tool)) {
      overlay.current!.getContext('2d')!.clearRect(0, 0, overlay.current!.width, overlay.current!.height)
      drawShape(ctx(), tool, { x: s.sx, y: s.sy }, pos(e), s.color, fill === 'kleur2' ? s.other : null, e.shiftKey)
    }
    stroke.current = null
  }

  const commitText = () => {
    if (!text) return
    if (text.value.trim()) {
      record()
      const c = ctx()
      c.fillStyle = color1
      c.font = `${Math.max(12, width * 5)}px Calibri, Carlito, sans-serif`
      c.textBaseline = 'top'
      text.value.split('\n').forEach((line, i) => c.fillText(line, text.x, text.y + i * Math.max(12, width * 5) * 1.2))
      doc.changed()
    }
    setText(null)
  }

  // ---------------------------------------------------------------- the picture as a whole
  const resize = (w: number, h: number, stretch: boolean) => {
    const c = canvas.current!
    w = Math.max(1, Math.min(PAINT_MAX_SIDE, Math.round(w)))
    h = Math.max(1, Math.min(PAINT_MAX_SIDE, Math.round(h)))
    record()
    const old = document.createElement('canvas')
    old.width = c.width
    old.height = c.height
    old.getContext('2d')!.drawImage(c, 0, 0)
    c.width = w
    c.height = h
    const x = ctx()
    x.fillStyle = color2
    x.fillRect(0, 0, w, h)
    if (stretch) x.drawImage(old, 0, 0, w, h)
    else x.drawImage(old, 0, 0)
    setSizeState({ w, h })
    doc.changed()
  }
  const transform = (how: 'links' | 'rechts' | 'horizontaal' | 'verticaal') => {
    const c = canvas.current!
    record()
    const old = document.createElement('canvas')
    old.width = c.width
    old.height = c.height
    old.getContext('2d')!.drawImage(c, 0, 0)
    const turn = how === 'links' || how === 'rechts'
    if (turn) {
      c.width = old.height
      c.height = old.width
    }
    const x = ctx()
    x.save()
    if (how === 'rechts') {
      x.translate(c.width, 0)
      x.rotate(Math.PI / 2)
    } else if (how === 'links') {
      x.translate(0, c.height)
      x.rotate(-Math.PI / 2)
    } else if (how === 'horizontaal') {
      x.translate(c.width, 0)
      x.scale(-1, 1)
    } else {
      x.translate(0, c.height)
      x.scale(1, -1)
    }
    x.drawImage(old, 0, 0)
    x.restore()
    setSizeState({ w: c.width, h: c.height })
    doc.changed()
  }
  const clearAll = () => {
    record()
    const c = canvas.current!
    const x = ctx()
    x.fillStyle = color2
    x.fillRect(0, 0, c.width, c.height)
    doc.changed()
  }
  const openPicture = (f: File) => {
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, PAINT_MAX_SIDE / Math.max(img.width, img.height))
      const w = Math.round(img.width * k)
      const h = Math.round(img.height * k)
      record()
      const c = canvas.current!
      c.width = w
      c.height = h
      ctx().drawImage(img, 0, 0, w, h)
      setSizeState({ w, h })
      doc.changed()
      URL.revokeObjectURL(url)
    }
    img.src = url
  }
  const blob = () => new Promise<Blob>((resolve) => canvas.current!.toBlob((b) => resolve(b!), 'image/png'))
  const exportPng = async () => {
    const url = URL.createObjectURL(await blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Tekening'}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const upload = async (where: 'fotos' | 'profielfoto') => {
    try {
      const form = new FormData()
      form.set(
        'file',
        new File([await blob()], `${doc.title || 'tekening'}.png`, {
          type: 'image/png',
        }),
      )
      if (where === 'fotos') {
        form.set('caption', doc.title.slice(0, 100))
        await api('/photos', { method: 'POST', form })
        if (user)
          void queryClient.invalidateQueries({
            queryKey: keys.photos(user.username),
          })
        setNotice('De tekening staat nu bij je Foto’s.')
      } else {
        setUser(await api('/me/avatar', { method: 'POST', form }))
        setNotice('De tekening is nu je profielfoto.')
      }
    } catch (e) {
      doc.setProblem(errorMessage(e))
    }
  }

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      const ctrl = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (ctrl && k === 'z') {
        e.preventDefault()
        restore('past')
      } else if (ctrl && k === 'y') {
        e.preventDefault()
        restore('future')
      } else if (ctrl && k === 's') {
        e.preventDefault()
        doc.save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickColor = (c: string) => (active === 1 ? setColor1(c) : setColor2(c))
  const toolBtn = (t: Tool, icon: Parameters<typeof Small>[0]['icon'], label: string) => <Small icon={icon} onClick={() => setTool(t)} active={tool === t} title={label} />

  return (
    <main className="page ofc-page">
      <div className="ofc-app pnt-app" data-scheme={scheme}>
        <TitleBar
          kind="paint"
          title={doc.title}
          onRename={doc.setTitle}
          orbOpen={orb}
          onOrb={() => setOrb((o) => !o)}
          quick={[
            { icon: 'diskette', title: 'Opslaan (Ctrl+S)', onClick: doc.save },
            {
              icon: 'arrow_undo',
              title: 'Ongedaan maken (Ctrl+Z)',
              onClick: () => restore('past'),
            },
            {
              icon: 'arrow_redo',
              title: 'Opnieuw (Ctrl+Y)',
              onClick: () => restore('future'),
            },
          ]}
        />
        {orb && (
          <FileMenu
            kind="paint"
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
                hint: 'Voor op je computer of ergens anders.',
                onClick: () => void exportPng(),
              },
              {
                key: 'fotos',
                icon: 'photos',
                name: 'In mijn Foto’s',
                hint: 'Een kopie bij je foto’s op Kuddes.',
                onClick: () => void upload('fotos'),
              },
              {
                key: 'avatar',
                icon: 'user',
                name: 'Als profielfoto',
                hint: 'Deze tekening wordt je profielfoto.',
                onClick: () => void upload('profielfoto'),
              },
            ]}
            onPrint={() => {
              const w = window.open('', '_blank', 'width=900,height=700')
              if (!w) return
              const img = w.document.createElement('img')
              img.src = canvas.current!.toDataURL('image/png')
              img.style.maxWidth = '100%'
              w.document.title = doc.title
              w.document.body.append(img)
              setTimeout(() => w.print(), 400)
            }}
            onDelete={doc.remove}
          />
        )}
        <div className="ofc-ribbon">
          <RibbonTabs tabs={TABS} tab={tab} onTab={setTab} />
          <div className="ofc-ribbon-body" role="tabpanel">
            {tab === 'start' ? (
              <>
                <Group label="Afbeelding">
                  <div className="ofc-stack">
                    <Menu icon="page_size" label="Formaat" title="Formaat wijzigen">
                      {(close) => (
                        <ResizeForm
                          w={size.w}
                          h={size.h}
                          onDone={(w, h, stretch) => {
                            resize(w, h, stretch)
                            close()
                          }}
                        />
                      )}
                    </Menu>
                    <Menu icon="shape_rotate_clockwise" label="Draaien" title="Draaien of spiegelen">
                      {(close) => (
                        <Choices
                          items={[
                            ['rechts', '90° naar rechts draaien'],
                            ['links', '90° naar links draaien'],
                            ['horizontaal', 'Horizontaal spiegelen'],
                            ['verticaal', 'Verticaal spiegelen'],
                          ]}
                          onPick={(h) => (transform(h), close())}
                        />
                      )}
                    </Menu>
                    <Small icon="picture_add" label="Openen…" onClick={() => fileInput.current?.click()} title="Een afbeelding van je computer openen" />
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) openPicture(f)
                    }}
                  />
                </Group>
                <Group label="Hulpmiddelen">
                  <div className="pnt-tools">
                    {toolBtn('potlood', 'pencil', 'Potlood')}
                    {toolBtn('emmer', 'paintcan', 'Opvullen met kleur')}
                    {toolBtn('tekst', 'font', 'Tekst')}
                    {toolBtn('gum', 'draw_eraser', 'Gum (in kleur 2)')}
                    {toolBtn('pipet', 'eye', 'Kleurkiezer')}
                    {toolBtn('spuitbus', 'paint_tube', 'Spuitbus')}
                  </div>
                </Group>
                <Group label="Penselen">
                  <Big icon="paintbrush" label="Kwast" onClick={() => setTool('kwast')} active={tool === 'kwast'} />
                </Group>
                <Group label="Vormen">
                  <div className="pnt-shapes">
                    {SHAPES.map(([k, name]) => (
                      <button key={k} type="button" className={tool === k ? 'pnt-shape on' : 'pnt-shape'} onClick={() => setTool(k)} title={name} aria-label={name}>
                        {k === 'lijn' ? (
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <line x1="3" y1="17" x2="17" y2="3" stroke="#2b4e79" strokeWidth="2" />
                          </svg>
                        ) : k === 'round' ? (
                          // The Presentatie's rounded corners are too small to see at this size
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <rect x="2" y="3" width="16" height="14" rx="5" fill="#fff" stroke="#2b4e79" strokeWidth="1.5" />
                          </svg>
                        ) : k === 'heart' ? (
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path d="M10 18 C1 11 3 3 10 7 C17 3 19 11 10 18Z" fill="#fff" stroke="#2b4e79" strokeWidth="1.5" />
                          </svg>
                        ) : (
                          <span
                            dangerouslySetInnerHTML={{
                              __html: shapeSvg(k as 'rect', '#ffffff', '#2b4e79'),
                            }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="ofc-stack">
                    <label className="pnt-check">
                      <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> Omtrek
                    </label>
                    <label className="pnt-check">
                      <input type="checkbox" checked={fill === 'kleur2'} onChange={(e) => setFill(e.target.checked ? 'kleur2' : 'geen')} /> Opvullen (kleur 2)
                    </label>
                  </div>
                </Group>
                <Group label="Grootte">
                  <div className="pnt-sizes">
                    {SIZES.map((s) => (
                      <button key={s} type="button" className={width === s ? 'on' : undefined} onClick={() => setWidth(s)} title={`${s} px`} aria-label={`${s} pixels`}>
                        <i style={{ height: Math.min(s, 12) }} />
                      </button>
                    ))}
                  </div>
                </Group>
                <Group label="Kleuren" wide>
                  <button type="button" className={active === 1 ? 'pnt-swatch on' : 'pnt-swatch'} onClick={() => setActive(1)}>
                    <i style={{ background: color1 }} />
                    Kleur 1
                  </button>
                  <button type="button" className={active === 2 ? 'pnt-swatch on' : 'pnt-swatch'} onClick={() => setActive(2)}>
                    <i style={{ background: color2 }} />
                    Kleur 2
                  </button>
                  <div className="pnt-palette">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        style={{ background: c }}
                        onClick={() => pickColor(c)}
                        onContextMenu={(e) => (e.preventDefault(), setColor2(c))}
                        title={c}
                        aria-label={c}
                      />
                    ))}
                  </div>
                  <label className="pnt-edit-color" title="Kleuren bewerken">
                    <input type="color" value={active === 1 ? color1 : color2} onChange={(e) => pickColor(e.target.value)} />
                    <span>Kleuren bewerken</span>
                  </label>
                </Group>
              </>
            ) : (
              <>
                <Group label="Zoomen">
                  <Big icon="zoom_in" label="Inzoomen" onClick={() => setZoom((z) => Math.min(800, z * 2))} />
                  <Big icon="zoom_out" label="Uitzoomen" onClick={() => setZoom((z) => Math.max(25, z / 2))} />
                  <Big icon="zoom" label="100%" onClick={() => setZoom(100)} />
                </Group>
                <Group label="Afbeelding">
                  <Big icon="draw_eraser" label="Alles wissen" onClick={clearAll} title="Alles in kleur 2" />
                </Group>
                <SchemeGroup scheme={scheme} onScheme={setScheme} />
              </>
            )}
          </div>
        </div>
        <div className="ofc-workspace pnt-workspace" onContextMenu={(e) => e.preventDefault()}>
          <div
            className="pnt-sheet"
            style={{
              width: (size.w * zoom) / 100,
              height: (size.h * zoom) / 100,
            }}
          >
            <canvas
              ref={canvas}
              className={`pnt-canvas tool-${tool}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setCursor(null)}
              aria-label="Tekenvlak"
            />
            <canvas ref={overlay} className="pnt-overlay" width={size.w} height={size.h} aria-hidden="true" />
            {text && (
              <textarea
                className="pnt-text"
                autoFocus
                value={text.value}
                style={{
                  left: `${(text.x / size.w) * 100}%`,
                  top: `${(text.y / size.h) * 100}%`,
                  color: color1,
                  fontSize: (Math.max(12, width * 5) * zoom) / 100,
                }}
                onChange={(e) => setText({ ...text, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setText(null)
                  else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    commitText()
                  }
                }}
                onBlur={commitText}
                placeholder="Typ en druk op Enter"
                aria-label="Tekst"
              />
            )}
          </div>
        </div>
        <footer className="ofc-status">
          <span>{cursor ? `${cursor.x}, ${cursor.y} px` : ' '}</span>
          <span>
            {size.w} × {size.h} px
          </span>
          <span className={doc.problem ? 'ofc-status-msg error' : 'ofc-status-msg'} role="status">
            {doc.problem ?? notice ?? doc.status}
          </span>
          <ZoomBar zoom={zoom} onZoom={setZoom} min={25} max={400} />
        </footer>
      </div>
      {opening && <OpenDialog kind="paint" docs={doc.docs} loading={doc.docsLoading} onClose={() => setOpening(false)} />}
    </main>
  )
}

function ResizeForm({ w, h, onDone }: { w: number; h: number; onDone: (w: number, h: number, stretch: boolean) => void }) {
  const [nw, setW] = useState(String(w))
  const [nh, setH] = useState(String(h))
  const [stretch, setStretch] = useState(false)
  return (
    <form
      className="pnt-resize"
      onSubmit={(e) => {
        e.preventDefault()
        onDone(Number(nw) || w, Number(nh) || h, stretch)
      }}
    >
      <label>
        Breedte <input type="number" min={1} max={PAINT_MAX_SIDE} value={nw} onChange={(e) => setW(e.target.value)} /> px
      </label>
      <label>
        Hoogte <input type="number" min={1} max={PAINT_MAX_SIDE} value={nh} onChange={(e) => setH(e.target.value)} /> px
      </label>
      <label className="pnt-check">
        <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} /> Tekening mee uitrekken
      </label>
      <button type="submit" className="btn">
        Toepassen
      </button>
    </form>
  )
}
