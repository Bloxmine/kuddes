/**
 * The Kuddes Muziek gadget on a profile: the owner's songs from /muziek (or
 * the ones they liked), played in the site's player bar, so the music keeps
 * going while visitors click on.
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import type { GadgetConfig } from '../../../shared/gadgets'
import { formatTrackTime, type MusicTrack } from '../../../shared/music'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api } from '../../lib/api'
import { Cover } from './MusicParts'
import { musicKeys } from './musicQueries'
import { player, useNowPlaying } from './player'
import './MusicGadget.css'

type Data = Extract<Gadget, { type: 'kuddesmuziek' }>

export function KuddesMusicGadget({ gadget, username, isOwner }: { gadget: Data; username: string; isOwner: boolean }) {
  const { show, count, look } = gadget.config
  const { data, isLoading } = useQuery({
    queryKey: [...musicKeys.all, 'gadget', username, show, count],
    queryFn: () => api<{ artists: { slug: string; name: string }[]; tracks: MusicTrack[] }>(`/music/users/${encodeURIComponent(username)}/tracks?show=${show}&limit=${count}`),
  })
  const now = useNowPlaying()
  if (isLoading || !data) return <p className="muted">Laden…</p>
  const { tracks, artists } = data
  // One band: its name and page; more: all their music on Kuddes Muziek
  const only = artists.length === 1 ? artists[0] : null
  const favorites = show === 'favorieten'

  if (!tracks.length)
    return (
      <p className="empty">
        {!isOwner ? (
          'Nog geen nummers.'
        ) : favorites ? (
          <>
            Nummers die je leuk vindt op <Link to="/muziek">Kuddes Muziek</Link> komen hier te staan.
          </>
        ) : artists.length ? (
          <>
            <Link to="/muziek/uploaden">Upload je eerste nummer</Link>, dan staat het hier.
          </>
        ) : (
          <>
            Maak je zelf muziek? <Link to="/muziek/uploaden">Maak je muziekpagina</Link>. Of kies bij de instellingen de nummers die je leuk vindt.
          </>
        )}
      </p>
    )

  const first = tracks[0]
  const playingHere = tracks.some((t) => t.id === now.id) && now.playing
  return (
    <div className={`mug mug-${look}`}>
      {look === 'speler' && (
        <div className="mug-head">
          <Cover track={first} size={72} />
          <div className="mug-head-text">
            <b>{favorites ? 'Leuke nummers' : (only?.name ?? 'Mijn muziek')}</b>
            <small className="muted">
              {tracks.length} {tracks.length === 1 ? 'nummer' : 'nummers'}
              {favorites ? ' die ik leuk vind' : show === 'populair' ? ', meest beluisterd' : ''}
            </small>
            <span className="mug-buttons">
              <button type="button" className="btn btn-cta" onClick={() => (playingHere ? player.toggle() : player.play(tracks, 0))}>
                <FarmIcon name={playingHere ? 'control_pause' : 'control_play'} /> {playingHere ? 'Pauze' : 'Afspelen'}
              </button>
              {tracks.length > 1 && (
                <button type="button" className="btn" onClick={() => player.play(tracks, 0, { shuffle: true })} title="Willekeurig afspelen">
                  <span className="mu-shuffle" aria-hidden="true">
                    ⤨
                  </span>
                </button>
              )}
            </span>
          </div>
        </div>
      )}
      <ol className="mug-list">
        {tracks.map((t, i) => {
          const on = now.id === t.id
          return (
            <li key={t.id} className={on ? 'on' : undefined}>
              <button type="button" onClick={() => player.play(tracks, i)} aria-label={on && now.playing ? `${t.title} pauzeren` : `${t.title} afspelen`}>
                {look === 'lijst' ? <Cover track={t} size={32} /> : <span className="mug-num">{i + 1}</span>}
                <span className="mug-text">
                  <b>{t.title}</b>
                  {(favorites || look === 'lijst') && <small>{t.artist.name}</small>}
                </span>
                <FarmIcon name={on && now.playing ? 'control_pause' : 'control_play'} />
                <small className="mug-time">{formatTrackTime(t.duration)}</small>
              </button>
            </li>
          )
        })}
      </ol>
      <Link to={favorites || !only ? '/muziek' : `/muziek/${only.slug}`} className="mug-more">
        <FarmIcon name="music" /> {favorites || !only ? 'Kuddes Muziek' : `${only.name} op Kuddes Muziek`} »
      </Link>
    </div>
  )
}

export function KuddesMusicGadgetEditor({ value, onChange }: { value: GadgetConfig['kuddesmuziek']; onChange: (next: GadgetConfig['kuddesmuziek']) => void }) {
  return (
    <div className="gadget-rows">
      <label className="gadget-toggle">
        Laat zien{' '}
        <select className="text-box" value={value.show} onChange={(e) => onChange({ ...value, show: e.target.value as GadgetConfig['kuddesmuziek']['show'] })}>
          <option value="nieuwste">Mijn nieuwste nummers</option>
          <option value="populair">Mijn meest beluisterde nummers</option>
          <option value="favorieten">Nummers die ik leuk vind</option>
        </select>
      </label>
      <label className="gadget-toggle">
        Aantal{' '}
        <select className="text-box" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) })}>
          {[3, 5, 8, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n} nummers
            </option>
          ))}
        </select>
      </label>
      <label className="gadget-toggle">
        Als{' '}
        <select className="text-box" value={value.look} onChange={(e) => onChange({ ...value, look: e.target.value as GadgetConfig['kuddesmuziek']['look'] })}>
          <option value="speler">Speler met hoes</option>
          <option value="lijst">Lijst met hoesjes</option>
        </select>
      </label>
      <p className="muted">
        Eigen nummers upload je op <Link to="/muziek/uploaden">Kuddes Muziek</Link>. Ze spelen in de speler onderaan, dus de muziek gaat door als bezoekers verder klikken.
      </p>
    </div>
  )
}
