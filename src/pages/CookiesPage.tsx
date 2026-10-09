import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { OPTIONAL_SERVICES, saveCookieConsent, useCookieConsent, type CookieConsent, type OptionalCookie } from '../lib/cookieConsent'
import { usePageTitle } from '../lib/usePageTitle'
import './PrivacyPage.css'
import './CookiesPage.css'

const SERVICES = Object.keys(OPTIONAL_SERVICES) as OptionalCookie[]

/** What Kuddes keeps in your browser itself: always on, needed for the site. */
const NEEDED: [string, string][] = [
  ['kuddes_session', 'Een cookie die je ingelogd houdt (30 dagen na je laatste bezoek, of tot je uitlogt).'],
  ['kuddes-cookie-consent', 'Deze keuze.'],
  ['kuddes.theme, kuddes.themeVars, kuddes.display', 'Je thema en weergave, zodat de site meteen goed laadt.'],
  ['kuddes.postcode, kuddes.nuInNederland, …', 'Kleine dingen die je instelt, zoals je postcode voor het weer, of een blok dat je dichtklapte.'],
]

/** /cookies: the cookie choice, to change at any time (the banner sets it the first time). */
export function CookiesPage() {
  usePageTitle('Cookie-instellingen - Kuddes')
  const consent = useCookieConsent()
  const [draft, setDraft] = useState<CookieConsent | null>(null)
  const current = draft ?? consent ?? { youtube: false, somafm: false }
  const [saved, setSaved] = useState(false)
  const save = (next: CookieConsent) => {
    saveCookieConsent(next)
    setDraft(null)
    setSaved(true)
  }
  return (
    <main className="page page-con">
      <Box title="Cookie-instellingen" icon="cookies">
        <article className="news-article pv ck">
          <h1>Cookies en externe media</h1>
          <p className="muted">
            Kuddes zelf gebruikt geen advertentie-, analyse- of trackingcookies. Sommige onderdelen laden wel inhoud van andere diensten; die kunnen cookies plaatsen of je IP-adres
            zien. Die laden pas als jij dat toestaat. Lees meer in de <Link to="/privacy#derden">privacyverklaring</Link>.
          </p>

          <h2>
            <FarmIcon name="lock" /> Noodzakelijk
          </h2>
          <p>Altijd aan: zonder dit werkt de site niet. Het blijft op je eigen apparaat of gaat alleen naar Kuddes.</p>
          <table className="pv-table">
            <tbody>
              {NEEDED.map(([name, what]) => (
                <tr key={name}>
                  <td>
                    <code>{name}</code>
                  </td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>
            <FarmIcon name="world_link" /> Andere diensten
          </h2>
          <ul className="ck-services">
            {SERVICES.map((k) => (
              <li key={k}>
                <label>
                  <FarmIcon name={OPTIONAL_SERVICES[k].icon as FarmIconName} size={32} />
                  <span>
                    <b>{OPTIONAL_SERVICES[k].name}</b>
                    <span className="muted">{OPTIONAL_SERVICES[k].what}</span>
                  </span>
                  <input
                    type="checkbox"
                    className="ck-switch"
                    checked={current[k]}
                    onChange={(e) => {
                      setSaved(false)
                      setDraft({ ...current, [k]: e.target.checked })
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="muted">Staat een dienst uit, dan zie je op die plek een knop om hem alsnog aan te zetten. Deze keuze geldt voor deze browser.</p>

          <div className="account-actions">
            <Button variant="cta" onClick={() => save(current)}>
              <FarmIcon name="accept" /> Keuze opslaan
            </Button>
            <Button onClick={() => save({ youtube: false, somafm: false })}>Alleen noodzakelijk</Button>
            <Button onClick={() => save({ youtube: true, somafm: true })}>Alles toestaan</Button>
            {saved && (
              <span className="form-success">
                <FarmIcon name="tick" /> Opgeslagen
              </span>
            )}
          </div>
        </article>
      </Box>
    </main>
  )
}
