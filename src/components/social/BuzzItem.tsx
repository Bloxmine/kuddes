import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Status } from '../../../shared/api'
import { api } from '../../lib/api'
import { keys } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import { Avatar } from '../ui/Avatar'
import { KuddeAvatar } from './KuddeAvatar'
import { SocialBar } from './SocialBar'
import { StatusBody } from './StatusBody'
import './BuzzItem.css'
import { FarmIcon } from '../ui/FarmIcon'
import { BotBadge } from '../ui/BotBadge'
import { ReportButton } from './ReportButton'

type BuzzItemProps = {
  status: Status
  showAvatar?: boolean
  /** Highlight briefly, for updates that just arrived. */
  fresh?: boolean
}

/** One WieWatWaar in a list, with respect and reactions. */
export function BuzzItem({ status, showAvatar = true, fresh }: BuzzItemProps) {
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: () => api<void>(`/statuses/${status.id}`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.allStatuses }),
        queryClient.invalidateQueries({ queryKey: keys.allTimeline }),
        queryClient.invalidateQueries({ queryKey: keys.userStatuses(status.user.username) }),
      ]),
  })

  if (remove.isSuccess) return null

  return (
    <article className={fresh ? 'buzz-item fresh' : 'buzz-item'}>
      {showAvatar && (status.kudde ? <KuddeAvatar kudde={status.kudde} /> : <Avatar user={status.user} size="small" />)}
      <div className="buzz-body">
        {status.kudde ? (
          <>
            <Link to={`/kuddes/${status.kudde.slug}`} className="buzz-name">
              {status.kudde.name}
            </Link>{' '}
            <span className="muted">
              (door <Link to={`/profiel/${status.user.username}`}>{status.user.nickname}</Link>)
            </span>
          </>
        ) : (
          <>
            <Link to={`/profiel/${status.user.username}`} className="buzz-name">
              {status.user.nickname}
            </Link>
            <BotBadge user={status.user} />
          </>
        )}
        <StatusBody status={status} />
        <div className="buzz-actions">
          <time className="date" dateTime={status.createdAt}>
            {formatTime(status.createdAt)}
          </time>
          {status.visibility === 'vrienden' && <span title="Alleen voor vrienden">
              {' · '}
              <FarmIcon name="group" /> vrienden
            </span>}
          {!status.canDelete && <ReportButton kind="wiewatwaar" targetId={status.id} authorId={status.user.id} />}
          {status.canDelete && (
            <>
              {' · '}
              <button
                type="button"
                className="icon-button"
                title="Verwijderen"
                aria-label="WieWatWaar verwijderen"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm('Deze WieWatWaar verwijderen?')) remove.mutate()
                }}
              >
                <FarmIcon name="bin" />
              </button>
            </>
          )}
        </div>
        <SocialBar social={status} />
      </div>
    </article>
  )
}
