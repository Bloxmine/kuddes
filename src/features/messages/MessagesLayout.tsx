import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { MessageBox } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { useAuth } from '../../lib/auth'
import { useMessageCounts } from '../../lib/queries'
import { BOXES, boxHref } from './messageLinks'
import './Messages.css'

/** The message pages: folders on the left, the list, a message or the form on the right. */
export function MessagesLayout({ current, children }: { current?: MessageBox; children: ReactNode }) {
  const { user } = useAuth()
  const { data: counts } = useMessageCounts(!!user)

  return (
    <main className="page page-con messages-page">
      <h1>Berichten</h1>
      <div className="messages">
        <div className="messages-side">
          <Link to="/berichten/nieuw" className="btn btn-cta messages-new">
            <FarmIcon name="email_add" /> Nieuw bericht
          </Link>
          <Box title="Mappen" icon="folder" noPadding>
            <nav className="messages-folders" aria-label="Mappen">
              {BOXES.map((b) => {
                const count = b.key === 'inbox' ? counts?.unread : b.key === 'concepten' ? counts?.concepten : 0
                return (
                  <Link
                    key={b.key}
                    to={boxHref(b.key)}
                    className={b.key === current ? 'current' : undefined}
                    aria-current={b.key === current ? 'page' : undefined}
                  >
                    <FarmIcon name={b.icon} /> {b.label}
                    {!!count && <span className={b.key === 'inbox' ? 'badge' : 'messages-count'}>{count}</span>}
                  </Link>
                )
              })}
            </nav>
          </Box>
          <p className="messages-privacy muted">
            <FarmIcon name="lock" /> Wie mag jou berichten sturen?{' '}
            <Link to="/instellingen#privacy">Privacy-instellingen</Link>
          </p>
        </div>
        <div className="messages-main">{children}</div>
      </div>
    </main>
  )
}
