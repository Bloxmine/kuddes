import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { GADGET_TYPES } from '../../../shared/gadgets'
import { MEDIA_KINDS, MEDIA_LIMITS, mediaHref, reviewSnippet, type MediaItem } from '../../../shared/media'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Stars, StarPicker } from '../../features/gadgets/Stars'
import { kindIcon, metaLine, ratingText } from '../../features/media/mediaFormat'
import { KindLabel, MediaCard, ReviewView } from '../../features/media/MediaParts'
import { MediaCover } from '../../features/media/MediaCover'
import { useDeleteItem, useMediaItem, useMediaList, useReviews, useSaveReview, useShelf } from '../../features/media/mediaQueries'
import { ApiRequestError, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { withSmileys } from '../../lib/smileys'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../components/catalog/Catalog.css'
import '../../features/gadgets/ShelfGadgets.css'
import '../../features/gadgets/DrinkSeriesGadgets.css'
import '../../features/media/Media.css'
import { ShareWithFriends } from '../../features/share/ShareWithFriends'

/** /recensies/12-de-hobbit: the item, its stars, the reviews, and yours. */
export function MediaItemPage() {
  const param = useParams().item ?? ''
  const id = Number.parseInt(param, 10)
  const { data: item, isLoading, error } = useMediaItem(id)
  usePageTitle(item ? `${item.title} - Recensies - Kuddes` : 'Recensies - Kuddes')
  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!item) {
    const missing = error instanceof ApiRequestError && error.status === 404
    return (
      <main className="page page-con">
        <div className="box box-con">
          <p className="empty">{missing ? 'Dit staat (nog) niet in de collectie.' : errorMessage(error)}</p>
          <Link to="/recensies">« Naar Recensies</Link>
        </div>
      </main>
    )
  }
  // An old link with another slug goes to the right one
  if (param !== `${item.id}-${item.slug}`) return <Navigate to={`${mediaHref(item)}${location.search}`} replace />
  return <ItemView key={item.id} item={item} />
}

const shelfName = (item: MediaItem) => GADGET_TYPES[MEDIA_KINDS[item.kind].shelf].name

/** What happened after putting it in your kast, with a link to your profile. */
function ShelfDone({ me, message }: { me: Me; message: string }) {
  return (
    <p className="form-success md-shelf-done">
      <FarmIcon name="accept" /> {message} <Link to={`/profiel/${me.username}`}>Bekijk je profiel</Link>
    </p>
  )
}

/**
 * Your review: stars and text. Below it, "also in my kast": the item goes in
 * the shelf gadget on your profile with a bit of your review, which you can
 * change first.
 */
function ReviewForm({ item, me, onDone }: { item: MediaItem; me: Me; onDone: (message: string) => void }) {
  const save = useSaveReview(item.id)
  const shelf = useShelf(item.id, me.username)
  const [rating, setRating] = useState(item.mine?.rating ?? 0)
  const [text, setText] = useState(item.mine?.text ?? '')
  const [toShelf, setToShelf] = useState(!item.shelf?.onShelf && !item.shelf?.full)
  // The snippet follows the review until you change it yourself
  const [ownSnippet, setOwnSnippet] = useState<string | null>(null)
  const snippet = ownSnippet ?? reviewSnippet(text)
  const name = shelfName(item)

  const submit = async () => {
    if (!rating) return
    await save.mutateAsync({ rating, text: text.trim() })
    if (toShelf) {
      const r = await shelf.mutateAsync({ rating, note: snippet.trim() })
      onDone(r.created ? `Opgeslagen, en je nieuwe ${r.shelf} staat op je profiel.` : `Opgeslagen, en ${r.updated ? 'bijgewerkt in' : 'gezet in'} je ${r.shelf}.`)
    } else onDone('Je recensie is opgeslagen.')
  }

  return (
    <form
      className="md-form"
      onSubmit={(e) => {
        e.preventDefault()
        void submit().catch(() => undefined)
      }}
    >
      <div className="md-form-stars">
        <span>Jouw sterren:</span>
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <label className="field">
        <span>
          Wat vond je ervan? <span className="hint">Mag ook leeg: dan geef je alleen sterren.</span>
        </span>
        <textarea className="text-box" rows={6} value={text} maxLength={MEDIA_LIMITS.review} onChange={(e) => setText(e.target.value)} placeholder={`Vertel anderen wat je van dit ${MEDIA_KINDS[item.kind].one} vond…`} />
      </label>

      <div className={toShelf ? 'md-shelf-option on' : 'md-shelf-option'}>
        <label className="gadget-toggle">
          <input type="checkbox" checked={toShelf} disabled={item.shelf?.full && !item.shelf.onShelf} onChange={(e) => setToShelf(e.target.checked)} />
          <span>
            {item.shelf?.onShelf ? `Ook bijwerken in mijn ${name}` : `Ook in mijn ${name} zetten`}
            <small className="muted">
              {item.shelf?.full && !item.shelf.onShelf
                ? `Je ${name} is vol: haal er eerst iets uit.`
                : item.shelf?.gadgetId
                  ? 'Met je sterren en dit stukje uit je recensie.'
                  : `Je hebt nog geen ${name}: die komt er dan bij op je profiel.`}
            </small>
          </span>
        </label>
        {toShelf && (
          <label className="field md-snippet">
            <span>
              Stukje voor in je kast <span className="hint">{snippet.length}/{MEDIA_LIMITS.snippet}</span>
            </span>
            <textarea className="text-box" rows={2} value={snippet} maxLength={MEDIA_LIMITS.snippet} onChange={(e) => setOwnSnippet(e.target.value)} placeholder="Wat bezoekers zien als ze erop klikken" />
            {ownSnippet !== null && (
              <button type="button" className="link-button md-snippet-reset" onClick={() => setOwnSnippet(null)}>
                Weer het begin van mijn recensie gebruiken
              </button>
            )}
          </label>
        )}
      </div>

      <div className="account-actions">
        <Button type="submit" variant="cta" disabled={!rating || save.isPending || shelf.isPending}>
          <FarmIcon name="accept" /> {item.mine ? 'Recensie bijwerken' : 'Recensie plaatsen'}
        </Button>
        {!rating && <span className="muted">Geef eerst sterren.</span>}
      </div>
      {(save.isError || shelf.isError) && <p className="form-error">{errorMessage(save.error ?? shelf.error)}</p>}
    </form>
  )
}

/** Straight in your kast, without writing a review (or with the one you wrote). */
function QuickShelf({ item, me }: { item: MediaItem; me: Me }) {
  const shelf = useShelf(item.id, me.username)
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(item.mine?.rating ?? 0)
  const [note, setNote] = useState(item.mine ? reviewSnippet(item.mine.text) : '')
  const [done, setDone] = useState<string | null>(null)
  const name = shelfName(item)
  const state = item.shelf

  if (state?.onShelf)
    return (
      <div className="md-quick">
        <span className="md-on-shelf">
          <FarmIcon name="accept" /> Staat in je {name}
        </span>
        <button
          type="button"
          className="link-button"
          disabled={shelf.isPending}
          onClick={() => shelf.mutate(null, { onSuccess: () => setDone(null) })}
        >
          Eruit halen
        </button>
        {done && <ShelfDone me={me} message={done} />}
        {shelf.isError && <p className="form-error">{errorMessage(shelf.error)}</p>}
      </div>
    )
  if (!open)
    return (
      <div className="md-quick">
        <Button onClick={() => setOpen(true)} disabled={state?.full}>
          <FarmIcon name="add" /> In mijn {name}
        </Button>
        {state?.full && <span className="muted">Je {name} is vol.</span>}
      </div>
    )
  return (
    <form
      className="md-quick-form"
      onSubmit={(e) => {
        e.preventDefault()
        shelf.mutate(
          { rating, note: note.trim() },
          {
            onSuccess: (r) => {
              setOpen(false)
              setDone(r.created ? `Je nieuwe ${r.shelf} staat op je profiel.` : `In je ${r.shelf} gezet.`)
            },
          },
        )
      }}
    >
      <b>In je {name}</b>
      <div className="md-form-stars">
        <span>Sterren:</span>
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <label className="field">
        <span>
          Wat je ervan vond <span className="hint">Mag leeg.</span>
        </span>
        <textarea className="text-box" rows={2} value={note} maxLength={MEDIA_LIMITS.snippet} onChange={(e) => setNote(e.target.value)} />
      </label>
      {!state?.gadgetId && <p className="muted">Je hebt nog geen {name}: die komt er dan bij op je profiel.</p>}
      <div className="account-actions">
        <Button type="submit" variant="cta" disabled={shelf.isPending}>
          <FarmIcon name="accept" /> In de kast
        </Button>
        <Button onClick={() => setOpen(false)}>Annuleren</Button>
      </div>
      {shelf.isError && <p className="form-error">{errorMessage(shelf.error)}</p>}
    </form>
  )
}

function Reviews({ item }: { item: MediaItem }) {
  const [sort, setSort] = useState<'beste' | 'nieuwste'>('beste')
  const [page, setPage] = useState(1)
  const featuredId = Number(useSearchParams()[0].get('recensie')) || null
  const { data } = useReviews(item.id, sort, page, featuredId)
  return (
    <Box title={`Recensies (${item.reviews})`} icon="comments">
      {item.reviews > 1 && (
        <div className="ct-pills md-review-sort" role="group" aria-label="Sorteren">
          {(
            [
              ['beste', 'Meeste respect'],
              ['nieuwste', 'Nieuwste'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={sort === key ? 'current' : undefined}
              aria-pressed={sort === key}
              onClick={() => {
                setSort(key)
                setPage(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {data?.featured && page === 1 && (
        <div className="md-featured">
          <span className="md-featured-label">Gedeelde recensie</span>
          <ReviewView review={data.featured} itemId={item.id} href={mediaHref(item)} title={item.title} />
        </div>
      )}
      {!data ? (
        <p className="muted">Laden…</p>
      ) : data.reviews.length === 0 && !data.featured ? (
        <p className="empty">Nog geen recensies. Schrijf jij de eerste?</p>
      ) : (
        <div className="md-reviews">
          {data.reviews.map((r) => (
            <ReviewView key={r.id} review={r} itemId={item.id} href={mediaHref(item)} title={item.title} />
          ))}
        </div>
      )}
      {data && data.pages > 1 && (
        <nav className="ct-pager" aria-label="Pagina's">
          <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹ Vorige
          </button>
          <span className="muted">
            {data.page} van {data.pages}
          </span>
          <button type="button" className="btn" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Volgende ›
          </button>
        </nav>
      )}
    </Box>
  )
}

function ItemView({ item }: { item: MediaItem }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const remove = useDeleteItem()
  const removeReview = useSaveReview(item.id)
  const [editing, setEditing] = useState(!item.mine)
  const [saved, setSaved] = useState<string | null>(null)
  const kind = MEDIA_KINDS[item.kind]
  const meta = metaLine(item)
  const most = Math.max(1, ...item.spread)
  const { data: more } = useMediaList({ kind: item.kind, q: '', sort: 'meeste', page: 1, limit: 7 })
  const others = (more?.items ?? []).filter((m) => m.id !== item.id).slice(0, 6)

  return (
    <main className="page page-con md-page">
      <nav className="rc-crumbs">
        <Link to="/recensies">Recensies</Link> ›{' '}
        <Link to={`/recensies?soort=${item.kind}`}>
          <FarmIcon name={kindIcon(item.kind)} /> {kind.name}
        </Link>
      </nav>

      <article className="box md-top">
        {item.photoUrl ? (
          <div className="md-top-cover with-photo">
            <img className="md-top-photo" src={item.photoUrl} alt={`Foto van ${item.title}`} />
            <span className="md-shelf-version" title="Zo staat het in de kasten op profielen">
              <MediaCover item={item} size={0.9} />
              <small>In de kast</small>
            </span>
          </div>
        ) : (
          <div className="md-top-cover">
            <MediaCover item={item} size={2.1} />
          </div>
        )}
        <div className="md-top-text">
          <KindLabel kind={item.kind} />
          <h1>{item.title}</h1>
          {item.creator && (
            <p className="md-creator">
              <span className="muted">{kind.creator}:</span> {item.creator}
            </p>
          )}
          {meta && <p className="muted md-meta">{meta}</p>}
          <p className="md-meta">
            <ShareWithFriends path={mediaHref(item)} className="link-button share-link" />
          </p>

          <div className="md-score">
            {item.reviews ? (
              <>
                <span className="md-score-big">{ratingText(item.rating)}</span>
                <span>
                  <Stars rating={Math.round(item.rating * 2) / 2} />
                  <span className="muted">
                    {item.reviews} {item.reviews === 1 ? 'recensie' : 'recensies'}
                  </span>
                </span>
                <ul className="md-spread" aria-label="Verdeling van de sterren">
                  {[5, 4, 3, 2, 1].map((n) => (
                    <li key={n}>
                      <span>{n}★</span>
                      <span className="md-bar">
                        <span style={{ width: `${(item.spread[n - 1] / most) * 100}%` }} />
                      </span>
                      <span className="muted">{item.spread[n - 1]}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="muted">Nog geen sterren. Wees de eerste!</span>
            )}
          </div>

          {item.description && <p className="md-description">{withSmileys(item.description)}</p>}

          {user && <QuickShelf item={item} me={user} />}
          <p className="muted md-small">
            {item.onShelves > 0 && (
              <>
                <FarmIcon name="user" /> In de kast bij {item.onShelves} {item.onShelves === 1 ? 'lid' : 'leden'}.{' '}
              </>
            )}
            {item.addedBy ? (
              <>
                Toegevoegd door <Link to={`/profiel/${item.addedBy.username}`}>{item.addedBy.nickname}</Link>.
              </>
            ) : (
              'Uit de collectie van Kuddes.'
            )}{' '}
            {item.canEdit && (
              <>
                <Link to={`/recensies/${item.id}/bewerken`}>Aanpassen</Link>
                {' · '}
                <button
                  type="button"
                  className="link-button"
                  disabled={remove.isPending}
                  onClick={() => confirm(`"${item.title}" uit de collectie halen? De recensies gaan ook weg.`) && remove.mutate(item.id, { onSuccess: () => navigate(`/recensies?soort=${item.kind}`) })}
                >
                  Weghalen
                </button>
              </>
            )}
          </p>
          {remove.isError && <p className="form-error">{errorMessage(remove.error)}</p>}
        </div>
      </article>

      <div className="md-columns">
        <div>
          <Box title={item.mine ? 'Jouw recensie' : 'Schrijf een recensie'} icon="pencil">
            {!user ? (
              <p>
                <Link to={`/inloggen?next=${encodeURIComponent(mediaHref(item))}`}>Log in</Link> om sterren te geven en een recensie te schrijven.
              </p>
            ) : !user.emailVerified ? (
              <p className="muted">Zodra je account is goedgekeurd, kun je recensies schrijven.</p>
            ) : editing || !item.mine ? (
              <ReviewForm
                item={item}
                me={user}
                onDone={(message) => {
                  setSaved(message)
                  setEditing(false)
                }}
              />
            ) : (
              <>
                <ReviewView review={item.mine} itemId={item.id} href={mediaHref(item)} title={item.title} />
                {saved && <ShelfDone me={user} message={saved} />}
                <div className="account-actions">
                  <Button
                    onClick={() => {
                      setSaved(null)
                      setEditing(true)
                    }}
                  >
                    <FarmIcon name="pencil" /> Bewerken
                  </Button>
                  <Button disabled={removeReview.isPending} onClick={() => confirm('Je recensie weghalen? In je kast blijft hij staan.') && removeReview.mutate(null, { onSuccess: () => setEditing(true) })}>
                    Weghalen
                  </Button>
                </div>
              </>
            )}
          </Box>
          <Reviews item={item} />
        </div>

        {others.length > 0 && (
          <aside className="box md-more">
            <h2>Meer {kind.name.toLowerCase()}</h2>
            <ul className="md-grid small">
              {others.map((m) => (
                <MediaCard key={m.id} item={m} />
              ))}
            </ul>
          </aside>
        )}
      </div>
    </main>
  )
}
