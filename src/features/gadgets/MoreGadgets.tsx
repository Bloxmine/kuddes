/**
 * Videokanaal, Radio (SomaFM), Klok, Lijstje, Landen and Favoriete websites:
 * the newer profile gadgets.
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget, RadioStation } from '../../../shared/api'
import { CLOCK_ZONES } from '../../../shared/gadgets'
import { flagEmoji } from '../../../shared/countries'
import { formatDuration } from '../../../shared/videos'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ExternalBlocked } from '../../components/ui/ExternalBlocked'
import { useConsent } from '../../lib/cookieConsent'
import { api } from '../../lib/api'
import { withSmileys } from '../../lib/smileys'
import { VideoPlayer } from '../video/VideoPlayer'
import { videoHref } from '../video/videoLinks'
import { RespectButton } from './ItemRespect'
import { usePreferences } from '../../lib/preferences'
import { countryName, useSomaStations } from './gadgetData'
import './MoreGadgets.css'

type Of<T extends Gadget['type']> = Extract<Gadget, { type: T }>

// ------------------------------------------------------------------ Videokanaal

/** The owner's Kuddes Video channel: a featured video, highlights and the numbers. */
export function ChannelGadget({ gadget, username, isOwner }: { gadget: Of<'kanaal'>; username: string; isOwner: boolean }) {
  const { videoCount, views, featured, highlights } = gadget.channel
  const [playing, setPlaying] = useState<string | null>(null)
  const all = [...(featured ? [featured] : []), ...highlights]
  const current = all.find((v) => v.id === playing) ?? featured
  if (!current) {
    return (
      <p className="empty">
        Nog geen video's op dit kanaal.{isOwner && <> <Link to="/video/uploaden">Upload je eerste video!</Link></>}
      </p>
    )
  }
  return (
    <div className="ch-gadget">
      <div className="ch-bar">
        <span className="ch-logo">
          <FarmIcon name="camcorder" /> Kuddes <b>Video</b>
        </span>
        <span className="ch-stats">
          <b>{videoCount}</b> {videoCount === 1 ? 'video' : "video's"} · <b>{views.toLocaleString('nl-NL')}</b> keer bekeken
        </span>
      </div>
      <VideoPlayer
        key={current.id}
        src={`/api/videos/${current.id}/file`}
        poster={current.thumbUrl}
        title={current.title}
        codec={current.codec}
        compact
        onFirstPlay={() => void api(`/videos/${current.id}/view`, { method: 'POST' }).catch(() => undefined)}
      />
      <p className="ch-now">
        {current.id === featured?.id && <span className="ch-badge">Uitgelicht</span>}
        <Link to={videoHref(current.id)}>{current.title}</Link>
        <span className="muted">
          {' '}
          · {current.views.toLocaleString('nl-NL')} keer bekeken
          {current.rating > 0 && <> · {'★'.repeat(Math.round(current.rating))}</>}
        </span>
      </p>
      {all.length > 1 && (
        <>
          <h4 className="ch-title">Hoogtepunten</h4>
          <ul className="ch-grid">
            {all.map((v) => (
              <li key={v.id}>
                <button type="button" className={v.id === current.id ? 'current' : undefined} onClick={() => setPlaying(v.id)} title={v.title}>
                  <span className="ch-thumb">
                    {v.thumbUrl ? <img src={v.thumbUrl} alt="" loading="lazy" /> : <FarmIcon name="film" size={32} />}
                    <span className="ch-time">{formatDuration(v.duration)}</span>
                  </span>
                  <span className="ch-name">{v.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <Link to={`/video/kanaal/${username}`} className="gadget-note">
        Naar het kanaal »
      </Link>
    </div>
  )
}

// ------------------------------------------------------------------ Radio (SomaFM)

const STREAM_HOSTS = ['ice1', 'ice2', 'ice4', 'ice6']

/**
 * Radio in SomaFM's own style: dark, with their orange-red. One station
 * plays at a time; nothing starts by itself.
 */
export function RadioGadget({ gadget }: { gadget: Of<'radio'> }) {
  const [on, setOn] = useState<string | null>(null)
  const [host, setHost] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const allowed = useConsent('somafm')
  const audio = useRef<HTMLAudioElement>(null)
  const { data: all = [], isError } = useSomaStations(!!on && allowed)
  const stations = gadget.config.channels.map((id) => all.find((s) => s.id === id)).filter((s): s is RadioStation => !!s)
  const current = stations.find((s) => s.id === on) ?? null
  // Like the music player: only when the owner wants it and the visitor didn't turn it off
  const { prefs } = usePreferences()
  const autoplay = !!gadget.config.autoplay && prefs.musicAutoplay
  const [blocked, setBlocked] = useState(false)
  const autoStarted = useRef(false)

  useEffect(() => {
    if (audio.current) audio.current.volume = volume
  }, [volume])

  const play = (id: string) => {
    if (!allowed) return
    const el = audio.current
    if (!el) return
    if (on === id) {
      el.pause()
      el.removeAttribute('src')
      el.load()
      setOn(null)
      return
    }
    setHost(0)
    setOn(id)
    setBusy(true)
    setFailed(false)
    el.src = `https://${STREAM_HOSTS[0]}.somafm.com/${id}-128-mp3`
    setBlocked(false)
    void el.play().catch((e: unknown) => {
      setBusy(false)
      // The browser doesn't allow sound before a click on the page
      if (e instanceof DOMException && e.name === 'NotAllowedError') setBlocked(true)
    })
  }

  // Autoplay: the owner's pick (or the first station), once the list is there
  const start = (stations.find((s) => s.id === gadget.config.autoplayStation) ?? stations[0])?.id
  useEffect(() => {
    if (!autoplay || !start || autoStarted.current) return
    autoStarted.current = true
    play(start)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the stations have loaded
  }, [autoplay, start])

  if (isError) return <p className="empty">SomaFM is nu niet bereikbaar. Probeer het later nog eens.</p>
  return (
    <div className="soma">
      {!allowed && <ExternalBlocked kind="somafm" compact />}
      <div className="soma-head">
        <a className="soma-logo" href="https://somafm.com/" target="_blank" rel="noopener noreferrer">
          soma<b>fm</b>
        </a>
        <span className="soma-tag">listener-supported, commercial-free radio</span>
      </div>
      {current && (
        <div className="soma-now">
          {current.image && <img src={current.image} alt="" />}
          <div>
            <b>{current.title}</b>
            <span className="soma-playing">
              {failed
                ? 'Deze zender kon niet starten. Probeer het zo nog eens.'
                : blocked
                  ? 'Je browser wacht op een klik: druk op ▶ om te luisteren.'
                  : busy
                    ? 'Verbinden…'
                    : current.nowPlaying
                      ? `Nu: ${current.nowPlaying}`
                      : current.genre}
            </span>
            <label className="soma-volume">
              <FarmIcon name={volume === 0 ? 'sound_mute' : volume < 0.5 ? 'sound_low' : 'sound'} />
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" />
            </label>
          </div>
        </div>
      )}
      <ul className="soma-list">
        {stations.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={s.id === on ? 'on' : undefined}
              onClick={() => {
                // After a blocked autoplay, the click starts that same station
                if (blocked && s.id === on) {
                  setBlocked(false)
                  setBusy(true)
                  void audio.current?.play().catch(() => setBusy(false))
                } else play(s.id)
              }}
              aria-pressed={s.id === on && !blocked}
              title={s.description}
            >
              {s.image ? <img src={s.image} alt="" loading="lazy" /> : <span className="soma-noimg" />}
              <span className="soma-info">
                <b>{s.title}</b>
                <span>{s.genre}</span>
              </span>
              <span className="soma-play" aria-hidden="true">
                {s.id === on && !blocked ? '❚❚' : '▶'}
              </span>
            </button>
          </li>
        ))}
        {stations.length === 0 && <li className="soma-empty">Zenders laden…</li>}
      </ul>
      <p className="soma-foot">
        <a href="https://somafm.com/support/" target="_blank" rel="noopener noreferrer">
          Steun SomaFM
        </a>{' '}
        · reclamevrij, betaald door luisteraars
      </p>
      <audio
        ref={audio}
        preload="none"
        onPlaying={() => setBusy(false)}
        onError={() => {
          // Another of SomaFM's servers, before giving up
          if (!on || host >= STREAM_HOSTS.length - 1) {
            setBusy(false)
            if (on) setFailed(true)
            return
          }
          const next = host + 1
          setHost(next)
          if (audio.current) {
            audio.current.src = `https://${STREAM_HOSTS[next]}.somafm.com/${on}-128-mp3`
            void audio.current.play().catch(() => setBusy(false))
          }
        }}
      />
    </div>
  )
}

// ------------------------------------------------------------------ Klok

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Hours, minutes and seconds in a time zone. */
function partsIn(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('nl-NL', { timeZone: zone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return { h: get('hour'), m: get('minute'), s: get('second') }
}

/** Minutes a zone is ahead of another, right now. */
function offsetMinutes(date: Date, zone: string) {
  const local = new Date(date.toLocaleString('en-US', { timeZone: zone }))
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - utc.getTime()) / 60000)
}

export function ClockGadget({ gadget }: { gadget: Of<'klok'> }) {
  const { zone, label, style } = gadget.config
  const now = useNow()
  const { h, m, s } = partsIn(now, zone)
  const city = CLOCK_ZONES[zone]
  const date = new Intl.DateTimeFormat('nl-NL', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long' }).format(now)
  const diff = (offsetMinutes(now, zone) - offsetMinutes(now, 'Europe/Amsterdam')) / 60
  const diffText = diff === 0 ? 'zelfde tijd als in Nederland' : `${Math.abs(diff)} uur ${diff > 0 ? 'later' : 'eerder'} dan in Nederland`
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return (
    <div className="klok">
      {style === 'analoog' ? (
        <svg className="klok-face" viewBox="0 0 100 100" role="img" aria-label={`${time} in ${city}`}>
          <circle cx="50" cy="50" r="47" className="klok-rim" />
          <circle cx="50" cy="50" r="42" className="klok-dial" />
          {Array.from({ length: 60 }, (_, i) => (
            <line key={i} x1="50" y1={i % 5 ? 11 : 9} x2="50" y2={i % 5 ? 13 : 16} className={i % 5 ? 'klok-tick' : 'klok-hour'} transform={`rotate(${i * 6} 50 50)`} />
          ))}
          <line x1="50" y1="50" x2="50" y2="28" className="klok-h" transform={`rotate(${(h % 12) * 30 + m / 2} 50 50)`} />
          <line x1="50" y1="50" x2="50" y2="18" className="klok-m" transform={`rotate(${m * 6 + s / 10} 50 50)`} />
          <line x1="50" y1="56" x2="50" y2="15" className="klok-s" transform={`rotate(${s * 6} 50 50)`} />
          <circle cx="50" cy="50" r="2.5" className="klok-pin" />
        </svg>
      ) : (
        <div className="klok-digital" aria-label={`${time} in ${city}`}>
          {time}
          <span>:{String(s).padStart(2, '0')}</span>
        </div>
      )}
      <p className="klok-label">
        <b>{label || city}</b>
        <span className="muted">
          {style === 'analoog' && `${time} · `}
          {date}
        </span>
        {zone !== 'Europe/Amsterdam' && <span className="muted">{diffText}</span>}
      </p>
    </div>
  )
}

// ------------------------------------------------------------------ Lijstje

export function ListGadget({ gadget, username, isOwner }: { gadget: Of<'lijstje'>; username: string; isOwner: boolean }) {
  const { items, numbered } = gadget.config
  if (items.length === 0) return <p className="empty">Het lijstje is nog leeg.</p>
  const List = numbered ? 'ol' : 'ul'
  return (
    <List className={numbered ? 'lijstje numbered' : 'lijstje'}>
      {items.map((item) => (
        <li key={item.id}>
          <span className="lijstje-text">{withSmileys(item.text)}</span>
          <RespectButton gadget={gadget} item={item.id} username={username} isOwner={isOwner} compact />
        </li>
      ))}
    </List>
  )
}

// ------------------------------------------------------------------ Landen

function Flags({ codes }: { codes: string[] }) {
  return (
    <ul className="landen-flags">
      {[...codes]
        .sort((a, b) => countryName(a).localeCompare(countryName(b), 'nl'))
        .map((c) => (
          <li key={c} title={countryName(c)}>
            <span className="flag">{flagEmoji(c)}</span>
            <span>{countryName(c)}</span>
          </li>
        ))}
    </ul>
  )
}

export function CountriesGadget({ gadget }: { gadget: Of<'landen'> }) {
  const { been, wish } = gadget.config
  if (been.length === 0 && wish.length === 0) return <p className="empty">Nog geen landen gekozen.</p>
  const pct = Math.min(100, Math.round((been.length / 195) * 100))
  return (
    <div className="landen">
      {been.length > 0 && (
        <>
          <p className="landen-count">
            <b>{been.length}</b> {been.length === 1 ? 'land' : 'landen'} bezocht <span className="muted">· {pct}% van de wereld</span>
          </p>
          <div className="landen-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(2, pct)}%` }} />
          </div>
          <Flags codes={been} />
        </>
      )}
      {wish.length > 0 && (
        <>
          <h4 className="landen-title">
            <FarmIcon name="map" /> Wil ik nog heen
          </h4>
          <Flags codes={wish} />
        </>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ Favoriete websites

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function LinksGadget({ gadget }: { gadget: Of<'links'> }) {
  const { links } = gadget.config
  if (links.length === 0) return <p className="empty">Nog geen websites toegevoegd.</p>
  return (
    <ul className="site-links">
      {links.map((l) => (
        <li key={l.id}>
          <a href={l.url} target="_blank" rel="nofollow noopener noreferrer ugc" title={l.url}>
            <FarmIcon name="world_link" />
            <span>
              <b>{l.title}</b>
              <span className="muted">{domainOf(l.url)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
