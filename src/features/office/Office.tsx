/**
 * The Office 2007 window shared by Kuddes Woord, Rekenblad and Presentatie:
 * the ribbon's building blocks (groups, big and small buttons, menus, colour
 * grids), the title bar with the round Office button, the file menu, the
 * Openen dialog and the zoom bar. Hooks and helpers are in officeFile.ts;
 * styles in Office.css.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { DOC_KINDS, DOC_TITLE_MAX, type DocKind, type DocumentItem } from '../../../shared/documents'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Modal } from '../../components/ui/Modal'
import { formatTime } from '../../lib/time'
import { errorMessage } from '../../lib/api'
import { usePageTitle } from '../../lib/usePageTitle'
import { PALETTE, STANDARD_COLORS, keep, useOfficeLoad, type OfficeFile, type Scheme } from './officeFile'
import './Office.css'

export function Group({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={wide ? 'ofc-group wide' : 'ofc-group'} aria-label={label}>
      <div className="ofc-group-body">{children}</div>
      <h3>{label}</h3>
    </section>
  )
}

export function Big({ icon, label, onClick, active, title, disabled }: { icon: FarmIconName; label: string; onClick: () => void; active?: boolean; title?: string; disabled?: boolean }) {
  return (
    <button type="button" className={active ? 'ofc-big on' : 'ofc-big'} onMouseDown={keep} onClick={onClick} title={title ?? label} aria-pressed={active} disabled={disabled}>
      <FarmIcon name={icon} size={32} />
      <span>{label}</span>
    </button>
  )
}

export function Small({ icon, label, onClick, active, title, disabled }: { icon: FarmIconName; label?: string; onClick: () => void; active?: boolean; title?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={active ? 'ofc-small on' : 'ofc-small'}
      onMouseDown={keep}
      onClick={onClick}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active}
      disabled={disabled}
    >
      <FarmIcon name={icon} />
      {label && <span>{label}</span>}
    </button>
  )
}

/**
 * A button with a menu under it (colours, a grid, a list of choices). The
 * menu floats over the page (fixed, placed under its button), as the ribbon
 * itself scrolls sideways and would cut it off.
 */
export function Menu({ icon, label, title, big, children }: { icon: FarmIconName; label?: string; title: string; big?: boolean; children: (close: () => void) => ReactNode }) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)
  const open = at !== null
  const box = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = () => setAt(null)
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && close()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    // It stays where it opened, so it goes when the page moves under it
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [open])
  // Kept inside the window on the right
  useLayoutEffect(() => {
    const el = popup.current
    if (!el || !at) return
    const over = el.getBoundingClientRect().right - (window.innerWidth - 8)
    if (over > 0) el.style.left = `${Math.max(8, at.left - over)}px`
  }, [at])
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (open) return setAt(null)
    const r = e.currentTarget.getBoundingClientRect()
    setAt({ top: r.bottom + 2, left: r.left })
  }
  return (
    <div className="ofc-menu" ref={box}>
      <button
        type="button"
        className={`${big ? 'ofc-big' : 'ofc-small'} ofc-menu-btn${open ? ' on' : ''}`}
        onMouseDown={keep}
        onClick={toggle}
        title={title}
        aria-label={title}
        aria-expanded={open}
      >
        <FarmIcon name={icon} size={big ? 32 : 16} />
        {label && <span>{label}</span>}
        <i className="ofc-caret" aria-hidden="true" />
      </button>
      {at && (
        <div className="ofc-popup" ref={popup} style={{ top: at.top, left: at.left }} onMouseDown={keep}>
          {children(() => setAt(null))}
        </div>
      )}
    </div>
  )
}

export function ColorGrid({ onPick, colors = PALETTE, standard = STANDARD_COLORS, none }: { onPick: (c: string | null) => void; colors?: string[][]; standard?: string[]; none?: string }) {
  return (
    <div className="ofc-colors">
      <h4>Themakleuren</h4>
      <div className="ofc-color-grid">
        {colors.flatMap((row, r) =>
          row.map((c) => <button key={`${r}${c}`} type="button" style={{ background: c }} title={c} aria-label={c} onClick={() => onPick(c)} />),
        )}
      </div>
      {standard.length > 0 && (
        <>
          <h4>Standaardkleuren</h4>
          <div className="ofc-color-grid">
            {standard.map((c) => (
              <button key={c} type="button" style={{ background: c }} title={c} aria-label={c} onClick={() => onPick(c)} />
            ))}
          </div>
        </>
      )}
      {none && (
        <button type="button" className="ofc-popup-item" onClick={() => onPick(null)}>
          {none}
        </button>
      )}
    </div>
  )
}

/** A list of choices in a menu (marges, regelafstand…); the current one lit. */
export function Choices<T extends string | number>({ items, value, onPick }: { items: readonly (readonly [T, ReactNode])[]; value?: T; onPick: (v: T) => void }) {
  return (
    <div className="ofc-popup-list">
      {items.map(([key, name]) => (
        <button key={String(key)} type="button" className={value === key ? 'ofc-popup-item on' : 'ofc-popup-item'} onClick={() => onPick(key)}>
          {name}
        </button>
      ))}
    </div>
  )
}

export function RibbonTabs<T extends string>({ tabs, tab, onTab }: { tabs: readonly (readonly [T, string])[]; tab: T; onTab: (t: T) => void }) {
  return (
    <div className="ofc-tabs" role="tablist">
      {tabs.map(([key, name]) => (
        <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'on' : undefined} onMouseDown={keep} onClick={() => onTab(key)}>
          {name}
        </button>
      ))}
    </div>
  )
}

export type QuickButton = { icon: FarmIconName; title: string; onClick: () => void }

/** The title bar: the Office button, the quick access toolbar, the file's name (click to rename) and the close button. */
export function TitleBar({
  kind,
  title,
  onRename,
  orbOpen,
  onOrb,
  quick,
}: {
  kind: DocKind
  title: string
  onRename: (title: string) => void
  orbOpen: boolean
  onOrb: () => void
  quick: QuickButton[]
}) {
  const [renaming, setRenaming] = useState(false)
  return (
    <header className="ofc-titlebar">
      <button type="button" className={orbOpen ? 'ofc-orb on' : 'ofc-orb'} onMouseDown={keep} onClick={onOrb} title={`${DOC_KINDS[kind].name}-menu`} aria-expanded={orbOpen}>
        <img src="/favicon.svg" alt="" width={22} height={22} />
      </button>
      <div className="ofc-qat" role="toolbar" aria-label="Werkbalk Snelle toegang">
        {quick.map((q) => (
          <button key={q.title} type="button" onMouseDown={keep} onClick={q.onClick} title={q.title}>
            <FarmIcon name={q.icon} />
          </button>
        ))}
      </div>
      <div className="ofc-title">
        {renaming ? (
          <input
            className="ofc-title-input"
            autoFocus
            value={title}
            maxLength={DOC_TITLE_MAX}
            onChange={(e) => onRename(e.target.value)}
            onBlur={() => setRenaming(false)}
            onKeyDown={(e) => e.key === 'Enter' && setRenaming(false)}
            aria-label="Naam van het bestand"
          />
        ) : (
          <button type="button" className="ofc-title-name" onClick={() => setRenaming(true)} title="Naam wijzigen">
            {title}
          </button>
        )}
        <span> - {DOC_KINDS[kind].name}</span>
      </div>
      <Link to="/tools" className="ofc-close" title="Sluiten (terug naar Tools)" aria-label="Sluiten">
        ×
      </Link>
    </header>
  )
}

export type ExportOption = { key: string; icon: FarmIconName; name: string; hint: string; onClick: () => void }

/** The Office button's menu: what you do with the file as a whole, and the recent ones. */
export function FileMenu(p: {
  kind: DocKind
  docs: DocumentItem[]
  currentId: number | null
  onClose: () => void
  onOpen: () => void
  onSave: () => void
  onSaveAs: () => void
  exports: ExportOption[]
  onPrint: () => void
  onDelete: (() => void) | null
}) {
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const info = DOC_KINDS[p.kind]
  const { onClose } = p
  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.ofc-orb') && onClose()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])
  const act = (f: () => void) => () => {
    onClose()
    f()
  }
  const cmd = (icon: FarmIconName, name: string, f: () => void) => (
    <li onMouseEnter={() => setExporting(false)}>
      <button type="button" onClick={act(f)}>
        <FarmIcon name={icon} size={32} /> <span>{name}</span>
      </button>
    </li>
  )
  const recent = p.docs.filter((d) => d.kind === p.kind)
  return (
    <div className="ofc-orbmenu" ref={box} role="menu">
      <div className="ofc-orbmenu-main">
        <ul className="ofc-orbmenu-cmds">
          {cmd('page_white_add', 'Nieuw', () => navigate(info.path))}
          {cmd('folder_page', 'Openen', p.onOpen)}
          {cmd('diskette', 'Opslaan', p.onSave)}
          {cmd('save_as', 'Opslaan als', p.onSaveAs)}
          <li className={exporting ? 'open' : undefined} onMouseEnter={() => setExporting(true)}>
            <button type="button" onClick={() => setExporting((x) => !x)} aria-expanded={exporting}>
              <FarmIcon name="page_white_put" size={32} /> <span>Exporteren</span>
              <i className="ofc-arrow" aria-hidden="true" />
            </button>
          </li>
          {cmd('printer', 'Afdrukken', p.onPrint)}
          {p.onDelete && cmd('page_white_delete', 'Verwijderen', p.onDelete)}
        </ul>
        <div className="ofc-orbmenu-side">
          {exporting ? (
            <>
              <h3>Een kopie bewaren als</h3>
              {p.exports.map((x) => (
                <button key={x.key} type="button" className="ofc-orbmenu-option" onClick={act(x.onClick)}>
                  <FarmIcon name={x.icon} size={32} />
                  <span>
                    <b>{x.name}</b>
                    <small>{x.hint}</small>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <h3>Recente {info.many}</h3>
              {recent.length === 0 ? (
                <p className="ofc-muted">Nog niets bewaard.</p>
              ) : (
                <ol className="ofc-recent">
                  {recent.slice(0, 9).map((d, i) => (
                    <li key={d.id}>
                      <button type="button" className={d.id === p.currentId ? 'on' : undefined} onClick={act(() => navigate(`${info.path}/${d.id}`))}>
                        <u>{i + 1}</u> {d.title}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
      <div className="ofc-orbmenu-foot">
        <Link to="/tools" className="ofc-orbmenu-btn">
          <FarmIcon name="door_out" /> {info.name} sluiten
        </Link>
      </div>
    </div>
  )
}

export function OpenDialog({ kind, docs, loading, onClose }: { kind: DocKind; docs: DocumentItem[]; loading: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const info = DOC_KINDS[kind]
  const [q, setQ] = useState('')
  const own = docs.filter((d) => d.kind === kind)
  const shown = own.filter((d) => d.title.toLocaleLowerCase('nl').includes(q.trim().toLocaleLowerCase('nl')))
  return (
    <Modal title="Openen" icon="folder_page" onClose={onClose} wide>
      <input className="text-box ofc-open-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op naam" aria-label="Zoeken" autoFocus />
      {loading ? (
        <p className="muted">Laden…</p>
      ) : shown.length === 0 ? (
        <p className="empty">{own.length ? 'Niets met die naam.' : `Je hebt nog geen ${info.many} bewaard.`}</p>
      ) : (
        <ul className="ofc-open-list">
          {shown.map((d) => (
            <li key={d.id}>
              <button type="button" onClick={() => navigate(`${info.path}/${d.id}`)}>
                <FarmIcon name={info.icon} size={32} />
                <span>
                  <b>{d.title}</b>
                  <small className="muted">
                    {d.words.toLocaleString('nl-NL')} {info.size} · gewijzigd {formatTime(d.updatedAt)}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** The zoom at the right of the status bar: − slider + and the percentage. */
export function ZoomBar({ zoom, onZoom, min = 30, max = 200 }: { zoom: number; onZoom: (z: number) => void; min?: number; max?: number }) {
  return (
    <span className="ofc-zoombar">
      <button type="button" onClick={() => onZoom(Math.max(min, zoom - 10))} aria-label="Uitzoomen">
        −
      </button>
      <input type="range" min={min} max={max} step={10} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} aria-label="Zoom" />
      <button type="button" onClick={() => onZoom(Math.min(max, zoom + 10))} aria-label="Inzoomen">
        +
      </button>
      <b>{zoom}%</b>
    </span>
  )
}

/**
 * The page around a program (/tools/<program> and /tools/<program>/:id):
 * loads the file, and gives each one opened (also "Nieuw" while a new one is
 * open) a fresh program.
 */
export function OfficeLoader<C>({ kind, children }: { kind: DocKind; children: (file: OfficeFile<C> | null) => ReactNode }) {
  const { id } = useParams()
  const location = useLocation()
  const { data, isLoading, error } = useOfficeLoad<C>(kind, id)
  const info = DOC_KINDS[kind]
  usePageTitle(`${data?.title ?? info.newTitle} - ${info.name}`)
  if (id && isLoading) return <main className="page page-con ofc-page muted">Openen…</main>
  if (id && error)
    return (
      <main className="page page-con ofc-page">
        <p className="form-error">{errorMessage(error)}</p>
        <Link to={info.path}>Een nieuwe {info.one} beginnen</Link>
      </main>
    )
  return <Fragment key={location.key}>{children(data ?? null)}</Fragment>
}

/** The Kleurenschema group in a ribbon's Beeld tab: Blauw, Zilver or Zwart, for all the programs. */
export function SchemeGroup({ scheme, onScheme }: { scheme: Scheme; onScheme: (s: Scheme) => void }) {
  return (
    <Group label="Kleurenschema">
      {(
        [
          ['blauw', 'Blauw'],
          ['zilver', 'Zilver'],
          ['zwart', 'Zwart'],
        ] as const
      ).map(([key, name]) => (
        <button key={key} type="button" className={scheme === key ? 'ofc-scheme on' : 'ofc-scheme'} onMouseDown={keep} onClick={() => onScheme(key)}>
          <span className={`ofc-scheme-swatch ${key}`} aria-hidden="true" />
          {name}
        </button>
      ))}
    </Group>
  )
}

