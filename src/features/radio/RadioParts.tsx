/**
 * The pieces of Kuddes Radio: station cards, the listen button (it plays in
 * the player bar), the programme, the chat, and the form for your station.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { RADIO_GENRES, RADIO_LIMITS, type RadioChatLine, type RadioGenre, type RadioLive, type RadioShow, type RadioStation } from '../../../shared/radio'
import { UserPic } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { withSmileys } from '../../lib/smileys'
import { player, useLiveListen } from '../music/player'
import { formatShowTime } from './radioFormat'
import { genreIcon, radioKeys } from './radioQueries'
import './Radio.css'

const GENRE_KEYS = Object.keys(RADIO_GENRES) as RadioGenre[]

export function LiveBadge({ off }: { off?: boolean }) {
  return <span className={off ? 'mu-live-badge off' : 'mu-live-badge'}>{off ? 'OFF AIR' : 'LIVE'}</span>
}

/** Listen live (in the player bar), or stop. */
export function ListenButton({ station, live, big }: { station: Pick<RadioStation, 'user' | 'name' | 'bannerUrl'>; live: RadioLive | null; big?: boolean }) {
  const listening = useLiveListen()
  const on = listening.live?.username === station.user.username && listening.playing
  if (!live && !on) return null
  return (
    <Button
      variant="cta"
      className={big ? 'rd-listen big' : 'rd-listen'}
      onClick={() => player.listen({ username: station.user.username, station: station.name, title: live?.title ?? station.name, bannerUrl: station.bannerUrl })}
    >
      <FarmIcon name={on ? 'control_pause' : 'control_play'} size={big ? 24 : 16} /> {on ? 'Stoppen' : 'Luister live'}
    </Button>
  )
}

/** A station: its banner (or genre colours), name, and live or when it's on next. */
export function StationCard({ station }: { station: RadioStation }) {
  return (
    <li className={station.live ? 'rd-card on-air' : 'rd-card'}>
      <Link to={`/radio/${station.user.username}`}>
        <span className={`rd-card-banner rg-${station.genre}`} style={station.bannerUrl ? { backgroundImage: `url(${station.bannerUrl})`, backgroundPositionY: `${station.bannerY}%` } : undefined}>
          {!station.bannerUrl && <FarmIcon name={genreIcon(station.genre)} size={32} />}
          {station.live && (
            <span className="rd-card-live">
              <LiveBadge /> {station.live.listeners} <FarmIcon name="headphone" />
            </span>
          )}
        </span>
        <span className="rd-card-text">
          <b>{station.name}</b>
          <small className="muted">
            {RADIO_GENRES[station.genre].name} · {station.user.nickname}
          </small>
          <small className={station.live ? 'rd-card-now' : 'muted'}>
            {station.live ? station.live.title : station.next ? `Volgende: ${formatShowTime(station.next.startsAt, station.next.endsAt)}` : `${station.followers} ${station.followers === 1 ? 'volger' : 'volgers'}`}
          </small>
        </span>
      </Link>
    </li>
  )
}

/** The programme: planned shows, with time; `showStation` on /radio (all stations). */
export function ShowList({ shows, showStation, actions }: { shows: RadioShow[]; showStation?: boolean; actions?: (s: RadioShow) => ReactNode }) {
  const [now] = useState(Date.now)
  return (
    <ul className="rd-shows">
      {shows.map((s) => {
        const onNow = new Date(s.startsAt).getTime() <= now && now < new Date(s.endsAt).getTime()
        return (
          <li key={s.id} className={onNow ? 'now' : undefined}>
            <span className="rd-show-time">
              <FarmIcon name={onNow ? 'transmit' : 'clock'} /> {formatShowTime(s.startsAt, s.endsAt)}
            </span>
            <span className="rd-show-text">
              <b>{s.title}</b>
              {showStation && s.station && (
                <small>
                  <Link to={`/radio/${s.station.user.username}`}>{s.station.name}</Link> · {RADIO_GENRES[s.station.genre].name}
                </small>
              )}
              {s.description && <small className="muted">{s.description}</small>}
            </span>
            {actions?.(s)}
          </li>
        )
      })}
    </ul>
  )
}

/** The chat next to a live show: everyone reads, members write. */
export function ChatPanel({ username, chat, live }: { username: string; chat: RadioChatLine[]; live: boolean }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const list = useRef<HTMLOListElement>(null)
  const send = useMutation({
    mutationFn: () => api<void>(`/radio/stations/${encodeURIComponent(username)}/chat`, { method: 'POST', body: { text } }),
    onSuccess: () => setText(''),
  })
  // The newest line in view, unless you scrolled up to read
  useEffect(() => {
    const el = list.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight
  }, [chat])
  return (
    <div className="rd-chat">
      <ol ref={list} aria-live="polite">
        {!chat.length && <li className="muted rd-chat-empty">{live ? 'Nog niets gezegd. Zeg jij als eerste hoi?' : 'De chat is er zolang de zender live is.'}</li>}
        {chat.map((l) => (
          <li key={l.id}>
            <UserPic user={l.user} /> <b>{l.user.nickname}</b> {withSmileys(l.text)}
          </li>
        ))}
      </ol>
      {live &&
        (user?.emailVerified ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) send.mutate()
            }}
          >
            <input className="text-box" value={text} maxLength={RADIO_LIMITS.chat} onChange={(e) => setText(e.target.value)} placeholder="Zeg iets…" aria-label="Chatbericht" />
            <Button type="submit" disabled={!text.trim() || send.isPending}>
              <FarmIcon name="comment" />
            </Button>
          </form>
        ) : (
          <p className="muted rd-chat-login">
            <Link to={`/inloggen?next=/radio/${username}`}>Log in</Link> om mee te chatten.
          </p>
        ))}
      {send.isError && <p className="form-error">{errorMessage(send.error)}</p>}
    </div>
  )
}

export function FollowButton({ station }: { station: RadioStation }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => api<void>(`/radio/stations/${encodeURIComponent(station.user.username)}/follow`, { method: station.following ? 'DELETE' : 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: radioKeys.all }),
  })
  if (!user?.emailVerified || station.mine) return null
  return (
    <Button onClick={() => toggle.mutate()} disabled={toggle.isPending} title={station.following ? 'Je krijgt een melding als deze zender live gaat' : 'Krijg een melding als deze zender live gaat'}>
      <FarmIcon name={station.following ? 'tick' : 'bell'} /> {station.following ? 'Je volgt deze zender' : 'Volgen'}
    </Button>
  )
}

export function GenreSelect({ value, onChange }: { value: RadioGenre; onChange: (g: RadioGenre) => void }) {
  return (
    <select className="text-box" value={value} onChange={(e) => onChange(e.target.value as RadioGenre)}>
      {GENRE_KEYS.map((g) => (
        <option key={g} value={g}>
          {RADIO_GENRES[g].name} ({RADIO_GENRES[g].hint})
        </option>
      ))}
    </select>
  )
}

/** Your station's name, kind and description; `inline` on the studio's Zender tab, else in a dialog. */
export function StationForm({ station, onSaved }: { station: RadioStation | null; onSaved?: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState(station?.name ?? (user ? `Radio ${user.nickname}` : ''))
  const [genre, setGenre] = useState<RadioGenre>(station?.genre ?? 'muziekmix')
  const [description, setDescription] = useState(station?.description ?? '')
  const save = useMutation({
    mutationFn: () => api<RadioStation>('/radio/me', { method: 'PUT', body: { name, genre, description } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: radioKeys.all })
      onSaved?.()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <form
      className="rd-form"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Naam van je zender" error={fields.name}>
        <input className="text-box" value={name} maxLength={RADIO_LIMITS.name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Soort zender" hint="(waar je onder staat op Kuddes Radio)">
        <GenreSelect value={genre} onChange={setGenre} />
      </Field>
      <Field label="Over je zender" hint="(mag, hoeft niet)" error={fields.description}>
        <textarea className="text-box" rows={4} value={description} maxLength={RADIO_LIMITS.description} onChange={(e) => setDescription(e.target.value)} placeholder="Wat je draait of bespreekt, wanneer je live bent, wie er meedoen…" />
      </Field>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={save.isPending || !name.trim()}>
          <FarmIcon name="diskette" /> {station ? 'Opslaan' : 'Zender maken'}
        </Button>
        {save.isSuccess && station && <span className="form-success">Opgeslagen</span>}
        {save.isError && !Object.keys(fields).length && <span className="form-error">{errorMessage(save.error)}</span>}
      </div>
    </form>
  )
}

export function StationDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Je zender maken" icon="transmit" onClose={onClose}>
      <StationForm station={null} onSaved={onClose} />
    </Modal>
  )
}

/** The big talk button: talks while held (mouse, finger or keyboard). */
export function PushToTalk({ talking, onTalk, label = 'Praten' }: { talking: boolean; onTalk: (on: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      className={talking ? 'rd-ptt on' : 'rd-ptt'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        onTalk(true)
      }}
      onPointerUp={() => onTalk(false)}
      onPointerCancel={() => onTalk(false)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !e.repeat && onTalk(true)}
      onKeyUp={(e) => (e.key === 'Enter' || e.key === ' ') && onTalk(false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={talking}
    >
      <FarmIcon name="microphone" size={32} />
      <span>{talking ? 'Je bent te horen' : label}</span>
    </button>
  )
}
