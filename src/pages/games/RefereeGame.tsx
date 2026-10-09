import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { GAMES, type GameSummary } from '../../../shared/games'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { Emote, EmoteBar, Invite, OpponentGone, PlayerCard, PresenceBadge, Result, SoundToggle } from '../../features/games/GameParts'
import { useEmotes, useFinishedRefresh, useResultSound, useYourTurnSound } from '../../features/games/gameHooks'
import type { RefereeDef } from '../../features/games/refereeGames'
import { useGameRoom } from '../../features/games/useGameRoom'
import { namesList } from '../../features/games/players'
import { api, errorMessage } from '../../lib/api'
import '../../features/games/NewGames.css'

/**
 * A card game the server referees (Memory, Stapelgek, Kleurwissel): every
 * action goes to the server, which answers with each player's own view.
 */
export function RefereeGame({ initial, me, def }: { initial: GameSummary; me: Me; def: RefereeDef<unknown> }) {
  const refresh = useFinishedRefresh()
  const emotes = useEmotes()
  const [view, setView] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const room = useGameRoom({
    gameId: initial.id,
    enabled: initial.status === 'uitgenodigd' || initial.status === 'bezig',
    p2p: false,
    onMessage: (m) => m.kind === 'emote' && emotes.show(m.from ?? 'them', m.data.emote),
    onConnected: () => undefined,
    onState: (s) => setView(s),
  })
  const game = room.game ?? initial
  const { data: finalView } = useQuery({
    queryKey: ['games', 'state', game.id, game.status],
    queryFn: () => api<unknown>(`/games/${game.id}/state`),
    enabled: game.status === 'klaar',
  })
  const v = game.status === 'klaar' ? (finalView ?? view) : view
  const my = game.seat ?? 0
  // Everyone at the table, in seat order, and their names for the board
  const table = game.players.filter((p) => p.status === 'meedoen' || p.status === 'weg')
  const names = table.map((p) => (p.seat === my ? 'Jij' : p.user.nickname))
  const others = table.filter((p) => p.seat !== my)
  const opponent = others[0]?.user ?? (game.you === 'host' ? game.guest : game.host)
  const playing = game.status === 'bezig'
  const turn = v ? def.turn(v) : null
  const myTurn = playing && !!v && !def.over(v) && turn === my
  const still = game.players.find((p) => p.seat === my)?.status === 'meedoen'
  const playingOthers = others.filter((p) => p.status === 'meedoen')
  const hereCount = playingOthers.filter((p) => room.online.includes(p.user.id)).length
  const presence = hereCount === playingOthers.length ? 'Iedereen is er' : hereCount === 0 ? 'Wachten op de anderen' : `${hereCount} van de ${playingOthers.length} zijn er`
  useYourTurnSound(myTurn)
  useResultSound(game)

  // Sounds and messages for what just happened
  const before = useRef<unknown>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const namesKey = names.join('\n')
  useEffect(() => {
    if (!v) return
    const prev = before.current
    before.current = v
    if (!prev) return
    def.sounds?.(prev, v, my)
    const note = def.note?.(prev, v, my, namesKey.split('\n'))
    if (note) {
      setFlash(note)
      const t = window.setTimeout(() => setFlash(null), 2600)
      return () => window.clearTimeout(t)
    }
  }, [v, def, my, namesKey])

  useEffect(() => {
    if (game.status === 'klaar') refresh(game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status])

  const act = async (action: unknown) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setView(await api<unknown>(`/games/${game.id}/play`, { method: 'POST', body: { action } }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const info = GAMES[game.kind]
  const Board = def.Board
  return (
    <div className="gm-page">
      <div className={table.length > 2 ? 'gm-players many' : 'gm-players'} style={{ '--n': Math.max(2, table.length) } as CSSProperties}>
        {(table.length ? table : [{ seat: my, user: me, status: 'meedoen' as const }]).map((p) => {
          const isMe = p.seat === my
          const emote = emotes.emote && (isMe ? emotes.emote.who === 'me' : emotes.emote.who === p.user.id || (emotes.emote.who === 'them' && others.length === 1))
          return (
            <PlayerCard
              key={p.seat}
              user={p.user}
              score={v ? def.score(v, p.seat) : 0}
              scoreTitle={def.scoreTitle}
              active={playing && turn === p.seat}
              side={isMe ? 'right' : 'left'}
              note={isMe ? 'jij' : p.status === 'weg' ? 'gestopt' : playing ? (room.online.includes(p.user.id) ? 'is er' : 'is er niet') : null}
            >
              {emote && <Emote key={emotes.emote!.at} name={emotes.emote!.name} />}
            </PlayerCard>
          )
        })}
      </div>

      <Box
        title={info.name}
        icon={info.icon as FarmIconName}
        actions={
          <span className="gm-box-actions">
            {playing && <PresenceBadge online={room.peerOnline} text={others.length > 1 ? presence : undefined} />}
            <SoundToggle />
          </span>
        }
      >
        {game.status === 'uitgenodigd' ? (
          <Invite game={game} opponent={opponent} />
        ) : !v ? (
          <p className="muted">Kaarten schudden…</p>
        ) : (
          <>
            <div className="gm-status">
              <span className="gm-turn" aria-live="polite">
                {!playing ? 'Afgelopen' : (flash ?? (myTurn ? def.yourTurn(v) : `${turn !== null ? names[turn] ?? opponent.nickname : opponent.nickname} is aan de beurt…`))}
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
            <Board view={v} my={my} myTurn={myTurn && !busy} act={act} opponent={opponent.nickname} names={names} finished={!playing || !still} />
            {playing && still && others.some((p) => p.status === 'meedoen' && !room.online.includes(p.user.id)) && (
              <OpponentGone
                many={playingOthers.filter((p) => !room.online.includes(p.user.id)).length > 1}
                goOn={playingOthers.length > 1}
                name={namesList(others.filter((p) => p.status === 'meedoen' && !room.online.includes(p.user.id)).map((p) => p.user.nickname))}
                goneSince={Math.max(...others.filter((p) => p.status === 'meedoen' && !room.online.includes(p.user.id)).map((p) => room.goneSince[p.user.id] ?? room.peerGoneSince ?? Date.now()))}
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
              <Result game={game} opponent={opponent} me={me} scoreLabel={def.resultLine} />
            ) : !still ? (
              <p className="muted">Je bent gestopt; de anderen spelen verder. <Link to="/spellen">« Spellen</Link></p>
            ) : (
              <div className="account-actions">
                <Button
                  onClick={() =>
                    confirm(others.filter((p) => p.status === 'meedoen').length > 1 ? 'Opgeven? De anderen spelen zonder jou verder.' : 'Opgeven? Dan wint je tegenstander.') &&
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

      <Box title={`Zo speel je ${info.name}`} icon="information">
        {def.rules}
        <p className="muted">{def.fairness ?? 'De kaarten zijn geschud door Kuddes, en alleen jij ziet je eigen hand.'}</p>
      </Box>
    </div>
  )
}
