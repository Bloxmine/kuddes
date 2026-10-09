/**
 * Picking a photo for something you post (a WieWatWaar, a forum post, a
 * blog): from your own Foto's box (or a new one, uploaded right here into
 * it), or in the "Kuddes" tab from the open Kuddes you're in. A besloten
 * Kudde's photos stay inside that Kudde.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { KuddePhoto, MyKuddePhotos, Photo } from '../../../shared/api'
import { api, errorMessage } from '../../lib/api'
import { compressImage } from '../../lib/compressImage'
import { keys, usePhotos } from '../../lib/queries'
import { FarmIcon } from '../ui/FarmIcon'

export type PickedPhoto = { kind: 'eigen'; photo: Photo } | { kind: 'kudde'; photo: KuddePhoto; kudde: { slug: string; name: string } }

/**
 * `selected`: "eigen:<id>" / "kudde:<id>" keys of what's chosen; `full`: no
 * more can be added (the others are greyed out); `room`: how many more fit,
 * so several new photos can be uploaded at once (one at a time without it).
 */
export function PostPhotoPicker({
  username,
  selected,
  onPick,
  full,
  room = 1,
}: {
  username: string
  selected: string[]
  onPick: (photo: PickedPhoto) => void
  full?: boolean
  room?: number
}) {
  const [tab, setTab] = useState<'eigen' | 'kuddes'>('eigen')
  return (
    <div className="composer-photo-panel">
      <div className="composer-photo-tabs" role="tablist" aria-label="Foto's van">
        <button type="button" role="tab" aria-selected={tab === 'eigen'} className={tab === 'eigen' ? 'current' : undefined} onClick={() => setTab('eigen')}>
          <FarmIcon name="photos" /> Mijn foto's
        </button>
        <button type="button" role="tab" aria-selected={tab === 'kuddes'} className={tab === 'kuddes' ? 'current' : undefined} onClick={() => setTab('kuddes')}>
          <FarmIcon name="group" /> Kuddes
        </button>
      </div>
      {tab === 'eigen' ? <OwnPhotos username={username} selected={selected} onPick={onPick} full={full} room={room} /> : <KuddesPhotos selected={selected} onPick={onPick} full={full} />}
    </div>
  )
}

function OwnPhotos({ username, selected, onPick, full, room }: { username: string; selected: string[]; onPick: (photo: PickedPhoto) => void; full?: boolean; room: number }) {
  const { data: photos = [], isLoading } = usePhotos(username)
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [leftOut, setLeftOut] = useState(0)
  // New photos go into your Foto's box and are picked straight away, one after the other
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress({ done: 0, total: files.length })
      try {
        for (const [i, file] of files.entries()) {
          const form = new FormData()
          form.set('file', await compressImage(file, 2048))
          form.set('forPost', 'true')
          onPick({ kind: 'eigen', photo: await api<Photo>('/photos', { method: 'POST', form }) })
          setProgress({ done: i + 1, total: files.length })
        }
      } finally {
        setProgress(null)
        queryClient.invalidateQueries({ queryKey: keys.photos(username) })
        queryClient.invalidateQueries({ queryKey: keys.recentPhotos })
      }
    },
  })
  return (
    <>
      <div className="composer-photo-hdr">
        <b>{full ? 'Je hebt het maximum aan foto’s gekozen' : 'Kies foto’s uit je foto’s'}</b>
        <label className={upload.isPending ? 'composer-photo-upload busy' : full ? 'composer-photo-upload full' : 'composer-photo-upload'}>
          <FarmIcon name="picture_add" />{' '}
          {progress ? `Uploaden… ${progress.total > 1 ? `(${progress.done + 1}/${progress.total})` : ''}` : room > 1 ? 'Nieuwe foto’s uploaden' : 'Nieuwe foto uploaden'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple={room > 1}
            disabled={upload.isPending || full}
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              // As many as still fit; the rest is mentioned, not silently dropped
              setLeftOut(Math.max(0, files.length - room))
              if (files.length) upload.mutate(files.slice(0, room))
            }}
          />
        </label>
      </div>
      {upload.isError && <p className="form-error">{errorMessage(upload.error)}</p>}
      {leftOut > 0 && (
        <p className="form-notice">
          Er {room === 1 ? 'paste' : 'pasten'} nog {room} {room === 1 ? 'foto' : 'foto’s'} bij; {leftOut} {leftOut === 1 ? 'is' : 'zijn'} niet toegevoegd.
        </p>
      )}
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : photos.length === 0 ? (
        <p className="empty">Je hebt nog geen foto's. Met Nieuwe foto uploaden voeg je er hier een toe: hij komt ook in je Foto's-box op je profiel.</p>
      ) : (
        <ul className="composer-photo-grid">
          {photos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={selected.includes(`eigen:${p.id}`) ? 'current' : undefined}
                aria-pressed={selected.includes(`eigen:${p.id}`)}
                disabled={full && !selected.includes(`eigen:${p.id}`)}
                title={p.caption || 'Foto'}
                onClick={() => onPick({ kind: 'eigen', photo: p })}
              >
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function KuddesPhotos({ selected, onPick, full }: { selected: string[]; onPick: (photo: PickedPhoto) => void; full?: boolean }) {
  const { data, isLoading } = useQuery({ queryKey: ['kudde-photos', 'mine'], queryFn: () => api<MyKuddePhotos>('/me/kudde-photos'), staleTime: 60_000 })
  if (isLoading || !data) return <p className="muted">Laden…</p>
  return (
    <>
      {data.kuddes.length === 0 ? (
        <p className="empty">
          Er zijn nog geen foto's in de open Kuddes waar je lid van bent. Voeg ze toe in de Foto's-box van een Kudde, of <Link to="/kuddes">zoek een Kudde</Link>.
        </p>
      ) : (
        <div className="composer-kudde-photos">
          {data.kuddes.map((k) => (
            <section key={k.slug}>
              <h4>
                {k.imageUrl ? <img src={k.imageUrl} alt="" width={16} height={16} /> : <FarmIcon name="group" />} <Link to={`/kuddes/${k.slug}`}>{k.name}</Link>
              </h4>
              <ul className="composer-photo-grid">
                {k.photos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={selected.includes(`kudde:${p.id}`) ? 'current' : undefined}
                      aria-pressed={selected.includes(`kudde:${p.id}`)}
                      disabled={full && !selected.includes(`kudde:${p.id}`)}
                      title={`${p.caption || 'Foto'} (van ${p.user.nickname})`}
                      onClick={() => onPick({ kind: 'kudde', photo: p, kudde: { slug: k.slug, name: k.name } })}
                    >
                      <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {data.closed > 0 && (
        <p className="muted composer-photo-note">
          <FarmIcon name="lock" /> De foto's van besloten Kuddes, en van Kuddes die dat niet toestaan, blijven in die Kudde.
        </p>
      )}
    </>
  )
}
