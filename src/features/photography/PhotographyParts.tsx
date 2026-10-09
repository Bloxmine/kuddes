/**
 * The parts of the photography section (/fotografie): the Flickr-style grid,
 * a photo big with its camera details, a photographer's card, and the
 * dialogs for your own page (src/pages/PhotographyPage.tsx).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Photo } from '../../../shared/api'
import {
  EXIF_LIMITS,
  PHOTOGRAPHY_LIMITS,
  PHOTOGRAPHY_VISIBILITY,
  type PhotoAlbum,
  type PhotoExif,
  type PhotographyPage,
  type PhotographyPhoto,
  type PhotographyVisibility,
} from '../../../shared/photography'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Field } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'
import { keys, usePhotos } from '../../lib/queries'
import { readExif } from '../../lib/readExif'
import { ExifLine } from '../profile/PhotoAlbums'
import { photographyKeys } from './photographyQueries'
import './Photography.css'

/** What the grid and the album viewer need of a photo: also a Kudde's photos, which have no stars or views. */
export type GridPhoto = Pick<Photo, 'id' | 'url' | 'caption' | 'width' | 'height' | 'exif' | 'showExif'> & { user: { nickname: string }; faves?: number; views?: number }

/** Rows of photos at the same height, each as wide as its shape (like Flickr). */
export function JustifiedGrid({ photos, onOpen, showOwner }: { photos: GridPhoto[]; onOpen: (id: number) => void; showOwner?: boolean }) {
  return (
    <ul className="ph-grid">
      {photos.map((p) => {
        const ratio = p.width / Math.max(1, p.height)
        return (
          <li key={p.id} style={{ flexGrow: ratio, width: `${ratio * 200}px` }}>
            <button type="button" onClick={() => onOpen(p.id)} title={p.caption || 'Foto'}>
              <i style={{ paddingBottom: `${(1 / ratio) * 100}%` }} aria-hidden="true" />
              <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              <span className="ph-grid-info">
                {p.caption && <b>{p.caption}</b>}
                <span>
                  {showOwner && <>{p.user.nickname}</>}
                  {p.faves !== undefined && (
                    <>
                      {showOwner && ' · '}
                      <FarmIcon name="heart" /> {p.faves}
                    </>
                  )}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A photographer on the overview: their best photos, their name and title. */
export function PageCard({ page }: { page: PhotographyPage }) {
  return (
    <li className="ph-card">
      <Link to={`/fotografie/${page.user.username}`}>
        <span className={`ph-card-cover n${Math.min(page.cover.length, 4)}`}>
          {page.cover.length ? page.cover.map((p) => <img key={p.id} src={p.url} alt="" loading="lazy" />) : <FarmIcon name="camera" size={32} />}
        </span>
        <span className="ph-card-text">
          <b>{page.title}</b>
          <small>
            {page.user.nickname} · {page.photoCount} {page.photoCount === 1 ? 'foto' : "foto's"}
          </small>
          {page.gear && (
            <small className="ph-card-gear">
              <FarmIcon name="camera" /> {page.gear}
            </small>
          )}
        </span>
      </Link>
    </li>
  )
}

/** Making or changing your photography page. */
export function PageDialog({ page, onClose, onSaved }: { page: PhotographyPage | null; onClose: () => void; onSaved?: (p: PhotographyPage) => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(page?.title ?? '')
  const [about, setAbout] = useState(page?.about ?? '')
  const [gear, setGear] = useState(page?.gear ?? '')
  const [visibility, setVisibility] = useState<PhotographyVisibility>(page?.visibility ?? 'leden')
  const [showExif, setShowExif] = useState(page?.showExif ?? true)
  const save = useMutation({
    mutationFn: () => api<PhotographyPage>('/photography/me', { method: 'PUT', body: { title, about, gear, visibility, showExif } }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: photographyKeys.all })
      onSaved?.(saved)
      onClose()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Modal title={page ? 'Je fotografiepagina' : 'Maak je fotografiepagina'} icon="camera" onClose={onClose}>
      <form
        className="ph-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Titel" error={fields.title}>
          <input className="text-box" value={title} maxLength={PHOTOGRAPHY_LIMITS.title} onChange={(e) => setTitle(e.target.value)} placeholder="Bijv. Janssen Natuurfotografie" required autoFocus />
        </Field>
        <Field label="Over jou als fotograaf (optioneel)" error={fields.about}>
          <textarea className="text-box" rows={3} value={about} maxLength={PHOTOGRAPHY_LIMITS.about} onChange={(e) => setAbout(e.target.value)} placeholder="Wat fotografeer je graag?" />
        </Field>
        <Field label="Je camera's en lenzen (optioneel)" error={fields.gear}>
          <input className="text-box" value={gear} maxLength={PHOTOGRAPHY_LIMITS.gear} onChange={(e) => setGear(e.target.value)} placeholder="Bijv. Canon EOS 600D, 50mm f/1.8" />
        </Field>
        <fieldset className="ph-visibility">
          <legend>Wie mag je pagina zien?</legend>
          {(Object.keys(PHOTOGRAPHY_VISIBILITY) as PhotographyVisibility[]).map((v) => (
            <label key={v} className={visibility === v ? 'current' : undefined}>
              <input type="radio" name="ph-visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
              <FarmIcon name={PHOTOGRAPHY_VISIBILITY[v].icon as FarmIconName} />
              <span>
                <b>{PHOTOGRAPHY_VISIBILITY[v].label}</b>
                <small className="muted">{PHOTOGRAPHY_VISIBILITY[v].hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="ph-check">
          <input type="checkbox" checked={showExif} onChange={(e) => setShowExif(e.target.checked)} /> Toon bij nieuwe foto’s de camera-info (camera, lens, diafragma, sluitertijd, ISO). Nooit de plek
          waar de foto is gemaakt.
        </label>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!title.trim() || save.isPending}>
            <FarmIcon name="accept" /> {page ? 'Opslaan' : 'Pagina maken'}
          </Button>
          {save.isError && !Object.keys(fields).length && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** Uploading straight onto your page: it goes in your Foto's too, with its camera details. */
export function UploadDialog({ page, albums, username, onClose }: { page: PhotographyPage; albums: PhotoAlbum[]; username: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [albumId, setAlbumId] = useState<number | null>(null)
  const [exif, setExif] = useState<PhotoExif | null>(null)
  const [showExif, setShowExif] = useState(page.showExif)
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('file', await compressImage(file!, 2560))
      form.set('caption', caption)
      form.set('inPhotography', 'true')
      if (albumId) form.set('albumId', String(albumId))
      const details = Object.fromEntries(Object.entries(exif ?? {}).filter(([, v]) => v !== undefined && v !== ''))
      if (Object.keys(details).length) {
        form.set('exif', JSON.stringify(details))
        form.set('showExif', String(showExif))
      }
      return api<Photo>('/photos', { method: 'POST', form })
    },
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: photographyKeys.all }), queryClient.invalidateQueries({ queryKey: keys.profile(username) })])
      onClose()
    },
  })
  const set = (k: keyof PhotoExif, v: string) => setExif((e) => ({ ...e, [k]: v || undefined }))
  return (
    <Modal title="Foto plaatsen" icon="picture_add" onClose={onClose}>
      <form
        className="ph-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (file) upload.mutate()
        }}
      >
        <label className={preview ? 'ph-drop has-file' : 'ph-drop'}>
          {preview ? <img src={preview} alt="Voorbeeld" /> : <FarmIcon name="picture_add" size={32} />}
          <span>{file ? file.name : 'Kies een foto (JPG, PNG of WebP, tot 8 MB)'}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
              setPreview(f ? URL.createObjectURL(f) : null)
              setExif(null)
              // Read before it's made smaller; never the location
              if (f) void readExif(f).then(setExif)
            }}
          />
        </label>
        <Field label="Titel (optioneel)">
          <input className="text-box" value={caption} maxLength={120} onChange={(e) => setCaption(e.target.value)} />
        </Field>
        {albums.length > 0 && (
          <Field label="Album">
            <select className="text-box" value={albumId ?? ''} onChange={(e) => setAlbumId(Number(e.target.value) || null)}>
              <option value="">Geen album</option>
              {albums.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="ph-exif-fields">
          <Field label="Camera">
            <input className="text-box" value={exif?.camera ?? ''} maxLength={EXIF_LIMITS.camera} onChange={(e) => set('camera', e.target.value)} placeholder={file ? 'Niet gevonden: typ hem zelf' : ''} />
          </Field>
          <Field label="Lens">
            <input className="text-box" value={exif?.lens ?? ''} maxLength={EXIF_LIMITS.lens} onChange={(e) => set('lens', e.target.value)} />
          </Field>
        </div>
        {exif && <ExifLine exif={exif} />}
        <label className="ph-check">
          <input type="checkbox" checked={showExif} onChange={(e) => setShowExif(e.target.checked)} /> Camera-info tonen bij deze foto
        </label>
        <p className="muted ph-note">
          <FarmIcon name="information" /> De foto komt ook in je Foto’s. De plek waar hij is gemaakt (GPS) lezen we nooit uit, en alle andere gegevens in het bestand halen we eruit.
        </p>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!file || upload.isPending}>
            <FarmIcon name="picture_add" /> {upload.isPending ? 'Uploaden…' : 'Plaatsen'}
          </Button>
          {upload.isError && <span className="form-error">{errorMessage(upload.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** Picking photos you already have (in your Foto's) for your page. */
export function PickDialog({ username, onClose }: { username: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: photos = [], isLoading } = usePhotos(username)
  const toggle = useMutation({
    mutationFn: (p: Photo) => api<Photo>(`/photos/${p.id}`, { method: 'PATCH', body: { inPhotography: !p.inPhotography } }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: photographyKeys.all }), queryClient.invalidateQueries({ queryKey: keys.photos(username) })]),
  })
  return (
    <Modal title="Kies uit je foto’s" icon="photos" onClose={onClose} wide>
      <p className="muted ph-note">Klik op een foto om hem op je fotografiepagina te zetten, of er weer af te halen. Hij blijft gewoon in je Foto’s.</p>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : !photos.length ? (
        <p className="empty">
          Je hebt nog geen foto’s. <Link to={`/profiel/${username}?tab=fotos`}>Upload ze in je Foto’s</Link>, of plaats er een op je fotografiepagina.
        </p>
      ) : (
        <ul className="ph-pick">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.inPhotography ? 'on' : undefined} aria-pressed={p.inPhotography} disabled={toggle.isPending} onClick={() => toggle.mutate(p)} title={p.caption || 'Foto'}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                {p.inPhotography && <FarmIcon name="tick" className="ph-pick-tick" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="account-actions">
        <Button variant="cta" onClick={onClose}>
          Klaar
        </Button>
      </div>
    </Modal>
  )
}

/**
 * An album to scroll through: one photo big at a time (swipe, scroll, the
 * arrows or the arrow keys), with a strip of all of them below.
 */
export function AlbumViewer({ album, photos, onClose }: { album: PhotoAlbum; photos: GridPhoto[]; onClose: () => void }) {
  const track = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)

  const goTo = (i: number) => {
    const el = track.current
    if (!el) return
    const n = Math.max(0, Math.min(photos.length - 1, i))
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' })
  }
  // Which photo is in view, from the scroll position
  const onScroll = () => {
    const el = track.current
    if (!el) return
    const n = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
    if (n !== at) setAt(n)
  }
  // The strip follows along (only the strip scrolls, not the page)
  useEffect(() => {
    const row = strip.current
    const thumb = row?.children[at] as HTMLElement | undefined
    if (row && thumb) row.scrollTo({ left: thumb.offsetLeft - row.offsetLeft - (row.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' })
  }, [at])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight') goTo(at + 1)
      if (e.key === 'ArrowLeft') goTo(at - 1)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const current = photos[at]
  return (
    <section className="ph-album" aria-label={album.name}>
      <header className="ph-album-head">
        <button type="button" className="btn" onClick={onClose}>
          ‹ Alle albums
        </button>
        <FarmIcon name={(album.icon ?? 'photo_album') as FarmIconName} size={32} />
        <div>
          <h2>{album.name}</h2>
          {album.description && <p className="muted">{album.description}</p>}
        </div>
        <span className="ph-album-count muted">
          {photos.length ? at + 1 : 0} / {photos.length}
        </span>
      </header>
      {!photos.length ? (
        <p className="empty">Er staan nog geen foto’s uit dit album op deze pagina.</p>
      ) : (
        <>
          <div className="ph-album-stage">
            <button type="button" className="ph-album-arrow prev" onClick={() => goTo(at - 1)} disabled={at === 0} aria-label="Vorige foto">
              ‹
            </button>
            <div className="ph-album-track" ref={track} onScroll={onScroll}>
              {photos.map((p) => (
                <figure key={p.id} className="ph-album-slide">
                  <img src={p.url} alt={p.caption || 'Foto'} width={p.width} height={p.height} loading="lazy" />
                </figure>
              ))}
            </div>
            <button type="button" className="ph-album-arrow next" onClick={() => goTo(at + 1)} disabled={at === photos.length - 1} aria-label="Volgende foto">
              ›
            </button>
          </div>
          {current && (
            <div className="ph-album-caption">
              <b>{current.caption || 'Zonder titel'}</b>
              {current.showExif && current.exif && <ExifLine exif={current.exif} />}
              {current.views !== undefined && (
                <span className="muted">
                  <FarmIcon name="eye" /> {current.views} · <FarmIcon name="star" /> {current.faves}
                </span>
              )}
            </div>
          )}
          <div className="ph-album-strip" ref={strip}>
            {photos.map((p, i) => (
              <button key={p.id} type="button" className={i === at ? 'current' : undefined} onClick={() => goTo(i)} aria-label={`Foto ${i + 1}`}>
                <img src={p.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** Choosing the wide photo at the top of your page, and where it's cropped. */
export function BannerDialog({ page, photos, onClose }: { page: PhotographyPage; photos: PhotographyPhoto[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [photoId, setPhotoId] = useState<number | null>(page.bannerPhotoId ?? photos[0]?.id ?? null)
  const [y, setY] = useState(page.bannerY)
  const chosen = photos.find((p) => p.id === photoId)
  const save = useMutation({
    mutationFn: (bannerPhotoId: number | null) =>
      api<PhotographyPage>('/photography/me', {
        method: 'PUT',
        body: { title: page.title, about: page.about, gear: page.gear, visibility: page.visibility, showExif: page.showExif, bannerPhotoId, bannerY: y },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: photographyKeys.all })
      onClose()
    },
  })
  return (
    <Modal title="Bannerfoto" icon="picture_sunset" onClose={onClose} wide>
      {!photos.length ? (
        <p className="empty">Zet eerst foto’s op je pagina; daar kies je de banner uit.</p>
      ) : (
        <div className="ph-form">
          <div className="ph-banner-preview" style={chosen ? { backgroundImage: `url(${chosen.url})`, backgroundPositionY: `${y}%` } : undefined} />
          <label className="ph-check">
            Uitsnede: hoger of lager
            <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} />
          </label>
          <ul className="ph-pick">
            {photos.map((p) => (
              <li key={p.id}>
                <button type="button" className={p.id === photoId ? 'on' : undefined} aria-pressed={p.id === photoId} onClick={() => setPhotoId(p.id)} title={p.caption || 'Foto'}>
                  <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                  {p.id === photoId && <FarmIcon name="tick" className="ph-pick-tick" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="account-actions">
            <Button variant="cta" disabled={!photoId || save.isPending} onClick={() => save.mutate(photoId)}>
              <FarmIcon name="accept" /> Opslaan
            </Button>
            {page.bannerPhotoId && (
              <Button disabled={save.isPending} onClick={() => save.mutate(null)}>
                Geen banner
              </Button>
            )}
            {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Choosing which photos of your page go in an album (a photo is in one album at a time). */
export function AlbumFillDialog({ album, photos, username, onClose }: { album: PhotoAlbum; photos: PhotographyPhoto[]; username: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (p: PhotographyPhoto) => api<Photo>(`/photos/${p.id}`, { method: 'PATCH', body: { albumId: p.albumId === album.id ? null : album.id } }),
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: photographyKeys.all }), queryClient.invalidateQueries({ queryKey: keys.profile(username) })]),
  })
  return (
    <Modal title={`Foto’s in ${album.name}`} icon="photo_album" onClose={onClose} wide>
      <p className="muted ph-note">Klik op een foto om hem in dit album te zetten, of er weer uit te halen. Een foto staat in één album tegelijk.</p>
      {!photos.length ? (
        <p className="empty">Er staan nog geen foto’s op je pagina.</p>
      ) : (
        <ul className="ph-pick">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.albumId === album.id ? 'on' : undefined} aria-pressed={p.albumId === album.id} disabled={toggle.isPending} onClick={() => toggle.mutate(p)} title={p.caption || 'Foto'}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                {p.albumId === album.id && <FarmIcon name="tick" className="ph-pick-tick" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="account-actions">
        <Button variant="cta" onClick={onClose}>
          Klaar
        </Button>
      </div>
    </Modal>
  )
}
