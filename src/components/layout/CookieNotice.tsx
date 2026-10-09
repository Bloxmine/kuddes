import { Link } from 'react-router-dom'
import { saveCookieConsent, useCookieConsent } from '../../lib/cookieConsent'
import { FarmIcon } from '../ui/FarmIcon'
import './CookieNotice.css'

/** The first visit: allow content from other services (YouTube, SomaFM), or only what's needed. /cookies changes it later. */
export function CookieNotice() {
  const consent = useCookieConsent()
  if (consent) return null
  return (
    <aside className="cookie-notice" role="dialog" aria-label="Cookies en externe media">
      <b>
        <FarmIcon name="cookies" /> Cookies en externe media
      </b>
      <p>
        Kuddes zelf gebruikt alleen wat nodig is, zonder tracking. Video’s van YouTube en de radio van SomaFM kunnen cookies plaatsen; die laden pas als je dat toestaat.{' '}
        <Link to="/cookies">Meer en per dienst kiezen</Link>
      </p>
      <div className="cookie-actions">
        <button type="button" className="btn" onClick={() => saveCookieConsent({ youtube: false, somafm: false })}>
          Alleen noodzakelijk
        </button>
        <button type="button" className="btn btn-cta" onClick={() => saveCookieConsent({ youtube: true, somafm: true })}>
          Alles toestaan
        </button>
      </div>
    </aside>
  )
}
