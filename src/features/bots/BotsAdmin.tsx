import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BOT_ABILITIES,
  BOT_ACTIONS,
  BOT_DELAYS,
  BOT_KINDS,
  BOT_LIMITS,
  BOT_PLACEHOLDERS,
  BOT_TRIGGERS,
  BEHAVIOURS,
  MODERATION_LIMITS,
  REMOVABLE_PLACES,
  WATCH_PLACES,
  type AdminBot,
  type BotAbility,
  type BotAction,
  type BotKind,
  type BotModeration,
  type BotWarning,
  type Behaviour,
  type WatchPlace,
  type BotRule,
  type BotSettings,
  type BotTrigger,
  type LmStudioSettings,
} from '../../../shared/bots'
import { Avatar } from '../../components/ui/Avatar'
import { BotBadge } from '../../components/ui/BotBadge'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import { wordsIn } from '../../../shared/moderationWords'
import './Bots.css'

const KEY = ['admin', 'bots'] as const
const newRuleId = () => crypto.randomUUID().slice(0, 8)
const TRIGGER_KEYS = Object.keys(BOT_TRIGGERS) as BotTrigger[]
const ACTION_KEYS = Object.keys(BOT_ACTIONS) as BotAction[]
type Step = { kind: 'actie'; name: string; args: Record<string, unknown>; result: string } | { kind: 'antwoord'; text: string }

/** Beheer → Bots: the LM Studio connection, making bots, and setting each one up. */
export function BotsAdmin() {
  const { data = [], isLoading } = useQuery({ queryKey: KEY, queryFn: () => api<AdminBot[]>('/admin/bots') })
  const [open, setOpen] = useState<string | null>(null)
  return (
    <>
      <LmStudioBox />
      <NewBot onMade={(b) => setOpen(b.user.username)} />
      <Warnings />
      <Box title={`Bots (${data.length})`} icon="cog">
        {isLoading ? (
          <p className="muted">Laden…</p>
        ) : data.length === 0 ? (
          <p className="empty">Nog geen bots. Maak er hierboven een, bijvoorbeeld “Kuddes” die nieuwe leden welkom heet.</p>
        ) : (
          <ul className="bot-list">
            {data.map((b) => (
              <li key={b.user.id} className={b.enabled ? 'bot-item' : 'bot-item off'}>
                <div className="bot-head">
                  <Avatar user={b.user} size="small" />
                  <div className="bot-who">
                    <b>
                      <Link to={`/profiel/${b.user.username}`}>{b.user.nickname}</Link> <BotBadge user={b.user} />
                    </b>
                    <small className="muted">
                      @{b.user.username} · {BOT_KINDS[b.kind].name} · {b.enabled ? 'aan' : 'uit'} · {b.runs}× gedaan
                      {b.lastRunAt && `, laatst ${formatTime(b.lastRunAt)}`}
                    </small>
                    {b.lastError && <small className="form-error">Laatste keer: {b.lastError}</small>}
                  </div>
                  <Button onClick={() => setOpen(open === b.user.username ? null : b.user.username)}>
                    <FarmIcon name="cog" /> {open === b.user.username ? 'Dicht' : 'Instellen'}
                  </Button>
                </div>
                {open === b.user.username && <BotEditor bot={b} />}
              </li>
            ))}
          </ul>
        )}
      </Box>
    </>
  )
}

function LmStudioBox() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin', 'lmstudio'], queryFn: () => api<LmStudioSettings>('/admin/lmstudio') })
  const [form, setForm] = useState<LmStudioSettings | null>(null)
  const cur = form ?? data ?? { url: '', apiKey: '', model: '' }
  const save = useMutation({
    mutationFn: () => api<LmStudioSettings>('/admin/lmstudio', { method: 'PUT', body: cur }),
    onSuccess: (s) => {
      setForm(null)
      queryClient.setQueryData(['admin', 'lmstudio'], s)
    },
  })
  const test = useMutation({ mutationFn: () => api<{ models: string[] }>('/admin/lmstudio/test', { method: 'POST' }) })
  const fields = save.error instanceof ApiRequestError ? save.error.fields : {}
  return (
    <Box title="LM Studio" icon="lightbulb">
      <p className="muted">
        AI-bots denken met een taalmodel in LM Studio, op je eigen computer of server: wat leden de bot schrijven gaat niet naar een AI-bedrijf. Start in LM Studio de server
        (Developer → Start Server) en zet “Serve on Local Network” aan als LM Studio op een andere computer draait. Taak-bots hebben LM Studio niet nodig.
      </p>
      <form
        className="bh-form"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <div className="settings-grid">
          <Field label="Adres" hint="bijv. http://192.168.1.20:1234" error={fields.url}>
            <input className="text-box" value={cur.url} onChange={(e) => setForm({ ...cur, url: e.target.value })} placeholder="http://localhost:1234" />
          </Field>
          <Field label="Standaardmodel" hint="leeg: wat LM Studio geladen heeft">
            <input className="text-box" value={cur.model} maxLength={BOT_LIMITS.model} onChange={(e) => setForm({ ...cur, model: e.target.value })} />
          </Field>
          <Field label="API-sleutel" hint="alleen als je die in LM Studio hebt aangezet">
            <input className="text-box" type="password" autoComplete="off" value={cur.apiKey} onChange={(e) => setForm({ ...cur, apiKey: e.target.value })} />
          </Field>
        </div>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={!form || save.isPending}>
            Opslaan
          </Button>
          <Button onClick={() => test.mutate()} disabled={test.isPending || !!form}>
            <FarmIcon name="transmit" /> {test.isPending ? 'Testen…' : 'Verbinding testen'}
          </Button>
          {save.isError && !fields.url && <span className="form-error">{errorMessage(save.error)}</span>}
          {test.isError && <span className="form-error">{errorMessage(test.error)}</span>}
        </div>
        {test.data && (
          <p className="form-success">
            Verbonden. Modellen:{' '}
            {test.data.models.length
              ? test.data.models.map((m, i) => (
                  <span key={m}>
                    {i > 0 && ', '}
                    <button type="button" className="link-button" onClick={() => setForm({ ...cur, model: m })} title="Als standaardmodel kiezen">
                      {m}
                    </button>
                  </span>
                ))
              : 'geen (laad er een in LM Studio)'}
          </p>
        )}
      </form>
    </Box>
  )
}

function NewBot({ onMade }: { onMade: (b: AdminBot) => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<{ username: string; name: string; kind: BotKind }>({ username: '', name: '', kind: 'taken' })
  const make = useMutation({
    mutationFn: () => api<AdminBot>('/admin/bots', { method: 'POST', body: form }),
    onSuccess: (b) => {
      setForm({ username: '', name: '', kind: 'taken' })
      void queryClient.invalidateQueries({ queryKey: KEY })
      onMade(b)
    },
  })
  const fields = make.error instanceof ApiRequestError ? make.error.fields : {}
  return (
    <Box title="Nieuwe bot" icon="add">
      <form
        className="bh-form"
        onSubmit={(e) => {
          e.preventDefault()
          make.mutate()
        }}
      >
        <div className="settings-grid">
          <Field label="Gebruikersnaam" error={fields.username}>
            <input className="text-box" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="bijv. kuddes" required />
          </Field>
          <Field label="Naam" error={fields.name}>
            <input className="text-box" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="bijv. Kuddes" required />
          </Field>
        </div>
        <div className="bot-kinds" role="radiogroup" aria-label="Soort bot">
          {(Object.keys(BOT_KINDS) as BotKind[]).map((k) => (
            <label key={k} className={form.kind === k ? 'on' : undefined}>
              <input type="radio" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} />
              <FarmIcon name={BOT_KINDS[k].icon} />
              <span>
                <b>{BOT_KINDS[k].name}</b>
                <small className="muted">{BOT_KINDS[k].hint}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="muted">
          De bot krijgt een eigen profiel met een “Bot”-label. Hij staat uit tot je hem hebt ingesteld; via Leden kun je inloggen als de bot om zijn profiel en foto te regelen.
        </p>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={make.isPending}>
            <FarmIcon name="add" /> Bot maken
          </Button>
          {make.isError && !fields.username && !fields.name && <span className="form-error">{errorMessage(make.error)}</span>}
        </div>
      </form>
    </Box>
  )
}

/** What's saved: the kind is chosen when the bot is made and doesn't change. */
const withoutKind = (s: BotSettings) => ({
  enabled: s.enabled,
  options: s.options,
  // Empty lines in the word list don't count
  moderation: { ...s.moderation, words: s.moderation.words.map((w) => w.trim()).filter(Boolean) },
  rules: s.rules,
  instructions: s.instructions,
  model: s.model,
  triggers: s.triggers,
  abilities: s.abilities,
  dailyAt: s.dailyAt,
})

const settingsOf = (b: AdminBot): BotSettings => ({
  kind: b.kind,
  enabled: b.enabled,
  options: b.options,
  moderation: b.moderation,
  rules: b.rules,
  instructions: b.instructions,
  model: b.model,
  triggers: b.triggers,
  abilities: b.abilities,
  dailyAt: b.dailyAt,
})

function BotEditor({ bot }: { bot: AdminBot }) {
  const queryClient = useQueryClient()
  const [s, setS] = useState<BotSettings>(() => settingsOf(bot))
  const dirty = JSON.stringify(s) !== JSON.stringify(settingsOf(bot))
  const body = withoutKind(s)
  const save = useMutation({
    mutationFn: () => api<AdminBot>(`/admin/bots/${bot.user.username}`, { method: 'PATCH', body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
  const remove = useMutation({
    mutationFn: () => api<void>(`/admin/bots/${bot.user.username}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  })
  const setOption = (patch: Partial<BotSettings['options']>) => setS({ ...s, options: { ...s.options, ...patch } })
  const setRule = (id: string, patch: Partial<BotRule>) => setS({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <div className="bot-editor">
      <label className="gadget-toggle">
        <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> <b>Aan</b>: de bot doet echt wat hieronder staat
      </label>

      <h3>Gedrag</h3>
      <div className="bot-options">
        <label>
          <input type="checkbox" checked={s.options.acceptFriends} onChange={(e) => setOption({ acceptFriends: e.target.checked })} /> Vriendschapsverzoeken automatisch accepteren
          <small className="muted">Ook de verzoeken die nu al wachten, zodra je opslaat.</small>
        </label>
        <label>
          <input type="checkbox" checked={s.options.readMessages} onChange={(e) => setOption({ readMessages: e.target.checked })} /> Berichten automatisch als gelezen markeren
          <small className="muted">Zo loopt het postvak van de bot niet vol met ongelezen berichten.</small>
        </label>
        <label>
          <input type="checkbox" checked={s.options.openToAll} onChange={(e) => setOption({ openToAll: e.target.checked })} /> Iedereen mag de bot berichten en knuffels sturen
          <small className="muted">Zet de privacy-instellingen van de bot op “iedereen”.</small>
        </label>
        <div className="bot-rule-line">
          <span>Wacht</span>
          <select className="text-box" value={s.options.delaySeconds} onChange={(e) => setOption({ delaySeconds: Number(e.target.value) })} aria-label="Wachttijd">
            {BOT_DELAYS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'niet' : d < 60 ? `${d} seconden` : `${d / 60} ${d === 60 ? 'minuut' : 'minuten'}`}
              </option>
            ))}
          </select>
          <span>voor hij reageert, en doet hooguit</span>
          <input
            className="text-box bot-number"
            type="number"
            min={1}
            max={BOT_LIMITS.actionsPerHour}
            value={s.options.maxPerHour}
            onChange={(e) => setOption({ maxPerHour: Math.max(1, Math.min(BOT_LIMITS.actionsPerHour, Number(e.target.value) || 1)) })}
            aria-label="Hoeveel dingen per uur"
          />
          <span>dingen per uur.</span>
        </div>
      </div>

      {s.kind === 'taken' ? (
        <>
          <h3>Regels</h3>
          {s.rules.length === 0 && <p className="muted">Nog geen regels.</p>}
          {s.rules.map((r) => (
            <fieldset key={r.id} className={r.enabled ? 'bot-rule' : 'bot-rule off'}>
              <div className="bot-rule-line">
                <input type="checkbox" checked={r.enabled} onChange={(e) => setRule(r.id, { enabled: e.target.checked })} aria-label="Regel aan" />
                <span>Als</span>
                <select
                  className="text-box"
                  value={r.trigger}
                  onChange={(e) => {
                    const trigger = e.target.value as BotTrigger
                    // "Elke dag" has nobody to send a knuffel or message to
                    setRule(r.id, { trigger, action: !BOT_TRIGGERS[trigger].member && BOT_ACTIONS[r.action].member ? 'wiewatwaar' : r.action })
                  }}
                >
                  {TRIGGER_KEYS.map((t) => (
                    <option key={t} value={t}>
                      {BOT_TRIGGERS[t].name}
                    </option>
                  ))}
                </select>
                {r.trigger === 'dagelijks' && (
                  <input className="text-box bot-time" type="time" value={r.time} onChange={(e) => setRule(r.id, { time: e.target.value })} aria-label="Tijd" />
                )}
                <span>dan</span>
                <select className="text-box" value={r.action} onChange={(e) => setRule(r.id, { action: e.target.value as BotAction })}>
                  {ACTION_KEYS.map((a) => (
                    <option key={a} value={a} disabled={BOT_ACTIONS[a].member && !BOT_TRIGGERS[r.trigger].member}>
                      {BOT_ACTIONS[a].name}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-button" onClick={() => setS({ ...s, rules: s.rules.filter((x) => x.id !== r.id) })} aria-label="Regel weghalen">
                  <FarmIcon name="cross" />
                </button>
              </div>
              <textarea
                className="text-box"
                rows={2}
                maxLength={BOT_LIMITS.text}
                value={r.text}
                onChange={(e) => setRule(r.id, { text: e.target.value })}
                placeholder="Welkom op Kuddes, {voornaam}!"
              />
              <small className="muted">{BOT_TRIGGERS[r.trigger].hint}</small>
            </fieldset>
          ))}
          {s.rules.length < BOT_LIMITS.rules && (
            <Button
              onClick={() =>
                setS({
                  ...s,
                  rules: [...s.rules, { id: newRuleId(), trigger: 'nieuw_lid', action: 'knuffel', text: 'Welkom op Kuddes, {voornaam}!', time: '09:00', enabled: true }],
                })
              }
            >
              <FarmIcon name="add" /> Regel toevoegen
            </Button>
          )}
          <p className="muted">
            In de tekst wordt{' '}
            {Object.entries(BOT_PLACEHOLDERS).map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ', '}
                <code>{k}</code> de {v}
              </span>
            ))}{' '}
            van het lid. Wie alleen knuffels of berichten van vrienden wil, slaat de bot over.
          </p>
        </>
      ) : (
        <>
          <Field label="Instructies" hint="wie de bot is, hoe hij praat, wat hij wel en niet doet">
            <textarea
              className="text-box"
              rows={6}
              maxLength={BOT_LIMITS.instructions}
              value={s.instructions}
              onChange={(e) => setS({ ...s, instructions: e.target.value })}
              placeholder="Je bent Kees, de vrolijke conciërge van Kuddes. Je helpt leden de weg te vinden op de site en houdt het gezellig…"
            />
          </Field>
          <Field label="Model" hint="leeg: het standaardmodel van LM Studio">
            <input className="text-box" value={s.model} maxLength={BOT_LIMITS.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
          </Field>
          <h3>Reageert op</h3>
          <div className="bot-checks">
            {TRIGGER_KEYS.map((t) => (
              <label key={t} title={BOT_TRIGGERS[t].hint}>
                <input type="checkbox" checked={s.triggers.includes(t)} onChange={() => setS({ ...s, triggers: toggle(s.triggers, t) })} /> {BOT_TRIGGERS[t].name}
                {t === 'dagelijks' && s.triggers.includes(t) && (
                  <input className="text-box bot-time" type="time" value={s.dailyAt} onChange={(e) => setS({ ...s, dailyAt: e.target.value })} aria-label="Tijd" />
                )}
              </label>
            ))}
          </div>
          <h3>Mag</h3>
          <div className="bot-checks">
            {(Object.keys(BOT_ABILITIES) as BotAbility[]).map((a) => (
              <label key={a} title={BOT_ABILITIES[a].hint}>
                <input type="checkbox" checked={s.abilities.includes(a)} onChange={() => setS({ ...s, abilities: toggle(s.abilities, a) })} /> {BOT_ABILITIES[a].name}
              </label>
            ))}
          </div>
          <p className="muted">
            Wat de bot zelf antwoordt, komt terecht waar het hoort: een bericht terug, een knuffel terug, of een WieWatWaar bij “Elke dag”. Met wat hij mag, kan hij daarnaast zelf
            iets doen (hooguit drie dingen per keer, {BOT_LIMITS.actionsPerHour} per uur).
          </p>
        </>
      )}

      <Moderation value={s.moderation} onChange={(moderation) => setS({ ...s, moderation })} />

      <TryBot bot={bot} settings={s} />

      <div className="account-actions">
        <Button variant="cta" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          Opslaan
        </Button>
        <Button
          onClick={() =>
            confirm(`Inloggen als ${bot.user.nickname}? Je wordt uitgelogd als beheerder.`) &&
            api(`/admin/users/${bot.user.username}/login-as`, { method: 'POST' }).then(() => location.assign(`/profiel/${bot.user.username}`))
          }
        >
          <FarmIcon name="door_out" /> Inloggen als
        </Button>
        <Button onClick={() => confirm(`${bot.user.nickname} verwijderen, met alles wat de bot plaatste?`) && remove.mutate()} disabled={remove.isPending}>
          <FarmIcon name="cross" /> Verwijderen
        </Button>
        {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
        {save.isSuccess && !dirty && <span className="form-success">Opgeslagen</span>}
      </div>
    </div>
  )
}

/** Toezicht: the word list and behaviours the bot watches for, and what it does then. */
function Moderation({ value: m, onChange }: { value: BotModeration; onChange: (m: BotModeration) => void }) {
  const [sample, setSample] = useState('')
  const hits = sample ? wordsIn(sample, m.words.map((w) => w.trim()).filter(Boolean)) : []
  const setBehaviour = (b: Behaviour, patch: Partial<BotModeration['behaviours'][Behaviour]>) =>
    onChange({ ...m, behaviours: { ...m.behaviours, [b]: { ...m.behaviours[b], ...patch } } })
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  return (
    <div className="bot-watch">
      <h3>Toezicht</h3>
      <label className="gadget-toggle">
        <input type="checkbox" checked={m.enabled} onChange={(e) => onChange({ ...m, enabled: e.target.checked })} /> <b>Houdt toezicht</b> op wat leden plaatsen waar anderen het
        zien
      </label>
      <p className="muted">
        Privéberichten leest de bot nooit, en jij en andere bots worden overgeslagen. Staat toezicht bij meer bots aan, dan doet alleen de eerste het, zodat niemand twee
        waarschuwingen krijgt.
      </p>
      {m.enabled && (
        <>
          <div className="bot-watch-cols">
            <Field label="Woordenlijst" hint="één per regel; * is alles, bijv. kut*">
              <textarea
                className="text-box"
                rows={8}
                value={m.words.join('\n')}
                onChange={(e) => onChange({ ...m, words: e.target.value.split('\n').slice(0, MODERATION_LIMITS.words) })}
                spellCheck={false}
              />
            </Field>
            <div className="bot-watch-side">
              <Field label="Probeer een tekst">
                <input className="text-box" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="bijv. wat een k u u t dag" />
              </Field>
              {sample && (hits.length ? <p className="form-error">Opgemerkt: {hits.join(', ')}</p> : <p className="form-success">Niets opgemerkt.</p>)}
              <p className="muted">Hoofdletters, accenten, spaties tussen de letters (k u t), herhaalde letters (kuuut) en cijfers voor letters (1d10ot) worden ook herkend.</p>
            </div>
          </div>

          <h3>Waar</h3>
          <div className="bot-checks">
            {(Object.keys(WATCH_PLACES) as WatchPlace[]).map((p) => (
              <label key={p}>
                <input type="checkbox" checked={m.places.includes(p)} onChange={() => onChange({ ...m, places: toggle(m.places, p) })} /> {WATCH_PLACES[p]}
              </label>
            ))}
          </div>

          <h3>Gedrag</h3>
          <div className="bot-behaviours">
            {(Object.keys(BEHAVIOURS) as Behaviour[]).map((b) => {
              const def = BEHAVIOURS[b]
              const rule = m.behaviours[b]
              return (
                <div key={b} className={rule.on ? 'bot-rule-line' : 'bot-rule-line off'}>
                  <label>
                    <input type="checkbox" checked={rule.on} onChange={(e) => setBehaviour(b, { on: e.target.checked })} /> <b>{def.name}</b>
                  </label>
                  {def.count && (
                    <input
                      className="text-box bot-number"
                      type="number"
                      min={1}
                      max={MODERATION_LIMITS.count}
                      value={rule.count}
                      onChange={(e) => setBehaviour(b, { count: Math.max(1, Math.min(MODERATION_LIMITS.count, Number(e.target.value) || 1)) })}
                      aria-label={`${def.name}: aantal`}
                    />
                  )}
                  {def.minutes && (
                    <>
                      <span>in</span>
                      <input
                        className="text-box bot-number"
                        type="number"
                        min={1}
                        max={MODERATION_LIMITS.minutes}
                        value={rule.minutes}
                        onChange={(e) => setBehaviour(b, { minutes: Math.max(1, Math.min(MODERATION_LIMITS.minutes, Number(e.target.value) || 1)) })}
                        aria-label={`${def.name}: minuten`}
                      />
                      <span>min.</span>
                    </>
                  )}
                  <small className="muted">{def.hint.replace('{count}', String(rule.count)).replace('{minutes}', String(rule.minutes))}</small>
                </div>
              )
            })}
          </div>

          <h3>Wat de bot dan doet</h3>
          <div className="bot-checks">
            <span>Bij een woord:</span>
            <label>
              <input type="checkbox" checked={m.onWord.warn} onChange={(e) => onChange({ ...m, onWord: { ...m.onWord, warn: e.target.checked } })} /> waarschuwen
            </label>
            <label title={`Kan bij: ${REMOVABLE_PLACES.map((p) => WATCH_PLACES[p].toLowerCase()).join(', ')}`}>
              <input type="checkbox" checked={m.onWord.remove} onChange={(e) => onChange({ ...m, onWord: { ...m.onWord, remove: e.target.checked } })} /> weghalen
            </label>
            <label>
              <input type="checkbox" checked={m.onWord.report} onChange={(e) => onChange({ ...m, onWord: { ...m.onWord, report: e.target.checked } })} /> melden bij jou
            </label>
          </div>
          <div className="bot-checks">
            <span>Bij gedrag:</span>
            <label>
              <input type="checkbox" checked={m.onBehaviour.warn} onChange={(e) => onChange({ ...m, onBehaviour: { ...m.onBehaviour, warn: e.target.checked } })} /> waarschuwen
            </label>
            <label>
              <input type="checkbox" checked={m.onBehaviour.report} onChange={(e) => onChange({ ...m, onBehaviour: { ...m.onBehaviour, report: e.target.checked } })} /> melden bij
              jou
            </label>
          </div>
          <p className="muted">
            Weghalen kan bij {REMOVABLE_PLACES.map((p) => WATCH_PLACES[p].toLowerCase()).join(', ')}. Een melding komt in Beheer → Meldingen. Iemand krijgt voor hetzelfde hooguit
            één waarschuwing per tien minuten.
          </p>
          <Field label="De waarschuwing" hint="{voornaam}, {reden} en {waar} worden ingevuld">
            <textarea className="text-box" rows={3} maxLength={MODERATION_LIMITS.warning} value={m.warning} onChange={(e) => onChange({ ...m, warning: e.target.value })} />
          </Field>
          <div className="bot-rule-line">
            <span>Melden bij jou als iemand</span>
            <input
              className="text-box bot-number"
              type="number"
              min={0}
              max={50}
              value={m.reportAfter}
              onChange={(e) => onChange({ ...m, reportAfter: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
              aria-label="Aantal waarschuwingen"
            />
            <span>waarschuwingen heeft in 30 dagen (0: niet).</span>
          </div>
        </>
      )}
    </div>
  )
}

/** The warnings bots gave lately, and taking back one that wasn't fair. */
function Warnings() {
  const queryClient = useQueryClient()
  const key = ['admin', 'bots', 'warnings']
  const { data = [] } = useQuery({ queryKey: key, queryFn: () => api<BotWarning[]>('/admin/bots/warnings') })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/bots/warnings/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  if (!data.length) return null
  return (
    <Box title={`Waarschuwingen (${data.length})`} icon="exclamation">
      <table className="bh-table">
        <thead>
          <tr>
            <th>Wie</th>
            <th>Waarom</th>
            <th>Waar</th>
            <th>Wanneer</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.map((w) => (
            <tr key={w.id}>
              <td>
                <Link to={`/profiel/${w.user.username}`}>{w.user.nickname}</Link>
              </td>
              <td>{w.reason}</td>
              <td>{w.place}</td>
              <td className="bh-nowrap">{formatTime(w.createdAt)}</td>
              <td>
                <Button onClick={() => remove.mutate(w.id)} disabled={remove.isPending} title="Telt dan niet meer mee">
                  Intrekken
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}

/** A dry run with what's in the form now: shows what the bot would say and do, without doing it. */
function TryBot({ bot, settings }: { bot: AdminBot; settings: BotSettings }) {
  const [trigger, setTrigger] = useState<BotTrigger>(settings.kind === 'ai' ? 'bericht' : 'nieuw_lid')
  const [text, setText] = useState('Hoi! Wat kan ik allemaal doen op Kuddes?')
  const body = withoutKind(settings)
  const run = useMutation({
    mutationFn: () => api<{ steps: Step[] }>(`/admin/bots/${bot.user.username}/test`, { method: 'POST', body: { trigger, subject: 'Vraagje', text, settings: body } }),
  })
  return (
    <div className="bot-try">
      <h3>Proberen</h3>
      <div className="bot-rule-line">
        <span>Alsof</span>
        <select className="text-box" value={trigger} onChange={(e) => setTrigger(e.target.value as BotTrigger)}>
          {TRIGGER_KEYS.map((t) => (
            <option key={t} value={t}>
              {BOT_TRIGGERS[t].name}
            </option>
          ))}
        </select>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>
          <FarmIcon name="control_play_blue" /> {run.isPending ? 'Bezig…' : 'Proberen'}
        </Button>
      </div>
      {(trigger === 'bericht' || trigger === 'knuffel') && (
        <textarea className="text-box" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Wat jij de bot stuurt" />
      )}
      <small className="muted">Jij speelt het lid. Er wordt niets echt gedaan of verstuurd.</small>
      {run.isError && <p className="form-error">{errorMessage(run.error)}</p>}
      {run.data &&
        (run.data.steps.length === 0 ? (
          <p className="muted">De bot zou niets doen.</p>
        ) : (
          <ol className="bot-steps">
            {run.data.steps.map((st, i) => (
              <li key={i}>
                {st.kind === 'antwoord' ? (
                  <>
                    <b>Antwoord:</b> <span className="bot-said">{st.text}</span>
                  </>
                ) : (
                  <>
                    <b>{st.name}</b> {typeof st.args.tekst === 'string' && <span className="bot-said">{st.args.tekst}</span>}
                    {typeof st.args.tekst !== 'string' && Object.keys(st.args).length > 0 && <code>{JSON.stringify(st.args)}</code>} <small className="muted">{st.result}</small>
                  </>
                )}
              </li>
            ))}
          </ol>
        ))}
    </div>
  )
}
