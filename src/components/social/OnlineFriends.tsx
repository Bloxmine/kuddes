import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useOnlineFriends } from '../../lib/queries'
import { Avatar } from '../ui/Avatar'
import { Box } from '../ui/Box'
import { FarmIcon } from '../ui/FarmIcon'
import { InviteLink } from '../../features/home/InviteLink'
import './OnlineFriends.css'

export function OnlineFriends() {
  const { user } = useAuth()
  const { data: friends = [] } = useOnlineFriends(!!user)
  if (!user) return null

  return (
    <Box title="Wie is er nu?" icon="status_online" className="online-friends">
      {friends.length === 0 ? (
        <p className="empty">Je vrienden zijn er nu even niet.</p>
      ) : (
        <ul>
          {friends.map((f) => (
            <li key={f.id}>
              <Avatar user={f} size="small" />
              <div>
                <Link to={`/profiel/${f.username}`} className="timeline-name">
                  {f.nickname}
                </Link>
                <span className="muted">
                  <FarmIcon name="status_online" /> Online
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <InviteLink />
    </Box>
  )
}
