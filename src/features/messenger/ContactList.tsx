import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { MESSENGER_LIMITS, groupKey, type MessengerContact, type MessengerContacts, type MessengerGroup } from '../../../shared/messenger'
import { ONLINE_STATUSES } from '../../../shared/onlineStatus'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useMessageCounts } from '../../lib/queries'
import { withSmileys } from '../../lib/smileys'
import { messengerKeys, useContacts } from './messengerQueries'
import { NewGroupDialog } from './GroupConversation'
import { Buddy, DisplayPicture } from './MessengerParts'
import { toneOf } from './messengerFormat'

const COLLAPSED = 'kuddes.messenger.collapsed'

function loadCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED) ?? '["offline"]') as string[]
  } catch {
    return ['offline']
  }
}

/** You at the top: your picture, name, status and personal message. */
function MeHeader({ me, note }: { me: Me; note: string }) {
  const { setUser } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [statusOpen, setStatusOpen] = useState(false)
  const setStatus = useMutation({
    mutationFn: (onlineStatus: string) => api<Me>('/me', { method: 'PATCH', body: { onlineStatus } }),
    onSuccess: setUser,
  })
  const saveNote = useMutation({
    mutationFn: (value: string) => api<{ note: string }>('/messenger/note', { method: 'PUT', body: { note: value } }),
    onSuccess: ({ note: saved }) => queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, note: saved } : d)),
  })
  const done = () => {
    if (editing !== null && editing.trim() !== note) saveNote.mutate(editing.trim())
    setEditing(null)
  }

  return (
    <div className="wlm-me wlm-scene">
      <DisplayPicture user={me} tone={toneOf(me.onlineStatus)} size={52} />
      <div className="wlm-me-text">
        <div className="wlm-me-name">
          <b>{me.nickname}</b>
          <span className="wlm-status-pick">
            <button type="button" className="wlm-status-btn" aria-haspopup="listbox" aria-expanded={statusOpen} onClick={() => setStatusOpen((o) => !o)}>
              ({me.onlineStatus}) <span aria-hidden="true">▾</span>
            </button>
            {statusOpen && (
              <ul className="wlm-menu" role="listbox" aria-label="Je status">
                {ONLINE_STATUSES.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={s === me.onlineStatus}
                      onClick={() => {
                        setStatus.mutate(s)
                        setStatusOpen(false)
                      }}
                    >
                      <Buddy tone={toneOf(s)} /> {s === 'Toon offline' ? 'Offline weergeven' : s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </span>
        </div>
        {editing !== null ? (
          <input
            className="wlm-note-input"
            autoFocus
            value={editing}
            maxLength={MESSENGER_LIMITS.note}
            placeholder="Deel een persoonlijk bericht"
            aria-label="Persoonlijk bericht"
            onChange={(e) => setEditing(e.target.value)}
            onBlur={done}
            onKeyDown={(e) => {
              if (e.key === 'Enter') done()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        ) : (
          <button type="button" className={note ? 'wlm-note' : 'wlm-note empty'} onClick={() => setEditing(note)} title="Klik om je persoonlijke bericht te wijzigen">
            {note ? withSmileys(note) : '<Deel een persoonlijk bericht>'}
          </button>
        )}
        {(saveNote.isError || setStatus.isError) && <span className="form-error">{errorMessage(saveNote.error ?? setStatus.error)}</span>}
      </div>
    </div>
  )
}

function ContactRow({ contact, active, onOpen, pinned, onPin, full }: { contact: MessengerContact; active: boolean; onOpen: (username: string) => void; pinned: boolean; onPin: () => void; full: boolean }) {
  return (
    <li className="wlm-contact-row">
      <button type="button" className={`wlm-contact${active ? ' active' : ''}${contact.unread ? ' unread' : ''}`} onClick={() => onOpen(contact.username)} title={`Chat met ${contact.nickname} (${contact.status})`}>
        <Buddy tone={toneOf(contact.status)} />
        <span className="wlm-contact-name">{contact.nickname}</span>
        {contact.status !== 'Online' && contact.online && <span className="wlm-contact-status">({contact.status})</span>}
        {contact.note && <span className="wlm-contact-note">{withSmileys(contact.note)}</span>}
        {contact.unread > 0 && <span className="badge farm-badge wlm-unread">{contact.unread}</span>}
      </button>
      <button
        type="button"
        className={pinned ? 'wlm-pin pinned' : 'wlm-pin'}
        onClick={onPin}
        disabled={!pinned && full}
        aria-pressed={pinned}
        title={pinned ? `${contact.nickname} uit je favorieten halen` : full ? `Je hebt al ${MESSENGER_LIMITS.favorites} favorieten` : `${contact.nickname} vastzetten bij je favorieten`}
      >
        <FarmIcon name="star" />
      </button>
    </li>
  )
}

/**
 * Your favourites, like WLM's: pinned friends side by side at the top, with
 * their picture in the colour of their status. Drag one to move it.
 */
function Favorites({ list, active, onOpen, onUnpin, onMove }: { list: MessengerContact[]; active?: string | null; onOpen: (username: string) => void; onUnpin: (id: number) => void; onMove: (from: number, to: number) => void }) {
  const [dragging, setDragging] = useState<number | null>(null)
  return (
    <ul className="wlm-favs">
      {list.map((c, i) => (
        <li
          key={c.id}
          className={dragging === i ? 'dragging' : undefined}
          draggable
          onDragStart={(e) => {
            setDragging(i)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => dragging !== null && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragging !== null && dragging !== i) onMove(dragging, i)
            setDragging(null)
          }}
          onDragEnd={() => setDragging(null)}
        >
          <button
            type="button"
            className={`wlm-fav${active === c.username ? ' active' : ''}${c.unread ? ' unread' : ''}`}
            onClick={() => onOpen(c.username)}
            title={`${c.nickname} (${c.status})${c.note ? ` - ${c.note}` : ''}`}
          >
            <DisplayPicture user={c} tone={toneOf(c.status)} size={40}>
              {c.unread > 0 && <span className="badge farm-badge wlm-fav-unread">{c.unread}</span>}
            </DisplayPicture>
            <span className="wlm-fav-name">{c.nickname}</span>
          </button>
          <button type="button" className="wlm-fav-unpin" onClick={() => onUnpin(c.id)} title={`${c.nickname} uit je favorieten halen`} aria-label={`${c.nickname} uit je favorieten halen`}>
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}

function GroupRow({ group, me, active, onOpen }: { group: MessengerGroup; me: number; active: boolean; onOpen: (key: string) => void }) {
  // The others in it who are online (you are, obviously)
  const online = group.members.filter((m) => m.id !== me && m.online).length
  return (
    <li>
      <button type="button" className={`wlm-contact${active ? ' active' : ''}${group.unread ? ' unread' : ''}`} onClick={() => onOpen(groupKey(group.id))} title={`Groepsgesprek met ${group.members.map((m) => m.nickname).join(', ')}`}>
        <FarmIcon name="group" className="wlm-buddy" />
        <span className="wlm-contact-name">{group.name}</span>
        <span className="wlm-contact-status">
          ({group.members.length}, {online} online)
        </span>
        {group.unread > 0 && <span className="badge farm-badge wlm-unread">{group.unread}</span>}
      </button>
    </li>
  )
}

/**
 * The contact list, like WLM 2009: you at the top, a search box, and your
 * friends in groups (online, offline), each with a buddy in the colour of
 * their status and their personal message.
 */
export function ContactList({ me, active, onOpen }: { me: Me; active?: string | null; onOpen: (username: string) => void }) {
  const { data, isLoading, isError } = useContacts()
  const { data: counts } = useMessageCounts(true)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed)
  const [newGroup, setNewGroup] = useState(false)
  const queryClient = useQueryClient()
  // Saved on the server (the same on every device); the list changes straight away
  const saveFavorites = useMutation({
    mutationFn: (ids: number[]) => api<{ favorites: number[] }>('/messenger/favorites', { method: 'PUT', body: { ids } }),
    onMutate: (ids) => queryClient.setQueryData<MessengerContacts>(messengerKeys.contacts, (d) => (d ? { ...d, favorites: ids } : d)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: messengerKeys.contacts }),
  })
  const favoriteIds = data?.favorites ?? []
  const togglePin = (id: number) => {
    if (favoriteIds.includes(id)) saveFavorites.mutate(favoriteIds.filter((f) => f !== id))
    else if (favoriteIds.length < MESSENGER_LIMITS.favorites) saveFavorites.mutate([...favoriteIds, id])
  }
  const moveFavorite = (from: number, to: number) => {
    const next = [...favoriteIds]
    next.splice(to, 0, ...next.splice(from, 1))
    saveFavorites.mutate(next)
  }
  const toggle = (key: string) => {
    const next = collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key]
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED, JSON.stringify(next))
    } catch {
      // for this page only
    }
  }

  const q = query.trim().toLowerCase()
  const contacts = (data?.contacts ?? []).filter((c) => !q || c.nickname.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.username.includes(q))
  const groupList = (data?.groups ?? []).filter((g) => !q || g.name.toLowerCase().includes(q) || g.members.some((m) => m.nickname.toLowerCase().includes(q)))
  const favorites = q ? [] : favoriteIds.flatMap((id) => data?.contacts.find((c) => c.id === id) ?? [])
  const recent = [...contacts].filter((c) => c.unread > 0).sort((a, b) => (b.lastLineAt ?? '').localeCompare(a.lastLineAt ?? ''))
  const groups: { key: string; title: string; list: MessengerContact[] }[] = [
    ...(recent.length ? [{ key: 'nieuw', title: 'Nieuwe berichten', list: recent }] : []),
    { key: 'online', title: 'Online', list: contacts.filter((c) => c.online) },
    { key: 'offline', title: 'Offline', list: contacts.filter((c) => !c.online) },
  ]

  return (
    <div className="wlm-list">
      <MeHeader me={me} note={data?.note ?? ''} />
      <nav className="wlm-tools" aria-label="Snel naar">
        <Link to="/berichten" title="Berichten">
          <FarmIcon name="email" />
          {!!counts?.unread && <span className="wlm-tool-count">({counts.unread})</span>}
        </Link>
        <Link to="/vrienden" title="Vrienden">
          <FarmIcon name="group" />
        </Link>
        <button type="button" onClick={() => setNewGroup(true)} title="Nieuw groepsgesprek met een paar vrienden" disabled={(data?.contacts.length ?? 0) < 2}>
          <FarmIcon name="group_add" />
        </button>
        <Link to="/spellen" title="Spellen">
          <FarmIcon name="controller" />
        </Link>
        <Link to={`/profiel/${me.username}`} title="Mijn profiel">
          <FarmIcon name="user" />
        </Link>
        <Link to="/instellingen#geluid" title="Geluiden en instellingen">
          <FarmIcon name="cog" />
        </Link>
      </nav>
      <div className="wlm-search">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Contactpersonen zoeken..." aria-label="Contactpersonen zoeken" />
        <Link to="/zoeken" className="wlm-add" title="Vrienden zoeken en toevoegen">
          <FarmIcon name="user_add" />
        </Link>
      </div>
      <div className="wlm-groups">
        {isLoading && <p className="wlm-empty">Aanmelden bij Messenger…</p>}
        {isError && <p className="wlm-empty">Messenger kan nu niet verbinden. Probeer het straks nog eens.</p>}
        {data && !data.contacts.length && (
          <p className="wlm-empty">
            Je hebt nog geen vrienden om mee te chatten. <Link to="/zoeken">Zoek leden</Link> en voeg ze toe als vriend.
          </p>
        )}
        {favorites.length > 0 && (
          <section className="wlm-group">
            <h3>
              <button type="button" aria-expanded={!collapsed.includes('favorieten')} onClick={() => toggle('favorieten')}>
                <span className="wlm-arrow" aria-hidden="true">
                  {collapsed.includes('favorieten') ? '▸' : '▾'}
                </span>
                <FarmIcon name="star" /> Favorieten ({favorites.filter((c) => c.online).length}/{favorites.length})
              </button>
            </h3>
            {!collapsed.includes('favorieten') && <Favorites list={favorites} active={active} onOpen={onOpen} onUnpin={togglePin} onMove={moveFavorite} />}
          </section>
        )}
        {groupList.length > 0 && (
          <section className="wlm-group">
            <h3>
              <button type="button" aria-expanded={!collapsed.includes('groepen')} onClick={() => toggle('groepen')}>
                <span className="wlm-arrow" aria-hidden="true">
                  {collapsed.includes('groepen') ? '▸' : '▾'}
                </span>
                Groepen ({groupList.length})
              </button>
            </h3>
            {!collapsed.includes('groepen') && (
              <ul>
                {groupList.map((g) => (
                  <GroupRow key={g.id} group={g} me={me.id} active={active === groupKey(g.id)} onOpen={onOpen} />
                ))}
              </ul>
            )}
          </section>
        )}
        {data?.contacts.length
          ? groups.map((g) => (
              <section key={g.key} className="wlm-group">
                <h3>
                  <button type="button" aria-expanded={!collapsed.includes(g.key)} onClick={() => toggle(g.key)}>
                    <span className="wlm-arrow" aria-hidden="true">
                      {collapsed.includes(g.key) ? '▸' : '▾'}
                    </span>
                    {g.title} ({g.list.length})
                  </button>
                </h3>
                {!collapsed.includes(g.key) && (
                  <ul>
                    {g.list.map((c) => (
                      <ContactRow key={c.id} contact={c} active={active === c.username} onOpen={onOpen} pinned={favoriteIds.includes(c.id)} onPin={() => togglePin(c.id)} full={favoriteIds.length >= MESSENGER_LIMITS.favorites} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}
      </div>
      {newGroup && (
        <NewGroupDialog
          onClose={() => setNewGroup(false)}
          onMade={(g) => {
            setNewGroup(false)
            onOpen(groupKey(g.id))
          }}
        />
      )}
    </div>
  )
}
