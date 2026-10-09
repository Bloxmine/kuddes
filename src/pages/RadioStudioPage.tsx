/**
 * /radio/studio: the host's studio. First the rights (asked like Kuddes
 * Video's) and making a station; then three tabs: the studio itself (decks,
 * microphone, sound buttons, the queue, DJs, chat, going live), the
 * programme (planned shows with a playlist), and the station's settings
 * (name, banner, DJs, own sound buttons). The studio stays on while you look
 * at the other tabs, so a show keeps running.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import type { MusicTrack } from '../../shared/music'
import { formatTrackTime } from '../../shared/music'
import { RADIO_GENRES, RADIO_LIMITS, SOUND_COLORS, type RadioEvents, type RadioShow, type RadioSound } from '../../shared/radio'
import { CatalogHero } from '../components/catalog/Catalog'
import { UserPic } from '../components/ui/Avatar'
import { BannerUploadDialog } from '../components/ui/BannerUploadDialog'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { Field } from '../components/ui/Field'
import { RightsRequest } from '../features/music/MusicAccess'
import { Cover } from '../features/music/MusicParts'
import { player } from '../features/music/player'
import { BUILTIN_SOUNDS } from '../features/radio/builtinSounds'
import { HostDjLinks } from '../features/radio/djLink'
import { announceNow, Broadcaster, Mixer, recorderFormat } from '../features/radio/mixer'
import { ChatPanel, LiveBadge, PushToTalk, ShowList, StationForm } from '../features/radio/RadioParts'
import { isOnSchedule, sinceLabel, toLocalInput } from '../features/radio/radioFormat'
import { RADIO_RIGHTS, radioKeys, useMyRadio, useRadioEvents, type MyRadio } from '../features/radio/radioQueries'
import { api, ApiRequestError, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../lib/usePageTitle'
import './PhotographyPage.css'

type Tab = 'studio' | 'programma' | 'zender'
const TABS: [Tab, string, FarmIconName][] = [
  ['studio', 'Studio', 'microphone'],
  ['programma', 'Programma', 'clock'],
  ['zender', 'Zender', 'cog'],
]

export function RadioStudioPage() {
  usePageTitle('Studio - Kuddes Radio')
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const { data, isLoading, isError, error } = useMyRadio(member)

  let content
  if (!user)
    content = (
      <Box title="Kuddes Radio" icon="transmit">
        <p>
          <Link to="/inloggen?next=/radio/studio">Log in</Link> om radio te maken.
        </p>
      </Box>
    )
  else if (!member)
    content = (
      <Box title="Kuddes Radio" icon="transmit">
        <p>Bevestig eerst je e-mailadres; daarna kun je vragen of je radio mag maken.</p>
      </Box>
    )
  else if (isLoading) content = <p className="muted">Laden…</p>
  else if (isError) content = <p className="form-error">{errorMessage(error)}</p>
  else if (!data!.access.allowed) content = <RightsRequest access={data!.access} kind={RADIO_RIGHTS} />
  else if (!data!.station)
    content = (
      <Box title="Eerst: je zender" icon="transmit">
        <p className="muted">Je mag radio maken! Geef je zender een naam en kies wat voor zender het is. Daarna kun je live gaan.</p>
        <StationForm station={null} />
      </Box>
    )
  else return <Studio my={data!} />

  return (
    <main className="page page-con rd-page">
      <CatalogHero
        title="Radio maken"
        intro="Ga live met je eigen zender: muziek van Kuddes Muziek, je eigen stem, geluidjes en DJ’s die meepraten."
        side={
          <Link to="/radio" className="btn">
            ‹ Kuddes Radio
          </Link>
        }
      />
      {content}
    </main>
  )
}

function Studio({ my }: { my: MyRadio }) {
  const station = my.station!
  const [tab, setTab] = useState<Tab>('studio')
  const [queue, setQueue] = useState<MusicTrack[]>([])
  const [title, setTitle] = useState(() => my.shows.find((s) => isOnSchedule(s.startsAt, s.endsAt))?.title ?? station.name)
  const loadShow = async (show: RadioShow) => {
    setTitle(show.title)
    if (show.playlist.length) setQueue(await api<MusicTrack[]>(`/tracks?ids=${show.playlist.join(',')}`))
    setTab('studio')
  }

  return (
    <main className="page page-con rd-page rd-studio-page">
      <header className="rd-studio-head">
        <div>
          <h1>
            <FarmIcon name="microphone" size={24} /> Studio van {station.name}
          </h1>
          <p className="muted">
            <Link to={`/radio/${station.user.username}`}>Je zenderpagina</Link> · {RADIO_GENRES[station.genre].name} · {station.followers} {station.followers === 1 ? 'volger' : 'volgers'}
          </p>
        </div>
        <nav className="ph-tabs rd-tabs" aria-label="Studio">
          <ul>
            {TABS.map(([t, label, icon]) => (
              <li key={t}>
                <button type="button" className={tab === t ? 'current' : undefined} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
                  <FarmIcon name={icon} /> {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div hidden={tab !== 'studio'}>
        <Desk my={my} queue={queue} setQueue={setQueue} title={title} setTitle={setTitle} />
      </div>
      {tab === 'programma' && <Programme my={my} onLoad={(s) => void loadShow(s)} />}
      {tab === 'zender' && <StationSettings my={my} />}
    </main>
  )
}

// ------------------------------------------------------------------ the desk

/** Re-render when the mixer changes (a deck plays, a DJ talks…). */
function useMixer(mixer: Mixer | null) {
  const version = useRef(0)
  const subscribe = useCallback(
    (l: () => void) =>
      mixer?.subscribe(() => {
        version.current++
        l()
      }) ?? (() => undefined),
    [mixer],
  )
  useSyncExternalStore(subscribe, () => version.current)
}

type LiveState = 'uit' | 'starten' | 'live' | 'gestopt'

function Desk({ my, queue, setQueue, title, setTitle }: { my: MyRadio; queue: MusicTrack[]; setQueue: (f: (q: MusicTrack[]) => MusicTrack[]) => void; title: string; setTitle: (t: string) => void }) {
  const station = my.station!
  const queryClient = useQueryClient()
  const [mixer, setMixer] = useState<Mixer | null>(null)
  useMixer(mixer)
  const [state, setState] = useState<LiveState>('uit')
  const [problem, setProblem] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState('')
  const [micLatched, setMicLatched] = useState(false)
  const [automix, setAutomix] = useState(true)
  const [levels, setLevels] = useState({ out: 0, mic: 0, backlog: 0 })
  const broadcaster = useRef<Broadcaster | null>(null)
  // The DJs' connections: a ref for the event handler, state for showing them
  const links = useRef<HostDjLinks | null>(null)
  const [djLinks, setDjLinks] = useState<HostDjLinks | null>(null)
  const [, setDjVersion] = useState(0)
  const events = useRadioEvents(station.user.username, { live: station.live }, (e: RadioEvents['dj']) => void links.current?.handle(e))
  const live = events.live

  // Switching on: sound needs a click first (browsers), and the microphone asks for permission
  const switchOn = async () => {
    setProblem(null)
    const m = new Mixer()
    await m.resume()
    setMixer(m)
    // Listening to something in the player bar would end up in your ears twice
    player.close()
    try {
      await m.startMic()
      const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')
      setDevices(list)
    } catch {
      setProblem('Je microfoon kon niet worden gebruikt. Je kunt zonder praten uitzenden, of je browser toestemming geven en de pagina opnieuw laden.')
    }
  }

  // The meters, and automix: the next song from the queue fades in before this one ends
  const auto = useRef({ automix, queue })
  useEffect(() => {
    auto.current = { automix, queue }
  })
  useEffect(() => {
    if (!mixer) return
    const t = setInterval(() => {
      setLevels({ out: mixer.level(), mic: mixer.micLevel(), backlog: broadcaster.current?.backlog ?? 0 })
      const { automix: on, queue: q } = auto.current
      if (!on || !q.length) return
      const active = mixer.crossfade < 0.5 ? 0 : 1
      const other = active === 0 ? 1 : 0
      const deck = mixer.decks[active].state
      if (deck.playing && deck.duration && deck.duration - deck.time < 6 && !mixer.decks[other].state.playing) {
        mixer.load(other, q[0])
        void mixer.play(other)
        mixer.fadeTo(other, 6)
        setQueue((list) => list.slice(1))
      }
    }, 100)
    // A deck that ran out with nothing faded in yet: start the next one right away
    mixer.setOnEnded((i) => {
      const { automix: on, queue: q } = auto.current
      const other = i === 0 ? 1 : 0
      if (!on || !q.length || mixer.decks[other].state.playing) return
      mixer.load(other, q[0])
      void mixer.play(other)
      mixer.setCrossfade(other)
      setQueue((list) => list.slice(1))
    })
    return () => clearInterval(t)
  }, [mixer, setQueue])

  // What's on air now goes to the listeners
  const announced = useRef<number | null | undefined>(undefined)
  const onAir = mixer?.onAir()?.id ?? null
  useEffect(() => {
    if (state !== 'live' || announced.current === onAir) return
    announced.current = onAir
    void announceNow(onAir)
  }, [state, onAir])

  const goLive = async () => {
    if (!mixer) return
    const format = recorderFormat()
    if (!format) return setProblem('Je browser kan niet uitzenden. Gebruik Chrome, Edge of Firefox op een computer.')
    setProblem(null)
    setState('starten')
    try {
      await api('/radio/live/start', { method: 'POST', body: { title, format: format.format } })
      const b = new Broadcaster(mixer.out.stream, format.mime)
      b.onLost = (message) => {
        setState('gestopt')
        setProblem(message)
        links.current?.close()
      }
      b.start()
      broadcaster.current = b
      const l = new HostDjLinks(mixer)
      l.onChange = () => setDjVersion((n) => n + 1)
      links.current = l
      setDjLinks(l)
      announced.current = undefined
      setState('live')
      void queryClient.invalidateQueries({ queryKey: radioKeys.all })
    } catch (e) {
      setState('uit')
      setProblem(errorMessage(e))
    }
  }

  const stop = useCallback(() => {
    broadcaster.current?.stop()
    broadcaster.current = null
    links.current?.close()
    links.current = null
    setDjLinks(null)
    void fetch('/api/radio/live/stop', { method: 'POST', credentials: 'same-origin', keepalive: true })
    setState('uit')
  }, [])

  // Leaving the page while live: ask first (closing the tab), and stop cleanly
  useEffect(() => {
    if (state !== 'live') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  useEffect(
    () => () => {
      if (stateRef.current === 'live') stop()
    },
    [stop],
  )
  useEffect(() => () => mixer?.destroy(), [mixer])

  // Push to talk with the space bar, sound buttons with 1–9
  const talk = useCallback((on: boolean) => mixer?.setMic(on || micLatched), [mixer, micLatched])
  const pads = [...BUILTIN_SOUNDS.map((s) => ({ key: s.key, name: s.name, color: s.color, play: () => mixer?.playPad(s.make, s.key) })), ...my.sounds.map((s) => ({ key: `eigen-${s.id}`, name: s.name, color: s.color, play: () => mixer?.playPad(s.url, `eigen-${s.id}`) }))]
  useEffect(() => {
    if (!mixer) return
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat) return
      if (e.code === 'Space') {
        e.preventDefault()
        talk(true)
      }
      const n = Number(e.key)
      if (n >= 1 && n <= 9 && pads[n - 1]) void pads[n - 1].play()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) talk(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  })

  if (!mixer)
    return (
      <Box title="Je studio" icon="microphone">
        <div className="rd-switchon">
          <FarmIcon name="headphone" size={48} />
          <div>
            <p>
              <b>Zet je koptelefoon op</b> en zet de studio aan. Je browser vraagt dan of Kuddes je microfoon mag gebruiken.
            </p>
            <ul className="muted">
              <li>Uitzenden gaat het best in Chrome, Edge of Firefox op een computer.</li>
              <li>Laat deze pagina open zolang je live bent; sluit je hem, dan stopt de uitzending.</li>
              <li>Je draait muziek van Kuddes Muziek; luisteraars horen jou en je DJ’s een paar seconden later.</li>
            </ul>
            <Button variant="cta" onClick={() => void switchOn()}>
              <FarmIcon name="lightning" /> Studio aanzetten
            </Button>
          </div>
        </div>
      </Box>
    )

  const isLive = state === 'live'
  return (
    <div className="rd-desk">
      {/* On air: title, going live, how it's going */}
      <section className={isLive ? 'box rd-onair-bar live' : 'box rd-onair-bar'}>
        <div className="rd-onair-title">
          <label>
            <small className="muted">Titel van de uitzending</small>
            <input
              className="text-box"
              value={title}
              maxLength={RADIO_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => isLive && title.trim() && void announceNow(onAir, title.trim())}
            />
          </label>
        </div>
        <div className="rd-onair-status">
          {isLive && live ? (
            <span>
              <LiveBadge /> <b>{sinceLabel(live.since)}</b> · {live.listeners} {live.listeners === 1 ? 'luisteraar' : 'luisteraars'}
              {levels.backlog > 3 && <span className="rd-warn"> · trage verbinding ({levels.backlog} s achter)</span>}
            </span>
          ) : (
            <span className="muted">{state === 'starten' ? 'Live gaan…' : 'Niet live'}</span>
          )}
          <Meter value={levels.out} label="Uitgang" />
        </div>
        {isLive ? (
          <Button className="rd-stop" onClick={() => confirm('De uitzending stoppen?') && stop()}>
            <FarmIcon name="cross" /> Stoppen
          </Button>
        ) : (
          <Button variant="cta" className="rd-golive" onClick={() => void goLive()} disabled={state === 'starten' || !title.trim()}>
            <FarmIcon name="transmit" /> Live gaan
          </Button>
        )}
        {problem && <p className="form-error rd-problem">{problem}</p>}
      </section>

      <div className="rd-desk-grid">
        <section className="box rd-decks">
          <div className="rd-decks-row">
            <DeckView mixer={mixer} i={0} />
            <DeckView mixer={mixer} i={1} />
          </div>
          <div className="rd-xfade">
            <button type="button" className="btn" onClick={() => mixer.fadeTo(0)} title="Overvloeien naar A">
              ◀ A
            </button>
            <input type="range" min={0} max={1} step={0.01} value={mixer.crossfade} onChange={(e) => mixer.setCrossfade(Number(e.target.value))} aria-label="Crossfader" />
            <button type="button" className="btn" onClick={() => mixer.fadeTo(1)} title="Overvloeien naar B">
              B ▶
            </button>
          </div>
          <label className="gadget-toggle rd-automix">
            <input type="checkbox" checked={automix} onChange={(e) => setAutomix(e.target.checked)} /> Automatisch mixen: het volgende nummer uit de wachtrij vloeit vanzelf in
          </label>
        </section>

        <section className="box rd-mic">
          <h2 className="rd-h">
            <FarmIcon name="microphone" /> Microfoon
          </h2>
          {mixer.hasMic ? (
            <>
              <PushToTalk talking={mixer.micOpen} onTalk={talk} />
              <Meter value={levels.mic} label="Microfoon" />
              <label className="gadget-toggle">
                <input
                  type="checkbox"
                  checked={micLatched}
                  onChange={(e) => {
                    setMicLatched(e.target.checked)
                    mixer.setMic(e.target.checked)
                  }}
                />{' '}
                Microfoon blijft open
              </label>
              <label className="gadget-toggle">
                <input
                  type="checkbox"
                  checked={mixer.ducking}
                  onChange={(e) => mixer.setDucking(e.target.checked)}
                />{' '}
                Muziek zachter als er gepraat wordt
              </label>
              {devices.length > 1 && (
                <select
                  className="text-box"
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value)
                    void mixer.startMic(e.target.value)
                  }}
                  aria-label="Welke microfoon"
                >
                  <option value="">Standaardmicrofoon</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || 'Microfoon'}
                    </option>
                  ))}
                </select>
              )}
              <p className="muted rd-hint">Houd de knop of de spatiebalk ingedrukt om te praten. Jezelf hoor je niet terug.</p>
            </>
          ) : (
            <p className="muted">Geen microfoon: je zendt alleen muziek en geluiden uit.</p>
          )}
        </section>

        <section className="box rd-pads">
          <h2 className="rd-h">
            <FarmIcon name="sound" /> Geluiden
          </h2>
          <div className="rd-pad-grid">
            {pads.map((p, i) => (
              <button key={p.key} type="button" className="rd-pad" style={{ '--pad': p.color } as React.CSSProperties} onClick={() => void p.play()} title={i < 9 ? `Toets ${i + 1}` : undefined}>
                {i < 9 && <small>{i + 1}</small>}
                {p.name}
              </button>
            ))}
          </div>
          <label className="rd-slider">
            <small className="muted">Volume geluiden</small>
            <input type="range" min={0} max={1.5} step={0.05} defaultValue={1} onChange={(e) => mixer.setPadVolume(Number(e.target.value))} />
          </label>
          <label className="rd-slider">
            <small className="muted">Wat jij hoort (koptelefoon)</small>
            <input type="range" min={0} max={1} step={0.05} defaultValue={1} onChange={(e) => mixer.setMonitorVolume(Number(e.target.value))} />
          </label>
        </section>

        <section className="box rd-queue">
          <h2 className="rd-h">
            <FarmIcon name="text_list_numbers" /> Wachtrij <small className="muted">({queue.length})</small>
          </h2>
          {queue.length ? (
            <ol className="rd-queue-list">
              {queue.map((t, i) => (
                <li key={`${t.id}-${i}`}>
                  <Cover track={t} size={32} />
                  <span className="mu-track-text">
                    <b>{t.title}</b>
                    <small>
                      {t.artist.name} · {formatTrackTime(t.duration)}
                    </small>
                  </span>
                  <span className="rd-queue-tools">
                    <button type="button" className="mu-icon-btn" onClick={() => mixer.load(0, t)} title="In deck A">
                      A
                    </button>
                    <button type="button" className="mu-icon-btn" onClick={() => mixer.load(1, t)} title="In deck B">
                      B
                    </button>
                    <button type="button" className="mu-icon-btn" disabled={i === 0} onClick={() => setQueue((q) => q.map((x, j) => (j === i - 1 ? q[i] : j === i ? q[i - 1] : x)))} title="Omhoog">
                      ▲
                    </button>
                    <button type="button" className="mu-icon-btn" onClick={() => setQueue((q) => q.filter((_, j) => j !== i))} title="Uit de wachtrij">
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">Zoek hieronder nummers op Kuddes Muziek, of laad een uitzending uit je programma.</p>
          )}
          <TrackSearch onAdd={(t) => setQueue((q) => [...q, t])} />
        </section>

        <section className="box rd-side-col">
          <h2 className="rd-h">
            <FarmIcon name="headphone" /> DJ’s in de studio
          </h2>
          <DjList mixer={mixer} links={djLinks} live={live} invited={my.djs.length} />
          <h2 className="rd-h">
            <FarmIcon name="comments" /> Chat
          </h2>
          <ChatPanel username={station.user.username} chat={events.chat} live={isLive} />
        </section>
      </div>
    </div>
  )
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <span className="rd-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.round(value * 100) / 100}>
      <i style={{ width: `${Math.round(value * 100)}%` }} className={value > 0.9 ? 'hot' : undefined} />
    </span>
  )
}

function DeckView({ mixer, i }: { mixer: Mixer; i: 0 | 1 }) {
  const deck = mixer.decks[i].state
  const heard = i === 0 ? 1 - mixer.crossfade : mixer.crossfade
  return (
    <div className={deck.playing && heard > 0.05 ? 'rd-deck on' : 'rd-deck'}>
      <div className="rd-deck-head">
        <span className="rd-deck-name">{i === 0 ? 'A' : 'B'}</span>
        {deck.track ? <Cover track={deck.track} size={48} /> : <span className="mu-cover plain rd-deck-empty">♪</span>}
        <span className="mu-track-text">
          <b>{deck.track?.title ?? 'Leeg'}</b>
          <small>{deck.track ? deck.track.artist.name : 'Zet een nummer uit de wachtrij in dit deck'}</small>
        </span>
      </div>
      <div className="rd-deck-time">
        <small>{formatTrackTime(deck.time)}</small>
        <input type="range" min={0} max={deck.duration || 1} step={0.5} value={deck.time} disabled={!deck.track} onChange={(e) => mixer.seek(i, Number(e.target.value))} aria-label={`Waar in deck ${i === 0 ? 'A' : 'B'}`} />
        <small>-{formatTrackTime(Math.max(0, deck.duration - deck.time))}</small>
      </div>
      <div className="rd-deck-controls">
        <button type="button" className="mu-bar-play" disabled={!deck.track} onClick={() => (deck.playing ? mixer.pause(i) : void mixer.play(i))} aria-label={deck.playing ? 'Pauze' : 'Afspelen'}>
          <FarmIcon name={deck.playing ? 'control_pause' : 'control_play'} size={24} />
        </button>
        <button type="button" className="mu-icon-btn" disabled={!deck.track} onClick={() => mixer.seek(i, 0)} title="Naar het begin">
          <FarmIcon name="control_start" />
        </button>
        <button type="button" className="mu-icon-btn" disabled={!deck.track} onClick={() => mixer.eject(i)} title="Deck leegmaken">
          ⏏
        </button>
        <label className="rd-deck-vol" title="Volume van dit deck">
          <FarmIcon name="sound" />
          <input type="range" min={0} max={1.2} step={0.05} value={deck.volume} onChange={(e) => mixer.setDeckVolume(i, Number(e.target.value))} aria-label={`Volume deck ${i === 0 ? 'A' : 'B'}`} />
        </label>
      </div>
    </div>
  )
}

function DjList({ mixer, links, live, invited }: { mixer: Mixer; links: HostDjLinks | null; live: ReturnType<typeof useRadioEvents>['live']; invited: number }) {
  const djs = live?.djs ?? []
  if (!djs.length)
    return (
      <p className="muted rd-hint">
        {invited ? 'Je DJ’s kunnen meepraten zodra je live bent: ze gaan naar je zenderpagina en drukken op “Naar de studio”.' : 'Nodig DJ’s uit onder Zender: zij kunnen dan meepraten in je uitzending.'}
      </p>
    )
  return (
    <ul className="rd-djlist">
      {djs.map((d) => {
        const mode = links?.mode(d.id)
        return (
          <li key={d.id} className={mixer.djTalking(d.id) ? 'talking' : undefined}>
            <UserPic user={d} />
            <span className="mu-track-text">
              <b>{d.nickname}</b>
              <small className="muted">{mode === 'direct' ? 'rechtstreeks' : mode === 'via-kuddes' ? 'via Kuddes' : 'verbinden…'}</small>
            </span>
            <input type="range" min={0} max={1.5} step={0.05} defaultValue={1} onChange={(e) => mixer.setDjVolume(d.id, Number(e.target.value))} aria-label={`Volume van ${d.nickname}`} />
            <button type="button" className="mu-icon-btn" onClick={() => confirm(`${d.nickname} uit de studio halen?`) && links?.kick(d.id)} title="Uit de studio halen">
              ×
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Find songs on Kuddes Muziek (the popular ones when there's no search yet). */
function TrackSearch({ onAdd }: { onAdd: (t: MusicTrack) => void }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const { data, isFetching } = useQuery({
    queryKey: ['music', 'studio-search', search],
    queryFn: () => api<{ tracks: MusicTrack[] }>(`/music?${new URLSearchParams(search ? { q: search } : {})}`),
  })
  return (
    <div className="rd-search">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
        }}
      >
        <input className="text-box" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek op Kuddes Muziek" aria-label="Zoek op Kuddes Muziek" />
        <Button type="submit">
          <FarmIcon name="magnifier" />
        </Button>
      </form>
      <small className="muted">{search ? `Gezocht op "${search}"` : 'Populair op Kuddes Muziek'}</small>
      <ul className="rd-search-results">
        {isFetching && !data && <li className="muted">Zoeken…</li>}
        {data?.tracks.map((t) => (
          <li key={t.id}>
            <Cover track={t} size={28} />
            <span className="mu-track-text">
              <b>{t.title}</b>
              <small>
                {t.artist.name} · {formatTrackTime(t.duration)}
              </small>
            </span>
            <button type="button" className="mu-icon-btn" onClick={() => onAdd(t)} title="Toevoegen">
              <FarmIcon name="add" />
            </button>
          </li>
        ))}
        {data && !data.tracks.length && <li className="muted">Niets gevonden.</li>}
      </ul>
    </div>
  )
}

// ------------------------------------------------------------------ the programme

function Programme({ my, onLoad }: { my: MyRadio; onLoad: (s: RadioShow) => void }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<RadioShow | 'nieuw' | null>(null)
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/radio/me/shows/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: radioKeys.all }),
  })
  return (
    <div className="rd-programme">
      <Box title="Je programma" icon="clock" actions={editing ? undefined : <button type="button" className="rd-box-action" onClick={() => setEditing('nieuw')}>+ Nieuwe uitzending</button>}>
        <p className="muted">Plan je uitzendingen: ze staan op je zenderpagina en bij “Binnenkort” op Kuddes Radio. Met een playlist zet je de nummers alvast klaar in je wachtrij.</p>
        {my.shows.length ? (
          <ShowList
            shows={my.shows}
            actions={(s) => (
              <span className="rd-show-actions">
                <Button onClick={() => onLoad(s)} title="Titel en playlist in de studio zetten">
                  <FarmIcon name="control_play" /> In studio
                </Button>
                <Button onClick={() => setEditing(s)} title="Bewerken">
                  <FarmIcon name="pencil" />
                </Button>
                <Button onClick={() => confirm(`"${s.title}" verwijderen?`) && remove.mutate(s.id)} title="Verwijderen">
                  <FarmIcon name="bin" />
                </Button>
              </span>
            )}
          />
        ) : (
          <p className="empty">Nog niets gepland.</p>
        )}
      </Box>
      {editing && <ShowForm key={editing === 'nieuw' ? 'nieuw' : editing.id} show={editing === 'nieuw' ? null : editing} onDone={() => setEditing(null)} />}
    </div>
  )
}

const DURATIONS = [30, 60, 90, 120, 180, 240]

function ShowForm({ show, onDone }: { show: RadioShow | null; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(show?.title ?? '')
  const [description, setDescription] = useState(show?.description ?? '')
  const [startsAt, setStartsAt] = useState(() => {
    if (show) return toLocalInput(new Date(show.startsAt))
    const d = new Date(Date.now() + 86_400_000)
    d.setHours(20, 0, 0, 0)
    return toLocalInput(d)
  })
  const [minutes, setMinutes] = useState(show ? Math.round((new Date(show.endsAt).getTime() - new Date(show.startsAt).getTime()) / 60_000) : 60)
  const { data: loaded } = useQuery({
    queryKey: ['music', 'playlist', show?.id],
    queryFn: () => api<MusicTrack[]>(`/tracks?ids=${show!.playlist.join(',')}`),
    enabled: !!show?.playlist.length,
  })
  const [playlist, setPlaylist] = useState<MusicTrack[] | null>(null)
  const list = playlist ?? loaded ?? []
  const save = useMutation({
    mutationFn: () =>
      api<RadioShow>(show ? `/radio/me/shows/${show.id}` : '/radio/me/shows', {
        method: show ? 'PUT' : 'POST',
        body: { title, description, startsAt: new Date(startsAt).toISOString(), minutes, playlist: list.map((t) => t.id) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: radioKeys.all })
      onDone()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  const total = list.reduce((n, t) => n + t.duration, 0)
  return (
    <Box title={show ? 'Uitzending bewerken' : 'Nieuwe uitzending'} icon="clock">
      <form
        className="rd-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="rd-form-row">
          <Field label="Titel" error={fields.title}>
            <input className="text-box" value={title} maxLength={RADIO_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required placeholder="Bijvoorbeeld: Vrijdagavond Vibes" />
          </Field>
          <Field label="Wanneer" error={fields.startsAt}>
            <input className="text-box" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </Field>
          <Field label="Hoe lang">
            <select className="text-box" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[...new Set([...DURATIONS, minutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minuten` : `${m / 60} uur`}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="Waar gaat het over?" hint="(mag, hoeft niet)">
          <textarea className="text-box" rows={2} value={description} maxLength={RADIO_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="rd-playlist">
          <div>
            <b>
              Playlist <small className="muted">({list.length} nummers, {formatTrackTime(total)})</small>
            </b>
            <ol className="rd-queue-list">
              {list.map((t, i) => (
                <li key={`${t.id}-${i}`}>
                  <Cover track={t} size={28} />
                  <span className="mu-track-text">
                    <b>{t.title}</b>
                    <small>{t.artist.name}</small>
                  </span>
                  <button type="button" className="mu-icon-btn" onClick={() => setPlaylist(list.filter((_, j) => j !== i))} title="Uit de playlist">
                    ×
                  </button>
                </li>
              ))}
              {!list.length && <li className="muted">Nog leeg: voeg rechts nummers toe (of laat leeg voor een praatprogramma).</li>}
            </ol>
          </div>
          <TrackSearch onAdd={(t) => list.length < RADIO_LIMITS.playlist && setPlaylist([...list, t])} />
        </div>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending || !title.trim()}>
            <FarmIcon name="diskette" /> Opslaan
          </Button>
          <Button onClick={onDone}>Annuleren</Button>
          {save.isError && !Object.keys(fields).length && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

// ------------------------------------------------------------------ the station's settings

function StationSettings({ my }: { my: MyRadio }) {
  const station = my.station!
  const queryClient = useQueryClient()
  const [banner, setBanner] = useState(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: radioKeys.all })
  return (
    <div className="rd-settings">
      <Box title="Je zender" icon="transmit">
        <StationForm station={station} />
      </Box>
      <Box title="Banner" icon="picture_sunset">
        <div className={`rd-banner-preview rg-${station.genre}`} style={station.bannerUrl ? { backgroundImage: `url(${station.bannerUrl})`, backgroundPositionY: `${station.bannerY}%` } : undefined} />
        <Button onClick={() => setBanner(true)}>
          <FarmIcon name="picture_sunset" /> {station.bannerUrl ? 'Banner wijzigen' : 'Kies een banner'}
        </Button>
      </Box>
      <DjSettings my={my} onChange={refresh} />
      <SoundSettings sounds={my.sounds} onChange={refresh} />
      {banner && <BannerUploadDialog endpoint="/radio/me/banner" currentUrl={station.bannerUrl} currentY={station.bannerY} onDone={() => void refresh()} onClose={() => setBanner(false)} />}
    </div>
  )
}

function DjSettings({ my, onChange }: { my: MyRadio; onChange: () => void }) {
  const [username, setUsername] = useState('')
  const add = useMutation({
    mutationFn: () => api('/radio/me/djs', { method: 'POST', body: { username } }),
    onSuccess: () => {
      setUsername('')
      onChange()
    },
  })
  const remove = useMutation({
    mutationFn: (u: string) => api<void>(`/radio/me/djs/${u}`, { method: 'DELETE' }),
    onSuccess: onChange,
  })
  return (
    <Box title="DJ’s" icon="headphone">
      <p className="muted">
        DJ’s praten mee in je uitzendingen: als je live bent, gaan ze naar je zenderpagina en drukken op “Naar de studio”. Er kunnen er {RADIO_LIMITS.djsLive} tegelijk in, en
        jij regelt hun volume.
      </p>
      {my.djs.length > 0 && (
        <ul className="rd-djlist">
          {my.djs.map((d) => (
            <li key={d.id}>
              <UserPic user={d} />
              <span className="mu-track-text">
                <b>{d.nickname}</b>
                <small className="muted">@{d.username}</small>
              </span>
              <button type="button" className="mu-icon-btn" onClick={() => remove.mutate(d.username)} title="Geen DJ meer">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="rd-inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (username.trim()) add.mutate()
        }}
      >
        <input className="text-box" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Gebruikersnaam, bijv. sanne" aria-label="Gebruikersnaam van de DJ" />
        <Button type="submit" disabled={!username.trim() || add.isPending || my.djs.length >= RADIO_LIMITS.djs}>
          <FarmIcon name="user_add" /> Toevoegen
        </Button>
      </form>
      {add.isError && <p className="form-error">{errorMessage(add.error)}</p>}
    </Box>
  )
}

function SoundSettings({ sounds, onChange }: { sounds: RadioSound[]; onChange: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(SOUND_COLORS[0])
  const fileInput = useRef<HTMLInputElement>(null)
  const add = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('file', file!)
      form.set('name', name)
      form.set('color', color)
      return api<RadioSound>('/radio/me/sounds', { method: 'POST', form })
    },
    onSuccess: () => {
      setFile(null)
      setName('')
      if (fileInput.current) fileInput.current.value = ''
      onChange()
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/radio/me/sounds/${id}`, { method: 'DELETE' }),
    onSuccess: onChange,
  })
  return (
    <Box title="Eigen geluiden" icon="sound">
      <p className="muted">
        Je eigen jingles en effecten, naast de standaardgeluiden in je studio. Maximaal {RADIO_LIMITS.soundSeconds} seconden en {RADIO_LIMITS.soundBytes / 1024 / 1024} MB per geluid. Alleen
        geluiden die je zelf hebt gemaakt.
      </p>
      {sounds.length > 0 && (
        <ul className="rd-sound-list">
          {sounds.map((s) => (
            <li key={s.id}>
              <button type="button" className="rd-pad small" style={{ '--pad': s.color } as React.CSSProperties} onClick={() => void new Audio(s.url).play()} title="Laten horen">
                {s.name}
              </button>
              <button type="button" className="mu-icon-btn" onClick={() => remove.mutate(s.id)} title="Verwijderen">
                <FarmIcon name="bin" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {sounds.length < RADIO_LIMITS.sounds && (
        <form
          className="rd-inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (file && name.trim()) add.mutate()
          }}
        >
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, RADIO_LIMITS.soundName))
            }}
            aria-label="Geluidsbestand"
          />
          <input className="text-box" value={name} maxLength={RADIO_LIMITS.soundName} onChange={(e) => setName(e.target.value)} placeholder="Naam" aria-label="Naam van het geluid" />
          <span className="rd-colors" role="radiogroup" aria-label="Kleur">
            {SOUND_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} className={color === c ? 'current' : undefined} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />
            ))}
          </span>
          <Button variant="cta" type="submit" disabled={!file || !name.trim() || add.isPending}>
            <FarmIcon name="add" /> {add.isPending ? 'Bezig…' : 'Toevoegen'}
          </Button>
        </form>
      )}
      {add.isError && <p className="form-error">{errorMessage(add.error)}</p>}
    </Box>
  )
}
