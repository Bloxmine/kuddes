/**
 * The bar at the bottom while music plays: what's on, play/pause, back and
 * forward, where in the song (drag to skip), volume, shuffle and repeat,
 * and the queue. Stays while you browse the site.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatTrackTime } from '../../../shared/music'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Cover, LikeButton } from './MusicParts'
import { useRadioEvents } from '../radio/radioQueries'
import { currentTrack, player, usePlayer, usePlayerTime, type LiveListen } from './player'

export function PlayerBar() {
  const s = usePlayer()
  const track = currentTrack(s)
  const [queueOpen, setQueueOpen] = useState(false)

  // The page leaves room at the bottom, and the Messenger windows move up
  const shown = !!track || !!s.live
  useEffect(() => {
    document.body.classList.toggle('has-player', shown)
    return () => document.body.classList.remove('has-player')
  }, [shown])

  if (s.live) return <LiveBar live={s.live} playing={s.playing || s.loading} loading={s.loading} error={s.error} volume={s.volume} muted={s.muted} />
  if (!track) return null
  return (
    <section className="mu-bar" aria-label="Muziekspeler">
      <div className="mu-bar-now">
        <Cover track={track} size={44} />
        <span className="mu-track-text">
          <b title={track.title}>{track.title}</b>
          <small>
            <Link to={`/muziek/${track.artist.slug}`}>{track.artist.name}</Link>
          </small>
        </span>
        <LikeButton track={track} />
      </div>

      <div className="mu-bar-controls">
        <div className="mu-bar-buttons">
          <button type="button" className={s.shuffle ? 'mu-icon-btn active' : 'mu-icon-btn'} onClick={player.toggleShuffle} aria-pressed={s.shuffle} title={s.shuffle ? 'Willekeurig: aan' : 'Willekeurig: uit'}>
            <span className="mu-shuffle" aria-hidden="true">⤨</span>
          </button>
          <button type="button" className="mu-icon-btn" onClick={player.prev} title="Vorige" aria-label="Vorige">
            <FarmIcon name="control_start" />
          </button>
          <button type="button" className="mu-bar-play" onClick={player.toggle} aria-label={s.playing ? 'Pauzeren' : 'Afspelen'} title={s.playing ? 'Pauzeren' : 'Afspelen'}>
            <FarmIcon name={s.playing ? 'control_pause' : 'control_play'} size={24} />
          </button>
          <button type="button" className="mu-icon-btn" onClick={player.next} disabled={s.at >= s.order.length - 1 && !s.repeat} title="Volgende" aria-label="Volgende">
            <FarmIcon name="control_end" />
          </button>
          <button type="button" className={s.repeat ? 'mu-icon-btn active' : 'mu-icon-btn'} onClick={player.toggleRepeat} aria-pressed={s.repeat} title={s.repeat ? 'Herhalen: aan' : 'Herhalen: uit'}>
            <FarmIcon name={s.repeat ? 'control_repeat_blue' : 'control_repeat'} />
          </button>
        </div>
        <Progress />
        {s.error && <small className="form-error">{s.error}</small>}
      </div>

      <div className="mu-bar-side">
        <button type="button" className="mu-icon-btn" onClick={player.toggleMute} title={s.muted ? 'Geluid aan' : 'Geluid uit'} aria-label={s.muted ? 'Geluid aan' : 'Geluid uit'}>
          <FarmIcon name={s.muted || s.volume === 0 ? 'sound_mute' : s.volume < 0.5 ? 'sound_low' : 'sound'} />
        </button>
        <input
          type="range"
          className="mu-volume"
          min={0}
          max={1}
          step={0.05}
          value={s.muted ? 0 : s.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <button type="button" className={queueOpen ? 'mu-icon-btn active' : 'mu-icon-btn'} onClick={() => setQueueOpen((o) => !o)} aria-expanded={queueOpen} title="Wachtrij">
          <FarmIcon name="text_list_numbers" /> <small>{s.order.length}</small>
        </button>
        <button type="button" className="mu-icon-btn" onClick={player.close} title="Speler sluiten" aria-label="Speler sluiten">
          ×
        </button>
      </div>

      {queueOpen && (
        <div className="mu-queue box" role="dialog" aria-label="Wachtrij">
          <header>
            <b>Wachtrij</b>
            <small className="muted">{s.shuffle ? 'willekeurig' : 'op volgorde'}</small>
          </header>
          <ol>
            {s.order.map((qi, at) => {
              const t = s.queue[qi]
              return (
                <li key={t.id} className={at === s.at ? 'on' : at < s.at ? 'past' : undefined}>
                  <button type="button" onClick={() => player.jump(at)}>
                    <Cover track={t} size={28} />
                    <span className="mu-track-text">
                      <b>{t.title}</b>
                      <small>{t.artist.name}</small>
                    </span>
                    <small className="mu-time">{formatTrackTime(t.duration)}</small>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </section>
  )
}

/** Listening to Kuddes Radio: what's on, how many listen, and stop/listen. */
function LiveBar({ live, playing, loading, error, volume, muted }: { live: LiveListen; playing: boolean; loading: boolean; error: string | null; volume: number; muted: boolean }) {
  const events = useRadioEvents(live.username)
  const show = events.live
  useEffect(() => {
    if (show) player.liveTitle(live.username, show.title)
  }, [show, live.username])
  const track = show?.track
  return (
    <section className="mu-bar mu-bar-live" aria-label="Kuddes Radio">
      <div className="mu-bar-now">
        {track ? (
          <Cover track={track} size={44} />
        ) : (
          <span className="mu-cover plain mu-live-cover">
            <FarmIcon name="transmit" size={24} />
          </span>
        )}
        <span className="mu-track-text">
          <b title={live.title}>
            <span className={show ? 'mu-live-badge' : 'mu-live-badge off'}>{show ? 'LIVE' : 'OFF AIR'}</span> {live.title}
          </b>
          <small>
            <Link to={`/radio/${live.username}`}>{live.station}</Link>
            {track && (
              <>
                {' '}
                · nu: {track.title} – {track.artist.name}
              </>
            )}
          </small>
        </span>
      </div>

      <div className="mu-bar-controls">
        <div className="mu-bar-buttons">
          <button type="button" className="mu-bar-play" onClick={player.toggle} aria-label={playing ? 'Stoppen' : 'Luisteren'} title={playing ? 'Stoppen' : 'Luisteren'}>
            <FarmIcon name={playing ? 'control_pause' : 'control_play'} size={24} />
          </button>
        </div>
        <small className="muted mu-live-info">
          {loading ? 'Verbinden…' : error ? <span className="form-error">{error}</span> : show ? `${show.listeners} ${show.listeners === 1 ? 'luisteraar' : 'luisteraars'}` : 'Deze zender is nu niet live'}
        </small>
      </div>

      <div className="mu-bar-side">
        <button type="button" className="mu-icon-btn" onClick={player.toggleMute} title={muted ? 'Geluid aan' : 'Geluid uit'} aria-label={muted ? 'Geluid aan' : 'Geluid uit'}>
          <FarmIcon name={muted || volume === 0 ? 'sound_mute' : volume < 0.5 ? 'sound_low' : 'sound'} />
        </button>
        <input type="range" className="mu-volume" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="Volume" />
        <button type="button" className="mu-icon-btn" onClick={player.close} title="Speler sluiten" aria-label="Speler sluiten">
          ×
        </button>
      </div>
    </section>
  )
}

function Progress() {
  const { time, duration } = usePlayerTime()
  // While dragging, the slider shows where you are, not where the song is
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? time
  return (
    <div className="mu-progress">
      <small>{formatTrackTime(shown)}</small>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.5}
        value={Math.min(shown, duration || 1)}
        style={{ '--mu-pct': `${duration ? (shown / duration) * 100 : 0}%` } as React.CSSProperties}
        onChange={(e) => setDragging(Number(e.target.value))}
        onPointerUp={() => {
          if (dragging !== null) player.seek(dragging)
          setDragging(null)
        }}
        onKeyUp={() => {
          if (dragging !== null) player.seek(dragging)
          setDragging(null)
        }}
        aria-label="Waar in het nummer"
        disabled={!duration}
      />
      <small>{formatTrackTime(duration)}</small>
    </div>
  )
}
