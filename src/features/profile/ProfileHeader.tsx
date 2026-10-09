import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '../../../shared/api'
import { resolveSkinFor } from '../../../shared/skins'
import { useSiteDark } from '../../lib/useSiteDark'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { BotBadge } from '../../components/ui/BotBadge'
import { useServerInfo } from '../federation/serverInfo'
import '../federation/Federation.css'

export type ProfileTab = 'over' | 'wiewatwaars' | 'vrienden' | 'fotos' | 'knuffels' | 'buddypoke'

const TABS: { key: ProfileTab; label: (p: Profile) => string }[] = [
  { key: 'over', label: () => 'Over' },
  { key: 'wiewatwaars', label: () => 'WieWatWaars' },
  { key: 'vrienden', label: (p) => `Vrienden (${p.friendCount})` },
  { key: 'fotos', label: (p) => `Foto's (${p.photoCount})` },
  { key: 'knuffels', label: () => 'Knuffels' },
  { key: 'buddypoke', label: () => 'BuddyPoke' },
]

type ProfileHeaderProps = {
  profile: Profile
  tab: ProfileTab
  onTab: (tab: ProfileTab) => void
  useSkin: boolean
  onToggleSkin: () => void
  editingLayout: boolean
  onEditLayout: () => void
}

function CopyLinkButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        const url = `${location.origin}/profiel/${username}`
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          prompt('Kopieer de link naar dit profiel:', url)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      <FarmIcon name={copied ? 'accept' : 'link'} /> {copied ? 'Gekopieerd!' : 'Kopieer link'}
    </button>
  )
}

/** Name, small avatar and the profile's own tab menu. */
export function ProfileHeader({ profile, tab, onTab, useSkin, onToggleSkin, editingLayout, onEditLayout }: ProfileHeaderProps) {
  const skin = resolveSkinFor(profile.skin, profile.profileColors, useSiteDark())
  const isSelf = profile.relation?.isSelf
  const server = useServerInfo()

  return (
    <div className="box profile-hdr">
      <div className="profile-hdr-info">
        <Avatar user={profile} size="small" />
        <div>
          <h1>
            {profile.name} {profile.nickname !== profile.name && <small>({profile.nickname})</small>} <BotBadge user={profile} />
            {profile.birthdayToday && (
              <span className="profile-birthday" title={isSelf ? 'Gefeliciteerd!' : `${profile.nickname} is vandaag jarig!`}>
                <FarmIcon name="cake" /> Jarig!
              </span>
            )}
          </h1>
          {/* The full address: how people on other servers (Kuddes, Mastodon…) find this profile */}
          <p className="fd-handle" title="Het adres van dit profiel in het Kuddes-netwerk en de fediverse">
            @{profile.remote ? profile.username : `${profile.username}@${server?.domain ?? location.host}`}
          </p>
          <nav aria-label="Profielmenu">
            <ul className="profile-menu">
              {TABS.filter((t) => t.key !== 'buddypoke' || profile.relation?.isSelf).map((t) => (
                <li key={t.key} className={t.key === tab ? 'current' : undefined}>
                  <button type="button" onClick={() => onTab(t.key)} aria-current={t.key === tab ? 'page' : undefined}>
                    {t.label(profile)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <div className="profile-hdr-optns">
        {isSelf && (
          <>
            <Link to="/instellingen">
              <FarmIcon name="pencil" /> Bewerken
            </Link>
            <button type="button" className="link-button" onClick={onEditLayout} disabled={editingLayout} aria-pressed={editingLayout}>
              <FarmIcon name="layout_edit" /> Indeling
            </button>
            <Link to="/instellingen#design">
              <FarmIcon name="paintcan" /> Kleuren
            </Link>
            <Link to="/profielkaartje" title="Je profielkaartje voor andere sites">
              <FarmIcon name="vcard" /> Kaartje
            </Link>
          </>
        )}
        <CopyLinkButton username={profile.username} />
        {skin && (
          <>
            <button type="button" className="link-button" onClick={onToggleSkin} title={useSkin ? `Design: ${skin.name}` : undefined}>
              <FarmIcon name={useSkin ? 'eye_close' : 'eye'} /> {useSkin ? 'Standaard design' : 'Toon eigen design!'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
