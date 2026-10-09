import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { AdminContent, AdminLogEntry, AdminMember, AdminNews, AdminOverview, AdminSettings, AdminReport, AdminUpload, AdminVideoRequest, ContentKind, UploadKind } from '../../shared/admin'
import { MUSIC_UPLOAD_REASONS } from '../../shared/music'
import { BLACKLIST_KINDS, BLACKLIST_LIMITS, type BlacklistEntry, type BlacklistKind } from '../../shared/blacklist'
import { IP_BAN_DURATIONS, IP_BAN_LIMITS, IP_BAN_SCOPES, type IpBan, type IpBanDuration, type IpBanScope } from '../../shared/ipBans'
import { RADIO_UPLOAD_REASONS, type RadioStation } from '../../shared/radio'
import { VIDEO_UPLOAD_REASONS } from '../../shared/videos'
import { CONTENT_KINDS, MEMBER_SORTS, UPLOAD_KINDS, type MemberSort } from '../../shared/admin'
import { SUGGESTION_NOTE_MAX, SUGGESTION_STATUSES, SUGGESTION_STATUS_KEYS, type SuggestionStatus } from '../../shared/suggestions'
import type { UserSummary } from '../../shared/api'
import { CategoryBar } from '../components/catalog/Catalog'
import { RequireAuth } from '../components/layout/RequireAuth'
import { Avatar } from '../components/ui/Avatar'
import { Box } from '../components/ui/Box'
import { Button } from '../components/ui/Button'
import { FarmIcon } from '../components/ui/FarmIcon'
import type { FarmIconName } from '../components/ui/farmIcons'
import { Field } from '../components/ui/Field'
import { Modal } from '../components/ui/Modal'
import { BotsAdmin } from '../features/bots/BotsAdmin'
import { ReportedContent, SafetyAdmin } from '../features/safety/SafetyAdmin'
import { AutomationsAdmin } from '../features/automations/AutomationsAdmin'
import { ApiRequestError, api, errorMessage } from '../lib/api'
import { formatDate, formatTime } from '../lib/time'
import { usePageTitle } from '../lib/usePageTitle'
import './AdminPage.css'
import { DateInput, DateTimeInput } from '../components/ui/DateInput'
import { ForumEditor } from '../features/forum/ForumEditor'
import '../features/forum/Forum.css'
import { FederationAdmin } from '../features/federation/FederationAdmin'

const TABS: { key: string; label: string; hint: string; icon: FarmIconName }[] = [
  { key: 'overzicht', label: 'Overzicht', hint: 'cijfers & acties', icon: 'chart_bar' },
  { key: 'nieuws', label: 'Nieuws', hint: 'berichten plaatsen', icon: 'newspaper' },
  { key: 'aanmeldingen', label: 'Aanmeldingen', hint: 'goedkeuren', icon: 'hourglass' },
  { key: 'leden', label: 'Leden', hint: 'zoeken & beheren', icon: 'group' },
  { key: 'dummies', label: 'Dummy-accounts', hint: 'de site vullen', icon: 'user_add' },
  { key: 'uploads', label: 'Uploads', hint: 'foto’s & bestanden', icon: 'images' },
  { key: 'inhoud', label: 'Inhoud', hint: 'berichten nakijken', icon: 'comment' },
  { key: 'meldingen', label: 'Meldingen', hint: 'wat leden meldden', icon: 'warning' },
  { key: 'video', label: 'Video-rechten', hint: 'mag uploaden', icon: 'camcorder' },
  { key: 'muziek', label: 'Muziek-rechten', hint: 'mag uploaden', icon: 'music' },
  { key: 'radio', label: 'Radio-rechten', hint: 'mag uitzenden', icon: 'transmit' },
  { key: 'forum', label: 'Forum', hint: 'secties & moderators', icon: 'table' },
  { key: 'rust', label: 'Rustige stand', hint: 'als je even weg bent', icon: 'clock' },
  { key: 'bots', label: 'Bots', hint: 'automatische accounts', icon: 'cog' },
  { key: 'automatiseringen', label: 'Automatiseringen', hint: 'als dit, dan dat', icon: 'lightning' },
  { key: 'zwartelijst', label: 'Zwarte lijst', hint: 'e-mail, namen & IP', icon: 'shield' },
  { key: 'servers', label: 'Servers', hint: 'deze server & federatie', icon: 'world' },
  { key: 'logboek', label: 'Logboek', hint: 'alle acties', icon: 'book' },
]

const adminKey = ['admin'] as const

function useAdminAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => api<unknown>(path, { method, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKey }),
  })
}

function Person({ user }: { user: UserSummary | null }) {
  if (!user) return <span className="muted">verwijderd lid</span>
  return (
    <Link to={`/profiel/${user.username}`} className="bh-person">
      <Avatar user={user} size="tiny" static />
      {user.nickname}
    </Link>
  )
}

const bytes = (n: number) => (n > 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n > 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`)

function Stat({ label, value, icon, warn }: { label: string; value: ReactNode; icon: FarmIconName; warn?: boolean }) {
  return (
    <div className={warn ? 'bh-stat warn' : 'bh-stat'}>
      <FarmIcon name={icon} size={32} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

function LogList({ entries }: { entries: AdminLogEntry[] }) {
  if (!entries.length) return <p className="empty">Nog niets gedaan.</p>
  return (
    <table className="bh-table">
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td className="bh-nowrap muted">{formatTime(e.createdAt)}</td>
            <td>
              <b>{e.action}</b> {e.target && <span className="muted">· {e.target}</span>}
              {e.details && <span className="bh-details">{e.details}</span>}
            </td>
            <td className="bh-nowrap muted">{e.admin ?? 'server'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// --------------------------------------------------------------- overview
function Overview() {
  const { data } = useQuery({ queryKey: [...adminKey, 'overview'], queryFn: () => api<AdminOverview>('/admin/overview'), refetchInterval: 30_000 })
  if (!data) return <p className="muted">Laden…</p>
  const c = data.counts
  return (
    <>
      <div className="bh-stats">
        <Stat label="leden" value={c.members} icon="group" />
        <Stat label="nieuw deze week" value={c.newThisWeek} icon="user_add" />
        <Stat label="nu online" value={c.onlineNow} icon="status_online" />
        <Stat label="open meldingen" value={c.openReports} icon="warning" warn={c.openReports > 0} />
        <Stat label="aanmeldingen" value={c.pendingSignups} icon="hourglass" warn={c.pendingSignups > 0} />
        <Stat label="upload-aanvragen" value={c.openVideoRequests} icon="camcorder" warn={c.openVideoRequests > 0} />
        <Stat label="WieWatWaars" value={c.statuses} icon="comment" />
        <Stat label="foto's" value={c.photos} icon="images" />
        <Stat label="video's" value={c.videos} icon="film" />
        <Stat label="kuddes" value={c.kuddes} icon="tag_blue" />
        <Stat label="forumberichten" value={c.forumPosts} icon="table" />
        <Stat label="geblokkeerd" value={c.blocked} icon="lock" />
        <Stat label="dummy-accounts" value={c.dummies} icon="user" />
        <Stat label="opslag uploads" value={bytes(c.uploadBytes)} icon="diskette" />
      </div>
      <div className="bh-cols">
        <Box title="Nieuwste leden" icon="group">
          <MemberTable members={data.newest} compact />
        </Box>
        <Box title="Laatste acties" icon="book">
          <LogList entries={data.log} />
        </Box>
      </div>
    </>
  )
}

// ------------------------------------------------------------------- news
const emptyNews = { title: '', label: 'Nieuws & updates', summary: '', body: '', bannerPath: null as string | null, published: true, publishedAt: '' }

/** Uploads a picture for the news; the server stores it under news/. */
const uploadNewsImage = (file: File) => {
  const form = new FormData()
  form.set('file', file)
  return api<{ path: string; url: string }>('/admin/news/images', { method: 'POST', form })
}

function toLocal(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function NewsForm({ item, onDone }: { item?: AdminNews; onDone: () => void }) {
  const action = useAdminAction()
  const [form, setForm] = useState(
    item ? { title: item.title, label: item.label, summary: item.summary, body: item.body, bannerPath: item.bannerPath, published: item.published, publishedAt: toLocal(item.publishedAt) } : emptyNews,
  )
  const [bannerUrl, setBannerUrl] = useState(item?.bannerUrl ?? null)
  const [bannerBusy, setBannerBusy] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const pickBanner = async (file: File | undefined) => {
    if (!file) return
    setBannerBusy(true)
    setBannerError(null)
    try {
      const up = await uploadNewsImage(file)
      setForm((f) => ({ ...f, bannerPath: up.path }))
      setBannerUrl(up.url)
    } catch (e) {
      setBannerError(errorMessage(e))
    } finally {
      setBannerBusy(false)
    }
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })
  const fields = action.error instanceof ApiRequestError ? action.error.fields : {}
  return (
    <form
      className="bh-form"
      onSubmit={(e) => {
        e.preventDefault()
        const body = { ...form, publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined }
        action.mutate({ path: item ? `/admin/news/${item.id}` : '/admin/news', method: item ? 'PATCH' : 'POST', body }, { onSuccess: onDone })
      }}
    >
      <div className="settings-grid">
        <Field label="Titel" error={fields.title}>
          <input className="text-box" value={form.title} onChange={set('title')} maxLength={120} required />
        </Field>
        <Field label="Label" hint="(boven de titel, bijv. Nieuw of Tip)">
          <input className="text-box" value={form.label} onChange={set('label')} maxLength={40} />
        </Field>
      </div>
      <Field label="Samenvatting" hint="(op de homepage)">
        <textarea className="text-box" rows={2} value={form.summary} onChange={set('summary')} maxLength={300} />
      </Field>
      <div className="field">
        <span>
          Bannerafbeelding <span className="hint">(breed, boven het bericht en in de preview als je het deelt)</span>
        </span>
        <div className="bh-banner">
          {bannerUrl ? <img src={bannerUrl} alt="" /> : <span className="bh-banner-empty muted">Geen banner</span>}
          <div className="bh-banner-actions">
            <label className="btn">
              <FarmIcon name="picture_add" /> {bannerBusy ? 'Uploaden…' : bannerUrl ? 'Andere banner' : 'Banner kiezen'}
              <input type="file" accept="image/*" hidden disabled={bannerBusy} onChange={(e) => { void pickBanner(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {bannerUrl && (
              <button type="button" className="link-button" onClick={() => { setForm((f) => ({ ...f, bannerPath: null })); setBannerUrl(null) }}>
                Weghalen
              </button>
            )}
          </div>
        </div>
        {bannerError && <p className="form-error">{bannerError}</p>}
      </div>
      <div className="field">
        <span>
          Bericht <span className="hint">(met opmaak, lijstjes, afbeeldingen, YouTube, knoppen en alles van Kuddes insluiten)</span>
        </span>
        <ForumEditor value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} rows={14} maxLength={20000} news={{ upload: async (file) => (await uploadNewsImage(file)).url }} />
        {fields.body && <p className="form-error">{fields.body}</p>}
      </div>
      <div className="settings-grid">
        <Field label="Publicatiedatum" hint="(leeg = nu; in de toekomst = ingepland)">
          <DateTimeInput value={form.publishedAt} defaultTime="09:00" onChange={(v) => setForm((f) => ({ ...f, publishedAt: v }))} />
        </Field>
        <label className="gadget-toggle bh-toggle">
          <input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Gepubliceerd (anders concept)
        </label>
      </div>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={action.isPending}>
          <FarmIcon name="diskette" /> {item ? 'Opslaan' : 'Plaatsen'}
        </Button>
        <Button onClick={onDone}>Annuleren</Button>
        {action.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(action.error)}</span>}
      </div>
    </form>
  )
}

function News() {
  const { data = [] } = useQuery({ queryKey: [...adminKey, 'news'], queryFn: () => api<AdminNews[]>('/admin/news') })
  const action = useAdminAction()
  const [editing, setEditing] = useState<number | 'nieuw' | null>(null)
  return (
    <Box title="Nieuws & updates" icon="newspaper" actions={
        <Button onClick={() => setEditing('nieuw')} disabled={editing !== null}>
          <FarmIcon name="add" /> Nieuw bericht
        </Button>
      }>
      {editing === 'nieuw' && <NewsForm onDone={() => setEditing(null)} />}
      <ul className="bh-list">
        {data.map((n) => (
          <li key={n.id}>
            {editing === n.id ? (
              <NewsForm item={n} onDone={() => setEditing(null)} />
            ) : (
              <div className="bh-row">
                <div>
                  <b>{n.title}</b>{' '}
                  {!n.published && <span className="bh-badge">concept</span>}
                  {n.published && new Date(n.publishedAt) > new Date() && <span className="bh-badge">ingepland</span>}
                  <span className="muted">
                    {n.label} · {formatDate(n.publishedAt)} {n.author && `· ${n.author}`}
                  </span>
                  <span className="bh-details">{n.summary}</span>
                </div>
                <span className="bh-actions">
                  {n.published && (
                    <Link to={`/nieuws/${n.slug}`} className="btn">
                      Bekijken
                    </Link>
                  )}
                  <Button onClick={() => setEditing(n.id)}>
                    <FarmIcon name="pencil" /> Bewerken
                  </Button>
                  <button type="button" className="icon-button" title="Verwijderen" onClick={() => confirm(`"${n.title}" verwijderen?`) && action.mutate({ path: `/admin/news/${n.id}`, method: 'DELETE' })}>
                    <FarmIcon name="bin" />
                  </button>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
  )
}

// ---------------------------------------------------------------- members
function MemberTable({ members, compact }: { members: AdminMember[]; compact?: boolean }) {
  const action = useAdminAction()
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null)
  const [banning, setBanning] = useState<AdminMember | null>(null)
  if (!members.length) return <p className="empty">Geen leden gevonden.</p>
  return (
    <>
      {banning && <IpBanDialog member={banning} onClose={() => setBanning(null)} />}
      {secret && (
        <p className="form-notice">
          <FarmIcon name="key" /> Nieuw wachtwoord voor <b>{secret.username}</b>: <code>{secret.password}</code> (alleen nu zichtbaar; geef het veilig door)
        </p>
      )}
      <table className="bh-table">
        <thead>
          <tr>
            <th>Lid</th>
            {!compact && <th>E-mail</th>}
            <th>Lid sinds</th>
            {!compact && <th>Laatst gezien</th>}
            {!compact && <th>Inhoud</th>}
          </tr>
        </thead>
        {/* Each member: the details, and under them a row with the buttons (which wrap on a narrow screen) */}
        {members.map((m) => (
          <tbody key={m.id} className={m.blockedAt ? 'bh-member blocked' : 'bh-member'}>
            <tr>
              <td>
                <Person user={m} /> <span className="muted">@{m.username}</span>
                <MemberBadges m={m} />
              </td>
              {!compact && (
                <td className="bh-email">
                  {m.email}
                  {m.lastIp && <small className="muted bh-ip">IP {m.lastIp}</small>}
                </td>
              )}
              <td className="bh-nowrap">{formatDate(m.createdAt)}</td>
              {!compact && <td className="bh-nowrap">{m.lastSeenAt ? formatTime(m.lastSeenAt) : '—'}</td>}
              {!compact && (
                <td className="bh-nowrap muted">
                  {m.counts.statuses} wwws · {m.counts.photos} foto's · {m.counts.videos} video's · {m.counts.forumPosts} forum
                </td>
              )}
            </tr>
            <tr>
              <td colSpan={compact ? 2 : 5}>
                <div className="bh-actions">
                  {!m.approved && (
                    <Button variant="cta" onClick={() => action.mutate({ path: `/admin/users/${m.username}/approve` })}>
                      <FarmIcon name="accept" /> Goedkeuren
                    </Button>
                  )}
                  {!m.isAdmin && (
                    <>
                      {m.approved && (
                        <Button
                          title="Terug op de wachtlijst: het profiel blijft, maar tot je opnieuw goedkeurt ziet dit lid alleen wat bezoekers zien"
                          onClick={() => {
                            if (confirm(`De goedkeuring van ${m.nickname} intrekken? Het account blijft bestaan; ${m.nickname} komt terug op de wachtlijst tot je opnieuw goedkeurt.`))
                              action.mutate({ path: `/admin/users/${m.username}/unapprove` })
                          }}
                        >
                          <FarmIcon name="hourglass" /> Goedkeuring intrekken
                        </Button>
                      )}
                      {m.blockedAt ? (
                        <Button onClick={() => action.mutate({ path: `/admin/users/${m.username}/block`, method: 'DELETE' })}>Deblokkeren</Button>
                      ) : (
                        <Button
                          onClick={() => {
                            const reason = prompt(`Waarom blokkeer je ${m.nickname}? (optioneel)`)
                            if (reason !== null) action.mutate({ path: `/admin/users/${m.username}/block`, body: { reason } })
                          }}
                        >
                          <FarmIcon name="lock" /> Blokkeren
                        </Button>
                      )}
                      <Button
                        title="Blokkeren, en het e-mailadres en de gebruikersnaam op de zwarte lijst zetten, zodat er geen nieuw account mee gemaakt kan worden"
                        onClick={() => {
                          const reason = prompt(`${m.nickname} op de zwarte lijst zetten? Het account wordt geblokkeerd en ${m.email} en @${m.username} kunnen geen nieuw account meer maken.\n\nWaarom? (optioneel)`)
                          if (reason !== null) action.mutate({ path: `/admin/users/${m.username}/blacklist`, body: { reason } })
                        }}
                      >
                        <FarmIcon name="shield" /> Zwarte lijst
                      </Button>
                      {m.ipBan ? (
                        <Button
                          title={`${m.ipBan.range} wordt niet meer geblokkeerd`}
                          onClick={() =>
                            confirm(`De IP-ban op ${m.ipBan!.range} opheffen? Die geldt voor iedereen op dat adres, niet alleen voor ${m.nickname}.`) &&
                            action.mutate({ path: `/admin/ip-bans/${m.ipBan!.id}`, method: 'DELETE' })
                          }
                        >
                          <FarmIcon name="world" /> IP-ban opheffen
                        </Button>
                      ) : (
                        m.lastIp && (
                          <Button title={`De verbinding van ${m.nickname} (${m.lastIp}) bannen`} onClick={() => setBanning(m)}>
                            <FarmIcon name="world" /> IP bannen
                          </Button>
                        )
                      )}
                      {!compact && (
                        <Button
                          title={m.videoUploadAllowed ? "Mag video's uploaden: klik om in te trekken" : "Mag geen video's uploaden: klik om toe te staan"}
                          onClick={() => action.mutate({ path: `/admin/users/${m.username}/video-access`, body: { allowed: !m.videoUploadAllowed } })}
                        >
                          <FarmIcon name={m.videoUploadAllowed ? 'camcorder' : 'lock'} /> {m.videoUploadAllowed ? 'Video: ja' : 'Video: nee'}
                        </Button>
                      )}
                      {!compact && (
                        <Button
                          title={m.musicUploadAllowed ? 'Mag muziek uploaden: klik om in te trekken' : 'Mag geen muziek uploaden: klik om toe te staan'}
                          onClick={() => action.mutate({ path: `/admin/users/${m.username}/music-access`, body: { allowed: !m.musicUploadAllowed } })}
                        >
                          <FarmIcon name={m.musicUploadAllowed ? 'music' : 'lock'} /> {m.musicUploadAllowed ? 'Muziek: ja' : 'Muziek: nee'}
                        </Button>
                      )}
                      {!compact && (
                        <Button
                          title={m.radioAllowed ? 'Mag radio maken: klik om in te trekken' : 'Mag geen radio maken: klik om toe te staan'}
                          onClick={() => action.mutate({ path: `/admin/users/${m.username}/radio-access`, body: { allowed: !m.radioAllowed } })}
                        >
                          <FarmIcon name={m.radioAllowed ? 'transmit' : 'lock'} /> {m.radioAllowed ? 'Radio: ja' : 'Radio: nee'}
                        </Button>
                      )}
                      {!compact && (
                        <Button
                          onClick={() =>
                            confirm(`Een nieuw wachtwoord maken voor ${m.nickname}? Het oude werkt dan niet meer.`) &&
                            api<{ password: string }>(`/admin/users/${m.username}/password`, { method: 'POST' }).then((r) => setSecret({ username: m.username, password: r.password }))
                          }
                        >
                          <FarmIcon name="key" /> Wachtwoord
                        </Button>
                      )}
                      {m.isDummy && (
                        <Button
                          onClick={() =>
                            confirm(`Inloggen als ${m.nickname}? Je wordt uitgelogd als beheerder.`) &&
                            api(`/admin/users/${m.username}/login-as`, { method: 'POST' }).then(() => location.assign(`/profiel/${m.username}`))
                          }
                        >
                          <FarmIcon name="door_out" /> Inloggen als
                        </Button>
                      )}
                      <button
                        type="button"
                        className="icon-button"
                        title="Verwijderen"
                        onClick={() => {
                          const typed = prompt(`${m.nickname} met alles wat die geplaatst heeft definitief verwijderen? Typ de gebruikersnaam (${m.username}) om te bevestigen.`)
                          if (typed !== null) action.mutate({ path: `/admin/users/${m.username}`, method: 'DELETE', body: { confirm: typed.trim().toLowerCase() } })
                        }}
                      >
                        <FarmIcon name="bin" />
                      </button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          </tbody>
        ))}
      </table>
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </>
  )
}

/** A normal account for someone (not a dummy): approved at once, with a password to pass on. */
function NewAccount() {
  const queryClient = useQueryClient()
  const empty = { name: '', username: '', email: '', password: '' }
  const [form, setForm] = useState(empty)
  const [made, setMade] = useState<{ username: string; password: string; generated: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const create = useMutation({
    mutationFn: () => api<{ username: string; password: string; generated: boolean }>('/admin/accounts', { method: 'POST', body: form }),
    onSuccess: (r) => {
      setMade(r)
      setCopied(false)
      setForm(empty)
      queryClient.invalidateQueries({ queryKey: adminKey })
    },
  })
  const fields = create.error instanceof ApiRequestError ? create.error.fields : {}
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })
  const loginText = made ? `Je account op Kuddes staat klaar!\n${location.origin}/inloggen\nGebruikersnaam: ${made.username}\nWachtwoord: ${made.password}\n(Verander je wachtwoord na het inloggen bij Instellingen.)` : ''
  return (
    <Box title="Account maken voor iemand" icon="user_add">
      <p className="muted">
        Een gewoon account (geen dummy) voor iemand die je kent. Het is meteen goedgekeurd, zonder wachtlijst, captcha of limiet, en krijgt het welkomstbericht. Laat
        het wachtwoord leeg voor een willekeurig wachtwoord.
      </p>
      <form
        className="bh-form"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <div className="settings-grid">
          <Field label="Naam" hint="(voor- en achternaam)" error={fields.name}>
            <input className="text-box" value={form.name} onChange={set('name')} maxLength={60} required autoComplete="off" />
          </Field>
          <Field label="Gebruikersnaam" error={fields.username}>
            <input className="text-box" value={form.username} onChange={set('username')} maxLength={20} required autoComplete="off" />
          </Field>
          <Field label="E-mailadres" error={fields.email}>
            <input className="text-box" type="email" value={form.email} onChange={set('email')} required autoComplete="off" />
          </Field>
          <Field label="Wachtwoord" hint="(leeg = willekeurig, anders minstens 8 tekens)" error={fields.password}>
            <input className="text-box" type="text" value={form.password} onChange={set('password')} autoComplete="new-password" />
          </Field>
        </div>
        <div className="account-actions">
          <Button variant="cta" type="submit" disabled={create.isPending}>
            <FarmIcon name="user_add" /> Account maken
          </Button>
          {create.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(create.error)}</span>}
        </div>
      </form>
      {made && (
        <div className="form-success bh-made">
          <p>
            <FarmIcon name="accept" /> Account <Link to={`/profiel/${made.username}`}>@{made.username}</Link> is gemaakt en goedgekeurd. Geef deze gegevens door
            {made.generated ? ' (het wachtwoord zie je maar één keer)' : ''}:
          </p>
          <pre className="bh-login">{loginText}</pre>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(loginText)
                setCopied(true)
              } catch {
                prompt('Kopieer de inloggegevens:', loginText.replace(/\n/g, ' · '))
              }
            }}
          >
            <FarmIcon name={copied ? 'accept' : 'page_white_put'} /> {copied ? 'Gekopieerd!' : 'Kopiëren'}
          </Button>
        </div>
      )}
    </Box>
  )
}

/** A member as a card, for the grid; "Beheren" shows them in the list with all the buttons. */
function MemberCard({ m, onManage }: { m: AdminMember; onManage: () => void }) {
  return (
    <article className={m.blockedAt ? 'bh-card blocked' : 'bh-card'}>
      <Avatar user={m} size="medium" />
      <div className="bh-card-name">
        <Link to={`/profiel/${m.username}`}>{m.nickname}</Link>
        <span className="muted">@{m.username}</span>
      </div>
      <MemberBadges m={m} />
      <dl className="bh-card-facts">
        <dt>Laatst gezien</dt>
        <dd>{m.lastSeenAt ? formatTime(m.lastSeenAt) : 'nog nooit'}</dd>
        <dt>Lid sinds</dt>
        <dd>{formatDate(m.createdAt)}</dd>
      </dl>
      <div className="bh-card-counts">
        <span title="WieWatWaars">
          <FarmIcon name="comment" /> {m.counts.statuses}
        </span>
        <span title="Foto's">
          <FarmIcon name="images" /> {m.counts.photos}
        </span>
        <span title="Video's">
          <FarmIcon name="film" /> {m.counts.videos}
        </span>
        <span title="Forumberichten">
          <FarmIcon name="table" /> {m.counts.forumPosts}
        </span>
      </div>
      <Button onClick={onManage}>
        <FarmIcon name="cog" /> Beheren
      </Button>
    </article>
  )
}

function MemberBadges({ m }: { m: AdminMember }) {
  return (
    <>
      {m.isAdmin && <span className="bh-badge admin">beheerder</span>}
      {m.isDummy && <span className="bh-badge">dummy</span>}
      {m.blockedAt && <span className="bh-badge danger" title={m.blockReason ?? ''}>geblokkeerd</span>}
      {m.ipBan && (
        <span className="bh-badge danger" title={`${m.ipBan.range}: ${IP_BAN_SCOPES[m.ipBan.scope].name.toLowerCase()}`}>
          IP geband {m.ipBan.expiresAt ? `tot ${formatTime(m.ipBan.expiresAt)}` : 'voor altijd'}
        </span>
      )}
      {m.forumBanned && <span className="bh-badge">forumban</span>}
      {!m.approved && !m.blockedAt && <span className="bh-badge danger">wacht op goedkeuring</span>}
    </>
  )
}

function Members() {
  // ?q= from a link elsewhere in Beheer (a reported post's writer) searches straight away
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [search, setSearch] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<MemberSort>('nieuw')
  const [grid, setGrid] = useState(false)
  const { data = [], isLoading } = useQuery({
    queryKey: [...adminKey, 'users', search, filter, sort],
    queryFn: () => api<AdminMember[]>(`/admin/users?${new URLSearchParams({ q: search, filter, sort })}`),
  })
  return (
    <>
      <NewAccount />
      <Box title="Leden" icon="group">
        <form
          className="bh-toolbar"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(q.trim())
          }}
        >
          <input className="text-box" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naam, gebruikersnaam of e-mail" aria-label="Zoek leden" />
          <Button type="submit">Zoeken</Button>
          {[
            ['', 'Iedereen'],
            ['wachtend', 'Wacht op goedkeuring'],
            ['geblokkeerd', 'Geblokkeerd'],
            ['dummies', 'Dummy-accounts'],
          ].map(([k, label]) => (
            <button key={k} type="button" className={filter === k ? 'layout-chip current' : 'layout-chip'} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </form>
        <div className="bh-toolbar">
          <label className="bh-sort">
            <span className="muted">Sorteren</span>
            <select className="text-box" value={sort} onChange={(e) => setSort(e.target.value as MemberSort)}>
              {(Object.keys(MEMBER_SORTS) as MemberSort[]).map((k) => (
                <option key={k} value={k}>
                  {MEMBER_SORTS[k]}
                </option>
              ))}
            </select>
          </label>
          <span className="bh-views" role="group" aria-label="Weergave">
            <button type="button" className={grid ? 'layout-chip' : 'layout-chip current'} aria-pressed={!grid} onClick={() => setGrid(false)}>
              <FarmIcon name="text_list_bullets" /> Lijst
            </button>
            <button type="button" className={grid ? 'layout-chip current' : 'layout-chip'} aria-pressed={grid} onClick={() => setGrid(true)}>
              <FarmIcon name="application_view_tile" /> Raster
            </button>
          </span>
        </div>
        {isLoading ? (
          <p className="muted">Laden…</p>
        ) : grid && data.length ? (
          <div className="bh-cards">
            {data.map((m) => (
              <MemberCard
                key={m.id}
                m={m}
                onManage={() => {
                  setQ(m.username)
                  setSearch(m.username)
                  setFilter('')
                  setGrid(false)
                }}
              />
            ))}
          </div>
        ) : (
          <MemberTable members={data} />
        )}
      </Box>
    </>
  )
}

/** How new members get in (by mail or the waitlist), and whether the mail relay works. */
function SignupSettings() {
  const queryClient = useQueryClient()
  const { data } = useQuery({ queryKey: [...adminKey, 'settings'], queryFn: () => api<AdminSettings>('/admin/settings') })
  const save = useMutation({
    mutationFn: (signupMode: AdminSettings['signupMode']) => api<AdminSettings>('/admin/settings', { method: 'PATCH', body: { signupMode } }),
    onSuccess: (s) => {
      queryClient.setQueryData([...adminKey, 'settings'], s)
      queryClient.invalidateQueries({ queryKey: ['auth-options'] })
    },
  })
  const test = useMutation({ mutationFn: () => api<{ to: string }>('/admin/settings/test-mail', { method: 'POST' }) })
  if (!data) return null
  const modes: { mode: AdminSettings['signupMode']; icon: FarmIconName; title: string; text: string }[] = [
    { mode: 'mail', icon: 'email_open', title: 'Bevestigen per e-mail', text: 'Nieuwe leden krijgen een mail met een link. Wie erop klikt, is binnen. Je kunt iemand ook zelf goedkeuren (bijvoorbeeld als de mail niet aankomt).' },
    { mode: 'approval', icon: 'hourglass', title: 'Goedkeuren door jou', text: 'De wachtlijst: nieuwe leden vertellen waarom ze lid willen worden, jij krijgt een bericht en keurt ze hier goed of weigert ze.' },
  ]
  return (
    <Box title="Aanmelden" icon="user_add">
      <p className="muted">Tot een nieuw lid binnen is, ziet die wat een bezoeker ziet en kan die alleen het eigen profiel invullen (profielfoto, achtergrond, design).</p>
      <div className="bh-modes" role="radiogroup" aria-label="Hoe komen nieuwe leden binnen?">
        {modes.map((m) => (
          <button key={m.mode} type="button" role="radio" aria-checked={data.signupMode === m.mode} className={data.signupMode === m.mode ? 'bh-mode current' : 'bh-mode'} disabled={save.isPending} onClick={() => data.signupMode !== m.mode && save.mutate(m.mode)}>
            <FarmIcon name={m.icon} size={32} />
            <span>
              <b>{m.title}</b>
              {m.text}
            </span>
          </button>
        ))}
      </div>
      <p className="bh-mail-status">
        {data.mailEnabled ? (
          <>
            <FarmIcon name="accept" /> Mail gaat via <b>{data.mailHost}</b> als <b>{data.mailFrom}</b>.{' '}
            <Button disabled={test.isPending} onClick={() => test.mutate()}>
              <FarmIcon name="email_go" /> {test.isPending ? 'Versturen…' : 'Stuur een testmail'}
            </Button>
          </>
        ) : (
          <>
            <FarmIcon name="exclamation" />
            <span className="bh-mail-text">
              Er is geen mailserver ingesteld (SMTP_HOST in .env, zie DEPLOY.md stap 12). Mails komen nu alleen in het serverlog
              {data.signupMode === 'mail' && ', dus nieuwe leden krijgen hun bevestigingslink niet: keur ze hieronder zelf goed, of zet Brevo op'}.
            </span>
          </>
        )}
      </p>
      {test.isSuccess && (
        <p className="form-success">
          <FarmIcon name="accept" /> Testmail verstuurd naar {test.data.to}. Komt hij niet aan? Kijk in je spam en in het serverlog.
        </p>
      )}
      {(save.isError || test.isError) && <p className="form-error">{errorMessage(save.error ?? test.error)}</p>}
    </Box>
  )
}

/** New members who aren't in yet: to approve by hand, send a new mail, or turn away. */
function Signups() {
  const { data = [], isLoading } = useQuery({ queryKey: [...adminKey, 'users', '', 'wachtend'], queryFn: () => api<AdminMember[]>('/admin/users?filter=wachtend') })
  const { data: settings } = useQuery({ queryKey: [...adminKey, 'settings'], queryFn: () => api<AdminSettings>('/admin/settings') })
  const action = useAdminAction()
  const [resent, setResent] = useState<string[]>([])
  const byMail = settings?.signupMode === 'mail'
  return (
    <>
    <SignupSettings />
    <Box title={`${byMail ? 'Nog niet bevestigd' : 'Wachtlijst'}${data.length ? ` (${data.length})` : ''}`} icon="hourglass">
      <p className="muted">
        {byMail
          ? 'Deze leden hebben hun e-mailadres nog niet bevestigd. Goedkeuren laat ze meteen binnen; weigeren verwijdert het account.'
          : 'Nieuwe leden kunnen meteen inloggen en hun profiel invullen, maar zien pas de rest en kunnen pas posten als jij ze goedkeurt. Je krijgt bij elke aanmelding een bericht. Weigeren verwijdert het account.'}
      </p>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : data.length === 0 ? (
        <p className="empty">Er wacht niemand.</p>
      ) : (
        <ul className="bh-list">
          {data.map((m) => (
            <li key={m.id}>
              <div className="bh-row">
                <div>
                  <span>
                    <Person user={m} /> <span className="muted">@{m.username}</span>
                  </span>
                  <span className="bh-details">
                    {m.email}
                    {m.city && <> · {m.city}</>}
                  </span>
                  {m.signupReason ? (
                    <blockquote className="bh-reason">{m.signupReason}</blockquote>
                  ) : (
                    !byMail && <span className="muted">Geen reden opgegeven.</span>
                  )}
                  <span className="muted">
                    Aangemeld {formatTime(m.createdAt)}
                    {m.lastSeenAt && <> · laatst gezien {formatTime(m.lastSeenAt)}</>}
                  </span>
                </div>
                <span className="bh-actions">
                  <Button variant="cta" disabled={action.isPending} onClick={() => action.mutate({ path: `/admin/users/${m.username}/approve` })}>
                    <FarmIcon name="accept" /> Goedkeuren
                  </Button>
                  {byMail &&
                    (resent.includes(m.username) ? (
                      <span className="form-success">
                        <FarmIcon name="accept" /> Mail gestuurd
                      </span>
                    ) : (
                      <Button disabled={action.isPending} onClick={() => action.mutate({ path: `/admin/users/${m.username}/resend` }, { onSuccess: () => setResent((r) => [...r, m.username]) })}>
                        <FarmIcon name="email_go" /> Mail opnieuw
                      </Button>
                    ))}
                  <Button
                    disabled={action.isPending}
                    onClick={() => confirm(`De aanmelding van ${m.name} (@${m.username}) weigeren? Het account wordt verwijderd.`) && action.mutate({ path: `/admin/users/${m.username}/reject` })}
                  >
                    <FarmIcon name="cross" /> Weigeren
                  </Button>
                  <Button
                    disabled={action.isPending}
                    title="Niet verwijderen maar blokkeren, en het e-mailadres en de gebruikersnaam op de zwarte lijst zetten"
                    onClick={() => {
                      const reason = prompt(`De aanmelding van ${m.name} (@${m.username}) weigeren en op de zwarte lijst zetten? Met ${m.email} en @${m.username} kan dan geen account meer gemaakt worden.\n\nWaarom? (optioneel)`)
                      if (reason !== null) action.mutate({ path: `/admin/users/${m.username}/blacklist`, body: { reason } })
                    }}
                  >
                    <FarmIcon name="shield" /> Zwarte lijst
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
    </>
  )
}

function Dummies() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ username: '', name: '', nickname: '', gender: '', birthdate: '', city: '', about: '' })
  const [made, setMade] = useState<{ username: string; password: string }[]>([])
  const create = useMutation({
    mutationFn: () => api<{ username: string; password: string }>('/admin/dummies', { method: 'POST', body: { ...form, gender: form.gender || null, birthdate: form.birthdate || null } }),
    onSuccess: (r) => {
      setMade((m) => [r, ...m])
      setForm({ username: '', name: '', nickname: '', gender: '', birthdate: '', city: '', about: '' })
      queryClient.invalidateQueries({ queryKey: adminKey })
    },
  })
  const fields = create.error instanceof ApiRequestError ? create.error.fields : {}
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value })
  const { data: dummies = [] } = useQuery({ queryKey: [...adminKey, 'users', '', 'dummies'], queryFn: () => api<AdminMember[]>('/admin/users?filter=dummies') })
  return (
    <>
      <Box title="Dummy-account maken" icon="user_add">
        <p className="muted">
          Voor een levendige site: een account dat je zelf beheert. Het krijgt een nep-e-mailadres (dummy.invalid) en een willekeurig wachtwoord. Met
          &quot;Inloggen als&quot; kun je als dit account posten (je wordt dan uitgelogd als beheerder).
        </p>
        <form
          className="bh-form"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <div className="settings-grid">
            <Field label="Gebruikersnaam" error={fields.username}>
              <input className="text-box" value={form.username} onChange={set('username')} required />
            </Field>
            <Field label="Naam" error={fields.name}>
              <input className="text-box" value={form.name} onChange={set('name')} required />
            </Field>
            <Field label="Roepnaam" hint="(optioneel)">
              <input className="text-box" value={form.nickname} onChange={set('nickname')} />
            </Field>
            <Field label="Woonplaats" hint="(optioneel)">
              <input className="text-box" value={form.city} onChange={set('city')} />
            </Field>
            <Field label="Geslacht">
              <select className="text-box" value={form.gender} onChange={set('gender')}>
                <option value="">—</option>
                <option value="vrouw">Vrouw</option>
                <option value="man">Man</option>
                <option value="anders">Anders</option>
              </select>
            </Field>
            <Field label="Geboortedatum" hint="(optioneel)">
              <DateInput value={form.birthdate} onChange={(v) => setForm((f) => ({ ...f, birthdate: v }))} />
            </Field>
          </div>
          <Field label="Wie ben ik?" hint="(optioneel)">
            <textarea className="text-box" rows={2} value={form.about} onChange={set('about')} />
          </Field>
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={create.isPending}>
              <FarmIcon name="user_add" /> Account maken
            </Button>
            {create.isError && Object.keys(fields).length === 0 && <span className="form-error">{errorMessage(create.error)}</span>}
          </div>
        </form>
        {made.map((m) => (
          <p key={m.username} className="form-success">
            <FarmIcon name="accept" /> {m.username} gemaakt. Wachtwoord: <code>{m.password}</code>
          </p>
        ))}
      </Box>
      <Box title={`Dummy-accounts (${dummies.length})`} icon="user">
        <MemberTable members={dummies} />
      </Box>
    </>
  )
}

// ---------------------------------------------------------------- uploads
function Uploads() {
  const [kind, setKind] = useState<UploadKind>('fotos')
  const { data = [], isLoading } = useQuery({ queryKey: [...adminKey, 'uploads', kind], queryFn: () => api<AdminUpload[]>(`/admin/uploads/${kind}`) })
  const action = useAdminAction()
  return (
    <Box title="Uploads" icon="images">
      <div className="bh-toolbar">
        {(Object.keys(UPLOAD_KINDS) as UploadKind[]).map((k) => (
          <button key={k} type="button" className={k === kind ? 'layout-chip current' : 'layout-chip'} onClick={() => setKind(k)}>
            {UPLOAD_KINDS[k]}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : data.length === 0 ? (
        <p className="empty">Niets geüpload.</p>
      ) : (
        <ul className="bh-uploads">
          {data.map((u) => (
            <li key={u.key}>
              <a href={u.link ?? u.url} className="bh-upload-img" target={u.link ? undefined : '_blank'} rel="noreferrer">
                {u.url ? <img src={u.url} alt="" loading="lazy" /> : <span className="muted">geen voorbeeld</span>}
                {u.status && u.status !== 'klaar' && <span className="bh-badge">{u.status}</span>}
              </a>
              <span className="bh-upload-title" title={u.title}>
                {u.title}
              </span>
              <span className="muted">
                <Person user={u.owner} />
                {u.createdAt && ` · ${formatTime(u.createdAt)}`}
                {u.bytes !== null && ` · ${bytes(u.bytes)}`}
              </span>
              <button type="button" className="btn bh-delete" onClick={() => confirm('Deze upload verwijderen?') && action.mutate({ path: `/admin/uploads/${u.kind}/${encodeURIComponent(u.key)}`, method: 'DELETE' })}>
                <FarmIcon name="bin" /> Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
  )
}

// ---------------------------------------------------------------- content
function Content() {
  const [kind, setKind] = useState<ContentKind>('wiewatwaars')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const { data = [], isLoading } = useQuery({
    queryKey: [...adminKey, 'content', kind, search],
    queryFn: () => api<AdminContent[]>(`/admin/content/${kind}?q=${encodeURIComponent(search)}`),
  })
  const action = useAdminAction()
  return (
    <Box title="Inhoud modereren" icon="comment">
      <div className="bh-toolbar">
        {(Object.keys(CONTENT_KINDS) as ContentKind[]).map((k) => (
          <button key={k} type="button" className={k === kind ? 'layout-chip current' : 'layout-chip'} onClick={() => setKind(k)}>
            {CONTENT_KINDS[k]}
          </button>
        ))}
      </div>
      <form
        className="bh-toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
        }}
      >
        <input className="text-box" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek in de tekst" aria-label="Zoeken" />
        <Button type="submit">Zoeken</Button>
      </form>
      {isLoading ? (
        <p className="muted">Laden…</p>
      ) : data.length === 0 ? (
        <p className="empty">Niets gevonden.</p>
      ) : (
        <table className="bh-table">
          <tbody>
            {data.map((item) => (
              <tr key={item.id}>
                <td className="bh-nowrap">
                  <Person user={item.author} />
                </td>
                <td className="bh-text">{item.text.length > 280 ? `${item.text.slice(0, 280)}…` : item.text}</td>
                <td className="bh-nowrap muted">{formatTime(item.createdAt)}</td>
                <td className="bh-actions">
                  {item.link && (
                    <Link to={item.link} className="btn">
                      Bekijken
                    </Link>
                  )}
                  <button type="button" className="icon-button" title="Verwijderen" onClick={() => confirm('Dit uit Kuddes verwijderen?') && action.mutate({ path: `/admin/content/${item.kind}/${encodeURIComponent(item.id)}`, method: 'DELETE' })}>
                    <FarmIcon name="bin" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
  )
}

// ---------------------------------------------------------------- reports
/** Set where a suggestion or report stands, with a short note for the sender. */
function ReportStatus({ report }: { report: AdminReport }) {
  const action = useAdminAction()
  const [status, setStatus] = useState<SuggestionStatus>(report.status)
  const [note, setNote] = useState(report.statusNote ?? '')
  const dirty = status !== report.status || note !== (report.statusNote ?? '')
  return (
    <form
      className="bh-status"
      onSubmit={(e) => {
        e.preventDefault()
        action.mutate({ path: `/admin/reports/${report.id}`, method: 'PATCH', body: { status, note } })
      }}
    >
      <select className="text-box" value={status} onChange={(e) => setStatus(e.target.value as SuggestionStatus)} aria-label="Status">
        {SUGGESTION_STATUS_KEYS.map((k) => (
          <option key={k} value={k}>
            {SUGGESTION_STATUSES[k].name}
          </option>
        ))}
      </select>
      <input className="text-box" value={note} maxLength={SUGGESTION_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Toelichting voor de inzender (optioneel)" aria-label="Toelichting" />
      <Button type="submit" variant={dirty ? 'cta' : undefined} disabled={!dirty || action.isPending}>
        Opslaan
      </Button>
    </form>
  )
}

function Reports() {
  const { data = [] } = useQuery({ queryKey: [...adminKey, 'reports'], queryFn: () => api<AdminReport[]>('/admin/reports') })
  const action = useAdminAction()
  return (
    <Box title="Meldingen en suggesties" icon="warning">
      {data.length === 0 ? (
        <p className="empty">Geen meldingen.</p>
      ) : (
        <ul className="bh-list">
          {data.map((r) => (
            <li key={r.id} className={r.handledAt ? 'handled' : undefined}>
              <div className="bh-row">
                <div>
                  <span className="bh-report-head">
                    <span className={r.kind === 'probleem' ? 'bh-badge danger' : 'bh-badge'}>{r.kind}</span> <b>{r.title}</b>{' '}
                    <span className={`bh-badge status-${r.status}`}>
                      <FarmIcon name={SUGGESTION_STATUSES[r.status].icon} /> {SUGGESTION_STATUSES[r.status].name}
                    </span>
                  </span>
                  <span className="bh-details">{r.body}</span>
                  <span className="muted">
                    <Person user={r.user} /> · {formatTime(r.createdAt)}
                    {r.page && (
                      <>
                        {' · '}
                        <Link to={r.page}>{r.page}</Link>
                      </>
                    )}
                  </span>
                </div>
                <span className="bh-actions">
                  <button type="button" className="icon-button" title="Verwijderen" onClick={() => confirm('Deze melding verwijderen?') && action.mutate({ path: `/admin/reports/${r.id}`, method: 'DELETE' })}>
                    <FarmIcon name="bin" />
                  </button>
                </span>
              </div>
              <ReportStatus key={`${r.id}-${r.status}-${r.statusNote}`} report={r} />
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

// ------------------------------------------------------------ radio live now
/** Who's on air right now, to listen in or stop a show. */
function LiveStations() {
  const { data } = useQuery({ queryKey: [...adminKey, 'radio-live'], queryFn: () => api<{ live: RadioStation[] }>('/radio'), refetchInterval: 15_000 })
  const action = useAdminAction()
  return (
    <Box title="Nu live op Kuddes Radio" icon="transmit">
      {!data?.live.length ? (
        <p className="empty">Er is nu niemand live.</p>
      ) : (
        <ul className="bh-list">
          {data.live.map((s) => (
            <li key={s.user.username}>
              <div className="bh-row">
                <div>
                  <span>
                    <Person user={s.user} /> <b>{s.name}</b>
                  </span>
                  <span className="bh-details">
                    “{s.live?.title}” · {s.live?.listeners} luisteraars{s.live?.djs.length ? ` · DJ’s: ${s.live.djs.map((d) => d.nickname).join(', ')}` : ''}
                  </span>
                </div>
                <span className="bh-actions">
                  <Link to={`/radio/${s.user.username}`} className="btn">
                    <FarmIcon name="headphone" /> Luisteren
                  </Link>
                  <Button onClick={() => confirm(`De uitzending van ${s.name} stoppen?`) && action.mutate({ path: `/radio/stations/${s.user.username}/stop`, body: {} })}>
                    <FarmIcon name="cross" /> Stoppen
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

// ------------------------------------------------------------ video rights
const REQUEST_STATUS = { open: 'open', goedgekeurd: 'goedgekeurd', afgewezen: 'afgewezen' } as const

const REQUEST_KINDS = {
  video: { what: "video's", title: "Aanvragen om video's te uploaden", icon: 'camcorder', intro: "Nieuwe leden kunnen video's kijken, maar niet uploaden." },
  muziek: { what: 'muziek', title: 'Aanvragen om muziek te uploaden', icon: 'music', intro: 'Iedereen kan muziek luisteren, maar uploaden mag pas na jouw OK.' },
  radio: { what: 'radio', title: 'Aanvragen om radio te maken', icon: 'transmit', intro: 'Iedereen kan Kuddes Radio luisteren, maar live uitzenden mag pas na jouw OK.' },
} as const
const REASON_LABELS: Record<string, string> = { ...VIDEO_UPLOAD_REASONS, ...MUSIC_UPLOAD_REASONS }
const KIND_REASONS: Record<string, Record<string, string>> = { video: VIDEO_UPLOAD_REASONS, muziek: MUSIC_UPLOAD_REASONS, radio: RADIO_UPLOAD_REASONS }

function UploadRequests({ kind }: { kind: keyof typeof REQUEST_KINDS }) {
  const k = REQUEST_KINDS[kind]
  const { data = [] } = useQuery({ queryKey: [...adminKey, 'video-requests', kind], queryFn: () => api<AdminVideoRequest[]>(`/admin/video-requests?kind=${kind}`) })
  const action = useAdminAction()
  const answer = (r: AdminVideoRequest, decision: 'goedkeuren' | 'afwijzen') => {
    const note = prompt(
      decision === 'goedkeuren'
        ? `${r.user.nickname} mag ${k.what} uploaden. Wil je er iets bij zetten? (optioneel)`
        : `Waarom wijs je de aanvraag van ${r.user.nickname} af? (optioneel, ${r.user.nickname} krijgt dit te lezen)`,
    )
    if (note !== null) action.mutate({ path: `/admin/video-requests/${r.id}`, body: { decision, answer: note } })
  }
  return (
    <Box title={k.title} icon={k.icon}>
      <p className="muted">
        {k.intro} Wie het wil, vraagt het aan op de uploadpagina; jij krijgt dan een bericht. Rechten geven of
        intrekken kan ook bij Leden.
      </p>
      {data.length === 0 ? (
        <p className="empty">Nog geen aanvragen.</p>
      ) : (
        <ul className="bh-list">
          {data.map((r) => (
            <li key={r.id} className={r.status !== 'open' ? 'handled' : undefined}>
              <div className="bh-row">
                <div>
                  <span>
                    <Person user={r.user} /> <span className={r.status === 'open' ? 'bh-badge danger' : 'bh-badge'}>{REQUEST_STATUS[r.status]}</span>
                  </span>
                  <span className="bh-details">{r.reasons.map((x) => KIND_REASONS[kind][x] ?? REASON_LABELS[x] ?? x).join(' · ')}</span>
                  {r.motivation && <span className="bh-details">“{r.motivation}”</span>}
                  {r.answer && <span className="bh-details">Jouw antwoord: {r.answer}</span>}
                  <span className="muted">
                    Aangevraagd {formatTime(r.createdAt)}
                    {r.handledAt && <> · beantwoord {formatTime(r.handledAt)}</>}
                  </span>
                </div>
                {r.status === 'open' && (
                  <span className="bh-actions">
                    <Button variant="cta" onClick={() => answer(r, 'goedkeuren')}>
                      <FarmIcon name="accept" /> Goedkeuren
                    </Button>
                    <Button onClick={() => answer(r, 'afwijzen')}>
                      <FarmIcon name="cross" /> Weigeren
                    </Button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}

// ------------------------------------------------------------------ forum
type AdminThread = {
  id: number
  title: string
  section: { slug: string; name: string }
  pinned: boolean
  locked: boolean
  replies: number
  views: number
  starter: UserSummary | null
  lastPostAt: string
  href: string
}

function Forum() {
  const [filter, setFilter] = useState('')
  const { data = [] } = useQuery({ queryKey: [...adminKey, 'forum', filter], queryFn: () => api<AdminThread[]>(`/admin/forum/threads?filter=${filter}`) })
  const action = useAdminAction()
  return (
    <Box title="Forumonderwerpen" icon="table" actions={<Link to="/forum/beheer">Forumdelen, moderators en bans »</Link>}>
      <div className="bh-toolbar">
        {[
          ['', 'Alle'],
          ['vastgezet', 'Vastgezet'],
          ['gesloten', 'Gesloten'],
        ].map(([k, label]) => (
          <button key={k} type="button" className={filter === k ? 'layout-chip current' : 'layout-chip'} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {data.length === 0 ? (
        <p className="empty">Geen onderwerpen.</p>
      ) : (
        <table className="bh-table">
          <tbody>
            {data.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.pinned && <FarmIcon name="star" label="Vastgezet" />} {t.locked && <FarmIcon name="lock" label="Gesloten" />} <Link to={t.href}>{t.title}</Link>
                  <span className="muted">
                    {' '}
                    in {t.section.name} · {t.replies} reacties · {t.views} keer bekeken
                  </span>
                </td>
                <td className="bh-nowrap">
                  <Person user={t.starter} />
                </td>
                <td className="bh-actions">
                  <Button onClick={() => action.mutate({ path: `/forum/threads/${t.id}`, method: 'PATCH', body: { pinned: !t.pinned } })}>
                    <FarmIcon name="star" /> {t.pinned ? 'Losmaken' : 'Sticky'}
                  </Button>
                  <Button onClick={() => action.mutate({ path: `/forum/threads/${t.id}`, method: 'PATCH', body: { locked: !t.locked } })}>
                    <FarmIcon name={t.locked ? 'lock_open' : 'lock'} /> {t.locked ? 'Heropenen' : 'Sluiten'}
                  </Button>
                  <button type="button" className="icon-button" title="Verwijderen" onClick={() => confirm(`"${t.title}" met alle berichten verwijderen?`) && action.mutate({ path: `/forum/threads/${t.id}`, method: 'DELETE' })}>
                    <FarmIcon name="bin" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
  )
}

/** Beheer → Zwarte lijst: addresses, domains and usernames that can't sign up or be switched to. */
function Blacklist() {
  const queryClient = useQueryClient()
  const key = [...adminKey, 'blacklist']
  const { data = [], isLoading } = useQuery({ queryKey: key, queryFn: () => api<BlacklistEntry[]>('/admin/blacklist') })
  const [form, setForm] = useState<{ kind: BlacklistKind; value: string; reason: string; block: boolean }>({ kind: 'email', value: '', reason: '', block: true })
  const [done, setDone] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () => api<{ id: number; blocked: number }>('/admin/blacklist', { method: 'POST', body: form }),
    onSuccess: (r) => {
      setDone(`${form.value} staat op de zwarte lijst${r.blocked ? `; ${r.blocked} ${r.blocked === 1 ? 'account' : 'accounts'} geblokkeerd` : ''}.`)
      setForm({ ...form, value: '', reason: '' })
      void queryClient.invalidateQueries({ queryKey: adminKey })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/blacklist/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const fields = add.error instanceof ApiRequestError ? add.error.fields : {}
  return (
    <>
      <Box title="Op de zwarte lijst zetten" icon="shield">
        <p className="muted">
          Met wat hier staat kan niemand een account maken of zijn e-mailadres veranderen. Een * staat voor alles (<code>spammer*</code>, <code>*@example.org</code>). Bij
          e-mailadressen telt een +toevoeging niet mee, en bij Gmail ook de puntjes niet. Losse e-mailadressen en gebruikersnamen bewaren we versleuteld (als hash, zoals
          wachtwoorden): Kuddes kan ze nog herkennen, maar ze zijn niet meer terug te lezen; je ziet alleen een stukje, zoals j***@gmail.com. Een lid zet je er ook op vanuit Leden of Aanmeldingen met de knop Zwarte lijst.
        </p>
        <form
          className="bh-form"
          onSubmit={(e) => {
            e.preventDefault()
            setDone(null)
            add.mutate()
          }}
        >
          <div className="settings-grid">
            <Field label="Soort">
              <select className="text-box" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BlacklistKind })}>
                {(Object.keys(BLACKLIST_KINDS) as BlacklistKind[]).map((k) => (
                  <option key={k} value={k}>
                    {BLACKLIST_KINDS[k].name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={BLACKLIST_KINDS[form.kind].name} error={fields.value}>
              <input className="text-box" value={form.value} maxLength={BLACKLIST_LIMITS.value} placeholder={BLACKLIST_KINDS[form.kind].hint} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
            </Field>
            <Field label="Waarom (alleen voor jou)">
              <input className="text-box" value={form.reason} maxLength={BLACKLIST_LIMITS.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
          </div>
          <label className="gadget-toggle">
            <input type="checkbox" checked={form.block} onChange={(e) => setForm({ ...form, block: e.target.checked })} /> Bestaande accounts die hierop passen ook blokkeren
          </label>
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={add.isPending || !form.value.trim()}>
              <FarmIcon name="shield" /> Toevoegen
            </Button>
            {done && <span className="form-success">{done}</span>}
            {add.isError && !fields.value && <span className="form-error">{errorMessage(add.error)}</span>}
          </div>
        </form>
      </Box>
      <Box title={`Zwarte lijst (${data.length})`} icon="shield">
        {isLoading ? (
          <p className="muted">Laden…</p>
        ) : data.length === 0 ? (
          <p className="empty">De zwarte lijst is leeg.</p>
        ) : (
          <table className="bh-table">
            <thead>
              <tr>
                <th>Wat</th>
                <th>Waarom</th>
                <th>Accounts</th>
                <th>Sinds</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id}>
                  <td>
                    <FarmIcon name={BLACKLIST_KINDS[e.kind].icon} label={BLACKLIST_KINDS[e.kind].name} /> <b className="bh-email">{e.value}</b>
                    {e.hashed && <FarmIcon name="lock" label="Versleuteld bewaard: alleen dit stukje is nog te zien" />}
                  </td>
                  <td>{e.reason || <span className="muted">—</span>}</td>
                  <td>
                    {e.matches.length === 0 ? (
                      <span className="muted">geen</span>
                    ) : (
                      e.matches.map((m, i) => (
                        <span key={m.username}>
                          {i > 0 && ', '}
                          <Link to={`/profiel/${m.username}`}>@{m.username}</Link>
                          {!m.blocked && <span className="form-error"> (niet geblokkeerd)</span>}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="bh-nowrap">{formatDate(e.createdAt)}</td>
                  <td>
                    <Button disabled={remove.isPending} onClick={() => confirm(`${e.value} van de zwarte lijst halen?`) && remove.mutate(e.id)}>
                      <FarmIcon name="cross" /> Weghalen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </>
  )
}

/** The duration, what it stops and why, for a new IP ban. */
function IpBanFields({ value, onChange }: { value: { duration: IpBanDuration; scope: IpBanScope; reason: string }; onChange: (v: { duration: IpBanDuration; scope: IpBanScope; reason: string }) => void }) {
  return (
    <>
      <Field label="Hoe lang">
        <select className="text-box" value={value.duration} onChange={(e) => onChange({ ...value, duration: e.target.value as IpBanDuration })}>
          {(Object.keys(IP_BAN_DURATIONS) as IpBanDuration[]).map((d) => (
            <option key={d} value={d}>
              {IP_BAN_DURATIONS[d].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Wat lukt dan niet" hint={IP_BAN_SCOPES[value.scope].hint}>
        <select className="text-box" value={value.scope} onChange={(e) => onChange({ ...value, scope: e.target.value as IpBanScope })}>
          {(Object.keys(IP_BAN_SCOPES) as IpBanScope[]).map((k) => (
            <option key={k} value={k}>
              {IP_BAN_SCOPES[k].name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Waarom (alleen voor jou)">
        <input className="text-box" value={value.reason} maxLength={IP_BAN_LIMITS.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} />
      </Field>
    </>
  )
}

/** Banning the connection a member last used, from Leden. */
function IpBanDialog({ member, onClose }: { member: AdminMember; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<{ duration: IpBanDuration; scope: IpBanScope; reason: string }>({ duration: '7d', scope: 'aanmelden', reason: '' })
  const ban = useMutation({
    mutationFn: () => api<{ range: string }>(`/admin/users/${member.username}/ip-ban`, { method: 'POST', body: form }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: adminKey }),
  })
  return (
    <Modal title={`IP van ${member.nickname} bannen`} icon="world" onClose={onClose}>
      {ban.isSuccess ? (
        <>
          <p>
            <FarmIcon name="accept" /> <code>{ban.data.range}</code> is geband. Je ziet het terug onder Zwarte lijst.
          </p>
          <Button onClick={onClose}>Sluiten</Button>
        </>
      ) : (
        <form
          className="bh-form"
          onSubmit={(e) => {
            e.preventDefault()
            ban.mutate()
          }}
        >
          <p className="muted">
            Laatst gebruikt: <code>{member.lastIp}</code>. Een IPv6-adres telt met zijn hele /64. Op school, op het werk of via mobiel internet delen mensen vaak één adres;
            kies dan liever “Aanmelden en inloggen” en een korte tijd. Wil je dat {member.nickname} ook niet meer kan inloggen, blokkeer dan ook het account.
          </p>
          <IpBanFields value={form} onChange={setForm} />
          {ban.isError && <p className="form-error">{errorMessage(ban.error)}</p>}
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={ban.isPending}>
              <FarmIcon name="world" /> Bannen
            </Button>
            <Button onClick={onClose}>Annuleren</Button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** IP bans, in the Zwarte lijst tab: by hand, and the list with when each ends. */
function IpBans() {
  const queryClient = useQueryClient()
  const key = [...adminKey, 'ip-bans']
  const { data = [], isLoading } = useQuery({ queryKey: key, queryFn: () => api<IpBan[]>('/admin/ip-bans') })
  const [range, setRange] = useState('')
  const [form, setForm] = useState<{ duration: IpBanDuration; scope: IpBanScope; reason: string }>({ duration: '7d', scope: 'aanmelden', reason: '' })
  const [done, setDone] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: () => api<{ range: string }>('/admin/ip-bans', { method: 'POST', body: { ...form, range } }),
    onSuccess: (r) => {
      setDone(`${r.range} is geband.`)
      setRange('')
      setForm({ ...form, reason: '' })
      void queryClient.invalidateQueries({ queryKey: key })
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => api<void>(`/admin/ip-bans/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  const fields = add.error instanceof ApiRequestError ? add.error.fields : {}
  return (
    <>
      <Box title="IP-adres bannen" icon="world">
        <p className="muted">
          Een internetverbinding die een tijdje geen account kan maken en niet kan inloggen, of de hele site niet meer ziet. Een IPv6-adres telt met zijn hele /64; een reeks
          kan ook (<code>203.0.113.0/24</code>). Een lid ban je het makkelijkst vanuit Leden met IP bannen. Let op: op school, op het werk en via mobiel internet delen
          mensen vaak één adres, en wie wil, neemt een andere verbinding. Gebruik het naast de zwarte lijst, niet in plaats ervan.
        </p>
        <form
          className="bh-form"
          onSubmit={(e) => {
            e.preventDefault()
            setDone(null)
            add.mutate()
          }}
        >
          <div className="settings-grid">
            <Field label="IP-adres of reeks" error={fields.range}>
              <input className="text-box" value={range} maxLength={60} placeholder="bijv. 203.0.113.7" onChange={(e) => setRange(e.target.value)} required />
            </Field>
            <IpBanFields value={form} onChange={setForm} />
          </div>
          <div className="account-actions">
            <Button variant="cta" type="submit" disabled={add.isPending || !range.trim()}>
              <FarmIcon name="world" /> Bannen
            </Button>
            {done && <span className="form-success">{done}</span>}
            {add.isError && !fields.range && <span className="form-error">{errorMessage(add.error)}</span>}
          </div>
        </form>
      </Box>
      <Box title={`IP-bans (${data.filter((b) => b.active).length} actief)`} icon="world">
        {isLoading ? (
          <p className="muted">Laden…</p>
        ) : data.length === 0 ? (
          <p className="empty">Geen IP-bans.</p>
        ) : (
          <table className="bh-table">
            <thead>
              <tr>
                <th>Adres</th>
                <th>Wat</th>
                <th>Tot</th>
                <th>Leden op dit adres</th>
                <th>Waarom</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className={b.active ? undefined : 'muted'}>
                  <td>
                    <code className="bh-email">{b.range}</code>
                  </td>
                  <td>{IP_BAN_SCOPES[b.scope].name}</td>
                  <td className="bh-nowrap">{!b.expiresAt ? 'altijd' : b.active ? formatTime(b.expiresAt) : `verlopen (${formatDate(b.expiresAt)})`}</td>
                  <td>
                    {b.members.length === 0 ? (
                      <span className="muted">geen bekend</span>
                    ) : (
                      b.members.map((m, i) => (
                        <span key={m.username}>
                          {i > 0 && ', '}
                          <Link to={`/profiel/${m.username}`}>@{m.username}</Link>
                        </span>
                      ))
                    )}
                  </td>
                  <td>{b.reason || <span className="muted">—</span>}</td>
                  <td>
                    <Button disabled={remove.isPending} onClick={() => confirm(b.active ? `De ban op ${b.range} opheffen?` : `${b.range} uit de lijst halen?`) && remove.mutate(b.id)}>
                      <FarmIcon name="cross" /> {b.active ? 'Opheffen' : 'Weghalen'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Box>
    </>
  )
}

function Log() {
  const { data = [] } = useQuery({ queryKey: [...adminKey, 'log'], queryFn: () => api<AdminLogEntry[]>('/admin/log') })
  return (
    <Box title="Logboek" icon="book">
      <p className="muted">Alles wat de beheerder doet, ook op de server (`npm run admin`), komt hier te staan.</p>
      <LogList entries={data} />
    </Box>
  )
}

function Panel() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'overzicht'
  // What's waiting for the admin, as a number on its tab (shared with the Overzicht)
  const overview = useQuery({ queryKey: [...adminKey, 'overview'], queryFn: () => api<AdminOverview>('/admin/overview') })
  const c = overview.data?.counts
  const waiting: Record<string, number | undefined> = { aanmeldingen: c?.pendingSignups, meldingen: c?.openReports, video: c?.openVideoRequests }
  return (
    <main className="page page-con bh-page">
      <h1>
        <FarmIcon name="cog" size={32} /> Beheer
      </h1>
      <CategoryBar
        label="Beheer"
        current={tab === 'overzicht' ? null : tab}
        onPick={(key) => setParams(key ? { tab: key } : {}, { replace: true })}
        items={TABS.map((t) => ({ key: t.key === 'overzicht' ? null : t.key, name: t.label, hint: t.hint, icon: t.icon, count: waiting[t.key] }))}
      />
      {tab === 'overzicht' && <Overview />}
      {tab === 'nieuws' && <News />}
      {tab === 'aanmeldingen' && <Signups />}
      {tab === 'leden' && <Members />}
      {tab === 'dummies' && <Dummies />}
      {tab === 'uploads' && <Uploads />}
      {tab === 'inhoud' && <Content />}
      {tab === 'meldingen' && (
        <>
          <ReportedContent />
          <Reports />
        </>
      )}
      {tab === 'rust' && <SafetyAdmin />}
      {tab === 'video' && <UploadRequests kind="video" />}
      {tab === 'muziek' && <UploadRequests kind="muziek" />}
      {tab === 'radio' && (
        <>
          <LiveStations />
          <UploadRequests kind="radio" />
        </>
      )}
      {tab === 'forum' && <Forum />}
      {tab === 'bots' && <BotsAdmin />}
      {tab === 'automatiseringen' && <AutomationsAdmin />}
      {tab === 'zwartelijst' && (
        <>
          <Blacklist />
          <IpBans />
        </>
      )}
      {tab === 'servers' && <FederationAdmin />}
      {tab === 'logboek' && <Log />}
    </main>
  )
}

/** /beheer: only for this server's admin. Everyone else gets a plain "not found". */
export function AdminPage() {
  usePageTitle('Beheer - Kuddes')
  return (
    <RequireAuth>
      {(me) =>
        me.isAdmin ? (
          <Panel />
        ) : (
          <main className="page page-con">
            <h1>Deze pagina bestaat niet</h1>
          </main>
        )
      }
    </RequireAuth>
  )
}
