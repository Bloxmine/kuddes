import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FEDERATION_MODES, SERVER_INFO_LIMITS, SERVER_POLICIES, type FederationMode, type FederationOverview, type ServerInfoInput, type ServerPolicy } from '../../../shared/federation'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { formatTime } from '../../lib/time'
import './Federation.css'

const KEY = ['admin', 'federation']
const L = SERVER_INFO_LIMITS

/** Beheer → Servers: this server's name, admin and rules, how it federates, and the other servers it knows. */
export function FederationAdmin() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: KEY, queryFn: () => api<FederationOverview>('/admin/federation') })
  const [form, setForm] = useState<ServerInfoInput | null>(null)
  const [domain, setDomain] = useState('')
  const [policy, setPolicy] = useState<ServerPolicy>('geblokkeerd')
  const [reason, setReason] = useState('')
  const done = (r: FederationOverview) => {
    queryClient.setQueryData(KEY, r)
    void queryClient.invalidateQueries({ queryKey: ['server'] })
  }
  const saveInfo = useMutation({
    mutationFn: (next: ServerInfoInput) => api<FederationOverview>('/admin/federation/info', { method: 'PUT', body: next }),
    onSuccess: (r) => {
      setForm(null)
      done(r)
    },
  })
  const setServer = useMutation({
    mutationFn: (v: { domain: string; policy: ServerPolicy; reason: string }) =>
      api<FederationOverview>(`/admin/federation/servers/${encodeURIComponent(v.domain)}`, { method: 'PUT', body: { policy: v.policy, reason: v.reason } }),
    onSuccess: (r) => {
      setDomain('')
      setReason('')
      done(r)
    },
  })
  const forget = useMutation({
    mutationFn: (d: string) => api<FederationOverview>(`/admin/federation/servers/${encodeURIComponent(d)}`, { method: 'DELETE' }),
    onSuccess: done,
  })
  if (!data) return <p className="muted">Laden…</p>
  const { domain: own, ...saved } = data.info
  const f = form ?? saved
  const set = (patch: Partial<ServerInfoInput>) => setForm({ ...f, ...patch })

  const block = (d: string, p: ServerPolicy) => {
    if (p === 'geblokkeerd' && !confirm(`${d} blokkeren? Alle accounts van die server en wat ze hier achterlieten verdwijnen, en vriendschappen met leden hier stoppen.`)) return
    setServer.mutate({ domain: d, policy: p, reason: data.servers.find((s) => s.domain === d)?.reason ?? '' })
  }

  return (
    <>
      <Box title="Deze server" icon="world">
        <p className="muted">
          Kuddes is een netwerk van servers zonder centrale eigenaar. Elke server heeft zijn eigen leden, beheerder en regels, en leden van verschillende servers worden gewoon vrienden
          met elkaar (als <b>naam@{own}</b>). De servers praten met elkaar via Weide, een open standaard bovenop ActivityPub, dus ook met Mastodon en dergelijke.
        </p>
        <div className="fd-grid">
          <Field label="Naam van de server">
            <input className="text-box" maxLength={L.name} value={f.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Adres" hint="uit PUBLIC_URL, vast">
            <input className="text-box" value={own} disabled />
          </Field>
          <Field label="Beheerder" hint="jouw naam of bijnaam; ook in de privacyverklaring">
            <input className="text-box" maxLength={L.adminName} value={f.adminName} onChange={(e) => set({ adminName: e.target.value })} />
          </Field>
          <Field label="Contactadres" hint="voor privacyvragen en meldingen">
            <input className="text-box" type="email" maxLength={L.contactEmail} value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
          </Field>
          <Field label="Land">
            <input className="text-box" maxLength={L.country} value={f.country} onChange={(e) => set({ country: e.target.value })} />
          </Field>
          <Field label="Hosting" hint="voor de privacyverklaring, bijv. Strato (Duitsland)">
            <input className="text-box" maxLength={L.hosting} value={f.hosting} onChange={(e) => set({ hosting: e.target.value })} />
          </Field>
          <Field label="Maildienst" hint="bijv. Brevo (Frankrijk); leeg als er geen is">
            <input className="text-box" maxLength={L.mailService} value={f.mailService} onChange={(e) => set({ mailService: e.target.value })} />
          </Field>
        </div>
        <Field label="Over deze server" hint="op de pagina Over en voor andere servers">
          <textarea className="text-box" rows={2} maxLength={L.description} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label="Eigen regels" hint="bovenop de gebruikersovereenkomst; één per regel">
          <textarea className="text-box" rows={4} maxLength={L.rules} value={f.rules} onChange={(e) => set({ rules: e.target.value })} />
        </Field>
        <h3 className="fd-h">Federatie</h3>
        <div className="fd-modes">
          {(Object.entries(FEDERATION_MODES) as [FederationMode, (typeof FEDERATION_MODES)[FederationMode]][]).map(([k, m]) => (
            <label key={k} className={f.federation === k ? 'on' : undefined}>
              <input type="radio" name="federation" checked={f.federation === k} onChange={() => set({ federation: k })} />
              <b>{m.name}</b> <span className="muted">{m.hint}</span>
            </label>
          ))}
        </div>
        <label className="fd-check">
          <input type="checkbox" checked={f.fediverse} disabled={f.federation === 'uit'} onChange={(e) => set({ fediverse: e.target.checked })} />
          <span>
            <b>Ook buiten Kuddes</b> <span className="muted">leden kunnen accounts op Mastodon en andere ActivityPub-servers volgen; hun berichten staan in Overzicht → Fediverse</span>
          </span>
        </label>
        {form && (
          <div className="account-actions">
            <Button variant="cta" onClick={() => saveInfo.mutate(form)} disabled={saveInfo.isPending}>
              Opslaan
            </Button>
            <Button onClick={() => setForm(null)}>Annuleren</Button>
            {saveInfo.isError && <span className="form-error">{errorMessage(saveInfo.error)}</span>}
          </div>
        )}
      </Box>

      <Box title={`Andere servers (${data.servers.length})`} icon="world_link">
        {data.queue.waiting > 0 && (
          <p className="muted">
            <FarmIcon name="clock" /> {data.queue.waiting} {data.queue.waiting === 1 ? 'bericht wacht' : 'berichten wachten'} op verzending
            {data.queue.failing > 0 && `, waarvan ${data.queue.failing} opnieuw (die server is misschien even weg)`}.
          </p>
        )}
        {data.servers.length ? (
          <ul className="fd-servers">
            {data.servers.map((s) => (
              <li key={s.domain} className={`fd-server ${s.policy}`}>
                <div className="fd-server-head">
                  <FarmIcon name={SERVER_POLICIES[s.policy].icon} />
                  <b>{s.domain}</b>
                  <span className="muted">
                    {s.weide ? 'Kuddes (Weide)' : (s.software ?? 'ActivityPub')}
                    {s.weide && s.software && ` · ${s.software}`}
                  </span>
                  {s.failingSince && <span className="bh-badge danger">onbereikbaar sinds {formatTime(s.failingSince)}</span>}
                </div>
                <p className="muted fd-server-stats">
                  {s.accounts} {s.accounts === 1 ? 'account' : 'accounts'} hier · {s.friendships} {s.friendships === 1 ? 'vriendschap' : 'vriendschappen'}
                  {s.lastSeenAt && ` · laatst gezien ${formatTime(s.lastSeenAt)}`}
                  {s.reason && ` · “${s.reason}”`}
                </p>
                <div className="fd-server-actions">
                  <select className="text-box" value={s.policy} onChange={(e) => block(s.domain, e.target.value as ServerPolicy)} disabled={setServer.isPending}>
                    {(Object.entries(SERVER_POLICIES) as [ServerPolicy, (typeof SERVER_POLICIES)[ServerPolicy]][]).map(([k, p]) => (
                      <option key={k} value={k}>
                        {p.name}: {p.hint}
                      </option>
                    ))}
                  </select>
                  {!s.accounts && (
                    <Button onClick={() => forget.mutate(s.domain)} disabled={forget.isPending}>
                      Vergeten
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nog geen. Servers verschijnen hier zodra een lid iemand van een andere server opzoekt of andersom.</p>
        )}
        {forget.isError && <p className="form-error">{errorMessage(forget.error)}</p>}

        <h3 className="fd-h">Een server vooraf instellen</h3>
        <form
          className="fd-add"
          onSubmit={(e) => {
            e.preventDefault()
            if (domain.trim()) setServer.mutate({ domain: domain.trim(), policy, reason })
          }}
        >
          <input className="text-box" placeholder="server.example" value={domain} onChange={(e) => setDomain(e.target.value)} />
          <select className="text-box" value={policy} onChange={(e) => setPolicy(e.target.value as ServerPolicy)}>
            {(Object.entries(SERVER_POLICIES) as [ServerPolicy, (typeof SERVER_POLICIES)[ServerPolicy]][]).map(([k, p]) => (
              <option key={k} value={k}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="text-box" placeholder="reden (alleen voor jou)" maxLength={L.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" disabled={setServer.isPending || !domain.trim()}>
            Instellen
          </Button>
        </form>
        {setServer.isError && <p className="form-error">{errorMessage(setServer.error)}</p>}
        <p className="muted">Een blokkade geldt ook voor subdomeinen. Meldingen van leden over iemand van een andere server gaan ook naar die server, zonder wie het meldde.</p>
      </Box>
    </>
  )
}
