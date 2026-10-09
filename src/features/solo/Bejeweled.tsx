/**
 * Bejeweled 3 on /spellen/alleen/bejeweled: the HTML5 port (games/bejeweled,
 * served at /bejeweled/) in a frame across the whole page, with a fullscreen
 * button. In host mode the game itself saves your badges and scores to your
 * account (games/bejeweled/web/js/host.js) and tells this page, which then
 * shows the new records, high scores and achievements.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BEJEWELED_MODES, BEJEWELED_MODE_KEYS, type BejeweledMode, type BejeweledProgress } from '../../../shared/bejeweled'
import { SOLO_GAMES, type SoloOverview } from '../../../shared/soloGames'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { gameKeys } from '../games/gameQueries'
import './Bejeweled.css'

const progressKey = ['bejeweled', 'progress'] as const
const topKey = (mode: BejeweledMode) => ['solo', 'bejeweled', mode] as const

export function BejeweledPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const stage = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [full, setFull] = useState(false)
  const [mode, setMode] = useState<BejeweledMode>('classic')

  const { data: progress } = useQuery({ queryKey: progressKey, queryFn: () => api<BejeweledProgress>('/bejeweled'), enabled: !!user })
  const { data: top } = useQuery({ queryKey: topKey(mode), queryFn: () => api<SoloOverview>(`/solo/bejeweled?mode=${mode}`) })

  // What the game tells us: a new score or badge progress (records, achievements), or Quit
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return
      const msg = e.data as { source?: string; type?: string; mode?: string }
      if (msg?.source !== 'bejeweled') return
      if (msg.type === 'quit') {
        if (document.fullscreenElement) void document.exitFullscreen()
        navigate('/spellen')
        return
      }
      void queryClient.invalidateQueries({ queryKey: progressKey })
      void queryClient.invalidateQueries({ queryKey: ['solo', 'bejeweled'] })
      // New achievements pop up with the next check
      void queryClient.invalidateQueries({ queryKey: gameKeys.live })
      if (user) void queryClient.invalidateQueries({ queryKey: gameKeys.achievements(user.username) })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [navigate, queryClient, user])

  useEffect(() => {
    const onChange = () => {
      setFull(document.fullscreenElement === stage.current)
      // Straight back to the game, so its keys (H, Esc) keep working
      frame.current?.focus()
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stage.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <main className="page page-con bj-page">
      <Box
        title={SOLO_GAMES.bejeweled.name}
        icon="ruby"
        className="bj-box"
        noPadding
        actions={
          <Button onClick={toggleFull}>
            <FarmIcon name={full ? 'arrow_in' : 'arrow_out'} /> {full ? 'Venster' : 'Volledig scherm'}
          </Button>
        }
      >
        <div className={full ? 'bj-stage full' : 'bj-stage'} ref={stage}>
          <iframe
            ref={frame}
            src="/bejeweled/index.html?host=kuddes"
            title="Bejeweled 3"
            allow="fullscreen; autoplay"
            allowFullScreen
          />
        </div>
        <p className="muted bj-help">
          Klik op het spel om te beginnen. <b>F</b> of de knop hierboven: volledig scherm, <b>H</b>: hint, <b>Esc</b>: pauze.
          {!user && (
            <>
              {' '}
              <Link to="/inloggen?next=/spellen/alleen/bejeweled">Log in</Link> om je badges, prestaties en scores te bewaren.
            </>
          )}
        </p>
      </Box>

      <div className="bj-below">
        <Box title="Jouw records" icon="chart_bar">
          {user ? (
            <ul className="solo-mine">
              {BEJEWELED_MODE_KEYS.map((m) => (
                <li key={m}>
                  <span>{BEJEWELED_MODES[m]}</span> <b>{progress?.bests[m]?.score.toLocaleString('nl-NL') ?? '–'}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Log in om je records bij te houden.</p>
          )}
          <p className="bj-badges-link">
            <Link to={user ? `/prestaties/${user.username}` : '/spellen'}>
              <FarmIcon name="award_star_gold_1" /> De badges van het spel zijn ook prestaties
            </Link>
          </p>
        </Box>

        <Box title="Hoogste scores" icon="award_star_gold_1">
          <div className="bj-modes" role="tablist" aria-label="Spelsoort">
            {BEJEWELED_MODE_KEYS.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={m === mode} className={m === mode ? 'bj-mode current' : 'bj-mode'} onClick={() => setMode(m)}>
                {BEJEWELED_MODES[m]}
              </button>
            ))}
          </div>
          {!top?.top.length ? (
            <p className="empty">Nog niemand in {BEJEWELED_MODES[mode]}. Zet jij de eerste score neer?</p>
          ) : (
            <ol className="solo-top">
              {top.top.map((t, i) => (
                <li key={t.user.id} className={t.user.id === user?.id ? 'me' : undefined}>
                  <span className="solo-rank">{i + 1}</span>
                  <Avatar user={t.user} size="tiny" />
                  <Link to={`/profiel/${t.user.username}`}>{t.user.nickname}</Link>
                  <b>{t.score.toLocaleString('nl-NL')}</b>
                </li>
              ))}
            </ol>
          )}
        </Box>
      </div>
    </main>
  )
}
