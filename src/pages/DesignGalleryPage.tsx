import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SharedDesign } from '../../shared/api'
import { SHARED_DESIGN_TEXT_MAX } from '../../shared/customization'
import { CatalogEmpty, CatalogHero, CatalogLayout, CatalogMain, CategoryBar, Chip, Pager, SideFilters, SideList, SidePlace, SortTabs } from '../components/catalog/Catalog'
import { useCatalogParams } from '../components/catalog/useCatalogParams'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { Modal } from '../components/ui/Modal'
import { DesignMini, ThemeMini } from '../features/account/LookMinis'
import { useGalleryActions, useSharedDesigns, useTakeDesign, type DesignKind, type DesignSort } from '../features/designs/designQueries'
import { ShareDesignDialog } from '../features/designs/ShareDesignDialog'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import '../features/account/ThemeStudio.css'
import '../components/social/SocialBar.css'
import '../features/designs/DesignGallery.css'

const KINDS: Record<DesignKind, { name: string; one: string; hint: string; icon: FarmIconName }> = {
  thema: { name: "Site-thema's", one: 'Site-thema', hint: 'voor heel Kuddes', icon: 'color_wheel' },
  design: { name: 'Profieldesigns', one: 'Profieldesign', hint: 'voor je profiel', icon: 'vcard' },
}
const isKind = (k: string | null): k is DesignKind => k === 'thema' || k === 'design'

/**
 * The Designgalerij: site themes and profile designs that members share. Use
 * one straight away, keep a copy to change yourself, or give it respect; and
 * share your own from Mijn thema's / Mijn designs.
 */
export function DesignGalleryPage() {
  usePageTitle('Designgalerij - Kuddes')
  const { user } = useAuth()
  const { params, update, page } = useCatalogParams()
  const rawKind = params.get('soort')
  const kind = isKind(rawKind) ? rawKind : null
  const mine = !!user && params.get('filter') === 'mijn'
  const q = params.get('q') ?? ''
  const rawSort = params.get('sort')
  const sort: DesignSort = rawSort === 'populair' || rawSort === 'gebruikt' ? rawSort : 'nieuwste'
  const [sharing, setSharing] = useState(false)
  const { data, isLoading, isError, error, isPlaceholderData } = useSharedDesigns({ kind, mine, q, sort, page })

  const shareButton = user ? (
    <Button variant="cta" onClick={() => setSharing(true)}>
      <FarmIcon name="add" /> Deel een design
    </Button>
  ) : (
    <Link to="/inloggen?next=/designs" className="btn btn-cta">
      Deel een design
    </Link>
  )

  return (
    <main className="page page-con ct-page dg-page">
      <CatalogHero
        title="Designgalerij"
        intro="Thema's voor de hele site en designs voor je profiel, gemaakt door leden. Gebruik er een, pas hem aan, of deel je eigen."
        q={q}
        placeholder="Zoek op naam, beschrijving of maker"
        label="Zoek designs"
        onSearch={(v) => update({ q: v || null })}
      />

      <CategoryBar
        label="Soort"
        current={kind}
        onPick={(k) => update({ soort: k })}
        items={[
          { key: null, name: 'Alles', hint: 'thema’s en designs', icon: 'palette', count: data?.counts.alles },
          ...(Object.keys(KINDS) as DesignKind[]).map((k) => ({ key: k, name: KINDS[k].name, hint: KINDS[k].hint, icon: KINDS[k].icon, count: data?.counts[k] })),
        ]}
      />

      <CatalogLayout
        side={
          <>
            {user && (
              <SideFilters
                title="Jouw designs"
                value={mine ? 'mijn' : 'alles'}
                onChange={(f) => update({ filter: f === 'alles' ? null : f })}
                options={[
                  ['alles', 'De hele galerij', 'palette'],
                  ['mijn', 'Wat ik deel', 'user'],
                ]}
              />
            )}
            <SidePlace icon="paintbrush" title="Deel jouw design" action={shareButton}>
              Kies een thema of design uit je eigen bibliotheek. Een achtergrondfoto gaat niet mee: die blijft van jou.
            </SidePlace>
            <SideList
              title="Zo werkt het"
              items={[
                ['tick', <><b>Gebruiken</b> zet het meteen op je profiel (een design) of op de hele site (een thema)</>],
                ['diskette', <><b>Bewaren</b> zet een kopie bij Mijn designs of Mijn thema’s, om zelf aan te passen</>],
                ['group', <>Voor een <b>Kudde</b>: bewaar het en kies het bij het pimpen van je Kudde</>],
                ['star', <>Mooi? Geef de maker <b>respect</b></>],
              ]}
            />
          </>
        }
      >
        <CatalogMain
          icon={kind ? KINDS[kind].icon : undefined}
          title={kind ? KINDS[kind].name : mine ? 'Wat ik deel' : 'Alle designs'}
          sub={data ? `${data.total} ${data.total === 1 ? 'design' : 'designs'}` : ' '}
          sort={
            <SortTabs
              value={sort}
              onChange={(s) => update({ sort: s === 'nieuwste' ? null : s })}
              options={[
                ['nieuwste', 'Nieuwste', 'flag_new'],
                ['populair', 'Meeste respect', 'star'],
                ['gebruikt', 'Meest gebruikt', 'fire'],
              ]}
            />
          }
          chips={
            (q || kind || mine) && (
              <>
                {mine && <Chip icon="user" label="Wat ik deel" onRemove={() => update({ filter: null })} />}
                {kind && <Chip icon={KINDS[kind].icon} label={KINDS[kind].name} onRemove={() => update({ soort: null })} />}
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
            <CatalogEmpty icon={kind ? KINDS[kind].icon : 'palette'}>
              <p>{q ? `Geen designs gevonden voor "${q}".` : mine ? 'Je deelt nog niets.' : 'Hier staat nog niets.'}</p>
              {user && !q && (
                <Button variant="cta" onClick={() => setSharing(true)}>
                  <FarmIcon name="add" /> Deel jij de eerste?
                </Button>
              )}
            </CatalogEmpty>
          ) : (
            <ul className={isPlaceholderData ? 'dg-grid loading' : 'dg-grid'}>
              {data!.items.map((d) => (
                <DesignCard key={d.id} design={d} />
              ))}
            </ul>
          )}
          {data && <Pager page={data.page} pages={data.pages} onPage={(p) => update({ pagina: String(p) }, true)} />}
        </CatalogMain>
      </CatalogLayout>
      {sharing && <ShareDesignDialog onClose={() => setSharing(false)} />}
    </main>
  )
}

function DesignCard({ design: d }: { design: SharedDesign }) {
  const { user } = useAuth()
  const { use, keep } = useTakeDesign()
  const { remove, respect } = useGalleryActions()
  const [editing, setEditing] = useState(false)
  const own = user?.id === d.user.id
  const busy = use.isPending || keep.isPending
  const error = use.error ?? keep.error ?? remove.error ?? respect.error
  const where = d.kind === 'design' ? 'je profiel' : 'de site'

  return (
    <li className="dg-card">
      <div className="dg-preview">{d.kind === 'design' ? <DesignMini design={d.data} name={d.user.nickname} /> : <ThemeMini theme={d.data} />}</div>
      <div className="dg-body">
        <span className="dg-kind">
          <FarmIcon name={KINDS[d.kind].icon} /> {KINDS[d.kind].one}
        </span>
        <h3>{d.name}</h3>
        {d.description && <p className="dg-desc">{d.description}</p>}
        <div className="dg-by">
          <Avatar user={d.user} size="tiny" />
          <span>
            door <Link to={`/profiel/${d.user.username}`}>{d.user.nickname}</Link> · {formatTime(d.createdAt)}
          </span>
        </div>
        <p className="dg-stats">
          <span title="Respect">
            <FarmIcon name="star" /> {d.respects}
          </span>
          <span title="Zo vaak gebruikt of bewaard">
            <FarmIcon name="fire" /> {d.uses}× gebruikt
          </span>
        </p>
      </div>
      <div className="dg-actions">
        {!user ? (
          <Link to="/inloggen?next=/designs" className="btn">
            Log in om te gebruiken
          </Link>
        ) : (
          <>
            {use.isSuccess ? (
              <span className="dg-done">
                <FarmIcon name="tick" /> Staat op {where}
              </span>
            ) : (
              <Button variant="cta" disabled={busy} onClick={() => use.mutate(d)} title={`Meteen op ${where}`}>
                Gebruiken
              </Button>
            )}
            {/* Your own is in your library already */}
            {!own && (
              <Button disabled={busy || keep.isSuccess} onClick={() => keep.mutate(d)} title={d.kind === 'design' ? 'Kopie bij Mijn designs' : 'Kopie bij Mijn thema’s'}>
                <FarmIcon name={keep.isSuccess ? 'tick' : 'diskette'} /> {keep.isSuccess ? 'Bewaard' : 'Bewaren'}
              </Button>
            )}
            {!own && (
              <button
                type="button"
                className={d.respected ? 'social-respect respected dg-respect' : 'social-respect dg-respect'}
                aria-pressed={d.respected}
                disabled={respect.isPending}
                onClick={() => respect.mutate({ id: d.id, on: !d.respected })}
                title={d.respected ? 'Respect terugnemen' : 'Geef respect'}
                aria-label={d.respected ? 'Respect terugnemen' : 'Geef respect'}
              >
                <FarmIcon name="star" />
              </button>
            )}
            {own && (
              <Button className="dg-tool dg-own" onClick={() => setEditing(true)} title="Naam of beschrijving aanpassen" aria-label="Naam of beschrijving aanpassen">
                <FarmIcon name="pencil" />
              </Button>
            )}
            {(own || user.isAdmin) && (
              <Button
                className={own ? 'dg-tool' : 'dg-tool dg-own'}
                aria-label="Uit de galerij halen"
                disabled={remove.isPending}
                onClick={() => confirm(`"${d.name}" uit de galerij halen? Wie het al bewaarde, houdt het.`) && remove.mutate(d.id)}
                title="Uit de galerij halen"
              >
                <FarmIcon name="bin" />
              </Button>
            )}
          </>
        )}
      </div>
      {error && <p className="form-error dg-error">{errorMessage(error)}</p>}
      {editing && <EditDialog design={d} onClose={() => setEditing(false)} />}
    </li>
  )
}

function EditDialog({ design, onClose }: { design: SharedDesign; onClose: () => void }) {
  const { edit } = useGalleryActions()
  const [name, setName] = useState(design.name)
  const [description, setDescription] = useState(design.description)
  return (
    <Modal title="Aanpassen in de galerij" icon="pencil" onClose={onClose}>
      <form
        className="dg-share-fields"
        onSubmit={(e) => {
          e.preventDefault()
          edit.mutate({ id: design.id, name, description }, { onSuccess: onClose })
        }}
      >
        <label>
          Naam
          <input className="text-box" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <label>
          Beschrijving
          <textarea className="text-box" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={SHARED_DESIGN_TEXT_MAX} />
        </label>
        {edit.isError && <p className="form-error">{errorMessage(edit.error)}</p>}
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={edit.isPending}>
            Opslaan
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
        </div>
      </form>
    </Modal>
  )
}
