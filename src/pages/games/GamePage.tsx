import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import { GAMES, isGameKind, type GameSummary } from '../../../shared/games'
import { isTurnKind } from '../../../shared/games/rules'
import { firstPlayer } from '../../../shared/mancala'
import { RequireAuth } from '../../components/layout/RequireAuth'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { FarmIconName } from '../../components/ui/farmIcons'
import { REFEREE_GAMES } from '../../features/games/refereeGames'
import { RefereeGame } from './RefereeGame'
import { EmoteBar, Emote, Invite, OpponentGone, PlayerCard, Result, SoundToggle, TransportBadge } from '../../features/games/GameParts'
import { useEmotes, useFinishedRefresh, useResultSound, useYourTurnSound } from '../../features/games/gameHooks'
import { gameHref, gameKeys } from '../../features/games/gameQueries'
import { TURN_GAMES, type TurnGameDef } from '../../features/games/turnGames'
import { useGameRoom, type PlayMessage } from '../../features/games/useGameRoom'
import { ApiRequestError, api, errorMessage } from '../../lib/api'
import { usePageTitle } from '../../lib/usePageTitle'
import { QuizGame } from './QuizGame'
import { ZeeslagGame } from './ZeeslagGame'
import { SprayGame } from './SprayPage'
import '../../features/games/Games.css'

type Player = 0 | 1

/** /spellen/:kind/:id: any game. */
export function GamePage() {
  const { kind = '', id = '' } = useParams()
  usePageTitle(`${isGameKind(kind) ? GAMES[kind].name : 'Spel'} - Spellen - Kuddes`)
  return (
    <main className="page page-con">
      <RequireAuth>{(me) => <GameLoader id={Number(id)} kind={kind} me={me} />}</RequireAuth>
    </main>
  )
}

function GameLoader({ id, kind, me }: { id: number; kind: string; me: Me }) {
  const { data, isLoading, error } = useQuery({ queryKey: gameKeys.game(id), queryFn: () => api<GameSummary>(`/games/${id}`), retry: false })
  if (isLoading) return <p className="muted">Laden…</p>
  if (!data) {
    return (
      <Box title="Spellen" icon="controller">
        <p className="empty">{error instanceof ApiRequestError && error.status === 404 ? 'Dit spel bestaat niet (meer).' : errorMessage(error)}</p>
        <Link to="/spellen">« Terug naar Spellen</Link>
      </Box>
    )
  }
  // An old link with the wrong game in it
  if (data.kind !== kind) return <Navigate to={gameHref(data)} replace />
  if (data.kind === 'zeeslag') return <ZeeslagGame initial={data} me={me} />
  if (data.kind === 'quiz') return <QuizGame initial={data} me={me} />
  if (data.kind in REFEREE_GAMES) return <RefereeGame initial={data} me={me} def={REFEREE_GAMES[data.kind as keyof typeof REFEREE_GAMES]} />
  if (data.kind === 'spray') return <SprayGame initial={data} me={me} />
  if (isTurnKind(data.kind)) return <TurnGame initial={data} me={me} def={TURN_GAMES[data.kind]} />
  return null
}

// ------------------------------------------------------------ turn games

const storageKey = (id: number) => `kuddes.spel.${id}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const isPrefix = (a: unknown[], b: unknown[]) => a.length <= b.length && a.every((m, i) => same(b[i], m))

/**
 * A turn-based game played peer to peer (Mancala, Vier op een rij, Dammen):
 * the moves go straight to the other player, both check them with the same
 * rules, and at the end both report the whole game to the server.
 */
function TurnGame({ initial, me, def }: { initial: GameSummary; me: Me; def: TurnGameDef<unknown, unknown> }) {
  const refresh = useFinishedRefresh()
  const id = initial.id
  const first = firstPlayer(id)
  const valid = useCallback(
    (moves: unknown[]) => {
      try {
        def.replay(moves, first)
        return true
      } catch {
        return false
      }
    },
    [def, first],
  )
  const [moves, setMoves] = useState<unknown[]>(() => {
    if (initial.status === 'klaar') return initial.moves
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey(id)) ?? '[]') as unknown[]
      return Array.isArray(saved) && valid(saved) ? saved : []
    } catch {
      return []
    }
  })
  const movesRef = useRef(moves)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const emotes = useEmotes()
  const flashTimer = useRef<number | undefined>(undefined)

  const commit = (next: unknown[]) => {
    movesRef.current = next
    setMoves(next)
    try {
      sessionStorage.setItem(storageKey(id), JSON.stringify(next))
    } catch {
      // only a reload loses the game then; the other player still has it
    }
  }
  const state = useMemo(() => def.replay(moves, first), [def, moves, first])

  const room = useGameRoom({
    gameId: id,
    enabled: initial.status === 'uitgenodigd' || initial.status === 'bezig',
    onMessage: (message) => receive(message),
    onConnected: () => room.send({ kind: 'sync', data: { moves: movesRef.current } }),
  })
  const game = room.game ?? initial
  const my: Player = game.you === 'host' ? 0 : 1
  const self = my === 0 ? game.host : game.guest
  const opponent = my === 0 ? game.guest : game.host

  const showFlash = (text: string | null) => {
    if (!text) return
    setFlash(text)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 2400)
  }
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  /** A move (yours or theirs) on the local board. */
  const play = (move: unknown, mine: boolean) => {
    const before = def.replay(movesRef.current, first)
    if (!def.isLegal(before, move)) return false
    showFlash(def.note?.(before, move, mine, opponent.nickname) ?? null)
    commit([...movesRef.current, move])
    return true
  }

  function receive(message: PlayMessage) {
    const current = movesRef.current
    switch (message.kind) {
      case 'move': {
        const { move, n } = message.data
        if (n < current.length) return
        const s = def.replay(current, first)
        if (n > current.length || def.turn(s) === my || !play(move, false)) {
          // We missed something: compare notes
          room.send({ kind: 'sync', data: { moves: current } })
        }
        return
      }
      case 'sync': {
        const theirs = message.data.moves
        if (!Array.isArray(theirs) || same(theirs, current)) return
        const ok = valid(theirs)
        if (theirs.length > current.length && isPrefix(current, theirs) && ok) commit(theirs)
        else if (current.length > theirs.length && isPrefix(theirs, current)) room.send({ kind: 'sync', data: { moves: current } })
        // Out of step: the host's board counts
        else if (ok && my === 1) commit(theirs)
        else room.send({ kind: 'sync', data: { moves: current } })
        return
      }
      case 'emote':
        emotes.show('them', message.data.emote)
    }
  }

  const onMove = (move: unknown) => {
    if (game.status !== 'bezig' || def.over(state) || def.turn(state) !== my) return
    const n = movesRef.current.length
    if (play(move, true)) room.send({ kind: 'move', data: { move, n } })
  }

  const finished = (g: GameSummary) => {
    room.setGame(g)
    refresh(g)
    try {
      sessionStorage.removeItem(storageKey(id))
    } catch {
      // fine
    }
  }
  const finishedRef = useRef(finished)
  useLayoutEffect(() => {
    finishedRef.current = finished
  })

  // The end: both players report the moves; the server checks and keeps the result
  const over = def.over(state)
  useEffect(() => {
    if (!over || game.status !== 'bezig') return
    let stopped = false
    let retry: number | undefined
    const report = async () => {
      try {
        const res = await fetch(`/api/games/${id}/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ moves: movesRef.current }) })
        const data = await res.json().catch(() => null)
        if (stopped) return
        if (res.status === 202) retry = window.setTimeout(report, 13_000)
        else if (res.ok) finishedRef.current(data as GameSummary)
        else setError(data?.error ?? 'Het resultaat kon niet worden opgeslagen.')
      } catch {
        if (!stopped) retry = window.setTimeout(report, 5000)
      }
    }
    // Let the last move finish on screen first
    const start = window.setTimeout(report, 900)
    return () => {
      stopped = true
      window.clearTimeout(start)
      window.clearTimeout(retry)
    }
  }, [over, moves, game.status, id])

  const post = async (path: string, body: unknown) => {
    try {
      finished(await api<GameSummary>(path, { method: 'POST', body }))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const playing = game.status === 'bezig'
  const turn = def.turn(state)
  const myTurn = playing && !over && turn === my
  useYourTurnSound(myTurn)
  useResultSound(game)
  const Board = def.Board
  const info = GAMES[game.kind]

  return (
    <div className="gm-page">
      <div className="gm-players">
        <PlayerCard user={opponent} score={def.score(state, my === 0 ? 1 : 0)} scoreTitle={def.scoreTitle} active={playing && !over && turn !== my} side="left" note={playing ? (room.peerOnline ? 'is er' : 'is er niet') : null}>
          {emotes.emote?.who === 'them' && <Emote key={emotes.emote.at} name={emotes.emote.name} />}
        </PlayerCard>
        <span className="gm-vs">tegen</span>
        <PlayerCard user={self} score={def.score(state, my)} scoreTitle={def.scoreTitle} active={myTurn} side="right" note="jij">
          {emotes.emote?.who === 'me' && <Emote key={emotes.emote.at} name={emotes.emote.name} />}
        </PlayerCard>
      </div>

      <Box title={info.name} icon={info.icon as FarmIconName} actions={
          <span className="gm-box-actions">
            {playing && <TransportBadge transport={room.transport} />}
            <SoundToggle />
          </span>
        }
      >
        {game.status === 'uitgenodigd' ? (
          <Invite game={game} opponent={opponent} />
        ) : (
          <>
            <div className="gm-status">
              <span className="gm-turn" aria-live="polite">
                {flash ??
                  (game.status === 'klaar'
                    ? 'Afgelopen'
                    : !playing
                      ? 'Dit spel is gestopt'
                      : over
                        ? 'Uitgespeeld! De uitslag wordt opgeslagen…'
                        : myTurn
                          ? def.yourTurn
                          : `${opponent.nickname} is aan de beurt…`)}
              </span>
              {playing && !over && (
                <EmoteBar
                  onSend={(name) => {
                    room.send({ kind: 'emote', data: { emote: name } })
                    emotes.show('me', name)
                  }}
                />
              )}
            </div>
            <Board state={state} my={my} myTurn={myTurn} onMove={onMove} finished={!playing} />
            {playing && !room.peerOnline && !over && <OpponentGone name={opponent.nickname} goneSince={room.peerGoneSince} onClaim={() => void post(`/games/${id}/claim`, { moves: movesRef.current })} />}
            {error && <p className="form-error">{error}</p>}
            {!playing ? (
              <Result game={game} opponent={opponent} me={me} scoreLabel={def.resultLine} />
            ) : (
              !over && (
                <div className="account-actions">
                  <Button onClick={() => confirm('Opgeven? Dan wint je tegenstander.') && void post(`/games/${id}/result`, { moves: movesRef.current, resign: true })}>
                    <FarmIcon name="flag_red" /> Opgeven
                  </Button>
                  <Link to="/spellen">« Spellen</Link>
                </div>
              )
            )}
          </>
        )}
      </Box>

      <Box title={`Zo speel je ${info.name}`} icon="information">
        {def.rules}
        <p className="muted">
          Jullie spelen rechtstreeks met elkaar (peer-to-peer). Lukt dat niet, dan gaat het via Kuddes. De uitslag telt pas als jullie allebei dezelfde zetten
          doorgeven.
        </p>
      </Box>
    </div>
  )
}
