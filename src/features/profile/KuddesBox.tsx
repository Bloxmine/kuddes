import { Link } from 'react-router-dom'
import type { Profile } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Tile } from '../../components/ui/TileGrid'
import { useUserKuddes } from '../../lib/queries'

/** The Kuddes this member joined. */
export function ProfileKuddesBox({ profile }: { profile: Profile }) {
  const { data: kuddes = [] } = useUserKuddes(profile.username)
  if (!kuddes.length && !profile.relation?.isSelf) return null

  return (
    <Box title={`Kuddes (${kuddes.length})`} icon="tag_blue">
      {kuddes.length === 0 ? (
        <p className="empty">
          Je bent nog geen lid van een Kudde. <Link to="/kuddes">Bekijk de Kuddes</Link>
        </p>
      ) : (
        <ul className="tile-grid kudde-grid">
          {kuddes.slice(0, 6).map((b) => (
            <li key={b.slug}>
              <Tile
                to={`/kuddes/${b.slug}`}
                imageUrl={b.imageUrl}
                fallback={b.name}
                title={b.name}
                subtitle={`${b.memberCount} ${b.memberCount === 1 ? 'lid' : 'leden'}`}
              />
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
