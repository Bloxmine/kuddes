import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import './ConsentGate.css'

/**
 * After a new privacy statement: members agree to it before they go on (the
 * API holds back everything else until then, server/index.ts). What changed,
 * in a few lines, and a way out that isn't agreeing.
 */
export function ConsentGate() {
  usePageTitle('Nieuwe privacyverklaring - Kuddes')
  const { setUser, logout } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const consent = useMutation({ mutationFn: () => api<Me>('/me/consent', { method: 'POST', body: { privacy: true } }), onSuccess: setUser })

  return (
    <main className="page page-con consent-gate">
      <Box title="We hebben onze privacyverklaring en gebruikersovereenkomst bijgewerkt" icon="shield">
        <p>Voordat je verder gaat op Kuddes, vragen we je opnieuw akkoord te gaan. Dit is er veranderd:</p>
        <ul className="consent-changes">
          <li>
            <FarmIcon name="flag_red" />
            <span>
              <b>Melden:</b> met de knop “Melden” laat je de beheerder weten dat iets niet klopt. Melden genoeg leden hetzelfde, of gaat het om iets dringends, dan wordt
              het vanzelf verborgen tot de beheerder ernaar kijkt.
            </span>
          </li>
          <li>
            <FarmIcon name="lightning" />
            <span>
              <b>Automatische beslissingen:</b> sommige dingen gebeuren vanzelf, met regels van de beheerder (zoals een aanmelding weigeren of een account blokkeren). Je
              kunt altijd vragen dat de beheerder er zelf naar kijkt.
            </span>
          </li>
          <li>
            <FarmIcon name="lock" />
            <span>
              <b>Nieuwe privacy-instellingen:</b> je kunt je profiel alleen voor vrienden zichtbaar maken en kiezen wie je een vriendschapsverzoek mag sturen.
            </span>
          </li>
          <li>
            <FarmIcon name="shield" />
            <span>
              <b>Zwarte lijst en blokkades:</b> e-mailadressen en gebruikersnamen op de zwarte lijst bewaren we versleuteld, en ze blijven bewaard als iemand zijn account
              verwijdert. Een geblokkeerde internetverbinding blijft geblokkeerd zolang dat nodig is.
            </span>
          </li>
          <li>
            <FarmIcon name="heart" />
            <span>
              <b>Gebruikersovereenkomst:</b> de beheerder mag ingrijpen als de sfeer ernstig wordt verstoord, reclame voor andere sites mag niet, en een automatische
              moderator kan ongepaste inhoud of spam weghalen.
            </span>
          </li>
        </ul>
        <p>
          Lees de hele{' '}
          <Link to="/privacy" target="_blank" rel="noopener">
            privacyverklaring
          </Link>{' '}
          en de{' '}
          <Link to="/gebruikersovereenkomst" target="_blank" rel="noopener">
            gebruikersovereenkomst
          </Link>
          .
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            consent.mutate()
          }}
        >
          <label className="consent-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
            <span>Ik heb de privacyverklaring en de gebruikersovereenkomst gelezen en ga ermee akkoord.</span>
          </label>
          <div className="account-actions">
            <Button type="submit" disabled={!agreed || consent.isPending}>
              Akkoord, verder naar Kuddes
            </Button>
            {consent.isError && <span className="form-error">{errorMessage(consent.error)}</span>}
          </div>
        </form>
        <p className="muted consent-out">
          Niet akkoord? Dan kun je{' '}
          <a href="/api/me/export" download>
            eerst je gegevens downloaden
          </a>
          , je account <Link to="/instellingen#verwijderen">verwijderen</Link> of{' '}
          <button type="button" className="link-button" onClick={() => logout.mutate()}>
            uitloggen
          </button>
          .
        </p>
      </Box>
    </main>
  )
}
