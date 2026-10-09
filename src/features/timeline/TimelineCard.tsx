import { formatMinutes, recipeHref } from '../../../shared/recipes'
import { blogHref } from '../../../shared/blogs'
import { withSmileys } from '../../lib/smileys'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TimelineItem, UserSummary } from '../../../shared/api'
import { MUSIC_GENRES, formatTrackTime, type MusicTrack } from '../../../shared/music'
import { Cover } from '../music/MusicParts'
import { player, useNowPlaying } from '../music/player'
import { resolveSkinFor, skinVars } from '../../../shared/skins'
import { useSiteDark } from '../../lib/useSiteDark'
import { formatDuration } from '../../../shared/videos'
import { videoHref } from '../video/videoLinks'
import '../video/Video.css'
import { SocialBar } from '../../components/social/SocialBar'
import { StatusBody } from '../../components/social/StatusBody'
import { Avatar } from '../../components/ui/Avatar'
import { KuddeAvatar } from '../../components/social/KuddeAvatar'
import { Dropdown } from '../../components/ui/Dropdown'
import { Tile } from '../../components/ui/TileGrid'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { RichText } from '../../lib/richText'
import { formatTime } from '../../lib/time'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { GlitterImg } from '../glitters/GlitterImg'
import { MEDIA_KINDS, mediaHref } from '../../../shared/media'
import { MediaFace } from '../media/MediaCover'
import { Stars } from '../gadgets/Stars'
import '../gadgets/ShelfGadgets.css'
import '../gadgets/DrinkSeriesGadgets.css'

const ProfileLink = ({ user }: { user: UserSummary }) => (
  <Link to={`/profiel/${user.username}`} className="timeline-name">
    {user.nickname}
  </Link>
)

/** "Lotte heeft een WieWatWaar geplaatst" and the like. */
function headline(item: TimelineItem): ReactNode {
  const actor = <ProfileLink user={item.actor} />
  const target = item.target ? <ProfileLink user={item.target} /> : null
  switch (item.type) {
    case 'status':
      return item.status?.kudde ? (
        <>
          <Link to={`/kuddes/${item.status.kudde.slug}`} className="timeline-name">
            {item.status.kudde.name}
          </Link>{' '}
          heeft een WieWatWaar geplaatst <span className="muted">(door {actor})</span>
        </>
      ) : (
        <>{actor} heeft een WieWatWaar geplaatst</>
      )
    case 'photo':
      return <>{actor} heeft een nieuwe foto geplaatst</>
    case 'avatar':
      return <>{actor} heeft een nieuwe profielfoto geplaatst</>
    case 'knuffel':
      return <>{actor} knuffelde {target}</>
    case 'friendship':
      return <>{actor} is vrienden geworden met {target}</>
    case 'kudde_join':
      return (
        <>
          {actor} is lid geworden van{' '}
          {item.kudde ? <Link to={`/kuddes/${item.kudde.slug}`} className="timeline-name">{item.kudde.name}</Link> : 'een Kudde'}
        </>
      )
    case 'video':
      return <>{actor} heeft een video geüpload</>
    case 'recipe':
      return <>{actor} heeft een recept gedeeld</>
    case 'blog':
      return <>{actor} heeft een blog geschreven</>
    case 'track':
      return item.track ? (
        <>
          {actor} heeft een nummer geüpload{item.track.artist.name !== item.actor.nickname && <> met <Link to={`/muziek/${item.track.artist.slug}`} className="timeline-name">{item.track.artist.name}</Link></>}
        </>
      ) : (
        <>{actor} heeft een nummer geüpload</>
      )
    case 'radio':
      return (
        <>
          {actor} ging live op <Link to={`/radio/${item.actor.username}`} className="timeline-name">Kuddes Radio</Link>
        </>
      )
    case 'photography':
      return (
        <>
          {actor} heeft een foto op <Link to={`/fotografie/${item.actor.username}`} className="timeline-name">Fotografie</Link> gezet
        </>
      )
    case 'review':
      return item.review ? (
        <>
          {actor} {item.review.text ? 'schreef een recensie over' : 'gaf sterren aan'}{' '}
          <Link to={mediaHref(item.review.item)} className="timeline-name">
            {item.review.item.title}
          </Link>
        </>
      ) : (
        <>{actor} schreef een recensie</>
      )
  }
}

function Content({ item }: { item: TimelineItem }) {
  switch (item.type) {
    case 'status':
      return item.status ? <StatusBody status={item.status} /> : null
    case 'photo':
      return item.photo ? (
        <Link to={`/profiel/${item.actor.username}?tab=fotos&foto=${item.photo.id}`} className="timeline-photo">
          <img src={item.photo.url} width={item.photo.width} height={item.photo.height} alt={item.photo.caption || 'Foto'} loading="lazy" />
          {item.photo.caption && <span>{item.photo.caption}</span>}
        </Link>
      ) : null
    case 'photography':
      return item.photo ? (
        <Link to={`/fotografie/${item.actor.username}/foto/${item.photo.id}`} className="timeline-photo">
          <img src={item.photo.url} width={item.photo.width} height={item.photo.height} alt={item.photo.caption || 'Foto'} loading="lazy" />
          {item.photo.caption && <span>{item.photo.caption}</span>}
        </Link>
      ) : null
    case 'track':
      return item.track ? <TrackCard track={item.track} /> : null
    case 'radio':
      return (
        <Link to={`/radio/${item.actor.username}`} className="timeline-recipe timeline-radio">
          <span className="timeline-radio-icon">
            <FarmIcon name="transmit" size={32} />
          </span>
          <span>
            <b>{item.title ?? 'Live op de radio'}</b>
            <span className="muted">Luister mee op de zender van {item.actor.nickname} »</span>
          </span>
        </Link>
      )
    case 'avatar':
      return item.actor.avatarUrl ? (
        <Link to={`/profiel/${item.actor.username}`} className="timeline-avatar-photo">
          <img src={item.actor.avatarUrl} alt={`Profielfoto van ${item.actor.nickname}`} loading="lazy" />
        </Link>
      ) : null
    case 'knuffel':
      return item.knuffel && item.target ? (
        <Link to={`/profiel/${item.target.username}?tab=knuffels`} className="timeline-quote">
          {item.knuffel.glitter && <GlitterImg glitter={item.knuffel.glitter} />}
          {item.knuffel.text && <RichText text={item.knuffel.text} />}
        </Link>
      ) : null
    case 'friendship':
      return item.target ? (
        <div className="timeline-friends">
          <Avatar user={item.actor} size="medium" showName label={item.actor.nickname} />
          <FarmIcon name="group_add" size={24} />
          <Avatar user={item.target} size="medium" showName label={item.target.nickname} />
        </div>
      ) : null
    case 'kudde_join':
      return item.kudde ? (
        <div className="timeline-kudde">
          <Tile
            to={`/kuddes/${item.kudde.slug}`}
            imageUrl={item.kudde.imageUrl}
            fallback={item.kudde.name}
            title={item.kudde.name}
            subtitle={`${item.kudde.memberCount} ${item.kudde.memberCount === 1 ? 'lid' : 'leden'}`}
          />
        </div>
      ) : null
    case 'video':
      return item.video ? (
        <Link to={videoHref(item.video.id)} className="timeline-video">
          <span className="timeline-video-thumb">
            {item.video.thumbUrl && <img src={item.video.thumbUrl} alt="" loading="lazy" />}
            <span className="timeline-video-play" aria-hidden="true" />
            <span className="vt-duration">{formatDuration(item.video.duration)}</span>
          </span>
          <b>{item.video.title}</b>
          {item.video.snippet && <span className="muted">{item.video.snippet}</span>}
        </Link>
      ) : null
    case 'recipe':
      return item.recipe ? (
        <Link to={recipeHref(item.recipe)} className="timeline-recipe">
          {item.recipe.photoUrl && <img src={item.recipe.photoUrl} alt="" loading="lazy" />}
          <span>
            <b>{item.recipe.title}</b>
            <span className="muted">
              <FarmIcon name="clock" /> {formatMinutes(item.recipe.minutes)} · {item.recipe.servings} {item.recipe.servings === 1 ? 'persoon' : 'personen'}
            </span>
            {item.recipe.intro && <span className="timeline-recipe-intro">{item.recipe.intro}</span>}
          </span>
        </Link>
      ) : null
    case 'blog':
      return item.blog ? (
        <Link to={blogHref(item.blog.id)} className="timeline-recipe timeline-blog">
          {item.blog.imageUrl && <img src={item.blog.imageUrl} alt="" loading="lazy" />}
          <span>
            <b>{item.blog.title}</b>
            <span className="timeline-recipe-intro">{withSmileys(item.blog.snippet)}</span>
            <span className="muted">Lees verder »</span>
          </span>
        </Link>
      ) : null
    case 'review':
      return item.review ? (
        <Link to={`${mediaHref(item.review.item)}?recensie=${item.review.id}`} className="timeline-recipe timeline-review">
          <span className="timeline-review-cover">
            <MediaFace item={item.review.item} size={0.85} height={96} />
          </span>
          <span>
            <b>{item.review.item.title}</b>
            <span className="muted">{[item.review.item.creator, MEDIA_KINDS[item.review.item.kind].one].filter(Boolean).join(' · ')}</span>
            <Stars rating={item.review.rating} />
            {item.review.text && <span className="timeline-recipe-intro">{item.review.text}</span>}
          </span>
        </Link>
      ) : null
  }
}

/** A song on the timeline: play it right here (in the player bar), or go to the band. */
function TrackCard({ track }: { track: MusicTrack }) {
  const now = useNowPlaying()
  const on = now.id === track.id && now.playing
  return (
    <div className="timeline-recipe timeline-track">
      <button type="button" className="mu-play" onClick={() => player.play([track], 0)} aria-label={on ? `${track.title} pauzeren` : `${track.title} afspelen`}>
        <Cover track={track} size={72} />
        <span className="mu-play-icon">
          <FarmIcon name={on ? 'control_pause' : 'control_play'} size={24} />
        </span>
      </button>
      <span>
        <b>{track.title}</b>
        <span className="muted">
          <Link to={`/muziek/${track.artist.slug}`}>{track.artist.name}</Link> · {MUSIC_GENRES[track.genre].name} · {formatTrackTime(track.duration)}
        </span>
        {track.description && <span className="timeline-recipe-intro">{track.description}</span>}
      </span>
    </div>
  )
}

/** How the Overzicht shows its items: as now, smaller, side by side, or one line each. */
export type TimelineView = 'normaal' | 'compact' | 'raster' | 'lijst'

/** A small picture for the one-line view, when the item has one. */
function thumbOf(item: TimelineItem): string | null {
  switch (item.type) {
    case 'status':
      return item.status?.photos[0]?.url ?? item.status?.glitter?.url ?? null
    case 'photo':
    case 'photography':
      return item.photo?.url ?? null
    case 'avatar':
      return item.actor.avatarUrl
    case 'video':
      return item.video?.thumbUrl ?? null
    case 'recipe':
      return item.recipe?.photoUrl ?? null
    case 'blog':
      return item.blog?.imageUrl ?? null
    case 'kudde_join':
      return item.kudde?.imageUrl ?? null
    default:
      return null
  }
}

/** The text of the item, for the one-line view. */
function snippetOf(item: TimelineItem): string | null {
  switch (item.type) {
    case 'status':
      return item.status?.text ?? null
    case 'knuffel':
      return item.knuffel?.text ?? null
    case 'photo':
    case 'photography':
      return item.photo?.caption || null
    case 'video':
      return item.video?.title ?? null
    case 'recipe':
      return item.recipe?.title ?? null
    case 'blog':
      return item.blog?.title ?? null
    case 'track':
      return item.track?.title ?? null
    case 'review':
      return item.review?.text || item.review?.item.title || null
    default:
      return null
  }
}

/** One item on the timeline. WieWatWaars take on the author's profile design. */
export function TimelineCard({ item, view = 'normaal' }: { item: TimelineItem; view?: TimelineView }) {
  const queryClient = useQueryClient()
  // The one-line view opens an item in place, to read and react
  const [expanded, setExpanded] = useState(false)
  const line = view === 'lijst' && !expanded
  const siteDark = useSiteDark()
  // A Kudde's WieWatWaar isn't in the poster's own profile design
  const skin = item.type === 'status' && !item.status?.kudde ? resolveSkinFor(item.actor.skin, item.actor.profileColors, siteDark) : undefined

  const remove = useMutation({
    mutationFn: () =>
      item.type === 'status'
        ? api<void>(`/statuses/${item.status!.id}`, { method: 'DELETE' })
        : api<void>(`/photos/${item.photo!.id}`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.allTimeline }),
        queryClient.invalidateQueries({ queryKey: keys.allStatuses }),
        queryClient.invalidateQueries({ queryKey: ['profile', item.actor.username] }),
        queryClient.invalidateQueries({ queryKey: keys.recentPhotos }),
      ]),
  })
  if (remove.isSuccess) return null
  const thumb = line ? thumbOf(item) : null
  const snippet = line ? snippetOf(item) : null

  return (
    <article
      className={`timeline-card${skin && !line ? ' skinned' : ''}${line ? ' line' : ''}`}
      // The whole design comes along, so the card body matches the author's profile
      style={skin && !line ? ({ ...skinVars(skin), '--card-bg': skin.background, color: 'var(--text)' } as CSSProperties) : undefined}
    >
      <header className="timeline-card-hdr">
        {item.status?.kudde ? (
          <KuddeAvatar kudde={item.status.kudde} size={view === 'normaal' ? 50 : 36} />
        ) : (
          <Avatar user={item.actor} size={view === 'normaal' ? 'small' : 'tiny'} />
        )}
        <div className="timeline-card-title">
          <p>{headline(item)}</p>
          {snippet && (
            <p className="timeline-snippet">
              <RichText text={snippet.replace(/\s+/g, ' ')} />
            </p>
          )}
          <span className="date">
            {formatTime(item.createdAt)}
            {item.status?.visibility === 'vrienden' && (
              <>
                {' · '}
                <FarmIcon name="group" /> alleen vrienden
              </>
            )}
          </span>
        </div>
        {thumb && <img className="timeline-thumb" src={thumb} alt="" loading="lazy" />}
        {view === 'lijst' && (
          <button type="button" className="timeline-menu timeline-expand" aria-expanded={expanded} title={expanded ? 'Inklappen' : 'Bekijken'} onClick={() => setExpanded((e) => !e)}>
            <FarmIcon name={expanded ? 'arrow_up' : 'arrow_down'} />
          </button>
        )}
        {item.canDelete && (
          <Dropdown align="right" buttonClassName="timeline-menu" title="Opties" label={<span aria-hidden="true">•••</span>}>
            {(close) => (
              <button
                type="button"
                className="dropdown-item"
                disabled={remove.isPending}
                onClick={() => {
                  close()
                  if (confirm(item.type === 'status' ? 'Deze WieWatWaar verwijderen?' : 'Deze foto verwijderen?')) remove.mutate()
                }}
              >
                <FarmIcon name="bin" /> Verwijderen
              </button>
            )}
          </Dropdown>
        )}
      </header>
      {!line && (
        <div className="timeline-card-body">
          <Content item={item} />
          <SocialBar social={item} folded={view === 'compact' || view === 'raster'} />
        </div>
      )}
    </article>
  )
}
