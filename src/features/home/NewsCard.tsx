import { Link } from 'react-router-dom'
import type { NewsItem } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { formatLongDate } from '../../lib/time'
import './NewsCard.css'

const today = () => new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

/**
 * "De Kuddes Courant": the news as a little newspaper, with a masthead and the
 * date, the newest post as the front page (with a small picture if it has
 * one) and older headlines under "Ook in deze editie". `wide`: front page and
 * headlines next to each other, for the visitors' home.
 */
export function NewsCard({ news, wide = false }: { news: NewsItem[]; wide?: boolean }) {
  const [top, ...older] = news
  return (
    <Box
      title="De Kuddes Courant"
      icon="newspaper"
      className={wide ? 'news-box courant wide' : 'news-box courant'}
      actions={
        <Link to="/nieuws" className="box-tab-links">
          Archief
        </Link>
      }
    >
      <p className="courant-dateline">
        <span>{today()}</span>
        <span>Gratis &middot; voor alle leden</span>
      </p>
      <div className="news-box-body">
        {!top ? (
          <p className="empty">De drukpers staat nog stil: nog geen nieuws.</p>
        ) : (
          <article className="news-top">
            {top.bannerUrl && (
              <Link to={`/nieuws/${top.slug}`} className="news-thumb" aria-hidden="true" tabIndex={-1}>
                <img src={top.bannerUrl} alt="" loading="lazy" />
              </Link>
            )}
            <div className="news-top-text">
              <span className="courant-rubric">{top.label}</span>
              <h3>
                <Link to={`/nieuws/${top.slug}`}>{top.title}</Link>
              </h3>
              <p>{top.summary}</p>
              <div className="news-top-ftr">
                <span className="muted">{formatLongDate(top.date)}</span>
                {top.respectCount > 0 && (
                  <span className="news-card-respect" title={`${top.respectCount}× respect`}>
                    <FarmIcon name="star" /> {top.respectCount}
                  </span>
                )}
                <Link to={`/nieuws/${top.slug}`} className="news-more">
                  Lees het hele stuk
                </Link>
              </div>
            </div>
          </article>
        )}

        {older.length > 0 && (
          <div className="news-side">
            <h4 className="courant-also">Ook in deze editie</h4>
            <ul className="news-older">
              {older.slice(0, wide ? 4 : 3).map((n) => (
                <li key={n.slug}>
                  <Link to={`/nieuws/${n.slug}`}>
                    <b>{n.title}</b>
                    <span>
                      {n.label} · {formatLongDate(n.date)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Box>
  )
}
