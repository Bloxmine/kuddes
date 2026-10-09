import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import type { NewsDetail } from '../../shared/api'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { FarmIcon } from '../components/ui/FarmIcon'
import { ForumBody } from '../features/forum/ForumBody'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { keys, useHome, useNews } from '../lib/queries'
import { formatLongDate } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/forum/Forum.css'
import '../components/social/SocialBar.css'
import '../features/home/NewsCard.css'
import './NewsPage.css'
import { ShareWithFriends } from '../features/share/ShareWithFriends'

export function NewsListPage() {
  const { data: home } = useHome()
  usePageTitle('Nieuws - Kuddes')
  return (
    <main className="page page-con">
      <h1>Nieuws</h1>
      <br />
      <Box title="Nieuws & updates" icon="newspaper">
        {home && home.news.length === 0 && <p className="empty">Nog geen nieuws.</p>}
        <ul className="news-list">
          {home?.news.map((n) => (
            <li key={n.slug}>
              <Link to={`/nieuws/${n.slug}`} className="news-list-item">
                {n.bannerUrl ? <img src={n.bannerUrl} alt="" loading="lazy" /> : <span className="news-list-icon"><FarmIcon name="newspaper" size={32} /></span>}
                <span className="news-list-text">
                  <span className="news-label">{n.label}</span>
                  <b>{n.title}</b>
                  {n.summary && <span>{n.summary}</span>}
                  <span className="muted">
                    {formatLongDate(n.date)}
                    {n.respectCount > 0 && (
                      <>
                        {' · '}
                        <FarmIcon name="star" /> {n.respectCount} respect
                      </>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Box>
    </main>
  )
}

/** Respect for the post: the button, how many, and the faces of who gave it. */
function NewsRespect({ item }: { item: NewsDetail }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => api<NewsDetail>(`/news/${encodeURIComponent(item.slug)}/respect`, { method: item.respected ? 'DELETE' : 'POST' }),
    onSuccess: (next) => queryClient.setQueryData(keys.news(item.slug), next),
  })
  return (
    <div className="news-respect">
      {user ? (
        <button
          type="button"
          className={item.respected ? 'social-respect respected' : 'social-respect'}
          disabled={toggle.isPending}
          aria-pressed={item.respected}
          title={item.respected ? 'Respect intrekken' : 'Geef respect'}
          onClick={() => toggle.mutate()}
        >
          <FarmIcon name="star" /> Respect
        </button>
      ) : (
        <Link to={`/inloggen?next=${encodeURIComponent(`/nieuws/${item.slug}`)}`} className="social-respect">
          <FarmIcon name="star" /> Log in voor respect
        </Link>
      )}
      <span className="news-respect-count">
        {item.respectCount === 0 ? 'Nog geen respect. Jij als eerste?' : item.respectCount === 1 ? '1 lid geeft respect' : `${item.respectCount} leden geven respect`}
      </span>
      {item.respecters.length > 0 && (
        <ul className="news-respecters" aria-label="Gaven respect">
          {item.respecters.map((u) => (
            <li key={u.id} title={u.nickname}>
              <Link to={`/profiel/${u.username}`}>
                <Avatar user={u} size="tiny" static />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {toggle.isError && <p className="form-error">{errorMessage(toggle.error)}</p>}
    </div>
  )
}

export function NewsPage() {
  const { slug = '' } = useParams()
  const { data: item, isLoading } = useNews(slug)
  usePageTitle(item ? `${item.title} - Nieuws - Kuddes` : 'Nieuws - Kuddes')

  if (isLoading) return <main className="page page-con muted">Laden…</main>
  return (
    <main className="page page-con">
      <Box
        title="De Kuddes Courant"
        icon="newspaper"
        className="courant"
        actions={
          <Link to="/nieuws" className="box-tab-links">
            Archief
          </Link>
        }
      >
        {item ? (
          // Laid out like a page from the newspaper on Home (NewsCard.tsx): the dateline, a rubric, the headline, the lede, the photo and the text in columns
          <article className="news-article courant-article">
            <p className="courant-dateline">
              <span>{formatLongDate(item.date)}</span>
              <span>Gratis &middot; voor alle leden</span>
            </p>
            <header className="courant-head">
              <span className="courant-rubric">{item.label}</span>
              <h1>{item.title}</h1>
              {item.summary && <p className="courant-lede">{item.summary}</p>}
              {item.author && (
                <p className="courant-byline">
                  Door <Link to={`/profiel/${item.author.username}`}>{item.author.nickname}</Link>
                </p>
              )}
            </header>
            {item.bannerUrl && (
              <figure className="courant-photo">
                <img src={item.bannerUrl} alt="" />
              </figure>
            )}
            {/* Two columns only pay off for a longer piece */}
            <div className={item.body.length > 1200 ? 'courant-text columns' : 'courant-text'}>
              <ForumBody body={item.body} news />
            </div>
            <footer className="courant-end">
              <NewsRespect item={item} />
              <p>
                <ShareWithFriends path={`/nieuws/${item.slug}`} />
              </p>
              <Link to="/nieuws">← Terug naar het archief</Link>
            </footer>
          </article>
        ) : (
          <p>
            Dit nieuwsbericht bestaat niet. <Link to="/nieuws">Bekijk al het nieuws</Link>
          </p>
        )}
      </Box>
    </main>
  )
}
