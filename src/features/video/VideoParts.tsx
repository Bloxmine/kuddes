import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { VideoSummary } from '../../../shared/api'
import { formatDuration, VIDEO_CATEGORIES } from '../../../shared/videos'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { formatTime } from '../../lib/time'
import { seededGradient } from '../../lib/placeholder'
import { videoHref, viewsLabel } from './videoLinks'

/** Thumbnail with the duration in the corner, like 2009. */
export function VideoThumb({ video, size = 'normal' }: { video: VideoSummary; size?: 'small' | 'normal' | 'large' }) {
  return (
    <Link to={videoHref(video.id)} className={`vt-thumb vt-thumb-${size}`} tabIndex={-1} aria-hidden="true">
      {video.thumbUrl ? <img src={video.thumbUrl} alt="" loading="lazy" /> : <span className="vt-thumb-empty" style={{ background: seededGradient(video.title) }} />}
      {video.status === 'klaar' ? (
        <span className="vt-duration">{formatDuration(video.duration)}</span>
      ) : (
        <span className="vt-duration vt-processing">{video.status === 'mislukt' ? 'mislukt' : 'bezig…'}</span>
      )}
    </Link>
  )
}

/** Five stars; with `onRate` you can click one (hovering previews it). */
export function Stars({
  value,
  onRate,
  size = 'normal',
  disabled,
}: {
  value: number
  onRate?: (stars: number) => void
  size?: 'small' | 'normal'
  disabled?: boolean
}) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const labels = ['Slecht', 'Niet zo goed', 'Gaat wel', 'Goed', 'Geweldig!']
  if (!onRate) {
    return (
      <span className={`vt-stars vt-stars-${size}`} role="img" aria-label={value ? `${value.toLocaleString('nl-NL')} van 5 sterren` : 'Nog niet beoordeeld'}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={shown >= i ? 'on' : shown >= i - 0.5 ? 'half' : undefined} />
        ))}
      </span>
    )
  }
  return (
    <span className="vt-rate">
      <span className={`vt-stars vt-stars-${size} interactive`} role="radiogroup" aria-label="Beoordeel deze video" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} ${i === 1 ? 'ster' : 'sterren'}: ${labels[i - 1]}`}
            className={shown >= i ? 'on' : undefined}
            disabled={disabled}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(0)}
            onClick={() => onRate(i)}
          />
        ))}
      </span>
      {hover > 0 && <span className="vt-rate-label">{labels[hover - 1]}</span>}
    </span>
  )
}

/** A video in a vertical list: thumbnail left, details right (search, related). */
export function VideoRow({ video, compact }: { video: VideoSummary; compact?: boolean }) {
  return (
    <li className={compact ? 'vt-row compact' : 'vt-row'}>
      <VideoThumb video={video} size={compact ? 'small' : 'normal'} />
      <div className="vt-row-info">
        <Link to={videoHref(video.id)} className="vt-title">
          {video.title}
        </Link>
        {!compact && video.snippet && <p className="vt-snippet">{video.snippet}</p>}
        <p className="vt-meta">
          {!compact && <Stars value={video.rating} size="small" />} {viewsLabel(video.views)}
        </p>
        <p className="vt-meta">
          {!compact && <>{formatTime(video.createdAt)} · </>}
          <Link to={`/video/kanaal/${video.user.username}`}>{video.user.nickname}</Link>
          {video.visibility !== 'openbaar' && <FarmIcon name={video.visibility === 'vrienden' ? 'group' : 'lock'} label={video.visibility === 'vrienden' ? 'Alleen vrienden' : 'Verborgen'} />}
        </p>
      </div>
    </li>
  )
}

/** A video in a grid: thumbnail on top (home, channels). */
export function VideoTile({ video, showUser = true }: { video: VideoSummary; showUser?: boolean }) {
  return (
    <li className="vt-tile">
      <VideoThumb video={video} />
      <Link to={videoHref(video.id)} className="vt-title" title={video.title}>
        {video.title}
      </Link>
      <span className="vt-meta">{viewsLabel(video.views)}</span>
      <Stars value={video.rating} size="small" />
      {showUser && (
        <Link to={`/video/kanaal/${video.user.username}`} className="vt-meta vt-user">
          {video.user.nickname}
        </Link>
      )}
    </li>
  )
}

export function CategoryLink({ category }: { category: VideoSummary['category'] }) {
  return <Link to={`/video/zoeken?categorie=${category}`}>{VIDEO_CATEGORIES[category]}</Link>
}
