import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AUTO_ACTIONS,
  AUTO_LIMITS,
  AUTO_PLACEHOLDERS,
  AUTO_RIGHTS,
  AUTO_TRIGGERS,
  newAutoAction,
  newAutomation,
  type AutoAction,
  type AutoActionKind,
  type AutoRight,
  type AutoTrigger,
  type Automation,
  type AutomationConfig,
} from '../../../shared/automations'
import { WATCH_PLACES, type AdminBot, type WatchPlace } from '../../../shared/bots'
import { IP_BAN_DURATIONS, IP_BAN_SCOPES, type IpBanDuration, type IpBanScope } from '../../../shared/ipBans'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import '../bots/Bots.css'
import './Automations.css'

const KEY = ['admin', 'automations'] as const
const TRIGGERS = Object.keys(AUTO_TRIGGERS) as AutoTrigger[]
const ACTIONS = Object.keys(AUTO_ACTIONS) as AutoActionKind[]
type TestResult = { applies: boolean; why: string[]; steps: string[]; refused: boolean }

/** Whether an action can go with a trigger (the server says the same when saving). */
const fits = (kind: AutoActionKind, trigger: AutoTrigger) => (kind === 'weigeren' ? trigger === 'aanmelden' : !(AUTO_ACTIONS[kind].member && trigger === 'aanmelden'))

const configOf = ({ id: _id, runs: _r, lastRunAt: _l, lastError: _e, ...config }: Automation): AutomationConfig => config
const summary = (a: AutomationConfig) => `Als ${AUTO_TRIGGERS[a.trigger].name.toLowerCase()}, dan ${a.actions.map((x) => AUTO_ACTIONS[x.kind].name.toLowerCase()).join(', ')}`
const lines = (s: string) => s.split(/[\n,]/)

/** Beheer → Automatiseringen: "when this happens, and these hold, do these things". */
export function AutomationsAdmin() {
  const queryClient = useQueryClient()
  const { data = [], isLoading } = useQuery({ queryKey: KEY, queryFn: () => api<Automation[]>('/admin/automations') })
  const bots = useQuery({ queryKey: ['admin', 'bots'], queryFn: () => api<AdminBot[]>('/admin/bots') })
  const [open, setOpen] = useState<number | 'nieuw' | null>(null)
  return (
    <Box title={`Automatiseringen (${data.length})`} icon="lightning">
      <p className="muted">
        Laat Kuddes vanzelf iets doen als er iets gebeurt: iemand welkom heten die na lange tijd terugkomt, een aanmelding met een verboden woord weigeren, een lid na een maand
        videorechten geven, iemand blokkeren of zijn IP bannen zodra hij weer online komt. Alles wat een automatisering doet, staat in het Logboek; jij wordt er nooit door
        geblokkeerd of geband.
      </p>
      {open !== 'nieuw' && data.length < AUTO_LIMITS.automations && (
        <Button variant="cta" onClick={() => setOpen('nieuw')}>
          <FarmIcon name="add" /> Nieuwe automatisering
        </Button>
      )}
      {open === 'nieuw' && <Editor initial={newAutomation()} bots={bots.data ?? []} onDone={() => setOpen(null)} />}
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : (
        <ul className="bot-list auto-list">
          {data.map((a) => (
            <li key={a.id} className={a.enabled ? 'bot-item' : 'bot-item off'}>
              <div className="bot-head">
                <FarmIcon name="lightning" size={32} />
                <div className="bot-who">
                  <b>{a.name}</b>
                  <small className="muted">
                    {summary(a)} · {a.enabled ? 'aan' : 'uit'} · {a.runs}× gedaan{a.lastRunAt && `, laatst ${formatTime(a.lastRunAt)}`}
                  </small>
                  {a.lastError && <small className="form-error">Laatste keer: {a.lastError}</small>}
                </div>
                <Button onClick={() => setOpen(open === a.id ? null : a.id)}>
                  <FarmIcon name="cog" /> {open === a.id ? 'Dicht' : 'Instellen'}
                </Button>
              </div>
              {open === a.id && (
                <Editor
                  id={a.id}
                  initial={configOf(a)}
                  bots={bots.data ?? []}
                  onDone={() => {
                    setOpen(null)
                    void queryClient.invalidateQueries({ queryKey: KEY })
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

function Editor({ id, initial, bots, onDone }: { id?: number; initial: AutomationConfig; bots: AdminBot[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [a, setA] = useState<AutomationConfig>(initial)
  // The word and member lists are edited as text, one per line
  const [members, setMembers] = useState(initial.conditions.members.join('\n'))
  const [words, setWords] = useState(initial.conditions.words.join('\n'))
  const config = (): AutomationConfig => ({
    ...a,
    conditions: {
      ...a.conditions,
      members: lines(members)
        .map((s) => s.trim())
        .filter(Boolean),
      words: lines(words)
        .map((s) => s.trim())
        .filter(Boolean),
    },
  })
  const save = useMutation({
    mutationFn: () =>
      id ? api<Automation>(`/admin/automations/${id}`, { method: 'PATCH', body: config() }) : api<Automation>('/admin/automations', { method: 'POST', body: config() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
      onDone()
    },
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/admin/automations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY })
      onDone()
    },
  })
  const setCond = (patch: Partial<AutomationConfig['conditions']>) => setA({ ...a, conditions: { ...a.conditions, ...patch } })
  const setAction = (i: number, patch: Partial<AutoAction>) => setA({ ...a, actions: a.actions.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  const move = (i: number, d: number) => {
    const list = [...a.actions]
    const [x] = list.splice(i, 1)
    list.splice(i + d, 0, x)
    setA({ ...a, actions: list })
  }
  const onlineish = a.trigger === 'online' || a.trigger === 'inloggen'

  return (
    <div className="bot-editor auto-editor">
      <div className="settings-grid">
        <Field label="Naam (alleen voor jou)">
          <input className="text-box" value={a.name} maxLength={AUTO_LIMITS.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
        </Field>
      </div>
      <label className="gadget-toggle">
        <input type="checkbox" checked={a.enabled} onChange={(e) => setA({ ...a, enabled: e.target.checked })} /> <b>Aan</b>: Kuddes doet dit echt
      </label>

      <h3>Als</h3>
      <div className="bot-rule-line">
        <select
          className="text-box"
          value={a.trigger}
          onChange={(e) => {
            const trigger = e.target.value as AutoTrigger
            // Actions that can't go with the new trigger make way for a message or a melding
            setA({ ...a, trigger, actions: a.actions.map((x) => (fits(x.kind, trigger) ? x : newAutoAction(trigger === 'aanmelden' ? 'weigeren' : 'melding'))) })
          }}
          aria-label="Wanneer"
        >
          {TRIGGERS.map((t) => (
            <option key={t} value={t}>
              {AUTO_TRIGGERS[t].name}
            </option>
          ))}
        </select>
        {a.trigger === 'dagelijks' && <input className="text-box bot-time" type="time" value={a.time} onChange={(e) => setA({ ...a, time: e.target.value })} aria-label="Tijd" />}
        {a.trigger === 'online' && (
          // Optional: off (0) is every new visit, after 5 minutes of nothing
          <label className="auto-away">
            <input type="checkbox" checked={a.awayMinutes > 0} onChange={(e) => setA({ ...a, awayMinutes: e.target.checked ? 30 : 0 })} /> na minstens
            {a.awayMinutes > 0 ? (
              <>
                <input
                  className="text-box bot-number"
                  type="number"
                  min={5}
                  value={a.awayMinutes}
                  onChange={(e) => setA({ ...a, awayMinutes: Math.max(5, Number(e.target.value) || 5) })}
                  aria-label="Minuten weg"
                />
                minuten weg
              </>
            ) : (
              ' … minuten weg (uit: bij elk nieuw bezoek)'
            )}
          </label>
        )}
      </div>
      <small className="muted">{AUTO_TRIGGERS[a.trigger].hint}</small>
      {a.trigger === 'geplaatst' && (
        <div className="bot-checks">
          <span>Waar (niets aangevinkt: overal):</span>
          {(Object.keys(WATCH_PLACES) as WatchPlace[]).map((p) => (
            <label key={p}>
              <input
                type="checkbox"
                checked={a.places.includes(p)}
                onChange={() => setA({ ...a, places: a.places.includes(p) ? a.places.filter((x) => x !== p) : [...a.places, p] })}
              />{' '}
              {WATCH_PLACES[p]}
            </label>
          ))}
        </div>
      )}

      <h3>En als (allemaal optioneel)</h3>
      <div className="auto-conds">
        <Field label="Alleen deze leden" hint="gebruikersnamen, één per regel; leeg: iedereen">
          <textarea className="text-box" rows={3} value={members} onChange={(e) => setMembers(e.target.value)} spellCheck={false} />
        </Field>
        <Field
          label="Bevat een van deze woorden"
          hint={a.trigger === 'aanmelden' ? 'in gebruikersnaam, naam of e-mailadres' : a.trigger === 'geplaatst' ? 'in wat ze plaatsen' : 'in hun naam of gebruikersnaam'}
        >
          <textarea className="text-box" rows={3} value={words} onChange={(e) => setWords(e.target.value)} spellCheck={false} placeholder="één per regel; * is alles" />
        </Field>
      </div>
      <div className="bot-checks">
        {onlineish && (
          <label>
            Minstens{' '}
            <input
              className="text-box bot-number"
              type="number"
              min={0}
              value={a.conditions.awayDays}
              onChange={(e) => setCond({ awayDays: Math.max(0, Number(e.target.value) || 0) })}
            />{' '}
            dagen weg geweest
          </label>
        )}
        {a.trigger !== 'aanmelden' && (
          <>
            <label>
              Account minstens{' '}
              <input
                className="text-box bot-number"
                type="number"
                min={0}
                value={a.conditions.minAgeDays}
                onChange={(e) => setCond({ minAgeDays: Math.max(0, Number(e.target.value) || 0) })}
              />{' '}
              dagen oud
            </label>
            <label>
              en hooguit{' '}
              <input
                className="text-box bot-number"
                type="number"
                min={0}
                value={a.conditions.maxAgeDays}
                onChange={(e) => setCond({ maxAgeDays: Math.max(0, Number(e.target.value) || 0) })}
              />{' '}
              dagen (0: geen grens)
            </label>
            <label>
              <input type="checkbox" checked={a.conditions.once} onChange={(e) => setCond({ once: e.target.checked })} /> Maar één keer per lid
            </label>
          </>
        )}
      </div>

      <h3>Dan</h3>
      {a.actions.map((x, i) => {
        const def = AUTO_ACTIONS[x.kind]
        return (
          <fieldset key={i} className="bot-rule">
            <div className="bot-rule-line">
              <span className="auto-step">{i + 1}.</span>
              <select className="text-box" value={x.kind} onChange={(e) => setAction(i, { kind: e.target.value as AutoActionKind })} aria-label="Actie">
                {ACTIONS.map((k) => (
                  <option key={k} value={k} disabled={!fits(k, a.trigger)}>
                    {AUTO_ACTIONS[k].name}
                  </option>
                ))}
              </select>
              {def.from && (
                <select className="text-box" value={x.from ?? ''} onChange={(e) => setAction(i, { from: e.target.value ? Number(e.target.value) : null })} aria-label="Van">
                  {x.kind === 'bericht' && <option value="">van jou (beheerder)</option>}
                  {x.kind !== 'bericht' && <option value="">kies een bot…</option>}
                  {bots.map((b) => (
                    <option key={b.user.id} value={b.user.id}>
                      van {b.user.nickname} (bot)
                    </option>
                  ))}
                </select>
              )}
              {x.kind === 'rechten' && (
                <>
                  <select className="text-box" value={x.right} onChange={(e) => setAction(i, { right: e.target.value as AutoRight })} aria-label="Welke rechten">
                    {(Object.keys(AUTO_RIGHTS) as AutoRight[]).map((r) => (
                      <option key={r} value={r}>
                        {AUTO_RIGHTS[r]}
                      </option>
                    ))}
                  </select>
                  <select className="text-box" value={x.grant ? '1' : '0'} onChange={(e) => setAction(i, { grant: e.target.value === '1' })} aria-label="Geven of afpakken">
                    <option value="1">geven</option>
                    <option value="0">afpakken</option>
                  </select>
                </>
              )}
              {x.kind === 'ip_ban' && (
                <>
                  <select className="text-box" value={x.duration} onChange={(e) => setAction(i, { duration: e.target.value as IpBanDuration })} aria-label="Hoe lang">
                    {(Object.keys(IP_BAN_DURATIONS) as IpBanDuration[]).map((d) => (
                      <option key={d} value={d}>
                        {IP_BAN_DURATIONS[d].name}
                      </option>
                    ))}
                  </select>
                  <select className="text-box" value={x.scope} onChange={(e) => setAction(i, { scope: e.target.value as IpBanScope })} aria-label="Wat lukt dan niet">
                    {(Object.keys(IP_BAN_SCOPES) as IpBanScope[]).map((k) => (
                      <option key={k} value={k}>
                        {IP_BAN_SCOPES[k].name}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <span className="auto-tools">
                <button type="button" className="icon-button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Eerder">
                  <FarmIcon name="arrow_up" />
                </button>
                <button type="button" className="icon-button" onClick={() => move(i, 1)} disabled={i === a.actions.length - 1} aria-label="Later">
                  <FarmIcon name="arrow_down" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setA({ ...a, actions: a.actions.filter((_, j) => j !== i) })}
                  disabled={a.actions.length === 1}
                  aria-label="Weghalen"
                >
                  <FarmIcon name="cross" />
                </button>
              </span>
            </div>
            {def.text && (
              <textarea
                className="text-box"
                rows={2}
                maxLength={AUTO_LIMITS.text}
                value={x.text}
                onChange={(e) => setAction(i, { text: e.target.value })}
                placeholder={x.kind === 'blokkeren' || x.kind === 'zwarte_lijst' ? 'De reden (optioneel)' : 'Welkom terug, {voornaam}!'}
              />
            )}
            <small className="muted">{def.hint}</small>
          </fieldset>
        )
      })}
      {a.actions.length < AUTO_LIMITS.actions && (
        <Button onClick={() => setA({ ...a, actions: [...a.actions, newAutoAction(a.trigger === 'aanmelden' ? 'melding' : 'bericht')] })}>
          <FarmIcon name="add" /> Actie toevoegen
        </Button>
      )}
      <p className="muted">
        In teksten wordt{' '}
        {Object.entries(AUTO_PLACEHOLDERS).map(([k, v], i) => (
          <span key={k}>
            {i > 0 && ', '}
            <code>{k}</code> {v}
          </span>
        ))}
        . Blokkeren, uitloggen, IP bannen en de zwarte lijst slaan jou altijd over.
      </p>

      <TryIt config={config()} />

      <div className="account-actions">
        <Button variant="cta" onClick={() => save.mutate()} disabled={save.isPending}>
          Opslaan
        </Button>
        <Button onClick={onDone}>Annuleren</Button>
        {id && (
          <Button onClick={() => confirm(`“${a.name}” verwijderen?`) && remove.mutate()} disabled={remove.isPending}>
            <FarmIcon name="cross" /> Verwijderen
          </Button>
        )}
        {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
      </div>
    </div>
  )
}

/** A dry run on a member (or a pretend sign-up): does it apply, and what would it do? Nothing is done. */
function TryIt({ config }: { config: AutomationConfig }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [text, setText] = useState('')
  const [awayDays, setAwayDays] = useState(0)
  const run = useMutation({ mutationFn: () => api<TestResult>('/admin/automations/test', { method: 'POST', body: { config, username, email, text, awayDays } }) })
  const signup = config.trigger === 'aanmelden'
  return (
    <div className="bot-try">
      <h3>Proberen</h3>
      <div className="bot-rule-line">
        <input
          className="text-box auto-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={signup ? 'gebruikersnaam van de aanmelding' : 'gebruikersnaam van een lid'}
          aria-label="Gebruikersnaam"
        />
        {signup && <input className="text-box auto-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e-mailadres" aria-label="E-mailadres" />}
        {config.trigger === 'geplaatst' && (
          <input className="text-box auto-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="wat ze plaatsen" aria-label="Tekst" />
        )}
        {(config.trigger === 'online' || config.trigger === 'inloggen') && (
          <label>
            <input className="text-box bot-number" type="number" min={0} value={awayDays} onChange={(e) => setAwayDays(Math.max(0, Number(e.target.value) || 0))} /> dagen weg
          </label>
        )}
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          <FarmIcon name="control_play_blue" /> Proberen
        </Button>
      </div>
      <small className="muted">Er wordt niets echt gedaan.</small>
      {run.isError && <p className="form-error">{errorMessage(run.error)}</p>}
      {run.data &&
        (run.data.applies ? (
          <ol className="bot-steps">
            {run.data.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <div className="muted">
            Zou niets doen:
            <ul>
              {run.data.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}
