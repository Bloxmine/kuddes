import { useState } from 'react'
import { FarmIcon } from '../../components/ui/FarmIcon'
import './InviteLink.css'

/**
 * "Nodig je vrienden uit": a small line at the bottom of Online vrienden
 * (it used to be a banner across Home). The share sheet on a phone, else
 * the sign-up link is copied.
 */
export function InviteLink() {
  const [copied, setCopied] = useState(false)

  const invite = async () => {
    const url = `${location.origin}/aanmelden`
    const text = 'Kom ook op Kuddes!'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Kuddes', text, url })
      } else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }
    } catch {
      // the member cancelled the share sheet
    }
  }

  return (
    <p className="invite-link">
      <button type="button" className="link-button" onClick={invite} title="Maak Kuddes nóg gezelliger: nodig je vrienden uit en knuffel ze zodra ze er zijn">
        <FarmIcon name="group_add" /> {copied ? 'Link gekopieerd!' : 'Nodig je vrienden uit'}
      </button>
    </p>
  )
}
