import { FramedAvatar } from './FramedAvatar'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { FriendshipState, Profile } from '../../../shared/api'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { statusIcon } from '../../lib/onlineStatus'
import { openChat } from '../messenger/messengerStore'
import { ReportButton } from '../../components/social/ReportButton'

/** Someone on Mastodon or another server that isn't Kuddes: you follow them (their public posts go to Overzicht → Fediverse). */
function FollowButton({ profile, remote }: { profile: Profile; remote: NonNullable<Profile['remote']> }) {
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (method: 'POST' | 'DELETE') => api<unknown>(`/users/${profile.username}/follow`, { method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.profile(profile.username) }),
  })
  return (
    <div className={`profile-friend ${remote.following === 'none' ? 'none' : 'friends'}`}>
      {remote.following === 'none' ? (
        <Button variant="cta" className="profile-friend-btn" disabled={change.isPending} onClick={() => change.mutate('POST')}>
          <FarmIcon name="add" /> Volgen
        </Button>
      ) : (
        <>
          <p>
            <FarmIcon name={remote.following === 'following' ? 'tick' : 'hourglass'} /> {remote.following === 'following' ? 'Je volgt' : 'Volgverzoek verstuurd'}
          </p>
          <button type="button" className="link-button" disabled={change.isPending} onClick={() => change.mutate('DELETE')}>
            Niet meer volgen
          </button>
        </>
      )}
      <p className="muted">Hun openbare berichten zie je in Overzicht → Fediverse.</p>
      {change.isError && <p className="form-error">{errorMessage(change.error)}</p>}
    </div>
  )
}

function FriendButton({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient()
  const state = profile.relation!.friendship

  const change = useMutation({
    mutationFn: (method: 'POST' | 'DELETE') =>
      api<{ friendship: FriendshipState }>(`/users/${profile.username}/friend`, { method }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.profile(profile.username) }),
        queryClient.invalidateQueries({ queryKey: keys.friendRequests }),
        queryClient.invalidateQueries({ queryKey: keys.me }),
      ]),
  })

  const link = (label: string, method: 'POST' | 'DELETE', confirmText?: string) => (
    <button
      type="button"
      className="link-button"
      disabled={change.isPending}
      onClick={() => {
        if (!confirmText || confirm(confirmText)) change.mutate(method)
      }}
    >
      {label}
    </button>
  )

  // Becoming friends is the main thing to do on someone's profile: a big button right under the photo
  return (
    <div className={`profile-friend ${state}`}>
      {state === 'none' &&
        (profile.befriendRefusal ? (
          // Their privacy setting: say so, instead of a button that can't work
          <p className="muted">
            <FarmIcon name="lock" /> {profile.befriendRefusal}
          </p>
        ) : (
          <Button variant="cta" className="profile-friend-btn" disabled={change.isPending} onClick={() => change.mutate('POST')}>
            <FarmIcon name="user_add" /> Voeg toe als vriend
          </Button>
        ))}
      {state === 'incoming' && (
        <>
          <p>
            <FarmIcon name="user_add" /> <b>{profile.nickname} wil vrienden worden!</b>
          </p>
          <Button variant="cta" className="profile-friend-btn" disabled={change.isPending} onClick={() => change.mutate('POST')}>
            <FarmIcon name="accept" /> Accepteren
          </Button>
          {link('Weigeren', 'DELETE')}
        </>
      )}
      {state === 'outgoing' && (
        <>
          <p>
            <FarmIcon name="hourglass" /> Verzoek verstuurd
          </p>
          {link('Verzoek intrekken', 'DELETE')}
        </>
      )}
      {state === 'friends' && (
        <>
          <p>
            <FarmIcon name="tick" /> Jullie zijn vrienden
          </p>
          {link('Vriendschap beëindigen', 'DELETE', `Vriendschap met ${profile.nickname} beëindigen?`)}
        </>
      )}
      {change.isError && <p className="form-error">{errorMessage(change.error)}</p>}
    </div>
  )
}

/** Left column: the big profile picture, respect and what you can do with this member. */
export function ProfileActions({ profile, onKnuffel }: { profile: Profile; onKnuffel: () => void }) {
  const queryClient = useQueryClient()
  const relation = profile.relation

  const respect = useMutation({
    mutationFn: () => api<{ respect: number }>(`/users/${profile.username}/respect`, { method: 'POST' }),
    onSuccess: async ({ respect: count }) => {
      // A refetch still in flight (e.g. after a friend request) would overwrite this with stale data
      await queryClient.cancelQueries({ queryKey: keys.profile(profile.username), exact: true })
      queryClient.setQueryData<Profile>(keys.profile(profile.username), (p) =>
        p && p.relation ? { ...p, respect: count, relation: { ...p.relation, respected: true } } : p,
      )
      queryClient.invalidateQueries({ queryKey: keys.profile(profile.username), exact: true })
    },
  })

  return (
    <div className="box profile-actions">
      <div className="box-con">
        <FramedAvatar frame={profile.avatarFrame}>
          <Avatar user={profile} size="xlarge" static />
        </FramedAvatar>
        <p className={profile.online ? 'profile-online' : 'profile-online offline'}>
          <FarmIcon name={statusIcon(profile.onlineStatus, profile.online)} /> {profile.online ? profile.onlineStatus : 'Offline'}
        </p>

        {relation &&
          !relation.isSelf &&
          // Mastodon and the like: following, unless they're already a friend (they followed you and you accepted)
          (profile.remote && !profile.remote.weide && relation.friendship === 'none' ? <FollowButton profile={profile} remote={profile.remote} /> : <FriendButton profile={profile} />)}

        <div className="respect">
          <span className="respect-count">{profile.respect.toLocaleString('nl-NL')}</span>
          <span className="muted">respect</span>
          {relation && !relation.isSelf && (
            <Button disabled={relation.respected || respect.isPending} onClick={() => respect.mutate()}>
              {relation.respected ? 'Respect gegeven!' : 'Geef respect'}
            </Button>
          )}
          {respect.isError && <p className="form-error">{errorMessage(respect.error)}</p>}
        </div>

        {!relation && (
          <p className="profile-actions-login">
            <Link to="/inloggen">Log in</Link> of <Link to="/aanmelden">meld je aan</Link> om {profile.nickname} respect te
            geven of vrienden te worden.
          </p>
        )}

        {relation && !relation.isSelf && (
          <ul className="profile-action-list">
            {/* Messenger stays on this server: not with friends elsewhere (yet) */}
            {relation.friendship === 'friends' && !profile.remote && (
              <li>
                <button type="button" className="link-button" onClick={() => openChat(profile.username)}>
                  <FarmIcon name="user_comment" /> Chat met {profile.nickname}
                </button>
              </li>
            )}
            <li>
              {profile.canMessage ? (
                <Link to={`/berichten/nieuw?aan=${profile.username}`}>
                  <FarmIcon name="email_add" /> Stuur een bericht
                </Link>
              ) : (
                <span className="muted" title={`${profile.nickname} ontvangt nu geen berichten van jou`}>
                  <FarmIcon name="lock" /> Geen berichten mogelijk
                </span>
              )}
            </li>
            <li>
              <button type="button" className="link-button" onClick={onKnuffel}>
                <FarmIcon name="pencil" /> Knuffel achterlaten
              </button>
            </li>
            <li className="profile-report">
              <FarmIcon name="flag_red" /> <ReportButton kind="profiel" targetId={profile.id} authorId={profile.id} look="link" />
            </li>
          </ul>
        )}

        {relation?.isSelf && (
          <ul className="profile-action-list">
            <li>
              <Link to="/instellingen">
                <FarmIcon name="vcard" /> Profiel bewerken
              </Link>
            </li>
            <li>
              <Link to="/instellingen#foto">
                <FarmIcon name="camera" /> Profielfoto wijzigen
              </Link>
            </li>
            <li>
              <Link to="/instellingen#design">
                <FarmIcon name="paintcan" /> Pimp je profiel
              </Link>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
