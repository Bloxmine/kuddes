/** Editors (in Instellingen → Gadgets) for Videokanaal, Radio, Klok, Lijstje, Landen and Favoriete websites. */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CLOCK_ZONES, LIMITS, type ClockZone, type GadgetConfig } from '../../../shared/gadgets'
import { COUNTRIES, flagEmoji } from '../../../shared/countries'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { useChannelVideos } from '../../lib/queries'
import { countryName, useSomaStations } from './gadgetData'
import './MoreGadgets.css'

type Editor<T extends keyof GadgetConfig> = { value: GadgetConfig[T]; onChange: (next: GadgetConfig[T]) => void }

const newId = () => Math.random().toString(36).slice(2, 10)

/** Up and down buttons for a row in a list. */
function MoveButtons({ index, length, onMove }: { index: number; length: number; onMove: (from: number, to: number) => void }) {
  return (
    <>
      <button type="button" className="icon-button" title="Omhoog" disabled={index === 0} onClick={() => onMove(index, index - 1)}>
        <FarmIcon name="arrow_up" />
      </button>
      <button type="button" className="icon-button" title="Omlaag" disabled={index === length - 1} onClick={() => onMove(index, index + 1)}>
        <FarmIcon name="arrow_down" />
      </button>
    </>
  )
}

function moved<T>(list: T[], from: number, to: number) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// ------------------------------------------------------------------ Videokanaal

export function ChannelEditor({ value, onChange, username }: Editor<'kanaal'> & { username: string }) {
  const { data: mine = [], isLoading } = useChannelVideos(username)
  const ready = mine.filter((v) => v.status === 'klaar')
  const toggle = (id: string) =>
    onChange({ ...value, highlights: value.highlights.includes(id) ? value.highlights.filter((x) => x !== id) : [...value.highlights, id].slice(0, LIMITS.highlights) })
  if (isLoading) return <p className="muted">Laden…</p>
  if (ready.length === 0) {
    return (
      <p className="empty">
        Je hebt nog geen video's. <Link to="/video/uploaden">Upload er een</Link>, dan komt je kanaal hier.
      </p>
    )
  }
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Uitgelichte video</span>
        <select className="text-box" value={value.featured ?? ''} onChange={(e) => onChange({ ...value, featured: e.target.value || null })}>
          <option value="">Vanzelf: mijn meest bekeken video</option>
          {ready.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </label>
      <span className="field-label">Hoogtepunten eronder</span>
      {(
        [
          ['populair', 'Mijn meest bekeken video\'s'],
          ['nieuwste', 'Mijn nieuwste video\'s'],
          ['gekozen', `Zelf kiezen (maximaal ${LIMITS.highlights})`],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="gadget-toggle">
          <input type="radio" checked={value.show === key} onChange={() => onChange({ ...value, show: key })} /> {label}
        </label>
      ))}
      {value.show === 'gekozen' && (
        <ul className="kuddesvideo-picker">
          {ready.map((v) => {
            const pos = value.highlights.indexOf(v.id)
            return (
              <li key={v.id}>
                <label className={pos >= 0 ? 'picked' : undefined}>
                  <input type="checkbox" checked={pos >= 0} onChange={() => toggle(v.id)} />
                  {v.thumbUrl && <img src={v.thumbUrl} alt="" />}
                  <span>{v.title}</span>
                  {pos >= 0 && <b className="kuddesvideo-pos">{pos + 1}</b>}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <p className="muted">Bezoekers zien alleen video's die ze mogen zien. De kijkcijfers tellen die video's samen.</p>
    </div>
  )
}

// ------------------------------------------------------------------ Radio

export function RadioEditor({ value, onChange }: Editor<'radio'>) {
  const { data: stations = [], isLoading, isError } = useSomaStations()
  const toggle = (id: string) =>
    onChange({ ...value, channels: value.channels.includes(id) ? value.channels.filter((x) => x !== id) : [...value.channels, id].slice(0, LIMITS.radioChannels) })
  if (isLoading) return <p className="muted">Zenders van SomaFM laden…</p>
  if (isError || stations.length === 0) return <p className="form-error">SomaFM is nu niet bereikbaar. Je gekozen zenders blijven bewaard.</p>
  return (
    <div className="gadget-rows">
      <p className="muted">
        Kies tot {LIMITS.radioChannels} zenders van SomaFM ({value.channels.length} gekozen). Ze staan in de volgorde waarin je ze aanklikt.
      </p>
      <label className="gadget-toggle">
        <input type="checkbox" checked={!!value.autoplay} onChange={(e) => onChange({ ...value, autoplay: e.target.checked })} /> Automatisch een zender afspelen als iemand je profiel
        opent
      </label>
      {value.autoplay && value.channels.length > 0 && (
        <label className="field">
          <span>Welke zender?</span>
          <select className="text-box" value={value.channels.includes(value.autoplayStation ?? '') ? value.autoplayStation : value.channels[0]} onChange={(e) => onChange({ ...value, autoplayStation: e.target.value })}>
            {value.channels.map((id) => (
              <option key={id} value={id}>
                {stations.find((s) => s.id === id)?.title ?? id}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="muted">Bezoekers kunnen automatisch afspelen zelf uitzetten, en sommige browsers wachten eerst op een klik.</p>
      <ul className="radio-picker">
        {stations.map((s) => {
          const pos = value.channels.indexOf(s.id)
          return (
            <li key={s.id}>
              <label className={pos >= 0 ? 'picked' : undefined} title={s.description}>
                <input type="checkbox" checked={pos >= 0} onChange={() => toggle(s.id)} disabled={pos < 0 && value.channels.length >= LIMITS.radioChannels} />
                {s.image && <img src={s.image} alt="" loading="lazy" />}
                <span>
                  <b>{s.title}</b>
                  <span className="muted">{s.genre}</span>
                </span>
                {pos >= 0 && <b className="kuddesvideo-pos">{pos + 1}</b>}
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ Klok

export function ClockEditor({ value, onChange }: Editor<'klok'>) {
  return (
    <div className="gadget-rows">
      <label className="field">
        <span>Tijd van</span>
        <select className="text-box" value={value.zone} onChange={(e) => onChange({ ...value, zone: e.target.value as ClockZone })}>
          {(Object.entries(CLOCK_ZONES) as [ClockZone, string][]).map(([zone, city]) => (
            <option key={zone} value={zone}>
              {city}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>
          Tekst bij de klok <span className="hint">(optioneel, bijv. "Bij oma in Sydney")</span>
        </span>
        <input className="text-box" value={value.label} maxLength={LIMITS.clockLabel} onChange={(e) => onChange({ ...value, label: e.target.value })} placeholder={CLOCK_ZONES[value.zone]} />
      </label>
      <span className="field-label">Soort klok</span>
      <label className="gadget-toggle">
        <input type="radio" checked={value.style === 'analoog'} onChange={() => onChange({ ...value, style: 'analoog' })} /> Met wijzers
      </label>
      <label className="gadget-toggle">
        <input type="radio" checked={value.style === 'digitaal'} onChange={() => onChange({ ...value, style: 'digitaal' })} /> Digitaal
      </label>
    </div>
  )
}

// ------------------------------------------------------------------ Lijstje

export function ListEditor({ value, onChange }: Editor<'lijstje'>) {
  const set = (i: number, text: string) => onChange({ ...value, items: value.items.map((it, j) => (j === i ? { ...it, text } : it)) })
  return (
    <div className="gadget-rows">
      <p className="muted">Geef de box een titel die zegt wat voor lijstje het is, bijvoorbeeld "Mijn top 10 snacks".</p>
      {value.items.map((it, i) => (
        <div key={it.id} className="gadget-row">
          {value.numbered && <b className="list-no">{i + 1}.</b>}
          <input className="text-box" value={it.text} maxLength={LIMITS.listItem} onChange={(e) => set(i, e.target.value)} aria-label={`Regel ${i + 1}`} />
          <MoveButtons index={i} length={value.items.length} onMove={(a, b) => onChange({ ...value, items: moved(value.items, a, b) })} />
          <button type="button" className="icon-button" title="Weghalen" onClick={() => onChange({ ...value, items: value.items.filter((_, j) => j !== i) })}>
            <FarmIcon name="bin" />
          </button>
        </div>
      ))}
      {value.items.length < LIMITS.listItems && (
        <Button onClick={() => onChange({ ...value, items: [...value.items, { id: newId(), text: '' }] })}>
          <FarmIcon name="add" /> Regel toevoegen
        </Button>
      )}
      <label className="gadget-toggle">
        <input type="checkbox" checked={value.numbered} onChange={(e) => onChange({ ...value, numbered: e.target.checked })} /> Nummers ervoor (een top-lijst)
      </label>
      <p className="muted">Bezoekers kunnen elke regel respect geven.</p>
    </div>
  )
}

// ------------------------------------------------------------------ Landen

export function CountriesEditor({ value, onChange }: Editor<'landen'>) {
  const [tab, setTab] = useState<'been' | 'wish'>('been')
  const [q, setQ] = useState('')
  const list = value[tab]
  const needle = q.trim().toLowerCase()
  const all = [...COUNTRIES].map((c) => ({ code: c, name: countryName(c) })).sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  const shown = needle ? all.filter((c) => c.name.toLowerCase().includes(needle) || c.code.toLowerCase() === needle) : all
  const toggle = (code: string) => {
    const on = list.includes(code)
    const other = tab === 'been' ? 'wish' : 'been'
    // Been there means it's no longer on the wish list
    onChange({ ...value, [tab]: on ? list.filter((x) => x !== code) : [...list, code], ...(!on && tab === 'been' && { [other]: value[other].filter((x) => x !== code) }) })
  }
  return (
    <div className="gadget-rows">
      <div className="segmented" role="group" aria-label="Welke lijst">
        <button type="button" className={tab === 'been' ? 'current' : undefined} aria-pressed={tab === 'been'} onClick={() => setTab('been')}>
          <FarmIcon name="tick" /> Geweest ({value.been.length})
        </button>
        <button type="button" className={tab === 'wish' ? 'current' : undefined} aria-pressed={tab === 'wish'} onClick={() => setTab('wish')}>
          <FarmIcon name="map" /> Wil ik nog heen ({value.wish.length})
        </button>
      </div>
      <input className="text-box" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een land" aria-label="Zoek een land" />
      <ul className="country-picker">
        {shown.map((c) => {
          const on = list.includes(c.code)
          return (
            <li key={c.code}>
              <button type="button" className={on ? 'picked' : undefined} aria-pressed={on} onClick={() => toggle(c.code)}>
                <span className="flag">{flagEmoji(c.code)}</span> {c.name}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ Favoriete websites

export function LinksEditor({ value, onChange }: Editor<'links'>) {
  const set = (i: number, changes: Partial<GadgetConfig['links']['links'][number]>) => onChange({ links: value.links.map((l, j) => (j === i ? { ...l, ...changes } : l)) })
  return (
    <div className="gadget-rows">
      {value.links.map((l, i) => (
        <div key={l.id} className="gadget-row link-row">
          <input className="text-box" value={l.title} maxLength={LIMITS.linkTitle} onChange={(e) => set(i, { title: e.target.value })} placeholder="Naam" aria-label={`Naam van website ${i + 1}`} />
          <input
            className="text-box"
            type="url"
            value={l.url}
            maxLength={LIMITS.url}
            onChange={(e) => set(i, { url: e.target.value })}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && !/^https?:\/\//i.test(v)) set(i, { url: `https://${v}` })
            }}
            placeholder="https://"
            aria-label={`Adres van website ${i + 1}`}
          />
          <MoveButtons index={i} length={value.links.length} onMove={(a, b) => onChange({ links: moved(value.links, a, b) })} />
          <button type="button" className="icon-button" title="Weghalen" onClick={() => onChange({ links: value.links.filter((_, j) => j !== i) })}>
            <FarmIcon name="bin" />
          </button>
        </div>
      ))}
      {value.links.length < LIMITS.links && (
        <Button onClick={() => onChange({ links: [...value.links, { id: newId(), title: '', url: '' }] })}>
          <FarmIcon name="add" /> Website toevoegen
        </Button>
      )}
    </div>
  )
}
