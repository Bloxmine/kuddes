import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import './VerifyBanner.css'

/** "Stuur opnieuw": a new confirmation mail. */
export function ResendConfirmation({ label = 'Stuur opnieuw' }: { label?: string }) {
  const resend = useMutation({ mutationFn: () => api<void>('/auth/verify/resend', { method: 'POST' }) })
  return (
    <>
      {resend.isSuccess ? (
        <span className="form-success">
          <FarmIcon name="accept" /> Nieuwe mail gestuurd!
        </span>
      ) : (
        <button type="button" className="link-button" disabled={resend.isPending} onClick={() => resend.mutate()}>
          {label}
        </button>
      )}
      {resend.isError && <span className="form-error"> {errorMessage(resend.error)}</span>}
    </>
  )
}

/** Until a new member clicks the link in their confirmation mail (or the admin approves them): a reminder, and a new mail. */
export function VerifyBanner() {
  const { user } = useAuth()
  if (!user || user.emailVerified) return null
  if (user.awaitingApproval) {
    return (
      <div className="verify-banner page" role="status">
        <FarmIcon name="hourglass" size={24} />
        <p>
          <b>Je aanmelding wacht op goedkeuring.</b> De beheerder kijkt er zo snel mogelijk naar; je krijgt een bericht zodra het zover is. Tot die tijd kun je je eigen profiel invullen en mooi maken (met een profielfoto en een achtergrond). De profielen van anderen, foto’s, Kuddes en berichten zie je zodra je bent goedgekeurd.
        </p>
      </div>
    )
  }
  return (
    <div className="verify-banner page" role="status">
      <FarmIcon name="email" size={24} />
      <p>
        <b>Bevestig je e-mailadres.</b> We hebben een mail gestuurd naar <b>{user.email}</b>. Klik op de link erin, dan kun je je profiel invullen, zie je de profielen, foto’s en Kuddes van anderen en kun je knuffels geven, posten en berichten sturen. Niets gekregen? Kijk ook even in je <b>spam</b> of ongewenste e-mail.
      </p>
      <span className="verify-banner-actions">
        <ResendConfirmation />
        <Link to="/instellingen#e-mailadres">Ander adres?</Link>
      </span>
    </div>
  )
}
