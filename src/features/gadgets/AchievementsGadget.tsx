import { Link } from 'react-router-dom'
import { ACHIEVEMENTS, isAchievementKey, type AchievementKey } from '../../../shared/achievements'
import type { Gadget } from '../../../shared/api'
import { Medal } from '../games/Medal'
import '../games/Games.css'

type AchievementsData = Extract<Gadget, { type: 'prestaties' }>

/** The medals to show: the ones picked (if earned), or the latest earned. */
function showcase(gadget: AchievementsData): AchievementKey[] {
  const earned = gadget.achievements.achievements.filter((a) => a.unlockedAt)
  const picked = gadget.config.featured.filter((k): k is AchievementKey => isAchievementKey(k) && earned.some((a) => a.key === k))
  if (picked.length) return picked
  return [...earned]
    .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
    .slice(0, 8)
    .map((a) => a.key)
}

/** Prestaties on a profile: a shelf of medals and the game stats. */
export function AchievementsGadget({ gadget, username, isOwner }: { gadget: AchievementsData; username: string; isOwner: boolean }) {
  const { unlocked, total, stats } = gadget.achievements
  const shelf = showcase(gadget)
  const ratio = stats.played ? Math.round((stats.won / stats.played) * 100) : 0
  return (
    <div className="ac-gadget">
      {shelf.length === 0 ? (
        <p className="empty">
          Nog geen prestaties.{isOwner && <> <Link to="/spellen">Speel een potje</Link> of doe mee op Kuddes!</>}
        </p>
      ) : (
        <ul className="ac-shelf">
          {shelf.map((k) => (
            <li key={k} title={`${ACHIEVEMENTS[k].name}: ${ACHIEVEMENTS[k].description}`}>
              <Medal achievement={k} />
              <span>{ACHIEVEMENTS[k].name}</span>
            </li>
          ))}
        </ul>
      )}
      {gadget.config.showStats && (
        <div className="gh-stats">
          <div>
            <b>{stats.played}</b>
            <span>potjes</span>
          </div>
          <div>
            <b>{stats.won}</b>
            <span>gewonnen</span>
          </div>
          <div>
            <b>{ratio}%</b>
            <span>winst</span>
          </div>
        </div>
      )}
      <Link to={`/prestaties/${username}`} className="gadget-note muted">
        {unlocked} van {total} prestaties »
      </Link>
    </div>
  )
}
