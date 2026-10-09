/** A Kudde's own Foto's box: members add photos, and everyone who can see the Kudde can look through them. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { KuddeDetail, KuddePhoto, KuddePhotoList } from '../../../shared/api'
import { KUDDE_PHOTO_LIMITS } from '../../../shared/kuddes'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'
import { withSmileys } from '../../lib/smileys'
import { formatTime } from '../../lib/time'
import { PhotoViewer } from '../../components/ui/PhotoViewer'
import type { PhotoAlbum, PhotoExif } from '../../../shared/photography'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { readExif } from '../../lib/readExif'
import { AlbumBar, AlbumDialog, ExifLine } from '../profile/PhotoAlbums'
import { AlbumViewer, JustifiedGrid } from '../photography/PhotographyParts'
import { photographyKeys, useMyPhotography } from '../photography/photographyQueries'
import type { PhotographyPhoto } from '../../../shared/photography'
import { Modal } from '../../components/ui/Modal'
import { useAuth } from '../../lib/auth'

const photosKey = (slug: string) => ['kuddes', 'photos', slug] as const
/** Thumbnails shown before "Alle foto's". */
const SHOWN = 12
const NONE: KuddePhoto[] = []

function UploadForm({ slug, albums, album, photography }: { slug: string; albums: PhotoAlbum[]; album: number | null; photography: boolean }) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [caption, setCaption] = useState('')
  const [albumId, setAlbumId] = useState<number | null>(album)
  const [shownAlbum, setShownAlbum] = useState(album)
  if (album !== shownAlbum) {
    setShownAlbum(album)
    setAlbumId(album)
  }
  const [exif, setExif] = useState<PhotoExif | null>(null)
  // In a photography Kudde the camera details show by default
  const [showExif, setShowExif] = useState(photography)
  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.set('file', await compressImage(file!, photography ? 2560 : 2048))
      form.set('caption', caption)
      if (albumId) form.set('albumId', String(albumId))
      if (exif) {
        form.set('exif', JSON.stringify(exif))
        form.set('showExif', String(showExif))
      }
      return api<KuddePhoto>(`/kuddes/${slug}/photos`, { method: 'POST', form })
    },
    onSuccess: async () => {
      setFile(null)
      setCaption('')
      setExif(null)
      if (fileRef.current) fileRef.current.value = ''
      await queryClient.invalidateQueries({ queryKey: photosKey(slug) })
    },
  })
  return (
    <form
      className="kp-upload"
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
      <input className="text-box" value={caption} maxLength={KUDDE_PHOTO_LIMITS.caption} onChange={(e) => setCaption(e.target.value)} placeholder="Onderschrift (optioneel)" aria-label="Onderschrift" />
      {albums.length > 0 && (
        <select className="text-box kp-album-select" value={albumId ?? ''} onChange={(e) => setAlbumId(Number(e.target.value) || null)} aria-label="In album">
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

export function KuddePhotos({ kudde }: { kudde: KuddeDetail }) {
  const queryClient = useQueryClient()
  const member = kudde.membership === 'owner' || kudde.membership === 'member'
  const hidden = kudde.visibility === 'besloten' && !member
  const { data, isLoading, error } = useQuery({ queryKey: photosKey(kudde.slug), queryFn: () => api<KuddePhotoList>(`/kuddes/${kudde.slug}/photos`), enabled: !hidden })
  const everything = data?.items ?? NONE
  const albums = data?.albums ?? []
  const [album, setAlbum] = useState<number | 'geen' | null>(null)
  const [albumDialog, setAlbumDialog] = useState<PhotoAlbum | 'nieuw' | null>(null)
  const [fromPage, setFromPage] = useState(false)
  const photos = album === null ? everything : everything.filter((p) => (album === 'geen' ? p.albumId === null : p.albumId === album))
  const currentAlbum = typeof album === 'number' ? albums.find((a) => a.id === album) : undefined
  // A photography Kudde: the Flickr-like grid, and albums to scroll through
  const photography = kudde.photography
  const [all, setAll] = useState(false)
  // A link to one photo (/kuddes/…?foto=12, from a post elsewhere) opens it big
  const [params, setParams] = useSearchParams()
  const [openId, setOpenIdState] = useState<number | null>(() => Number(params.get('foto')) || null)
  const setOpenId = useCallback(
    (id: number | null) => {
      setOpenIdState(id)
      if (id === null && params.has('foto')) {
        const next = new URLSearchParams(params)
        next.delete('foto')
        setParams(next, { replace: true })
      }
    },
    [params, setParams],
  )
  const index = photos.findIndex((p) => p.id === openId)
  const current = index >= 0 ? photos[index] : null
  const shown = all || photography ? photos : photos.slice(0, SHOWN)
  const place = { create: `/kuddes/${kudde.slug}/albums`, item: (id: number) => `/kudde-albums/${id}`, refresh: photosKey(kudde.slug) }

  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/kudde-photos/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setOpenId(null)
      await queryClient.invalidateQueries({ queryKey: photosKey(kudde.slug) })
    },
  })

  return (
    <Box title={`Foto's${data ? ` (${data.total})` : ''}`} icon="photos" className="kudde-photos">
      {hidden ? (
        <p className="empty">
          <FarmIcon name="lock" /> De foto's van deze besloten Kudde zijn alleen voor leden.
        </p>
      ) : (
        <>
          {data?.canUpload && <UploadForm slug={kudde.slug} albums={albums} album={typeof album === 'number' ? album : null} photography={photography} />}
          {data?.canUpload && photography && (
            <p className="kp-from-photography">
              <Button onClick={() => setFromPage(true)}>
                <FarmIcon name="camera" /> Kies uit je fotografiepagina
              </Button>
              <span className="muted">Foto’s die je al op je eigen fotopagina hebt, met hun titel en camera-info.</span>
            </p>
          )}
          {(albums.length > 0 || data?.canUpload) && everything.length > 0 && (
            <AlbumBar albums={albums} photos={everything} current={album} onPick={setAlbum} onNew={data?.canUpload ? () => setAlbumDialog('nieuw') : undefined} />
          )}
          {currentAlbum && (
            <div className="album-head">
              <FarmIcon name={(currentAlbum.icon ?? 'photo_album') as FarmIconName} size={32} />
              <div>
                <b>{currentAlbum.name}</b>
                {currentAlbum.description && <p className="muted">{currentAlbum.description}</p>}
              </div>
              {albums.find((a) => a.id === currentAlbum.id)?.mine && (
                <Button onClick={() => setAlbumDialog(currentAlbum)}>
                  <FarmIcon name="pencil" /> Album bewerken
                </Button>
              )}
            </div>
          )}
          {isLoading ? (
            <p className="muted">Foto's laden…</p>
          ) : error ? (
            <p className="form-error">{errorMessage(error)}</p>
          ) : photos.length === 0 ? (
            <p className="empty">
              Nog geen foto's.
              {member ? ' Voeg de eerste toe!' : kudde.membership === null ? <> <Link to={`/inloggen?next=/kuddes/${kudde.slug}`}>Log in</Link> en word lid om foto's te delen.</> : " Word lid om foto's te delen."}
            </p>
          ) : photography && currentAlbum ? (
            <AlbumViewer album={currentAlbum} photos={photos} onClose={() => setAlbum(null)} />
          ) : photography ? (
            <JustifiedGrid photos={photos} onOpen={setOpenId} showOwner />
          ) : (
            <ul className="kp-grid">
              {shown.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => setOpenId(p.id)} title={p.caption || `Foto van ${p.user.nickname}`}>
                    <img src={p.url} alt={p.caption || `Foto van ${p.user.nickname}`} loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!photography && photos.length > SHOWN && (
            <button type="button" className="link-button kp-more" onClick={() => setAll((a) => !a)}>
              {all ? "Minder foto's" : `Alle foto's bekijken (${photos.length})`}
            </button>
          )}
        </>
      )}

      {current && (
        <PhotoViewer
          photos={photos}
          index={index}
          onIndex={(i) => setOpenId(photos[i].id)}
          onClose={() => setOpenId(null)}
          info={
            <span className="kp-by">
              <Avatar user={current.user} size="tiny" />
              <span>
                <span className="lbx-caption">{current.caption ? withSmileys(current.caption) : <span className="muted">Geen onderschrift</span>}</span>
                <br />
                <span className="muted">
                  door <Link to={`/profiel/${current.user.username}`}>{current.user.nickname}</Link> · {formatTime(current.createdAt)}
                </span>
                {current.showExif && current.exif && <ExifLine exif={current.exif} />}
              </span>
            </span>
          }
          actions={
            current.canDelete && (
              <button type="button" className="btn" disabled={remove.isPending} onClick={() => confirm('Deze foto uit de Kudde verwijderen?') && remove.mutate(current.id)}>
                <FarmIcon name="bin" /> Verwijderen
              </button>
            )
          }
          below={
            <>
              {remove.isError && <p className="form-error">{errorMessage(remove.error)}</p>}
              {current.canDelete && <KuddePhotoSettings photo={current} albums={albums} slug={kudde.slug} />}
            </>
          }
        />
      )}
      {fromPage && (
        <FromPhotographyDialog
          slug={kudde.slug}
          albums={albums}
          album={typeof album === 'number' ? album : null}
          inKudde={new Set(everything.map((p) => p.sourcePhotoId).filter((x): x is number => x !== null))}
          onClose={() => setFromPage(false)}
        />
      )}
      {albumDialog && <AlbumDialog album={albumDialog === 'nieuw' ? null : albumDialog} place={place} onClose={() => setAlbumDialog(null)} onSaved={(a) => setAlbum(a ? a.id : null)} />}
    </Box>
  )
}

/** A photography Kudde: picking photos from your own photography page to put in (copies, with their title and camera details). */
function FromPhotographyDialog({ slug, albums, album, inKudde, onClose }: { slug: string; albums: PhotoAlbum[]; album: number | null; inKudde: Set<number>; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data: page, isLoading: loadingPage } = useMyPhotography()
  const { data: mine = [], isLoading } = useQuery({
    queryKey: photographyKeys.photos(user?.username ?? '', 'nieuwste'),
    queryFn: () => api<PhotographyPhoto[]>(`/photography/${encodeURIComponent(user!.username)}/photos`),
    enabled: !!page && !!user,
  })
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [albumId, setAlbumId] = useState<number | null>(album)
  const add = useMutation({
    mutationFn: () => api<{ added: number }>(`/kuddes/${slug}/photos/from-photography`, { method: 'POST', body: { photoIds: [...picked], albumId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: photosKey(slug) })
      onClose()
    },
  })
  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <Modal title="Kies uit je fotografiepagina" icon="camera" onClose={onClose} wide>
      {loadingPage || isLoading ? (
        <p className="muted">Laden…</p>
      ) : !page ? (
        <p className="empty">
          Je hebt nog geen fotografiepagina. <Link to="/fotografie">Maak er een</Link> en zet er je foto’s op; daarna kun je ze hier kiezen.
        </p>
      ) : !mine.length ? (
        <p className="empty">
          Er staan nog geen foto’s op <Link to={`/fotografie/${page.user.username}`}>je fotografiepagina</Link>.
        </p>
      ) : (
        <>
          <p className="muted ph-note">Klik de foto’s aan die je in de Kudde wilt zetten. Ze blijven ook gewoon op je eigen pagina staan.</p>
          <ul className="ph-pick">
            {mine.map((p) => {
              const there = inKudde.has(p.id)
              const on = picked.has(p.id)
              return (
                <li key={p.id}>
                  <button type="button" className={on ? 'on' : there ? 'there' : undefined} aria-pressed={on} disabled={there || add.isPending} onClick={() => toggle(p.id)} title={there ? 'Staat al in deze Kudde' : p.caption || 'Foto'}>
                    <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                    {on && <FarmIcon name="tick" className="ph-pick-tick" />}
                    {there && <span className="ph-pick-there">Staat er al</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="account-actions">
        {albums.length > 0 && (
          <select className="text-box kp-album-select" value={albumId ?? ''} onChange={(e) => setAlbumId(Number(e.target.value) || null)} aria-label="In album">
            <option value="">Geen album</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
        <Button variant="cta" disabled={!picked.size || add.isPending} onClick={() => add.mutate()}>
          <FarmIcon name="add" /> {add.isPending ? 'Toevoegen…' : picked.size ? `${picked.size} toevoegen` : 'Toevoegen'}
        </Button>
        <Button onClick={onClose}>Annuleren</Button>
        {add.isError && <span className="form-error">{errorMessage(add.error)}</span>}
      </div>
    </Modal>
  )
}

/** Under a photo you may change: its album and whether the camera details show. */
function KuddePhotoSettings({ photo, albums, slug }: { photo: KuddePhoto; albums: PhotoAlbum[]; slug: string }) {
  const queryClient = useQueryClient()
  const update = useMutation({
    mutationFn: (changes: Partial<{ albumId: number | null; showExif: boolean }>) => api<KuddePhoto>(`/kudde-photos/${photo.id}`, { method: 'PATCH', body: changes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(slug) }),
  })
  return (
    <div className="photo-settings">
      {albums.length > 0 && (
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
      )}
      {photo.exif && (
        <label>
          <input type="checkbox" checked={photo.showExif} onChange={(e) => update.mutate({ showExif: e.target.checked })} disabled={update.isPending} /> Camera-info tonen
        </label>
      )}
      {update.isError && <span className="form-error">{errorMessage(update.error)}</span>}
    </div>
  )
}

/**
 * For the Prikbord: pick one of the Kudde's photos, or upload a new one (it
 * goes into the Foto's box too, so it's there for everyone).
 */
export function KuddePhotoPicker({ slug, selectedId, onPick }: { slug: string; selectedId: number | null; onPick: (photo: KuddePhoto) => void }) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: photosKey(slug), queryFn: () => api<KuddePhotoList>(`/kuddes/${slug}/photos`) })
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.set('file', await compressImage(file, 2048))
      return api<KuddePhoto>(`/kuddes/${slug}/photos`, { method: 'POST', form })
    },
    onSuccess: async (photo) => {
      await queryClient.invalidateQueries({ queryKey: photosKey(slug) })
      onPick(photo)
    },
  })
  const photos = data?.items ?? NONE
  return (
    <div className="composer-photo-panel">
      <div className="composer-photo-hdr">
        <b>Kies een foto uit de foto's van de Kudde</b>
        <button type="button" className="link-button" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
          <FarmIcon name="picture_add" /> {upload.isPending ? 'Uploaden…' : 'Nieuwe foto uploaden'}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) upload.mutate(file)
          }}
        />
      </div>
      {upload.isError && <p className="form-error">{errorMessage(upload.error)}</p>}
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : photos.length === 0 ? (
        <p className="empty">Deze Kudde heeft nog geen foto's. Upload er een: hij komt ook in de Foto's-box.</p>
      ) : (
        <ul className="composer-photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button type="button" className={p.id === selectedId ? 'current' : undefined} title={p.caption || `Foto van ${p.user.nickname}`} onClick={() => onPick(p)}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
