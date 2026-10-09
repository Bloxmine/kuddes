/**
 * A group chat in Kuddes Messenger: like a conversation with one friend
 * (Conversation.tsx), with the group's name at the top (click to rename it),
 * everyone in it on the left, and a way to add friends or leave.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { MESSENGER_LIMITS, groupKey, type MessengerGroup, type MessengerGroupLine } from '../../../shared/messenger'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { api, errorMessage } from '../../lib/api'
import { ShareCard } from '../share/ShareCard'
import { GlitterImg } from '../glitters/GlitterImg'
import { ComposeArea, SmileyOverlay } from './Compose'
import { MsnText } from './Conversation'
import { useMessengerState } from './messengerStore'
import { loadOlderGroup, markGroupRead, useContacts, useGroupActions, useGroupConversation, useSendGroupLine } from './messengerQueries'
import { Buddy, DisplayPicture, NudgeIcon } from './MessengerParts'
import { clock, dayOf, toneOf } from './messengerFormat'
import { useCompose } from './useCompose'
import '../share/Share.css'

/** What happened, as a line in the log ("Sanne heeft Piet toegevoegd."). */
function eventText(line: MessengerGroupLine, mine: boolean) {
  const who = mine ? 'Je' : line.fromName
  switch (line.kind) {
    case 'nudge':
      return `${who} ${mine ? 'hebt' : 'heeft'} een nudge gestuurd.`
    case 'created':
      return `${who} ${mine ? 'hebt' : 'heeft'} de groep “${line.text}” gemaakt.`
    case 'joined':
      return `${who} ${mine ? 'hebt' : 'heeft'} ${line.text} toegevoegd.`
    case 'left':
      return `${who} ${mine ? 'hebt' : 'heeft'} de groep verlaten.`
    case 'removed':
      return `${who} ${mine ? 'hebt' : 'heeft'} ${line.text} uit de groep gehaald.`
    case 'renamed':
      return `${who} ${mine ? 'hebt' : 'heeft'} de groep “${line.text}” genoemd.`
    default:
      return ''
  }
}

const EVENT_ICONS = { created: 'group_add', joined: 'user_add', left: 'door_out', removed: 'user_delete', renamed: 'pencil' } as const

/** The lines, WLM style: "Naam zegt (14:02):" above each run of messages, and a line for the day. */
function GroupLog({ lines, me }: { lines: MessengerGroupLine[]; me: Me }) {
  const out: ReactNode[] = []
  let day = ''
  let run: { from: number | null; at: number } | null = null
  for (const line of lines) {
    const d = dayOf(line.createdAt)
    if (d !== day) {
      out.push(
        <p key={`d${line.id}`} className="wlm-day">
          <span>{d}</span>
        </p>,
      )
      day = d
      run = null
    }
    const mine = line.from === me.id
    const at = new Date(line.createdAt).getTime()
    if (line.kind === 'msg') {
      if (!run || run.from !== line.from || at - run.at > 5 * 60_000) {
        out.push(
          <p key={`h${line.id}`} className="wlm-says">
            {mine ? me.nickname : line.fromName} zegt ({clock(line.createdAt)}):
          </p>,
        )
      }
      run = { from: line.from, at }
      out.push(
        <div key={line.id} className={mine ? 'wlm-msg mine' : 'wlm-msg'}>
          {line.text && <MsnText text={line.text} />}
          {line.share && <ShareCard path={line.share} />}
          {line.glitter && (
            <span className="wlm-glitter">
              <GlitterImg glitter={line.glitter} />
            </span>
          )}
        </div>,
      )
    } else {
      run = null
      out.push(
        <p key={line.id} className={line.kind === 'nudge' ? 'wlm-event wlm-nudge-line' : 'wlm-event'}>
          {line.kind === 'nudge' ? <NudgeIcon /> : <FarmIcon name={EVENT_ICONS[line.kind]} />} {eventText(line, mine)}
        </p>,
      )
    }
  }
  return <>{out}</>
}

/** Ticking friends: for a new group, or to add to one. */
export function FriendPicker({ picked, onChange, exclude = [] }: { picked: string[]; onChange: (usernames: string[]) => void; exclude?: number[] }) {
  const { data } = useContacts()
  const [query, setQuery] = useState('')
  const friends = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.contacts ?? [])
      .filter((c) => !exclude.includes(c.id))
      .filter((c) => !q || c.nickname.toLowerCase().includes(q) || c.username.includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname, 'nl'))
  }, [data, query, exclude])
  if (!data) return <p className="muted">Vrienden laden…</p>
  const toggle = (u: string) => onChange(picked.includes(u) ? picked.filter((x) => x !== u) : [...picked, u])
  return (
    <>
      <input className="text-box share-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek een vriend" aria-label="Zoek een vriend" />
      {friends.length ? (
        <ul className="share-friends">
          {friends.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={picked.includes(c.username)} onChange={() => toggle(c.username)} />
                <Buddy tone={toneOf(c.status)} /> {c.nickname}
                <span className="muted">{c.status}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{query ? 'Geen vrienden gevonden.' : 'Je hebt (nog) geen andere vrienden om toe te voegen.'}</p>
      )}
    </>
  )
}

/** "Nieuwe groep": a name and two or more friends. */
export function NewGroupDialog({ onClose, onMade }: { onClose: () => void; onMade: (group: MessengerGroup) => void }) {
  const { create } = useGroupActions()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  return (
    <Modal title="Nieuw groepsgesprek" icon="group_add" onClose={onClose}>
      <form
        className="wlm-group-form"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate({ name: name.trim(), usernames: picked }, { onSuccess: onMade })
        }}
      >
        <label className="field">
          <span className="field-label">Naam van de groep</span>
          <input className="text-box" value={name} onChange={(e) => setName(e.target.value)} maxLength={MESSENGER_LIMITS.groupName} placeholder="Bijvoorbeeld: Klas 4B, De voetbalmannen…" required autoFocus />
        </label>
        <p className="field-label">
          Wie doen er mee? <span className="muted">(minstens twee vrienden, maximaal {MESSENGER_LIMITS.groupSize - 1})</span>
        </p>
        <FriendPicker picked={picked} onChange={setPicked} />
        {create.isError && <p className="form-error">{errorMessage(create.error)}</p>}
        <div className="share-actions send">
          <Button variant="cta" type="submit" disabled={create.isPending || !name.trim() || picked.length < 2}>
            <FarmIcon name="group_add" /> {create.isPending ? 'Bezig…' : picked.length >= 2 ? `Begin met ${picked.length} vrienden` : 'Begin het gesprek'}
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
        </div>
      </form>
    </Modal>
  )
}

function AddPeopleDialog({ group, onClose }: { group: MessengerGroup; onClose: () => void }) {
  const { add } = useGroupActions()
  const [picked, setPicked] = useState<string[]>([])
  const exclude = useMemo(() => group.members.map((m) => m.id), [group.members])
  const room = MESSENGER_LIMITS.groupSize - group.members.length
  return (
    <Modal title={`Mensen toevoegen aan ${group.name}`} icon="user_add" onClose={onClose}>
      <p className="muted">Je kunt je eigen vrienden toevoegen; ze zien de berichten van voordat ze erbij kwamen ook. {room > 0 ? `Er kunnen nog ${room} mensen bij.` : 'De groep is vol.'}</p>
      <FriendPicker picked={picked} onChange={setPicked} exclude={exclude} />
      {add.isError && <p className="form-error">{errorMessage(add.error)}</p>}
      <div className="share-actions send">
        <Button variant="cta" disabled={!picked.length || picked.length > room || add.isPending} onClick={() => add.mutate({ id: group.id, usernames: picked }, { onSuccess: onClose })}>
          <FarmIcon name="user_add" /> Toevoegen
        </Button>
        <Button onClick={onClose}>Annuleren</Button>
      </div>
    </Modal>
  )
}

/** The group's name at the top: click it to change it. */
function GroupName({ group }: { group: MessengerGroup }) {
  const { rename } = useGroupActions()
  const [editing, setEditing] = useState<string | null>(null)
  const done = () => {
    const name = editing?.trim()
    if (name && name !== group.name) rename.mutate({ id: group.id, name })
    setEditing(null)
  }
  return editing !== null ? (
    <input
      className="wlm-note-input wlm-group-name-input"
      autoFocus
      value={editing}
      maxLength={MESSENGER_LIMITS.groupName}
      aria-label="Naam van de groep"
      onChange={(e) => setEditing(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') setEditing(null)
      }}
    />
  ) : (
    <button type="button" className="wlm-conv-name wlm-group-name" onClick={() => setEditing(group.name)} title="Klik om de naam te veranderen">
      {group.name}
    </button>
  )
}

export function GroupConversation({ id, me, visible, full }: { id: number; me: Me; visible: boolean; full?: boolean }) {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useGroupConversation(id)
  const send = useSendGroupLine(id)
  const { remove } = useGroupActions()
  const [adding, setAdding] = useState(false)
  const [olderBusy, setOlderBusy] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const compose = useCompose({
    onSend: (body, sent) => {
      stick.current = true
      send.mutate(body, { onSuccess: sent })
    },
    onTyping: () => void api(`/messenger/groups/${id}/typing`, { method: 'POST' }).catch(() => undefined),
  })
  const { focus } = compose
  const group = data?.group
  const key = groupKey(id)
  const typingMap = useMessengerState((s) => s.typing)
  const shakeAt = useMessengerState((s) => s.shakes[key] ?? 0)
  const [now, setNow] = useState(() => Date.now())

  // Who's typing now (and the note goes away by itself)
  const typers = Object.entries(typingMap)
    .filter(([k, until]) => k.startsWith(`g${id}:`) && until > now)
    .map(([k, until]) => ({ id: Number(k.split(':')[1]), until }))
  const nextEnd = Math.min(...typers.map((t) => t.until))
  useEffect(() => {
    if (!Number.isFinite(nextEnd)) return
    const t = window.setTimeout(() => setNow(Date.now()), nextEnd - Date.now() + 50)
    return () => window.clearTimeout(t)
  }, [nextEnd])

  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || !shakeAt || Date.now() - shakeAt > 2000) return
    el.classList.remove('wlm-shaking')
    void el.offsetWidth
    el.classList.add('wlm-shaking')
    const t = window.setTimeout(() => el.classList.remove('wlm-shaking'), 650)
    return () => window.clearTimeout(t)
  }, [shakeAt])

  useLayoutEffect(() => {
    const el = log.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [data?.lines, visible])

  // What you see counts as read
  const lastId = data?.lines.at(-1)?.id
  const unread = group?.unread ?? 0
  useEffect(() => {
    if (!visible || !lastId || !unread) return
    const read = () => document.visibilityState === 'visible' && void markGroupRead(queryClient, id, lastId)
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [visible, lastId, unread, queryClient, id])

  useEffect(() => {
    const onFocus = (e: Event) => (e as CustomEvent<string>).detail === key && focus()
    window.addEventListener('kuddes:messenger-focus', onFocus)
    return () => window.removeEventListener('kuddes:messenger-focus', onFocus)
  }, [key, focus])

  if (isLoading || !group || !data) {
    return <div className="wlm-conv wlm-conv-loading">{error ? <p className="form-error">{errorMessage(error)}</p> : <p className="wlm-empty">Groep openen…</p>}</div>
  }

  const others = group.members.filter((m) => m.id !== me.id)
  const online = others.filter((m) => m.online).length
  const typingNames = typers.map((t) => group.members.find((m) => m.id === t.id)?.nickname).filter(Boolean) as string[]
  const leave = () => confirm(`De groep “${group.name}” verlaten? Je ziet de berichten dan niet meer.`) && remove.mutate({ id, username: '@me' })

  return (
    <div ref={root} className={full ? 'wlm-conv wlm-group full' : 'wlm-conv wlm-group'}>
      <header className="wlm-conv-head wlm-scene">
        <div className="wlm-conv-who">
          <GroupName group={group} />{' '}
          <span className="wlm-conv-status">
            ({group.members.length} mensen, {online} online)
          </span>
          <span className="wlm-conv-note">{others.map((m) => m.nickname).join(', ')}</span>
        </div>
        <nav className="wlm-conv-tools" aria-label="Acties">
          <button type="button" className="wlm-tool" onClick={() => setAdding(true)} disabled={group.members.length >= MESSENGER_LIMITS.groupSize} title="Vrienden toevoegen aan de groep">
            <FarmIcon name="user_add" /> <span className="wlm-tool-label">Toevoegen</span>
          </button>
          <button type="button" className="wlm-tool" onClick={leave} disabled={remove.isPending} title="De groep verlaten">
            <FarmIcon name="door_out" />
          </button>
        </nav>
      </header>

      <div className={compose.panel === 'smileys' ? 'wlm-conv-main picking' : 'wlm-conv-main'}>
        {/* Everyone in it, online first */}
        <aside className="wlm-dps wlm-members" aria-label="Wie zitten erin">
          <ul>
            {[...group.members]
              .sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname, 'nl'))
              .map((m) => (
                <li key={m.id}>
                  <Link to={`/profiel/${m.username}`} title={`${m.nickname} (${m.status})`}>
                    <DisplayPicture user={m} tone={toneOf(m.status)} size={full ? 40 : 28} />
                    <span className="wlm-member-name">{m.id === me.id ? 'Jij' : m.nickname}</span>
                  </Link>
                  {group.mine && m.id !== me.id && (
                    <button
                      type="button"
                      className="wlm-task-close"
                      title={`${m.nickname} uit de groep halen`}
                      aria-label={`${m.nickname} uit de groep halen`}
                      onClick={() => confirm(`${m.nickname} uit “${group.name}” halen?`) && remove.mutate({ id, username: m.username })}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </aside>
        <div className="wlm-conv-right">
          <div className="wlm-log-wrap">
            <SmileyOverlay c={compose} />
            <div
              className="wlm-log"
              ref={log}
              aria-live="polite"
              onScroll={(e) => {
                const el = e.currentTarget
                stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
              }}
            >
              {data.hasMore && (
                <button
                  type="button"
                  className="wlm-link-btn wlm-older"
                  disabled={olderBusy}
                  onClick={() => {
                    setOlderBusy(true)
                    stick.current = false
                    void loadOlderGroup(queryClient, id).finally(() => setOlderBusy(false))
                  }}
                >
                  Eerdere berichten tonen
                </button>
              )}
              <GroupLog lines={data.lines} me={me} />
            </div>
          </div>
          <ComposeArea c={compose} full={full} label={`Bericht aan ${group.name}`} busy={send.isPending} onNudge={() => send.mutate({ nudge: true })} />
        </div>
      </div>

      <footer className="wlm-statusbar" aria-live="polite">
        {send.isError || remove.isError ? (
          <span className="wlm-status-error">{errorMessage(send.error ?? remove.error)}</span>
        ) : typingNames.length ? (
          <>
            <FarmIcon name="pencil" /> {typingNames.join(', ')} {typingNames.length === 1 ? 'is' : 'zijn'} aan het typen...
          </>
        ) : (
          <>Groepsgesprek met {others.map((m) => m.nickname).join(', ')}.</>
        )}
      </footer>
      {adding && <AddPeopleDialog group={group} onClose={() => setAdding(false)} />}
    </div>
  )
}
