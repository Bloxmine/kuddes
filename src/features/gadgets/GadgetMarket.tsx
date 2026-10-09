/**
 * The Gadgetmarkt: every gadget there is, to add to your profile. The same
 * catalogue is a searchable list in a window on the profile (while arranging
 * it), and "Mijn gadgets" is where you switch them on and off, change and
 * remove them. A new gadget type shows up here by itself (see shared/gadgets.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Gadget, Me } from '../../../shared/api'
import { GADGET_CATEGORIES, GADGET_TYPES, LIMITS, type GadgetCategory, type GadgetType } from '../../../shared/gadgets'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Modal } from '../../components/ui/Modal'
import { errorMessage } from '../../lib/api'
import { useUpdateMe } from '../account/useUpdateMe'
import { CATEGORY_ICONS, CATEGORY_KEYS, findGadgets } from './gadgetCatalog'
import { GadgetForm } from './GadgetEditor'
import { GADGET_ICONS } from './gadgetIcons'
import { useGadgetActions } from './useGadgetActions'
import './GadgetMarket.css'

const ownedOf = (gadgets: Gadget[], type: GadgetType) => gadgets.filter((g) => g.type === type).length

/** How many of the gadget places you've used, as a little bar. */
export function GadgetMeter({ count }: { count: number }) {
  const full = count >= LIMITS.gadgets
  return (
    <div className={full ? 'gmk-meter full' : 'gmk-meter'} title={`${count} van de ${LIMITS.gadgets} gadgets gebruikt`}>
      <span className="gmk-meter-bar">
        <span style={{ width: `${Math.min(100, (count / LIMITS.gadgets) * 100)}%` }} />
      </span>
      <span>
        <b>{count}</b> van de {LIMITS.gadgets} gadgets
      </span>
    </div>
  )
}

/** One gadget in the market: what it is, how popular, and a button to add it. */
export function GadgetCard({ type, owned, members, full, busy, onAdd }: { type: GadgetType; owned: number; members?: number; full: boolean; busy: boolean; onAdd: () => void }) {
  const g = GADGET_TYPES[type]
  return (
    <li className={`gmk-card cat-${g.category}`}>
      <div className="gmk-art">
        <FarmIcon name={GADGET_ICONS[type]} size={48} />
        {owned > 0 && (
          <span className="gmk-owned">
            <FarmIcon name="accept" /> Op je profiel{owned > 1 && ` (${owned}×)`}
          </span>
        )}
      </div>
      <div className="gmk-info">
        <h3>{g.name}</h3>
        <span className="gmk-cat">{GADGET_CATEGORIES[g.category]}</span>
        <p>{g.description}</p>
      </div>
      <footer>
        <span className="muted" title="Leden die deze gadget op hun profiel hebben">
          {members !== undefined && (
            <>
              <FarmIcon name="group" /> {members === 1 ? '1 lid' : `${members} leden`}
            </>
          )}
        </span>
        <Button variant="cta" disabled={full || busy} title={full ? `Je hebt al ${LIMITS.gadgets} gadgets` : undefined} onClick={onAdd}>
          <FarmIcon name="add" /> {owned ? 'Nog een' : 'Toevoegen'}
        </Button>
      </footer>
    </li>
  )
}

/** The catalogue as a searchable list: type to filter, arrows and Enter to pick. */
function GadgetSearchList({ gadgets, disabled, onPick }: { gadgets: Gadget[]; disabled: boolean; onPick: (type: GadgetType) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<GadgetCategory | null>(null)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const found = findGadgets(query, category)
  const current = Math.min(active, found.length - 1)

  useEffect(() => {
    list.current?.querySelector('.current')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <div className="gmk-search-list">
      <div className="gmk-search">
        <FarmIcon name="magnifier" />
        <input
          className="text-box"
          type="search"
          autoFocus
          placeholder="Zoek een gadget: boeken, muziek, poll…"
          aria-label="Zoek een gadget"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(Math.max(0, Math.min(found.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1))))
            } else if (e.key === 'Enter' && found[current] && !disabled) {
              e.preventDefault()
              onPick(found[current])
            }
          }}
        />
      </div>
      <div className="gmk-chips" role="group" aria-label="Soort gadget">
        {[null, ...CATEGORY_KEYS].map((c) => (
          <button
            key={c ?? 'alles'}
            type="button"
            className={category === c ? 'current' : undefined}
            aria-pressed={category === c}
            onClick={() => {
              setCategory(c)
              setActive(0)
            }}
          >
            {c ? (
              <>
                <FarmIcon name={CATEGORY_ICONS[c]} /> {GADGET_CATEGORIES[c]}
              </>
            ) : (
              'Alles'
            )}
          </button>
        ))}
      </div>
      {found.length ? (
        <ul className="gmk-rows" ref={list}>
          {found.map((type, i) => {
            const owned = ownedOf(gadgets, type)
            return (
              <li key={type}>
                <button type="button" className={i === current ? 'current' : undefined} disabled={disabled} onMouseEnter={() => setActive(i)} onClick={() => onPick(type)}>
                  <FarmIcon name={GADGET_ICONS[type]} size={32} />
                  <span>
                    <b>{GADGET_TYPES[type].name}</b>
                    {owned > 0 && <em>{owned > 1 ? `${owned}× op je profiel` : 'op je profiel'}</em>}
                    <span className="muted">{GADGET_TYPES[type].description}</span>
                  </span>
                  <span className="gmk-rows-add" aria-hidden="true">
                    <FarmIcon name="add" />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="empty">Geen gadget gevonden voor "{query}".</p>
      )}
    </div>
  )
}

/** Choose a new gadget to add, from the profile while arranging it. */
export function GadgetPickerDialog({ username, gadgets, onAdded, onClose }: { username: string; gadgets: Gadget[]; onAdded: (gadget: Gadget) => void; onClose: () => void }) {
  const { create } = useGadgetActions(username)
  const full = gadgets.length >= LIMITS.gadgets
  return (
    <Modal title="Gadget toevoegen" icon="plugin_add" onClose={onClose} wide>
      <GadgetSearchList gadgets={gadgets} disabled={full || create.isPending} onPick={(type) => create.mutate(type, { onSuccess: onAdded })} />
      {full && <p className="form-error">Je hebt het maximum van {LIMITS.gadgets} gadgets bereikt. Haal er eerst een weg.</p>}
      {create.isError && <p className="form-error">{errorMessage(create.error)}</p>}
      <div className="gmk-picker-foot">
        <GadgetMeter count={gadgets.length} />
        <Link to="/gadgetmarkt" onClick={onClose}>
          <FarmIcon name="cart" /> Naar de Gadgetmarkt
        </Link>
      </div>
    </Modal>
  )
}

/** Your gadgets: BuddyPoke, and every gadget you added, to show, hide, change or remove. */
export function MyGadgets({ user, gadgets, onShop }: { user: Me; gadgets: Gadget[]; onShop: () => void }) {
  const { update, remove } = useGadgetActions(user.username)
  const updateMe = useUpdateMe()
  const [open, setOpen] = useState<number | null>(() => Number(location.hash.match(/^#gadget-(\d+)$/)?.[1]) || null)

  useEffect(() => {
    // Only for the one in the link, when the page opens
    if (open) document.getElementById(`gadget-${open}`)?.scrollIntoView({ block: 'center' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gmk-mine">
      <ul className="gadget-list">
        <li className={user.buddyEnabled ? undefined : 'off'}>
          <div className="gadget-list-row">
            <FarmIcon name="buddypoke" size={32} />
            <div>
              <b>BuddyPoke</b>
              <span className="muted">Je eigen 3D-buddy. Kies een gevoel en poke je vrienden.{!user.buddyEnabled && ' · verborgen'}</span>
            </div>
            <label className="gadget-toggle" title="Tonen op je profiel">
              <input type="checkbox" checked={user.buddyEnabled} disabled={updateMe.isPending} onChange={(e) => updateMe.mutate({ buddyEnabled: e.target.checked })} /> Tonen
            </label>
            <Link to={`/profiel/${user.username}?tab=buddypoke`} className="btn">
              <FarmIcon name="buddypoke" /> Openen
            </Link>
          </div>
        </li>
        {gadgets.map((g) => (
          <li key={g.id} id={`gadget-${g.id}`} className={g.enabled ? undefined : 'off'}>
            <div className="gadget-list-row">
              <FarmIcon name={GADGET_ICONS[g.type]} size={32} />
              <div>
                <b>{g.title}</b>
                <span className="muted">
                  {GADGET_TYPES[g.type].name}
                  {!g.enabled && ' · verborgen'}
                </span>
              </div>
              <label className="gadget-toggle" title="Tonen op je profiel">
                <input type="checkbox" checked={g.enabled} onChange={(e) => update.mutate({ id: g.id, enabled: e.target.checked })} /> Tonen
              </label>
              <Button onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
                <FarmIcon name="pencil" /> Bewerken
              </Button>
              <button
                type="button"
                className="icon-button"
                title="Verwijderen"
                aria-label={`${g.title} verwijderen`}
                onClick={() => {
                  if (confirm(`"${g.title}" verwijderen?`)) remove.mutate(g.id)
                }}
              >
                <FarmIcon name="bin" />
              </button>
            </div>
            {open === g.id && <GadgetForm key={g.id} gadget={g} username={user.username} onDone={() => setOpen(null)} />}
          </li>
        ))}
      </ul>
      {!gadgets.length && (
        <p className="empty">
          Je hebt nog geen gadgets. <button type="button" className="link-button" onClick={onShop}>Kijk in de Gadgetmarkt</button> en zet er een paar op je profiel!
        </p>
      )}
      {(update.isError || remove.isError || updateMe.isError) && <p className="form-error">{errorMessage(update.error ?? remove.error ?? updateMe.error)}</p>}
      <p className="muted gadget-hint">
        <FarmIcon name="information" /> Nieuwe gadgets komen onderaan de rechterkolom van je profiel. Verplaats ze met <b>Indeling</b> op je profiel; daar kun je ook meteen gadgets toevoegen.
      </p>
    </div>
  )
}
