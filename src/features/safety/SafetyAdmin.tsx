import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { REPORT_KINDS, REPORT_REASONS, SAFETY_LIMITS, type ReportReason, type ReportedItem, type SafetySettings } from '../../../shared/safety'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import './Safety.css'

type SafetyState = { settings: SafetySettings; mail: boolean }

/** Beheer → Rustige stand: the quiet mode, when posts are hidden, and which mails the admin gets. */
export function SafetyAdmin() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin', 'safety'], queryFn: () => api<SafetyState>('/admin/safety') })
  const [form, setForm] = useState<SafetySettings | null>(null)
  const s = form ?? data?.settings
  const save = useMutation({
    mutationFn: (next: SafetySettings) => api<SafetyState>('/admin/safety', { method: 'PUT', body: next }),
    onSuccess: (r) => {
      setForm(null)
      queryClient.setQueryData(['admin', 'safety'], r)
      void queryClient.invalidateQueries({ queryKey: ['notice'] })
    },
  })
  if (!s) return <p className="muted">Laden…</p>
  const q = s.quiet
  const setQuiet = (patch: Partial<SafetySettings['quiet']>) => setForm({ ...s, quiet: { ...q, ...patch } })
  const setAlert = (k: keyof SafetySettings['alerts'], v: boolean) => setForm({ ...s, alerts: { ...s.alerts, [k]: v } })
  const number = (v: string, max: number, min = 0) => Math.max(min, Math.min(max, Number(v) || 0))

  return (
    <>
      <Box title="Rustige stand" icon="clock">
        <div className={q.on ? 'sf-switch on' : 'sf-switch'}>
          <div>
            <b>{q.on ? 'De rustige stand staat aan' : 'De rustige stand staat uit'}</b>
            <p className="muted">Voor als je een tijdje weg bent: Kuddes neemt minder risico en verbergt gemelde berichten sneller. Je hoeft er alleen af en toe naar te kijken.</p>
          </div>
          <Button variant={q.on ? 'default' : 'cta'} onClick={() => save.mutate({ ...s, quiet: { ...q, on: !q.on } })} disabled={save.isPending}>
            {q.on ? 'Uitzetten' : 'Aanzetten'}
          </Button>
        </div>
        <h3 className="sf-h">Zolang hij aan staat</h3>
        <div className="sf-rows">
          <label>
            Aanmelden
            <select className="text-box" value={q.signups} onChange={(e) => setQuiet({ signups: e.target.value as SafetySettings['quiet']['signups'] })}>
              <option value="normaal">gaat zoals altijd</option>
              <option value="wachtlijst">op de wachtlijst: jij keurt goed</option>
              <option value="dicht">dicht: geen nieuwe leden</option>
            </select>
          </label>
          <label>
            Nieuwe accounts kunnen de eerste
            <input
              className="text-box sf-num"
              type="number"
              min={0}
              max={SAFETY_LIMITS.minAgeDays}
              value={q.minAgeDays}
              onChange={(e) => setQuiet({ minAgeDays: number(e.target.value, SAFETY_LIMITS.minAgeDays) })}
            />
            dagen niets plaatsen of sturen (0: geen grens)
          </label>
          <label>
            <input type="checkbox" checked={q.pauseUploads} onChange={(e) => setQuiet({ pauseUploads: e.target.checked })} /> Uploaden staat uit (foto’s, video’s, muziek, geluiden)
          </label>
          <label>
            <input type="checkbox" checked={q.pauseKuddes} onChange={(e) => setQuiet({ pauseKuddes: e.target.checked })} /> Geen nieuwe Kuddes
          </label>
          <label>
            Een bericht wordt verborgen na
            <input
              className="text-box sf-num"
              type="number"
              min={1}
              max={SAFETY_LIMITS.hideAfter}
              value={q.hideAfter}
              onChange={(e) => setQuiet({ hideAfter: number(e.target.value, SAFETY_LIMITS.hideAfter, 1) })}
            />
            meldingen (normaal {s.hideAfter})
          </label>
        </div>
        <Field label="Melding bovenaan elke pagina" hint="leeg: geen melding">
          <textarea className="text-box" rows={2} maxLength={SAFETY_LIMITS.notice} value={q.notice} onChange={(e) => setQuiet({ notice: e.target.value })} />
        </Field>
        <p className="muted">Jij en de bots merken niets van de rustige stand. “Probleem melden” en “Melden” werken altijd, ook voor nieuwe leden.</p>
      </Box>

      <Box title="Meldingen van leden" icon="flag_red">
        <div className="sf-rows">
          <label>
            Normaal wordt een bericht verborgen na
            <input
              className="text-box sf-num"
              type="number"
              min={1}
              max={SAFETY_LIMITS.hideAfter}
              value={s.hideAfter}
              onChange={(e) => setForm({ ...s, hideAfter: number(e.target.value, SAFETY_LIMITS.hideAfter, 1) })}
            />
            meldingen van verschillende leden
          </label>
        </div>
        <p className="muted">
          Bij{' '}
          {Object.values(REPORT_REASONS)
            .filter((r) => r.urgent)
            .map((r) => `“${r.name.toLowerCase()}”`)
            .join(' en ')}{' '}
          is één melding genoeg. Verborgen berichten blijven bewaard tot je ze terugzet of weghaalt (Beheer → Meldingen); de schrijver krijgt een bericht dat het even verborgen is.
          Profielen en privéberichten worden niet verborgen, alleen gemeld.
        </p>
      </Box>

      <Box title="Mails voor jou" icon="email">
        {!data?.mail && <p className="form-error">Mail is niet ingesteld op de server, dus deze mails gaan nu niet weg (zie DEPLOY.md).</p>}
        <div className="sf-rows">
          <label>
            <input type="checkbox" checked={s.alerts.urgent} onChange={(e) => setAlert('urgent', e.target.checked)} /> Meteen bij een dringende melding (strafbaar, gevaar voor een
            minderjarige)
          </label>
          <label>
            <input type="checkbox" checked={s.alerts.hidden} onChange={(e) => setAlert('hidden', e.target.checked)} /> Als een bericht verborgen is na meldingen
          </label>
          <label>
            <input type="checkbox" checked={s.alerts.warnings} onChange={(e) => setAlert('warnings', e.target.checked)} /> Als een lid veel waarschuwingen van een bot kreeg
          </label>
          <label>
            <input type="checkbox" checked={s.alerts.weekly} onChange={(e) => setAlert('weekly', e.target.checked)} /> Elke maandagochtend een overzicht van de week
          </label>
        </div>
        <p className="muted">Behalve dringende meldingen krijg je hooguit zes mails per uur.</p>
      </Box>

      {form && (
        <div className="account-actions sf-save">
          <Button variant="cta" onClick={() => save.mutate(form)} disabled={save.isPending}>
            Opslaan
          </Button>
          <Button onClick={() => setForm(null)}>Annuleren</Button>
          {save.isError && <span className="form-error">{errorMessage(save.error)}</span>}
        </div>
      )}
    </>
  )
}

/** Beheer → Meldingen, on top: posts members reported, with what to do about them. */
export function ReportedContent() {
  const queryClient = useQueryClient()
  const key = ['admin', 'content-reports']
  const { data = [] } = useQuery({ queryKey: key, queryFn: () => api<ReportedItem[]>('/admin/content-reports') })
  const act = useMutation({
    mutationFn: ({ item, what }: { item: ReportedItem; what: 'restore' | 'remove' | 'close' }) =>
      api<void>(`/admin/content-reports/${item.kind}/${item.targetId}/${what}`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  })
  if (!data.length) return null
  return (
    <Box title={`Gemelde berichten (${data.length})`} icon="flag_red">
      <ul className="sf-reports">
        {data.map((item) => {
          const urgent = !!(item.reasons.illegaal || item.reasons.minderjarige)
          return (
            <li key={`${item.kind}:${item.targetId}`} className={urgent ? 'urgent' : undefined}>
              <div className="sf-report-head">
                <b>{REPORT_KINDS[item.kind].name}</b>
                {item.author && (
                  <>
                    {' van '}
                    <Link to={`/profiel/${item.author.username}`}>{item.author.nickname}</Link>
                  </>
                )}
                {item.hidden && <span className="bh-badge danger">verborgen</span>}
                {urgent && <span className="bh-badge danger">dringend</span>}
                <span className="muted">
                  {' · '}
                  {item.reporters} {item.reporters === 1 ? 'melding' : 'meldingen'}, laatst {formatTime(item.lastAt)}
                </span>
              </div>
              <blockquote className="sf-excerpt">{item.excerpt || '(geen tekst)'}</blockquote>
              <p className="sf-why">
                {(Object.entries(item.reasons) as [ReportReason, number][]).map(([r, n], i) => (
                  <span key={r}>
                    {i > 0 && ', '}
                    {REPORT_REASONS[r].name}
                    {n > 1 && ` (${n}×)`}
                  </span>
                ))}
              </p>
              {item.notes.length > 0 && (
                <ul className="sf-notes">
                  {item.notes.map((n, i) => (
                    <li key={i}>“{n}”</li>
                  ))}
                </ul>
              )}
              <div className="bh-actions">
                {item.link && (
                  <Link to={item.link} className="btn">
                    <FarmIcon name="magnifier" /> Bekijken
                  </Link>
                )}
                {REPORT_KINDS[item.kind].hide ? (
                  <>
                    <Button onClick={() => act.mutate({ item, what: 'restore' })} disabled={act.isPending} title="De meldingen kloppen niet: het komt (weer) tevoorschijn">
                      <FarmIcon name="accept" /> {item.hidden ? 'Terugzetten' : 'Is in orde'}
                    </Button>
                    <Button onClick={() => confirm('Dit voorgoed weghalen?') && act.mutate({ item, what: 'remove' })} disabled={act.isPending}>
                      <FarmIcon name="bin" /> Weghalen
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => act.mutate({ item, what: 'close' })} disabled={act.isPending} title="Afgehandeld (blokkeer of waarschuw het lid zo nodig bij Leden)">
                    <FarmIcon name="accept" /> Afgehandeld
                  </Button>
                )}
                {item.author && (
                  <Link to={`/beheer?tab=leden&q=${encodeURIComponent(item.author.username)}`} className="btn">
                    <FarmIcon name="user" /> Lid bekijken in Leden
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {act.isError && <p className="form-error">{errorMessage(act.error)}</p>}
    </Box>
  )
}
