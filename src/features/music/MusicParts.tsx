/**
 * The pieces of /muziek: a cover, the song lists (with play buttons that
 * follow the player), the charts, artist cards, and the dialogs to make your
 * page or change a song.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MUSIC_GENRES, MUSIC_LIMITS, formatTrackTime, type ChartEntry, type MusicArtist, type MusicGenre, type MusicTrack, type TrackCredit } from '../../../shared/music'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { compressImage } from '../../lib/compressImage'
import { ShareWithFriends } from '../share/ShareWithFriends'
import { genreIcon, musicKeys, releaseLabel, useLike, useMyMusic } from './musicQueries'
import { player, useNowPlaying } from './player'
import './Music.css'

const GENRE_KEYS = Object.keys(MUSIC_GENRES) as MusicGenre[]

/** The cover, or a coloured square with the genre's icon. */
export function Cover({ track, size = 44 }: { track: Pick<MusicTrack, 'coverUrl' | 'genre'>; size?: number }) {
  return track.coverUrl ? (
    <img className="mu-cover" src={track.coverUrl} width={size} height={size} alt="" loading="lazy" />
  ) : (
    <span className={`mu-cover plain g-${track.genre}`} style={{ width: size, height: size }}>
      <FarmIcon name={genreIcon(track.genre)} size={size >= 64 ? 32 : 16} />
    </span>
  )
}

/** Animated bars: this one's playing. */
const Equalizer = () => (
  <span className="mu-eq" aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
)

export function LikeButton({ track }: { track: MusicTrack }) {
  const { user } = useAuth()
  const like = useLike()
  if (!user?.emailVerified || track.mine)
    return (
      <span className="mu-likes" title={`${track.likes} ${track.likes === 1 ? 'like' : 'likes'}`}>
        <FarmIcon name="heart" /> {track.likes}
      </span>
    )
  return (
    <button
      type="button"
      className={track.liked ? 'mu-likes mu-like-btn liked' : 'mu-likes mu-like-btn'}
      onClick={() => like.mutate(track)}
      disabled={like.isPending}
      aria-pressed={track.liked}
      title={track.liked ? 'Niet meer leuk' : 'Leuk!'}
    >
      <FarmIcon name={track.liked ? 'heart' : 'heart_add'} /> {track.likes}
    </button>
  )
}

/** Songs in a list: press one and the list becomes the queue. */
export function TrackList({ tracks, numbered, showArtist = true, onEdit, openTrack }: { tracks: MusicTrack[]; numbered?: boolean; showArtist?: boolean; onEdit?: (t: MusicTrack) => void; openTrack?: number | null }) {
  const now = useNowPlaying()
  const playable = tracks.filter((t) => t.status === 'klaar')
  // One song's details open at a time (click its title)
  const [openId, setOpenId] = useState<number | null>(openTrack ?? null)
  // A link to one song (a shared one): its details open, and in view
  useEffect(() => {
    if (openTrack) document.getElementById(`nummer-${openTrack}`)?.scrollIntoView({ block: 'center' })
  }, [openTrack])
  return (
    <ol className="mu-tracks">
      {tracks.map((t, i) => {
        const on = now.id === t.id
        const ready = t.status === 'klaar' && !!t.audioUrl
        const open = openId === t.id
        return (
          <li key={t.id} id={`nummer-${t.id}`} className={`${on ? 'on' : ''}${open ? ' open' : ''}`}>
            {numbered && <span className="mu-num">{on && now.playing ? <Equalizer /> : i + 1}</span>}
            <button
              type="button"
              className="mu-play"
              disabled={!ready}
              onClick={() => player.play(playable, playable.findIndex((p) => p.id === t.id))}
              aria-label={on && now.playing ? `${t.title} pauzeren` : `${t.title} afspelen`}
            >
              <Cover track={t} />
              {ready && (
                <span className="mu-play-icon">
                  <FarmIcon name={on && now.playing ? 'control_pause' : 'control_play'} />
                </span>
              )}
            </button>
            <span className="mu-track-text">
              <button type="button" className="mu-title-btn" onClick={() => setOpenId(open ? null : t.id)} aria-expanded={open} title="Meer over dit nummer">
                {t.title}
              </button>
              <small>
                {showArtist && (
                  <>
                    <Link to={`/muziek/${t.artist.slug}`}>{t.artist.name}</Link> ·{' '}
                  </>
                )}
                <Link to={`/muziek?genre=${t.genre}`} className="muted">
                  {MUSIC_GENRES[t.genre].name}
                </Link>
                {t.released && <span className="muted"> · {t.released.date.slice(0, 4)}</span>}
                {t.status === 'verwerken' && (
                  <span className="mu-status">
                    <FarmIcon name="hourglass" /> wordt verwerkt…
                  </span>
                )}
                {t.status === 'mislukt' && (
                  <span className="mu-status failed">
                    <FarmIcon name="exclamation" /> verwerken mislukt
                  </span>
                )}
              </small>
            </span>
            <span className="mu-plays" title={`${t.plays} keer beluisterd`}>
              <FarmIcon name="sound" /> {t.plays}
            </span>
            <LikeButton track={t} />
            <span className="mu-time">{t.duration ? formatTrackTime(t.duration) : '–'}</span>
            {onEdit && t.mine && (
              <button type="button" className="mu-icon-btn" onClick={() => onEdit(t)} title="Nummer bewerken">
                <FarmIcon name="pencil" />
              </button>
            )}
            {open && <TrackDetails track={t} />}
          </li>
        )
      })}
    </ol>
  )
}

/** Up, down, new or the same as last week. */
function Movement({ entry }: { entry: ChartEntry }) {
  if (entry.lastRank === null) return <span className="mu-move new">NIEUW</span>
  const d = entry.lastRank - entry.rank
  if (d > 0)
    return (
      <span className="mu-move up" title={`${d} ${d === 1 ? 'plek' : 'plekken'} gestegen (was ${entry.lastRank})`}>
        ▲ {d}
      </span>
    )
  if (d < 0)
    return (
      <span className="mu-move down" title={`${-d} ${d === -1 ? 'plek' : 'plekken'} gedaald (was ${entry.lastRank})`}>
        ▼ {-d}
      </span>
    )
  return (
    <span className="mu-move same" title="Zelfde plek als vorige week">
      =
    </span>
  )
}

/** The charts: place, movement, the song and how often it was played this week. */
export function ChartList({ entries, compact }: { entries: ChartEntry[]; compact?: boolean }) {
  const now = useNowPlaying()
  const list = entries.map((e) => e.track)
  return (
    <ol className={compact ? 'mu-chart compact' : 'mu-chart'}>
      {entries.map((e, i) => {
        const on = now.id === e.track.id
        return (
          <li key={e.track.id} className={on ? 'on' : undefined}>
            <span className={e.rank <= 3 ? `mu-rank top${e.rank}` : 'mu-rank'}>{e.rank}</span>
            <Movement entry={e} />
            <button type="button" className="mu-play" onClick={() => player.play(list, i)} aria-label={on && now.playing ? 'Pauzeren' : `${e.track.title} afspelen`}>
              <Cover track={e.track} size={compact ? 36 : 48} />
              <span className="mu-play-icon">
                <FarmIcon name={on && now.playing ? 'control_pause' : 'control_play'} />
              </span>
            </button>
            <span className="mu-track-text">
              <b>{e.track.title}</b>
              <small>
                <Link to={`/muziek/${e.track.artist.slug}`}>{e.track.artist.name}</Link>
              </small>
            </span>
            {!compact && <LikeButton track={e.track} />}
            <span className="mu-week" title="Deze week beluisterd">
              {e.weekPlays}× <small>deze week</small>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** A band's own picture, or else the member's profile photo. */
export function BandPic({ artist, size = 'medium' }: { artist: MusicArtist; size?: 'small' | 'medium' }) {
  if (!artist.avatarUrl) return <Avatar user={artist.user} size={size} static />
  const px = size === 'small' ? 50 : 75
  return <img className={`mu-bandpic ${size}`} src={artist.avatarUrl} width={px} height={px} alt="" loading="lazy" />
}

export function ArtistCard({ artist }: { artist: MusicArtist }) {
  return (
    <li className="mu-artist">
      <Link to={`/muziek/${artist.slug}`}>
        <BandPic artist={artist} />
        <span>
          <b>{artist.name}</b>
          <small className="muted">
            {MUSIC_GENRES[artist.genre].name} · {artist.trackCount} {artist.trackCount === 1 ? 'nummer' : 'nummers'}
          </small>
        </span>
      </Link>
    </li>
  )
}

/** A genre picker as a list of choices (in the forms). */
export function GenreSelect({ value, onChange }: { value: MusicGenre; onChange: (g: MusicGenre) => void }) {
  return (
    <select className="text-box" value={value} onChange={(e) => onChange(e.target.value as MusicGenre)}>
      {GENRE_KEYS.map((g) => (
        <option key={g} value={g}>
          {MUSIC_GENRES[g].name} ({MUSIC_GENRES[g].hint})
        </option>
      ))}
    </select>
  )
}

/** Making your music page, or changing its name, genre and text. */
/** Making an artist or band page (`artist` null), or changing or removing one. */
export function ArtistPageDialog({ artist, first, onClose, onSaved, onRemoved }: { artist: MusicArtist | null; first?: boolean; onClose: () => void; onSaved?: (a: MusicArtist) => void; onRemoved?: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [name, setName] = useState(artist?.name ?? (first ? (user?.name ?? '') : ''))
  const [bio, setBio] = useState(artist?.bio ?? '')
  const [genre, setGenre] = useState<MusicGenre>(artist?.genre ?? 'pop')
  // The band's own picture: a new one chosen here, or taken away
  const [picture, setPicture] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dropPicture, setDropPicture] = useState(false)
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  const shownPicture = preview ?? (dropPicture ? null : (artist?.avatarUrl ?? null))
  const save = useMutation({
    mutationFn: async () => {
      const saved = artist ? await api<MusicArtist>(`/music/artists/${artist.id}`, { method: 'PUT', body: { name, bio, genre } }) : await api<MusicArtist>('/music/artists', { method: 'POST', body: { name, bio, genre } })
      if (picture) {
        const form = new FormData()
        form.set('file', await compressImage(picture, 800))
        await api(`/music/artists/${saved.id}/avatar`, { method: 'PUT', form })
      } else if (dropPicture && artist?.avatarUrl) await api(`/music/artists/${saved.id}/avatar`, { method: 'DELETE' })
      return saved
    },
    onSuccess: (a) => {
      void queryClient.invalidateQueries({ queryKey: musicKeys.all })
      onSaved?.(a)
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/music/artists/${artist!.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: musicKeys.all })
      onClose()
      onRemoved?.()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Modal title={artist ? 'Muziekpagina bewerken' : first ? 'Je muziekpagina maken' : 'Nieuwe artiest of band'} icon="music" onClose={onClose}>
      <form
        className="mu-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="mu-band-head">
          <label className="mu-bandpic-pick" title="Een eigen foto of logo voor deze pagina (mag, hoeft niet)">
            {shownPicture ? <img src={shownPicture} alt="" /> : <FarmIcon name="picture_add" size={32} />}
            <small>{shownPicture ? 'Andere foto' : 'Bandfoto'}</small>
            <input
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (preview) URL.revokeObjectURL(preview)
                setPicture(f)
                setPreview(URL.createObjectURL(f))
                setDropPicture(false)
              }}
            />
          </label>
          <div className="mu-band-head-fields">
            <Field label="Artiesten- of bandnaam" error={fields.name}>
              <input className="text-box" value={name} maxLength={MUSIC_LIMITS.name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            {shownPicture && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setPicture(null)
                  setPreview(null)
                  setDropPicture(true)
                }}
              >
                Foto weghalen (dan staat je profielfoto er)
              </button>
            )}
            {!shownPicture && <small className="muted">Zonder bandfoto staat je eigen profielfoto op de pagina.</small>}
          </div>
        </div>
        <Field label="Je genre" hint="(waar je pagina onder staat)">
          <GenreSelect value={genre} onChange={setGenre} />
        </Field>
        <Field label="Over jou of je band" hint="(mag, hoeft niet)" error={fields.bio}>
          <textarea className="text-box" rows={4} value={bio} maxLength={MUSIC_LIMITS.bio} onChange={(e) => setBio(e.target.value)} placeholder="Wie je bent, waar je speelt, met wie…" />
        </Field>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending || !name.trim()}>
            <FarmIcon name="diskette" /> {artist ? 'Opslaan' : 'Pagina maken'}
          </Button>
          {artist && (
            <Button
              onClick={() => confirm(`"${artist.name}" verwijderen, met alle ${artist.trackCount} nummers erop? Dit kan niet ongedaan worden gemaakt.`) && remove.mutate()}
              disabled={remove.isPending}
            >
              <FarmIcon name="bin" /> Pagina verwijderen
            </Button>
          )}
          {(save.isError || remove.isError) && !Object.keys(fields).length && <span className="form-error">{errorMessage(save.error ?? remove.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** Changing a song's title, genre and text, or removing it. */
export function TrackDialog({ track, onClose }: { track: MusicTrack; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(track.title)
  const [genre, setGenre] = useState<MusicGenre>(track.genre)
  const [description, setDescription] = useState(track.description)
  const [artistId, setArtistId] = useState(track.artist.id)
  const [release, setRelease] = useState<Release>({ releasedOn: track.released?.date ?? null, releaseYearOnly: track.released?.yearOnly ?? false })
  const [credits, setCredits] = useState<TrackCredit[]>(track.credits)
  const { data: mine } = useMyMusic()
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: musicKeys.all })
    onClose()
  }
  const save = useMutation({
    mutationFn: () => api<void>(`/tracks/${track.id}`, { method: 'PATCH', body: { title, genre, description, artistId, ...release, credits: credits.filter((c) => c.role.trim() && c.name.trim()) } }),
    onSuccess: () => {
      player.update({ ...track, title, genre, description, released: release.releasedOn ? { date: release.releasedOn, yearOnly: release.releaseYearOnly } : null, credits })
      done()
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/tracks/${track.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      player.remove(track.id)
      done()
    },
  })
  return (
    <Modal title="Nummer bewerken" icon="music" onClose={onClose}>
      <form
        className="mu-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Titel">
          <input className="text-box" value={title} maxLength={MUSIC_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Genre">
          <GenreSelect value={genre} onChange={setGenre} />
        </Field>
        {mine && mine.artists.length > 1 && (
          <Field label="Op de pagina van">
            <select className="text-box" value={artistId} onChange={(e) => setArtistId(Number(e.target.value))}>
              {mine.artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Over dit nummer" hint="(mag, hoeft niet)">
          <textarea className="text-box" rows={3} value={description} maxLength={MUSIC_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Uitgebracht">
          <ReleaseField value={release} onChange={setRelease} />
        </Field>
        <Field label="Wie werkten er nog meer aan mee?" hint="(credits; mag leeg)">
          <CreditsEditor value={credits} onChange={setCredits} />
        </Field>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending || !title.trim()}>
            <FarmIcon name="diskette" /> Opslaan
          </Button>
          <Button onClick={() => confirm(`"${track.title}" verwijderen? Dit kan niet ongedaan worden gemaakt.`) && remove.mutate()} disabled={remove.isPending}>
            <FarmIcon name="bin" /> Verwijderen
          </Button>
          {(save.isError || remove.isError) && <span className="form-error">{errorMessage(save.error ?? remove.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** When a song came out: not given, just a year, or a whole date. */
export type Release = { releasedOn: string | null; releaseYearOnly: boolean }

export function ReleaseField({ value, onChange }: { value: Release; onChange: (v: Release) => void }) {
  const mode = !value.releasedOn ? 'geen' : value.releaseYearOnly ? 'jaar' : 'datum'
  const year = value.releasedOn?.slice(0, 4) ?? String(new Date().getFullYear())
  return (
    <span className="mu-release">
      <select
        className="text-box"
        value={mode}
        onChange={(e) => {
          const m = e.target.value
          if (m === 'geen') onChange({ releasedOn: null, releaseYearOnly: false })
          else if (m === 'jaar') onChange({ releasedOn: `${year}-01-01`, releaseYearOnly: true })
          else onChange({ releasedOn: value.releasedOn ?? new Date().toISOString().slice(0, 10), releaseYearOnly: false })
        }}
        aria-label="Wanneer uitgebracht"
      >
        <option value="geen">Niet ingevuld</option>
        <option value="jaar">Alleen het jaar</option>
        <option value="datum">Precieze datum</option>
      </select>
      {mode === 'jaar' && (
        <input
          className="text-box"
          type="number"
          min={1900}
          max={new Date().getFullYear() + 1}
          value={year}
          onChange={(e) => e.target.value.length === 4 && onChange({ releasedOn: `${e.target.value}-01-01`, releaseYearOnly: true })}
          aria-label="Jaar"
        />
      )}
      {mode === 'datum' && <input className="text-box" type="date" value={value.releasedOn ?? ''} max={new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && onChange({ releasedOn: e.target.value, releaseYearOnly: false })} aria-label="Datum" />}
    </span>
  )
}

/** Who else worked on it: a row per person (what they did, their name, and their Kuddes username if they have one). */
export function CreditsEditor({ value, onChange }: { value: TrackCredit[]; onChange: (v: TrackCredit[]) => void }) {
  const set = (i: number, changes: Partial<TrackCredit>) => onChange(value.map((c, j) => (j === i ? { ...c, ...changes } : c)))
  return (
    <div className="mu-credits-edit">
      {value.map((c, i) => (
        <div key={i} className="mu-credit-row">
          <input className="text-box" value={c.role} maxLength={MUSIC_LIMITS.creditRole} onChange={(e) => set(i, { role: e.target.value })} placeholder="Wat (bijv. gitaar, zang, productie)" aria-label="Wat deed diegene" list="mu-credit-roles" />
          <input className="text-box" value={c.name} maxLength={MUSIC_LIMITS.creditName} onChange={(e) => set(i, { name: e.target.value })} placeholder="Naam" aria-label="Naam" />
          <input className="text-box" value={c.username ?? ''} maxLength={40} onChange={(e) => set(i, { username: e.target.value || null })} placeholder="@gebruikersnaam (mag leeg)" aria-label="Gebruikersnaam op Kuddes" />
          <button type="button" className="mu-icon-btn" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Weghalen" aria-label="Weghalen">
            ×
          </button>
        </div>
      ))}
      <datalist id="mu-credit-roles">
        {['Zang', 'Gitaar', 'Basgitaar', 'Drums', 'Piano', 'Toetsen', 'Productie', 'Mix', 'Master', 'Tekst', 'Muziek', 'Rap', 'Achtergrondzang', 'Viool', 'Hoesontwerp'].map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      {value.length < MUSIC_LIMITS.credits && (
        <button type="button" className="link-button" onClick={() => onChange([...value, { role: '', name: '', username: null }])}>
          <FarmIcon name="user_add" /> Iemand toevoegen
        </button>
      )}
    </div>
  )
}

/** A song's details: what it's about, when it came out and who worked on it, and sharing it. */
export function TrackDetails({ track }: { track: MusicTrack }) {
  const credits = track.credits.filter((c) => c.name)
  const share = track.status === 'klaar' && <ShareWithFriends path={`/muziek/${track.artist.slug}?nummer=${track.id}`} label="Deel dit nummer" className="link-button mu-share" />
  if (!track.description && !track.released && !credits.length)
    return (
      <p className="muted mu-details-empty">
        Er staat (nog) niets meer over dit nummer. {share}
      </p>
    )
  return (
    <div className="mu-details">
      {share}
      {track.description && <p className="mu-details-text">{track.description}</p>}
      {track.released && (
        <p>
          <FarmIcon name="calendar" /> Uitgebracht: <b>{releaseLabel(track.released)}</b>
        </p>
      )}
      {credits.length > 0 && (
        <dl className="mu-credits">
          {credits.map((c, i) => (
            <div key={i}>
              <dt>{c.role}</dt>
              <dd>{c.username ? <Link to={`/profiel/${c.username}`}>{c.name}</Link> : c.name}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
