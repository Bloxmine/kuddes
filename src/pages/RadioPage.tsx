/**
 * Kuddes Radio for listeners: /radio (what's live, what's coming, all
 * stations by kind) and a station's page (/radio/:username) with the show,
 * the chat, the programme, and for its co-DJs the way into the studio. The
 * host's own studio is RadioStudioPage.tsx.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { RADIO_GENRES, type RadioEvents, type RadioGenre, type RadioStation } from '../../shared/radio'
import { CatalogHero, CategoryBar, type CategoryItem } from '../components/catalog/Catalog'
import { useCatalogParams } from '../components/catalog/useCatalogParams'
import { Avatar, UserPic } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { Modal } from '../components/ui/Modal'
import { LikeButton, Cover } from '../features/music/MusicParts'
import { player } from '../features/music/player'
import { DjLink, type DjMode } from '../features/radio/djLink'
import { ChatPanel, FollowButton, ListenButton, LiveBadge, PushToTalk, ShowList, StationCard } from '../features/radio/RadioParts'
import { sinceLabel } from '../features/radio/radioFormat'
import { genreIcon, radioKeys, useMyRadio, useRadioEvents, useStation, type RadioExplore } from '../features/radio/radioQueries'
import { ShareWithFriends } from '../features/share/ShareWithFriends'
import { SuggestionForm } from '../features/suggestions/SuggestionForm'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../lib/usePageTitle'
import './PhotographyPage.css'

const GENRE_KEYS = Object.keys(RADIO_GENRES) as RadioGenre[]

/** /radio: live now, the programme of the coming week, and all stations. */
export function RadioHomePage() {
  usePageTitle('Kuddes Radio')
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const { params, update } = useCatalogParams(true)
  const rawGenre = params.get('genre')
  const genre = GENRE_KEYS.find((g) => g === rawGenre) ?? null
  const q = params.get('q') ?? ''
  const { data, isLoading, isError, error } = useQuery({
    queryKey: radioKeys.explore(genre ?? '', q),
    queryFn: () => api<RadioExplore>(`/radio?${new URLSearchParams({ ...(genre && { genre }), ...(q && { q }) })}`),
    // Who's live changes: look again now and then
    refetchInterval: 30_000,
  })
  const { data: mine } = useMyRadio(member)
  const total = Object.values(data?.genres ?? {}).reduce((a, b) => a + (b ?? 0), 0)
  const categories: CategoryItem<RadioGenre>[] = [
    { key: null, name: 'Alles', hint: 'alle zenders', icon: 'transmit', count: total || undefined },
    ...GENRE_KEYS.map((g) => ({ key: g, name: RADIO_GENRES[g].name, hint: RADIO_GENRES[g].hint, icon: genreIcon(g), count: data?.genres[g] })),
  ]

  return (
    <main className="page page-con ph-page rd-page">
      <CatalogHero
        title="Kuddes Radio"
        intro="Live radio van Kuddes-leden: muziekprogramma’s met nummers van Kuddes Muziek, talkshows, comedy, podcasts en meer. Luister mee, chat mee, of begin je eigen zender."
        q={q}
        placeholder="Zoek een zender"
        label="Zoek in Kuddes Radio"
        onSearch={(v) => update({ q: v || null })}
      />
      <CategoryBar label="Soorten zenders" items={categories} current={genre} onPick={(g) => update({ genre: g })} />

      <div className="ph-layout">
        <div className="rd-main">
          <section className="box rd-section">
            <div className="ct-bar">
              <div className="ct-title">
                <h2>
                  <LiveBadge /> Nu live
                </h2>
                <span className="muted">{data ? `${data.live.length} ${data.live.length === 1 ? 'zender' : 'zenders'}` : ' '}</span>
              </div>
            </div>
            {isLoading ? (
              <p className="muted ct-empty">Laden…</p>
            ) : isError ? (
              <p className="form-error ct-empty">{errorMessage(error)}</p>
            ) : data?.live.length ? (
              <ul className="rd-cards">
                {data.live.map((s) => (
                  <StationCard key={s.user.username} station={s} />
                ))}
              </ul>
            ) : (
              <div className="ct-empty">
                <FarmIcon name="transmit" size={48} />
                <p>{genre ? `Er is nu geen ${RADIO_GENRES[genre].name.toLowerCase()} live.` : 'Er is nu niemand live.'} Kijk hieronder wanneer de volgende uitzending is.</p>
              </div>
            )}
          </section>

          <section className="box rd-section">
            <div className="ct-bar">
              <div className="ct-title">
                <h2>{q ? `Gezocht op "${q}"` : genre ? RADIO_GENRES[genre].name : 'Alle zenders'}</h2>
                <span className="muted">{data ? `${data.stations.length} ${data.stations.length === 1 ? 'zender' : 'zenders'}` : ' '}</span>
              </div>
            </div>
            {data?.stations.length ? (
              <ul className="rd-cards">
                {data.stations.map((s) => (
                  <StationCard key={s.user.username} station={s} />
                ))}
              </ul>
            ) : (
              !isLoading && (
                <div className="ct-empty">
                  <FarmIcon name="radio_modern" size={48} />
                  <p>{q ? `Niets gevonden voor "${q}".` : 'Hier zijn nog geen zenders.'}</p>
                </div>
              )
            )}
          </section>
        </div>

        <aside className="ph-side sticky-side">
          {member && mine?.station && (
            <Link to="/radio/studio" className="box ph-mine">
              <FarmIcon name="microphone" size={32} />
              <span>
                <b>Mijn studio</b>
                <small className="muted">
                  {mine.station.name} · {mine.station.followers} {mine.station.followers === 1 ? 'volger' : 'volgers'}
                </small>
              </span>
            </Link>
          )}
          {member && mine && !mine.station && (
            <section className="box ph-mine-new">
              <p className="muted">{mine.access.allowed ? 'Je mag radio maken: maak je zender!' : 'Zelf radio maken? Vraag het aan.'}</p>
              <Link to="/radio/studio" className="btn btn-cta">
                <FarmIcon name="microphone" /> {mine.access.allowed ? 'Maak je zender' : 'Radio maken'}
              </Link>
            </section>
          )}
          {!!mine?.djAt.length && (
            <Box title="Je bent DJ bij" icon="headphone">
              <ul className="rd-mini">
                {mine.djAt.map((s) => (
                  <li key={s.user.username}>
                    <Link to={`/radio/${s.user.username}`}>
                      <FarmIcon name={genreIcon(s.genre)} /> {s.name}
                    </Link>
                    {s.live && <LiveBadge />}
                  </li>
                ))}
              </ul>
            </Box>
          )}
          {!user && (
            <section className="box ph-mine-new">
              <p className="muted">
                <Link to="/inloggen?next=/radio">Log in</Link> om mee te chatten, zenders te volgen en zelf radio te maken.
              </p>
            </section>
          )}
          <Box title="Binnenkort" icon="clock">
            {data?.upcoming.length ? <ShowList shows={data.upcoming} showStation /> : <p className="empty">Er staat deze week nog niets op het programma.</p>}
          </Box>
        </aside>
      </div>
    </main>
  )
}

/** /radio/:username: a station, live or not. */
export function StationPage() {
  const { username = '' } = useParams()
  const { data, isLoading, error } = useStation(username)
  usePageTitle(data ? `${data.station.name} - Kuddes Radio` : 'Kuddes Radio')
  if (isLoading) return <main className="page page-con">Laden…</main>
  if (!data)
    return (
      <main className="page page-con">
        <Box title="Kuddes Radio" icon="transmit">
          <p className="form-error">{errorMessage(error)}</p>
          <p>
            <Link to="/radio">Naar Kuddes Radio</Link>
          </p>
        </Box>
      </main>
    )
  return <Station key={username} station={data.station} shows={data.shows} initialChat={data.chat} />
}

function Station({ station, shows, initialChat }: { station: RadioStation; shows: Parameters<typeof ShowList>[0]['shows']; initialChat: Parameters<typeof ChatPanel>[0]['chat'] }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  // The DJ panel's handler for set-up messages (only the host sets up a DJ's microphone)
  const djHandler = useRef<((e: RadioEvents['dj']) => void) | null>(null)
  const events = useRadioEvents(station.user.username, { live: station.live, chat: initialChat }, (e) => {
    if (e.from === station.user.id) djHandler.current?.(e)
  })
  const setDjHandler = useCallback((h: ((e: RadioEvents['dj']) => void) | null) => {
    djHandler.current = h
  }, [])
  const live = events.live
  const [reporting, setReporting] = useState(false)
  const { pathname } = useLocation()
  // The time on air, ticking
  const [, tick] = useState(0)
  useEffect(() => {
    if (!live) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [live])
  // Live started or stopped: the cards elsewhere follow
  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: radioKeys.all, refetchType: 'none' })
  }, [live, queryClient])

  return (
    <main className="page page-con ph-page rd-page">
      <header className={station.bannerUrl ? 'ph-banner' : `ph-banner plain rd-banner-plain rg-${station.genre}`} style={station.bannerUrl ? { backgroundImage: `url(${station.bannerUrl})`, backgroundPositionY: `${station.bannerY}%` } : undefined}>
        <Link to="/radio" className="ph-banner-back">
          <FarmIcon name="transmit" /> Kuddes Radio
        </Link>
        {station.mine && (
          <Link to="/radio/studio" className="ph-banner-edit">
            <FarmIcon name="microphone" /> Naar je studio
          </Link>
        )}
        <div className="ph-banner-who">
          <Avatar user={station.user} size="medium" />
          <div>
            <h1>
              {station.name} {live && <LiveBadge />}
            </h1>
            <p>
              <Link to={`/profiel/${station.user.username}`}>{station.user.nickname}</Link> · {RADIO_GENRES[station.genre].name} · {station.followers} {station.followers === 1 ? 'volger' : 'volgers'}
            </p>
          </div>
        </div>
      </header>

      <div className="ph-layout">
        <div className="rd-main">
          <section className={live ? 'box rd-onair live' : 'box rd-onair'}>
            {live ? (
              <>
                <div className="rd-onair-head">
                  <div>
                    <span className="rd-onair-label">
                      <LiveBadge /> {sinceLabel(live.since)} · {live.listeners} {live.listeners === 1 ? 'luisteraar' : 'luisteraars'}
                    </span>
                    <h2>{live.title}</h2>
                  </div>
                  <ListenButton station={station} live={live} big />
                </div>
                {live.track ? (
                  <div className="rd-nowplaying">
                    <Cover track={live.track} size={56} />
                    <span className="mu-track-text">
                      <small className="muted">Nu op de radio</small>
                      <b>{live.track.title}</b>
                      <small>
                        <Link to={`/muziek/${live.track.artist.slug}`}>{live.track.artist.name}</Link>
                      </small>
                    </span>
                    <LikeButton track={live.track} />
                  </div>
                ) : (
                  <p className="muted rd-nowplaying-empty">
                    <FarmIcon name="microphone" /> Er wordt gepraat, of er speelt iets anders dan Kuddes Muziek.
                  </p>
                )}
                {live.djs.length > 0 && (
                  <p className="rd-djs">
                    <FarmIcon name="headphone" /> Met DJ{live.djs.length > 1 ? '’s' : ''}{' '}
                    {live.djs.map((d) => (
                      <Link key={d.id} to={`/profiel/${d.username}`} className="rd-dj">
                        <UserPic user={d} /> {d.nickname}
                      </Link>
                    ))}
                  </p>
                )}
              </>
            ) : (
              <div className="rd-offair">
                <FarmIcon name="radio_modern" size={48} />
                <div>
                  <h2>Nu niet live</h2>
                  <p className="muted">{station.next ? `De volgende uitzending staat op het programma hieronder.` : 'Volg deze zender, dan hoor je het als hij live gaat.'}</p>
                </div>
                <FollowButton station={station} />
              </div>
            )}
          </section>

          {station.dj && live && <DjPanel station={station} onSignals={setDjHandler} />}

          {live && (
            <Box title="Chat" icon="comments">
              <ChatPanel username={station.user.username} chat={events.chat} live={!!live} />
            </Box>
          )}
        </div>

        <aside className="ph-side sticky-side">
          <Box title={`Over ${station.name}`} icon={genreIcon(station.genre)}>
            {station.description ? <p className="rd-about">{station.description}</p> : <p className="empty">Nog niets over verteld.</p>}
            <div className="rd-about-actions">
              {live && <FollowButton station={station} />}
              <ShareWithFriends path={`/radio/${station.user.username}`} />
              {user && !station.mine && (
                <button type="button" className="rd-report" onClick={() => setReporting(true)}>
                  <FarmIcon name="flag_red" /> Melden
                </button>
              )}
              {user?.isAdmin && live && !station.mine && (
                <Button
                  onClick={() => confirm(`De uitzending van ${station.name} stoppen?`) && void api(`/radio/stations/${station.user.username}/stop`, { method: 'POST' })}
                >
                  <FarmIcon name="cross" /> Uitzending stoppen
                </Button>
              )}
            </div>
          </Box>
          <Box title="Programma" icon="clock">
            {shows.length ? <ShowList shows={shows} /> : <p className="empty">Er staat nog niets gepland.</p>}
          </Box>
        </aside>
      </div>

      {reporting && (
        <Modal title="Deze zender melden" icon="flag_red" onClose={() => setReporting(false)}>
          <p className="muted">Hoor je iets dat niet door de beugel kan? Vertel wat er aan de hand is; alleen de beheerder leest het.</p>
          <SuggestionForm initialKind="probleem" page={pathname} bare onDone={() => setReporting(false)} />
        </Modal>
      )}
    </main>
  )
}

/** For the station's co-DJs while it's live: into the studio, and push to talk. */
function DjPanel({ station, onSignals }: { station: RadioStation; onSignals: (h: ((e: RadioEvents['dj']) => void) | null) => void }) {
  const link = useRef<DjLink | null>(null)
  useEffect(() => {
    onSignals((e) => void link.current?.handle(e))
    return () => onSignals(null)
  }, [onSignals])
  const [state, setState] = useState<'uit' | 'verbinden' | 'in' | 'eruit'>('uit')
  const [mode, setMode] = useState<DjMode>('verbinden')
  const [talking, setTalking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const join = async () => {
    setProblem(null)
    setState('verbinden')
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      const dj = new DjLink(station.user.username, mic)
      dj.onChange = () => setMode(dj.mode)
      dj.onKicked = () => {
        link.current = null
        setState('eruit')
      }
      link.current = dj
      // You hear the show through the studio now, not twice
      player.close()
      await dj.join()
      setState('in')
    } catch (e) {
      link.current?.close()
      link.current = null
      setState('uit')
      setProblem(e instanceof DOMException ? 'Je microfoon kon niet worden gebruikt. Geef Kuddes toestemming in je browser.' : errorMessage(e))
    }
  }
  const leave = () => {
    link.current?.close()
    link.current = null
    setState('uit')
    setTalking(false)
  }
  const talk = (on: boolean) => {
    link.current?.talk(on)
    // Through the server you'd hear yourself a few seconds later: not while talking
    if (link.current) link.current.ears.muted = on && link.current.mode === 'via-kuddes'
    setTalking(on)
  }
  // Hold the space bar to talk
  useEffect(() => {
    if (state !== 'in') return
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e) && !e.repeat) {
        e.preventDefault()
        talk(true)
      }
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
  useEffect(() => () => link.current?.close(), [])

  return (
    <Box title="Jij bent DJ" icon="headphone">
      {state === 'in' ? (
        <div className="rd-djpanel">
          <PushToTalk talking={talking} onTalk={talk} />
          <div className="rd-djpanel-text">
            <p>
              <b>Je zit in de studio.</b> Houd de knop (of de spatiebalk) ingedrukt om te praten.
            </p>
            <p className="muted">
              {mode === 'direct' ? 'Rechtstreeks verbonden met de host.' : mode === 'via-kuddes' ? 'Verbonden via Kuddes: je hoort de uitzending een paar seconden later, net als de luisteraars.' : 'Verbinden met de host…'} Gebruik een koptelefoon.
            </p>
            <Button onClick={leave}>
              <FarmIcon name="door_out" /> Studio verlaten
            </Button>
          </div>
        </div>
      ) : (
        <div className="rd-djpanel-join">
          <p>{state === 'eruit' ? 'De host heeft je uit de studio gehaald.' : `${station.name} is live. Kom erbij als DJ en praat mee met de uitzending.`}</p>
          <Button variant="cta" onClick={() => void join()} disabled={state === 'verbinden'}>
            <FarmIcon name="microphone" /> {state === 'verbinden' ? 'Verbinden…' : 'Naar de studio'}
          </Button>
          {problem && <p className="form-error">{problem}</p>}
        </div>
      )}
    </Box>
  )
}
