import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'
import { FarmIcon } from '../components/ui/FarmIcon'
import { Turnstile } from '../components/ui/Turnstile'
import { SIGNUP_REASON_MAX, SIGNUP_REASON_MIN } from '../../shared/signup'
import { MIN_AGE } from '../../shared/privacy'
import { useServerInfo } from '../features/federation/serverInfo'

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const server = useServerInfo()
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', reason: '' })
  const [again, setAgain] = useState('')
  const [privacy, setPrivacy] = useState(false)
  const [oldEnough, setOldEnough] = useState(false)
  const [tried, setTried] = useState(false)
  const [captcha, setCaptcha] = useState('')
  const [captchaError, setCaptchaError] = useState<string | null>(null)
  // A token works once: a failed sign-up asks the widget for a new one
  const [captchaRound, setCaptchaRound] = useState(0)
  usePageTitle('Aanmelden - Kuddes')
  const { data: options } = useQuery({ queryKey: ['auth-options'], queryFn: () => api<{ approval: boolean; closed: boolean; mail: boolean; captcha: string | null }>('/auth/options'), staleTime: Infinity })

  if (user && !register.isSuccess) return <Navigate to="/" replace />
  // The quiet mode (Beheer → Rustige stand) can close sign-ups for a while
  if (options?.closed)
    return (
      <main className="page page-con account-page">
        <Box title="Aanmelden kan even niet" icon="lock">
          <p>Kuddes neemt op dit moment even geen nieuwe leden aan. Kom over een tijdje terug; dan ben je van harte welkom!</p>
        </Box>
      </main>
    )

  const fields = register.error instanceof ApiRequestError ? register.error.fields : {}
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  // Only a mistake once they've typed it (or tried to sign up without it)
  const mismatch = (again.length > 0 || tried) && again !== form.password
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (again !== form.password) return
    if (options?.captcha && !captcha) return setCaptchaError('Wacht even tot de controle hieronder klaar is.')
    register.mutate(
      { ...form, reason: options?.approval ? form.reason : undefined, captcha: captcha || undefined, privacy, oldEnough },
      {
        onSuccess: (me) => navigate(`/profiel/${me.username}`),
        onError: (err) => {
          // The server checks the captcha last: a typo or a taken name leaves it valid.
          // Only when it was checked (and so used up) does the widget need a new one.
          const used = err instanceof ApiRequestError && (!!err.fields?.captcha || err.status >= 500)
          if (!options?.captcha || !used) return
          setCaptcha('')
          setCaptchaRound((r) => r + 1)
        },
      },
    )
  }

  return (
    <main className="page page-con account-page">
      <div className="account-intro register-intro">
        <h1>Meld je gratis aan!</h1>
        <p>Kuddes is het gezelligste vriendennetwerk van Nederland. Als lid kun je:</p>
        <ul className="account-perks">
          <li>
            <FarmIcon name="pencil" /> knuffels achterlaten bij je vrienden
          </li>
          <li>
            <FarmIcon name="comment" /> laten weten wat je doet met WieWatWaar
          </li>
          <li>
            <FarmIcon name="camera" /> je foto's delen
          </li>
          <li>
            <FarmIcon name="star" /> respect geven en krijgen
          </li>
          <li>
            <FarmIcon name="paintcan" /> je eigen profiel pimpen
          </li>
        </ul>
        {/* A photo filling the space under the list, fading into the page */}
        <div className="register-photo" aria-hidden="true" />
      </div>

      <Box title="Aanmelden" icon="wand" className="account-box">
        <form onSubmit={submit} noValidate>
          <Field label="Je naam" hint="(voor- en achternaam)" error={fields.name}>
            <input className="text-box" value={form.name} onChange={set('name')} autoComplete="name" required maxLength={60} />
          </Field>
          <Field label="Gebruikersnaam" hint={`(wordt ${server?.domain ?? location.host}/profiel/…)`} error={fields.username}>
            <input
              className="text-box"
              value={form.username}
              onChange={set('username')}
              autoComplete="username"
              required
              maxLength={20}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
            />
          </Field>
          <Field label="E-mailadres" hint="(zien andere leden niet)" error={fields.email}>
            <input className="text-box" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
          </Field>
          <Field label="Wachtwoord" hint="(minstens 8 tekens)" error={fields.password}>
            <input
              className="text-box"
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          <Field label="Wachtwoord nog een keer" error={mismatch ? (again ? 'De wachtwoorden zijn niet hetzelfde.' : 'Vul je wachtwoord nog een keer in.') : undefined}>
            <input className="text-box" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required minLength={8} />
          </Field>
          {options?.approval && (
            <Field label="Waarom wil je lid worden?" hint="(de beheerder leest dit bij je aanmelding)" error={fields.reason}>
              <textarea
                className="text-box"
                rows={3}
                value={form.reason}
                onChange={set('reason')}
                required
                minLength={SIGNUP_REASON_MIN}
                maxLength={SIGNUP_REASON_MAX}
                placeholder="Bijvoorbeeld: ik ken Kuddes via een vriend, of ik mis Hyves en wil oude vrienden terugvinden."
              />
            </Field>
          )}
          {options?.captcha && (
            <div className="field register-captcha">
              <Turnstile
                siteKey={options.captcha}
                resetKey={captchaRound}
                onToken={(t) => {
                  setCaptcha(t)
                  if (t) setCaptchaError(null)
                }}
                onError={setCaptchaError}
              />
              {(captchaError || fields.captcha) && <span className="form-error">{captchaError ?? fields.captcha}</span>}
            </div>
          )}
          <div className="register-consent">
            <label className={fields.privacy ? 'invalid' : undefined}>
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} required />
              <span>
                Ik heb de{' '}
                <Link to="/privacy" target="_blank" rel="noopener">
                  privacyverklaring
                </Link>{' '}
                en de{' '}
                <Link to="/gebruikersovereenkomst" target="_blank" rel="noopener">
                  gebruikersovereenkomst
                </Link>{' '}
                gelezen en ga ermee akkoord.
              </span>
            </label>
            {fields.privacy && <span className="form-error">{fields.privacy}</span>}
            <label className={fields.oldEnough ? 'invalid' : undefined}>
              <input type="checkbox" checked={oldEnough} onChange={(e) => setOldEnough(e.target.checked)} required />
              <span>Ik ben {MIN_AGE} jaar of ouder, of mijn ouder of verzorger geeft toestemming.</span>
            </label>
            {fields.oldEnough && <span className="form-error">{fields.oldEnough}</span>}
          </div>
          {options && (
            <p className="muted register-note">
              <FarmIcon name={options.approval ? 'hourglass' : 'email'} />{' '}
              {options.approval
                ? 'Nieuwe leden worden eerst door de beheerder goedgekeurd. Je kunt meteen inloggen en je profiel invullen; posten kan zodra je bent goedgekeurd.'
                : 'Je krijgt een mail met een link om je e-mailadres te bevestigen. Zodra je daarop klikt, ben je binnen en kun je je profiel invullen.'}
            </p>
          )}
          {options && (!options.approval || options.mail) && (
            <p className="form-notice register-spam">
              <FarmIcon name="exclamation" />
              <span>
                <b>Let op:</b> onze mail kan in je <b>spam</b> of <b>ongewenste e-mail</b> terechtkomen. Zie je na een paar minuten niets van ons? Kijk dan daar, en markeer de mail als
                &quot;geen spam&quot;, zodat volgende mails wel goed aankomen.
              </span>
            </p>
          )}
          {register.isError && Object.keys(fields).length === 0 && (
            <p className="form-error">{errorMessage(register.error)}</p>
          )}
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={register.isPending}>
              {register.isPending ? 'Bezig…' : 'Word lid!'}
            </Button>
            <span className="muted">
              Al een account? <Link to="/inloggen">Log in</Link>
            </span>
          </div>
        </form>
      </Box>
    </main>
  )
}
