import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { HomeData } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Tile, TileGrid } from '../../components/ui/TileGrid'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { seededGradient } from '../../lib/placeholder'
import { SUGGESTION_STATUSES } from '../../../shared/suggestions'
import { KUDDE_CATEGORIES } from '../../../shared/kuddes'
import { formatDuration } from '../../../shared/videos'
import { useKuddes, useRecentPhotos, useSuggestions, useVideoList } from '../../lib/queries'
import { BlogCard } from '../blogs/BlogCard'
import { useBlogs } from '../blogs/blogQueries'
import { videoHref } from '../video/videoLinks'
import { withSmileys } from '../../lib/smileys'

/** "Nieuw op Kuddes": the newest members in one row of photos, with a quick way to say hello. */
export function NewestMembers({ members }: { members: HomeData['newest'] }) {
  return (
    <Box title="Nieuw op Kuddes" icon="user_add" className="home-members" actions={<Link to="/leden">Iedereen</Link>}>
      <span id="leden" />
      {members.length === 0 ? (
        <p className="empty">Nog niemand. Wees de eerste!</p>
      ) : (
        <>
          <p className="newcomers-intro">Zeg hoi tegen wie er net bij is gekomen:</p>
          <ul className="newcomers">
            {members.slice(0, 8).map((m) => (
              <li key={m.id}>
                <Link to={`/profiel/${m.username}`} className="newcomer-face" title={m.name}>
                  {m.avatarUrl ? <img src={m.avatarUrl} alt="" loading="lazy" /> : <span style={{ background: seededGradient(m.username) }}>{m.name.slice(0, 1)}</span>}
                </Link>
                <Link to={`/profiel/${m.username}`} className="newcomer-name">
                  {m.nickname}
                </Link>
                <span className="muted">{m.age !== null ? `${m.age} jaar` : 'nieuw'}</span>
                <Link to={`/profiel/${m.username}?tab=knuffels`} className="newcomer-hi">
                  Zeg hoi
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Box>
  )
}

function PhotosTab() {
  const { data: photos = [], isLoading } = useRecentPhotos()
  if (isLoading) return <p className="muted">Foto's laden…</p>
  if (!photos.length) return <p className="empty">Nog geen foto's. Upload er een via je profiel!</p>
  return (
    <TileGrid
      items={photos}
      keyOf={(p) => p.id}
      render={(p) => (
        <Tile
          to={`/profiel/${p.user.username}?tab=fotos&foto=${p.id}`}
          imageUrl={p.url}
          fallback={p.user.name}
          title={p.caption ? withSmileys(p.caption) : 'Foto'}
          subtitle={p.user.name}
        />
      )}
    />
  )
}

function VideosTab() {
  const { data, isLoading } = useVideoList({ sort: 'nieuwste', limit: 6 })
  const videos = data?.pages[0]?.items ?? []
  if (isLoading) return <p className="muted">Video's laden…</p>
  if (!videos.length) return <p className="empty">Nog geen video's. <Link to="/video/uploaden">Upload de eerste!</Link></p>
  return (
    <TileGrid
      items={videos}
      keyOf={(v) => v.id}
      render={(v) => <Tile wide to={videoHref(v.id)} imageUrl={v.thumbUrl} fallback={v.title} title={v.title} subtitle={`${v.user.nickname} · ${formatDuration(v.duration)}`} />}
    />
  )
}

function BlogsTab() {
  const { data, isLoading } = useBlogs(null, null, 4)
  if (isLoading) return <p className="muted">Blogs laden…</p>
  if (!data?.items.length)
    return (
      <p className="empty">
        Nog geen blogs. <Link to="/blogs/nieuw">Schrijf jij de eerste?</Link>
      </p>
    )
  return (
    <ul className="blog-list">
      {data.items.map((b) => (
        <li key={b.id}>
          <BlogCard blog={b} />
        </li>
      ))}
    </ul>
  )
}

/** Foto's, Video's and Blogs in one box with tabs, like on the old Hyves front page. */
export function MediaTabsBox() {
  const more = (links: [string, string][]) => (
    <p className="media-tabs-more">
      {links.map(([to, label]) => (
        <Link key={to} to={to}>
          › {label}
        </Link>
      ))}
    </p>
  )
  return (
    <div className="media-tabs-box">
      <span id="fotos" />
      <Box
        tabs={[
          { key: 'fotos', label: "Foto's", content: <><PhotosTab />{more([['/tijdlijn', 'Meer foto\'s van je vrienden']])}</> },
          { key: 'videos', label: "Video's", content: <><VideosTab />{more([['/video', 'Kuddes Video'], ['/video/uploaden', 'Upload een video']])}</> },
          { key: 'blogs', label: 'Blogs', content: <><BlogsTab />{more([['/blogs', 'Meer blogs'], ['/blogs/nieuw', 'Schrijf een blog']])}</> },
        ]}
      />
    </div>
  )
}

/** "Ideeënbus": the latest ideas from members, with where they stand. */
export function SuggestionsBox() {
  const { data: suggestions = [] } = useSuggestions(3)
  return (
    <Box title="Ideeënbus" icon="lightbulb" className="suggestions-box" actions={suggestions.length > 0 && <Link to="/suggesties">Alle ideeën</Link>}>
      {suggestions.length === 0 ? (
        <p className="empty">De bus is nog leeg. Wat zou Kuddes leuker maken?</p>
      ) : (
        <ul className="idea-list">
          {suggestions.map((s) => (
            <li key={s.id}>
              <Link to={`/suggesties#suggestie-${s.id}`}>
                <FarmIcon name={SUGGESTION_STATUSES[s.status].icon} />
                <span>
                  <b>{s.title}</b>
                  <small>{s.status === 'nieuw' ? (s.user ? `idee van ${s.user.nickname}` : 'nieuw idee') : SUGGESTION_STATUSES[s.status].name}</small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/suggesties" className="btn idea-add">
        <FarmIcon name="add" /> Stop een idee in de bus
      </Link>
    </Box>
  )
}

/** Kuddes to join: the biggest or the newest, as a list with what kind of Kudde each is. */
export function KuddesBox() {
  const [sort, setSort] = useState<'populair' | 'nieuwste'>('populair')
  const { data: kuddes = [], isLoading } = useKuddes(sort, 5)

  return (
    <Box title="Kuddes" icon="tag_blue" className="kudde-list-box">
      <div className="kudde-sort" role="radiogroup" aria-label="Welke Kuddes">
        {(
          [
            ['populair', 'De grootste'],
            ['nieuwste', 'Net begonnen'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="radio" aria-checked={sort === key} className={sort === key ? 'current' : undefined} onClick={() => setSort(key)}>
            {label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : kuddes.length === 0 ? (
        <p className="empty">
          Nog geen Kuddes. <Link to="/kuddes/nieuw">Start de eerste!</Link>
        </p>
      ) : (
        <ol className="kudde-list">
          {kuddes.map((k) => (
            <li key={k.slug}>
              <Link to={`/kuddes/${k.slug}`}>
                <span className="kudde-list-pic" style={k.imageUrl ? { backgroundImage: `url(${k.imageUrl})` } : { background: seededGradient(k.name) }} />
                <span className="kudde-list-text">
                  <b>{k.name}</b>
                  <small>
                    <FarmIcon name={KUDDE_CATEGORIES[k.category]?.icon ?? 'group'} /> {KUDDE_CATEGORIES[k.category]?.singular ?? 'Kudde'} · {k.memberCount} {k.memberCount === 1 ? 'lid' : 'leden'}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="kudde-list-more">
        <Link to="/kuddes">Ontdek meer Kuddes</Link>
        <span aria-hidden="true">·</span>
        <Link to="/kuddes/nieuw">Begin er zelf een</Link>
      </p>
    </Box>
  )
}
