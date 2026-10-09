import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ResendConfirmation } from '../features/account/VerifyBanner'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../lib/usePageTitle'
import { Box } from './ui/Box'
import { FarmIcon } from './ui/FarmIcon'
import './MembersOnly.css'

/**
 * Pages only for members (profiles, Kuddes, the agenda…): without an account
 * you get this instead. The API refuses them too (MEMBERS_ONLY in server/index.ts).
 */
export function MembersOnly({ children }: { children: ReactNode }) {
  const { user, waiting, unconfirmed, isLoading } = useAuth()
  const { pathname } = useLocation()
  if (isLoading) return null
  if (!user) return <MembersOnlyPage />
  // On the waitlist only your own profile (and its achievements); waiting for the confirmation mail, not even that
  if (unconfirmed) return <WaitingPage />
  if (waiting) {
    const own = [`/profiel/${user.username}`, '/profiel/@me', `/prestaties/${user.username}`].some((p) => pathname.toLowerCase() === p.toLowerCase())
    return own ? children : <WaitingPage />
  }
  return children
}

/** Pages for members that handle visitors themselves (messages, friends…): closed while you're on the waitlist. */
export function NotWhileWaiting({ children }: { children: ReactNode }) {
  const { waiting } = useAuth()
  return waiting ? <WaitingPage /> : children
}

/**
 * For someone not let in yet. On the waitlist they can make their profile
 * ready meanwhile; waiting for the confirmation mail, only fix the address.
 */
export function WaitingPage() {
  const { user } = useAuth()
  usePageTitle('Even geduld - Kuddes')
  const approval = !!user?.awaitingApproval
  return (
    <main className="page page-con">
      <Box title={approval ? 'Je aanmelding wacht op goedkeuring' : 'Bevestig eerst je e-mailadres'} icon={approval ? 'hourglass' : 'email'} className="members-only">
        <FarmIcon name={approval ? 'hourglass' : 'email_open'} size={32} />
        {approval ? (
          <p>
            <b>Profielen van anderen, foto’s, Kuddes, berichten en de Messenger zie je zodra de beheerder je heeft goedgekeurd.</b>
          </p>
        ) : (
          <p>
            <b>Profielen van anderen, foto’s, Kuddes, berichten en de Messenger zie je zodra je je e-mailadres hebt bevestigd.</b> Klik op de link in de mail die we naar {user?.email} stuurden. <ResendConfirmation label="Stuur de mail opnieuw" />
          </p>
        )}
        {approval ? (
          <>
            <p className="muted">Tot die tijd kun je je eigen profiel alvast mooi maken: een profielfoto, een achtergrond, je design, je indeling en gadgets. Het forum, de video’s, het nieuws en de recepten kun je gewoon bekijken.</p>
            <div className="members-only-actions">
              <Link to={user ? `/profiel/${user.username}` : '/'} className="btn btn-cta">
                <FarmIcon name="user" /> Mijn profiel
              </Link>
              <Link to="/instellingen#design" className="btn">
                <FarmIcon name="paintcan" /> Pimp je profiel
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              Daarna kun je ook je profiel invullen en mooi maken. Niets gekregen? Kijk in je spam of ongewenste e-mail. Het forum, de video’s, het nieuws en de recepten kun je
              gewoon bekijken.
            </p>
            <div className="members-only-actions">
              <Link to="/instellingen#e-mailadres" className="btn">
                <FarmIcon name="email_edit" /> Ander e-mailadres
              </Link>
            </div>
          </>
        )}
      </Box>
    </main>
  )
}

function MembersOnlyPage() {
  const { pathname, search } = useLocation()
  usePageTitle('Alleen voor leden - Kuddes')
  const next = encodeURIComponent(pathname + search)
  return (
    <main className="page page-con">
      <Box title="Alleen voor leden" icon="lock" className="members-only">
        <FarmIcon name="lock" size={32} />
        <p>
          <b>Profielen, foto’s, Kuddes en de agenda zijn alleen te zien als je ingelogd bent.</b>
        </p>
        <p className="muted">Zo blijft wat leden delen tussen leden. Het forum, de video’s, het nieuws en de recepten kun je ook zonder account bekijken.</p>
        <div className="members-only-actions">
          <Link to={`/inloggen?next=${next}`} className="btn btn-cta">
            Inloggen
          </Link>
          <Link to="/aanmelden" className="btn">
            Word lid
          </Link>
        </div>
      </Box>
    </main>
  )
}

/** In place of an embedded profile, photo or Kudde in a forum post, for visitors without an account. */
export function MembersOnlyEmbed({ what }: { what: string }) {
  return (
    <p className="members-only-embed">
      <FarmIcon name="lock" /> {what} is alleen te zien voor leden. <Link to="/inloggen">Log in</Link>
    </p>
  )
}
