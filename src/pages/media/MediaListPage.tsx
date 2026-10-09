import { Link } from 'react-router-dom'
import { MEDIA_KINDS, MEDIA_KIND_KEYS, MEDIA_SORTS, isMediaKind, type MediaSort } from '../../../shared/media'
import { CatalogEmpty, CatalogHero, CatalogLayout, CatalogMain, CategoryBar, Chip, Pager, SideFilters, SidePlace, SortTabs } from '../../components/catalog/Catalog'
import { useCatalogParams } from '../../components/catalog/useCatalogParams'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { kindIcon } from '../../features/media/mediaFormat'
import { MediaCard, RecentReviewItem } from '../../features/media/MediaParts'
import { useMediaList, useRecentReviews } from '../../features/media/mediaQueries'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { usePageTitle } from '../../lib/usePageTitle'
import '../../features/gadgets/ShelfGadgets.css'
import '../../features/gadgets/DrinkSeriesGadgets.css'
import '../../features/media/Media.css'

const SORT_ICONS: Record<MediaSort, FarmIconName> = { nieuwste: 'time', beste: 'star', meeste: 'comments', alfabet: 'text_list_bullets' }

/** /recensies: the whole collection, by kind, searchable, with the latest reviews. */
export function MediaListPage() {
  usePageTitle('Recensies - Kuddes')
  const { user } = useAuth()
  const { params, update, page } = useCatalogParams()
  const rawKind = params.get('soort')
  const kind = isMediaKind(rawKind) ? rawKind : null
  const q = params.get('q') ?? ''
  const rawSort = params.get('sort') ?? ''
  const sort: MediaSort = rawSort in MEDIA_SORTS ? (rawSort as MediaSort) : 'nieuwste'
  const by = params.get('van') ?? undefined
  const { data, isLoading, isError, error, isPlaceholderData } = useMediaList({ kind, q, sort, page, by })
  const { data: recent } = useRecentReviews(kind)

  const addTo = `/recensies/nieuw${kind ? `?soort=${kind}` : ''}`
  const addLink = user ? addTo : `/inloggen?next=${encodeURIComponent(addTo)}`
  const mine = !!user && by === user.username
  const where = mine ? 'Door mij beoordeeld' : by ? `Beoordeeld door ${by}` : null

  return (
    <main className="page page-con ct-page md-page">
      <CatalogHero
        title="Recensies"
        intro="Boeken, films, series, muziek, spellen en drankjes, beoordeeld door Kuddes-leden. Geef sterren en zet het meteen in de kast op je profiel."
        q={q}
        placeholder="Zoek op titel, maker of genre"
        label="Zoek in de collectie"
        onSearch={(v) => update({ q: v || null })}
      />

      <CategoryBar
        label="Soorten"
        current={kind}
        onPick={(k) => update({ soort: k })}
        items={[
          { key: null, name: 'Alles', hint: 'de hele collectie', icon: 'star', count: data?.counts.alles },
          ...MEDIA_KIND_KEYS.map((k) => ({ key: k, name: MEDIA_KINDS[k].name, hint: MEDIA_KINDS[k].hint, icon: kindIcon(k), count: data?.counts[k] })),
        ]}
      />

      <CatalogLayout
        side={
          <>
            {user && (
              <SideFilters
                title="Jouw recensies"
                value={mine ? 'mijn' : by ? null : 'alles'}
                onChange={(f) => update({ van: f === 'mijn' ? user.username : null })}
                options={[
                  ['alles', 'De hele collectie', 'star'],
                  ['mijn', 'Door mij beoordeeld', 'user'],
                ]}
              />
            )}
            <SidePlace
              icon="bookshelf"
              title="Staat het er nog niet bij?"
              action={
                <Link to={addLink} className="btn btn-cta">
                  <FarmIcon name="add" /> Iets toevoegen
                </Link>
              }
            >
              Voeg {kind ? `een ${MEDIA_KINDS[kind].one}` : 'iets'} toe aan de collectie en schrijf er als eerste over.
            </SidePlace>
            {!!recent?.length && (
              <section className="box md-recent-box">
                <h2>Nieuwste recensies</h2>
                <ul>
                  {recent.map((r) => (
                    <RecentReviewItem key={r.id} review={r} />
                  ))}
                </ul>
              </section>
            )}
          </>
        }
      >
        <CatalogMain
          icon={kind ? kindIcon(kind) : undefined}
          title={kind ? MEDIA_KINDS[kind].name : (where ?? 'De hele collectie')}
          sub={
            <>
              {data ? `${data.total} ${data.total === 1 ? 'titel' : 'titels'}` : ' '}
              {kind && where && ` · ${where.toLowerCase()}`}
            </>
          }
          sort={<SortTabs value={sort} onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })} options={(Object.keys(MEDIA_SORTS) as MediaSort[]).map((s) => [s, MEDIA_SORTS[s], SORT_ICONS[s]])} />}
          chips={
            (q || kind || where) && (
              <>
                {where && <Chip icon="user" label={where} onRemove={() => update({ van: null })} />}
                {kind && <Chip icon={kindIcon(kind)} label={MEDIA_KINDS[kind].name} onRemove={() => update({ soort: null })} />}
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
            <CatalogEmpty icon={kind ? kindIcon(kind) : 'star'}>
              <p>{q ? `Niets gevonden voor "${q}".` : 'Hier staat nog niets.'}</p>
              <Link to={addLink} className="btn btn-cta">
                <FarmIcon name="add" /> Voeg het toe aan de collectie
              </Link>
            </CatalogEmpty>
          ) : (
            <ul className={isPlaceholderData ? 'md-grid loading' : 'md-grid'}>
              {data!.items.map((m) => (
                <MediaCard key={m.id} item={m} />
              ))}
            </ul>
          )}
          {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ pagina: String(p) }, true)} />}
        </CatalogMain>
      </CatalogLayout>
    </main>
  )
}
