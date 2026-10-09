import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EXIF_LIMITS, PHOTO_PAGE_LIMITS, exifLine, formatExposure, type PhotoExif, type PhotoPageData } from '../../shared/photography'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { RichText } from '../lib/richText'
import { Smiley } from '../lib/smileys'
import { useTextEditing } from '../lib/textEditing'
import { SmileyPicker } from '../components/social/SmileyPicker'
import { photographyKeys } from '../features/photography/photographyQueries'
import { AlbumDialog } from '../features/profile/PhotoAlbums'
import { ShareWithFriends } from '../features/share/ShareWithFriends'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { keys, useAlbums } from '../lib/queries'
import { formatLongDate, formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './PhotoPage.css'
import { ReportButton } from '../components/social/ReportButton'

/** "15 augustus 2017", from the camera's "2017-08-15T14:02:11" */
const takenOn = (iso: string) => formatLongDate(iso.slice(0, 10))

/**
 * One photo on its own page, like Flickr: the photo big on a dark stage with
 * the arrows, the strip and full screen, on the right who made it and what's
 * known about it, and below the reactions and the album it's in.
 */
export function PhotoPage() {
  const { username = '', id = '' } = useParams()
  const [params] = useSearchParams()
  const album = Number(params.get('album')) || null
  const navigate = useNavigate()
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const queryClient = useQueryClient()
  const key = [...photographyKeys.all, 'photo', id, album] as const
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api<PhotoPageData>(`/photography/photos/${id}${album ? `?album=${album}` : ''}`),
    retry: false,
    placeholderData: (prev) => prev,
  })
  const stage = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState(false)
  usePageTitle(data ? `${data.photo.caption || 'Foto'} - ${data.photo.user.nickname} - Fotografie - Kuddes` : 'Foto - Kuddes')

  const list = data?.context.photos ?? []
  const index = list.findIndex((p) => p.id === Number(id))
  const go = (photoId: number) => navigate(`/fotografie/${username}/foto/${photoId}${album ? `?album=${album}` : ''}`, { replace: true })
  const back = album ? `/fotografie/${username}?album=${album}` : `/fotografie/${username}`

  // One view per photo per visit
  const counted = useRef(new Set<string>())
  useEffect(() => {
    if (!id || counted.current.has(id)) return
    counted.current.add(id)
    void api<void>(`/photography/photos/${id}/view`, { method: 'POST' }).catch(() => undefined)
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.key === 'ArrowLeft' && index > 0) go(list[index - 1].id)
      if (e.key === 'ArrowRight' && index >= 0 && index < list.length - 1) go(list[index + 1].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const fave = useMutation({
    mutationFn: (on: boolean) => api<void>(`/photography/photos/${id}/fave`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photographyKeys.all }),
  })

  if (isLoading) return <main className="page page-con">Laden…</main>
  if (!data)
    return (
      <main className="page page-con">
        <Box title="Fotografie" icon="camera">
          <p className="form-error">{errorMessage(error)}</p>
          <Link to="/fotografie">Naar Fotografie</Link>
        </Box>
      </main>
    )

  const { photo } = data
  const exif = photo.showExif || data.mine ? photo.exif : null
  return (
    <main className="page page-con pp-page">
      <div className="pp-view">
        <section className="pp-stage" ref={stage} aria-label="Foto">
          <div className="pp-stage-top">
            <Link to={back} className="pp-back">
              <FarmIcon name="arrow_left" /> {data.context.album ? `Terug naar ${data.context.album.name}` : 'Terug naar de fotostream'}
            </Link>
            <button
              type="button"
              className="pp-icon-btn"
              title="Volledig scherm"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void stage.current?.requestFullscreen?.())}
            >
              <FarmIcon name="arrow_out" />
            </button>
          </div>
          <div className="pp-photo">
            {index > 0 && (
              <button type="button" className="pp-arrow prev" onClick={() => go(list[index - 1].id)} aria-label="Vorige foto">
                ‹
              </button>
            )}
            <img src={photo.url} width={photo.width} height={photo.height} alt={photo.caption || 'Foto'} />
            {index >= 0 && index < list.length - 1 && (
              <button type="button" className="pp-arrow next" onClick={() => go(list[index + 1].id)} aria-label="Volgende foto">
                ›
              </button>
            )}
          </div>
          <div className="pp-stage-bottom">
            <Strip list={list} index={index} onPick={go} />
            <span className="pp-actions">
              {member && !data.mine && (
                <button type="button" className={photo.faved ? 'pp-icon-btn on' : 'pp-icon-btn'} onClick={() => fave.mutate(!photo.faved)} disabled={fave.isPending} title={photo.faved ? 'Favoriet' : 'Favoriet maken'} aria-pressed={photo.faved}>
                  <FarmIcon name={photo.faved ? 'heart' : 'heart_add'} />
                </button>
              )}
              {member && <ShareWithFriends path={`/fotografie/${username}/foto/${photo.id}`} className="pp-icon-btn" label="" />}
              <a href={photo.url} download className="pp-icon-btn" title="Downloaden">
                <FarmIcon name="inbox_download" />
              </a>
            </span>
          </div>
        </section>

        <aside className="pp-side">
          <div className="pp-who">
            <Avatar user={photo.user} size="small" />
            <div>
              <Link to={`/fotografie/${username}`} className="pp-name">
                {photo.user.nickname}
              </Link>
              <small className="muted">{data.pageTitle}</small>
            </div>
          </div>
          {editing ? (
            <EditDetails data={data} username={username} onDone={() => setEditing(false)} />
          ) : (
            <div className="pp-details">
              {data.mine && (
                <button type="button" className="pp-edit" onClick={() => setEditing(true)} title="Bewerken">
                  <FarmIcon name="pencil" />
                </button>
              )}
              <h1>{photo.caption || 'Zonder titel'}</h1>
              {photo.description ? (
                <p className="pp-description">
                  <RichText text={photo.description} />
                </p>
              ) : (
                data.mine && (
                  <button type="button" className="link-button muted" onClick={() => setEditing(true)}>
                    Beschrijving toevoegen
                  </button>
                )
              )}
              <p className="pp-stats">
                <span>
                  <b>{photo.views}</b> keer bekeken
                </span>
                <span>
                  <b>{photo.respects}</b> respect
                </span>
                <span>
                  <b>{photo.faves}</b> {photo.faves === 1 ? 'favoriet' : 'favorieten'}
                </span>
                <a href="#reacties">
                  <b>{data.comments.length}</b> {data.comments.length === 1 ? 'reactie' : 'reacties'}
                </a>
              </p>
              <Respect data={data} queryKey={key} member={member} />
              <p className="pp-dates">
                Geplaatst op {formatLongDate(photo.createdAt)}
                {exif?.takenAt && (
                  <>
                    <br />
                    Gemaakt op {takenOn(exif.takenAt)}
                  </>
                )}
              </p>
              {exif && (exif.camera || exifLine(exif)) && <CameraBlock exif={exif} hidden={!photo.showExif} />}
              {data.album && (
                <p className="pp-album">
                  <FarmIcon name={(data.album.icon ?? 'photo_album') as FarmIconName} /> In het album{' '}
                  <Link to={`/fotografie/${username}?album=${data.album.id}`}>{data.album.name}</Link>
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      <Comments data={data} queryKey={key} member={member} />
    </main>
  )
}

/** Respect for the photo, like everywhere on Kuddes, and who gave it. */
function Respect({ data, queryKey, member }: { data: PhotoPageData; queryKey: readonly unknown[]; member: boolean }) {
  const queryClient = useQueryClient()
  const { photo } = data
  const give = useMutation({
    mutationFn: (on: boolean) => api<void>(`/photography/photos/${photo.id}/respect`, { method: on ? 'POST' : 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  return (
    <div className="pp-respect">
      {member && !data.mine && (
        <button type="button" className={photo.respected ? 'btn pp-respect-btn on' : 'btn pp-respect-btn'} onClick={() => give.mutate(!photo.respected)} disabled={give.isPending} aria-pressed={photo.respected}>
          <FarmIcon name="star" /> {photo.respected ? 'Respect gegeven' : 'Respect'}
        </button>
      )}
      {data.respecters.length > 0 && (
        <span className="pp-respecters" title={data.respecters.map((u) => u.nickname).join(', ')}>
          {data.respecters.slice(0, 8).map((u) => (
            <Avatar key={u.id} user={u} size="tiny" />
          ))}
          <small className="muted">
            {data.respecters.length === 1 ? `${data.respecters[0].nickname} geeft respect` : `${data.respecters.length} leden geven respect`}
          </small>
        </span>
      )}
    </div>
  )
}

/** The small photos under the big one: where you are in the album or stream. */
function Strip({ list, index, onPick }: { list: PhotoPageData['context']['photos']; index: number; onPick: (id: number) => void }) {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = row.current
    const thumb = el?.children[index] as HTMLElement | undefined
    if (el && thumb) el.scrollTo({ left: thumb.offsetLeft - el.offsetLeft - (el.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' })
  }, [index])
  return (
    <div className="pp-strip" ref={row}>
      {list.map((p, i) => (
        <button key={p.id} type="button" className={i === index ? 'current' : undefined} onClick={() => onPick(p.id)} aria-label={`Foto ${i + 1}`} aria-current={i === index}>
          <img src={p.url} alt="" loading="lazy" />
        </button>
      ))}
    </div>
  )
}

function CameraBlock({ exif, hidden }: { exif: PhotoExif; hidden: boolean }) {
  return (
    <dl className="pp-camera">
      {hidden && <p className="muted pp-camera-hidden">Alleen jij ziet dit (camera-info staat uit)</p>}
      {exif.camera && (
        <div>
          <dt>
            <FarmIcon name="camera" />
          </dt>
          <dd>
            <b>{exif.camera}</b>
            {exif.lens && <small>{exif.lens}</small>}
          </dd>
        </div>
      )}
      <div className="pp-camera-settings">
        {exif.aperture && <span title="Diafragma">ƒ/{exif.aperture}</span>}
        {exif.exposure && <span title="Sluitertijd">{formatExposure(exif.exposure)}</span>}
        {exif.iso && <span title="ISO">ISO {exif.iso}</span>}
        {exif.focalLength && <span title="Brandpuntsafstand">{exif.focalLength} mm</span>}
      </div>
    </dl>
  )
}

/** The photographer changes the title, the text, the album and the camera details. */
function EditDetails({ data, username, onDone }: { data: PhotoPageData; username: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const { photo } = data
  const { data: albums = [] } = useAlbums(username)
  const [caption, setCaption] = useState(photo.caption)
  const [description, setDescription] = useState(photo.description)
  const [albumId, setAlbumId] = useState<number | null>(photo.albumId)
  const [camera, setCamera] = useState(photo.exif?.camera ?? '')
  const [lens, setLens] = useState(photo.exif?.lens ?? '')
  const [showExif, setShowExif] = useState(photo.showExif)
  const [newAlbum, setNewAlbum] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      api<void>(`/photos/${photo.id}`, {
        method: 'PATCH',
        body: { caption, description, albumId, showExif, exif: { ...photo.exif, camera: camera.trim() || undefined, lens: lens.trim() || undefined } },
      }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: photographyKeys.all }), queryClient.invalidateQueries({ queryKey: keys.profile(username) })])
      onDone()
    },
  })
  return (
    <form
      className="pp-edit-form"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <label>
        Titel
        <input className="text-box" value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} autoFocus />
      </label>
      <label>
        Beschrijving
        <textarea className="text-box" rows={4} value={description} maxLength={PHOTO_PAGE_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Album
        <span className="pp-edit-album">
          <select className="text-box" value={albumId ?? ''} onChange={(e) => setAlbumId(Number(e.target.value) || null)}>
            <option value="">Geen album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setNewAlbum(true)} title="Nieuw album">
            <FarmIcon name="add" />
          </button>
        </span>
      </label>
      <div className="pp-edit-row">
        <label>
          Camera
          <input className="text-box" value={camera} maxLength={EXIF_LIMITS.camera} onChange={(e) => setCamera(e.target.value)} />
        </label>
        <label>
          Lens
          <input className="text-box" value={lens} maxLength={EXIF_LIMITS.lens} onChange={(e) => setLens(e.target.value)} />
        </label>
      </div>
      <label className="pp-check">
        <input type="checkbox" checked={showExif} onChange={(e) => setShowExif(e.target.checked)} /> Camera-info tonen
      </label>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={save.isPending}>
          Opslaan
        </Button>
        <Button onClick={onDone}>Annuleren</Button>
        {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
      </div>
      {newAlbum && <AlbumDialog album={null} username={username} onClose={() => setNewAlbum(false)} onSaved={(a) => a && setAlbumId(a.id)} />}
    </form>
  )
}

/** The reactions under the photo; the photographer hears about each one. */
function Comments({ data, queryKey, member }: { data: PhotoPageData; queryKey: readonly unknown[]; member: boolean }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [smileys, setSmileys] = useState(false)
  // Smileys go in where the cursor is
  const { ref: textRef, insert } = useTextEditing(text, setText, PHOTO_PAGE_LIMITS.comment)
  const refresh = () => queryClient.invalidateQueries({ queryKey })
  const post = useMutation({
    mutationFn: () => api<void>(`/photography/photos/${data.photo.id}/comments`, { method: 'POST', body: { text } }),
    onSuccess: async () => {
      setText('')
      setSmileys(false)
      await refresh()
    },
  })
  const remove = useMutation({ mutationFn: (id: number) => api<void>(`/photo-comments/${id}`, { method: 'DELETE' }), onSuccess: refresh })
  return (
    <div className="pp-below">
      <section className="pp-comments" id="reacties">
        <h2>Reacties ({data.comments.length})</h2>
        {data.comments.map((c) => (
          <article key={c.id} className="pp-comment">
            <Avatar user={c.user} size="tiny" />
            <div>
              <p>
                <Link to={`/profiel/${c.user.username}`}>
                  <b>{c.user.nickname}</b>
                </Link>{' '}
                <span className="muted">{formatTime(c.createdAt)}</span> <ReportButton kind="foto" targetId={c.id} authorId={c.user.id} />
                {c.canDelete && (
                  <button type="button" className="link-button muted" onClick={() => confirm('Deze reactie verwijderen?') && remove.mutate(c.id)}>
                    verwijderen
                  </button>
                )}
              </p>
              <p>
                <RichText text={c.text} />
              </p>
            </div>
          </article>
        ))}
        {member ? (
          <form
            className="pp-comment-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) post.mutate()
            }}
          >
            <textarea ref={textRef} className="text-box" rows={3} value={text} maxLength={PHOTO_PAGE_LIMITS.comment} onChange={(e) => setText(e.target.value)} placeholder="Schrijf iets over deze foto…" aria-label="Reactie" />
            {smileys && (
              <div className="pp-smileys">
                <SmileyPicker onPick={insert} />
              </div>
            )}
            <div className="account-actions">
              <button type="button" className={smileys ? 'pp-smiley-btn current' : 'pp-smiley-btn'} onClick={() => setSmileys((o) => !o)} title="Smileys" aria-label="Smileys" aria-expanded={smileys}>
                <Smiley name="lach" />
              </button>
              <Button variant="cta" type="submit" disabled={!text.trim() || post.isPending}>
                Reageren
              </Button>
              {post.isError && <span className="form-error">{errorMessage(post.error)}</span>}
            </div>
          </form>
        ) : (
          <p className="muted">
            <Link to={`/inloggen?next=${encodeURIComponent(location.pathname)}`}>Log in</Link> om te reageren.
          </p>
        )}
      </section>
      <aside className="pp-in">
        {data.album ? (
          <>
            <h2>In dit album</h2>
            <Link to={`/fotografie/${data.photo.user.username}?album=${data.album.id}`} className="pp-in-album">
              {data.album.coverUrl ? <img src={data.album.coverUrl} alt="" /> : <FarmIcon name={(data.album.icon ?? 'photo_album') as FarmIconName} size={32} />}
              <span>
                <b>{data.album.name}</b>
                <small className="muted">
                  {data.album.count} {data.album.count === 1 ? 'foto' : 'foto’s'}
                </small>
              </span>
            </Link>
          </>
        ) : (
          <p className="muted pp-in-none">Deze foto staat nog niet in een album.</p>
        )}
      </aside>
    </div>
  )
}
