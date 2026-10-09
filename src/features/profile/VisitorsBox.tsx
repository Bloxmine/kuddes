import type { Profile } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { useVisitors } from '../../lib/queries'
import { formatTime } from '../../lib/time'

/** "Laatste bezoekers": only shown to the member themselves. */
export function VisitorsBox({ profile }: { profile: Profile }) {
  const isSelf = !!profile.relation?.isSelf
  const { data: visitors } = useVisitors(profile.username, isSelf)
  if (!isSelf) return null

  return (
    <Box title="Laatste bezoekers" icon="walk">
      {!visitors?.length ? (
        <p className="empty">Nog niemand heeft je profiel bekeken.</p>
      ) : (
        <ul className="visitor-grid">
          {visitors.map((v) => (
            <li key={v.id} title={formatTime(v.visitedAt)}>
              <Avatar user={v} size="small" showName label={v.nickname} />
            </li>
          ))}
        </ul>
      )}
      <p className="muted visitor-note">Alleen jij kunt zien wie je profiel bekeek.</p>
    </Box>
  )
}
