import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { UserSummary } from '../../../shared/api'
import { Icon } from '../../components/ui/Icon'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import './BuddyPoke.css'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Button } from '../../components/ui/Button'
import { START_TIMEOUT_MS, forceBuddyPoke, forcedBuddyPoke, hasFastWebGL, unforceBuddyPoke } from './support'

type Buddy = { code: string | null; mood: string | null }

export type ReceivedPoke = {
  id: number
  from: UserSummary
  /** The poker's buddy (null: they have none, the default buddy stands in). */
  fromCode: string | null
  action: string
  name: string
  icon: number
  comment: string
  private: boolean
  createdAt: string
}

type FrameState = 'run' | 'unsupported' | 'failed'

/**
 * The BuddyPoke frame, but only on computers that can run it (see support.ts),
 * and stopped when it hasn't started after a while, so a slow or broken
 * computer never ends up with a frozen page.
 */
function SafeFrame({ src, title, lazy, frameRef, compact }: { src: string; title: string; lazy?: boolean; frameRef?: RefObject<HTMLIFrameElement | null>; compact?: boolean }) {
  const [state, setState] = useState<FrameState>(() => (hasFastWebGL() || forcedBuddyPoke() ? 'run' : 'unsupported'))
  const [attempt, setAttempt] = useState(0)
  const own = useRef<HTMLIFrameElement>(null)
  const ref = frameRef ?? own
  const watch = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearInterval(watch.current), [])

  /** From the moment the frame has loaded: is it running yet? */
  const startWatch = () => {
    window.clearInterval(watch.current)
    const since = Date.now()
    watch.current = window.setInterval(() => {
      let doc: Document | null = null
      try {
        doc = ref.current?.contentDocument ?? null
      } catch {
        // not readable: leave it alone
      }
      const loading = doc?.getElementById('loading')
      if (!doc || (loading && loading.hidden)) {
        window.clearInterval(watch.current)
        return
      }
      const text = doc.getElementById('loading-text')?.textContent?.trim() ?? ''
      // "Loading…" is only the page's own text: once BuddyPoke starts it shows its progress
      const neverStarted = text === 'Loading…' && Date.now() - since > 3000
      if (neverStarted || /could not start/i.test(text) || Date.now() - since > START_TIMEOUT_MS) {
        window.clearInterval(watch.current)
        unforceBuddyPoke()
        setState('failed')
      }
    }, 1000)
  }

  if (state !== 'run') {
    return (
      <div className={compact ? 'buddypoke-unsupported compact' : 'buddypoke-unsupported'}>
        <FarmIcon name="buddypoke" size={32} />
        <p>
          <b>{state === 'failed' ? 'BuddyPoke kon niet starten op deze computer.' : 'BuddyPoke werkt niet op deze computer.'}</b>
        </p>
        <p className="muted">
          BuddyPoke tekent in 3D (WebGL) en dat lukt je browser of computer niet (snel genoeg). De rest van Kuddes werkt gewoon. Een nieuwere browser, of
          hardwareversnelling aanzetten in de instellingen van je browser, helpt vaak.
        </p>
        <Button
          onClick={() => {
            forceBuddyPoke()
            setAttempt((a) => a + 1)
            setState('run')
          }}
        >
          {state === 'failed' ? 'Opnieuw proberen' : 'Toch proberen'}
        </Button>
      </div>
    )
  }
  return <iframe key={attempt} ref={ref} src={src} title={title} loading={lazy ? 'lazy' : undefined} onLoad={startWatch} />
}

/** A member's buddy doing its mood (web/gadget.html, served by the API at /buddypoke/). */
export function BuddyPokeView({ buddy, title, frameRef }: { buddy: Buddy; title: string; frameRef?: RefObject<HTMLIFrameElement | null> }) {
  const params = new URLSearchParams()
  if (buddy.code) params.set('code', buddy.code)
  if (buddy.mood) params.set('mood', buddy.mood)
  return (
    <div className="buddypoke-frame">
      {/* In the hash, so the appearance code isn't sent to the server; keyed so a change reloads it */}
      <SafeFrame key={params.toString()} frameRef={frameRef} src={`/buddypoke/gadget.html#${params}`} title={title} lazy compact />
    </div>
  )
}

/**
 * The full BuddyPoke app with all its tabs, in host mode: the member's buddy,
 * their Kuddes friends and real pokes. `pokeUser` opens it on the Friends tab
 * with that member picked.
 */
export function BuddyPokeApp({ username, pokeUser }: { username: string; pokeUser?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const params = new URLSearchParams({ host: 'kuddes' })
  if (pokeUser) {
    params.set('with', pokeUser)
    params.set('tab', 'friends')
  }

  // The app reports saves (to refresh the profile) and asks to open profiles
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frameRef.current?.contentWindow) return
      const data = e.data as { source?: string; type?: string; username?: string }
      if (data?.source !== 'buddypoke') return
      if (data.type === 'saved') {
        queryClient.invalidateQueries({ queryKey: keys.me })
        queryClient.invalidateQueries({ queryKey: keys.profile(username), exact: true })
      }
      if (data.type === 'open-profile' && data.username && /^[a-z0-9_.-]+$/.test(data.username)) {
        navigate(`/profiel/${data.username}`)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [queryClient, navigate, username])

  return (
    <div className="buddypoke-app">
      <SafeFrame frameRef={frameRef} src={`/buddypoke/index.html?${params}`} title="BuddyPoke" />
    </div>
  )
}

/** The app in a window, for poking someone from their profile. */
export function BuddyPokeDialog({ username, pokeUser, onClose }: { username: string; pokeUser: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const close = () => {
    // They may have poked: refresh the list on the profile
    queryClient.invalidateQueries({ queryKey: ['buddypoke', 'pokes', pokeUser] })
    onClose()
  }

  // On top of the page, not inside the box (a see-through, blurred box would trap it)
  return createPortal(
    <div className="buddypoke-overlay" onClick={close}>
      <div className="box buddypoke-dialog" role="dialog" aria-modal="true" aria-label="BuddyPoke" onClick={(e) => e.stopPropagation()}>
        <header className="box-hdr">
          <h2 className="box-title">
            <span className="box-icon"><FarmIcon name="buddypoke" /></span> BuddyPoke
          </h2>
          <button type="button" className="buddypoke-close" onClick={close} aria-label="Sluiten">
            <Icon name="x" />
          </button>
        </header>
        <BuddyPokeApp username={username} pokeUser={pokeUser} />
      </div>
    </div>,
    document.body,
  )
}

const useReceivedPokes = (username: string) =>
  useQuery({
    queryKey: ['buddypoke', 'pokes', username],
    queryFn: () => api<ReceivedPoke[]>(`/buddypoke/users/${encodeURIComponent(username)}/pokes`),
    refetchInterval: 30_000,
  })

/** "Quinn → Lotte: kiss 'see you soon'", with BuddyPoke's own poke icons; a click plays the poke. */
export function ReceivedPokes({ username, nickname, onPlay, playing }: { username: string; nickname: string; onPlay?: (poke: ReceivedPoke) => void; playing?: number | null }) {
  const { data: pokes = [] } = useReceivedPokes(username)
  if (!pokes.length) return <p className="empty buddypoke-no-pokes">{nickname} is nog niet gepoked.</p>

  return (
    <ul className="buddypoke-pokes">
      {pokes.map((p) => (
        <li
          key={p.id}
          className={[onPlay && 'playable', playing === p.id && 'playing'].filter(Boolean).join(' ') || undefined}
          // The whole row plays it, except the name, which links to the profile
          onClick={onPlay && ((e) => !(e.target as HTMLElement).closest('a, button') && onPlay(p))}
        >
          {onPlay ? (
            <button type="button" className="buddypoke-play" onClick={() => onPlay(p)} aria-label={`Speel ${p.name} van ${p.from.nickname} af`} title="Afspelen">
              <i className="buddypoke-icon" style={{ backgroundPosition: `-${(p.icon % 7) * 16}px -${Math.floor(p.icon / 7) * 16}px` }} aria-hidden="true" />
              <span className="buddypoke-play-mark" aria-hidden="true">
                ▶
              </span>
            </button>
          ) : (
            <i className="buddypoke-icon" style={{ backgroundPosition: `-${(p.icon % 7) * 16}px -${Math.floor(p.icon / 7) * 16}px` }} aria-hidden="true" />
          )}
          <span>
            <Link to={`/profiel/${p.from.username}`} className="buzz-name">
              {p.from.nickname}
            </Link>{' '}
            → {nickname}: {p.name}
            {p.comment && <em className="buddypoke-comment"> “{p.comment}”</em>}
            {p.private && <span className="muted"> (privé)</span>}
          </span>
          <time className="date">{formatTime(p.createdAt)}</time>
        </li>
      ))}
    </ul>
  )
}
