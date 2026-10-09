/** The Fotografie gadget on a profile: photos from the owner's photography page, as a wall or a strip. */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { Gadget } from '../../../shared/api'
import type { GadgetConfig } from '../../../shared/gadgets'
import type { PhotographyPage, PhotographyPhoto } from '../../../shared/photography'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAlbums } from '../../lib/queries'
import { photographyKeys, useMyPhotography } from './photographyQueries'
import './PhotographyGadget.css'

type Data = Extract<Gadget, { type: 'fotografie' }>

export function PhotographyGadget({ gadget, username, isOwner }: { gadget: Data; username: string; isOwner: boolean }) {
  const { show, albumId, count, look } = gadget.config
  // The page decides who may see it (everyone, members, friends): the gadget asks it, so it follows that
  const { data: page, error } = useQuery({ queryKey: photographyKeys.page(username), queryFn: () => api<PhotographyPage>(`/photography/${encodeURIComponent(username)}`), retry: false })
  const sort = show === 'populair' ? 'populair' : 'nieuwste'
  const { data: all = [] } = useQuery({
    queryKey: photographyKeys.photos(username, sort),
    queryFn: () => api<PhotographyPhoto[]>(`/photography/${encodeURIComponent(username)}/photos${sort === 'populair' ? '?sort=populair' : ''}`),
    enabled: !!page,
  })
  if (error) {
    return isOwner ? (
      <p className="empty">
        Je hebt nog geen fotografiepagina. <Link to="/fotografie">Maak er een</Link>, dan staan je foto’s hier.
      </p>
    ) : (
      <p className="empty">
        <FarmIcon name="lock" /> {errorMessage(error)}
      </p>
    )
  }
  if (!page) return <p className="muted">Laden…</p>
  const photos = (show === 'album' && albumId ? all.filter((p) => p.albumId === albumId) : all).slice(0, count)
  const link = (id: number) => `/fotografie/${username}/foto/${id}${show === 'album' && albumId ? `?album=${albumId}` : ''}`
  return (
    <div className="phg">
      {!photos.length ? (
        <p className="empty">{isOwner ? 'Zet foto’s op je fotografiepagina, dan staan ze hier.' : 'Nog geen foto’s.'}</p>
      ) : look === 'strook' ? (
        <ul className="phg-strip">
          {photos.map((p) => (
            <li key={p.id}>
              <Link to={link(p.id)} title={p.caption || 'Foto'}>
                <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="phg-wall">
          {photos.map((p) => {
            const ratio = p.width / Math.max(1, p.height)
            return (
              <li key={p.id} style={{ flexGrow: ratio, width: `${ratio * 90}px` }}>
                <Link to={link(p.id)} title={p.caption || 'Foto'}>
                  <i style={{ paddingBottom: `${(1 / ratio) * 100}%` }} aria-hidden="true" />
                  <img src={p.url} alt={p.caption || 'Foto'} loading="lazy" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <Link to={show === 'album' && albumId ? `/fotografie/${username}?album=${albumId}` : `/fotografie/${username}`} className="phg-more">
        <FarmIcon name="camera" /> {page.title} ({page.photoCount}) »
      </Link>
    </div>
  )
}

export function PhotographyGadgetEditor({ value, onChange, username }: { value: GadgetConfig['fotografie']; onChange: (next: GadgetConfig['fotografie']) => void; username: string }) {
  const { data: page, isLoading } = useMyPhotography()
  const { data: albums = [] } = useAlbums(username)
  if (!isLoading && !page) {
    return (
      <p className="empty">
        Deze gadget laat foto’s van je fotografiepagina zien. <Link to="/fotografie">Maak eerst je fotopagina</Link>.
      </p>
    )
  }
  return (
    <div className="gadget-rows">
      <label className="gadget-toggle">
        Laat zien{' '}
        <select className="text-box" value={value.show} onChange={(e) => onChange({ ...value, show: e.target.value as GadgetConfig['fotografie']['show'] })}>
          <option value="nieuwste">Mijn nieuwste foto’s</option>
          <option value="populair">Mijn meeste favorieten</option>
          <option value="album" disabled={!albums.length}>
            Eén album
          </option>
        </select>
      </label>
      {value.show === 'album' && (
        <label className="gadget-toggle">
          Album{' '}
          <select className="text-box" value={value.albumId ?? ''} onChange={(e) => onChange({ ...value, albumId: Number(e.target.value) || null })}>
            <option value="">Kies een album…</option>
            {albums.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="gadget-toggle">
        Aantal{' '}
        <select className="text-box" value={value.count} onChange={(e) => onChange({ ...value, count: Number(e.target.value) })}>
          {[3, 6, 9, 12, 18, 24].map((n) => (
            <option key={n} value={n}>
              {n} foto’s
            </option>
          ))}
        </select>
      </label>
      <label className="gadget-toggle">
        Als{' '}
        <select className="text-box" value={value.look} onChange={(e) => onChange({ ...value, look: e.target.value as GadgetConfig['fotografie']['look'] })}>
          <option value="wand">Fotowand</option>
          <option value="strook">Strook om doorheen te scrollen</option>
        </select>
      </label>
      <p className="muted">Wie je fotografiepagina niet mag zien, ziet ook deze foto’s niet.</p>
    </div>
  )
}
