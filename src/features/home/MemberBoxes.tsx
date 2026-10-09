import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { useBirthdays, usePhotos } from '../../lib/queries'

function greeting(hour = new Date().getHours()) {
  if (hour < 6) return 'Goedenacht'
  if (hour < 12) return 'Goedemorgen'
  if (hour < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/** What's still missing from your profile, as steps to finish it. */
function profileSteps(user: Me, photoCount: number): { done: boolean; label: string; to: string }[] {
  return [
    { done: !!user.avatarUrl, label: 'Profielfoto', to: '/instellingen#foto' },
    { done: !!user.about, label: 'Iets over jezelf', to: '/instellingen#gegevens' },
    { done: !!user.city, label: 'Woonplaats', to: '/instellingen#gegevens' },
    { done: !!user.birthdate, label: 'Verjaardag', to: '/instellingen#gegevens' },
    { done: user.music.length + user.brands.length > 0, label: 'Muziek of merken', to: '/instellingen#gegevens' },
    { done: photoCount > 0, label: 'Een foto', to: `/profiel/${user.username}?tab=fotos` },
  ]
}

/**
 * "Jij": your corner of Home, like the left column of the old Hyves start
 * page. Your photo and a greeting, your menu, and the next step to finish
 * your profile.
 */
export function WelcomeBox({ user, onEditHome }: { user: Me; onEditHome: () => void }) {
  const { data: photos } = usePhotos(user.username)
  const steps = profileSteps(user, photos?.length ?? 0)
  const done = steps.filter((s) => s.done).length
  const percent = Math.round((done / steps.length) * 100)
  const next = steps.find((s) => !s.done)

  const menu: { icon: FarmIconName; label: string; to: string; badge?: number }[] = [
    { icon: 'user', label: 'Mijn profiel', to: `/profiel/${user.username}` },
    { icon: 'newspaper', label: 'Overzicht', to: '/tijdlijn' },
    { icon: 'email', label: 'Berichten', to: '/berichten' },
    { icon: 'group', label: 'Vrienden', to: '/vrienden', badge: user.pendingFriendRequests },
    { icon: 'images', label: "Foto's", to: `/profiel/${user.username}?tab=fotos` },
    { icon: 'controller', label: 'Spellen', to: '/spellen' },
    { icon: 'cog', label: 'Instellingen', to: '/instellingen' },
  ]

  return (
    <Box title="Jij" icon="house" className="welcome-box">
      <div className="welcome-me">
        <Avatar user={user} size="small" static />
        <div>
          <span className="muted">{greeting()},</span>
          <Link to={`/profiel/${user.username}`} className="welcome-name">
            {user.nickname}
          </Link>
        </div>
      </div>
      {percent < 100 && (
        <div className="profile-progress">
          <div className="profile-progress-hdr">
            <b>Profiel {percent}% af</b>
            {next && (
              <Link to={next.to}>
                <FarmIcon name="add" /> {next.label}
              </Link>
            )}
          </div>
          <div className="profile-progress-bar" role="progressbar" aria-label="Je profiel is af" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      <ul className="welcome-menu">
        {menu.map((m) => (
          <li key={m.label}>
            <Link to={m.to}>
              <FarmIcon name={m.icon} />
              {m.label}
              {!!m.badge && <span className="welcome-badge">{m.badge}</span>}
            </Link>
          </li>
        ))}
        <li>
          <button type="button" onClick={onEditHome}>
            <FarmIcon name="layout_edit" />
            Home aanpassen
          </button>
        </li>
      </ul>
    </Box>
  )
}

/** Friends with a birthday today or this week. */
export function BirthdaysBox() {
  const { data: birthdays = [], isLoading } = useBirthdays(true)
  return (
    <Box title="Jarige vrienden" icon="cake" className="birthdays">
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : birthdays.length === 0 ? (
        <p className="empty">Deze week is er geen vriend jarig.</p>
      ) : (
        <ul>
          {birthdays.map((b) => (
            <li key={b.user.id} className={b.inDays === 0 ? 'today' : undefined}>
              <Avatar user={b.user} size="small" />
              <div>
                <Link to={`/profiel/${b.user.username}`} className="timeline-name">
                  {b.user.nickname}
                </Link>
                <span className="muted">
                  {b.inDays === 0 ? 'Vandaag jarig!' : b.inDays === 1 ? 'Morgen jarig' : `Over ${b.inDays} dagen jarig`}
                  {b.turns !== null && ` · wordt ${b.turns}`}
                </span>
                {b.inDays === 0 && (
                  <Link to={`/profiel/${b.user.username}?tab=knuffels`} className="birthday-knuffel">
                    Feliciteer met een knuffel
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
