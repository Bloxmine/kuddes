import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import type { GameSummary } from '../../../shared/games'
import { FLEET, SIZE, cellsOf, randomFleet, type Ship, type Shot, type ZeeslagView } from '../../../shared/games/zeeslag'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Emote, EmoteBar, Invite, SoundToggle, OpponentGone, PlayerCard, PresenceBadge, Result } from '../../features/games/GameParts'
import { useEmotes, useFinishedRefresh, useResultSound, useYourTurnSound } from '../../features/games/gameHooks'
import { playBoom, playSplash } from '../../features/games/sounds'
import { useGameRoom } from '../../features/games/useGameRoom'
import { api, errorMessage } from '../../lib/api'

const key = (x: number, y: number) => `${x},${y}`

/** A 10×10 sea: ships, shots and what you can click. */
function Sea({
  ships,
  shots,
  label,
  onCell,
  clickable,
  preview,
  onHover,
}: {
  ships: Ship[]
  shots: Shot[]
  label: string
  onCell?: (x: number, y: number) => void
  clickable?: (x: number, y: number) => boolean
  /** Where the ship you're placing would go. */
  preview?: { cells: string[]; ok: boolean } | null
  onHover?: (cell: [number, number] | null) => void
}) {
  const shipAt = new Map<string, { ship: Ship; i: number }>()
  ships.forEach((ship) => cellsOf(ship).forEach(([x, y], i) => shipAt.set(key(x, y), { ship, i })))
  const sunk = new Set(shots.filter((s) => s.sunk).flatMap((s) => cellsOf(s.sunk!).map(([x, y]) => key(x, y))))
  const shotAt = new Map(shots.map((s) => [key(s.x, s.y), s]))
  const last = shots[shots.length - 1]
  return (
    <div className="zs-sea-wrap">
      <b className="zs-label">{label}</b>
      <div className="zs-sea" role="grid" aria-label={label} onMouseLeave={() => onHover?.(null)}>
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const x = i % SIZE
          const y = Math.floor(i / SIZE)
          const k = key(x, y)
          const part = shipAt.get(k)
          const shot = shotAt.get(k)
          const canClick = !!onCell && (clickable?.(x, y) ?? true)
          const classes = [
            'zs-cell',
            part && 'ship',
            part && `${part.ship.dir}${part.i === 0 ? ' start' : part.i === part.ship.len - 1 ? ' end' : ''}`,
            shot?.r === 'mis' && 'miss',
            shot && shot.r !== 'mis' && 'hit',
            sunk.has(k) && 'sunk',
            last && last.x === x && last.y === y && 'last',
            preview?.cells.includes(k) && (preview.ok ? 'preview' : 'preview bad'),
            canClick && 'clickable',
          ]
          return (
            <button
              key={k}
              type="button"
              role="gridcell"
              className={classes.filter(Boolean).join(' ')}
              disabled={!canClick}
              onClick={() => onCell?.(x, y)}
              onMouseEnter={() => onHover?.([x, y])}
              aria-label={`${'ABCDEFGHIJ'[x]}${y + 1}${shot ? `: ${shot.r}` : part ? ': schip' : ''}`}
            >
              {shot && shot.r !== 'mis' && <span className="zs-fire" />}
              {shot?.r === 'mis' && <span className="zs-splash" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Placing your fleet: pick a ship, turn it, put it down; or let chance decide. */
function Placement({ gameId, opponentReady, opponentName }: { gameId: number; opponentReady: boolean; opponentName: string }) {
  const [ships, setShips] = useState<(Ship | null)[]>(() => FLEET.map(() => null))
  const [current, setCurrent] = useState(0)
  const [dir, setDir] = useState<'h' | 'v'>('h')
  const [hover, setHover] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const placed = ships.filter((s): s is Ship => s !== null)
  const len = FLEET[current]?.len ?? 0
  const candidate = hover && ships[current] === null ? ({ x: hover[0], y: hover[1], len, dir } as Ship) : null
  const candidateOk = !!candidate && fitsWith(ships, current, candidate)

  const put = (x: number, y: number) => {
    // Clicking a placed ship picks it up again
    const hit = ships.findIndex((s) => s && cellsOf(s).some(([cx, cy]) => cx === x && cy === y))
    if (hit >= 0) {
      setShips((list) => list.map((s, i) => (i === hit ? null : s)))
      setCurrent(hit)
      return
    }
    if (ships[current] !== null) return
    const ship: Ship = { x, y, len, dir }
    if (!fitsWith(ships, current, ship)) return setError('Daar past hij niet: schepen mogen elkaar niet raken en niet buiten het bord steken.')
    setError(null)
    const next = ships.map((s, i) => (i === current ? ship : s))
    setShips(next)
    const free = next.findIndex((s) => s === null)
    if (free >= 0) setCurrent(free)
  }

  const send = async () => {
    setSending(true)
    try {
      await api(`/games/${gameId}/zeeslag/fleet`, { method: 'POST', body: { ships: placed } })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="zs-place">
      <Sea
        ships={placed}
        shots={[]}
        label="Jouw vloot"
        onCell={(x, y) => put(x, y)}
        onHover={setHover}
        preview={candidate ? { cells: cellsOf(candidate).map(([x, y]) => key(x, y)), ok: candidateOk } : null}
      />
      <div className="zs-dock">
        <p>
          <b>Plaats je schepen.</b> Kies een schip, draai het als je wilt en klik op het bord. Schepen mogen elkaar niet raken, ook niet schuin.
        </p>
        <ul className="zs-ships">
          {FLEET.map((f, i) => (
            <li key={f.name}>
              <button type="button" className={[i === current && 'current', ships[i] && 'done'].filter(Boolean).join(' ')} onClick={() => setCurrent(i)}>
                <span className="zs-ship-icon" style={{ width: f.len * 14 }} /> {f.name} ({f.len})
                {ships[i] && <FarmIcon name="tick" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="account-actions">
          <Button onClick={() => setDir(dir === 'h' ? 'v' : 'h')}>
            <FarmIcon name="arrow_refresh" /> Draaien ({dir === 'h' ? 'liggend' : 'staand'})
          </Button>
          <Button
            onClick={() => {
              setShips(randomFleet())
              setError(null)
            }}
          >
            <FarmIcon name="dice" /> Willekeurig
          </Button>
        </div>
        <div className="account-actions">
          <Button variant="cta" disabled={placed.length !== FLEET.length || sending} onClick={send}>
            <FarmIcon name="flag_finish" /> Klaar!
          </Button>
          <span className="muted">{opponentReady ? `${opponentName} is al klaar.` : `${opponentName} is nog bezig.`}</span>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </div>
  )
}

/** Whether `ship` can go on the board next to the others (inside, not touching). */
function fitsWith(ships: (Ship | null)[], index: number, ship: Ship) {
  const others = ships.filter((s, i): s is Ship => s !== null && i !== index)
  const taken = new Set(others.flatMap((s) => cellsOf(s).map(([x, y]) => key(x, y))))
  return cellsOf(ship).every(([x, y]) => x < SIZE && y < SIZE && ![-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => taken.has(key(x + dx, y + dy)))))
}

/** Zeeslag: the server keeps both fleets and answers every shot. */
export function ZeeslagGame({ initial, me }: { initial: GameSummary; me: Me }) {
  const refresh = useFinishedRefresh()
  const emotes = useEmotes()
  const [view, setView] = useState<ZeeslagView | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const room = useGameRoom({
    gameId: initial.id,
    enabled: initial.status === 'uitgenodigd' || initial.status === 'bezig',
    p2p: false,
    onMessage: (m) => m.kind === 'emote' && emotes.show('them', m.data.emote),
    onConnected: () => undefined,
    onState: (s) => setView(s as ZeeslagView),
  })
  const game = room.game ?? initial
  // Finished games: the final boards
  const { data: finalView } = useQuery({
    queryKey: ['games', 'state', game.id, game.status],
    queryFn: () => api<ZeeslagView>(`/games/${game.id}/state`),
    enabled: game.status === 'klaar',
  })
  const v = game.status === 'klaar' ? (finalView ?? view) : view
  const my = game.you === 'host' ? 0 : 1
  const self = my === 0 ? game.host : game.guest
  const opponent = my === 0 ? game.guest : game.host
  const playing = game.status === 'bezig'

  const fire = async (x: number, y: number) => {
    setError(null)
    try {
      const r = await api<{ r: string; sunk?: Ship }>(`/games/${game.id}/zeeslag/shot`, { method: 'POST', body: { x, y } })
      setFlash(r.r === 'mis' ? 'Mis! Plons…' : r.r === 'raak' ? 'Raak! Je mag nog een keer.' : `Gezonken! Je mag nog een keer.`)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const myShots = v?.shots.filter((s) => s.p === my) ?? []
  const theirShots = v?.shots.filter((s) => s.p !== my) ?? []
  const hits = (list: Shot[]) => list.filter((s) => s.r !== 'mis').length
  const myTurn = playing && v?.phase === 'spelen' && v.turn === my
  useYourTurnSound(!!myTurn)
  useResultSound(game)
  const shotCount = useRef<number | null>(null)
  const lastShot = v?.shots[v.shots.length - 1]
  useEffect(() => {
    const n = v?.shots.length ?? null
    const isNew = shotCount.current !== null && n === shotCount.current + 1
    shotCount.current = n
    if (!isNew || !lastShot) return
    if (lastShot.r === 'mis') playSplash()
    else playBoom(!!lastShot.sunk)
  }, [v?.shots.length, lastShot])
  // Finished (by a shot, a resignation or leaving): stats and achievements are new
  useEffect(() => {
    if (game.status === 'klaar') refresh(game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status])

  return (
    <div className="gm-page">
      <div className="gm-players">
        <PlayerCard user={opponent} score={hits(theirShots)} scoreTitle="Treffers" active={playing && v?.phase === 'spelen' && v.turn !== my} side="left" note={playing ? (room.peerOnline ? 'is er' : 'is er niet') : null}>
          {emotes.emote?.who === 'them' && <Emote key={emotes.emote.at} name={emotes.emote.name} />}
        </PlayerCard>
        <span className="gm-vs">tegen</span>
        <PlayerCard user={self} score={hits(myShots)} scoreTitle="Treffers" active={!!myTurn} side="right" note="jij">
          {emotes.emote?.who === 'me' && <Emote key={emotes.emote.at} name={emotes.emote.name} />}
        </PlayerCard>
      </div>

      <Box title="Zeeslag" icon="bomb" actions={
          <span className="gm-box-actions">
            {playing && <PresenceBadge online={room.peerOnline} />}
            <SoundToggle />
          </span>
        }
      >
        {game.status === 'uitgenodigd' ? (
          <Invite game={game} opponent={opponent} />
        ) : !v ? (
          <p className="muted">Laden…</p>
        ) : (
          <>
            <div className="gm-status">
              <span className="gm-turn" aria-live="polite">
                {!playing
                  ? 'Afgelopen'
                  : v.phase === 'plaatsen'
                    ? v.fleet.length
                      ? `Wachten tot ${opponent.nickname} de schepen heeft geplaatst…`
                      : 'Verstop je vloot'
                    : (flash ?? (myTurn ? 'Jij bent aan de beurt: schiet op het bord rechts' : `${opponent.nickname} schiet…`))}
              </span>
              {playing && (
                <EmoteBar
                  onSend={(name) => {
                    room.send({ kind: 'emote', data: { emote: name } })
                    emotes.show('me', name)
                  }}
                />
              )}
            </div>
            {playing && v.phase === 'plaatsen' && !v.fleet.length ? (
              <Placement gameId={game.id} opponentReady={v.opponentReady} opponentName={opponent.nickname} />
            ) : (
              <div className="zs-seas">
                <Sea ships={v.fleet} shots={theirShots} label="Jouw vloot" />
                <Sea
                  ships={[...(v.revealed ?? []), ...myShots.filter((s) => s.sunk).map((s) => s.sunk!)]}
                  shots={myShots}
                  label={`De vloot van ${opponent.nickname}`}
                  onCell={myTurn ? (x, y) => void fire(x, y) : undefined}
                  clickable={(x, y) => !myShots.some((s) => s.x === x && s.y === y)}
                />
              </div>
            )}
            {playing && !room.peerOnline && (
              <OpponentGone
                name={opponent.nickname}
                goneSince={room.peerGoneSince}
                onClaim={() =>
                  void api<GameSummary>(`/games/${game.id}/claim`, { method: 'POST', body: {} })
                    .then((g) => {
                      room.setGame(g)
                      refresh(g)
                    })
                    .catch((e) => setError(errorMessage(e)))
                }
              />
            )}
            {error && <p className="form-error">{error}</p>}
            {!playing ? (
              <Result game={game} opponent={opponent} me={me} scoreLabel={(a, b) => `${a} – ${b} treffers`} />
            ) : (
              <div className="account-actions">
                <Button
                  onClick={() =>
                    confirm('Opgeven? Dan wint je tegenstander.') &&
                    void api<GameSummary>(`/games/${game.id}/resign`, { method: 'POST' })
                      .then((g) => {
                        room.setGame(g)
                        refresh(g)
                      })
                      .catch((e) => setError(errorMessage(e)))
                  }
                >
                  <FarmIcon name="flag_red" /> Opgeven
                </Button>
                <Link to="/spellen">« Spellen</Link>
              </div>
            )}
          </>
        )}
      </Box>

      <Box title="Zo speel je Zeeslag" icon="information">
        <ul className="gm-rules">
          <li>Verstop je vijf schepen op je eigen bord: een vliegdekschip (5), slagschip (4), kruiser (3), onderzeeër (3) en torpedobootjager (2). Ze mogen elkaar niet raken.</li>
          <li>Schiet om de beurt op een vakje van je tegenstander. Raak? Dan mag je nog een keer. Mis? Dan is de ander.</li>
          <li>Een schip zinkt als al zijn vakjes geraakt zijn. Wie als eerste de hele vloot van de ander laat zinken, wint.</li>
        </ul>
        <p className="muted">Kuddes houdt de vloten geheim en beantwoordt elk schot, zodat niemand bij de ander kan spieken.</p>
      </Box>
    </div>
  )
}
