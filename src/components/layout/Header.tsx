import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { Icon } from '../ui/Icon'
import { mainMenu, resolveMenuLink } from './menu'
import { ThemePicker } from './ThemePicker'
import { MobileMenu } from './MobileMenu'
import { NotificationBell } from './NotificationBell'
import './Header.css'
import { FarmIcon } from '../ui/FarmIcon'
import { ONLINE_STATUSES, statusIcon } from '../../lib/onlineStatus'

/** The search, under the bar while the magnifier is open; Escape closes it. */
function SearchBar({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  return (
    <form
      className="topbar-search"
      role="search"
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
      onSubmit={(e) => {
        e.preventDefault()
        if (query.trim()) navigate(`/zoeken?q=${encodeURIComponent(query.trim())}`)
        onDone()
      }}
    >
      <Icon name="search" size={18} />
      <input
        type="search"
        // Opening the search puts the cursor in it
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoeken op Kuddes"
        aria-label="Zoeken op Kuddes"
      />
      <button type="submit" className="btn btn-cta" disabled={!query.trim()}>
        Zoek
      </button>
    </form>
  )
}

function MemberMenu({ user, searchButton }: { user: Me; searchButton: ReactNode }) {
  const { logout, setUser, unconfirmed } = useAuth()
  const navigate = useNavigate()
  const setStatus = useMutation({
    mutationFn: (onlineStatus: string) => api<Me>('/me', { method: 'PATCH', body: { onlineStatus } }),
    onSuccess: setUser,
  })

  return (
    <div className="topbar-actions">
      {searchButton}
      {!unconfirmed && (
        <span className="topbar-wide">
          <ThemePicker />
        </span>
      )}
      {/* Not let in yet: no notifications */}
      {user.emailVerified && <NotificationBell user={user} />}

      <Dropdown
        align="right"
        bubble
        buttonClassName="topbar-avatar"
        title={`Jouw menu (${user.onlineStatus})`}
        label={
          <>
            <span className="topbar-avatar-pic">
              <Avatar user={user} size="tiny" static />
              {!unconfirmed && <FarmIcon name={statusIcon(user.onlineStatus)} className="topbar-avatar-status" />}
            </span>
            <Icon name="chevronDown" size={14} />
          </>
        }
      >
        {(close) => (
          <>
            <div className="dropdown-note">
              Ingelogd als <b>{user.nickname}</b>
            </div>
            {!unconfirmed && (
              <>
                <Link to={`/profiel/${user.username}`} onClick={close}>
                  <FarmIcon name="user" /> Mijn profiel
                </Link>
                <Link to="/vrienden" onClick={close}>
                  <FarmIcon name="group" /> Vrienden
                </Link>
                <Link to="/berichten" onClick={close}>
                  <FarmIcon name="email" /> Berichten
                </Link>
              </>
            )}
            {/* Your online status, as your friends see it */}
            {!unconfirmed && (
              <>
                <div className="dropdown-divider" />
                <div className="dropdown-note">Je status: {user.onlineStatus}</div>
                <div className="topbar-statuses" role="group" aria-label="Je status">
                  {ONLINE_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      className="dropdown-item"
                      aria-pressed={st === user.onlineStatus}
                      title={st}
                      aria-label={st}
                      onClick={() => {
                        setStatus.mutate(st)
                        close()
                      }}
                    >
                      <FarmIcon name={statusIcon(st)} size={24} />
                    </button>
                  ))}
                </div>
                <div className="dropdown-divider" />
              </>
            )}
            <Link to="/instellingen" onClick={close}>
              <FarmIcon name="cog" /> Instellingen
            </Link>
            {user.isAdmin && (
              <Link to="/beheer" onClick={close}>
                <FarmIcon name="award_star_gold_1" /> Beheer
              </Link>
            )}
            <div className="dropdown-divider" />
            <button
              type="button"
              className="dropdown-item"
              onClick={() => {
                close()
                logout.mutate(undefined, { onSuccess: () => navigate('/') })
              }}
            >
              <FarmIcon name="door_out" /> Uitloggen
            </button>
          </>
        )}
      </Dropdown>
    </div>
  )
}

/**
 * On narrower screens the menu row scrolls sideways and its menus hang from
 * the whole bar (Header.css): put the menu under its own tab, kept inside the bar.
 */
function placeMenu(e: { currentTarget: HTMLLIElement }) {
  const li = e.currentTarget
  const bar = li.closest('.catnav')
  if (!bar) return
  const x = li.getBoundingClientRect().left - bar.getBoundingClientRect().left
  // The two-column menus are wider (Header.css)
  const width = li.dataset.wide ? Math.min(532, bar.clientWidth - 12) : 272
  li.style.setProperty('--menu-x', `${Math.max(6, Math.min(x, bar.clientWidth - width))}px`)
}

function CategoryNav() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  // Prefer the menu with a link to exactly this page (e.g. "/tijdlijn"), then one to it with a filter
  const links = (item: (typeof mainMenu)[number]) => item.sections.flatMap((section) => section.links)
  const current =
    pathname === '/'
      ? undefined
      : (mainMenu.find((item) => links(item).some((l) => l.to === pathname)) ??
        mainMenu.find((item) => links(item).some((l) => l.to.split(/[?#]/)[0] === pathname)))

  return (
    <nav className="catnav" aria-label="Hoofdmenu">
      <ul className="catnav-items">
        {mainMenu.map((item) => (
          <li key={item.key} className={item === current ? 'current' : undefined} data-wide={item.sections.length > 2 || undefined} onPointerEnter={placeMenu} onFocus={placeMenu}>
            <Dropdown
              hover
              bubble
              buttonClassName="catnav-title"
              label={
                <>
                  <FarmIcon name={item.icon} />
                  {item.label}
                  <Icon name="chevronDown" size={14} />
                </>
              }
            >
              {(close) => (
                // The bigger menus in two columns, so they don't run off the screen
                <div className={item.sections.length > 2 ? 'mega-menu wide' : 'mega-menu'}>
                  {item.sections.map((section, i) => (
                    <div key={section.title ?? i} className="mega-section">
                      {section.title && <h3>{section.title}</h3>}
                      {section.links.map((link) => (
                        <Link key={link.label} to={resolveMenuLink(link.to, user?.username ?? null)} onClick={close}>
                          <FarmIcon name={link.icon} />
                          <span>{link.label}</span>
                          <Icon name="chevronRight" size={16} className="mega-chevron" />
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Dropdown>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Header() {
  const { user, isLoading } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  // "/" opens the search from anywhere, unless you're typing somewhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || el.closest('input, textarea, select, [contenteditable]')) return
      e.preventDefault()
      setSearchOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const searchButton = (
    <button type="button" className="topbar-icon topbar-search-toggle" title="Zoeken (/)" aria-label="Zoeken" aria-expanded={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
      <Icon name={searchOpen ? 'x' : 'search'} size={20} />
    </button>
  )

  return (
    <header className="site-hdr page">
      <div className="topbar">
        <button type="button" className="topbar-icon topbar-burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
          <Icon name="menu" size={22} />
        </button>
        <Link to="/" className="topbar-logo" title="Kuddes">
          <img src="/kuddes-logo.png" alt="Kuddes" width={112} height={46} />
        </Link>
        <CategoryNav />
        {isLoading ? null : user ? (
          <MemberMenu user={user} searchButton={searchButton} />
        ) : (
          <div className="topbar-actions">
            {searchButton}
            <span className="topbar-wide">
              <ThemePicker />
            </span>
            <Link to="/inloggen" className="btn">
              Inloggen
            </Link>
            <Link to="/aanmelden" className="btn btn-cta">
              Aanmelden
            </Link>
          </div>
        )}
      </div>
      {searchOpen && <SearchBar onDone={closeSearch} />}
      {menuOpen && <MobileMenu onClose={closeMenu} />}
    </header>
  )
}
