/**
 * The Kuddes Radio gadget on a profile: the owner's own station (live, or
 * when it's on next), or the stations they follow, with a button to listen
 * along in the player bar.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import type { GadgetConfig } from '../../../shared/gadgets'
import { RADIO_GENRES, type RadioStation } from '../../../shared/radio'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api } from '../../lib/api'
import { player, useLiveListen } from '../music/player'
import { formatShowTime } from './radioFormat'
import { genreIcon, radioKeys } from './radioQueries'
import './Radio.css'

type Data = Extract<Gadget, { type: 'kuddesradio' }>

export function KuddesRadioGadget({ gadget, username, isOwner }: { gadget: Data; username: string; isOwner: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: [...radioKeys.all, 'gadget', username],
    queryFn: () => api<{ own: RadioStation | null; following: RadioStation[] }>(`/radio/users/${encodeURIComponent(username)}`),
    refetchInterval: 60_000,
  })
  if (isLoading || !data) return <p className="muted">Laden…</p>

  if (gadget.config.show === 'mijn') {
    if (!data.own)
      return (
        <p className="empty">
          {isOwner ? (
            <>
              Je hebt nog geen zender. <Link to="/radio/studio">Begin met radio maken</Link>, of kies bij de instellingen de zenders die je volgt.
            </>
          ) : (
            'Nog geen zender.'
          )}
        </p>
      )
    return (
      <div className="rdg">
        <StationRow station={data.own} big />
        <Link to="/radio" className="rdg-more">
          <FarmIcon name="transmit" /> Kuddes Radio »
        </Link>
      </div>
    )
  }

  return (
    <div className="rdg">
      {data.following.length ? (
        <ul className="rdg-list">
          {data.following.map((s) => (
            <li key={s.user.username}>
              <StationRow station={s} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">{isOwner ? 'Volg zenders op Kuddes Radio, dan staan ze hier.' : 'Nog geen zenders.'}</p>
      )}
      <Link to="/radio" className="rdg-more">
        <FarmIcon name="transmit" /> Kuddes Radio »
      </Link>
    </div>
  )
}

function StationRow({ station, big }: { station: RadioStation; big?: boolean }) {
  const listening = useLiveListen()
  const on = listening.live?.username === station.user.username && listening.playing
  return (
    <div className={big ? 'rdg-station big' : 'rdg-station'}>
      <Link to={`/radio/${station.user.username}`} className={`rdg-cover rg-${station.genre}`} style={station.bannerUrl ? { backgroundImage: `url(${station.bannerUrl})` } : undefined}>
        {!station.bannerUrl && <FarmIcon name={genreIcon(station.genre)} size={big ? 32 : 16} />}
      </Link>
      <span className="rdg-text">
        <Link to={`/radio/${station.user.username}`}>
          <b>{station.name}</b>
        </Link>
        <small>
          {station.live ? (
            <>
              <span className="mu-live-badge">LIVE</span> {station.live.title}
            </>
          ) : station.next ? (
            `Volgende: ${formatShowTime(station.next.startsAt, station.next.endsAt)}`
          ) : (
            RADIO_GENRES[station.genre].name
          )}
        </small>
      </span>
      {(station.live || on) && (
        <button
          type="button"
          className="btn btn-cta rdg-listen"
          onClick={() => player.listen({ username: station.user.username, station: station.name, title: station.live?.title ?? station.name, bannerUrl: station.bannerUrl })}
          title={on ? 'Stoppen' : 'Luister live'}
        >
          <FarmIcon name={on ? 'control_pause' : 'control_play'} />
          {big && (on ? ' Stoppen' : ' Luister')}
        </button>
      )}
    </div>
  )
}

export function KuddesRadioGadgetEditor({ value, onChange }: { value: GadgetConfig['kuddesradio']; onChange: (next: GadgetConfig['kuddesradio']) => void }) {
  return (
    <div className="gadget-rows">
      <label className="gadget-toggle">
        Laat zien{' '}
        <select className="text-box" value={value.show} onChange={(e) => onChange({ show: e.target.value as GadgetConfig['kuddesradio']['show'] })}>
          <option value="mijn">Mijn eigen zender</option>
          <option value="gevolgd">Zenders die ik volg</option>
        </select>
      </label>
      <p className="muted">
        Bezoekers zien of de zender live is en kunnen meteen meeluisteren. Zelf radio maken? Kijk op <Link to="/radio/studio">Kuddes Radio</Link>.
      </p>
    </div>
  )
}
