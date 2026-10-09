import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { RECIPE_CATEGORIES, RECIPE_LEVELS, formatMinutes, recipeHref, type Recipe } from '../../../shared/recipes'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { RecipeCard } from '../../features/recipes/RecipeCard'
import { ImageLightbox } from '../../components/ui/ImageLightbox'
import { categoryIcon, useDeleteRecipe, useLike, useRecipe, useRecipes } from '../../features/recipes/recipeQueries'
import { scaleIngredient } from '../../features/recipes/scale'
import { ApiRequestError, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { withSmileys } from '../../lib/smileys'
import { usePageTitle } from '../../lib/usePageTitle'
import { formatLongDate } from '../../lib/time'
import '../../features/recipes/Recipes.css'
import { ShareWithFriends } from '../../features/share/ShareWithFriends'

/** /recepten/12-hutspot: the recipe, to cook from (or print). */
export function RecipePage() {
  const id = Number.parseInt(useParams().recipe ?? '', 10)
  const { data: recipe, isLoading, error } = useRecipe(id)
  usePageTitle(recipe ? `${recipe.title} - Recepten - Kuddes` : 'Recepten - Kuddes')

  if (isLoading) return <main className="page page-con muted">Laden…</main>
  if (!recipe) {
    const missing = error instanceof ApiRequestError && error.status === 404
    return (
      <main className="page page-con">
        <div className="box box-con">
          <p className="empty">{missing ? 'Dit recept bestaat niet (meer).' : errorMessage(error)}</p>
          <Link to="/recepten">« Alle recepten</Link>
        </div>
      </main>
    )
  }
  return <RecipeView key={recipe.id} recipe={recipe} />
}

function RecipeView({ recipe: r }: { recipe: Recipe }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const like = useLike(r.id)
  const remove = useDeleteRecipe()
  const [servings, setServings] = useState(r.servings)
  const [done, setDone] = useState<Set<number>>(() => new Set())
  const [big, setBig] = useState<{ src: string; alt: string } | null>(null)
  const factor = servings / r.servings
  const { data: more } = useRecipes({ category: null, filter: 'alles', q: '', sort: 'populair', page: 1, by: r.user.username, limit: 5 })
  const others = (more?.items ?? []).filter((x) => x.id !== r.id).slice(0, 4)
  const toggle = (i: number) =>
    setDone((d) => {
      const next = new Set(d)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // An old link with a different slug goes to the right one
  const { recipe: slugParam } = useParams()
  if (slugParam !== `${r.id}-${r.slug}`) return <Navigate to={recipeHref(r)} replace />

  return (
    <main className="page page-con rc-page">
      <nav className="rc-crumbs">
        <Link to="/recepten">Recepten</Link> ›{' '}
        <Link to={`/recepten?categorie=${r.category}`}>
          <FarmIcon name={categoryIcon(r.category)} /> {RECIPE_CATEGORIES[r.category].name}
        </Link>
      </nav>

      <article className="rc-sheet">
        <header className="rc-top">
          <div className="rc-photo">
            {r.photoUrl ? (
              <button type="button" className="rc-zoom" onClick={() => setBig({ src: r.photoUrl!, alt: r.title })} title="Groter bekijken">
                <img src={r.photoUrl} alt={r.title} />
              </button>
            ) : (
              <FarmIcon name={categoryIcon(r.category)} size={32} />
            )}
          </div>
          <div className="rc-intro">
            <h1>{r.title}</h1>
            <div className="rc-author">
              <Avatar user={r.user} size="tiny" />
              <span>
                Een recept van <Link to={`/profiel/${r.user.username}`}>{r.user.nickname}</Link> · {formatLongDate(r.createdAt)}
              </span>
            </div>
            <ul className="rc-facts">
              <li>
                <FarmIcon name="clock" /> <b>{formatMinutes(r.minutes)}</b>
              </li>
              <li>
                <FarmIcon name="group" /> <b>{r.servings}</b> {r.servings === 1 ? 'persoon' : 'personen'}
              </li>
              <li>
                <FarmIcon name="chart_bar" /> {RECIPE_LEVELS[r.level]}
              </li>
            </ul>
            {r.intro && <p className="rc-text">{withSmileys(r.intro)}</p>}
            <div className="rc-actions">
              {user ? (
                <Button variant={r.liked ? 'default' : 'cta'} disabled={like.isPending} onClick={() => like.mutate(!r.liked)} aria-pressed={r.liked}>
                  <FarmIcon name={r.liked ? 'heart' : 'heart_add'} /> {r.liked ? 'Lekker!' : 'Lekker?'} <span className="rc-count">{r.likes}</span>
                </Button>
              ) : (
                <Link to={`/inloggen?next=${encodeURIComponent(recipeHref(r))}`} className="btn btn-cta">
                  <FarmIcon name="heart_add" /> Lekker? <span className="rc-count">{r.likes}</span>
                </Link>
              )}
              <ShareButton recipe={r} />
              <ShareWithFriends path={recipeHref(r)} />
              <Button onClick={() => window.print()}>
                <FarmIcon name="page_white_put" /> Printen
              </Button>
              {r.canEdit && (
                <>
                  <Link to={`/recepten/${r.id}/bewerken`} className="btn">
                    <FarmIcon name="pencil" /> Bewerken
                  </Link>
                  <Button
                    disabled={remove.isPending}
                    onClick={() => confirm(`"${r.title}" verwijderen? Dit kan niet ongedaan worden gemaakt.`) && remove.mutate(r.id, { onSuccess: () => navigate('/recepten?filter=mijn') })}
                  >
                    <FarmIcon name="bin" /> Verwijderen
                  </Button>
                </>
              )}
            </div>
            {(like.isError || remove.isError) && <p className="form-error">{errorMessage(like.error ?? remove.error)}</p>}
          </div>
        </header>

        <div className="rc-body">
          <section className="rc-ingredients" aria-labelledby="rc-ingr">
            <h2 id="rc-ingr">Ingrediënten</h2>
            <div className="rc-servings">
              <span>Voor</span>
              <button type="button" onClick={() => setServings((s) => Math.max(1, s - 1))} disabled={servings <= 1} aria-label="Minder personen">
                −
              </button>
              <b aria-live="polite">{servings}</b>
              <button type="button" onClick={() => setServings((s) => Math.min(99, s + 1))} aria-label="Meer personen">
                +
              </button>
              <span>{servings === 1 ? 'persoon' : 'personen'}</span>
            </div>
            <ul>
              {r.ingredients.map((line, i) => (
                <li key={i} className={done.has(i) ? 'done' : undefined}>
                  <label>
                    <input type="checkbox" checked={done.has(i)} onChange={() => toggle(i)} />
                    <span>{scaleIngredient(line, factor)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {factor !== 1 && <p className="muted rc-note">Omgerekend van {r.servings} naar {servings}: kijk even of het klopt.</p>}
          </section>

          <section className="rc-steps" aria-labelledby="rc-steps">
            <h2 id="rc-steps">Zo maak je het</h2>
            <ol>
              {r.steps.map((s, i) => (
                <li key={i}>
                  <span className="rc-step-no" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    {s.text && <p className="rc-text">{withSmileys(s.text)}</p>}
                    {s.photoUrl && (
                      <button type="button" className="rc-zoom" onClick={() => setBig({ src: s.photoUrl!, alt: `Stap ${i + 1}` })} title="Groter bekijken">
                        <img className="rc-step-photo" src={s.photoUrl} alt={`Stap ${i + 1}`} loading="lazy" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {r.tips && (
              <aside className="rc-tips">
                <h3>
                  <FarmIcon name="lightbulb" /> Tips
                </h3>
                <p className="rc-text">{withSmileys(r.tips)}</p>
              </aside>
            )}
            <p className="rc-enjoy">Eet smakelijk!</p>
          </section>
        </div>
      </article>
      {big && <ImageLightbox src={big.src} alt={big.alt} caption={big.alt} onClose={() => setBig(null)} />}

      {others.length > 0 && (
        <Box title={`Meer van ${r.user.nickname}`} icon="cutlery" className="rc-more" noPadding actions={<Link to={`/recepten?van=${r.user.username}`}>Alle recepten »</Link>}>
          <ul className="rc-grid">
            {others.map((x) => (
              <RecipeCard key={x.id} recipe={x} />
            ))}
          </ul>
        </Box>
      )}
    </main>
  )
}

/** The phone's own share sheet, or copy the link. */
function ShareButton({ recipe }: { recipe: Recipe }) {
  const [copied, setCopied] = useState(false)
  const url = `${location.origin}${recipeHref(recipe)}`
  return (
    <Button
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: recipe.title, text: `${recipe.title} - een recept op Kuddes`, url })
            return
          } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return
          }
        }
        try {
          await navigator.clipboard.writeText(url)
        } catch {
          prompt('Kopieer de link:', url)
        }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
    >
      <FarmIcon name={copied ? 'accept' : 'link'} /> {copied ? 'Link gekopieerd!' : 'Delen'}
    </Button>
  )
}
