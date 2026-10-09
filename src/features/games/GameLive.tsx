import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ACHIEVEMENTS, type AchievementKey } from '../../../shared/achievements'
import { useAuth } from '../../lib/auth'
import { useLive } from './gameQueries'
import { Medal } from './Medal'
import './Games.css'

/** How long an achievement pop-up stays. */
const ACHIEVEMENT_MS = 7000

/**
 * Pop-ups in the corner, on every page, when you earn an achievement.
 * Invites to games (and who said yes) arrive in Kuddes Messenger.
 */
export function GameLive() {
  const { user, waiting } = useAuth()
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const { data } = useLive(!!user && !waiting && visible)

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // New achievements arrive once (the server marks them seen); each shows for a few
  // seconds, or until you close it
  const [earned, setEarned] = useState<AchievementKey[]>([])
  const shownBefore = useRef(new Set<AchievementKey>())
  const timers = useRef<number[]>([])
  useEffect(() => {
    const fresh = (data?.achievements ?? []).filter((k) => !shownBefore.current.has(k))
    if (!fresh.length) return
    fresh.forEach((k) => shownBefore.current.add(k))
    setEarned((e) => [...e, ...fresh].slice(-4))
    // Not cleared when the next check comes in (that would keep them up forever)
    timers.current.push(window.setTimeout(() => setEarned((e) => e.filter((k) => !fresh.includes(k))), ACHIEVEMENT_MS))
  }, [data?.achievements])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  const closeAchievement = (key: AchievementKey) => setEarned((e) => e.filter((k) => k !== key))

  if (!user || !earned.length) return null

  return (
    <div className="gl-toasts" role="status" aria-live="polite">
      {earned.map((key) => (
        <div key={key} className="gl-toast achievement">
          <Link to={`/prestaties/${user.username}`} className="gl-achievement-link" onClick={() => closeAchievement(key)}>
            <Medal achievement={key} />
            <div>
              <b>Prestatie verdiend!</b>
              <span>
                {ACHIEVEMENTS[key].name}: {ACHIEVEMENTS[key].description}
              </span>
            </div>
          </Link>
          <button type="button" className="gl-close" aria-label="Sluiten" title="Sluiten" onClick={() => closeAchievement(key)}>
            ×
          </button>
          <span className="gl-timer" style={{ animationDuration: `${ACHIEVEMENT_MS}ms` }} aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
