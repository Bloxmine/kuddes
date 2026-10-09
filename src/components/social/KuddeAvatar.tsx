import { Link } from 'react-router-dom'
import { seededGradient } from '../../lib/placeholder'

/** A Kudde's picture in the frame of a profile photo, for a WieWatWaar posted as the Kudde. */
export function KuddeAvatar({ kudde, size = 50 }: { kudde: { slug: string; name: string; imageUrl: string | null }; size?: number }) {
  return (
    <div className="avatar" style={{ width: size + 8 }}>
      <Link to={`/kuddes/${kudde.slug}`} className="avatar-link" title={kudde.name}>
        {kudde.imageUrl ? (
          <img className="avatar-img" src={kudde.imageUrl} width={size} height={size} alt="" loading="lazy" style={{ objectFit: 'cover' }} />
        ) : (
          <span className="avatar-img" style={{ width: size, height: size, background: seededGradient(kudde.name) }} aria-hidden="true" />
        )}
        <span className="visually-hidden">{kudde.name}</span>
      </Link>
    </div>
  )
}
