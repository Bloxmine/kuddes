import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from '../../../shared/api'
import type { GameSummary } from '../../../shared/games'
import { ANSWER_MS, QUIZ_ROUNDS, type QuizView } from '../../../shared/games/quiz'
import { Box } from '../../components/ui/Box'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import { Emote, EmoteBar, Invite, SoundToggle, PlayerCard, PresenceBadge, Result } from '../../features/games/GameParts'
import { useEmotes, useFinishedRefresh, useResultSound } from '../../features/games/gameHooks'
import { playCorrect, playTick, playWrong } from '../../features/games/sounds'
import { useGameRoom } from '../../features/games/useGameRoom'
import { namesList } from '../../features/games/players'
import '../../features/games/NewGames.css'
import { api, errorMessage } from '../../lib/api'

const LETTERS = ['A', 'B', 'C', 'D']

/** A clock that ticks while the quiz needs it; `offset` corrects for the server's time. */
function useClock(offset: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(t)
  }, [])
  return now + offset
}

/** Kuddes Quiz: everyone (two to four) gets the same question at the same time; the server keeps the answers. */
export function QuizGame({ initial, me }: { initial: GameSummary; me: Me }) {
  const refresh = useFinishedRefresh()
  const emotes = useEmotes()
  const [view, setViewState] = useState<QuizView | null>(null)
  const [offset, setOffset] = useState(0)
  const setView = (v: QuizView) => {
    setViewState(v)
    setOffset(v.serverNow - Date.now())
  }
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const room = useGameRoom({
    gameId: initial.id,
    enabled: initial.status === 'uitgenodigd' || initial.status === 'bezig',
    p2p: false,
    onMessage: (m) => m.kind === 'emote' && emotes.show(m.from ?? 'them', m.data.emote),
    onConnected: () => undefined,
    onState: (s) => setView(s as QuizView),
  })
  const game = room.game ?? initial
  const { data: finalView } = useQuery({
    queryKey: ['games', 'state', game.id, game.status],
    queryFn: () => api<QuizView>(`/games/${game.id}/state`),
    enabled: game.status === 'klaar',
  })
  const v = game.status === 'klaar' ? (finalView ?? view) : view
  const now = useClock(offset)
  const my = game.seat ?? 0
  // Everyone at the table, in seat order
  const table = game.players.filter((p) => p.status === 'meedoen' || p.status === 'weg')
  const others = table.filter((p) => p.seat !== my)
  const opponent = others[0]?.user ?? (game.you === 'host' ? game.guest : game.host)
  const nameOf = (seat: number) => table.find((p) => p.seat === seat)?.user.nickname ?? ''
  const many = others.length > 1
  const playing = game.status === 'bezig'
  const still = !v || !v.out[my]
  const stillIn = others.filter((p) => p.status === 'meedoen')
  const hereCount = stillIn.filter((p) => room.online.includes(p.user.id)).length
  const presence = hereCount === stillIn.length ? 'Iedereen is er' : hereCount === 0 ? 'Wachten op de anderen' : `${hereCount} van de ${stillIn.length} zijn er`
  useEffect(() => {
    if (game.status === 'klaar') refresh(game)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.status])

  /** "Anna +812" for the others who had it right. */
  const winners = (points: number[]) => others.filter((p) => (points[p.seat] ?? 0) > 0).map((p) => `${nameOf(p.seat)} +${points[p.seat]}`)

  const pick = async (choice: number) => {
    if (!v?.current || v.phase !== 'vraag' || v.current.mine !== null) return
    setSending(true)
    setError(null)
    try {
      setView(await api<QuizView>(`/games/${game.id}/quiz/answer`, { method: 'POST', body: { round: v.current.round, choice } }))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  const q = v?.current
  const left = q && v?.phase === 'vraag' ? Math.max(0, q.deadline - now) : 0
  const countdown = v?.next ? Math.max(0, Math.ceil((v.next - now) / 1000)) : 0
  useResultSound(game)
  const revealed = q?.reveal ? q.round : null
  const iScored = !!q?.reveal && q.reveal.points[my] > 0
  useEffect(() => {
    if (revealed === null) return
    if (iScored) playCorrect()
    else playWrong()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round
  }, [revealed])
  const secondsLeft = v?.phase === 'vraag' && q && q.mine === null ? Math.ceil(left / 1000) : null
  const counting = v?.phase === 'aftellen' ? countdown : null
  useEffect(() => {
    if (counting !== null && counting > 0) playTick(counting === 1)
  }, [counting])
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) playTick(secondsLeft <= 2)
  }, [secondsLeft])

  return (
    <div className="gm-page">
      <div className={many ? 'gm-players many' : 'gm-players'} style={{ '--n': Math.max(2, table.length) } as CSSProperties}>
        {(table.length ? table : [{ seat: my, user: me, status: 'meedoen' as const }]).map((p) => {
          const isMe = p.seat === my
          const out = !!v?.out[p.seat] || p.status === 'weg'
          const thinking = !!q && v?.phase === 'vraag' && !out && !q.answered[p.seat]
          const emote = emotes.emote && (isMe ? emotes.emote.who === 'me' : emotes.emote.who === p.user.id || (emotes.emote.who === 'them' && others.length === 1))
          return (
            <PlayerCard
              key={p.seat}
              user={p.user}
              score={v?.scores[p.seat] ?? 0}
              scoreTitle="Punten"
              active={thinking}
              side={isMe ? 'right' : 'left'}
              note={
                isMe ? 'jij' : out ? 'gestopt' : playing ? (q && v?.phase === 'vraag' ? (q.answered[p.seat] ? 'heeft geantwoord' : 'denkt na…') : room.online.includes(p.user.id) ? 'is er' : 'is er niet') : null
              }
            >
              {emote && <Emote key={emotes.emote!.at} name={emotes.emote!.name} />}
            </PlayerCard>
          )
        })}
      </div>

      <Box title="Kuddes Quiz" icon="brain" actions={
          <span className="gm-box-actions">
            {playing && <PresenceBadge online={room.peerOnline} text={many ? presence : undefined} />}
            <SoundToggle />
          </span>
        }
      >
        {game.status === 'uitgenodigd' ? (
          <Invite game={game} opponent={opponent} />
        ) : !v ? (
          <p className="muted">Laden…</p>
        ) : !playing ? (
          <>
            <p className="qz-final">
              {v.correct[my]} van de {QUIZ_ROUNDS} goed · {others.map((p) => `${p.user.nickname}: ${v.correct[p.seat] ?? 0}`).join(' · ')}
            </p>
            <Result game={game} opponent={opponent} me={me} scoreLabel={(a, b) => `${a.toLocaleString('nl-NL')} – ${b.toLocaleString('nl-NL')} punten`} />
          </>
        ) : v.phase === 'wachten' ? (
          <div className="gm-waiting">
            <FarmIcon name="hourglass" size={32} />
            <p>
              Wachten tot {many ? 'iedereen' : opponent.nickname} er is… De quiz begint zodra jullie er {many ? 'allemaal' : 'allebei'} zijn.
            </p>
          </div>
        ) : v.phase === 'aftellen' ? (
          <div className="qz-countdown" aria-live="polite">
            <span>{countdown || 'Go!'}</span>
            <p>De eerste vraag komt eraan!</p>
          </div>
        ) : q ? (
          <div className="qz-round">
            <div className="qz-meta">
              <span>
                Vraag {q.round + 1} van {QUIZ_ROUNDS}
              </span>
              <span className="qz-category">{q.category}</span>
            </div>
            <div className="qz-timer" aria-hidden="true">
              <span style={{ width: `${v.phase === 'vraag' ? (left / ANSWER_MS) * 100 : 0}%` }} className={left < 5000 ? 'hurry' : undefined} />
            </div>
            <h2 className="qz-question">{q.question}</h2>
            <div className="qz-answers">
              {q.answers.map((a, i) => {
                const r = q.reveal
                const classes = [
                  'qz-answer',
                  `qz-${i}`,
                  q.mine === i && 'picked',
                  r && r.correct === i && 'correct',
                  r && r.correct !== i && q.mine === i && 'wrong',
                  r && r.correct !== i && q.mine !== i && 'dim',
                ]
                return (
                  <button key={i} type="button" className={classes.filter(Boolean).join(' ')} disabled={v.phase !== 'vraag' || q.mine !== null || sending} onClick={() => void pick(i)}>
                    <b>{LETTERS[i]}</b> {a}
                    {r && (
                      <span className="qz-their-picks">
                        {others
                          .filter((p) => r.picks[p.seat] === i)
                          .map((p) => (
                            <span key={p.seat} className="qz-their-pick">
                              {p.user.nickname}
                            </span>
                          ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="qz-feedback" aria-live="polite">
              {q.reveal
                ? (q.reveal.points[my] > 0
                    ? `Goed! +${q.reveal.points[my]} punten`
                    : q.mine === null
                      ? `Te laat! Het goede antwoord was ${LETTERS[q.reveal.correct]}.`
                      : `Helaas, het was ${LETTERS[q.reveal.correct]}.`) + (winners(q.reveal.points).length ? ` · ${winners(q.reveal.points).join(', ')}` : '')
                : q.mine !== null
                  ? q.opponentAnswered
                    ? many
                      ? 'Iedereen heeft geantwoord…'
                      : 'Jullie hebben allebei geantwoord…'
                    : `Antwoord ${LETTERS[q.mine]} gekozen. Wachten op ${namesList(others.filter((p) => !v.out[p.seat] && !q.answered[p.seat]).map((p) => p.user.nickname))}…`
                  : `Nog ${Math.ceil(left / 1000)} seconden. Hoe sneller, hoe meer punten!`}
            </p>
          </div>
        ) : null}
        {playing && v && !still && <p className="muted">Je bent gestopt; de anderen spelen verder.</p>}
        {playing && v && still && (
          <div className="gm-status">
            <EmoteBar
              onSend={(name) => {
                room.send({ kind: 'emote', data: { emote: name } })
                emotes.show('me', name)
              }}
            />
            <div className="account-actions">
              <Button
                onClick={() =>
                  confirm(others.filter((p) => !v.out[p.seat]).length > 1 ? 'Opgeven? De anderen spelen zonder jou verder.' : 'Opgeven? Dan wint je tegenstander.') &&
                  void api<GameSummary>(`/games/${game.id}/resign`, { method: 'POST' })
                    .then((g) => room.setGame(g))
                    .catch((e) => setError(errorMessage(e)))
                }
              >
                <FarmIcon name="flag_red" /> Opgeven
              </Button>
              <Link to="/spellen">« Spellen</Link>
            </div>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
      </Box>

      <Box title="Zo speel je de Kuddes Quiz" icon="information">
        <ul className="gm-rules">
          <li>Tien vragen over van alles: Nederland, muziek, sport, natuur, de jaren 2000 en meer. Met z’n tweeën of met tot vier spelers: iedereen krijgt elke vraag tegelijk.</li>
          <li>Je hebt 20 seconden per vraag. Een goed antwoord is 500 punten, plus tot 500 extra als je snel bent.</li>
          <li>Na elke vraag zie je het goede antwoord en wat de anderen kozen. Wie na tien vragen de meeste punten heeft, wint. Geeft iemand op, dan spelen de anderen verder.</li>
        </ul>
      </Box>
    </div>
  )
}
