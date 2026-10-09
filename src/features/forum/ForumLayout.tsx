import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import type { ForumThreadSummary } from '../../../shared/api'
import { threadHref, type ForumRole } from '../../../shared/forum'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { useAuth } from '../../lib/auth'
import { useChatChannels, useForumIndex } from '../../lib/queries'
import { formatDate, formatTime } from '../../lib/time'
import './Forum.css'

type Crumb = { label: string; to?: string }

/**
 * Kuddes Forum's own chrome, like a 2009 message board: a banner with the
 * forum name, a bar with the main links and breadcrumbs above every page.
 */
export function ForumLayout({ crumbs = [], children }: { crumbs?: Crumb[]; children: ReactNode }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: index } = useForumIndex()
  const { data: channels = [] } = useChatChannels()
  const [q, setQ] = useState('')
  const chatting = channels.reduce((n, c) => n + c.online, 0)

  return (
    <main className="page page-con fm-page">
      <header className="fm-banner">
        <Link to="/forum" className="fm-logo">
          <FarmIcon name="comment" size={32} />
          <span>
            <b>Kuddes Forum</b>
            <small>Praat mee over alles</small>
          </span>
        </Link>
        <form
          className="fm-search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            if (q.trim()) navigate(`/forum/zoeken?q=${encodeURIComponent(q.trim())}`)
          }}
        >
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek in het forum" aria-label="Zoek in het forum" />
          <button type="submit" className="btn">
            Zoeken
          </button>
        </form>
      </header>
      <nav className="fm-nav" aria-label="Forum">
        <NavLink to="/forum" end>
          <FarmIcon name="house" /> Forumoverzicht
        </NavLink>
        <NavLink to="/forum/zoeken">
          <FarmIcon name="magnifier" /> Zoeken
        </NavLink>
        <NavLink to="/forum/chat">
          <FarmIcon name="transmit" /> Chat {chatting > 0 && <span className="badge farm-badge fm-badge-chat">{chatting}</span>}
        </NavLink>
        {user && (
          <NavLink to={`/forum/lid/${user.username}`}>
            <FarmIcon name="vcard" /> Mijn forumprofiel
          </NavLink>
        )}
        {index?.viewer?.role === 'admin' && (
          <NavLink to="/forum/beheer">
            <FarmIcon name="cog" /> Beheer
          </NavLink>
        )}
        <span className="fm-nav-user">
          {user ? (
            <>
              Ingelogd als <Link to={`/forum/lid/${user.username}`}>{user.nickname}</Link>
              {index?.viewer?.role && <RoleBadge role={index.viewer.role} />}
            </>
          ) : (
            <>
              <Link to="/inloggen?next=/forum">Inloggen</Link> · <Link to="/aanmelden">Aanmelden</Link>
            </>
          )}
        </span>
      </nav>
      {index?.viewer?.banned && (
        <p className="form-error fm-banned">
          <FarmIcon name="lock" /> Je bent verbannen van het forum{index.viewer.banned.until ? ` tot ${formatDate(index.viewer.banned.until)}` : ''}. Je kunt meelezen, maar niet
          posten of chatten.{index.viewer.banned.reason && ` Reden: ${index.viewer.banned.reason}`}
        </p>
      )}
      {crumbs.length > 0 && (
        <ol className="fm-crumbs">
          <li>
            <Link to="/forum">Forum</Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}</li>
          ))}
        </ol>
      )}
      <div className="fm-content">{children}</div>
    </main>
  )
}

export function RoleBadge({ role }: { role: ForumRole }) {
  if (!role) return null
  return <span className={`fm-role fm-role-${role}`}>{role === 'admin' ? 'Beheerder' : 'Moderator'}</span>
}

export function SectionIcon({ icon, size = 32 }: { icon: string; size?: number }) {
  return <FarmIcon name={icon as FarmIconName} size={size} />
}

/** A thread in a list: status icon, title with tags, starter, replies/views and the last post. */
export function ThreadRow({ thread, showSection }: { thread: ForumThreadSummary; showSection?: boolean }) {
  const hot = thread.replies >= 20 || thread.views >= 250
  // The icon its starter picked; a closed topic keeps its lock
  const icon = (thread.locked ? 'lock' : (thread.icon ?? (thread.pinned ? 'star' : hot ? 'lightbulb' : 'comment'))) as FarmIconName
  return (
    <tr className={thread.pinned ? 'fm-thread pinned' : 'fm-thread'}>
      <td className="fm-thread-icon">
        <FarmIcon name={icon} size={20} label={thread.locked ? 'Gesloten' : thread.icon ? 'Onderwerp' : thread.pinned ? 'Vastgezet' : hot ? 'Populair' : 'Onderwerp'} />
      </td>
      <td>
        {thread.pinned && <span className="fm-flag">Vastgezet:</span>}{' '}
        <Link to={threadHref(thread.section.slug, thread.id, thread.title)} className="fm-thread-title">
          {thread.title}
        </Link>
        {thread.hasPoll && <FarmIcon name="chart_bar" label="Met poll" className="fm-has-poll" />}
        {thread.tags.length > 0 && (
          <span className="fm-tags">
            {thread.tags.map((t) => (
              <Link key={t} to={`/forum/tag/${encodeURIComponent(t)}`} className="fm-tag">
                {t}
              </Link>
            ))}
          </span>
        )}
        <span className="fm-thread-by muted">
          door {thread.starter ? <Link to={`/forum/lid/${thread.starter.username}`}>{thread.starter.nickname}</Link> : 'onbekend'}
          {showSection && (
            <>
              {' '}
              in <Link to={`/forum/${thread.section.slug}`}>{thread.section.name}</Link>
            </>
          )}
        </span>
      </td>
      <td className="fm-num">{thread.replies.toLocaleString('nl-NL')}</td>
      <td className="fm-num">{thread.views.toLocaleString('nl-NL')}</td>
      <td className="fm-last">
        <span>{formatTime(thread.lastPostAt)}</span>
        {thread.lastPostUser && (
          <span>
            door <Link to={`/forum/lid/${thread.lastPostUser.username}`}>{thread.lastPostUser.nickname}</Link>
          </span>
        )}
      </td>
    </tr>
  )
}

export function ThreadTable({ threads, showSection, empty }: { threads: ForumThreadSummary[]; showSection?: boolean; empty: ReactNode }) {
  if (!threads.length) return <p className="empty fm-empty">{empty}</p>
  return (
    <table className="fm-table">
      <thead>
        <tr>
          <th colSpan={2}>Onderwerp</th>
          <th className="fm-num">Reacties</th>
          <th className="fm-num">Bekeken</th>
          <th className="fm-last">Laatste bericht</th>
        </tr>
      </thead>
      <tbody>
        {threads.map((t) => (
          <ThreadRow key={t.id} thread={t} showSection={showSection} />
        ))}
      </tbody>
    </table>
  )
}

/** « 1 2 3 … » page links. */
export function Pagination({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b)
  return (
    <nav className="fm-pages" aria-label="Pagina's">
      <span className="muted">Pagina {page} van {pages}</span>
      {page > 1 && <Link to={href(page - 1)}>« Vorige</Link>}
      {shown.map((p, i) => (
        <span key={p}>
          {i > 0 && p - shown[i - 1] > 1 && <span className="muted">…</span>}
          {p === page ? <b>{p}</b> : <Link to={href(p)}>{p}</Link>}
        </span>
      ))}
      {page < pages && <Link to={href(page + 1)}>Volgende »</Link>}
    </nav>
  )
}
