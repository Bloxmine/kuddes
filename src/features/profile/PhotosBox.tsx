import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Photo as PhotoType, Profile } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { Photo } from '../../components/ui/Photo'
import { api, errorMessage } from '../../lib/api'
import { keys, useAlbums, usePhotos } from '../../lib/queries'
import { withSmileys } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { compressImage } from '../../lib/compressImage'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { PhotoEditor } from '../photos/PhotoEditor'
import { PhotoViewer } from '../../components/ui/PhotoViewer'
import { ShareWithFriends } from '../share/ShareWithFriends'
import { useAuth } from '../../lib/auth'
import type { PhotoAlbum, PhotoExif } from '../../../shared/photography'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { readExif } from '../../lib/readExif'
import { AlbumBar, AlbumDialog, ExifLine, PhotoSettings } from './PhotoAlbums'

type PhotosBoxProps = {
  profile: Profile
  limit?: number
  onShowAll?: () => void
  /** Open this photo in the lightbox straight away (from a ?foto= link). */
  initialPhotoId?: number
}

function UploadForm({ profile, albums, album }: { profile: Profile; albums: PhotoAlbum[]; album: number | null }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [file, setFile] = useState<File | null>(null)
  // Into the album you're looking at, unless you pick another
  const [albumId, setAlbumId] = useState<number | null>(album)
  const [shownAlbum, setShownAlbum] = useState(album)
  if (album !== shownAlbum) {
    setShownAlbum(album)
    setAlbumId(album)
  }
  const [exif, setExif] = useState<PhotoExif | null>(null)
  const [showExif, setShowExif] = useState(false)

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('file', await compressImage(file!, 2048))
      form.set('caption', caption)
      if (albumId) form.set('albumId', String(albumId))
      if (exif) {
        form.set('exif', JSON.stringify(exif))
        form.set('showExif', String(showExif))
      }
      return api<PhotoType>('/photos', { method: 'POST', form })
    },
    onSuccess: async () => {
      setCaption('')
      setFile(null)
      setExif(null)
      if (fileRef.current) fileRef.current.value = ''
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.profile(profile.username) }),
        queryClient.invalidateQueries({ queryKey: keys.recentPhotos }),
      ])
    },
  })

  return (
    <form
      className="photo-upload"
      onSubmit={(e) => {
        e.preventDefault()
        if (file) upload.mutate()
      }}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null
          setFile(f)
          setExif(null)
          // The camera details, read before the photo is made smaller (never its location)
          if (f) void readExif(f).then(setExif)
        }}
        aria-label="Kies een foto"
      />
      <input
        className="text-box"
        value={caption}
        maxLength={120}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Onderschrift (optioneel)"
        aria-label="Onderschrift"
      />
      {albums.length > 0 && (
        <select className="text-box" value={albumId ?? ''} onChange={(e) => setAlbumId(Number(e.target.value) || null)} aria-label="In album">
          <option value="">Geen album</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <Button type="submit" disabled={!file || upload.isPending}>
        <FarmIcon name="picture_add" /> {upload.isPending ? 'Uploaden…' : 'Uploaden'}
      </Button>
      {exif && (
        <label className="photo-upload-exif">
          <input type="checkbox" checked={showExif} onChange={(e) => setShowExif(e.target.checked)} />
          <FarmIcon name="camera" /> Toon de camera-info{exif.camera ? ` (${exif.camera})` : ''}
          <small className="muted">Nooit de plek waar de foto is gemaakt.</small>
        </label>
      )}
      {upload.isError && <p className="form-error">{errorMessage(upload.error)}</p>}
    </form>
  )
}

/** Photo grid with a lightbox; members can upload and delete their own photos. */
export function PhotosBox({ profile, limit, onShowAll, initialPhotoId }: PhotosBoxProps) {
  const { waiting } = useAuth()
  const queryClient = useQueryClient()
  const { data: all = [], isLoading } = usePhotos(profile.username)
  // Albums only in the full Foto's tab, not in the small box on the profile
  const { data: albums = [] } = useAlbums(profile.username)
  const [album, setAlbum] = useState<number | 'geen' | null>(null)
  const [albumDialog, setAlbumDialog] = useState<PhotoAlbum | 'nieuw' | null>(null)
  const photos = limit || album === null ? all : all.filter((p) => (album === 'geen' ? p.albumId === null : p.albumId === album))
  const [openId, setOpenId] = useState<number | null>(initialPhotoId ?? null)
  const [editing, setEditing] = useState(false)
  const shown = limit ? photos.slice(0, limit) : photos
  const currentAlbum = typeof album === 'number' ? albums.find((a) => a.id === album) : undefined
  const index = photos.findIndex((p) => p.id === openId)
  const current = index >= 0 ? photos[index] : null
  const isSelf = profile.relation?.isSelf

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/photos/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      close()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.profile(profile.username) }),
        queryClient.invalidateQueries({ queryKey: keys.recentPhotos }),
      ])
    },
  })

  const close = () => {
    setOpenId(null)
    setEditing(false)
  }

  return (
    <Box title={`Foto's (${profile.photoCount})`} icon="camera" className="profile-photos">
      {/* On the waitlist only a profile photo and background, no photos */}
      {isSelf && !waiting && <UploadForm profile={profile} albums={albums} album={typeof album === 'number' ? album : null} />}
      {!limit && (albums.length > 0 || isSelf) && (
        <AlbumBar albums={albums} photos={all} current={album} onPick={setAlbum} onNew={isSelf && !waiting ? () => setAlbumDialog('nieuw') : undefined} />
      )}
      {currentAlbum && (
        <div className="album-head">
          <FarmIcon name={(currentAlbum.icon ?? 'photo_album') as FarmIconName} size={32} />
          <div>
            <b>{currentAlbum.name}</b>
            {currentAlbum.description && <p className="muted">{currentAlbum.description}</p>}
          </div>
          {isSelf && (
            <Button onClick={() => setAlbumDialog(currentAlbum)}>
              <FarmIcon name="pencil" /> Album bewerken
            </Button>
          )}
        </div>
      )}
      {isLoading ? (
        <p className="muted">Foto's laden…</p>
      ) : photos.length === 0 ? (
        <p className="empty">{album !== null ? 'Hier staan nog geen foto’s.' : isSelf ? "Nog geen foto's. Upload je eerste!" : "Nog geen foto's."}</p>
      ) : (
        <ul className="photo-grid">
          {shown.map((photo) => (
            <li key={photo.id}>
              <button type="button" className="media-link" onClick={() => setOpenId(photo.id)} title={photo.caption}>
                <Photo src={photo.url} width={96} alt={photo.caption || 'Foto'} className="media-img" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {limit && photos.length > limit && onShowAll && (
        <ul className="more">
          <li>
            <span className="rsaquo" aria-hidden="true">
              ›
            </span>
            <button type="button" className="link-button" onClick={onShowAll}>
              Bekijk alle foto's ({photos.length})
            </button>
          </li>
        </ul>
      )}

      {current && (
        <PhotoViewer
          photos={photos}
          index={index}
          onIndex={(i) => setOpenId(photos[i].id)}
          onClose={close}
          editing={editing ? <PhotoEditor photo={current} onDone={() => setEditing(false)} /> : undefined}
          info={
            <>
              <span className="lbx-caption">{current.caption ? withSmileys(current.caption) : <span className="muted">Geen onderschrift</span>}</span>
              <span className="muted">
                {formatTime(current.createdAt)}
                {current.albumId && albums.find((a) => a.id === current.albumId) && (
                  <span className="lightbox-album">
                    <FarmIcon name={(albums.find((a) => a.id === current.albumId)!.icon ?? 'photo_album') as FarmIconName} /> {albums.find((a) => a.id === current.albumId)!.name}
                  </span>
                )}
              </span>
              {current.showExif && current.exif && <ExifLine exif={current.exif} />}
            </>
          }
          actions={
            <>
              {current.canDelete && (
                <Button onClick={() => setEditing(true)}>
                  <FarmIcon name="picture_edit" /> Bewerken
                </Button>
              )}
              <ShareWithFriends path={`/profiel/${profile.username}?foto=${current.id}`} />
              {current.canDelete && (
                <button
                  type="button"
                  className="btn"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm('Deze foto verwijderen?')) remove.mutate(current.id)
                  }}
                >
                  <FarmIcon name="bin" /> Verwijderen
                </button>
              )}
            </>
          }
          below={current.canDelete && <PhotoSettings photo={current} albums={albums} username={profile.username} />}
        />
      )}
      {albumDialog && (
        <AlbumDialog
          album={albumDialog === 'nieuw' ? null : albumDialog}
          username={profile.username}
          onClose={() => setAlbumDialog(null)}
          onSaved={(a) => setAlbum(a ? a.id : null)}
        />
      )}
    </Box>
  )
}
