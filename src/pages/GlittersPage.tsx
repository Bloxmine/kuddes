import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GLITTER_CATEGORIES, isGlitterCategory, type Glitter, type GlitterCategory } from '../../shared/glitters'
import { CatalogEmpty, CatalogHero, CatalogLayout, CatalogMain, CategoryBar, Chip, Pager, SideFilters, SideList, SidePlace, SortTabs } from '../components/catalog/Catalog'
import { useCatalogParams } from '../components/catalog/useCatalogParams'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { GlitterTags, GlitterUpload } from '../features/glitters/GlitterUpload'
import { useCollect, useDeleteGlitter, useGlitters, type GlitterFilter } from '../features/glitters/glitterQueries'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/glitters/Glitters.css'

const CATEGORY_KEYS = Object.keys(GLITTER_CATEGORIES) as GlitterCategory[]
const catIcon = (c: GlitterCategory) => GLITTER_CATEGORIES[c].icon as FarmIconName

/**
 * Glitterplaatjes: the categories as a bar of big icons along the top, the
 * plaatjes below it, and on the right what's yours (your collection and
 * uploads), placing one yourself, and where you can use them.
 */
export function GlittersPage() {
  usePageTitle('Glitterplaatjes - Kuddes')
  const { user } = useAuth()
  const { params, update, page } = useCatalogParams()
  const rawCategory = params.get('categorie')
  const category = isGlitterCategory(rawCategory) ? rawCategory : null
  const rawFilter = params.get('filter')
  const filter: GlitterFilter = user && (rawFilter === 'mijn' || rawFilter === 'verzameling') ? rawFilter : 'alles'
  const q = params.get('q') ?? ''
  const sort = params.get('sort') === 'populair' ? 'populair' : 'nieuwste'
  const [uploading, setUploading] = useState(false)
  const { data, isLoading, isError, error, isPlaceholderData } = useGlitters({ category, filter, q, sort, page })

  const where = filter === 'mijn' ? 'Mijn uploads' : filter === 'verzameling' ? 'Mijn verzameling' : null
  const upload = () => setUploading(true)
  const placeButton = user ? (
    <Button variant="cta" onClick={upload}>
      Plaats glitterplaatje
    </Button>
  ) : (
    <Link to="/inloggen?next=/glitterplaatjes" className="btn btn-cta">
      Plaats glitterplaatje
    </Link>
  )

  return (
    <main className="page page-con ct-page gl-page">
      <CatalogHero
        title="Glitterplaatjes"
        intro="Kies een categorie, verzamel wat je mooi vindt en stuur het mee met een knuffel of een bericht."
        q={q}
        placeholder="Zoek een plaatje, bijv. 'hartje' of 'kerst'"
        label="Zoek glitterplaatjes"
        onSearch={(v) => update({ q: v || null })}
      />

      <CategoryBar
        label="Categorieën"
        current={category}
        onPick={(c) => update({ categorie: c })}
        items={[
          { key: null, name: 'Alles', hint: 'alle categorieën', icon: 'images', count: data?.counts.alles },
          ...CATEGORY_KEYS.map((c) => ({ key: c, ...GLITTER_CATEGORIES[c], icon: catIcon(c), count: data?.counts[c] })),
        ]}
      />

      <CatalogLayout
        side={
          <>
            {user ? (
              <SideFilters
                title="Jouw plaatjes"
                value={filter}
                onChange={(f) => update({ filter: f === 'alles' ? null : f })}
                options={[
                  ['alles', 'Alle plaatjes', 'images'],
                  ['verzameling', 'Mijn verzameling', 'heart'],
                  ['mijn', 'Mijn uploads', 'user'],
                ]}
              />
            ) : (
              <section className="box ct-mine">
                <h2>Jouw plaatjes</h2>
                <p className="muted">
                  <Link to="/inloggen?next=/glitterplaatjes">Log in</Link> om plaatjes te verzamelen in je eigen album en ze te versturen.
                </p>
              </section>
            )}
            <SidePlace icon="picture_add" title="Zelf een plaatje plaatsen" action={placeButton}>
              Een GIF, PNG of WebP tot 4 MB. Het komt meteen in je verzameling.
            </SidePlace>
            <SideList
              title="Waar gebruik je ze?"
              items={[
                ['teddy_bear', <>Mee met een <b>knuffel</b></>],
                ['msn_messenger', <>In een gesprek in <b>Messenger</b></>],
                ['photo_album', <>In je <b>Glitterplakboek</b> op je profiel</>],
                ['note_pin', <>Op het <b>prikbord</b> van een Kudde</>],
                ['comments', <>In een bericht op het <b>forum</b></>],
              ]}
            />
          </>
        }
      >
        <CatalogMain
          icon={category ? catIcon(category) : undefined}
          title={category ? GLITTER_CATEGORIES[category].name : (where ?? 'Alle glitterplaatjes')}
          sub={
            <>
              {data ? `${data.total} ${data.total === 1 ? 'plaatje' : 'plaatjes'}` : ' '}
              {category && where && ` in ${where.toLowerCase()}`}
            </>
          }
          sort={
            <SortTabs
              value={sort}
              onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })}
              options={[
                ['nieuwste', 'Nieuwste', 'flag_new'],
                ['populair', 'Meest verstuurd', 'fire'],
              ]}
            />
          }
          chips={
            (q || category || where) && (
              <>
                {where && <Chip icon={filter === 'mijn' ? 'user' : 'heart'} label={where} onRemove={() => update({ filter: null })} />}
                {category && <Chip icon={catIcon(category)} label={GLITTER_CATEGORIES[category].name} onRemove={() => update({ categorie: null })} />}
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
            <Empty filter={filter} q={q} category={category} onUpload={user ? upload : null} />
          ) : (
            <ul className={isPlaceholderData ? 'gl-grid loading' : 'gl-grid'}>
              {data!.items.map((g) => (
                <GlitterCard key={g.id} glitter={g} loggedIn={!!user} current={category} onCategory={(c) => update({ categorie: c })} />
              ))}
            </ul>
          )}
          {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ pagina: String(p) }, true)} />}
        </CatalogMain>
      </CatalogLayout>
      {uploading && <GlitterUpload initialCategory={category} onClose={() => setUploading(false)} />}
    </main>
  )
}

function Empty({ filter, q, category, onUpload }: { filter: GlitterFilter; q: string; category: GlitterCategory | null; onUpload: (() => void) | null }) {
  const text =
    filter === 'verzameling'
      ? 'Je verzameling is nog leeg. Klik op het hartje bij een plaatje dat je leuk vindt.'
      : filter === 'mijn'
        ? 'Je hebt hier nog niets geplaatst.'
        : q
          ? `Geen plaatjes gevonden voor "${q}".`
          : category
            ? `Er staan nog geen plaatjes in ${GLITTER_CATEGORIES[category].name}.`
            : 'Hier staan nog geen plaatjes.'
  return (
    <CatalogEmpty icon={category ? catIcon(category) : 'images'}>
      <p>{text}</p>
      {onUpload && filter !== 'verzameling' && !q && (
        <Button variant="cta" onClick={onUpload}>
          <FarmIcon name="picture_add" /> Plaats jij de eerste?
        </Button>
      )}
    </CatalogEmpty>
  )
}

function GlitterCard({ glitter: g, loggedIn, current, onCategory }: { glitter: Glitter; loggedIn: boolean; current: GlitterCategory | null; onCategory: (c: GlitterCategory) => void }) {
  const collect = useCollect()
  const remove = useDeleteGlitter()
  const [editing, setEditing] = useState(false)
  // The category you're looking at goes without saying; show the others
  const tags = g.categories.filter((c) => c !== current)
  const heart = g.collected ? 'Uit je verzameling halen' : 'Verzamel'
  return (
    <li className="gl-card">
      <div className="gl-img">
        <img src={g.url} alt={g.title} width={g.width} height={g.height} loading="lazy" />
        {loggedIn ? (
          <button
            type="button"
            className={g.collected ? 'gl-heart on' : 'gl-heart'}
            aria-pressed={g.collected}
            aria-label={heart}
            title={heart}
            disabled={collect.isPending}
            onClick={() => collect.mutate({ id: g.id, collect: !g.collected })}
          >
            <FarmIcon name={g.collected ? 'heart' : 'heart_add'} />
          </button>
        ) : (
          <Link to="/inloggen?next=/glitterplaatjes" className="gl-heart" aria-label="Log in om te verzamelen" title="Log in om te verzamelen">
            <FarmIcon name="heart_add" />
          </Link>
        )}
        {g.canDelete && (
          <button type="button" className="gl-delete" title="Verwijderen" aria-label={`${g.title} verwijderen`} onClick={() => confirm(`"${g.title}" verwijderen? Het verdwijnt ook uit knuffels waarin het verstuurd is.`) && remove.mutate(g.id)}>
            <FarmIcon name="bin" />
          </button>
        )}
        {g.canDelete && (
          <button type="button" className="gl-delete gl-edit-tags" title="Categorieën aanpassen" aria-label={`Categorieën van ${g.title} aanpassen`} onClick={() => setEditing(true)}>
            <FarmIcon name="tag_blue" />
          </button>
        )}
      </div>
      <div className="gl-info">
        <b className="gl-name" title={g.title}>
          {g.title}
        </b>
        <div className="gl-by">
          <Avatar user={g.user} size="tiny" />
          <Link to={`/profiel/${g.user.username}`}>{g.user.nickname}</Link>
          <span className="gl-uses-n" title={`${g.uses} keer verstuurd`}>
            <FarmIcon name="paper_airplane" /> {g.uses}
          </span>
        </div>
        {tags.length > 0 && (
          <div className="gl-tags">
            {tags.map((c) => (
              <button key={c} type="button" className="gl-tag" onClick={() => onCategory(c)} title={`Meer uit ${GLITTER_CATEGORIES[c].name}`}>
                <FarmIcon name={catIcon(c)} /> {GLITTER_CATEGORIES[c].name}
              </button>
            ))}
          </div>
        )}
      </div>
      {editing && <GlitterTags glitter={g} onClose={() => setEditing(false)} />}
    </li>
  )
}
