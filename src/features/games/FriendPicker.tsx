/**
 * Who plays along: a window with your friends' profile pictures. Games for
 * two take one friend; Kleurwissel, Stapelgek and the Graffitimuur up to three.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Me, UserSummary } from '../../../shared/api'
import { GAMES, type GameKind } from '../../../shared/games'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Modal } from '../../components/ui/Modal'
import { api, errorMessage } from '../../lib/api'
import { keys } from '../../lib/queries'
import { useChallenge } from './gameQueries'
import { namesList } from './players'
import './FriendPicker.css'

/** Games you choose a version of when you challenge someone. */
const VARIANTS: Partial<Record<GameKind, [GameKind, string][]>> = {
  pool: [
    ['pool', '8-ball'],
    ['pool9', '9-ball'],
  ],
  mastermind: [
    ['mastermind', 'Klassiek (6 kleuren)'],
    ['mastermind8', 'Modern (8 kleuren)'],
  ],
}

export function FriendPicker({ kind, me, onClose }: { kind: GameKind; me: Me; onClose: () => void }) {
  const { data: friends = [], isLoading } = useQuery({
    queryKey: keys.friends(me.username),
    queryFn: () => api<UserSummary[]>(`/users/${encodeURIComponent(me.username)}/friends`),
  })
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  // Pool: 8-ball or 9-ball; Mastermind: classic or modern (each a game of its own)
  const [variant, setVariant] = useState<GameKind>(kind)
  const challenge = useChallenge()
  const game = GAMES[kind]
  const most = game.players - 1
  const spray = kind === 'spray'

  const toggle = (username: string) =>
    setPicked((list) => (list.includes(username) ? list.filter((u) => u !== username) : most === 1 ? [username] : list.length < most ? [...list, username] : list))
  const q = search.trim().toLowerCase()
  // Online friends first
  const shown = friends
    .filter((f) => !q || f.nickname.toLowerCase().includes(q) || f.username.includes(q))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname))
  const chosen = picked.map((u) => friends.find((f) => f.username === u)).filter((f): f is UserSummary => !!f)

  return (
    <Modal title={spray ? 'Wie spuit er mee?' : `${game.name}: wie speelt er mee?`} icon={game.icon as FarmIconName} onClose={onClose} wide>
      <div className="fp">
        <p className="fp-intro">
          {most === 1 ? 'Kies de vriend die je wilt uitdagen.' : `Kies tot ${most} vrienden. Jullie spelen met ${most + 1} als iedereen ja zegt; wie niet reageert kun je ook zonder beginnen.`}
        </p>

        {/* Who's at the table: you, and who you picked */}
        <div className="fp-table" aria-label="Wie er meedoet">
          <span className="fp-seat me">
            <Avatar user={me} size="small" static />
            <span>Jij</span>
          </span>
          {Array.from({ length: most }, (_, i) => {
            const f = chosen[i]
            return f ? (
              <button key={f.username} type="button" className="fp-seat" onClick={() => toggle(f.username)} title={`${f.nickname} weghalen`}>
                <Avatar user={f} size="small" static />
                <span>{f.nickname}</span>
                <i aria-hidden="true">×</i>
              </button>
            ) : (
              <span key={i} className="fp-seat empty">
                <span className="fp-empty-face">?</span>
                <span>Vrij</span>
              </span>
            )
          })}
        </div>

        {friends.length > 8 && (
          <input className="text-box fp-search" type="search" placeholder="Zoek een vriend…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Zoek een vriend" />
        )}

        {isLoading ? (
          <p className="muted">Vrienden laden…</p>
        ) : !friends.length ? (
          <p className="empty">Je hebt nog geen vrienden om uit te nodigen. Zoek leden en voeg ze toe!</p>
        ) : (
          <ul className="fp-grid">
            {shown.map((f) => {
              const on = picked.includes(f.username)
              const full = !on && most > 1 && picked.length >= most
              return (
                <li key={f.username}>
                  <button type="button" className={['fp-friend', on && 'on'].filter(Boolean).join(' ')} aria-pressed={on} disabled={full} onClick={() => toggle(f.username)}>
                    <span className="fp-face">
                      <Avatar user={f} size="small" static />
                      {f.online && <span className="fp-online" title="Online" />}
                      {on && (
                        <span className="fp-check" aria-hidden="true">
                          <FarmIcon name="accept" />
                        </span>
                      )}
                    </span>
                    <span className="fp-name">{f.nickname}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {VARIANTS[kind] && (
          <div className="fp-variant" role="radiogroup" aria-label="Welk spel">
            {VARIANTS[kind].map(([k, label]) => (
              <label key={k} className={variant === k ? 'on' : undefined}>
                <input type="radio" name="variant" checked={variant === k} onChange={() => setVariant(k)} /> {label}
              </label>
            ))}
          </div>
        )}

        <div className="account-actions">
          <Button variant="cta" disabled={!picked.length || challenge.isPending} onClick={() => challenge.mutate({ kind: variant, usernames: picked }, { onSuccess: onClose })}>
            <FarmIcon name={spray ? 'group_add' : 'controller_add'} />{' '}
            {picked.length ? `${spray ? 'Uitnodigen' : 'Uitdagen'}: ${namesList(chosen.map((f) => f.nickname))}` : 'Kies eerst een vriend'}
          </Button>
          <Button onClick={onClose}>Annuleren</Button>
        </div>
        {challenge.isError && <p className="form-error">{errorMessage(challenge.error)}</p>}
      </div>
    </Modal>
  )
}
