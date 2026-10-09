import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { resolveMenuLink } from './menu'
import './Footer.css'


const COLUMNS: { title: string; links: { label: string; to: string }[] }[] = [
  {
    title: 'Ontdekken',
    links: [
      { label: 'Kuddes', to: '/kuddes' },
      { label: 'Agenda', to: '/agenda' },
      { label: 'Forum', to: '/forum' },
      { label: 'Kuddes Video', to: '/video' },
      { label: 'Muziek', to: '/muziek' },
      { label: 'Kuddes Radio', to: '/radio' },
      { label: 'Fotografie', to: '/fotografie' },
      { label: 'Spellen', to: '/spellen' },
      { label: 'Glitterplaatjes', to: '/glitterplaatjes' },
      { label: 'Recepten', to: '/recepten' },
      { label: 'Recensies', to: '/recensies' },
      { label: 'Graffitimuur', to: '/graffiti' },
    ],
  },
  {
    title: 'Jij',
    links: [
      { label: 'Mijn profiel', to: '/profiel/@me' },
      { label: 'Overzicht', to: '/tijdlijn' },
      { label: 'Berichten', to: '/berichten' },
      { label: 'Vrienden', to: '/vrienden' },
      { label: 'Gadgetmarkt', to: '/gadgetmarkt' },
      { label: 'Mijn prestaties', to: '/prestaties/@me' },
      { label: 'Instellingen', to: '/instellingen' },
    ],
  },
  {
    title: 'Over Kuddes',
    links: [
      { label: 'Over Kuddes', to: '/over-kuddes' },
      { label: 'Nieuws', to: '/nieuws' },
      { label: 'Suggesties', to: '/suggesties' },
      { label: 'Probleem melden', to: '/suggesties?soort=probleem' },
      { label: 'Privacyverklaring', to: '/privacy' },
      { label: 'Gebruikersovereenkomst', to: '/gebruikersovereenkomst' },
      { label: 'Cookie-instellingen', to: '/cookies' },
    ],
  },
]

/**
 * The bottom of every page, on a card of its own (readable on any theme): the
 * name and what Kuddes stands for, the links in tidy columns, and the credits.
 */
export function Footer() {
  const { user } = useAuth()
  return (
    <footer className="site-ftr page">
      <div className="site-ftr-card">
        <div className="site-ftr-band">
          <div className="site-ftr-brand">
            <Link to="/" className="site-ftr-logo">
              <img src="/favicon.svg" alt="" width={30} height={30} loading="lazy" />
              <span>Kuddes</span>
            </Link>
            <p className="site-ftr-motto">Altijd lief voor elkaar!</p>
            <p>Gratis, zonder advertenties en zonder tracking.</p>
            {user ? (
              <Link to="/over-kuddes" className="site-ftr-about">
                Meer over Kuddes
              </Link>
            ) : (
              <Link to="/aanmelden" className="btn btn-cta">
                Word gratis lid
              </Link>
            )}
          </div>
          <nav className="site-ftr-links" aria-label="Alles op Kuddes">
            {COLUMNS.map((col) => (
              <div key={col.title} className={col.links.length > 8 ? 'site-ftr-group wide' : 'site-ftr-group'}>
                <h3>{col.title}</h3>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link to={resolveMenuLink(l.to, user?.username ?? null)}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="site-ftr-base">
          <span>&copy; {new Date().getFullYear()} Kuddes · Kuddes is niks zonder jullie steun!</span>
          <span>
            Iconen:{' '}
            <a href="https://commons.wikimedia.org/wiki/Farm-Fresh_web_icons" target="_blank" rel="noreferrer">
              Farm-Fresh
            </a>{' '}
            door{' '}
            <a href="http://www.fatcow.com/free-icons" target="_blank" rel="noreferrer">
              FatCow
            </a>{' '}
            (
            <a href="https://creativecommons.org/licenses/by/3.0/us/" target="_blank" rel="noreferrer">
              CC BY 3.0
            </a>
            )
          </span>
        </div>
      </div>
    </footer>
  )
}
