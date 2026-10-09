import type { ReactNode } from 'react'
import type { UserSummary } from '../../../shared/api'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { initials, seededGradient } from '../../lib/placeholder'
import { toneOf, type Tone } from './messengerFormat'
import type { ChatTarget } from './messengerQueries'

/** The Farm-Fresh buddy of each status (online, away, busy, offline). */
const STATUS_ICONS: Record<Tone, FarmIconName> = {
  online: 'status_online',
  busy: 'status_busy',
  away: 'status_away',
  offline: 'status_offline',
}

/** A little buddy in the colour of their status, in front of each contact. */
export function Buddy({ tone, size = 16 }: { tone: Tone; size?: number }) {
  return <FarmIcon name={STATUS_ICONS[tone]} size={size} className="wlm-buddy" />
}

/** Kuddes Messenger's icon: the MSN Messenger buddies from Farm-Fresh. */
export function MessengerIcon({ size = 16 }: { size?: number }) {
  return <FarmIcon name="msn_messenger" size={size} className="wlm-logo" />
}

/** The nudge button: a window with shake lines. */
export function NudgeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="4" y="3" width="8" height="10" rx="1.2" fill="var(--tint-2)" stroke="currentColor" strokeWidth="1.1" />
      <rect x="4" y="3" width="8" height="2.4" rx="1" fill="currentColor" opacity=".55" />
      <path d="M2.2 5.5 1 8l1.2 2.5M13.8 5.5 15 8l-1.2 2.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A display picture in the glassy frame, lit in the colour of their status. */
export function DisplayPicture({ user, tone, size = 56, children }: { user: Pick<UserSummary, 'username' | 'name' | 'avatarUrl'>; tone: Tone; size?: number; children?: ReactNode }) {
  return (
    <span className={`wlm-dp tone-${tone}`} style={{ width: size + 12, height: size + 12 }}>
      {user.avatarUrl ? (
        <img src={user.avatarUrl} width={size} height={size} alt="" loading="lazy" />
      ) : (
        <span className="wlm-dp-initials" style={{ width: size, height: size, background: seededGradient(user.username), fontSize: size / 2.6 }} aria-hidden="true">
          {initials(user.name)}
        </span>
      )}
      {children}
    </span>
  )
}

/** In front of a conversation's name: the friend's buddy, or for a group the group icon (their picture on a phone). */
export function ChatIcon({ target, picture }: { target: ChatTarget; picture?: boolean }) {
  if (target.kind === 'group') return <FarmIcon name="group" className="wlm-buddy" />
  const tone = toneOf(target.contact.status)
  return picture ? <DisplayPicture user={target.contact} tone={tone} size={24} /> : <Buddy tone={tone} />
}
