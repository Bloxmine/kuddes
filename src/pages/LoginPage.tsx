import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startPath } from '../lib/preferences'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'

/** Only follow local paths after login, never another site. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  // Without a page to go back to, go to the start page from your settings
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  usePageTitle('Inloggen - Kuddes')

  if (user && !login.isSuccess) return <Navigate to={next ?? startPath(user)} replace />

  return (
    <main className="page page-con account-page">
      <div className="account-intro">
        <h1>Inloggen</h1>
        <p>Welkom terug! Log in om te zien wat je vrienden aan het doen zijn.</p>
      </div>
      <Box title="Inloggen" icon="key" className="account-box">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            login.mutate({ username, password }, { onSuccess: (me) => navigate(next ?? startPath(me), { replace: true }) })
          }}
        >
          <Field label="Gebruikersnaam of e-mailadres">
            <input className="text-box" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Wachtwoord">
            <input
              className="text-box"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <p className="login-forgot">
            <Link to="/wachtwoord-vergeten">Wachtwoord vergeten?</Link>
          </p>
          {login.isError && <p className="form-error">{errorMessage(login.error)}</p>}
          <div className="account-actions">
            <Button type="submit" disabled={login.isPending}>
              Inloggen
            </Button>
            <span className="muted">
              Nog geen lid? <Link to="/aanmelden">Meld je gratis aan!</Link>
            </span>
          </div>
        </form>
      </Box>
    </main>
  )
}
