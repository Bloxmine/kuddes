import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { BlogCard } from '../../features/blogs/BlogCard'
import { useBlogs } from '../../features/blogs/blogQueries'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/blogs/Blogs.css'

/** /blogs: the newest blogs of everyone; /blogs?van=lotte: Lotte's. */
export function BlogsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const author = params.get('van')
  return <BlogList key={author ?? ''} author={author} mine={!!user && author === user.username} onAuthor={(van) => setParams(van ? { van } : {})} />
}

function BlogList({ author, mine, onAuthor }: { author: string | null; mine: boolean; onAuthor: (username: string | null) => void }) {
  const { user } = useAuth()
  // Cursors of the pages we went through, so "Nieuwere" can go back
  const [cursors, setCursors] = useState<(number | null)[]>([null])
  const before = cursors[cursors.length - 1]
  const { data, isLoading, error } = useBlogs(author, before, 12)
  const writer = data?.items[0]?.author
  const name = mine ? 'Mijn blogs' : author ? `Blogs van ${writer?.nickname ?? author}` : 'Nieuwste blogs'
  usePageTitle(`${name} - Kuddes`)

  return (
    <main className="page page-con blogs-page">
      <Box
        title={name}
        icon="book_open"
        actions={
          <span className="box-tab-links">
            <button type="button" className={!author ? 'current' : undefined} onClick={() => onAuthor(null)}>
              Nieuwste
            </button>
            {' | '}
            <button type="button" className={mine ? 'current' : undefined} onClick={() => user && onAuthor(user.username)}>
              Mijn blogs
            </button>
          </span>
        }
      >
        {isLoading ? (
          <p className="muted">Blogs laden…</p>
        ) : error ? (
          <p className="form-error">{errorMessage(error)}</p>
        ) : !data?.items.length ? (
          <p className="empty">{mine ? 'Je hebt nog geen blogs geschreven.' : author ? 'Nog geen blogs (die jij mag lezen).' : 'Nog niemand heeft een blog geschreven. Jij de eerste?'}</p>
        ) : (
          <ul className="blog-list">
            {data.items.map((b) => (
              <li key={b.id}>
                <BlogCard blog={b} />
              </li>
            ))}
          </ul>
        )}
        <div className="blogs-pager">
          <span>
            {cursors.length > 1 && (
              <button type="button" className="link-button" onClick={() => setCursors((c) => c.slice(0, -1))}>
                « Nieuwere blogs
              </button>
            )}
          </span>
          <span>
            {data?.nextCursor && (
              <button type="button" className="link-button" onClick={() => setCursors((c) => [...c, data.nextCursor])}>
                Oudere blogs »
              </button>
            )}
          </span>
        </div>
      </Box>

      <aside className="sticky-side">
        <Box title="Zelf bloggen" icon="pencil">
          <p className="blogs-intro">Iets meegemaakt, een mening of een verhaal? Schrijf er een blog over, met foto's, filmpjes en smileys. Je vrienden zien hem op hun overzicht.</p>
          <Link to="/blogs/nieuw" className="btn btn-cta blog-write">
            <FarmIcon name="pencil" /> Schrijf een blog
          </Link>
        </Box>
      </aside>
    </main>
  )
}
