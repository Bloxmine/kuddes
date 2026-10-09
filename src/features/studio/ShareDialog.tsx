import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MUSIC_GENRES, MUSIC_LIMITS, type MusicGenre, type MusicTrack } from '../../../shared/music'
import { RADIO_LIMITS, SOUND_COLORS, type RadioSound } from '../../../shared/radio'
import type { StudioPattern, StudioProject } from '../../../shared/studio'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { api, errorMessage } from '../../lib/api'
import { musicKeys, useMyMusic } from '../music/musicQueries'
import { radioKeys, useMyRadio } from '../radio/radioQueries'
import { renderSeconds, renderWav, type PlayMode } from './engine'
import { lcdTime } from './studio'

type Props = { target: 'muziek' | 'radio'; project: StudioProject; title: string; pattern: StudioPattern; onClose: () => void }

/** What to send: the whole song (when there is one) or the chosen pattern. */
function WhatPicker({ song, setSong, hasSong, patternName, seconds }: { song: boolean; setSong: (s: boolean) => void; hasSong: boolean; patternName: string; seconds: number }) {
  return (
    <Field label="Wat stuur je?">
      <span className="std-share-what">
        <label>
          <input type="radio" checked={song} disabled={!hasSong} onChange={() => setSong(true)} /> Het hele nummer (afspeellijst)
        </label>
        <label>
          <input type="radio" checked={!song} onChange={() => setSong(false)} /> Alleen “{patternName}”
        </label>
        <small className="muted">Lengte: {lcdTime(seconds)}</small>
      </span>
    </Field>
  )
}

/**
 * Sending what you made in Kuddes Studio straight to Kuddes Muziek (a song on
 * your artist page) or Kuddes Radio (a sound button for your station), with
 * the rights those already ask for.
 */
export function ShareDialog(p: Props) {
  return (
    <Modal title={p.target === 'muziek' ? 'Op Kuddes Muziek zetten' : 'Jingle voor Kuddes Radio'} icon={p.target === 'muziek' ? 'cd' : 'transmit'} onClose={p.onClose} wide>
      {p.target === 'muziek' ? <ToMusic {...p} /> : <ToRadio {...p} />}
    </Modal>
  )
}

function ToMusic({ project, title, pattern, onClose }: Props) {
  const queryClient = useQueryClient()
  const me = useMyMusic()
  const hasSong = project.playlist.length > 0
  const [song, setSong] = useState(hasSong)
  const [artistId, setArtistId] = useState<number | null>(null)
  const [name, setName] = useState(title.slice(0, MUSIC_LIMITS.title))
  const [genre, setGenre] = useState<MusicGenre | ''>('')
  const [description, setDescription] = useState('Gemaakt in Kuddes Studio.')
  const mode: PlayMode = song ? { song: true } : { song: false, pattern: pattern.id }
  const seconds = renderSeconds(project, mode)
  const artists = me.data?.artists ?? []
  const artist = artists.find((a) => a.id === artistId) ?? artists[0]

  const send = useMutation({
    mutationFn: async () => {
      // A WAV is big: long songs go up in mono, or at a lower rate, to stay under the limit
      const fits = (rate: number, channels: number) => seconds * rate * channels * 2 < MUSIC_LIMITS.bytes * 0.95
      const opts = fits(44100, 2) ? {} : fits(44100, 1) ? { mono: true } : { mono: true, rate: 22050 }
      const blob = await renderWav(project, mode, opts)
      const form = new FormData()
      form.set('file', new File([blob], `${name || 'Nummer'}.wav`, { type: 'audio/wav' }))
      form.set('artistId', String(artist!.id))
      form.set('title', name)
      form.set('genre', genre)
      form.set('description', description)
      form.set('credits', '[]')
      return api<MusicTrack>('/tracks', { method: 'POST', form })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: musicKeys.all }),
  })

  if (me.isLoading) return <p className="muted">Laden…</p>
  if (me.error) return <p className="form-error">{errorMessage(me.error)}</p>
  if (!me.data?.access.allowed)
    return (
      <div className="std-share">
        <p>Om nummers op Kuddes Muziek te zetten heb je uploadrechten nodig. Die vraag je één keer aan; de beheerder kijkt ernaar.</p>
        <p>
          <Link to="/muziek/uploaden" className="btn btn-cta">
            <FarmIcon name="cd" /> Uploadrechten aanvragen
          </Link>
        </p>
        <p className="muted">Je project blijft gewoon bewaard; kom daarna terug en stuur het in één keer door.</p>
      </div>
    )
  if (!artist)
    return (
      <div className="std-share">
        <p>Je nummers komen op een artiesten- of bandpagina. Maak die eerst aan.</p>
        <Link to="/muziek/uploaden" className="btn btn-cta">
          <FarmIcon name="user" /> Artiestenpagina maken
        </Link>
      </div>
    )
  if (send.isSuccess)
    return (
      <div className="std-share">
        <p>
          <FarmIcon name="accept" /> <b>{send.data.title}</b> staat op Kuddes Muziek. Het wordt nu omgezet naar MP3; over een minuutje kan iedereen het horen.
        </p>
        <p>
          <Link to={`/muziek/${artist.slug}?nummer=${send.data.id}`} className="btn btn-cta">
            Bekijken op {artist.name}
          </Link>{' '}
          <Button onClick={onClose}>Verder met maken</Button>
        </p>
      </div>
    )
  return (
    <form
      className="std-share"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && genre) send.mutate()
      }}
    >
      <WhatPicker song={song} setSong={setSong} hasSong={hasSong} patternName={pattern.name} seconds={seconds} />
      {artists.length > 1 && (
        <Field label="Op welke pagina?">
          <select className="text-box" value={artist.id} onChange={(e) => setArtistId(Number(e.target.value))}>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Titel">
        <input className="text-box" value={name} maxLength={MUSIC_LIMITS.title} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Genre">
        <select className="text-box" value={genre} onChange={(e) => setGenre(e.target.value as MusicGenre)} required>
          <option value="">Kies een genre…</option>
          {(Object.keys(MUSIC_GENRES) as MusicGenre[]).map((g) => (
            <option key={g} value={g}>
              {MUSIC_GENRES[g].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Over dit nummer">
        <textarea className="text-box" rows={3} value={description} maxLength={MUSIC_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <p className="muted">Het komt op {artist.name}, voor iedereen te horen, zoals je andere nummers. Alleen geluiden uit Kuddes Studio, dus zonder muziek van anderen.</p>
      {send.error && <p className="form-error">{errorMessage(send.error)}</p>}
      <Button variant="cta" type="submit" disabled={send.isPending || !name.trim() || !genre}>
        {send.isPending ? 'Bezig met maken en uploaden…' : 'Op Kuddes Muziek zetten'}
      </Button>
    </form>
  )
}

function ToRadio({ project, title, pattern, onClose }: Props) {
  const queryClient = useQueryClient()
  const me = useMyRadio()
  const hasSong = project.playlist.length > 0
  // A jingle is short: the pattern is the obvious choice
  const [song, setSong] = useState(false)
  const [name, setName] = useState((pattern.name === 'Patroon 1' ? title : pattern.name).slice(0, RADIO_LIMITS.soundName))
  const [color, setColor] = useState(SOUND_COLORS[0])
  const mode: PlayMode = song ? { song: true } : { song: false, pattern: pattern.id }
  const full = renderSeconds(project, mode)
  const seconds = Math.min(full, RADIO_LIMITS.soundSeconds)

  const send = useMutation({
    mutationFn: async () => {
      const blob = await renderWav(project, mode, { mono: true, maxSeconds: RADIO_LIMITS.soundSeconds })
      const form = new FormData()
      form.set('file', new File([blob], `${name || 'Jingle'}.wav`, { type: 'audio/wav' }))
      form.set('name', name)
      form.set('color', color)
      return api<RadioSound>('/radio/me/sounds', { method: 'POST', form })
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: radioKeys.me }),
  })

  if (me.isLoading) return <p className="muted">Laden…</p>
  if (me.error) return <p className="form-error">{errorMessage(me.error)}</p>
  if (!me.data?.access.allowed || !me.data.station)
    return (
      <div className="std-share">
        <p>
          {me.data?.access.allowed
            ? 'Maak eerst je eigen zender aan in de radiostudio.'
            : 'Om op Kuddes Radio uit te zenden heb je toestemming nodig. Die vraag je aan in de radiostudio.'}
        </p>
        <Link to="/radio/studio" className="btn btn-cta">
          <FarmIcon name="transmit" /> Naar de radiostudio
        </Link>
      </div>
    )
  if (me.data.sounds.length >= RADIO_LIMITS.sounds)
    return (
      <div className="std-share">
        <p>Je hebt al {RADIO_LIMITS.sounds} geluidsknoppen. Haal er eerst een weg in de radiostudio.</p>
        <Link to="/radio/studio" className="btn">
          Naar de radiostudio
        </Link>
      </div>
    )
  if (send.isSuccess)
    return (
      <div className="std-share">
        <p>
          <FarmIcon name="accept" /> <b>{send.data.name}</b> staat bij je geluidsknoppen. Tijdens een uitzending speel je hem met één klik af.
        </p>
        <p>
          <Link to="/radio/studio" className="btn btn-cta">
            Naar de radiostudio
          </Link>{' '}
          <Button onClick={onClose}>Verder met maken</Button>
        </p>
      </div>
    )
  return (
    <form
      className="std-share"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) send.mutate()
      }}
    >
      <WhatPicker song={song} setSong={setSong} hasSong={hasSong} patternName={pattern.name} seconds={seconds} />
      {full > RADIO_LIMITS.soundSeconds && <p className="muted">Een geluidsknop duurt maximaal {RADIO_LIMITS.soundSeconds} seconden; daarna loopt hij zacht af.</p>}
      <Field label="Naam op de knop">
        <input className="text-box" value={name} maxLength={RADIO_LIMITS.soundName} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Kleur">
        <span className="std-share-colors" role="radiogroup" aria-label="Kleur">
          {SOUND_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              className={c === color ? 'on' : undefined}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </span>
      </Field>
      {send.error && <p className="form-error">{errorMessage(send.error)}</p>}
      <Button variant="cta" type="submit" disabled={send.isPending || !name.trim()}>
        {send.isPending ? 'Bezig met maken en uploaden…' : 'Naar mijn geluidsknoppen'}
      </Button>
    </form>
  )
}
