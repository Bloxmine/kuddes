import { Link } from 'react-router-dom'
import { VIDEO_CATEGORIES, type VideoCategory } from '../../../shared/videos'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { VideoLayout, VideoModule } from '../../features/video/VideoLayout'
import { VideoTile } from '../../features/video/VideoParts'
import { useAuth } from '../../lib/auth'
import { useChannelVideos, useRecommendedVideos, useVideoCategories, useVideoList, type VideoListQuery } from '../../lib/queries'
import { usePageTitle } from '../../lib/usePageTitle'

function TileModule({ title, query, more }: { title: string; query: VideoListQuery; more: string }) {
  const { data, isLoading } = useVideoList({ limit: 8, ...query })
  const videos = data?.pages[0]?.items ?? []
  return (
    <VideoModule title={title} actions={<Link to={more}>Meer bekijken »</Link>}>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : videos.length === 0 ? (
        <p className="empty">Nog geen video's. <Link to="/video/uploaden">Upload de eerste!</Link></p>
      ) : (
        <ul className="vt-grid">
          {videos.map((v) => (
            <VideoTile key={v.id} video={v} />
          ))}
        </ul>
      )}
    </VideoModule>
  )
}

function Recommended() {
  const { data: videos = [] } = useRecommendedVideos(8)
  if (videos.length === 0) return null
  return (
    <VideoModule title="Aanbevolen voor jou" className="vt-recommended">
      <ul className="vt-grid">
        {videos.map((v) => (
          <VideoTile key={v.id} video={v} />
        ))}
      </ul>
    </VideoModule>
  )
}

function AccountBox() {
  const { user } = useAuth()
  const { data: mine = [] } = useChannelVideos(user?.username ?? '')
  if (!user) {
    return (
      <VideoModule title="Wat is Kuddes Video?">
        <p className="vt-pitch">
          Deel je eigen video's met je vrienden en de rest van Kuddes. Geef sterren, reageer en zet je favorieten op je profiel.
        </p>
        <Link to="/aanmelden" className="btn btn-cta vt-wide">
          Meld je gratis aan
        </Link>
        <p className="muted vt-pitch-small">
          Al lid? <Link to="/inloggen?next=/video">Log in</Link>
        </p>
      </VideoModule>
    )
  }
  return (
    <VideoModule title={`Hallo, ${user.nickname}`}>
      <div className="vt-account-box">
        <Avatar user={user} size="small" static />
        <ul>
          <li>
            <Link to={`/video/kanaal/${user.username}`}>
              <FarmIcon name="television" /> Mijn kanaal ({mine.length})
            </Link>
          </li>
          <li>
            <Link to={`/video/kanaal/${user.username}?tab=favorieten`}>
              <FarmIcon name="heart" /> Favorieten
            </Link>
          </li>
          <li>
            <Link to="/gadgetmarkt?categorie=media">
              <FarmIcon name="plugin" /> Video's op je profiel
            </Link>
          </li>
        </ul>
      </div>
      <Link to="/video/uploaden" className="btn btn-cta vt-wide">
        <FarmIcon name="film_add" /> Video uploaden
      </Link>
    </VideoModule>
  )
}

export function VideoHomePage() {
  const { user } = useAuth()
  const { data: counts } = useVideoCategories()
  usePageTitle('Kuddes Video - Zend jezelf uit')

  return (
    <VideoLayout>
      <div className="vt-cols">
        <div>
          {user && <Recommended />}
          <TileModule title="Video's die nu bekeken worden" query={{ sort: 'nu' }} more="/video/zoeken?sort=nu" />
          <TileModule title="Best beoordeeld" query={{ sort: 'best-beoordeeld' }} more="/video/zoeken?sort=best-beoordeeld" />
          <TileModule title="Meest bekeken" query={{ sort: 'meest-bekeken' }} more="/video/zoeken?sort=meest-bekeken" />
          <TileModule title="Nieuwste video's" query={{ sort: 'nieuwste' }} more="/video/zoeken" />
        </div>
        <aside className="sticky-side">
          <AccountBox />
          <VideoModule title="Categorieën">
            <ul className="vt-categories">
              {(Object.keys(VIDEO_CATEGORIES) as VideoCategory[]).map((k) => (
                <li key={k}>
                  <Link to={`/video/zoeken?categorie=${k}`}>{VIDEO_CATEGORIES[k]}</Link>
                  {counts && <span className="muted"> ({counts[k] ?? 0})</span>}
                </li>
              ))}
            </ul>
          </VideoModule>
        </aside>
      </div>
    </VideoLayout>
  )
}
