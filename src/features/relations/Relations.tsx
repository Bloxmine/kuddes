import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Me, Profile, UserSummary } from '../../../shared/api'
import {
  FAMILY_LABELS,
  PARTNER_WORD,
  RELATIONSHIP_STATUSES,
  RELATION_LIMITS,
  WITH_PARTNER,
  type FamilyLabel,
  type MyRelations,
  type RelationshipStatus,
} from '../../../shared/relations'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Field } from '../../components/ui/Field'
import { api, errorMessage } from '../../lib/api'
import { keys, useFriends } from '../../lib/queries'
import { formatTime } from '../../lib/time'
import './Relations.css'

const relationsKey = ['me', 'relations'] as const

const NameLink = ({ user }: { user: UserSummary }) => <Link to={`/profiel/${user.username}`}>{user.nickname}</Link>

/** The icon that goes with a relation, next to a name. */
export function RelationIcon({ kind, title }: { kind: 'partner' | 'beste_vriend' | 'familie'; title: string }) {
  const icon = kind === 'partner' ? 'heart' : kind === 'beste_vriend' ? 'star' : 'house'
  return (
    <span className={`relation-icon ${kind}`} title={title}>
      <FarmIcon name={icon} label={title} />
    </span>
  )
}

/** Rows for the "Profiel" box: relatiestatus, beste vrienden and familie. */
export function RelationRows({ profile, Row }: { profile: Profile; Row: (p: { label: string; children: React.ReactNode }) => React.ReactNode }) {
  const r = profile.relations
  const isSelf = profile.relation?.isSelf
  return (
    <>
      {r.status && (
        <Row label="Relatie:">
          <RelationIcon kind="partner" title="Relatie" /> {RELATIONSHIP_STATUSES[r.status]}
          {r.partner && WITH_PARTNER.includes(r.status) && (
            <>
              {' '}
              {PARTNER_WORD[r.status]} <NameLink user={r.partner.user} />
              {!r.partner.confirmed && <span className="muted"> (nog niet bevestigd)</span>}
            </>
          )}
        </Row>
      )}
      {r.bestFriends.length > 0 && (
        <Row label="Beste vrienden:">
          <RelationIcon kind="beste_vriend" title="Beste vrienden" />{' '}
          {r.bestFriends.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && ', '}
              <NameLink user={f} />
            </Fragment>
          ))}
        </Row>
      )}
      {r.family.length > 0 && (
        <Row label="Familie:">
          <RelationIcon kind="familie" title="Familie" />{' '}
          {r.family.map((f, i) => (
            <Fragment key={f.id}>
              {i > 0 && ', '}
              <NameLink user={f.user} /> <span className="muted">({FAMILY_LABELS[f.label].toLowerCase()}{!f.confirmed && isSelf ? ', nog niet bevestigd' : ''})</span>
            </Fragment>
          ))}
        </Row>
      )}
    </>
  )
}

function useRelationAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: 'POST' | 'PUT' | 'DELETE'; body?: unknown }) => api<MyRelations>(path, { method, body }),
    onSuccess: (data) => {
      queryClient.setQueryData(relationsKey, data)
      queryClient.invalidateQueries({ queryKey: keys.me })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

/** Partner and family requests, on the Vrienden page. */
export function RelationRequests() {
  const { data } = useQuery({ queryKey: relationsKey, queryFn: () => api<MyRelations>('/me/relations') })
  const action = useRelationAction()
  const incoming = data?.incoming ?? []
  if (incoming.length === 0) return null
  return (
    <Box title={`Relatieverzoeken (${incoming.length})`} icon="heart">
      <ul className="member-list">
        {incoming.map((r) => (
          <li key={r.id}>
            <Avatar user={r.from} size="small" />
            <div className="member-list-info">
              <NameLink user={r.from} />{' '}
              <span className="muted">
                {r.kind === 'partner' ? `zegt: ${r.label.toLowerCase()} met jou` : `zegt dat jij zijn of haar ${r.label.toLowerCase()} bent`}
              </span>
              <div className="date">{formatTime(r.createdAt)}</div>
            </div>
            <div className="member-list-actions">
              <Button variant="cta" disabled={action.isPending} onClick={() => action.mutate({ path: `/relations/${r.id}/accept` })}>
                <RelationIcon kind={r.kind} title="" /> Bevestigen
              </Button>
              <Button disabled={action.isPending} onClick={() => action.mutate({ path: `/relations/${r.id}`, method: 'DELETE' })}>
                Nee
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Box>
  )
}

/** "Relaties" in Instellingen. */
export function RelationSettings({ user }: { user: Me }) {
  const { data } = useQuery({ queryKey: relationsKey, queryFn: () => api<MyRelations>('/me/relations') })
  const { data: friends = [] } = useFriends(user.username)
  const action = useRelationAction()
  const [familyFriend, setFamilyFriend] = useState('')
  const [familyLabel, setFamilyLabel] = useState<FamilyLabel>('broer')

  if (!data) {
    return (
      <Box title="Relaties" icon="heart">
        <p id="relaties" className="muted">
          Laden…
        </p>
      </Box>
    )
  }
  const status = data.status
  const partner = data.partner?.user.username ?? ''
  const setStatus = (next: RelationshipStatus | null, partnerName: string | null) =>
    action.mutate({ path: '/me/relationship', method: 'PUT', body: { status: next, partner: next && WITH_PARTNER.includes(next) ? partnerName || null : null } })
  const best = new Set(data.bestFriends.map((f) => f.username))

  return (
    <Box title="Relaties" icon="heart">
      <p id="relaties" className="settings-intro">
        Laat op je profiel zien met wie je samen bent, wie je beste vrienden zijn en wie er bij je familie hoort. Je partner en familie krijgen een verzoek om het
        te bevestigen. Het kan alleen met vrienden.
      </p>

      <h3 className="relation-hdr">
        <RelationIcon kind="partner" title="Relatie" /> Relatiestatus
      </h3>
      <div className="settings-grid">
        <Field label="Status">
          <select className="text-box" value={status ?? ''} disabled={action.isPending} onChange={(e) => setStatus((e.target.value || null) as RelationshipStatus | null, partner)}>
            <option value="">Niet laten zien</option>
            {(Object.keys(RELATIONSHIP_STATUSES) as RelationshipStatus[]).map((s) => (
              <option key={s} value={s}>
                {RELATIONSHIP_STATUSES[s]}
              </option>
            ))}
          </select>
        </Field>
        {status && WITH_PARTNER.includes(status) && (
          <Field label="Met" hint="(optioneel)">
            <select className="text-box" value={partner} disabled={action.isPending} onChange={(e) => setStatus(status, e.target.value)}>
              <option value="">Niemand noemen</option>
              {friends.map((f) => (
                <option key={f.username} value={f.username}>
                  {f.nickname}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {data.partner && !data.partner.confirmed && (
        <p className="form-notice">
          <FarmIcon name="hourglass" /> Wacht tot {data.partner.user.nickname} het bevestigt. Tot die tijd zien anderen alleen je status.
        </p>
      )}

      <h3 className="relation-hdr">
        <RelationIcon kind="beste_vriend" title="Beste vrienden" /> Beste vrienden{' '}
        <span className="muted">
          ({best.size}/{RELATION_LIMITS.bestFriends})
        </span>
      </h3>
      {friends.length === 0 ? (
        <p className="empty">Je hebt nog geen vrienden om te kiezen.</p>
      ) : (
        <ul className="relation-pick">
          {friends.map((f) => {
            const on = best.has(f.username)
            return (
              <li key={f.username}>
                <button
                  type="button"
                  className={on ? 'on' : undefined}
                  aria-pressed={on}
                  disabled={action.isPending || (!on && best.size >= RELATION_LIMITS.bestFriends)}
                  onClick={() => action.mutate(on ? { path: `/me/best-friends/${f.username}`, method: 'DELETE' } : { path: '/me/best-friends', body: { username: f.username } })}
                >
                  <Avatar user={f} size="tiny" static />
                  <span>{f.nickname}</span>
                  <FarmIcon name={on ? 'star' : 'add'} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="relation-hdr">
        <RelationIcon kind="familie" title="Familie" /> Familie
      </h3>
      {data.family.length > 0 && (
        <ul className="relation-family">
          {data.family.map((f) => (
            <li key={f.id}>
              <Avatar user={f.user} size="tiny" static />
              <NameLink user={f.user} />
              <select
                className="text-box"
                value={f.label}
                aria-label={`Wat is ${f.user.nickname} van je?`}
                disabled={action.isPending}
                onChange={(e) => action.mutate({ path: '/me/family', body: { username: f.user.username, label: e.target.value } })}
              >
                {(Object.keys(FAMILY_LABELS) as FamilyLabel[]).map((l) => (
                  <option key={l} value={l}>
                    {FAMILY_LABELS[l]}
                  </option>
                ))}
              </select>
              {!f.confirmed && <span className="muted">wacht op bevestiging</span>}
              <button type="button" className="icon-button" title="Relatie verwijderen" disabled={action.isPending} onClick={() => confirm('Deze relatie verwijderen?') && action.mutate({ path: `/relations/${f.id}`, method: 'DELETE' })}>
                <FarmIcon name="bin" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="relation-add"
        onSubmit={(e) => {
          e.preventDefault()
          if (familyFriend) action.mutate({ path: '/me/family', body: { username: familyFriend, label: familyLabel } }, { onSuccess: () => setFamilyFriend('') })
        }}
      >
        <select className="text-box" value={familyFriend} onChange={(e) => setFamilyFriend(e.target.value)} aria-label="Wie">
          <option value="">Kies een vriend…</option>
          {friends
            .filter((f) => !data.family.some((x) => x.user.username === f.username))
            .map((f) => (
              <option key={f.username} value={f.username}>
                {f.nickname}
              </option>
            ))}
        </select>
        <span>is mijn</span>
        <select className="text-box" value={familyLabel} onChange={(e) => setFamilyLabel(e.target.value as FamilyLabel)} aria-label="Familielid">
          {(Object.keys(FAMILY_LABELS) as FamilyLabel[]).map((l) => (
            <option key={l} value={l}>
              {FAMILY_LABELS[l].toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" disabled={!familyFriend || action.isPending}>
          <FarmIcon name="add" /> Toevoegen
        </Button>
      </form>
      {action.isError && <p className="form-error">{errorMessage(action.error)}</p>}
    </Box>
  )
}
