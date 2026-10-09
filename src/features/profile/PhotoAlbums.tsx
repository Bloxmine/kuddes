import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Photo } from '../../../shared/api'
import { EXIF_LIMITS, PHOTO_ALBUM_LIMITS, exifLine, type PhotoAlbum, type PhotoExif } from '../../../shared/photography'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Field } from '../../components/ui/Field'
import { IconPicker } from '../../components/ui/IconPicker'
import { Modal } from '../../components/ui/Modal'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { photographyKeys, useMyPhotography } from '../photography/photographyQueries'
import './PhotoAlbums.css'

/** The albums above the photos: everything, each album, and the photos in none. */
export function AlbumBar({
  albums,
  photos,
  current,
  onPick,
  onNew,
}: {
  albums: PhotoAlbum[]
  photos: { albumId: number | null }[]
  current: number | 'geen' | null
  onPick: (a: number | 'geen' | null) => void
  onNew?: () => void
}) {
  const loose = photos.filter((p) => p.albumId === null).length
  return (
    <ul className="album-bar" aria-label="Albums">
      <li>
        <button type="button" className={current === null ? 'current' : undefined} aria-pressed={current === null} onClick={() => onPick(null)}>
          <span className="album-cover">
            <FarmIcon name="photos" size={32} />
          </span>
          <b>Alle foto's</b>
          <small>{photos.length}</small>
        </button>
      </li>
      {albums.map((a) => (
        <li key={a.id}>
          <button type="button" className={current === a.id ? 'current' : undefined} aria-pressed={current === a.id} onClick={() => onPick(a.id)} title={a.description || a.name}>
            <span className="album-cover">
              {a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" /> : <FarmIcon name={(a.icon ?? 'photo_album') as FarmIconName} size={32} />}
              {a.coverUrl && a.icon && <FarmIcon name={a.icon as FarmIconName} className="album-icon" />}
            </span>
            <b>{a.name}</b>
            <small>{a.count}</small>
          </button>
        </li>
      ))}
      {albums.length > 0 && loose > 0 && (
        <li>
          <button type="button" className={current === 'geen' ? 'current' : undefined} aria-pressed={current === 'geen'} onClick={() => onPick('geen')}>
            <span className="album-cover">
              <FarmIcon name="folder" size={32} />
            </span>
            <b>Zonder album</b>
            <small>{loose}</small>
          </button>
        </li>
      )}
      {onNew && (
        <li>
          <button type="button" className="album-new" onClick={onNew}>
            <span className="album-cover">
              <FarmIcon name="add" size={32} />
            </span>
            <b>Nieuw album</b>
          </button>
        </li>
      )}
    </ul>
  )
}

/** Where albums are saved: a member's own (default), or a Kudde's. */
export type AlbumPlace = { create: string; item: (id: number) => string; refresh: readonly unknown[] }

/** Making or changing an album: a name, an icon and a bit of text. */
export function AlbumDialog({
  album,
  username,
  place,
  onClose,
  onSaved,
}: {
  album: PhotoAlbum | null
  username?: string
  place?: AlbumPlace
  onClose: () => void
  onSaved: (a: PhotoAlbum | null) => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(album?.name ?? '')
  const [description, setDescription] = useState(album?.description ?? '')
  const [icon, setIcon] = useState<string | null>(album?.icon ?? null)
  const where: AlbumPlace = place ?? { create: '/me/albums', item: (id) => `/albums/${id}`, refresh: keys.profile(username ?? '') }
  const refresh = () => queryClient.invalidateQueries({ queryKey: where.refresh })
  const save = useMutation({
    mutationFn: () => api<PhotoAlbum>(album ? where.item(album.id) : where.create, { method: album ? 'PATCH' : 'POST', body: { name, description, icon } }),
    onSuccess: async (saved) => {
      await refresh()
      onSaved(saved)
      onClose()
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(where.item(album!.id), { method: 'DELETE' }),
    onSuccess: async () => {
      await refresh()
      onSaved(null)
      onClose()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Modal title={album ? 'Album bewerken' : 'Nieuw album'} icon="photo_album" onClose={onClose}>
      <form
        className="album-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="album-form-row">
          <Field label="Icoon">
            <IconPicker value={icon} onChange={setIcon} allowNone label="Icoon van het album" />
          </Field>
          <Field label="Naam" error={fields.name}>
            <input className="text-box" value={name} maxLength={PHOTO_ALBUM_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Vakantie 2026" required autoFocus />
          </Field>
        </div>
        <Field label="Omschrijving (optioneel)" error={fields.description}>
          <textarea className="text-box" rows={3} value={description} maxLength={PHOTO_ALBUM_LIMITS.description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!name.trim() || save.isPending}>
            <FarmIcon name="accept" /> {album ? 'Opslaan' : 'Album maken'}
          </Button>
          {album && (
            <Button
              disabled={remove.isPending}
              onClick={() => {
                if (confirm(`Het album "${album.name}" verwijderen? De foto's blijven gewoon bewaard, zonder album.`)) remove.mutate()
              }}
            >
              <FarmIcon name="bin" /> Verwijderen
            </Button>
          )}
          {(save.isError || remove.isError) && !Object.keys(fields).length && <span className="form-error">{errorMessage(save.error ?? remove.error)}</span>}
        </div>
      </form>
    </Modal>
  )
}

/** "Canon EOS 600D · f/2.8 · 1/250 s · ISO 200 · 35 mm" */
export function ExifLine({ exif }: { exif: PhotoExif }) {
  const line = exifLine(exif)
  if (!exif.camera && !exif.lens && !line) return null
  return (
    <span className="exif-line" title="Camera-info">
      <FarmIcon name="camera" /> {[exif.camera, exif.lens].filter(Boolean).join(', ')}
      {line && <span className="muted"> {line}</span>}
    </span>
  )
}

/** Under your own photo in the lightbox: its album, camera details and photography page. */
export function PhotoSettings({ photo, albums, username }: { photo: Photo; albums: PhotoAlbum[]; username: string }) {
  const queryClient = useQueryClient()
  const { data: page } = useMyPhotography()
  const [camera, setCamera] = useState(photo.exif?.camera ?? '')
  const [lens, setLens] = useState(photo.exif?.lens ?? '')
  const [shown, setShown] = useState(photo.id)
  if (shown !== photo.id) {
    setShown(photo.id)
    setCamera(photo.exif?.camera ?? '')
    setLens(photo.exif?.lens ?? '')
  }
  const update = useMutation({
    mutationFn: (changes: Partial<{ albumId: number | null; showExif: boolean; inPhotography: boolean; exif: PhotoExif | null }>) =>
      api<Photo>(`/photos/${photo.id}`, { method: 'PATCH', body: changes }),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: keys.profile(username) }), queryClient.invalidateQueries({ queryKey: photographyKeys.all })])
    },
  })
  const exifChanged = camera.trim() !== (photo.exif?.camera ?? '') || lens.trim() !== (photo.exif?.lens ?? '')
  return (
    <div className="photo-settings">
      <label>
        <FarmIcon name="photo_album" /> Album
        <select className="text-box" value={photo.albumId ?? ''} onChange={(e) => update.mutate({ albumId: Number(e.target.value) || null })} disabled={update.isPending}>
          <option value="">Geen album</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" checked={photo.showExif} onChange={(e) => update.mutate({ showExif: e.target.checked })} disabled={update.isPending} /> Camera-info tonen
      </label>
      <form
        className="photo-settings-exif"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ exif: { ...photo.exif, camera: camera.trim() || undefined, lens: lens.trim() || undefined } })
        }}
      >
        <input className="text-box" value={camera} maxLength={EXIF_LIMITS.camera} onChange={(e) => setCamera(e.target.value)} placeholder="Camera" aria-label="Camera" />
        <input className="text-box" value={lens} maxLength={EXIF_LIMITS.lens} onChange={(e) => setLens(e.target.value)} placeholder="Lens" aria-label="Lens" />
        {exifChanged && (
          <button type="submit" className="btn" disabled={update.isPending}>
            Opslaan
          </button>
        )}
      </form>
      {page ? (
        <label>
          <input type="checkbox" checked={photo.inPhotography} onChange={(e) => update.mutate({ inPhotography: e.target.checked })} disabled={update.isPending} /> Op mijn{' '}
          <Link to={`/fotografie/${username}`}>fotografiepagina</Link>
        </label>
      ) : (
        <Link to="/fotografie" className="muted">
          <FarmIcon name="camera" /> Fotografie
        </Link>
      )}
      {update.isError && <span className="form-error">{errorMessage(update.error)}</span>}
    </div>
  )
}
