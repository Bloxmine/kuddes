/**
 * Kudde gadgets (shared/kuddeGadgets.ts): their boxes on the Kudde page, and
 * for the owner a box to add, change, sort and remove them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { KuddeDetail, UserSummary } from '../../../shared/api'
import { KUDDE_GADGET_LIMITS as L, KUDDE_GADGET_TYPES, type KuddeGadget, type KuddeGadgetConfig, type KuddeGadgetType } from '../../../shared/kuddeGadgets'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { DateTimeInput } from '../../components/ui/DateInput'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { withSmileys } from '../../lib/smileys'
import { toLocalInput } from '../events/eventTime'
import { Countdown } from '../gadgets/CountdownPoll'
import { Counter, Quote } from '../gadgets/ExtraGadgets'
import '../gadgets/Gadgets.css'
import { KUDDE_GADGET_ICONS, KUDDE_GADGET_KINDS } from './kuddeGadgetIcons'
import './KuddeGadgets.css'

const gadgetsKey = (slug: string) => ['kudde-gadgets', slug] as const

const useKuddeGadgets = (slug: string) => useQuery({ queryKey: gadgetsKey(slug), queryFn: () => api<KuddeGadget[]>(`/kuddes/${slug}/gadgets`) })

const DATE = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** "over 3 dagen", "morgen", "vandaag". */
function until(iso: string) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(new Date(iso)) - start(new Date())) / 86_400_000)
  return days <= 0 ? 'vandaag' : days === 1 ? 'morgen' : `over ${days} dagen`
}

function People({ list, empty }: { list: UserSummary[]; empty: string }) {
  if (!list.length) return <p className="empty">{empty}</p>
  return (
    <ul className="kg-people">
      {list.map((u) => (
        <li key={u.id}>
          <Avatar user={u} size="small" showName label={u.nickname} />
        </li>
      ))}
    </ul>
  )
}

/** What's inside one gadget's box. */
function Body({ gadget, kudde }: { gadget: KuddeGadget; kudde: KuddeDetail }) {
  switch (gadget.type) {
    case 'teller':
      return <Counter views={gadget.data.views} {...gadget.config} />
    case 'leden': {
      const { members, thisWeek } = gadget.data
      const goal = gadget.config.goal
      return (
        <div className="kg-members">
          <p className="kg-big">
            <b>{members}</b> {members === 1 ? 'lid' : 'leden'}
          </p>
          <p className="muted">{thisWeek ? `${thisWeek} nieuw deze week` : 'Deze week nog niemand nieuw'}</p>
          {goal > 0 && (
            <div className="kg-goal">
              <div className="kg-goal-bar" role="progressbar" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(members, goal)} aria-label="Ledendoel">
                <span style={{ width: `${Math.min(100, (members / goal) * 100)}%` }} />
              </div>
              <span className="muted">{members >= goal ? `Doel van ${goal} leden gehaald!` : `Nog ${goal - members} tot ${goal} leden`}</span>
            </div>
          )}
        </div>
      )
    }
    case 'nieuwkomers':
      return <People list={gadget.data.members} empty="Nog geen leden." />
    case 'online':
      return <People list={gadget.data.members} empty="Er is nu niemand van de Kudde online." />
    case 'actief':
      if (gadget.data.hidden) return <p className="empty">Alleen leden zien wie er het actiefst is.</p>
      if (!gadget.data.members.length) return <p className="empty">{gadget.config.days === 7 ? 'Deze week' : 'Deze maand'} schreef nog niemand op het prikbord.</p>
      return (
        <ol className="kg-ranking">
          {gadget.data.members.map(({ user, posts }, i) => (
            <li key={user.id}>
              <span className={`kg-place p${i + 1}`}>{i + 1}</span>
              <Avatar user={user} size="tiny" />
              <Link to={`/profiel/${user.username}`}>{user.nickname}</Link>
              <span className="muted">
                {posts} {posts === 1 ? 'bericht' : 'berichten'}
              </span>
            </li>
          ))}
        </ol>
      )
    case 'agenda':
      if (gadget.data.hidden) return <p className="empty">De agenda is alleen voor leden.</p>
      if (!gadget.data.events.length) return <p className="empty">Er staat niets in de agenda.{kudde.rights.length > 0 && ' Zet er iets in onder Evenementen.'}</p>
      return (
        <ul className="kg-events">
          {gadget.data.events.map((e) => (
            <li key={e.id}>
              <span className="kg-when">{until(e.startsAt)}</span>
              <b>{e.title}</b>
              <span className="muted">
                {DATE.format(new Date(e.startsAt))}
                {e.location && ` · ${e.location}`}
              </span>
            </li>
          ))}
        </ul>
      )
    case 'mededeling':
      return gadget.config.text.trim() ? <Quote quote={gadget.config.text} author="" style={gadget.config.style} /> : <p className="empty">Nog geen mededeling.</p>
    case 'regels':
      return gadget.config.rules.some((r) => r.trim()) ? (
        <ol className="kg-rules">
          {gadget.config.rules
            .filter((r) => r.trim())
            .map((r, i) => (
              <li key={i}>{withSmileys(r)}</li>
            ))}
        </ol>
      ) : (
        <p className="empty">Nog geen huisregels.</p>
      )
    case 'aftellen':
      return (
        <>
          {gadget.config.label && <p className="kg-label">{withSmileys(gadget.config.label)}</p>}
          <Countdown target={gadget.config.target} doneText={gadget.config.doneText} />
        </>
      )
  }
}

/** The Kudde's gadgets, each in its own box (only the ones that are switched on). */
export function KuddeGadgetBoxes({ kudde }: { kudde: KuddeDetail }) {
  const { data = [] } = useKuddeGadgets(kudde.slug)
  return (
    <>
      {data
        .filter((g) => g.enabled)
        .map((g) => (
          <Box key={g.id} title={g.title} icon={KUDDE_GADGET_ICONS[g.type]} className={`kg kg-${g.type}`}>
            <Body gadget={g} kudde={kudde} />
          </Box>
        ))}
    </>
  )
}

// ------------------------------------------------------------------ editing

type Editor<T extends KuddeGadgetType> = { value: KuddeGadgetConfig[T]; onChange: (v: KuddeGadgetConfig[T]) => void }

const Count = ({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (n: number) => void }) => (
  <Field label={label}>
    <select className="text-box" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <option key={n}>{n}</option>
      ))}
    </select>
  </Field>
)

function ConfigEditor({ type, value, onChange }: { type: KuddeGadgetType; value: KuddeGadgetConfig[KuddeGadgetType]; onChange: (v: KuddeGadgetConfig[KuddeGadgetType]) => void }): ReactNode {
  switch (type) {
    case 'teller': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'teller'>
      return (
        <div className="gadget-rows">
          <Field label="Tekst onder de teller">
            <input className="text-box" value={v.label} maxLength={L.counterLabel} onChange={(e) => set({ ...v, label: e.target.value })} placeholder="bezoekers" />
          </Field>
          <Field label="Soort teller">
            <select className="text-box" value={v.style} onChange={(e) => set({ ...v, style: e.target.value as typeof v.style })}>
              <option value="kilometer">Kilometerteller</option>
              <option value="led">Rode ledjes</option>
              <option value="klassiek">In de kleuren van de Kudde</option>
            </select>
          </Field>
          <p className="muted">De teller telt hoe vaak de Kudde bekeken is (jij als beheerder telt niet mee).</p>
        </div>
      )
    }
    case 'leden': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'leden'>
      return (
        <Field label="Ledendoel" hint="(0 = geen doel)">
          <input className="text-box" type="number" min={0} max={L.goal} value={v.goal} onChange={(e) => set({ goal: Math.max(0, Math.min(L.goal, Math.round(Number(e.target.value) || 0))) })} />
        </Field>
      )
    }
    case 'nieuwkomers': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'nieuwkomers'>
      return <Count label="Hoeveel leden" value={v.count} max={L.people} onChange={(count) => set({ count })} />
    }
    case 'online':
      return <p className="muted">Deze gadget heeft geen instellingen: hij laat zien welke leden nu online zijn.</p>
    case 'actief': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'actief'>
      return (
        <div className="gadget-rows">
          <Count label="Hoeveel leden" value={v.count} max={L.people} onChange={(count) => set({ ...v, count })} />
          <Field label="Over de afgelopen">
            <select className="text-box" value={v.days} onChange={(e) => set({ ...v, days: Number(e.target.value) as 7 | 30 })}>
              <option value={7}>week</option>
              <option value={30}>maand</option>
            </select>
          </Field>
        </div>
      )
    }
    case 'agenda': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'agenda'>
      return <Count label="Hoeveel activiteiten" value={v.count} max={L.events} onChange={(count) => set({ count })} />
    }
    case 'mededeling': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'mededeling'>
      return (
        <div className="gadget-rows">
          <Field label="Mededeling" hint="(smileys mogen)">
            <textarea className="text-box" rows={3} value={v.text} maxLength={L.text} onChange={(e) => set({ ...v, text: e.target.value })} placeholder="Zaterdag geen training!" />
          </Field>
          <Field label="Uiterlijk">
            <select className="text-box" value={v.style} onChange={(e) => set({ ...v, style: e.target.value as typeof v.style })}>
              <option value="krijtbord">Krijtbord</option>
              <option value="briefje">Geel briefje</option>
              <option value="neon">Neonbord</option>
            </select>
          </Field>
        </div>
      )
    }
    case 'regels': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'regels'>
      return (
        <div className="gadget-rows">
          {v.rules.map((r, i) => (
            <div key={i} className="kg-rule-row">
              <span className="muted">{i + 1}.</span>
              <input className="text-box" value={r} maxLength={L.rule} aria-label={`Regel ${i + 1}`} onChange={(e) => set({ rules: v.rules.map((x, j) => (j === i ? e.target.value : x)) })} />
              <button type="button" className="icon-button" title="Regel weghalen" onClick={() => set({ rules: v.rules.filter((_, j) => j !== i) })}>
                <FarmIcon name="bin" />
              </button>
            </div>
          ))}
          {v.rules.length < L.rules && (
            <Button onClick={() => set({ rules: [...v.rules, ''] })}>
              <FarmIcon name="add" /> Regel toevoegen
            </Button>
          )}
        </div>
      )
    }
    case 'aftellen': {
      const { value: v, onChange: set } = { value, onChange } as Editor<'aftellen'>
      return (
        <div className="gadget-rows">
          <Field label="Aftellen tot">
            <DateTimeInput value={toLocalInput(v.target || null)} defaultTime="00:00" onChange={(t) => set({ ...v, target: t ? new Date(t).toISOString() : '' })} />
          </Field>
          <Field label="Waar tellen jullie naar af?" hint="(optioneel)">
            <input className="text-box" value={v.label} maxLength={L.label} onChange={(e) => set({ ...v, label: e.target.value })} placeholder="Het zomerfeest" />
          </Field>
          <Field label="Tekst als het zover is" hint="(smileys mogen)">
            <input className="text-box" value={v.doneText} maxLength={L.doneText} onChange={(e) => set({ ...v, doneText: e.target.value })} />
          </Field>
        </div>
      )
    }
  }
}

function useGadgetMutations(slug: string) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: gadgetsKey(slug) })
  return {
    create: useMutation({ mutationFn: (type: KuddeGadgetType) => api<KuddeGadget>(`/kuddes/${slug}/gadgets`, { method: 'POST', body: { type } }), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, ...body }: { id: number; title?: string; enabled?: boolean; config?: unknown; move?: -1 | 1 }) => api<void>(`/kudde-gadgets/${id}`, { method: 'PATCH', body }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id: number) => api<void>(`/kudde-gadgets/${id}`, { method: 'DELETE' }), onSuccess: refresh }),
  }
}

function GadgetSettings({ gadget, slug, onDone }: { gadget: KuddeGadget; slug: string; onDone: () => void }) {
  const { update } = useGadgetMutations(slug)
  const [title, setTitle] = useState(gadget.title)
  const [config, setConfig] = useState(gadget.config)
  const dirty = title !== gadget.title || JSON.stringify(config) !== JSON.stringify(gadget.config)
  return (
    <form
      className="gadget-form"
      onSubmit={(e) => {
        e.preventDefault()
        update.mutate({ id: gadget.id, title, config }, { onSuccess: onDone })
      }}
    >
      <Field label="Titel van de box">
        <input className="text-box" value={title} maxLength={L.title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <ConfigEditor type={gadget.type} value={config} onChange={setConfig} />
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={!dirty || update.isPending}>
          Opslaan
        </Button>
        <Button onClick={onDone}>Sluiten</Button>
        {update.isError && <span className="form-error">{errorMessage(update.error)}</span>}
      </div>
    </form>
  )
}

/** For the owner: add gadgets, change them, put them in order, hide or remove them. */
export function KuddeGadgetManager({ kudde, onDone }: { kudde: KuddeDetail; onDone: () => void }) {
  const { data = [] } = useKuddeGadgets(kudde.slug)
  const { create, update, remove } = useGadgetMutations(kudde.slug)
  const [open, setOpen] = useState<number | null>(null)
  const full = data.length >= L.gadgets
  const busy = create.isPending || update.isPending || remove.isPending
  return (
    <Box title="Gadgets van deze Kudde" icon="plugin" actions={<button type="button" className="link-button" onClick={onDone}>Sluiten</button>}>
      <p className="settings-intro">
        Gadgets komen in de rechterkolom van de Kudde, in deze volgorde. Meer uitleg vind je op de <Link to="/gadgetmarkt?categorie=kuddes">Gadgetmarkt</Link>.
      </p>
      <ul className="kg-add">
        {KUDDE_GADGET_KINDS.map((type) => (
          <li key={type}>
            <button type="button" disabled={full || busy} title={KUDDE_GADGET_TYPES[type].description} onClick={() => create.mutate(type, { onSuccess: (g) => setOpen(g.id) })}>
              <FarmIcon name={KUDDE_GADGET_ICONS[type]} size={32} />
              <span>{KUDDE_GADGET_TYPES[type].name}</span>
              <FarmIcon name="add" />
            </button>
          </li>
        ))}
      </ul>
      {full && <p className="form-error">Een Kudde kan maximaal {L.gadgets} gadgets hebben. Haal er eerst een weg.</p>}
      {data.length > 0 && (
        <ul className="gadget-list">
          {data.map((g, i) => (
            <li key={g.id} className={g.enabled ? undefined : 'off'}>
              <div className="gadget-list-row">
                <FarmIcon name={KUDDE_GADGET_ICONS[g.type]} size={32} />
                <div>
                  <b>{g.title}</b>
                  <span className="muted">
                    {KUDDE_GADGET_TYPES[g.type].name}
                    {!g.enabled && ' · verborgen'}
                  </span>
                </div>
                <span className="kg-move">
                  <button type="button" className="icon-button" title="Omhoog" disabled={i === 0 || busy} onClick={() => update.mutate({ id: g.id, move: -1 })}>
                    <FarmIcon name="arrow_up" />
                  </button>
                  <button type="button" className="icon-button" title="Omlaag" disabled={i === data.length - 1 || busy} onClick={() => update.mutate({ id: g.id, move: 1 })}>
                    <FarmIcon name="arrow_down" />
                  </button>
                </span>
                <label className="gadget-toggle" title="Tonen op de Kudde">
                  <input type="checkbox" checked={g.enabled} onChange={(e) => update.mutate({ id: g.id, enabled: e.target.checked })} /> Tonen
                </label>
                <Button onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
                  <FarmIcon name="pencil" /> Bewerken
                </Button>
                <button type="button" className="icon-button" title="Verwijderen" aria-label={`${g.title} verwijderen`} onClick={() => confirm(`"${g.title}" verwijderen?`) && remove.mutate(g.id)}>
                  <FarmIcon name="bin" />
                </button>
              </div>
              {open === g.id && <GadgetSettings key={g.id} gadget={g} slug={kudde.slug} onDone={() => setOpen(null)} />}
            </li>
          ))}
        </ul>
      )}
      {(create.isError || update.isError || remove.isError) && <p className="form-error">{errorMessage(create.error ?? update.error ?? remove.error)}</p>}
    </Box>
  )
}
