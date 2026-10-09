import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Gadget, Me } from '../../shared/api'
import { GADGET_CATEGORIES, GADGET_TYPES, LIMITS, type GadgetCategory, type GadgetType } from '../../shared/gadgets'
import { RequireAuth } from '../components/layout/RequireAuth'
import { CatalogEmpty, CatalogHero, CatalogLayout, CatalogMain, CategoryBar, Chip, SideFilters, SideList, SidePlace, SortTabs } from '../components/catalog/Catalog'
import { FarmIcon } from '../components/ui/FarmIcon'
import { CATEGORY_BAR, CATEGORY_ICONS, CATEGORY_KEYS, GADGET_KINDS, findGadgets, usePopularGadgets } from '../features/gadgets/gadgetCatalog'
import { GadgetDialog } from '../features/gadgets/GadgetEditor'
import { GadgetCard, GadgetMeter, MyGadgets } from '../features/gadgets/GadgetMarket'
import { useGadgetActions } from '../features/gadgets/useGadgetActions'
import { KuddeGadgetMarket } from '../features/kuddes/KuddeGadgetMarket'
import { KUDDE_GADGET_KINDS } from '../features/kuddes/kuddeGadgetIcons'
import { errorMessage } from '../lib/api'
import { useGadgets } from '../lib/queries'
import { usePageTitle } from '../lib/usePageTitle'

const isCategory = (c: string | null): c is GadgetCategory => !!c && c in GADGET_CATEGORIES

export function GadgetMarketPage() {
  usePageTitle('Gadgetmarkt - Kuddes')
  return <RequireAuth>{(user) => <Market key={user.username} user={user} />}</RequireAuth>
}

function Market({ user }: { user: Me }) {
  const [params, setParams] = useSearchParams()
  const mine = params.get('tab') === 'mijn'
  const rawCategory = params.get('categorie')
  const category = isCategory(rawCategory) ? rawCategory : null
  // The gadgets for a Kudde you run: a category of its own
  const forKuddes = !mine && rawCategory === 'kuddes'
  const sort = params.get('sort') === 'az' ? 'az' : 'populair'
  const [query, setQuery] = useState(params.get('q') ?? '')
  const { data: gadgets = [] } = useGadgets(user.username)
  const { data: popular } = usePopularGadgets()
  const { create } = useGadgetActions(user.username)
  const [editing, setEditing] = useState<number | null>(null)
  const [added, setAdded] = useState<Gadget | null>(null)
  const full = gadgets.length >= LIMITS.gadgets

  const set = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [k, v] of Object.entries(changes)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        return next
      },
      { replace: true },
    )

  const found = findGadgets(query, category)
  const shown =
    sort === 'az'
      ? [...found].sort((a, b) => GADGET_TYPES[a].name.localeCompare(GADGET_TYPES[b].name, 'nl'))
      : [...found].sort((a, b) => (popular?.[b] ?? 0) - (popular?.[a] ?? 0))
  const countIn = (c: GadgetCategory) => GADGET_KINDS.filter((t) => GADGET_TYPES[t].category === c).length
  const add = (type: GadgetType) =>
    create.mutate(type, {
      onSuccess: (g) => {
        setAdded(g)
        setEditing(g.id)
      },
    })
  const editingGadget = gadgets.find((g) => g.id === editing)

  const placeLabel = `${gadgets.length} van ${LIMITS.gadgets}`
  return (
    <main className="page page-con ct-page gmk-page">
      <CatalogHero
        title="Gadgetmarkt"
        intro="Maak je profiel helemaal van jou: kasten vol boeken en films, je eigen radio, een poll voor je bezoekers en nog veel meer. Alles is gratis!"
        q={query}
        placeholder="Zoek een gadget, bijv. 'radio'"
        label="Zoek een gadget"
        live
        onSearch={(v) => {
          setQuery(v)
          set({ q: v || null, tab: null })
        }}
      />

      <CategoryBar
        label="Soorten gadgets"
        current={mine ? null : forKuddes ? 'kuddes' : category}
        onPick={(c) => set({ categorie: c, tab: null })}
        items={[
          { key: null, name: 'Alles', hint: 'alle gadgets', icon: 'application_view_tile', count: GADGET_KINDS.length },
          ...CATEGORY_KEYS.map((c) => ({ key: c, ...CATEGORY_BAR[c], icon: CATEGORY_ICONS[c], count: countIn(c) })),
          { key: 'kuddes', name: 'Voor Kuddes', hint: 'voor je groep', icon: 'tag_blue', count: KUDDE_GADGET_KINDS.length },
        ]}
      />

      {added && (
        <div className="gmk-added" role="status">
          <FarmIcon name="accept" />
          <span>
            <b>{added.title}</b> staat nu onderaan de rechterkolom van je profiel.
          </span>
          <Link to={`/profiel/${user.username}`}>Bekijk je profiel</Link>
          <Link to={`/profiel/${user.username}?indeling=1`}>Verplaatsen</Link>
          <button type="button" className="icon-button" aria-label="Sluiten" onClick={() => setAdded(null)}>
            ×
          </button>
        </div>
      )}

      <CatalogLayout
        side={
          <>
            <SideFilters
              title="Jouw gadgets"
              value={mine ? 'mijn' : 'alles'}
              onChange={(f) => set({ tab: f === 'mijn' ? 'mijn' : null })}
              options={[
                ['alles', 'Alle gadgets', 'cart', GADGET_KINDS.length],
                ['mijn', 'Mijn gadgets', 'plugin', gadgets.length],
              ]}
            />
            <SidePlace
              icon="user"
              title="Je profiel"
              action={
                <Link to={`/profiel/${user.username}?indeling=1`} className="btn">
                  <FarmIcon name="layout_edit" /> Indeling aanpassen
                </Link>
              }
            >
              <GadgetMeter count={gadgets.length} />
            </SidePlace>
            <SideList
              title="Zo werkt het"
              items={[
                ['add', <>Een nieuwe gadget komt <b>onderaan</b> de rechterkolom van je profiel</>],
                ['layout_edit', <>Met <b>Indeling aanpassen</b> zet je hem waar je wilt</>],
                ['pencil', <>Vul hem bij <b>Mijn gadgets</b> met <b>Bewerken</b></>],
              ]}
            />
          </>
        }
      >
        {mine ? (
          <CatalogMain icon="plugin" title="Mijn gadgets" sub={`${placeLabel} plekken gebruikt`}>
            <div className="gmk-mine-wrap">
              <MyGadgets user={user} gadgets={gadgets} onShop={() => set({ tab: null })} />
            </div>
          </CatalogMain>
        ) : forKuddes ? (
          <KuddeGadgetMarket query={query} />
        ) : (
          <CatalogMain
            icon={category ? CATEGORY_ICONS[category] : undefined}
            title={category ? GADGET_CATEGORIES[category] : 'Alle gadgets'}
            sub={`${found.length} ${found.length === 1 ? 'gadget' : 'gadgets'}`}
            sort={
              <SortTabs
                value={sort}
                onChange={(s) => set({ sort: s === 'populair' ? null : s })}
                options={[
                  ['populair', 'Populair', 'fire'],
                  ['az', 'A tot Z', 'text_list_bullets'],
                ]}
              />
            }
            chips={
              (category || query) && (
                <>
                  {category && <Chip icon={CATEGORY_ICONS[category]} label={GADGET_CATEGORIES[category]} onRemove={() => set({ categorie: null })} />}
                  {query && (
                    <Chip
                      icon="magnifier"
                      label={`"${query}"`}
                      onRemove={() => {
                        setQuery('')
                        set({ q: null })
                      }}
                    />
                  )}
                </>
              )
            }
          >
            {full && (
              <p className="gmk-full">
                <FarmIcon name="information" /> Je hebt het maximum van {LIMITS.gadgets} gadgets. Haal er eerst een weg bij{' '}
                <button type="button" className="link-button" onClick={() => set({ tab: 'mijn' })}>
                  Mijn gadgets
                </button>
                .
              </p>
            )}
            {create.isError && <p className="form-error">{errorMessage(create.error)}</p>}

            {shown.length ? (
              <ul className="gmk-grid">
                {shown.map((type) => (
                  <GadgetCard
                    key={type}
                    type={type}
                    owned={gadgets.filter((g) => g.type === type).length}
                    members={popular ? (popular[type] ?? 0) : undefined}
                    full={full}
                    busy={create.isPending}
                    onAdd={() => add(type)}
                  />
                ))}
              </ul>
            ) : (
              <CatalogEmpty icon="plugin">
                <p>Geen gadget gevonden{query && ` voor "${query}"`}.</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setQuery('')
                    set({ q: null, categorie: null })
                  }}
                >
                  Alles tonen
                </button>
              </CatalogEmpty>
            )}
          </CatalogMain>
        )}
      </CatalogLayout>

      {editingGadget && <GadgetDialog gadget={editingGadget} username={user.username} onClose={() => setEditing(null)} />}
    </main>
  )
}
