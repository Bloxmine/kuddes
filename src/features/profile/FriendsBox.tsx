import type { Profile } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { useFriends } from '../../lib/queries'
import { relationOf } from '../../../shared/relations'
import { RelationIcon } from '../relations/Relations'

type FriendsBoxProps = {
  profile: Profile
  /** How many to show; omit to show everyone. */
  limit?: number
  onShowAll?: () => void
}

export function FriendsBox({ profile, limit, onShowAll }: FriendsBoxProps) {
  const { data: friends, isLoading } = useFriends(profile.username)
  const shown = limit ? friends?.slice(0, limit) : friends

  return (
    <Box title={`Vrienden (${profile.friendCount})`} icon="group" className="friends-overview">
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : !shown?.length ? (
        <p className="empty">
          {profile.relation?.isSelf ? 'Je hebt nog geen vrienden. Zoek ze via het menu!' : `${profile.nickname} heeft nog geen vrienden op Kuddes.`}
        </p>
      ) : (
        <ul className={limit ? 'friends-grid' : 'friends-grid friends-grid-wide'}>
          {shown.map((friend) => {
            const rel = relationOf(profile, friend.id)
            return (
              <li key={friend.id}>
                {rel && <RelationIcon kind={rel.kind} title={rel.title} />}
                <Avatar user={friend} size="medium" showName label={friend.nickname} />
              </li>
            )
          })}
        </ul>
      )}
      {limit && (friends?.length ?? 0) > limit && onShowAll && (
        <ul className="more">
          <li>
            <span className="rsaquo" aria-hidden="true">
              ›
            </span>
            <button type="button" className="link-button" onClick={onShowAll}>
              Alle vrienden
            </button>
          </li>
        </ul>
      )}
    </Box>
  )
}
