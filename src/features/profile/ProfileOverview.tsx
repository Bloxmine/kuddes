import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '../../../shared/api'
import { BuzzItem } from '../../components/social/BuzzItem'
import { StatusComposer } from '../../components/social/StatusComposer'
import { Box } from '../../components/ui/Box'
import { useAllUserStatuses, useUserStatuses } from '../../lib/queries'
import { Button } from '../../components/ui/Button'
import { withSmileys } from '../../lib/smileys'
import { formatDate } from '../../lib/time'
import { RelationRows } from '../relations/Relations'
import { GAMER_PLATFORMS, INTERESTS, type GamerPlatform, type InterestKey } from '../../../shared/profileExtras'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'

const GENDER_LABEL = { man: 'man', vrouw: 'vrouw', anders: 'anders' } as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  )
}

const allLink = (username: string) => `/profiel/${username}?tab=wiewatwaars`

/**
 * WieWatWaar box with the member's latest status (and the composer on your own
 * profile). "Eerdere bekijken" opens the few before it right here; the
 * WieWatWaars tab has all of them.
 */
export function ProfileStatus({ profile }: { profile: Profile }) {
  const { data } = useUserStatuses(profile.username)
  const [open, setOpen] = useState(false)
  const items = data?.items ?? []
  const latest = items[0]
  const isSelf = profile.relation?.isSelf
  if (!latest && !isSelf) return null
  const shown = open ? items : items.slice(0, 1)

  return (
    <Box
      title="WieWatWaar"
      icon="comment"
      className="profile-status"
      actions={latest && <Link to={allLink(profile.username)}>Alle</Link>}
    >
      {isSelf && <StatusComposer compact />}
      {latest ? (
        shown.map((s) => <BuzzItem key={s.id} status={s} showAvatar={false} />)
      ) : (
        <p className="empty">Je hebt nog geen WieWatWaar geplaatst.</p>
      )}
      {items.length > 1 && (
        <p className="profile-status-more">
          {open ? (
            <>
              <button type="button" className="link-button" onClick={() => setOpen(false)}>
                Minder tonen
              </button>
              {data?.nextCursor && (
                <>
                  {' · '}
                  <Link to={allLink(profile.username)}>Nog oudere bekijken</Link>
                </>
              )}
            </>
          ) : (
            <button type="button" className="link-button" onClick={() => setOpen(true)}>
              <FarmIcon name="arrow_down" /> Eerdere bekijken
            </button>
          )}
        </p>
      )}
    </Box>
  )
}

/** The "WieWatWaars" tab: all of them, newest first, with older ones on request. */
export function ProfileStatusList({ profile }: { profile: Profile }) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAllUserStatuses(profile.username)
  const isSelf = profile.relation?.isSelf
  const items = data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Box title={isSelf ? 'Mijn WieWatWaars' : `WieWatWaars van ${profile.nickname}`} icon="comment" className="profile-status profile-status-all">
      {isSelf && <StatusComposer compact />}
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : items.length === 0 ? (
        <p className="empty">{isSelf ? 'Je hebt nog geen WieWatWaar geplaatst.' : `${profile.nickname} heeft nog geen WieWatWaar geplaatst.`}</p>
      ) : (
        items.map((s) => <BuzzItem key={s.id} status={s} showAvatar={false} />)
      )}
      {hasNextPage && (
        <p className="profile-status-more">
          <Button disabled={isFetchingNextPage} onClick={() => fetchNextPage()}>
            {isFetchingNextPage ? 'Laden…' : 'Oudere laden'}
          </Button>
        </p>
      )}
    </Box>
  )
}

/** "Profiel" box: the facts, about-me text and interests. */
export function ProfileOverview({ profile }: { profile: Profile }) {
  const personal = [profile.age !== null && `${profile.age} jaar`, profile.gender && GENDER_LABEL[profile.gender]]
    .filter(Boolean)
    .join(', ')
  const interests = (Object.keys(INTERESTS) as InterestKey[]).filter((k) => profile.interests[k] && k !== 'motto')
  const tags = (Object.keys(GAMER_PLATFORMS) as GamerPlatform[]).filter((k) => profile.gamerTags[k])
  const hasDetails = profile.about || profile.brands.length || profile.spots.length || profile.music.length || interests.length || profile.interests.motto

  // At the top or the bottom of the box, as the member chose (Instellingen, Over jou)
  const about = profile.about && (
    <div className={profile.aboutFirst ? 'profile-about first' : 'profile-about'}>
      <h3>Wie ben ik?</h3>
      <p>{withSmileys(profile.about)}</p>
    </div>
  )

  return (
    <Box title="Profiel" icon="vcard" className="profile-overview">
      {profile.aboutFirst && about}
      <table className="profile-table">
        <tbody>
          <Row label="Naam:">{profile.name}</Row>
          {personal && <Row label="Leeftijd:">{personal}</Row>}
          {profile.city && <Row label="Woonplaats:">{profile.city}</Row>}
          {profile.website && (
            <Row label="Website:">
              <a href={profile.website} target="_blank" rel="nofollow noopener noreferrer ugc" className="profile-website">
                <FarmIcon name="world_link" /> {profile.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </a>
            </Row>
          )}
          <RelationRows profile={profile} Row={Row} />
          <Row label="Lid sinds:">{formatDate(profile.createdAt)}</Row>
          <Row label="Bekeken:">{profile.views.toLocaleString('nl-NL')} x gezien</Row>
          {profile.brands.length > 0 && <Row label="Mijn merken:">{profile.brands.join(', ')}</Row>}
          {profile.spots.length > 0 && <Row label="Spots:">{profile.spots.join(', ')}</Row>}
          {profile.music.length > 0 && <Row label="Muziek:">{profile.music.join(', ')}</Row>}
          {interests.map((k) => (
            <Row key={k} label={`${INTERESTS[k].label}:`}>
              {withSmileys(profile.interests[k]!)}
            </Row>
          ))}
        </tbody>
      </table>

      {profile.interests.motto && <blockquote className="profile-motto">“{withSmileys(profile.interests.motto)}”</blockquote>}

      {tags.length > 0 && (
        <div className="profile-gamertags">
          <h3>
            <FarmIcon name="controller" /> Gamertags
          </h3>
          <ul>
            {tags.map((k) => (
              <li key={k} title={GAMER_PLATFORMS[k].label}>
                <span className={`gt-badge gt-${k}`}>
                  <FarmIcon name={GAMER_PLATFORMS[k].icon as FarmIconName} /> {GAMER_PLATFORMS[k].short}
                </span>
                <span className="gt-tag">{profile.gamerTags[k]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!profile.aboutFirst && about}
      {!hasDetails && profile.relation?.isSelf && (
        <p className="form-notice profile-empty-hint">
          Je profiel is nog best leeg! <Link to="/instellingen">Vertel iets over jezelf</Link>, je favoriete merken en
          muziek.
        </p>
      )}
    </Box>
  )
}
