import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MEDIA_KINDS, mediaHref, type MediaReview, type MediaSummary, type RecentReview } from '../../../shared/media'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { useAuth } from '../../lib/auth'
import { RichText } from '../../lib/richText'
import { formatTime } from '../../lib/time'
import { Stars } from '../gadgets/Stars'
import { MediaFace } from './MediaCover'
import { kindIcon } from './mediaFormat'
import { useRespectReview } from './mediaQueries'
import { ShareWithFriends } from '../share/ShareWithFriends'

/** An item in the collection: its cover on a little shelf, the title and the stars. */
export function MediaCard({ item }: { item: MediaSummary }) {
  return (
    <li className="md-card">
      <Link to={mediaHref(item)} className="md-card-link">
        <span className="md-card-cover">
          <MediaFace item={item} size={1.3} height={146} />
        </span>
        <span className="md-card-text">
          <b className="md-card-title">{item.title}</b>
          {item.creator && <span className="md-card-creator">{item.creator}</span>}
          <span className="md-card-rating">
            {item.reviews ? (
              <>
                <Stars rating={Math.round(item.rating * 2) / 2} /> <span className="muted">({item.reviews})</span>
              </>
            ) : (
              <span className="muted">Nog geen recensies</span>
            )}
          </span>
        </span>
      </Link>
    </li>
  )
}

/** Respect for a review (not for your own). */
function RespectButton({ review, itemId }: { review: MediaReview; itemId: number }) {
  const { user } = useAuth()
  const respect = useRespectReview(itemId)
  const own = user?.id === review.user.id
  if (!user || own) return review.respect ? <span className="md-respect muted">★ {review.respect} respect</span> : null
  return (
    <button
      type="button"
      className={review.respected ? 'md-respect given' : 'md-respect'}
      disabled={respect.isPending}
      aria-pressed={review.respected}
      onClick={() => respect.mutate({ review: review.id, give: !review.respected })}
      title={review.respected ? 'Respect terugnemen' : 'Geef respect voor deze recensie'}
    >
      ★ {review.respected ? 'Respect gegeven' : 'Respect'} {review.respect > 0 && <b>{review.respect}</b>}
    </button>
  )
}

/** Copies the link to this one review (its preview elsewhere shows these stars and words), or shares it on a phone. */
function ShareReview({ href, title }: { href: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = `${location.origin}${href}`
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1800)
      }
    } catch {
      // Cancelled, or no clipboard
    }
  }
  return (
    <button type="button" className="link-button md-share" onClick={() => void share()} title="Link naar deze recensie">
      {copied ? 'Link gekopieerd!' : 'Delen'}
    </button>
  )
}

/** One review: who, how many stars, when, what they thought. */
export function ReviewView({ review, itemId, href, title }: { review: MediaReview; itemId: number; href?: string; title?: string }) {
  return (
    <article className="md-review">
      <Avatar user={review.user} size="tiny" />
      <div className="md-review-body">
        <header>
          <Link to={`/profiel/${review.user.username}`} className="md-review-name">
            {review.user.nickname}
          </Link>
          <Stars rating={review.rating} />
          <time className="muted" dateTime={review.createdAt} title={new Date(review.createdAt).toLocaleString('nl-NL')}>
            {formatTime(review.createdAt)}
            {review.updatedAt.slice(0, 16) !== review.createdAt.slice(0, 16) && ' (bewerkt)'}
          </time>
        </header>
        {review.text ? (
          <p className="md-review-text">
            <RichText text={review.text} />
          </p>
        ) : (
          <p className="muted md-review-text">Gaf alleen sterren.</p>
        )}
        <div className="md-review-actions">
          <RespectButton review={review} itemId={itemId} />
          {href && <ShareReview href={`${href}?recensie=${review.id}`} title={`${review.user.nickname} over ${title ?? 'dit'}`} />}
          {href && <ShareWithFriends path={`${href}?recensie=${review.id}`} className="link-button md-share share-link" />}
        </div>
      </div>
    </article>
  )
}

/** A recent review in the side column: the cover, the title and the start of the review. */
export function RecentReviewItem({ review }: { review: RecentReview }) {
  return (
    <li className="md-recent">
      <Link to={mediaHref(review.item)} className="md-recent-cover" tabIndex={-1} aria-hidden="true">
        <MediaFace item={review.item} size={0.6} height={64} />
      </Link>
      <div>
        <Link to={mediaHref(review.item)} className="md-recent-title">
          {review.item.title}
        </Link>
        <span className="md-recent-by">
          <Stars rating={review.rating} /> <span className="muted">door {review.user.nickname}</span>
        </span>
        <p className="md-recent-text">{review.text.length > 110 ? `${review.text.slice(0, 108).trim()}…` : review.text}</p>
      </div>
    </li>
  )
}

export function KindLabel({ kind }: { kind: MediaSummary['kind'] }) {
  return (
    <span className="md-kind">
      <FarmIcon name={kindIcon(kind)} /> {MEDIA_KINDS[kind].one.replace(/^./, (c) => c.toUpperCase())}
    </span>
  )
}
