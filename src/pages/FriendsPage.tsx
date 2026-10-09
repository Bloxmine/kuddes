import { FarmIcon } from '../components/ui/FarmIcon'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { FediverseFollows, Me, UserSummary } from '../../shared/api'
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
import { useServerInfo } from '../features/federation/serverInfo'
import '../features/federation/Federation.css'

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

/** Who you follow on Mastodon, Pixelfed and the like, and who follows you from there. */
function FediverseFollowsBox() {
  const queryClient = useQueryClient()
  const server = useServerInfo()
  const { data } = useQuery({ queryKey: ['fediverse-follows'], queryFn: () => api<FediverseFollows>('/me/fediverse-follows') })
  const unfollow = useMutation({
    mutationFn: (username: string) => api<unknown>(`/users/${username}/follow`, { method: 'DELETE' }),
    onSuccess: (_, username) =>
      Promise.all([queryClient.invalidateQueries({ queryKey: ['fediverse-follows'] }), queryClient.invalidateQueries({ queryKey: keys.profile(username) })]),
  })
  if (!data || (!server?.fediverse && !data.following.length && !data.followers.length)) return null
  return (
    <Box title="Buiten Kuddes" icon="world_link">
      <h3 className="fd-h">Je volgt ({data.following.length})</h3>
      {data.following.length === 0 ? (
        <p className="empty">
          Je volgt nog niemand op Mastodon, Pixelfed of een andere server. Zoek iemand op met <b>@naam@server</b>.
        </p>
      ) : (
        <ul className="member-list">
          {data.following.map((u) => (
            <MemberRow key={u.id} user={u} meta={`@${u.username}${u.accepted ? '' : ' · volgverzoek verstuurd'}`}>
              <Button disabled={unfollow.isPending} onClick={() => confirm(`${u.nickname} niet meer volgen?`) && unfollow.mutate(u.username)}>
                Niet meer volgen
              </Button>
            </MemberRow>
          ))}
        </ul>
      )}
      <h3 className="fd-h">Volgen jou ({data.followers.length})</h3>
      {data.followers.length === 0 ? (
        <p className="empty">Nog niemand van buiten Kuddes. Mensen op Mastodon of Pixelfed vinden je als @jouwnaam@{server?.domain ?? 'deze-server'}.</p>
      ) : (
        <ul className="member-list">
          {data.followers.map((u) => (
            <MemberRow key={u.id} user={u} meta={`@${u.username}`} />
          ))}
        </ul>
      )}
      {unfollow.isError && <p className="form-error">{errorMessage(unfollow.error)}</p>}
    </Box>
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

          <FediverseFollowsBox />
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
