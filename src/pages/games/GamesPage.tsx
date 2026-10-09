import { useState, type CSSProperties } from 'react'
import { Die } from '../../features/games/YachtBoard'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { GAMES, MAIN_GAMES, type GameKind, type GameStats, type GameSummary } from '../../../shared/games'
import { initialState } from '../../../shared/mancala'
import { Avatar } from '../../components/ui/Avatar'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { DamBoard } from '../../features/games/DamBoard'
import { ChessBoard } from '../../features/games/ChessBoard'
import { KleurCard } from '../../features/games/CardGames'
import { ballColour } from '../../features/games/poolColours'
import { MancalaBoard } from '../../features/games/MancalaBoard'
import { VierBoard } from '../../features/games/VierBoard'
import * as dammen from '../../../shared/games/dammen'
import * as schaken from '../../../shared/games/schaken'
import { MEMORY_FACES } from '../../../shared/games/memory'
import { PEG_COLOURS } from '../../../shared/games/mastermind'
import { SOLO_GAMES, SOLO_KINDS, soloHref, type SoloKind } from '../../../shared/soloGames'
import { PlayingCard } from '../../features/games/PlayingCard'
import '../../features/games/Mastermind.css'
import * as vier from '../../../shared/games/vieropeenrij'
import { gameHref, useAnswerInvite, useLeaderboard, useMyGames } from '../../features/games/gameQueries'
import { errorMessage } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { formatTime } from '../../lib/time'
import { usePageTitle } from '../../lib/usePageTitle'
import { FriendPicker } from '../../features/games/FriendPicker'
import { Faces } from '../../features/games/GameParts'
import { namesList, othersIn } from '../../features/games/players'
import '../../features/games/Games.css'
import '../../features/games/NewGames.css'

const VIER_PREVIEW = vier.replay([3, 3, 4, 2, 5, 4, 2], 0).state
const DAM_PREVIEW = dammen.initialState(0)
const sq = (n: string) => (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0])
const CHESS_PREVIEW = schaken.replay([[sq('e2'), sq('e4')], [sq('e7'), sq('e5')], [sq('g1'), sq('f3')], [sq('b8'), sq('c6')], [sq('f1'), sq('c4')]], 0).state
const ZEESLAG_PREVIEW = {
  ships: [
    { x: 1, y: 1, len: 4, dir: 'h' as const },
    { x: 7, y: 3, len: 3, dir: 'v' as const },
    { x: 2, y: 6, len: 2, dir: 'h' as const },
  ],
  shots: [
    [3, 1, true],
    [5, 4, false],
    [7, 4, true],
    [1, 8, false],
    [8, 8, false],
  ] as const,
}

/** A little picture of each game, drawn with the real boards where there is one. */
function GameArt({ kind }: { kind: GameKind }) {
  const noop = () => undefined
  switch (kind) {
    case 'mancala':
      return <MancalaBoard pits={initialState(0).pits} me={0} turn={0} playable={[]} trail={[]} from={null} over onPick={noop} />
    case 'vieropeenrij':
      return <VierBoard state={VIER_PREVIEW} my={0} myTurn={false} onMove={noop} finished />
    case 'dammen':
      return <DamBoard state={DAM_PREVIEW} my={0} myTurn={false} onMove={noop} finished />
    case 'zeeslag': {
      const ship = new Set(ZEESLAG_PREVIEW.ships.flatMap((sh) => Array.from({ length: sh.len }, (_, i) => (sh.dir === 'h' ? `${sh.x + i},${sh.y}` : `${sh.x},${sh.y + i}`))))
      return (
        <div className="zs-sea gh-mini-sea">
          {Array.from({ length: 100 }, (_, i) => {
            const k = `${i % 10},${Math.floor(i / 10)}`
            const shot = ZEESLAG_PREVIEW.shots.find(([x, y]) => `${x},${y}` === k)
            return (
              <span key={i} className={['zs-cell', ship.has(k) && 'ship'].filter(Boolean).join(' ')}>
                {shot && (shot[2] ? <span className="zs-fire" /> : <span className="zs-splash" />)}
              </span>
            )
          })}
        </div>
      )
    }
    case 'schaken':
      return <ChessBoard state={CHESS_PREVIEW} my={0} myTurn={false} onMove={noop} finished />
    case 'pool':
    case 'pool9':
      return (
        <div className="gh-pool-art">
          {[1, 9, 2, 10, 8, 3, 11, 4, 12, 5].map((id, i) => (
            <span key={id} className={`pl-mini ${id > 8 ? 'stripe' : ''}`} style={{ '--b': ballColour(id), '--i': i } as CSSProperties}>
              {id}
            </span>
          ))}
          <span className="pl-mini cue" style={{ '--b': ballColour(0) } as CSSProperties} />
        </div>
      )
    case 'mastermind':
    case 'mastermind8':
      return (
        <div className="gh-mastermind-art" aria-hidden="true">
          {[
            [[0, 1, 2, 3], [1, 1, 0, 0]],
            [[3, 0, 4, 1], [2, 1, 1, 0]],
            [[3, 4, 0, 5], [2, 2, 2, 2]],
          ].map(([row, pins], r) => (
            <span key={r} className="mmd-row">
              <span className="mmd-holes">
                {row.map((c, i) => (
                  <span key={i} className="mmd-peg" style={{ '--peg': PEG_COLOURS[c].hex } as CSSProperties} />
                ))}
              </span>
              <span className="mmd-keys">
                {pins.map((p, i) => (
                  <span key={i} className={`mmd-pin ${p === 2 ? 'black' : p === 1 ? 'white' : ''}`} />
                ))}
              </span>
            </span>
          ))}
        </div>
      )
    case 'poker':
      return (
        <div className="gh-poker-art" style={{ '--card-w': '40px' } as CSSProperties}>
          {[
            [14, 0],
            [14, 1],
            [13, 1],
            [13, 2],
            [13, 3],
          ].map(([rank, suit], i) => (
            <span key={i} style={{ '--i': i } as CSSProperties}>
              <PlayingCard rank={rank} suit={suit} />
            </span>
          ))}
          <span className="gh-chips" />
        </div>
      )
    case 'memory':
      return (
        <div className="gh-memory-art">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className={[1, 6].includes(i) ? 'mm-mini up' : i === 3 ? 'mm-mini up mine' : 'mm-mini'}>
              {[1, 6].includes(i) ? <FarmIcon name={MEMORY_FACES[0] as FarmIconName} /> : i === 3 ? <FarmIcon name={MEMORY_FACES[5] as FarmIconName} /> : null}
            </span>
          ))}
        </div>
      )
    case 'stapelgek':
      return (
        <div className="gh-stapel-art">
          {[1, 5, 9, 12].map((v, i) => (
            <span key={v} className={`sg-card ${v <= 4 ? 'b' : v <= 8 ? 'g' : 'r'}`} style={{ '--i': i } as CSSProperties}>
              <b>{v}</b>
            </span>
          ))}
          <span className="sg-card joker" style={{ '--i': 4 } as CSSProperties}>
            <b>★</b>
          </span>
        </div>
      )
    case 'yacht':
      return (
        <div className="gh-yacht-art">
          {[6, 6, 6, 6, 6].map((v, i) => (
            <Die key={i} value={v} i={i} held={i < 3} />
          ))}
        </div>
      )
    case 'kleurwissel':
      return (
        <div className="gh-kleur-art">
          <KleurCard card={{ id: 1, colour: 'rood', kind: 'getal', n: 7 }} style={{ '--i': 0 } as CSSProperties} />
          <KleurCard card={{ id: 2, colour: 'blauw', kind: 'plus2' }} style={{ '--i': 1 } as CSSProperties} />
          <KleurCard card={{ id: 3, colour: 'groen', kind: 'draai' }} style={{ '--i': 2 } as CSSProperties} />
          <KleurCard card={{ id: 4, colour: null, kind: 'plus4' }} style={{ '--i': 3 } as CSSProperties} />
        </div>
      )
    case 'quiz':
      return (
        <div className="gh-quiz-art">
          <b>Wat is de hoofdstad van Australië?</b>
          <span className="qz-answer qz-0">A Sydney</span>
          <span className="qz-answer qz-1 correct">B Canberra</span>
          <span className="qz-answer qz-2">C Melbourne</span>
          <span className="qz-answer qz-3">D Perth</span>
        </div>
      )
  }
}


export function GamesPage() {
  usePageTitle('Spellen - Kuddes')
  const { user } = useAuth()
  return (
    <main className="page page-con gh-layout">
      <div className="gm-page">
        <Box title="Kuddes Spellen" icon="controller">
          <p className="gh-intro">
            Speel spelletjes tegen je vrienden, rechtstreeks in je browser. Daag iemand uit, win potjes en verdien <Link to={user ? `/prestaties/${user.username}` : '/inloggen'}>prestaties</Link>{' '}
            voor op je profiel.
          </p>
          {MAIN_GAMES.map((kind) => (
            <GameCard key={kind} kind={kind} me={user ?? null} />
          ))}
        </Box>
        <Box title="Alleen spelen" icon="user">
          <p className="gh-solo-intro muted">Even niemand online? Deze speel je in je eentje. Je beste scores komen in de lijst.</p>
          {SOLO_KINDS.map((kind) => (
            <SoloCard key={kind} kind={kind} />
          ))}
        </Box>
        {user && <MyGames />}
      </div>
      <aside className="gh-side sticky-side">
        {user && <StatsBox username={user.username} />}
        <Leaderboard />
      </aside>
    </main>
  )
}

function SoloCard({ kind }: { kind: SoloKind }) {
  const game = SOLO_GAMES[kind]
  return (
    <div className="gh-game">
      <div className={`gh-game-art ${kind}`} aria-hidden>
        {kind === 'patience' ? (
          <div className="gh-patience-art" style={{ '--card-w': '44px' } as CSSProperties}>
            {[
              [13, 0],
              [12, 1],
              [11, 3],
              [10, 2],
            ].map(([rank, suit], i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>
                <PlayingCard rank={rank} suit={suit} />
              </span>
            ))}
          </div>
        ) : kind === 'mahjong' ? (
          <div className="gh-mahjong-art">
            {['東', '中', '發', '北', '白'].map((c, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties} className={i === 1 ? 'red' : i === 2 ? 'green' : undefined}>
                {c === '白' ? '' : c}
              </span>
            ))}
          </div>
        ) : kind === 'mijnenveger' ? (
          // A corner of a field: numbers, a flag and the bomb
          <div className="gh-mines-art">
            {['1', '', 'f', '2', '1', '', '1', '2', 'b', '', '', '1', '', '1', '', ''].map((c, i) => (
              <span key={i} className={c === '' ? 'closed' : c === 'f' ? 'closed' : `n${c}`}>
                {c === 'f' ? <FarmIcon name="flag_red" /> : c === 'b' ? <FarmIcon name="bomb" /> : c}
              </span>
            ))}
          </div>
        ) : kind === 'bejeweled' ? (
          // The game's own title screen and logo (from games/bejeweled, served at /bejeweled/)
          <div className="gh-bejeweled-art">
            <img src="/bejeweled/assets/img/logo.png" alt="" loading="lazy" />
          </div>
        ) : (
          <div className="gh-bubble-art">
            {['#e8413e', '#f6c522', '#3cb44b', '#3a78e6', '#a052d8', '#3a78e6', '#e8413e', '#1ec8c8', '#f6c522', '#3cb44b', '#a052d8'].map((c, i) => (
              <span key={i} style={{ '--b': c } as CSSProperties} />
            ))}
          </div>
        )}
      </div>
      <div>
        <h2>
          <FarmIcon name={game.icon as FarmIconName} size={32} /> {game.name}
          <span className="gh-players" title="Voor één speler">
            <FarmIcon name="user" /> 1
          </span>
        </h2>
        <p className="muted">{game.tagline}</p>
        <p>{game.description}</p>
        <div className="gh-challenge">
          <Link to={soloHref(kind)} className="btn btn-cta">
            <FarmIcon name="control_play_blue" /> Spelen
          </Link>
        </div>
      </div>
    </div>
  )
}

function GameCard({ kind, me }: { kind: GameKind; me: Me | null }) {
  const game = GAMES[kind]
  const [picking, setPicking] = useState(false)
  return (
    <div className="gh-game">
      <div className={`gh-game-art ${kind}`} aria-hidden>
        <GameArt kind={kind} />
      </div>
      <div>
        <h2>
          <FarmIcon name={game.icon as FarmIconName} size={32} /> {game.name}
          {game.players > 2 && (
            <span className="gh-players" title={`2 tot ${game.players} spelers`}>
              <FarmIcon name="group" /> 2–{game.players}
            </span>
          )}
        </h2>
        <p className="muted">{game.tagline}</p>
        <p>{game.description}</p>
        {kind === 'spray' && (
          <p>
            <Link to="/graffiti" className="btn">
              <FarmIcon name="paintcan" /> Alleen spuiten
            </Link>
          </p>
        )}
        {!me ? (
          <p>
            <Link to="/inloggen?next=/spellen">Log in</Link> om je vrienden uit te dagen.
          </p>
        ) : (
          <div className="gh-challenge">
            <Button variant="cta" onClick={() => setPicking(true)}>
              <FarmIcon name={kind === 'spray' ? 'group_add' : 'controller_add'} /> {kind === 'spray' ? 'Vrienden uitnodigen' : game.players > 2 ? 'Vrienden uitdagen' : 'Een vriend uitdagen'}
            </Button>
          </div>
        )}
        {picking && me && <FriendPicker kind={kind} me={me} onClose={() => setPicking(false)} />}
      </div>
    </div>
  )
}

function MyGames() {
  const { data } = useMyGames()
  const answer = useAnswerInvite()
  if (!data) return null
  const open = data.incoming.length + data.outgoing.length + data.active.length
  return (
    <>
      <Box title="Uitdagingen en potjes" icon="dice">
        {open === 0 ? (
          <p className="empty">Geen openstaande uitdagingen. Daag hierboven een vriend uit!</p>
        ) : (
          <ul className="gh-list">
            {data.incoming.map((g) => (
              <li key={g.id}>
                <Faces users={othersIn(g).map((p) => p.user)} />
                <span>
                  <b>{g.players[0].user.nickname}</b> daagt je uit voor {GAMES[g.kind].name}
                  {othersIn(g).length > 1 && <> met {namesList(othersIn(g).filter((p) => p.seat !== 0).map((p) => p.user.nickname))}</>}
                </span>
                <span className="gh-actions">
                  <Button variant="cta" onClick={() => answer.mutate({ game: g, accept: true })}>
                    Aannemen
                  </Button>
                  <Button onClick={() => answer.mutate({ game: g, accept: false })}>Nee, bedankt</Button>
                </span>
              </li>
            ))}
            {data.active.map((g) => (
              <li key={g.id}>
                <Faces users={othersIn(g).filter((p) => p.status === 'meedoen').map((p) => p.user)} />
                <span>
                  {GAMES[g.kind].name} {g.kind === 'spray' ? 'met' : 'tegen'} <b>{namesList(othersIn(g).filter((p) => p.status === 'meedoen').map((p) => p.user.nickname))}</b>
                </span>
                <span className="gh-actions">
                  <Link to={gameHref(g)} className="btn btn-cta">
                    Verder spelen
                  </Link>
                </span>
              </li>
            ))}
            {data.outgoing.map((g) => (
              <li key={g.id}>
                <Faces users={othersIn(g).map((p) => p.user)} />
                <span>
                  Wacht op <b>{namesList(othersIn(g).filter((p) => p.status === 'uitgenodigd').map((p) => p.user.nickname))}</b> ({GAMES[g.kind].name})
                </span>
                <span className="gh-actions">
                  <Link to={gameHref(g)}>Bekijken</Link>
                  {g.seat === 0 && <Button onClick={() => answer.mutate({ game: g, accept: false })}>Intrekken</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {answer.isError && <p className="form-error">{errorMessage(answer.error)}</p>}
      </Box>
      {data.recent.length > 0 && (
        <Box title="Laatste potjes" icon="time">
          <ul className="gh-list">
            {data.recent.map((g) => (
              <RecentGame key={g.id} game={g} />
            ))}
          </ul>
        </Box>
      )}
    </>
  )
}

/** A finished game, seen from `player` (a username), or from you. */
export function RecentGame({ game: g, player }: { game: GameSummary; player?: string }) {
  const seat = player ? (g.players.find((p) => p.user.username === player)?.seat ?? null) : g.seat
  const me = g.players.find((p) => p.seat === seat)
  const others = othersIn(g, seat).filter((p) => p.status === 'meedoen' || p.status === 'weg')
  const opponent = others[0]?.user ?? (g.you === 'host' ? g.guest : g.host)
  const mine = me?.score ?? 0
  const theirs = others[0]?.score ?? 0
  const outcome = g.status !== 'klaar' ? null : g.winnerId === null ? 'gelijk' : g.winnerId === me?.user.id ? 'won' : 'lost'
  const many = others.length > 1
  return (
    <li>
      {many ? <Faces users={others.map((p) => p.user)} /> : <Avatar user={opponent} size="tiny" />}
      <span>
        {GAMES[g.kind].name} {g.kind === 'spray' ? 'met' : 'tegen'}{' '}
        {many ? (
          namesList(others.map((p) => p.user.nickname))
        ) : (
          <Link to={`/profiel/${opponent.username}`}>{opponent.nickname}</Link>
        )}
      </span>
      {outcome ? (
        <span className={`gh-result ${outcome}`}>
          {outcome === 'won' ? 'Gewonnen' : outcome === 'lost' ? 'Verloren' : 'Gelijk'} {many ? '' : `${mine}–${theirs}`}
        </span>
      ) : (
        <span className="muted">{g.status === 'geweigerd' ? 'afgeslagen' : 'gestopt'}</span>
      )}
      <span className="gh-actions muted">
        {formatTime(g.finishedAt ?? g.createdAt)}
        {g.status === 'klaar' && g.seat !== null && (
          <>
            {' · '}
            <Link to={gameHref(g)}>bord</Link>
          </>
        )}
      </span>
    </li>
  )
}

/** Your numbers: a ring with how often you win, and the streaks and record under it. */
export function StatsGrid({ stats }: { stats: GameStats }) {
  const ratio = stats.played ? Math.round((stats.won / stats.played) * 100) : 0
  return (
    <div className="gs-stats">
      <div className="gs-top">
        <div className="gs-ring" style={{ '--pct': ratio } as CSSProperties} role="img" aria-label={`${ratio}% gewonnen`}>
          <b>{ratio}%</b>
          <span>winst</span>
        </div>
        <dl className="gs-tally">
          <div>
            <dt>Gespeeld</dt>
            <dd>{stats.played}</dd>
          </div>
          <div className="won">
            <dt>Gewonnen</dt>
            <dd>{stats.won}</dd>
          </div>
          <div className="lost">
            <dt>Verloren</dt>
            <dd>{stats.lost}</dd>
          </div>
          {stats.drawn > 0 && (
            <div>
              <dt>Gelijk</dt>
              <dd>{stats.drawn}</dd>
            </div>
          )}
        </dl>
      </div>
      <ul className="gs-rows">
        <li>
          <FarmIcon name="fire" />
          <span>Nu op rij gewonnen</span>
          <b>{stats.streak}</b>
        </li>
        <li>
          <FarmIcon name="medal_gold_1" />
          <span>Beste reeks</span>
          <b>{stats.bestStreak}</b>
        </li>
        <li>
          <FarmIcon name="coins" />
          <span>Hoogste Mancala-score</span>
          <b>{stats.bestScore}</b>
        </li>
      </ul>
    </div>
  )
}

function StatsBox({ username }: { username: string }) {
  const { data } = useMyGames()
  return (
    <Box title="Jouw statistieken" icon="chart_bar">
      {data ? <StatsGrid stats={data.stats} /> : <p className="muted">Laden…</p>}
      <Link to={`/prestaties/${username}`} className="gs-more">
        <FarmIcon name="award_star_gold_1" /> Mijn prestaties »
      </Link>
    </Box>
  )
}

function Leaderboard() {
  const { data = [] } = useLeaderboard()
  return (
    <Box title="Toppers" icon="cup_gold">
      {data.length === 0 ? (
        <p className="empty">Nog niemand heeft gewonnen. Word jij de eerste?</p>
      ) : (
        <ol className="gh-list">
          {data.map((row, i) => (
            <li key={row.user.username}>
              <b>{i + 1}.</b>
              <Avatar user={row.user} size="tiny" />
              <Link to={`/prestaties/${row.user.username}`}>{row.user.nickname}</Link>
              <span className="gh-actions muted">{row.wins} gewonnen</span>
            </li>
          ))}
        </ol>
      )}
    </Box>
  )
}
