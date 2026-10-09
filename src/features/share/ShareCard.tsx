/**
 * Something from the site shared in Kuddes Messenger: a small preview (picture,
 * kind, title, stars, a bit of text) that opens the page. Each reader gets it
 * as they may see it (/api/share).
 */
import { Link } from 'react-router-dom'
import type { SharePreview } from '../../../shared/api'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Stars } from '../gadgets/Stars'
import { MediaCover } from '../media/MediaCover'
import type { MusicTrack } from '../../../shared/music'
import { player, useNowPlaying } from '../music/player'
import { useSharePreview } from './shareLinks'
import './Share.css'

export function ShareCard({ path, onOpen }: { path: string; onOpen?: () => void }) {
  const { data: p, isLoading, isError } = useSharePreview(path)
  if (isLoading) return <div className="share-card loading muted">Voorbeeld laden…</div>
  if (isError || !p)
    return (
      <div className="share-card missing muted">
        <FarmIcon name="link" /> Dit bestaat niet (meer) of je mag het niet zien.
      </div>
    )
  return <SharePreviewCard preview={p} onOpen={onOpen} />
}

export function SharePreviewCard({ preview: p, onOpen }: { preview: SharePreview; onOpen?: () => void }) {
  const card = (
    <Link to={p.href} className={`share-card kind-${p.kind}`} onClick={onOpen}>
      <span className="share-thumb" aria-hidden="true">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" loading="lazy" />
        ) : p.media ? (
          <MediaCover item={p.media} size={0.42} />
        ) : (
          <FarmIcon name={p.icon as FarmIconName} size={32} />
        )}
      </span>
      <span className="share-text">
        <span className="share-label">
          <FarmIcon name={p.icon as FarmIconName} /> {p.label}
        </span>
        <b>{p.title}</b>
        {p.rating !== null && <Stars rating={p.rating} />}
        {p.subtitle && <span className="share-sub">{p.subtitle}</span>}
        {p.text && <span className="share-snippet">{p.text}</span>}
      </span>
    </Link>
  )
  // A song: play it right here (in the player bar), without leaving the chat
  return p.track ? (
    <span className="share-card-wrap">
      {card}
      <PlayShared track={p.track} />
    </span>
  ) : (
    card
  )
}

function PlayShared({ track }: { track: MusicTrack }) {
  const now = useNowPlaying()
  const on = now.id === track.id && now.playing
  return (
    <button type="button" className="share-play" onClick={() => player.play([track], 0)} aria-label={on ? 'Pauzeren' : `${track.title} afspelen`} title={on ? 'Pauzeren' : 'Afspelen'}>
      <FarmIcon name={on ? 'control_pause' : 'control_play'} size={24} />
    </button>
  )
}
