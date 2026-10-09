import { FarmIcon } from '../components/ui/FarmIcon'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Me, UserSummary } from '../../shared/api'
import { RequireAuth } from '../components/layout/RequireAuth'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { api, errorMessage } from '../lib/api'
import { keys, useFriendRequests, useFriends } from '../lib/queries'
import { formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './AccountPages.css'
import { RelationRequests } from '../features/relations/Relations'

function useFriendAction(me: Me) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ username, method }: { username: string; method: 'POST' | 'DELETE' }) =>
      api<void>(`/users/${username}/friend`, { method }),
    onSuccess: (_, { username }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.friendRequests }),
        queryClient.invalidateQueries({ queryKey: keys.me }),
        queryClient.invalidateQueries({ queryKey: keys.friends(me.username) }),
        queryClient.invalidateQueries({ queryKey: keys.profile(username) }),
        queryClient.invalidateQueries({ queryKey: keys.profile(me.username) }),
      ]),
  })
}

function MemberRow({ user, meta, children }: { user: UserSummary; meta?: string; children?: React.ReactNode }) {
  return (
    <li>
      <Avatar user={user} size="small" />
      <div className="member-list-info">
        <Link to={`/profiel/${user.username}`} className="buzz-name">
          {user.nickname}
        </Link>{' '}
        <span className="muted">({user.name})</span>
        {meta && <div className="date">{meta}</div>}
      </div>
      {children && <div className="member-list-actions">{children}</div>}
    </li>
  )
}

function FriendsOverview({ me }: { me: Me }) {
  const requests = useFriendRequests(true)
  const friends = useFriends(me.username)
  const action = useFriendAction(me)
  const incoming = requests.data?.incoming ?? []
  const outgoing = requests.data?.outgoing ?? []

  return (
    <main className="page page-con">
      <h1>Vrienden</h1>
      <br />
      <div className="cols">
        <div>
          <RelationRequests />
          <Box title={`Vriendschapsverzoeken (${incoming.length})`} icon="group_add">
            {incoming.length === 0 ? (
              <p className="empty">Geen nieuwe verzoeken.</p>
            ) : (
              <ul className="member-list">
                {incoming.map(({ user, createdAt }) => (
                  <MemberRow key={user.id} user={user} meta={`wil je vriend worden · ${formatTime(createdAt)}`}>
                    <Button disabled={action.isPending} onClick={() => action.mutate({ username: user.username, method: 'POST' })}>
                      Accepteren
                    </Button>
                    <Button disabled={action.isPending} onClick={() => action.mutate({ username: user.username, method: 'DELETE' })}>
                      Weigeren
                    </Button>
                  </MemberRow>
                ))}
              </ul>
            )}
            {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
          </Box>

          <Box title={`Mijn vrienden (${friends.data?.length ?? 0})`} icon="group">
            {friends.isLoading ? (
              <p className="muted">Laden…</p>
            ) : !friends.data?.length ? (
              <p className="empty">
                Nog geen vrienden. <Link to="/zoeken">Zoek leden</Link> die je kent!
              </p>
            ) : (
              <ul className="member-list">
                {friends.data.map((friend) => (
                  <MemberRow key={friend.id} user={friend} meta={friend.online ? 'online' : undefined}>
                    <Link to={`/berichten/nieuw?aan=${friend.username}`} className="btn" title={`Stuur ${friend.nickname} een bericht`}>
                      <FarmIcon name="email_add" /> Bericht
                    </Link>
                    <Link to={`/profiel/${friend.username}?tab=knuffels`} className="btn">
                      <FarmIcon name="pencil" /> Knuffel
                    </Link>
                  </MemberRow>
                ))}
              </ul>
            )}
          </Box>
        </div>
        <aside className="sticky-side">
          <Box title="Verstuurde verzoeken" icon="time">
            {outgoing.length === 0 ? (
              <p className="empty">Je wacht op niemand.</p>
            ) : (
              <ul className="member-list">
                {outgoing.map(({ user, createdAt }) => (
                  <MemberRow key={user.id} user={user} meta={formatTime(createdAt)}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => action.mutate({ username: user.username, method: 'DELETE' })}
                    >
                      Intrekken
                    </button>
                  </MemberRow>
                ))}
              </ul>
            )}
          </Box>
        </aside>
      </div>
    </main>
  )
}

export function FriendsPage() {
  usePageTitle('Vrienden - Kuddes')
  return <RequireAuth>{(me) => <FriendsOverview me={me} />}</RequireAuth>
}
