/**
 * Muziek: listening to what members make (/muziek, by genre, popular or
 * new), the weekly charts (/muziek/hitlijst), an artist's page with a banner
 * (/muziek/:slug; a member can have a few: solo, a band…) and uploading
 * (/muziek/uploaden, after the admin's OK).
 * The songs play in the bar at the bottom (features/music/PlayerBar.tsx).
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AUDIO_TYPES, MUSIC_GENRES, MUSIC_LIMITS, type MusicArtist, type MusicGenre, type MusicTrack, type TrackCredit } from '../../shared/music'
import { CatalogHero, CategoryBar, SortTabs, type CategoryItem } from '../components/catalog/Catalog'
import { useCatalogParams } from '../components/catalog/useCatalogParams'
import { BannerUploadDialog } from '../components/ui/BannerUploadDialog'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { Field } from '../components/ui/Field'
import { RequestMusicAccess } from '../features/music/MusicAccess'
import { ArtistCard, ArtistPageDialog, BandPic, CreditsEditor, ReleaseField, type Release, ChartList, GenreSelect, TrackDialog, TrackList } from '../features/music/MusicParts'
import { genreIcon, musicKeys, useCharts, useMyMusic, type MusicExplore } from '../features/music/musicQueries'
import { player } from '../features/music/player'
import { ShareWithFriends } from '../features/share/ShareWithFriends'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { compressImage } from '../lib/compressImage'
import { usePageTitle } from '../lib/usePageTitle'
import './PhotographyPage.css'

type Sort = 'populair' | 'nieuw'
const SORTS: [Sort, string, FarmIconName][] = [
  ['populair', 'Populair', 'fire'],
  ['nieuw', 'Nieuw', 'flag_new'],
]
const GENRE_KEYS = Object.keys(MUSIC_GENRES) as MusicGenre[]

/** /muziek: the charts' top, what's popular or new (per genre), the artists. */
export function MusicHomePage() {
  usePageTitle('Muziek - Kuddes')
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const { params, update } = useCatalogParams(true)
  const rawGenre = params.get('genre')
  const genre = GENRE_KEYS.find((g) => g === rawGenre) ?? null
  const sort: Sort = params.get('sort') === 'nieuw' ? 'nieuw' : 'populair'
  const q = params.get('q') ?? ''
  const { data, isLoading, isError, error } = useQuery({
    queryKey: musicKeys.explore(genre ?? '', q, sort),
    queryFn: () => api<MusicExplore>(`/music?${new URLSearchParams({ ...(genre && { genre }), ...(q && { q }), ...(sort === 'nieuw' && { sort }) })}`),
  })
  const { data: charts = [] } = useCharts(10)
  const { data: mine } = useMyMusic(member)
  const [making, setMaking] = useState(false)
  const navigate = useNavigate()
  const tracks = data?.tracks ?? []
  const filtered = !!genre || !!q
  const total = Object.values(data?.genres ?? {}).reduce((a, b) => a + (b ?? 0), 0)
  const categories: CategoryItem<MusicGenre>[] = [
    { key: null, name: 'Alles', hint: 'alle genres', icon: 'radio_modern', count: total || undefined },
    ...GENRE_KEYS.map((g) => ({ key: g, name: MUSIC_GENRES[g].name, hint: MUSIC_GENRES[g].hint, icon: genreIcon(g), count: data?.genres[g] })),
  ]

  return (
    <main className="page page-con ph-page mu-page">
      <CatalogHero
        title="Muziek"
        intro="Nummers van Kuddes-leden: bands, rappers, singer-songwriters en slaapkamerproducers. Luister, geef likes en kijk wie er bovenaan de hitlijst staat."
        q={q}
        placeholder="Zoek een nummer of artiest"
        label="Zoek in Muziek"
        onSearch={(v) => update({ q: v || null })}
      />
      <CategoryBar label="Genres" items={categories} current={genre} onPick={(g) => update({ genre: g })} />

      <div className="ph-layout">
        <div className="mu-main">
          {!filtered && charts.length > 0 && (
            <section className="box mu-section">
              <div className="ct-bar">
                <div className="ct-title">
                  <h2>
                    <FarmIcon name="award_star_gold_1" /> Hitlijst
                  </h2>
                  <span className="muted">de meest beluisterde nummers van deze week</span>
                </div>
                <span className="mu-section-tools">
                  <Button onClick={() => player.play(charts.map((c) => c.track), 0)}>
                    <FarmIcon name="control_play" /> Afspelen
                  </Button>
                  <Link to="/muziek/hitlijst" className="btn">
                    Hele hitlijst ›
                  </Link>
                </span>
              </div>
              <ChartList entries={charts} compact />
            </section>
          )}

          <section className="box mu-section">
            <div className="ct-bar">
              <div className="ct-title">
                <h2>{q ? `Gezocht op "${q}"` : genre ? MUSIC_GENRES[genre].name : sort === 'nieuw' ? 'Nieuw binnen' : 'Populair'}</h2>
                <span className="muted">{data ? `${tracks.length} ${tracks.length === 1 ? 'nummer' : 'nummers'}` : ' '}</span>
              </div>
              <span className="mu-section-tools">
                {tracks.length > 1 && (
                  <Button onClick={() => player.play(tracks, 0, { shuffle: true })} title="Alles willekeurig afspelen">
                    <span className="mu-shuffle" aria-hidden="true">
                      ⤨
                    </span>{' '}
                    Shuffle
                  </Button>
                )}
                <SortTabs value={sort} onChange={(s) => update({ sort: s === 'populair' ? null : s })} options={SORTS} />
              </span>
            </div>
            {isLoading ? (
              <p className="muted ct-empty">Laden…</p>
            ) : isError ? (
              <p className="form-error ct-empty">{errorMessage(error)}</p>
            ) : !tracks.length ? (
              <div className="ct-empty">
                <FarmIcon name="music" size={48} />
                <p>{q ? `Niets gevonden voor "${q}".` : genre ? `Nog geen ${MUSIC_GENRES[genre].name.toLowerCase()}.` : 'Hier staat nog geen muziek.'}</p>
                {genre && (
                  <Button onClick={() => update({ genre: null })}>
                    <FarmIcon name="music" /> Alle genres
                  </Button>
                )}
              </div>
            ) : (
              <TrackList tracks={tracks} numbered={sort === 'populair'} />
            )}
          </section>
        </div>

        <aside className="ph-side sticky-side">
          {member && !!mine?.artists.length && (
            <Box title="Mijn muziek" icon="music" actions={mine.artists.length < MUSIC_LIMITS.bands ? <button type="button" className="mu-box-action" onClick={() => setMaking(true)}>+ Nieuw</button> : undefined}>
              <ul className="mu-artists">
                {mine.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </ul>
            </Box>
          )}
          {member && mine && !mine.artists.length && (
            <section className="box ph-mine-new">
              <p className="muted">{mine.access.allowed ? 'Je mag muziek uploaden: maak je pagina!' : 'Maak je zelf muziek? Laat het horen.'}</p>
              <Link to="/muziek/uploaden" className="btn btn-cta">
                <FarmIcon name={mine.access.allowed ? 'add' : 'music'} /> {mine.access.allowed ? 'Maak je muziekpagina' : 'Muziek uploaden'}
              </Link>
            </section>
          )}
          {!user && (
            <section className="box ph-mine-new">
              <p className="muted">
                <Link to="/inloggen?next=/muziek">Log in</Link> om likes te geven en je eigen muziek te laten horen.
              </p>
            </section>
          )}
          {!filtered && !!data?.newest.length && sort === 'populair' && (
            <Box title="Nieuw binnen" icon="flag_new" actions={<Link to="/muziek?sort=nieuw">Meer</Link>}>
              <TrackList tracks={data.newest.slice(0, 5)} />
            </Box>
          )}
          <Box title="Artiesten" icon="microphone">
            {data?.artists.length ? (
              <ul className="mu-artists">
                {data.artists.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </ul>
            ) : (
              <p className="empty">{genre ? 'Nog geen artiesten in dit genre.' : 'Nog geen artiesten.'}</p>
            )}
          </Box>
        </aside>
      </div>
      {making && <ArtistPageDialog artist={null} first={!mine?.artists.length} onClose={() => setMaking(false)} onSaved={(a) => navigate(`/muziek/${a.slug}`)} />}
    </main>
  )
}

/** /muziek/hitlijst: the 40 most played of this week, with how they moved. */
export function MusicChartsPage() {
  usePageTitle('Hitlijst - Muziek - Kuddes')
  const { data: charts = [], isLoading } = useCharts()
  return (
    <main className="page page-con ph-page mu-page">
      <CatalogHero
        title="Kuddes Hitlijst"
        intro="De 40 meest beluisterde nummers van de afgelopen 7 dagen, met hoe ze ten opzichte van de week ervoor gestegen of gedaald zijn."
        side={
          <span className="mu-hero-tools">
            <Link to="/muziek" className="btn">
              ‹ Muziek
            </Link>
            {charts.length > 0 && (
              <Button variant="cta" onClick={() => player.play(charts.map((c) => c.track), 0)}>
                <FarmIcon name="control_play" /> Hitlijst afspelen
              </Button>
            )}
          </span>
        }
      />
      <section className="box mu-section">
        {isLoading ? (
          <p className="muted ct-empty">Laden…</p>
        ) : !charts.length ? (
          <div className="ct-empty">
            <FarmIcon name="award_star_gold_1" size={48} />
            <p>Deze week is er nog niets beluisterd. Zet eens wat op!</p>
            <Link to="/muziek" className="btn btn-cta">
              Naar Muziek
            </Link>
          </div>
        ) : (
          <ChartList entries={charts} />
        )}
      </section>
    </main>
  )
}

/** /muziek/:slug: an artist's or band's banner, their songs, and about them. */
export function ArtistPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isLoading, error } = useQuery({
    queryKey: musicKeys.artist(slug),
    queryFn: () => api<{ artist: MusicArtist; tracks: MusicTrack[]; others: MusicArtist[] }>(`/music/artists/${encodeURIComponent(slug)}`),
    retry: false,
    // While a song is being converted, look again now and then
    refetchInterval: (query) => (query.state.data?.tracks.some((t) => t.status === 'verwerken') ? 4000 : false),
  })
  const [dialog, setDialog] = useState<'pagina' | 'banner' | null>(null)
  const [editing, setEditing] = useState<MusicTrack | null>(null)
  usePageTitle(data ? `${data.artist.name} - Muziek - Kuddes` : 'Muziek - Kuddes')

  if (isLoading) return <main className="page page-con">Laden…</main>
  if (!data)
    return (
      <main className="page page-con">
        <Box title="Muziek" icon="music">
          <p className="form-error">{errorMessage(error)}</p>
          <p>
            <Link to="/muziek">Naar Muziek</Link>
          </p>
        </Box>
      </main>
    )

  const { artist, tracks, others } = data
  const ready = tracks.filter((t) => t.status === 'klaar')
  const top = [...ready].sort((a, b) => b.plays - a.plays).slice(0, 5)
  const likes = ready.reduce((n, t) => n + t.likes, 0)
  return (
    <main className="page page-con ph-page mu-page">
      <header className={artist.bannerUrl ? 'ph-banner' : `ph-banner plain mu-banner-plain g-${artist.genre}`} style={artist.bannerUrl ? { backgroundImage: `url(${artist.bannerUrl})`, backgroundPositionY: `${artist.bannerY}%` } : undefined}>
        <Link to="/muziek" className="ph-banner-back">
          <FarmIcon name="music" /> Muziek
        </Link>
        {artist.mine && (
          <button type="button" className="ph-banner-edit" onClick={() => setDialog('banner')}>
            <FarmIcon name="picture_sunset" /> {artist.bannerUrl ? 'Banner wijzigen' : 'Kies een banner'}
          </button>
        )}
        <div className="ph-banner-who">
          <BandPic artist={artist} />
          <div>
            <h1>{artist.name}</h1>
            <p>
              <Link to={`/profiel/${artist.user.username}`}>{artist.user.nickname}</Link> · {MUSIC_GENRES[artist.genre].name} · {ready.length} {ready.length === 1 ? 'nummer' : 'nummers'} · {artist.plays}× beluisterd
            </p>
          </div>
        </div>
      </header>

      <nav className="ph-tabs mu-artist-bar" aria-label="Muziekpagina">
        <span className="mu-section-tools">
          <Button variant="cta" onClick={() => player.play(ready, 0)} disabled={!ready.length}>
            <FarmIcon name="control_play" /> Alles afspelen
          </Button>
          <Button onClick={() => player.play(ready, 0, { shuffle: true })} disabled={ready.length < 2}>
            <span className="mu-shuffle" aria-hidden="true">
              ⤨
            </span>{' '}
            Shuffle
          </Button>
          <ShareWithFriends path={`/muziek/${artist.slug}`} />
        </span>
        {artist.mine && (
          <span className="ph-tabs-side">
            <Link to={`/muziek/uploaden?band=${artist.slug}`} className="btn btn-cta">
              <FarmIcon name="add" /> Nummer uploaden
            </Link>
            <Button onClick={() => setDialog('pagina')} title="Pagina bewerken">
              <FarmIcon name="pencil" />
            </Button>
          </span>
        )}
      </nav>

      <div className="ph-layout">
        <section className="box ph-main mu-section">
          <div className="ct-bar">
            <div className="ct-title">
              <h2>Nummers</h2>
              <span className="muted">nieuwste eerst</span>
            </div>
          </div>
          {!tracks.length ? (
            <div className="ct-empty">
              <FarmIcon name="music" size={48} />
              <p>{artist.mine ? 'Upload je eerste nummer!' : `${artist.name} heeft nog geen nummers.`}</p>
              {artist.mine && (
                <Link to="/muziek/uploaden" className="btn btn-cta">
                  <FarmIcon name="add" /> Nummer uploaden
                </Link>
              )}
            </div>
          ) : (
            <TrackList tracks={tracks} showArtist={false} onEdit={artist.mine ? setEditing : undefined} openTrack={Number(searchParams.get('nummer')) || null} />
          )}
        </section>

        <aside className="ph-side sticky-side">
          <Box title={`Over ${artist.name}`} icon="microphone">
            {artist.bio ? <p className="mu-bio">{artist.bio}</p> : <p className="empty">{artist.mine ? 'Vertel iets over jezelf via het potloodje.' : 'Nog niets over verteld.'}</p>}
            <ul className="mu-stats">
              <li>
                <b>{ready.length}</b> {ready.length === 1 ? 'nummer' : 'nummers'}
              </li>
              <li>
                <b>{artist.plays}</b> keer beluisterd
              </li>
              <li>
                <b>{likes}</b> {likes === 1 ? 'like' : 'likes'}
              </li>
            </ul>
          </Box>
          {top.length > 1 && (
            <Box title="Meest beluisterd" icon="fire">
              <TrackList tracks={top} numbered showArtist={false} />
            </Box>
          )}
          {others.length > 0 && (
            <Box title={`Meer van ${artist.user.nickname}`} icon="microphone">
              <ul className="mu-artists">
                {others.map((a) => (
                  <ArtistCard key={a.id} artist={a} />
                ))}
              </ul>
            </Box>
          )}
        </aside>
      </div>

      {dialog === 'pagina' && <ArtistPageDialog artist={artist} onClose={() => setDialog(null)} onRemoved={() => navigate('/muziek')} />}
      {dialog === 'banner' && (
        <BannerUploadDialog
          endpoint={`/music/artists/${artist.id}/banner`}
          currentUrl={artist.bannerUrl}
          currentY={artist.bannerY}
          onDone={() => void queryClient.invalidateQueries({ queryKey: musicKeys.all })}
          onClose={() => setDialog(null)}
        />
      )}
      {editing && <TrackDialog track={editing} onClose={() => setEditing(null)} />}
    </main>
  )
}

/** /muziek/uploaden: ask for rights, make your page, then upload. */
export function MusicUploadPage() {
  usePageTitle('Muziek uploaden - Kuddes')
  const { user } = useAuth()
  const { data, isLoading, isError, error } = useMyMusic(!!user?.emailVerified)
  const [making, setMaking] = useState(false)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  let content
  if (!user)
    content = (
      <Box title="Muziek uploaden" icon="music">
        <p>
          <Link to="/inloggen?next=/muziek/uploaden">Log in</Link> om je eigen muziek te uploaden.
        </p>
      </Box>
    )
  else if (!user.emailVerified)
    content = (
      <Box title="Muziek uploaden" icon="music">
        <p>Bevestig eerst je e-mailadres; daarna kun je vragen of je muziek mag uploaden.</p>
      </Box>
    )
  else if (isLoading) content = <p className="muted">Laden…</p>
  else if (isError) content = <p className="form-error">{errorMessage(error)}</p>
  else if (!data!.access.allowed) content = <RequestMusicAccess access={data!.access} />
  else if (!data!.artists.length)
    content = (
      <Box title="Eerst: je muziekpagina" icon="music">
        <div className="vt-access-status">
          <FarmIcon name="microphone" size={32} />
          <div>
            <p>Je mag muziek uploaden! Maak eerst je muziekpagina: daar komen je nummers te staan, met je artiesten- of bandnaam en een banner.</p>
            <Button variant="cta" onClick={() => setMaking(true)}>
              <FarmIcon name="add" /> Maak je muziekpagina
            </Button>
          </div>
        </div>
      </Box>
    )
  else
    content = (
      <UploadForm
        artists={data!.artists}
        initial={data!.artists.find((a) => a.slug === params.get('band')) ?? data!.artists[0]}
        canAdd={data!.artists.length < MUSIC_LIMITS.bands}
        onNewBand={() => setMaking(true)}
        onDone={(a) => navigate(`/muziek/${a.slug}`)}
      />
    )

  return (
    <main className="page page-con mu-page mu-upload-page">
      <CatalogHero
        title="Muziek uploaden"
        intro="Laat je eigen nummers horen op Kuddes. Ze worden omgezet naar MP3 (zonder de gegevens uit het bestand), en staan daarna op je muziekpagina."
        side={
          <Link to="/muziek" className="btn">
            ‹ Muziek
          </Link>
        }
      />
      {content}
      {making && <ArtistPageDialog artist={null} first={!data?.artists.length} onClose={() => setMaking(false)} onSaved={(a) => setParams({ band: a.slug }, { replace: true })} />}
    </main>
  )
}

/** "01 - mijn_nummer (demo).wav" -> "mijn nummer (demo)" */
const titleFromFile = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/^\d+\s*[-.]\s*/, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, MUSIC_LIMITS.title)

/** The form goes up with XMLHttpRequest: fetch can't report upload progress. */
function postForm(url: string, form: FormData, onProgress: (ratio: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = 'Het uploaden is mislukt.'
      try {
        message = JSON.parse(xhr.responseText).error ?? message
      } catch {
        // not JSON
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('De verbinding viel weg tijdens het uploaden.'))
    xhr.send(form)
  })
}

function UploadForm({ artists, initial, canAdd, onNewBand, onDone }: { artists: MusicArtist[]; initial: MusicArtist; canAdd: boolean; onNewBand: () => void; onDone: (a: MusicArtist) => void }) {
  const [artistId, setArtistId] = useState(initial.id)
  const artist = artists.find((a) => a.id === artistId) ?? initial
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState<MusicGenre>(artist.genre)
  const [description, setDescription] = useState('')
  const [release, setRelease] = useState<Release>({ releasedOn: null, releaseYearOnly: false })
  const [credits, setCredits] = useState<TrackCredit[]>([])
  const [progress, setProgress] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > MUSIC_LIMITS.bytes) return setProblem(`Dit bestand is te groot (maximaal ${MUSIC_LIMITS.bytes / 1024 / 1024} MB).`)
    if (f.type && !AUDIO_TYPES.includes(f.type)) return setProblem('Dit soort bestand kunnen we niet gebruiken. Kies een MP3, WAV, FLAC, OGG of M4A.')
    setProblem(null)
    setFile(f)
    if (!title) setTitle(titleFromFile(f.name))
  }

  const send = async () => {
    if (!file) return
    setProblem(null)
    setProgress(0)
    try {
      const form = new FormData()
      form.set('file', file)
      if (cover) form.set('cover', await compressImage(cover, 1200))
      form.set('artistId', String(artist.id))
      form.set('title', title)
      form.set('genre', genre)
      form.set('description', description)
      if (release.releasedOn) {
        form.set('releasedOn', release.releasedOn)
        form.set('releaseYearOnly', String(release.releaseYearOnly))
      }
      form.set('credits', JSON.stringify(credits.filter((c) => c.role.trim() && c.name.trim())))
      await postForm('/api/tracks', form, setProgress)
      await queryClient.invalidateQueries({ queryKey: musicKeys.all })
      onDone(artist)
    } catch (e) {
      setProblem(errorMessage(e))
      setProgress(null)
    }
  }

  return (
    <Box title="Een nummer uploaden" icon="music">
      <form
        className="mu-form mu-upload"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <div
          className={file ? 'mu-drop picked' : 'mu-drop'}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            pick(e.dataTransfer.files[0])
          }}
        >
          <FarmIcon name="music" size={32} />
          {file ? (
            <span>
              <b>{file.name}</b>
              <small className="muted">{(file.size / 1024 / 1024).toFixed(1)} MB</small>
            </span>
          ) : (
            <span>
              <b>Sleep je nummer hierheen</b>
              <small className="muted">
                MP3, WAV, FLAC, OGG of M4A · maximaal {MUSIC_LIMITS.bytes / 1024 / 1024} MB en {MUSIC_LIMITS.seconds / 60} minuten
              </small>
            </span>
          )}
          <Button onClick={() => fileInput.current?.click()} disabled={progress !== null}>
            {file ? 'Ander bestand' : 'Kies een bestand'}
          </Button>
          <input ref={fileInput} type="file" accept={['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', ...AUDIO_TYPES].join(',')} hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <div className="mu-upload-fields">
          <label className="mu-cover-pick" title="Kies een hoes (mag, hoeft niet)">
            {coverPreview ? <img src={coverPreview} alt="" /> : <FarmIcon name={genreIcon(genre)} size={32} />}
            <small>{cover ? 'Andere hoes' : 'Hoes kiezen'}</small>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (coverPreview) URL.revokeObjectURL(coverPreview)
                setCover(f)
                setCoverPreview(URL.createObjectURL(f))
              }}
            />
          </label>
          <div className="mu-upload-text">
            <Field label="Op de pagina van">
              <span className="mu-band-pick">
                <select className="text-box" value={artist.id} onChange={(e) => setArtistId(Number(e.target.value))}>
                  {artists.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {canAdd && (
                  <Button onClick={onNewBand} title="Een nieuwe artiest of band">
                    <FarmIcon name="add" /> Nieuwe band
                  </Button>
                )}
              </span>
            </Field>
            <Field label="Titel">
              <input className="text-box" value={title} maxLength={MUSIC_LIMITS.title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <Field label="Genre">
              <GenreSelect value={genre} onChange={setGenre} />
            </Field>
          </div>
        </div>
        <Field label="Over dit nummer" hint="(mag, hoeft niet: waar het over gaat, de tekst…)">
          <textarea className="text-box" rows={3} value={description} maxLength={MUSIC_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="mu-upload-row">
          <Field label="Uitgebracht" hint="(mag leeg)">
            <ReleaseField value={release} onChange={setRelease} />
          </Field>
        </div>
        <Field label="Wie werkten er nog meer aan mee?" hint="(credits: zang, gitaar, productie…; mag leeg)">
          <CreditsEditor value={credits} onChange={setCredits} />
        </Field>

        {progress !== null && (
          <div className="mu-upload-progress">
            <progress value={progress} max={1} />
            <small className="muted">{progress < 1 ? `Uploaden… ${Math.round(progress * 100)}%` : 'Bijna klaar…'}</small>
          </div>
        )}
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!file || !title.trim() || progress !== null}>
            <FarmIcon name="arrow_up" /> Uploaden
          </Button>
          <span className="muted">Alleen eigen muziek! Na het uploaden wordt het nummer even verwerkt.</span>
          {problem && <span className="form-error">{problem}</span>}
        </div>
      </form>
    </Box>
  )
}
