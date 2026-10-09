import { Link } from 'react-router-dom'
import { RECIPE_CATEGORIES, isRecipeCategory, type RecipeCategory } from '../../../shared/recipes'
import { CatalogEmpty, CatalogHero, CatalogLayout, CatalogMain, CategoryBar, Chip, Pager, SideFilters, SideList, SidePlace, SortTabs } from '../../components/catalog/Catalog'
import { useCatalogParams } from '../../components/catalog/useCatalogParams'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { RecipeCard } from '../../features/recipes/RecipeCard'
import { categoryIcon, useRecipes, type RecipeFilter } from '../../features/recipes/recipeQueries'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/recipes/Recipes.css'

const CATEGORY_KEYS = Object.keys(RECIPE_CATEGORIES) as RecipeCategory[]

/** /recepten: everyone's recipes, by category, searchable (also on ingredients). */
export function RecipesPage() {
  usePageTitle('Recepten - Kuddes')
  const { user } = useAuth()
  const { params, update, page } = useCatalogParams()
  const rawCategory = params.get('categorie')
  const category = isRecipeCategory(rawCategory) ? rawCategory : null
  const rawFilter = params.get('filter')
  const filter: RecipeFilter = user && (rawFilter === 'mijn' || rawFilter === 'favorieten') ? rawFilter : 'alles'
  const by = params.get('van') ?? undefined
  const q = params.get('q') ?? ''
  const sort = params.get('sort') === 'populair' ? 'populair' : 'nieuwste'
  const { data, isLoading, isError, error, isPlaceholderData } = useRecipes({ category, filter, q, sort, page, by })

  const where = by ? `Van ${data?.items[0]?.user.nickname ?? by}` : filter === 'mijn' ? 'Mijn recepten' : filter === 'favorieten' ? 'Mijn favorieten' : null
  const addTo = user ? '/recepten/nieuw' : '/inloggen?next=/recepten/nieuw'

  return (
    <main className="page page-con ct-page rc-page">
      <CatalogHero
        title="Recepten"
        intro="Wat eten we vandaag? Kook mee met de recepten van andere Kuddes-leden, of deel je eigen specialiteit."
        q={q}
        placeholder="Zoek op gerecht of ingrediënt, bijv. 'kip'"
        label="Zoek recepten"
        onSearch={(v) => update({ q: v || null })}
      />

      <CategoryBar
        label="Soorten gerechten"
        current={category}
        onPick={(c) => update({ categorie: c })}
        items={[
          { key: null, name: 'Alles', hint: 'alle gerechten', icon: 'chefs_hat', count: data?.counts.alles },
          ...CATEGORY_KEYS.map((c) => ({ key: c, name: RECIPE_CATEGORIES[c].name, hint: RECIPE_CATEGORIES[c].hint, icon: categoryIcon(c), count: data?.counts[c] })),
        ]}
      />

      <CatalogLayout
        side={
          <>
            {user ? (
              <SideFilters
                title="Jouw kookboek"
                value={by ? null : filter}
                onChange={(f) => update({ filter: f === 'alles' ? null : f, van: null })}
                options={[
                  ['alles', 'Alle recepten', 'book_open'],
                  ['favorieten', 'Mijn favorieten', 'heart'],
                  ['mijn', 'Mijn recepten', 'user'],
                ]}
              />
            ) : (
              <section className="box ct-mine">
                <h2>Jouw kookboek</h2>
                <p className="muted">
                  <Link to="/inloggen?next=/recepten">Log in</Link> om recepten te bewaren als favoriet en je eigen recepten te delen.
                </p>
              </section>
            )}
            <SidePlace
              icon="chefs_hat"
              title="Zelf een recept delen"
              action={
                <Link to={addTo} className="btn btn-cta">
                  <FarmIcon name="add" /> Recept plaatsen
                </Link>
              }
            >
              Met foto&apos;s, ingrediënten en stap voor stap uitgelegd.
            </SidePlace>
            <SideList
              title="Handig om te weten"
              items={[
                ['heart', <>Klik op <b>Lekker?</b> om een recept bij je favorieten te zetten</>],
                ['magnifier', <>Zoek ook op <b>ingrediënt</b>: wat heb je nog in huis?</>],
                ['fire', <><b>Lekkerste</b> laat zien wat anderen het vaakst lekker vinden</>],
              ]}
            />
          </>
        }
      >
        <CatalogMain
          icon={category ? categoryIcon(category) : undefined}
          title={category ? RECIPE_CATEGORIES[category].name : (where ?? 'Alle recepten')}
          sub={
            <>
              {data ? `${data.total} ${data.total === 1 ? 'recept' : 'recepten'}` : ' '}
              {category && where && ` · ${where.toLowerCase()}`}
            </>
          }
          sort={
            <SortTabs
              value={sort}
              onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })}
              options={[
                ['nieuwste', 'Nieuwste', 'flag_new'],
                ['populair', 'Lekkerste', 'heart'],
              ]}
            />
          }
          chips={
            (q || category || where) && (
              <>
                {where && <Chip icon={by ? 'user' : filter === 'mijn' ? 'user' : 'heart'} label={where} onRemove={() => update({ filter: null, van: null })} />}
                {category && <Chip icon={categoryIcon(category)} label={RECIPE_CATEGORIES[category].name} onRemove={() => update({ categorie: null })} />}
                {q && <Chip icon="magnifier" label={`"${q}"`} onRemove={() => update({ q: null })} />}
              </>
            )
          }
        >
          {isLoading ? (
            <p className="muted ct-empty">Laden…</p>
          ) : isError ? (
            <p className="form-error ct-empty">{errorMessage(error)}</p>
          ) : data!.items.length === 0 ? (
            <CatalogEmpty icon={category ? categoryIcon(category) : 'chefs_hat'}>
              <p>
                {filter === 'favorieten'
                  ? 'Nog geen favorieten. Klik op "Lekker?" bij een recept om het hier terug te vinden.'
                  : q
                    ? `Geen recepten gevonden voor "${q}".`
                    : category
                      ? `Er staan nog geen recepten in ${RECIPE_CATEGORIES[category].name}.`
                      : 'Hier staan nog geen recepten.'}
              </p>
              {filter !== 'favorieten' && !q && (
                <Link to={addTo} className="btn btn-cta">
                  <FarmIcon name="add" /> Deel jij de eerste?
                </Link>
              )}
            </CatalogEmpty>
          ) : (
            <ul className={isPlaceholderData ? 'rc-grid loading' : 'rc-grid'}>
              {data!.items.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </ul>
          )}
          {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ pagina: String(p) }, true)} />}
        </CatalogMain>
      </CatalogLayout>
    </main>
  )
}
