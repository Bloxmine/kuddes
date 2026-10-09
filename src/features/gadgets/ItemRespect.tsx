/** Respect for one item in a gadget: a book on the shelf, a line in a list. */
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useItemRespect } from './gadgetData'
import './MoreGadgets.css'

/** "Respect" with the count; the owner and visitors who aren't logged in only see the count. */
export function RespectButton({ gadget, item, username, isOwner, compact }: { gadget: Gadget; item: string; username: string; isOwner: boolean; compact?: boolean }) {
  const { user } = useAuth()
  const { toggle, of } = useItemRespect(gadget, username)
  const r = of(item)
  const label = `${r.count} respect`
  if (isOwner || !user) {
    return (
      <span className={compact ? 'item-respect compact' : 'item-respect'} title={isOwner ? 'Respect van je bezoekers' : undefined}>
        <FarmIcon name="star" /> {compact ? r.count || '' : label}
        {!user && !compact && (
          <>
            {' '}
            · <Link to={`/inloggen?next=/profiel/${username}`}>log in</Link> om respect te geven
          </>
        )}
      </span>
    )
  }
  return (
    <span className="item-respect-wrap">
      <button
        type="button"
        className={r.mine ? 'item-respect given' : 'item-respect'}
        aria-pressed={r.mine}
        disabled={toggle.isPending}
        title={r.mine ? 'Respect intrekken' : 'Geef respect'}
        onClick={() => toggle.mutate({ item, on: !r.mine })}
      >
        <FarmIcon name="star" /> {compact ? r.count || '' : r.mine ? `Respect gegeven · ${r.count}` : `Respect · ${r.count}`}
      </button>
      {toggle.isError && <span className="form-error">{errorMessage(toggle.error)}</span>}
    </span>
  )
}
