/**
 * "Voor Kuddes" on the Gadgetmarkt: the Kudde gadgets (shared/kuddeGadgets.ts),
 * to add to a Kudde you run.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KUDDE_GADGET_LIMITS, KUDDE_GADGET_TYPES, type KuddeGadget, type KuddeGadgetType, type OwnedKudde } from '../../../shared/kuddeGadgets'
import { useOwnedKuddes } from '../../lib/queries'
import { CatalogEmpty, CatalogMain } from '../../components/catalog/Catalog'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import '../gadgets/GadgetMarket.css'
import { KUDDE_GADGET_ICONS, findKuddeGadgets } from './kuddeGadgetIcons'


export function KuddeGadgetMarket({ query }: { query: string }) {
  const queryClient = useQueryClient()
  const owned = useOwnedKuddes().data?.filter((k) => k.rights.includes('gadgets'))
  const { data: popular } = useQuery({ queryKey: ['kudde-gadgets', 'populair'], queryFn: () => api<Partial<Record<KuddeGadgetType, number>>>('/kudde-gadgets/populair'), staleTime: 5 * 60 * 1000 })
  const [target, setTarget] = useState('')
  const kudde = owned?.find((k) => k.slug === target) ?? owned?.[0]
  const [added, setAdded] = useState<{ gadget: KuddeGadget; kudde: OwnedKudde } | null>(null)
  const add = useMutation({
    mutationFn: ({ type, slug }: { type: KuddeGadgetType; slug: string }) => api<KuddeGadget>(`/kuddes/${slug}/gadgets`, { method: 'POST', body: { type } }),
    onSuccess: (gadget, { slug }) => {
      setAdded({ gadget, kudde: owned!.find((k) => k.slug === slug)! })
      void queryClient.invalidateQueries({ queryKey: ['me', 'owned-kuddes'] })
      void queryClient.invalidateQueries({ queryKey: ['kudde-gadgets', slug] })
    },
  })
  const found = findKuddeGadgets(query)
  const full = !!kudde && kudde.gadgets >= KUDDE_GADGET_LIMITS.gadgets

  return (
    <CatalogMain icon="tag_blue" title="Voor Kuddes" sub={`${found.length} ${found.length === 1 ? 'gadget' : 'gadgets'} voor je Kudde`}>
      {owned && !owned.length ? (
        <p className="gmk-full">
          <FarmIcon name="information" /> Deze gadgets zijn voor de beheerder van een Kudde. <Link to="/kuddes/nieuw">Start je eigen Kudde</Link> om ze te gebruiken.
        </p>
      ) : (
        owned &&
        owned.length > 1 && (
          <label className="gmk-target">
            <FarmIcon name="tag_blue" /> Toevoegen aan{' '}
            <select className="text-box" value={kudde?.slug} onChange={(e) => setTarget(e.target.value)}>
              {owned.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.name} ({k.gadgets} van {KUDDE_GADGET_LIMITS.gadgets})
                </option>
              ))}
            </select>
          </label>
        )
      )}
      {added && (
        <div className="gmk-added" role="status">
          <FarmIcon name="accept" />
          <span>
            <b>{added.gadget.title}</b> staat nu op {added.kudde.name}.
          </span>
          <Link to={`/kuddes/${added.kudde.slug}?gadgets=1`}>Instellen</Link>
          <button type="button" className="icon-button" aria-label="Sluiten" onClick={() => setAdded(null)}>
            ×
          </button>
        </div>
      )}
      {full && (
        <p className="gmk-full">
          <FarmIcon name="information" /> {kudde.name} heeft al {KUDDE_GADGET_LIMITS.gadgets} gadgets.
        </p>
      )}
      {add.isError && <p className="form-error">{errorMessage(add.error)}</p>}
      {found.length ? (
        <ul className="gmk-grid">
          {found.map((type) => (
            <li key={type} className="gmk-card cat-kuddes">
              <div className="gmk-art">
                <FarmIcon name={KUDDE_GADGET_ICONS[type]} size={48} />
              </div>
              <div className="gmk-info">
                <h3>{KUDDE_GADGET_TYPES[type].name}</h3>
                <span className="gmk-cat">Voor Kuddes</span>
                <p>{KUDDE_GADGET_TYPES[type].description}</p>
              </div>
              <footer>
                <span className="muted" title="Kuddes die deze gadget gebruiken">
                  {popular && (
                    <>
                      <FarmIcon name="tag_blue" /> {(popular[type] ?? 0) === 1 ? '1 Kudde' : `${popular[type] ?? 0} Kuddes`}
                    </>
                  )}
                </span>
                <Button
                  variant="cta"
                  disabled={!kudde || full || add.isPending}
                  title={kudde ? `Toevoegen aan ${kudde.name}` : 'Alleen voor de beheerder van een Kudde'}
                  onClick={() => kudde && add.mutate({ type, slug: kudde.slug })}
                >
                  <FarmIcon name="add" /> Toevoegen
                </Button>
              </footer>
            </li>
          ))}
        </ul>
      ) : (
        <CatalogEmpty icon="plugin">
          <p>Geen Kudde-gadget gevonden voor "{query}".</p>
        </CatalogEmpty>
      )}
    </CatalogMain>
  )
}
