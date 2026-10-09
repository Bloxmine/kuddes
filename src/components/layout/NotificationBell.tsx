import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Me, Notification, NotificationList } from '../../../shared/api'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { Avatar } from '../ui/Avatar'
import { Dropdown } from '../ui/Dropdown'
import { FarmIcon } from '../ui/FarmIcon'
import type { FarmIconName } from '../ui/farmIcons'
import './NotificationBell.css'

const KIND_ICONS: Record<Notification['kind'], FarmIconName> = { knuffel: 'teddy_bear', mention: 'user_comment', reactie: 'comments', radio: 'transmit', forum: 'comment_box', kudde: 'tag_blue', suggestie: 'lightbulb' }

/**
 * The bell in the top bar: friend and relation requests, and notifications
 * (a knuffel on your profile, a mention, a reaction on what you posted).
 * Opening it marks them as seen.
 */
export function NotificationBell({ user }: { user: Me }) {
  const requests = user.pendingFriendRequests + user.pendingRelationRequests
  const count = requests + user.unreadNotifications
  return (
    <span className="notif-bell">
      <Dropdown
        align="right"
        bubble
        buttonClassName="topbar-icon"
        title={count ? `${count} ${count === 1 ? 'nieuwe melding' : 'nieuwe meldingen'}` : 'Meldingen'}
        label={
          <>
            <FarmIcon name="bell" size={20} />
            {count > 0 && <span className="badge farm-badge topbar-badge">{count > 99 ? '99+' : count}</span>}
          </>
        }
      >
        {(close) => <NotificationPanel user={user} close={close} />}
      </Dropdown>
    </span>
  )
}

function NotificationPanel({ user, close }: { user: Me; close: () => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: keys.notifications, queryFn: () => api<NotificationList>('/notifications') })
  const unread = data?.unread ?? 0

  // Seen now: the bell goes quiet (the list keeps showing what was new)
  useEffect(() => {
    if (!unread) return
    queryClient.setQueryData<Me | null>(keys.me, (m) => (m ? { ...m, unreadNotifications: 0 } : m))
    void api<void>('/notifications/read', { method: 'POST' }).catch(() => undefined)
  }, [unread, queryClient])

  const friends = user.pendingFriendRequests
  const relations = user.pendingRelationRequests
  return (
    <div className="notif-panel">
      <div className="notif-hdr">Meldingen</div>
      {(friends > 0 || relations > 0) && (
        <div className="notif-requests">
          {friends > 0 && (
            <Link to="/vrienden" onClick={close}>
              <FarmIcon name="user_add" /> <span>{friends === 1 ? 'Iemand wil je vriend worden' : `${friends} mensen willen je vriend worden`}</span>
            </Link>
          )}
          {relations > 0 && (
            <Link to="/vrienden" onClick={close}>
              <FarmIcon name="heart" /> <span>{relations === 1 ? 'Een verzoek voor een relatie' : `${relations} verzoeken voor een relatie`}</span>
            </Link>
          )}
        </div>
      )}
      {isLoading ? (
        <p className="notif-empty muted">Laden…</p>
      ) : !data?.items.length ? (
        <p className="notif-empty muted">
          Nog geen meldingen. Hier zie je het als iemand je knuffelt, je noemt met <b>@{user.username}</b> of reageert op wat je plaatst.
        </p>
      ) : (
        <ul className="notif-list">
          {data.items.map((n) => (
            <li key={n.id}>
              <Link to={n.link} onClick={close} className={n.read ? undefined : 'new'}>
                <span className="notif-pic">
                  <Avatar user={n.actor} size="tiny" static />
                  <FarmIcon name={KIND_ICONS[n.kind]} className="notif-kind" />
                </span>
                <span className="notif-text">
                  <span>
                    <b>{n.actor.nickname}</b> {n.message}
                  </span>
                  {n.snippet && <q>{n.snippet}</q>}
                  <time dateTime={n.createdAt}>{formatTime(n.createdAt)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/vrienden" className="notif-foot" onClick={close}>
        <FarmIcon name="group" /> Vrienden en verzoeken
      </Link>
    </div>
  )
}
