import { CallWindow } from './CallWindow'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { useAuth } from '../../lib/auth'
import { ContactList } from './ContactList'
import { ChatView } from './ChatView'
import { closeChat, minimizeChat, openChat, setActive, setListOpen, useMessengerState } from './messengerStore'
import { chatName, chatUnread, useChatTargets, useContacts, useMessengerConnection } from './messengerQueries'
import { ChatIcon, MessengerIcon } from './MessengerParts'
import { WlmWindow } from './WlmWindow'
import './Messenger.css'

const PHONE = 700

/** How many conversation windows fit next to the contact list. */
function useRoom() {
  const [width, setWidth] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return { phone: width < PHONE, fits: width < PHONE ? 1 : Math.max(1, Math.floor((width - 330) / 400)) }
}

function Dock({ me }: { me: Me }) {
  const navigate = useNavigate()
  const listOpen = useMessengerState((s) => s.listOpen)
  const windows = useMessengerState((s) => s.windows)
  const flashing = useMessengerState((s) => s.flashing)
  const { data } = useContacts()
  const targets = useChatTargets()
  const { phone, fits } = useRoom()
  const contacts = data?.contacts ?? []
  const online = contacts.filter((c) => c.online).length
  const unread = [...targets.values()].reduce((n, t) => n + chatUnread(t), 0)

  // Open windows, as many as fit; the rest (and minimised ones) are buttons (a window's key is a username or a group)
  const open = windows.filter((w) => !w.minimized && targets.has(w.username)).slice(0, fits)
  const tabs = windows.filter((w) => targets.has(w.username) && !open.includes(w))
  const full = (username?: string) => {
    if (username) setActive(username)
    navigate('/messenger')
  }

  return (
    <div className={`wlm-dock${phone ? ' phone' : ''}`} aria-label="Kuddes Messenger">
      {listOpen ? (
        <WlmWindow
          className="wlm-list-window"
          label="Kuddes Messenger"
          icon={<MessengerIcon />}
          title="Kuddes Messenger"
          onMinimize={() => setListOpen(false)}
          onMaximize={() => full()}
        >
          <ContactList me={me} onOpen={(u) => openChat(u)} />
        </WlmWindow>
      ) : (
        <button type="button" className="wlm-taskbutton wlm-main-button" onClick={() => setListOpen(true)} title={unread ? `${unread} nieuwe berichten` : `${online} vrienden online`}>
          <MessengerIcon size={20} />
          <span className="wlm-task-label">Kuddes Messenger</span>
          <span className="wlm-task-count">({online})</span>
          {unread > 0 && <span className="badge farm-badge wlm-task-badge">{unread}</span>}
        </button>
      )}

      {open.map((w) => {
        const t = targets.get(w.username)!
        const name = chatName(t)
        return (
          <WlmWindow
            key={w.username}
            className="wlm-conv-window"
            label={t.kind === 'group' ? `Groepsgesprek ${name}` : `Gesprek met ${name}`}
            icon={<ChatIcon target={t} />}
            title={t.kind === 'group' ? `${name} - Groepsgesprek` : `${name} - Gesprek`}
            onMinimize={() => minimizeChat(w.username)}
            onMaximize={() => full(w.username)}
            onClose={() => closeChat(w.username)}
          >
            <ChatView chatKey={w.username} me={me} visible />
          </WlmWindow>
        )
      })}

      {tabs.length > 0 && (
        <div className="wlm-tabs">
          {tabs.map((w) => {
            const t = targets.get(w.username)!
            const name = chatName(t)
            const count = chatUnread(t)
            return (
              <span key={w.username} className={`wlm-taskbutton wlm-chat-button${flashing[w.username] || count ? ' flashing' : ''}`}>
                <button type="button" className="wlm-task-open" onClick={() => openChat(w.username)} title={`Gesprek met ${name}`}>
                  <ChatIcon target={t} picture={phone} />
                  <span className="wlm-task-label">{name}</span>
                  {count > 0 && <span className="badge farm-badge wlm-task-badge">{count}</span>}
                </button>
                <button type="button" className="wlm-task-close" onClick={() => closeChat(w.username)} aria-label={`Gesprek met ${name} sluiten`} title="Sluiten">
                  ×
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Kuddes Messenger in the corner of every page, where the "Probleem melden"
 * tab used to be (reporting a problem is in the footer and the Hulp menu).
 * The connection runs on every page, also on /messenger, which shows it all
 * full screen instead of the pop-up.
 */
export function Messenger() {
  const { user, waiting } = useAuth()
  const { pathname } = useLocation()
  useMessengerConnection()
  if (!user || waiting) return null
  return (
    <>
      <CallWindow />
      {pathname !== '/messenger' && <Dock me={user} />}
    </>
  )
}
