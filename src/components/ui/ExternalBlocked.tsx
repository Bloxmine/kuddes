import { Link } from 'react-router-dom'
import { OPTIONAL_SERVICES, allowService, type OptionalCookie } from '../../lib/cookieConsent'
import { FarmIcon } from './FarmIcon'
import type { FarmIconName } from './farmIcons'
import './ExternalBlocked.css'

/**
 * In place of an embed from another service (YouTube, SomaFM) that isn't
 * allowed by the cookie choice: what it is, and a button to allow it.
 */
export function ExternalBlocked({ kind, compact }: { kind: OptionalCookie; compact?: boolean }) {
  const service = OPTIONAL_SERVICES[kind]
  return (
    <div className={compact ? 'ext-blocked compact' : 'ext-blocked'}>
      <FarmIcon name={service.icon as FarmIconName} size={compact ? 16 : 32} />
      <p>
        <b>{service.name} staat uit</b>
        {!compact && <span>Je koos voor alleen noodzakelijke cookies. {service.name} laadt pas als je het toestaat.</span>}
      </p>
      <span className="ext-blocked-actions">
        <button type="button" className="btn btn-cta" onClick={() => allowService(kind)}>
          {service.name} toestaan
        </button>
        {!compact && <Link to="/cookies">Cookie-instellingen</Link>}
      </span>
    </div>
  )
}
