import { Link, Navigate, useParams } from 'react-router-dom'
import { ACHIEVEMENTS, ACHIEVEMENT_CATEGORIES, type AchievementCategory } from '../../../shared/achievements'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { useAchievements, useUserGames } from '../../features/games/gameQueries'
import { Medal } from '../../features/games/Medal'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useProfile } from '../../lib/queries'
import { formatDate } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'
import { RecentGame, StatsGrid } from './GamesPage'
import '../../features/games/Games.css'

export function AchievementsPage() {
  const username = (useParams().username ?? '').toLowerCase()
  const { user } = useAuth()
  // /prestaties/@me from the menu
  if (username === '@me') return user ? <Navigate to={`/prestaties/${user.username}`} replace /> : <Navigate to="/inloggen?next=/prestaties/@me" replace />
  return <Achievements username={username} isMe={user?.username === username} />
}

function Achievements({ username, isMe }: { username: string; isMe: boolean }) {
  const { data: profile } = useProfile(username)
  const { data, error, isLoading } = useAchievements(username)
  const { data: games = [] } = useUserGames(username)
  usePageTitle(`Prestaties van ${profile?.name ?? username} - Kuddes`)
  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!data) return <main className="page page-con form-error">{errorMessage(error)}</main>

  const categories = Object.keys(ACHIEVEMENT_CATEGORIES) as AchievementCategory[]
  const pct = Math.round((data.unlocked / data.total) * 100)
  return (
    <main className="page page-con gh-layout">
      <div className="gm-page">
        <Box title={isMe ? 'Mijn prestaties' : `Prestaties van ${profile?.nickname ?? username}`} icon="award_star_gold_1">
          <div className="ac-summary">
            {profile && <Avatar user={profile} size="small" />}
            <span>
              <b>{data.unlocked}</b> van de {data.total} prestaties verdiend
            </span>
            <span className="ac-summary-bar" aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
            <b>{pct}%</b>
          </div>
        </Box>
        {categories.map((cat) => {
          const items = data.achievements.filter((a) => ACHIEVEMENTS[a.key].category === cat)
          return (
            <Box key={cat} title={ACHIEVEMENT_CATEGORIES[cat].name} icon={ACHIEVEMENT_CATEGORIES[cat].icon as FarmIconName}>
              <div className="ac-grid">
                {items.map((a) => {
                  const def = ACHIEVEMENTS[a.key]
                  return (
                    <div key={a.key} className={a.unlockedAt ? 'ac-item' : 'ac-item locked'}>
                      <Medal achievement={a.key} />
                      <div>
                        <b>{def.name}</b>
                        <span className="muted">{def.description}</span>
                        {a.unlockedAt ? (
                          <span className="muted"> · {formatDate(a.unlockedAt)}</span>
                        ) : (
                          def.target > 1 && (
                            <>
                              <div className="ac-progress" aria-label={`${a.progress} van ${def.target}`}>
                                <span style={{ width: `${(a.progress / def.target) * 100}%` }} />
                              </div>
                              <span className="muted">
                                {a.progress} / {def.target}
                              </span>
                            </>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Box>
          )
        })}
      </div>
      <aside className="gh-side sticky-side">
        <Box title="Spelstatistieken" icon="chart_bar">
          <StatsGrid stats={data.stats} />
          <Link to="/spellen" className="gs-more">
            <FarmIcon name="controller" /> Naar Spellen »
          </Link>
        </Box>
        {games.length > 0 && (
          <Box title="Laatste potjes" icon="time">
            <ul className="gh-list">
              {games.map((g) => (
                <RecentGame key={g.id} game={g} player={username} />
              ))}
            </ul>
          </Box>
        )}
        {isMe && (
          <Box title="Op je profiel" icon="plugin">
            <p>
              Laat je mooiste prestaties zien met de gadget <b>Prestaties</b>. <Link to="/gadgetmarkt?q=prestaties">Voeg hem toe</Link>.
            </p>
          </Box>
        )}
      </aside>
    </main>
  )
}
