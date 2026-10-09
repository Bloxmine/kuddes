import { useEffect, useState, type CSSProperties } from 'react'
import { rankOf, suitOf, type PokerView } from '../../../shared/games/poker'
import { Button } from '../../components/ui/Button'
import { FarmIcon } from '../../components/ui/FarmIcon'
import type { CardBoardProps } from './CardGames'
import { CardSpot, PlayingCard } from './PlayingCard'
import './Poker.css'

const Card = ({ c, up = true, className }: { c: number; up?: boolean; className?: string }) => <PlayingCard rank={rankOf(c)} suit={suitOf(c)} faceUp={up} className={className} />
const nl = (n: number) => n.toLocaleString('nl-NL')

/** A little stack of chips with the amount. */
function Chips({ amount, big }: { amount: number; big?: boolean }) {
  if (amount <= 0) return null
  return (
    <span className={big ? 'pk-chips big' : 'pk-chips'}>
      <span className="pk-chip" aria-hidden="true" />
      {nl(amount)}
    </span>
  )
}

/** Where each seat sits round the table: you at the bottom, the others clockwise. */
function seatPlace(offset: number, count: number): string {
  if (offset === 0) return 'bottom'
  if (count === 2) return 'top'
  if (count === 3) return offset === 1 ? 'left' : 'right'
  return ['left', 'top', 'right'][offset - 1]
}

/**
 * Texas Hold'em at a green table: the seats with their chips, bets and cards
 * (yours face up, the others' only at the showdown), the five on the table
 * and the pot, and your buttons when it's your turn.
 */
export function PokerBoard({ view: v, my, myTurn, act, names, finished }: CardBoardProps<PokerView>) {
  // The slider belongs to one decision: a new one starts at the minimum again
  const decision = `${v.hand}-${v.street}-${v.toAct}-${v.bet.join(',')}`
  const [picked, setPicked] = useState<{ decision: string; to: number } | null>(null)
  const raiseTo = picked?.decision === decision ? picked.to : v.minRaiseTo
  const setRaiseTo = (to: number) => setPicked({ decision, to })
  const [busy, setBusy] = useState(false)
  // The result of the last hand stays up for a moment after the next one is dealt
  const lastHand = v.last?.hand ?? null
  const [hiddenHand, setHiddenHand] = useState<number | null>(null)
  useEffect(() => {
    if (lastHand === null) return
    const t = window.setTimeout(() => setHiddenHand(lastHand), 6000)
    return () => window.clearTimeout(t)
  }, [lastHand])

  const send = async (action: unknown) => {
    setBusy(true)
    try {
      await act(action)
    } finally {
      setBusy(false)
    }
  }
  const high = Math.max(0, ...v.bet)
  const canRaise = v.maxRaiseTo > high && v.maxRaiseTo > v.toCall + v.bet[my]
  const last = v.last && hiddenHand !== v.last.hand ? v.last : null
  const shownCards = (seat: number) => (v.holes?.[seat] ?? last?.shown.find((s) => s.seat === seat)?.cards ?? null)
  const potSize = v.pot
  const quick = [
    ['½ pot', Math.floor(high + potSize / 2)],
    ['Pot', high + potSize],
  ] as const

  return (
    <div className="pk">
      <div className="pk-table">
        <div className="pk-felt">
          <div className="pk-center">
            <div className="pk-board">
              {Array.from({ length: 5 }, (_, i) => (v.board[i] !== undefined ? <Card key={i} c={v.board[i]} /> : <CardSpot key={i} />))}
            </div>
            <div className="pk-pot">
              <Chips amount={potSize} big /> <span className="muted">pot</span>
            </div>
            <div className="pk-blinds muted">
              Hand {v.hand} · blinds {nl(v.smallBlind)}/{nl(v.smallBlind * 2)}
            </div>
          </div>
        </div>

        {Array.from({ length: v.count }, (_, seat) => {
          const offset = (seat - my + v.count) % v.count
          const place = seatPlace(offset, v.count)
          const cards = seat === my ? v.mine : shownCards(seat)
          const acting = !v.over && !finished && v.toAct === seat && !v.folded[seat]
          const won = last?.pots.some((p) => p.winners.includes(seat))
          const shownName = last?.shown.find((s) => s.seat === seat)?.name
          return (
            <div
              key={seat}
              className={['pk-seat', place, acting && 'acting', v.folded[seat] && !v.out[seat] && 'folded', v.out[seat] && 'out', won && 'won'].filter(Boolean).join(' ')}
              style={{ '--card-w': seat === my ? '64px' : '46px' } as CSSProperties}
            >
              <div className="pk-hole">
                {v.out[seat] ? null : cards ? cards.map((c) => <Card key={c} c={c} className={last?.shown.find((s) => s.seat === seat)?.best.includes(c) ? 'best' : undefined} />) : [0, 1].map((i) => <PlayingCard key={i} rank={1} suit={0} faceUp={false} />)}
              </div>
              <div className="pk-plate">
                <b>{names[seat]}</b>
                <span>{v.out[seat] ? 'uit het spel' : v.allIn[seat] ? 'all-in' : `${nl(v.chips[seat])} fiches`}</span>
                {v.dealer === seat && !v.out[seat] && (
                  <span className="pk-dealer" title="Deler">
                    D
                  </span>
                )}
              </div>
              {shownName && <span className="pk-handname">{shownName}</span>}
              <div className="pk-bet">
                <Chips amount={v.bet[seat]} />
              </div>
            </div>
          )
        })}
      </div>

      {last && (
        <p className="pk-result">
          <FarmIcon name="coins" />{' '}
          {last.pots
            .map((p) => `${p.winners.map((w) => names[w]).join(' en ')} ${p.winners.length > 1 ? 'delen' : p.winners[0] === my ? 'winnen' : 'wint'} ${nl(p.amount)}`)
            .join(' · ')}
          {last.uncontested ? ' (de rest paste)' : last.shown.length ? ` met ${last.shown.find((s) => last.pots[0]?.winners.includes(s.seat))?.name ?? ''}` : ''}
        </p>
      )}

      {myTurn && !busy && (
        <div className="pk-actions">
          <Button onClick={() => void send({ do: 'fold' })}>Passen</Button>
          {v.toCall > 0 ? (
            <Button variant="cta" onClick={() => void send({ do: 'call' })}>
              {v.toCall >= v.chips[my] ? `All-in (${nl(v.chips[my])})` : `Callen ${nl(v.toCall)}`}
            </Button>
          ) : (
            <Button variant="cta" onClick={() => void send({ do: 'check' })}>
              Checken
            </Button>
          )}
          {canRaise && (
            <span className="pk-raise">
              <input
                type="range"
                min={v.minRaiseTo}
                max={v.maxRaiseTo}
                step={v.smallBlind}
                value={Math.min(Math.max(raiseTo, v.minRaiseTo), v.maxRaiseTo)}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
                aria-label="Verhogen naar"
              />
              {quick.map(([label, to]) =>
                to > v.minRaiseTo && to < v.maxRaiseTo ? (
                  <button key={label} type="button" className="link-button" onClick={() => setRaiseTo(to)}>
                    {label}
                  </button>
                ) : null,
              )}
              <button type="button" className="link-button" onClick={() => setRaiseTo(v.maxRaiseTo)}>
                All-in
              </button>
              <Button onClick={() => void send({ do: 'raise', to: Math.min(Math.max(raiseTo, v.minRaiseTo), v.maxRaiseTo) })}>
                {raiseTo >= v.maxRaiseTo ? `All-in (${nl(v.maxRaiseTo)})` : high === 0 ? `Inzetten ${nl(raiseTo)}` : `Verhogen naar ${nl(raiseTo)}`}
              </Button>
            </span>
          )}
        </div>
      )}
      {!myTurn && !v.over && !finished && (
        <p className="pk-wait muted">
          <FarmIcon name="hourglass" /> {v.folded[my] ? 'Je hebt gepast; ' : ''}
          {names[v.toAct]} is aan de beurt…
        </p>
      )}

      <ol className="pk-log muted" aria-label="Wat er gebeurde">
        {v.log.slice(-5).map(([seat, what, amount], i) => (
          <li key={i}>
            <b>{names[seat]}</b> {what}
            {amount ? ` ${nl(amount)}` : ''}
          </li>
        ))}
      </ol>
    </div>
  )
}
