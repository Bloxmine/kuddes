import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { ONLINE_STATUSES, statusIcon } from '../../lib/onlineStatus'
import { useInstallPrompt } from '../../lib/pwa'
import { useStats } from '../../lib/queries'
import { Avatar } from '../ui/Avatar'
import { FarmIcon } from '../ui/FarmIcon'
import { Icon } from '../ui/Icon'
import { mainMenu, resolveMenuLink } from './menu'
import { ThemeOptions } from './ThemePicker'
import './MobileMenu.css'

/**
 * The menu on phones: a drawer from the left with everything that's in the
 * category bar, your account and the theme, opened with the ☰ button.
 */
export function MobileMenu({ onClose }: { onClose: () => void }) {
  const { user, logout, setUser } = useAuth()
  const { data: stats } = useStats()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const panel = useRef<HTMLElement>(null)
  const install = useInstallPrompt()
  const [showThemes, setShowThemes] = useState(false)
  const setStatus = useMutation({
    mutationFn: (onlineStatus: string) => api<Me>('/me', { method: 'PATCH', body: { onlineStatus } }),
    onSuccess: setUser,
  })

  // Escape closes it; the page behind doesn't scroll; focus moves into the menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  // The section with the page you're on starts open
  const openKey = mainMenu.find((item) => item.sections.some((s) => s.links.some((l) => l.to.split(/[?#]/)[0] === pathname)))?.key

  return (
    <div className="mm-overlay" onClick={onClose}>
      <nav ref={panel} className="mm-panel" aria-label="Menu" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="mm-head">
          {user ? (
            <Link to={`/profiel/${user.username}`} className="mm-me" onClick={onClose}>
              <Avatar user={user} size="small" static />
              <span>
                <b>{user.nickname}</b>
                <span className="muted">Mijn profiel</span>
              </span>
            </Link>
          ) : (
            <div className="mm-guest">
              <Link to="/inloggen" className="btn" onClick={onClose}>
                Inloggen
              </Link>
              <Link to="/aanmelden" className="btn btn-cta" onClick={onClose}>
                Aanmelden
              </Link>
            </div>
          )}
          <button type="button" className="mm-close" onClick={onClose} aria-label="Menu sluiten">
            <Icon name="x" />
          </button>
        </div>

        <Link to="/" className="mm-link mm-home" onClick={onClose}>
          <FarmIcon name="house" /> Home
        </Link>

        {mainMenu.map((item) => (
          <details key={item.key} className="mm-group" open={item.key === openKey}>
            <summary>
              <FarmIcon name={item.icon} /> <span>{item.label}</span>
              <Icon name="chevronDown" size={16} className="mm-chevron" />
            </summary>
            {item.sections.map((section, i) => (
              <div key={section.title ?? i} className="mm-section">
                {section.title && <h3>{section.title}</h3>}
                {section.links.map((link) => (
                  <Link key={link.label} to={resolveMenuLink(link.to, user?.username ?? null)} className="mm-link" onClick={onClose}>
                    <FarmIcon name={link.icon} /> {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </details>
        ))}

        {user && (
          <div className="mm-block">
            <h3>Jij</h3>
            <Link to="/berichten" className="mm-link" onClick={onClose}>
              <FarmIcon name="email" /> Berichten
            </Link>
            <Link to="/vrienden" className="mm-link" onClick={onClose}>
              <FarmIcon name="bell" /> Vriendschapsverzoeken
              {user.pendingFriendRequests + user.pendingRelationRequests > 0 && <span className="badge farm-badge">{user.pendingFriendRequests + user.pendingRelationRequests}</span>}
            </Link>
            <Link to="/instellingen" className="mm-link" onClick={onClose}>
              <FarmIcon name="cog" /> Instellingen
            </Link>
            {user.isAdmin && (
              <Link to="/beheer" className="mm-link" onClick={onClose}>
                <FarmIcon name="award_star_gold_1" /> Beheer
              </Link>
            )}
            <label className="mm-status">
              <FarmIcon name={statusIcon(user.onlineStatus)} />
              <span>Status</span>
              <select className="text-box" value={user.onlineStatus} onChange={(e) => setStatus.mutate(e.target.value)}>
                {ONLINE_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="mm-block">
          <button type="button" className="mm-link" aria-expanded={showThemes} onClick={() => setShowThemes((v) => !v)}>
            <FarmIcon name="palette" /> Kleuren van Kuddes
            <Icon name="chevronDown" size={16} className="mm-chevron" />
          </button>
          {showThemes && <ThemeOptions />}
          {install.available && (
            <button type="button" className="mm-link" onClick={() => void install.prompt()}>
              <FarmIcon name="iphone" /> Kuddes op je beginscherm zetten
            </button>
          )}
          {user && (
            <button
              type="button"
              className="mm-link"
              onClick={() => {
                onClose()
                logout.mutate(undefined, { onSuccess: () => navigate('/') })
              }}
            >
              <FarmIcon name="door_out" /> Uitloggen
            </button>
          )}
        </div>

        <p className="mm-online">
          <FarmIcon name="status_online" /> {stats?.online ?? '…'} online
        </p>
      </nav>
    </div>
  )
}
