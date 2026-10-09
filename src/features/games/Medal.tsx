import { ACHIEVEMENTS, type AchievementKey } from '../../../shared/achievements'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'

/** An achievement's icon in a round medal with a bronze, silver or gold rim. */
export function Medal({ achievement, small }: { achievement: AchievementKey; small?: boolean }) {
  const a = ACHIEVEMENTS[achievement]
  return (
    <span className={['ac-medal', a.tier, small && 'small'].filter(Boolean).join(' ')} title={`${a.name}: ${a.description}`}>
      <FarmIcon name={a.icon as FarmIconName} size={small ? 16 : 32} />
    </span>
  )
}
