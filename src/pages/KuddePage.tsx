import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Kudde, KuddeDetail } from '../../shared/api'
import { KUDDE_CATEGORIES, KUDDE_INFO_LIMITS, mapHref, type KuddeInfo } from '../../shared/kuddes'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import { EventForm } from '../features/events/EventForm'
import { EventRow } from '../features/events/EventParts'
import { eventHref } from '../features/events/eventTime'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { keys, useKudde } from '../lib/queries'
import { seededGradient } from '../lib/placeholder'
import { compressImage } from '../lib/compressImage'
import { formatDate } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import { KuddeDetailsFields, type KuddeDetailsForm } from './NewKuddePage'
import { KuddeDesignEditor } from '../features/kuddes/KuddeDesign'
import { KuddeGadgetBoxes, KuddeGadgetManager } from '../features/kuddes/KuddeGadgets'
import { KuddeManagers } from '../features/kuddes/KuddeManagers'
import { can } from '../features/kuddes/kuddeRights'
import { KuddeBoard } from '../features/kuddes/KuddeBoard'
import { KuddePhotos } from '../features/kuddes/KuddePhotos'
import { Field } from '../components/ui/Field'
import { designSkin, skinVars } from '../../shared/skins'
import { BackgroundEffect } from '../components/effects/BackgroundEffect'
import { useSiteDark } from '../lib/useSiteDark'
import './KuddesPage.css'
import { ShareWithFriends } from '../features/share/ShareWithFriends'

function useRefreshKudde(slug: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.kudde(slug) }),
      queryClient.invalidateQueries({ queryKey: keys.allKuddes }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: keys.allEvents }),
    ])
}

/** The owner edits the category, address and who can join. */
/** The owner changes (or removes) the Kudde's picture; it's saved right away. */
function KuddeImageControls({ kudde, overlay }: { kudde: KuddeDetail; overlay?: boolean }) {
  const refresh = useRefreshKudde(kudde.slug)
  const input = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.set('file', await compressImage(file, 1200))
      return api<{ imageUrl: string }>(`/kuddes/${kudde.slug}/image`, { method: 'PUT', form })
    },
    onSettled: () => {
      if (input.current) input.current.value = ''
    },
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: () => api<void>(`/kuddes/${kudde.slug}/image`, { method: 'DELETE' }), onSuccess: refresh })
  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/gif,image/webp"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) upload.mutate(file)
      }}
    />
  )
  const error = (upload.isError || remove.isError) && <span className="form-error">{errorMessage(upload.error ?? remove.error)}</span>
  if (overlay)
    return (
      <span className="kudde-hero-change">
        {picker}
        <button type="button" className="btn" disabled={upload.isPending} onClick={() => input.current?.click()}>
          <FarmIcon name="camera" /> {upload.isPending ? 'Uploaden…' : 'Foto wijzigen'}
        </button>
        {error}
      </span>
    )
  return (
    <div className="kudde-image-edit">
      <span className="kudde-image-preview" style={kudde.imageUrl ? { backgroundImage: `url(${kudde.imageUrl})` } : { background: seededGradient(kudde.name) }} />
      <span className="kudde-image-actions">
        {picker}
        <Button onClick={() => input.current?.click()} disabled={upload.isPending}>
          <FarmIcon name="camera" /> {upload.isPending ? 'Uploaden…' : kudde.imageUrl ? 'Andere foto kiezen' : 'Foto kiezen'}
        </Button>
        {kudde.imageUrl && (
          <button type="button" className="link-button" disabled={remove.isPending} onClick={() => confirm('De foto van de Kudde weghalen?') && remove.mutate()}>
            Foto weghalen
          </button>
        )}
        <span className="muted">JPG, PNG, GIF of WebP, maximaal 8 MB. Een nieuwe foto staat er meteen.</span>
        {error}
      </span>
    </div>
  )
}

function EditKudde({ kudde, onDone }: { kudde: KuddeDetail; onDone: () => void }) {
  const refresh = useRefreshKudde(kudde.slug)
  const [form, setForm] = useState<KuddeDetailsForm>({
    description: kudde.description,
    category: kudde.category,
    subcategory: kudde.subcategory ?? '',
    address: kudde.address ?? '',
    city: kudde.city ?? '',
    phone: kudde.phone ?? '',
    website: kudde.website ?? '',
    visibility: kudde.visibility,
    photography: kudde.photography,
  })
  const [info, setInfo] = useState<KuddeInfo>(kudde.info)
  const [photosShareable, setPhotosShareable] = useState(kudde.photosShareable)
  const setI = (key: keyof KuddeInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInfo((i) => ({ ...i, [key]: e.target.value }))
  const isPlace = KUDDE_CATEGORIES[form.category].place
  const save = useMutation({
    mutationFn: () => api<Kudde>(`/kuddes/${kudde.slug}`, { method: 'PATCH', body: { ...form, photosShareable, info: { ...info, hours: isPlace ? info.hours : '' } } }),
    onSuccess: async () => {
      await refresh()
      onDone()
    },
  })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Box title="Kudde bewerken" icon="pencil">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <h3 className="kudde-edit-sub">Foto van de Kudde</h3>
        <KuddeImageControls kudde={kudde} />
        <KuddeDetailsFields form={form} onChange={setForm} fields={fields} />
        <h3 className="kudde-edit-sub">Meer over de Kudde</h3>
        <Field label="Wat doen we?" hint="(waar gaat de Kudde over, wat doen jullie samen)" error={fields['info.activities']}>
          <textarea className="text-box" rows={4} value={info.activities} maxLength={KUDDE_INFO_LIMITS.activities} onChange={setI('activities')} placeholder="Bijv. we spelen elke week een potje zaalvoetbal en daarna een biertje in de kantine." />
        </Field>
        <div className="settings-grid">
          <Field label="Wanneer?" hint="(optioneel)" error={fields['info.when']}>
            <input className="text-box" value={info.when} maxLength={KUDDE_INFO_LIMITS.when} onChange={setI('when')} placeholder="Bijv. elke vrijdag vanaf 20:00" />
          </Field>
          {isPlace && (
            <Field label="Openingstijden" hint="(een regel per dag)" error={fields['info.hours']}>
              <textarea className="text-box" rows={4} value={info.hours} maxLength={KUDDE_INFO_LIMITS.hours} onChange={setI('hours')} placeholder={'ma-vr: 10:00 - 23:00\nza-zo: 12:00 - 01:00'} />
            </Field>
          )}
        </div>
        <h3 className="kudde-edit-sub">Foto's</h3>
        <label className="kudde-toggle">
          <input type="checkbox" checked={photosShareable} disabled={form.visibility === 'besloten'} onChange={(e) => setPhotosShareable(e.target.checked)} />
          <span>
            Leden mogen de foto's van de Kudde ook elders op Kuddes gebruiken
            <small className="muted">
              {form.visibility === 'besloten'
                ? "Een besloten Kudde houdt haar foto's altijd voor zichzelf."
                : "In hun WieWatWaars, forumberichten en blogs, met de naam van de Kudde erbij. Zet je dit uit, dan verdwijnen de foto's daar ook weer."}
            </small>
          </span>
        </label>
        {kudde.visibility === 'besloten' && form.visibility === 'openbaar' && kudde.requests.length > 0 && (
          <p className="form-notice">De {kudde.requests.length} openstaande aanvragen worden dan meteen goedgekeurd.</p>
        )}
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={save.isPending}>
            Opslaan
          </Button>
          <Button onClick={onDone}>Annuleren</Button>
          {save.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

function Requests({ kudde }: { kudde: KuddeDetail }) {
  const refresh = useRefreshKudde(kudde.slug)
  const answer = useMutation({
    mutationFn: ({ username, accept }: { username: string; accept: boolean }) =>
      api<void>(`/kuddes/${kudde.slug}/requests/${username}`, { method: accept ? 'POST' : 'DELETE' }),
    onSuccess: refresh,
  })
  if (kudde.requests.length === 0) return null
  return (
    <Box title={`Aanvragen (${kudde.requests.length})`} icon="user_add" className="kudde-requests">
      <ul className="member-list">
        {kudde.requests.map((u) => (
          <li key={u.id}>
            <Avatar user={u} size="small" />
            <div className="member-list-info">
              <Link to={`/profiel/${u.username}`} className="buzz-name">
                {u.nickname}
              </Link>
              <div className="date">wil lid worden</div>
            </div>
            <div className="member-list-actions">
              <Button variant="cta" disabled={answer.isPending} onClick={() => answer.mutate({ username: u.username, accept: true })}>
                <FarmIcon name="accept" /> Toelaten
              </Button>
              <Button disabled={answer.isPending} onClick={() => answer.mutate({ username: u.username, accept: false })}>
                Weigeren
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {answer.isError && <p className="form-error">{errorMessage(answer.error)}</p>}
    </Box>
  )
}

function Events({ kudde }: { kudde: KuddeDetail }) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  return (
    <Box
      title="Evenementen"
      icon="calendar"
      actions={
        kudde.canPost ? (
          <button type="button" className="link-button" onClick={() => setAdding(true)} disabled={adding}>
            <FarmIcon name="calendar_add" /> Evenement toevoegen
          </button>
        ) : undefined
      }
    >
      <span id="evenementen" />
      {adding && (
        <EventForm
          kuddeSlug={kudde.slug}
          onDone={(saved) => {
            setAdding(false)
            if (saved) navigate(eventHref(saved))
          }}
        />
      )}
      {kudde.eventsHidden ? (
        <p className="form-notice">
          <FarmIcon name="lock" /> Deze Kudde is besloten: alleen leden zien de evenementen.
        </p>
      ) : kudde.events.length === 0 ? (
        !adding && (
          <p className="empty">
            Nog niets gepland.{kudde.canPost && ' Plan jij iets leuks?'}
          </p>
        )
      ) : (
        <ul className="event-list">
          {kudde.events.map((e) => (
            <EventRow key={e.id} event={e} showKudde={false} />
          ))}
        </ul>
      )}
      <Link to="/agenda" className="box-more">
        Bekijk de agenda →
      </Link>
    </Box>
  )
}

/** "Over deze Kudde": the description, what they do, when, opening hours and where. */
function AboutKudde({ kudde, place }: { kudde: KuddeDetail; place: string }) {
  const { activities, when, hours } = kudde.info
  const empty = !kudde.description && !activities && !when && !hours && !place
  return (
    <Box title="Over deze Kudde" icon="information" className="kudde-about">
      {empty && <p className="empty">Nog geen omschrijving.{can(kudde, 'bewerken') && ' Vul hem in via Bewerken.'}</p>}
      {kudde.description && <p className="kudde-description">{kudde.description}</p>}
      {activities && (
        <section>
          <h3>
            <FarmIcon name="star" /> Wat doen we?
          </h3>
          <p className="kudde-description">{activities}</p>
        </section>
      )}
      {when && (
        <section>
          <h3>
            <FarmIcon name="clock" /> Wanneer?
          </h3>
          <p>{when}</p>
        </section>
      )}
      {hours && (
        <section>
          <h3>
            <FarmIcon name="time" /> Openingstijden
          </h3>
          <p className="kudde-description">{hours}</p>
        </section>
      )}
      {place && (
        <section>
          <h3>
            <FarmIcon name="location_pin" /> Waar?
          </h3>
          <p>
            <a href={mapHref(place)} target="_blank" rel="noopener noreferrer">
              {place}
            </a>
            <br />
            <a href={mapHref(place)} target="_blank" rel="noopener noreferrer" className="kudde-map-link">
              <FarmIcon name="map" /> Bekijk op de kaart (OpenStreetMap)
            </a>
          </p>
        </section>
      )}
    </Box>
  )
}

export function KuddePage() {
  const { slug = '' } = useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data: kudde, error, isLoading } = useKudde(slug)
  const [editing, setEditing] = useState(false)
  const [designing, setDesigning] = useState(false)
  const [managing, setManaging] = useState(false)
  // ?gadgets opens the owner's gadget box (from the Gadgetmarkt)
  const [params, setParams] = useSearchParams()
  const [gadgeting, setGadgeting] = useState(() => params.has('gadgets'))
  const closeGadgets = () => {
    setGadgeting(false)
    if (params.has('gadgets')) setParams({}, { replace: true })
  }
  // Light designs are shown dark on a dark site theme
  const siteDark = useSiteDark()
  const refresh = useRefreshKudde(slug)
  usePageTitle(kudde ? `${kudde.name} - Kuddes` : 'Kudde - Kuddes')

  const membership = useMutation({
    mutationFn: (method: 'POST' | 'DELETE') => api<void>(`/kuddes/${slug}/membership`, { method }),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/kuddes/${slug}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.allKuddes })
      navigate('/kuddes')
    },
  })

  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!kudde) {
    const notFound = error instanceof ApiRequestError && error.status === 404
    return (
      <main className="page page-con">
        <Box title={notFound ? 'Kudde niet gevonden' : 'Er ging iets mis'}>
          <p>
            {notFound ? 'Deze Kudde bestaat niet (meer).' : 'Probeer het later nog eens.'} <Link to="/kuddes">Bekijk alle Kuddes</Link>
          </p>
        </Box>
      </main>
    )
  }

  const category = KUDDE_CATEGORIES[kudde.category]
  const place = [kudde.address, kudde.city].filter(Boolean).join(', ')

  return (
    <div className={kudde.design ? 'kudde-page skinned' : 'kudde-page'} style={kudde.design ? (skinVars(designSkin(kudde.design, siteDark)) as CSSProperties) : undefined}>
      {kudde.design?.effect && <BackgroundEffect effect={kudde.design.effect} />}
      <main className="page page-con">
        <div className="kudde-hero box">
          <div
            className="kudde-hero-img"
            style={kudde.imageUrl ? { backgroundImage: `url(${kudde.imageUrl})` } : { background: seededGradient(kudde.name) }}
          >
            {can(kudde, 'bewerken') && <KuddeImageControls kudde={kudde} overlay />}
          </div>
          <div className="kudde-hero-info">
            <p className="kudde-hero-category">
              <Link to={`/kuddes?categorie=${kudde.category}`}>
                <FarmIcon name={category.icon} /> {category.name}
              </Link>
              {kudde.subcategory && (
                <>
                  {' › '}
                  <Link to={`/kuddes?categorie=${kudde.category}&sub=${encodeURIComponent(kudde.subcategory)}`}>{kudde.subcategory}</Link>
                </>
              )}
              {kudde.photography && (
                <Link to="/fotografie" className="kudde-photography-badge" title="Een Fotografie-Kudde">
                  <FarmIcon name="camera" /> Fotografie
                </Link>
              )}
              {kudde.visibility === 'besloten' && (
                <span className="kudde-closed">
                  <FarmIcon name="lock" /> Besloten
                </span>
              )}
            </p>
            <h1>{kudde.name}</h1>
            <p className="muted">
              {kudde.memberCount} {kudde.memberCount === 1 ? 'lid' : 'leden'} · gestart op {formatDate(kudde.createdAt)}
              {kudde.creator && (
                <>
                  {' '}
                  door <Link to={`/profiel/${kudde.creator.username}`}>{kudde.creator.nickname}</Link>
                </>
              )}
              {' · '}
              <ShareWithFriends path={`/kuddes/${kudde.slug}`} className="link-button share-link" />
            </p>
            {(place || kudde.phone || kudde.website) && (
              <ul className="kudde-contact">
                {place && (
                  <li>
                    <FarmIcon name="map" />{' '}
                    <a href={mapHref(place)} target="_blank" rel="noopener noreferrer" title="Bekijk op OpenStreetMap">
                      {place}
                    </a>
                  </li>
                )}
                {kudde.phone && (
                  <li>
                    <FarmIcon name="telephone" /> <a href={`tel:${kudde.phone.replace(/[^0-9+]/g, '')}`}>{kudde.phone}</a>
                  </li>
                )}
                {kudde.website && (
                  <li>
                    <FarmIcon name="world_link" />{' '}
                    <a href={kudde.website} target="_blank" rel="nofollow noopener noreferrer ugc">
                      {kudde.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </a>
                  </li>
                )}
              </ul>
            )}
            <div className="kudde-hero-actions">
              {kudde.membership === null && (
                <Link to={`/inloggen?next=/kuddes/${slug}`} className="btn btn-cta">
                  Log in om lid te worden
                </Link>
              )}
              {kudde.membership === 'none' && (
                <Button variant="cta" disabled={membership.isPending} onClick={() => membership.mutate('POST')}>
                  <FarmIcon name="user_add" /> {kudde.visibility === 'besloten' ? 'Vraag lidmaatschap aan' : 'Word lid'}
                </Button>
              )}
              {kudde.membership === 'pending' && (
                <>
                  <span className="muted">
                    <FarmIcon name="time" /> Je aanvraag wacht op goedkeuring
                  </span>
                  <Button disabled={membership.isPending} onClick={() => membership.mutate('DELETE')}>
                    Aanvraag intrekken
                  </Button>
                </>
              )}
              {kudde.membership === 'member' && (
                <span className="form-success">
                  <FarmIcon name={kudde.rights.length ? 'key' : 'tick'} /> {kudde.rights.length ? 'Jij helpt deze Kudde beheren' : 'Je bent lid'}
                </span>
              )}
              {kudde.membership === 'owner' && (
                <span className="form-success">
                  <FarmIcon name="award_star_gold_1" /> Jij beheert deze Kudde
                </span>
              )}
              {/* They stay where they are while open, so nothing else slides under your mouse */}
              {can(kudde, 'bewerken') && (
                <Button onClick={() => setEditing(true)} disabled={editing} aria-pressed={editing}>
                  <FarmIcon name="pencil" /> Bewerken
                </Button>
              )}
              {can(kudde, 'pimpen') && (
                <Button onClick={() => setDesigning(true)} disabled={designing} aria-pressed={designing}>
                  <FarmIcon name="palette" /> Pimp deze Kudde
                </Button>
              )}
              {can(kudde, 'gadgets') && (
                <Button onClick={() => setGadgeting(true)} disabled={gadgeting} aria-pressed={gadgeting}>
                  <FarmIcon name="plugin" /> Gadgets
                </Button>
              )}
              {kudde.membership === 'owner' && (
                <>
                  <Button onClick={() => setManaging(true)} disabled={managing} aria-pressed={managing}>
                    <FarmIcon name="key" /> Beheerders
                  </Button>
                  <Button
                    disabled={remove.isPending}
                    onClick={() => {
                      if (confirm(`"${kudde.name}" verwijderen? De evenementen, foto's en het prikbord gaan ook weg.`)) remove.mutate()
                    }}
                  >
                    <FarmIcon name="bin" /> Verwijderen
                  </Button>
                </>
              )}
              {/* An owner can leave when another owner stays */}
              {(kudde.membership === 'member' || (kudde.membership === 'owner' && kudde.managers.filter((m) => m.role === 'owner').length > 1)) && (
                <Button disabled={membership.isPending} onClick={() => confirm(`${kudde.name} verlaten?`) && membership.mutate('DELETE')}>
                  Lidmaatschap opzeggen
                </Button>
              )}
            </div>
            {(membership.isError || remove.isError) && <p className="form-error">{errorMessage(membership.error ?? remove.error)}</p>}
          </div>
        </div>

        {editing && <EditKudde kudde={kudde} onDone={() => setEditing(false)} />}
        {designing && <KuddeDesignEditor kudde={kudde} onDone={() => setDesigning(false)} />}
        {gadgeting && can(kudde, 'gadgets') && <KuddeGadgetManager kudde={kudde} onDone={closeGadgets} />}
        {managing && kudde.membership === 'owner' && <KuddeManagers kudde={kudde} onDone={() => setManaging(false)} />}

        <div className="cols">
          <div>
            <Requests kudde={kudde} />
            <Events kudde={kudde} />
            <KuddePhotos kudde={kudde} />
            <KuddeBoard kudde={kudde} />
          </div>
          <div>
            <AboutKudde kudde={kudde} place={place} />
            <Box title={`Leden (${kudde.memberCount})`} icon="group">
              {kudde.managers.length > 0 && (
                <p className="kudde-managers muted">
                  <FarmIcon name="key" /> Beheerd door{' '}
                  {kudde.managers.map((m, i) => (
                    <span key={m.user.id}>
                      {i > 0 && ', '}
                      <Link to={`/profiel/${m.user.username}`}>{m.user.nickname}</Link>
                    </span>
                  ))}
                </p>
              )}
              <ul className="kudde-members">
                {kudde.members.map((m) => (
                  <li key={m.id}>
                    <Avatar user={m} size="small" showName label={m.nickname} />
                  </li>
                ))}
              </ul>
            </Box>
            <KuddeGadgetBoxes kudde={kudde} />
          </div>
        </div>
      </main>
    </div>
  )
}
