import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import type { UserSummary } from '../../../shared/api'
import { GAMES, GAME_EMOTES, GAME_LIMITS, type GamePlayer, type GameSummary } from '../../../shared/games'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { errorMessage } from '../../lib/api'
import { Smiley } from '../../lib/smileys'
import { useAnswerInvite, useChallenge, useStartGame } from './gameQueries'
import { namesList, othersIn } from './players'
import './FriendPicker.css'
import { setSoundOn, soundOn } from './sounds'
import type { Transport } from './useGameRoom'
import './Games.css'

const TRANSPORT_LABEL: Record<Transport, string> = {
  wachten: 'Wachten op je tegenstander',
  verbinden: 'Verbinden…',
  direct: 'Direct verbonden (peer-to-peer)',
  'via-server': 'Verbonden via Kuddes',
}

export function TransportBadge({ transport }: { transport: Transport }) {
  return (
    <span className="gm-transport">
      <span className={`gm-dot ${transport}`} /> {TRANSPORT_LABEL[transport]}
    </span>
  )
}

/** The other player is here or not (server-refereed games have no direct line to show). */
export function PresenceBadge({ online, text }: { online: boolean; text?: string }) {
  return (
    <span className="gm-transport">
      <span className={online ? 'gm-dot direct' : 'gm-dot'} /> {text ?? (online ? 'Je tegenstander is er' : 'Wachten op je tegenstander')}
    </span>
  )
}

export function PlayerCard({ user, score, scoreTitle, active, side, note, children }: { user: GameSummary['host']; score: ReactNode; scoreTitle: string; active: boolean; side: 'left' | 'right'; note: string | null; children?: ReactNode }) {
  return (
    <div className={['gm-player', side, active && 'active'].filter(Boolean).join(' ')}>
      {children}
      <Avatar user={user} size="small" />
      <div>
        <b>
          <Link to={`/profiel/${user.username}`}>{user.nickname}</Link>
        </b>
        {note && <span className="muted">{note}</span>}
      </div>
      <span className="gm-score" title={scoreTitle}>
        {score}
      </span>
    </div>
  )
}

export function Emote({ name }: { name: string }) {
  return (
    <span className="gm-emote">
      <Smiley name={name} />
    </span>
  )
}

/** Sounds on or off, for every game (remembered in this browser). */
export function SoundToggle() {
  const [on, setOn] = useState(soundOn)
  return (
    <button
      type="button"
      className="gm-sound"
      aria-pressed={on}
      title={on ? 'Geluid uitzetten' : 'Geluid aanzetten'}
      onClick={() => {
        setSoundOn(!on)
        setOn(!on)
      }}
    >
      <FarmIcon name={on ? 'sound' : 'sound_mute'} /> Geluid {on ? 'aan' : 'uit'}
    </button>
  )
}

/** Hyves smileys to send your opponent. */
export function EmoteBar({ onSend }: { onSend: (name: string) => void }) {
  return (
    <span className="gm-emotes" aria-label="Smiley sturen">
      {GAME_EMOTES.map((e) => (
        <button key={e} type="button" title="Stuur deze smiley" onClick={() => onSend(e)}>
          <Smiley name={e} />
        </button>
      ))}
    </span>
  )
}

/** The opponent left: a countdown, then "Winst claimen". */
/**
 * Someone left: a countdown, then "Winst claimen", or with more players
 * (`goOn`) going on without them. `many`: more than one of them is gone.
 */
export function OpponentGone({ name, goneSince, onClaim, many, goOn }: { name: string; goneSince: number | null; onClaim: () => void; many?: boolean; goOn?: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (goneSince === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [goneSince])
  if (goneSince === null) return null
  const left = Math.max(0, GAME_LIMITS.forfeitSeconds - Math.floor((now - goneSince) / 1000))
  const action = goOn ? `zonder ${many ? 'hen' : 'die'} verder` : 'de winst claimen'
  return (
    <p className="form-notice">
      <FarmIcon name="hourglass" /> {name} {many ? 'zijn' : 'is'} er even niet. Het spel gaat verder zodra {many ? 'ze' : 'die'} terug {many ? 'zijn' : 'is'}.{' '}
      {left === 0 ? (
        <Button onClick={onClaim}>
          <FarmIcon name="flag_finish" /> {goOn ? `Verder zonder ${many ? 'hen' : name}` : 'Winst claimen'}
        </Button>
      ) : (
        <>Na {left} seconden kun je {action}.</>
      )}
    </p>
  )
}

/** Overlapping profile pictures of the players. */
export function Faces({ users, size = 'tiny' }: { users: UserSummary[]; size?: 'tiny' | 'small' }) {
  return (
    <span className="gm-faces">
      {users.map((u) => (
        <Avatar key={u.username} user={u} size={size} static />
      ))}
    </span>
  )
}

const STATUS_NAME: Record<GamePlayer['status'], string> = { uitgenodigd: 'denkt na…', meedoen: 'doet mee', geweigerd: 'doet niet mee', weg: 'is weg' }

/** Before the start: who's invited and who said yes, and your buttons. */
export function Invite({ game }: { game: GameSummary; opponent?: GameSummary['host'] }) {
  const answer = useAnswerInvite()
  const start = useStartGame()
  const name = GAMES[game.kind].name
  const mine = game.players.find((p) => p.seat === game.seat)
  const host = game.players.find((p) => p.seat === 0)!
  const others = othersIn(game)
  const yes = game.players.filter((p) => p.status === 'meedoen').length
  const many = game.players.length > 2
  // The others invited besides you (and who invited)
  const alsoInvited = others.filter((p) => p.seat !== 0 && p.status !== 'geweigerd').map((p) => p.user.nickname)
  return (
    <div className="gm-waiting">
      <Faces users={game.players.filter((p) => p.status !== 'geweigerd').map((p) => p.user)} size="small" />
      {mine?.status === 'uitgenodigd' ? (
        <>
          <p>
            <b>{host.user.nickname}</b> {many ? 'nodigt je uit' : 'daagt je uit'} voor een potje {name}
            {alsoInvited.length > 0 && <>, samen met {namesList(alsoInvited)}</>}!
          </p>
          <div className="account-actions">
            <Button variant="cta" onClick={() => answer.mutate({ game, accept: true })} disabled={answer.isPending}>
              <FarmIcon name="accept" /> Meedoen
            </Button>
            <Button onClick={() => answer.mutate({ game, accept: false })} disabled={answer.isPending}>
              Nee, bedankt
            </Button>
          </div>
        </>
      ) : (
        <>
          <p>
            {game.seat === 0 ? 'Wachten tot je vrienden antwoorden' : `Je doet mee! Wachten tot ${host.user.nickname} begint of iedereen heeft geantwoord`} ({name}). Ze krijgen een melding op Kuddes; laat deze
            pagina open, het spel begint vanzelf.
          </p>
          {game.seat === 0 && (
            <div className="account-actions">
              {many && yes >= 2 && (
                <Button variant="cta" onClick={() => start.mutate(game)} disabled={start.isPending}>
                  <FarmIcon name="control_play_blue" /> Nu beginnen met {yes}
                </Button>
              )}
              <Button onClick={() => answer.mutate({ game, accept: false })} disabled={answer.isPending}>
                Uitdaging intrekken
              </Button>
            </div>
          )}
        </>
      )}
      {many && (
        <ul className="gm-invited">
          {game.players.map((p) => (
            <li key={p.seat} className={`st-${p.status}`}>
              <Avatar user={p.user} size="tiny" static />
              <b>{p.seat === game.seat ? 'Jij' : p.user.nickname}</b>
              <span>{p.seat === 0 ? 'nodigde uit' : STATUS_NAME[p.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {(answer.isError || start.isError) && <p className="form-error">{errorMessage(answer.error ?? start.error)}</p>}
    </div>
  )
}

export function Result({ game, me, scoreLabel }: { game: GameSummary; opponent?: GameSummary['host']; me: Me; scoreLabel?: (mine: number, theirs: number) => string }) {
  const again = useChallenge()
  const others = othersIn(game)
  const played = game.players.filter((p) => p.status === 'meedoen' || p.status === 'weg')
  const many = played.length > 2
  const opponent = others[0]?.user ?? (game.you === 'host' ? game.guest : game.host)
  const mine = game.players.find((p) => p.seat === game.seat)?.score ?? 0
  const theirs = others[0]?.score ?? 0
  const won = game.status === 'klaar' && game.winnerId !== null && game.winnerId === me.id
  const winner = game.players.find((p) => p.user.id === game.winnerId)
  const title =
    game.status !== 'klaar'
      ? game.status === 'geweigerd'
        ? many
          ? 'Niemand kon meedoen'
          : `${opponent.nickname} heeft de uitdaging afgeslagen`
        : game.status === 'geannuleerd'
          ? 'De uitdaging is ingetrokken'
          : 'Dit spel is gestopt'
      : game.winnerId === null
        ? 'Gelijkspel!'
        : won
          ? 'Je hebt gewonnen!'
          : `${winner?.user.nickname ?? opponent.nickname} heeft gewonnen`
  // Everyone who played, for another round with the same friends
  const rematch = played.filter((p) => p.seat !== game.seat).map((p) => p.user.username)
  return (
    <div className="gm-result">
      {game.status === 'klaar' && <FarmIcon name={game.winnerId === null ? 'thumb_up' : won ? 'cup_gold' : 'medal_silver_1'} size={32} />}
      <h2>{title}</h2>
      {game.status === 'klaar' &&
        (many ? (
          <ol className="gm-ranking">
            {[...played]
              .sort((a, b) => Number(b.user.id === game.winnerId) - Number(a.user.id === game.winnerId) || b.score - a.score)
              .map((p) => (
                <li key={p.seat}>
                  <Avatar user={p.user} size="tiny" static />
                  <b>{p.seat === game.seat ? 'Jij' : p.user.nickname}</b>
                  {p.status === 'weg' && <span className="muted"> (gestopt)</span>}
                  <span className="gm-ranking-score">{p.score}</span>
                </li>
              ))}
          </ol>
        ) : (
          <p>
            {scoreLabel ? scoreLabel(mine, theirs) : `${mine} – ${theirs}`}
            {game.endReason === 'opgegeven' && (won ? ` · ${opponent.nickname} gaf op` : ' · je gaf op')}
            {game.endReason === 'verlaten' && (won ? ` · ${opponent.nickname} ging weg` : ' · je was weg')}
          </p>
        ))}
      <div className="account-actions">
        {rematch.length > 0 && (
          <Button variant="cta" onClick={() => again.mutate({ kind: game.kind, usernames: rematch })} disabled={again.isPending}>
            <FarmIcon name="arrow_redo" /> Nog een potje
          </Button>
        )}
        <Link to="/spellen">« Spellen</Link>
        <Link to={`/prestaties/${me.username}`}>Mijn prestaties</Link>
      </div>
      {again.isError && <p className="form-error">{errorMessage(again.error)}</p>}
    </div>
  )
}
