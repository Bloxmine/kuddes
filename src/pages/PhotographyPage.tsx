import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { PhotographyKudde, PhotographyPage as Page, PhotographyPhoto } from '../../shared/photography'
import { PHOTOGRAPHY_VISIBILITY } from '../../shared/photography'
import { CatalogHero, SortTabs } from '../components/catalog/Catalog'
import { useCatalogParams } from '../components/catalog/useCatalogParams'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { AlbumFillDialog, BannerDialog, JustifiedGrid, PageCard, PageDialog, PickDialog, UploadDialog } from '../features/photography/PhotographyParts'
import { AlbumDialog } from '../features/profile/PhotoAlbums'
import type { PhotoAlbum } from '../../shared/photography'
import { photographyKeys, useMyPhotography } from '../features/photography/photographyQueries'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useAlbums } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'
import './PhotographyPage.css'

type Sort = 'nieuwste' | 'populair'
const SORTS: [Sort, string, FarmIconName][] = [
  ['nieuwste', 'Nieuwste', 'flag_new'],
  ['populair', 'Meeste favorieten', 'heart'],
]
/** Remembered in this browser: you chose to just look around. */
const LOOKING_KEY = 'kuddes.fotografie.rondkijken'

/**
 * /fotografie: looking around (photographers and their newest or most liked
 * photos), and the first time a choice: make a page of your own, or just look.
 */
export function PhotographyHomePage() {
  usePageTitle('Fotografie - Kuddes')
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const { params, update } = useCatalogParams(true)
  const sort: Sort = params.get('sort') === 'populair' ? 'populair' : 'nieuwste'
  const q = params.get('q') ?? ''
  const { data, isLoading, isError, error } = useQuery({
    queryKey: photographyKeys.explore(sort, q),
    queryFn: () => api<{ pages: Page[]; photos: PhotographyPhoto[]; kuddes: PhotographyKudde[] }>(`/photography?${new URLSearchParams({ ...(sort === 'populair' && { sort }), ...(q && { q }) })}`),
  })
  const { data: mine, isLoading: loadingMine } = useMyPhotography(member)
  const [looking, setLooking] = useState(() => {
    try {
      return localStorage.getItem(LOOKING_KEY) === '1'
    } catch {
      return false
    }
  })
  const [making, setMaking] = useState(false)
  const navigate = useNavigate()
  const photos = data?.photos ?? []
  const open = (id: number) => {
    const p = photos.find((x) => x.id === id)
    if (p) navigate(`/fotografie/${p.user.username}/foto/${id}`)
  }

  return (
    <main className="page page-con ph-page">
      <CatalogHero
        title="Fotografie"
        intro="Foto’s van Kuddes-leden die van fotograferen houden, met de camera die ze gebruikten. Kijk rond, of laat je eigen werk zien."
        q={q}
        placeholder="Zoek op titel, camera of fotograaf"
        label="Zoek in Fotografie"
        onSearch={(v) => update({ q: v || null })}
      />

      {member && !loadingMine && !mine && !looking && (
        <section className="box ph-welcome" aria-label="Welkom bij Fotografie">
          <h2>Welkom bij Fotografie!</h2>
          <p className="muted">Fotografeer je graag? Maak een eigen pagina voor je mooiste foto’s. Geen fotograaf? Dan kijk je gewoon rond: dat kan altijd.</p>
          <div className="ph-welcome-choices">
            <button type="button" onClick={() => setMaking(true)}>
              <FarmIcon name="camera" size={32} />
              <b>Maak mijn fotopagina</b>
              <small>Laat je werk zien, met je camera en instellingen</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setLooking(true)
                try {
                  localStorage.setItem(LOOKING_KEY, '1')
                } catch {
                  // remembered for now only
                }
              }}
            >
              <FarmIcon name="eye" size={32} />
              <b>Gewoon rondkijken</b>
              <small>Je kunt later altijd nog een pagina maken</small>
            </button>
          </div>
        </section>
      )}

      <div className="ph-layout">
        <section className="box ph-main" aria-label="Foto’s">
          <div className="ct-bar">
            <div className="ct-title">
              <h2>{q ? `Gezocht op "${q}"` : 'Ontdekken'}</h2>
              <span className="muted">{data ? `${photos.length} ${photos.length === 1 ? 'foto' : 'foto’s'}` : ' '}</span>
            </div>
            <SortTabs value={sort} onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })} options={SORTS} />
          </div>
          {isLoading ? (
            <p className="muted ct-empty">Laden…</p>
          ) : isError ? (
            <p className="form-error ct-empty">{errorMessage(error)}</p>
          ) : !photos.length ? (
            <div className="ct-empty">
              <FarmIcon name="camera" size={48} />
              <p>{q ? `Niets gevonden voor "${q}".` : 'Hier staan nog geen foto’s.'}</p>
            </div>
          ) : (
            <JustifiedGrid photos={photos} onOpen={open} showOwner />
          )}
        </section>

        <aside className="ph-side sticky-side">
          {member && mine && (
            <Link to={`/fotografie/${mine.user.username}`} className="box ph-mine">
              <FarmIcon name="camera" size={32} />
              <span>
                <b>Mijn fotopagina</b>
                <small className="muted">
                  {mine.photoCount} {mine.photoCount === 1 ? 'foto' : 'foto’s'} · {mine.faveCount} favorieten
                </small>
              </span>
            </Link>
          )}
          {member && !mine && looking && (
            <section className="box ph-mine-new">
              <p className="muted">Toch zelf foto’s laten zien?</p>
              <Button variant="cta" onClick={() => setMaking(true)}>
                <FarmIcon name="camera" /> Maak je fotopagina
              </Button>
            </section>
          )}
          {!user && (
            <section className="box ph-mine-new">
              <p className="muted">
                <Link to="/inloggen?next=/fotografie">Log in</Link> om favorieten te geven en je eigen fotopagina te maken.
              </p>
            </section>
          )}
          <Box title="Fotografie-Kuddes" icon="group" actions={member ? <Link to="/kuddes/nieuw?fotografie=1">Nieuwe</Link> : undefined}>
            {data?.kuddes.length ? (
              <ul className="ph-cards">
                {data.kuddes.map((k) => (
                  <li key={k.slug} className="ph-card">
                    <Link to={`/kuddes/${k.slug}`}>
                      <span className={`ph-card-cover n${Math.min(k.cover.length, 4)}`}>
                        {k.cover.length ? k.cover.map((url) => <img key={url} src={url} alt="" loading="lazy" />) : <FarmIcon name="group" size={32} />}
                      </span>
                      <span className="ph-card-text">
                        <b>{k.name}</b>
                        <small>
                          {k.memberCount} {k.memberCount === 1 ? 'lid' : 'leden'} · {k.photoCount} {k.photoCount === 1 ? 'foto' : 'foto’s'}
                        </small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">
                Nog geen fotoclubs. {member && <Link to="/kuddes/nieuw?fotografie=1">Start er een</Link>}
              </p>
            )}
          </Box>
          <Box title="Fotografen" icon="camera">
            {data?.pages.length ? (
              <ul className="ph-cards">
                {data.pages.map((p) => (
                  <PageCard key={p.user.username} page={p} />
                ))}
              </ul>
            ) : (
              <p className="empty">Nog geen fotografen.</p>
            )}
          </Box>
        </aside>
      </div>

      {making && <PageDialog page={null} onClose={() => setMaking(false)} />}
    </main>
  )
}

type Tab = 'stream' | 'albums' | 'favorieten' | 'over'
const TABS: [Tab, string, FarmIconName][] = [
  ['stream', 'Fotostream', 'photos'],
  ['albums', 'Albums', 'photo_album'],
  ['favorieten', 'Favorieten', 'heart'],
  ['over', 'Over', 'user'],
]

/**
 * /fotografie/:username: one photographer's page, like Flickr: a wide banner
 * photo with their name, then the photostream (newest first), their albums
 * to scroll through, the photos they gave a star, and about them.
 */
export function PhotographerPage() {
  const { username = '' } = useParams()
  const { user } = useAuth()
  const member = !!user?.emailVerified
  const queryClient = useQueryClient()
  const { params, update } = useCatalogParams(true)
  const rawTab = params.get('tab')
  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : params.get('album') ? 'albums' : 'stream'
  const sort: Sort = params.get('sort') === 'populair' ? 'populair' : 'nieuwste'
  const album = Number(params.get('album')) || null
  const { data: page, isLoading, error } = useQuery({ queryKey: photographyKeys.page(username), queryFn: () => api<Page>(`/photography/${encodeURIComponent(username)}`), retry: false })
  const { data: photos = [] } = useQuery({
    queryKey: photographyKeys.photos(username, sort),
    queryFn: () => api<PhotographyPhoto[]>(`/photography/${encodeURIComponent(username)}/photos${sort === 'populair' ? '?sort=populair' : ''}`),
    enabled: !!page,
  })
  const { data: faves = [] } = useQuery({
    queryKey: [...photographyKeys.page(username), 'faves'],
    queryFn: () => api<PhotographyPhoto[]>(`/photography/${encodeURIComponent(username)}/faves`),
    enabled: !!page && tab === 'favorieten',
  })
  // The albums with photos on this page (the owner sees the empty ones too, to fill them)
  const { data: albums = [] } = useAlbums(username)
  const sets = albums.map((a) => ({ album: a, photos: photos.filter((p) => p.albumId === a.id) })).filter((s) => s.photos.length > 0 || page?.mine)
  const openSet = album ? sets.find((s) => s.album.id === album) : undefined
  const navigate = useNavigate()
  const openPhoto = (id: number, list: PhotographyPhoto[] = photos) => {
    const p = list.find((x) => x.id === id)
    navigate(`/fotografie/${p?.user.username ?? username}/foto/${id}${openSet ? `?album=${openSet.album.id}` : ''}`)
  }
  // An old ?foto= link: to the photo's own page
  const linked = Number(params.get('foto'))
  useEffect(() => {
    if (linked) navigate(`/fotografie/${username}/foto/${linked}`, { replace: true })
  }, [linked, username, navigate])
  const [dialog, setDialog] = useState<'pagina' | 'upload' | 'kiezen' | 'banner' | 'album' | 'vullen' | null>(null)
  const [editAlbum, setEditAlbum] = useState<PhotoAlbum | null>(null)
  usePageTitle(page ? `${page.title} - Fotografie - Kuddes` : 'Fotografie - Kuddes')

  if (isLoading) return <main className="page page-con">Laden…</main>
  if (!page)
    return (
      <main className="page page-con">
        <Box title="Fotografie" icon="camera">
          <p className="form-error">{errorMessage(error)}</p>
          <p>
            <Link to="/fotografie">Naar Fotografie</Link>
          </p>
        </Box>
      </main>
    )

  const visibility = PHOTOGRAPHY_VISIBILITY[page.visibility]
  return (
    <main className="page page-con ph-page">
      <header className={page.bannerUrl ? 'ph-banner' : 'ph-banner plain'} style={page.bannerUrl ? { backgroundImage: `url(${page.bannerUrl})`, backgroundPositionY: `${page.bannerY}%` } : undefined}>
        <Link to="/fotografie" className="ph-banner-back">
          <FarmIcon name="camera" /> Fotografie
        </Link>
        {page.mine && (
          <button type="button" className="ph-banner-edit" onClick={() => setDialog('banner')}>
            <FarmIcon name="picture_sunset" /> {page.bannerUrl ? 'Banner wijzigen' : 'Kies een bannerfoto'}
          </button>
        )}
        <div className="ph-banner-who">
          <Avatar user={page.user} size="medium" />
          <div>
            <h1>{page.title}</h1>
            <p>
              <Link to={`/profiel/${page.user.username}`}>{page.user.nickname}</Link> · {page.photoCount} {page.photoCount === 1 ? 'foto' : 'foto’s'} · {page.faveCount} favorieten
            </p>
          </div>
        </div>
      </header>

      <nav className="ph-tabs" aria-label="Fotopagina">
        <ul>
          {TABS.map(([t, label, icon]) => (
            <li key={t}>
              <button type="button" className={tab === t ? 'current' : undefined} aria-current={tab === t ? 'page' : undefined} onClick={() => update({ tab: t === 'stream' ? null : t, album: null })}>
                <FarmIcon name={icon} /> {label}
                {t === 'albums' && sets.length > 0 && <small>{sets.length}</small>}
              </button>
            </li>
          ))}
        </ul>
        <span className="ph-tabs-side">
          {page.mine ? (
            <>
              <span className="ph-visibility-badge" title={visibility.hint}>
                <FarmIcon name={visibility.icon as FarmIconName} /> {visibility.label}
              </span>
              <Button variant="cta" onClick={() => setDialog('upload')}>
                <FarmIcon name="picture_add" /> Plaatsen
              </Button>
              <Button onClick={() => setDialog('kiezen')} title="Kies uit je foto’s">
                <FarmIcon name="photos" />
              </Button>
              <Button onClick={() => setDialog('pagina')} title="Pagina bewerken">
                <FarmIcon name="pencil" />
              </Button>
            </>
          ) : (
            member && <ShareLink username={page.user.username} />
          )}
        </span>
      </nav>

      <section className="box ph-main">
        {tab === 'stream' && (
          <>
            <div className="ct-bar">
              <div className="ct-title">
                <h2>Fotostream</h2>
                <span className="muted">
                  {photos.length} {photos.length === 1 ? 'foto' : 'foto’s'}
                </span>
              </div>
              <SortTabs value={sort} onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })} options={SORTS} />
            </div>
            {!photos.length ? (
              <div className="ct-empty">
                <FarmIcon name="camera" size={48} />
                <p>{page.mine ? 'Plaats je eerste foto, of kies er een uit je Foto’s.' : 'Hier staan nog geen foto’s.'}</p>
              </div>
            ) : (
              <JustifiedGrid photos={photos} onOpen={(id) => openPhoto(id)} />
            )}
          </>
        )}

        {tab === 'albums' &&
          (openSet ? (
            <div className="ph-album-page">
              <header className="ph-album-head">
                <button type="button" className="btn" onClick={() => update({ album: null })}>
                  ‹ Alle albums
                </button>
                <FarmIcon name={(openSet.album.icon ?? 'photo_album') as FarmIconName} size={32} />
                <div>
                  <h2>{openSet.album.name}</h2>
                  {openSet.album.description && <p className="muted">{openSet.album.description}</p>}
                  <small className="muted">
                    {openSet.photos.length} {openSet.photos.length === 1 ? 'foto' : 'foto’s'}
                  </small>
                </div>
                {page.mine && (
                  <span className="ph-album-tools">
                    <Button onClick={() => setDialog('vullen')}>
                      <FarmIcon name="photos" /> Foto’s kiezen
                    </Button>
                    <Button
                      onClick={() => {
                        setEditAlbum(openSet.album)
                        setDialog('album')
                      }}
                      title="Album bewerken"
                    >
                      <FarmIcon name="pencil" />
                    </Button>
                  </span>
                )}
              </header>
              {openSet.photos.length ? (
                <JustifiedGrid photos={openSet.photos} onOpen={(id) => openPhoto(id, openSet.photos)} />
              ) : (
                <div className="ct-empty">
                  <FarmIcon name="photo_album" size={48} />
                  <p>Dit album is nog leeg.</p>
                  {page.mine && (
                    <Button variant="cta" onClick={() => setDialog('vullen')}>
                      <FarmIcon name="photos" /> Foto’s kiezen
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {page.mine && (
                <div className="ph-albums-bar">
                  <Button
                    variant="cta"
                    onClick={() => {
                      setEditAlbum(null)
                      setDialog('album')
                    }}
                  >
                    <FarmIcon name="add" /> Nieuw album
                  </Button>
                </div>
              )}
              {!sets.length ? (
                <div className="ct-empty">
                  <FarmIcon name="photo_album" size={48} />
                  <p>{page.mine ? 'Nog geen albums. Maak er een en zet er je foto’s in.' : 'Nog geen albums.'}</p>
                </div>
              ) : (
                <ul className="ph-sets-grid">
                  {sets.map(({ album: a, photos: list }) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => update({ album: String(a.id) })}>
                        <span className={list.length ? 'ph-set-cover' : 'ph-set-cover empty'}>
                          {list.length ? list.slice(0, 3).map((p) => <img key={p.id} src={p.url} alt="" loading="lazy" />) : <FarmIcon name={(a.icon ?? 'photo_album') as FarmIconName} size={32} />}
                        </span>
                        <span className="ph-set-text">
                          <b>
                            <FarmIcon name={(a.icon ?? 'photo_album') as FarmIconName} /> {a.name}
                          </b>
                          <small>
                            {list.length} {list.length === 1 ? 'foto' : 'foto’s'}
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ))}

        {tab === 'favorieten' &&
          (!faves.length ? (
            <div className="ct-empty">
              <FarmIcon name="star" size={48} />
              <p>{page.mine ? 'Geef een ster aan foto’s die je mooi vindt; ze komen hier te staan.' : 'Nog geen favorieten.'}</p>
            </div>
          ) : (
            <JustifiedGrid photos={faves} onOpen={(id) => openPhoto(id, faves)} showOwner />
          ))}

        {tab === 'over' && (
          <div className="ph-about">
            {page.about ? <p>{page.about}</p> : <p className="muted">{page.user.nickname} heeft nog niets over zichzelf geschreven.</p>}
            {page.gear && (
              <p className="ph-gear">
                <FarmIcon name="camera" /> <b>Camera’s en lenzen:</b> {page.gear}
              </p>
            )}
            <p className="ph-gear">
              <FarmIcon name={visibility.icon as FarmIconName} /> Te zien voor: {visibility.label.toLowerCase()}
            </p>
          </div>
        )}
      </section>

      {dialog === 'album' && (
        <AlbumDialog
          album={editAlbum}
          username={username}
          onClose={() => setDialog(null)}
          onSaved={(a) => {
            void queryClient.invalidateQueries({ queryKey: photographyKeys.all })
            update({ album: a ? String(a.id) : null })
          }}
        />
      )}
      {dialog === 'vullen' && openSet && <AlbumFillDialog album={openSet.album} photos={photos} username={username} onClose={() => setDialog(null)} />}
      {dialog === 'pagina' && <PageDialog page={page} onClose={() => setDialog(null)} />}
      {dialog === 'upload' && <UploadDialog page={page} albums={albums} username={username} onClose={() => setDialog(null)} />}
      {dialog === 'kiezen' && <PickDialog username={username} onClose={() => setDialog(null)} />}
      {dialog === 'banner' && <BannerDialog page={page} photos={photos} onClose={() => setDialog(null)} />}
    </main>
  )
}

function ShareLink({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      onClick={() => {
        void navigator.clipboard?.writeText(`${location.origin}/fotografie/${username}`).then(() => setCopied(true))
      }}
    >
      <FarmIcon name={copied ? 'tick' : 'link'} /> {copied ? 'Link gekopieerd' : 'Kopieer link'}
    </Button>
  )
}
