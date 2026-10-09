import { Link } from 'react-router-dom'
import './MoreLinks.css'

export type MoreLink = { label: string; to: string }

/** The "› Meer..." link list at the bottom of most boxes. */
export function MoreLinks({ links }: { links: MoreLink[] }) {
  return (
    <ul className="more">
      {links.map((link) => (
        <li key={link.label}>
          <span className="rsaquo" aria-hidden="true">
            ›
          </span>
          <Link to={link.to}>{link.label}</Link>
        </li>
      ))}
    </ul>
  )
}
