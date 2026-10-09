import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar } from '../../components/ui/Avatar'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { acceptCall, clearCallNote, hangUp, rejectCall, toggleMute, useCall } from './calls'
import './CallWindow.css'

const STATUS = { outgoing: 'Bellen…', incoming: 'belt je!', connecting: 'Verbinden…', connected: '' } as const

function useTimer(since: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!since) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [since])
  if (!since) return ''
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** A call in Kuddes Messenger (calls.ts): ringing, talking, and how it ended. On every page. */
export function CallWindow() {
  const call = useCall()
  const time = useTimer(call.phase === 'connected' ? call.since : null)
  const note = call.phase === 'idle' ? call.note : undefined
  // A note about how it ended goes away by itself
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(clearCallNote, 6000)
    return () => window.clearTimeout(t)
  }, [note])

  if (call.phase === 'idle') {
    return note ? (
      <div className="call-window call-note" role="status">
        <FarmIcon name="telephone" /> {note}
        <button type="button" className="icon-button" onClick={clearCallNote} aria-label="Sluiten">
          ×
        </button>
      </div>
    ) : null
  }
  const { peer } = call
  return (
    <div className={`call-window ${call.phase}`} role="dialog" aria-label={`Gesprek met ${peer.nickname}`}>
      <div className="call-who">
        <span className="call-pic">
          <Avatar user={{ ...peer, name: peer.nickname, online: true }} size="small" static />
        </span>
        <span className="call-text">
          <b>
            <Link to={`/profiel/${peer.username}`}>{peer.nickname}</Link>
          </b>
          <small>{call.phase === 'connected' ? `In gesprek · ${time}` : STATUS[call.phase]}</small>
        </span>
      </div>
      <div className="call-actions">
        {call.phase === 'incoming' ? (
          <>
            <button type="button" className="call-btn accept" onClick={() => void acceptCall()}>
              <FarmIcon name="telephone" /> Opnemen
            </button>
            <button type="button" className="call-btn end" onClick={rejectCall}>
              Weigeren
            </button>
          </>
        ) : (
          <>
            <button type="button" className={call.muted ? 'call-btn on' : 'call-btn'} onClick={toggleMute} aria-pressed={call.muted} title={call.muted ? 'Microfoon aanzetten' : 'Microfoon uitzetten'}>
              <FarmIcon name={call.muted ? 'sound_mute' : 'microphone'} /> {call.muted ? 'Gedempt' : 'Dempen'}
            </button>
            <button type="button" className="call-btn end" onClick={hangUp}>
              <FarmIcon name="phone_handset" /> Ophangen
            </button>
          </>
        )}
      </div>
    </div>
  )
}
