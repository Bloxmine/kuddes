/**
 * "Beheerders" (owners only): make members owners (everything) or beheerders
 * with some rights (shared/kuddes.ts KUDDE_RIGHTS), or plain members again.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { KuddeDetail } from '../../../shared/api'
import { KUDDE_RIGHTS, KUDDE_RIGHT_KEYS, type KuddeRight } from '../../../shared/kuddes'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { api, errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { keys } from '../../lib/queries'
import './KuddeManagers.css'

type Role = 'owner' | 'beheerder' | 'lid'

/** Owner, beheerder with rights, or member: for one person. */
function RoleForm({ role: startRole, rights: startRights, busy, onSave, onCancel }: { role: Role; rights: KuddeRight[]; busy: boolean; onSave: (role: Role, rights: KuddeRight[]) => void; onCancel?: () => void }) {
  const [role, setRole] = useState<Role>(startRole)
  const [rights, setRights] = useState<KuddeRight[]>(startRights)
  const toggle = (r: KuddeRight) => setRights((list) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]))
  return (
    <div className="km-form">
      <div className="km-roles" role="radiogroup" aria-label="Rol">
        {(
          [
            ['owner', 'Eigenaar', 'Mag alles, ook beheerders kiezen en de Kudde verwijderen', 'award_star_gold_1'],
            ['beheerder', 'Beheerder', 'Mag wat je hieronder aanvinkt', 'key'],
            ['lid', 'Gewoon lid', 'Geen beheerder (meer)', 'user'],
          ] as const
        ).map(([key, name, hint, icon]) => (
          <button key={key} type="button" role="radio" aria-checked={role === key} className={role === key ? 'km-role current' : 'km-role'} onClick={() => setRole(key)}>
            <FarmIcon name={icon} size={24} />
            <b>{name}</b>
            <span className="muted">{hint}</span>
          </button>
        ))}
      </div>
      {role === 'beheerder' && (
        <div className="km-rights">
          {KUDDE_RIGHT_KEYS.map((r) => (
            <label key={r} className="km-right">
              <input type="checkbox" checked={rights.includes(r)} onChange={() => toggle(r)} />
              <span>
                <b>{KUDDE_RIGHTS[r].name}</b> <span className="muted">{KUDDE_RIGHTS[r].hint}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="account-actions">
        <Button variant="cta" disabled={busy || (role === 'beheerder' && !rights.length)} onClick={() => onSave(role, role === 'beheerder' ? rights : [])}>
          Opslaan
        </Button>
        {onCancel && <Button onClick={onCancel}>Annuleren</Button>}
      </div>
    </div>
  )
}

export function KuddeManagers({ kudde, onDone }: { kudde: KuddeDetail; onDone: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState('')
  const save = useMutation({
    mutationFn: ({ username, role, rights }: { username: string; role: Role; rights: KuddeRight[] }) =>
      api<void>(`/kuddes/${kudde.slug}/managers/${username}`, { method: 'PUT', body: { role, rights } }),
    onSuccess: () => {
      setEditing(null)
      setAdding('')
      return Promise.all([queryClient.invalidateQueries({ queryKey: keys.kudde(kudde.slug) }), queryClient.invalidateQueries({ queryKey: ['me', 'owned-kuddes'] })])
    },
  })
  const managed = new Set(kudde.managers.map((m) => m.user.id))
  const candidates = kudde.members.filter((m) => !managed.has(m.id))

  return (
    <Box title="Beheerders" icon="key" actions={<button type="button" className="link-button" onClick={onDone}>Sluiten</button>}>
      <p className="settings-intro">
        Een <b>eigenaar</b> mag alles. Een <b>beheerder</b> mag alleen wat jij aanvinkt, bijvoorbeeld aanvragen goedkeuren of het prikbord netjes houden. Wie de Kudde gemaakt heeft, blijft altijd eigenaar.
      </p>
      <ul className="km-list">
        {kudde.managers.map((m) => (
          <li key={m.user.id}>
            <div className="km-row">
              <Avatar user={m.user} size="tiny" />
              <div className="km-info">
                <b>{m.user.nickname}</b>
                {m.user.id === user?.id && <span className="muted"> (jij)</span>}
                <span className="km-badges">
                  <span className={m.role === 'owner' ? 'km-badge owner' : 'km-badge'}>{m.creator ? 'Maker en eigenaar' : m.role === 'owner' ? 'Eigenaar' : 'Beheerder'}</span>
                  {m.role === 'beheerder' && m.rights.map((r) => <span key={r} className="km-badge light">{KUDDE_RIGHTS[r].name}</span>)}
                </span>
              </div>
              {!(m.creator && m.user.id !== user?.id) && (
                <Button onClick={() => setEditing(editing === m.user.username ? null : m.user.username)} aria-expanded={editing === m.user.username}>
                  <FarmIcon name="pencil" /> Wijzigen
                </Button>
              )}
            </div>
            {editing === m.user.username && (
              <RoleForm
                key={m.user.username}
                role={m.role}
                rights={m.rights}
                busy={save.isPending}
                onSave={(role, rights) => save.mutate({ username: m.user.username, role, rights })}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        ))}
      </ul>
      <h3 className="kudde-edit-sub">Iemand beheerder maken</h3>
      {candidates.length ? (
        <>
          <select className="text-box km-pick" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Kies een lid">
            <option value="">Kies een lid…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.username}>
                {m.nickname} (@{m.username})
              </option>
            ))}
          </select>
          {adding && <RoleForm key={adding} role="beheerder" rights={['aanvragen', 'prikbord']} busy={save.isPending} onSave={(role, rights) => save.mutate({ username: adding, role, rights })} onCancel={() => setAdding('')} />}
        </>
      ) : (
        <p className="muted">Alle leden zijn al beheerder. Nodig meer mensen uit voor de Kudde!</p>
      )}
      {save.isError && <p className="form-error">{errorMessage(save.error)}</p>}
    </Box>
  )
}
