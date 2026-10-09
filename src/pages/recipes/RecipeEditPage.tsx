import { useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { RECIPE_CATEGORIES, RECIPE_LEVELS, RECIPE_LIMITS, recipeHref, type Recipe, type RecipeCategory, type RecipeInput, type RecipeLevel } from '../../../shared/recipes'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { uploadRecipePhoto, useRecipe, useSaveRecipe } from '../../features/recipes/recipeQueries'
import { ApiRequestError, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/recipes/Recipes.css'

/** A photo in the editor: the upload path to save, and a URL to show it. */
type PhotoValue = { path: string; url: string } | null
type Draft = Omit<RecipeInput, 'photo' | 'steps' | 'ingredients'> & { photo: PhotoValue; ingredients: string; steps: { key: string; text: string; photo: PhotoValue }[] }

const newKey = () => Math.random().toString(36).slice(2, 10)
const blankStep = () => ({ key: newKey(), text: '', photo: null })

function toDraft(r: Recipe | null): Draft {
  if (!r) return { title: '', intro: '', category: 'hoofdgerecht', level: 'makkelijk', minutes: 30, servings: 4, photo: null, ingredients: '', steps: [blankStep(), blankStep()], tips: '' }
  return {
    title: r.title,
    intro: r.intro,
    category: r.category,
    level: r.level,
    minutes: r.minutes,
    servings: r.servings,
    photo: r.photo && r.photoUrl ? { path: r.photo, url: r.photoUrl } : null,
    ingredients: r.ingredients.join('\n'),
    steps: r.steps.map((s) => ({ key: newKey(), text: s.text, photo: s.photo && s.photoUrl ? { path: s.photo, url: s.photoUrl } : null })),
    tips: r.tips,
  }
}

/** /recepten/nieuw and /recepten/12/bewerken */
export function RecipeEditPage() {
  const { user, isLoading: authLoading } = useAuth()
  const param = useParams().id
  const id = param ? Number(param) : null
  const { data: recipe, isLoading, error } = useRecipe(id ?? 0)
  usePageTitle(id ? 'Recept bewerken - Kuddes' : 'Nieuw recept - Kuddes')
  if (authLoading) return <main className="page page-con muted">Laden…</main>
  if (!user) return <Navigate to={`/inloggen?next=${encodeURIComponent(location.pathname)}`} replace />
  if (id && isLoading) return <main className="page page-con muted">Laden…</main>
  if (id && !recipe) {
    return (
      <main className="page page-con">
        <p className="empty">{error instanceof ApiRequestError && error.status === 404 ? 'Dit recept bestaat niet (meer).' : errorMessage(error)}</p>
      </main>
    )
  }
  if (recipe && !recipe.canEdit) return <Navigate to={recipeHref(recipe)} replace />
  return <RecipeForm key={recipe?.id ?? 'nieuw'} recipe={recipe ?? null} />
}

/** Pick a photo; it's uploaded right away and shown. */
function PhotoPicker({ value, onChange, label, big }: { value: PhotoValue; onChange: (p: PhotoValue) => void; label: string; big?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className={big ? 'rc-photo-pick big' : 'rc-photo-pick'}>
      <button type="button" className="rc-photo-drop" onClick={() => input.current?.click()} disabled={busy} aria-label={value ? `${label} vervangen` : label}>
        {value ? (
          <img src={value.url} alt="" />
        ) : (
          <span>
            <FarmIcon name="camera" size={big ? 32 : 16} /> {busy ? 'Uploaden…' : label}
          </span>
        )}
        {value && busy && <span className="rc-photo-busy">Uploaden…</span>}
      </button>
      {value && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          Foto weghalen
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          setError(null)
          try {
            onChange(await uploadRecipePhoto(file))
          } catch (err) {
            setError(errorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      />
      {error && <span className="form-error">{error}</span>}
    </div>
  )
}

function RecipeForm({ recipe }: { recipe: Recipe | null }) {
  const navigate = useNavigate()
  const save = useSaveRecipe(recipe?.id ?? null)
  const [d, setD] = useState<Draft>(() => toDraft(recipe))
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((x) => ({ ...x, [key]: value }))
  const setStep = (i: number, changes: Partial<Draft['steps'][number]>) => set('steps', d.steps.map((s, j) => (j === i ? { ...s, ...changes } : s)))
  const moveStep = (i: number, dir: number) => {
    const next = [...d.steps]
    const [s] = next.splice(i, 1)
    next.splice(i + dir, 0, s)
    set('steps', next)
  }
  const fieldError = save.error instanceof ApiRequestError ? save.error.fields : undefined

  const submit = () =>
    save.mutate(
      {
        title: d.title,
        intro: d.intro,
        category: d.category,
        level: d.level,
        minutes: Number(d.minutes) || 0,
        servings: Number(d.servings) || 0,
        photo: d.photo?.path ?? null,
        ingredients: d.ingredients.split('\n').map((l) => l.trim()).filter(Boolean),
        steps: d.steps.map((s) => ({ text: s.text, photo: s.photo?.path ?? null })),
        tips: d.tips,
      },
      { onSuccess: (r) => navigate(recipeHref(r)) },
    )

  return (
    <main className="page page-con rc-page">
      <nav className="rc-crumbs">
        <Link to="/recepten">Recepten</Link> › {recipe ? <Link to={recipeHref(recipe)}>{recipe.title}</Link> : 'Nieuw recept'}
      </nav>
      <form
        className="rc-edit"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Box title={recipe ? 'Recept bewerken' : 'Deel je recept'} icon="cutlery">
          <div className="rc-edit-top">
            <PhotoPicker big value={d.photo} onChange={(p) => set('photo', p)} label="Foto van het gerecht" />
            <div className="settings-grid">
              <div className="full">
                <Field label="Naam van het gerecht" error={fieldError?.title}>
                  <input className="text-box" value={d.title} maxLength={RECIPE_LIMITS.title} onChange={(e) => set('title', e.target.value)} placeholder="Oma's appeltaart" required />
                </Field>
              </div>
              <Field label="Soort gerecht">
                <select className="text-box" value={d.category} onChange={(e) => set('category', e.target.value as RecipeCategory)}>
                  {(Object.keys(RECIPE_CATEGORIES) as RecipeCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {RECIPE_CATEGORIES[c].name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Moeilijkheid">
                <select className="text-box" value={d.level} onChange={(e) => set('level', e.target.value as RecipeLevel)}>
                  {(Object.keys(RECIPE_LEVELS) as RecipeLevel[]).map((l) => (
                    <option key={l} value={l}>
                      {RECIPE_LEVELS[l]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tijd" hint="(minuten)" error={fieldError?.minutes}>
                <input className="text-box" type="number" min={1} max={RECIPE_LIMITS.minutes} value={d.minutes} onChange={(e) => set('minutes', e.target.valueAsNumber)} />
              </Field>
              <Field label="Voor" hint="(personen)" error={fieldError?.servings}>
                <input className="text-box" type="number" min={1} max={RECIPE_LIMITS.servings} value={d.servings} onChange={(e) => set('servings', e.target.valueAsNumber)} />
              </Field>
              <div className="full">
                <Field label="Vertel er iets over" hint="(waar komt het vandaan, waarom is het zo lekker?)" error={fieldError?.intro}>
                  <textarea className="text-box" rows={3} value={d.intro} maxLength={RECIPE_LIMITS.intro} onChange={(e) => set('intro', e.target.value)} />
                </Field>
              </div>
            </div>
          </div>
        </Box>

        <div className="rc-edit-cols">
          <Box title="Ingrediënten" icon="cheese">
            <Field label="Eén ingrediënt per regel" hint="(zet de hoeveelheid vooraan, dan kan het omgerekend worden)" error={fieldError?.ingredients}>
              <textarea className="text-box rc-ingr-input" rows={12} value={d.ingredients} onChange={(e) => set('ingredients', e.target.value)} placeholder={'250 g bloem\n150 g roomboter\n1 ei\n4 zure appels\n1 tl kaneel\nsnufje zout'} />
            </Field>
          </Box>

          <Box title="Bereiding" icon="page_white_edit">
            <ol className="rc-edit-steps">
              {d.steps.map((s, i) => (
                <li key={s.key}>
                  <span className="rc-step-no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="rc-edit-step">
                    <textarea className="text-box" rows={3} value={s.text} maxLength={RECIPE_LIMITS.step} onChange={(e) => setStep(i, { text: e.target.value })} aria-label={`Stap ${i + 1}`} placeholder={i === 0 ? 'Verwarm de oven voor op 180 °C…' : 'En dan…'} />
                    <div className="rc-edit-step-tools">
                      <PhotoPicker value={s.photo} onChange={(p) => setStep(i, { photo: p })} label="Foto bij deze stap" />
                      <span>
                        <button type="button" className="icon-button" title="Omhoog" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                          <FarmIcon name="arrow_up" />
                        </button>
                        <button type="button" className="icon-button" title="Omlaag" disabled={i === d.steps.length - 1} onClick={() => moveStep(i, 1)}>
                          <FarmIcon name="arrow_down" />
                        </button>
                        <button type="button" className="icon-button" title="Stap weghalen" disabled={d.steps.length <= 1} onClick={() => set('steps', d.steps.filter((_, j) => j !== i))}>
                          <FarmIcon name="bin" />
                        </button>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {d.steps.length < RECIPE_LIMITS.steps && (
              <Button onClick={() => set('steps', [...d.steps, blankStep()])}>
                <FarmIcon name="add" /> Stap toevoegen
              </Button>
            )}
            {fieldError?.steps && <p className="form-error">{fieldError.steps}</p>}
            <Field label="Tips" hint="(optioneel: variaties, bewaren, wat erbij past)">
              <textarea className="text-box" rows={3} value={d.tips} maxLength={RECIPE_LIMITS.tips} onChange={(e) => set('tips', e.target.value)} />
            </Field>
          </Box>
        </div>

        <div className="account-actions rc-edit-save">
          <Button variant="cta" type="submit" disabled={save.isPending}>
            <FarmIcon name="accept" /> {recipe ? 'Opslaan' : 'Recept delen'}
          </Button>
          <Link to={recipe ? recipeHref(recipe) : '/recepten'}>Annuleren</Link>
          {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
        {!recipe && <p className="muted">Je recept komt ook op je tijdlijn, zodat je vrienden het zien.</p>}
      </form>
    </main>
  )
}
