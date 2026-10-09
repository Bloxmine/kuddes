import { useNavigate } from 'react-router-dom'
import type { Me } from '../../shared/api'
import { RequireAuth } from '../components/layout/RequireAuth'
import { ContactList } from '../features/messenger/ContactList'
import { ChatView } from '../features/messenger/ChatView'
import { closeChat, openChat, setListOpen, useMessengerState } from '../features/messenger/messengerStore'
import { chatName, chatUnread, useChatTargets } from '../features/messenger/messengerQueries'
import { ChatIcon, MessengerIcon } from '../features/messenger/MessengerParts'
import { WlmWindow } from '../features/messenger/WlmWindow'
import '../features/messenger/Messenger.css'
import { usePageTitle } from '../lib/usePageTitle'

/** /messenger: the contact list and your conversations, full screen, with a tab per conversation. */
export function MessengerPage() {
  usePageTitle('Messenger - Kuddes')
  return <RequireAuth>{(user) => <FullMessenger me={user} />}</RequireAuth>
}

function FullMessenger({ me }: { me: Me }) {
  const navigate = useNavigate()
  const windows = useMessengerState((s) => s.windows)
  const active = useMessengerState((s) => s.active)
  const flashing = useMessengerState((s) => s.flashing)
  const targets = useChatTargets()
  const tabs = windows.filter((w) => targets.has(w.username))
  const current = tabs.find((w) => w.username === active)?.username ?? tabs[0]?.username ?? null
  const target = current ? targets.get(current) : undefined
  // Back to the pop-up, on the page you came from
  const small = () => {
    setListOpen(true)
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <main className="page wlm-page">
      <WlmWindow className="wlm-list-window full" label="Kuddes Messenger" icon={<MessengerIcon />} title="Kuddes Messenger" onRestore={small}>
        <ContactList me={me} active={current} onOpen={(u) => openChat(u)} />
      </WlmWindow>

      <WlmWindow
        className="wlm-conv-window full"
        label={target ? `Gesprek met ${chatName(target)}` : 'Gesprekken'}
        icon={target ? <ChatIcon target={target} /> : <MessengerIcon />}
        title={target ? `${chatName(target)} - ${target.kind === 'group' ? 'Groepsgesprek' : 'Gesprek'}` : 'Gesprekken'}
        onRestore={small}
        onClose={current ? () => closeChat(current) : undefined}
      >
        {tabs.length > 0 && (
          <div className="wlm-page-tabs" role="tablist" aria-label="Gesprekken">
            {tabs.map((w) => {
              const t = targets.get(w.username)!
              const count = chatUnread(t)
              return (
                <span key={w.username} className={`wlm-page-tab${w.username === current ? ' current' : ''}${(flashing[w.username] || count) && w.username !== current ? ' flashing' : ''}`}>
                  <button type="button" role="tab" aria-selected={w.username === current} onClick={() => openChat(w.username)}>
                    <ChatIcon target={t} /> {chatName(t)}
                    {count > 0 && w.username !== current && <span className="badge farm-badge wlm-task-badge">{count}</span>}
                  </button>
                  <button type="button" className="wlm-task-close" onClick={() => closeChat(w.username)} aria-label={`Gesprek met ${chatName(t)} sluiten`} title="Sluiten">
                    ×
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {current ? (
          <ChatView key={current} chatKey={current} me={me} visible full />
        ) : (
          <div className="wlm-page-empty wlm-scene">
            <MessengerIcon size={48} />
            <h1>Kuddes Messenger</h1>
            <p>Klik op een vriend in je lijst om te chatten, of begin een groepsgesprek met een paar vrienden tegelijk. Je gesprekken gaan mee over de hele site: klein in de hoek, of hier groot.</p>
          </div>
        )}
      </WlmWindow>
    </main>
  )
}
