import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { UserSummary } from '../../../shared/api'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { IconPicker } from '../../components/ui/IconPicker'
import { ForumLayout, SectionIcon } from '../../features/forum/ForumLayout'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import { formatDate } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'

type AdminSection = {
  id: number
  slug: string
  category: string
  name: string
  description: string
  icon: string
  position: number
  staffOnly: boolean
  parentId: number | null
  moderators: UserSummary[]
}
type AdminData = {
  sections: AdminSection[]
  admins: UserSummary[]
  bans: { user: UserSummary; reason: string; until: string | null; createdAt: string }[]
  channels: { name: string; topic: string; position: number }[]
}

const adminKey = [...keys.allForum, 'admin']

function useAdminAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'PATCH' | 'DELETE'; body?: unknown }) => api<unknown>(path, { method, body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.allForum }),
  })
}

function SectionForm({ section, sections, onDone }: { section?: AdminSection; sections: AdminSection[]; onDone: () => void }) {
  const action = useAdminAction()
  // Subforums go under a main section; a section with subforums stays a main one
  const hasChildren = !!section && sections.some((s) => s.parentId === section.id)
  const parents = sections.filter((s) => !s.parentId && s.id !== section?.id)
  const [form, setForm] = useState({
    name: section?.name ?? '',
    category: section?.category ?? 'Algemeen',
    description: section?.description ?? '',
    icon: section?.icon ?? 'comment',
    position: section?.position ?? 100,
    staffOnly: section?.staffOnly ?? false,
    parentId: section?.parentId ?? null,
  })
  return (
    <form
      className="fm-admin-form"
      onSubmit={(e) => {
        e.preventDefault()
        action.mutate(
          { path: section ? `/forum/admin/sections/${section.id}` : '/forum/admin/sections', method: section ? 'PATCH' : 'POST', body: form },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="settings-grid">
        <Field label="Naam">
          <input className="text-box" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Staat in" hint={hasChildren ? '(heeft zelf subfora)' : '(een subforum staat in een ander forumdeel)'}>
          <select className="text-box" value={form.parentId ?? ''} disabled={hasChildren} onChange={(e) => setForm({ ...form, parentId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Hoofdforum (onder een categorie)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                Subforum van {p.name}
              </option>
            ))}
          </select>
        </Field>
        {form.parentId ? (
          <Field label="Categorie" hint="(die van het hoofdforum)">
            <input className="text-box" value={sections.find((s) => s.id === form.parentId)?.category ?? ''} disabled />
          </Field>
        ) : (
          <Field label="Categorie" hint="(de kop waaronder het staat)">
            <input className="text-box" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
          </Field>
        )}
        <Field label="Omschrijving">
          <input className="text-box" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Volgorde" hint="(lager staat hoger)">
          <input className="text-box" type="number" value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="fm-admin-icon">
        <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon: icon ?? 'comment' })} />
      </div>
      <label className="gadget-toggle">
        <input type="checkbox" checked={form.staffOnly} onChange={(e) => setForm({ ...form, staffOnly: e.target.checked })} /> Alleen beheerders en moderators starten hier
        onderwerpen (voor mededelingen)
      </label>
      <div className="account-actions">
        <Button variant="cta" type="submit" disabled={action.isPending}>
          {section ? 'Opslaan' : 'Forumdeel toevoegen'}
        </Button>
        <Button onClick={onDone}>Annuleren</Button>
        {action.isError && <span className="form-error">{errorMessage(action.error)}</span>}
      </div>
    </form>
  )
}

function SectionAdmin({ section, sections }: { section: AdminSection; sections: AdminSection[] }) {
  const action = useAdminAction()
  const [editing, setEditing] = useState(false)
  const [mod, setMod] = useState('')
  return (
    <li className={section.parentId ? 'fm-admin-section fm-admin-sub' : 'fm-admin-section'}>
      {editing ? (
        <SectionForm section={section} sections={sections} onDone={() => setEditing(false)} />
      ) : (
        <>
          <div className="fm-admin-row">
            <SectionIcon icon={section.icon} />
            <div>
              <b>
                <Link to={`/forum/${section.slug}`}>{section.name}</Link>
              </b>{' '}
              <span className="muted">
                {section.parentId ? `subforum van ${sections.find((s) => s.id === section.parentId)?.name ?? '?'}` : section.category} · volgorde {section.position}
                {section.staffOnly && ' · alleen team'}
              </span>
              <span className="muted">{section.description}</span>
            </div>
            <Button onClick={() => setEditing(true)}>
              <FarmIcon name="pencil" /> Bewerken
            </Button>
            <button
              type="button"
              className="icon-button"
              title="Verwijderen"
              onClick={() => confirm(`"${section.name}" met alle onderwerpen${sections.some((s) => s.parentId === section.id) ? ' en subfora' : ''} verwijderen?`) && action.mutate({ path: `/forum/admin/sections/${section.id}`, method: 'DELETE' })}
            >
              <FarmIcon name="bin" />
            </button>
          </div>
          <div className="fm-admin-mods">
            <span className="muted">Moderators:</span>
            {section.moderators.length === 0 && <span className="muted">geen</span>}
            {section.moderators.map((m) => (
              <span key={m.id} className="layout-chip">
                {m.nickname}
                <button
                  type="button"
                  className="link-button"
                  aria-label={`${m.nickname} als moderator verwijderen`}
                  title="Moderatorrechten intrekken"
                  onClick={() => confirm(`${m.nickname} is dan geen moderator meer van ${section.name}. Doorgaan?`) && action.mutate({ path: '/forum/admin/moderators', body: { username: m.username, sectionId: section.id, add: false } })}
                >
                  ×
                </button>
              </span>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (mod.trim()) action.mutate({ path: '/forum/admin/moderators', body: { username: mod.trim(), sectionId: section.id, add: true } }, { onSuccess: () => setMod('') })
              }}
            >
              <input className="text-box" value={mod} onChange={(e) => setMod(e.target.value)} placeholder="gebruikersnaam" aria-label={`Moderator toevoegen aan ${section.name}`} />
              <Button type="submit" disabled={!mod.trim()}>
                <FarmIcon name="user_add" /> Moderator
              </Button>
            </form>
          </div>
        </>
      )}
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </li>
  )
}

function AdminPanel() {
  const { data, isLoading, error } = useQuery({ queryKey: adminKey, queryFn: () => api<AdminData>('/forum/admin') })
  const action = useAdminAction()
  const [adding, setAdding] = useState(false)
  const [ban, setBan] = useState({ username: '', reason: '', days: '7' })
  const [channel, setChannel] = useState({ name: '', topic: '' })

  if (isLoading) return <p className="muted">Laden…</p>
  if (!data) return <p className="form-error">{errorMessage(error)}</p>

  return (
    <div className="fm-admin">
      <Box title="Forumdelen" icon="table" actions={
          <Button onClick={() => setAdding(true)} disabled={adding}>
            <FarmIcon name="add" /> Nieuw forumdeel
          </Button>
        }>
        {adding && <SectionForm sections={data.sections} onDone={() => setAdding(false)} />}
        <ul className="fm-admin-sections">
          {/* Each main section with its subforums right under it */}
          {data.sections
            .filter((s) => !s.parentId)
            .flatMap((s) => [s, ...data.sections.filter((c) => c.parentId === s.id)])
            .map((s) => (
              <SectionAdmin key={s.id} section={s} sections={data.sections} />
            ))}
        </ul>
      </Box>

      <Box title="Beheerder" icon="award_star_gold_1">
        <p>
          {data.admins.map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <Link to={`/forum/lid/${a.username}`}>{a.nickname}</Link>
            </span>
          ))}
        </p>
        <p className="muted">
          De beheerder mag alles: forumdelen, moderators, bans en elk bericht. Beheerdersrechten worden alleen op de server gegeven. De rest van
          het beheer staat op <Link to="/beheer">/beheer</Link>.
        </p>
      </Box>

      <Box title="Verbannen leden" icon="lock">
        {data.bans.length === 0 ? (
          <p className="empty">Niemand is verbannen.</p>
        ) : (
          <ul className="fm-admin-list">
            {data.bans.map((b) => (
              <li key={b.user.id}>
                <Link to={`/forum/lid/${b.user.username}`}>{b.user.nickname}</Link>
                <span className="muted">
                  {b.until ? `tot ${formatDate(b.until)}` : 'voor altijd'}
                  {b.reason && ` · ${b.reason}`}
                </span>
                <button type="button" className="link-button" onClick={() => action.mutate({ path: `/forum/admin/bans/${b.user.username}`, method: 'DELETE' })}>
                  opheffen
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="fm-admin-inline"
          onSubmit={(e) => {
            e.preventDefault()
            action.mutate(
              { path: '/forum/admin/bans', body: { username: ban.username.trim(), reason: ban.reason, days: ban.days ? Number(ban.days) : null } },
              { onSuccess: () => setBan({ username: '', reason: '', days: '7' }) },
            )
          }}
        >
          <input className="text-box" value={ban.username} onChange={(e) => setBan({ ...ban, username: e.target.value })} placeholder="gebruikersnaam" aria-label="Wie verbannen" required />
          <input className="text-box" value={ban.reason} onChange={(e) => setBan({ ...ban, reason: e.target.value })} placeholder="reden" aria-label="Reden" />
          <select className="text-box" value={ban.days} onChange={(e) => setBan({ ...ban, days: e.target.value })} aria-label="Hoe lang">
            <option value="1">1 dag</option>
            <option value="7">1 week</option>
            <option value="30">1 maand</option>
            <option value="">voor altijd</option>
          </select>
          <Button type="submit" disabled={!ban.username.trim()}>
            <FarmIcon name="lock" /> Verbannen
          </Button>
        </form>
      </Box>

      <Box title="Chatkanalen" icon="transmit">
        <ul className="fm-admin-list">
          {data.channels.map((ch) => (
            <li key={ch.name}>
              <Link to={`/forum/chat?kanaal=${ch.name}`}>#{ch.name}</Link>
              <span className="muted">{ch.topic}</span>
              <button type="button" className="link-button" onClick={() => confirm(`#${ch.name} verwijderen?`) && action.mutate({ path: `/forum/admin/channels/${ch.name}`, method: 'DELETE' })}>
                verwijderen
              </button>
            </li>
          ))}
        </ul>
        <form
          className="fm-admin-inline"
          onSubmit={(e) => {
            e.preventDefault()
            action.mutate({ path: '/forum/admin/channels', body: channel }, { onSuccess: () => setChannel({ name: '', topic: '' }) })
          }}
        >
          <input className="text-box" value={channel.name} onChange={(e) => setChannel({ ...channel, name: e.target.value })} placeholder="kanaalnaam" aria-label="Kanaalnaam" required />
          <input className="text-box" value={channel.topic} onChange={(e) => setChannel({ ...channel, topic: e.target.value })} placeholder="onderwerp" aria-label="Onderwerp" />
          <Button type="submit" disabled={!channel.name.trim()}>
            <FarmIcon name="add" /> Kanaal
          </Button>
        </form>
      </Box>
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </div>
  )
}

/** /forum/beheer: only for forum admins. */
export function ForumAdminPage() {
  const { user } = useAuth()
  usePageTitle('Beheer - Kuddes Forum')
  return (
    <ForumLayout crumbs={[{ label: 'Beheer' }]}>
      {user?.username && <AdminPanel />}
      {!user && (
        <p>
          <Link to="/inloggen?next=/forum/beheer">Log in</Link> als beheerder.
        </p>
      )}
    </ForumLayout>
  )
}
