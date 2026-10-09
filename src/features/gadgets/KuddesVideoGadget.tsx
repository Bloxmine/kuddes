import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { formatDuration } from '../../../shared/videos'
import { api } from '../../lib/api'
import { VideoPlayer } from '../video/VideoPlayer'
import { videoHref } from '../video/videoLinks'

type KuddesVideoData = Extract<Gadget, { type: 'kuddesvideo' }>

/** Kuddes Video on a profile: the member's own videos in the Kuddes player. */
export function KuddesVideoGadget({ gadget, isOwner }: { gadget: KuddesVideoData; isOwner: boolean }) {
  const videos = gadget.videos
  const [index, setIndex] = useState(0)
  if (videos.length === 0) {
    return (
      <p className="empty">
        Nog geen video's.{isOwner && <> <Link to="/video/uploaden">Upload er een!</Link></>}
      </p>
    )
  }
  const current = videos[Math.min(index, videos.length - 1)]
  return (
    <div className="kuddesvideo-gadget">
      <VideoPlayer
        key={current.id}
        src={`/api/videos/${current.id}/file`}
        poster={current.thumbUrl}
        title={current.title}
        codec={current.codec}
        compact
        onFirstPlay={() => void api(`/videos/${current.id}/view`, { method: 'POST' }).catch(() => undefined)}
      />
      <Link to={videoHref(current.id)} className="video-title">
        {current.title}
      </Link>
      {videos.length > 1 && (
        <ul className="video-strip">
          {videos.map((v, i) => (
            <li key={v.id}>
              <button type="button" className={i === index ? 'current' : undefined} title={`${v.title} (${formatDuration(v.duration)})`} onClick={() => setIndex(i)}>
                {v.thumbUrl ? <img src={v.thumbUrl} alt={v.title} loading="lazy" /> : <span>{v.title}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link to="/video" className="gadget-note muted">
        Kuddes Video »
      </Link>
    </div>
  )
}
