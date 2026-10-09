import { useEffect, useRef, useState, type RefObject } from 'react'
import { usePreferences } from '../../lib/preferences'
import type { Gadget } from '../../../shared/api'
import { youtubeEmbed, youtubeThumb, type MusicOrder, type Track } from '../../../shared/gadgets'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { ExternalBlocked } from '../../components/ui/ExternalBlocked'
import { useConsent } from '../../lib/cookieConsent'

type MusicGadgetData = Extract<Gadget, { type: 'muziek' }>
type VideoGadgetData = Extract<Gadget, { type: 'video' }>

const YT_ORIGIN = 'https://www.youtube-nocookie.com'

/** YouTube's player states, as the embed reports them. */
const YT = { ended: 0, playing: 1, buffering: 3 } as const

/**
 * The YouTube player only loads after you press play (or when the music is
 * set to start by itself), from the youtube-nocookie domain: until then there
 * are no YouTube cookies or scripts on the profile (videos do show a
 * thumbnail image). With `onState` it talks to the embed over postMessage
 * (enablejsapi), without loading YouTube's own API script.
 */
function Player({ track, playing, onState, frameRef }: { track: Track; playing: boolean; onState?: (info: { state?: number; muted?: boolean }) => void; frameRef?: RefObject<HTMLIFrameElement | null> }) {
  const own = useRef<HTMLIFrameElement>(null)
  const frame = frameRef ?? own
  const allowed = useConsent('youtube')
  const stateRef = useRef(onState)
  useEffect(() => {
    stateRef.current = onState
  })
  const listen = !!onState
  useEffect(() => {
    if (!listen) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      try {
        const msg = JSON.parse(e.data) as { event?: string; info?: { playerState?: number; muted?: boolean } | number }
        if (msg.event === 'onStateChange' && typeof msg.info === 'number') stateRef.current?.({ state: msg.info })
        else if ((msg.event === 'infoDelivery' || msg.event === 'initialDelivery') && msg.info && typeof msg.info === 'object') {
          stateRef.current?.({ state: msg.info.playerState, muted: msg.info.muted })
        }
      } catch {
        // not one of YouTube's messages
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [listen, frame])
  if (!playing) return null
  if (!allowed) return <ExternalBlocked kind="youtube" compact />
  return (
    <div className="yt-frame">
      <iframe
        ref={frame}
        src={youtubeEmbed(track.videoId, true, listen ? location.origin : undefined)}
        title={track.title || 'YouTube-video'}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={(e) => {
          if (!listen) return
          // Ask the embed to report its state to us
          const win = e.currentTarget.contentWindow
          win?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), YT_ORIGIN)
          win?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 1, channel: 'widget' }), YT_ORIGIN)
        }}
      />
    </div>
  )
}

const ytCommand = (frame: HTMLIFrameElement | null, func: string) =>
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [], id: 1, channel: 'widget' }), YT_ORIGIN)

/** A glossy MP3 player with an LCD display and a playlist; the next song starts when one ends. */
/** The order to play the songs in (indexes into the list): as the owner chose, or shuffled with `first` up front. */
function playOrder(count: number, order: MusicOrder, shuffle: boolean, first?: number): number[] {
  const base = Array.from({ length: count }, (_, i) => (order === 'omgekeerd' ? count - 1 - i : i))
  if (!shuffle) return base
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[base[i], base[j]] = [base[j], base[i]]
  }
  if (first !== undefined) base.unshift(...base.splice(base.indexOf(first), 1))
  return base
}

export function MusicGadget({ gadget }: { gadget: MusicGadgetData }) {
  const tracks = gadget.config.tracks
  const order = gadget.config.order ?? 'volgorde'
  const { prefs } = usePreferences()
  const autoplay = !!gadget.config.autoplay && prefs.musicAutoplay && tracks.length > 0
  // Shuffle: a different start on every visit; visitors can turn it on or off
  const [shuffle, setShuffle] = useState(order === 'willekeurig')
  const [queue, setQueue] = useState(() => playOrder(tracks.length, order, order === 'willekeurig'))
  const [pos, setPos] = useState(0)
  // The owner changed the songs: start over
  if (queue.length !== tracks.length) {
    setQueue(playOrder(tracks.length, order, shuffle))
    setPos(0)
  }
  const index = queue[Math.min(pos, queue.length - 1)] ?? 0
  const [playing, setPlaying] = useState(autoplay)
  // The browser may block music that starts by itself: then we ask for a click
  const [blocked, setBlocked] = useState(false)
  const started = useRef(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const mutedRef = useRef(false)
  useEffect(() => {
    if (!autoplay) return
    const t = window.setTimeout(() => !started.current && setBlocked(true), 4000)
    return () => window.clearTimeout(t)
  }, [autoplay])
  if (tracks.length === 0) return <p className="empty">Nog geen nummers.</p>
  const current = tracks[Math.min(index, tracks.length - 1)]
  /** To a place in the play order (wrapping around). */
  const step = (p: number) => {
    setPos((p + queue.length) % queue.length)
    setPlaying(true)
    setBlocked(false)
  }
  /** To a song from the list. */
  const go = (i: number) => step(Math.max(0, queue.indexOf(i)))
  const toggleShuffle = () => {
    const next = !shuffle
    setShuffle(next)
    // The song that's on stays on; the rest follows the new order
    const q = playOrder(tracks.length, order, next, index)
    setQueue(q)
    setPos(q.indexOf(index))
  }
  const onState = ({ state, muted }: { state?: number; muted?: boolean }) => {
    // Some browsers let it start, but without sound
    if (muted !== undefined) mutedRef.current = muted
    if (state === YT.playing || state === YT.buffering) {
      started.current = true
      setBlocked(autoplay && mutedRef.current)
    } else if (muted === false) setBlocked(false)
    if (state === YT.ended && tracks.length > 1) step(pos + 1)
  }

  return (
    <div className="music-player">
      <div className="music-device">
        <div className="music-lcd" aria-live="polite">
          <span className="music-lcd-label">{playing && !blocked ? '▶ Nu speelt' : '■ Gestopt'}</span>
          <span className="music-lcd-title">
            <span>{current.title || 'Onbekend nummer'}</span>
          </span>
          <span className="music-lcd-track">
            {shuffle ? 'Shuffle' : `${index + 1}/${tracks.length}`}
          </span>
        </div>
        <div className="music-controls">
          <button type="button" title="Vorige" aria-label="Vorige" onClick={() => step(pos - 1)} disabled={tracks.length < 2}>
            <FarmIcon name="control_start" />
          </button>
          <button
            type="button"
            className="music-play"
            title={playing ? 'Stop' : 'Afspelen'}
            aria-label={playing ? 'Stop' : 'Afspelen'}
            onClick={() => {
              setBlocked(false)
              setPlaying((p) => !p)
            }}
          >
            <FarmIcon name={playing ? 'control_pause' : 'control_play'} size={20} />
          </button>
          <button type="button" title="Volgende" aria-label="Volgende" onClick={() => step(pos + 1)} disabled={tracks.length < 2}>
            <FarmIcon name="control_end" />
          </button>
          <button
            type="button"
            className={shuffle ? 'music-shuffle on' : 'music-shuffle'}
            title={shuffle ? 'Willekeurig: aan' : 'Willekeurig afspelen'}
            aria-label="Willekeurig afspelen"
            aria-pressed={shuffle}
            onClick={toggleShuffle}
            disabled={tracks.length < 2}
          >
            <FarmIcon name="dice" />
          </button>
        </div>
      </div>
      {blocked && playing && (
        <button
          type="button"
          className="music-unblock"
          onClick={() => {
            // A click lets the player start with sound
            ytCommand(frame.current, 'unMute')
            ytCommand(frame.current, 'playVideo')
            setBlocked(false)
          }}
        >
          <FarmIcon name="sound" /> Klik om de muziek van dit profiel te starten
        </button>
      )}
      <Player key={current.videoId + index} track={current} playing={playing} onState={onState} frameRef={frame} />
      <ol className="music-list">
        {tracks.map((t, i) => (
          <li key={`${t.videoId}-${i}`} className={i === index ? 'current' : undefined}>
            <button type="button" onClick={() => go(i)}>
              <FarmIcon name={i === index && playing ? 'sound' : 'music'} />
              <span>{t.title || 'Onbekend nummer'}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="gadget-note muted">{autoplay ? 'Muziek via YouTube; speelt vanzelf af. Zet dat uit onder Instellingen → Weergave.' : 'Muziek via YouTube; de speler laadt pas als je op afspelen drukt.'}</p>
    </div>
  )
}

/** One or more YouTube videos: a thumbnail with a play button, then the player. */
export function VideoGadget({ gadget }: { gadget: VideoGadgetData }) {
  const videos = gadget.config.videos
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  // Even the thumbnails come from Google
  const allowed = useConsent('youtube')
  if (videos.length === 0) return <p className="empty">Nog geen video's.</p>
  const current = videos[Math.min(index, videos.length - 1)]
  if (!allowed) return <ExternalBlocked kind="youtube" />

  return (
    <div className="video-gadget">
      {playing ? (
        <Player key={current.videoId} track={current} playing />
      ) : (
        <button type="button" className="video-poster" onClick={() => setPlaying(true)} aria-label={`Speel ${current.title || 'video'} af`}>
          <img src={youtubeThumb(current.videoId)} alt="" loading="lazy" referrerPolicy="no-referrer" />
          <span className="video-play" aria-hidden="true" />
        </button>
      )}
      {current.title && <p className="video-title">{current.title}</p>}
      {videos.length > 1 && (
        <ul className="video-strip">
          {videos.map((v, i) => (
            <li key={`${v.videoId}-${i}`}>
              <button
                type="button"
                className={i === index ? 'current' : undefined}
                title={v.title}
                onClick={() => {
                  setIndex(i)
                  setPlaying(false)
                }}
              >
                <img src={youtubeThumb(v.videoId)} alt={v.title || `Video ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
