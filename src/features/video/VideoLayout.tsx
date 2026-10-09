import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { useAuth } from '../../lib/auth'
import './Video.css'

/**
 * Kuddes Video's own chrome, after 2009 YouTube: the logo with the tube,
 * a big search bar, the yellow Uploaden button and tabs underneath.
 */
export function VideoLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  return (
    <main className="page page-con vt-page">
      <header className="vt-masthead">
        <Link to="/video" className="vt-logo" aria-label="Kuddes Video, home">
          <span className="vt-logo-name">Kuddes</span>
          <span className="vt-logo-tube">Video</span>
          <span className="vt-logo-slogan">Zend jezelf uit</span>
        </Link>
        <form
          className="vt-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(q.trim() ? `/video/zoeken?q=${encodeURIComponent(q.trim())}` : '/video/zoeken')
          }}
        >
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek video's" aria-label="Zoek video's" />
          <button type="submit">Zoeken</button>
        </form>
        <div className="vt-account">
          {user ? (
            <>
              <Link to={`/video/kanaal/${user.username}`}>{user.nickname}</Link>
              <span aria-hidden="true">|</span>
              <Link to={`/video/kanaal/${user.username}?tab=favorieten`}>Favorieten</Link>
            </>
          ) : (
            <>
              <Link to="/aanmelden">Aanmelden</Link>
              <span aria-hidden="true">|</span>
              <Link to="/inloggen?next=/video">Inloggen</Link>
            </>
          )}
          <Link to="/video/uploaden" className="vt-upload-btn">
            <FarmIcon name="film_add" /> Uploaden
          </Link>
        </div>
      </header>
      <nav className="vt-tabs" aria-label="Kuddes Video">
        <NavLink to="/video" end>
          Home
        </NavLink>
        <NavLink to="/video/zoeken" end>
          Video's
        </NavLink>
        {user && <NavLink to={`/video/kanaal/${user.username}`}>Mijn kanaal</NavLink>}
        <NavLink to="/video/uploaden">Uploaden</NavLink>
      </nav>
      <div className="vt-content">{children}</div>
    </main>
  )
}

/** A 2009-style module: grey gradient header with a title and optional links. */
export function VideoModule({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={['vt-module', className].filter(Boolean).join(' ')}>
      <header>
        <h2>{title}</h2>
        {actions && <span className="vt-module-actions">{actions}</span>}
      </header>
      <div className="vt-module-body">{children}</div>
    </section>
  )
}

/** Opens a collapsed block of text ("meer info"). */
export function MoreText({ text, lines = 3, children }: { text: string; lines?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 180 || text.split('\n').length > lines
  return (
    <div className={open || !long ? 'vt-more open' : 'vt-more'} style={{ '--lines': lines } as React.CSSProperties}>
      <div className="vt-more-text">{children}</div>
      {long && (
        <button type="button" className="link-button" onClick={() => setOpen((o) => !o)}>
          {open ? '(minder info)' : '(meer info)'}
        </button>
      )}
    </div>
  )
}
