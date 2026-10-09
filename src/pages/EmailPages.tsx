/**
 * The pages behind the links in our mails: confirm your address, a new
 * password, confirm a new address. They post the token themselves (a link
 * that's only opened, e.g. by a mail scanner, doesn't use it up).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Me } from '../../shared/api'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { Field } from '../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { keys } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'

/** Posts the token from the link once, when the page opens. */
function useRedeem(path: string) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const queryClient = useQueryClient()
  const redeem = useMutation({
    mutationFn: () => api<Me | null>(path, { method: 'POST', body: { token } }),
    onSuccess: (me) => {
      if (me) queryClient.setQueryData(keys.me, me)
    },
  })
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !token) return
    started.current = true
    redeem.mutate()
  }, [token, redeem])
  return { token, redeem }
}

function Done({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="page page-con account-page">
      <Box title={title} icon="email" className="account-box">
        {children}
      </Box>
    </main>
  )
}

/** /bevestigen?token=… */
export function ConfirmEmailPage() {
  usePageTitle('E-mailadres bevestigen - Kuddes')
  const { user } = useAuth()
  const { token, redeem } = useRedeem('/auth/verify')
  return (
    <Done title="E-mailadres bevestigen">
      {!token ? (
        <p className="form-error">Deze link is niet compleet. Kopieer de hele link uit de mail.</p>
      ) : redeem.isPending || redeem.isIdle ? (
        <p className="muted">Even bevestigen…</p>
      ) : redeem.isError ? (
        <>
          <p className="form-error">{errorMessage(redeem.error)}</p>
          {user && !user.emailVerified && <p>Bovenaan de pagina kun je een nieuwe link aanvragen.</p>}
        </>
      ) : (
        <>
          <p className="form-success">
            <FarmIcon name="accept" /> Gelukt! Je e-mailadres is bevestigd.
          </p>
          <p>Je kunt nu alles op Kuddes: knuffels geven, WieWatWaars plaatsen, berichten sturen en meer.</p>
          <div className="account-actions">
            <Link to={user ? `/profiel/${user.username}` : '/inloggen'} className="btn btn-cta">
              {user ? 'Naar je profiel' : 'Inloggen'}
            </Link>
          </div>
        </>
      )}
    </Done>
  )
}

/** /nieuw-adres?token=… */
export function ConfirmNewAddressPage() {
  usePageTitle('Nieuw e-mailadres - Kuddes')
  const { user } = useAuth()
  const { token, redeem } = useRedeem('/auth/email/confirm')
  return (
    <Done title="Nieuw e-mailadres">
      {!token ? (
        <p className="form-error">Deze link is niet compleet. Kopieer de hele link uit de mail.</p>
      ) : redeem.isPending || redeem.isIdle ? (
        <p className="muted">Even bevestigen…</p>
      ) : redeem.isError ? (
        <p className="form-error">{errorMessage(redeem.error)}</p>
      ) : (
        <>
          <p className="form-success">
            <FarmIcon name="accept" /> Je nieuwe e-mailadres is bevestigd. Mails van Kuddes gaan voortaan daarheen.
          </p>
          <div className="account-actions">
            <Link to={user ? '/instellingen#e-mailadres' : '/inloggen'} className="btn">
              {user ? 'Naar je instellingen' : 'Inloggen'}
            </Link>
          </div>
        </>
      )}
    </Done>
  )
}

/** /wachtwoord-vergeten */
export function ForgotPasswordPage() {
  usePageTitle('Wachtwoord vergeten - Kuddes')
  const [email, setEmail] = useState('')
  const send = useMutation({ mutationFn: () => api<void>('/auth/forgot', { method: 'POST', body: { email } }) })
  const { data: options } = useQuery({ queryKey: ['auth-options'], queryFn: () => api<{ approval: boolean; mail: boolean }>('/auth/options'), staleTime: Infinity })
  if (options && !options.mail) {
    return (
      <main className="page page-con account-page">
        <div className="account-intro">
          <h1>Wachtwoord vergeten?</h1>
        </div>
        <Box title="Nieuw wachtwoord" icon="key" className="account-box">
          <p>Kuddes verstuurt (nog) geen mail. Vraag de beheerder om een nieuw wachtwoord: die kan er een voor je maken, en dan log je daarmee in en kies je bij Instellingen een eigen wachtwoord.</p>
          <div className="account-actions">
            <Link to="/inloggen">« Terug naar inloggen</Link>
          </div>
        </Box>
      </main>
    )
  }
  return (
    <main className="page page-con account-page">
      <div className="account-intro">
        <h1>Wachtwoord vergeten?</h1>
        <p>Geen probleem. Vul je e-mailadres of gebruikersnaam in, dan sturen we je een link om een nieuw wachtwoord te kiezen.</p>
      </div>
      <Box title="Nieuw wachtwoord aanvragen" icon="key" className="account-box">
        {send.isSuccess ? (
          <>
            <p className="form-success">
              <FarmIcon name="email_go" /> Als er een account bij hoort, staat er nu een mail voor je klaar. Kijk ook even in je spam.
            </p>
            <p className="muted">De link werkt 1 uur.</p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send.mutate()
            }}
          >
            <Field label="E-mailadres of gebruikersnaam">
              <input className="text-box" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </Field>
            {send.isError && <p className="form-error">{errorMessage(send.error)}</p>}
            <div className="account-actions">
              <Button type="submit" variant="cta" disabled={send.isPending}>
                Stuur de link
              </Button>
              <Link to="/inloggen">« Terug naar inloggen</Link>
            </div>
          </form>
        )}
      </Box>
    </main>
  )
}

/** /wachtwoord-herstellen?token=… */
export function ResetPasswordPage() {
  usePageTitle('Nieuw wachtwoord - Kuddes')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const reset = useMutation({
    mutationFn: () => api<Me>('/auth/reset', { method: 'POST', body: { token, password } }),
    onSuccess: (me) => {
      queryClient.setQueryData(keys.me, me)
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      navigate(`/profiel/${me.username}`, { replace: true })
    },
  })
  const mismatch = again.length > 0 && again !== password
  const fields = reset.error instanceof ApiRequestError ? reset.error.fields : {}
  return (
    <main className="page page-con account-page">
      <div className="account-intro">
        <h1>Kies een nieuw wachtwoord</h1>
        <p>Daarna ben je meteen ingelogd, en overal anders uitgelogd.</p>
      </div>
      <Box title="Nieuw wachtwoord" icon="key" className="account-box">
        {!token ? (
          <p className="form-error">
            Deze link is niet compleet. Kopieer de hele link uit de mail, of <Link to="/wachtwoord-vergeten">vraag een nieuwe aan</Link>.
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!mismatch) reset.mutate()
            }}
          >
            <Field label="Nieuw wachtwoord" hint="(minstens 8 tekens)" error={fields.password}>
              <input className="text-box" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            <Field label="Nog een keer" error={mismatch ? 'De wachtwoorden zijn niet hetzelfde.' : undefined}>
              <input className="text-box" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" minLength={8} required />
            </Field>
            {reset.isError && !fields.password && (
              <p className="form-error">
                {errorMessage(reset.error)} <Link to="/wachtwoord-vergeten">Nieuwe link aanvragen</Link>
              </p>
            )}
            <div className="account-actions">
              <Button type="submit" variant="cta" disabled={reset.isPending || mismatch}>
                Wachtwoord opslaan
              </Button>
            </div>
          </form>
        )}
      </Box>
    </main>
  )
}
