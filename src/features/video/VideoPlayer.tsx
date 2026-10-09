import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatDuration } from '../../../shared/videos'
import { FarmIcon } from '../../components/ui/FarmIcon'
import './VideoPlayer.css'

type VideoPlayerProps = {
  src: string
  poster?: string | null
  title: string
  /** Called once, the first time playback starts (to count a view). */
  onFirstPlay?: () => void
  autoPlay?: boolean
  /** Smaller controls, for gadgets and narrow columns. */
  compact?: boolean
  /** "h265" for new uploads: not every browser can play those. */
  codec?: string
}

/** Can this browser play H.265 (HEVC) in MP4? Safari, Edge and Chrome can, with hardware support. */
const canPlayHevc = () => {
  try {
    return document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') !== ''
  } catch {
    return true
  }
}

function Unsupported() {
  return (
    <div className="bv-unsupported" role="alert">
      <FarmIcon name="warning" size={32} />
      <p>
        <b>Je browser kan deze video niet afspelen.</b> Kuddes Video gebruikt H.265 (HEVC). Dat werkt in Safari, Edge en Chrome op de meeste computers en
        telefoons, en in Firefox op Windows en Mac.
      </p>
    </div>
  )
}

const VOLUME_KEY = 'kuddes.videoVolume'

function storedVolume() {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY))
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1
  } catch {
    return 1
  }
}

/**
 * The Kuddes video player: a glossy control bar in the site's colours with
 * round buttons, a seek bar that shows what's buffered, volume, fullscreen
 * and keyboard shortcuts (space/k, ←/→, ↑/↓, m, f).
 */
export function VideoPlayer({ src, poster, title, onFirstPlay, autoPlay, compact, codec }: VideoPlayerProps) {
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(storedVolume)
  const [muted, setMuted] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [ended, setEnded] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [idle, setIdle] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(() => codec === 'h265' && !canPlayHevc())
  const idleTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (video.current) video.current.volume = volume
    try {
      localStorage.setItem(VOLUME_KEY, String(volume))
    } catch {
      // only the preference is lost
    }
  }, [volume])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Controls fade out while playing and the mouse is still
  const wake = useCallback(() => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500)
  }, [])
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])

  const show = (message: string) => {
    setFlash(message)
    window.setTimeout(() => setFlash((f) => (f === message ? null : f)), 700)
  }

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused || v.ended) void v.play().catch(() => undefined)
    else v.pause()
  }
  const seek = (to: number) => {
    const v = video.current
    if (!v || !Number.isFinite(v.duration)) return
    v.currentTime = Math.min(Math.max(0, to), v.duration)
    setTime(v.currentTime)
  }
  const setVol = (next: number) => {
    const v = Math.min(1, Math.max(0, next))
    setVolume(v || 0.01)
    setMuted(v === 0)
    if (video.current) video.current.muted = v === 0
  }
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (video.current) video.current.muted = next
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void box.current?.requestFullscreen?.()
  }

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return { ratio, t: ratio * (duration || 0), x: ratio * rect.width }
  }
  const onTrackDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setScrubbing(true)
    seek(timeAt(e.clientX).t)
  }
  const onTrackMove = (e: PointerEvent<HTMLDivElement>) => {
    const at = timeAt(e.clientX)
    setHover({ x: at.x, t: at.t })
    if (scrubbing) seek(at.t)
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const v = video.current
    if (!v) return
    switch (e.key) {
      case ' ':
      case 'k':
        toggle()
        break
      case 'ArrowLeft':
        seek(v.currentTime - 5)
        show('−5 s')
        break
      case 'ArrowRight':
        seek(v.currentTime + 5)
        show('+5 s')
        break
      case 'ArrowUp':
        setVol(volume + 0.1)
        show(`${Math.round(Math.min(1, volume + 0.1) * 100)}%`)
        break
      case 'ArrowDown':
        setVol(volume - 0.1)
        show(`${Math.round(Math.max(0, volume - 0.1) * 100)}%`)
        break
      case 'm':
        toggleMute()
        break
      case 'f':
        toggleFullscreen()
        break
      case 'Home':
        seek(0)
        break
      case 'End':
        seek(duration)
        break
      default:
        return
    }
    e.preventDefault()
    wake()
  }

  const progress = duration ? (time / duration) * 100 : 0
  const bufferedPct = duration ? (buffered / duration) * 100 : 0
  const effectiveVolume = muted ? 0 : volume
  const hideControls = playing && idle && !scrubbing

  return (
    <div
      ref={box}
      className={['bv-player', compact && 'compact', hideControls && 'idle', fullscreen && 'fullscreen'].filter(Boolean).join(' ')}
      tabIndex={0}
      role="region"
      aria-label={`Videospeler: ${title}`}
      onKeyDown={onKey}
      onPointerMove={wake}
      onPointerLeave={() => playing && setIdle(true)}
    >
      <video
        ref={video}
        src={src}
        poster={poster ?? undefined}
        preload="metadata"
        playsInline
        autoPlay={autoPlay}
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true)
          setEnded(false)
          wake()
          if (!started.current) {
            started.current = true
            onFirstPlay?.()
          }
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setEnded(true)
        }}
        onTimeUpdate={(e) => !scrubbing && setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration)
          e.currentTarget.volume = volume
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onProgress={(e) => {
          const b = e.currentTarget.buffered
          if (b.length) setBuffered(b.end(b.length - 1))
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onError={(e) => {
          const code = e.currentTarget.error?.code
          if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED || code === MediaError.MEDIA_ERR_DECODE) {
            setUnsupported(true)
            setWaiting(false)
          }
        }}
      />
      {unsupported && <Unsupported />}

      {!playing && !waiting && (
        <button type="button" className="bv-big-play" aria-label={ended ? 'Opnieuw afspelen' : 'Afspelen'} onClick={toggle}>
          <FarmIcon name={ended ? 'control_repeat_blue' : 'control_play_blue'} size={32} />
        </button>
      )}
      {waiting && <span className="bv-spinner" aria-label="Laden…" />}
      {flash && <span className="bv-flash">{flash}</span>}

      <div className="bv-controls" onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={track}
          className="bv-track"
          role="slider"
          aria-label="Positie"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={`${formatDuration(time)} van ${formatDuration(duration)}`}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={() => setScrubbing(false)}
          onPointerLeave={() => !scrubbing && setHover(null)}
        >
          <span className="bv-track-buffered" style={{ width: `${bufferedPct}%` }} />
          <span className="bv-track-played" style={{ width: `${progress}%` }} />
          <span className="bv-track-knob" style={{ left: `${progress}%` }} />
          {hover && (
            <span className="bv-track-tip" style={{ left: hover.x }}>
              {formatDuration(hover.t)}
            </span>
          )}
        </div>

        <div className="bv-bar">
          <button type="button" className="bv-btn bv-btn-main" onClick={toggle} aria-label={playing ? 'Pauze' : 'Afspelen'} title={playing ? 'Pauze (k)' : 'Afspelen (k)'}>
            <FarmIcon name={playing ? 'control_pause' : 'control_play'} />
          </button>
          <span className="bv-time">
            {formatDuration(time)} <span>/ {formatDuration(duration)}</span>
          </span>
          <span className="bv-spacer" />
          <span className="bv-volume">
            <button type="button" className="bv-btn" onClick={toggleMute} aria-label={muted ? 'Geluid aan' : 'Geluid uit'} title="Geluid (m)">
              <FarmIcon name={effectiveVolume === 0 ? 'sound_mute' : effectiveVolume < 0.5 ? 'sound_low' : 'sound'} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={effectiveVolume}
              onChange={(e) => setVol(Number(e.target.value))}
              aria-label="Volume"
              style={{ '--vol': `${effectiveVolume * 100}%` } as React.CSSProperties}
            />
          </span>
          <button type="button" className="bv-btn" onClick={toggleFullscreen} aria-label={fullscreen ? 'Volledig scherm uit' : 'Volledig scherm'} title="Volledig scherm (f)">
            <FarmIcon name={fullscreen ? 'arrow_in' : 'arrow_out'} />
          </button>
        </div>
      </div>
    </div>
  )
}
