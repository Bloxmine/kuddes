import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { COVER_COLORS, COVER_STYLE_NAMES, COVER_STYLES, DRINK_KINDS, GAME_PLATFORMS, SERIES_PLATFORMS, type CoverColor, type CoverStyle, type DrinkKind, type GamePlatform, type SeriesPlatform } from '../../../shared/gadgets'
import { MEDIA_KINDS, MEDIA_KIND_KEYS, MEDIA_LIMITS, isMediaKind, mediaHref, type MediaInput, type MediaItem, type MediaKind } from '../../../shared/media'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { kindIcon } from '../../features/media/mediaFormat'
import { MediaCover } from '../../features/media/MediaCover'
import { IconPicker } from '../../components/ui/IconPicker'
import { uploadMediaPhoto, useMediaItem, useMediaList, useSaveItem } from '../../features/media/mediaQueries'
import { ApiRequestError, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../components/catalog/Catalog.css'
import '../../features/gadgets/ShelfGadgets.css'
import '../../features/gadgets/DrinkSeriesGadgets.css'
import '../../features/media/Media.css'

const COLORS = Object.keys(COVER_COLORS) as CoverColor[]
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

const blank = (kind: MediaKind): MediaInput => ({ kind, title: '', creator: '', year: '', genre: '', description: '', color: pick(COLORS), style: pick(COVER_STYLES), details: {}, photo: null })
const toInput = (m: MediaItem): MediaInput => ({ kind: m.kind, title: m.title, creator: m.creator, year: m.year, genre: m.genre, description: m.description, color: m.color, style: m.style, details: m.details, photo: m.photo })

/** A photo: upload it, see it, take it away again. */
function PhotoPicker({ url, onChange }: { url: string | null; onChange: (photo: { path: string; url: string } | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      onChange(await uploadMediaPhoto(file))
    } catch (e) {
      setProblem(errorMessage(e))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="md-photo-pick">
      {url && <img src={url} alt="De foto" />}
      <div className="account-actions">
        <Button onClick={() => input.current?.click()} disabled={busy}>
          <FarmIcon name="picture_add" /> {busy ? 'Uploaden…' : url ? 'Andere foto' : 'Foto uploaden'}
        </Button>
        {url && (
          <button type="button" className="link-button" onClick={() => onChange(null)}>
            Foto weghalen
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      {problem && <p className="form-error">{problem}</p>}
    </div>
  )
}

/** /recensies/nieuw and /recensies/12/bewerken */
export function MediaEditPage() {
  const { user, isLoading: authLoading } = useAuth()
  const param = useParams().id
  const id = param ? Number(param) : null
  const { data: item, isLoading, error } = useMediaItem(id ?? 0)
  usePageTitle(id ? 'Aanpassen - Recensies - Kuddes' : 'Toevoegen - Recensies - Kuddes')
  if (authLoading) return <main className="page page-con muted">Laden…</main>
  if (!user) return <Navigate to={`/inloggen?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (id && isLoading) return <main className="page page-con muted">Laden…</main>
  if (id && !item) {
    return (
      <main className="page page-con">
        <p className="empty">{error instanceof ApiRequestError && error.status === 404 ? 'Dit staat (nog) niet in de collectie.' : errorMessage(error)}</p>
        <Link to="/recensies">« Naar Recensies</Link>
      </main>
    )
  }
  if (item && !item.canEdit) return <Navigate to={mediaHref(item)} replace />
  if (!user.emailVerified)
    return (
      <main className="page page-con">
        <p className="empty">Zodra je account is goedgekeurd, kun je iets aan de collectie toevoegen.</p>
      </main>
    )
  return <Editor key={item?.id ?? 'nieuw'} item={item ?? null} />
}

/** Maybe it's there already: the titles that look like it. */
function LookAlikes({ kind, title }: { kind: MediaKind; title: string }) {
  const q = title.trim()
  const { data } = useMediaList({ kind, q, sort: 'meeste', page: 1, limit: 5 }, q.length >= 3)
  if (q.length < 3 || !data?.items.length) return null
  return (
    <div className="form-notice md-lookalikes">
      <b>Staat het er al tussen?</b> Schrijf dan daar je recensie:
      <ul>
        {data.items.map((m) => (
          <li key={m.id}>
            <Link to={mediaHref(m)}>
              {m.title}
              {m.creator && <span className="muted"> – {m.creator}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Editor({ item }: { item: MediaItem | null }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const startKind = params.get('soort')
  const [draft, setDraft] = useState<MediaInput>(() => (item ? toInput(item) : blank(isMediaKind(startKind) ? startKind : 'boeken')))
  const [photoUrl, setPhotoUrl] = useState<string | null>(item?.photoUrl ?? null)
  const save = useSaveItem(item?.id ?? null)
  const set = (patch: Partial<MediaInput>) => setDraft((d) => ({ ...d, ...patch }))
  const setDetails = (patch: MediaInput['details']) => setDraft((d) => ({ ...d, details: { ...d.details, ...patch } }))
  const kind = MEDIA_KINDS[draft.kind]
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  const existing = save.error instanceof ApiRequestError && save.error.code?.startsWith('bestaat:') ? save.error.code.slice(8) : null

  return (
    <main className="page page-con md-page">
      <nav className="rc-crumbs">
        <Link to="/recensies">Recensies</Link> › {item ? <Link to={mediaHref(item)}>{item.title}</Link> : 'Toevoegen'}
      </nav>
      <div className="md-edit">
        <Box title={item ? 'Aanpassen' : 'Iets toevoegen aan de collectie'} icon={item ? 'pencil' : 'add'}>
          <form
            className="md-edit-form"
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate(draft, { onSuccess: (saved) => navigate(mediaHref(saved)) })
            }}
          >
            {!item && (
              <div className="field">
                <span>Wat is het?</span>
                <div className="ct-pills md-kind-pick" role="radiogroup" aria-label="Soort">
                  {MEDIA_KIND_KEYS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={draft.kind === k} className={draft.kind === k ? 'current' : undefined} onClick={() => set({ kind: k, details: draft.details.icon ? { icon: draft.details.icon } : {} })}>
                      <FarmIcon name={kindIcon(k)} /> {MEDIA_KINDS[k].one.replace(/^./, (c) => c.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <Field label="Titel" error={fields.title}>
              <input className="text-box" value={draft.title} maxLength={MEDIA_LIMITS.title} required onChange={(e) => set({ title: e.target.value })} />
            </Field>
            {!item && <LookAlikes kind={draft.kind} title={draft.title} />}
            <div className="md-edit-row">
              <Field label={kind.creator} hint="(mag leeg)" error={fields.creator}>
                <input className="text-box" value={draft.creator} maxLength={MEDIA_LIMITS.creator} onChange={(e) => set({ creator: e.target.value })} />
              </Field>
              <Field label={draft.kind === 'drank' ? 'Jaargang' : 'Jaar'} hint="(mag leeg)" error={fields.year}>
                <input className="text-box" inputMode="numeric" value={draft.year} maxLength={4} placeholder="bijv. 2004" onChange={(e) => set({ year: e.target.value.replace(/\D/g, '') })} />
              </Field>
              <Field label="Genre" hint="(mag leeg)" error={fields.genre}>
                <input className="text-box" value={draft.genre} maxLength={MEDIA_LIMITS.genre} placeholder={draft.kind === 'drank' ? 'bijv. Tripel' : 'bijv. Fantasy'} onChange={(e) => set({ genre: e.target.value })} />
              </Field>
            </div>

            {draft.kind === 'spellen' && (
              <Field label="Platform">
                <select className="text-box" value={draft.details.gamePlatform ?? 'pc'} onChange={(e) => setDetails({ gamePlatform: e.target.value as GamePlatform })}>
                  {(Object.keys(GAME_PLATFORMS) as GamePlatform[]).map((p) => (
                    <option key={p} value={p}>
                      {GAME_PLATFORMS[p]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {draft.kind === 'series' && (
              <div className="md-edit-row">
                <Field label="Aantal seizoenen">
                  <input className="text-box" type="number" min={1} max={50} value={draft.details.seasons ?? 1} onChange={(e) => setDetails({ seasons: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} />
                </Field>
                <Field label="Te zien op">
                  <select className="text-box" value={draft.details.seriesPlatform ?? 'anders'} onChange={(e) => setDetails({ seriesPlatform: e.target.value as SeriesPlatform })}>
                    {(Object.keys(SERIES_PLATFORMS) as SeriesPlatform[]).map((p) => (
                      <option key={p} value={p}>
                        {SERIES_PLATFORMS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {draft.kind === 'muziek' && (
              <Field label="Uitgebracht op">
                <select className="text-box" value={draft.details.format ?? 'cd'} onChange={(e) => setDetails({ format: e.target.value as 'cd' | 'lp' })}>
                  <option value="cd">Cd</option>
                  <option value="lp">Lp (vinyl)</option>
                </select>
              </Field>
            )}
            {draft.kind === 'drank' && (
              <Field label="Soort drankje">
                <select className="text-box" value={draft.details.drinkKind ?? 'speciaal'} onChange={(e) => setDetails({ drinkKind: e.target.value as DrinkKind })}>
                  {(Object.keys(DRINK_KINDS) as DrinkKind[]).map((k) => (
                    <option key={k} value={k}>
                      {DRINK_KINDS[k]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Waar gaat het over?" hint="(zonder spoilers!)" error={fields.description}>
              <textarea className="text-box" rows={4} value={draft.description} maxLength={MEDIA_LIMITS.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>

            <fieldset className="md-edit-section">
              <legend>
                <FarmIcon name="images" /> Foto <span className="hint">(mag leeg)</span>
              </legend>
              <p className="muted">Een echte foto, van de voorkant, de hoes of de fles. Die staat bovenaan de pagina en in de collectie.</p>
              <PhotoPicker
                url={photoUrl}
                onChange={(photo) => {
                  set({ photo: photo?.path ?? null })
                  setPhotoUrl(photo?.url ?? null)
                }}
              />
            </fieldset>

            <fieldset className="md-edit-section">
              <legend>
                <FarmIcon name="book" /> Voorkant voor in de kast
              </legend>
              <p className="muted">
                Altijd nodig: zo staat het in de kast op het profiel van iedereen die het erin zet. De kasten tekenen hun eigen voorkanten, ook als er een foto is.
              </p>
              <div className="md-edit-row">
                <div className="field">
                  <span>Kleur</span>
                  <div className="md-swatches" role="radiogroup" aria-label="Kleur van de voorkant">
                    {COLORS.map((c) => (
                      <button key={c} type="button" role="radio" title={c} aria-label={c} aria-checked={draft.color === c} aria-pressed={draft.color === c} style={{ background: `linear-gradient(135deg, ${COVER_COLORS[c][0]} 60%, ${COVER_COLORS[c][1]} 60%)` }} onClick={() => set({ color: c })} />
                    ))}
                  </div>
                </div>
                <Field label="Ontwerp">
                  <select className="text-box" value={draft.style} onChange={(e) => set({ style: e.target.value as CoverStyle })}>
                    {COVER_STYLES.map((s) => (
                      <option key={s} value={s}>
                        {COVER_STYLE_NAMES[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="field">
                  <span>Pictogram</span>
                  <IconPicker value={draft.details.icon ?? null} onChange={(icon) => setDetails({ icon: icon ?? undefined })} allowNone label="Pictogram op de voorkant" />
                </div>
              </div>
            </fieldset>

            <div className="account-actions">
              <Button type="submit" variant="cta" disabled={save.isPending || !draft.title.trim()}>
                <FarmIcon name="accept" /> {item ? 'Opslaan' : 'Toevoegen'}
              </Button>
              <Link to={item ? mediaHref(item) : '/recensies'}>Annuleren</Link>
            </div>
            {save.isError &&
              (existing ? (
                <p className="form-error">
                  Dit staat al in de collectie: <Link to={`/recensies/${existing}`}>schrijf daar je recensie</Link>.
                </p>
              ) : (
                <p className="form-error">{errorMessage(save.error)}</p>
              ))}
          </form>
        </Box>

        <aside className="box md-preview" aria-label="Voorbeeld">
          <h2>Zo ziet het eruit</h2>
          {photoUrl && (
            <>
              <h3>Foto</h3>
              <img className="md-preview-photo" src={photoUrl} alt="" />
            </>
          )}
          <h3>In de kast</h3>
          <div className="md-preview-cover">
            <MediaCover item={{ ...draft, title: draft.title || 'Titel' }} size={2} />
          </div>
          <p className="muted">Deze voorkant staat in de kast op het profiel van iedereen die het erin zet.</p>
        </aside>
      </div>
    </main>
  )
}
