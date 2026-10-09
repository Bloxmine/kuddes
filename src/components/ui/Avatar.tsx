import { Link } from 'react-router-dom'
import type { UserSummary } from '../../../shared/api'
import { initials, seededGradient } from '../../lib/placeholder'
import './Avatar.css'

type AvatarSize = 'tiny' | 'small' | 'medium' | 'large' | 'xlarge'

const PIXELS: Record<AvatarSize, number> = {
  tiny: 36,
  small: 50,
  medium: 75,
  large: 120,
  xlarge: 180,
}

type AvatarProps = {
  user: Pick<UserSummary, 'username' | 'name' | 'avatarUrl'> & { online?: boolean }
  size?: AvatarSize
  /** Shows the name under the picture, like in the friends grids. */
  showName?: boolean
  label?: string
  /** Renders without a link to the profile. */
  static?: boolean
}

/** Framed profile picture; falls back to initials when there's no photo. */
export function Avatar({ user, size = 'small', showName, label, static: isStatic }: AvatarProps) {
  const px = PIXELS[size]
  const picture = user.avatarUrl ? (
    <img className={`avatar-img avatar-${size}`} src={user.avatarUrl} width={px} height={px} alt="" loading="lazy" />
  ) : (
    <span
      className={`avatar-img avatar-${size}`}
      style={{ width: px, height: px, background: seededGradient(user.username) }}
      aria-hidden="true"
    >
      {initials(user.name)}
    </span>
  )
  const to = `/profiel/${user.username}`

  return (
    <div className="avatar" style={{ width: px + 8 }}>
      {isStatic ? (
        <span className="avatar-link">{picture}</span>
      ) : (
        <Link to={to} className="avatar-link" title={user.name}>
          {picture}
          <span className="visually-hidden">{user.name}</span>
        </Link>
      )}
      {user.online && size !== 'tiny' && <span className="avatar-online" title="Online" />}
      {showName &&
        (isStatic ? (
          <span className="avatar-name">{label ?? user.name}</span>
        ) : (
          <Link to={to} className="avatar-name">
            {label ?? user.name}
          </Link>
        ))}
    </div>
  )
}

/** A small picture inside a line of text (a chat line, a list of names): no frame, no link, fits in a <p>. */
export function UserPic({ user, size = 20 }: { user: Pick<UserSummary, 'username' | 'name' | 'avatarUrl'>; size?: number }) {
  return user.avatarUrl ? (
    <img className="user-pic" src={user.avatarUrl} width={size} height={size} alt="" loading="lazy" />
  ) : (
    <span className="user-pic" style={{ width: size, height: size, background: seededGradient(user.username), fontSize: size / 2.4 }} aria-hidden="true">
      {initials(user.name)}
    </span>
  )
}
